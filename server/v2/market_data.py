"""Immutable Binance spot bars; timestamps are UTC milliseconds.

Only explicitly mapped instruments are accepted. A bStock is never renamed to
the underlying US stock inside pricing or signal contracts.
"""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from typing import Iterable


FEED = "binance_spot_bstocks"
FEATURE_VERSION = "bstocks-technical-v1"
MINUTE = 60_000


@dataclass(frozen=True)
class Bar:
    symbol: str
    open_time: int
    close_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float
    received_at: int
    interval_minutes: int = 1
    feed: str = FEED
    currency: str = "USDT"

    def __post_init__(self):
        values = (self.open, self.high, self.low, self.close,
                  self.volume, self.quote_volume)
        if not all(math.isfinite(v) for v in values):
            raise ValueError("non_finite_bar")
        if min(self.open, self.high, self.low, self.close) <= 0:
            raise ValueError("non_positive_price")
        if self.low > min(self.open, self.close) or self.high < max(self.open, self.close):
            raise ValueError("invalid_ohlc_range")
        if self.volume < 0 or self.quote_volume < 0:
            raise ValueError("negative_volume")
        if (self.volume == 0) != (self.quote_volume == 0):
            raise ValueError("inconsistent_volume")
        if self.interval_minutes not in (1, 5, 15):
            raise ValueError("unsupported_interval")
        if self.open_time % (MINUTE * self.interval_minutes) != 0:
            raise ValueError("unaligned_bar")
        if self.close_time != self.open_time + MINUTE * self.interval_minutes - 1:
            raise ValueError("invalid_bar_duration")
        if self.received_at <= self.close_time:
            raise ValueError("unfinished_bar")
        if self.feed != FEED or self.currency != "USDT":
            raise ValueError("mixed_feed_or_currency")

    @property
    def revision(self) -> str:
        payload = asdict(self)
        payload.pop("received_at")
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def from_kline(symbol: str, row: list, received_at: int) -> Bar:
    return Bar(symbol=symbol, open_time=int(row[0]), close_time=int(row[6]),
               open=float(row[1]), high=float(row[2]), low=float(row[3]),
               close=float(row[4]), volume=float(row[5]), quote_volume=float(row[7]),
               received_at=received_at)


def validate_series(bars: Iterable[Bar]) -> list[Bar]:
    result = list(bars)
    if not result:
        return result
    first = result[0]
    previous = None
    for bar in result:
        if (bar.symbol, bar.feed, bar.currency, bar.interval_minutes) != (
                first.symbol, first.feed, first.currency, first.interval_minutes):
            raise ValueError("mixed_series")
        if previous is not None and bar.open_time <= previous:
            raise ValueError("duplicate_or_reversed_time")
        previous = bar.open_time
    return result


def aggregate(bars: Iterable[Bar], minutes: int) -> list[Bar]:
    source = validate_series(bars)
    if minutes not in (5, 15) or any(b.interval_minutes != 1 for b in source):
        raise ValueError("aggregation_requires_1m_to_5m_or_15m")
    buckets: dict[int, list[Bar]] = {}
    for bar in source:
        start = bar.open_time // (minutes * MINUTE) * minutes * MINUTE
        buckets.setdefault(start, []).append(bar)
    result = []
    for start, group in sorted(buckets.items()):
        # Do not fill gaps or output a partially completed interval.
        if [b.open_time for b in group] != [start + i * MINUTE for i in range(minutes)]:
            continue
        result.append(Bar(
            symbol=group[0].symbol, open_time=start, close_time=group[-1].close_time,
            open=group[0].open, high=max(b.high for b in group),
            low=min(b.low for b in group), close=group[-1].close,
            volume=sum(b.volume for b in group),
            quote_volume=sum(b.quote_volume for b in group),
            received_at=max(b.received_at for b in group), interval_minutes=minutes,
        ))
    return result


def ema(values: list[float], period: int) -> list[float]:
    if period < 1 or len(values) < period:
        return []
    result = [sum(values[:period]) / period]
    alpha = 2 / (period + 1)
    for value in values[period:]:
        result.append(alpha * value + (1 - alpha) * result[-1])
    return result


def rsi(values: list[float], period: int) -> float | None:
    if len(values) <= period:
        return None
    changes = [b - a for a, b in zip(values, values[1:])]
    gain = sum(max(d, 0) for d in changes[:period]) / period
    loss = sum(max(-d, 0) for d in changes[:period]) / period
    for change in changes[period:]:
        gain = (gain * (period - 1) + max(change, 0)) / period
        loss = (loss * (period - 1) + max(-change, 0)) / period
    if gain == loss == 0:
        return 50.0
    return 100.0 if loss == 0 else 100 - 100 / (1 + gain / loss)


