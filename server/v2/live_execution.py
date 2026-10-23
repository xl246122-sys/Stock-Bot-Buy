"""Account-bounded equity execution. Never withdraws, transfers, or trades futures."""
import asyncio,json,logging,re,threading,time,uuid
from contextlib import closing
from datetime import datetime,timedelta,timezone
from decimal import Decimal as D,ROUND_DOWN,ROUND_HALF_UP,ROUND_UP
from pathlib import Path
from zoneinfo import ZoneInfo
import httpx
from . import execution_config as cfg
from .order_execution import OrderBook
from .paper_execution import Strategy,quote as fresh_quote
from .protective_exit import Protection
from .scalp_policy import entries_allowed, session_bounds, net_stop, trading_day, MAX_HOLD_MS, MAX_POSITIONS
from .stocks_broker import BrokerError,OrderRequest,StocksBroker
KEY_FILE=Path('/etc/stock-g/binance-trade.key')
NET_TARGET=D('0.01')
NET_BAND=D('0.002')
LOCK=threading.Lock()
PROBE={'ok':False,'at':0,'flags':{},'free':{},'rules':{},'rules_at':0,'foreign':[],'error':None,'recovered':False,'activity':None}
BROKER=None
log=logging.getLogger('StockG-Live')

def inspect_credentials(path=None):
    path=Path(path or KEY_FILE)
    if not path.exists():return None,{'code':'trade_secret_missing','message':'服务器没有币安交易签名密钥，不能下单。'}
    lines=[ln.strip() for ln in path.read_text(encoding='utf-8-sig').splitlines() if ln.strip()]
    if len(lines)!=2 or not re.fullmatch(r'[A-Za-z0-9]{32,128}',lines[0]) or lines[1].startswith('sk-') or len(lines[1])<40:
        return None,{'code':'trade_secret_invalid','message':'交易签名密钥无效。sk- 开头的模型密钥不能签名下单，需要币安 HMAC Secret。'}
    return (lines[0],lines[1]),None

def db():
    c=cfg.connect()
    c.execute('''CREATE TABLE IF NOT EXISTS live_control(id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL,revision INTEGER NOT NULL,day TEXT,baseline TEXT NOT NULL DEFAULT '0',halted INTEGER NOT NULL DEFAULT 0,cooldown TEXT NOT NULL DEFAULT '{}')''')
    c.execute("INSERT OR IGNORE INTO live_control VALUES(1,0,1,NULL,'0',0,'{}')")
    c.commit();return c

def read_switch():
    with closing(db()) as c:
        enabled,revision,day,baseline,halted,cooldown=c.execute('SELECT enabled,revision,day,baseline,halted,cooldown FROM live_control WHERE id=1').fetchone()
    return {'enabled':bool(enabled),'revision':revision,'day':day,'baseline':baseline,'halted':bool(halted),'cooldown':json.loads(cooldown)}

def write_switch(**values):
    with closing(db()) as c,c:
        c.execute('BEGIN IMMEDIATE')
        current=dict(zip(('enabled','revision','day','baseline','halted','cooldown'),c.execute('SELECT enabled,revision,day,baseline,halted,cooldown FROM live_control WHERE id=1').fetchone()))
        current['cooldown']=json.loads(current['cooldown']);current.update(values)
        c.execute('UPDATE live_control SET enabled=?,revision=?,day=?,baseline=?,halted=?,cooldown=? WHERE id=1',(int(current['enabled']),current['revision'],current['day'],str(current['baseline']),int(current['halted']),json.dumps(current['cooldown'])))
    return read_switch()

def book():return OrderBook(cfg.ROOT/'live-orders.db')

def regular_session(now_ms):
    ny=datetime.fromtimestamp(now_ms/1000,tz=ZoneInfo('America/New_York'))
    return ny.weekday()<5 and 570<=ny.hour*60+ny.minute<960

def settlement(free,needed):
    for asset in ('USDT','USDC'):
        if D(str(free.get(asset,'0')))>=needed:return asset
    return None

