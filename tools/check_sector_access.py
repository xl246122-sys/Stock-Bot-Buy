"""Read-only checks of existing Finnhub permissions; never print credentials."""
import json
import time
from pathlib import Path

import httpx
from dotenv import dotenv_values


def main():
    root = Path(__file__).resolve().parents[1]
    config = dotenv_values(root / ".env")
    key = config.get("FINNHUB_API_KEY")
    report = {"checked_at": int(time.time() * 1000), "source": "finnhub",
              "checks": {}, "buy_enabled": False}
    if not key:
        report["status"] = "no_configured_key"
    else:
        with httpx.Client(timeout=15, trust_env=False, follow_redirects=False,
                          headers={"X-Finnhub-Token": key}) as client:
            now = int(time.time())
            for name, endpoint, params in (
                ("company_market_cap", "/stock/profile2", {"symbol": "AAPL"}),
                ("sector_etf_quote", "/quote", {"symbol": "XLK"}),
                ("sector_etf_minute_bars", "/stock/candle",
                 {"symbol": "XLK", "resolution": "1", "from": now - 86400, "to": now}),
            ):
                try:
                    response = client.get("https://finnhub.io/api/v1" + endpoint, params=params)
                    result = {"http_status": response.status_code}
                    if response.status_code == 200:
                        payload = response.json()
                        result["returned_fields"] = sorted(payload) if isinstance(payload, dict) else []
                        if name == "company_market_cap":
                            result["has_market_cap"] = isinstance(payload.get("marketCapitalization"), (int, float))
                        if name == "sector_etf_minute_bars":
                            result["bar_status"] = payload.get("s")
                            result["bar_count"] = len(payload.get("t", []))
                    report["checks"][name] = result
                except Exception as exc:
                    report["checks"][name] = {"error_type": type(exc).__name__}
                time.sleep(1)
    output = root / "docs/implementation/sector-data-access.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
