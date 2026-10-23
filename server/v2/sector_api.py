"""Read-only sector status; missing or stale snapshots remain explicitly unknown."""
import json
import time
from pathlib import Path

from fastapi import APIRouter

from .sector_universe import sector_trends, select_universe, reference_trends
from datetime import datetime, timezone
from .us_etf import observation_status


router = APIRouter(prefix="/api/v2/sectors", tags=["sector radar"])
STATUS_FILE = Path(__file__).resolve().parents[2] / ".local/v2/sector-status.json"
REFERENCE_FILE = STATUS_FILE.with_name("reference-status.json")


def current_research(path: Path = STATUS_FILE.with_name("us-equity-research.json"),
                     refresh_path: Path | None = None) -> dict:
    now = int(time.time()*1000)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        watchlist = value["watchlist"]
        result = {"watchlist": watchlist, "us_etf_trends": value["us_etf_trends"],
                "research_updated_at": value["as_of"],
                "watchlist_needs_refresh": not 0 <= now - value["as_of"] <= 7*86400000}
    except (OSError, ValueError, KeyError, TypeError):
        result = {"watchlist": None, "us_etf_trends": [], "watchlist_needs_refresh": True}
    try:
        refresh = json.loads((refresh_path or path.with_name("us-etf-refresh.json")).read_text(encoding="utf-8"))
        if refresh["as_of"] >= result.get("research_updated_at", 0):
            result.update(us_etf_trends=refresh["us_etf_trends"],
                          etf_refresh_completed=refresh["completed"],
                          etf_refresh_failures=refresh["failures"])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    result["us_etf_trends"] = [observation_status(c, now=now) for c in result["us_etf_trends"]]
    return result


def current_references(path: Path = REFERENCE_FILE) -> list[dict]:
    now = int(time.time() * 1000)
    try:
        saved = json.loads(path.read_text(encoding="utf-8"))
        if not 0 <= now - saved["as_of"] <= 90_000:
            raise ValueError("stale")
        cards = saved["reference_trends"]
        if not isinstance(cards, list) or len(cards) != 3:
            raise ValueError("invalid_cards")
        by_id = {c["reference_id"]: c for c in cards}
        result = reference_trends({}, now=now)
        for index, empty in enumerate(result):
            card = by_id.get(empty["reference_id"], {})
            if (card.get("instrument_symbol") == empty["instrument_symbol"]
                    and 0 <= now - card.get("as_of", 0) <= 90_000):
                result[index] = card
            else:
                empty["reason"] = "reference_missing_or_stale"
        return result
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        cards = reference_trends({}, now=now)
        for card in cards:
            card["reason"] = "reference_missing_or_stale"
        return cards


def current_status(path: Path = STATUS_FILE) -> dict:
    now = int(time.time() * 1000)
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
        if not 0 <= now - result["as_of"] <= 90000:
            result["sector_trends"] = sector_trends({}, now=now)
            result["trend_status"] = "stale_or_not_running"
        else:
            result["trend_status"] = "snapshot_only"
        result["buy_enabled"] = False
        return result
    except (OSError, ValueError, KeyError, TypeError):
        return {
            "as_of": now, "target_stocks": 80, "target_sector_etfs": 8, "target_total": 88,
            "selection": select_universe([], as_of=datetime.now(timezone.utc).date()),
            "sector_trends": sector_trends({}, now=now),
            "trend_status": "data_not_connected", "buy_enabled": False,
        }


@router.get("/status")
def status():
    return {**current_status(), "reference_trends": current_references(), **current_research()}


@router.get("/analysis")
def analysis():
    from .analysis_status import analysis_status
    return analysis_status(STATUS_FILE.with_name("ai-audit.db"))
