"""Cached local entry decisions; no cloud model dependency."""
import json
import time
from contextlib import closing
from .local_model import MODEL
from .technical_plans import fresh

BAR_CACHE={}
LAST_REFRESH=0
STATE={'mode':'local_quant','evaluated':0,'candidates':0,'compute_ms':None}


def decisions(feed,now):
    global LAST_REFRESH
    start=time.perf_counter()
    # One refresh per minute; never query SQLite once per quote/symbol.
    if now-LAST_REFRESH>=60000:
        with closing(feed.db()) as c:
            rows=c.execute('SELECT symbol,payload FROM (SELECT symbol,payload,ROW_NUMBER() OVER(PARTITION BY symbol ORDER BY t DESC) AS n FROM bars WHERE t>?) WHERE n<=16',(now-48*3600000,)).fetchall()
        BAR_CACHE.clear()
        for symbol,payload in rows:BAR_CACHE.setdefault(symbol,[]).append(json.loads(payload))
        for bars in BAR_CACHE.values():bars.sort(key=lambda b:b['t'])
        LAST_REFRESH=now
    quotes={s:q for s,q in feed.QUOTES.items() if s in feed.META and fresh(q,now)}
    tradable={s:feed.tradability_of(s) for s in quotes if feed.META[s].get('group')!='inverse'}
    def history(symbol,moment):
        bars=BAR_CACHE.get(symbol,[])
        return bars if bars and 0<moment-bars[-1].get('ct',0)<=600000 else []
    result=MODEL.scan(quotes,tradable,now,history,lambda s:feed.META[s].get('etf'),{})
    STATE.update(evaluated=len(quotes),candidates=len(result),compute_ms=(time.perf_counter()-start)*1000)
    return result
