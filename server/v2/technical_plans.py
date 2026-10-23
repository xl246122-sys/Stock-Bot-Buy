"""Technical-only AI plans. No model output can bypass execution risk checks."""
import asyncio
import hashlib
import json
import math
import sqlite3
import statistics
import time
from contextlib import closing
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .credentials import load_deepseek_key

INTERVAL = 30
BUSY = asyncio.Lock()


class Plan(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    symbol: str
    trigger: Literal['ABOVE', 'BELOW']
    trigger_price: float = Field(gt=0)
    max_buy: float = Field(gt=0)
    invalidate_below: float = Field(gt=0)
    stop: float = Field(gt=0)
    target: float = Field(gt=0)
    ttl_seconds: int = Field(ge=5, le=60, strict=True)
    holding_seconds: int = Field(ge=2, le=10800, strict=True)
    reason: str = Field(min_length=1, max_length=180)

    @model_validator(mode='after')
    def prices(self):
        if not self.stop <= self.invalidate_below < self.trigger_price <= self.max_buy < self.target:
            raise ValueError('invalid_price_order')
        # Conservative round-trip reserve; execution recomputes from actual costs.
        if (self.max_buy-self.stop)/self.max_buy + .004 > .01:
            raise ValueError('loss_budget')
        if not .008 <= self.target/self.max_buy-1-.004 <= .012:
            raise ValueError('net_target_band')
        return self


class Response(BaseModel):
    model_config = ConfigDict(extra='forbid')
    plans: list[Plan] = Field(max_length=3)


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as c, c:
            c.executescript('''CREATE TABLE IF NOT EXISTS technical_plans(
              id TEXT PRIMARY KEY, symbol TEXT, payload TEXT, created INTEGER,
              expires INTEGER, state TEXT);
              CREATE TABLE IF NOT EXISTS technical_cycles(
              at INTEGER PRIMARY KEY, payload TEXT);
              CREATE TABLE IF NOT EXISTS plan_events(
              id TEXT, at INTEGER, reason TEXT);''')

    def connect(self):
        return sqlite3.connect(self.path, timeout=2)

    def replace(self, plans, started, now):
        with closing(self.connect()) as c, c:
            c.execute('BEGIN IMMEDIATE')
            c.execute("UPDATE technical_plans SET state='superseded' WHERE state='active'")
            for p in plans:
                expiry=started+p.ttl_seconds*1000
                if expiry<=now:continue
                key=hashlib.sha256((str(started)+p.symbol+p.model_dump_json()).encode()).hexdigest()
                c.execute('INSERT OR IGNORE INTO technical_plans VALUES(?,?,?,?,?,?)',
                          (key,p.symbol,p.model_dump_json(),started,expiry,'active'))

    def eligible(self, quotes, now):
        with closing(self.connect()) as c, c:
            c.execute("UPDATE technical_plans SET state='expired' WHERE state='active' AND expires<=?",(now,))
            rows=c.execute("SELECT id,payload FROM technical_plans WHERE state='active'").fetchall()
            result=[]
            for key,payload in rows:
                p=Plan.model_validate_json(payload);q=quotes.get(p.symbol,{})
                if not fresh(q,now):continue
                bid,ask=float(q['bp']),float(q['ap'])
                if bid<=p.invalidate_below:
                    c.execute("UPDATE technical_plans SET state='invalidated' WHERE id=?",(key,));continue
                hit=ask>=p.trigger_price if p.trigger=='ABOVE' else ask<=p.trigger_price
                if hit and ask<=p.max_buy and (ask-bid)/ask<=.0015:result.append((key,p))
            return result

    def claim(self,key,now):
        with closing(self.connect()) as c,c:
            return c.execute("UPDATE technical_plans SET state='claimed' WHERE id=? AND state='active' AND expires>?",(key,now)).rowcount==1

    def event(self,key,now,reason):
        with closing(self.connect()) as c,c:c.execute('INSERT INTO plan_events VALUES(?,?,?)',(key,now,reason))


def fresh(q,now):
    try:
        b,a=float(q['bp']),float(q['ap'])
        return type(q.get('T')) is int and 0<=now-q['T']<=2000 and math.isfinite(b) and math.isfinite(a) and 0<b<=a
    except (KeyError,ValueError,TypeError):return False


def features(bars,q,now):
    bars=[b for b in bars if type(b.get('ct')) is int and b['ct']<now]
    if len(bars)<12 or now-bars[-1]['ct']>600000:return None
    closes=[float(b['c']) for b in bars];volumes=[float(b['v']) for b in bars]
    if any(not math.isfinite(v) or v<=0 for v in closes) or any(not math.isfinite(v) or v<0 for v in volumes):return None
    volume=sum(volumes)
    if volume<=0:return None
    changes=[math.log(b/a) for a,b in zip(closes,closes[1:])]
    return dict(bid=float(q['bp']),ask=float(q['ap']),quote_time=q['T'],
                spread_bps=(float(q['ap'])/float(q['bp'])-1)*10000,
                returns={str(n*5)+'m':closes[-1]/closes[-1-n]-1 for n in (1,3,6) if len(closes)>n},
                bar_volume=volumes[-1],relative_volume=volumes[-1]/max(statistics.mean(volumes[:-1]),1),
                vwap_proxy=sum((float(b['h'])+float(b['l'])+float(b['c']))/3*v for b,v in zip(bars,volumes))/volume,
                vwap_basis='rolling closed 5m typical-price proxy, not trade/session VWAP',
                volatility_5m=statistics.pstdev(changes),last_bar_time=bars[-1]['ct'])


def store():
    from .execution_config import ROOT
    return Store(ROOT/'technical-plans.db')


async def cycle(preflight=False,manual=False):
    from . import live_task as feed
    if BUSY.locked():return {'status':'busy_skipped'}
    async with BUSY:
        started=int(time.time()*1000);inputs={}
        with closing(feed.db()) as c:
            for symbol,q in list(feed.QUOTES.items()):
                if not fresh(q,started) or feed.tradability_of(symbol) not in ('BUY','BUY_SELL'):continue
                if (float(q['ap'])-float(q['bp']))/float(q['ap'])>.0015:continue
                bars=[json.loads(r[0]) for r in c.execute('SELECT payload FROM bars WHERE symbol=? ORDER BY t DESC LIMIT 24',(symbol,))][::-1]
                f=features(bars,q,started)
                if f:
                    from .local_model import MODEL
                    history=MODEL.points.get(symbol,())
                    f['quote_returns']={}
                    for seconds in (10,30,60):
                        anchors=[p for p in history if started-seconds*1000-2000<=p[0]<=started-seconds*1000]
                        f['quote_returns'][str(seconds)+'s']=float(q['bp'])/float(anchors[-1][1])-1 if anchors else None
                    f['sector_etf']=feed.META[symbol].get('etf');inputs[symbol]=f
        # Liquidity screening only, not a directional buy rule.
        chosen=sorted(inputs,key=lambda s:inputs[s]['bar_volume']*inputs[s]['ask'],reverse=True)[:8]
        candidates={s:{**inputs[s],'sector_context':inputs.get(inputs[s]['sector_etf'])} for s in chosen}
        plans=[]
        if candidates:
            prompt=('You select US equity technical-only long trading plans. No news, earnings or confidence/win-rate claims. '
                    'Use only supplied facts. Return {"plans":[]} when no supported opportunity. '
                    'Prices are USD. Stop risk including .004 round-trip reserve must be <=.01. '
                    'Target/max_buy-1-.004 must be .008 to .012. TTL is from input as_of, not response time. '
                    'Do not invent missing data. Schema: '+json.dumps(Response.model_json_schema()))
            async with httpx.AsyncClient(timeout=25,trust_env=False) as client:
                async with asyncio.timeout(28):
                    r=await client.post('https://api.deepseek.com/chat/completions',headers={'Authorization':'Bearer '+load_deepseek_key(Path('/etc/stock-g/deepseek.key'))},json={'model':'deepseek-flash','messages':[{'role':'system','content':prompt},{'role':'user','content':json.dumps({'as_of':started,'candidates':candidates})}],'response_format':{'type':'json_object'},'temperature':0,'max_tokens':1800})
                    r.raise_for_status();answer=r.json()['choices'][0]
                    if answer.get('finish_reason')!='stop':raise ValueError('incomplete_ai_response')
                    plans=Response.model_validate_json(answer['message']['content']).plans
        now=int(time.time()*1000)
        if len({p.symbol for p in plans})!=len(plans):raise ValueError('duplicate_symbol')
        plans=[p for p in plans if p.symbol in candidates and fresh(feed.QUOTES.get(p.symbol,{}),now)
               and float(feed.QUOTES[p.symbol]['ap'])<=p.max_buy and float(feed.QUOTES[p.symbol]['bp'])>p.invalidate_below]
        ledger=store()
        if not preflight:ledger.replace(plans,started,now)
        with closing(ledger.connect()) as c,c:
            c.execute('INSERT OR REPLACE INTO technical_cycles VALUES(?,?)',(started,json.dumps({'inputs':candidates,'plans':[p.model_dump() for p in plans],'latency_ms':now-started,'preflight':preflight})))
        feed.STATE.update(lastScanTime=now,totalScansCount=feed.STATE['totalScansCount']+1,lastExecutionSummary=f'技术面AI：{len(candidates)}候选，{len(plans)}计划；未报告胜率')
        return {'inputs':len(candidates),'accepted':len(plans),'preflight':preflight}
