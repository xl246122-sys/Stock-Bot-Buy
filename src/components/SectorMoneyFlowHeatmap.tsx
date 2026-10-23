/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Sector ETF Money Flow Heatmap & Stock Buy/Sell Pressure Visualizer
 * 美股板块ETF资金热力图 & 关联个股买卖压力红绿高亮分析器
 */

import React, { useState, useMemo } from 'react';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  ArrowRight,
  Filter,
  Search,
  Sparkles,
  Zap,
  BarChart2,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import {
  StockQuote,
  SectorMoneyFlowItem,
  StockPressureMetrics,
  MonitoredPosition
} from '../types/stock';
import { SectorCorrelationService } from '../services/sectorCorrelationService';
import { SectorEtfService } from '../services/sectorEtfService';

interface SectorMoneyFlowHeatmapProps {
  stocks: StockQuote[];
  positions?: MonitoredPosition[];
  selectedEtfs: string[];
  onSelectStock: (symbol: string) => void;
  onSelectEtf?: (etfSymbol: string) => void;
  onOpenRadar?: (symbol: string) => void;
}

export const SectorMoneyFlowHeatmap: React.FC<SectorMoneyFlowHeatmapProps> = ({
  stocks,
  positions = [],
  selectedEtfs,
  onSelectStock,
  onSelectEtf,
  onOpenRadar,
}) => {
  // 当前聚焦选中的板块ETF (若为null则展示全部板块及关联个股)
  const [activeEtfFilter, setActiveEtfFilter] = useState<string | null>(null);

  // 买卖压力筛选模式: 全部 / 仅看多头买盘优势(绿) / 仅看空头卖压沉重(红) / 剧烈失衡
  const [pressureFilter, setPressureFilter] = useState<'all' | 'buy_dominant' | 'sell_dominant' | 'extreme'>('all');

  // 板块排序模式: 按吸金评分(高到低) / 净流入金额 / 成交量放大倍数 RVOL / 涨跌动量
  const [sectorSortBy, setSectorSortBy] = useState<'inflow_score' | 'net_amount' | 'rvol' | 'momentum'>('inflow_score');

  // 搜索关键字
  const [searchKeyword, setSearchKeyword] = useState('');

  // 1. 获取所有板块ETF的资金热力与动量数据
  const allSectorFlows: SectorMoneyFlowItem[] = useMemo(() => {
    const list = selectedEtfs.length > 0 ? selectedEtfs : ['XLK', 'XLE', 'XLF', 'SMH', 'XLY', 'XLV', 'XLI', 'XLC', 'XLP', 'SPY', 'QQQ'];
    const flows = SectorCorrelationService.getAllSectorMoneyFlows(list);

    return [...flows].sort((a, b) => {
      if (sectorSortBy === 'inflow_score') return b.inflowScore - a.inflowScore;
      if (sectorSortBy === 'net_amount') return b.netInflowMillion - a.netInflowMillion;
      if (sectorSortBy === 'rvol') return b.rvol - a.rvol;
      if (sectorSortBy === 'momentum') return b.changePercent - a.changePercent;
      return 0;
    });
  }, [selectedEtfs, sectorSortBy]);

  // 2. 宏观统计指标
  const aggregateStats = useMemo(() => {
    const totalNetFlow = allSectorFlows.reduce((sum, f) => sum + f.netInflowMillion, 0);
    const inflowSectors = allSectorFlows.filter((f) => f.inflowScore > 0);
    const outflowSectors = allSectorFlows.filter((f) => f.inflowScore < 0);
    const topInflow = [...allSectorFlows].sort((a, b) => b.inflowScore - a.inflowScore)[0];
    const topOutflow = [...allSectorFlows].sort((a, b) => a.inflowScore - b.inflowScore)[0];
    const avgRvol = allSectorFlows.length > 0
      ? allSectorFlows.reduce((sum, f) => sum + f.rvol, 0) / allSectorFlows.length
      : 1.0;

    return {
      totalNetFlow,
      inflowCount: inflowSectors.length,
      outflowCount: outflowSectors.length,
      topInflow,
      topOutflow,
      avgRvol: Number(avgRvol.toFixed(2)),
    };
  }, [allSectorFlows]);

  // 3. 计算所有关注股票的实时买卖压力与板块映射
  const stockPressures: StockPressureMetrics[] = useMemo(() => {
    return stocks.map((stock) => {
      const mappedEtfSymbol = SectorEtfService.getEtfForSector(stock.sector, stock.symbol).etfSymbol;
      const matchedFlow = allSectorFlows.find((f) => f.etfSymbol === mappedEtfSymbol);
      return SectorCorrelationService.evaluateStockPressure(stock, matchedFlow);
    });
  }, [stocks, allSectorFlows]);

  // 4. 根据当前聚焦ETF与买卖压力筛选股票
  const filteredStockPressures = useMemo(() => {
    let list = stockPressures;

    // 按聚焦板块ETF过滤
    if (activeEtfFilter) {
      const constituents = SectorCorrelationService.ETF_CONSTITUENTS_MAP[activeEtfFilter] || [];
      list = list.filter(
        (sp) => sp.mappedEtf === activeEtfFilter || constituents.includes(sp.symbol)
      );
    }

    // 按买卖压力筛选
    if (pressureFilter === 'buy_dominant') {
      list = list.filter((sp) => sp.buyPressurePercent >= 54);
    } else if (pressureFilter === 'sell_dominant') {
      list = list.filter((sp) => sp.sellPressurePercent >= 54);
    } else if (pressureFilter === 'extreme') {
      list = list.filter((sp) => sp.buyPressurePercent >= 68 || sp.sellPressurePercent >= 68);
    }

    // 按搜索关键字过滤
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      list = list.filter(
        (sp) => sp.symbol.toLowerCase().includes(kw) || sp.name.toLowerCase().includes(kw)
      );
    }

    // 默认按买卖压力失衡程度排序（买盘或卖压最极端的排在前面，便于超短线发现机遇与风险）
    return list.sort((a, b) => {
      const imbalanceA = Math.abs(a.buyPressurePercent - 50);
      const imbalanceB = Math.abs(b.buyPressurePercent - 50);
      return imbalanceB - imbalanceA;
    });
  }, [stockPressures, activeEtfFilter, pressureFilter, searchKeyword]);

  // 5. 股票压力计数
  const stockPressureCounts = useMemo(() => {
    const heavyBuy = stockPressures.filter((s) => s.pressureLevel === 'HEAVY_BUY').length;
    const mildBuy = stockPressures.filter((s) => s.pressureLevel === 'MILD_BUY').length;
    const heavySell = stockPressures.filter((s) => s.pressureLevel === 'HEAVY_SELL').length;
    const mildSell = stockPressures.filter((s) => s.pressureLevel === 'MILD_SELL').length;
    const balanced = stockPressures.filter((s) => s.pressureLevel === 'BALANCED').length;
    return { heavyBuy, mildBuy, heavySell, mildSell, balanced };
  }, [stockPressures]);

  // 板块资金热力方块颜色映射
  const getSectorHeatmapGradient = (flow: SectorMoneyFlowItem, isSelected: boolean) => {
    const { inflowScore } = flow;
    let base = '';
    if (inflowScore >= 45) {
      base = 'bg-gradient-to-br from-emerald-950/80 via-emerald-900/40 to-[#121c17] border-emerald-500/60 text-emerald-300 shadow-emerald-900/20 shadow-lg';
    } else if (inflowScore >= 12) {
      base = 'bg-gradient-to-br from-teal-950/70 via-teal-900/30 to-[#141b18] border-teal-500/40 text-teal-300';
    } else if (inflowScore <= -45) {
      base = 'bg-gradient-to-br from-rose-950/80 via-rose-900/40 to-[#1b1416] border-rose-500/60 text-rose-300 shadow-rose-900/20 shadow-lg';
    } else if (inflowScore <= -12) {
      base = 'bg-gradient-to-br from-amber-950/70 via-amber-900/30 to-[#1a1714] border-amber-500/40 text-amber-300';
    } else {
      base = 'bg-[#151821] border-[#262a36] text-slate-300';
    }

    if (isSelected) {
      base += ' ring-2 ring-blue-400 scale-[1.02] shadow-blue-500/20 shadow-xl';
    }
    return base;
  };

  return (
    <div className="space-y-4">
      {/* 顶部资金流动综述看板 */}
      <div className="bg-[#14161c] border border-[#262a36] rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                板块动量与量价流向雷达
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] font-mono">
                价格动能 × 成交量比 RVOL × Beta加权
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white mt-1.5 flex items-center gap-2">
              美股板块资金热力图 · 实时买卖压力监测
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
              基于板块ETF（XLK/XLE/XLF等）的动量增减与放量/缩量状态，直观穿透资金正在流入还是流出各大行业。
              并深度联动成分股，以<strong className="text-emerald-400">【绿色高亮】</strong>呈现多头买盘压制、以<strong className="text-rose-400">【红色高亮】</strong>警示沉重空头卖压。
            </p>
          </div>

          {/* 宏观吸金流向数据统计条 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
            <div className="bg-[#101217] p-2.5 rounded-xl border border-[#262a36]">
              <div className="text-[10px] text-slate-400">全市场板块净资金流</div>
              <div
                className={`text-base font-bold font-mono mt-0.5 ${
                  aggregateStats.totalNetFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {aggregateStats.totalNetFlow >= 0 ? '+' : ''}${aggregateStats.totalNetFlow.toLocaleString()}M
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                <span className="text-emerald-400">{aggregateStats.inflowCount}吸金</span>
                <span>/</span>
                <span className="text-rose-400">{aggregateStats.outflowCount}失血</span>
              </div>
            </div>

            <div className="bg-[#101217] p-2.5 rounded-xl border border-emerald-500/25">
              <div className="text-[10px] text-slate-400">今日头号吸金王</div>
              <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5 flex items-center gap-1">
                <span>{aggregateStats.topInflow?.etfSymbol}</span>
                <span className="text-xs">+{aggregateStats.topInflow?.inflowScore}分</span>
              </div>
              <div className="text-[10px] text-emerald-400 font-mono mt-0.5 truncate">
                +${aggregateStats.topInflow?.netInflowMillion}M ({aggregateStats.topInflow?.changePercent > 0 ? '+' : ''}{aggregateStats.topInflow?.changePercent.toFixed(1)}%)
              </div>
            </div>

            <div className="bg-[#101217] p-2.5 rounded-xl border border-rose-500/25 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-slate-400">最大抛压流出板块</div>
              <div className="text-sm font-bold font-mono text-rose-400 mt-0.5 flex items-center gap-1">
                <span>{aggregateStats.topOutflow?.etfSymbol}</span>
                <span className="text-xs">{aggregateStats.topOutflow?.inflowScore}分</span>
              </div>
              <div className="text-[10px] text-rose-400 font-mono mt-0.5 truncate">
                ${aggregateStats.topOutflow?.netInflowMillion}M ({aggregateStats.topOutflow?.changePercent.toFixed(1)}%)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 模块一：板块ETF资金热力图核心网格 (Sector ETF Money Flow Grid) */}
      <div className="bg-[#14161c] border border-[#262a36] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-emerald-400" />
              板块ETF资金热力矩阵 ({allSectorFlows.length}个核心板块)
            </span>
            <span className="text-xs text-slate-400">
              (点击板块卡片可联动过滤下方关联个股)
            </span>
          </div>

          {/* 排序与控制 (Google Material 3 Filter Chips) */}
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="text-slate-400 text-xs mr-0.5">排序:</span>
            <button
              onClick={() => setSectorSortBy('inflow_score')}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center ${
                sectorSortBy === 'inflow_score'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              吸金评分
            </button>
            <button
              onClick={() => setSectorSortBy('net_amount')}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center ${
                sectorSortBy === 'net_amount'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              净流入额
            </button>
            <button
              onClick={() => setSectorSortBy('rvol')}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center ${
                sectorSortBy === 'rvol'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              成交放量倍数
            </button>
            <button
              onClick={() => setSectorSortBy('momentum')}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center ${
                sectorSortBy === 'momentum'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              涨跌动量
            </button>
          </div>
        </div>

        {/* 热力图卡片网格 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {allSectorFlows.map((flow) => {
            const isSelected = activeEtfFilter === flow.etfSymbol;
            const cardClass = getSectorHeatmapGradient(flow, isSelected);
            const isInflow = flow.inflowScore > 0;
            const isHeavyInflow = flow.inflowScore >= 45;
            const isHeavyOutflow = flow.inflowScore <= -45;

            return (
              <div
                key={flow.etfSymbol}
                onClick={() => {
                  const nextFilter = isSelected ? null : flow.etfSymbol;
                  setActiveEtfFilter(nextFilter);
                  if (onSelectEtf) onSelectEtf(flow.etfSymbol);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${cardClass}`}
              >
                {/* 顶栏: ETF代码与状态微标 */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold font-mono text-white tracking-wide">
                      {flow.etfSymbol}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        flow.changePercent < 0
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {flow.changePercent > 0 ? '+' : ''}{flow.changePercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-300 truncate mt-0.5">
                    {flow.sectorName || flow.etfName.split(' ')[0]}
                  </div>
                </div>

                {/* 中间: 资金流动强度与预估流入额 */}
                <div className="my-2 space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-slate-400">估算净流入</span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        flow.netInflowMillion >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {flow.netInflowMillion >= 0 ? '+' : ''}${flow.netInflowMillion}M
                    </span>
                  </div>

                  {/* 进度计量刻度条 (-100 到 +100 映射为 0% 到 100%) */}
                  <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full transition-all duration-300 ${
                        flow.inflowScore >= 0 ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(8, Math.abs(flow.inflowScore)))}%`,
                        marginLeft: flow.inflowScore < 0 ? 'auto' : '0'
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 pt-0.5">
                    <span>评分 {flow.inflowScore > 0 ? '+' : ''}{flow.inflowScore}</span>
                    <span>量比 {flow.rvol.toFixed(1)}x</span>
                  </div>
                </div>

                {/* 底栏: 状态标签与核心代表股 */}
                <div className="pt-1.5 border-t border-white/10 space-y-1">
                  <div className="text-[10px] font-semibold truncate flex items-center gap-1">
                    {flow.flowStatusLabel}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">
                    代表: {flow.leadingConstituents.slice(0, 3).join(', ')}
                  </div>
                </div>

                {/* 选中指示角标 */}
                {isSelected && (
                  <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                )}
              </div>
            );
          })}
        </div>

        {/* 选中聚焦板块提示 */}
        {activeEtfFilter && (
          <div className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-slate-300">
                已聚焦锁定板块: <strong className="text-white font-mono">{activeEtfFilter}</strong> (
                {allSectorFlows.find((f) => f.etfSymbol === activeEtfFilter)?.sectorName}
                )，下方已自动筛选该板块成分股与高相关性股票的实时买卖压力。
              </span>
            </div>
            <button
              onClick={() => setActiveEtfFilter(null)}
              className="text-[11px] text-blue-300 hover:text-white font-medium underline cursor-pointer"
            >
              清除板块聚焦，显示全部股票
            </button>
          </div>
        )}
      </div>

      {/* 模块二：关联个股实时买卖压力分析 (以红绿高亮显示买卖压力) */}
      <div className="bg-[#14161c] border border-[#262a36] rounded-2xl p-4 space-y-3 shadow-xl">
        {/* 控制与过滤栏 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                关联个股实时买卖压力分析 (红绿高亮)
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                ({filteredStockPressures.length} 只标的)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              根据VWAP成本、量比RVOL、价格跳动与对应板块资金共振，多维度精准量化买盘与卖压。
            </p>
          </div>

          {/* 压力类别筛选按钮组 (Google Material 3 Filter Chips) */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-slate-400 text-xs mr-0.5">买卖压力过滤:</span>
            <button
              onClick={() => setPressureFilter('all')}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center ${
                pressureFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-[#1c202a] text-slate-300 hover:text-white border border-[#2a2f3e]'
              }`}
            >
              全部 ({stockPressures.length})
            </button>
            <button
              onClick={() => setPressureFilter('buy_dominant')}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 justify-center ${
                pressureFilter === 'buy_dominant'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-[#1c202a] text-emerald-400 hover:bg-emerald-950/40 border border-emerald-500/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>多头买盘优势 ({stockPressureCounts.heavyBuy + stockPressureCounts.mildBuy})</span>
            </button>
            <button
              onClick={() => setPressureFilter('sell_dominant')}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 justify-center ${
                pressureFilter === 'sell_dominant'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-[#1c202a] text-rose-400 hover:bg-rose-950/40 border border-rose-500/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>空头卖压沉重 ({stockPressureCounts.heavySell + stockPressureCounts.mildSell})</span>
            </button>
            <button
              onClick={() => setPressureFilter('extreme')}
              className={`h-8 px-3 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 justify-center ${
                pressureFilter === 'extreme'
                  ? 'bg-amber-500 text-neutral-950 shadow-xs'
                  : 'bg-[#1c202a] text-amber-300 hover:text-white border border-amber-500/30'
              }`}
            >
              <span>⚡ 极端失衡 (&gt;68%)</span>
            </button>
          </div>
        </div>

        {/* 压力分布比例条 (Visual Pressure Summary Strip) */}
        <div className="bg-[#101217] p-2.5 rounded-xl border border-[#262a36] space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1 text-emerald-400 font-bold">
              <span>🟢 买方掌控市场: {stockPressureCounts.heavyBuy + stockPressureCounts.mildBuy}只</span>
              <span className="text-slate-500">({Math.round(((stockPressureCounts.heavyBuy + stockPressureCounts.mildBuy) / Math.max(1, stockPressures.length)) * 100)}%)</span>
            </div>
            <div className="text-slate-400 text-[11px] font-sans">
              多空均衡: {stockPressureCounts.balanced}只
            </div>
            <div className="flex items-center gap-1 text-rose-400 font-bold">
              <span>🔴 空方抛压砸盘: {stockPressureCounts.heavySell + stockPressureCounts.mildSell}只</span>
              <span className="text-slate-500">({Math.round(((stockPressureCounts.heavySell + stockPressureCounts.mildSell) / Math.max(1, stockPressures.length)) * 100)}%)</span>
            </div>
          </div>

          {/* 双色对峙横向进度条 */}
          <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{
                width: `${Math.round(((stockPressureCounts.heavyBuy + stockPressureCounts.mildBuy) / Math.max(1, stockPressures.length)) * 100)}%`
              }}
              title="多头买盘占比"
            />
            <div
              className="h-full bg-slate-600 transition-all duration-300"
              style={{
                width: `${Math.round((stockPressureCounts.balanced / Math.max(1, stockPressures.length)) * 100)}%`
              }}
              title="多空均衡"
            />
            <div
              className="h-full bg-rose-500 transition-all duration-300"
              style={{
                width: `${Math.round(((stockPressureCounts.heavySell + stockPressureCounts.mildSell) / Math.max(1, stockPressures.length)) * 100)}%`
              }}
              title="空头卖压占比"
            />
          </div>
        </div>

        {/* 关联个股列表卡片 (以红绿高亮显示买卖压力) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredStockPressures.map((item) => {
            const isBuyDominant = item.buyPressurePercent >= 54;
            const isSellDominant = item.sellPressurePercent >= 54;
            const isHeavyBuy = item.pressureLevel === 'HEAVY_BUY';
            const isHeavySell = item.pressureLevel === 'HEAVY_SELL';

            // 根据红绿高亮规则配置专属高亮卡片样式
            let cardBgBorderClass = 'bg-[#12141a] border-[#262a36]';
            if (isHeavyBuy) {
              cardBgBorderClass = 'bg-gradient-to-br from-emerald-950/40 via-[#101b15] to-[#12141a] border-emerald-500/60 ring-1 ring-emerald-500/40 shadow-emerald-950/30 shadow-md';
            } else if (isBuyDominant) {
              cardBgBorderClass = 'bg-gradient-to-br from-teal-950/30 via-[#0f1816] to-[#12141a] border-teal-500/40 shadow-xs';
            } else if (isHeavySell) {
              cardBgBorderClass = 'bg-gradient-to-br from-rose-950/40 via-[#1c1214] to-[#12141a] border-rose-500/60 ring-1 ring-rose-500/40 shadow-rose-950/30 shadow-md';
            } else if (isSellDominant) {
              cardBgBorderClass = 'bg-gradient-to-br from-amber-950/30 via-[#181310] to-[#12141a] border-amber-500/40 shadow-xs';
            }

            return (
              <div
                key={item.symbol}
                className={`rounded-xl p-3.5 border transition-all hover:scale-[1.01] flex flex-col justify-between space-y-2.5 ${cardBgBorderClass}`}
              >
                {/* 顶栏: 股票代码、名称、现价与涨跌幅 */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => onSelectStock(item.symbol)}
                        className="text-base font-bold font-mono text-white hover:text-blue-400 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>{item.symbol}</span>
                        {isHeavyBuy && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" title="重度买盘抢筹" />
                        )}
                        {isHeavySell && (
                          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" title="沉重空头卖压" />
                        )}
                      </button>
                      <span
                        className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-sans"
                        title={`美股分类: ${item.gicsSectorZh || '标准行业'} · 基准ETF: ${item.mappedEtf}`}
                      >
                        {item.gicsSectorZh ? (item.gicsSectorZh.split(' · ')[1] || item.gicsSectorZh) : item.mappedEtf} · {item.mappedEtf}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 truncate max-w-[140px] mt-0.5">
                      {item.name}
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-white">${item.price.toFixed(2)}</div>
                    <div
                      className={`text-xs font-bold ${
                        item.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {item.changePercent > 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* 核心: 买卖压力比例双色量化槽 (红绿对比) */}
                <div className="space-y-1.5 bg-black/40 p-2.5 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span>🟢 买盘 {item.buyPressurePercent}%</span>
                      {isHeavyBuy && <span className="text-[10px] px-1 py-0.1 bg-emerald-500/20 rounded">控盘</span>}
                    </span>
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      {isHeavySell && <span className="text-[10px] px-1 py-0.1 bg-rose-500/20 rounded">砸盘</span>}
                      <span>卖压 {item.sellPressurePercent}% 🔴</span>
                    </span>
                  </div>

                  {/* 红绿对冲刻度条 */}
                  <div className="w-full h-2 rounded-full bg-neutral-900 overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                      style={{ width: `${item.buyPressurePercent}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-300"
                      style={{ width: `${item.sellPressurePercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                    <span>RSI(6): {item.rsi6.toFixed(1)}</span>
                    <span>量比: {item.rvol.toFixed(1)}x</span>
                    <span>相关性: r={item.correlationR >= 0 ? '+' : ''}{item.correlationR.toFixed(2)}</span>
                  </div>
                </div>

                {/* 状态评析与主力意图 */}
                <div className="text-[11px] text-slate-300 leading-relaxed bg-[#14161c]/60 p-2 rounded-lg border border-white/5">
                  <span className="font-semibold text-white block mb-0.5">{item.pressureLabel}</span>
                  {item.statusSummary}
                </div>

                {/* 操作入口 (Google Material 3 Standard Buttons) */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  {onOpenRadar ? (
                    <button
                      onClick={() => onOpenRadar(item.symbol)}
                      className="h-8 px-3 rounded-full text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/30 hover:bg-cyan-950/60 border border-cyan-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                      title="打开该股多维量化雷达图"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>量化雷达</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">
                      联动: β={(item.correlationR * 1.25).toFixed(2)}
                    </span>
                  )}

                  <button
                    onClick={() => onSelectStock(item.symbol)}
                    className="h-8 px-3 rounded-full text-xs font-semibold text-blue-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>行情与K线</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
