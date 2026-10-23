"""Single-device activation for personal use; no account registration."""
import hashlib
import hmac
import os
import sqlite3
import time
from datetime import timedelta
from contextlib import closing
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v2/device", tags=["personal device"])
DB = Path(__file__).resolve().parents[2] / ".local/v2/device.db"


class Activation(BaseModel):
    code: str = Field(min_length=16, max_length=128)
    token: str = Field(min_length=40, max_length=4096)


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=10)
    db.execute("CREATE TABLE IF NOT EXISTS device(id INTEGER PRIMARY KEY, token TEXT, tested_at REAL)")
    return db


@router.post("/activate")
def activate(value: Activation):
    expected = os.environ.get("STOCKG_ACTIVATION_HASH", "")
    actual = hashlib.sha256(value.code.encode()).hexdigest()
    if not expected or not hmac.compare_digest(expected, actual):
        raise HTTPException(401, "Invalid activation code")
    with closing(connect()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT token FROM device WHERE id=1").fetchone()
        if row and row[0] != value.token:
            raise HTTPException(409, "A different device is already bound")
        db.execute("INSERT OR IGNORE INTO device VALUES(1,?,0)", (value.token,))
    return {"activated": True, "buy_push_enabled": False}


@router.post("/test")
def test_delivery(value: Activation):
    activate(value)
    now = time.time()
    with closing(connect()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        previous = db.execute("SELECT tested_at FROM device WHERE id=1").fetchone()[0]
        if now - previous < 60:
            raise HTTPException(429, "Wait one minute before retrying")
        db.execute("UPDATE device SET tested_at=? WHERE id=1", (now,))
    # Initialize using the existing server configuration; never broadcast this test.
    from fcm_service import init_firebase
    if not init_firebase():
        raise HTTPException(503, "Push service unavailable")
    from firebase_admin import messaging
    try:
        message_id = messaging.send(messaging.Message(
            token=value.token,
            data={"symbol": "TEST", "strategy": "TEST",
                  "body": "Stock-G 真机通知测试：这不是买入信号，不代表 AI 投资建议。"},
            android=messaging.AndroidConfig(priority="high", ttl=timedelta(seconds=60)),
        ))
    except Exception:
        raise HTTPException(502, "Push provider rejected the test") from None
    return {"provider_accepted": True, "device_receipt_verified": False,
            "message_id": message_id}
