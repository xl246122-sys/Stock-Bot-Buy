/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RangeOscillatorScanner (区间震荡微波获利 - Bollinger Scalper)
 * Material 3 Expressive Card Architecture with 44px+ touch targets & %B Channel Monitoring
 */

import React, { useState } from 'react';
import { Activity, Target, Eye, Plus, BarChart2, Zap, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { StockQuote, QuantSignal } from '../types/stock';
import { RangeOscillatorVisualChart } from './RangeOscillatorVisualChart';

interface RangeOscillatorScannerProps {
  stocks: StockQuote[];
  activeTimeframe: string;
  onSelectStock: (symbol: string) => void;
  onOpenSignal: (signal: QuantSignal) => void;
  onAddToWatchlist: (stock: StockQuote) => void;
  signalsMap: Map<string, QuantSignal>;
}

export const RangeOscillatorScanner: React.FC<RangeOscillatorScannerProps> = ({
  stocks,
  activeTimeframe,
  onSelectStock,
  onOpenSignal,
  onAddToWatchlist,
  signalsMap,
}) => {
  // Sort by Bollinger Band %B ascending (closest to lower band first)
  const sortedStocks = [...stocks].sort((a, b) => a.bollinger.percentB - b.bollinger.percentB);

  // Active stock selected for the Visual Oscillation Range Chart
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => sortedStocks[0]?.symbol || 'TSLA');
  const activeStock = stocks.find((s) => s.symbol === selectedSymbol) || sortedStocks[0];
  const activeSignal = activeStock ? signalsMap.get(activeStock.symbol) : undefined;

  return (
    <div className="space-y-3">
      {/* Strategy Highlights Header Card (Material 3 Tonal Surface) */}
      <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3.5 sm:p-4 text-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-[#8ab4f8]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                区间震荡微波获利 (Bollinger Scalper)
              </h2>
              <span className="text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold">
                低波动箱体高胜率
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              回踩布林下轨 (%B &lt; 0.15) 锁死确定性反抽，单笔收益 1%~2.5%
            </p>
          </div>
        </div>

        {/* Compact Integrated Stats */}
        <div className="flex items-center gap-2 font-mono text-xs shrink-0 flex-wrap">
          <div className="bg-[#12151c] px-3 py-1.5 rounded-xl border border-[#282e3c] flex items-center gap-1.5">
            <span className="text-slate-400 font-sans text-[11px]">历史胜率:</span>
            <span className="font-bold text-[#81c995] tabular-nums">89.1%</span>
          </div>
          <div className="bg-[#12151c] px-3 py-1.5 rounded-xl border border-[#282e3c] flex items-center gap-1.5">
            <span className="text-slate-400 font-sans text-[11px]">单笔目标:</span>
            <span className="font-bold text-[#8ab4f8] tabular-nums">1.0%~2.5%</span>
          </div>
          <div className="bg-[#12151c] px-3 py-1.5 rounded-xl border border-[#282e3c] flex items-center gap-1.5">
            <span className="text-slate-400 font-sans text-[11px]">硬止损:</span>
            <span className="font-bold text-[#f28b82] tabular-nums">-1.2%</span>
          </div>
        </div>
      </div>

      {/* Quick Stock Switcher Chips for Visual Chart (Unified M3 Chips h-8) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <span className="text-xs text-slate-400 shrink-0 font-medium flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#8ab4f8]" />
          <span>重点跟踪:</span>
        </span>
        {sortedStocks.slice(0, 10).map((stk) => {
          const isSelected = stk.symbol === activeStock?.symbol;
          const isTriggered = signalsMap.has(stk.symbol);
          return (
            <button
              key={`quick-${stk.symbol}`}
              onClick={() => setSelectedSymbol(stk.symbol)}
              className={`h-8 px-3 rounded-full text-xs font-mono whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1.5 select-none active:scale-[0.97] ${
                isSelected
                  ? 'bg-[#1b3764] text-[#8ab4f8] border-[#8ab4f8] font-bold shadow-xs'
                  : isTriggered
                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/40 hover:bg-blue-500/25'
                  : 'bg-[#181b24] text-slate-300 border-[#282e3c] hover:border-slate-500'
              }`}
            >
              <span>{stk.symbol}</span>
              <span className={`text-[11px] ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                %B:{stk.bollinger.percentB.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Visual Real-time Oscillation Range Chart */}
      {activeStock && (
        <RangeOscillatorVisualChart
          stock={activeStock}
          activeTimeframe={activeTimeframe}
          signal={activeSignal}
          onAddToWatchlist={onAddToWatchlist}
        />
      )}

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
          const isAtLowerBand = stock.bollinger.percentB <= 0.15;

          return (
            <div
              key={`range-${stock.symbol}`}
              className="bg-[#181b24] hover:bg-[#202430] border border-[#282e3c] rounded-2xl p-3 sm:p-3.5 transition-all shadow-sm flex flex-col gap-2.5"
            >
              {/* Row 1: Stock Symbol, Badges & Price */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => {
                      setSelectedSymbol(stock.symbol);
                      onSelectStock(stock.symbol);
                    }}
                    className="font-mono font-bold text-white hover:text-[#8ab4f8] text-base tracking-tight text-left truncate flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>{stock.symbol}</span>
                    {stock.binanceSymbol && (
                      <span className="text-[10px] font-mono text-blue-300 bg-blue-400/10 px-1.5 py-0.5 rounded-md border border-blue-400/25">
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
                </div>

                {/* Right: Big Price & Change Pill */}
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

              {/* Row 2: Bollinger %B, Dual RSI & Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#282e3c]/60">
                <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs">
                  {/* Bollinger %B Status Pill */}
                  <div
                    className={`flex items-center rounded-full px-2.5 py-1 border gap-1.5 ${
                      isAtLowerBand
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                        : 'bg-[#12151c] text-slate-300 border-[#282e3c]'
                    }`}
                  >
                    <span className="text-slate-400 text-[11px] font-sans">布林通道:</span>
                    <span>%B: {stock.bollinger.percentB.toFixed(2)}</span>
                    {isAtLowerBand && <span className="text-emerald-400 text-[10px]">触底下轨</span>}
                  </div>

                  {/* Dual RSI */}
                  <div className="flex items-center bg-[#12151c] rounded-full px-2.5 py-1 border border-[#282e3c] gap-2">
                    <span className="text-slate-400 text-[11px] font-sans">RSI:</span>
                    <span className="font-bold text-amber-300 tabular-nums">
                      6: {tfMetrics.rsi6.toFixed(1)}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-300 tabular-nums font-semibold">
                      14: {tfMetrics.rsi14.toFixed(1)}
                    </span>
                  </div>

                  <span className="bg-[#12151c] px-2.5 py-1 rounded-full text-slate-400 border border-[#282e3c] text-[11px] hidden sm:inline">
                    下轨: ${stock.bollinger.lower.toFixed(2)}
                  </span>
                </div>

                {/* Right: Standardized M3 Action Buttons (Unified h-9) */}
                <div className="flex items-center gap-1.5 shrink-0 font-sans">
                  {signal && signal.strategy === 'RANGE_OSCILLATOR' ? (
                    <button
                      onClick={() => onOpenSignal(signal)}
                      className="h-9 px-3.5 bg-blue-500 hover:bg-blue-400 text-neutral-950 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm active:scale-[0.97]"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>微波买入({signal.winRateEstimate}%)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedSymbol(stock.symbol);
                        onSelectStock(stock.symbol);
                      }}
                      className="h-9 px-3.5 bg-[#202430] hover:bg-[#282d3b] text-[#8ab4f8] rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#282e3c] active:scale-[0.97]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>通道图表</span>
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
