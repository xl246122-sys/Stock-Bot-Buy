"""Publish verified research records and US ETF historical trends to the local UI."""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.v2.us_etf import etf_card
from server.v2.sector_universe import SECTORS

ROOT = Path(__file__).resolve().parents[1]


def main():
    now = int(time.time()*1000)
    folder = ROOT / ".local/v2/watchlist-sources" / datetime.now(timezone.utc).date().isoformat()
    report = json.loads((ROOT / "docs/implementation/verified-watchlist.json").read_text(encoding="utf-8"))
    # Current exchangeInfo, not a guessed suffix, determines product availability.
    import httpx
    with httpx.Client(timeout=20, trust_env=False, follow_redirects=False) as client:
        r = client.get("https://data-api.binance.vision/api/v3/exchangeInfo")
        r.raise_for_status()
        spot = {s["symbol"]: s for s in r.json()["symbols"]}
    all_selected = []
    for group in report["sectors"]:
        if len(group["leaders"]) != 5 or len(group["mid_high_volatility"]) != 5:
            raise ValueError("sector_group_incomplete")
        for key in ("leaders", "mid_high_volatility"):
            for row in group[key]:
                ticker = row["symbol"]
                symbol = ticker.replace(".", "") + "BUSDT"
                item = spot.get(symbol, {})
                available = (item.get("status") == "TRADING" and item.get("quoteAsset") == "USDT"
                             and item.get("baseAsset") == ticker.replace(".", "") + "B")
                row["binance_spot_symbol"] = symbol if available else None
                row["binance_mapping_status"] = "spot_code_available_identity_review_required" if available else "not_found"
                all_selected.append(row)
    if len(all_selected) != 80 or len({r["symbol"] for r in all_selected}) != 80:
        raise ValueError("watchlist_not_80_unique_symbols")
    if len({r["issuer_id"] for r in all_selected}) != 80:
        raise ValueError("duplicate_issuer")
    report["binance_spot_code_available_count"] = sum(r["binance_spot_symbol"] is not None for r in all_selected)
    cards = []
    for _, _, etf in SECTORS:
        payload = json.loads((folder / ("etf-" + etf + ".json")).read_text())
        cards.append(etf_card(etf, payload, now=now))
    published = {"as_of": now, "watchlist": report, "us_etf_trends": cards, "buy_enabled": False}
    target = ROOT / ".local/v2/us-equity-research.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(published, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(target)
    (ROOT / "docs/implementation/us-etf-coverage.json").write_text(
        json.dumps({"as_of": now, "cards": cards, "buy_enabled": False}, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "docs/implementation/verified-watchlist.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# 八板块 ETF 与真实 80 股观察名单", "",
        "日期：2026-10-20。此版本落实用户确认的每板块 5 家市值前列大型企业＋5 家高波动中型企业；中型市值为 20 亿—200 亿美元。", "",
        "80 家是美股观察对象，不表示币安有 80 个可交易映射。"
        f"本次仅 {report['binance_spot_code_available_count']} 家找到对应现货代码，代码身份仍需独立复核。新 BUY 仍关闭。", "",
        "## 八板块名单", "",
        "| 板块 | ETF | 大型企业（5 家） | 中型企业（5 家，按观察波动率降序） |",
        "|---|---|---|---|",
    ]
    names = {s: name for s, name, _ in SECTORS}
    for g in report["sectors"]:
        lines.append(f"| {names[g['sector_id']]} | {g['etf']} | "
                     + "、".join(r["symbol"] for r in g["leaders"]) + " | "
                     + "、".join(r["symbol"] for r in g["mid_high_volatility"]) + " |")
    lines += ["", "## 数据与筛选口径", "",
              "- 使用项目已有 Finnhub 公司资料和 Massive 历史行情权限；未新增订阅或采购。",
              "- 公司名称、美元市值、行业及来源记录在 verified-watchlist.json；市值由 Finnhub 的百万美元值换算为美元。基础公司市值不是代币市值。",
              "- 在经审查的候选集内选择大型企业，不声称穷尽全市场排名。中型企业按 21 个完整交易日收盘价形成的 20 个对数收益样本标准差排序；未年化，拆股调整，不是含分红的总回报。高波动为候选集内相对排名，不承诺未来波动。",
              "- 最近完整日线用于确认仍有行情；同一公司不同股类不重复占位。美股包含美国上市的外国公司及 ADR。",
              "- 不用已被收购或缺乏最近日线的旧代码凑数；公司资料七日后需要刷新。观察名单可随市值和波动变化调整。",
              "", "## 八只 ETF 数据验收", "",
              "真实 ETF 与 Binance 映射严格分开：来源 massive_us_equity，币种 USD，时段 America/New_York。"
              "下表为历史样本，不能作为当前实时行情或直接触发 BUY。实时订阅权限、实时延迟和跨源决策仍未验收。", "",
              "| ETF | 有效常规时段分钟数 | 1m / 5m / 15m 完整周期数 | 历史方向 | 最后分钟收盘（UTC） |",
              "|---|---:|---|---|---|"]
    for c in cards:
        stamp = datetime.fromtimestamp(c["latest_bar_close_time"]/1000, timezone.utc).isoformat()
        lines.append(f"| {c['etf']} | {c['regular_minute_count']} | "
                     + " / ".join(str(c["periods"][p]["count"]) for p in ("1m", "5m", "15m"))
                     + f" | {c['last_observed_trend']} | {stamp} |")
    lines += ["", "缺失分钟不填补，不完整 5m/15m 桶不参与计算；具体缺口数见 us-etf-coverage.json。"
              "夜间、周末及无成交区间不合成 bar。历史指标按已有完整交易时段观测计算，不提供交易日历驱动的实时开市判断。",
              "", "## 80 家明细", "",
              "| 板块 | 分组 | 代码 | 公司 | 市值（十亿美元） | 20 日收益标准差（%） | 币安现货代码 |",
              "|---|---|---|---|---:|---:|---|"]
    for g in report["sectors"]:
        for key, label in (("leaders", "大型"), ("mid_high_volatility", "中型")):
            for r in g[key]:
                vol = f"{r['volatility_20d']*100:.2f}" if "volatility_20d" in r else "—"
                lines.append(f"| {names[g['sector_id']]} | {label} | {r['symbol']} | {r['name']} | "
                             f"{r['market_cap_usd']/1e9:.2f} | {vol} | {r['binance_spot_symbol'] or '未找到'} |")
    lines += ["", "## 本地更新与查看", "",
              "按顺序执行以下脚本；前两个读取已有账户权限，遇限流停止，已完成请求留在本地缓存。"
              "分钟历史每日期初次抓取后缓存，本脚本用于历史验收，不是实时采集服务。", "",
              "```powershell",
              "python tools/fetch_watchlist_market.py",
              "python tools/build_verified_watchlist.py --profiles-only",
              "python tools/build_verified_watchlist.py",
              "python tools/publish_watchlist.py",
              "npm run build",
              "python -m uvicorn server.v2.preview:app --host 127.0.0.1 --port 8765",
              "```", "",
              "访问 `http://127.0.0.1:8765/#sector-radar`。新数据接入只读看板，"
              "未把这份真实美股日线筛选记录伪装成币安执行数据，也未放开影子调度的实时买入门禁。", "",
              "来源：[Finnhub 公司资料](https://finnhub.io/docs/api/company-profile2)、"
              "[Massive 分钟历史](https://massive.com/docs/rest/stocks/aggregates/custom-bars)、"
              "[Massive 日度市场汇总](https://massive.com/docs/rest/stocks/aggregates/daily-market-summary)。",
              ""]
    (ROOT / "docs/implementation/八板块ETF与80股名单.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"stocks": len(all_selected), "etfs": len(cards),
                      "binance_codes": report["binance_spot_code_available_count"]}))


if __name__ == "__main__":
    main()
