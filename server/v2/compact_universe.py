"""Eleven-sector selection, <=200 instruments; provenance required."""
import math
from datetime import date

SECTORS={'technology':'XLK','communication':'XLC','consumer_discretionary':'XLY',
         'consumer_staples':'XLP','financials':'XLF','healthcare':'XLV',
         'industrials':'XLI','energy':'XLE','materials':'XLB','utilities':'XLU','real_estate':'XLRE'}


def select(records,as_of):
    chosen=[];gaps={};used=set()
    for sector,etf in SECTORS.items():
        eligible=[]
        for r in records:
            try:
                if r['sector']!=sector or r['tradability'] not in ('BUY','BUY_SELL'):continue
                if not r['source'] or not r['issuer_id']:continue
                if not 0<=(as_of-date.fromisoformat(r['as_of'])).days<=7:continue
                if any(not math.isfinite(r[k]) or r[k]<=0 for k in ('market_cap','volatility_20d','dollar_volume_20d')):continue
                if r['dollar_volume_20d']<5_000_000:continue
                eligible.append(r)
            except (KeyError,ValueError,TypeError):continue
        counts={}
        for group,key in [('leaders','market_cap'),('high_volatility','volatility_20d')]:
            count=0
            for r in sorted(eligible,key=lambda r:(-r[key],r['symbol'])):
                if r['issuer_id'] in used or any(x['symbol']==r['symbol'] for x in chosen):continue
                chosen.append({'symbol':r['symbol'],'sector':sector,'etf':etf,'group':group,'source':r['source'],'as_of':r['as_of']})
                used.add(r['issuer_id']);count+=1
                if count==5:break
            counts[group]=5-count
        gaps[sector]=counts
        chosen.append({'symbol':etf,'sector':sector,'etf':etf,'group':'reference'})
    for symbol in ('SPY','QQQ'):chosen.append({'symbol':symbol,'sector':'market','etf':symbol,'group':'reference'})
    if len(chosen)>200 or len({r['symbol'] for r in chosen})!=len(chosen):raise ValueError('universe_integrity')
    return {'instruments':chosen,'gaps':gaps,'basis':'ranked_within_verified_candidates','max_instruments':200}
