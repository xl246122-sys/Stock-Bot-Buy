import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from server.v2.us_etf import etf_card


class ETFTests(unittest.TestCase):
    def payload(self):
        day = datetime(2026, 9, 28, 9, 30, tzinfo=ZoneInfo("America/New_York"))
        rows = []
        for offset in range(12):
            start = day + timedelta(days=offset)
            if start.weekday() >= 5:
                continue
            for minute in range(390):
                price = 100 + len(rows)*.001
                rows.append({"t": int((start+timedelta(minutes=minute)).timestamp()*1000),
                             "o": price, "h": price+.1, "l": price-.1, "c": price, "v": 100})
        return {"ticker": "XLK", "adjusted": True, "results": rows}

    def test_sessions_warm_up_without_fabricating_overnight_bars(self):
        payload = self.payload()
        card = etf_card("XLK", payload, now=payload["results"][-1]["t"]+60000)
        self.assertEqual(card["last_observed_trend"], "UP")
        self.assertEqual(card["currency"], "USD")
        self.assertEqual(card["trend"], "UNKNOWN")
        self.assertFalse(card["buy_enabled"])
        self.assertEqual(card["periods"]["15m"]["count"], 260)

    def test_missing_minute_drops_incomplete_bucket(self):
        payload = self.payload()
        payload["results"].pop(100)
        card = etf_card("XLK", payload, now=payload["results"][-1]["t"]+60000)
        self.assertEqual(card["periods"]["15m"]["incomplete_buckets"], 1)
        self.assertEqual(card["periods"]["15m"]["count"], 259)

    def test_identity_and_unfinished_candle(self):
        payload = self.payload()
        now = payload["results"][-1]["t"]+500
        card = etf_card("XLK", payload, now=now)
        self.assertLess(card["latest_bar_close_time"], now)
        payload["ticker"] = "SPY"
        self.assertEqual(etf_card("XLK", payload, now=now)["reason"], "identity_or_adjustment_mismatch")

    def test_duplicate_and_nonfinite_data_rejected(self):
        payload = self.payload()
        payload["results"].append(payload["results"][-1])
        with self.assertRaises(ValueError):
            etf_card("XLK", payload, now=payload["results"][-1]["t"]+60000)
        payload = self.payload()
        payload["results"][0]["c"] = float("nan")
        with self.assertRaises(ValueError):
            etf_card("XLK", payload, now=payload["results"][-1]["t"]+60000)
