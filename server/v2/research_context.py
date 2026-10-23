"""Separate third-party history/news context; never fabricates venue candles."""
import json,sqlite3,time,math,statistics
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]/'data/v2'

def connection():
 ROOT.mkdir(parents=True,exist_ok=True)
 c=sqlite3.connect(ROOT/'context.db',timeout=20)
 c.execute('PRAGMA journal_mode=WAL')
 c.executescript('CREATE TABLE IF NOT EXISTS history(symbol TEXT,period TEXT,t INTEGER,payload TEXT,PRIMARY KEY(symbol,period,t)); CREATE TABLE IF NOT EXISTS coverage(symbol TEXT,period TEXT,status TEXT,at INTEGER,count INTEGER,PRIMARY KEY(symbol,period)); CREATE TABLE IF NOT EXISTS news(symbol TEXT,url TEXT,published INTEGER,seen INTEGER,payload TEXT,PRIMARY KEY(symbol,url)); CREATE TABLE IF NOT EXISTS news_health(symbol TEXT PRIMARY KEY,at INTEGER,status TEXT);')
 return c

def validate_bar(r,now,duration):
 values=[r[k] for k in ['o','h','l','c','v']]
 if any(type(v) not in [float,int] or not math.isfinite(v) for v in values):raise ValueError('invalid_number')
 if min(values[:4])<=0 or values[4]<0 or not r['l']<=min(r['o'],r['c'])<=max(r['o'],r['c'])<=r['h']:raise ValueError('invalid_ohlcv')
 if type(r['t']) is not int or r['t']+duration>now:raise ValueError('unfinished_bar')
 return r

def context(symbol,now):
 with closing(connection()) as c:
  coverage=[{'period':r[0],'status':r[1],'retrieved_at':r[2],'count':r[3]} for r in c.execute('SELECT period,status,at,count FROM coverage WHERE symbol=?',(symbol,))]
  rows=[json.loads(r[0]) for r in c.execute("SELECT payload FROM history WHERE symbol=? AND period='day' AND t<? ORDER BY t",(symbol,now-86400000))]
  health=c.execute('SELECT at,status FROM news_health WHERE symbol=?',(symbol,)).fetchone()
  news=[json.loads(r[0]) for r in c.execute('SELECT payload FROM news WHERE symbol=? AND published<=? AND seen<=? AND published>? ORDER BY published DESC LIMIT 3',(symbol,now,now,now-3*86400000))]
 changes=[math.log(b['c']/a['c']) for a,b in zip(rows,rows[1:])]
 return {'history_source':'massive_us_equity','currency':'USD','adjustment':'split_adjusted','not_binance_execution_prices':True,'coverage':coverage,'daily_sample':len(rows),'daily_volatility':statistics.stdev(changes) if len(changes)>1 else None,'range_high':max((r['h'] for r in rows),default=None),'range_low':min((r['l'] for r in rows),default=None),'news_status':health[1] if health and now-health[0]<1800000 else 'unverified_or_stale','news':news,'historical_news_backtest_eligible':False}
