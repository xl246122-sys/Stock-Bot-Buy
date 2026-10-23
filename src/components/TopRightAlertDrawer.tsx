/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Zap,
  ChevronUp,
  ChevronDown,
  Target,
  TrendingUp,
  TrendingDown,
  Plus,
  Eye,
  Trash2,
  Volume2,
  VolumeX,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  CheckCheck,
  Clock,
  Sparkles,
  X,
  Activity
} from 'lucide-react';
import { QuantSignal } from '../types/stock';

interface TopRightAlertDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  latestSignal: QuantSignal | null;
  alertHistory: QuantSignal[];
  unreadCount?: number;
  onClearHistory: () => void;
  onMarkAllAsRead?: () => void;
  onMarkSignalAsRead?: (signalId: string) => void;
  onAddToWatchlist: (signal: QuantSignal) => void;
  onViewDetail: (symbol: string) => void;
  onSelectSignal: (signal: QuantSignal) => void;
  isSoundMuted: boolean;
  onToggleSound: () => void;
}

export interface StrategyGradientTheme {
  category: 'dip' | 'breakdown' | 'breakout' | 'overbought' | 'range';
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardGradient: string;
  cardBorder: string;
  cardBorderHover: string;
  selectedRing: string;
  accentDot: string;
  accentIconColor: string;
  shadowGlow: string;
}

/**
 * 预警严重程度与策略类型专属轻量级渐变背景系统 (取代单一红色边框)
 * 1. 抄底用微蓝渐变 (PLUNGE_DIP, DIP_REBOUND, DIP_EXHAUSTION, DIP_STARTED)
 * 2. 破位用深紫渐变 (BREAKDOWN, STOP_LOSS, 跌破支撑)
 * 3. 突破用翡翠绿渐变 (OPENING_BREAKOUT, BREAKOUT)
 * 4. 止盈回调留存用琥珀金渐变 (OVERBOUGHT_EXIT)
 * 5. 区间微波用幽蓝渐变 (RANGE_OSCILLATOR)
 */
