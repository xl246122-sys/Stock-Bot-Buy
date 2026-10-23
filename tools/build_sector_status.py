"""Inspect sector slots and data access. No AI, orders or invented stock selections."""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.binance_provider import BinanceProvider
from server.v2.sector_universe import sector_trends


async def main(args):
    records = json.loads(args.metadata.read_text(encoding="utf-8")) if args.metadata else []
    async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
        universe = await BinanceProvider(client, metadata_records=records).universe()
    selected_symbols = {r["instrument_symbol"] for g in universe["selection"]["sectors"]
                        for key in ("mega", "mid_high_volatility") for r in g[key]}
    report = {
        "as_of": int(time.time() * 1000), "version": universe["version"],
        "target_stocks": 80, "target_sector_etfs": 8, "target_total": 88,
        "selection": universe["selection"],
        "sector_trends": sector_trends({}, now=int(time.time() * 1000)),
        "selected_and_available": [i["symbol"] for i in universe["available"]
                                   if i["symbol"] in selected_symbols],
        "research_only_count": sum(i["role"] == "research_candidate" for i in universe["available"]),
        "sector_etf_mapping_available": [i["underlying_symbol"] for i in universe["available"]
                                       if i["underlying_symbol"] in
                                       {g["etf"] for g in universe["selection"]["sectors"]}],
        "buy_enabled": False,
    }
    # Trends remain UNKNOWN here: exchangeInfo alone cannot establish a trend.
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    private = Path(".local/v2/sector-status.json")
    private.parent.mkdir(parents=True, exist_ok=True)
    private.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items()
                      if k not in {"selection", "sector_trends"}}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--output", type=Path, default=Path("docs/implementation/sector-first-status.json"))
    args = parser.parse_args()
    try:
        asyncio.run(main(args))
    except Exception as exc:
        print(json.dumps({"error_type": type(exc).__name__}))
        raise SystemExit(1)
