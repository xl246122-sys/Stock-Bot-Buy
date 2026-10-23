"""Model-facing contract and fail-closed shadow-plan validation."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .market_data import FEED


Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class Plan(Contract):
    entry_low: Positive
    entry_high: Positive
    stop_loss: Positive
    take_profits: Annotated[list[Positive], Field(min_length=1, max_length=3)]
    holding_minutes: Annotated[int, Field(ge=5, le=2880)]
    invalidation_conditions: Annotated[list[str], Field(min_length=1, max_length=5)]

    @model_validator(mode="after")
    def price_order(self):
        if not self.stop_loss < self.entry_low <= self.entry_high < min(self.take_profits):
            raise ValueError("invalid_plan_price_order")
        if self.take_profits != sorted(set(self.take_profits)):
            raise ValueError("targets_not_strictly_increasing")
        if any(not text.strip() or len(text) > 300 for text in self.invalidation_conditions):
            raise ValueError("invalid_invalidation_text")
        return self


class Decision(Contract):
    symbol: Annotated[str, Field(min_length=1, max_length=30)]
    habit: Literal["OPENING_TREND", "PLUNGE_REBOUND", "RANGE_SCALP", "OVERBOUGHT_PEAK"] = "OPENING_TREND"
    decision: Literal["BUY", "WAIT", "AVOID"]
    technical_reason: Annotated[str, Field(min_length=1, max_length=800)]
    counter_evidence: Annotated[str, Field(min_length=1, max_length=800)]
    evidence_ids: Annotated[list[str], Field(min_length=1, max_length=12)]
    plan: Plan | None

    @model_validator(mode="after")
    def plan_matches_decision(self):
        if (self.decision == "BUY") != (self.plan is not None):
            raise ValueError("plan_required_only_for_buy")
        if not self.technical_reason.strip() or not self.counter_evidence.strip():
            raise ValueError("empty_reason")
        return self


class Quote(Contract):
    symbol: str
    bid: Positive
    ask: Positive
    event_time: int
    received_at: int
    feed: Literal["binance_spot_bstocks"] = FEED
    currency: Literal["USDT"] = "USDT"
    trading: bool = True

    @model_validator(mode="after")
    def uncrossed(self):
        if self.bid > self.ask:
            raise ValueError("crossed_quote")
        return self


class RiskPolicy(Contract):
    # Explicit engineering policy; no claim that these are optimal trading values.
    min_risk_reward: Positive
    round_trip_cost_bps: Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]
    max_holding_minutes: Annotated[int, Field(ge=5, le=2880)]
    min_price: Positive
    max_quote_age_ms: Annotated[int, Field(ge=1, le=5000)] = 5000
    max_snapshot_age_ms: Annotated[int, Field(ge=1, le=90000)] = 90000


@dataclass(frozen=True)
class Validated:
    decision: Decision
    valid_until: int | None
    net_risk_reward: float | None


def validate_decision(raw: dict, *, snapshot: dict, evidence: set[str],
                      quote: Quote | None, now: int, deadline: int,
                      policy: RiskPolicy) -> Validated:
    decision = Decision.model_validate(raw)
    if decision.symbol != snapshot["symbol"]:
        raise ValueError("wrong_symbol")
    if now >= deadline:
        raise ValueError("cycle_deadline_exceeded")
    if not snapshot["data_eligible"]:
        raise ValueError("ineligible_snapshot")
    if snapshot["feed"] != FEED or snapshot["currency"] != "USDT":
        raise ValueError("wrong_feed_or_currency")
    if not 0 <= now - snapshot["as_of"] <= policy.max_snapshot_age_ms:
        raise ValueError("stale_or_future_snapshot")
    latest_bar = snapshot["periods"]["1m"]["recent_bars"][-1]
    if not 0 < now - latest_bar["close_time"] <= 90000:
        raise ValueError("stale_or_future_completed_bar")
    if not set(decision.evidence_ids) <= evidence:
        raise ValueError("unknown_evidence")
    # Each decision must reference its own instrument, not only common context.
    if not any(e.startswith(snapshot["snapshot_id"] + ":") for e in decision.evidence_ids):
        raise ValueError("missing_own_evidence")
    if decision.plan is None:
        return Validated(decision, None, None)
    if quote is None:
        raise ValueError("missing_event_timestamped_quote")
    if quote.symbol != decision.symbol or not quote.trading:
        raise ValueError("wrong_or_halted_quote")
    if not (0 <= now - quote.event_time <= policy.max_quote_age_ms
            and quote.event_time <= quote.received_at <= now):
        raise ValueError("stale_or_future_quote")
    plan = decision.plan
    if quote.ask <= policy.min_price or plan.entry_low <= policy.min_price:
        raise ValueError("price_below_policy_minimum")
    if not plan.entry_low <= quote.ask <= plan.entry_high:
        raise ValueError("ask_outside_entry_range")
    costs = plan.entry_high * policy.round_trip_cost_bps / 10_000
    reward = plan.take_profits[0] - plan.entry_high - costs
    risk = plan.entry_high - plan.stop_loss + costs
    threshold = {"PLUNGE_REBOUND": 0.0098, "RANGE_SCALP": 0.008}.get(decision.habit, 0)
    if reward / plan.entry_high <= threshold:
        raise ValueError("insufficient_net_profit")
    if decision.habit == "OVERBOUGHT_PEAK":
        raise ValueError("risk_alert_cannot_buy")
    rr = reward / risk
    if rr < policy.min_risk_reward:
        raise ValueError("insufficient_net_risk_reward")
    expires = snapshot["as_of"] + min(plan.holding_minutes, policy.max_holding_minutes) * 60_000
    if expires <= now:
        raise ValueError("expired_plan")
    return Validated(decision, expires, rr)


def compact_snapshot(snapshot: dict) -> dict:
    evidence = {}
    for period, values in snapshot["periods"].items():
        if values["status"] != "ready":
            continue
        for name, value in values.items():
            if name in {"status", "count", "algorithm_version", "price_unit", "volume_unit"}:
                continue
            if name == "recent_bars":
                value = [{k: b[k] for k in ("open_time", "open", "high", "low", "close", "volume")}
                         for b in value]
            evidence[f"{snapshot['snapshot_id']}:{period}:{name}"] = value
    evidence[snapshot["snapshot_id"] + ":session_metrics"] = snapshot["session_metrics"]
    return {"symbol": snapshot["symbol"], "snapshot_id": snapshot["snapshot_id"],
            "as_of": snapshot["as_of"], "feed": snapshot["feed"], "currency": snapshot["currency"],
            "evidence": evidence}


PROMPT = """You evaluate only supplied technical evidence for Binance spot bStocks.
These are tokenized securities priced in USDT; volume is Binance token volume,
not US exchange share volume. Sessions are UTC calendar days, trading can be 24/7.
Use no news, fundamentals, earnings, implied institutional flow or external knowledge.
Return exactly one decision per input target symbol; references are context only.
Return habit: OPENING_TREND, PLUNGE_REBOUND, RANGE_SCALP or OVERBOUGHT_PEAK.
PLUNGE_REBOUND requires confirmed stabilization and net target >0.98%.
RANGE_SCALP requires net target >0.8%, holding 5 to 2880 minutes.
An ongoing plunge is WAIT; a weakening overbought peak is AVOID, never BUY.
Choose BUY, WAIT or AVOID freely; zero BUY is valid. Missing context is unknown.
Sector ETF trends are primary context. When target_sectors is supplied, a BUY must
cite the corresponding sector ETF evidence; SPY, QQQ or another sector cannot
substitute for a missing sector ETF. Sector direction alone is not a BUY rule.
Every reason must cite supplied evidence_ids, including the target's own evidence.
Give concise technical_reason and counter_evidence; do not output private reasoning.
BUY requires plan with entry_low, entry_high, stop_loss, take_profits (ascending),
holding_minutes and nonempty invalidation_conditions. WAIT/AVOID must have plan:null.
Do not invent identifiers, timestamps, win rates, data or execute any tool.
Return a JSON object only, with this exact shape:
{"decisions":[{"symbol":"INPUT_SYMBOL","decision":"WAIT","technical_reason":"...",
"counter_evidence":"...","evidence_ids":["INPUT_EVIDENCE_ID"],"plan":null}]}
"""
PROMPT_VERSION = "bstocks-sector-first-v2"
PROMPT_HASH = hashlib.sha256(PROMPT.encode()).hexdigest()


def strict_json(text: str) -> dict:
    if not isinstance(text, str) or len(text) > 1_000_000:
        raise ValueError("invalid_response_size")
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate_json_key")
            result[key] = value
        return result

    def invalid_constant(_):
        raise ValueError("non_finite_json")

    value = json.loads(text, object_pairs_hook=pairs, parse_constant=invalid_constant)
    if not isinstance(value, dict) or set(value) != {"decisions"} or not isinstance(value["decisions"], list):
        raise ValueError("invalid_decision_envelope")
    return value