export function getStrategyGradientTheme(
  strategy?: string,
  alertStage?: string,
  changePercent: number = 0
): StrategyGradientTheme {
  // 1. 破位 / 击穿支撑 / 深度止损: 深紫轻量级渐变 (用户指定: "破位用深紫，代替单一红色边框")
  if (
    strategy === 'BREAKDOWN' ||
    strategy === 'STOP_LOSS' ||
    strategy?.includes('破位') ||
    strategy?.includes('支撑') ||
    strategy?.includes('下行') ||
    changePercent <= -6.5
  ) {
    return {
      category: 'breakdown',
      label: '深紫破位',
      badgeBg: 'bg-purple-500/20',
      badgeText: 'text-purple-300',
      badgeBorder: 'border-purple-500/40',
      cardGradient: 'bg-gradient-to-r from-purple-950/45 via-indigo-950/30 to-[#14121a]',
      cardBorder: 'border-purple-500/35',
      cardBorderHover: 'hover:border-purple-400/60',
      selectedRing: 'ring-1 ring-purple-400/50 bg-gradient-to-r from-purple-900/50 via-indigo-950/40 to-[#171320]',
      accentDot: 'bg-purple-400',
      accentIconColor: 'text-purple-400',
      shadowGlow: 'shadow-[0_2px_14px_rgba(168,85,247,0.12)]',
    };
  }

  // 2. 抄底策略: 微蓝轻量级渐变 (用户指定: "例如抄底用微蓝")
  if (
    strategy === 'PLUNGE_DIP' ||
    strategy === 'DIP_STARTED' ||
    strategy === 'DIP_EXHAUSTION' ||
    strategy?.includes('抄底') ||
    strategy?.includes('超卖') ||
    strategy?.includes('急跌') ||
    alertStage === 'STAGE_1_DIP_STARTED' ||
    alertStage === 'STAGE_2_DIP_EXHAUSTION' ||
    alertStage === 'STAGE_3_BUY_REBOUND'
  ) {
    return {
      category: 'dip',
      label: '微蓝抄底',
      badgeBg: 'bg-cyan-500/15',
      badgeText: 'text-cyan-300',
      badgeBorder: 'border-cyan-500/30',
      cardGradient: 'bg-gradient-to-r from-sky-950/40 via-cyan-950/25 to-[#12141c]',
      cardBorder: 'border-cyan-500/30',
      cardBorderHover: 'hover:border-cyan-400/60',
      selectedRing: 'ring-1 ring-cyan-400/50 bg-gradient-to-r from-sky-900/45 via-cyan-950/35 to-[#131722]',
      accentDot: 'bg-cyan-400',
      accentIconColor: 'text-cyan-400',
      shadowGlow: 'shadow-[0_2px_14px_rgba(6,182,212,0.08)]',
    };
  }

  // 3. 开盘突破 / 爆发策略: 翡翠绿轻量级渐变
  if (
    strategy === 'OPENING_BREAKOUT' ||
    strategy === 'BREAKOUT' ||
    strategy?.includes('突破') ||
    strategy?.includes('爆发') ||
    alertStage === 'BREAKOUT_BUY'
  ) {
    return {
      category: 'breakout',
      label: '翡翠突破',
      badgeBg: 'bg-emerald-500/15',
      badgeText: 'text-emerald-300',
      badgeBorder: 'border-emerald-500/30',
      cardGradient: 'bg-gradient-to-r from-emerald-950/35 via-teal-950/25 to-[#111614]',
      cardBorder: 'border-emerald-500/30',
      cardBorderHover: 'hover:border-emerald-400/60',
      selectedRing: 'ring-1 ring-emerald-400/50 bg-gradient-to-r from-emerald-900/45 via-teal-950/35 to-[#131c17]',
      accentDot: 'bg-emerald-400',
      accentIconColor: 'text-emerald-400',
      shadowGlow: 'shadow-[0_2px_14px_rgba(16,185,129,0.08)]',
    };
  }

  // 4. 超买乏力 / 减仓止盈: 琥珀金轻量级渐变
  if (
    strategy === 'OVERBOUGHT_EXIT' ||
    strategy?.includes('超买') ||
    strategy?.includes('止盈') ||
    alertStage === 'STAGE_4_OVERBOUGHT_EXIT'
  ) {
    return {
      category: 'overbought',
      label: '琥珀止盈',
      badgeBg: 'bg-amber-500/15',
      badgeText: 'text-amber-300',
      badgeBorder: 'border-amber-500/30',
      cardGradient: 'bg-gradient-to-r from-amber-950/35 via-orange-950/20 to-[#161412]',
      cardBorder: 'border-amber-500/30',
      cardBorderHover: 'hover:border-amber-400/60',
      selectedRing: 'ring-1 ring-amber-400/50 bg-gradient-to-r from-amber-900/45 via-orange-950/35 to-[#1c1712]',
      accentDot: 'bg-amber-400',
      accentIconColor: 'text-amber-400',
      shadowGlow: 'shadow-[0_2px_14px_rgba(245,158,11,0.08)]',
    };
  }

  // 5. 默认 / 区间微波: 幽蓝微波轻量级渐变
  return {
    category: 'range',
    label: '幽蓝微波',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-300',
    badgeBorder: 'border-blue-500/30',
    cardGradient: 'bg-gradient-to-r from-blue-950/30 via-slate-900/40 to-[#121418]',
    cardBorder: 'border-blue-500/25',
    cardBorderHover: 'hover:border-blue-400/50',
    selectedRing: 'ring-1 ring-blue-400/50 bg-gradient-to-r from-blue-900/40 via-slate-900/50 to-[#13161c]',
    accentDot: 'bg-blue-400',
    accentIconColor: 'text-blue-400',
    shadowGlow: 'shadow-[0_2px_12px_rgba(59,130,246,0.06)]',
  };
}

