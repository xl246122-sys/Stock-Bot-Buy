import tempfile
import unittest
from pathlib import Path

from server.v2.ai_store import AIStore
from server.v2.analysis_status import analysis_status


class AnalysisStatusTests(unittest.TestCase):
    def test_missing_database_does_not_create_or_enable_delivery(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "missing.db"
            self.assertFalse(analysis_status(path)["available"])
            self.assertFalse(path.exists())

    def test_only_validated_public_fields_are_returned(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "ai.db"
            store = AIStore(path)
            store.claim_cycle("c1", 100)
            store.audit("c1", "raw_response", 101, {"private": "hidden"})
            store.audit("c1", "validated_decision", 102, {
                "symbol": "ABC", "decision": {"decision": "WAIT", "technical_reason": "等待"},
                "private": "hidden",
            })
            store.audit("c1", "validated_decision", 103, {"decision": None})
            result = analysis_status(path)
            self.assertTrue(result["available"])
            self.assertFalse(result["delivery_enabled"])
            self.assertEqual(result["last_cycle_at"], 100)
            self.assertEqual(result["items"], [
                {"at": 102, "symbol": "ABC", "decision": "WAIT", "reason": "等待"}
            ])


if __name__ == "__main__":
    unittest.main()
