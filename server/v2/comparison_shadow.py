"""Three paper portfolios on shared quotes. Never imports a broker or submits orders."""
import asyncio
import json
import sqlite3
import time
from contextlib import closing
from .technical_plans import fresh
from .scalp_policy import entries_allowed, session_bounds

GROUPS=('local_rules','ai_immediate','ai_trigger')


class Comparison:
    def __init__(self,path):
        self.path=path
        with closing(self.db()) as c,c:
            c.executescript('''CREATE TABLE IF NOT EXISTS shadow_positions(
                id TEXT PRIMARY KEY, strategy TEXT,symbol TEXT,entry REAL,qty REAL,
                stop REAL,target REAL,deadline INTEGER,opened INTEGER,state TEXT,
                net REAL,closed INTEGER,reason TEXT);
                CREATE TABLE IF NOT EXISTS shadow_events(strategy TEXT,symbol TEXT,at INTEGER,reason TEXT);''')
    def db(self):return sqlite3.connect(self.path,timeout=2)

    def enter(self,strategy,key,symbol,q,now,limits):
        if strategy not in GROUPS or not entries_allowed(now) or not fresh(q,now):return
        bid,ask=float(q['bp']),float(q['ap'])
        if (ask-bid)/ask>.0015:return
        with closing(self.db()) as c,c:
            active=c.execute("SELECT symbol,entry*qty FROM shadow_positions WHERE strategy=? AND state='open'",(strategy,)).fetchall()
            cap=min(50.,float(limits['order_cap_usd']))
            reason=None
            if len(active)>=min(3,int(limits['max_open_trades'])):reason='capacity'
            elif any(s==symbol for s,_ in active):reason='already_held'
            elif sum(v for _,v in active)+cap>float(limits['budget_usd']):reason='budget'
            if reason:
                c.execute('INSERT INTO shadow_events VALUES(?,?,?,?)',(strategy,symbol,now,reason));return
            # Identical 20bp per side cost/slippage reserve for all groups.
            entry=ask*1.002;qty=cap/entry
            close=session_bounds(now)[1]
            if close is None:return
            c.execute('INSERT OR IGNORE INTO shadow_positions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                      (strategy+':'+key,strategy,symbol,entry,qty,entry*.99/.998,entry*1.01/.998,min(now+10800000,close),now,'open',None,None,None))

    def mark(self,quotes,now):
        with closing(self.db()) as c,c:
            for key,symbol,entry,qty,stop,target,deadline in c.execute("SELECT id,symbol,entry,qty,stop,target,deadline FROM shadow_positions WHERE state='open'").fetchall():
                q=quotes.get(symbol,{})
                if not fresh(q,now):continue
                bid=float(q['bp']);reason='STOP' if bid<=stop else 'TARGET' if bid>=target else 'TIME' if now>=deadline else None
                if reason:c.execute("UPDATE shadow_positions SET state='closed',net=?,closed=?,reason=? WHERE id=?",((bid*.998-entry)*qty,now,reason,key))

    def summary(self):
        with closing(self.db()) as c:
            out={}
            for group in GROUPS:
                values=[r[0] for r in c.execute("SELECT net FROM shadow_positions WHERE strategy=? AND state='closed' ORDER BY closed,id",(group,))]
                equity=peak=drawdown=0.
                for v in values:equity+=v;peak=max(peak,equity);drawdown=max(drawdown,peak-equity)
                out[group]={'closed':len(values),'net_usd':sum(values),'win_rate':sum(v>0 for v in values)/len(values) if values else None,'max_realized_drawdown_usd':drawdown}
            return {'groups':out,'mode':'shadow','fill_model':'fresh ask/bid with 20bp reserve per side; no queue simulation','not_live_performance':True}


async def run_comparison():
    from . import execution_config as cfg,live_task as feed
    from .local_model import MODEL
    from .technical_plans import store,Plan
    cfg.ROOT.mkdir(parents=True,exist_ok=True)
    paper=Comparison(cfg.ROOT/'comparison-shadow.db')
    while True:
        try:
            now=int(time.time()*1000);quotes=dict(feed.QUOTES) if feed.CONNECTED else {}
            paper.mark(quotes,now);limits=cfg.read_config()['limits']
            ledger=store()
            with closing(ledger.connect()) as c:
                plans=c.execute("SELECT id,payload,created FROM technical_plans WHERE state IN ('active','claimed') AND expires>?",(now,)).fetchall()
            for key,payload,created in plans:
                p=Plan.model_validate_json(payload)
                if now-created<30000:paper.enter('ai_immediate',key,p.symbol,quotes.get(p.symbol,{}),now,limits)
                q=quotes.get(p.symbol,{})
                if fresh(q,now):
                    ask,bid=float(q['ap']),float(q['bp'])
                    hit=ask>=p.trigger_price if p.trigger=='ABOVE' else ask<=p.trigger_price
                    if hit and ask<=p.max_buy and bid>p.invalidate_below:paper.enter('ai_trigger',key,p.symbol,q,now,limits)
            def bars_for(symbol,moment):
                with closing(feed.db()) as c:return [json.loads(r[0]) for r in c.execute('SELECT payload FROM bars WHERE symbol=? ORDER BY t DESC LIMIT 16',(symbol,))][::-1]
            if not entries_allowed(now):
                await asyncio.sleep(1)
                continue
            for d in MODEL.scan(quotes,{s:feed.tradability_of(s) for s in quotes},now,bars_for,lambda s:feed.META.get(s,{}).get('etf'),{}):
                paper.enter('local_rules',d['symbol']+':'+str(now//30000),d['symbol'],quotes[d['symbol']],now,limits)
        except asyncio.CancelledError:raise
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Shadow comparison failed')
        await asyncio.sleep(1)
