import React from 'react';
import { AiAlertCardData } from '../services/aiBrainService';
import { StockQuote } from '../types/stock';
interface Props { alert: AiAlertCardData; onOpenStockDetail?: (s:StockQuote)=>void; stocks?:StockQuote[]; onOpenPopup?:(a:AiAlertCardData)=>void; }
const sectors:Record<string,string>={'consumer-discretionary':'可选消费','technology':'科技','semiconductors':'半导体','financials':'金融','healthcare':'医疗健康','communication-services':'通信服务','energy':'能源','industrials':'工业'};
const time=(n:number,z:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:z,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(n);
const price=(n:number)=>Number.isFinite(n)&&n>0?'$'+n.toFixed(2):'暂无';
export const AiAlertCard:React.FC<Props>=({alert:a})=>{
 const expired=a.validUntil<=Date.now();
 const kind=a.cardType||(a.isBuyOpportunity?'BUY':a.habitName==='RISK'?'RISK':'WATCH');
 const label=({BUY:'🟢 买入机会',RISK:'🔴 高位风险',WATCH:'🟡 观察',SECTOR_RISK:'📊 板块风险',NO_BUY:'⚪ 暂无买入机会',INSUFFICIENT_DATA:'🟡 数据不足',FAILED:'⚠️ 扫描失败'} as Record<string,string>)[kind]||'研判';
 const pct=(n:number)=>a.suggestedEntry>0?((n/a.suggestedEntry-1)*100).toFixed(2)+'%':'暂无';
 return <article id={'alert-'+a.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-2 text-sm">
 <div className="font-bold text-white">{label}｜{a.symbol==='MARKET'?'本轮扫描':a.symbol}（{sectors[a.sector]||a.sector}）</div>
 <div className="text-xs text-slate-400">⏰ {time(a.triggerTimestamp,'Asia/Shanghai')} 北京 / {time(a.triggerTimestamp,'America/New_York')} ET</div>
 {a.currentPrice>0&&<div>💰 信号时现价 {price(a.currentPrice)}</div>}
 {a.isBuyOpportunity?<><div>🎯 参考入场 {price(a.suggestedEntry)}</div><div><span className="text-emerald-400">✅ 止盈 {price(a.takeProfitPrice)}（{pct(a.takeProfitPrice)}）</span>｜<span className="text-rose-400">❌ 止损 {price(a.stopLossPrice)}（{pct(a.stopLossPrice)}）</span></div><div>⏳ 建议持有 {a.suggestedHoldingPeriod}</div></>:<div>👉 {kind==='RISK'?'已持有：关注减仓或收紧止损；未持有：暂不追涨。':kind==='FAILED'?'本轮未完成分析，请稍后重试。':'继续观察，等待条件确认。'}</div>}
 <p className="text-slate-200">💡 {a.briefReason}</p>
 {expired&&<div className="text-xs text-amber-400">历史记录 · 已过期，请勿按旧价格操作</div>}
 <details className="text-xs text-slate-400"><summary>来源与说明</summary>{a.modelBadge} · {a.disclaimer}</details>
 </article>;
};
