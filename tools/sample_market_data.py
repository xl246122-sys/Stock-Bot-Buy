"""Collect one read-only frozen bStocks snapshot, never issue signals."""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.binance_provider import BinanceProvider
from server.v2.market_data import freeze_snapshot
from server.v2.snapshot_store import SnapshotStore


async def main(args):
    async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
        provider = BinanceProvider(client)
        universe = await provider.universe()
        if args.symbol not in {s["symbol"] for s in universe["available"]}:
            raise ValueError("requested_symbol_is_not_available")
        cutoff = await provider.server_time()
        bars = await provider.history(args.symbol, end_time=cutoff, count=args.bars)
        as_of = int(time.time() * 1000)
        snapshot = freeze_snapshot(args.symbol, bars, as_of)
        store = SnapshotStore(args.database)
        store.save_bars(bars)
        store.save(snapshot)
        report = {
            "scope": "read_only_data_sample_not_live_scanner",
            "universe": universe, "snapshot_id": snapshot["snapshot_id"],
            "symbol": args.symbol, "as_of": as_of, "bar_count": len(bars),
            "feature_status": {k: {"status": v["status"], "count": v["count"]}
                               for k, v in snapshot["periods"].items()},
            "session_metrics": snapshot["session_metrics"],
            "data_eligible": snapshot["data_eligible"],
            "blocking_reasons": snapshot["blocking_reasons"],
            "buy_enabled": False,
            "execution_quote_status": "event_timestamped_bid_ask_not_connected",
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        summary = {key: value for key, value in report.items() if key != "universe"}
        summary["available_candidates_and_references"] = universe["available_count"]
        summary["missing_reference_candidates"] = len(universe["unavailable"])
        print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default="NVDABUSDT")
    parser.add_argument("--bars", type=int, default=3100)
    parser.add_argument("--database", type=Path, default=Path(".local/v2/snapshots.db"))
    parser.add_argument("--output", type=Path, default=Path("docs/implementation/market-sample.json"))
    args = parser.parse_args()
    try:
        asyncio.run(main(args))
    except Exception as exc:
        # Never include HTTP headers, credentials, or response bodies in CLI errors.
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__}))
        raise SystemExit(1)
