"""Binance Stocks REST adapter. Construction does not load credentials or make requests."""
import hashlib,hmac,time,re,logging
from decimal import Decimal
from urllib.parse import urlencode
import httpx
from pydantic import BaseModel,ConfigDict,Field,model_validator
from typing import Literal

class OrderRequest(BaseModel):
    model_config=ConfigDict(extra='forbid',frozen=True)
    symbol:str=Field(pattern=r'^[A-Z][A-Z0-9.-]{0,19}$')
    clientOrderId:str=Field(pattern=r'^[a-zA-Z0-9_-]{32,36}$')
    side:Literal['BUY','SELL']
    orderType:Literal['LIMIT','MARKET']
    quoteAsset:Literal['USDC','USDT']='USDC'
    quantity:Decimal|None=Field(default=None,gt=0,allow_inf_nan=False)
    price:Decimal|None=Field(default=None,gt=0,decimal_places=2,allow_inf_nan=False)
    notional:Decimal|None=Field(default=None,gt=0,decimal_places=2,allow_inf_nan=False)
    tradingSession:Literal['RTH','EXTENDED','24H']|None=None
    timeInForce:Literal['DAY','GTC']='DAY'
    walletType:Literal['CARD','MAIN']='CARD'
    tokenize:bool=False
    @model_validator(mode='after')
    def combinations(self):
        if self.orderType=='LIMIT':
            if self.quantity is None or self.price is None or self.tradingSession is None or self.notional is not None:raise ValueError('invalid_limit_fields')
            if self.quantity%1 and self.timeInForce=='GTC' and self.tradingSession=='RTH':raise ValueError('fractional_gtc_session')
        else:
            if self.price is not None or self.tradingSession is not None or self.timeInForce!='DAY':raise ValueError('invalid_market_fields')
            if self.side=='BUY' and (self.notional is None or self.quantity is not None):raise ValueError('market_buy_requires_notional')
            if self.side=='SELL' and (self.quantity is None or self.notional is not None):raise ValueError('market_sell_requires_quantity')
        return self

class SignedURLFilter(logging.Filter):
    def filter(self,record):
        record.msg=re.sub(r'([?&]signature=)[^&\s"\']+',r'\1[REDACTED]',record.getMessage())
        record.args=()
        return True

# httpx logs request URLs at INFO; avoid retaining usable signatures there.
logging.getLogger('httpx').addFilter(SignedURLFilter())

class BrokerError(Exception):
    """Sanitized error: never includes signed URLs, headers or raw response bodies."""
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code

class StocksBroker:
    def __init__(self,client:httpx.AsyncClient,api_key:str,secret:str,*,writes_enabled=False,clock=None):
        self.client,self.key,self.secret=client,api_key,secret
        self.writes_enabled=writes_enabled;self.clock=clock or (lambda:int(time.time()*1000))
    async def _request(self,method,path,params,allow_list=False):
        if method=='POST' and not self.writes_enabled:raise BrokerError('writes_disabled')
        pairs={k:('true' if v is True else 'false' if v is False else str(v)) for k,v in params.items() if v is not None}
        pairs.update(timestamp=str(self.clock()),recvWindow='5000')
        query=urlencode(pairs);signature=hmac.new(self.secret.encode(),query.encode(),hashlib.sha256).hexdigest()
        try:
            r=await self.client.request(method,'https://api.binance.com'+path+'?'+query+'&signature='+signature,headers={'X-MBX-APIKEY':self.key},timeout=10,follow_redirects=False)
            if r.status_code!=200:
                code=None
                try:
                    payload=r.json()
                    if isinstance(payload,dict) and type(payload.get('code')) is int:code=payload['code']
                except Exception:code=None
                raise BrokerError('broker_http_'+str(r.status_code),code)
            data=r.json()
            if isinstance(data,dict) or (allow_list and isinstance(data,list)):return data
            raise BrokerError('invalid_broker_response')
        except BrokerError:raise
        except Exception:raise BrokerError('broker_transport_or_decode_error') from None
    async def read(self,path,params=None):
        return await self._request('GET',path,params or {},allow_list=True)
    async def place(self,order:OrderRequest):
        return await self._request('POST','/sapi/v1/equity/order/place',order.model_dump(mode='json',exclude_none=True))
    async def detail(self,client_id):
        return await self._request('GET','/sapi/v1/equity/order/detail',{'clientOrderId':client_id})
    async def cancel(self,order_id):
        return await self._request('POST','/sapi/v1/equity/order/cancel',{'orderId':order_id})
