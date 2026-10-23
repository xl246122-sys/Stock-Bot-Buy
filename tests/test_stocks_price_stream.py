import unittest
from server.v2.stocks_price_stream import parse_prices, StocksPriceStream

class StocksStreamTests(unittest.TestCase):
    def row(self, **changes):
        return {'s':'AAPL','ac':'EQ_AAPL','p':'100','t':100000,'mp':'O',**changes}
    def parse(self,row):
        return parse_prices({'e':'price','rates':[row]},received_at=100001)
    def test_identity_and_currency(self):
        q=self.parse(self.row())['AAPL']
        self.assertEqual(q['currency'],'USD')
        self.assertFalse(q['buy_eligible'])
        self.assertIsNone(q['tradable'])
    def test_invalid_or_stale_never_becomes_quote(self):
        for row in [self.row(t=None),self.row(t=0),self.row(t=100002),self.row(p='NaN'),
                    self.row(ac='AAPLBUSDT'),self.row(p='-1')]:
            self.assertEqual(self.parse(row),{})
    def test_cache_expires(self):
        stream=StocksPriceStream(['AAPL'])
        stream.prices=self.parse(self.row())
        self.assertEqual(stream.snapshot(110001),{})
    def test_pool_limit(self):
        with self.assertRaises(ValueError): StocksPriceStream([str(i) for i in range(101)])
