"""Sector-first universe selection. Missing classifications never become invented slots."""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from statistics import stdev


SECTORS = (
    ("technology", "科技", "XLK"),
    ("communication", "通信服务", "XLC"),
    ("consumer_discretionary", "可选消费", "XLY"),
    ("financials", "金融", "XLF"),
    ("healthcare", "医疗", "XLV"),
    ("industrials", "工业", "XLI"),
    ("energy", "能源", "XLE"),
    ("materials", "材料", "XLB"),
)
SECTOR_MAP = {s: {"name": name, "etf": etf} for s, name, etf in SECTORS}
VERSION = "sector-eight-leaders-mid-2to20b-v2"


@dataclass(frozen=True)
class SelectionPolicy:
    # Project definitions, not universal market-cap standards.
    # Legacy "mega" field names remain for compatibility; this group now means leaders.
    mega_min_usd: float = 20_000_000_000
    mid_min_usd: float = 2_000_000_000
    mid_max_usd: float = 20_000_000_000
    per_group: int = 5
    metadata_max_age_days: int = 7

    def __post_init__(self):
        if (self.per_group != 5 or not 0 < self.mid_min_usd <= self.mid_max_usd <= self.mega_min_usd
                or not all(math.isfinite(v) for v in
                           (self.mega_min_usd, self.mid_min_usd, self.mid_max_usd))):
            raise ValueError("invalid_sector_selection_policy")


def realized_volatility(closes: list[float]) -> float | None:
    """20 observed daily log returns, unannualized. No synthetic or partial days."""
    if len(closes) < 21 or any(not math.isfinite(v) or v <= 0 for v in closes):
        return None
    values = closes[-21:]
    return stdev(math.log(b / a) for a, b in zip(values, values[1:]))


def select_universe(records: list[dict], *, as_of: date,
                    policy: SelectionPolicy = SelectionPolicy()) -> dict:
    """Accept independently sourced company metadata and measured volatility.

    records: underlying_symbol, issuer_id, sector_id, market_cap_usd, metadata_as_of,
    metadata_source, instrument_symbol, volatility_20d, volatility_as_of,
    volatility_source, volatility_basis. A token's capitalization is not company cap.
    """
    valid, rejected = [], []
    symbol_counts = {}
    for record in records:
        symbol = record.get("underlying_symbol")
        if isinstance(symbol, str):
            symbol_counts[symbol] = symbol_counts.get(symbol, 0) + 1
    for record in records:
        symbol = record.get("underlying_symbol")
        try:
            cap = record["market_cap_usd"]
            observed = date.fromisoformat(record["metadata_as_of"])
            if not isinstance(symbol, str) or not symbol or symbol_counts[symbol] != 1:
                raise ValueError("duplicate_or_missing_symbol")
            if record.get("sector_id") not in SECTOR_MAP:
                raise ValueError("outside_selected_sectors")
            if not all(isinstance(record.get(k), str) and record[k].strip()
                       for k in ("issuer_id", "metadata_source", "instrument_symbol")):
                raise ValueError("missing_identity_or_provenance")
            if isinstance(cap, bool) or not isinstance(cap, (float, int)) or not math.isfinite(cap) or cap <= 0:
                raise ValueError("unknown_market_cap")
            if record.get("market_cap_basis") != "underlying_company_usd":
                raise ValueError("company_market_cap_required")
            if not 0 <= (as_of - observed).days <= policy.metadata_max_age_days:
                raise ValueError("stale_or_future_metadata")
            if not record.get("instrument_symbol"):
                raise ValueError("execution_mapping_missing")
            valid.append(record.copy())
        except (KeyError, TypeError, ValueError) as exc:
            rejected.append({"symbol": symbol, "reason": str(exc) if type(exc) is ValueError else "metadata_incomplete"})
    # Share classes and conflicting issuer classifications must not fill two slots.
    issuer_sectors = {}
    for row in valid:
        issuer_sectors.setdefault(row["issuer_id"], set()).add(row["sector_id"])
    by_issuer = {}
    for row in sorted(valid, key=lambda r: (-r["market_cap_usd"], r["underlying_symbol"])):
        if len(issuer_sectors[row["issuer_id"]]) != 1:
            rejected.append({"symbol": row["underlying_symbol"], "reason": "issuer_sector_conflict"})
        elif row["issuer_id"] in by_issuer:
            rejected.append({"symbol": row["underlying_symbol"], "reason": "duplicate_issuer_share_class"})
        else:
            by_issuer[row["issuer_id"]] = row
    groups = []
    for sector_id, name, etf in SECTORS:
        rows = [r for r in by_issuer.values() if r["sector_id"] == sector_id]
        mega = sorted((r for r in rows if r["market_cap_usd"] > policy.mega_min_usd),
                      key=lambda r: (-r["market_cap_usd"], r["underlying_symbol"]))[:5]
        mids = []
        for r in rows:
            if not policy.mid_min_usd <= r["market_cap_usd"] <= policy.mid_max_usd:
                continue
            vol = r.get("volatility_20d")
            try:
                age = (as_of - date.fromisoformat(r["volatility_as_of"])).days
                if (isinstance(vol, bool) or not isinstance(vol, (int, float))
                        or not math.isfinite(vol) or vol < 0 or not 0 <= age <= 3
                        or not r.get("volatility_source")
                        or r.get("volatility_basis") != "binance_spot_UTC_daily_log_returns_20"):
                    raise ValueError("unverified_volatility")
                mids.append(r)
            except (KeyError, TypeError, ValueError):
                rejected.append({"symbol": r["underlying_symbol"], "reason": "unverified_volatility"})
        mid = sorted(mids, key=lambda r: (-r["volatility_20d"], r["underlying_symbol"]))[:5]
        groups.append({
            "sector_id": sector_id, "name": name, "etf": etf,
            "mega": mega, "mid_high_volatility": mid,
            "missing_mega": 5 - len(mega), "missing_mid": 5 - len(mid),
        })
    return {"version": VERSION, "as_of": as_of.isoformat(), "target_stocks": 80,
            "sector_etfs": 8, "total_target": 88, "sectors": groups,
            "selected_count": sum(len(g["mega"]) + len(g["mid_high_volatility"]) for g in groups),
            "rejected": rejected, "selection_basis": "verified_candidate_records_not_entire_market"}


