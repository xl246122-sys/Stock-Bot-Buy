"""Public read-only spot adapter. No trading credentials or order endpoints."""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

import httpx

from .market_data import Bar, MINUTE, from_kline, validate_series
from .sector_universe import SECTORS, select_universe


BASE_URL = "https://data-api.binance.vision"
# Explicit candidates from the existing project, plus sector reference candidates.
# Availability and symbol identity must be checked against exchangeInfo each run.
UNDERLYINGS = (
    "NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "AMD", "SMCI",
    "PLTR", "INTC", "AVGO", "QCOM", "ARM", "TSM", "ASML", "MU", "CRWD",
    "CRM", "ADBE", "DELL", "COIN", "MSTR", "HOOD", "RDDT", "NFLX", "BABA",
    "SPY", "QQQ", "SMH", "XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI",
    "XLB", "XLRE", "XLK", "XLU",
)
REFERENCES = frozenset(UNDERLYINGS[27:])


class ProviderError(RuntimeError):
    pass


class BinanceProvider:
    def __init__(self, client: httpx.AsyncClient, metadata_records: list[dict] | None = None,
                 *, references_only: bool = False):
        self.client = client
        self.selection = select_universe(metadata_records or [],
                                         as_of=datetime.now(timezone.utc).date())
        selected = [r for sector in self.selection["sectors"]
                    for group in ("mega", "mid_high_volatility") for r in sector[group]]
        self._selected = {r["underlying_symbol"]: r for r in selected}
        self._underlyings = tuple(dict.fromkeys(
            [*self._selected] + list(UNDERLYINGS[:27]) + ["SPY", "QQQ", "SMH"]
            + [etf for _, _, etf in SECTORS]))
        if references_only:
            self._underlyings = ("SPY", "QQQ", "SMH")
        self._request_lock = asyncio.Lock()
        self._next_request = 0.0
        self._limited = False

    async def _get(self, path: str, params: dict | None = None):
        async with self._request_lock:
            if self._limited:
                raise ProviderError("rate_limited")
            await asyncio.sleep(max(0, self._next_request - time.monotonic()))
            self._next_request = time.monotonic() + 0.15
        response = await self.client.get(BASE_URL + path, params=params, follow_redirects=False)
        if response.status_code in (418, 429):
            # No immediate retry storm; caller must schedule a later attempt.
            self._limited = True
            raise ProviderError("rate_limited")
        if response.status_code != 200:
            raise ProviderError(f"provider_http_{response.status_code}")
        return response.json()

    async def server_time(self) -> int:
        started = int(time.time() * 1000)
        server = int((await self._get("/api/v3/time"))["serverTime"])
        ended = int(time.time() * 1000)
        if not started - 2000 <= server <= ended + 2000:
            raise ProviderError("clock_skew")
        return server

    async def universe(self) -> dict:
        info = await self._get("/api/v3/exchangeInfo")
        by_symbol = {item["symbol"]: item for item in info["symbols"]}
        available, unavailable = [], []
        for underlying in self._underlyings:
            symbol = self._selected.get(underlying, {}).get("instrument_symbol", underlying + "BUSDT")
            item = by_symbol.get(symbol)
            if not item or item.get("status") != "TRADING":
                unavailable.append({"symbol": symbol, "reason": "not_listed_or_not_trading"})
                continue
            if item.get("baseAsset") != underlying + "B" or item.get("quoteAsset") != "USDT":
                unavailable.append({"symbol": symbol, "reason": "identity_mismatch"})
                continue
            available.append({
                "symbol": symbol, "underlying_symbol": underlying,
                "instrument_type": "tokenized_security", "currency": "USDT",
                "role": ("reference" if underlying in REFERENCES else
                         "candidate" if underlying in self._selected else "research_candidate"),
                "sector_id": self._selected.get(underlying, {}).get("sector_id"),
                "underlying_market_cap": self._selected.get(underlying, {}).get("market_cap_usd"),
                "market_cap_status": "verified_record" if underlying in self._selected else "unknown",
                "status": item["status"],
            })
        return {
            "version": self.selection["version"],
            "scope": "sector_first_verified_selection_plus_research_candidates",
            "available": available, "unavailable": unavailable,
            "available_count": len(available), "requested_count": len(self._underlyings),
            "target_stock_count": 80, "target_sector_etf_count": 8,
            "selection": self.selection, "target_200_verified": False,
        }

    async def history(self, symbol: str, *, end_time: int, count: int = 3100) -> list[Bar]:
        if symbol not in {self._selected.get(u, {}).get("instrument_symbol", u + "BUSDT")
                          for u in self._underlyings}:
            raise ValueError("symbol_not_in_explicit_mapping")
        if not 1 <= count <= 32_000:
            raise ValueError("history_count_out_of_bounds")
        # Only fully closed 1m intervals. Fetch from oldest to newest in bounded pages.
        exclusive_end = end_time // MINUTE * MINUTE
        cursor = exclusive_end - count * MINUTE
        result: list[Bar] = []
        while cursor < exclusive_end:
            rows = await self._get("/api/v3/klines", {
                "symbol": symbol, "interval": "1m", "startTime": cursor,
                "endTime": exclusive_end - 1, "limit": min(1000, (exclusive_end - cursor) // MINUTE),
            })
            if not rows:
                break
            received_at = int(time.time() * 1000)
            page = [from_kline(symbol, row, received_at) for row in rows]
            if any(b.open_time < cursor or b.close_time >= exclusive_end for b in page):
                raise ProviderError("out_of_window_bar")
            result.extend(page)
            next_cursor = page[-1].open_time + MINUTE
            if next_cursor <= cursor:
                raise ProviderError("non_advancing_pagination")
            cursor = next_cursor
            await asyncio.sleep(0.15)
        return validate_series(result)
