import json
import tempfile
import time
import unittest
from datetime import date
from pathlib import Path

from server.v2.sector_universe import SECTORS, realized_volatility, select_universe, sector_trends
from server.v2.sector_api import current_status, current_references
from server.v2.sector_universe import reference_trends
from server.v2.ai_store import AIStore
from server.v2.decisions import RiskPolicy
from server.v2.orchestrator import ShadowOrchestrator


def record(symbol, cap, vol=.1):
    return {
        "underlying_symbol": symbol, "issuer_id": symbol, "sector_id": "technology",
        "market_cap_usd": cap, "market_cap_basis": "underlying_company_usd",
        "metadata_as_of": "2026-10-20", "metadata_source": "unit-test-only",
        "instrument_symbol": symbol + "BUSDT",
        "volatility_20d": vol, "volatility_as_of": "2026-10-19",
        "volatility_source": "unit-test-only",
        "volatility_basis": "binance_spot_UTC_daily_log_returns_20",
    }


class SectorTests(unittest.TestCase):
    def test_reference_trend_is_separate_from_sector_coverage(self):
        now = int(time.time() * 1000)
        snapshot = {
            "symbol": "SPYBUSDT", "snapshot_id": "reference-test",
            "feed": "binance_spot_bstocks", "as_of": now,
            "periods": {p: {"status": "ready", "ema9": 101., "ema20": 100.,
                           "ema20_change_1bar": .1,
                           "recent_bars": [{"close": 102., "close_time": now - 2000}]}
                        for p in ("1m", "5m", "15m")},
        }
        snapshots = {"SPYBUSDT": snapshot}
        cards = reference_trends(snapshots, now=now)
        self.assertEqual(cards[0]["trend"], "UP")
        self.assertFalse(cards[0]["replaces_sector_etf"])
        self.assertEqual(cards[1]["trend"], "UNKNOWN")
        self.assertTrue(all(c["trend"] == "UNKNOWN" for c in sector_trends(snapshots, now=now)))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "reference.json"
            path.write_text(json.dumps({"as_of": now, "reference_trends": cards}), encoding="utf-8")
            self.assertEqual(current_references(path)[0]["trend"], "UP")
            self.assertEqual(current_references(path)[1]["trend"], "UNKNOWN")
            path.write_text(json.dumps({"as_of": now - 100000, "reference_trends": cards}), encoding="utf-8")
            self.assertTrue(all(c["trend"] == "UNKNOWN" for c in current_references(path)))

    def test_reference_api_missing_or_corrupt_state(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "reference.json"
            self.assertEqual(len(current_references(path)), 3)
            path.write_text("{", encoding="utf-8")
            self.assertTrue(all(c["trend"] == "UNKNOWN" for c in current_references(path)))

    def test_target_is_80_stocks_plus_8_etfs(self):
        result = select_universe([], as_of=date(2026, 10, 20))
        self.assertEqual(result["total_target"], 88)
        self.assertEqual(len(result["sectors"]), 8)
        self.assertEqual(result["selected_count"], 0)
        self.assertTrue(all(s["missing_mega"] == s["missing_mid"] == 5 for s in result["sectors"]))

    def test_five_mega_by_cap_and_five_mid_by_volatility(self):
        rows = [record(f"G{i}", 200e9 + i * 1e9) for i in range(7)]
        rows += [record(f"M{i}", 6e9, .01 * i) for i in range(7)]
        result = select_universe(rows, as_of=date(2026, 10, 20))
        sector = result["sectors"][0]
        self.assertEqual([r["underlying_symbol"] for r in sector["mega"]], ["G6", "G5", "G4", "G3", "G2"])
        self.assertEqual([r["underlying_symbol"] for r in sector["mid_high_volatility"]], ["M6", "M5", "M4", "M3", "M2"])
        self.assertEqual(result["selected_count"], 10)

    def test_large_cap_cannot_fill_mid_cap_shortage(self):
        result = select_universe([record("LARGE", 100e9)], as_of=date(2026, 10, 20))
        self.assertEqual(result["selected_count"], 1)
        self.assertEqual(result["sectors"][0]["missing_mid"], 5)

    def test_confirmed_mid_cap_boundaries_are_inclusive_and_not_leaders(self):
        result = select_universe([record("LOW", 2e9), record("HIGH", 20e9)],
                                 as_of=date(2026, 10, 20))
        group = result["sectors"][0]
        self.assertEqual(len(group["mid_high_volatility"]), 2)
        self.assertEqual(len(group["mega"]), 0)

    def test_stale_future_token_cap_and_missing_volatility_rejected(self):
        rows = [
            {**record("OLD", 300e9), "metadata_as_of": "2026-01-01"},
            {**record("FUTURE", 300e9), "metadata_as_of": "2026-10-21"},
            {**record("TOKEN", 300e9), "market_cap_basis": "token_market_cap"},
            {**record("NOVOL", 6e9), "volatility_20d": None},
        ]
        result = select_universe(rows, as_of=date(2026, 10, 20))
        self.assertEqual(result["selected_count"], 0)
        self.assertEqual(len(result["rejected"]), 4)

    def test_share_classes_do_not_fill_two_slots(self):
        rows = [record("CLASSA", 300e9), {**record("CLASSB", 300e9), "issuer_id": "CLASSA"}]
        self.assertEqual(select_universe(rows, as_of=date(2026, 10, 20))["selected_count"], 1)

    def test_volatility_requires_21_valid_daily_closes(self):
        self.assertIsNone(realized_volatility([100.] * 20))
        self.assertEqual(realized_volatility([100.] * 21), 0)
        self.assertIsNone(realized_volatility([100.] * 20 + [float("nan")]))
        self.assertGreater(realized_volatility([100., 110.] * 11), 0)

    def test_missing_etf_is_unknown_not_spy_proxy(self):
        cards = sector_trends({"SPYBUSDT": {}}, now=int(time.time() * 1000))
        self.assertEqual(len(cards), 8)
        self.assertTrue(all(c["trend"] == "UNKNOWN" for c in cards))

    def test_three_period_trend_and_stale_guard(self):
        now = int(time.time() * 1000)
        snapshot = {
            "symbol": "XLKBUSDT", "snapshot_id": "test-etf", "feed": "binance_spot_bstocks",
            "as_of": now - 1000, "periods": {
                p: {"status": "ready", "ema9": 101., "ema20": 100.,
                    "ema20_change_1bar": .1, "recent_bars": [{"close": 102., "close_time": now - 2000}]}
                for p in ("1m", "5m", "15m")
            },
        }
        self.assertEqual(sector_trends({"XLKBUSDT": snapshot}, now=now)[0]["trend"], "UP")
        snapshot["periods"]["5m"]["ema20_change_1bar"] = -.1
        self.assertEqual(sector_trends({"XLKBUSDT": snapshot}, now=now)[0]["trend"], "MIXED")
        self.assertEqual(sector_trends({"XLKBUSDT": snapshot}, now=now + 100000)[0]["trend"], "UNKNOWN")

    def test_status_api_fails_closed_for_missing_and_stale_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "status.json"
            self.assertEqual(current_status(path)["trend_status"], "data_not_connected")
            path.write_text(json.dumps({"as_of": 1, "sector_trends": [{"trend": "UP"}]}))
            result = current_status(path)
            self.assertFalse(result["buy_enabled"])
            self.assertTrue(all(s["trend"] == "UNKNOWN" for s in result["sector_trends"]))


class SectorGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_sector_prevents_model_calls(self):
        class Gateway:
            async def decide(self, **kwargs):
                raise AssertionError("must not request AI with missing sector ETF")
        async def no_quote(_):
            return None
        with tempfile.TemporaryDirectory() as folder:
            runner = ShadowOrchestrator(
                Gateway(), AIStore(Path(folder) / "ai.db"), no_quote,
                policy=RiskPolicy(min_risk_reward=1.5, round_trip_cost_bps=20.,
                                  max_holding_minutes=30, min_price=10.))
            result = await runner.run({
                "cycle_id": "sector-gate", "universe": {
                    "selection": {}, "requested_count": 88, "target_stock_count": 80,
                    "available": [{"symbol": "NVDABUSDT", "role": "candidate", "sector_id": "technology"}],
                    "unavailable": [],
                }, "snapshots": {"NVDABUSDT": {"data_eligible": True, "snapshot_id": "test"}},
                "sector_trends": [],
            })
            self.assertEqual(result["eligible_count"], 0)
            self.assertEqual(result["rejected"]["NVDABUSDT"], ["sector_etf_unavailable_or_stale"])


if __name__ == "__main__":
    unittest.main()
