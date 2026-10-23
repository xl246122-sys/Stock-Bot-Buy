"""Local multi-factor entries from fresh quotes. DeepSeek does not place these orders."""
from collections import deque
from decimal import Decimal as D

SPREAD = D('0.0015')
COST = D('0.004')
ROOM = D('0.012')
CHASE_LO, CHASE_HI = D('1.001'), D('1.004')
REBOUND_LO, REBOUND_HI = D('1.002'), D('1.006')

def rsi6(closes):
    if len(closes) < 15:
        return None
    try:
        from quant_engine import QuantEngine
    except ImportError:
        from server.quant_engine import QuantEngine
    return D(str(QuantEngine.calculate_wilder_rsi([float(x) for x in closes], 6)))

def net_room(origin, dest):
    if origin <= 0 or dest <= origin:
        return D('-1')
    return dest / origin - 1 - COST

class LocalModel:
    def __init__(self):
        self.points = {}

    def observe(self, symbol, timestamp, bid, ask):
        try:
            timestamp = int(timestamp)
            bid, ask = D(str(bid)), D(str(ask))
        except (TypeError, ValueError, ArithmeticError):
            return
        if not bid.is_finite() or not ask.is_finite() or timestamp <= 0 or bid <= 0 or ask < bid:
            return
        series = self.points.setdefault(symbol, deque(maxlen=2000))
        if series and timestamp <= series[-1][0]:
            return
        series.append((timestamp, bid, ask))
        while series and timestamp - series[0][0] > 90000:
            series.popleft()

    def scan(self, quotes, tradable, now, bars_for, etf_of, aux):
        for symbol, raw in quotes.items():
            if not isinstance(raw, dict):
                continue
            if type(raw.get('T')) is int and 0 <= now - raw['T'] <= 2000:
                self.observe(symbol, raw['T'], raw.get('bp'), raw.get('ap'))
        found = []
        for symbol in list(quotes):
            if tradable.get(symbol) not in ('BUY', 'BUY_SELL'):
                continue
            decision = self.decide(symbol, now, bars_for(symbol, now), etf_of(symbol), aux.get(symbol))
            if decision:
                found.append(decision)

        for d in found:
            spread=(d['ask']-d['bid'])/d['ask']
            distance=(d['ask']-d['invalidation'])/d['ask']
            # Ranking is deterministic; not a calibrated probability of success.
            d['score']=float(-(spread*2+distance))
        return sorted(found,key=lambda d:(-d['score'],d['symbol']))

    def decide(self, symbol, now, bars, etf_symbol, aux):
        current = self._current(symbol, now)
        if current is None:
            return None
        timestamp, bid, ask = current
        if (ask - bid) / ask > SPREAD:
            return None
        prior40 = self._prior(symbol, timestamp, 40000)
        prior20 = self._prior(symbol, timestamp, 20000)
        if not self._etf_supports(etf_symbol, timestamp):
            return None
        rebound = self._rebound(bid, ask, prior20, bars)
        if rebound and (aux or {}).get('kind') != 'BLOCK_REBOUND':
            return {'symbol': symbol, 'bid': bid, 'ask': ask, **rebound}
        if self._chase_blocked(aux, timestamp):
            return None
        chase = self._chase(bid, ask, prior40, bars)
        if chase:
            return {'symbol': symbol, 'bid': bid, 'ask': ask, **chase}
        return None

    def _current(self, symbol, now):
        series = self.points.get(symbol)
        if not series:
            return None
        timestamp, bid, ask = series[-1]
        if not 0 <= now - timestamp <= 2000:
            return None
        return timestamp, bid, ask

    def _prior(self, symbol, timestamp, window):
        points = list(self.points.get(symbol, ()))
        boundary = timestamp - window
        anchors = [p for p in points if boundary - 2000 <= p[0] <= boundary]
        if not anchors:
            return None
        series = [anchors[-1]] + [p for p in points if boundary < p[0] < timestamp]
        if len(series) < 5:
            return None
        if any(b[0] - a[0] > 5000 for a, b in zip(series, series[1:])):
            return None
        return series

    def _etf_supports(self, etf_symbol, timestamp):
        if not etf_symbol:
            return False
        current = self._current(etf_symbol, timestamp)
        prior = self._prior(etf_symbol, timestamp, 60000)
        return bool(current and prior and current[1] >= prior[0][1])

    def _chase_blocked(self, aux, now):
        if not aux or aux.get('until', 0) <= now:
            return False
        return aux.get('kind') == 'RISK' or aux.get('habit') == 'OVERBOUGHT_PEAK'

    def _chase(self, bid, ask, prior, bars):
        if not prior or len(bars) < 13:
            return None
        level = max(point[1] for point in prior[:-1])
        if prior[-1][1] > level or not level * CHASE_LO <= bid <= level * CHASE_HI:
            return None
        volumes = [D(str(bar.get('v', 0))) for bar in bars[-13:]]
        if volumes[-1] < median(volumes[:-1]):
            return None
        closes = [D(str(bar['c'])) for bar in bars[-16:]]
        momentum = rsi6(closes)
        if momentum is None or momentum >= 75:
            return None
        overhead = max(D(str(bar['h'])) for bar in bars[-12:])
        if overhead > ask and net_room(ask, overhead) < ROOM:
            return None
        return {'setup': 'CHASE', 'invalidation': level, 'detail': '追涨，突破40秒高点'}

    def _rebound(self, bid, ask, prior, bars):
        if not prior or len(bars) < 12:
            return None
        low = min(point[1] for point in prior[:-1])
        if prior[-1][1] >= low * REBOUND_LO or not low * REBOUND_LO <= bid <= low * REBOUND_HI:
            return None
        high = max(D(str(bar['h'])) for bar in bars[-12:])
        closes = [D(str(bar['c'])) for bar in bars[-16:]]
        momentum = rsi6(closes)
        drawdown = (high - bid) / high if high > 0 else D(0)
        if not ((momentum is not None and momentum <= 25) or drawdown >= D('0.015')):
            return None
        halfway = (high + low) / 2
        if bid >= halfway or net_room(ask, min(halfway, high)) < ROOM:
            return None
        return {'setup': 'REBOUND', 'invalidation': low, 'detail': '超卖反弹，止跌后抬升'}

def median(values):
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2

MODEL = LocalModel()
