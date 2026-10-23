"""Public spot discovery and bounded reference probes; no credentials or AI calls."""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.market_data import from_kline, validate_series
from server.v2.sector_universe import SECTORS

BASE = "https://data-api.binance.vision"


def main():
    with httpx.Client(timeout=20, trust_env=False, follow_redirects=False) as client:
        def get(path, **params):
            time.sleep(0.2)
            response = client.get(BASE + path, params=params)
            response.raise_for_status()  # Stop on limits; no retry storm.
            return response.json()

        info = get("/api/v3/exchangeInfo")["symbols"]
        by_symbol = {s["symbol"]: s for s in info}
        server_time = int(get("/api/v3/time")["serverTime"])
        end = server_time // 60_000 * 60_000
        probes = []
        for underlying, role in (("SPY", "broad_market"), ("QQQ", "nasdaq100"),
                                 ("SMH", "semiconductors")):
            symbol = underlying + "BUSDT"
            item = by_symbol.get(symbol, {})
            valid = (item.get("status") == "TRADING"
                     and item.get("baseAsset") == underlying + "B"
                     and item.get("quoteAsset") == "USDT"
                     and item.get("isSpotTradingAllowed") is not False)
            probe = {"symbol": symbol, "role": role, "spot_trading": valid,
                     "instrument_type": "tokenized_etf_reference", "currency": "USDT"}
            if valid:
                rows = get("/api/v3/klines", symbol=symbol, interval="1m",
                           startTime=end - 60 * 60_000, endTime=end - 1, limit=60)
                bars = validate_series([from_kline(symbol, r, server_time) for r in rows])
                book = get("/api/v3/ticker/bookTicker", symbol=symbol)
                probe.update({
                    "completed_1m_bars": len(bars),
                    "missing_minutes_in_60m_window": 60 - len(bars),
                    "latest_close_time": bars[-1].close_time if bars else None,
                    "book": {k: book.get(k) for k in
                             ("symbol", "bidPrice", "bidQty", "askPrice", "askQty")},
                    "book_received_at": int(time.time() * 1000),
                    "book_event_time": None,
                    "book_note": "REST response lacks event timestamp; not proof of execution freshness",
                })
            probes.append(probe)
        # Suffix matches are discovery leads only, never proof of security identity.
        candidates = [{k: s.get(k) for k in ("symbol", "baseAsset", "quoteAsset", "status")}
                      for s in info if s.get("baseAsset", "").endswith("B")
                      and s.get("quoteAsset") == "USDT"]
        report = {
            "checked_at": datetime.now(timezone.utc).isoformat(), "endpoint": BASE,
            "spot_symbol_count": len(info), "reference_probes": probes,
            "sector_mapping_checks": [
                {"etf": etf, "queried_symbol": etf + "BUSDT",
                 "status": by_symbol.get(etf + "BUSDT", {}).get("status", "NOT_LISTED")}
                for _, _, etf in SECTORS],
            "suffix_candidates_identity_unverified": candidates,
            "discovery_note": "Full spot inventory inspected; suffix alone is not a security classification",
            "equity_sapi_status": "not_called_no_configured_binance_key",
            "external_paid_data_required": "not_established",
        }
        output = Path("docs/implementation/binance-reference-discovery.json")
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({k: v for k, v in report.items()
                          if k != "suffix_candidates_identity_unverified"}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__}))
        raise SystemExit(1)
