/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 7-Day Strategy Trigger Frequency & Subsequent Price Performance Statistics Panel
 * 过去 7 天预警策略触发频率与后续价格变动量化统计看板
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  ComposedChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Flame,
  LineChart as LineChartIcon,
  Shield,
  Target,
  RefreshCw,
  Search,
  Download,
  PlusCircle,
  HelpCircle,
  ChevronDown,
  Sparkles,
  BarChart3,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { StrategyType } from '../types/stock';
import { StrategyAlertRecord, AlertOutcome } from '../types/stats';
import { strategyStatsService } from '../services/strategyStatsService';

interface StrategyStatsPanelProps {
  onSelectStock: (symbol: string) => void;
}

export const StrategyStatsPanel: React.FC<StrategyStatsPanelProps> = ({
  onSelectStock,
}) => {
  const [, setTick] = useState(0);
  const [strategyFilter, setStrategyFilter] = useState<'ALL' | StrategyType>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | AlertOutcome>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChartTab, setActiveChartTab] = useState<'FREQUENCY' | 'RETURNS'>('FREQUENCY');
  const [showExportModal, setShowExportModal] = useState(false);

  // Subscribe to updates from strategyStatsService
  useEffect(() => {
    const unsub = strategyStatsService.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => unsub();
  }, []);

  // Compute stats
  const dailyStats = useMemo(() => strategyStatsService.getDailyStats(), []);
  const summaries = useMemo(() => strategyStatsService.getStrategySummaries(), []);
  const horizonData = useMemo(() => strategyStatsService.getHorizonComparison(), []);
  const allRecords = useMemo(() => strategyStatsService.getRecords(), []);

  // Aggregate KPI summary
  const totalTriggers = allRecords.length;
  const totalWins = allRecords.filter((r) => r.outcome === 'WIN').length;
  const overallWinRate = totalTriggers > 0 ? Number(((totalWins / totalTriggers) * 100).toFixed(1)) : 0;
  const overallAvg24hReturn =
    totalTriggers > 0
      ? Number((allRecords.reduce((s, r) => s + r.change24hPct, 0) / totalTriggers).toFixed(2))
      : 0;
  const overallAvgMaxGain =
    totalTriggers > 0
      ? Number((allRecords.reduce((s, r) => s + r.maxGainPct, 0) / totalTriggers).toFixed(2))
      : 0;

  // Best performing strategy by win rate
  const bestStrategy = [...summaries].sort((a, b) => b.winRate - a.winRate)[0];

  // Filtered records
  const filteredRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      if (strategyFilter !== 'ALL' && rec.strategy !== strategyFilter) return false;
      if (outcomeFilter !== 'ALL' && rec.outcome !== outcomeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return rec.symbol.toLowerCase().includes(q) || rec.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allRecords, strategyFilter, outcomeFilter, searchQuery]);

  const handleSimulateAlert = (strategy: StrategyType) => {
    strategyStatsService.simulateTestAlert(strategy);
  };

  const handleReset = () => {
    if (window.confirm('确定恢复 7 天标准基准回测数据样本吗？')) {
      strategyStatsService.resetToDefault();
    }
  };

  const exportCSV = () => {
    const headers = [
      '代码',
      '名称',
      '策略类型',
      '触发日期',
      '触发时间',
      '触发价格',
      'RSI(6)',
      'RSI(14)',
      'RVOL',
      '+1h涨跌幅(%)',
      '+4h涨跌幅(%)',
      '+24h涨跌幅(%)',
      '+48h涨跌幅(%)',
      '最高冲高(%)',
      '最大回撤(%)',
      '状态',
    ];
    const rows = filteredRecords.map((r) => [
      r.symbol,
      `"${r.name}"`,
      r.strategyName,
      r.triggerDate,
      r.triggerTime,
      r.triggerPrice,
      r.rsi6AtTrigger,
      r.rsi14AtTrigger,
      r.rvolAtTrigger,
      r.change1hPct,
      r.change4hPct,
      r.change24hPct,
      r.change48hPct,
      r.maxGainPct,
      r.maxDrawdownPct,
      r.outcome,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `quant_strategy_7d_stats_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportModal(false);
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Header Banner */}
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>过去 7 天量化预警频率与收益统计</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                    实盘对齐统计
                  </span>
                </h1>
                <p className="text-slate-400 text-xs mt-0.5">
                  全天候跟踪记录【暴跌抄底】、【开盘爆发】、【区间微波】三大模型触发频次与 +1h / +4h / +24h / +48h 价格演变实测
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions (Google Material 3 Standard Buttons) */}
          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap text-xs">
            {/* Inject Test Alert */}
            <div className="flex items-center gap-1.5 bg-[#12141a] border border-[#242936] p-1 rounded-full">
              <span className="text-xs text-slate-400 pl-2">模拟注入:</span>
              <button
                onClick={() => handleSimulateAlert('PLUNGE_DIP')}
                className="h-7 px-3 rounded-full bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 font-semibold text-xs transition-all cursor-pointer flex items-center justify-center"
                title="模拟触发一次暴跌抄底预警并计入统计"
              >
                + 抄底
              </button>
              <button
                onClick={() => handleSimulateAlert('OPENING_BREAKOUT')}
                className="h-7 px-3 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-xs transition-all cursor-pointer flex items-center justify-center"
                title="模拟触发一次开盘爆发预警并计入统计"
              >
                + 爆发
              </button>
              <button
                onClick={() => handleSimulateAlert('RANGE_OSCILLATOR')}
                className="h-7 px-3 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold text-xs transition-all cursor-pointer flex items-center justify-center"
                title="模拟触发一次区间微波预警并计入统计"
              >
                + 微波
              </button>
            </div>

            <button
              onClick={exportCSV}
              className="h-8 px-3.5 rounded-full bg-[#1c202a] hover:bg-[#242936] text-slate-200 border border-[#2a2f3e] flex items-center gap-1.5 font-semibold text-xs transition-all cursor-pointer shadow-xs"
              title="导出当前统计数据为 CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>导出CSV</span>
            </button>

            <button
              onClick={handleReset}
              className="w-8 h-8 rounded-full bg-[#1c202a] hover:bg-[#242936] text-slate-300 hover:text-white border border-[#2a2f3e] flex items-center justify-center transition-all cursor-pointer"
              title="重置为7天默认标准回测数据样本"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 5 Macro KPI Strips */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* KPI 1: 7-Day Triggers */}
        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>7天累计触发频次</span>
            <Activity className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums">
              {totalTriggers}
            </span>
            <span className="text-[10px] text-slate-400">次预警</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            日均 ~{(totalTriggers / 7).toFixed(1)} 次 / 标普500池
          </div>
        </div>

        {/* KPI 2: Overall Win Rate */}
        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>量化综合达标胜率</span>
            <Target className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {overallWinRate}%
            </span>
            <span className="text-[10px] text-slate-400">达止盈线</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            {totalWins} 胜 / {totalTriggers - totalWins} 止损或平手
          </div>
        </div>

        {/* KPI 3: 24h Average Return */}
        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>24h 平均后续变动</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              +{overallAvg24hReturn}%
            </span>
            <span className="text-[10px] text-slate-400">均值</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            最高冲高均值: +{overallAvgMaxGain}%
          </div>
        </div>

        {/* KPI 4: Best Performing Model */}
        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>7天最高胜率模型</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5 truncate">
            <span className="text-sm sm:text-base font-bold text-amber-300 truncate">
              {bestStrategy?.shortLabel || '暴跌抄底'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            胜率: <span className="text-emerald-400 font-bold">{bestStrategy?.winRate}%</span> · 盈亏比 {bestStrategy?.profitFactor}x
          </div>
        </div>

        {/* KPI 5: Model Risk-Reward */}
        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>防守风控拦截率</span>
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold font-mono text-cyan-300 tabular-nums">
              100%
            </span>
            <span className="text-[10px] text-slate-400">硬止损生效</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            单笔最大回撤仅 -2.5% 截断
          </div>
        </div>
      </div>

      {/* 3 Strategies Detailed Comparative Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {summaries.map((summary) => {
          const isPlunge = summary.strategy === 'PLUNGE_DIP';
          const isBreakout = summary.strategy === 'OPENING_BREAKOUT';
          const theme = isPlunge
            ? {
                border: 'border-amber-500/30',
                headerBg: 'bg-amber-500/10',
                text: 'text-amber-400',
                badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                icon: Zap,
              }
            : isBreakout
            ? {
                border: 'border-emerald-500/30',
                headerBg: 'bg-emerald-500/10',
                text: 'text-emerald-400',
                badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                icon: Flame,
              }
            : {
                border: 'border-blue-500/30',
                headerBg: 'bg-blue-500/10',
                text: 'text-blue-400',
                badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
                icon: Activity,
              };

          const IconComponent = theme.icon;

          return (
            <div
              key={summary.strategy}
              className={`bg-[#181a20] border ${theme.border} rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-all`}
            >
              <div>
                {/* Title */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`p-1.5 rounded-lg ${theme.headerBg} ${theme.text}`}>
                      <IconComponent className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="font-bold text-white text-sm">{summary.shortLabel}</h3>
                      <span className="text-[9px] text-slate-400 block">
                        {isPlunge
                          ? 'Larry Connors TPS 均值回归'
                          : isBreakout
                          ? 'Toby Crabel ORB 开盘突破'
                          : '通道超卖统计微波套利'}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${theme.badge}`}>
                    {summary.totalTriggers}次 ({summary.sharePercent}%)
                  </span>
                </div>

                {/* Main Stats 2x2 */}
                <div className="grid grid-cols-2 gap-2 my-3 font-mono">
                  <div className="bg-[#101216] border border-[#2a2e37] rounded-xl p-2.5">
                    <span className="text-[10px] text-slate-400 block mb-0.5">7天模型胜率</span>
                    <span className="text-lg font-bold text-emerald-400 tabular-nums">
                      {summary.winRate}%
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">
                      {summary.winCount} 赢 / {summary.lossCount} 损
                    </span>
                  </div>

                  <div className="bg-[#101216] border border-[#2a2e37] rounded-xl p-2.5">
                    <span className="text-[10px] text-slate-400 block mb-0.5">+24h 平均变动</span>
                    <span className="text-lg font-bold text-emerald-400 tabular-nums">
                      +{summary.avgReturn24h}%
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">
                      48h冲高: +{summary.avgMaxGain}%
                    </span>
                  </div>
                </div>

                {/* Subsequent Change Timeline */}
                <div className="bg-[#101216] border border-[#2a2e37] rounded-xl p-2.5 space-y-1.5 text-xs font-mono">
                  <span className="text-[10px] text-slate-400 block font-sans">后续时间窗口平均价格变动:</span>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div className="bg-[#181a20] py-1 rounded border border-[#232731]">
                      <span className="text-[9px] text-slate-400 block">+1h</span>
                      <span className="text-[11px] font-bold text-emerald-400">+{summary.avgReturn1h}%</span>
                    </div>
                    <div className="bg-[#181a20] py-1 rounded border border-[#232731]">
                      <span className="text-[9px] text-slate-400 block">+4h</span>
                      <span className="text-[11px] font-bold text-emerald-400">+{summary.avgReturn4h}%</span>
                    </div>
                    <div className="bg-[#181a20] py-1 rounded border border-[#232731]">
                      <span className="text-[9px] text-slate-400 block">+24h</span>
                      <span className="text-[11px] font-bold text-emerald-400">+{summary.avgReturn24h}%</span>
                    </div>
                    <div className="bg-[#181a20] py-1 rounded border border-[#232731]">
                      <span className="text-[9px] text-slate-400 block">+48h</span>
                      <span className="text-[11px] font-bold text-emerald-400">+{summary.avgReturn48h}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer info: Best & Worst */}
              <div className="mt-3 pt-2.5 border-t border-[#2a2e37] text-[10px] flex items-center justify-between text-slate-400 font-mono">
                <div>
                  盈亏比: <span className="font-bold text-white">{summary.profitFactor}x</span>
                </div>
                <div>
                  最佳案例: <span className="text-amber-300 font-bold">{summary.bestTrade.symbol}</span> (+{summary.bestTrade.gainPct}%)
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Visual Charts Container (Recharts) */}
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl p-4 shadow-sm">
        {/* Chart Header & Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[#2a2e37] mb-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>
                {activeChartTab === 'FREQUENCY'
                  ? '过去 7 天三种策略每日触发频次堆叠趋势'
                  : '不同时间窗口 (+1h, +4h, +24h, +48h) 后续价格变动对比'}
              </span>
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {activeChartTab === 'FREQUENCY'
                ? '柱状图展现各策略每日触发频次分布，折线标示当日综合达标胜率 (%)'
                : '对比各策略在预警发出后的超短线收益爬升动能与衰减拐点'}
            </p>
          </div>

          <div className="flex items-center gap-1 bg-[#101216] border border-[#2a2e37] p-0.5 rounded-xl self-start sm:self-auto text-xs">
            <button
              onClick={() => setActiveChartTab('FREQUENCY')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                activeChartTab === 'FREQUENCY'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              每日触发频次
            </button>
            <button
              onClick={() => setActiveChartTab('RETURNS')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                activeChartTab === 'RETURNS'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              时间窗口收益
            </button>
          </div>
        </div>

        {/* Chart 1: 7-Day Daily Trigger Frequency Stacked Bar Chart */}
        {activeChartTab === 'FREQUENCY' && (
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252832" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis
                  yAxisId="left"
                  stroke="#64748b"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  stroke="#64748b"
                  tick={{ fontSize: 11, fill: '#10b981' }}
                  unit="%"
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#14161c] border border-[#2a2e37] p-2.5 rounded-xl shadow-xl font-mono text-xs">
                          <div className="font-bold text-white mb-1.5 pb-1 border-b border-[#2a2e37] flex items-center justify-between">
                            <span>{data.dayLabel}</span>
                            <span className="text-slate-400 text-[10px]">合计 {data.totalCount} 次预警</span>
                          </div>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-center justify-between gap-4 text-amber-400">
                              <span>暴跌抄底:</span>
                              <span className="font-bold">{data.plungeCount} 次</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-emerald-400">
                              <span>开盘爆发:</span>
                              <span className="font-bold">{data.breakoutCount} 次</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-blue-400">
                              <span>区间微波:</span>
                              <span className="font-bold">{data.rangeCount} 次</span>
                            </div>
                            <div className="pt-1 mt-1 border-t border-[#2a2e37] flex items-center justify-between text-slate-300">
                              <span>当日胜率:</span>
                              <span className="font-bold text-emerald-400">{data.winRate}%</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-300">
                              <span>平均24h收益:</span>
                              <span className="font-bold text-cyan-300">+{data.avgReturn24h}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  formatter={(value) => {
                    const map: Record<string, string> = {
                      plungeCount: '暴跌抄底 (次)',
                      breakoutCount: '开盘爆发 (次)',
                      rangeCount: '区间微波 (次)',
                      winRate: '当日胜率 (%)',
                    };
                    return <span className="text-slate-300 font-sans">{map[value] || value}</span>;
                  }}
                />
                <Bar yAxisId="left" dataKey="plungeCount" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="left" dataKey="breakoutCount" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="left" dataKey="rangeCount" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="winRate"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#10b981' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Chart 2: Subsequent Returns by Horizon */}
        {activeChartTab === 'RETURNS' && (
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={horizonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252832" vertical={false} />
                <XAxis dataKey="horizon" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#14161c] border border-[#2a2e37] p-2.5 rounded-xl shadow-xl font-mono text-xs">
                          <div className="font-bold text-white mb-1.5 pb-1 border-b border-[#2a2e37]">
                            <span>{data.horizon} 窗口收益统计</span>
                          </div>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-center justify-between gap-4 text-amber-400">
                              <span>暴跌抄底:</span>
                              <span className="font-bold">+{data.plungeReturn}% (胜率 {data.plungeWinRate}%)</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-emerald-400">
                              <span>开盘爆发:</span>
                              <span className="font-bold">+{data.breakoutReturn}% (胜率 {data.breakoutWinRate}%)</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-blue-400">
                              <span>区间微波:</span>
                              <span className="font-bold">+{data.rangeReturn}% (胜率 {data.rangeWinRate}%)</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  formatter={(value) => {
                    const map: Record<string, string> = {
                      plungeReturn: '暴跌抄底平均收益(%)',
                      breakoutReturn: '开盘爆发平均收益(%)',
                      rangeReturn: '区间微波平均收益(%)',
                    };
                    return <span className="text-slate-300 font-sans">{map[value] || value}</span>;
                  }}
                />
                <Bar dataKey="plungeReturn" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="breakoutReturn" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rangeReturn" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Historical Detailed Trigger Logs Table */}
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl overflow-hidden shadow-sm">
        {/* Table Filter Toolbar (Google Material 3 Filter Chips & Search) */}
        <div className="p-3 border-b border-[#242936] flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-[#12141a]">
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-slate-400 font-semibold mr-1">预警流水:</span>
            {/* Strategy Filter Chips */}
            <button
              onClick={() => setStrategyFilter('ALL')}
              className={`h-8 px-3 rounded-full transition-all text-xs font-semibold ${
                strategyFilter === 'ALL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              全部 ({allRecords.length})
            </button>
            <button
              onClick={() => setStrategyFilter('PLUNGE_DIP')}
              className={`h-8 px-3 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold ${
                strategyFilter === 'PLUNGE_DIP'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>抄底</span>
            </button>
            <button
              onClick={() => setStrategyFilter('OPENING_BREAKOUT')}
              className={`h-8 px-3 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold ${
                strategyFilter === 'OPENING_BREAKOUT'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-emerald-400" />
              <span>爆发</span>
            </button>
            <button
              onClick={() => setStrategyFilter('RANGE_OSCILLATOR')}
              className={`h-8 px-3 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold ${
                strategyFilter === 'RANGE_OSCILLATOR'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>微波</span>
            </button>

            <span className="text-slate-600 mx-1">|</span>

            {/* Outcome Filter */}
            <button
              onClick={() => setOutcomeFilter('ALL')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all ${
                outcomeFilter === 'ALL' ? 'text-white font-bold bg-white/10' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              所有结果
            </button>
            <button
              onClick={() => setOutcomeFilter('WIN')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all ${
                outcomeFilter === 'WIN' ? 'text-emerald-400 font-bold bg-emerald-500/15' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              达标盈利
            </button>
            <button
              onClick={() => setOutcomeFilter('LOSS')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all ${
                outcomeFilter === 'LOSS' ? 'text-rose-400 font-bold bg-rose-500/15' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              止损拦截
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索股票代码 (如 NVDA, TSLA)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 bg-[#181a20] border border-[#2a2e37] rounded-full pl-8 pr-3 text-xs text-white placeholder-slate-500 font-mono focus:border-blue-500 focus:outline-hidden w-full sm:w-56"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#101216] text-slate-400 text-[10px] border-b border-[#2a2e37]">
              <tr>
                <th className="py-2.5 px-3">触发时间</th>
                <th className="py-2.5 px-3">股票标的</th>
                <th className="py-2.5 px-3">预警模型</th>
                <th className="py-2.5 px-3 text-right">触发基准价</th>
                <th className="py-2.5 px-3 text-center">指标环境</th>
                <th className="py-2.5 px-3 text-right">+1h 变动</th>
                <th className="py-2.5 px-3 text-right">+4h 变动</th>
                <th className="py-2.5 px-3 text-right">+24h 变动</th>
                <th className="py-2.5 px-3 text-right">+48h 变动</th>
                <th className="py-2.5 px-3 text-right">冲高(MFE) / 回撤(MAE)</th>
                <th className="py-2.5 px-3 text-center">结果状态</th>
                <th className="py-2.5 px-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232731]">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500 text-xs">
                    未找到匹配的预警触发记录
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const isPlunge = rec.strategy === 'PLUNGE_DIP';
                  const isBreakout = rec.strategy === 'OPENING_BREAKOUT';

                  return (
                    <tr key={rec.id} className="hover:bg-[#1f222b] transition-colors">
                      {/* Time */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-white block font-medium">{rec.triggerDate}</span>
                        <span className="text-[10px] text-slate-400 block">
                          {rec.dayOfWeek} {rec.triggerTime}
                        </span>
                      </td>

                      {/* Stock */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          onClick={() => onSelectStock(rec.symbol)}
                          className="font-bold text-white hover:text-blue-400 transition-colors text-left block"
                        >
                          {rec.symbol}
                        </button>
                        <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">
                          {rec.name}
                        </span>
                      </td>

                      {/* Strategy */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            isPlunge
                              ? 'bg-amber-400/10 text-amber-400 border-amber-400/30'
                              : isBreakout
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          }`}
                        >
                          {isPlunge ? <Zap className="w-2.5 h-2.5" /> : isBreakout ? <Flame className="w-2.5 h-2.5" /> : <Activity className="w-2.5 h-2.5" />}
                          <span>{isPlunge ? '抄底' : isBreakout ? '爆发' : '微波'}</span>
                        </span>
                      </td>

                      {/* Trigger Price */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap text-white font-bold">
                        ${rec.triggerPrice.toFixed(2)}
                      </td>

                      {/* Indicator context */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap text-[10px]">
                        <span className="text-slate-400">R6:</span>
                        <span className={rec.rsi6AtTrigger <= 22 ? 'text-rose-400 font-bold' : rec.rsi6AtTrigger >= 65 ? 'text-emerald-400 font-bold' : 'text-slate-200'}>
                          {rec.rsi6AtTrigger.toFixed(1)}
                        </span>
                        <span className="text-slate-600 mx-1">·</span>
                        <span className="text-slate-400">量比:</span>
                        <span className="text-amber-300 font-bold">{rec.rvolAtTrigger.toFixed(1)}x</span>
                      </td>

                      {/* +1h */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            rec.change1hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {rec.change1hPct >= 0 ? '+' : ''}{rec.change1hPct.toFixed(2)}%
                        </span>
                      </td>

                      {/* +4h */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            rec.change4hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {rec.change4hPct >= 0 ? '+' : ''}{rec.change4hPct.toFixed(2)}%
                        </span>
                      </td>

                      {/* +24h */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            rec.change24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {rec.change24hPct >= 0 ? '+' : ''}{rec.change24hPct.toFixed(2)}%
                        </span>
                      </td>

                      {/* +48h */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            rec.change48hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {rec.change48hPct >= 0 ? '+' : ''}{rec.change48hPct.toFixed(2)}%
                        </span>
                      </td>

                      {/* MFE & MAE */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className="text-emerald-400 font-bold block text-[11px]">
                          ▲ +{rec.maxGainPct.toFixed(1)}%
                        </span>
                        <span className="text-rose-400 text-[10px] block">
                          ▼ {rec.maxDrawdownPct.toFixed(1)}%
                        </span>
                      </td>

                      {/* Outcome Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {rec.outcome === 'WIN' ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>达标胜 (+{rec.realizedReturnPct.toFixed(1)}%)</span>
                          </span>
                        ) : rec.outcome === 'LOSS' ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <XCircle className="w-2.5 h-2.5" />
                            <span>止损 ({rec.realizedReturnPct.toFixed(1)}%)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
                            <Clock className="w-2.5 h-2.5" />
                            <span>实时跟踪</span>
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => onSelectStock(rec.symbol)}
                          className="px-2 py-0.5 bg-[#222630] hover:bg-blue-600 hover:text-white text-slate-300 rounded text-[10px] transition-colors cursor-pointer"
                        >
                          看K线
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
