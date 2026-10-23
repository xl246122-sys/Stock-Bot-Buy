"""Read-only, bounded public projection of validated AI decisions (no raw prompts)."""
import json
import sqlite3
from contextlib import closing
from pathlib import Path


def analysis_status(path: Path) -> dict:
    result = {"available": False, "last_cycle_at": None,
              "delivery_enabled": False, "items": []}
    if not path.is_file():
        return result
    try:
        with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
            row = db.execute("SELECT MAX(updated_at) FROM ai_cycles").fetchone()
            result["last_cycle_at"] = row[0]
            for at, payload in db.execute(
                "SELECT at,payload FROM ai_audit WHERE kind='validated_decision' "
                "ORDER BY at DESC LIMIT 50"
            ):
                try:
                    event = json.loads(payload)
                    decision = event["decision"]
                    if not isinstance(decision, dict):
                        continue
                    result["items"].append({
                        "at": at, "symbol": str(event["symbol"])[:30],
                        "decision": decision["decision"],
                        "reason": str(decision["technical_reason"])[:800],
                    })
                except (KeyError, ValueError, TypeError):
                    continue
            result["available"] = True
    except sqlite3.Error:
        pass
    return result