def take_profit_bid(gross,fee,qty):
    """Bid that locks about 1% net profit after the known entry fee, inside a ±0.2% net band."""
    gross,fee,qty=D(str(gross)),D(str(fee)),D(str(qty))
    if gross<=0 or qty<=0:raise ValueError('invalid_cost')
    fee_rate=fee/gross
    if fee_rate<0 or fee_rate>=D('0.02'):fee_rate=D('0.001');fee=gross*fee_rate
    cost=gross+max(fee,D(0))
    def price(net):return cost*(1+net)/(qty*(1-fee_rate))
    raw=price(NET_TARGET);low,high=price(NET_TARGET-NET_BAND),price(NET_TARGET+NET_BAND)
    raw=min(max(raw,low),high)
    bid=raw.quantize(D('0.01'),rounding=ROUND_UP)
    floor,cap=low.quantize(D('0.01'),rounding=ROUND_UP),high.quantize(D('0.01'),rounding=ROUND_DOWN)
    if cap>=floor:
        if bid>cap:bid=cap
        if bid<floor:bid=floor
    return bid

def order_session(now_ms):
    ny=datetime.fromtimestamp(now_ms/1000,tz=ZoneInfo('America/New_York'))
    minute=ny.hour*60+ny.minute
    if ny.weekday()<5 and 570<=minute<960:return 'RTH'
    return 'EXTENDED'

def make_buy(symbol,ask,notional,rule,quote_asset,trading_session='RTH'):
    price=D(str(ask)).quantize(D('0.01'),rounding=ROUND_DOWN)
    step=D(str(rule.get('stepSize') or '0.00000001'))
    minimum=D(str(rule.get('minNotional') or '5'))
    if price<=0 or step<=0 or notional<minimum:return None
    qty=(notional/price/step).to_integral_value(rounding=ROUND_DOWN)*step
    if not rule.get('fractionable',True):qty=qty.to_integral_value(rounding=ROUND_DOWN)
    if qty<=0 or qty*price<minimum or qty*price>notional:return None
    return OrderRequest(symbol=symbol,clientOrderId='SG'+uuid.uuid4().hex[:30],side='BUY',orderType='LIMIT',quoteAsset=quote_asset,quantity=qty,price=price,tradingSession=trading_session,timeInForce='DAY',walletType='MAIN',tokenize=False)

def armed_stop(avg,loss_pct,tactical=None):
    hard=(D(avg)*(1-D(str(loss_pct))/100)).quantize(D('0.01'),rounding=ROUND_DOWN)
    if tactical is None:return hard
    level=D(str(tactical)).quantize(D('0.01'),rounding=ROUND_DOWN)
    if not D('0')<level<D(avg):return hard
    return max(level,hard)

async def submit_ai_buy(symbol,ask,bid,now,setup=None,invalidation=None,detail='',plan=None):
    """Place one risk-checked limit buy from a validated AI decision. Never withdraws."""
    from .analysis_control import shanghai_equity_window
    if not entries_allowed(now):return '不在交易时段，未下单'
    switch=read_switch()
    if not switch['enabled']:return '实盘未开启，未下单'
    if switch['halted']:return '已触及当日亏损限制，未下单'
    with LOCK:
        ready=PROBE['ok'] and PROBE['recovered'];rules=dict(PROBE['rules']);foreign=set(PROBE['foreign']);free=dict(PROBE['free']);broker=BROKER
    if not ready or broker is None:return '账户未就绪，未下单'
    if symbol in foreign:return '该标的已有非本系统挂单，未下单'
    rule=rules.get(symbol)
    if not rule or rule.get('tradability') not in ('BUY','BUY_SELL'):return '标的当前不可买入，未下单'
    limits=cfg.Limits.model_validate(cfg.read_config()['limits'])
    ask_d,bid_d=D(str(ask)),D(str(bid))
    if ask_d<=0 or bid_d>ask_d or (ask_d-bid_d)/ask_d+D('.004')>=limits.max_trade_loss_pct/100:return '点差过大，未下单'
    store=book();active=active_ids(store)
    if symbol in {OrderRequest.model_validate_json(row['request']).symbol for row in active} or now<switch['cooldown'].get(symbol,0):return '已有持仓或冷却中，未下单'
    from . import live_task
    quotes=dict(live_task.QUOTES) if live_task.CONNECTED else {}
    realized,unreal,_=mark_to_market(store,quotes,now)
    daily=realized+unreal-D(switch['baseline'])
    if daily<=-limits.daily_loss_cap_usd:return '已触及当日亏损限制，未下单'
    asset=settlement(free,limits.order_cap_usd)
    if asset is None:return '稳定币余额不足，未下单'
    notional=min(limits.order_cap_usd,D(str(free[asset])))
    if not reserve_ok(limits,active,realized,limits.daily_loss_cap_usd+daily,notional):return '额度已满，未下单'
    order=make_buy(symbol,ask_d,notional,rule,asset,order_session(now))
    if order is None:return '金额达不到最小下单要求，未下单'
    store.prepare(order)
    if setup and invalidation is not None:
        with closing(store.connect()) as c,c:c.execute('INSERT OR REPLACE INTO entry_meta VALUES(?,?,?,?)',(order.clientOrderId,setup,str(invalidation),detail or setup))
    with closing(store.connect()) as c,c:
        target=plan.target if plan else float(ask_d)*1.014
        c.execute('INSERT INTO ai_order_policy VALUES(?,?,?,?)',(order.clientOrderId,str(target),plan.holding_seconds if plan else 10800,now+10000))
    row=await store.submit(order.clientOrderId,broker)
    with LOCK:PROBE['activity']=f'{symbol} 本地量化买入 {row["state"]}'
    log.info('submitted AI equity entry %s',symbol)
    if row['state'] in ('UNKNOWN','PREPARED'):return '委托结果未知，未重复下单'
    return '已提交限价买单'

