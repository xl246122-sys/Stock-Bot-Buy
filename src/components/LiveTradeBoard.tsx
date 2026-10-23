import React,{useEffect,useRef,useState} from 'react';
import {licenseService} from '../services/licenseService';
import {serverSyncService} from '../services/serverSyncService';

type Holding={symbol:string;qty:string;avg_price:string|null;mark:string|null;unrealized:string|null;unrealized_pct:string|null;realized:string;state:string;protection?:string|null;stop?:string|null;target?:string|null;setup?:string|null;detail?:string|null;invalidation?:string|null};
type Trade={id:string;symbol:string;side:string;state:string;qty:string;avg_price:string|null;fee:string;updated:number;parent:string|null;setup?:string|null;detail?:string|null};
type Board={holdings:Holding[];trades:Trade[];open_count:number;pending_count:number;unrealized:string|null;realized:string;marks_complete:boolean};

const STATE:Record<string,string>={PREPARED:'待提交',SUBMITTING:'提交中',ACKNOWLEDGED:'已接受',NEW:'已挂单',ACCEPTED:'已接受',PARTIALLY_FILLED:'部分成交',FILLED:'已成交',CANCELED:'已取消',EXPIRED:'已过期',REJECTED:'已拒绝',UNKNOWN:'结果未知'};
const TERMINAL=new Set(['FILLED','CANCELED','EXPIRED','REJECTED']);
const EXIT:Record<string,string>={STOP:'止损卖出中',TARGET:'止盈卖出中',TIME:'持有到期卖出中'};
const SETUP:Record<string,string>={CHASE:'追涨',REBOUND:'超卖反弹'};

