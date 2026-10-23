"""Inspect the shadow queue; optionally process one task locally without any sender."""
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.v2.ai_store import AIStore
from server.v2.plan_store import PlanStore


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, default=ROOT/".local/v2/ai-audit.db")
    parser.add_argument("--dry-run-one", choices=("fcm","web"))
    parser.add_argument("--signal-id", help="Read immutable version history for this server-generated signal")
    args = parser.parse_args()
    plans = PlanStore(AIStore(args.database))
    result = {}
    if args.dry_run_one:
        task = plans.claim(args.dry_run_one, now=int(time.time()*1000))
        if task:
            result = {"task_id":task["task_id"],
                      "result":plans.finish_shadow(task["task_id"],task["lease_token"],
                                                 now=int(time.time()*1000),success=True)}
    if args.signal_id:
        result["plan_history"] = plans.history(args.signal_id)
    print(json.dumps({**plans.summary(), **result}, ensure_ascii=False))
