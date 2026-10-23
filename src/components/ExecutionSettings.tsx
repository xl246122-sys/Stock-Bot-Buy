import React,{useState} from 'react';
import {licenseService} from '../services/licenseService';
import {serverSyncService} from '../services/serverSyncService';
const defaults={budget_usd:'300',order_cap_usd:'50',max_open_trades:'3',max_trade_loss_pct:'1',daily_loss_cap_usd:'10'};
const labels:Record<string,string>={budget_usd:'总预算（美元）',order_cap_usd:'单笔上限（美元）',max_open_trades:'最多同时交易数',max_trade_loss_pct:'单笔最大计划亏损（%）',daily_loss_cap_usd:'每日最大亏损（美元）'};
export const ExecutionSettings:React.FC=()=>{
 const [values,setValues]=useState(defaults),[revision,setRevision]=useState(0),[message,setMessage]=useState('请先读取服务器配置'),[busy,setBusy]=useState(false);
 async function sync(save:boolean){if(save&&!window.confirm('保存以下额度到服务器？\n'+Object.entries(values).map(([k,v])=>labels[k]+'：'+v).join('\n')+'\n此操作不会开启实盘交易。'))return;setBusy(true);try{
  const auth=licenseService.getLicenseInfo();const limits={...values,max_open_trades:Number(values.max_open_trades)};
  const res=await fetch(serverSyncService.getState().activeEndpointUrl+'/api/v2/execution/config/'+(save?'save':'read'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:auth.deviceId,code:auth.code,...(save?{limits,expected_revision:revision,request_id:(globalThis.crypto?.randomUUID?.() || ('config-'+Date.now()+'-'+Math.random().toString(36).slice(2)))}:{})}),signal:AbortSignal.timeout(15000)});
  const data=await res.json();if(!res.ok)throw new Error(typeof data.detail==='string'?data.detail:'参数校验失败');
  setValues(Object.fromEntries(Object.entries(data.limits).map(([k,v])=>[k,String(v)])) as typeof defaults);setRevision(data.revision);setMessage('服务器已保存 · 版本'+data.revision+' · 实盘状态请查看交易控制面板');
 }catch(e){setMessage('未同步：'+String(e));}finally{setBusy(false);}}
 return <details className="rounded-2xl bg-slate-900 border border-slate-700 p-4"><summary className="text-white font-bold cursor-pointer">机器人交易额度与风控</summary><p className="text-amber-300 text-sm my-3">开盘后30分钟入场，最多3单，最长持仓3小时。净盈利目标0.8%—1.2%，计划净亏损上限1%。80%胜率需独立验证；实际成交可能偏离目标。保存配置不会改变实盘开关。</p>{Object.entries(values).map(([key,value])=><label key={key} className="block text-sm text-slate-300 my-2">{labels[key]}<input type="number" min="0" step={key==='max_open_trades'?'1':'0.01'} value={value} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));setMessage('有未同步修改');}} className="block w-full bg-slate-800 rounded p-2"/></label>)}<p className="text-xs text-slate-400 my-3">{message}</p><button disabled={busy} onClick={()=>sync(false)} className="text-blue-300 mr-4">读取服务器</button><button disabled={busy||!revision} onClick={()=>sync(true)} className="text-blue-300">保存到服务器</button></details>;
};
