import unittest
from datetime import date
from server.v2.local_model import LocalModel
from server.v2.compact_universe import select,SECTORS


class LocalRefactorTests(unittest.TestCase):
    def test_irregular_quote_window_and_dense_retention(self):
        m=LocalModel()
        for t in range(1000,82000,199):m.observe('X',t,100,100.01)
        now=m.points['X'][-1][0]
        self.assertIsNotNone(m._prior('X',now,60000))
        self.assertTrue(m._etf_supports('X',now))
    def test_bad_quotes_do_not_crash_or_pollute(self):
        m=LocalModel();m.observe('X',1000,'NaN',100)
        self.assertFalse(m.points)
        self.assertEqual(m.scan({'X':{'T':None}}, {},1000,lambda *a:[],lambda *a:None,{}),[])
    def test_all_sectors_disjoint_five_plus_five(self):
        rows=[]
        for sector in SECTORS:
            for n in range(12):rows.append(dict(symbol=sector+str(n),issuer_id=sector+str(n),sector=sector,tradability='BUY_SELL',source='fixture',as_of='2026-10-23',market_cap=1e11-n,volatility_20d=.01+n*.001,dollar_volume_20d=1e8))
        result=select(rows,date(2026,10,23))
        self.assertEqual(len(result['instruments']),123)
        self.assertTrue(all(not any(v.values()) for v in result['gaps'].values()))
    def test_missing_data_reports_gaps(self):
        result=select([],date(2026,10,23))
        self.assertEqual(len(result['instruments']),13)
        self.assertEqual(result['gaps']['utilities']['leaders'],5)
