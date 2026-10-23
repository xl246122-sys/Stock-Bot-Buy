"""Durable audit and conservative cost reservations, in integer micro-currency."""
import json
import sqlite3
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


class AIStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS ai_audit(
                    id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, kind TEXT NOT NULL,
                    at INTEGER NOT NULL, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS ai_budget(
                    id TEXT PRIMARY KEY, currency TEXT NOT NULL, day TEXT NOT NULL,
                    month TEXT NOT NULL, reserved INTEGER NOT NULL,
                    charged INTEGER, state TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS ai_cycles(
                    cycle_id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL);
            """)

    def claim_cycle(self, cycle_id: str, now: int):
        with self.connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute("SELECT 1 FROM ai_cycles WHERE cycle_id=?", (cycle_id,)).fetchone():
                raise ValueError("cycle_already_claimed")
            conn.execute("INSERT INTO ai_cycles VALUES (?, 'running', ?)", (cycle_id, now))

    def finish_cycle(self, cycle_id: str, state: str, now: int):
        if state not in {"completed", "interrupted"}:
            raise ValueError("invalid_cycle_state")
        with self.connection() as conn:
            conn.execute("UPDATE ai_cycles SET state=?,updated_at=? WHERE cycle_id=? AND state='running'",
                         (state, now, cycle_id))

    @contextmanager
    def connection(self):
        with closing(sqlite3.connect(self.path, timeout=10)) as conn:
            with conn:
                yield conn

    def audit(self, cycle_id: str, kind: str, at: int, payload: dict):
        encoded = json.dumps(payload, sort_keys=True, allow_nan=False)
        with self.connection() as conn:
            conn.execute("INSERT INTO ai_audit VALUES (?, ?, ?, ?, ?)",
                         (str(uuid4()), cycle_id, kind, at, encoded))

    def reserve(self, amount: int, *, daily_limit: int, monthly_limit: int,
                currency: str, now: int) -> str:
        if min(amount, daily_limit, monthly_limit) <= 0 or currency not in {"CNY", "USD"}:
            raise ValueError("budget_not_configured")
        date = datetime.fromtimestamp(now / 1000, timezone.utc)
        day, month = date.strftime("%Y-%m-%d"), date.strftime("%Y-%m")
        identifier = str(uuid4())
        with self.connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            currencies = {row[0] for row in conn.execute("SELECT DISTINCT currency FROM ai_budget")}
            if currencies and currencies != {currency}:
                raise ValueError("budget_currency_change_requires_reconciliation")
            for column, window, limit in (("day", day, daily_limit), ("month", month, monthly_limit)):
                # Unreconciled requests from prior periods remain conservatively reserved.
                spent = conn.execute(f"""SELECT COALESCE(SUM(COALESCE(charged,reserved)),0)
                    FROM ai_budget WHERE currency=? AND ({column}=? OR state='reserved')""",
                                     (currency, window)).fetchone()[0]
                if spent + amount > limit:
                    raise ValueError("budget_exhausted")
            conn.execute("INSERT INTO ai_budget VALUES (?, ?, ?, ?, ?, NULL, 'reserved')",
                         (identifier, currency, day, month, amount))
        return identifier

    def settle(self, identifier: str, charged: int):
        if charged < 0:
            raise ValueError("negative_charge")
        with self.connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT state, charged FROM ai_budget WHERE id=?", (identifier,)).fetchone()
            if row is None:
                raise ValueError("reservation_missing")
            if row[0] == "settled" and row[1] != charged:
                raise ValueError("settlement_conflict")
            conn.execute("UPDATE ai_budget SET charged=?,state='settled' WHERE id=?",
                         (charged, identifier))
