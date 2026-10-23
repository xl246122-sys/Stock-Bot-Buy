"""Persisted protection coordinator. Application-managed exits, NOT exchange-hosted stops."""
import json,sqlite3,uuid
from contextlib import closing
from decimal import Decimal as D,ROUND_DOWN
from .order_execution import TERMINAL,number
from .stocks_broker import OrderRequest

class Protection:
    def __init__(self,book):self.book=book
    def arm(self,entry_id,stop,target,expires):
        stop,target=number(stop),number(target)
        if not 0<stop<target or type(expires) is not int or expires<=0:raise ValueError('invalid_protection')
        row=self.book.get(entry_id);req=OrderRequest.model_validate_json(row['request'])
        if req.side!='BUY':raise ValueError('protection_requires_entry')
        with closing(self.book.connect()) as c,c:
            prior=c.execute('SELECT stop,target,expires FROM protection WHERE id=?',(entry_id,)).fetchone()
            if prior and (D(prior[0])!=stop or D(prior[1])!=target or prior[2]!=expires):raise ValueError('protection_already_armed')
            c.execute('INSERT OR IGNORE INTO protection VALUES(?,?,?,?,NULL)',(entry_id,str(stop),str(target),expires))
    async def step(self,entry_id,broker,*,bid,quote_time,now,sell_allowed,step_size,min_qty,min_notional):
        bid=number(bid);step_size=number(step_size);min_qty=number(min_qty);min_notional=number(min_notional)
        if step_size<=0:raise ValueError('invalid_step_size')
        if type(quote_time) is not int or not 0<=now-quote_time<=2000 or bid<=0:return 'WAIT_FRESH_QUOTE'
        with closing(self.book.connect()) as c:
            p=c.execute('SELECT * FROM protection WHERE id=?',(entry_id,)).fetchone()
        if not p:raise ValueError('protection_not_armed')
        reason=p['reason'] or ('STOP' if bid<=D(p['stop']) else 'TARGET' if bid>=D(p['target']) else 'TIME' if now>=p['expires'] else None)
        if reason is None:return 'MONITORING'
        with closing(self.book.connect()) as c,c:c.execute('UPDATE protection SET reason=COALESCE(reason,?) WHERE id=?',(reason,entry_id))
        # Reconciliation errors propagate; no new sell is submitted on unknown holdings.
        entry=await self.book.reconcile(entry_id,broker)
        if entry['state'] not in TERMINAL:
            entry=await self.book.cancel(entry_id,broker)
            if entry['state'] not in TERMINAL:return 'WAIT_ENTRY_CANCEL'
        with closing(self.book.connect()) as c:
            active=c.execute('SELECT id,state FROM orders WHERE parent=? AND exit_active=1',(entry_id,)).fetchone()
        if active:
            if active['state']=='PREPARED':
                if not sell_allowed:return 'WAIT_TRADABLE'
                await self.book.submit(active['id'],broker)
            else:await self.book.reconcile(active['id'],broker)
            return 'EXIT_PENDING'
        with closing(self.book.connect()) as c:
            sold=sum((D(r[0]) for r in c.execute('SELECT qty FROM orders WHERE parent=?',(entry_id,))),D(0))
            attempts=c.execute('SELECT COUNT(*) FROM orders WHERE parent=?',(entry_id,)).fetchone()[0]
        remaining=D(entry['qty'])-sold
        if remaining<0:raise ValueError('oversold_ledger')
        if remaining==0:return 'CLOSED'
        if attempts>=3:return 'MANUAL_REVIEW_REQUIRED'
        if not sell_allowed:return 'WAIT_TRADABLE'
        qty=(remaining/step_size).to_integral_value(rounding=ROUND_DOWN)*step_size
        if qty<=0 or qty<min_qty or qty*bid<min_notional:return 'RESIDUAL_BELOW_MINIMUM'
        req=OrderRequest.model_validate_json(entry['request'])
        order=OrderRequest(symbol=req.symbol,clientOrderId=uuid.uuid4().hex,side='SELL',orderType='MARKET',quantity=qty,quoteAsset=req.quoteAsset,walletType=req.walletType)
        try:self.book.prepare(order,parent=entry_id)
        except sqlite3.IntegrityError:return 'EXIT_PENDING'
        await self.book.submit(order.clientOrderId,broker)
        return 'EXIT_PENDING'
