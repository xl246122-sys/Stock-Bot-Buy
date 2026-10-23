import asyncio,json,tempfile,unittest,sys,hmac,hashlib,logging
from pathlib import Path
from urllib.parse import parse_qs
from decimal import Decimal as D
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from pydantic import ValidationError
from server.v2.stocks_broker import OrderRequest,StocksBroker,BrokerError,SignedURLFilter
from server.v2.order_execution import OrderBook
from server.v2.protective_exit import Protection
ID='a'*32

def request(**kw):return OrderRequest(**{'symbol':'AAPL','clientOrderId':ID,'side':'BUY','orderType':'LIMIT','price':'10','quantity':'5','tradingSession':'RTH',**kw})
def detail(req,state='FILLED',qty='5',at=100):
 return dict(clientOrderId=req.clientOrderId,orderId='venue-'+req.clientOrderId,symbol=req.symbol,side=req.side,quote=req.quoteAsset,orderType=req.orderType,status=state,filledQty=qty,avgFilledPrice='10',fee='0.05',updatedAt=at)
class Fake:
 def __init__(self):self.placed=[];self.details={};self.timeout=False;self.cancel_terminal=True;self.cancel_calls=0
 async def place(self,req):
  self.placed.append(req);self.details[req.clientOrderId]=detail(req,'NEW','0')
  if self.timeout:raise TimeoutError()
  return dict(status='S',orderId='venue-'+req.clientOrderId,clientOrderId=req.clientOrderId)
 async def detail(self,id):return self.details[id]
 async def cancel(self,oid):
  self.cancel_calls+=1
  if self.cancel_terminal:
   for d in self.details.values():
    if d['orderId']==oid:d.update(status='CANCELED',updatedAt=d['updatedAt']+1)
  return {'status':'S','orderId':oid}

class ExecutionTests(unittest.IsolatedAsyncioTestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir='.local');self.path=Path(self.tmp.name)/'orders.db';self.book=OrderBook(self.path);self.fake=Fake();self.req=request();self.book.prepare(self.req)
 def tearDown(self):self.tmp.cleanup()
 async def test_ack_not_fill(self):
  r=await self.book.submit(ID,self.fake);self.assertEqual(r['state'],'ACKNOWLEDGED');self.assertEqual(r['qty'],'0')
 async def test_timeout_recovery_no_resubmit(self):
  self.fake.timeout=True;await self.book.submit(ID,self.fake);self.assertEqual(self.book.get(ID)['state'],'UNKNOWN')
  restarted=OrderBook(self.path);await restarted.submit(ID,self.fake);await restarted.recover(self.fake)
  self.assertEqual(len(self.fake.placed),1);self.assertEqual(restarted.get(ID)['state'],'NEW')
 async def test_concurrent_submit_once(self):
  await asyncio.gather(*(self.book.submit(ID,self.fake) for _ in range(10)));self.assertEqual(len(self.fake.placed),1)
 async def test_partial_and_duplicate(self):
  d=detail(self.req,'PARTIALLY_FILLED','2');self.assertTrue(self.book.apply_detail(ID,d));self.assertFalse(self.book.apply_detail(ID,d));self.assertEqual(self.book.get(ID)['gross'],'20')
  self.book.apply_detail(ID,detail(self.req));self.assertEqual(self.book.get(ID)['qty'],'5')
 async def test_identity_and_regression(self):
  self.book.apply_detail(ID,detail(self.req,'PARTIALLY_FILLED','2'))
  for changed in [{'symbol':'TSLA'},{'filledQty':'1'},{'filledQty':'6'},{'fee':'NaN'},{'quote':'USDT'}]:
   with self.assertRaises(ValueError):self.book.apply_detail(ID,{**detail(self.req,'PARTIALLY_FILLED','2'),**changed})
 async def test_old_update_ignored(self):
  self.book.apply_detail(ID,detail(self.req,'FILLED','5',200));self.assertFalse(self.book.apply_detail(ID,detail(self.req,'PARTIALLY_FILLED','2',100)))
 async def test_cancel_ack_pending(self):
  self.fake.details[ID]=detail(self.req,'PARTIALLY_FILLED','2');self.fake.cancel_terminal=False
  r=await self.book.cancel(ID,self.fake);self.assertEqual(r['state'],'PARTIALLY_FILLED')
 async def test_id_conflict(self):
  with self.assertRaises(ValueError):self.book.prepare(request(price='11'))
 async def test_terminal_never_regresses(self):
  self.book.apply_detail(ID,detail(self.req))
  with self.assertRaises(ValueError):self.book.apply_detail(ID,detail(self.req,'NEW','5',101))
 async def test_protection_partial_cancel_then_sell(self):
  self.fake.details[ID]=detail(self.req,'PARTIALLY_FILLED','2');p=Protection(self.book);p.arm(ID,'9','11',10000)
  args=dict(bid='8.9',quote_time=1000,now=1000,sell_allowed=True,step_size='0.01',min_qty='0.01',min_notional='1')
  self.assertEqual(await p.step(ID,self.fake,**args),'EXIT_PENDING');sell=self.fake.placed[-1]
  self.assertEqual(sell.quantity,D(2));self.assertEqual(self.fake.cancel_calls,1)
  await p.step(ID,self.fake,**args);self.assertEqual(len(self.fake.placed),1)
  self.fake.details[sell.clientOrderId]=detail(sell,'FILLED','2',200)
  await p.step(ID,self.fake,**args);self.assertEqual(await p.step(ID,self.fake,**args),'CLOSED')
 async def test_unknown_exit_never_resold(self):
  self.fake.details[ID]=detail(self.req);self.fake.timeout=True;p=Protection(self.book);p.arm(ID,'9','11',10000)
  args=dict(bid='8',quote_time=1000,now=1000,sell_allowed=True,step_size='0.01',min_qty='0.01',min_notional='1')
  await p.step(ID,self.fake,**args);await Protection(OrderBook(self.path)).step(ID,self.fake,**args)
  self.assertEqual(len(self.fake.placed),1)
 async def test_stale_no_exit(self):
  p=Protection(self.book);p.arm(ID,'9','11',10000)
  self.assertEqual(await p.step(ID,self.fake,bid='8',quote_time=0,now=5000,sell_allowed=True,step_size='1',min_qty='1',min_notional='1'),'WAIT_FRESH_QUOTE');self.assertFalse(self.fake.placed)
 async def test_halt_latches_then_recovery(self):
  self.fake.details[ID]=detail(self.req);p=Protection(self.book);p.arm(ID,'9','11',10000)
  args=dict(bid='8',quote_time=1000,now=1000,sell_allowed=False,step_size='1',min_qty='1',min_notional='1')
  self.assertEqual(await p.step(ID,self.fake,**args),'WAIT_TRADABLE')
  self.assertEqual(await p.step(ID,self.fake,**{**args,'bid':'10','sell_allowed':True}),'EXIT_PENDING')
 async def test_step_dust_not_closed(self):
  self.fake.details[ID]=detail(self.req,'CANCELED','0.01');p=Protection(self.book);p.arm(ID,'9','11',10000)
  self.assertEqual(await p.step(ID,self.fake,bid='8',quote_time=1000,now=1000,sell_allowed=True,step_size='1',min_qty='1',min_notional='1'),'RESIDUAL_BELOW_MINIMUM')

 async def test_partial_exit_accounting(self):
  self.book.apply_detail(ID,detail(self.req))
  sell=OrderRequest(symbol='AAPL',clientOrderId='b'*32,side='SELL',orderType='MARKET',quantity='5')
  self.book.prepare(sell,parent=ID);self.book.apply_detail(sell.clientOrderId,detail(sell,'PARTIALLY_FILLED','2'))
  r=self.book.position(ID);self.assertEqual(D(r['remaining']),D(3));self.assertEqual(D(r['realized_net']),D('-.07'))
  with self.assertRaises(Exception):self.book.prepare(sell.model_copy(update={'clientOrderId':'c'*32}),parent=ID)
 async def test_prepared_survives_disabled_transport(self):
  async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req:httpx.Response(200,json={}))) as client:
   with self.assertRaises(BrokerError):await self.book.submit(ID,StocksBroker(client,'test','test'))
  self.assertEqual(self.book.get(ID)['state'],'PREPARED')
 async def test_pending_cancel_prevents_exit(self):
  self.fake.cancel_terminal=False;self.fake.details[ID]=detail(self.req,'PARTIALLY_FILLED','2');p=Protection(self.book);p.arm(ID,'9','11',10000)
  result=await p.step(ID,self.fake,bid='8',quote_time=1000,now=1000,sell_allowed=True,step_size='1',min_qty='1',min_notional='1')
  self.assertEqual(result,'WAIT_ENTRY_CANCEL');self.assertFalse(self.fake.placed)

