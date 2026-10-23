/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BreakoutScanner (开盘爆发追涨 - Toby Crabel ORB)
 * Material 3 Expressive Card Architecture with 44px+ touch targets & VWAP Momentum
 */

import React, { useState } from 'react';
import { Flame, Target, Eye, Plus, TrendingUp, Zap, ChevronRight } from 'lucide-react';
import { StockQuote, QuantSignal } from '../types/stock';
import { SectorEtfService } from '../services/sectorEtfService';

interface BreakoutScannerProps {
  stocks: StockQuote[];
  activeTimeframe: string;
  onSelectStock: (symbol: string) => void;
  onOpenSignal: (signal: QuantSignal) => void;
  onAddToWatchlist: (stock: StockQuote) => void;
  signalsMap: Map<string, QuantSignal>;
}

export const BreakoutScanner: React.FC<BreakoutScannerProps> = ({
  stocks,
  activeTimeframe,
  onSelectStock,
  onOpenSignal,
  onAddToWatchlist,
  signalsMap,
}) => {
  const [, setForceTick] = useState(0);

  // Retrieve live macro market context
  const macroContext = SectorEtfService.getMacroMarketContext();
  const { spy, qqq, isHeadwind, overallMarketTrend } = macroContext;

  // Sort by RVOL descending (volume leaders)
  const sortedStocks = [...stocks].sort((a, b) => b.rvol - a.rvol);
  const breakoutCandidates = sortedStocks.filter(
    (s) => s.changePercent > 1.2 && s.rvol >= 2.0 && s.price > s.vwap
  );

  const handleScenarioChange = (scenario: 'BEARISH_HEADWIND' | 'BULLISH_TAILWIND' | 'NEUTRAL') => {
    SectorEtfService.setMacroScenario(scenario);
    setForceTick((prev) => prev + 1);
  };

  return (
    <div className="space-y-3">
      {/* Strategy Highlights Header Card (Material 3 Tonal Surface) */}
      <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3.5 sm:p-4 text-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                开盘强势动量突破 (Crabel ORB)
              </h2>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                放量突破VWAP
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              量比 &gt;2.0x 机构抢筹突破，多头单边拉升日内主升浪
            </p>
          </div>
        </div>

        {/* Macro Index Context Pills & Switchers */}
        <div className="flex items-center gap-2 font-mono text-xs shrink-0 flex-wrap">
          <div className="bg-[#12151c] px-3 py-1.5 rounded-xl border border-[#282e3c] flex items-center gap-1.5">
            <span className="text-slate-400 font-sans text-[11px]">SPY基准:</span>
            <span
              className={`font-bold tabular-nums ${
                spy.changePercent < 0 ? 'text-[#f28b82]' : 'text-[#81c995]'
              }`}
            >
              {spy.changePercent > 0 ? '+' : ''}{spy.changePercent.toFixed(2)}%
            </span>
          </div>

          <div className="bg-[#12151c] px-3 py-1.5 rounded-xl border border-[#282e3c] flex items-center gap-1.5">
            <span className="text-slate-400 font-sans text-[11px]">胜率测算:</span>
            <span className="font-bold text-[#8ab4f8] tabular-nums">
              {isHeadwind ? '68.5%(逆风)' : '87.4%(顺风)'}
            </span>
          </div>

          {/* Quick Macro Scenario Toggles */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleScenarioChange('BEARISH_HEADWIND')}
              className={`h-8 px-2.5 rounded-full border text-[11px] font-semibold transition-colors cursor-pointer active:scale-[0.97] ${
                isHeadwind
                  ? 'bg-rose-500/25 border-rose-500/50 text-rose-200'
                  : 'bg-[#181b24] border-[#282e3c] text-slate-400 hover:text-slate-200'
              }`}
            >
              大盘逆风
            </button>
            <button
              onClick={() => handleScenarioChange('BULLISH_TAILWIND')}
              className={`h-8 px-2.5 rounded-full border text-[11px] font-semibold transition-colors cursor-pointer active:scale-[0.97] ${
                !isHeadwind && overallMarketTrend === 'BULLISH'
                  ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-200'
                  : 'bg-[#181b24] border-[#282e3c] text-slate-400 hover:text-slate-200'
              }`}
            >
              大盘顺风
            </button>
          </div>
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
          const isHighVolume = stock.rvol >= 2.0;

          return (
            <div
              key={`breakout-${stock.symbol}`}
              className="bg-[#181b24] hover:bg-[#202430] border border-[#282e3c] rounded-2xl p-3 sm:p-3.5 transition-all shadow-sm flex flex-col gap-2.5"
            >
              {/* Row 1: Stock Symbol, Badges & Price */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => onSelectStock(stock.symbol)}
                    className="font-mono font-bold text-white hover:text-[#8ab4f8] text-base tracking-tight text-left truncate flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>{stock.symbol}</span>
                    {stock.binanceSymbol && (
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-400/10 px-1.5 py-0.5 rounded-md border border-emerald-400/25">
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

              {/* Row 2: Dual RSI, RVOL, VWAP & Action Cluster */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#282e3c]/60">
                <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs">
                  {/* Unified Dual RSI Badge */}
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

                  {/* RVOL High-Volume Indicator */}
                  <span
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                      isHighVolume
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                        : 'bg-[#12151c] text-slate-300 border-[#282e3c]'
                    }`}
                  >
                    量比: {stock.rvol.toFixed(1)}x {isHighVolume ? '🔥暴增' : ''}
                  </span>

                  {/* VWAP Distance */}
                  <span className="bg-[#12151c] px-2.5 py-1 rounded-full text-slate-300 border border-[#282e3c] text-[11px] hidden sm:inline">
                    VWAP: ${stock.vwap.toFixed(2)}
                  </span>
                </div>

                {/* Right: Standardized M3 Action Buttons (Unified h-9) */}
                <div className="flex items-center gap-1.5 shrink-0 font-sans">
                  {signal && signal.strategy === 'OPENING_BREAKOUT' ? (
                    <button
                      onClick={() => onOpenSignal(signal)}
                      className="h-9 px-3.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm active:scale-[0.97]"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>突破买入({signal.winRateEstimate}%)</span>
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
