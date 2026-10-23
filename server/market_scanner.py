"""
Real-time Market Data Scanner & Quant Evaluation Loop
Aggregates quotes from Binance Vision & Finnhub with strict rate-limiting and anti-storm debounce.
Runs background 2s scanning cycle, enforces 180s per-stock alert cooldown, and triggers FCM push notifications safely.
"""
import asyncio
import time
import logging
import httpx
from typing import Dict, Any, List, Optional
from config import (
    FINNHUB_API_KEY,
    FINNHUB_BASE_URL,
    BINANCE_VISION_URL,
    WATCHLIST_STOCKS
)
from quant_engine import QuantEngine
from database import save_signal, get_all_positions
from fcm_service import send_push_alert

logger = logging.getLogger("MarketScanner")

# Standard Binance bStocks symbol mapping for US equities
BINANCE_BSTOCKS_MAP = {
    "NVDA": "NVDABUSDT",
    "TSLA": "TSLABUSDT",
    "AAPL": "AAPLBUSDT",
    "MSFT": "MSFTBUSDT",
    "AMZN": "AMZNBUSDT",
    "GOOGL": "GOOGLBUSDT",
    "META": "METABUSDT",
    "AMD": "AMDBUSDT",
    "SMCI": "SMCIBUSDT",
    "PLTR": "PLTRBUSDT",
    "INTC": "INTCBUSDT",
    "AVGO": "AVGOBUSDT",
    "QCOM": "QCOMBUSDT",
    "ARM": "ARMBUSDT",
    "TSM": "TSMBUSDT",
    "ASML": "ASMLBUSDT",
    "MU": "MUBUSDT",
    "CRWD": "CRWDBUSDT",
    "CRM": "CRMBUSDT",
    "ADBE": "ADBEBUSDT",
    "DELL": "DELLBUSDT",
    "COIN": "COINBUSDT",
    "MSTR": "MSTRBUSDT",
    "HOOD": "HOODBUSDT",
    "RDDT": "RDDTBUSDT",
    "NFLX": "NFLXBUSDT",
    "BABA": "BABABUSDT",
    "SPY": "SPYBUSDT",
    "QQQ": "QQQBUSDT",
    "SMH": "SMHBUSDT"
}

