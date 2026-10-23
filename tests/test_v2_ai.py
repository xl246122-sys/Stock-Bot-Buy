import asyncio
import copy
import json
import tempfile
import time
import unittest
from pathlib import Path
from uuid import uuid4

import httpx

from server.v2.ai_gateway import DeepSeekGateway, PriceBudget
from server.v2.ai_store import AIStore
from server.v2.decisions import (
    Decision, Quote, RiskPolicy, compact_snapshot, strict_json, validate_decision,
)
from server.v2.orchestrator import ShadowOrchestrator
from server.v2.quotes import QuoteCache
from server.v2.collector import PoolCollector
from server.v2.market_data import Bar, MINUTE
from server.v2.snapshot_store import SnapshotStore


def snapshot(symbol="NVDABUSDT"):
    now = int(time.time() * 1000)
    return {
        "symbol": symbol, "snapshot_id": "snapshot-" + symbol,
        "as_of": now - 1000, "data_eligible": True, "feed": "binance_spot_bstocks",
        "currency": "USDT", "periods": {
            "1m": {"status": "ready", "rsi6": 55.0,
                   "recent_bars": [{"open_time": now - 61000, "close_time": now - 1001,
                                    "open": 100.0, "high": 101.0, "low": 99.0,
                                    "close": 100.0, "volume": 20.0}]}},
        "session_metrics": {"vwap": 100.0, "rvol": 1.5},
    }


def decision(s, buy=False):
    return {
        "symbol": s["symbol"], "decision": "BUY" if buy else "WAIT",
        "technical_reason": "Technical evidence supports assessment",
        "counter_evidence": "Momentum may fail",
        "evidence_ids": [s["snapshot_id"] + ":1m:rsi6"],
        "plan": {"entry_low": 100.0, "entry_high": 101.0, "stop_loss": 98.0,
                 "take_profits": [108.0], "holding_minutes": 60,
                 "invalidation_conditions": ["support fails"]} if buy else None,
    }


def policy():
    return RiskPolicy(min_risk_reward=1.5, round_trip_cost_bps=20.0,
                      max_holding_minutes=30, min_price=10.0)


def quote(symbol="NVDABUSDT"):
    now = int(time.time() * 1000)
    return Quote(symbol=symbol, bid=100.4, ask=100.5, event_time=now - 100, received_at=now)


def collection(symbols=("NVDABUSDT", "AAPLBUSDT")):
    return {
        "cycle_id": str(uuid4()), "universe": {
            "available": [{"symbol": s, "role": "candidate"} for s in symbols],
            "unavailable": [{"symbol": "XLKBUSDT", "reason": "not_listed"}],
            "requested_count": len(symbols) + 1,
        }, "snapshots": {s: snapshot(s) for s in symbols},
    }