function signed(value:string|null|undefined){
 if(value==null||value==='')return '—';
 const n=Number(value);
 if(!Number.isFinite(n))return '—';
 return (n>0?'+':'')+n.toFixed(2);
}
function tone(value:string|null|undefined){
 const n=Number(value);
 if(!Number.isFinite(n)||n===0)return 'text-slate-300';
 return n>0?'text-emerald-400':'text-rose-400';
}
function when(ms:number){
 if(!ms)return '—';
 return new Date(ms).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

export const LiveTradeBoard:React.FC=()=>{
 const [board,setBoard]=useState<Board|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState<'active'|'completed'>('active');
 const [updated,setUpdated]=useState<number|null>(null);
 const inFlight=useRef(false);
 const mounted=useRef(false);
 async function refresh(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);
  try{
   const a=licenseService.getLicenseInfo();
   const r=await fetch(serverSyncService.getState().activeEndpointUrl+'/api/v2/execution/live/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:a.deviceId,code:a.code}),signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error('交易看板读取失败');
   const data=await r.json();
   if(!data.board||!Array.isArray(data.board.holdings)||!Array.isArray(data.board.trades))throw Error('服务器还没有返回交易看板');
   if(mounted.current){setBoard(data.board);setUpdated(Date.now());setError('');}
  }catch{if(mounted.current)setError('订单读取失败，请刷新重试。已有数据仅为上次快照。');}
  finally{inFlight.current=false;if(mounted.current)setBusy(false);}
 }
 useEffect(()=>{mounted.current=true;void refresh();const id=window.setInterval(()=>void refresh(),10000);return()=>{mounted.current=false;window.clearInterval(id);};},[]);
 const active=board?.trades.filter(row=>!TERMINAL.has(row.state))??[];
 const completed=board?.trades.filter(row=>TERMINAL.has(row.state))??[];
 return <section className="rounded-2xl bg-slate-900 border border-slate-700 p-4 space-y-3 text-sm text-slate-300">
  <div className="flex items-center justify-between gap-3">
   <h3 className="font-bold text-white">订单面板</h3>
   <button type="button" onClick={()=>void refresh()} disabled={busy} className="text-blue-300">{busy?'刷新中…':'刷新'}</button>
  </div>
  {error&&<p role="alert" className="text-red-300">{error}</p>}
  <p className="text-xs text-slate-400">每 10 秒自动刷新 · {updated?`更新于 ${when(updated)}（北京时间）`:busy?'正在读取订单…':'尚未读取到订单'}</p>
  {board&&<>
   <div role="tablist" aria-label="订单状态" className="grid grid-cols-2 gap-2">
    {(['active','completed'] as const).map(value=><button key={value} id={`orders-tab-${value}`} type="button" role="tab" aria-selected={tab===value} aria-controls="orders-content" onClick={()=>setTab(value)} className={`rounded-xl py-3 font-semibold ${tab===value?'bg-blue-600 text-white':'bg-slate-800 text-slate-300'}`}>{value==='active'?'正在交易':'已完成'}</button>)}
   </div>
   <div id="orders-content" role="tabpanel" aria-labelledby={`orders-tab-${tab}`} className="space-y-3">
   {tab==='active'&&<>

   <p>持仓 {board.open_count} 笔 · 未完成委托 {board.pending_count} 笔 · 浮动盈亏 <span className={tone(board.unrealized)}>{signed(board.unrealized)}</span> 美元 · 已实现 <span className={tone(board.realized)}>{signed(board.realized)}</span> 美元</p>
   <p className="text-xs text-slate-400">浮动按买一价估算，已计入已知买入费用，未扣除卖出费用。报价超过 2 秒不显示浮动。</p>
   <h4 className="font-semibold text-white">当前持仓 · {board.open_count}</h4>
   {board.holdings.length?board.holdings.map(row=><div key={row.symbol+row.qty+row.setup} className="rounded-xl bg-slate-800/70 p-3 space-y-1">
    <div className="flex items-center justify-between gap-3">
     <span className="font-bold text-white">{row.symbol}</span>
     <span className={tone(row.unrealized)}>{signed(row.unrealized)} 美元{row.unrealized_pct==null?'':` · ${signed(row.unrealized_pct)}%`}</span>
    </div>
    <p>持有 {row.qty} · 成交均价 {row.avg_price??'—'} · 现价 {row.mark??'报价暂缺'}</p>
    {row.setup&&<p className="text-xs text-slate-400">{SETUP[row.setup]||row.setup}{row.detail?` · ${row.detail}`:''}{row.invalidation?` · 触发位 ${row.invalidation}`:''}</p>}
    {(row.stop||row.target)&&<p className="text-xs text-slate-400">止损 {row.stop??'—'} · 止盈 {row.target??'—'}{row.protection?` · ${EXIT[row.protection]||row.protection}`:''}</p>}
   </div>):<p>还没有本系统的持仓。机器人买入成交后会显示在这里。</p>}
   </>}
   <div className="space-y-2">
    <h4 className="font-bold text-white">{tab==='active'?`待完成委托 · ${active.length}`:`已结束委托 · ${completed.length}`}</h4>
    <p className="text-xs text-slate-400">委托列表覆盖最近 40 条记录；当前持仓不受此限制。已成交表示该笔买单或卖单完成，不代表整笔持仓已平仓。</p>
    {(tab==='active'?active:completed).map(row=><article key={row.id} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3 space-y-2">
     <div className="flex items-center justify-between gap-2">
      <span className="font-bold text-white">{row.symbol} <span className={row.side==='SELL'?'text-orange-300':'text-blue-300'}>{row.side==='SELL'?'卖出':'买入'}</span></span>
      <span className={`text-xs rounded-full px-2 py-1 ${row.state==='FILLED'?'bg-emerald-900/50 text-emerald-300':row.state==='REJECTED'||row.state==='UNKNOWN'?'bg-rose-900/50 text-rose-300':'bg-slate-700 text-slate-200'}`}>{STATE[row.state]||row.state}</span>
     </div>
     <div className="grid grid-cols-2 gap-2 text-xs"><p>已成交数量 <span className="text-white">{row.qty}</span></p><p>成交均价 <span className="text-white">{row.avg_price==null?'—':`$${row.avg_price}`}</span></p><p>已知费用 ${row.fee}</p><p>{row.setup?(SETUP[row.setup]||row.setup):row.parent?'持仓退出委托':'入场委托'}</p></div>
     {row.detail&&<p className="text-xs text-slate-400">{row.detail}</p>}
     {row.state==='UNKNOWN'&&<p className="text-xs text-amber-300">成交结果待核对，请勿因结果未知而重复下单。</p>}
     <p className="text-xs text-slate-400">更新时间 {when(row.updated)}（北京时间）</p>
     <p className="text-xs text-slate-500 break-all">订单号 {row.id}</p>
    </article>)}
    {!(tab==='active'?active:completed).length&&<p className="rounded-xl bg-slate-800/50 p-4 text-center text-slate-400">{tab==='active'?'最近记录中暂无待完成委托':'最近记录中暂无已结束委托'}</p>}
   </div>
   </div>
  </>}
 </section>;
};
