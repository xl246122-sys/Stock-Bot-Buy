"""Durable order intents and cumulative reconciliation. Not wired to the live scheduler."""
import json,sqlite3,time
from contextlib import closing
from decimal import Decimal as D
from pathlib import Path
from .stocks_broker import OrderRequest,BrokerError
TERMINAL={'FILLED','CANCELED','EXPIRED','REJECTED'}
KNOWN=TERMINAL|{'NEW','ACCEPTED','PARTIALLY_FILLED'}

def number(v):
    n=D(str(v))
    if not n.is_finite() or n<0:raise ValueError('invalid_nonnegative_decimal')
    return n

class OrderBook:
    def __init__(self,path):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        with closing(self.connect()) as c,c:
            c.executescript('''CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,request TEXT NOT NULL,state TEXT NOT NULL,order_id TEXT,qty TEXT NOT NULL DEFAULT '0',gross TEXT NOT NULL DEFAULT '0',fee TEXT NOT NULL DEFAULT '0',updated INTEGER NOT NULL DEFAULT 0,parent TEXT,exit_active INTEGER NOT NULL DEFAULT 0);
            CREATE UNIQUE INDEX IF NOT EXISTS one_exit ON orders(parent) WHERE exit_active=1;
            CREATE TABLE IF NOT EXISTS order_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT,at INTEGER,kind TEXT,payload TEXT);
            CREATE TABLE IF NOT EXISTS protection(id TEXT PRIMARY KEY,stop TEXT,target TEXT,expires INTEGER,reason TEXT);
            CREATE TABLE IF NOT EXISTS ai_order_policy(id TEXT PRIMARY KEY,target TEXT,holding_seconds INTEGER,cancel_at INTEGER);
            CREATE TABLE IF NOT EXISTS entry_meta(id TEXT PRIMARY KEY,setup TEXT NOT NULL,invalidation TEXT NOT NULL,detail TEXT NOT NULL);''')
    def connect(self):
        c=sqlite3.connect(self.path,timeout=10);c.row_factory=sqlite3.Row;return c
    def event(self,c,id,kind,payload):
        c.execute('INSERT INTO order_events(id,at,kind,payload) VALUES(?,?,?,?)',(id,int(time.time()*1000),kind,json.dumps(payload)))
    def get(self,id):
        with closing(self.connect()) as c:
            row=c.execute('SELECT * FROM orders WHERE id=?',(id,)).fetchone()
            if row is None:raise KeyError(id)
            return dict(row)
    def prepare(self,order,parent=None):
        payload=order.model_dump_json()
        with closing(self.connect()) as c,c:
            c.execute('BEGIN IMMEDIATE');prior=c.execute('SELECT request,parent FROM orders WHERE id=?',(order.clientOrderId,)).fetchone()
            if prior:
                if prior['request']!=payload or prior['parent']!=parent:raise ValueError('idempotency_conflict')
                return order.clientOrderId
            if parent:
                entry=c.execute('SELECT * FROM orders WHERE id=?',(parent,)).fetchone()
                if not entry or entry['state'] not in TERMINAL:raise ValueError('entry_not_terminal')
                original=OrderRequest.model_validate_json(entry['request'])
                if original.side!='BUY' or order.side!='SELL' or order.symbol!=original.symbol or order.quoteAsset!=original.quoteAsset:raise ValueError('exit_identity_mismatch')
                sold=sum((D(r[0]) for r in c.execute('SELECT qty FROM orders WHERE parent=?',(parent,))),D(0))
                if order.quantity is None or order.quantity>D(entry['qty'])-sold:raise ValueError('exit_exceeds_confirmed_position')
            c.execute('INSERT INTO orders(id,request,state,parent,exit_active) VALUES(?,?,?,?,?)',(order.clientOrderId,payload,'PREPARED',parent,int(parent is not None)))
            self.event(c,order.clientOrderId,'PREPARED',{})
        return order.clientOrderId
    def claim(self,id):
        with closing(self.connect()) as c,c:
            return c.execute("UPDATE orders SET state='SUBMITTING' WHERE id=? AND state='PREPARED'",(id,)).rowcount==1
    async def submit(self,id,broker):
        # Commit before network I/O. Crash in flight remains SUBMITTING and is query-only on restart.
        if getattr(broker,'writes_enabled',True) is False:raise BrokerError('writes_disabled')
        if not self.claim(id):return self.get(id)
        try:
            result=await broker.place(OrderRequest.model_validate_json(self.get(id)['request']))
            if result.get('status')!='S' or result.get('clientOrderId')!=id or not result.get('orderId'):raise BrokerError('unconfirmed_ack')
            with closing(self.connect()) as c,c:
                c.execute("UPDATE orders SET state='ACKNOWLEDGED',order_id=? WHERE id=? AND state='SUBMITTING'",(result['orderId'],id))
                self.event(c,id,'ACKNOWLEDGED',{'order_id':result['orderId']})
        except Exception:
            with closing(self.connect()) as c,c:
                c.execute("UPDATE orders SET state='UNKNOWN' WHERE id=? AND state='SUBMITTING'",(id,));self.event(c,id,'SUBMISSION_UNKNOWN',{})
        return self.get(id)
    def apply_detail(self,id,data):
        with closing(self.connect()) as c,c:
            c.execute('BEGIN IMMEDIATE');old=c.execute('SELECT * FROM orders WHERE id=?',(id,)).fetchone()
            if not old:raise KeyError(id)
            req=OrderRequest.model_validate_json(old['request'])
            if data.get('clientOrderId')!=id or data.get('symbol')!=req.symbol or data.get('side')!=req.side or data.get('orderType')!=req.orderType or data.get('quote')!=req.quoteAsset:raise ValueError('order_identity_mismatch')
            oid=data.get('orderId');state=data.get('status');at=data.get('updatedAt')
            if not isinstance(oid,str) or not oid or state not in KNOWN or type(at) is not int or at<0:raise ValueError('invalid_order_status')
            if old['order_id'] and old['order_id']!=oid:raise ValueError('order_id_changed')
            qty=number(data['filledQty']);fee=number(data['fee']);avg=number(data.get('avgFilledPrice') or 0);gross=qty*avg
            if qty and not avg:raise ValueError('filled_without_price')
            if req.quantity is not None and qty>req.quantity:raise ValueError('overfill')
            if at<old['updated']:return False
            if qty<D(old['qty']) or fee<D(old['fee']) or gross<D(old['gross']):raise ValueError('cumulative_regression')
            if old['state'] in TERMINAL and state!=old['state']:raise ValueError('terminal_regression')
            if state=='FILLED' and (qty<=0 or (req.quantity is not None and qty!=req.quantity)):raise ValueError('invalid_full_fill')
            if qty==D(old['qty']) and fee==D(old['fee']) and gross==D(old['gross']) and state==old['state'] and at==old['updated']:return False
            c.execute('UPDATE orders SET state=?,order_id=?,qty=?,gross=?,fee=?,updated=?,exit_active=? WHERE id=?',(state,oid,str(qty),str(gross),str(fee),at,int(old['parent'] is not None and state not in TERMINAL),id))
            self.event(c,id,'RECONCILED',{'state':state,'qty':str(qty),'gross':str(gross),'fee':str(fee)})
        return True
    async def reconcile(self,id,broker):
        data=await broker.detail(id);self.apply_detail(id,data);return self.get(id)
    async def recover(self,broker):
        with closing(self.connect()) as c:ids=[r[0] for r in c.execute("SELECT id FROM orders WHERE state NOT IN ('PREPARED','FILLED','CANCELED','EXPIRED','REJECTED')")]
        results={}
        for id in ids:
            try:results[id]=(await self.reconcile(id,broker))['state']
            except Exception:results[id]='RECONCILIATION_REQUIRED'
        return results
    async def cancel(self,id,broker):
        row=await self.reconcile(id,broker)
        if row['state'] in TERMINAL:return row
        await broker.cancel(row['order_id'])
        # A cancel acknowledgement does NOT free the reservation or establish terminal state.
        return await self.reconcile(id,broker)

    def position(self,entry_id):
        entry=self.get(entry_id)
        if OrderRequest.model_validate_json(entry['request']).side!='BUY':raise ValueError('not_entry')
        with closing(self.connect()) as c:exits=list(c.execute('SELECT * FROM orders WHERE parent=?',(entry_id,)))
        bought=D(entry['qty']);sold=sum((D(r['qty']) for r in exits),D(0))
        if sold>bought:raise ValueError('oversold_ledger')
        cost=D(entry['gross'])+D(entry['fee'])
        allocated=cost*sold/bought if bought else D(0)
        proceeds=sum((D(r['gross'])-D(r['fee']) for r in exits),D(0))
        return {'confirmed_bought':str(bought),'confirmed_sold':str(sold),'remaining':str(bought-sold),
                'remaining_cost':str(cost-allocated),'realized_net':str(proceeds-allocated),
                'entry_terminal':entry['state'] in TERMINAL,'exit_pending':any(r['exit_active'] for r in exits)}
