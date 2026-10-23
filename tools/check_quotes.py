"""Short public stream verification; no background service left running."""
import asyncio
import argparse
import json
import sys
import time
from pathlib import Path
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.quotes import QuoteCache
from server.v2.binance_provider import BinanceProvider


async def main(all_symbols=False):
    symbols = {"NVDABUSDT", "AAPLBUSDT", "QQQBUSDT"}
    if all_symbols:
        async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
            universe = await BinanceProvider(client).universe()
            symbols = {item["symbol"] for item in universe["available"]}
    cache = QuoteCache(symbols)
    task = asyncio.create_task(cache.stream_once())
    report = {"status": "no_valid_quote", "symbols": [], "buy_enabled": False}
    try:
        async with asyncio.timeout(20):
            while True:
                if task.done():
                    await task
                    break
                quotes = [await cache.get(s) for s in sorted(cache.symbols)]
                if quotes and all(quotes):
                    report = {
                        "status": "verified", "received_at": int(time.time() * 1000),
                        "quotes": [q.model_dump() for q in quotes],
                        "buy_enabled": False,
                    }
                    break
                await asyncio.sleep(.2)
    except Exception as exc:
        report["error_type"] = type(exc).__name__
        report["http_status"] = getattr(getattr(exc, "response", None), "status_code", None)
        report["valid_symbols"] = [s for s in sorted(symbols) if await cache.get(s)]
        report["missing_symbols"] = [s for s in sorted(symbols) if not await cache.get(s)]
        report["status"] = "partial" if report["valid_symbols"] else "no_valid_quote"
        report["observed_symbols"] = sorted(cache.quotes)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    path = Path("docs/implementation/quote-stream-pool.json" if all_symbols
                else "docs/implementation/quote-stream-check.json")
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": report["status"],
                      "requested": len(symbols),
                      "valid": len(report.get("quotes", report.get("valid_symbols", []))),
                      "error_type": report.get("error_type"), "buy_enabled": False},
                     ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.all))
