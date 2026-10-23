"""Explicit local ETF refresh; starts no notifications, orders or scheduled service."""
import argparse
import json
import sys
import time
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.v2.etf_refresh import ETFCache, ETFRefresher


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    key = dotenv_values(ROOT / ".env").get("MASSIVE_API_KEY")
    if not key:
        raise ValueError("existing_massive_key_missing")
    folder = ROOT / ".local/v2"
    cache = ETFCache(folder / "us-etf-cache.db")
    with httpx.Client(timeout=40, trust_env=False, follow_redirects=False,
                      headers={"Authorization": "Bearer " + key}) as client:
        worker = ETFRefresher(client, cache, folder / "us-etf-refresh.json")
        while True:
            started = time.monotonic()
            result = worker.run()
            print(json.dumps({"completed": result["completed"], "failures": result["failures"],
                              "updated": result["completed_count"]-len(result["failures"]),
                              "states": {c["etf"]:c["observation_state"] for c in result["us_etf_trends"]},
                              "buy_enabled": False}, ensure_ascii=False), flush=True)
            if not args.watch:
                return
            # A rate-limit response stops this process, not an automatic retry loop.
            if {"rate_limited", "cooldown_active"}.intersection(result["failures"].values()):
                return
            time.sleep(max(1, 120-(time.monotonic()-started)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__,
                          "reason": str(exc) if type(exc) is ValueError else "collector_failure"}))
        raise SystemExit(1)
