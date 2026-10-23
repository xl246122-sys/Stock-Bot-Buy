import unittest,tempfile,sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server.v2 import execution_config as c
from server.v2.execution_observer import evaluate
from fastapi import HTTPException
from pydantic import ValidationError
class ExecutionTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(dir=Path('.local'));self.old=c.ROOT;c.ROOT=Path(self.temp.name)
 def tearDown(self):c.ROOT=self.old;self.temp.cleanup()
 def body(self,request='request-0001',revision=1,**kw):
  return c.Save(deviceId='test',code='test',request_id=request,expected_revision=revision,limits={**c.Limits().model_dump(),**kw})
 def test_defaults_persist(self):
  self.assertEqual(c.read_config()['limits']['budget_usd'],'300');self.assertFalse(c.read_config()['live_enabled'])
  c.save_config(self.body(order_cap_usd='40'));self.assertEqual(c.read_config()['limits']['order_cap_usd'],'40')
 def test_idempotent_and_conflict(self):
  c.save_config(self.body());self.assertEqual(c.save_config(self.body())['revision'],2)
  with self.assertRaises(HTTPException):c.save_config(self.body(order_cap_usd='40'))
  with self.assertRaises(HTTPException):c.save_config(self.body(request='request-0002'))
 def test_concurrent_update(self):
  c.read_config()
  def write(i):
   try:return c.save_config(self.body(request=f'request-{i:04}'))['revision']
   except HTTPException:return 'conflict'
  with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(write,range(20)))
  self.assertEqual(results.count(2),1);self.assertEqual(results.count('conflict'),19)
 def test_invalid_limits(self):
  for kw in [{'order_cap_usd':'301'},{'daily_loss_cap_usd':'301'},{'budget_usd':'NaN'},{'max_open_trades':2.5},{'max_open_trades':True},{'order_cap_usd':'50.001'},{'max_trade_loss_pct':0}]:
   with self.assertRaises(ValidationError):c.Limits(**kw)
 def test_observer_never_order(self):
  card=dict(isBuyOpportunity=True,validUntil=10000,suggestedEntry=100,stopLossPrice=99.5,takeProfitPrice=102)
  q=dict(T=1000,bp=100,ap=100)
  self.assertEqual(evaluate(card,q,c.Limits(),1000),'candidate_only')
  self.assertEqual(evaluate({**card,'stopLossPrice':99},q,c.Limits(),1000),'loss_budget')
  self.assertEqual(evaluate(card,q,c.Limits(),4000),'stale_quote')
  self.assertEqual(evaluate({**card,'stopLossPrice':97},q,c.Limits(),1000),'loss_budget')
  self.assertEqual(evaluate(card,{**q,'ap':101},c.Limits(),1000),'entry_moved')
if __name__=='__main__':unittest.main()