class ValidationTests(unittest.TestCase):
    def validate(self, row=None, s=None, q=None, **overrides):
        s = s or snapshot()
        args = dict(snapshot=s, evidence=set(compact_snapshot(s)["evidence"]),
                    quote=q or quote(), now=int(time.time() * 1000),
                    deadline=int(time.time() * 1000) + 45000, policy=policy())
        args.update(overrides)
        return validate_decision(row or decision(s, True), **args)

    def test_valid_buy_uses_worst_entry_and_costs(self):
        s = snapshot()
        result = self.validate(s=s)
        self.assertAlmostEqual(result.net_risk_reward, (108 - 101 - .202) / (101 - 98 + .202))
        self.assertEqual(result.valid_until, s["as_of"] + 30 * 60_000)
        self.assertEqual(result.decision.plan.holding_minutes, 60)

    def test_wait_has_no_plan(self):
        s = snapshot()
        self.assertIsNone(self.validate(decision(s), s=s).valid_until)
        bad = decision(s)
        bad["plan"] = decision(s, True)["plan"]
        with self.assertRaises(ValueError):
            Decision.model_validate(bad)

    def test_invalid_prices_rejected_without_repair(self):
        s = snapshot()
        for field, value in (
            ("stop_loss", 105.0), ("entry_low", 102.0), ("entry_high", float("inf")),
            ("entry_low", "100"), ("take_profits", [107.0, 106.0]),
            ("take_profits", []), ("holding_minutes", True),
        ):
            row = decision(s, True)
            row["plan"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.validate(row, s=s)

    def test_fake_evidence_wrong_symbol_and_unknown_fields(self):
        s = snapshot()
        for fields in ({"evidence_ids": ["fake"]}, {"symbol": "TSLABUSDT"},
                       {"signal_id": "model-created-id"}):
            with self.assertRaises(ValueError):
                self.validate({**decision(s, True), **fields}, s=s)

    def test_execution_price_stale_halted_future_and_missing_quote(self):
        s = snapshot()
        for q in (
            quote().model_copy(update={"ask": 110.0}),
            quote().model_copy(update={"event_time": 0}),
            quote().model_copy(update={"trading": False}),
            quote().model_copy(update={"event_time": int(time.time() * 1000) + 1000}),
        ):
            with self.assertRaises(ValueError):
                self.validate(s=s, q=q)
        with self.assertRaises(ValueError):
            self.validate(s=s, quote=None)

    def test_stale_completed_bar_rejected_even_if_snapshot_is_fresh(self):
        s = snapshot()
        s["periods"]["1m"]["recent_bars"][-1]["close_time"] -= 100000
        with self.assertRaisesRegex(ValueError, "completed_bar"):
            self.validate(s=s)

    def test_deadline_and_bad_data_rejected(self):
        with self.assertRaises(ValueError):
            self.validate(deadline=0)
        s = snapshot()
        s["data_eligible"] = False
        with self.assertRaises(ValueError):
            self.validate(s=s)

    def test_legal_json_is_not_sufficient(self):
        for text in ('{"decisions":[],"decisions":[]}', '{"decisions":NaN}',
                     '{"decisions":{}}', '```json\n{"decisions":[]}\n```'):
            with self.assertRaises(ValueError):
                strict_json(text)
        self.assertEqual(strict_json('{"decisions":[]}'), {"decisions": []})


class BudgetTests(unittest.TestCase):
    def test_durable_reservation_and_settlement(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "ai.db"
            store = AIStore(path)
            args = dict(daily_limit=100, monthly_limit=200, currency="CNY", now=1792490000000)
            identifier = store.reserve(80, **args)
            with self.assertRaisesRegex(ValueError, "exhausted"):
                AIStore(path).reserve(30, **args)
            store.settle(identifier, 20)
            store.settle(identifier, 20)
            store.reserve(80, **args)
            with self.assertRaisesRegex(ValueError, "conflict"):
                store.settle(identifier, 21)

    def test_budget_currency_cannot_reset_spending(self):
        with tempfile.TemporaryDirectory() as folder:
            store = AIStore(Path(folder) / "ai.db")
            args = dict(daily_limit=100, monthly_limit=200, now=1792490000000)
            store.reserve(10, currency="CNY", **args)
            with self.assertRaisesRegex(ValueError, "currency_change"):
                store.reserve(10, currency="USD", **args)

    def test_unknown_usage_carries_reservation_across_day(self):
        with tempfile.TemporaryDirectory() as folder:
            store = AIStore(Path(folder) / "ai.db")
            store.reserve(80, daily_limit=100, monthly_limit=100, currency="CNY", now=1792490000000)
            with self.assertRaises(ValueError):
                store.reserve(30, daily_limit=100, monthly_limit=100, currency="CNY",
                              now=1792490000000 + 40 * 86400000)

    def test_prices_are_required(self):
        with self.assertRaises(ValueError):
            PriceBudget("CNY", 0, 1, 1, 1)


class FakeGateway:
    def __init__(self, mode="valid"):
        self.mode = mode
        self.active = 0
        self.peak = 0

    async def decide(self, *, cycle_id, batch, deadline):
        self.active += 1
        self.peak = max(self.peak, self.active)
        try:
            await asyncio.sleep(.15 if self.mode == "timeout" else .005)
            rows = [{
                "symbol": item["symbol"], "decision": "WAIT",
                "technical_reason": "wait", "counter_evidence": "uncertain",
                "evidence_ids": [next(iter(item["evidence"]))], "plan": None,
            } for item in batch["targets"]]
            if self.mode == "duplicate":
                rows.append(copy.deepcopy(rows[0]))
            if self.mode == "missing":
                rows = rows[1:]
            if self.mode == "unknown":
                rows.append({**rows[0], "symbol": "NOT_IN_POOL"})
            return {"content": json.dumps({"decisions": rows}), "model": "fake-test-only", "usage": {}}
        finally:
            self.active -= 1


class AsyncTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = AIStore(Path(self.folder.name) / "ai.db")

    async def asyncTearDown(self):
        self.folder.cleanup()

    async def no_quote(self, _):
        return None

    async def test_batch_partial_acceptance_duplicate_and_missing(self):
        for mode, rejected in (("duplicate", "NVDABUSDT"), ("missing", "NVDABUSDT")):
            runner = ShadowOrchestrator(FakeGateway(mode), self.store, self.no_quote, policy=policy())
            result = await runner.run(collection())
            self.assertEqual(result["validated_count"], 1)
            self.assertIn(rejected, result["rejected"])
            self.assertEqual(result["eligible_review_rate"], .5)

    async def test_unknown_extra_symbol_is_reported(self):
        runner = ShadowOrchestrator(FakeGateway("unknown"), self.store, self.no_quote, policy=policy())
        result = await runner.run(collection())
        self.assertEqual(result["validated_count"], 2)
        self.assertEqual(len(result["invalid_items"]), 1)
        self.assertFalse(result["buy_enabled"])

    async def test_concurrency_and_timeout_coverage(self):
        gateway = FakeGateway("timeout")
        runner = ShadowOrchestrator(gateway, self.store, self.no_quote, policy=policy(),
                                    batch_size=1, concurrency=1)
        result = await runner.run(collection(), timeout_seconds=.02)
        self.assertLessEqual(gateway.peak, 1)
        self.assertEqual(result["validated_count"], 0)
        self.assertEqual(len(result["rejected"]), 2)
        self.assertEqual(gateway.active, 0)

    async def test_live_batches_respect_concurrency_limit(self):
        gateway = FakeGateway()
        runner = ShadowOrchestrator(gateway, self.store, self.no_quote, policy=policy(),
                                    batch_size=1, concurrency=1)
        result = await runner.run(collection())
        self.assertEqual(result["validated_count"], 2)
        self.assertEqual(gateway.peak, 1)

    async def test_missing_snapshot_stays_in_denominator(self):
        data = collection()
        data["snapshots"].pop("AAPLBUSDT")
        runner = ShadowOrchestrator(FakeGateway(), self.store, self.no_quote, policy=policy())
        result = await runner.run(data)
        self.assertEqual(result["candidate_count"], 2)
        self.assertEqual(result["candidate_review_rate"], .5)
        self.assertEqual(result["eligible_review_rate"], 1)

    async def test_completed_cycle_cannot_be_billed_again_after_restart(self):
        data = collection()
        runner = ShadowOrchestrator(FakeGateway(), self.store, self.no_quote, policy=policy())
        await runner.run(data)
        fresh_runner = ShadowOrchestrator(
            FakeGateway(), AIStore(self.store.path), self.no_quote, policy=policy())
        with self.assertRaisesRegex(ValueError, "already_claimed"):
            await fresh_runner.run(data)

    async def test_validated_buy_creates_plan_and_atomic_shadow_tasks(self):
        data = collection(("NVDABUSDT",))
        s = data["snapshots"]["NVDABUSDT"]
        s["periods"]["15m"] = {"status":"ready", "support_20":95., "resistance_20":110.}
        class Gateway:
            async def decide(self, **kwargs):
                return {"content":json.dumps({"decisions":[decision(s,True)]}), "model":"test"}
        async def quotes(symbol):
            return quote(symbol)
        runner = ShadowOrchestrator(Gateway(),self.store,quotes,policy=policy())
        result = await runner.run(data)
        self.assertEqual(result["validated_count"],1)
        self.assertEqual(result["plan_tracking_counts"],{"created":1})
        self.assertEqual(result["notification_queue"]["tasks"],{"pending":2})
        self.assertFalse(result["notification_queue"]["external_delivery_enabled"])
        with self.store.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_audit WHERE kind='validated_decision'").fetchone()[0],1)

    async def test_single_flight_and_cancellation_cleanup(self):
        runner = ShadowOrchestrator(FakeGateway("timeout"), self.store, self.no_quote, policy=policy())
        task = asyncio.create_task(runner.run(collection()))
        await asyncio.sleep(.005)
        with self.assertRaisesRegex(ValueError, "already_running"):
            await runner.run(collection())
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        self.assertFalse(runner._running)

    async def test_quote_event_timestamp_disconnect_and_reordering(self):
        now = int(time.time() * 1000)
        cache = QuoteCache({"NVDABUSDT"})
        event = {"e": "24hrTicker", "E": now - 100, "s": "NVDABUSDT",
                 "b": "100", "a": "101", "B": "3", "A": "4"}
        cache.update(event, now)
        self.assertIsNone(await cache.get("NVDABUSDT"))
        cache.connected = True
        self.assertIsNotNone(await cache.get("NVDABUSDT"))
        with self.assertRaisesRegex(ValueError, "non_monotonic"):
            cache.update(event, now)
        with self.assertRaises(ValueError):
            cache.update({**event, "E": now - 10000}, now)
        with self.assertRaises(ValueError):
            cache.update({**event, "E": now, "A": "0"}, now)
        self.assertIsNone(await cache.get("NVDABUSDT"))

    async def test_gateway_reserves_before_call_and_does_not_save_reasoning(self):
        key_file = Path(self.folder.name) / "key.txt"
        key_file.write_text("sk-" + "a" * 24)
        requests = []
        async def handler(request):
            requests.append(request)
            return httpx.Response(200, json={
                "model": "deepseek-flash", "usage": {"prompt_tokens": 20, "completion_tokens": 10},
                "choices": [{"finish_reason": "stop", "message": {
                    "content": '{"decisions":[]}', "reasoning_content": "private-reasoning"}}],
            })
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as client:
            gateway = DeepSeekGateway(client, self.store, key_file=key_file,
                                      model="deepseek-flash",
                                      budget=PriceBudget("CNY", 1_000_000, 1_000_000, 100_000, 100_000))
            result = await gateway.decide(cycle_id="gateway-test", batch={},
                                          deadline=int(time.time() * 1000) + 5000)
        self.assertEqual(result["content"], '{"decisions":[]}')
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0].url.host, "api.deepseek.com")
        with self.store.connection() as conn:
            payloads = str(conn.execute("SELECT payload FROM ai_audit").fetchall())
            self.assertNotIn("private-reasoning", payloads)
            self.assertNotIn("sk-" + "a" * 24, payloads)
            self.assertEqual(conn.execute("SELECT charged FROM ai_budget").fetchone()[0], 30)

    async def test_gateway_exhausted_budget_sends_nothing(self):
        key_file = Path(self.folder.name) / "key.txt"
        key_file.write_text("sk-" + "b" * 24)
        async def handler(request):
            self.fail("network must not be called without budget")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as client:
            gateway = DeepSeekGateway(client, self.store, key_file=key_file,
                                      model="deepseek-flash", budget=PriceBudget("CNY", 1000000, 1000000, 1, 1))
            with self.assertRaisesRegex(ValueError, "budget_exhausted"):
                await gateway.decide(cycle_id="budget-test", batch={},
                                     deadline=int(time.time() * 1000) + 5000)

    async def test_gateway_timeout_keeps_reservation_without_logging_error_body(self):
        key_file = Path(self.folder.name) / "key.txt"
        key_file.write_text("sk-" + "c" * 24)
        async def handler(request):
            raise httpx.ReadTimeout("sensitive-error-body")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as client:
            gateway = DeepSeekGateway(client, self.store, key_file=key_file,
                                      model="deepseek-flash",
                                      budget=PriceBudget("CNY", 1000000, 1000000, 100000, 100000))
            with self.assertRaises(httpx.ReadTimeout):
                await gateway.decide(cycle_id="timeout-test", batch={},
                                     deadline=int(time.time() * 1000) + 5000)
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT state FROM ai_budget").fetchone()[0], "reserved")
            self.assertNotIn("sensitive-error-body",
                             str(conn.execute("SELECT payload FROM ai_audit").fetchall()))

    async def test_collector_refreshes_overlap_and_keeps_failures(self):
        calls = []
        class Provider:
            async def universe(self):
                return {"available": [{"symbol": "NVDABUSDT", "role": "candidate"},
                                      {"symbol": "AAPLBUSDT", "role": "candidate"}],
                        "unavailable": [], "requested_count": 2}
            async def server_time(self):
                return int(time.time() * 1000)
            async def history(self, symbol, *, end_time, count):
                calls.append((symbol, count))
                if symbol == "AAPLBUSDT":
                    raise RuntimeError("fixture outage")
                end = end_time // MINUTE
                return [Bar(symbol, i * MINUTE, (i + 1) * MINUTE - 1,
                            100., 101., 99., 100., 10., 1000., int(time.time() * 1000))
                        for i in range(end - count, end)]
        store = SnapshotStore(Path(self.folder.name) / "bars.db")
        result = await PoolCollector(Provider(), store).collect(history_count=100)
        self.assertEqual(result["counts"]["requested"], 2)
        self.assertEqual(result["counts"]["failed"], 1)
        nvda_counts = [n for s, n in calls if s == "NVDABUSDT"]
        self.assertEqual(nvda_counts[0], 100)
        self.assertLess(nvda_counts[1], 100)
        self.assertFalse(result["buy_enabled"])

    async def test_short_listing_history_does_not_rebackfill_every_refresh(self):
        calls = []
        class Provider:
            async def universe(self):
                return {"available": [{"symbol": "NVDABUSDT", "role": "candidate"}],
                        "unavailable": [], "requested_count": 1}
            async def server_time(self):
                return int(time.time() * 1000)
            async def history(self, symbol, *, end_time, count):
                calls.append(count)
                end = end_time // MINUTE
                return [Bar(symbol, i * MINUTE, (i + 1) * MINUTE - 1,
                            100., 101., 99., 100., 10., 1000., int(time.time() * 1000))
                        for i in range(end - min(count, 20), end)]
        store = SnapshotStore(Path(self.folder.name) / "short.db")
        await PoolCollector(Provider(), store).collect(history_count=100)
        await PoolCollector(Provider(), store).collect(history_count=100)
        self.assertEqual(calls[0], 100)
        self.assertTrue(all(n < 100 for n in calls[1:]))


if __name__ == "__main__":
    unittest.main()
