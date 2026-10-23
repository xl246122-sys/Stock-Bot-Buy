/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DipReboundScanner (暴跌反弹抄底 - Larry Connors TPS)
 * Material 3 Expressive Card Architecture with 44px+ touch targets & ubiquitous Dual RSI
 */

import React from 'react';
import { TrendingDown, Target, Eye, Plus, RefreshCw, Flame, ChevronRight, Activity } from 'lucide-react';
import { StockQuote, QuantSignal } from '../types/stock';
import { stockService } from '../services/stockService';

interface DipReboundScannerProps {
  stocks: StockQuote[];
  activeTimeframe: string;
  onSelectStock: (symbol: string) => void;
  onOpenSignal: (signal: QuantSignal) => void;
  onAddToWatchlist: (stock: StockQuote) => void;
  signalsMap: Map<string, QuantSignal>;
}

export const DipReboundScanner: React.FC<DipReboundScannerProps> = ({
  stocks,
  activeTimeframe,
  onSelectStock,
  onOpenSignal,
  onAddToWatchlist,
  signalsMap,
}) => {
  // Sort stocks: deepest drops first
  const sortedStocks = [...stocks].sort((a, b) => a.changePercent - b.changePercent);

  // 筛选暴跌标的与极度超卖标的
  const dipSweetSpotStocks = sortedStocks.filter((s) => s.changePercent <= -2.5);
  const oversoldCount = sortedStocks.filter((s) => s.rsi6 < 22 || s.rsi14 < 28).length;

  return (
    <div className="space-y-3">
      {/* Strategy Highlights Header Card (Material 3 Tonal Surface) */}
      <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3.5 sm:p-4 text-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                暴跌触底企稳反弹 (Connors TPS)
              </h2>
              <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                四阶段预警
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              捕捉非理性恐慌错杀标的，RSI(6)&lt;22 极度负乖离均值回归
            </p>
          </div>
        </div>

        {/* Compact Summary Pills */}
        <div className="flex items-center gap-2 font-mono text-xs shrink-0 flex-wrap">
          <div className="bg-[#12151c] px-3 py-1.5 rounded-xl border border-[#282e3c] flex items-center gap-1.5">
            <span className="text-slate-400 font-sans text-[11px]">恐慌急跌:</span>
            <span className="font-bold text-amber-400 tabular-nums">{dipSweetSpotStocks.length}</span>
            <span className="text-slate-500 text-[10px]">只</span>
          </div>
          <div className="bg-[#12141c] px-3 py-1.5 rounded-xl border border-[#282e3c] flex items-center gap-1.5">
            <span className="text-slate-400 font-sans text-[11px]">极限超卖:</span>
            <span className="font-bold text-[#f28b82] tabular-nums">{oversoldCount}</span>
            <span className="text-slate-500 text-[10px]">只</span>
          </div>
        </div>
      </div>

      {/* Real-time Live Market Status Indicator */}
      <div className="bg-[#12151c] border border-[#282e3c] rounded-2xl p-2.5 sm:p-3 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-[#81c995] animate-pulse shrink-0" />
          <span className="font-medium text-slate-300">
            美股实盘直连 (Finnhub & Binance) · 连续竞价高频巡检
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-[#8ab4f8] font-mono shrink-0">
          <span>Connors TPS 均值回归</span>
        </div>
      </div>

      {/* Stock Cards List (Material 3 Card Collection) */}
      <div className="space-y-2.5">
        {sortedStocks.map((stock) => {
          const tfMetrics = (stock.timeframeMetrics as any)?.[activeTimeframe] || {
            rsi6: stock.rsi6,
            rsi14: stock.rsi14,
            percentB: stock.bollinger.percentB,
            signalStrength: '中性',
          };
          const signal = signalsMap.get(stock.symbol);
          const isOversold = tfMetrics.rsi6 <= 22;
          const isWarning = tfMetrics.rsi6 <= 30 && !isOversold;

          return (
            <div
              key={`stock-${stock.symbol}`}
              className="bg-[#181b24] hover:bg-[#202430] border border-[#282e3c] rounded-2xl p-3 sm:p-3.5 transition-all shadow-sm flex flex-col gap-2.5"
            >
              {/* Row 1: Stock Identity, Binance Pair & Real-Time Price */}
              <div className="flex items-center justify-between gap-2">
                {/* Left: Symbol & Metadata */}
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => onSelectStock(stock.symbol)}
                    className="font-mono font-bold text-white hover:text-[#8ab4f8] text-base tracking-tight text-left truncate flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>{stock.symbol}</span>
                    {stock.binanceSymbol && (
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded-md border border-amber-400/25">
                        {stock.binanceSymbol}
                      </span>
                    )}
                  </button>
                  <span className="text-xs text-slate-400 truncate max-w-[100px] sm:max-w-[150px]">
                    {stock.name}
                  </span>
                  {stock.sectorEtf && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#12151c] border border-[#282e3c] text-[#8ab4f8] shrink-0 font-medium">
                      {stock.sectorEtf.etfSymbol}
                    </span>
                  )}
                  {stock.price < 10.0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0 hidden xs:inline">
                      &lt;$10
                    </span>
                  )}
                </div>

                {/* Right: Big Price & 24h Change Pill */}
                <div className="flex items-center gap-2 text-right font-mono shrink-0">
                  <span
                    className={`text-sm sm:text-base font-bold tabular-nums ${
                      stock.priceDirection === 'up'
                        ? 'text-[#81c995]'
                        : stock.priceDirection === 'down'
                        ? 'text-[#f28b82]'
                        : 'text-white'
                    }`}
                  >
                    ${stock.price.toFixed(2)}
                  </span>
                  <span
                    className={`text-xs font-bold tabular-nums px-2.5 py-1 rounded-full ${
                      stock.changePercent < 0
                        ? 'bg-rose-500/20 text-[#f28b82] border border-rose-500/30'
                        : 'bg-emerald-500/20 text-[#81c995] border border-emerald-500/30'
                    }`}
                  >
                    {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Row 2: Dual RSI Capsule & Quant Indicators */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#282e3c]/60">
                <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs">
                  {/* Unified Dual RSI Badge */}
                  <div className="flex items-center bg-[#12151c] rounded-full px-2.5 py-1 border border-[#282e3c] gap-2">
                    <span className="text-slate-400 text-[11px] font-sans">RSI:</span>
                    <span
                      className={`font-bold tabular-nums ${
                        isOversold
                          ? 'text-[#f28b82]'
                          : isWarning
                          ? 'text-amber-300'
                          : 'text-[#8ab4f8]'
                      }`}
                    >
                      6: {tfMetrics.rsi6.toFixed(1)}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-300 tabular-nums font-semibold">
                      14: {tfMetrics.rsi14.toFixed(1)}
                    </span>
                  </div>

                  {/* RVOL & Market Cap */}
                  <span className="bg-[#12151c] px-2.5 py-1 rounded-full text-slate-300 border border-[#282e3c] text-[11px]">
                    量比: {stock.rvol.toFixed(1)}x
                  </span>
                  <span className="bg-[#12151c] px-2.5 py-1 rounded-full text-slate-400 border border-[#282e3c] text-[11px] hidden sm:inline">
                    市值: ${stock.marketCap.toFixed(0)}B
                  </span>

                  {/* 4-Stage Lifecycle Badge if triggered */}
                  {signal?.alertStage === 'STAGE_1_DIP_STARTED' && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      🚨 急跌观察
                    </span>
                  )}
                  {signal?.alertStage === 'STAGE_2_DIP_EXHAUSTION' && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">
                      ⚠️ 超卖衰竭
                    </span>
                  )}
                  {signal?.alertStage === 'STAGE_3_BUY_REBOUND' && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-xs">
                      <Flame className="w-3.5 h-3.5 fill-current" />
                      <span>触底买入信号</span>
                    </span>
                  )}
                </div>

                {/* Right: Standardized M3 Action Buttons (Unified h-9, 44px touch targets) */}
                <div className="flex items-center gap-1.5 shrink-0 font-sans">
                  {signal && signal.strategy === 'PLUNGE_DIP' ? (
                    <button
                      onClick={() => onOpenSignal(signal)}
                      className="h-9 px-3.5 bg-amber-400 hover:bg-amber-300 text-neutral-950 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm active:scale-[0.97]"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>抄底预警({signal.winRateEstimate}%)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onSelectStock(stock.symbol)}
                      className="h-9 px-3.5 bg-[#202430] hover:bg-[#282d3b] text-[#8ab4f8] rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#282e3c] active:scale-[0.97]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>K线分析</span>
                    </button>
                  )}
                  <button
                    onClick={() => onAddToWatchlist(stock)}
                    className="h-9 px-3 bg-[#202430] hover:bg-[#282d3b] text-slate-200 rounded-full text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer border border-[#282e3c] active:scale-[0.97]"
                    title="添加至持仓自选跟踪"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>自选</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