def blockers():
    _,err=inspect_credentials();items=[err] if err else []
    with LOCK:probe=dict(PROBE);free=dict(PROBE['free']);flags=dict(PROBE['flags'])
    if not err and not probe['ok']:
        items.append({'code':'account_not_ready','message':probe['error'] or '币安账户尚未核验通过，完成前不能开启实盘。'})
    if probe['ok']:
        if not flags.get('enableSpotAndMarginTrading'):items.append({'code':'trade_permission_missing','message':'该密钥没有现货交易权限。'})
        if flags.get('enableWithdrawals') or flags.get('enableInternalTransfer'):items.append({'code':'transfer_permission_present','message':'该密钥仍可提现或划转。请在币安关闭后再开启，系统本身不会发起转账。'})
        limits=cfg.Limits.model_validate(cfg.read_config()['limits'])
        if settlement(free,limits.order_cap_usd) is None:items.append({'code':'stable_balance_low','message':'USDT/USDC 可用余额低于单笔额度，不能开仓。'})
        if not probe['recovered']:items.append({'code':'reconciling','message':'未完成订单尚未对账，完成前不能开新仓。'})
    return items

def _money(value):
    return f"{D(value).quantize(D('0.01'),rounding=ROUND_HALF_UP):.2f}"

def _qty(value):
    text=format(D(value),'f')
    return text.rstrip('0').rstrip('.') if '.' in text else text

def current_quotes():
    try:
        from . import live_task
        return dict(live_task.QUOTES) if live_task.CONNECTED else {}
    except Exception:
        return {}

