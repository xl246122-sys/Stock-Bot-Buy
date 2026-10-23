"""Descriptive shadow research, never a strategy or a production signal."""
import json,time,statistics
from pathlib import Path
from contextlib import closing
from datetime import datetime
from zoneinfo import ZoneInfo
from v2.research_context import connection,ROOT

def summarize(rows):
 # Only compare consecutive regular-session five-minute candles. No execution claim.
 regular=[]
 for row in rows:
  d=datetime.fromtimestamp(row['t']/1000,ZoneInfo('America/New_York'))
  if d.weekday()<5 and 570<=d.hour*60+d.minute<960:regular.append(row)
 changes=[b['c']/a['c']-1 for a,b in zip(regular,regular[1:]) if b['t']-a['t']==300000]
 return {'regular_bars':len(regular),'consecutive_returns':len(changes),
         'five_minute_return_stdev':statistics.stdev(changes) if len(changes)>1 else None,
         'median_absolute_return':statistics.median([abs(v) for v in changes]) if changes else None,
         'max_five_minute_drop':min(changes,default=None),
         'max_five_minute_rise':max(changes,default=None)}

def build_report():
 now=int(time.time()*1000)
 pool=json.loads(Path(__file__).with_name('v2').joinpath('stocks-universe.json').read_text())
 items=[]
 with closing(connection()) as c:
  for item in pool:
   symbol=item['symbol']
   coverage=[dict(period=p,status=s,count=n,first=lo,last=hi) for p,s,n,lo,hi in c.execute('SELECT c.period,c.status,c.count,min(h.t),max(h.t) FROM coverage c LEFT JOIN history h ON c.symbol=h.symbol AND c.period=h.period WHERE c.symbol=? GROUP BY c.period',(symbol,))]
   rows=[json.loads(r[0]) for r in c.execute("SELECT payload FROM history WHERE symbol=? AND period='minute' ORDER BY t",(symbol,))]
   health=c.execute('SELECT at,status FROM news_health WHERE symbol=?',(symbol,)).fetchone()
   items.append({'symbol':symbol,'coverage':coverage,'research':summarize(rows),'news_health':health})
 report={'as_of':now,'source':'Massive split-adjusted USD US equities; not Binance executions','items':items,
 'downloaded_pairs':sum(x['status']=='download_complete' for i in items for x in i['coverage']),
 'expected_pairs':len(pool)*2,'research_status':'descriptive_only_no_validated_strategy',
 'limitations':['Session filtering excludes weekends but does not yet classify exchange holidays/early closes or missing-trade gaps.','No historical news availability proof; no news backtest.','No learned policy promoted; no hit-rate/profitability claim.','Historical pool uses current constituents; survivorship bias is possible.']}
 out=ROOT/'research-report.json';tmp=out.with_suffix('.tmp');tmp.write_text(json.dumps(report,ensure_ascii=False,indent=2));tmp.replace(out)
 print(json.dumps({'report':str(out),'downloaded_pairs':report['downloaded_pairs'],'expected_pairs':report['expected_pairs']}),flush=True)
 return report

if __name__=='__main__':build_report()
