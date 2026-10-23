import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import closing
from server.v2 import research_context as r

class ResearchContextTests(unittest.TestCase):
 def test_news_failure_cannot_produce_buy(self):
  from server.v2 import live_task as task
  with patch.object(task,'CONNECTED',True),patch.dict(task.QUOTES,{'AAPL':{'T':1000}}),patch.dict(task.TRADABLE,{'AAPL':'BUY_SELL'}):
   with self.assertRaisesRegex(ValueError,'news_unavailable'):
    task.validate_signal({'symbol':'AAPL','kind':'BUY','habit':'RANGE_SCALP','reason':'test'},{'AAPL':{'research_context':{'news_status':'failed'}}},1001)

 def test_partial_history_cannot_produce_buy(self):
  from server.v2 import live_task as task
  with patch.object(task,'CONNECTED',True),patch.dict(task.QUOTES,{'AAPL':{'T':1000}}),patch.dict(task.TRADABLE,{'AAPL':'BUY_SELL'}):
   with self.assertRaisesRegex(ValueError,'research_warmup'):
    task.validate_signal({'symbol':'AAPL','kind':'BUY','habit':'RANGE_SCALP','reason':'test'},{'AAPL':{'research_context':{'news_status':'ok','coverage':[]}}},1001)

 def test_reject_corrupt_and_unclosed_bars(self):
  valid=dict(t=100,o=10,h=12,l=9,c=11,v=0)
  self.assertEqual(r.validate_bar(valid,400,300),valid)
  for change in [dict(h=9),dict(v=-1),dict(c=float('nan')),dict(t=101)]:
   with self.assertRaises(ValueError):r.validate_bar({**valid,**change},400,300)

 def test_first_seen_prevents_future_news_and_stale_is_explicit(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(r,'ROOT',Path(tmp)):
   with closing(r.connection()) as c,c:
    for url,published,seen in [('known',100,200),('future_seen',100,400),('future_published',400,200)]:
     c.execute('INSERT INTO news VALUES(?,?,?,?,?)',('AAPL',url,published,seen,json.dumps({'url':url})))
   out=r.context('AAPL',300)
   self.assertEqual(out['news'],[{'url':'known'}])
   self.assertEqual(out['news_status'],'unverified_or_stale')
   self.assertFalse(out['historical_news_backtest_eligible'])
   self.assertTrue(out['not_binance_execution_prices'])
