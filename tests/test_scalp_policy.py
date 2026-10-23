import unittest
from decimal import Decimal as D
from server.v2.scalp_policy import opening_window, net_stop, wilson_lower


class ScalpPolicyTests(unittest.TestCase):
    def test_exchange_calendar_holiday_and_dst(self):
        from datetime import datetime
        from server.v2.scalp_policy import entries_allowed
        def at(s):return int(datetime.fromisoformat(s).timestamp()*1000)
        self.assertTrue(entries_allowed(at('2026-10-23T13:30:00+00:00')))
        self.assertFalse(entries_allowed(at('2026-10-23T14:00:00+00:00')))
        self.assertFalse(entries_allowed(at('2026-11-26T14:30:00+00:00')))
        self.assertTrue(entries_allowed(at('2026-11-02T14:30:00+00:00')))

    def test_opening_boundary_and_missing_session(self):
        self.assertTrue(opening_window(1000, 1000, 20000000))
        self.assertFalse(opening_window(1801000, 1000, 20000000))
        self.assertFalse(opening_window(1000, None, None))

    def test_stop_includes_entry_exit_cost_and_slippage(self):
        stop = net_stop('100', '.1', '1')
        proceeds = stop * D('.997')
        self.assertAlmostEqual((proceeds-D('100.1'))/D('100.1'), D('-.01'))
        self.assertGreater(stop, D('99'))

    def test_eighty_percent_observed_is_not_eighty_percent_confidence(self):
        self.assertLess(wilson_lower(80, 100), .8)
        self.assertEqual(wilson_lower(0, 0), 0)
