import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from server.v2.comparison_shadow import Comparison,GROUPS


class ShadowTests(unittest.TestCase):
    def test_same_cost_and_capacity_without_broker(self):
        with tempfile.TemporaryDirectory() as d, patch('server.v2.comparison_shadow.entries_allowed',return_value=True), patch('server.v2.comparison_shadow.session_bounds',return_value=(0,10000000)):
            paper=Comparison(Path(d)/'shadow.db')
            limits={'order_cap_usd':'50','budget_usd':'300','max_open_trades':3}
            for group in GROUPS:
                for i in range(4):paper.enter(group,str(i),'S'+str(i),{'T':1000,'bp':100,'ap':100},1000,limits)
            with closing(paper.db()) as c:self.assertEqual(c.execute("SELECT count(*) FROM shadow_positions WHERE state='open'").fetchone()[0],9)
            paper.mark({'S'+str(i):{'T':2000,'bp':102,'ap':102} for i in range(4)},2000)
            summary=paper.summary()['groups']
            self.assertTrue(all(v['closed']==3 for v in summary.values()))
            self.assertEqual(len({v['net_usd'] for v in summary.values()}),1)
