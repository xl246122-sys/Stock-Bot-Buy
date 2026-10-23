"""Append-only audit storage, separate from the existing positions database."""
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from dataclasses import asdict

from .market_data import Bar


class SnapshotStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(path)) as conn, conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("""CREATE TABLE IF NOT EXISTS feature_snapshots (
                snapshot_id TEXT PRIMARY KEY, symbol TEXT NOT NULL,
                as_of INTEGER NOT NULL, payload TEXT NOT NULL)""")
            conn.execute("""CREATE TABLE IF NOT EXISTS bar_versions (
                symbol TEXT NOT NULL, open_time INTEGER NOT NULL,
                revision TEXT NOT NULL, received_at INTEGER NOT NULL, payload TEXT NOT NULL,
                PRIMARY KEY (symbol, open_time, revision))""")
            conn.execute("CREATE INDEX IF NOT EXISTS bar_lookup ON bar_versions(symbol, open_time, received_at)")
            conn.execute("""CREATE TABLE IF NOT EXISTS history_fetch_state (
                symbol TEXT PRIMARY KEY, requested_start INTEGER NOT NULL, checked_at INTEGER NOT NULL)""")

    def history_coverage(self, symbol: str) -> tuple | None:
        with closing(sqlite3.connect(self.path, timeout=10)) as conn:
            return conn.execute(
                "SELECT requested_start, checked_at FROM history_fetch_state WHERE symbol=?",
                (symbol,)).fetchone()

    def record_history_coverage(self, symbol: str, start: int, checked_at: int):
        with closing(sqlite3.connect(self.path, timeout=10)) as conn, conn:
            conn.execute("INSERT OR REPLACE INTO history_fetch_state VALUES (?, ?, ?)",
                         (symbol, start, checked_at))

    def latest_bars(self, symbol: str, *, as_of: int, count: int = 32000) -> list[Bar]:
        with closing(sqlite3.connect(self.path, timeout=10)) as conn:
            rows = conn.execute("""
                SELECT payload FROM (
                    SELECT payload, open_time,
                        ROW_NUMBER() OVER (
                            PARTITION BY open_time ORDER BY received_at DESC, rowid DESC
                        ) AS rank
                    FROM bar_versions WHERE symbol=? AND received_at<=?
                ) WHERE rank=1 ORDER BY open_time DESC LIMIT ?
            """, (symbol, as_of, count)).fetchall()
        return [Bar(**json.loads(row[0])) for row in reversed(rows)]

    def save_bars(self, bars: list[Bar]) -> None:
        with closing(sqlite3.connect(self.path, timeout=10)) as conn, conn:
            conn.executemany("INSERT OR IGNORE INTO bar_versions VALUES (?, ?, ?, ?, ?)", [
                (b.symbol, b.open_time, b.revision, b.received_at,
                 json.dumps(asdict(b), sort_keys=True, allow_nan=False)) for b in bars
            ])

    def save(self, snapshot: dict) -> bool:
        payload = json.dumps(snapshot, sort_keys=True, allow_nan=False)
        with closing(sqlite3.connect(self.path, timeout=10)) as conn, conn:
            row = conn.execute("SELECT payload FROM feature_snapshots WHERE snapshot_id=?",
                               (snapshot["snapshot_id"],)).fetchone()
            if row:
                if row[0] != payload:
                    raise ValueError("immutable_snapshot_conflict")
                return False
            conn.execute("INSERT INTO feature_snapshots VALUES (?, ?, ?, ?)",
                         (snapshot["snapshot_id"], snapshot["symbol"], snapshot["as_of"], payload))
            return True

    def get(self, snapshot_id: str) -> dict | None:
        with closing(sqlite3.connect(self.path)) as conn:
            row = conn.execute("SELECT payload FROM feature_snapshots WHERE snapshot_id=?",
                               (snapshot_id,)).fetchone()
            return json.loads(row[0]) if row else None
