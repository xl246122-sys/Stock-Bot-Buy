"""Bounded, rate-paced historical market inputs; no orders or paid plan changes."""
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
import httpx
from dotenv import dotenv_values
from build_verified_watchlist import ROOT, SEEDS


def main():
    now = datetime.now(timezone.utc)
    root = ROOT / ".local/v2/watchlist-sources" / now.date().isoformat()
    root.mkdir(parents=True, exist_ok=True)
    key = dotenv_values(ROOT / ".env")["MASSIVE_API_KEY"]
    wanted = set(" ".join(x[1] + " " + x[2] for x in SEEDS.values()).split())
    last = 0.
    with httpx.Client(timeout=40, trust_env=False, follow_redirects=False,
                      headers={"Authorization": "Bearer " + key}) as client:
        def get(name, path, params, grouped=False):
            nonlocal last
            dest = root / (name + ".json")
            if dest.exists():
                return json.loads(dest.read_text())
            time.sleep(max(0, 13.1 - (time.monotonic() - last)))
            last = time.monotonic()
            r = client.get("https://api.massive.com" + path, params=params)
            if r.status_code != 200:
                raise ValueError("http_" + str(r.status_code))
            data = r.json()
            data.pop("next_url", None)
            if grouped:
                data["results"] = [b for b in data.get("results", []) if b["T"] in wanted]
            dest.write_text(json.dumps(data), encoding="utf-8")
            return data
        for etf, _, _ in SEEDS.values():
            data = get("etf-" + etf,
                       f"/v2/aggs/ticker/{etf}/range/1/minute/{(now-timedelta(days=21)).date()}/{now.date()}",
                       {"adjusted": "true", "sort": "asc", "limit": 50000})
            print(etf, "minute_bars", len(data.get("results", [])), flush=True)
        day, count = now.date() - timedelta(days=1), 0
        while count < 21 and (now.date() - day).days <= 42:
            if day.weekday() < 5:
                data = get("grouped-" + day.isoformat(),
                           "/v2/aggs/grouped/locale/us/market/stocks/" + day.isoformat(),
                           {"adjusted": "true", "include_otc": "false"}, grouped=True)
                if data.get("results"):
                    count += 1
                print(day.isoformat(), "sessions", count, flush=True)
            day -= timedelta(days=1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(type(exc).__name__, str(exc) if type(exc) is ValueError else "request_failed")
        raise SystemExit(1)
