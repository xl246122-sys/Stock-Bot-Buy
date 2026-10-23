"""Isolated paper execution. No broker transport or credentials exist in this module."""
import asyncio,json,time,sqlite3,logging
from collections import deque
from contextlib import closing
from datetime import datetime,timezone,timedelta
from decimal import Decimal as D
from . import execution_config as cfg
WAKE=asyncio.Event()
METRICS={'last_tick':None,'last_duration_ms':None,'error':None}
FEE=D('.001');SLIP=D('.001') # Explicit simulation assumptions per side, not venue fees.

def connect():
 c=cfg.connect()
 c.executescript('''CREATE TABLE IF NOT EXISTS paper_state(id INTEGER PRIMARY KEY,payload TEXT);
 CREATE TABLE IF NOT EXISTS paper_events(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER,payload TEXT);''')
 initial={'enabled':False,'positions':{},'realized':'0','day':None,'baseline':'0','halted':False,'cooldown':{},'revision':1}
 c.execute('INSERT OR IGNORE INTO paper_state VALUES(1,?)',(json.dumps(initial),));c.commit();return c

def status():
 with closing(connect()) as c:
  state=json.loads(c.execute('SELECT payload FROM paper_state WHERE id=1').fetchone()[0])
  events=[json.loads(r[0]) for r in c.execute('SELECT payload FROM paper_events ORDER BY id DESC LIMIT 20')]
 return {**state,'mode':'paper','live_enabled':False,'metrics':dict(METRICS),'events':events,'fee_per_side':'0.1%','slippage_per_side':'0.1%'}

def toggle(enabled,revision):
 with closing(connect()) as c,c:
  c.execute('BEGIN IMMEDIATE');s=json.loads(c.execute('SELECT payload FROM paper_state WHERE id=1').fetchone()[0])
  if s['revision']!=revision:raise ValueError('状态已更新，请刷新')
  s.update(enabled=enabled,revision=revision+1)
  c.execute('UPDATE paper_state SET payload=? WHERE id=1',(json.dumps(s),))
 return status()

def quote(raw,now):
 try:
  if type(raw['T']) is not int or not 0<=now-raw['T']<=2000:return None
  bid,ask=D(str(raw['bp'])),D(str(raw['ap']))
  if not bid.is_finite() or not ask.is_finite() or not 0<bid<=ask:return None
  return bid,ask
 except (KeyError,TypeError,ArithmeticError):return None

class Strategy:
 """Experimental quote-only breakout/retest, not a trained or profitable model."""
 def __init__(self):self.history={};self.setups={}
 def update(self,symbol,q,t):
  h=self.history.setdefault(symbol,deque(maxlen=1200))
  if h and t<=h[-1][0]:return None
  if h and t-h[-1][0]>2000:h.clear();self.setups.pop(symbol,None)
  while h and t-h[0][0]>60000:h.popleft()
  old=[v for ts,v in h if ts<t-2000]
  result=None;bid,ask=q
  if len(old)>=10 and h and t-h[0][0]>=30000 and (ask-bid)/ask<=D('.002'):
   setup=self.setups.get(symbol)
   if setup and t-setup['at']>15000:self.setups.pop(symbol,None);setup=None
   if setup:
    level=setup['level']
    if bid<level*D('.998'):self.setups.pop(symbol,None)
    elif not setup['retest'] and bid<=level*D('1.0005'):setup['retest']=True
    elif setup['retest'] and bid>=level*D('1.001') and ask<=level*D('1.003'):
     result='RETEST';self.setups.pop(symbol,None)
    elif not setup['retest'] and bid>=level*D('1.001') and ask<=level*D('1.003'):
     setup['confirm']+=1
     if setup['confirm']>=3 and not setup['emitted']:result='BREAKOUT';setup['emitted']=True
   elif bid>max(old)*D('1.001') and ask<=max(old)*D('1.003'):
    self.setups[symbol]={'level':max(old),'at':t,'confirm':1,'retest':False,'emitted':False}
  h.append((t,bid));return result

