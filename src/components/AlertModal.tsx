/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Target, ShieldAlert, Clock, TrendingUp, CheckCircle, ArrowRight, Zap, Sparkles, Activity, Layers } from 'lucide-react';
import { QuantSignal } from '../types/stock';

interface AlertModalProps {
  signal: QuantSignal | null;
  onClose: () => void;
  onAddToWatchlist: (signal: QuantSignal) => void;
  onViewDetail: (symbol: string) => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  signal,
  onClose,
  onAddToWatchlist,
  onViewDetail,
}) => {
  if (!signal) return null;

  const isOverbought = signal.strategy === 'OVERBOUGHT_EXIT';
  const isDipStarted = signal.strategy === 'DIP_STARTED';
  const isDipExhaustion = signal.strategy === 'DIP_EXHAUSTION';
  const isPlunge = signal.strategy === 'PLUNGE_DIP';
  const isBreakout = signal.strategy === 'OPENING_BREAKOUT';

  const badgeColor = isOverbought
    ? 'text-purple-400 bg-purple-400/10 border-purple-400/30'
    : isDipStarted
    ? 'text-amber-400 bg-amber-400/10 border-amber-400/30'
    : isDipExhaustion
    ? 'text-orange-400 bg-orange-400/10 border-orange-400/30'
    : isPlunge
    ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
    : isBreakout
    ? 'text-teal-400 bg-teal-400/10 border-teal-400/30'
    : 'text-sky-400 bg-sky-400/10 border-sky-400/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-3xl max-w-xl w-full p-4 sm:p-5 text-neutral-100 shadow-2xl relative overflow-hidden">
        {/* Android 16 Sheet Drag Handle */}
        <div className="w-10 h-1 rounded-full bg-slate-600/50 mx-auto mb-3 sm:hidden" />

        {/* Glow accent */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 ${
            isOverbought
              ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500'
              : isDipStarted
              ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500'
              : isDipExhaustion
              ? 'bg-gradient-to-r from-orange-500 via-rose-500 to-orange-500'
              : isPlunge
              ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500'
              : isBreakout
              ? 'bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-500'
              : 'bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500'
          }`}
        />

        {/* Close Button (M3 Icon Button) */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white rounded-full bg-[#1c202a] hover:bg-[#242936] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
              isOverbought
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
                : isDipStarted
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : isDipExhaustion
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                : isPlunge
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : isBreakout
                ? 'bg-teal-500/20 border-teal-500/40 text-teal-400'
                : 'bg-sky-500/20 border-sky-500/40 text-sky-400'
            }`}
          >
            <Zap className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${badgeColor}`}>
                {signal.strategyName}
              </span>
              <span className="text-xs text-neutral-400 font-mono">{signal.timestamp} 预警触发</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <h2 className="text-2xl font-bold font-mono tracking-tight text-white">{signal.symbol}</h2>
              <span className="text-sm text-neutral-300 font-medium">{signal.name}</span>
              <span
                className={`text-sm font-mono font-bold ml-2 ${
                  signal.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                ${signal.currentPrice.toFixed(2)} ({signal.changePercent > 0 ? '+' : ''}
                {signal.changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Quant Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-center mb-3">
          <div>
            <div className="text-[11px] text-neutral-400">RSI(6) 与 乖离率</div>
            <div className="text-sm font-mono font-bold text-amber-400 tabular-nums">
              {signal.rsi6.toFixed(1)}
              <span className={`text-[10px] ml-1 font-bold ${
                (signal.rsiBiasPercent ?? 0) < 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                ({(signal.rsiBiasPercent ?? 0) > 0 ? '+' : ''}{(signal.rsiBiasPercent ?? ((signal.rsi6 - 50) / 50 * 100)).toFixed(1)}%)
              </span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-neutral-400">板块 6M 历史波动率</div>
            <div className="text-sm font-mono font-bold text-cyan-300 tabular-nums">
              {signal.sectorVol ? `${signal.sectorVol.toFixed(1)}%` : (signal.sectorEtf?.sixMonthVolPercent ? `${signal.sectorEtf.sixMonthVolPercent}%` : '24.5%')}
              <span className="text-[9px] text-slate-400 font-sans ml-1">
                ({signal.sectorEtf?.etfSymbol || 'ETF'})
              </span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-neutral-400">量比 (RVOL)</div>
            <div className="text-sm font-mono font-bold text-sky-400 tabular-nums">
              {signal.rvol.toFixed(1)}x
            </div>
          </div>
          <div>
            <div className="text-[11px] text-neutral-400">模型测算胜率</div>
            <div className="text-sm font-mono font-bold text-emerald-400 tabular-nums">
              {signal.winRateEstimate}%
            </div>
          </div>
        </div>

        {/* Quant Trade Execution Plan */}
        <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-xl p-3.5 mb-3">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-neutral-700/40 text-xs">
            <span className="text-neutral-300 font-semibold flex items-center gap-1.5">
              <Target className="w-4 h-4 text-amber-400" />
              超短线量化交易执行规划
            </span>
            <span className="text-neutral-400 font-mono text-[11px]">
              盈亏比 {signal.riskRewardRatio} · 周期 {signal.expectedHoldingHours}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
            <div className="bg-neutral-900/90 p-2 rounded-lg border border-neutral-700/50">
              <span className="text-neutral-400 text-[10px] block">建议买入价</span>
              <span className="text-white font-bold text-sm">${signal.suggestedEntry.toFixed(2)}</span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-800/40 p-2 rounded-lg">
              <span className="text-emerald-300 text-[10px] block">目标止盈 1 (半仓)</span>
              <span className="text-emerald-400 font-bold text-sm">
                ${signal.takeProfit1.toFixed(2)} (+{(((signal.takeProfit1 - signal.suggestedEntry) / signal.suggestedEntry) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-800/40 p-2 rounded-lg">
              <span className="text-emerald-300 text-[10px] block">目标止盈 2 (清仓)</span>
              <span className="text-emerald-400 font-bold text-sm">
                ${signal.takeProfit2.toFixed(2)} (+{(((signal.takeProfit2 - signal.suggestedEntry) / signal.suggestedEntry) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="bg-rose-950/40 border border-rose-800/40 p-2 rounded-lg">
              <span className="text-rose-300 text-[10px] block">严格止损位</span>
              <span className="text-rose-400 font-bold text-sm">
                ${signal.stopLoss.toFixed(2)} ({(((signal.stopLoss - signal.suggestedEntry) / signal.suggestedEntry) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        {/* 简单说一下买入理由 (极简卡片规范：不长篇分析技术指标) */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-3 space-y-1">
          <span className="text-amber-300 font-bold flex items-center gap-1.5 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>买入机会与核心动因:</span>
          </span>
          <p className="text-xs text-slate-200 leading-relaxed font-sans">
            {signal.thesis || '满足量化右侧企稳条件，多头动能确立，盈亏比极佳，建议择机买入。'}
          </p>
        </div>

        {/* Actions (Google Material 3 Standard Buttons) */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[#242936]">
          <button
            onClick={() => onViewDetail(signal.symbol)}
            className="h-9 px-4 text-xs font-semibold text-neutral-300 hover:text-white bg-[#1c202a] hover:bg-[#242936] rounded-full transition-all flex items-center gap-1.5 cursor-pointer border border-[#2a2f3e]"
          >
            <span>查看指标与K线</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              onAddToWatchlist(signal);
              onClose();
            }}
            className="h-9 px-5 text-xs font-bold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-full transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Target className="w-3.5 h-3.5" />
            <span>一键加入持仓/预警监控</span>
          </button>
        </div>
      </div>
    </div>
  );
};
