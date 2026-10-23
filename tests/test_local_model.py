import unittest
from decimal import Decimal as D
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.local_model import LocalModel

def history(high='99', volume='300'):
    rows = [{'h': high, 'c': '100', 'v': '100'} for _ in range(15)]
    rows.append({'h': high, 'c': '100', 'v': volume})
    return rows

def feed(model, symbol, last, start_bid='100'):
    price = D(start_bid)
    for timestamp in range(0, 62000, 2000):
        model.observe(symbol, timestamp, price, price * D('1.0005'))
    last = D(last)
    model.observe(symbol, 62000, last, last * D('1.0005'))

class LocalModelTests(unittest.TestCase):
    def setUp(self):
        self.model = LocalModel()
        feed(self.model, 'XLI', '50', start_bid='50')

    def test_chase_buys_the_first_break(self):
        feed(self.model, 'AVAV', '100.20')
        decision = self.model.decide('AVAV', 62000, history(), 'XLI', None)
        self.assertEqual(decision['setup'], 'CHASE')
        self.assertEqual(decision['invalidation'], D('100'))

    def test_chase_rejects_a_move_that_is_already_extended(self):
        feed(self.model, 'AVAV', '100.50')
        self.assertIsNone(self.model.decide('AVAV', 62000, history(), 'XLI', None))

    def test_risk_warning_blocks_chase_only(self):
        feed(self.model, 'AVAV', '100.20')
        blocked = {'kind': 'RISK', 'habit': 'OVERBOUGHT_PEAK', 'until': 999999}
        self.assertIsNone(self.model.decide('AVAV', 62000, history(), 'XLI', blocked))

    def test_rebound_buys_the_first_lift_from_a_deep_pullback(self):
        feed(self.model, 'AVAV', '100.30')
        decision = self.model.decide('AVAV', 62000, history(high='110'), 'XLI', {'kind': 'RISK', 'habit': 'OVERBOUGHT_PEAK', 'until': 999999})
        self.assertEqual(decision['setup'], 'REBOUND')
        self.assertEqual(decision['invalidation'], D('100'))

    def test_wide_spread_is_rejected(self):
        for timestamp in range(0, 62000, 2000):
            self.model.observe('AVAV', timestamp, D('100'), D('100.05'))
        self.model.observe('AVAV', 62000, D('100.20'), D('100.40'))
        self.assertIsNone(self.model.decide('AVAV', 62000, history(), 'XLI', None))

if __name__ == '__main__':
    unittest.main()
