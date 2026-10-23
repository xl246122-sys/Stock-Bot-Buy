"""Build a sourced US-equity research watchlist using existing Massive entitlement."""
import json
import argparse
import math
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import stdev

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
SEEDS = {
    "technology": ("XLK", "NVDA MSFT AAPL AVGO ORCL AMD PLTR", "DOCN BOX FSLY S AMBA QLYS TENB RPD CVLT NTNX GTLB ESTC PATH"),
    "communication": ("XLC", "GOOGL META NFLX TMUS VZ T DIS", "ROKU SNAP PINS MTCH IAC ZD NYT FOXA TKO TTWO WMG"),
    "consumer_discretionary": ("XLY", "AMZN TSLA HD MCD LOW TJX BKNG", "CROX BIRK ONON URBN AEO ANF GME CHWY W RH SHAK CAVA FND"),
    "financials": ("XLF", "BRK.B JPM V MA BAC WFC GS", "AFRM SOFI UPST LC KNSL RLI AXS MKTX VIRT PJT PIPR JHG"),
    "healthcare": ("XLV", "LLY JNJ ABBV UNH MRK ABT TMO", "RXRX CRSP BEAM NTLA VKTX HIMS IOVA EXEL INSM HALO ITCI INCY OSCR"),
    "industrials": ("XLI", "GE CAT RTX GEV BA HON UNP", "ACHR JOBY KTOS AVAV HXL SPR MRCY AIR ATKR ENS FLS"),
    "energy": ("XLE", "XOM CVX COP EOG WMB OKE SLB", "AR RRC CNX MTDR SM CIVI CHRD PR CRC VAL RIG HP PTEN LBRT NOV NOG UUUU"),
    "materials": ("XLB", "LIN SHW FCX ECL APD NEM CRH VMC", "AA CENX CDE HL AG PAAS SSRM HBM MP CC OLN HUN ASH AVNT SEE EXP"),
}


def main(profiles_only=False):
    key = dotenv_values(ROOT / ".env").get("FINNHUB_API_KEY")
    if not key:
        raise ValueError("existing_company_metadata_key_missing")
    now = datetime.now(timezone.utc)
    cache = ROOT / ".local/v2/watchlist-sources" / now.date().isoformat()
    cache.mkdir(parents=True, exist_ok=True)
    output = ROOT / "docs/implementation/verified-watchlist.json"
    with httpx.Client(timeout=25, trust_env=False, follow_redirects=False,
                      headers={"X-Finnhub-Token": key}) as client:
        def profile_for(ticker):
            name = "company-" + ticker
            dest = cache / (name + ".json")
            if dest.exists():
                return json.loads(dest.read_text(encoding="utf-8"))
            time.sleep(1.1)
            r = client.get("https://finnhub.io/api/v1/stock/profile2", params={"symbol": ticker})
            if r.status_code == 429:
                raise ValueError("rate_limited_resume_later")
            if r.status_code != 200:
                return {"error": "http_" + str(r.status_code)}
            data = r.json()
            # next_url may contain credentials; never persist or follow it.
            dest.write_text(json.dumps(data), encoding="utf-8")
            return data
        if profiles_only:
            for sector, (_, leaders, mids) in SEEDS.items():
                for ticker in dict.fromkeys((leaders + " " + mids).split()):
                    profile_for(ticker)
                print(sector, "company_profiles_cached", flush=True)
            return
        daily = {}
        sessions = [json.loads(f.read_text()) for f in sorted(cache.glob("grouped-*.json"))]
        sessions = [s for s in sessions if s.get("results")][-21:]
        if len(sessions) != 21:
            raise ValueError("requires_21_complete_daily_sessions")
        latest_session = max(b["t"] for b in sessions[-1]["results"])
        for data in sessions:
            if data.get("adjusted") is not True:
                raise ValueError("split_adjusted_daily_data_required")
            for bar in data.get("results", []):
                daily.setdefault(bar["T"], []).append(bar)
        groups = []
        for sector, (etf, leaders, mids) in SEEDS.items():
            records, rejected = [], []
            for ticker in dict.fromkeys((leaders + " " + mids).split()):
                profile = profile_for(ticker)
                cap = profile.get("marketCapitalization", 0) * 1e6
                latest_bars = daily.get(ticker, [])
                if (not profile.get("ticker") or not profile.get("name") or
                        not latest_bars or latest_bars[-1]["t"] != latest_session or
                        not isinstance(cap, (int, float)) or not math.isfinite(cap) or cap <= 0):
                    rejected.append({"symbol": ticker, "reason": "inactive_or_missing_company_metadata"})
                    continue
                row = {"symbol": ticker, "name": profile["name"], "issuer_id": profile["name"],
                       "sector_id": sector, "market_cap_usd": cap,
                       "provider_industry": profile.get("finnhubIndustry"),
                       "company_website": profile.get("weburl"),
                       "metadata_source": "https://finnhub.io/api/v1/stock/profile2?symbol=" + ticker,
                       "retrieved_at": now.isoformat(), "classification_basis": "reviewed_sector_candidate",
                       "latest_daily_bar_time": latest_bars[-1]["t"],
                       "exchange": profile.get("exchange")}
                if ticker in leaders.split():
                    if cap <= 20e9:
                        rejected.append({"symbol": ticker, "reason": "leader_below_large_cap_range"})
                        continue
                    row["group"] = "sector_large_leader"
                    records.append(row)
                elif 2e9 <= cap <= 20e9:
                    bars = sorted(daily.get(ticker, []), key=lambda b: b["t"])
                    closes = [b["c"] for b in bars[-21:]]
                    if len(closes) != 21 or any(not math.isfinite(x) or x <= 0 for x in closes):
                        rejected.append({"symbol": ticker, "reason": "daily_history_insufficient"})
                        continue
                    row.update(group="mid_high_volatility",
                               volatility_20d=stdev(math.log(b/a) for a,b in zip(closes,closes[1:])),
                               volatility_basis="us_equity_split_adjusted_daily_log_returns_20",
                               volatility_last_bar=bars[-1]["t"],
                               volatility_source="https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks",
                               volatility_observations=21)
                    records.append(row)
                else:
                    rejected.append({"symbol": ticker, "reason": "outside_mid_cap_range", "market_cap_usd": cap})
            selected_leaders = sorted((r for r in records if r["group"] == "sector_large_leader"),
                                      key=lambda r: -r["market_cap_usd"])[:5]
            selected_mid = sorted((r for r in records if r["group"] == "mid_high_volatility"),
                                  key=lambda r: -r["volatility_20d"])[:5]
            groups.append({"sector_id": sector, "etf": etf, "leaders": selected_leaders,
                           "mid_high_volatility": selected_mid, "candidate_records": records,
                           "rejected": rejected})
            report = {"retrieved_at": now.isoformat(), "target": 80, "sectors": groups,
                      "selected_count": sum(len(g["leaders"])+len(g["mid_high_volatility"]) for g in groups),
                      "selection_basis": "ranked_within_reviewed_candidates_not_whole_market",
                      "mid_cap_range_usd": [2e9, 20e9], "buy_enabled": False}
            output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(sector, "leaders", len(selected_leaders), "mid", len(selected_mid), flush=True)


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--profiles-only", action="store_true")
        main(parser.parse_args().profiles_only)
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__,
                          "code": str(exc) if type(exc) is ValueError else "request_or_schema_failure"}))
        raise SystemExit(1)
