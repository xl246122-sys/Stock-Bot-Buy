"""Event-timestamped best bid/ask from Binance's individual ticker stream.

bookTicker has no event time in the spot contract; never substitute receive time.
"""
import asyncio
import json
import math
import time

from websockets.asyncio.client import connect

from .decisions import Quote


class QuoteCache:
    def __init__(self, symbols: set[str]):
        self.symbols = symbols
        self.quotes: dict[str, Quote] = {}
        self.connected = False
        self.last_error: str | None = None

    def update(self, event: dict, received_at: int):
        symbol = event.get("s")
        if symbol not in self.symbols or event.get("e") != "24hrTicker":
            raise ValueError("unexpected_quote_event")
        for key in ("B", "A"):
            quantity = float(event[key])
            if not math.isfinite(quantity) or quantity <= 0:
                self.quotes.pop(symbol, None)
                raise ValueError("empty_book_side")
        quote = Quote(symbol=symbol, bid=float(event["b"]), ask=float(event["a"]),
                      event_time=event["E"], received_at=received_at)
        if not 0 <= received_at - quote.event_time <= 5000:
            raise ValueError("stale_or_future_event")
        old = self.quotes.get(symbol)
        if old and quote.event_time <= old.event_time:
            raise ValueError("non_monotonic_quote")
        self.quotes[symbol] = quote

    async def get(self, symbol: str) -> Quote | None:
        quote = self.quotes.get(symbol)
        if (not self.connected or quote is None
                or not 0 <= int(time.time() * 1000) - quote.event_time <= 5000):
            return None
        return quote

    async def stream_once(self):
        if not self.symbols or len(self.symbols) > 200:
            raise ValueError("invalid_quote_subscription_count")
        # Restrict names before interpolating into the subscription URL.
        if any(not s.isascii() or not s.isalnum() for s in self.symbols):
            raise ValueError("invalid_symbol")
        streams = "/".join(s.lower() + "@ticker" for s in sorted(self.symbols))
        self.quotes.clear()
        try:
            async with connect("wss://data-stream.binance.vision:443/stream?streams=" + streams,
                               open_timeout=10, close_timeout=2, max_queue=64,
                               max_size=1_048_576, proxy=None) as websocket:
                self.connected = True
                self.last_error = None
                async for raw in websocket:
                    event = json.loads(raw)["data"]
                    try:
                        self.update(event, int(time.time() * 1000))
                    except (ValueError, KeyError, TypeError):
                        self.last_error = "invalid_quote_event"
        finally:
            self.connected = False
            self.quotes.clear()

    async def run(self):
        delay = 1
        while True:
            try:
                await self.stream_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.last_error = type(exc).__name__
            # Bounded reconnect delay; a disconnected cache never supplies quotes.
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)
