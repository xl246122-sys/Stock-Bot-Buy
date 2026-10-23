"""Authenticated analysis controls; secrets are never returned to the client."""
import hmac
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from .analysis_control import AnalysisControl, ControlStore

router = APIRouter(prefix="/api/v2/analysis", tags=["analysis controls"])
CONTROL_PATH = Path(__file__).resolve().parents[2] / ".local/v2/control.db"


@router.get("/control")
def read_control():
    return ControlStore(CONTROL_PATH).read().public(datetime.now(timezone.utc))


@router.put("/control")
def write_control(value: AnalysisControl, request: Request):
    local = request.client and request.client.host in {"127.0.0.1", "::1"} and request.url.hostname in {"localhost", "127.0.0.1", "::1"}
    if request.url.scheme != "https" and not local:
        raise HTTPException(403, "HTTPS required for analysis controls")
    expected = os.environ.get("STOCKG_CONTROL_TOKEN", "")
    provided = request.headers.get("authorization", "").removeprefix("Bearer ")
    if len(expected) < 32 or not hmac.compare_digest(provided, expected):
        raise HTTPException(401, "Control authentication required")
    store = ControlStore(CONTROL_PATH)
    store.save(value)
    return value.public(datetime.now(timezone.utc))
