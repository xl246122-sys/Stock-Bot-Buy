"""Conservative 5-minute opening breakout research, not live-model validation."""
import json,sys
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

rows=defaultdict(list)
for symbol,period,t,payload in json.load(open(sys.argv[1],encoding='utf-8')):
    dt=datetime.fromtimestamp(t/1000,ZoneInfo('America/New_York'))
    if period=='minute' and '2026-07-23'<=str(dt.date())<='2026-10-22' and 570<=dt.hour*60+dt.minute<960:
        rows[symbol,str(dt.date())].append((dt,json.loads(payload)))
trades=[]
for (symbol,day),bars in rows.items():
    bars.sort(key=lambda x:x[0]); first=bars[0]
    if first[0].hour*60+first[0].minute!=570:continue
    for i in range(1,min(6,len(bars)-1)):
        dt,b=bars[i]
        if dt.hour*60+dt.minute>=600:break
        if b['c']<=first[1]['h'] or b['v']<=first[1]['v']:continue
        entrydt,entrybar=bars[i+1]
        if entrydt.hour*60+entrydt.minute>=600:break
        entry=entrybar['o']*1.001
        target=entry*1.01/.999;stop=entry*.99/.999
        reason='TIME';exitprice=None
        for outdt,out in bars[i+1:]:
            # Stop wins ambiguous bars; adverse gaps filled at open.
            if out['l']<=stop:exitprice=min(out['o'],stop)*.999;reason='STOP';break
            if out['h']>=target:exitprice=target*.999;reason='TARGET';break
            exitprice=out['c']*.999
            if (outdt-entrydt).total_seconds()>=10500:break
        trades.append(dict(symbol=symbol,day=day,net=exitprice/entry-1,reason=reason))
        break
def stats(ts):
    return dict(n=len(ts),win_rate=sum(t['net']>0 for t in ts)/len(ts) if ts else None,
                mean_net=sum(t['net'] for t in ts)/len(ts) if ts else None)
result={'method':'5m opening breakout proxy; not the quote-based live model; independent opportunities, no portfolio claim',
        'cost':'10bp entry and 10bp exit reserve; sensitivity testing required',
        'development':stats([t for t in trades if t['day']<'2026-09-01']),
        'validation':stats([t for t in trades if '2026-09-01'<=t['day']<'2026-10-01']),
        'holdout':stats([t for t in trades if t['day']>='2026-10-01']), 'trades':trades}
with open(sys.argv[2],'w',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
print({k:v for k,v in result.items() if k!='trades'})
