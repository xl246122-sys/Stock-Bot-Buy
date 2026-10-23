/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, RefreshCw, Target, BarChart2, ShieldCheck, Plus, Sparkles, Activity, Layers } from 'lucide-react';
import { StockQuote, TimeFrame } from '../types/stock';
import { stockService } from '../services/stockService';
import { SectorEtfService } from '../services/sectorEtfService';
import { SectorCorrelationService } from '../services/sectorCorrelationService';
import { QuantEngine } from '../services/quantEngine';
import { StrategyInsightsChart } from './StrategyInsightsChart';
import { RsiMiniSparkline } from './RsiMiniSparkline';
import { QuantRadarChart } from './QuantRadarChart';

interface StockDetailModalProps {
  stock: StockQuote | null;
  onClose: () => void;
  onAddToWatchlist: (stock: StockQuote) => void;
}

export const StockDetailModal: React.FC<StockDetailModalProps> = ({
  stock,
  onClose,
  onAddToWatchlist,
}) => {
  if (!stock) return null;

  const [activeTf, setActiveTf] = useState<TimeFrame>('30m');
  const [viewTab, setViewTab] = useState<'kline' | 'radar'>('kline');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveInfo, setLiveInfo] = useState<string | null>(null);

  const bSym = stock.binanceSymbol || stockService.resolveBinanceSymbol(stock.symbol);

  const handleRefreshLive = async () => {
    setIsRefreshing(true);
    setLiveInfo(`正在同步币安官方 ${bSym} 500根 ${activeTf} K线...`);
    const updated = await stockService.syncBinanceAsset(stock.symbol, activeTf);
    if (updated) {
      setLiveInfo(`已与币安实盘对齐: $${updated.price.toFixed(2)} (${updated.changePercent > 0 ? '+' : ''}${updated.changePercent.toFixed(2)}%) · RSI(6)=${updated.rsi6.toFixed(1)}`);
    } else {
      setLiveInfo('已从币安高频缓存层更新最新数据');
    }
    setIsRefreshing(false);
  };

  const handleRestoreLive = async () => {
    setIsRefreshing(true);
    setLiveInfo('正在退出模拟注入，恢复币安官方实盘...');
    await stockService.restoreLiveBinance(stock.symbol);
    setLiveInfo('已恢复币安官方 100% 实盘行情');
    setIsRefreshing(false);
  };

  const isPlungeZone = stock.changePercent <= -4.8 && stock.changePercent >= -14.0;
  const isRsiOversold = stock.rsi6 <= 22;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-3xl max-w-2xl w-full p-3.5 sm:p-5 text-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        {/* Android 16 Modal Sheet Drag Handle */}
        <div className="w-10 h-1 rounded-full bg-slate-600/50 mx-auto mb-3 sm:hidden" />

        {/* Close Button (M3 Icon Button) */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-full bg-[#1c202a] hover:bg-[#242936] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5 pr-8">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white">{stock.symbol}</h2>
              <span className="text-xs text-amber-300 font-mono bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/30">
                币安: {bSym}
              </span>
              <span className="text-xs text-slate-400 bg-[#101216] px-2 py-0.5 rounded-full border border-[#2a2e37]">
                {stock.exchange} · {stock.sector}
              </span>
              {stock.isSimulatedTest && (
                <span className="text-xs text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full font-bold border border-rose-500/40 animate-pulse">
                  模拟超卖注入中
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">{stock.name}</div>
          </div>

          <div className="text-right">
            <div
              className={`text-base sm:text-lg font-bold font-mono tabular-nums transition-colors duration-300 ${
                stock.priceDirection === 'up'
                  ? 'text-emerald-300 font-extrabold'
                  : stock.priceDirection === 'down'
                  ? 'text-rose-300 font-extrabold'
                  : 'text-white'
              }`}
            >
              ${stock.price.toFixed(2)}
            </div>
            <div
              className={`text-xs font-mono font-bold ${
                stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}% (${stock.change.toFixed(2)})
            </div>
          </div>
        </div>

        {/* Live sync pill (Google Material 3 Container) */}
        <div className="flex items-center justify-between bg-[#12141a] px-3 py-2 rounded-2xl border border-[#242936] mb-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-mono truncate mr-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0" />
            <span className="truncate">{liveInfo || `币安官方数据源 · 500根 ${activeTf} K线 RMA 零漂移对齐 · 刷新: ${stock.lastUpdated}`}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {stock.isSimulatedTest && (
              <button
                onClick={handleRestoreLive}
                disabled={isRefreshing}
                className="h-7 px-2.5 rounded-full text-xs text-amber-300 hover:text-white bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 transition-all font-medium flex items-center justify-center cursor-pointer"
              >
                <span>恢复实盘</span>
              </button>
            )}
            <button
              onClick={handleRefreshLive}
              disabled={isRefreshing}
              className="h-7 px-2.5 rounded-full text-xs text-amber-300 hover:text-white bg-[#181a20] hover:bg-[#222630] border border-amber-400/30 transition-all font-medium flex items-center gap-1 justify-center cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>同步币安</span>
            </button>
            <button
              onClick={() => setViewTab(viewTab === 'kline' ? 'radar' : 'kline')}
              className={`h-7 px-3 rounded-full border transition-all font-semibold text-xs flex items-center gap-1 justify-center cursor-pointer ${
                viewTab === 'radar'
                  ? 'bg-cyan-500 text-neutral-950 border-cyan-400 shadow-xs'
                  : 'text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 border-cyan-500/30'
              }`}
              title="切换查看波动率、成交量突变、RSI与板块相关性量化雷达"
            >
              <Activity className="w-3 h-3" />
              <span>{viewTab === 'kline' ? '量化多维雷达' : '返回K线图'}</span>
            </button>
          </div>
        </div>

        {viewTab === 'radar' ? (
          <div className="py-2">
            <div className="text-slate-400 text-sm">研判建议请查看 AI 预警页</div>
          </div>
        ) : (
          <>
            {/* Timeframe switch */}
            <div className="flex items-center justify-between mb-2 text-xs">
          <span className="text-slate-400 text-[10px]">K线分析周期:</span>
          <div className="flex items-center gap-0.5 bg-[#101216] p-0.5 rounded-full border border-[#2a2e37]">
            {(['30m', '1h', '2h', '4h', '1d', '1w'] as TimeFrame[]).map((tf) => (
              <button
                key={tf}
                onClick={async () => {
                  setActiveTf(tf);
                  await stockService.syncBinanceAsset(stock.symbol, tf);
                }}
                className={`px-1.5 py-0.5 rounded-full font-mono text-[10px] transition-colors ${
                  activeTf === tf
                    ? 'bg-amber-400 text-neutral-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Strategy Insights Chart */}
        

        {/* Active Timeframe Indicators */}
        {(() => {
          const currentTfData = (stock.timeframeMetrics as any)?.[activeTf] || {
            rsi6: stock.rsi6,
            rsi14: stock.rsi14,
            percentB: stock.bollinger.percentB,
            signalStrength: '中性'
          };

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 my-2.5 text-xs font-mono">
              {/* RSI (6) Sparkline Card */}
              <RsiMiniSparkline
                value={currentTfData.rsi6}
                period={6}
                threshold={22}
                timeframe={activeTf}
                size="lg"
              />

              {/* RSI (14) Sparkline Card */}
              <RsiMiniSparkline
                value={currentTfData.rsi14}
                period={14}
                threshold={28}
                timeframe={activeTf}
                size="lg"
              />

              {/* RVOL Card */}
              <div className="bg-[#101216] p-2 rounded-xl border border-[#2a2e37] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px]">量比 (RVOL)</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded ${stock.rvol >= 2.0 ? 'bg-blue-500/20 text-blue-300 font-bold' : 'text-slate-500'}`}>
                    {stock.rvol >= 2.0 ? '大资金放量' : '常规流动性'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 my-1">
                  <span
                    className={`text-base font-bold tabular-nums ${
                      stock.rvol >= 2.0 ? 'text-blue-400' : 'text-slate-200'
                    }`}
                  >
                    {stock.rvol.toFixed(1)}x
                  </span>
                  <span className="text-[9px] text-slate-500">
                    / 基准 1.0x
                  </span>
                </div>
                {/* Visual bar for RVOL */}
                <div className="w-full h-1.5 bg-[#1f2430] rounded-full overflow-hidden border border-slate-700/50">
                  <div
                    className={`h-full rounded-full transition-all ${stock.rvol >= 2.0 ? 'bg-blue-500' : 'bg-slate-500'}`}
                    style={{ width: `${Math.min(100, (stock.rvol / 4) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Bollinger %B Card */}
              <div className="bg-[#101216] p-2 rounded-xl border border-[#2a2e37] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px]">布林带 %B</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded ${currentTfData.percentB < 0.1 ? 'bg-rose-500/20 text-rose-300 font-bold animate-pulse' : 'text-slate-500'}`}>
                    {currentTfData.percentB < 0.1 ? '击穿下轨' : currentTfData.percentB > 0.9 ? '突破上轨' : '通道内'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 my-1">
                  <span
                    className={`text-base font-bold tabular-nums ${
                      currentTfData.percentB < 0.1 ? 'text-rose-400' : 'text-slate-200'
                    }`}
                  >
                    {currentTfData.percentB.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-slate-500">
                    下轨:${stock.bollinger.lower.toFixed(1)}
                  </span>
                </div>
                {/* Visual bar for %B */}
                <div className="relative w-full h-1.5 bg-[#1f2430] rounded-full overflow-hidden border border-slate-700/50">
                  <div className="absolute top-0 bottom-0 left-[15%] w-0.5 bg-rose-400/80 z-10" />
                  <div className="absolute top-0 bottom-0 left-[85%] w-0.5 bg-emerald-400/80 z-10" />
                  <div
                    className={`h-full rounded-full transition-all ${
                      currentTfData.percentB < 0.15 ? 'bg-rose-500' : currentTfData.percentB > 0.85 ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, currentTfData.percentB * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Multi-Timeframe Matrix */}
        <div className="bg-[#101216] rounded-xl border border-[#2a2e37] p-2.5 mb-2.5 text-xs font-mono">
          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-[#232731]">
            <span className="text-slate-200 font-sans font-semibold flex items-center gap-1 text-[11px]">
              <BarChart2 className="w-3 h-3 text-blue-400" />
              多周期技术指标共振对比 (RSI Sparkline 条形图)
            </span>
            <span className="text-[9px] text-slate-400">
              <span className="text-rose-400 font-bold">RSI(6)&lt;22</span> / <span className="text-amber-300 font-bold">RSI(14)&lt;28</span> 高亮超卖
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-center text-[10px]">
              <thead className="text-[9px] text-slate-500 border-b border-[#232731] uppercase">
                <tr>
                  <th className="py-1 px-1.5 text-left font-sans">周期</th>
                  <th className="py-1 px-1.5 text-left">RSI(6) 条形图</th>
                  <th className="py-1 px-1.5 text-left">RSI(14) 条形图</th>
                  <th className="py-1 px-1.5">布林%B</th>
                  <th className="py-1 px-1.5 text-right font-sans">量化状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232731]/60 tabular-nums">
                {(['30m', '1h', '2h', '4h', '1d', '1w'] as TimeFrame[]).map((tfKey) => {
                  const m = (stock.timeframeMetrics as any)?.[tfKey] || {
                    rsi6: stock.rsi6,
                    rsi14: stock.rsi14,
                    percentB: stock.bollinger.percentB,
                    signalStrength: '中性'
                  };
                  const isCurrent = activeTf === tfKey;
                  const isRowOversold = m.rsi6 < 22 || m.rsi14 < 28;

                  return (
                    <tr
                      key={tfKey}
                      onClick={() => setActiveTf(tfKey)}
                      className={`cursor-pointer transition-colors ${
                        isRowOversold
                          ? 'bg-rose-500/[0.08] hover:bg-rose-500/15'
                          : isCurrent
                          ? 'bg-blue-600/15 hover:bg-blue-600/20'
                          : 'hover:bg-[#181a20]'
                      }`}
                    >
                      <td className="py-1.5 px-1.5 text-left font-sans flex items-center gap-1">
                        <span className={`font-semibold ${isCurrent ? 'text-amber-400' : 'text-slate-300'}`}>{tfKey}</span>
                        {isCurrent && <span className="text-[8px] text-amber-400 font-bold">● 当前</span>}
                        {isRowOversold && <span className="text-[8px] text-rose-400 animate-pulse">⚡超卖</span>}
                      </td>
                      <td className="py-1.5 px-1.5 text-left">
                        <RsiMiniSparkline
                          value={m.rsi6}
                          period={6}
                          threshold={22}
                          size="sm"
                          showBadge={false}
                        />
                      </td>
                      <td className="py-1.5 px-1.5 text-left">
                        <RsiMiniSparkline
                          value={m.rsi14}
                          period={14}
                          threshold={28}
                          size="sm"
                          showBadge={false}
                        />
                      </td>
                      <td className="py-1.5 px-1.5">
                        <span className={m.percentB < 0.15 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                          {m.percentB.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-sans text-[9px]">
                        <span className={`px-1.5 py-0.5 rounded ${
                          isRowOversold
                            ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
                            : m.rsi6 >= 70
                            ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                            : 'text-slate-400'
                        }`}>
                          {m.signalStrength}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-sm text-slate-400 p-3">本页仅展示行情与指标。买入、观察及风险建议请查看「AI研判与预警」，由 deepseek-flash 统一分析。</div>

          </>
        )}
        {/* Actions (Google Material 3 Standard Buttons) */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#242936]">
          <button
            onClick={onClose}
            className="h-9 px-4 text-xs font-semibold text-slate-300 hover:text-white bg-[#1c202a] hover:bg-[#242936] rounded-full transition-all cursor-pointer border border-[#2a2f3e]"
          >
            关闭
          </button>
          <button
            onClick={() => {
              onAddToWatchlist(stock);
              onClose();
            }}
            className="h-9 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-full transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>加入持仓监控</span>
          </button>
        </div>
      </div>
    </div>
  );
};
