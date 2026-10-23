"""Binance Stocks public price stream (USD equities, NOT bStocks spot).
Reference: https://developers.binance.com/en/docs/catalog/advanced-trading-stocks-trading/api/ws-streams/market-streams
No credentials, account access or order operations.
"""
import asyncio
import json
import math
import time
from websockets.asyncio.client import connect

PRICE_URL = 'wss://nbstream.binance.com/equity/ws/price'
FEED = 'binance_stocks'


def parse_prices(message, *, received_at):
    if not isinstance(message, dict) or message.get('e') != 'price':
        raise ValueError('wrong_stream')
    rates = message.get('rates')
    if not isinstance(rates, list):
        raise ValueError('invalid_rates')
    result = {}
    for row in rates:
        try:
            symbol = row['s']
            if not isinstance(symbol, str) or not symbol or row.get('ac') != 'EQ_' + symbol:
                continue
            price = float(row['p'])
            event_time = row.get('t')
            if not math.isfinite(price) or price <= 0:
                continue
            if type(event_time) is not int or not 0 <= received_at - event_time <= 10000:
                continue
            if row.get('mp') not in {'ON', 'PRE', 'O', 'POST', 'C'}:
                continue
            result[symbol] = {'symbol':symbol, 'instrument_id':row['ac'],
                'price':price, 'currency':'USD', 'feed':FEED,
                'event_time':event_time, 'received_at':received_at,
                'market_phase':row['mp'], 'tradable':None,
                'buy_eligible':False}
        except (KeyError, ValueError, TypeError):
            continue
    return result


class StocksPriceStream:
    def __init__(self, symbols):
        if len(set(symbols)) > 100:
            raise ValueError('universe_exceeds_100')
        self.symbols = frozenset(symbols)
        self.prices = {}
        self.status = 'disconnected'

    def snapshot(self, now=None):
        now = int(time.time()*1000) if now is None else now
        return {s:q for s,q in self.prices.items() if 0 <= now-q['event_time'] <= 10000}

    async def run(self):
        delay = 1
        while True:
            try:
                async with connect(PRICE_URL, open_timeout=10, ping_interval=20,
                                   max_size=4_000_000) as ws:
                    self.status = 'connected'
                    delay = 1
                    while True:
                        raw = await asyncio.wait_for(ws.recv(), timeout=15)
                        now = int(time.time()*1000)
                        rows = parse_prices(json.loads(raw), received_at=now)
                        self.prices.update({s:q for s,q in rows.items() if s in self.symbols})
            except asyncio.CancelledError:
                raise
            except Exception:
                self.status = 'disconnected'
                self.prices.clear()
                await asyncio.sleep(delay)
                delay = min(30, delay*2)
