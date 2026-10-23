"""Read-only 2s execution readiness observer. Never creates exchange orders."""
import asyncio, json, time
from contextlib import closing
from decimal import Decimal
from . import execution_config as config
STATE={'mode':'observe_only','live_enabled':False,'interval_seconds':2,'last_check':None,'evaluated':0,'eligible':0,'reason':'waiting'}

def evaluate(card,quote,limits,now):
 if not card.get('isBuyOpportunity'):return 'not_buy'
 if card.get('validUntil',0)<=now:return 'expired'
 if not quote or type(quote.get('T')) is not int or not 0<=now-quote['T']<=2000:return 'stale_quote'
 try:
  ask,bid,entry,stop,target=map(lambda v:Decimal(str(v)),[quote['ap'],quote['bp'],card['suggestedEntry'],card['stopLossPrice'],card['takeProfitPrice']])
  if not all(v.is_finite() for v in [ask,bid,entry,stop,target]):return 'invalid_price'
  if not 0<bid<=ask or not 0<stop<entry<target:return 'invalid_price'
  if abs(ask/entry-1)>Decimal('.002'):return 'entry_moved'
  # Screening reserve only: actual commission/slippage must be verified before live.
  cost=Decimal('.004')
  if (ask-stop)/ask+cost>limits.max_trade_loss_pct/100:return 'loss_budget'
  if (target/ask-1)-cost<Decimal('.01'):return 'net_target'
  return 'candidate_only'
 except (ValueError,KeyError,ArithmeticError):return 'invalid_price'

async def run_observer():
 from . import live_task as live
 while True:
  try:
   now=int(time.time()*1000);limits=config.Limits.model_validate(config.read_config()['limits']);reasons={}
   with closing(live.db()) as c:rows=c.execute('SELECT payload FROM cards WHERE expires>?',(now,)).fetchall()
   for row in rows:
    card=json.loads(row[0]);reason=evaluate(card,live.QUOTES.get(card.get('symbol')) if live.CONNECTED else None,limits,now)
    reasons[reason]=reasons.get(reason,0)+1
   STATE.update(last_check=now,evaluated=len(rows),eligible=reasons.get('candidate_only',0),reason='observing',counts=reasons)
  except Exception as exc:STATE.update(reason='failed',error_type=type(exc).__name__)
  await asyncio.sleep(2)
