/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Mini-Sparkline Bar Component for RSI(6) and RSI(14)
 * Highlights oversold conditions: RSI(6) < 22 and RSI(14) < 28
 */

import React from 'react';
import { Flame, AlertTriangle } from 'lucide-react';

interface RsiMiniSparklineProps {
  value: number;
  period: 6 | 14;
  threshold?: number; // defaults: 22 for RSI(6), 28 for RSI(14)
  timeframe?: string;
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
}

export const RsiMiniSparkline: React.FC<RsiMiniSparklineProps> = ({
  value,
  period,
  threshold = period === 6 ? 22 : 28,
  timeframe,
  size = 'sm',
  showBadge = true,
}) => {
  const isOversold = value < threshold;
  const isOverbought = value >= 70;
  const clampedValue = Math.max(0, Math.min(100, value));

  // Threshold position percentage on 0-100 scale
  const thresholdPct = threshold;

  // Visual bar styles based on size
  const barWidth = size === 'lg' ? 'w-full' : size === 'md' ? 'w-20 sm:w-24' : 'w-12 sm:w-16';
  const barHeight = size === 'lg' ? 'h-2' : size === 'md' ? 'h-1.5' : 'h-1';

  // Fill gradient
  const fillGradient = isOversold
    ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.7)]'
    : isOverbought
    ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
    : period === 6
    ? 'bg-gradient-to-r from-amber-500/70 to-amber-400'
    : 'bg-gradient-to-r from-purple-500/70 to-purple-400';

  if (size === 'lg') {
    return (
      <div className={`w-full flex flex-col gap-1.5 p-2 rounded-xl border transition-colors ${
        isOversold
          ? 'bg-[#18151a] border-rose-500/30'
          : 'bg-[#101216] border-[#2a2e37]'
      }`}>
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[10px]">
              RSI ({period})
            </span>
            {timeframe && (
              <span className="text-[9px] text-slate-500">[{timeframe}]</span>
            )}
            {isOversold && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-0.5">
                <span>极度超卖</span>
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-base font-bold tabular-nums ${
              isOversold ? 'text-rose-400' : isOverbought ? 'text-emerald-400' : 'text-white'
            }`}>
              {value.toFixed(1)}
            </span>
            <span className="text-[9px] text-slate-500">
              / {threshold}
            </span>
          </div>
        </div>

        {/* Mini-Sparkline Progress Bar */}
        <div className="relative w-full h-2 bg-[#1c202a] rounded-full overflow-hidden border border-[#2a2e37]/70">
          {/* Threshold Marker Needle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-400/80 z-10"
            style={{ left: `${thresholdPct}%` }}
            title={`超卖阈值线 ${threshold}`}
          />
          {/* 70 Overbought Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400/50 z-10"
            style={{ left: '70%' }}
            title="超买阈值线 70"
          />
          {/* Filled Bar */}
          <div
            className={`h-full rounded-full transition-all duration-300 ${fillGradient} ${
              isOversold ? 'animate-pulse' : ''
            }`}
            style={{ width: `${clampedValue}%` }}
          />
        </div>

        {/* Bottom scale labels */}
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-500 leading-none px-0.5">
          <span>0</span>
          <span className={`font-semibold ${isOversold ? 'text-rose-400 font-bold' : ''}`}>
            ▲ {threshold} 超卖
          </span>
          <span>70 超买</span>
          <span>100</span>
        </div>
      </div>
    );
  }

  // sm / md sizes (for row lists and table cells)
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg border font-mono transition-colors ${
        isOversold
          ? 'bg-[#18151a] border-rose-500/30 text-rose-300'
          : 'bg-[#101216] border-[#2a2e37] text-slate-300'
      }`}
      title={`[${timeframe || '30m'}] RSI(${period}) = ${value.toFixed(1)} (超卖阈值: < ${threshold})`}
    >
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-slate-400 shrink-0">
          R{period}:
        </span>
        <span
          className={`text-[10px] font-bold tabular-nums shrink-0 ${
            isOversold ? 'text-rose-300 font-bold' : isOverbought ? 'text-emerald-400 font-bold' : 'text-slate-200'
          }`}
        >
          {value.toFixed(1)}
        </span>
      </div>

      {/* Mini-Sparkline Gauge Bar */}
      <div className={`relative ${barWidth} ${barHeight} bg-[#1f2430] rounded-full overflow-hidden shrink-0 border border-slate-700/50`}>
        {/* Threshold indicator needle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-rose-400/90 z-10"
          style={{ left: `${thresholdPct}%` }}
        />
        {/* Fill */}
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillGradient}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>

      {isOversold && showBadge && (
        <span className="text-[8px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold px-1 py-0.2 rounded shrink-0">
          超卖
        </span>
      )}
    </div>
  );
};