/**
 * Mini Progress Bar displaying price-to-entry bias ratio (乖离率)
 * and spatial position relative to Stop Loss, Entry Price, and Take Profit.
 */
interface SignalBiasProgressBarProps {
  signal: QuantSignal;
  compact?: boolean;
}

const SignalBiasProgressBar: React.FC<SignalBiasProgressBarProps> = ({
  signal,
  compact = false,
}) => {
  const entry = signal.suggestedEntry || signal.currentPrice;
  const curr = signal.currentPrice;
  const tp = signal.takeProfit1 || entry * 1.025;
  const sl = signal.stopLoss || entry * 0.985;

  const biasPct = entry > 0 ? ((curr - entry) / entry) * 100 : 0;
  const isPositive = biasPct >= 0;
  const diffDollar = curr - entry;

  // Total span from SL to TP
  const span = Math.max(0.01, tp - sl);
  const entryPct = Math.max(15, Math.min(85, ((entry - sl) / span) * 100));
  const currPct = Math.max(3, Math.min(97, ((curr - sl) / span) * 100));

  // Bias evaluation tag
  let statusBadge = {
    label: '合理买点',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  };
  if (biasPct < -0.1 && curr >= sl) {
    statusBadge = {
      label: '折价低吸',
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    };
  } else if (curr < sl) {
    statusBadge = {
      label: '击穿止损·破位',
      color: 'text-purple-300 bg-purple-500/15 border-purple-500/35',
    };
  } else if (biasPct > 2.0) {
    statusBadge = {
      label: '冲高脱离',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    };
  }

  if (compact) {
    return (
      <div className="pt-1.5 border-t border-[#1e222b] space-y-1">
        <div className="flex items-center justify-between text-[9px] font-mono">
          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-sans">入场乖离:</span>
            <span
              className={`font-bold ${
                isPositive ? 'text-emerald-400' : 'text-cyan-400'
              }`}
            >
              {isPositive ? '+' : ''}{biasPct.toFixed(2)}%
            </span>
            <span className={`px-1 py-0.2 rounded border text-[8px] font-sans ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
          </div>
          <span className="text-slate-400">
            买点 ${entry.toFixed(2)}
          </span>
        </div>

        {/* Compact 2-zone progress bar */}
        <div className="h-1.5 w-full bg-[#0d0f13] rounded-full overflow-hidden relative border border-[#2a2e37] flex">
          {/* SL to Entry Zone */}
          <div className="h-full bg-rose-500/15 relative" style={{ width: `${entryPct}%` }}>
            {!isPositive && (
              <div
                className="absolute right-0 top-0 bottom-0 bg-cyan-400 rounded-l-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (Math.abs(currPct - entryPct) / (entryPct || 1)) * 100)}%`,
                }}
              />
            )}
          </div>

          {/* Reference Entry Tick */}
          <div
            className="w-0.5 h-full bg-white/90 z-10 shrink-0"
            title={`预设买入点: $${entry.toFixed(2)}`}
          />

          {/* Entry to TP Zone */}
          <div className="h-full bg-emerald-500/15 relative flex-1">
            {isPositive && (
              <div
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-r-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, ((currPct - entryPct) / (100 - entryPct || 1)) * 100)}%`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full Hero Card Version
  return (
    <div className="bg-[#181a20] rounded-xl p-2.5 border border-[#2a2e37] space-y-1.5 font-mono">
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-sans">现价与买点乖离率:</span>
          <span
            className={`font-bold text-xs ${
              isPositive ? 'text-emerald-400' : 'text-cyan-400'
            }`}
          >
            {isPositive ? '+' : ''}{biasPct.toFixed(2)}%
          </span>
          <span className="text-[9px] text-slate-500">
            ({isPositive ? '+' : ''}${diffDollar.toFixed(2)})
          </span>
        </div>
        <span
          className={`px-1.5 py-0.2 rounded-full border text-[9px] font-sans font-medium ${statusBadge.color}`}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* Visual Multi-Segment Progress Gauge */}
      <div className="relative py-1">
        <div className="h-2 w-full bg-[#101216] rounded-full overflow-hidden relative border border-[#2a2e37] flex">
          {/* SL to Entry Zone */}
          <div className="h-full bg-rose-500/20 relative" style={{ width: `${entryPct}%` }}>
            {!isPositive && (
              <div
                className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-cyan-400 to-blue-500 rounded-l-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (Math.abs(currPct - entryPct) / (entryPct || 1)) * 100)}%`,
                }}
              />
            )}
          </div>

          {/* Reference Entry Tick (White line) */}
          <div
            className="w-1 h-full bg-white z-20 shrink-0 shadow-xs"
            title={`建议入场: $${entry.toFixed(2)}`}
          />

          {/* Entry to TP Zone */}
          <div className="h-full bg-emerald-500/20 relative flex-1">
            {isPositive && (
              <div
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 rounded-r-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, ((currPct - entryPct) / (100 - entryPct || 1)) * 100)}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Current Price Thumb Marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-[#181a20] shadow-md z-30 pointer-events-none transition-all duration-300"
          style={{ left: `${currPct}%` }}
        />
      </div>

      {/* Axis Price Reference Footnote */}
      <div className="flex items-center justify-between text-[9px] text-slate-400">
        <span className="text-rose-400">止损 ${sl.toFixed(2)}</span>
        <span className="text-white font-bold">买入点 ${entry.toFixed(2)}</span>
        <span className="text-emerald-400">目标 ${tp.toFixed(2)}</span>
      </div>
    </div>
  );
};

