import React,{useEffect,useState} from 'react';
import {licenseService} from '../services/licenseService';
import {serverSyncService} from '../services/serverSyncService';

type Blocker={code:string;message:string};
type LiveStatus={
 live_enabled:boolean;can_enable:boolean;state:string;blockers:Blocker[];
 activity?:string|null;protection?:string;
 positions?:{symbol:string;state:string;qty:string;remaining:string|null;realized:string|null;protection?:string|null}[];
 account?:{free?:Record<string,string>;withdrawals?:boolean;transfers?:boolean};
};

export const LiveTradingControl:React.FC=()=>{
 const [state,setState]=useState<LiveStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){
  setBusy(true);
  try{
   const a=licenseService.getLicenseInfo();
   const r=await fetch(serverSyncService.getState().activeEndpointUrl+'/api/v2/execution/live/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:a.deviceId,code:a.code}),signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error('服务器状态读取失败');
   const data=await r.json();
   if(typeof data.live_enabled!=='boolean'||typeof data.can_enable!=='boolean'||!Array.isArray(data.blockers))throw Error('服务器返回的实盘状态无法识别');
   setState(data);setError('');
  }catch(e){setState(null);setError(String(e));}
  finally{setBusy(false);}
 }
 async function toggle(){
  if(!state)return;
  const next=!state.live_enabled;
  if(next&&!window.confirm('开启后，本地量化独立筛选并在开盘30分钟内按规则执行，AI不参与下单决策。最多3单，最长3小时。净盈利目标0.8%—1.2%，计划净亏损1%；实际成交可能偏离。止盈止损独立运行，断网或停牌仍可能无法及时退出。不保证80%胜率。'))return;
  setBusy(true);
  try{
   const a=licenseService.getLicenseInfo();
   const r=await fetch(serverSyncService.getState().activeEndpointUrl+'/api/v2/execution/live/toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:a.deviceId,code:a.code,enabled:next}),signal:AbortSignal.timeout(10000)});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(data?.detail?.message||data?.message||'服务器拒绝了这次切换');
   setState(data);setError('');
  }catch(e){setError(String(e));}
  finally{setBusy(false);}
 }
 useEffect(()=>{void refresh();const id=window.setInterval(()=>void refresh(),10000);return()=>window.clearInterval(id);},[]);
 const on=state?.live_enabled===true;
 return <section className="rounded-2xl bg-slate-900 border border-slate-700 p-4 space-y-3 text-sm text-slate-300">
  <h3 className="font-bold text-white">实盘自主交易</h3>
  <div className="flex items-center justify-between gap-3">
   <span>{!state?'实盘状态未确认':on?(state.state==='halted'?'实盘已暂停开仓':'实盘运行中，新开仓由服务器执行'):state.can_enable?'实盘关闭，账户核验已通过':'实盘关闭，条件未满足'}</span>
   <button type="button" role="switch" aria-label="授权机器人实盘自主交易" aria-checked={on} disabled={busy||!state||(!on&&!state.can_enable)} onClick={()=>void toggle()} className={`rounded-full px-4 py-2 ${on?'bg-emerald-600 text-white':'bg-slate-700 text-slate-200'} disabled:cursor-not-allowed disabled:text-slate-500`}>{on?'运行':'关闭'}</button>
  </div>
  <p>只提交币安美股限价买单和保护性卖出。不转账，不交易永续合约。模拟交易开关仍然独立。</p>
  {state?.protection&&<p className="text-amber-300">{state.protection}</p>}
  {state?.activity&&<p>最近动作：{state.activity}</p>}
  {state?.account?.free&&<p>可用 {Object.entries(state.account.free).map(([k,v])=>`${k} ${v}`).join(' · ')||'稳定币余额未返回'}</p>}
  {state?.blockers.map(x=><p key={x.code} className="text-amber-300">• {x.message}</p>)}
  {error&&<p role="alert" className="text-red-300">{error}</p>}
  <button type="button" onClick={()=>void refresh()} disabled={busy} className="text-blue-300">{busy?'正在核验…':'重新核验账户'}</button>
 </section>;
};
