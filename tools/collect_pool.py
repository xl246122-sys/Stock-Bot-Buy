"""Run one full-pool read-only data cycle; no model calls or notifications."""
import argparse
import asyncio
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.binance_provider import BinanceProvider
from server.v2.collector import PoolCollector
from server.v2.snapshot_store import SnapshotStore


async def main(args):
    records = json.loads(args.metadata.read_text(encoding="utf-8-sig")) if args.metadata else []
    async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
        result = await PoolCollector(BinanceProvider(client, metadata_records=records), SnapshotStore(args.database)).collect(
            history_count=args.bars)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Complete frozen inputs remain in the private audit directory.
    private = args.database.parent / ("cycle-" + result["cycle_id"] + ".json")
    private.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    report = {k: v for k, v in result.items() if k not in {"snapshots", "relative_strength"}}
    report["snapshot_status"] = {
        symbol: {"snapshot_id": s["snapshot_id"], "data_eligible": s["data_eligible"],
                 "blocking_reasons": s["blocking_reasons"]}
        for symbol, s in result["snapshots"].items()
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"cycle_id": result["cycle_id"], "counts": result["counts"],
                      "duration_seconds": (result["completed_at"] - result["started_at"]) / 1000,
                      "buy_enabled": False}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--bars", type=int, default=32000)
    parser.add_argument("--metadata", type=Path, help="Verified company and measured volatility records")
    parser.add_argument("--database", type=Path, default=Path(".local/v2/snapshots.db"))
    parser.add_argument("--output", type=Path, default=Path("docs/implementation/pool-collection.json"))
    args = parser.parse_args()
    try:
        asyncio.run(main(args))
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__}))
        raise SystemExit(1)
