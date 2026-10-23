"""Read-only provider discovery. Credentials only go to the fixed DeepSeek origin."""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx


def load_deepseek_key(path: Path) -> str:
    # Do not print the file, matched key, response bodies, or exception messages.
    content = path.read_text(encoding="utf-8-sig").strip()
    matches = set(re.findall(r"\bsk-[A-Za-z0-9_-]{16,}\b", content))
    if len(matches) != 1:
        raise ValueError("expected_exactly_one_deepseek_key")
    return matches.pop()


def check_deepseek(client: httpx.Client, key_path: Path) -> dict:
    try:
        key = load_deepseek_key(key_path)
    except (OSError, UnicodeError, ValueError):
        return {"status": "key_file_unreadable_or_ambiguous"}
    try:
        response = client.get("https://api.deepseek.com/models",
                              headers={"Authorization": f"Bearer {key}"},
                              follow_redirects=False)
        if response.status_code != 200:
            return {"status": "http_error", "http_status": response.status_code}
        items = response.json().get("data", [])
        models = [{"id": m["id"], "owned_by": m.get("owned_by")}
                  for m in items if isinstance(m, dict) and isinstance(m.get("id"), str)]
        return {"status": "verified" if models else "empty_model_list",
                "models": models, "completion_test": "not_run", "billable_scan": "disabled"}
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        return {"status": "network_or_schema_error"}


def check_binance(client: httpx.Client, futures: bool) -> dict:
    endpoint = ("https://fapi.binance.com/fapi/v1/exchangeInfo" if futures
                else "https://data-api.binance.vision/api/v3/exchangeInfo")
    try:
        response = client.get(endpoint)
        if response.status_code != 200:
            return {"status": "http_error", "http_status": response.status_code}
        symbols = response.json()["symbols"]
        examples = ("NVDA", "AAPL", "TSLA", "SPY", "QQQ", "XLK", "SMH")
        matched = [
            {k: item.get(k) for k in (
                "symbol", "status", "baseAsset", "quoteAsset", "contractType",
                "underlyingType", "underlyingSubType")}
            for item in symbols
            if any(item.get("symbol", "").startswith(symbol) for symbol in examples)
        ]
        old_names = {"NVDABUSDT", "AAPLBUSDT", "TSLABUSDT", "SPYBUSDT", "QQQBUSDT"}
        available = {s["symbol"] for s in symbols if s.get("status") == "TRADING"}
        return {
            "status": "verified", "endpoint": endpoint,
            "total_symbols": len(symbols), "examples": matched,
            "legacy_names_trading": sorted(old_names & available),
            "us_exchange_ohlcv_entitlement": "not_established_by_this_api",
        }
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        return {"status": "network_or_schema_error"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--deepseek-key-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with httpx.Client(timeout=20, follow_redirects=False, trust_env=False) as client:
        report = {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "deepseek": check_deepseek(client, args.deepseek_key_file),
            "binance_spot": check_binance(client, False),
            "binance_futures": check_binance(client, True),
        }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
