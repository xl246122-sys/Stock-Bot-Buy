"""Rate-paced, restartable US ETF observation collector. Never enables BUY."""
import json
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import httpx

from .sector_universe import SECTORS
from .us_etf import etf_card, observation_status


class ETFCache:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS cache(symbol TEXT PRIMARY KEY, payload TEXT,
                    received_at INTEGER, full_date TEXT);
                CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, symbol TEXT,
                    received_at INTEGER, card TEXT);
                CREATE TABLE IF NOT EXISTS coordination(id INTEGER PRIMARY KEY,
                    owner TEXT, lease_until REAL, next_request REAL);
                INSERT OR IGNORE INTO coordination VALUES(1, '', 0, 0);
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def acquire(self, owner, now):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT owner,lease_until FROM coordination WHERE id=1").fetchone()
            if row[0] != owner and row[1] > now:
                raise ValueError("etf_collector_already_running")
            db.execute("UPDATE coordination SET owner=?,lease_until=? WHERE id=1", (owner, now+180))

    def reserve_request(self, owner, now):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT owner,lease_until,next_request FROM coordination WHERE id=1").fetchone()
            if row[0] != owner or row[1] <= now:
                raise ValueError("collector_lease_lost")
            slot = max(now, row[2])
            db.execute("UPDATE coordination SET next_request=?,lease_until=? WHERE id=1",
                       (slot+13.1, slot+180))
            return slot-now

    def release(self, owner):
        with self.connection() as db:
            db.execute("UPDATE coordination SET owner='',lease_until=0 WHERE id=1 AND owner=?", (owner,))

    def defer_requests(self, owner, until):
        with self.connection() as db:
            db.execute("UPDATE coordination SET next_request=MAX(next_request,?) WHERE id=1 AND owner=?",
                       (until, owner))

    def load(self, symbol):
        with self.connection() as db:
            row = db.execute("SELECT payload,received_at,full_date FROM cache WHERE symbol=?", (symbol,)).fetchone()
        return (json.loads(row[0]), row[1], row[2]) if row else None

    def save(self, symbol, payload, card, now, full_date):
        with self.connection() as db:
            db.execute("INSERT OR REPLACE INTO cache VALUES(?,?,?,?)",
                       (symbol, json.dumps(payload, allow_nan=False), now, full_date))
            db.execute("INSERT OR IGNORE INTO snapshots VALUES(?,?,?,?)",
                       (card["snapshot_id"], symbol, now, json.dumps(card, allow_nan=False)))


def merge_payload(symbol, previous, fresh, *, from_ms, now):
    if fresh.get("ticker") != symbol or fresh.get("adjusted") is not True:
        raise ValueError("response_identity_or_adjustment_mismatch")
    if not fresh.get("results"):
        raise ValueError("empty_market_response")
    etf_card(symbol, fresh, now=now)  # Validate all returned OHLCV before persistence.
    old_rows = {r["t"]: r for r in (previous or {}).get("results", [])}
    for row in fresh["results"]:
        if row["t"] < from_ms:
            raise ValueError("response_outside_requested_window")
        old = old_rows.get(row["t"])
        if previous and old and any(old[k] != row[k] for k in ("o", "h", "l", "c")):
            raise ValueError("full_refresh_required")
    # Response is authoritative inside its requested range; absent rows are not retained.
    cutoff = now - 23*86400000
    rows = [r for r in old_rows.values() if cutoff <= r["t"] < from_ms]
    rows.extend(r for r in fresh["results"] if r["t"]+60000 <= now)
    return {"ticker": symbol, "adjusted": True, "results": sorted(rows, key=lambda r:r["t"])}


