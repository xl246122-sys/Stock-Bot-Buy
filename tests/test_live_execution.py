import tempfile,unittest,sys
from decimal import Decimal as D
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server.v2 import execution_config as cfg
from server.v2 import live_execution as live
from server.v2.live_control import set_enabled,status
from server.v2.execution_config import Auth,LiveToggle,live_status,live_toggle
from fastapi import HTTPException
from unittest.mock import patch

class LiveExecutionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir='.local');self.old=cfg.ROOT;cfg.ROOT=Path(self.tmp.name)
  self.probe=dict(live.PROBE);self.key=live.KEY_FILE
  live.PROBE.update(ok=False,at=0,flags={},free={},rules={},rules_at=0,foreign=[],error=None,recovered=False,activity=None)
  live.KEY_FILE=Path(self.tmp.name)/'missing.key'
 def tearDown(self):
  live.PROBE.clear();live.PROBE.update(self.probe);live.KEY_FILE=self.key;cfg.ROOT=self.old;self.tmp.cleanup()
 def test_missing_secret_cannot_enable(self):
  self.assertFalse(status()['can_enable']);self.assertFalse(status()['live_enabled'])
  self.assertEqual(status()['blockers'][0]['code'],'trade_secret_missing')
  with self.assertRaises(HTTPException) as caught:set_enabled(True)
  self.assertEqual(caught.exception.status_code,409);self.assertFalse(status()['live_enabled'])
 def test_model_key_rejected(self):
  path=Path(self.tmp.name)/'bad.key';path.write_text('A'*64+'\nsk-'+'b'*32,encoding='utf-8');live.KEY_FILE=path
  self.assertEqual(live.inspect_credentials()[1]['code'],'trade_secret_invalid')
 def test_disable_without_account(self):
  self.assertFalse(set_enabled(False)['live_enabled'])
 def test_enable_after_probe(self):
  path=Path(self.tmp.name)/'trade.key';path.write_text('A'*64+'\n'+'b'*64,encoding='utf-8');live.KEY_FILE=path
  live.PROBE.update(ok=True,recovered=True,flags={'enableSpotAndMarginTrading':True,'enableWithdrawals':False,'enableInternalTransfer':False},free={'USDT':'300'})
  self.assertTrue(status()['can_enable']);self.assertTrue(set_enabled(True)['live_enabled'])
  self.assertFalse(set_enabled(False)['live_enabled'])
 def test_withdraw_permission_blocks(self):
  path=Path(self.tmp.name)/'trade.key';path.write_text('A'*64+'\n'+'b'*64,encoding='utf-8');live.KEY_FILE=path
  live.PROBE.update(ok=True,recovered=True,flags={'enableSpotAndMarginTrading':True,'enableWithdrawals':True,'enableInternalTransfer':False},free={'USDT':'300'})
  self.assertFalse(status()['can_enable'])
 def test_take_profit_is_one_percent_net(self):
  exact=live.take_profit_bid('45','0','3')
  self.assertEqual(exact,D('15.15'))
  with_fee=live.take_profit_bid('45','0.045','3')
  cost=D('45.045');proceeds=with_fee*3*(1-D('0.045')/D('45'))
  net=(proceeds-cost)/cost
  self.assertGreaterEqual(net,D('0.008'));self.assertLessEqual(net,D('0.012'))
 def test_tactical_stop_is_tighter_than_the_two_percent_cap(self):
  self.assertEqual(live.armed_stop(D('100'),D('2'),'99.40'),D('99.40'))
  self.assertEqual(live.armed_stop(D('100'),D('2'),'97'),D('98.00'))
  self.assertEqual(live.armed_stop(D('100'),D('2'),None),D('98.00'))
 def test_board_shows_open_position_and_realized_exit(self):
  from server.v2.stocks_broker import OrderRequest
  store=live.book()
  buy=OrderRequest(symbol='AVAV',clientOrderId='A'*32,side='BUY',orderType='LIMIT',quoteAsset='USDT',quantity=D('1'),price=D('114.25'),tradingSession='RTH',walletType='MAIN')
  store.prepare(buy)
  sell=OrderRequest(symbol='AVAV',clientOrderId='B'*32,side='SELL',orderType='LIMIT',quoteAsset='USDT',quantity=D('0.4'),price=D('117.50'),tradingSession='RTH',walletType='MAIN')
  from contextlib import closing
  with closing(store.connect()) as c,c:
   c.execute("UPDATE orders SET state='FILLED',qty='1',gross='114.25',fee='0.11',updated=1000 WHERE id=?",(buy.clientOrderId,))
  store.prepare(sell,parent=buy.clientOrderId)
  with closing(store.connect()) as c,c:
   c.execute("UPDATE orders SET state='FILLED',qty='0.4',gross='47',fee='0.05',updated=2000,exit_active=0 WHERE id=?",(sell.clientOrderId,))
  board=live.trading_board(store,{'AVAV':{'T':5000,'bp':'117.50','ap':'117.60'}},5000)
  self.assertEqual(board['open_count'],1)
  held=board['holdings'][0]
  self.assertEqual(held['symbol'],'AVAV');self.assertEqual(held['qty'],'0.6');self.assertEqual(held['avg_price'],'114.25')
  self.assertEqual(held['mark'],'117.50');self.assertEqual(held['unrealized'],'1.88');self.assertEqual(board['realized'],'1.21')
  self.assertEqual([row['side'] for row in board['trades']],['SELL','BUY'])
  missing=live.trading_board(store,{},5000)
  self.assertIsNone(missing['holdings'][0]['unrealized']);self.assertIsNone(missing['unrealized'])
 def test_buy_size_respects_cap_and_minimum(self):
  order=live.make_buy('SOFI','14.96',D('50'),{'stepSize':'0.00000001','minNotional':'5','fractionable':True},'USDT')
  self.assertEqual(order.side,'BUY');self.assertEqual(order.orderType,'LIMIT');self.assertLessEqual(order.quantity*order.price,D('50'))
  self.assertGreaterEqual(order.quantity*order.price,D('5'));self.assertFalse(order.tokenize)
  self.assertIsNone(live.make_buy('QQQ','708.37',D('4'),{'stepSize':'1','minNotional':'5','fractionable':False},'USDT'))
 def test_route_stays_locked_without_secret(self):
  with patch('server.v2.execution_config.authenticate'):
   self.assertFalse(live_status(Auth(deviceId='test',code='test'))['live_enabled'])
   with self.assertRaises(HTTPException):live_toggle(LiveToggle(deviceId='test',code='test',enabled=True))
if __name__=='__main__':unittest.main()
