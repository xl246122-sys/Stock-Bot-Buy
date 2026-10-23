import copy
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from server.v2.ai_store import AIStore
from server.v2.plan_store import PlanStore, PlanPolicy


def observation(cycle="a", now=100000, decision="BUY", price=100., symbol="NVDABUSDT"):
    snapshot = {"symbol":symbol, "snapshot_id":cycle, "as_of":now-1000,
                "feed":"binance_spot_bstocks", "currency":"USDT",
                "periods":{"15m":{"status":"ready","support_20":95.,"resistance_20":110.}}}
    event = {"cycle_id":cycle,"symbol":symbol,"snapshot_id":cycle,"validated_at":now,
             "valid_until":now+60000 if decision=="BUY" else None,
             "decision":{"decision":decision,"technical_reason":"reason", "plan":{
                 "entry_low":price,"entry_high":price+1,"stop_loss":98.,
                 "take_profits":[108.],"holding_minutes":30,
                 "invalidation_conditions":["support broken"]} if decision=="BUY" else None}}
    return event,snapshot


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name)/"audit.db"
        self.store = PlanStore(AIStore(self.path))

    def tearDown(self):
        self.tmp.cleanup()

    def test_restart_and_concurrent_replay_create_only_one_revision_and_task_per_channel(self):
        e,s = observation()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: PlanStore(AIStore(self.path)).record(e,s), range(2)))
        self.assertEqual(results[0], results[1])
        self.assertEqual(self.store.summary()["tasks"], {"pending":2})
        with self.store.audit.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_audit").fetchone()[0],1)

    def test_reason_evidence_and_small_price_noise_do_not_extend_or_repeat(self):
        first = self.store.record(*observation())
        e,s = observation("b",now=102000,price=100.01)
        e["decision"]["technical_reason"] = "new wording"
        second = self.store.record(e,s)
        self.assertEqual(second["status"],"duplicate_suppressed")
        self.assertEqual(second["valid_until"],first["valid_until"])
        self.assertEqual(second["signal_id"],first["signal_id"])
        self.assertEqual(self.store.summary()["tasks"],{"pending":2})

    def test_material_revision_cancels_old_leased_task(self):
        first = self.store.record(*observation())
        leased = self.store.claim("fcm",now=100100)
        revised = self.store.record(*observation("b",now=102000,price=100.5))
        self.assertEqual(revised["setup_id"],first["setup_id"])
        self.assertEqual(revised["revision"],2)
        with self.assertRaisesRegex(ValueError,"lease"):
            self.store.finish_shadow(leased["task_id"],leased["lease_token"],now=103000,success=True)
        task = self.store.claim("fcm",now=103000)
        self.assertEqual(task["payload"]["revision"],2)
        history = self.store.history(first["signal_id"])
        self.assertEqual([r["revision"] for r in history["history"]],[1,2])
        self.assertEqual(history["history"][0]["payload"]["decision"]["plan"]["entry_low"],100.)

    def test_wait_invalidates_and_old_observation_cannot_resurrect(self):
        self.store.record(*observation())
        result = self.store.record(*observation("b",now=103000,decision="WAIT"))
        self.assertEqual(result["status"],"withdrawn")
        old = self.store.record(*observation("old",now=102000))
        self.assertEqual(old["status"],"out_of_order_ignored")
        task = self.store.claim("fcm",now=104000)
        self.assertEqual(task["payload"]["kind"],"plan_invalidated")

    def test_structure_change_and_expiry_create_new_setup(self):
        first = self.store.record(*observation())
        e,s = observation("b",now=102000)
        s["periods"]["15m"]["support_20"]=90.
        second = self.store.record(e,s)
        self.assertNotEqual(first["setup_id"],second["setup_id"])
        third = self.store.record(*observation("c",now=200000))
        self.assertNotEqual(second["setup_id"],third["setup_id"])

    def test_atomic_rollback_when_bounded_queue_full(self):
        store = PlanStore(self.store.audit, PlanPolicy(capacity=2))
        store.record(*observation())
        with self.assertRaisesRegex(ValueError,"queue_full"):
            store.record(*observation("b",symbol="AAPLBUSDT"))
        with store.audit.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM plan_observations").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM signal_setups").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_audit").fetchone()[0],1)

    def test_expired_lease_fencing_retry_backoff_and_no_external_delivery(self):
        self.store.record(*observation())
        a = self.store.claim("fcm",now=100100,lease_ms=1000)
        b = self.store.claim("fcm",now=101101,lease_ms=1000)
        self.assertEqual(a["task_id"],b["task_id"])
        self.assertNotEqual(a["lease_token"],b["lease_token"])
        with self.assertRaises(ValueError):
            self.store.finish_shadow(a["task_id"],a["lease_token"],now=101102,success=True)
        self.assertEqual(self.store.finish_shadow(b["task_id"],b["lease_token"],now=101102,success=False),"retry")
        self.assertIsNone(self.store.claim("fcm",now=102000))
        c = self.store.claim("fcm",now=103103)
        self.assertEqual(self.store.finish_shadow(c["task_id"],c["lease_token"],now=103104,success=True),"dry_run_completed")
        self.assertFalse(self.store.summary()["external_delivery_enabled"])

    def test_expiration_and_missing_structure_never_produce_buy_task(self):
        e,s = observation()
        s["periods"]={}
        self.assertEqual(self.store.record(e,s)["status"],"missing_structure_anchors")
        self.assertEqual(self.store.summary()["tasks"],{})
        self.store.record(*observation("b",now=102000))
        self.assertIsNone(self.store.claim("fcm",now=200000))
        self.assertEqual(self.store.summary()["tasks"],{"expired":2})

    def test_replay_conflict_is_rejected(self):
        e,s = observation()
        self.store.record(e,s)
        e["decision"]["technical_reason"]="different"
        with self.assertRaisesRegex(ValueError,"observation_id_conflict"):
            self.store.record(e,s)

    def test_two_workers_cannot_lease_the_same_task(self):
        self.store.record(*observation())
        with ThreadPoolExecutor(max_workers=2) as pool:
            tasks = list(pool.map(lambda _: PlanStore(AIStore(self.path)).claim("web",now=100100),range(2)))
        self.assertEqual(sum(t is not None for t in tasks),1)

    def test_abandoned_task_exhausts_attempts_and_expiry_cannot_be_shortened_silently(self):
        store = PlanStore(self.store.audit,PlanPolicy(max_attempts=1))
        first = store.record(*observation())
        store.claim("fcm",now=100100,lease_ms=1000)
        self.assertIsNone(store.claim("fcm",now=101101))
        self.assertEqual(store.summary()["tasks"]["failed"],1)
        e,s = observation("b",now=102000)
        e["valid_until"] = first["valid_until"]-10000
        changed = store.record(e,s)
        self.assertEqual(changed["revision"],2)
        self.assertEqual(changed["valid_until"],e["valid_until"])
