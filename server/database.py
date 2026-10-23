"""
Stock-G SQLite Database Layer
Stores user positions, FCM device tokens, trade logs, and triggered signals
"""
import sqlite3
import json
import time
from typing import List, Dict, Any, Optional
from config import DB_PATH

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Positions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS positions (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            name TEXT,
            entry_price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            current_price REAL,
            target_profit_percent REAL DEFAULT 3.0,
            stop_loss_percent REAL DEFAULT 2.0,
            entry_date TEXT,
            strategy_used TEXT,
            highest_price REAL,
            is_trailing_enabled INTEGER DEFAULT 1,
            trailing_activation REAL DEFAULT 1.8,
            trailing_callback REAL DEFAULT 0.8,
            is_breakeven_locked INTEGER DEFAULT 0,
            updated_at INTEGER
        )
    """)

    # 2. Signals table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS signals (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            name TEXT,
            strategy TEXT NOT NULL,
            stage TEXT NOT NULL,
            price REAL NOT NULL,
            change_percent REAL,
            rsi6 REAL,
            rsi14 REAL,
            target_profit REAL,
            stop_loss REAL,
            risk_reward_ratio TEXT,
            win_rate REAL,
            natural_analysis TEXT,
            is_read INTEGER DEFAULT 0,
            created_at INTEGER
        )
    """)

    # 3. FCM Device tokens table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fcm_tokens (
            token TEXT PRIMARY KEY,
            device_info TEXT,
            updated_at INTEGER
        )
    """)

    # 4. Software License & Activation table (软件授权与在线激活表)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS licenses (
            code TEXT PRIMARY KEY,
            device_id TEXT,
            device_info TEXT,
            duration_days INTEGER DEFAULT 10,
            status TEXT DEFAULT 'UNUSED',
            activated_at INTEGER,
            expires_at INTEGER,
            created_at INTEGER,
            note TEXT
        )
    """)

    # Private binding is provisioned by the operator, never seeded from source.
    cursor.execute("CREATE TABLE IF NOT EXISTS personal_binding (id INTEGER PRIMARY KEY CHECK(id=1), device_id TEXT NOT NULL, code_hash TEXT NOT NULL, activated_at INTEGER)")
    conn.commit()
    conn.close()

