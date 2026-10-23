"""
Stock-G High-Performance Quant Backend (FastAPI)
Deployment Target: Tencent Cloud Tokyo Node (43.163.192.120:8000)
Provides 24/7 scanning, positions sync, and FCM remote push alerts.
"""
import asyncio
import time
import json
import logging
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, BackgroundTasks, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import HOST, PORT, SERVER_NAME, VERSION
from database import (
    init_db,
    save_positions,
    get_all_positions,
    get_recent_signals,
    register_fcm_token,
    activate_license,
    verify_license,
    get_all_licenses
)
from fcm_service import init_firebase, send_push_alert
from market_scanner import scanner
from v2.sector_api import router as sector_router
from v2.control_api import router as control_router
from v2.live_task import router as task_router, run_task
from v2.execution_config import router as execution_router
from v2.execution_observer import run_observer
from v2.paper_execution import run_paper
from v2.live_execution import run_live, run_protection, run_local_entries
from v2.comparison_shadow import run_comparison

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("StockG-Server")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup:
    logger.info("Initializing Stock-G Database...")
    init_db()
    logger.info("Initializing Firebase Admin SDK...")
    init_firebase()
    # Launch background scanner task
    scan_task = asyncio.create_task(scanner.run_loop())
    ai_task = asyncio.create_task(run_task())
    execution_observer = asyncio.create_task(run_observer())
    paper_task = asyncio.create_task(run_paper())
    live_exec = asyncio.create_task(run_live())
    local_entry_task = asyncio.create_task(run_local_entries())
    protection_task = asyncio.create_task(run_protection())
    comparison_task = asyncio.create_task(run_comparison())
    logger.info(f"Stock-G Quant Server v{VERSION} successfully started on {HOST}:{PORT}")
    yield
    # Shutdown:
    logger.info("Stopping Stock-G Scanner...")
    scanner.stop()
    local_entry_task.cancel()
    await asyncio.gather(local_entry_task, return_exceptions=True)
    comparison_task.cancel()
    await asyncio.gather(comparison_task, return_exceptions=True)
    protection_task.cancel()
    await asyncio.gather(protection_task, return_exceptions=True)
    live_exec.cancel()
    await asyncio.gather(live_exec, return_exceptions=True)
    paper_task.cancel()
    await asyncio.gather(paper_task, return_exceptions=True)
    execution_observer.cancel()
    await asyncio.gather(execution_observer, return_exceptions=True)
    ai_task.cancel()
    await asyncio.gather(ai_task, return_exceptions=True)
    scan_task.cancel()
    try:
        await scan_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="Stock-G Quant Server",
    description="24/7 US Equities & Crypto Institutional Quantitative Engine",
    version=VERSION,
    lifespan=lifespan
)
app.include_router(sector_router)
app.include_router(control_router)
app.include_router(task_router)
app.include_router(execution_router)

# Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class PositionItem(BaseModel):
    id: Optional[str] = None
    symbol: str
    name: Optional[str] = ""
    entryPrice: float
    quantity: int = 100
    currentPrice: Optional[float] = None
    targetProfitPercent: Optional[float] = 3.0
    stopLossPercent: Optional[float] = 2.0
    entryDate: Optional[str] = None
    strategyUsed: Optional[str] = "PLUNGE_DIP"
    highestPriceSinceEntry: Optional[float] = None
    isTrailingEnabled: Optional[bool] = True
    trailingActivationPercent: Optional[float] = 1.8
    trailingCallbackPercent: Optional[float] = 0.8
    isBreakevenLocked: Optional[bool] = False

class SyncPositionsPayload(BaseModel):
    positions: List[PositionItem]
    clientTimestamp: Optional[int] = None

class FcmRegisterPayload(BaseModel):
    token: str
    deviceInfo: Optional[str] = ""

class TestPushPayload(BaseModel):
    symbol: str = "NVDA"
    strategy: str = "PLUNGE_DIP"
    title: str = "【买入预警】NVDA 触底企稳反弹"
    body: str = "RSI(6)=18.4 深度超卖，满足 Larry Connors TPS 买入模型！"

class LicenseActivatePayload(BaseModel):
    code: str
    deviceId: str
    deviceInfo: Optional[str] = ""