class ETFRefresher:
    def __init__(self, client: httpx.Client, cache: ETFCache, destination: Path):
        self.client, self.cache, self.destination = client, cache, destination
        self.owner = str(uuid4())

    def fetch(self, etf, start, end):
        self.cache.acquire(self.owner, time.time())
        wait = self.cache.reserve_request(self.owner, time.time())
        if wait > 60:
            raise ValueError("cooldown_active")
        time.sleep(wait)
        response = self.client.get(
            f"https://api.massive.com/v2/aggs/ticker/{etf}/range/1/minute/{start}/{end}",
            params={"adjusted": "true", "sort": "asc", "limit": 50000}, follow_redirects=False)
        if response.status_code != 200:
            if response.status_code == 429:
                retry = response.headers.get("Retry-After", "")
                seconds = int(retry) if retry.isdigit() else 60
                self.cache.defer_requests(self.owner, time.time()+max(60, seconds))
            raise ValueError("rate_limited" if response.status_code == 429 else
                             "provider_http_" + str(response.status_code))
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("invalid_response_envelope")
        if data.get("next_url"):
            raise ValueError("unexpected_pagination")
        return data

    def run(self):
        self.cache.acquire(self.owner, time.time())
        started = int(time.time()*1000)
        cards, failures = {}, {}
        limited = False
        try:
            for _, _, etf in SECTORS:
                cached = self.cache.load(etf)
                now = int(time.time()*1000)
                day = datetime.fromtimestamp(now/1000, timezone.utc).date()
                full = not cached or cached[2] != day.isoformat()
                start = day-timedelta(days=21 if full else 2)
                # Use UTC millisecond bounds to avoid ambiguous exchange-date endpoints.
                from_ms = int(datetime.combine(start, datetime.min.time(), timezone.utc).timestamp()*1000)
                try:
                    if limited:
                        raise ValueError("skipped_after_rate_limit")
                    fresh = self.fetch(etf, from_ms, int(time.time()*1000))
                    now = int(time.time()*1000)
                    try:
                        merged = merge_payload(etf, None if full else cached[0], fresh,
                                               from_ms=from_ms, now=now)
                    except ValueError as exc:
                        if str(exc) != "full_refresh_required":
                            raise
                        # Corrections or splits must not combine incompatible adjusted history.
                        full = True
                        from_ms = int((datetime.now(timezone.utc)-timedelta(days=21)).timestamp()*1000)
                        fresh = self.fetch(etf, from_ms, int(time.time()*1000))
                        now = int(time.time()*1000)
                        merged = merge_payload(etf, None, fresh, from_ms=from_ms, now=now)
                    card = etf_card(etf, merged, now=now)
                    card.update(last_successful_fetch_at=now, collection_status="ok")
                    self.cache.save(etf, merged, card, now, day.isoformat() if full else cached[2])
                except (ValueError, KeyError, TypeError, httpx.HTTPError) as exc:
                    reason = str(exc) if type(exc) is ValueError else type(exc).__name__
                    failures[etf] = reason
                    limited = limited or reason in {"rate_limited", "cooldown_active"}
                    if cached:
                        card = etf_card(etf, cached[0], now=now)
                        card.update(last_successful_fetch_at=cached[1], collection_status="failed")
                    else:
                        card = etf_card(etf, {"ticker": etf, "adjusted": True, "results": []}, now=now)
                        card.update(collection_status="failed")
                    card["collection_error"] = reason
                cards[etf] = observation_status(card, now=int(time.time()*1000))
                # Publish every completed ETF without replacing the independent watchlist.
                self.publish(cards, failures, started, completed=False)
            return self.publish(cards, failures, started, completed=True)
        finally:
            self.cache.release(self.owner)

    def publish(self, cards, failures, started, *, completed):
        now = int(time.time()*1000)
        all_cards = []
        for _, _, etf in SECTORS:
            card = cards.get(etf)
            if card is None:
                cached = self.cache.load(etf)
                card = etf_card(etf, cached[0] if cached else
                                {"ticker": etf, "adjusted": True, "results": []}, now=now)
                card.update(collection_status="pending",
                            last_successful_fetch_at=cached[1] if cached else None)
            all_cards.append(observation_status(card, now=now))
        report = {"started_at": started, "as_of": now, "completed": completed,
                  "us_etf_trends": all_cards, "failures": failures,
                  "completed_count": len(cards), "buy_enabled": False,
                  "cadence": "13.1_seconds_between_requests_at_least_120_seconds_per_cycle"}
        temp = self.destination.with_name(self.destination.name + "." + self.owner + ".tmp")
        temp.write_text(json.dumps(report, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        temp.replace(self.destination)
        return report
