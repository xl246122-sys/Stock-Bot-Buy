import unittest,tempfile
from pathlib import Path
from datetime import datetime
from server.v2 import live_task as t
class ProductionTaskTests(unittest.TestCase):
 def test_persistent_schedule_and_sunday(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'s.db'
   for date,want in [('2026-10-22T21:29:00+08:00',False),('2026-10-22T21:30:00+08:00',True),('2026-10-22T21:30:01+08:00',False),('2026-10-22T21:30:30+08:00',True),('2026-10-22T22:00:00+08:00',False),('2026-10-23T01:17:00+08:00',False),('2026-10-23T05:00:00+08:00',False),('2026-10-24T21:30:00+08:00',False),('2026-10-25T21:30:00+08:00',False)]:
    self.assertEqual(t.claim_slot(p,datetime.fromisoformat(date).timestamp()),want)
 def test_pool_bound(self):
  self.assertLessEqual(len(t.META),200)
  self.assertEqual(len(t.META),len(t.POOL))
  self.assertFalse(any(r.get('group')=='inverse' for r in t.POOL))
 def test_tradability_uses_account_rules_when_stream_is_silent(self):
  from server.v2.live_execution import LOCK,PROBE
  with LOCK:
   saved=dict(PROBE);PROBE['rules']={'AVAV':{'tradability':'BUY_SELL'}}
  t.TRADABLE.pop('AVAV',None)
  try:
   self.assertEqual(t.tradability_of('AVAV'),'BUY_SELL')
   t.TRADABLE['AVAV']='NONE'
   self.assertEqual(t.tradability_of('AVAV'),'NONE')
  finally:
   t.TRADABLE.pop('AVAV',None)
   with LOCK:
    PROBE.clear();PROBE.update(saved)
 def test_unknown_symbol(self):
  with self.assertRaises(ValueError):t.validate_signal({'symbol':'FAKE','kind':'WATCH','habit':'PLUNGE_REBOUND','reason':'test'}, {}, 1000)
 def test_disconnected_quote_rejected(self):
  t.CONNECTED=False
  with self.assertRaises(ValueError):t.validate_signal({'symbol':'AAPL','kind':'WATCH','habit':'PLUNGE_REBOUND','reason':'test'}, {'AAPL':{}}, 1000)
