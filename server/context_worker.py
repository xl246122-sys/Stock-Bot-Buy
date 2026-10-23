"""Rate-paced resumable history backfill and ongoing news ingestion."""
import argparse,json,time,os
from pathlib import Path
from datetime import datetime,timezone,timedelta
from contextlib import closing
from urllib.parse import urlparse
import httpx
from v2.research_context import connection,validate_bar
POOL=json.loads(Path(__file__).parent.joinpath('v2/stocks-universe.json').read_text())
SYMBOLS=list(dict.fromkeys([r['symbol'] for r in sorted(POOL,key=lambda r:r['group']!='reference')]))
KEYS=json.loads(Path('/etc/stock-g/research-keys.json').read_text())
LAST=0

def get(c,url,params=None,news=False):
 global LAST
 time.sleep(max(0,(1.2 if news else 13.1)-(time.monotonic()-LAST)))
 LAST=time.monotonic()
 if urlparse(url).hostname not in ['api.massive.com','api.finnhub.io','finnhub.io']:raise ValueError('invalid_pagination_host')
 r=c.get(url,params=params,headers={'X-Finnhub-Token':KEYS['FINNHUB_API_KEY']} if news else {'Authorization':'Bearer '+KEYS['MASSIVE_API_KEY']},follow_redirects=False)
 r.raise_for_status();return r.json()

def history():
 with httpx.Client(timeout=40,trust_env=False) as c:
  for symbol in SYMBOLS:
   for period,mult,duration in [('minute',5,300000),('day',1,86400000)]:
    with closing(connection()) as d:
     done=d.execute('SELECT status,at FROM coverage WHERE symbol=? AND period=?',(symbol,period)).fetchone()
     last=d.execute('SELECT max(t) FROM history WHERE symbol=? AND period=?',(symbol,period)).fetchone()[0]
    if done and done[0]=='download_complete' and datetime.fromtimestamp(done[1]/1000,timezone.utc).date()==datetime.now(timezone.utc).date():continue
    now=int(time.time()*1000);end=(datetime.now(timezone.utc)-timedelta(days=1)).date().isoformat()
    start='2026-07-22'
    if last and done and done[0]=='download_complete':start=(datetime.fromtimestamp(last/1000,timezone.utc)-timedelta(days=3)).date().isoformat()
    url=f'https://api.massive.com/v2/aggs/ticker/{symbol}/range/{mult}/{period}/{start}/{end}'
    params={'adjusted':'true','sort':'asc','limit':50000};status='download_complete';pages=set()
    try:
     for _ in range(100):
      if url in pages:raise ValueError('pagination_loop')
      pages.add(url);data=get(c,url,params)
      if data.get('ticker')!=symbol or data.get('adjusted') is not True:raise ValueError('wrong_identity')
      bars=[validate_bar(r,now,duration) for r in data.get('results',[])]
      with closing(connection()) as d,d:
       d.executemany('INSERT OR REPLACE INTO history VALUES(?,?,?,?)',[(symbol,period,r['t'],json.dumps(r)) for r in bars])
      url=data.get('next_url');params=None
      if not url:break
     else:raise ValueError('page_limit')
    except Exception as exc:status='failed_'+type(exc).__name__
    with closing(connection()) as d,d:
     count=d.execute('SELECT count(*) FROM history WHERE symbol=? AND period=?',(symbol,period)).fetchone()[0]
     if not count and status=='download_complete':status='empty'
     d.execute('INSERT OR REPLACE INTO coverage VALUES(?,?,?,?,?)',(symbol,period,status,now,count))
    print(json.dumps({'symbol':symbol,'period':period,'status':status,'count':count}),flush=True)

def news():
 while True:
  started=time.time()
  with httpx.Client(timeout=25,trust_env=False) as c:
   for symbol in SYMBOLS:
    now=int(time.time()*1000);today=datetime.now(timezone.utc).date();status='ok'
    try:
     rows=get(c,'https://finnhub.io/api/v1/company-news',{'symbol':symbol,'from':str(today-timedelta(days=3)),'to':str(today)},news=True)
     if not isinstance(rows,list):raise ValueError('invalid_news')
     with closing(connection()) as d,d:
      for r in rows:
       if not isinstance(r.get('datetime'),int) or not r.get('url','').startswith('https://') or r['datetime']*1000>now:continue
       item={'title':str(r.get('headline',''))[:500],'summary':str(r.get('summary',''))[:400],'url':r['url'],'publisher':r.get('source'),'published_at':r['datetime']*1000,'first_seen_at':now,'verification':'aggregator_not_primary_verified'}
       d.execute('INSERT OR IGNORE INTO news VALUES(?,?,?,?,?)',(symbol,r['url'],r['datetime']*1000,now,json.dumps(item,ensure_ascii=False)))
    except Exception as exc:status='failed_'+type(exc).__name__
    with closing(connection()) as d,d:d.execute('INSERT OR REPLACE INTO news_health VALUES(?,?,?)',(symbol,now,status))
  print('news_sweep_complete',flush=True);time.sleep(max(1,900-(time.time()-started)))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['history','news']);a=p.parse_args()
 if a.mode=='history':
  history()
  from context_report import build_report
  build_report()
 else:news()
