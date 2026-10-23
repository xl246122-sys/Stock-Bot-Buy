import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from server.v2.analysis_control import AnalysisControl, ControlStore


class AnalysisControlTests(unittest.TestCase):
    def test_shanghai_cross_midnight_boundaries(self):
        control = AnalysisControl()
        for value, expected in [
            ("2026-10-20T13:29:59+00:00", False),  # 21:29:59 CST Tuesday
            ("2026-10-20T13:30:00+00:00", True),   # 21:30:00 CST Tuesday
            ("2026-10-20T16:00:00+00:00", True),   # 00:00 CST Wednesday, session continues
            ("2026-10-20T20:59:00+00:00", True),   # 04:59 CST Wednesday
            ("2026-10-20T21:00:00+00:00", False),  # 05:00 CST Wednesday
            ("2026-10-25T13:30:00+00:00", False),  # Sunday 21:30 CST
            ("2026-10-26T01:00:00+00:00", False),  # Monday 09:00 CST, not a continuation
        ]:
            self.assertEqual(control.allows(datetime.fromisoformat(value)), expected)

    def test_override_and_persisted_interval(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "control.db"
            store = ControlStore(path)
            now = datetime(2026, 10, 20, 10, tzinfo=timezone.utc)
            self.assertFalse(store.claim_due(now))
            store.save(AnalysisControl(mode="on", interval_seconds=60))
            self.assertTrue(store.claim_due(now))
            self.assertFalse(ControlStore(path).claim_due(now))
            store.save(AnalysisControl(mode="off", interval_seconds=60))
            self.assertFalse(store.read().allows(now))