class AdapterTests(unittest.IsolatedAsyncioTestCase):
 async def test_writes_off_no_network(self):
  calls=[]
  async def handler(req):calls.append(req);return httpx.Response(200,json={})
  async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
   broker=StocksBroker(client,'test','test')
   with self.assertRaises(BrokerError):await broker.place(request())
  self.assertFalse(calls)
 async def test_signed_mock(self):
  async def handler(req):
   self.assertEqual(req.url.path,'/sapi/v1/equity/order/place');raw=req.url.query.decode();query,sig=raw.rsplit('&signature=',1)
   self.assertEqual(sig,hmac.new(b'secret',query.encode(),hashlib.sha256).hexdigest());self.assertEqual(parse_qs(query)['quantity'],['5'])
   return httpx.Response(200,json={'status':'S','orderId':'v','clientOrderId':ID})
  async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
   r=await StocksBroker(client,'key','secret',writes_enabled=True,clock=lambda:1000).place(request());self.assertEqual(r['status'],'S')
 async def test_sanitized_error(self):
  async def handler(req):raise httpx.ConnectError(str(req.url))
  async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
   with self.assertRaises(BrokerError) as e:await StocksBroker(client,'key','secret').detail(ID)
   self.assertNotIn('signature',str(e.exception));self.assertIsNone(e.exception.__cause__)
 def test_log_redaction(self):
  r=logging.LogRecord('httpx',20,'test',1,'GET %s',('https://api.binance.com/x?signature=secretvalue',),None)
  SignedURLFilter().filter(r);self.assertNotIn('secretvalue',r.getMessage());self.assertIn('[REDACTED]',r.getMessage())
 def test_order_matrix(self):
  with self.assertRaises(ValidationError):request(price='10.123')
  with self.assertRaises(ValidationError):request(orderType='MARKET')
  with self.assertRaises(ValidationError):request(timeInForce='GTC',quantity='1.5')
if __name__=='__main__':unittest.main()