def save_positions(positions: List[Dict[str, Any]]):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM positions")
    now = int(time.time())
    for p in positions:
        cursor.execute("""
            INSERT OR REPLACE INTO positions (
                id, symbol, name, entry_price, quantity, current_price,
                target_profit_percent, stop_loss_percent, entry_date, strategy_used,
                highest_price, is_trailing_enabled, trailing_activation,
                trailing_callback, is_breakeven_locked, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            p.get("id", f"pos-{p.get('symbol')}-{now}"),
            p.get("symbol", "").upper(),
            p.get("name", ""),
            float(p.get("entryPrice", 0.0)),
            int(p.get("quantity", 100)),
            float(p.get("currentPrice", p.get("entryPrice", 0.0))),
            float(p.get("targetProfitPercent", 3.0)),
            float(p.get("stopLossPercent", 2.0)),
            p.get("entryDate", time.strftime("%Y-%m-%d")),
            p.get("strategyUsed", "PLUNGE_DIP"),
            float(p.get("highestPriceSinceEntry", p.get("currentPrice", p.get("entryPrice", 0.0)))),
            1 if p.get("isTrailingEnabled", True) else 0,
            float(p.get("trailingActivationPercent", 1.8)),
            float(p.get("trailingCallbackPercent", 0.8)),
            1 if p.get("isBreakevenLocked", False) else 0,
            now
        ))
    conn.commit()
    conn.close()

def get_all_positions() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM positions ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    positions = []
    for r in rows:
        positions.append({
            "id": r["id"],
            "symbol": r["symbol"],
            "name": r["name"],
            "entryPrice": r["entry_price"],
            "quantity": r["quantity"],
            "currentPrice": r["current_price"],
            "targetProfitPercent": r["target_profit_percent"],
            "stopLossPercent": r["stop_loss_percent"],
            "entryDate": r["entry_date"],
            "strategyUsed": r["strategy_used"],
            "highestPriceSinceEntry": r["highest_price"],
            "isTrailingEnabled": bool(r["is_trailing_enabled"]),
            "trailingActivationPercent": r["trailing_activation"],
            "trailingCallbackPercent": r["trailing_callback"],
            "isBreakevenLocked": bool(r["is_breakeven_locked"]),
        })
    conn.close()
    return positions

def save_signal(sig: Dict[str, Any]):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO signals (
            id, symbol, name, strategy, stage, price, change_percent,
            rsi6, rsi14, target_profit, stop_loss, risk_reward_ratio,
            win_rate, natural_analysis, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        sig.get("id"),
        sig.get("symbol"),
        sig.get("name"),
        sig.get("strategy"),
        sig.get("stage", "BUY_CONFIRMED"),
        sig.get("price"),
        sig.get("changePercent"),
        sig.get("rsi6"),
        sig.get("rsi14"),
        sig.get("targetProfit"),
        sig.get("stopLoss"),
        sig.get("riskRewardRatio"),
        sig.get("winRate"),
        sig.get("naturalAnalysis", ""),
        1 if sig.get("isRead", False) else 0,
        int(time.time())
    ))
    conn.commit()
    conn.close()

def get_recent_signals(limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM signals ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    signals = []
    for r in rows:
        signals.append({
            "id": r["id"],
            "symbol": r["symbol"],
            "name": r["name"],
            "strategy": r["strategy"],
            "stage": r["stage"],
            "price": r["price"],
            "changePercent": r["change_percent"],
            "rsi6": r["rsi6"],
            "rsi14": r["rsi14"],
            "targetProfit": r["target_profit"],
            "stopLoss": r["stop_loss"],
            "riskRewardRatio": r["risk_reward_ratio"],
            "winRate": r["win_rate"],
            "naturalAnalysis": r["natural_analysis"],
            "isRead": bool(r["is_read"]),
            "timestamp": time.strftime("%H:%M:%S", time.localtime(r["created_at"]))
        })
    conn.close()
    return signals

def register_fcm_token(token: str, device_info: str = ""):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO fcm_tokens (token, device_info, updated_at)
        VALUES (?, ?, ?)
    """, (token, device_info, int(time.time())))
    conn.commit()
    conn.close()

def get_all_fcm_tokens() -> List[str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT token FROM fcm_tokens")
    rows = cursor.fetchall()
    tokens = [r["token"] for r in rows]
    conn.close()
    return tokens

def verify_license(device_id: str, code: Optional[str] = None) -> Dict[str, Any]:
    """Require both the pre-bound device and private secret; never reveal the secret."""
    import hashlib, hmac
    denied = {"ok": True, "isActivated": False, "status": "UNACTIVATED", "message": "设备未绑定或绑定码无效"}
    if not device_id or not code:
        return denied
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM personal_binding WHERE id=1").fetchone()
    finally:
        conn.close()
    digest = hashlib.sha256(code.strip().upper().encode()).hexdigest()
    if not row or device_id.strip().upper() != row['device_id'] or not hmac.compare_digest(digest, row['code_hash']):
        return denied
    return {"ok": True, "isActivated": True, "status": "ACTIVE", "deviceId": row['device_id'],
            "activatedAt": row['activated_at'], "expiresAt": None, "remainingDays": 0,
            "remainingHours": 0, "message": "个人设备已绑定", "personal": True}


def activate_license(code: str, device_id: str, device_info: str = "") -> Dict[str, Any]:
    result = verify_license(device_id, code)
    if not result['isActivated']:
        return {**result, "ok": False}
    conn = get_connection()
    try:
        with conn:
            conn.execute("UPDATE personal_binding SET activated_at=COALESCE(activated_at,?) WHERE id=1", (int(time.time()),))
    finally:
        conn.close()
    return verify_license(device_id, code)


def get_all_licenses() -> List[Dict[str, Any]]:
    # No public credential enumeration, including from older clients.
    return []