def trading_board(store=None,quotes=None,now=None):
    """Open holdings, floating profit, and this system's own fills. No foreign orders."""
    store=store or book();now=int(time.time()*1000) if now is None else now
    quotes={} if quotes is None else quotes
    holdings=[];trades=[];unreal_total=D(0);realized_total=D(0);marks_complete=True;pending=0
    with closing(store.connect()) as c:
        rows=[dict(r) for r in c.execute('SELECT * FROM orders ORDER BY updated DESC, id DESC')]
        guards={r['id']:dict(r) for r in c.execute('SELECT * FROM protection')}
        metas={r['id']:dict(r) for r in c.execute('SELECT * FROM entry_meta')}
    for row in rows:
        req=OrderRequest.model_validate_json(row['request'])
        qty,gross,fee=D(row['qty']),D(row['gross']),D(row['fee'])
        avg=gross/qty if qty else None
        meta=metas.get(row['id'],{})
        trades.append({'id':row['id'],'symbol':req.symbol,'side':req.side,'state':row['state'],'qty':_qty(qty),'avg_price':None if avg is None else _money(avg),'fee':_money(fee),'updated':row['updated'],'parent':row['parent'],'setup':meta.get('setup'),'detail':meta.get('detail')})
        if row['parent'] is not None or row['state']=='PREPARED':continue
        pos=store.position(row['id']);realized_total+=D(pos['realized_net']);remaining=D(pos['remaining'])
        if remaining<=0:
            if row['state'] not in ('FILLED','CANCELED','EXPIRED','REJECTED'):pending+=1
            continue
        mark=unreal=pct=None
        quote=fresh_quote(quotes.get(req.symbol,{}),now) if req.symbol in quotes else None
        cost=D(pos['remaining_cost'])
        if quote:
            mark=quote[0];unreal=mark*remaining-cost;pct=(unreal/cost*100) if cost else D(0);unreal_total+=unreal
        else:marks_complete=False
        guard=guards.get(row['id'],{})
        holdings.append({'symbol':req.symbol,'qty':_qty(remaining),'avg_price':None if avg is None else _money(avg),'mark':None if mark is None else _money(mark),'unrealized':None if unreal is None else _money(unreal),'unrealized_pct':None if pct is None else _money(pct),'realized':_money(D(pos['realized_net'])),'state':row['state'],'protection':guard.get('reason'),'stop':guard.get('stop'),'target':guard.get('target'),'setup':meta.get('setup'),'detail':meta.get('detail'),'invalidation':meta.get('invalidation')})
        if row['state'] not in ('FILLED','CANCELED','EXPIRED','REJECTED'):pending+=1
    return {'holdings':holdings,'trades':trades[:40],'open_count':len(holdings),'pending_count':pending,'unrealized':None if holdings and not marks_complete else _money(unreal_total),'realized':_money(realized_total),'marks_complete':marks_complete}

def positions(store=None):
    store=store or book();rows=[]
    with closing(store.connect()) as c:
        parents=[dict(r) for r in c.execute('SELECT * FROM orders WHERE parent IS NULL ORDER BY updated DESC')]
        guards={r['id']:dict(r) for r in c.execute('SELECT * FROM protection')}
    for row in parents[:20]:
        req=OrderRequest.model_validate_json(row['request']);pos=store.position(row['id']) if row['state']!='PREPARED' else None
        rows.append({'symbol':req.symbol,'state':row['state'],'qty':row['qty'],'remaining':None if pos is None else pos['remaining'],'realized':None if pos is None else pos['realized_net'],'protection':guards.get(row['id'],{}).get('reason')})
    return rows

def status():
    switch=read_switch();issues=blockers()
    with LOCK:probe=dict(PROBE)
    state='running' if switch['enabled'] and not issues else 'halted' if switch['halted'] else 'unavailable'
    return {'live_enabled':switch['enabled'],'can_enable':not issues,'state':state,'blockers':issues,'account':{'free':probe['free'],'withdrawals':bool(probe['flags'].get('enableWithdrawals')),'transfers':bool(probe['flags'].get('enableInternalTransfer'))},'positions':positions(),'board':trading_board(quotes=current_quotes()),'activity':probe['activity'],'protection':'止盈锁定约1%纯利润，允许上下0.2%。跌破触发位会先卖，计划净亏损上限1%，并非成交保证。止损和止盈由服务器监控，不是交易所托管条件单。断网、停牌或跳空时不能保证成交价。','products':'仅币安美股现货式股权订单，不交易合约，不转账。'}

def set_enabled(enabled):
    issues=blockers()
    if enabled and issues:
        from fastapi import HTTPException
        raise HTTPException(409,{'code':'LIVE_NOT_READY','message':'实盘条件未满足，本次没有开启交易，也没有提交订单。',**status()})
    current=read_switch();write_switch(enabled=bool(enabled),revision=current['revision']+1)
    with LOCK:PROBE['activity']='实盘开仓已授权' if enabled else '已暂停新开仓；已有持仓继续按保护规则退出'
    return status()

def active_ids(store):
    found=[]
    with closing(store.connect()) as c:parents=[dict(r) for r in c.execute('SELECT * FROM orders WHERE parent IS NULL')]
    for row in parents:
        if row['state'] in ('CANCELED','EXPIRED','REJECTED') and D(row['qty'])==0:continue
        if row['state']=='PREPARED':found.append(row);continue
        pos=store.position(row['id'])
        if D(pos['remaining'])>0 or not pos['entry_terminal'] or pos['exit_pending']:found.append(row)
    return found

