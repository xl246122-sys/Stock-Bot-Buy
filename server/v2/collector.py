"""Bounded full-candidate collection, with persisted incremental history.

Cold backfill is not a one-minute scan. A separate refresh after backfill produces
one common input cutoff; all failures remain visible in the original denominator.
"""
import asyncio
import json
import time
from uuid import uuid4

from .binance_provider import BinanceProvider
from .market_data import MINUTE, freeze_snapshot, relative_strength
from .snapshot_store import SnapshotStore
from .sector_universe import sector_trends, reference_trends


class PoolCollector:
    def __init__(self, provider: BinanceProvider, store: SnapshotStore, concurrency: int = 3):
        if not 1 <= concurrency <= 5:
            raise ValueError("invalid_collection_concurrency")
        self.provider, self.store = provider, store
        self.semaphore = asyncio.Semaphore(concurrency)

    async def collect(self, *, history_count: int = 32000, persist_status: bool = True) -> dict:
        if not 1 <= history_count <= 32000:
            raise ValueError("invalid_history_count")
        started = int(time.time() * 1000)
        universe = await self.provider.universe()
        cutoff = await self.provider.server_time()
        failures, history = {}, {}

        async def update(item, end_time, cold=False):
            symbol = item["symbol"]
            async with self.semaphore:
                try:
                    cached = await asyncio.to_thread(
                        self.store.latest_bars, symbol, as_of=int(time.time() * 1000),
                        count=history_count)
                    # Refresh overlap for late revisions. Full backfill on gaps/short cache.
                    contiguous = all(b.open_time - a.open_time == MINUTE
                                     for a, b in zip(cached, cached[1:]))
                    coverage = await asyncio.to_thread(self.store.history_coverage, symbol)
                    requested_start = end_time // MINUTE * MINUTE - history_count * MINUTE
                    checked_window = (coverage and coverage[0] <= requested_start
                                      and 0 <= end_time - coverage[1] < 86_400_000)
                    needed = history_count
                    if cached and ((len(cached) >= history_count and contiguous) or checked_window):
                        needed = min(history_count, max(
                            5, (end_time // MINUTE * MINUTE - cached[-1].open_time) // MINUTE + 5))
                    fresh = await self.provider.history(symbol, end_time=end_time, count=needed)
                    await asyncio.to_thread(self.store.save_bars, fresh)
                    if needed == history_count:
                        await asyncio.to_thread(self.store.record_history_coverage,
                                                symbol, requested_start, end_time)
                    combined = {b.open_time: b for b in cached}
                    combined.update({b.open_time: b for b in fresh})
                    history[symbol] = sorted(combined.values(), key=lambda b: b.open_time)[-history_count:]
                    failures.pop(symbol, None)
                except Exception as exc:
                    failures[symbol] = {"stage": "backfill" if cold else "refresh",
                                        "error_type": type(exc).__name__}
                    history.pop(symbol, None)

        await asyncio.gather(*(update(item, cutoff, True) for item in universe["available"]))
        refresh_cutoff = await self.provider.server_time()
        await asyncio.gather(*(update(item, refresh_cutoff) for item in universe["available"]))
        as_of = int(time.time() * 1000)
        snapshots = {}
        for item in universe["available"]:
            symbol = item["symbol"]
            if symbol not in history:
                continue
            try:
                snapshot = await asyncio.to_thread(freeze_snapshot, symbol, history[symbol], as_of)
                await asyncio.to_thread(self.store.save, snapshot)
                snapshots[symbol] = snapshot
            except Exception as exc:
                failures[symbol] = {"stage": "features", "error_type": type(exc).__name__}
        references = [item["symbol"] for item in universe["available"] if item["role"] == "reference"]
        contexts = {}
        for item in universe["available"]:
            symbol = item["symbol"]
            if item["role"] != "candidate" or symbol not in history:
                continue
            contexts[symbol] = {
                ref: relative_strength(history[symbol][-60:], history[ref][-60:])
                for ref in references if ref in history
            }
        result = {
            "cycle_id": str(uuid4()), "started_at": started, "snapshot_as_of": as_of,
            "completed_at": int(time.time() * 1000), "universe": universe,
            "snapshots": snapshots, "relative_strength": contexts, "failures": failures,
            "sector_trends": sector_trends(snapshots, now=as_of),
            "reference_trends": reference_trends(snapshots, now=as_of),
            "counts": {
                "requested": universe["requested_count"],
                "available": len(universe["available"]), "snapshots": len(snapshots),
                "data_eligible": sum(s["data_eligible"] for s in snapshots.values()),
                "unavailable": len(universe["unavailable"]), "failed": len(failures),
            },
            "buy_enabled": False,
        }
        if persist_status and "selection" in universe:
            status = {
                "as_of": as_of, "target_stocks": 80, "target_sector_etfs": 8, "target_total": 88,
                "selection": universe["selection"], "sector_trends": result["sector_trends"],
                "buy_enabled": False,
            }
            destination = self.store.path.parent / "sector-status.json"
            temporary = destination.with_name("sector-status-" + result["cycle_id"] + ".tmp")
            temporary.write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
            temporary.replace(destination)
        return result
