"""US ETF research trends, kept separate from Binance prices and execution gates."""
import hashlib
import json
import math
from datetime import datetime
from zoneinfo import ZoneInfo

from .market_data import ema
from .sector_universe import SECTORS

NY = ZoneInfo("America/New_York")


def observation_status(card: dict, *, now: int) -> dict:
    """Recompute age at read time; a successful fetch never refreshes old bar time."""
    result = dict(card)
    close = result.get("latest_bar_close_time")
    fetched = result.get("last_successful_fetch_at")
    local = datetime.fromtimestamp(now/1000, NY)
    regular_window = local.weekday() < 5 and 570 <= local.hour*60+local.minute < 960
    age = (now-close)/1000 if isinstance(close, (int, float)) else None
    result["bar_age_seconds"] = age
    if age is None:
        state = "no_completed_regular_bar"
    elif age < 0:
        state = "future_bar_rejected"
        result["last_observed_trend"] = "UNKNOWN"
    elif result.get("collection_status") == "failed":
        state = "fetch_failed_using_history"
    elif not fetched or not 0 <= now-fetched <= 180000:
        state = "collector_not_fresh"
    elif not regular_window:
        state = "outside_regular_hours_history"
    elif age <= 90:
        state = "recent_bar_observed"
    else:
        state = "regular_window_bar_not_fresh"
    result.update(observation_state=state, buy_enabled=False, trend="UNKNOWN",
                  realtime_entitlement="not_verified")
    return result


def etf_card(etf: str, payload: dict, *, now: int) -> dict:
    sector_id, name, _ = next(s for s in SECTORS if s[2] == etf)
    card = {"sector_id": sector_id, "etf": etf, "name": name,
            "feed": "massive_us_equity", "currency": "USD",
            "instrument_type": "us_listed_etf", "as_of": now,
            "trend": "UNKNOWN", "last_observed_trend": "UNKNOWN",
            "periods": {}, "buy_enabled": False,
            "session": "America/New_York 09:30-16:00 regular-session observations",
            "adjusted": payload.get("adjusted"), "realtime_entitlement": "not_verified"}
    if payload.get("ticker") != etf or payload.get("adjusted") is not True:
        card["reason"] = "identity_or_adjustment_mismatch"
        return card
    bars, seen = [], set()
    for row in payload.get("results", []):
        t = row["t"]
        if t in seen or t % 60000:
            raise ValueError("duplicate_or_unaligned_bar")
        seen.add(t)
        values = [row[k] for k in ("o", "h", "l", "c", "v")]
        if (any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values)
                or min(values[:4]) <= 0 or row["v"] < 0
                or row["l"] > min(row["o"], row["c"]) or row["h"] < max(row["o"], row["c"])):
            raise ValueError("invalid_ohlcv")
        local = datetime.fromtimestamp(t / 1000, NY)
        minute = local.hour * 60 + local.minute
        if local.weekday() < 5 and 570 <= minute < 960 and t + 60000 <= now:
            bars.append(row)
    bars.sort(key=lambda r: r["t"])
    card["regular_minute_count"] = len(bars)
    card["latest_bar_close_time"] = bars[-1]["t"] + 59999 if bars else None
    card["snapshot_id"] = hashlib.sha256(json.dumps(
        {"symbol": etf, "feed": card["feed"], "bars": bars}, sort_keys=True).encode()).hexdigest()
    for minutes in (1, 5, 15):
        buckets = {}
        for row in bars:
            start = row["t"] // (minutes * 60000) * minutes * 60000
            buckets.setdefault(start, []).append(row)
        complete = [g for t, g in sorted(buckets.items())
                    if [r["t"] for r in g] == [t + i * 60000 for i in range(minutes)]]
        label = str(minutes) + "m"
        info = {"direction": "UNKNOWN", "count": len(complete),
                "incomplete_buckets": len(buckets) - len(complete)}
        if len(complete) >= 200:
            closes = [g[-1]["c"] for g in complete]
            fast, slow = ema(closes, 9), ema(closes, 20)
            slope, close = slow[-1] - slow[-2], closes[-1]
            info.update(direction=("UP" if close > fast[-1] > slow[-1] and slope > 0 else
                                   "DOWN" if close < fast[-1] < slow[-1] and slope < 0 else "MIXED"),
                        close=close, ema9=fast[-1], ema20=slow[-1],
                        bar_close_time=complete[-1][-1]["t"] + 59999)
        card["periods"][label] = info
    directions = [p["direction"] for p in card["periods"].values()]
    if "UNKNOWN" not in directions:
        card["last_observed_trend"] = directions[0] if len(set(directions)) == 1 else "MIXED"
    # Historical access does not establish live-feed entitlement. Keep it out of BUY.
    card["reason"] = "historical_observation_not_live_execution_feed"
    return card