def reserve_ok(limits,active,realized,daily_remaining,notional):
    risk=notional*min(limits.max_trade_loss_pct,D('1'))/100
    used=sum((D(OrderRequest.model_validate_json(row['request']).price or 0)*D(OrderRequest.model_validate_json(row['request']).quantity or 0) for row in active),D(0))
    risk_used=sum((D(OrderRequest.model_validate_json(row['request']).price or 0)*D(OrderRequest.model_validate_json(row['request']).quantity or 0)*min(limits.max_trade_loss_pct,D('1'))/100 for row in active),D(0))
    return len(active)<min(limits.max_open_trades,MAX_POSITIONS) and used+notional<=limits.budget_usd+min(realized,D(0)) and risk_used+risk<=daily_remaining

async def load_rules(client,key):
    response=await client.get('https://api.binance.com/sapi/v1/equity/market/exchangeInfo',headers={'X-MBX-APIKEY':key},timeout=20,follow_redirects=False)
    response.raise_for_status();rules={}
    for row in response.json().get('symbols',[]):
        symbol=row.get('symbol')
        if not isinstance(symbol,str):continue
        rules[symbol]={'stepSize':row.get('stepSize') or '0.00000001','minNotional':row.get('minNotional') or '5','fractionable':bool(row.get('fractionable',True)),'tradability':row.get('tradability') or 'NONE'}
    return rules

def listed(payload):
    if isinstance(payload,list):return payload
    if isinstance(payload,dict):
        for key in ('orders','rows','data'):
            if isinstance(payload.get(key),list):return payload[key]
    raise BrokerError('invalid_broker_response')

async def refresh_account(broker,client,key):
    now=time.time()
    with LOCK:
        if now-PROBE['at']<60:return
    try:
        flags=await broker.read('/sapi/v1/account/apiRestrictions')
        account=await broker.read('/api/v3/account')
        free={row.get('asset'):row.get('free','0') for row in account.get('balances',[]) if row.get('asset') in ('USDT','USDC')}
        foreign=[]
        try:opened=listed(await broker.read('/sapi/v1/equity/order/open-orders'))
        except BrokerError as exc:
            if exc.code not in (None,-1121):raise
            opened=[]
        ours=set()
        with closing(book().connect()) as c:ours={r[0] for r in c.execute('SELECT id FROM orders')}
        for row in opened:
            if row.get('clientOrderId') not in ours and row.get('symbol'):foreign.append(row['symbol'])
        rules=PROBE['rules']
        rules_at=PROBE['rules_at']
        if now-rules_at>600 or not rules:
            rules=await load_rules(client,key);rules_at=now
        kept={k:flags[k] for k in flags if k.startswith('enable') or k=='ipRestrict'}
        with LOCK:PROBE.update(ok=True,at=now,flags=kept,free=free,rules=rules,rules_at=rules_at,foreign=sorted(set(foreign)),error=None)
    except BrokerError as exc:
        message={-1022:'币安拒绝签名，交易密钥不正确。',-2015:'币安拒绝该密钥的权限或来源 IP。'}.get(exc.code,'币安账户核验失败。')
        with LOCK:PROBE.update(ok=False,at=now,error=message)

async def reconcile_open(store,broker):
    with closing(store.connect()) as c:ids=[r[0] for r in c.execute("SELECT id FROM orders WHERE state NOT IN ('PREPARED','FILLED','CANCELED','EXPIRED','REJECTED')")]
    bad=[]
    for oid in ids:
        try:
            row=await store.reconcile(oid,broker)
            with closing(store.connect()) as c:
                policy=c.execute('SELECT cancel_at FROM ai_order_policy WHERE id=?',(oid,)).fetchone()
            if policy and int(time.time()*1000)>=policy['cancel_at'] and row['state'] not in ('FILLED','CANCELED','EXPIRED','REJECTED'):
                await store.cancel(oid,broker)
        except Exception:bad.append(oid)
    return bad

