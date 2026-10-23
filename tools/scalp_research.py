"""Describe actual coverage; never label OHLC excursions as executable profits."""
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def analyze(source):
    groups = defaultdict(list)
    for symbol, period, timestamp, payload in json.loads(Path(source).read_text()):
        day = datetime.fromtimestamp(timestamp / 1000, ZoneInfo('America/New_York'))
        if '2026-07-23' <= day.date().isoformat() <= '2026-10-22':
            groups[symbol, period].append((day, json.loads(payload)))
    result = []
    for (symbol, period), rows in sorted(groups.items()):
        opening = [(d, b) for d, b in rows if 570 <= d.hour*60+d.minute < 600]
        result.append(dict(symbol=symbol, period=period, bars=len(rows),
                           first=rows[0][0].isoformat(), last=rows[-1][0].isoformat(),
                           sessions=len({d.date() for d, _ in rows}),
                           opening_bars=len(opening),
                           opening_mean_range_pct=(sum((b['h']/b['l']-1)*100 for _,b in opening)/len(opening)) if opening else None))
    return {'window':['2026-07-23','2026-10-22'], 'coverage':result,
            'warning':'Ranges are descriptive, not strategy returns; no seconds-level execution or win-rate claim.'}


if __name__ == '__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');a=p.parse_args()
    Path(a.output).write_text(json.dumps(analyze(a.source),ensure_ascii=False,indent=2),encoding='utf-8')