def features(bars: Iterable[Bar]) -> dict:
    source = validate_series(bars)
    if len(source) < 200:
        return {"status": "unknown", "reason": "warmup_requires_200_complete_bars",
                "count": len(source), "algorithm_version": FEATURE_VERSION}
    if any(b.open_time - a.open_time != a.interval_minutes * MINUTE
           for a, b in zip(source, source[1:])):
        return {"status": "unknown", "reason": "missing_bars",
                "count": len(source), "algorithm_version": FEATURE_VERSION}
    closes = [b.close for b in source]
    fast, slow = ema(closes, 12), ema(closes, 26)
    macd = [a - b for a, b in zip(fast[14:], slow)]
    signal = ema(macd, 9)[-1]
    ranges = [max(b.high - b.low, abs(b.high - a.close), abs(b.low - a.close))
              for a, b in zip(source, source[1:])]
    atr = sum(ranges[:14]) / 14
    for value in ranges[14:]:
        atr = (atr * 13 + value) / 14
    ema9, ema20 = ema(closes, 9), ema(closes, 20)
    return {
        "status": "ready", "count": len(source), "algorithm_version": FEATURE_VERSION,
        "price_unit": "USDT", "volume_unit": "base_token",
        "ema9": ema9[-1], "ema20": ema20[-1],
        "ema9_change_1bar": ema9[-1] - ema9[-2],
        "ema20_change_1bar": ema20[-1] - ema20[-2],
        "rsi6": rsi(closes, 6), "rsi14": rsi(closes, 14),
        "rsi6_change_1bar": rsi(closes, 6) - rsi(closes[:-1], 6),
        "rsi14_change_1bar": rsi(closes, 14) - rsi(closes[:-1], 14),
        "macd": macd[-1], "macd_signal": signal, "macd_histogram": macd[-1] - signal,
        "atr14": atr,
        # Window extrema use only completed bars; no future pivot confirmation.
        "support_20": min(b.low for b in source[-20:]),
        "resistance_20": max(b.high for b in source[-20:]),
        "recent_bars": [asdict(b) for b in source[-12:]],
    }


def relative_strength(bars: Iterable[Bar], reference: Iterable[Bar]) -> dict:
    source, other = validate_series(bars), validate_series(reference)
    if len(source) < 2 or len(other) < 2:
        return {"value": None, "reason": "insufficient_aligned_history"}
    if [(b.open_time, b.interval_minutes) for b in source] != [
            (b.open_time, b.interval_minutes) for b in other]:
        return {"value": None, "reason": "unaligned_reference"}
    if any(b.open_time - a.open_time != a.interval_minutes * MINUTE
           for a, b in zip(source, source[1:])):
        return {"value": None, "reason": "missing_bars"}
    value = source[-1].close / source[0].close - other[-1].close / other[0].close
    return {"value": value, "unit": "return_fraction", "reference_symbol": other[0].symbol,
            "reason": None}


def session_metrics(bars: Iterable[Bar], as_of: int) -> dict:
    """UTC calendar-day convention for 24/7 bStocks, not US regular-session VWAP."""
    source = validate_series(bars)
    if any(b.interval_minutes != 1 for b in source):
        raise ValueError("session_metrics_require_1m")
    day = as_of // 86_400_000 * 86_400_000
    end = as_of // MINUTE * MINUTE
    by_time = {b.open_time: b for b in source if b.close_time < as_of}
    expected = list(range(day, end, MINUTE))
    current = [by_time[t] for t in expected if t in by_time]
    result = {"session": "UTC_calendar_day", "vwap": None, "rvol": None,
              "vwap_reason": None, "rvol_reason": None, "historical_days": 0}
    if not expected or len(current) != len(expected):
        result.update(vwap_reason="incomplete_current_day", rvol_reason="incomplete_current_day")
        return result
    volume = sum(b.volume for b in current)
    if volume:
        result["vwap"] = sum(b.quote_volume for b in current) / volume
    else:
        result["vwap_reason"] = "zero_volume"
    history = []
    for days_ago in range(1, 21):
        times = [t - days_ago * 86_400_000 for t in expected]
        if all(t in by_time for t in times):
            history.append(sum(by_time[t].volume for t in times))
    result["historical_days"] = len(history)
    if len(history) < 20:
        result["rvol_reason"] = "requires_20_complete_UTC_day_windows"
    elif sum(history) == 0:
        result["rvol_reason"] = "zero_historical_volume"
    else:
        result["rvol"] = volume / (sum(history) / 20)
    return result


def freeze_snapshot(symbol: str, bars: Iterable[Bar], as_of: int) -> dict:
    source = validate_series(bars)
    if any(b.symbol != symbol or b.close_time >= as_of or b.received_at > as_of for b in source):
        raise ValueError("snapshot_contains_wrong_symbol_or_future_data")
    periods = {"1m": features(source), "5m": features(aggregate(source, 5)),
               "15m": features(aggregate(source, 15))}
    reasons = [f"{key}:{value['reason']}" for key, value in periods.items()
               if value["status"] != "ready"]
    if not source or as_of - source[-1].close_time > 90_000:
        reasons.append("stale_or_missing_completed_bar")
    metrics = session_metrics(source, as_of)
    if metrics["vwap"] is None:
        reasons.append(f"vwap:{metrics['vwap_reason']}")
    if metrics["rvol"] is None:
        reasons.append(f"rvol:{metrics['rvol_reason']}")
    payload = {
        "symbol": symbol, "instrument_type": "tokenized_security", "feed": FEED,
        "currency": "USDT", "as_of": as_of, "feature_version": FEATURE_VERSION,
        "periods": periods, "session_metrics": metrics,
        "bar_revisions": [b.revision for b in source],
        "data_eligible": not reasons, "blocking_reasons": reasons,
    }
    encoded = json.dumps(payload, sort_keys=True, allow_nan=False).encode()
    return {"snapshot_id": hashlib.sha256(encoded).hexdigest(), **payload}
