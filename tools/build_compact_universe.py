"""Build a reviewable <=200 pool from independently verified candidate records."""
import argparse
import json
import sys
from datetime import date
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server.v2.compact_universe import select

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('records');p.add_argument('report');p.add_argument('--as-of',required=True)
    p.add_argument('--output-pool')
    a=p.parse_args()
    result=select(json.loads(Path(a.records).read_text(encoding='utf-8')),date.fromisoformat(a.as_of))
    Path(a.report).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    missing=sum(sum(v.values()) for v in result['gaps'].values())
    if a.output_pool:
        if missing:raise SystemExit(f'Refusing to publish incomplete pool: {missing} missing company slots; see report')
        Path(a.output_pool).write_text(json.dumps(result['instruments'],ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"Selected {len(result['instruments'])} instruments; missing company slots: {missing}")
