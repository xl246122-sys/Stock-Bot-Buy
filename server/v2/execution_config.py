"""Versioned execution limits. Saving configuration never enables trading."""
import json,sqlite3,time
from pathlib import Path
from contextlib import closing
from decimal import Decimal
from pydantic import BaseModel,ConfigDict,Field,model_validator
from fastapi import APIRouter,HTTPException
ROOT=Path(__file__).resolve().parents[1]/'data/v2'
router=APIRouter(prefix='/api/v2/execution')
class Limits(BaseModel):
 model_config=ConfigDict(extra='forbid')
 budget_usd:Decimal=Field(default=Decimal('300'),gt=0,le=100000,decimal_places=2)
 order_cap_usd:Decimal=Field(default=Decimal('50'),gt=0,le=100000,decimal_places=2)
 max_open_trades:int=Field(default=3,ge=1,le=3,strict=True)
 max_trade_loss_pct:Decimal=Field(default=Decimal('1'),gt=0,le=1,decimal_places=2)
 daily_loss_cap_usd:Decimal=Field(default=Decimal('10'),gt=0,le=100000,decimal_places=2)
 @model_validator(mode='after')
 def consistent(self):
  if self.order_cap_usd>self.budget_usd or self.daily_loss_cap_usd>self.budget_usd:raise ValueError('限额不能超过总预算')
  return self
class Auth(BaseModel):
 deviceId:str=Field(min_length=1,max_length=128)
 code:str=Field(min_length=1,max_length=128)
class Save(Auth):
 expected_revision:int=Field(ge=1)
 request_id:str=Field(min_length=8,max_length=128)
 limits:Limits

def connect():
 ROOT.mkdir(parents=True,exist_ok=True)
 c=sqlite3.connect(ROOT/'execution.db',timeout=10)
 c.execute('CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated INTEGER)')
 c.execute('CREATE TABLE IF NOT EXISTS changes(request TEXT PRIMARY KEY,revision INTEGER,payload TEXT,updated INTEGER)')
 c.execute('INSERT OR IGNORE INTO config VALUES(1,1,?,?)',(Limits().model_dump_json(),int(time.time()*1000)));c.commit()
 return c

def read_config():
 with closing(connect()) as c:rev,payload,updated=c.execute('SELECT revision,payload,updated FROM config WHERE id=1').fetchone()
 limits=json.loads(payload)
 limits['max_open_trades']=min(int(limits['max_open_trades']),3)
 limits['max_trade_loss_pct']=str(min(Decimal(str(limits['max_trade_loss_pct'])),Decimal('1')))
 return {'revision':rev,'limits':limits,'updated_at':updated,'mode':'disabled','live_enabled':False,'day_timezone':'Asia/Shanghai'}

def save_config(body):
 with closing(connect()) as c,c:
  c.execute('BEGIN IMMEDIATE')
  prior=c.execute('SELECT payload FROM changes WHERE request=?',(body.request_id,)).fetchone()
  if prior:
   if prior[0]!=body.limits.model_dump_json():raise HTTPException(409,'重复请求内容不同')
  else:
   rev=c.execute('SELECT revision FROM config WHERE id=1').fetchone()[0]
   if rev!=body.expected_revision:raise HTTPException(409,'配置已更新，请重新加载')
   payload=body.limits.model_dump_json();now=int(time.time()*1000)
   c.execute('UPDATE config SET revision=?,payload=?,updated=? WHERE id=1',(rev+1,payload,now))
   c.execute('INSERT INTO changes VALUES(?,?,?,?)',(body.request_id,rev+1,payload,now))
 return read_config()

def authenticate(body):
 from database import verify_license
 if verify_license(body.deviceId,body.code).get('status')!='ACTIVE':raise HTTPException(403,'授权无效')

@router.post('/config/read')
def read_route(body:Auth):
 authenticate(body);return read_config()
@router.post('/config/save')
def save_route(body:Save):
 authenticate(body);return save_config(body)

@router.post("/status")
def status_route(body:Auth):
 authenticate(body)
 from .execution_observer import STATE
 return dict(STATE)

class PaperToggle(Auth):
 enabled:bool=Field(strict=True)
 expected_revision:int=Field(ge=1)

@router.post('/paper/status')
def paper_status(body:Auth):
 authenticate(body)
 from .paper_execution import status
 return status()

@router.post('/paper/toggle')
def paper_toggle(body:PaperToggle):
 authenticate(body)
 from .paper_execution import toggle
 try:return toggle(body.enabled,body.expected_revision)
 except ValueError as exc:raise HTTPException(409,str(exc))

class LiveToggle(Auth):
 model_config=ConfigDict(extra='forbid')
 enabled:bool=Field(strict=True)

@router.post('/live/status')
def live_status(body:Auth):
 authenticate(body)
 from .live_control import status
 return status()

@router.post('/live/toggle')
def live_toggle(body:LiveToggle):
 authenticate(body)
 from .live_control import set_enabled
 return set_enabled(body.enabled)


@router.post('/comparison/status')
def comparison_status(body:Auth):
 authenticate(body)
 from .comparison_shadow import Comparison
 return Comparison(ROOT/'comparison-shadow.db').summary()