class PaperEngine:
 def __init__(self):self.strategy=Strategy();self.last={}
 def tick(self,quotes,now,allow_entries,tradable):
  valid={s:quote(q,now) for s,q in quotes.items()};valid={s:q for s,q in valid.items() if q}
  signals={}
  for symbol,q in valid.items():
   t=quotes[symbol]['T']
   signal=self.strategy.update(symbol,q,t)
   if signal:signals[symbol]=signal
  with closing(connect()) as c,c:
   c.execute('BEGIN IMMEDIATE')
   s=json.loads(c.execute('SELECT payload FROM paper_state WHERE id=1').fetchone()[0])
   rev,payload=c.execute('SELECT revision,payload FROM config WHERE id=1').fetchone();limits=cfg.Limits.model_validate_json(payload)
   positions=s['positions'];realized=D(s['realized']);events=[]
   day=datetime.fromtimestamp(now/1000,timezone(timedelta(hours=8))).date().isoformat()
   complete=all(sym in valid for sym in positions)
   unreal=D(0)
   for symbol,p in positions.items():
    if symbol in valid:p['mark']=str(valid[symbol][0]*D(p['qty'])*(1-SLIP)*(1-FEE)-D(p['cost']))
    unreal+=D(p.get('mark','0'))
   equity_pnl=realized+unreal
   # Never establish a new daily baseline from stale marks.
   if day!=s['day'] and complete:
    s.update(day=day,baseline=str(equity_pnl),halted=False)
   daily=equity_pnl-D(s['baseline']);remaining=limits.daily_loss_cap_usd+daily
   if daily<=-limits.daily_loss_cap_usd:s['halted']=True
   for symbol,p in list(positions.items()):
    if symbol not in valid:continue
    bid=valid[symbol][0];pnl=bid*D(p['qty'])*(1-SLIP)*(1-FEE)-D(p['cost'])
    reason='DAILY_LIMIT' if s['halted'] else 'STOP' if pnl<=-D(p['risk']) else 'TARGET' if pnl>=D(p['cost'])*D('.015') else 'TIME' if now-p['opened']>=3600000 else None
    if reason:
     realized+=pnl;events.append({'type':'PAPER_SELL','symbol':symbol,'reason':reason,'net_pnl':str(pnl.quantize(D('.0001'))),'at':now})
     del positions[symbol];s['cooldown'][symbol]=now+300000
   used=sum((D(p['cost']) for p in positions.values()),D(0))
   # Reserve full loss for open positions as a conservative additional daily constraint.
   risk_used=sum((D(p['risk']) for p in positions.values()),D(0))
   for symbol,signal in signals.items():
    if not s['enabled'] or s['halted'] or not allow_entries or not complete or s['day']!=day:break
    if symbol in positions or now<s['cooldown'].get(symbol,0) or tradable.get(symbol) not in ('BUY','BUY_SELL'):continue
    cost=limits.order_cap_usd;risk=cost*limits.max_trade_loss_pct/100
    if (valid[symbol][1]-valid[symbol][0])/valid[symbol][1]+D('.004')>=limits.max_trade_loss_pct/100:continue
    if len(positions)>=limits.max_open_trades or used+cost>limits.budget_usd+min(realized,D(0)) or risk_used+risk>remaining:continue
    # No depth/queue available: record hypothetical full fill, never claim an actual fill.
    ask=valid[symbol][1];qty=cost/(ask*(1+SLIP)*(1+FEE))
    positions[symbol]={'cost':str(cost),'qty':str(qty),'risk':str(risk),'opened':now,'config_revision':rev,'entry':str(ask),'mark':'0','strategy':signal}
    used+=cost;risk_used+=risk;events.append({'type':'PAPER_BUY','symbol':symbol,'reason':signal,'cost':str(cost),'at':now})
   s.update(realized=str(realized),daily_pnl=str(daily),valuation_fresh=complete,last_tick=now)
   s['cooldown']={k:v for k,v in s['cooldown'].items() if v>now}
   c.execute('UPDATE paper_state SET payload=? WHERE id=1',(json.dumps(s),))
   for e in events:c.execute('INSERT INTO paper_events(at,payload) VALUES(?,?)',(now,json.dumps(e)))
   return events

async def run_paper():
 from . import live_task as live
 from .analysis_control import AnalysisControl
 engine=PaperEngine()
 while True:
  try:
   await asyncio.wait_for(WAKE.wait(),timeout=2)
  except asyncio.TimeoutError:pass
  WAKE.clear();start=time.perf_counter();now=int(time.time()*1000)
  try:
   engine.tick(dict(live.QUOTES) if live.CONNECTED else {},now,AnalysisControl().allows(datetime.now(timezone.utc)),dict(live.TRADABLE))
   METRICS.update(last_tick=now,last_duration_ms=round((time.perf_counter()-start)*1000,3),error=None)
  except Exception as exc:
   METRICS['error']=type(exc).__name__;logging.exception('paper engine failed')
  await asyncio.sleep(.05)
