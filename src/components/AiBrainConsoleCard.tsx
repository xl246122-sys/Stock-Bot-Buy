import React, {useState,useEffect} from 'react';
import {aiBrainService} from '../services/aiBrainService';
interface Props {activeSubTab:'signals'|'positions'|'learning';onSubTabChange:(s:'signals'|'positions'|'learning')=>void;onOpenTestModal:()=>void;unreadCount:number;}
export const AiBrainConsoleCard:React.FC<Props> = () => {
 const [pending,setPending]=useState(false); const [error,setError]=useState('');
 const [s,setS]=useState(aiBrainService.getState()); useEffect(()=>aiBrainService.subscribe(setS),[]);
 return <details className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3"><summary className="text-white font-bold cursor-pointer select-none py-1">本地量化 · 美股监控</summary><p className="text-sm text-blue-300">{s.scheduleDescription}</p><p className="text-sm text-slate-300">行情事件驱动 · 本地独立决策 · AI研究默认关闭</p><p className="text-sm text-slate-300">{s.lastExecutionSummary}</p><p className="text-xs text-slate-400">模型：{s.modelName} · 最近完成：{s.lastScanTime || '暂无'}</p><p className="text-xs text-slate-400">开盘30分钟入场 · 最长3小时 · 净目标0.8%—1.2% · 胜率尚待验证</p><button className="text-blue-400 text-sm" onClick={()=>void aiBrainService.runAiBrainScanNow()}>刷新任务状态</button><button disabled={pending||s.isScanningNow} className="ml-4 text-blue-300" onClick={async()=>{setPending(true);setError('');try{await aiBrainService.requestManualScan();}catch(e){setError(String(e));}finally{setPending(false);}}}>{pending?'正在分析…':'立即扫描并通知'}</button>{error&&<p className="text-amber-400">{error}</p>}</details>;
};
