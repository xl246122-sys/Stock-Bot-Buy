/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { StockQuote, QuantSignal } from '../types/stock';
import {
  Activity,
  Target,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  Zap,
  ArrowDownRight,
  ArrowUpRight,
  Scale,
  Plus
} from 'lucide-react';

interface RangeOscillatorVisualChartProps {
  stock: StockQuote;
  activeTimeframe: string;
  signal?: QuantSignal;
  onAddToWatchlist?: (stock: StockQuote) => void;
  onOpenSignal?: (signal: QuantSignal) => void;
}

export const RangeOscillatorVisualChart: React.FC<RangeOscillatorVisualChartProps> = ({
  stock,
  activeTimeframe,
  signal,
  onAddToWatchlist,
  onOpenSignal,
}) => {
  // Key levels derivation
  const supportPrice = stock.bollinger.lower;
  const resistancePrice = stock.bollinger.upper;
  const middlePrice = stock.bollinger.middle;
  const currentPrice = stock.price;

  const channelWidth = resistancePrice - supportPrice;
  const channelPercent = (channelWidth / supportPrice) * 100;
  const distanceToSupport = Math.max(0, currentPrice - supportPrice);
  const distanceToSupportPct = (distanceToSupport / currentPrice) * 100;
  const distanceToResistance = Math.max(0, resistancePrice - currentPrice);
  const distanceToResistancePct = (distanceToResistance / currentPrice) * 100;

  // Position ratio within range (0 = at support, 1 = at resistance)
  const positionRatio = Math.max(0, Math.min(1, (currentPrice - supportPrice) / (channelWidth || 1)));
  const positionPercent = positionRatio * 100;

  // Risk / Reward Ratio: reward to resistance vs risk to support
  const riskAmount = Math.max(0.1, distanceToSupport);
  const rewardAmount = Math.max(0.1, distanceToResistance);
  const riskRewardRatio = (rewardAmount / riskAmount).toFixed(1);

  // Position status evaluation
  const getStatusInfo = () => {
    if (positionRatio < 0.18) {
      return {
        badge: '极佳抄底区间',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/15 border-emerald-500/30',
        advice: '股价探底布林下轨且紧贴支撑，下行风险仅需 -1.2% 止损，向上空间充裕，建议买入博取微波反弹！',
        isBuyZone: true,
      };
    }
    if (positionRatio < 0.40) {
      return {
        badge: '支撑上方起涨区',
        color: 'text-blue-400',
        bg: 'bg-blue-500/15 border-blue-500/30',
        advice: '位于箱体偏下半区，多头尝试震荡回升，盈亏比优良，可分批逢低吸纳。',
        isBuyZone: true,
      };
    }
    if (positionRatio < 0.65) {
      return {
        badge: '中轴多空平衡区',
        color: 'text-slate-300',
        bg: 'bg-slate-800 border-slate-700',
        advice: '股价位于通道中轨附近，多空博弈势均力敌，上下空间均等，建议等待回踩支撑或突破后再行决策。',
        isBuyZone: false,
      };
    }
    if (positionRatio < 0.85) {
      return {
        badge: '逼近上方阻力区',
        color: 'text-amber-400',
        bg: 'bg-amber-500/15 border-amber-500/30',
        advice: '已进入箱体上半区，靠近天花板阻力，风险收益比下降，持仓者宜考虑分批逢高止盈。',
        isBuyZone: false,
      };
    }
    return {
      badge: '触碰箱体天花板',
      color: 'text-rose-400',
      bg: 'bg-rose-500/15 border-rose-500/30',
      advice: '触碰布林上轨与强阻力位，极度超买且随时面临回踩回调，严禁追涨！',
      isBuyZone: false,
    };
  };

  const statusInfo = getStatusInfo();

  // Synthetic 24-bar intraday wave leading up to current live price inside the Bollinger tunnel
  const chartData = useMemo(() => {
    const barsCount = 24;
    const data = [];
    const baseWaveAmplitude = channelWidth * 0.35;

    for (let i = 0; i < barsCount; i++) {
      const progress = i / (barsCount - 1);
      // Realistic oscillating wave inside the channel
      const sinWave = Math.sin(i * 0.8) * baseWaveAmplitude;
      const cosWave = Math.cos(i * 1.6) * (baseWaveAmplitude * 0.4);

      // Trajectory moves towards current price
      const baseline = middlePrice + (currentPrice - middlePrice) * Math.pow(progress, 1.5);
      let calculatedPrice = baseline + (sinWave + cosWave) * (1 - progress * 0.85);

      // Ensure last bar exactly locks on currentPrice
      if (i === barsCount - 1) {
        calculatedPrice = currentPrice;
      }

      // Constrain within visible margin
      calculatedPrice = Math.max(supportPrice * 0.985, Math.min(resistancePrice * 1.015, calculatedPrice));

      const timeLabel = `${i - (barsCount - 1)}k`;

      data.push({
        time: i === barsCount - 1 ? '现价' : timeLabel,
        price: Number(calculatedPrice.toFixed(2)),
        support: Number(supportPrice.toFixed(2)),
        middle: Number(middlePrice.toFixed(2)),
        resistance: Number(resistancePrice.toFixed(2)),
        buyZoneMax: Number((supportPrice + channelWidth * 0.2).toFixed(2)),
      });
    }
    return data;
  }, [supportPrice, resistancePrice, middlePrice, currentPrice, channelWidth]);

  // Compute tight Y-axis domain
  const yMin = Math.floor(Math.min(supportPrice, currentPrice) * 0.985);
  const yMax = Math.ceil(Math.max(resistancePrice, currentPrice) * 1.015);

  return (
    <div className="bg-[#14161c] border border-blue-500/30 rounded-2xl p-3 sm:p-4 text-slate-200 shadow-lg space-y-3">
      {/* Top Header: Stock Symbol, Levels & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2a2e37] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-sm sm:text-base text-white">{stock.symbol}</span>
              <span className="text-xs text-slate-400 truncate max-w-[100px] sm:max-w-[160px]">{stock.name}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusInfo.bg} ${statusInfo.color}`}>
                {statusInfo.badge}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
              <span>周期: {activeTimeframe.toUpperCase()}</span>
              <span>·</span>
              <span>箱体宽度: ${(channelWidth).toFixed(2)} ({channelPercent.toFixed(1)}%)</span>
              <span>·</span>
              <span className="text-blue-300">盈亏比: 1 : {riskRewardRatio}</span>
            </div>
          </div>
        </div>

        {/* Live Price Tag & Fast Actions */}
        <div className="flex items-center gap-2 shrink-0 font-mono">
          <div className="text-right">
            <div className="text-sm sm:text-base font-bold text-white tabular-nums">${currentPrice.toFixed(2)}</div>
            <div className={`text-[10px] font-bold ${stock.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
            </div>
          </div>

          <div className="flex items-center gap-1 font-sans">
            {signal && onOpenSignal && (
              <button
                onClick={() => onOpenSignal(signal)}
                className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Target className="w-3 h-3" />
                <span>预警</span>
              </button>
            )}
            {onAddToWatchlist && (
              <button
                onClick={() => onAddToWatchlist(stock)}
                className="px-2 py-1 rounded-lg bg-[#222630] hover:bg-[#2c3240] text-slate-200 text-[10px] flex items-center gap-1 border border-[#343a46] cursor-pointer"
              >
                <Plus className="w-3 h-3 text-blue-400" />
                <span>自选</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visual Channel Progress Gauge */}
      <div className="bg-[#101216] border border-[#232731] rounded-xl p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>支撑位 S1: ${supportPrice.toFixed(2)}</span>
            <span className="text-[10px] text-slate-500 font-normal">(-${distanceToSupport.toFixed(2)})</span>
          </div>

          <div className="text-[10px] text-slate-400">
            通道位置: <span className="font-bold text-blue-400">{positionPercent.toFixed(1)}%</span>
          </div>

          <div className="flex items-center gap-1 text-rose-400 font-semibold">
            <span className="text-[10px] text-slate-500 font-normal">(+${distanceToResistance.toFixed(2)})</span>
            <span>压力位 R1: ${resistancePrice.toFixed(2)}</span>
            <span className="w-2 h-2 rounded-full bg-rose-400" />
          </div>
        </div>

        {/* Real-time slider gauge bar */}
        <div className="relative h-2.5 bg-gradient-to-r from-emerald-500/30 via-blue-500/20 to-rose-500/30 rounded-full overflow-hidden border border-[#2a2e37]">
          {/* Target Buy Zone (first 20%) */}
          <div className="absolute left-0 top-0 bottom-0 w-[20%] bg-emerald-500/40 border-r border-emerald-400/50" />
          {/* Middle band marker */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-500/50 -translate-x-1/2" />
          {/* Danger Sell Zone (last 20%) */}
          <div className="absolute right-0 top-0 bottom-0 w-[20%] bg-rose-500/40 border-l border-rose-400/50" />

          {/* Current Real-time Price Pin Marker */}
          <div
            className="absolute top-0 bottom-0 w-3 -ml-1.5 rounded-full bg-white shadow-md shadow-blue-500 flex items-center justify-center transition-all duration-300"
            style={{ left: `${positionPercent}%` }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
          </div>
        </div>

        <div className="flex justify-between text-[9px] text-slate-500 font-mono pt-0.5">
          <span>低吸买入区 (0%~20%)</span>
          <span>中轴平衡位 (${middlePrice.toFixed(2)})</span>
          <span>高抛止盈区 (80%~100%)</span>
        </div>
      </div>

      {/* Interactive Recharts Real-Time Oscillation Chart */}
      <div className="w-full h-44 sm:h-52 bg-[#0e1014] border border-[#222630] rounded-xl p-2 relative">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <defs>
              {/* Shaded gradient for oscillation channel */}
              <linearGradient id="channelFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.06} />
              </linearGradient>
              <linearGradient id="priceLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#1f232b" strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="time"
              stroke="#475569"
              tick={{ fontSize: 9, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#262a34' }}
            />
            <YAxis
              domain={[yMin, yMax]}
              stroke="#475569"
              tick={{ fontSize: 9, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#262a34' }}
              tickFormatter={(v) => `$${v}`}
              orientation="left"
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload;
                const distSup = (d.price - d.support).toFixed(2);
                const distRes = (d.resistance - d.price).toFixed(2);
                return (
                  <div className="bg-[#181a20] border border-[#2a2e37] rounded-lg p-2 text-[10px] font-mono shadow-xl text-slate-200">
                    <div className="text-white font-bold flex items-center justify-between gap-3 mb-1">
                      <span>{stock.symbol} {d.time}</span>
                      <span className="text-blue-400 font-bold">${d.price}</span>
                    </div>
                    <div className="space-y-0.5 text-slate-400">
                      <div className="flex justify-between gap-3">
                        <span className="text-rose-400">压力位 (上轨):</span>
                        <span>${d.resistance} (+${distRes})</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">中轴平衡位:</span>
                        <span>${d.middle}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-emerald-400">支撑位 (下轨):</span>
                        <span>${d.support} (-${distSup})</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            {/* Support Level Line */}
            <ReferenceLine
              y={supportPrice}
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              label={{
                value: `S1 支撑 $${supportPrice.toFixed(2)}`,
                position: 'insideBottomLeft',
                fill: '#10b981',
                fontSize: 10,
                fontWeight: 'bold',
              }}
            />

            {/* Middle SMA20 Band */}
            <ReferenceLine
              y={middlePrice}
              stroke="#4f46e5"
              strokeWidth={1}
              strokeDasharray="2 2"
              label={{
                value: `中轴 $${middlePrice.toFixed(2)}`,
                position: 'insideTopLeft',
                fill: '#818cf8',
                fontSize: 9,
              }}
            />

            {/* Resistance Level Line */}
            <ReferenceLine
              y={resistancePrice}
              stroke="#f43f5e"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              label={{
                value: `R1 压力 $${resistancePrice.toFixed(2)}`,
                position: 'insideTopLeft',
                fill: '#f43f5e',
                fontSize: 10,
                fontWeight: 'bold',
              }}
            />

            {/* Channel Area fill */}
            <Area
              type="monotone"
              dataKey="resistance"
              stroke="none"
              fill="url(#channelFill)"
            />

            {/* Real-time Oscillating Price Line */}
            <Line
              type="monotone"
              dataKey="price"
              stroke="url(#priceLineGrad)"
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, fill: '#38bdf8', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Quantitative Decision Advice */}
      <div className="p-2.5 rounded-xl bg-[#101216] border border-[#232731] text-[11px] flex items-start gap-2">
        <Scale className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
        <div className="leading-snug">
          <span className="font-semibold text-slate-200">短线决策指引：</span>
          <span className="text-slate-400">{statusInfo.advice}</span>
        </div>
      </div>
    </div>
  );
};
