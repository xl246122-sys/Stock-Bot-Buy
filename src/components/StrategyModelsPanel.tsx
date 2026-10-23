/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * StrategyModelsPanel -> 实时动向看板 (Live Market Dynamics Board)
 * 基于本地服务器 2 秒高频轮询扫描，全面聚合美股实时动向、资金异动与经典量化策略模型：
 * 1. ⚡ 实时动向矩阵：55+ 核心蓝筹高频跳动、RVOL 量比、Wilder RSI(6) 与动向状态标签
 * 2. 📉 暴跌触底企稳 (Larry Connors TPS - 极度超卖均值回归)
 * 3. 🚀 开盘动量突破 (Toby Crabel ORB - 放量突破与 VWAP 顺势)
 * 4. 🌊 区间微波震荡 (Bollinger Scalper - 布林带极限高抛低吸)
 * 
 * 核心原则：预警弹窗完全交由单一 AI大脑 (DeepSeek V3 Flash) 统一把关；
 * 本页面为高频实时看盘看板，提供 2s 级的实时行情、量价动能与策略分布展示。
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Flame,
  Activity,
  SlidersHorizontal,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Target,
  ShieldCheck,
  Search,
  RefreshCw,
  BarChart2,
  Eye,
  Layers,
  ArrowUpDown,
  ChevronRight,
  Clock,
  Radio,
  Sliders,
  DollarSign
} from 'lucide-react';
import { StockQuote, QuantSignal } from '../types/stock';
import { DipReboundScanner } from './DipReboundScanner';
import { BreakoutScanner } from './BreakoutScanner';
import { RangeOscillatorScanner } from './RangeOscillatorScanner';

interface StrategyModelsPanelProps {
  stocks: StockQuote[];
  activeTimeframe?: string;
  onSelectStock: (stock: StockQuote) => void;
  onOpenSignal?: (signal: QuantSignal) => void;
  signalsMap?: Map<string, QuantSignal>;
  pollCountdown?: number;
  lastPollTime?: string;
}

