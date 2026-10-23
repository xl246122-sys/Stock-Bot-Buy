import json
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import httpx

from server.v2.etf_refresh import ETFCache, ETFRefresher, merge_payload
from server.v2.us_etf import observation_status
from server.v2.sector_api import current_research


def payload(symbol="XLK", times=(60000, 120000), price=100):
    return {"ticker": symbol, "adjusted": True, "results": [
        {"t": t, "o": price, "h": price+1, "l": price-1, "c": price, "v": 10} for t in times]}


class RefreshTests(unittest.TestCase):
    def test_authoritative_overlap_removes_absent_rows_and_unfinished_rows(self):
        merged = merge_payload("XLK", payload(times=(60000, 120000, 180000)),
                               payload(times=(180000, 240000)), from_ms=120000, now=250000)
        self.assertEqual([r["t"] for r in merged["results"]], [60000, 180000])

    def test_price_revision_requires_full_rebuild(self):
        with self.assertRaisesRegex(ValueError, "full_refresh_required"):
            merge_payload("XLK", payload(), payload(price=50), from_ms=60000, now=200000)
        rebuilt = merge_payload("XLK", None, payload(price=50), from_ms=60000, now=200000)
        self.assertEqual(rebuilt["results"][0]["c"], 50)

    def test_wrong_identity_empty_and_out_of_window_fail(self):
        for fresh in (payload("SPY"), payload(times=()), payload(times=(0,))):
            with self.assertRaises(ValueError):
                merge_payload("XLK", None, fresh, from_ms=60000, now=200000)

    def test_lease_and_pacing_survive_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"cache.db"
            first, second = ETFCache(path), ETFCache(path)
            first.acquire("a", 100)
            with self.assertRaisesRegex(ValueError, "already_running"):
                second.acquire("b", 101)
            self.assertEqual(first.reserve_request("a", 100), 0)
            first.release("a")
            second.acquire("b", 101)
            self.assertAlmostEqual(second.reserve_request("b", 101), 12.1)

    def test_new_fetch_does_not_make_yesterdays_bar_current(self):
        now = int(datetime(2026,10,20,15,tzinfo=timezone.utc).timestamp()*1000)
        card = {"latest_bar_close_time": now-86400000, "last_successful_fetch_at": now,
                "collection_status": "ok", "last_observed_trend": "UP"}
        result = observation_status(card, now=now)
        self.assertEqual(result["observation_state"], "regular_window_bar_not_fresh")
        self.assertFalse(result["buy_enabled"])
        card["latest_bar_close_time"] = now-30000
        self.assertEqual(observation_status(card, now=now)["observation_state"], "recent_bar_observed")
        self.assertEqual(observation_status(card, now=now+200000)["observation_state"], "collector_not_fresh")

    def test_429_stops_remaining_requests_and_preserves_watchlist(self):
        calls = []
        def handle(request):
            calls.append(request)
            return httpx.Response(429, json={"error": "limit"})
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            original = root/"us-equity-research.json"
            original.write_text(json.dumps({"as_of": 1, "watchlist": {"selected_count":80},
                                            "us_etf_trends":[]}))
            target = root/"us-etf-refresh.json"
            with httpx.Client(transport=httpx.MockTransport(handle)) as client:
                worker = ETFRefresher(client, ETFCache(root/"cache.db"), target)
                with patch("server.v2.etf_refresh.time.sleep"):
                    report = worker.run()
            self.assertEqual(len(calls), 1)
            self.assertEqual(len(report["failures"]), 8)
            self.assertEqual(len(report["us_etf_trends"]), 8)
            self.assertTrue(report["completed"])
            reopened = ETFCache(root/"cache.db")
            reopened.acquire("restart", time.time())
            self.assertGreater(reopened.reserve_request("restart", time.time()), 59)
            reopened.release("restart")
            view = current_research(original, target)
            self.assertEqual(view["watchlist"]["selected_count"], 80)
            self.assertTrue(view["watchlist_needs_refresh"])

    def test_incremental_resume_and_one_failure_does_not_reset_other_etfs(self):
        calls, fail = [], False
        stamp = int(time.time()*1000)//60000*60000-60000
        def handle(request):
            parts = request.url.path.split("/")
            etf = parts[4]
            calls.append((etf, int(parts[-2])))
            if fail and etf == "XLK":
                return httpx.Response(503)
            return httpx.Response(200, json=payload(etf, times=(stamp,)))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/"cache.db"
            target = Path(folder)/"refresh.json"
            with httpx.Client(transport=httpx.MockTransport(handle)) as client:
                with patch("server.v2.etf_refresh.time.sleep"), patch.object(ETFCache, "reserve_request", return_value=0):
                    first = ETFRefresher(client, ETFCache(path), target).run()
                    old = ETFCache(path).load("XLK")
                    fail = True
                    second = ETFRefresher(client, ETFCache(path), target).run()
            self.assertEqual(first["failures"], {})
            self.assertEqual(set(second["failures"]), {"XLK"})
            self.assertEqual(ETFCache(path).load("XLK")[1], old[1])
            self.assertGreater(calls[8][1], calls[0][1])  # Second round requests overlap only.
            self.assertEqual(sum(c["collection_status"]=="ok" for c in second["us_etf_trends"]), 7)
