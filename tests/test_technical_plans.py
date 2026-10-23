import tempfile
import unittest
from pathlib import Path
from pydantic import ValidationError
from server.v2.technical_plans import Plan,Store,fresh

def plan(**kw):
    return Plan(**dict(symbol='AAPL',trigger='ABOVE',trigger_price=100.,max_buy=100.1,
        invalidate_below=99.9,stop=99.6,target=101.5,ttl_seconds=30,holding_seconds=3600,reason='test',**kw))

class PlanTests(unittest.TestCase):
    def test_expiry_anchored_to_request(self):
        with tempfile.TemporaryDirectory() as d:
            s=Store(Path(d)/'p.db');s.replace([plan()],1000,31001)
            self.assertEqual(s.eligible({'AAPL':{'T':31001,'bp':100,'ap':100.05}},31001),[])
    def test_once_only_and_requote(self):
        with tempfile.TemporaryDirectory() as d:
            s=Store(Path(d)/'p.db');s.replace([plan()],1000,2000)
            q={'AAPL':{'T':2000,'bp':100,'ap':100.05}}
            key,_=s.eligible(q,2000)[0]
            self.assertTrue(s.claim(key,2000));self.assertFalse(s.claim(key,2000))
    def test_no_opportunity_replaces_old(self):
        with tempfile.TemporaryDirectory() as d:
            s=Store(Path(d)/'p.db');s.replace([plan()],1000,2000);s.replace([],3000,3000)
            self.assertEqual(s.eligible({'AAPL':{'T':3000,'bp':100,'ap':100.05}},3000),[])
    def test_rejects_stale_and_nonfinite(self):
        self.assertFalse(fresh({'T':1000,'bp':100,'ap':100},4000))
        self.assertFalse(fresh({'T':1000,'bp':100,'ap':'nan'},1000))
    def test_no_self_reported_confidence(self):
        with self.assertRaises(ValidationError):plan(confidence=.85)