export const TopRightAlertDrawer: React.FC<TopRightAlertDrawerProps> = ({
  isOpen,
  onToggle,
  latestSignal,
  alertHistory,
  unreadCount = 0,
  onClearHistory,
  onMarkAllAsRead,
  onMarkSignalAsRead,
  onAddToWatchlist,
  onViewDetail,
  onSelectSignal,
  isSoundMuted,
  onToggleSound,
}) => {
  const [activeTab, setActiveTab] = useState<'latest' | 'history'>('latest');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'dip' | 'breakdown' | 'breakout' | 'overbought'>('all');
  const [justAddedSymbol, setJustAddedSymbol] = useState<string | null>(null);

  const displaySignal = latestSignal || (alertHistory.length > 0 ? alertHistory[0] : null);

  const handleQuickAdd = (sig: QuantSignal, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onAddToWatchlist(sig);
    setJustAddedSymbol(sig.symbol);
    setTimeout(() => setJustAddedSymbol(null), 2500);
  };

  const heroTheme = displaySignal
    ? getStrategyGradientTheme(displaySignal.strategy, displaySignal.alertStage, displaySignal.changePercent)
    : null;

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop scrim */}
      <div
        onClick={onToggle}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 md:hidden animate-fade-in"
      />

      {/* Drawer Container: On mobile bottom-sheet, on desktop top-right popover */}
      <div className="fixed inset-x-0 bottom-0 md:inset-auto md:top-16 md:right-4 z-50 pointer-events-auto flex justify-center">
        <div className="w-full md:w-[440px] max-w-[460px] bg-[#181a20] border-t md:border border-[#2a2e37] rounded-t-3xl md:rounded-2xl shadow-2xl text-slate-100 overflow-hidden flex flex-col max-h-[75vh] md:max-h-[80vh] animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-top-2 duration-200">
          {/* Android Bottom Sheet Grab Handle (Mobile Only) */}
          <div className="md:hidden pt-2 pb-1 flex justify-center">
            <div className="w-10 h-1 bg-slate-600 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-3.5 py-2.5 border-b border-[#2a2e37] flex items-center justify-between bg-[#121418]">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-white text-xs sm:text-sm">量化买入预警抽屉</h3>
                  <span className="text-[9px] px-1 py-0.2 rounded-full bg-[#222630] text-slate-400">
                    实时极速
                  </span>
                </div>
                <p className="text-[9px] text-slate-400">点击顶部预警按钮或收回即可关闭</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Sound Toggle */}
              <button
                onClick={onToggleSound}
                title={isSoundMuted ? '开启提示音' : '静音'}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-white bg-[#222630] transition-colors"
              >
                {isSoundMuted ? (
                  <VolumeX className="w-3 h-3 text-rose-400" />
                ) : (
                  <Volume2 className="w-3 h-3 text-emerald-400" />
                )}
              </button>

              {/* Close / Retract Button */}
              <button
                onClick={onToggle}
                className="flex items-center gap-0.5 px-2 py-1 text-[11px] font-semibold rounded-full bg-[#222630] hover:bg-[#2c3240] text-slate-300 transition-colors"
              >
                <span>收回</span>
                <ChevronUp className="w-3 h-3 hidden md:inline" />
                <X className="w-3 h-3 md:hidden" />
              </button>
            </div>
          </div>

          {/* Sub Navigation: Latest Signal vs History Stream */}
          <div className="flex items-center justify-between border-b border-[#2a2e37] text-xs bg-[#14151b] px-3 pt-1.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('latest')}
                className={`pb-1.5 px-2 font-semibold transition-colors border-b-2 flex items-center gap-1 text-[11px] ${
                  activeTab === 'latest'
                    ? 'border-blue-400 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>最新买入信号</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`pb-1.5 px-2 font-semibold transition-colors border-b-2 flex items-center gap-1 text-[11px] ${
                  activeTab === 'history'
                    ? 'border-blue-400 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>预警历史 ({alertHistory.length})</span>
                {unreadCount > 0 && (
                  <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-neutral-950 text-[8px] font-bold px-1.5 py-0.2 rounded-full font-mono shadow-xs">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {unreadCount > 0 && onMarkAllAsRead && (
              <button
                onClick={onMarkAllAsRead}
                className="pb-1.5 text-[10px] text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-0.5 font-medium"
              >
                <CheckCheck className="w-3 h-3" />
                <span>全部已读</span>
              </button>
            )}
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {activeTab === 'latest' && (
              <>
                {displaySignal ? (
                  <div className="space-y-2.5">
                    {/* Signal Hero Card: 轻量级渐变背景系统 (抄底微蓝、破位深紫、突破翡翠、止盈琥珀) */}
                    <div
                      className={`rounded-xl p-3 space-y-2 border transition-all duration-300 ${
                        heroTheme
                          ? `${heroTheme.cardGradient} ${heroTheme.cardBorder} ${heroTheme.shadowGlow}`
                          : 'bg-[#121418] border-[#2a2e37]'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                heroTheme
                                  ? `${heroTheme.badgeBg} ${heroTheme.badgeBorder} ${heroTheme.badgeText}`
                                  : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                              }`}
                            >
                              {displaySignal.strategyName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {displaySignal.timestamp}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full border ${
                                displaySignal.isRead
                                  ? 'bg-[#181a20]/80 border-[#2a2e37] text-slate-500'
                                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                              }`}
                            >
                              {displaySignal.isRead ? '已读' : '● 新信号'}
                            </span>
                          </div>

                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="text-xl font-bold font-mono text-white">
                              {displaySignal.symbol}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                              {displaySignal.name}
                            </span>
                          </div>
                        </div>

                        {/* Price & Change */}
                        <div className="text-right">
                          <div className="text-base font-bold font-mono text-white">
                            ${displaySignal.currentPrice.toFixed(2)}
                          </div>
                          <div
                            className={`text-[11px] font-mono font-bold flex items-center justify-end gap-0.5 ${
                              displaySignal.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {displaySignal.changePercent < 0 ? (
                              <TrendingDown className="w-3 h-3" />
                            ) : (
                              <TrendingUp className="w-3 h-3" />
                            )}
                            <span>
                              {displaySignal.changePercent > 0 ? '+' : ''}
                              {displaySignal.changePercent.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quant Metrics 4-Grid */}
                      <div className="grid grid-cols-4 gap-1.5 bg-[#181a20] p-2 rounded-lg border border-[#2a2e37] text-center">
                        <div>
                          <div className="text-[9px] text-slate-400">RSI(6)</div>
                          <div
                            className={`text-[11px] font-mono font-bold tabular-nums ${
                              displaySignal.rsi6 < 22 ? 'text-rose-400' : 'text-amber-400'
                            }`}
                          >
                            {displaySignal.rsi6.toFixed(1)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400">RSI(14)</div>
                          <div className="text-[11px] font-mono font-bold text-slate-200 tabular-nums">
                            {displaySignal.rsi14.toFixed(1)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400">量比 RVOL</div>
                          <div
                            className={`text-[11px] font-mono font-bold tabular-nums ${
                              displaySignal.rvol > 1.5 ? 'text-amber-400' : 'text-slate-200'
                            }`}
                          >
                            {displaySignal.rvol.toFixed(1)}x
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400">胜率预估</div>
                          <div className="text-[11px] font-mono font-bold text-emerald-400 tabular-nums">
                            {displaySignal.winRateEstimate}%
                          </div>
                        </div>
                      </div>

                      {/* Trade Plan Strip */}
                      <div className="bg-[#181a20] rounded-lg p-2 border border-[#2a2e37] text-[10px] space-y-1 font-mono">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-sans flex items-center gap-1">
                            <Target className="w-2.5 h-2.5 text-emerald-400" />
                            建议入场:
                          </span>
                          <span className="text-emerald-300 font-bold">${displaySignal.suggestedEntry.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-sans flex items-center gap-1">
                            <TrendingUp className="w-2.5 h-2.5 text-blue-400" />
                            目标止盈 (TP):
                          </span>
                          <span className="text-blue-300 font-bold">
                            ${displaySignal.takeProfit1.toFixed(2)} ~ ${displaySignal.takeProfit2.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-sans flex items-center gap-1">
                            <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />
                            防守止损 (SL):
                          </span>
                          <span className="text-rose-400 font-bold">${displaySignal.stopLoss.toFixed(2)} (盈亏比 {displaySignal.riskRewardRatio})</span>
                        </div>
                      </div>

                      {/* Real-time Price-to-Entry Bias Gauge (盈亏比例与买入乖离进度条) */}
                      <SignalBiasProgressBar signal={displaySignal} compact={false} />

                      {/* Macro Market Warning if headwind */}
                      {displaySignal.macroMarket && displaySignal.macroMarket.headwindScoreDeduction > 0 && (
                        <div className="bg-rose-950/20 border border-rose-500/30 rounded-lg p-2 text-[10px] text-rose-300 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>大盘逆风风控生效 · 评分自动扣减 -{displaySignal.macroMarket.headwindScoreDeduction}分</span>
                          </div>
                        </div>
                      )}

                      {/* Decision Thesis & Natural Language Analysis */}
                      <div className="bg-[#14161c] border border-amber-500/25 rounded-lg p-2 space-y-1.5 leading-relaxed text-[10px]">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-amber-300 font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>量化分析 · 为什么值得入手？</span>
                          </span>
                          <div className="flex items-center gap-1 font-mono text-[8px]">
                            <span className="px-1 py-0.2 rounded bg-black/40 text-amber-300 border border-amber-500/20">
                              RSI乖离: {(displaySignal.rsiBiasPercent ?? ((displaySignal.rsi6 - 50) / 50 * 100)) > 0 ? '+' : ''}{(displaySignal.rsiBiasPercent ?? ((displaySignal.rsi6 - 50) / 50 * 100)).toFixed(1)}%
                            </span>
                            <span className="px-1 py-0.2 rounded bg-black/40 text-cyan-300 border border-cyan-500/20">
                              板块波动: {displaySignal.sectorVol ? `${displaySignal.sectorVol.toFixed(1)}%` : (displaySignal.sectorEtf?.sixMonthVolPercent ? `${displaySignal.sectorEtf.sixMonthVolPercent}%` : '24.5%')}
                            </span>
                          </div>
                        </div>
                        <p className="text-slate-200">
                          {displaySignal.naturalAnalysis || displaySignal.thesis}
                        </p>
                      </div>

                      {/* 板块超卖同步与相关性深度分析 */}
                      {displaySignal.sectorOversoldSync && (
                        <div className={`rounded-xl p-2.5 space-y-1.5 text-[10px] border ${
                          displaySignal.sectorOversoldSync.syncType === 'SECTOR_CONTAGION'
                            ? 'bg-rose-500/10 border-rose-500/30'
                            : displaySignal.sectorOversoldSync.syncType === 'ISOLATED_DECOUPLING'
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-blue-500/10 border-blue-500/30'
                        }`}>
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <div className="flex items-center gap-1.5 font-bold">
                              <Activity className="w-3 h-3 text-blue-400" />
                              <span className="text-slate-200">板块超卖同步分析</span>
                              <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono border ${displaySignal.sectorOversoldSync.badgeColor}`}>
                                {displaySignal.sectorOversoldSync.badgeLabel}
                              </span>
                            </div>
                            <span className="font-mono text-[9px] text-slate-300 bg-black/40 px-1 py-0.2 rounded border border-white/10">
                              {displaySignal.sectorOversoldSync.correlatedEtf} (r={displaySignal.sectorOversoldSync.correlationR.toFixed(2)}, β={displaySignal.sectorOversoldSync.beta.toFixed(2)})
                            </span>
                          </div>
                          <p className="text-slate-200 leading-relaxed">
                            {displaySignal.sectorOversoldSync.detailedAnalysis}
                          </p>
                          {displaySignal.sectorOversoldSync.actionGuidance && (
                            <div className="text-[9px] bg-black/30 p-1.5 rounded-lg border border-white/10 text-slate-300 font-sans">
                              💡 <span className="font-semibold text-amber-300">实战指引:</span> {displaySignal.sectorOversoldSync.actionGuidance}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Buttons (Google Material 3 Standard Buttons, h-9) */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={(e) => handleQuickAdd(displaySignal, e)}
                          className={`flex-1 h-9 px-4 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer select-none active:scale-[0.98] shadow-xs ${
                            justAddedSymbol === displaySignal.symbol
                              ? 'bg-[#142c23] text-[#81c995] border border-[#81c995]/40'
                              : 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-amber-500/20'
                          }`}
                        >
                          {justAddedSymbol === displaySignal.symbol ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>已加入监控 (移动止损已开启)</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>一键监控 (自动移动止盈止损)</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            onViewDetail(displaySignal.symbol);
                            onToggle();
                          }}
                          className="h-9 px-3.5 bg-[#242936] hover:bg-[#2e3444] text-slate-100 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors border border-[#282d38] cursor-pointer active:scale-[0.98]"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#8ab4f8]" />
                          <span>K线详情</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-xs space-y-1">
                    <Zap className="w-6 h-6 mx-auto text-slate-600" />
                    <div>暂未捕捉到新信号</div>
                    <div className="text-[10px] text-slate-600">后台持续高频秒级巡检中</div>
                  </div>
                )}
              </>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-2">
                {/* 策略类型与严重度快速筛选 (Google Material 3 Filter Chips, h-8) */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
                  {[
                    { key: 'all', label: '全部' },
                    { key: 'dip', label: '🌊 微蓝抄底' },
                    { key: 'breakdown', label: '🔮 深紫破位' },
                    { key: 'breakout', label: '🚀 翡翠突破' },
                    { key: 'overbought', label: '⚡ 琥珀止盈' }
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setHistoryFilter(f.key as any)}
                      className={`h-8 px-3 rounded-full whitespace-nowrap transition-colors cursor-pointer text-xs font-medium select-none active:scale-[0.97] ${
                        historyFilter === f.key
                          ? 'bg-[#1b3764] text-[#8ab4f8] border border-[#8ab4f8] font-bold shadow-xs'
                          : 'bg-[#1c202a] text-slate-400 hover:text-slate-200 hover:bg-[#242936] border border-[#282d38]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {alertHistory.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    暂无历史买入信号。
                  </div>
                ) : (
                  alertHistory
                    .filter((item) => {
                      if (historyFilter === 'all') return true;
                      const t = getStrategyGradientTheme(item.strategy, item.alertStage, item.changePercent);
                      return t.category === historyFilter;
                    })
                    .map((item, idx) => {
                      const isSelected = displaySignal?.symbol === item.symbol && displaySignal?.timestamp === item.timestamp;
                      const theme = getStrategyGradientTheme(item.strategy, item.alertStage, item.changePercent);

                      return (
                        <div
                          key={`${item.symbol}-${idx}-${item.timestamp}`}
                          onClick={() => {
                            if (onMarkSignalAsRead) onMarkSignalAsRead(item.id);
                            onSelectSignal(item);
                            setActiveTab('latest');
                          }}
                          className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer space-y-1.5 ${
                            theme.cardGradient
                          } ${
                            isSelected
                              ? theme.selectedRing
                              : `${theme.cardBorder} ${theme.cardBorderHover}`
                          } ${theme.shadowGlow}`}
                        >
                          <div className="flex items-center justify-between font-mono">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${theme.accentDot}`} />
                              <span className="font-bold text-white text-xs">{item.symbol}</span>
                              <span className="text-[11px] text-slate-300">${item.currentPrice.toFixed(2)}</span>
                              <span
                                className={`text-[10px] font-semibold ${
                                  item.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {item.changePercent > 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
                              </span>
                            </div>
                            <span className="text-[9px] text-slate-400">{item.timestamp}</span>
                          </div>

                          <div className="flex items-center justify-between text-[10px]">
                            <span
                              className={`px-1.5 py-0.2 rounded border font-sans text-[9px] ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder}`}
                            >
                              {item.strategyName}
                            </span>
                            <span className="text-emerald-400 font-mono">胜率 {item.winRateEstimate}%</span>
                          </div>

                          {item.sectorOversoldSync && (
                            <div className="flex items-center justify-between text-[9px] font-mono">
                              <span className={`px-1.5 py-0.2 rounded border ${item.sectorOversoldSync.badgeColor}`}>
                                {item.sectorOversoldSync.badgeLabel}
                              </span>
                              <span className="text-slate-400">
                                {item.sectorOversoldSync.correlatedEtf} r={item.sectorOversoldSync.correlationR.toFixed(2)}
                              </span>
                            </div>
                          )}

                          {/* Mini Progress Bar showing price-to-entry bias ratio (乖离率) */}
                          <SignalBiasProgressBar signal={item} compact={true} />
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-3 py-2 border-t border-[#2a2e37] flex items-center justify-between text-[10px] text-slate-400 bg-[#121418]">
            <div className="flex items-center gap-2">
              {unreadCount > 0 && onMarkAllAsRead && (
                <button
                  onClick={onMarkAllAsRead}
                  className="flex items-center gap-0.5 text-amber-400 hover:text-amber-300 font-medium"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>全部已读</span>
                </button>
              )}
              {alertHistory.length > 0 && (
                <button
                  onClick={onClearHistory}
                  className="flex items-center gap-0.5 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>清空</span>
                </button>
              )}
            </div>

            <button
              onClick={onToggle}
              className="px-2.5 py-1 bg-[#222630] hover:bg-[#2c3240] text-white rounded-full font-medium"
            >
              收回抽屉
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
