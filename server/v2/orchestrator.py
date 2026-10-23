"""Single-flight, bounded shadow cycles. Never emits FCM or trading actions."""
import asyncio
import json
import time
from collections import Counter

from .ai_store import AIStore
from .decisions import PROMPT_HASH, RiskPolicy, compact_snapshot, strict_json, validate_decision
from .plan_store import PlanStore, PlanPolicy


class ShadowOrchestrator:
    def __init__(self, gateway, store: AIStore, quote_provider, *,
                 policy: RiskPolicy, batch_size: int = 20, concurrency: int = 3,
                 plan_policy: PlanPolicy = PlanPolicy()):
        if not 1 <= batch_size <= 25 or not 1 <= concurrency <= 5:
            raise ValueError("invalid_batch_limits")
        self.gateway, self.store, self.quote_provider = gateway, store, quote_provider
        self.policy, self.batch_size, self.concurrency = policy, batch_size, concurrency
        self.plans = PlanStore(store, plan_policy)
        self._running = False

    async def run(self, collected: dict, *, timeout_seconds: float = 45) -> dict:
        if self._running:
            raise ValueError("cycle_already_running")
        if not 0 < timeout_seconds <= 45:
            raise ValueError("invalid_cycle_timeout")
        # Deep copy freezes caller-owned objects before awaiting any model.
        collected = json.loads(json.dumps(collected, allow_nan=False))
        items = collected["universe"]["available"]
        if len(items) > 500 or len({i["symbol"] for i in items}) != len(items):
            raise ValueError("invalid_universe")
        self._running = True
        tasks = []
        claimed = False
        try:
            cycle_id = collected["cycle_id"]
            started = int(time.time() * 1000)
            self.store.claim_cycle(cycle_id, started)
            claimed = True
            deadline = started + int(timeout_seconds * 1000)
            snapshots = collected["snapshots"]
            candidates = [i["symbol"] for i in items if i["role"] == "candidate"]
            sector_first = "selection" in collected["universe"]
            sector_cards = {c["sector_id"]: c for c in collected.get("sector_trends", [])}
            sector_by_symbol = {i["symbol"]: i.get("sector_id") for i in items}
            def sector_ready(symbol, at=started):
                if not sector_first:
                    return True
                card = sector_cards.get(sector_by_symbol[symbol], {})
                return (card.get("trend", "UNKNOWN") != "UNKNOWN"
                        and 0 <= at - card.get("as_of", 0) <= 90000
                        and 0 < at - card.get("periods", {}).get("1m", {}).get("bar_close_time", 0) <= 90000)
            eligible = [s for s in candidates if s in snapshots
                        and snapshots[s]["data_eligible"] and sector_ready(s)]
            target_inputs = {s: compact_snapshot(snapshots[s]) for s in eligible}
            for symbol in eligible:
                for ref, value in collected.get("relative_strength", {}).get(symbol, {}).items():
                    target_inputs[symbol]["evidence"][
                        snapshots[symbol]["snapshot_id"] + ":relative_strength:" + ref] = value
            refs = [compact_snapshot(snapshots[i["symbol"]]) for i in items
                    if i["role"] == "reference" and i["symbol"] in snapshots
                    and snapshots[i["symbol"]]["data_eligible"]]
            accepted, rejected, batch_errors = {}, {}, []
            invalid_items = []
            for symbol in candidates:
                if symbol not in eligible:
                    rejected[symbol] = ["sector_etf_unavailable_or_stale" if not sector_ready(symbol)
                                        else "data_ineligible_or_missing"]
            self.store.audit(cycle_id, "cycle_started", started, {
                "candidates": candidates, "eligible": eligible, "deadline": deadline,
                "snapshot_ids": {s: snapshots[s]["snapshot_id"] for s in snapshots},
                "universe": collected["universe"],
            })
            semaphore = asyncio.Semaphore(self.concurrency)

            async def execute(symbols):
                async with semaphore:
                    remaining = (deadline - int(time.time() * 1000)) / 1000
                    if remaining <= 0:
                        return symbols, None, "deadline_exceeded"
                    batch = {
                        "targets": [target_inputs[s] for s in symbols],
                        "references": refs,
                        "sector_trends": collected.get("sector_trends", []),
                        "target_sectors": {s: sector_by_symbol[s] for s in symbols},
                        "missing_context": collected["universe"]["unavailable"],
                        "risk_policy": self.policy.model_dump(),
                    }
                    try:
                        async with asyncio.timeout(remaining):
                            reply = await self.gateway.decide(cycle_id=cycle_id, batch=batch, deadline=deadline)
                        return symbols, reply, None
                    except Exception as exc:
                        return symbols, None, type(exc).__name__

            tasks = [asyncio.create_task(execute(eligible[i:i + self.batch_size]))
                     for i in range(0, len(eligible), self.batch_size)]
            for completed in asyncio.as_completed(tasks):
                symbols, reply, failure = await completed
                if failure:
                    batch_errors.append({"symbols": symbols, "reason": failure})
                    for symbol in symbols:
                        rejected[symbol] = [failure]
                    continue
                try:
                    rows = strict_json(reply["content"])["decisions"]
                    if len(rows) > self.batch_size * 2:
                        raise ValueError("oversized_response")
                except (ValueError, KeyError, TypeError):
                    for symbol in symbols:
                        rejected[symbol] = ["invalid_json_envelope"]
                    continue
                counts = Counter(r.get("symbol") for r in rows
                                 if isinstance(r, dict) and isinstance(r.get("symbol"), str))
                by_symbol = {r["symbol"]: r for r in rows
                             if isinstance(r, dict) and isinstance(r.get("symbol"), str)}
                invalid_items.extend(
                    {"reason": "unknown_or_malformed_symbol"}
                    for r in rows if not isinstance(r, dict) or r.get("symbol") not in symbols
                )
                for symbol in symbols:
                    if counts[symbol] != 1:
                        rejected[symbol] = ["missing_symbol" if counts[symbol] == 0 else "duplicate_symbol"]
                        continue
                    evidence = set(target_inputs[symbol]["evidence"])
                    for ref in refs:
                        evidence.update(ref["evidence"])
                    try:
                        remaining = (deadline - int(time.time() * 1000)) / 1000
                        if remaining <= 0:
                            raise ValueError("cycle_deadline_exceeded")
                        quote = None
                        if by_symbol[symbol].get("decision") == "BUY":
                            async with asyncio.timeout(min(remaining, 2)):
                                quote = await self.quote_provider(symbol)
                        now = int(time.time() * 1000)
                        validated = validate_decision(
                            by_symbol[symbol], snapshot=snapshots[symbol], evidence=evidence,
                            quote=quote, now=now, deadline=deadline, policy=self.policy)
                        if sector_first and validated.decision.decision == "BUY":
                            if not sector_ready(symbol, at=now):
                                raise ValueError("sector_etf_became_stale")
                            sector_card = sector_cards[sector_by_symbol[symbol]]
                            prefix = sector_card["snapshot_id"] + ":"
                            if not any(e.startswith(prefix) for e in validated.decision.evidence_ids):
                                raise ValueError("missing_sector_etf_evidence")
                        event = {
                            "symbol": symbol, "snapshot_id": snapshots[symbol]["snapshot_id"],
                            "cycle_id": cycle_id, "decision": validated.decision.model_dump(),
                            "valid_until": validated.valid_until,
                            "net_risk_reward": validated.net_risk_reward,
                            "model_id": reply["model"], "prompt_hash": PROMPT_HASH,
                            "validated_at": now, "delivery": "shadow_only",
                        }
                        # Each successful batch persists immediately, without waiting for the whole pool.
                        event["plan_tracking"] = self.plans.record(event, snapshots[symbol])
                        accepted[symbol] = event
                    except Exception as exc:
                        # ValidationError text may include raw provider input; only safe codes are saved.
                        reason = str(exc) if type(exc) is ValueError else type(exc).__name__
                        rejected[symbol] = [reason]
                self.store.audit(cycle_id, "batch_validated", int(time.time() * 1000), {
                    "symbols": symbols, "accepted": [s for s in symbols if s in accepted],
                    "rejected": {s: rejected[s] for s in symbols if s in rejected},
                })
            report = {
                "cycle_id": cycle_id, "mode": "shadow", "buy_enabled": False,
                "started_at": started, "completed_at": int(time.time() * 1000),
                "requested_pool": collected["universe"]["requested_count"],
                "target_stock_count": collected["universe"].get("target_stock_count", len(candidates)),
                "sector_trends": collected.get("sector_trends", []),
                "candidate_count": len(candidates), "eligible_count": len(eligible),
                "validated_count": len(accepted),
                "eligible_review_rate": len(accepted) / len(eligible) if eligible else None,
                "candidate_review_rate": len(accepted) / len(candidates) if candidates else None,
                "full_pool_data_rate": len(snapshots) / collected["universe"]["requested_count"]
                if collected["universe"]["requested_count"] else None,
                "accepted": accepted, "rejected": rejected, "batch_errors": batch_errors,
                "invalid_items": invalid_items,
                "plan_tracking_counts": dict(Counter(e["plan_tracking"]["status"] for e in accepted.values())),
                "notification_queue": self.plans.summary(),
            }
            self.store.audit(cycle_id, "cycle_completed", report["completed_at"], report)
            self.store.finish_cycle(cycle_id, "completed", report["completed_at"])
            return report
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            if claimed:
                self.store.finish_cycle(cycle_id, "interrupted", int(time.time() * 1000))
            self._running = False