class LicenseVerifyPayload(BaseModel):
    deviceId: str
    code: Optional[str] = None

# --- Endpoints ---

@app.get("/")
def index():
    return {
        "server": SERVER_NAME,
        "version": VERSION,
        "status": "RUNNING",
        "docs": "/docs",
        "health": "/api/v1/health"
    }

@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "timestamp": int(time.time()),
        "serverTime": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
        "uptimeCycles": scanner.scanned_cycles,
        "activeQuotes": len(scanner.quotes),
        "activeSignals": len(scanner.active_signals),
        "engine": SERVER_NAME,
        "version": VERSION
    }

@app.get("/api/v1/scan/signals")
def get_signals():
    """
    Get latest active quant signals
    """
    recent = []  # Legacy history is retained in DB but never replayed as live alerts.
    return {
        "status": "success",
        "signals": recent,
        "activeSignals": scanner.active_signals,
        "count": len(recent),
        "timestamp": int(time.time())
    }

@app.get("/api/v1/quotes")
def get_all_quotes():
    """
    Get cached real-time quotes for all monitored symbols (0ms latency, rate-limit protected)
    """
    return {
        "status": "success",
        "quotes": list(scanner.quotes.values()),
        "count": len(scanner.quotes),
        "lastUpdated": time.strftime("%H:%M:%S")
    }

@app.get("/api/v1/quotes/{symbol}")
def get_quote(symbol: str):
    sym = symbol.strip().upper()
    quote = scanner.quotes.get(sym)
    if not quote:
        return {"status": "error", "message": f"Symbol {sym} not found in universe"}
    return {"status": "success", "quote": quote}

@app.post("/api/v1/positions/sync")
def sync_positions(payload: SyncPositionsPayload):
    """
    Sync client positions to server SQLite database
    """
    positions_data = [p.dict() for p in payload.positions]
    save_positions(positions_data)
    return {
        "status": "success",
        "syncedCount": len(positions_data),
        "timestamp": int(time.time())
    }

@app.get("/api/v1/positions")
def get_positions():
    """
    Retrieve persisted user positions
    """
    positions = get_all_positions()
    return {
        "status": "success",
        "positions": positions,
        "count": len(positions)
    }

@app.post("/api/v1/fcm/register")
def register_token(payload: FcmRegisterPayload):
    """
    Register Android device FCM push token
    """
    register_fcm_token(payload.token, payload.deviceInfo or "")
    return {
        "status": "success",
        "message": "Token registered successfully"
    }

@app.post("/api/v1/fcm/test-push")
def test_push(payload: TestPushPayload):
    """
    Test trigger FCM notification to registered Android devices
    """
    sent = send_push_alert(
        symbol=payload.symbol,
        strategy=payload.strategy,
        title=payload.title,
        body=payload.body
    )
    return {
        "status": "success",
        "devicesNotified": sent
    }

@app.get("/api/v1/stream/signals")
async def stream_signals(request: Request):
    """
    Server-Sent Events (SSE) stream for real-time signal pushing
    """
    queue = asyncio.Queue(maxsize=100)
    scanner.signal_subscribers.append(queue)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                signals = await queue.get()
                yield f"data: {json.dumps(signals)}\n\n"
        finally:
            if queue in scanner.signal_subscribers:
                scanner.signal_subscribers.remove(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# --- 软件授权激活与在线验证模块 (Software License Activation Endpoints) ---

@app.post("/api/v1/license/activate")
def api_activate_license(payload: LicenseActivatePayload):
    """
    在线激活软件授权码并绑定当前设备 (一机一码)
    """
    return activate_license(payload.code, payload.deviceId, payload.deviceInfo or "")

@app.post("/api/v1/license/verify")
def api_verify_license(payload: LicenseVerifyPayload):
    """
    在线验证软件授权状态与有效期
    """
    return verify_license(payload.deviceId, payload.code)

@app.get("/api/v1/license/list")
def api_list_licenses():
    """
    查询所有已生成授权码状态 (管理端)
    """
    return {
        "ok": True,
        "count": len(get_all_licenses()),
        "licenses": get_all_licenses()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False, workers=1)
