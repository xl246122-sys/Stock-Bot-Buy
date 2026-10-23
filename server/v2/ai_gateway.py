"""One bounded DeepSeek request per batch; no retries, tools or alternate hosts."""
import asyncio
import json
import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import httpx

from .ai_store import AIStore
from .credentials import load_deepseek_key
from .decisions import PROMPT, PROMPT_HASH, PROMPT_VERSION


@dataclass(frozen=True)
class PriceBudget:
    # Rates must come from the actual account billing currency, not guessed defaults.
    currency: str
    input_micros_per_million: int
    output_micros_per_million: int
    daily_limit_micros: int
    monthly_limit_micros: int

    def __post_init__(self):
        values = (self.input_micros_per_million, self.output_micros_per_million,
                  self.daily_limit_micros, self.monthly_limit_micros)
        if self.currency not in {"CNY", "USD"} or any(type(v) is not int or v <= 0 for v in values):
            raise ValueError("prices_and_budget_must_be_explicit_positive_integers")

    def cost(self, input_tokens: int, output_tokens: int) -> int:
        # Cached inputs are charged at the uncached rate for a conservative estimate.
        return math.ceil((input_tokens * self.input_micros_per_million
                          + output_tokens * self.output_micros_per_million) / 1_000_000)


class DeepSeekGateway:
    def __init__(self, client: httpx.AsyncClient, store: AIStore, *,
                 key_file: Path, model: str, budget: PriceBudget, max_output_tokens: int = 6400,
                 analysis_allowed: Callable[[], bool] | None = None):
        if model not in {"deepseek-flash", "deepseek-v4-pro", "deepseek-chat"}:
            raise ValueError("unsupported_model_requires_discovery")
        if not 64 <= max_output_tokens <= 16000:
            raise ValueError("output_limit_out_of_bounds")
        self.client, self.store, self.key_file = client, store, key_file
        self.model, self.budget, self.max_output_tokens = model, budget, max_output_tokens
        self.analysis_allowed = analysis_allowed

    async def decide(self, *, cycle_id: str, batch: dict, deadline: int) -> dict:
        if self.analysis_allowed is not None and not self.analysis_allowed():
            raise ValueError("analysis_disabled_by_schedule")
        content = json.dumps(batch, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        if len(content.encode()) > 196_608:
            raise ValueError("batch_context_limit")
        now = int(time.time() * 1000)
        remaining = (deadline - now) / 1000
        if remaining <= 0:
            raise ValueError("deadline_exceeded_before_request")
        key = load_deepseek_key(self.key_file)
        # UTF-8 bytes plus message framing provide a conservative token reservation.
        upper_input = len(content.encode()) + len(PROMPT.encode()) + 4096
        reserve = self.budget.cost(upper_input, self.max_output_tokens)
        reservation = self.store.reserve(
            reserve, daily_limit=self.budget.daily_limit_micros,
            monthly_limit=self.budget.monthly_limit_micros,
            currency=self.budget.currency, now=now)
        request = {
            "model": self.model,
            "messages": [{"role": "system", "content": PROMPT},
                         {"role": "user", "content": content}],
            "thinking": {"type": "disabled"}, "temperature": 0,
            "response_format": {"type": "json_object"},
            "max_tokens": self.max_output_tokens, "stream": False,
        }
        self.store.audit(cycle_id, "model_started", now, {
            "reservation_id": reservation, "prompt_version": PROMPT_VERSION,
            "prompt_hash": PROMPT_HASH, "request": request,
            "currency": self.budget.currency, "reserved_micros": reserve,
        })
        try:
            async with asyncio.timeout(remaining):
                response = await self.client.post(
                    "https://api.deepseek.com/chat/completions",
                    headers={"Authorization": f"Bearer {key}"},
                    json=request, follow_redirects=False, timeout=min(remaining, 40))
            if response.status_code != 200:
                raise ValueError(f"provider_http_{response.status_code}")
            data = response.json()
            usage = data.get("usage", {})
            counts = [usage.get("prompt_tokens"), usage.get("completion_tokens")]
            if all(type(n) is int and n >= 0 for n in counts):
                self.store.settle(reservation, self.budget.cost(*counts))
            choice = data["choices"][0]
            answer = choice["message"]["content"]
            self.store.audit(cycle_id, "model_completed", int(time.time() * 1000), {
                "reservation_id": reservation, "requested_model": self.model,
                "returned_model": data.get("model"), "usage": usage,
                "finish_reason": choice.get("finish_reason"), "content": answer,
                # Do not persist reasoning_content.
            })
            if choice.get("finish_reason") != "stop" or not isinstance(answer, str) or not answer.strip():
                raise ValueError("empty_or_truncated_response")
            if data.get("model") != self.model:
                raise ValueError("returned_model_mismatch")
            return {"content": answer, "model": data["model"], "usage": usage}
        except BaseException as exc:
            # Unknown usage stays reserved, including cancellation/timeouts and restart.
            self.store.audit(cycle_id, "model_failed", int(time.time() * 1000), {
                "reservation_id": reservation, "error_type": type(exc).__name__,
            })
            raise