REFERENCE_GROUPS = (
    ("broad_market", "标普 500 大盘", "SPY"),
    ("nasdaq100", "纳斯达克 100", "QQQ"),
    ("semiconductors", "半导体", "SMH"),
)


def sector_trends(snapshots: dict, *, now: int) -> list[dict]:
    return _trend_cards(snapshots, now=now, groups=SECTORS)


def reference_trends(snapshots: dict, *, now: int) -> list[dict]:
    cards = _trend_cards(snapshots, now=now, groups=REFERENCE_GROUPS)
    for card in cards:
        card["reference_id"] = card.pop("sector_id")
        card["scope"] = "market_or_subindustry_reference"
        card["replaces_sector_etf"] = False
    return cards


def _trend_cards(snapshots: dict, *, now: int, groups: tuple) -> list[dict]:
    """Technical direction labels only, never an independent BUY strategy.

    Until a genuine ETF adapter exists, only exact ETF-token mappings may be used,
    and they must remain explicitly labelled as mappings rather than ETF spot prices.
    """
    cards = []
    for sector_id, name, etf in groups:
        symbol = etf + "BUSDT"
        snapshot = snapshots.get(symbol)
        card = {"sector_id": sector_id, "name": name, "etf": etf,
                "instrument_symbol": symbol, "instrument_type": "tokenized_etf_reference",
                "currency": "USDT", "trend": "UNKNOWN", "periods": {},
                "reason": "sector_etf_mapping_unavailable", "evidence_ids": []}
        if snapshot:
            card["as_of"] = snapshot.get("as_of")
            card["snapshot_id"] = snapshot.get("snapshot_id")
            if snapshot.get("symbol") != symbol or snapshot.get("feed") != "binance_spot_bstocks":
                card["reason"] = "reference_identity_mismatch"
            elif not 0 <= now - snapshot["as_of"] <= 90_000:
                card["reason"] = "stale_or_future_reference"
            else:
                for period in ("1m", "5m", "15m"):
                    feature = snapshot.get("periods", {}).get(period, {})
                    bars = feature.get("recent_bars") or []
                    if (feature.get("status") != "ready" or not bars
                            or not 0 < now - bars[-1]["close_time"] <= (int(period[:-1]) * 60_000 + 90_000)):
                        card["periods"][period] = {"direction": "UNKNOWN", "reason": "missing_or_stale_period"}
                        continue
                    close, fast, slow, slope = (
                        bars[-1]["close"], feature.get("ema9"), feature.get("ema20"),
                        feature.get("ema20_change_1bar"))
                    if not all(isinstance(v, (float, int)) and math.isfinite(v)
                               for v in (close, fast, slow, slope)):
                        card["periods"][period] = {"direction": "UNKNOWN", "reason": "missing_indicator"}
                        continue
                    direction = ("UP" if close > fast > slow and slope > 0 else
                                 "DOWN" if close < fast < slow and slope < 0 else "MIXED")
                    card["periods"][period] = {"direction": direction, "close": close,
                                             "bar_close_time": bars[-1]["close_time"],
                                             "ema9": fast, "ema20": slow, "ema20_change_1bar": slope}
                    card["evidence_ids"].append(snapshot["snapshot_id"] + ":" + period + ":ema20")
                directions = [p["direction"] for p in card["periods"].values()]
                if len(directions) == 3 and "UNKNOWN" not in directions:
                    card["trend"] = directions[0] if len(set(directions)) == 1 else "MIXED"
                    card["reason"] = None
                else:
                    card["reason"] = "incomplete_trend_periods"
        cards.append(card)
    return cards
