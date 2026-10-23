"""Collect three public reference trends, once or in an explicitly started local loop."""
import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import uuid4

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.binance_provider import BinanceProvider
from server.v2.collector import PoolCollector
from server.v2.snapshot_store import SnapshotStore


async def main(args):
    root = Path(__file__).resolve().parents[1] / ".local/v2"
    root.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
        collector = PoolCollector(BinanceProvider(client, references_only=True),
                                  SnapshotStore(root / "reference-snapshots.db"))
        while True:
            # 3,200 minutes warm up 200 completed 15m bars. This is a trend-only
            # view; 20-day RVOL and BUY eligibility are intentionally not claimed.
            result = await collector.collect(history_count=3200, persist_status=False)
            report = {k: result[k] for k in
                      ("cycle_id", "snapshot_as_of", "completed_at", "reference_trends", "failures", "counts")}
            report.update(as_of=result["snapshot_as_of"], buy_enabled=False,
                          purpose="reference_trends_only")
            destination = root / "reference-status.json"
            temporary = destination.with_name(f"reference-{uuid4()}.tmp")
            temporary.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
            temporary.replace(destination)
            print(json.dumps({"cycle_id": result["cycle_id"], "counts": result["counts"],
                              "trends": [{k: c[k] for k in ("etf", "trend", "reason")}
                                         for c in report["reference_trends"]],
                              "buy_enabled": False}, ensure_ascii=False), flush=True)
            if not args.watch:
                return
            await asyncio.sleep(30)  # Sequential collection: no overlapping cycles.


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", action="store_true",
                        help="Keep collecting locally until stopped; no AI or notifications")
    try:
        asyncio.run(main(parser.parse_args()))
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__}))
        raise SystemExit(1)
