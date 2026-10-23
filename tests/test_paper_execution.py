import unittest,tempfile,json,sys,time
from pathlib import Path
from decimal import Decimal as D
from contextlib import closing
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server.v2 import execution_config as cfg
from server.v2 import paper_execution as p
class Signals:
 def update(self,*args):return 'BREAKOUT'
class PaperTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir='.local');self.old=cfg.ROOT;cfg.ROOT=Path(self.tmp.name)
  self.e=p.PaperEngine();self.e.strategy=Signals();self.now=1792677600000;p.toggle(True,1)
 def tearDown(self):cfg.ROOT=self.old;self.tmp.cleanup()
 def tick(self,prices,now=None,allow=True):
  t=now or self.now
  return self.e.tick({k:{'T':t,'bp':v,'ap':v} for k,v in prices.items()},t,allow,{k:'BUY_SELL' for k in prices})
 def test_three_positions_and_budget(self):
  self.tick({s:100 for s in 'ABCDE'});s=p.status();self.assertEqual(len(s['positions']),3);self.assertEqual(sum(D(x['cost']) for x in s['positions'].values()),D(150))
 def test_duplicate_and_restart(self):
  self.tick({'A':100});self.e=p.PaperEngine();self.e.strategy=Signals();self.tick({'A':100},self.now+1000);self.assertEqual(len(p.status()['positions']),1)
 def test_take_profit_and_stop(self):
  self.tick({'A':100,'B':100});out=self.tick({'A':103,'B':97},self.now+1000)
  self.assertEqual({x['reason'] for x in out},{'TARGET','STOP'});self.assertFalse(p.status()['positions'])
 def test_pause_protects_positions(self):
  self.tick({'A':100});p.toggle(False,2);out=self.tick({'A':97,'B':100},self.now+1000);self.assertEqual(out[0]['reason'],'STOP');self.assertFalse(p.status()['positions'])
 def test_stale_no_entry(self):
  self.e.tick({'A':{'T':self.now-3000,'bp':100,'ap':100}},self.now,True,{'A':'BUY_SELL'});self.assertFalse(p.status()['positions'])
 def test_daily_halt_persists(self):
  self.tick({'A':100,'B':100,'C':100});self.tick({'A':80,'B':80,'C':80},self.now+1000)
  self.assertTrue(p.status()['halted']);self.tick({'D':100},self.now+2000);self.assertFalse(p.status()['positions'])
 def test_closed_schedule(self):
  self.tick({'A':100},allow=False);self.assertFalse(p.status()['positions'])
 def test_toggle_conflict(self):
  with self.assertRaises(ValueError):p.toggle(False,1)
 def test_stale_mark_blocks_new_entries(self):
  self.tick({'A':100});self.tick({'B':100},self.now+3000);self.assertEqual(list(p.status()['positions']),['A']);self.assertFalse(p.status()['valuation_fresh'])
 def test_strategy_warmup_confirmation(self):
  s=p.Strategy()
  for t in range(0,31000,1000):self.assertIsNone(s.update('A',(D(100),D(100)),t))
  self.assertIsNone(s.update('A',(D('100.11'),D('100.12')),31000))
  self.assertIsNone(s.update('A',(D('100.11'),D('100.12')),31200))
  self.assertEqual(s.update('A',(D('100.11'),D('100.12')),31400),'BREAKOUT')
 def test_gap_resets_strategy(self):
  s=p.Strategy()
  for t in range(0,31000,1000):s.update('A',(D(100),D(100)),t)
  self.assertIsNone(s.update('A',(D('100.11'),D('100.12')),35000))
if __name__=='__main__':unittest.main()