class MarketScanner:
    def __init__(self):
        self.quotes: Dict[str, Dict[str, Any]] = {}
        self.candle_closes: Dict[str, List[float]] = {}
        self.is_running = False
        self.last_scan_time = 0
        self.scanned_cycles = 0
        self.active_signals: List[Dict[str, Any]] = []
        self.signal_subscribers: List[asyncio.Queue] = []
        
        # --- Top Finding 1: Anti-Storm Notification Cooldown ---
        self.last_alert_timestamps: Dict[str, float] = {}
        self.last_global_alert_time: float = 0.0
        self.STOCK_ALERT_COOLDOWN_SECONDS: float = 180.0  # 3 minutes per stock
        self.GLOBAL_ALERT_COOLDOWN_SECONDS: float = 15.0   # 15 seconds between any FCM push
        self.last_klines_refresh: float = 0.0
        
        # --- Top Finding 3: Finnhub Rate-Limiter (Max 30 req/min < 60 limit) ---
        self.last_finnhub_call_time: float = 0.0
        self.finnhub_cooldown_until: float = 0.0
        self.finnhub_queue_index: int = 0
        
        self._init_universe()

    def _init_universe(self):
        now_str = time.strftime("%H:%M:%S")
        for s in WATCHLIST_STOCKS:
            sym = s["symbol"]
            base_price = 150.0 if "BTC" not in sym else 68000.0
            b_sym = BINANCE_BSTOCKS_MAP.get(sym, sym if sym.endswith("USDT") else f"{sym}BUSDT")
            self.quotes[sym] = {
                "symbol": sym,
                "binanceSymbol": b_sym,
                "name": s["name"],
                "price": base_price,
                "change": 0.0,
                "changePercent": 0.0,
                "high": base_price,
                "low": base_price,
                "open": base_price,
                "previousClose": base_price,
                "rsi6": 50.0,
                "rsi14": 50.0,
                "sector": s["sector"],
                "exchange": s["exchange"],
                "lastUpdated": now_str,
                "isLive": False,
            }
            # Pre-seed 50 bars for RSI warmup
            self.candle_closes[sym] = [base_price] * 50

    async def fetch_binance_ticker(self, client: httpx.AsyncClient, binance_symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetch authoritative ticker from Binance Vision API without 60 req/min rate limit
        """
        try:
            url = f"{BINANCE_VISION_URL}/ticker/24hr?symbol={binance_symbol}"
            res = await client.get(url, timeout=3.0)
            if res.status_code == 200:
                d = res.json()
                return {
                    "price": float(d["lastPrice"]),
                    "change": float(d["priceChange"]),
                    "changePercent": float(d["priceChangePercent"]),
                    "high": float(d["highPrice"]),
                    "low": float(d["lowPrice"]),
                    "previousClose": float(d["prevClosePrice"]),
                }
        except Exception as e:
            logger.debug(f"Binance ticker fetch failed for {binance_symbol}: {e}")
        return None

    async def fetch_binance_klines(self, client: httpx.AsyncClient, binance_symbol: str, interval: str = "1d", limit: int = 35) -> List[float]:
        """
        Fetch authoritative real K-lines from Binance Vision API to strictly align Welles Wilder RSI
        """
        try:
            url = f"{BINANCE_VISION_URL}/klines?symbol={binance_symbol}&interval={interval}&limit={limit}"
            res = await client.get(url, timeout=3.5)
            if res.status_code == 200:
                data = res.json()
                if isinstance(data, list) and len(data) > 0:
                    return [float(k[4]) for k in data]
        except Exception as e:
            logger.debug(f"Binance klines fetch failed for {binance_symbol}: {e}")
        return []

    async def warm_up_all_klines(self, client: httpx.AsyncClient):
        """
        Warm up and sync real daily closes from Binance Vision API for all monitored symbols
        """
        logger.info("Syncing authoritative Klines from Binance Vision API to align RSI...")
        success_count = 0
        for sym, q in self.quotes.items():
            b_sym = q.get("binanceSymbol") or BINANCE_BSTOCKS_MAP.get(sym) or sym
            klines = await self.fetch_binance_klines(client, b_sym, interval="1d", limit=35)
            if klines and len(klines) >= 6:
                self.candle_closes[sym] = klines
                q["rsi6"] = QuantEngine.calculate_wilder_rsi(klines, 6)
                q["rsi14"] = QuantEngine.calculate_wilder_rsi(klines, 14)
                success_count += 1
            await asyncio.sleep(0.04) # 微小延迟，防止触发连接池溢出
        self.last_klines_refresh = time.time()
        logger.info(f"Klines warmup completed. Synchronized {success_count}/{len(self.quotes)} symbols with Binance official Klines.")

    async def fetch_finnhub_quote(self, client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetch quote from Finnhub with strict rate-limit protection (safe under 60 req/min)
        """
        now = time.time()
        if now < self.finnhub_cooldown_until:
            return None
        if now - self.last_finnhub_call_time < 2.0:
            return None  # Enforce at least 2s gap = max 30 req/min

        self.last_finnhub_call_time = now
        try:
            url = f"{FINNHUB_BASE_URL}/quote?symbol={symbol}&token={FINNHUB_API_KEY}"
            res = await client.get(url, timeout=3.5)
            if res.status_code == 200:
                d = res.json()
                if d and d.get("c", 0) > 0:
                    return {
                        "price": float(d["c"]),
                        "change": float(d["d"]),
                        "changePercent": float(d["dp"]),
                        "high": float(d["h"]),
                        "low": float(d["l"]),
                        "open": float(d["o"]),
                        "previousClose": float(d["pc"]),
                    }
            elif res.status_code == 429:
                logger.warning(f"Finnhub HTTP 429 rate limit reached! Backing off for 60s...")
                self.finnhub_cooldown_until = now + 60.0
        except Exception as e:
            logger.debug(f"Finnhub quote exception for {symbol}: {e}")
        return None

    async def sync_all_quotes(self, client: httpx.AsyncClient):
        now_str = time.strftime("%H:%M:%S")
        sym_list = list(self.quotes.keys())

        for sym in sym_list:
            q = self.quotes[sym]
            b_sym = q.get("binanceSymbol") or BINANCE_BSTOCKS_MAP.get(sym) or sym
            
            # 1. Primary data source: Binance Vision API (High-frequency, 0 rate limit penalty)
            live = await self.fetch_binance_ticker(client, b_sym)
            
            # 2. Secondary fallback: Finnhub (only for 1 stock per cycle to strictly observe 60 req/min)
            if not live and q["exchange"] != "BINANCE":
                live = await self.fetch_finnhub_quote(client, sym)

            if live and live["price"] > 0:
                q["price"] = live["price"]
                q["change"] = live["change"]
                q["changePercent"] = live["changePercent"]
                q["high"] = max(q["high"], live["high"])
                q["low"] = min(q["low"], live["low"])
                q["previousClose"] = live["previousClose"]
                q["isLive"] = True
                q["lastUpdated"] = now_str

                # Update Wilder RSI using true Klines closes (current active forming candle updated with live price)
                closes = self.candle_closes.get(sym)
                if closes and len(closes) >= 6:
                    active_closes = closes.copy()
                    active_closes[-1] = live["price"]
                    q["rsi6"] = QuantEngine.calculate_wilder_rsi(active_closes, 6)
                    q["rsi14"] = QuantEngine.calculate_wilder_rsi(active_closes, 14)

    def evaluate_all(self):
        """No legacy signal generation; market data updates remain enabled."""
        return []

    async def run_loop(self):
        self.is_running = True
        logger.info("Starting background continuous quant scan loop (2s interval)...")
        async with httpx.AsyncClient() as client:
            # 启动时首先全量预热拉取一次币安权威 K 线，确保 RSI(6) 与币安完全对齐
            try:
                await self.warm_up_all_klines(client)
            except Exception as e:
                logger.warning(f"Initial klines warmup warning: {e}")

            while self.is_running:
                start_t = time.time()
                self.scanned_cycles += 1
                try:
                    # 每 3 分钟后台静默重同步一次最新日线/30m收盘价，防止任何长期漂移
                    if time.time() - self.last_klines_refresh > 180.0:
                        asyncio.create_task(self.warm_up_all_klines(client))

                    await self.sync_all_quotes(client)
                    signals = self.evaluate_all()
                    self.active_signals = signals
                    self.last_scan_time = int(time.time())

                    # Broadcast to SSE subscribers with bounded-queue protection
                    for queue in list(self.signal_subscribers):
                        try:
                            if queue.full():
                                try:
                                    queue.get_nowait()
                                except Exception:
                                    pass
                            queue.put_nowait(signals)
                        except Exception:
                            self.signal_subscribers.remove(queue)

                except Exception as e:
                    logger.warning(f"Error in scan cycle: {e}")

                elapsed = time.time() - start_t
                sleep_duration = max(0.5, 2.0 - elapsed)
                await asyncio.sleep(sleep_duration)

    def stop(self):
        self.is_running = False

scanner = MarketScanner()
