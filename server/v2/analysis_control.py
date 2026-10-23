"""Durable analysis schedule. Shanghai wall clock is independent of server timezone."""
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

SHANGHAI = timezone(timedelta(hours=8))


def shanghai_equity_window(now: datetime) -> bool:
    """Beijing 21:30 through 05:00 next day, covering the US cash session."""
    if now.tzinfo is None:
        raise ValueError("aware_datetime_required")
    local = now.astimezone(SHANGHAI)
    minute = local.hour * 60 + local.minute
    if minute >= 21 * 60 + 30:
        return local.weekday() < 5
    if minute < 5 * 60:
        return local.weekday() in (1, 2, 3, 4, 5)
    return False


class AnalysisControl(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    mode: Literal["auto", "on", "off"] = "auto"
    interval_seconds: int = Field(default=180, ge=60, le=3600)

    def allows(self, now: datetime) -> bool:
        if now.tzinfo is None:
            raise ValueError("aware_datetime_required")
        if self.mode != "auto":
            return self.mode == "on"
        return shanghai_equity_window(now)

    def public(self, now: datetime) -> dict:
        return {**self.model_dump(), "timezone": "Asia/Shanghai",
                "days": "Monday-Friday 21:30 through 05:00 next day",
                "start": "21:30", "end": "05:00",
                "frequency": "3m",
                "task": "币安美股 AI 分析并自主下单",
                "schedule_allows_analysis": self.allows(now)}


class ControlStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS analysis_control "
                       "(id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL, interval_seconds INTEGER NOT NULL)")
            db.execute("INSERT OR IGNORE INTO analysis_control VALUES (1,'auto',180)")
            db.execute("CREATE TABLE IF NOT EXISTS analysis_schedule "
                       "(id INTEGER PRIMARY KEY CHECK(id=1), last_started REAL NOT NULL)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def read(self) -> AnalysisControl:
        with closing(self.connect()) as db:
            mode, interval = db.execute("SELECT mode,interval_seconds FROM analysis_control WHERE id=1").fetchone()
            return AnalysisControl(mode=mode, interval_seconds=interval)

    def save(self, control: AnalysisControl):
        with closing(self.connect()) as db, db:
            db.execute("UPDATE analysis_control SET mode=?,interval_seconds=? WHERE id=1",
                       (control.mode, control.interval_seconds))

    def claim_due(self, now: datetime) -> bool:
        """Cross-process interval claim; failed cycles also consume their start interval."""
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            mode, interval = db.execute("SELECT mode,interval_seconds FROM analysis_control WHERE id=1").fetchone()
            control = AnalysisControl(mode=mode, interval_seconds=interval)
            if not control.allows(now):
                return False
            row = db.execute("SELECT last_started FROM analysis_schedule WHERE id=1").fetchone()
            if row and now.timestamp() - row[0] < interval:
                return False
            db.execute("INSERT OR REPLACE INTO analysis_schedule VALUES(1,?)", (now.timestamp(),))
            return True