def mark_to_market(store,quotes,now):
    realized=D(0);unreal=D(0);complete=True
    with closing(store.connect()) as c:parents=[dict(r) for r in c.execute('SELECT * FROM orders WHERE parent IS NULL')]
    for row in parents:
        if row['state']=='PREPARED':continue
        req=OrderRequest.model_validate_json(row['request']);pos=store.position(row['id']);realized+=D(pos['realized_net'])
        if D(pos['remaining'])<=0:continue
        q=fresh_quote(quotes.get(req.symbol,{}),now) if req.symbol in quotes else None
        if not q:complete=False;continue
        unreal+=q[0]*D(pos['remaining'])-D(pos['remaining_cost'])
    return realized,unreal,complete

async def protect(store,guard,broker,quotes,now,rules,tradable,force):
    for row in active_ids(store):
        try:
            if row['state']=='PREPARED' or D(row['qty'])<=0:continue
            req=OrderRequest.model_validate_json(row['request']);q=fresh_quote(quotes.get(req.symbol,{}),now)
            if q is None:continue
            with closing(store.connect()) as c:
                armed=c.execute('SELECT * FROM protection WHERE id=?',(row['id'],)).fetchone()
                meta=c.execute('SELECT invalidation FROM entry_meta WHERE id=?',(row['id'],)).fetchone()
                policy=c.execute('SELECT target,holding_seconds FROM ai_order_policy WHERE id=?',(row['id'],)).fetchone()
            avg=D(row['gross'])/D(row['qty']);limits=cfg.Limits.model_validate(cfg.read_config()['limits'])
            stop=max(net_stop(row['gross'],row['fee'],row['qty']),armed_stop(avg,min(limits.max_trade_loss_pct,D('1')),None if meta is None else meta['invalidation']))
            target=take_profit_bid(row['gross'],row['fee'],row['qty'])
            if policy:target=min(target,D(policy['target']))
            if not D('0')<stop<target:continue
            if not armed:
                with closing(store.connect()) as c:
                    first=c.execute("SELECT MIN(at) FROM order_events WHERE id=? AND kind='RECONCILED'",(row['id'],)).fetchone()[0]
                session_close=session_bounds(now)[1]
                deadline=min((first or now)+min(MAX_HOLD_MS,policy['holding_seconds']*1000 if policy else MAX_HOLD_MS),session_close) if session_close else now
                guard.arm(row['id'],stop,target,deadline)
            else:
                # Reprice after partial fills without extending the original deadline.
                with closing(store.connect()) as c,c:
                    c.execute('UPDATE protection SET stop=?,target=? WHERE id=? AND reason IS NULL',(str(max(stop,D(armed['stop']))),str(target),row['id']))
            if force:
                with closing(store.connect()) as c,c:c.execute('UPDATE protection SET expires=? WHERE id=? AND reason IS NULL AND expires>?',(now,row['id'],now))
            rule=rules.get(req.symbol,{})
            await guard.step(row['id'],broker,bid=q[0],quote_time=quotes[req.symbol]['T'],now=now,sell_allowed=tradable.get(req.symbol) in ('SELL','BUY_SELL'),step_size=rule.get('stepSize','0.00000001'),min_qty=rule.get('stepSize','0.00000001'),min_notional=rule.get('minNotional','5'))
        except asyncio.CancelledError:raise
        except Exception:
            log.exception('Position protection failed; continuing other positions')
            with LOCK:PROBE['activity']='持仓保护异常，需要核查；已继续检查其他持仓'

async def tick(store,guard,broker,strategy,quotes,tradable,now):
    switch=read_switch();limits=cfg.Limits.model_validate(cfg.read_config()['limits'])
    bad=await reconcile_open(store,broker)
    if bad:
        with LOCK:PROBE['activity']='对账未完成，暂停开仓'
    with LOCK:rules=dict(PROBE['rules']);foreign=set(PROBE['foreign']);free=dict(PROBE['free']);ready=PROBE['ok'] and PROBE['recovered']
    realized,unreal,complete=mark_to_market(store,quotes,now)
    total=realized+unreal
    day=trading_day(now)
    if switch['day']!=day and complete:
        switch=write_switch(day=day,baseline=str(total),halted=False,revision=switch['revision'])
    daily=total-D(switch['baseline']);halted=switch['halted'] or daily<=-limits.daily_loss_cap_usd
    if halted and not switch['halted']:switch=write_switch(halted=True,revision=switch['revision'])
    # A separate task protects positions even while account refresh/reconcile waits.
    open_now={OrderRequest.model_validate_json(row['request']).symbol for row in active_ids(store)}
    closed=getattr(tick,'_open',set())-open_now;tick._open=open_now
    if closed:
        cooldown=switch['cooldown']
        for symbol in closed:cooldown[symbol]=now+300000
        switch=write_switch(cooldown=cooldown,revision=switch['revision'])
    with LOCK:PROBE['entry_ready']=bool(ready and not halted and not bad and complete);PROBE['reconcile_at']=time.time()

