"""Explicit one-cycle shadow runner. Default invocation only checks configuration."""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.ai_gateway import DeepSeekGateway, PriceBudget
from server.v2.ai_store import AIStore
from server.v2.binance_provider import BinanceProvider
from server.v2.collector import PoolCollector
from server.v2.decisions import RiskPolicy
from server.v2.orchestrator import ShadowOrchestrator
from server.v2.quotes import QuoteCache
from server.v2.snapshot_store import SnapshotStore
from server.v2.plan_store import PlanPolicy
from server.v2.analysis_control import ControlStore


def validate_config(config):
    reasons = []
    if config.get("mode") != "shadow":
        reasons.append("shadow_mode_not_enabled")
    if config.get("model") not in {"deepseek-flash", "deepseek-v4-pro"}:
        reasons.append("model_not_selected")
    if not isinstance(config.get("key_file"), str) or not Path(config["key_file"]).is_file():
        reasons.append("key_file_missing")
    if not isinstance(config.get("metadata_file"), str) or not Path(config["metadata_file"]).is_file():
        reasons.append("verified_universe_metadata_required")
    try:
        PriceBudget(**(config.get("budget") or {}))
    except (ValueError, TypeError):
        reasons.append("explicit_prices_and_budget_required")
    try:
        RiskPolicy.model_validate(config.get("risk_policy"))
    except ValueError:
        reasons.append("risk_policy_required")
    try:
        PlanPolicy(**config.get("plan_policy", {}))
    except (ValueError, TypeError):
        reasons.append("invalid_plan_policy")
    return reasons


async def run(config):
    root = Path(".local/v2")
    controls = ControlStore(root / "control.db")
    if not controls.claim_due(datetime.now(timezone.utc)):
        return {"status": "schedule_or_interval_closed", "model_calls": 0}
    store = AIStore(root / "ai-audit.db")
    async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
        records = json.loads(Path(config["metadata_file"]).read_text(encoding="utf-8-sig"))
        provider = BinanceProvider(client, metadata_records=records)
        collected = await PoolCollector(provider, SnapshotStore(root / "snapshots.db")).collect()
        quotes = QuoteCache({i["symbol"] for i in collected["universe"]["available"]})
        quote_task = asyncio.create_task(quotes.run())
        try:
            # Briefly allow the stream to connect; missing/stale quotes still reject BUY.
            await asyncio.sleep(2)
            gateway = DeepSeekGateway(client, store, key_file=Path(config["key_file"]),
                                      model=config["model"], budget=PriceBudget(**config["budget"]),
                                      analysis_allowed=lambda: controls.read().allows(datetime.now(timezone.utc)))
            result = await ShadowOrchestrator(
                gateway, store, quotes.get,
                policy=RiskPolicy.model_validate(config["risk_policy"]),
                plan_policy=PlanPolicy(**config.get("plan_policy", {}))).run(collected)
            destination = root / ("shadow-" + result["cycle_id"] + ".json")
            destination.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            return {key: value for key, value in result.items()
                    if key not in {"accepted", "rejected", "batch_errors", "invalid_items"}}
        finally:
            quote_task.cancel()
            await asyncio.gather(quote_task, return_exceptions=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--run-once", action="store_true",
                        help="Allows one paid shadow cycle if all budget and risk fields are configured")
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_text(encoding="utf-8-sig"))
        reasons = validate_config(config)
        if reasons or not args.run_once:
            print(json.dumps({"ready_for_shadow": not reasons, "reasons": reasons,
                              "model_calls": 0, "buy_notifications": False}, ensure_ascii=False))
            raise SystemExit(0 if not args.run_once else 2)
        print(json.dumps(asyncio.run(run(config)), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__}))
        raise SystemExit(1)
