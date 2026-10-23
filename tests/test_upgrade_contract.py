import time
import unittest
from test_v2_ai import snapshot, decision, quote, policy
from server.v2.decisions import validate_decision, compact_snapshot, Plan
from server.v2.analysis_control import AnalysisControl

class UpgradeContractTests(unittest.TestCase):
    def test_legacy_analysis_default_three_minutes(self):
        # Compatibility model; production research is separately opt-in.
        self.assertEqual(AnalysisControl().interval_seconds, 180)

    def test_net_threshold_rejects_insufficient_rebound_and_range(self):
        for habit, target in [('PLUNGE_REBOUND', 102.1), ('RANGE_SCALP', 101.9)]:
            s = snapshot()
            row = decision(s, True)
            row['habit'] = habit
            row['plan']['take_profits'] = [target]
            with self.assertRaisesRegex(ValueError, 'insufficient_net_profit'):
                validate_decision(row, snapshot=s, evidence=set(compact_snapshot(s)['evidence']),
                    quote=quote(), now=int(time.time()*1000), deadline=int(time.time()*1000)+45000,
                    policy=policy())

    def test_forty_eight_hours_and_minimum_five(self):
        row = decision(snapshot(), True)['plan']
        row['holding_minutes'] = 2880
        self.assertEqual(Plan.model_validate(row).holding_minutes, 2880)
        for invalid in [4, 2881]:
            row['holding_minutes'] = invalid
            with self.assertRaises(ValueError): Plan.model_validate(row)