async def local_entries(quotes,tradable,now):
    from .local_runtime import decisions
    from .technical_plans import fresh
    from . import live_task
    if not entries_allowed(now) or not live_task.CONNECTED:return
    switch=read_switch()
    if not switch['enabled'] or switch['halted']:return
    for decision in decisions(live_task,now):
        moment=int(time.time()*1000);q=live_task.QUOTES.get(decision['symbol'],{})
        if not fresh(q,moment):continue
        ask,bid=D(str(q['ap'])),D(str(q['bp']))
        if ask>decision['ask'] or bid<=decision['invalidation']:continue
        if (ask-decision['invalidation'])/ask+D('.004')>D('.01'):continue
        await submit_ai_buy(decision['symbol'],ask,bid,moment,decision['setup'],decision['invalidation'],decision['detail'])

async def run_live():
    store=book();guard=Protection(store);strategy=Strategy();broker=None;client=None;loaded=None
    while True:
        try:
            cred,err=inspect_credentials()
            if err:
                with LOCK:PROBE.update(ok=False,error=err['message'],activity=err['message'])
            else:
                if loaded!=cred or client is None:
                    if client:await client.aclose()
                    client=httpx.AsyncClient(timeout=10,trust_env=False);loaded=cred
                    broker=StocksBroker(client,*cred,writes_enabled=True);global BROKER;BROKER=broker
                await refresh_account(broker,client,cred[0])
                if PROBE['ok'] and not PROBE['recovered']:
                    result=await store.recover(broker)
                    with LOCK:PROBE['recovered']=not any(v=='RECONCILIATION_REQUIRED' for v in result.values());PROBE['error']=None if PROBE['recovered'] else '有订单无法核对，已停止新开仓。'
                from . import live_task
                now=int(time.time()*1000)
                quotes=dict(live_task.QUOTES) if live_task.CONNECTED else {}
                if broker and PROBE['ok']:await tick(store,guard,broker,strategy,quotes,dict(live_task.TRADABLE),now)
        except asyncio.CancelledError:
            if client:await client.aclose()
            raise
        except Exception as exc:
            with LOCK:PROBE['activity']=type(exc).__name__
            log.exception('live execution failed')
        try:
            from .paper_execution import WAKE
            await asyncio.wait_for(WAKE.wait(),timeout=2)
            WAKE.clear()
        except asyncio.TimeoutError:pass
        await asyncio.sleep(.05)


async def run_protection():
    """Independent of AI cadence and account-refresh network waits."""
    store=book();guard=Protection(store)
    while True:
        try:
            with LOCK:broker=BROKER;rules=dict(PROBE['rules'])
            if broker:
                from . import live_task
                now=int(time.time()*1000)
                quotes=dict(live_task.QUOTES) if live_task.CONNECTED else {}
                await protect(store,guard,broker,quotes,now,rules,dict(live_task.TRADABLE),read_switch()['halted'])
        except asyncio.CancelledError:raise
        except Exception:log.exception('Protection scheduler failed')
        await asyncio.sleep(.2)


async def run_local_entries():
    """Single entry writer, independent of slow account-refresh network I/O."""
    while True:
        try:
            from . import live_task
            with LOCK:
                ready=PROBE.get('entry_ready',False) and time.time()-PROBE.get('reconcile_at',0)<5 and time.time()-PROBE['at']<90
            if ready and live_task.CONNECTED:
                await local_entries(dict(live_task.QUOTES),dict(live_task.TRADABLE),int(time.time()*1000))
        except asyncio.CancelledError:raise
        except Exception:log.exception('Local entry scheduler failed')
        await asyncio.sleep(.2)
