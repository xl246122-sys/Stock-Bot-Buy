"""Safe defaults: developing the data path cannot accidentally enable buys."""
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    scope: Literal["binance_bstocks_spot"] = "binance_bstocks_spot"
    interval_minutes: Literal[1, 3, 5, 10] = 1
    mode: Literal["disabled", "shadow"] = "disabled"
    ai_model: str = ""
    ai_key_file: Path | None = Field(default=None, exclude=True, repr=False)
    daily_budget: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    monthly_budget: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    budget_currency: Literal["CNY", "USD"] = "CNY"
    max_holding_minutes: int = Field(default=60, ge=1, le=1440)
    session_convention: Literal["UTC_calendar_day"] = "UTC_calendar_day"

    def readiness(self) -> dict:
        reasons = []
        if not self.ai_model:
            reasons.append("model_not_selected")
        if not self.ai_key_file or not self.ai_key_file.is_file():
            reasons.append("key_file_not_configured_or_missing")
        if self.daily_budget is None or self.monthly_budget is None:
            reasons.append("budget_not_configured")
        # These are integration milestones, never environment-variable overrides.
        reasons.extend([
            "long_running_quote_stream_not_verified",
            "full_pool_history_has_known_gaps",
            "live_ai_decision_not_verified",
            "device_delivery_not_verified",
        ])
        return {"mode": self.mode, "buy_enabled": False, "reasons": reasons,
                "configuration_is_not_provider_verification": True}