export const StrategyModelsPanel: React.FC<StrategyModelsPanelProps> = ({
  stocks,
  activeTimeframe = '30m',
  onSelectStock,
  onOpenSignal,
  signalsMap = new Map(),
  pollCountdown: externalCountdown,
  lastPollTime: externalLastPollTime,
}) => {
  // 视图模式: 'matrix' 实时动向矩阵 | 'dip' 抄底策略 | 'breakout' 爆发策略 | 'range' 微波策略
  const [activeModel, setActiveModel] = useState<'matrix' | 'dip' | 'breakout' | 'range'>('matrix');
  const [filterMinCap5B, setFilterMinCap5B] = useState<boolean>(true);
  const [filterMinPrice50, setFilterMinPrice50] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [dynamicFilter, setDynamicFilter] = useState<'all' | 'gainers' | 'losers' | 'volume' | 'oversold'>('all');
  const [sortBy, setSortBy] = useState<'change_desc' | 'change_asc' | 'rvol' | 'rsi'>('change_desc');

  // 本地 2s 轮询动态倒计时与刷新时间戳
  const [internalCountdown, setInternalCountdown] = useState<number>(2);
  const [internalLastPoll, setInternalLastPoll] = useState<string>(() =>
    new Date().toLocaleTimeString('zh-CN', { hour12: false })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setInternalCountdown((prev) => {
        if (prev <= 1) {
          setInternalLastPoll(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
          return 2;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentCountdown = externalCountdown ?? internalCountdown;
  const currentPollTime = externalLastPollTime ?? internalLastPoll;

  // 基础门限过滤
  const qualifiedStocks = useMemo(() => {
    return stocks.filter((s) => {
      if (filterMinPrice50 && s.price < 50.0) return false;
      if (filterMinCap5B && s.marketCap < 5.0) return false;
      return true;
    });
  }, [stocks, filterMinPrice50, filterMinCap5B]);

  // 全盘多空统计指标
  const metrics = useMemo(() => {
    let gainers = 0;
    let losers = 0;
    let totalChange = 0;
    let totalRsi = 0;
    let rsiCount = 0;

    qualifiedStocks.forEach((s) => {
      if (s.changePercent > 0) gainers++;
      else if (s.changePercent < 0) losers++;
      totalChange += s.changePercent;
      if (s.rsi6 && s.rsi6 > 0) {
        totalRsi += s.rsi6;
        rsiCount++;
      }
    });

    const avgChange = qualifiedStocks.length > 0 ? totalChange / qualifiedStocks.length : 0;
    const avgRsi = rsiCount > 0 ? totalRsi / rsiCount : 50;

    // 各大策略模型命中数量统计
    const dipCount = qualifiedStocks.filter((s) => s.changePercent <= -2.5 || (s.rsi6 && s.rsi6 <= 25)).length;
    const breakoutCount = qualifiedStocks.filter((s) => s.changePercent > 1.2 && (s.rvol || 1) >= 1.8).length;
    const rangeCount = qualifiedStocks.filter(
      (s) => s.bollinger && (s.bollinger.percentB < 0.2 || s.bollinger.percentB > 0.8)
    ).length;

    return {
      gainers,
      losers,
      avgChange,
      avgRsi,
      dipCount,
      breakoutCount,
      rangeCount,
      totalCount: qualifiedStocks.length,
    };
  }, [qualifiedStocks]);

  // 计算每只股票的“实时动向标签”与“动能状态”
  const getDynamicTag = (stock: StockQuote) => {
    const rvol = stock.rvol || 1.0;
    const chg = stock.changePercent;
    const rsi = stock.rsi6 || 50;
    const pb = stock.bollinger?.percentB ?? 0.5;

    if (chg >= 2.0 && rvol >= 1.8) {
      return { label: '🚀 放量暴拉', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    }
    if (chg >= 1.2 && rvol >= 1.5) {
      return { label: '🔥 动量突破', color: 'bg-rose-500/15 text-rose-300 border-rose-500/25' };
    }
    if (chg <= -3.0 || rsi <= 20) {
      return { label: '⚡ 恐慌探底', color: 'bg-amber-500/20 text-amber-300 border-amber-500/35' };
    }
    if (chg <= -1.8 && rsi <= 28) {
      return { label: '📉 超卖企稳', color: 'bg-amber-500/15 text-amber-300 border-amber-500/25' };
    }
    if (pb < 0.15) {
      return { label: '🌊 触布林下轨', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' };
    }
    if (pb > 0.85) {
      return { label: '🌊 触布林上轨', color: 'bg-purple-500/15 text-purple-300 border-purple-500/25' };
    }
    if (rsi >= 75) {
      return { label: '⚠️ 高位滞涨', color: 'bg-orange-500/15 text-orange-300 border-orange-500/25' };
    }
    if (chg > 0) {
      return { label: '📈 多头顺势', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' };
    }
    return { label: '📉 空头震荡', color: 'bg-slate-500/15 text-slate-300 border-slate-500/25' };
  };

  // 综合动向矩阵视图中的列表筛选与排序
  const matrixStocks = useMemo(() => {
    let list = [...qualifiedStocks];

    // 搜索过滤
    if (searchKeyword.trim()) {
      const q = searchKeyword.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.sector && s.sector.toLowerCase().includes(q))
      );
    }

    // 快捷动向分类过滤
    if (dynamicFilter === 'gainers') {
      list = list.filter((s) => s.changePercent > 0);
    } else if (dynamicFilter === 'losers') {
      list = list.filter((s) => s.changePercent < 0);
    } else if (dynamicFilter === 'volume') {
      list = list.filter((s) => (s.rvol || 1.0) >= 1.5);
    } else if (dynamicFilter === 'oversold') {
      list = list.filter((s) => s.rsi6 <= 28 || s.changePercent <= -2.0);
    }

    // 排序
    list.sort((a, b) => {
      if (sortBy === 'change_desc') return b.changePercent - a.changePercent;
      if (sortBy === 'change_asc') return a.changePercent - b.changePercent;
      if (sortBy === 'rvol') return (b.rvol || 1) - (a.rvol || 1);
      if (sortBy === 'rsi') return (a.rsi6 || 50) - (b.rsi6 || 50);
      return 0;
    });

    return list;
  }, [qualifiedStocks, searchKeyword, dynamicFilter, sortBy]);

  const handleSelectSymbol = (symbol: string) => {
    const found = stocks.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
    if (found) {
      onSelectStock(found);
    }
  };

  const handleOpenSignalInternal = (sig: QuantSignal) => {
    if (onOpenSignal) {
      onOpenSignal(sig);
    } else {
      handleSelectSymbol(sig.symbol);
    }
  };

  return (
    <div className="space-y-3.5 animate-fade-in pb-10">
      {/* ========================================================================= */}
      {/* 1. 顶部 2 秒高频轮询扫描心跳条 (Live Heartbeat & Single AI-Brain Notice)    */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#131722] to-blue-950/40 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping absolute opacity-75" />
            <span className="w-3 h-3 rounded-full bg-emerald-400 relative" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-white text-sm tracking-tight">
                本地 2秒极速轮询扫描
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                0{currentCountdown}s 动态跳动
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/25">
                刷新: {currentPollTime}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5 font-sans">
              实时捕捉 55+ 只核心美股实盘异动；买卖预警由单一【AI大脑】(DeepSeek V3 Flash) 严格把关，免受弹窗骚扰。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
          <div className="px-2 py-1 rounded-xl bg-black/40 border border-white/10 flex items-center gap-1 text-[11px] font-mono text-slate-300">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>2s 实盘直连</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. 市场多空与策略动向全景仪表舱 (4 大多空维度汇总)                           */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#161a24] via-[#11141c] to-[#0c0e14] border border-[#262c3e] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-widest uppercase font-mono font-bold text-blue-400">
                MARKET DYNAMICS RADAR · 实时动向看板
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-blue-500/15 border border-blue-500/30 text-blue-300">
                全盘实盘
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-1">
              美股实时动向与策略监控
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              2 秒连续轮询美股主力资金与技术拐点，结合 Welles Wilder RMA 与成交量异动，全天候观察盘口强弱。
            </p>
          </div>
        </div>

        {/* 4 维核心动向指标卡 (Material 3 Surface Tiles) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
          {/* 指标 1: 全盘多空 */}
          <div className="p-3 rounded-2xl bg-black/40 border border-white/5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
                <span>全盘多空</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400">共 {metrics.totalCount} 只</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-extrabold text-rose-400 font-mono">
                {metrics.gainers} <span className="text-xs font-normal text-slate-400">涨</span>
              </span>
              <span className="text-slate-500 text-xs">/</span>
              <span className="text-lg font-extrabold text-emerald-400 font-mono">
                {metrics.losers} <span className="text-xs font-normal text-slate-400">跌</span>
              </span>
            </div>
            <div className="mt-1 text-[10px] text-slate-400 flex items-center justify-between">
              <span>平均涨跌</span>
              <span className={`font-mono font-bold ${metrics.avgChange >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {metrics.avgChange >= 0 ? '+' : ''}{metrics.avgChange.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* 指标 2: 动能爆发 (ORB) */}
          <div
            onClick={() => setActiveModel('breakout')}
            className="p-3 rounded-2xl bg-black/40 border border-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1 text-rose-300">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>放量爆发</span>
              </span>
              <span className="text-[10px] font-mono text-rose-400 group-hover:translate-x-0.5 transition-transform">
                查看 &gt;
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-rose-400 font-mono">{metrics.breakoutCount}</span>
              <span className="text-xs text-slate-400">只标的</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              ORB 突破 / RVOL &ge; 1.8
            </div>
          </div>

          {/* 指标 3: 恐慌抄底 (TPS) */}
          <div
            onClick={() => setActiveModel('dip')}
            className="p-3 rounded-2xl bg-black/40 border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1 text-amber-300">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>暴跌企稳</span>
              </span>
              <span className="text-[10px] font-mono text-amber-400 group-hover:translate-x-0.5 transition-transform">
                查看 &gt;
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-amber-400 font-mono">{metrics.dipCount}</span>
              <span className="text-xs text-slate-400">只标的</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Connors TPS / RSI &le; 25
            </div>
          </div>

          {/* 指标 4: 布林极限 (Scalper) */}
          <div
            onClick={() => setActiveModel('range')}
            className="p-3 rounded-2xl bg-black/40 border border-cyan-500/20 hover:border-cyan-500/40 transition-all cursor-pointer flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1 text-cyan-300">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>布林极限</span>
              </span>
              <span className="text-[10px] font-mono text-cyan-400 group-hover:translate-x-0.5 transition-transform">
                查看 &gt;
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-cyan-400 font-mono">{metrics.rangeCount}</span>
              <span className="text-xs text-slate-400">只标的</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              触布林上/下轨极限位
            </div>
          </div>
        </div>

        {/* 看板视图分段切换器 (Material 3 Segmented Control) */}
        <div className="grid grid-cols-4 gap-1.5 mt-4 p-1.5 bg-black/50 rounded-2xl border border-white/5 text-xs">
          {/* 选项 1: 实时动向矩阵 */}
          <button
            onClick={() => setActiveModel('matrix')}
            className={`py-2 px-1 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
              activeModel === 'matrix'
                ? 'bg-gradient-to-r from-blue-600/30 to-indigo-600/30 border border-blue-500/40 text-blue-300 shadow font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="truncate">动向矩阵</span>
          </button>

          {/* 选项 2: 暴跌抄底动向 */}
          <button
            onClick={() => setActiveModel('dip')}
            className={`py-2 px-1 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
              activeModel === 'dip'
                ? 'bg-gradient-to-r from-amber-500/25 to-amber-600/30 border border-amber-500/40 text-amber-300 shadow font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">抄底动向</span>
            <span className="px-1 py-0.1 text-[9px] font-mono rounded bg-amber-500/20 text-amber-300">
              {metrics.dipCount}
            </span>
          </button>

          {/* 选项 3: 开盘爆发动向 */}
          <button
            onClick={() => setActiveModel('breakout')}
            className={`py-2 px-1 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
              activeModel === 'breakout'
                ? 'bg-gradient-to-r from-rose-500/25 to-rose-600/30 border border-rose-500/40 text-rose-300 shadow font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span className="truncate">爆发动向</span>
            <span className="px-1 py-0.1 text-[9px] font-mono rounded bg-rose-500/20 text-rose-300">
              {metrics.breakoutCount}
            </span>
          </button>

          {/* 选项 4: 区间微波动向 */}
          <button
            onClick={() => setActiveModel('range')}
            className={`py-2 px-1 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
              activeModel === 'range'
                ? 'bg-gradient-to-r from-cyan-500/25 to-blue-600/30 border border-cyan-500/40 text-cyan-300 shadow font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="truncate">微波动向</span>
            <span className="px-1 py-0.1 text-[9px] font-mono rounded bg-cyan-500/20 text-cyan-300">
              {metrics.rangeCount}
            </span>
          </button>
        </div>

        {/* 严选门限与筛选工具条 */}
        <div className="mt-3.5 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-sans flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span>严选门限:</span>
            </span>
            <button
              onClick={() => setFilterMinPrice50(!filterMinPrice50)}
              className={`px-2 py-0.8 rounded-lg border text-[11px] transition-all cursor-pointer ${
                filterMinPrice50
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-bold'
                  : 'bg-black/30 border-white/10 text-slate-400'
              }`}
            >
              股价 ≥ $50
            </button>
            <button
              onClick={() => setFilterMinCap5B(!filterMinCap5B)}
              className={`px-2 py-0.8 rounded-lg border text-[11px] transition-all cursor-pointer ${
                filterMinCap5B
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-bold'
                  : 'bg-black/30 border-white/10 text-slate-400'
              }`}
            >
              市值 ≥ $5B
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-sans">
            实时纳入监控: <span className="text-white font-mono font-bold">{qualifiedStocks.length}</span> 只
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 看板主体内容渲染区 (Matrix / Dip / Breakout / Range)                     */}
      {/* ========================================================================= */}
      {activeModel === 'matrix' && (
        <div className="space-y-3 animate-fade-in">
          {/* 快捷搜索与动向过滤栏 */}
          <div className="p-3 rounded-2xl bg-[#141720] border border-[#262c3e] flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            {/* 搜索框 */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索标的代码 / 中英文名称..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-400 text-xs focus:outline-none focus:border-blue-500/50"
              />
            </div>

            {/* 动向分类微过滤胶囊 */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
              <button
                onClick={() => setDynamicFilter('all')}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  dynamicFilter === 'all'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/35 font-bold'
                    : 'bg-black/30 text-slate-400 border border-white/5 hover:text-slate-200'
                }`}
              >
                全部 ({qualifiedStocks.length})
              </button>
              <button
                onClick={() => setDynamicFilter('gainers')}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  dynamicFilter === 'gainers'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35 font-bold'
                    : 'bg-black/30 text-slate-400 border border-white/5 hover:text-slate-200'
                }`}
              >
                领涨多头 ({metrics.gainers})
              </button>
              <button
                onClick={() => setDynamicFilter('losers')}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  dynamicFilter === 'losers'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-bold'
                    : 'bg-black/30 text-slate-400 border border-white/5 hover:text-slate-200'
                }`}
              >
                领跌空头 ({metrics.losers})
              </button>
              <button
                onClick={() => setDynamicFilter('volume')}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  dynamicFilter === 'volume'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35 font-bold'
                    : 'bg-black/30 text-slate-400 border border-white/5 hover:text-slate-200'
                }`}
              >
                量比异动
              </button>
              <button
                onClick={() => setDynamicFilter('oversold')}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  dynamicFilter === 'oversold'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/35 font-bold'
                    : 'bg-black/30 text-slate-400 border border-white/5 hover:text-slate-200'
                }`}
              >
                超卖区
              </button>
            </div>
          </div>

          {/* 实时动态股票卡片列表 */}
          <div className="space-y-2">
            {matrixStocks.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[#141720] border border-[#262c3e] text-slate-400 text-xs">
                没有找到符合条件的股票动向
              </div>
            ) : (
              matrixStocks.map((stock) => {
                const tag = getDynamicTag(stock);
                const rsi = stock.rsi6 || 50;
                const rvol = stock.rvol || 1.0;
                const pb = stock.bollinger?.percentB ?? 0.5;

                return (
                  <div
                    key={stock.symbol}
                    onClick={() => onSelectStock(stock)}
                    className="p-3 sm:p-3.5 rounded-2xl bg-[#141720] hover:bg-[#1a1e2a] border border-[#262c3e] hover:border-blue-500/40 transition-all cursor-pointer shadow-sm flex items-center justify-between gap-3 group"
                  >
                    {/* 左侧: 代码、名称与动向状态微标 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-white text-base tracking-tight group-hover:text-blue-400 transition-colors">
                          {stock.symbol}
                        </span>
                        <span className="text-[11px] text-slate-300 truncate max-w-[120px] sm:max-w-[200px]">
                          {stock.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold border ${tag.color}`}
                        >
                          {tag.label}
                        </span>
                      </div>

                      {/* 辅助量化参数：RSI(6)、RVOL量比、布林带位置 */}
                      <div className="flex items-center gap-2.5 mt-1.5 text-[11px] font-mono text-slate-300 flex-wrap">
                        <span className="flex items-center gap-1">
                          <span className="text-slate-400">RSI(6):</span>
                          <span
                            className={`font-bold ${
                              rsi <= 25 ? 'text-amber-400' : rsi >= 75 ? 'text-rose-400' : 'text-slate-200'
                            }`}
                          >
                            {rsi.toFixed(1)}
                          </span>
                        </span>

                        <span className="flex items-center gap-1">
                          <span className="text-slate-400">量比:</span>
                          <span className={`font-bold ${rvol >= 1.8 ? 'text-rose-400' : 'text-slate-300'}`}>
                            {rvol.toFixed(1)}x
                          </span>
                        </span>

                        <span className="hidden sm:inline-flex items-center gap-1">
                          <span className="text-slate-400">布林%B:</span>
                          <span className="text-slate-300">{(pb * 100).toFixed(0)}%</span>
                        </span>

                        <span className="text-[10px] text-slate-400">{stock.sector || 'US Equity'}</span>
                      </div>
                    </div>

                    {/* 右侧: 实时报价与涨跌幅 */}
                    <div className="text-right shrink-0">
                      <div className="font-mono text-base font-extrabold text-white">
                        ${stock.price.toFixed(2)}
                      </div>
                      <div
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-mono font-bold mt-0.5 ${
                          stock.changePercent >= 0
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                        }`}
                      >
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 选项 2: 暴跌抄底动向 (Connors TPS) */}
      {activeModel === 'dip' && (
        <div className="animate-fade-in">
          <DipReboundScanner
            stocks={qualifiedStocks}
            activeTimeframe={activeTimeframe}
            onSelectStock={handleSelectSymbol}
            onOpenSignal={handleOpenSignalInternal}
            onAddToWatchlist={() => {}}
            signalsMap={signalsMap}
          />
        </div>
      )}

      {/* 选项 3: 开盘爆发动向 (Crabel ORB) */}
      {activeModel === 'breakout' && (
        <div className="animate-fade-in">
          <BreakoutScanner
            stocks={qualifiedStocks}
            activeTimeframe={activeTimeframe}
            onSelectStock={handleSelectSymbol}
            onOpenSignal={handleOpenSignalInternal}
            onAddToWatchlist={() => {}}
            signalsMap={signalsMap}
          />
        </div>
      )}

      {/* 选项 4: 区间微波动向 (Bollinger Scalper) */}
      {activeModel === 'range' && (
        <div className="animate-fade-in">
          <RangeOscillatorScanner
            stocks={qualifiedStocks}
            activeTimeframe={activeTimeframe}
            onSelectStock={handleSelectSymbol}
            onOpenSignal={handleOpenSignalInternal}
            onAddToWatchlist={() => {}}
            signalsMap={signalsMap}
          />
        </div>
      )}
    </div>
  );
};
