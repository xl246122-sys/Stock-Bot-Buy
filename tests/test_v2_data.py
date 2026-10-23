import asyncio
import json
import sqlite3
import tempfile
import unittest
from dataclasses import replace
from contextlib import closing
from pathlib import Path

import httpx

from server.v2.binance_provider import BinanceProvider, ProviderError
from server.v2.market_data import (
    Bar, MINUTE, aggregate, ema, features, freeze_snapshot, from_kline, relative_strength,
    rsi, session_metrics,
)
from server.v2.settings import Settings
from server.v2.snapshot_store import SnapshotStore
from tools.baseline import create_baseline
from tools.check_integrations import check_deepseek, load_deepseek_key


def bar(index, close=100.0, volume=10.0):
    return Bar(
        symbol="NVDABUSDT", open_time=index * MINUTE, close_time=(index + 1) * MINUTE - 1,
        open=close, high=close + 1, low=close - 1, close=close,
        volume=volume, quote_volume=volume * close, received_at=(index + 1) * MINUTE,
    )


class MarketDataTests(unittest.TestCase):
    def test_unfinished_invalid_and_nonfinite_bars_rejected(self):
        original = bar(0)
        for fields in (
            {"received_at": original.close_time}, {"close": float("nan")},
            {"volume": -1}, {"high": 90}, {"low": 110}, {"feed": "SIP"},
            {"currency": "USD"}, {"open_time": 1}, {"close_time": 60_000},
            {"volume": 0, "quote_volume": 1},
        ):
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                replace(original, **fields)

    def test_binance_column_mapping_keeps_quote_volume(self):
        parsed = from_kline("NVDABUSDT",
                           [0, "100", "102", "99", "101", "12", 59999, "1212", 5],
                           60000)
        self.assertEqual(parsed.quote_volume, 1212)
        self.assertEqual(parsed.close, 101)

    def test_aggregate_ohlcv_and_skip_partial(self):
        source = [bar(i, 100 + i) for i in range(7)]
        result = aggregate(source, 5)
        self.assertEqual(len(result), 1)
        self.assertEqual((result[0].open, result[0].high, result[0].low,
                          result[0].close, result[0].volume), (100, 105, 99, 104, 50))

    def test_gap_does_not_create_synthetic_bar(self):
        self.assertEqual(aggregate([bar(i) for i in (0, 1, 3, 4)], 5), [])

    def test_duplicate_out_of_order_and_mixed_symbol_rejected(self):
        for source in ([bar(0), bar(0)], [bar(1), bar(0)],
                       [bar(0), replace(bar(1), symbol="AAPLBUSDT")]):
            with self.assertRaises(ValueError):
                aggregate(source, 5)

    def test_indicator_reference_cases(self):
        self.assertEqual(ema([1, 2, 3, 4, 5], 3), [2, 3, 4])
        self.assertEqual(rsi(list(range(1, 20)), 14), 100)
        self.assertEqual(rsi(list(range(20, 0, -1)), 14), 0)
        self.assertEqual(rsi([100] * 20, 14), 50)
        result = features([bar(i) for i in range(200)])
        self.assertEqual(result["ema9"], 100)
        self.assertEqual(result["macd_histogram"], 0)
        self.assertEqual(result["atr14"], 2)

    def test_wilder_rsi_reference(self):
        prices = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
                  45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28]
        self.assertAlmostEqual(rsi(prices, 14), 70.464135, places=5)

    def test_gap_and_warmup_are_explicit(self):
        self.assertEqual(features([bar(0)])["status"], "unknown")
        self.assertEqual(features([bar(i) for i in range(201) if i != 50])["reason"],
                         "missing_bars")

    def test_vwap_uses_quote_volume_not_ohlc_average(self):
        source = [replace(bar(0), quote_volume=1005), bar(1, close=102)]
        result = session_metrics(source, 2 * MINUTE)
        self.assertEqual(result["vwap"], 101.25)
        self.assertIsNone(result["rvol"])
        self.assertEqual(result["historical_days"], 0)

    def test_rvol_requires_twenty_aligned_utc_windows(self):
        source = [bar(day * 1440 + minute, volume=20 if day == 20 else 10)
                  for day in range(21) for minute in range(2)]
        result = session_metrics(source, (20 * 1440 + 2) * MINUTE)
        self.assertEqual(result["rvol"], 2)
        self.assertEqual(result["historical_days"], 20)
        self.assertIsNone(session_metrics(source[1:], (20 * 1440 + 2) * MINUTE)["rvol"])

    def test_vwap_missing_midnight_history_is_unknown(self):
        result = session_metrics([bar(1)], 2 * MINUTE)
        self.assertIsNone(result["vwap"])
        self.assertEqual(result["vwap_reason"], "incomplete_current_day")

    def test_snapshot_warmup_and_staleness(self):
        snapshot = freeze_snapshot("NVDABUSDT", [bar(0)], 5 * MINUTE)
        self.assertFalse(snapshot["data_eligible"])
        self.assertIn("stale_or_missing_completed_bar", snapshot["blocking_reasons"])
        self.assertIn("15m:warmup_requires_200_complete_bars", snapshot["blocking_reasons"])

    def test_no_lookahead_in_frozen_snapshot(self):
        with self.assertRaises(ValueError):
            freeze_snapshot("NVDABUSDT", [bar(1)], MINUTE)
        with self.assertRaises(ValueError):
            freeze_snapshot("NVDABUSDT", [replace(bar(0), received_at=3 * MINUTE)], 2 * MINUTE)

    def test_revision_ignores_receipt_but_tracks_price_changes(self):
        original = bar(0)
        self.assertEqual(original.revision, replace(original, received_at=120000).revision)
        self.assertNotEqual(original.revision, replace(original, close=100.5).revision)

    def test_relative_strength_requires_exact_alignment(self):
        source = [bar(0, close=100), bar(1, close=110)]
        reference = [replace(bar(0, close=100), symbol="QQQBUSDT"),
                     replace(bar(1, close=105), symbol="QQQBUSDT")]
        self.assertAlmostEqual(relative_strength(source, reference)["value"], .05)
        self.assertIsNone(relative_strength(source, reference[1:])["value"])

    def test_revisions_preserve_original_bars(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.db"
            store = SnapshotStore(path)
            store.save_bars([bar(0)])
            store.save_bars([replace(bar(0), close=100.5)])
            store.save_bars([bar(0)])
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM bar_versions").fetchone()[0], 2)

    def test_persisted_snapshot_is_immutable_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.db"
            snapshot = freeze_snapshot("NVDABUSDT", [bar(0)], MINUTE)
            store = SnapshotStore(path)
            self.assertTrue(store.save(snapshot))
            self.assertFalse(store.save(snapshot))
            changed = {**snapshot, "currency": "USD"}
            with self.assertRaises(ValueError):
                store.save(changed)
            self.assertEqual(SnapshotStore(path).get(snapshot["snapshot_id"]), snapshot)


class ProviderTests(unittest.TestCase):
    def test_universe_excludes_wrong_asset_identity(self):
        def handler(request):
            return httpx.Response(200, json={"symbols": [
                {"symbol": "NVDABUSDT", "baseAsset": "NVDA", "quoteAsset": "USDT",
                 "status": "TRADING"},
                {"symbol": "AAPLBUSDT", "baseAsset": "AAPLB", "quoteAsset": "USDT",
                 "status": "TRADING"},
                {"symbol": "QQQBUSDT", "baseAsset": "QQQB", "quoteAsset": "USDT",
                 "status": "BREAK"},
            ]})
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as client:
                return await BinanceProvider(client).universe()
        result = asyncio.run(run())
        self.assertEqual([s["symbol"] for s in result["available"]], ["AAPLBUSDT"])
        self.assertFalse(result["target_200_verified"])

    def test_rate_limit_has_no_retry_storm(self):
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(429)
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as client:
                await BinanceProvider(client).universe()
        with self.assertRaises(ProviderError):
            asyncio.run(run())
        self.assertEqual(len(calls), 1)

    def test_deepseek_redirect_does_not_leak_key(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "key.txt"
            path.write_text("sk-" + "a" * 24)
            calls = []
            def handler(request):
                calls.append(str(request.url))
                return httpx.Response(302, headers={"Location": "https://example.com"})
            with httpx.Client(transport=httpx.MockTransport(handler),
                              follow_redirects=False, trust_env=False) as client:
                result = check_deepseek(client, path)
            self.assertEqual(calls, ["https://api.deepseek.com/models"])
            self.assertEqual(result["http_status"], 302)
            self.assertNotIn("sk-", json.dumps(result))

    def test_multiple_keys_are_ambiguous(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "key.txt"
            path.write_text("sk-" + "a" * 24 + "\nsk-" + "b" * 24)
            with self.assertRaises(ValueError):
                load_deepseek_key(path)


class ConfigurationTests(unittest.TestCase):
    def test_no_budget_does_not_enable_buy(self):
        config = Settings(ai_model="deepseek-flash", mode="shadow")
        self.assertFalse(config.readiness()["buy_enabled"])
        self.assertIn("budget_not_configured", config.readiness()["reasons"])

    def test_invalid_frequency_and_budget_rejected(self):
        for fields in ({"interval_minutes": 2}, {"monthly_budget": float("inf")},
                       {"mode": "production"}, {"monthly_budget": -1}):
            with self.assertRaises(ValueError):
                Settings(**fields)

    def test_key_path_excluded_from_serialization(self):
        config = Settings(ai_key_file=Path("private/key.txt"))
        self.assertNotIn("ai_key_file", config.model_dump())
        self.assertNotIn("private/key.txt", repr(config))

    def test_source_archive_excludes_secret_content(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "src").mkdir()
            (root / "server").mkdir()
            (root / "src" / "safe.ts").write_text("export const value = 1;")
            (root / "src" / "unsafe.ts").write_text('const password = "not-a-real-password";')
            (root / ".env").write_text("PASSWORD=private")
            report = create_baseline(root, root / "output")
            self.assertEqual([p["path"] for p in report["files"]], ["src/safe.ts"])
            self.assertEqual(report["excluded_for_review"][0]["path"], "src/unsafe.ts")


if __name__ == "__main__":
    unittest.main()
