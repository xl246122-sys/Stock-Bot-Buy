"""Binance equity bid/ask adapter. No spot fallback or inferred last-trade price."""
import math
import re
from pathlib import Path

import httpx


def load_equity_key(path: Path) -> str:
    content = path.read_text(encoding="utf-8-sig").strip()
    if not re.fullmatch(r"[A-Za-z0-9]{32,128}", content):
        raise ValueError("ambiguous_equity_api_key_file")
    return content


class EquityUnavailable(ValueError):
    pass


class EquityProvider:
    def __init__(self, client: httpx.AsyncClient, key_file: Path):
        self.client, self.key_file = client, key_file
        self.blocked = False

    async def _get(self, endpoint: str, params=None):
        if self.blocked:
            raise EquityUnavailable("equity_provider_blocked")
        response = await self.client.get(
            "https://api.binance.com/sapi/v1/equity/market/" + endpoint,
            params=params, headers={"X-MBX-APIKEY": load_equity_key(self.key_file)},
            follow_redirects=False, timeout=15,
        )
        if response.status_code in {403, 418, 429, 451}:
            self.blocked = True
        if response.status_code != 200:
            raise EquityUnavailable("equity_http_" + str(response.status_code))
        return response.json() if response.content.strip() else None

    async def exchange_info(self):
        data = await self._get("exchangeInfo")
        if not isinstance(data, dict) or not isinstance(data.get("symbols"), list):
            raise EquityUnavailable("invalid_equity_exchange_info")
        return data["symbols"]

    async def quote(self, symbol: str, *, received_at: int):
        if not re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,14}", symbol):
            raise ValueError("invalid_equity_symbol")
        data = await self._get("quote", {"symbol": symbol})
        if data is None:
            return None
        try:
            bid, ask = float(data["bidPrice"]), float(data["askPrice"])
            if data["symbol"] != symbol or not all(math.isfinite(v) and v > 0 for v in (bid, ask)) or bid > ask:
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise EquityUnavailable("invalid_equity_quote") from None
        return {"symbol": symbol, "currency": "USD", "source": "binance_equity",
                "bid": bid, "ask": ask, "received_at": received_at,
                "provider_timestamp": None, "last_trade_price": None,
                "change_percent": None, "quote_kind": "best_bid_ask"}
