"""User risk mandate; estimates are not guaranteed execution prices."""
from datetime import datetime
from decimal import Decimal as D
from zoneinfo import ZoneInfo

MAX_POSITIONS = 3
MAX_HOLD_MS = 3 * 60 * 60 * 1000
NET_TARGET = D('0.01')
NET_LOWER = D('0.008')
NET_UPPER = D('0.012')
MAX_NET_LOSS = D('0.01')


def session_bounds(now_ms):
    """Fail closed if the maintained exchange calendar is unavailable."""
    try:
        import exchange_calendars as xc
        day = trading_day(now_ms)
        calendar = xc.get_calendar('XNYS')
        if not calendar.is_session(day):
            return None, None
        return (int(calendar.session_open(day).timestamp()*1000),
                int(calendar.session_close(day).timestamp()*1000))
    except Exception:
        return None, None


def entries_allowed(now_ms):
    return opening_window(now_ms, *session_bounds(now_ms))


def opening_window(now_ms, session_open_ms, session_close_ms):
    """Require an actual exchange-calendar session, including holidays."""
    if session_open_ms is None or session_close_ms is None:
        return False
    return session_open_ms <= now_ms < min(session_open_ms + 1800000, session_close_ms)


def net_stop(gross, entry_fee, qty, exit_fee_rate=D('0.001'), slippage=D('0.002')):
    gross, entry_fee, qty = map(lambda x: D(str(x)), (gross, entry_fee, qty))
    if gross <= 0 or qty <= 0 or entry_fee < 0 or not 0 <= exit_fee_rate + slippage < 1:
        raise ValueError('invalid_cost')
    return ((gross + entry_fee) * (1 - MAX_NET_LOSS) / (qty * (1 - exit_fee_rate - slippage)))


def trading_day(now_ms):
    return datetime.fromtimestamp(now_ms / 1000, ZoneInfo('America/New_York')).date().isoformat()


def wilson_lower(wins, total, z=1.96):
    if total <= 0 or not 0 <= wins <= total:
        return 0.0
    p = wins / total
    return (p + z*z/(2*total) - z*((p*(1-p)+z*z/(4*total))/total)**0.5)/(1+z*z/total)
