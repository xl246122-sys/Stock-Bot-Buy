/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Sector ETF Correlation Matrix & Oversold Synchronization Radar Panel
 * 美股板块ETF实时相关性矩阵 & 超卖同步量化分析面板
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  Layers,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Zap,
  Info,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Filter,
  BarChart3,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Flame,
  Maximize2,
  X,
  Gauge,
  DollarSign,
  ChevronDown,
  ChevronUp,
  LayoutList,
  Grid,
  ExternalLink
} from 'lucide-react';
import {
  StockQuote,
  QuantSignal,
  MonitoredPosition,
  CorrelationCell,
  SectorCorrelationMatrixData,
  SectorMoneyFlowItem,
  StockPressureMetrics
} from '../types/stock';
import { SectorCorrelationService } from '../services/sectorCorrelationService';
import { SectorEtfService, SECTOR_ETF_REGISTRY, SectorEtfDefinition } from '../services/sectorEtfService';
import { SectorMoneyFlowHeatmap } from './SectorMoneyFlowHeatmap';
import { QuantRadarChart } from './QuantRadarChart';
import { MarketSentimentGauge, calculateMarketSentimentMetrics } from './MarketSentimentGauge';

export interface VolatileAlertAnalysis {
  stock: StockQuote;
  signal?: QuantSignal;
  mappedEtf: SectorEtfDefinition;
  etfChange: number;
  etfPrice: number;
  etfRsi: number;
  stockChange: number;
  stockAmplitude: number; // 日内振幅%
  etfAmplitude: number;
  relativeSpread: number; // stockChange - etfChange (相对偏离)
  correlationR: number;
  beta: number;
  movementType: 'SECTOR_WIDE' | 'STOCK_DECOUPLING' | 'ALPHA_LEADER' | 'SECTOR_DIVERGENCE';
  typeTitle: string;
  typeBadgeColor: string;
  typeBgColor: string;
  verdictSummary: string;
  tacticalGuidance: string;
}

interface SectorCorrelationMatrixPanelProps {
  stocks: StockQuote[];
  positions: MonitoredPosition[];
  signals: QuantSignal[];
  onSelectStock: (symbol: string) => void;
  onOpenAlertDrawer?: () => void;
}

// 预设板块ETF清单，对齐美股标准GICS分类与核心行业ETF
const ALL_ETF_OPTIONS = [
  { symbol: 'SMH', name: '半导体 ETF', desc: '英伟达/台积电/AMD/博通' },
  { symbol: 'XLK', name: '科技 SPDR', desc: '苹果/微软/云软件/AI' },
  { symbol: 'XLC', name: '通信 SPDR', desc: '谷歌/Meta/奈飞/社交媒体' },
  { symbol: 'XLY', name: '可选消费 SPDR', desc: '特斯拉/亚马逊/阿里巴巴/汽车' },
  { symbol: 'XLF', name: '金融 SPDR', desc: '摩根大通/高盛/数字金融科技' },
  { symbol: 'XLV', name: '医疗 SPDR', desc: '礼来/联合健康/创新药研发' },
  { symbol: 'XLI', name: '工业 SPDR', desc: '卡特彼勒/波音/eVTOL低空' },
  { symbol: 'XLP', name: '主要消费 SPDR', desc: '沃尔玛/好市多/日常商超' },
  { symbol: 'XLE', name: '传统能源 SPDR', desc: '埃克森美孚/雪佛龙/油气' },
  { symbol: 'XLRE', name: '房地产 SPDR', desc: '商业地产/REITs/房产平台' },
  { symbol: 'ICLN', name: '清洁能源 ETF', desc: '光伏/储能/氢能电池' },
  { symbol: 'IBIT', name: '数字资产 ETF', desc: '比特币现货/数字加密资产' },
  { symbol: 'SPY', name: '标普500 ETF', desc: '全美500强综合大盘基准' },
  { symbol: 'QQQ', name: '纳斯达克100', desc: '科技与纳斯达克成长风向标' },
];

export const SectorCorrelationMatrixPanel: React.FC<SectorCorrelationMatrixPanelProps> = ({
  stocks,
  positions,
  signals,
  onSelectStock,
  onOpenAlertDrawer,
}) => {
  // 当前激活的视图模式 (矩阵、资金热力图、量化多维雷达、超卖同步雷达、ETF相互交叉)
  const [viewMode, setViewMode] = useState<'matrix' | 'money_flow' | 'quant_radar' | 'sync_radar' | 'cross_etf'>('matrix');

  // 当前在量化雷达面板中聚焦的股票
  const [selectedStockForRadar, setSelectedStockForRadar] = useState<StockQuote | null>(() => stocks[0] || null);

  // 弹窗快速钻取量化雷达的股票 (若非空则显示全功能量化雷达浮层)
  const [radarModalStock, setRadarModalStock] = useState<StockQuote | null>(null);

  // 选中的板块ETF集合 (默认包含核心各大美股行业主力板块)
  const [selectedEtfs, setSelectedEtfs] = useState<string[]>([
    'SMH', 'XLK', 'XLE', 'XLC', 'XLY', 'XLF', 'XLV', 'XLI', 'XLRE', 'ICLN', 'IBIT', 'SPY'
  ]);

  // 股票池筛选范围 (支持全量、大幅震荡预警、恐慌超卖池、狂热超买池、持仓、预警及美股各核心GICS行业板块)
  const [stockFilterPreset, setStockFilterPreset] = useState<
    'all' | 'volatile_alerts' | 'extreme_oversold' | 'extreme_overbought' | 'watchlist' | 'signals' | 'semiconductors' | 'tech' | 'consumer' | 'finance' | 'energy_clean' | 'comm_health' | 'industrial_re' | 'crypto'
  >('all');

  // 选中的大幅震荡预警标的
  const [selectedVolatileSymbol, setSelectedVolatileSymbol] = useState<string | null>(null);
  // 是否展开大幅震荡实时波动对比控制台
  const [isVolatilePanelExpanded, setIsVolatilePanelExpanded] = useState<boolean>(true);

  // 资金热力图中选中的焦点板块ETF（若为null则显示全部板块）
  const [selectedFlowEtf, setSelectedFlowEtf] = useState<string | null>(null);

  // 买卖压力筛选（全部、仅看多头买盘占优、仅看空头抛盘偏重）
  const [pressureFilter, setPressureFilter] = useState<'all' | 'buy_only' | 'sell_only'>('all');

  // 选中的单格详情钻取
  const [selectedCell, setSelectedCell] = useState<CorrelationCell | null>(null);

  // 搜索关键字
  const [searchKeyword, setSearchKeyword] = useState('');

  // 抽屉状态：市场多空情绪深度抽屉 & 大幅震荡脱钩对比抽屉
  const [showSentimentDrawer, setShowSentimentDrawer] = useState<boolean>(false);
  const [showVolatileDrawer, setShowVolatileDrawer] = useState<boolean>(false);

  // 矩阵展示形态：精简卡片流 (移动端原生自适应) vs 完整二维网格大表
  const [matrixViewType, setMatrixViewType] = useState<'card' | 'grid'>('card');

  // 是否展开基准板块ETF配置选择栏
  const [isEtfPickerOpen, setIsEtfPickerOpen] = useState<boolean>(false);

  // 实时市场情绪量化汇总计算 (基于全市场精选股票RSI及价格涨跌广度)
  const sentimentMetrics = useMemo(() => calculateMarketSentimentMetrics(stocks), [stocks]);

  // 预警触发时大幅震荡监控逻辑：自动检测震荡个股并生成与对应板块ETF的实时波动对比
  const volatileAlerts: VolatileAlertAnalysis[] = useMemo(() => {
    const signalMap = new Map<string, QuantSignal>();
    signals.forEach((sig) => signalMap.set(sig.symbol.toUpperCase(), sig));

    const list: VolatileAlertAnalysis[] = [];

    stocks.forEach((stock) => {
      const sym = stock.symbol.toUpperCase();
      const sig = signalMap.get(sym);

      const intradayAmp = stock.price > 0 && stock.high > stock.low
        ? ((stock.high - stock.low) / stock.price) * 100
        : Math.abs(stock.changePercent) * 1.35 + 1.2;

      const isAlerted = !!sig;
      const isExtremeChange = Math.abs(stock.changePercent) >= 2.2;
      const isExtremeRsi = stock.rsi6 <= 32 || stock.rsi6 >= 68;
      const isHighRvol = (stock.rvol || 1.0) >= 1.35;
      const isWideAmplitude = intradayAmp >= 3.0;

      // 判定是否符合“预警触发且出现大幅震荡”
      const isHighVol = (isAlerted && (isExtremeChange || isExtremeRsi || isHighRvol || isWideAmplitude)) ||
                        (isAlerted) ||
                        (isExtremeChange && isWideAmplitude);

      if (!isHighVol) return;

      const mappedDef = SectorEtfService.getEtfForSector(stock.sector, stock.symbol);
      const etfLive = SectorEtfService.etfPriceState.get(mappedDef.etfSymbol) || {
        currentPrice: mappedDef.basePrice,
        changePercent: 0.2,
        rsi6: 50,
      };

      const stockReturns = SectorCorrelationService.getStockReturns(stock);
      const etfReturns = SectorCorrelationService.getEtfReturns(mappedDef.etfSymbol);
      const correlationR = SectorCorrelationService.calculatePearsonCorrelation(stockReturns, etfReturns);
      const beta = SectorCorrelationService.calculateBeta(stockReturns, etfReturns);

      const stockChange = stock.changePercent;
      const etfChange = etfLive.changePercent;
      const relativeSpread = Number((stockChange - etfChange).toFixed(2));
      const etfAmp = mappedDef.sixMonthAvgDailyRange || 1.8;

      // 核心研判判断逻辑：板块性行情 (SECTOR_WIDE) vs 个股孤立异动 (STOCK_DECOUPLING) vs 个股领涨领跑 (ALPHA_LEADER)
      let movementType: 'SECTOR_WIDE' | 'STOCK_DECOUPLING' | 'ALPHA_LEADER' | 'SECTOR_DIVERGENCE' = 'SECTOR_WIDE';
      let typeTitle = '🏛️ 板块系统性行情 · 宏观板块共振';
      let typeBadgeColor = 'text-amber-300 border-amber-500/40 bg-amber-500/15';
      let typeBgColor = 'border-amber-500/30 bg-amber-950/20';
      let verdictSummary = '';
      let tacticalGuidance = '';

      const isSameDirection = (stockChange > 0 && etfChange > 0) || (stockChange < 0 && etfChange < 0);
      const isEtfTurbulent = Math.abs(etfChange) >= 1.0 || (etfLive.rsi6 <= 32 || etfLive.rsi6 >= 68);

      if (stockChange <= -2.2 && etfChange >= -0.8) {
        // 个股急跌脱钩错杀 (ETF平稳，个股深跌)
        movementType = 'STOCK_DECOUPLING';
        typeTitle = '⭐ 个股孤立异动 · 黄金错杀脱钩';
        typeBadgeColor = 'text-emerald-300 border-emerald-500/40 bg-emerald-500/15';
        typeBgColor = 'border-emerald-500/30 bg-emerald-950/20';
        verdictSummary = `对应板块 ${mappedDef.etfSymbol} 走势平稳 (${etfChange >= 0 ? '+' : ''}${etfChange.toFixed(2)}%)，仅 ${stock.symbol} 孤立深跌 ${stockChange.toFixed(2)}%，相对板块超额下脱轨 -${Math.abs(relativeSpread).toFixed(2)}%，未见板块系统性风险传导。`;
        tacticalGuidance = `属于典型的单一个股独立情绪错杀！量化均值回归弹力极高，建议右侧分批建仓抄底，止损严格设于 -2.0% 即可博取相对板块的修复大反弹。`;
      } else if (stockChange >= 2.8 && etfChange <= 1.2) {
        // 个股独立突破领跑
        movementType = 'ALPHA_LEADER';
        typeTitle = '🚀 个股独立领跑 · 强势Alpha突破';
        typeBadgeColor = 'text-cyan-300 border-cyan-500/40 bg-cyan-500/15';
        typeBgColor = 'border-cyan-500/30 bg-cyan-950/20';
        verdictSummary = `${stock.symbol} 涨幅达 +${stockChange.toFixed(2)}%，大幅领先对应 ${mappedDef.etfSymbol} 板块 (${etfChange >= 0 ? '+' : ''}${etfChange.toFixed(2)}%)，相对溢价 +${relativeSpread.toFixed(2)}%，呈现显著个股资金抱团溢出效应。`;
        tacticalGuidance = `属于个股基本面或主力量化扫货带动的独立主升浪！需留意冲高乖离率风险，建议以 VWAP 移动止盈分批保护利润。`;
      } else if (isEtfTurbulent && isSameDirection) {
        // 板块系统性重挫或共振上涨
        movementType = 'SECTOR_WIDE';
        typeTitle = stockChange < 0
          ? '🏛️ 板块系统性重挫 · 泥沙俱下系统风险'
          : '🌊 板块系统性共振 · 全行业顺风主升';
        typeBadgeColor = stockChange < 0
          ? 'text-rose-400 border-rose-500/40 bg-rose-500/15'
          : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/15';
        typeBgColor = stockChange < 0
          ? 'border-rose-500/30 bg-rose-950/20'
          : 'border-emerald-500/30 bg-emerald-950/20';
        verdictSummary = `对应行业板块 ${mappedDef.etfSymbol} 同步剧烈波动 (${etfChange >= 0 ? '+' : ''}${etfChange.toFixed(2)}%，RSI=${etfLive.rsi6.toFixed(1)})，两者的相关系数高达 r=${correlationR.toFixed(2)}，属于全行业宏观系统性行情，非单一个股黑天鹅。`;
        tacticalGuidance = stockChange < 0
          ? `行业系统性受挫，覆巢之下无完卵。切勿盲目单边抄底，应优先等待板块ETF ${mappedDef.etfSymbol} 出现15分钟止跌企稳K线后再行入场。`
          : `跟随板块大势顺风破局，阻力较小，可顺势持股待涨，设好回撤保本单。`;
      } else {
        movementType = 'SECTOR_DIVERGENCE';
        typeTitle = '⚖️ 板块分化对冲 · 宽幅拉锯震荡';
        typeBadgeColor = 'text-amber-300 border-amber-500/40 bg-amber-500/15';
        typeBgColor = 'border-amber-500/30 bg-amber-950/20';
        verdictSummary = `${stock.symbol} 与板块 ${mappedDef.etfSymbol} 波动趋势呈现分化，个股日内振幅达 ${intradayAmp.toFixed(2)}%，多空在此价位激烈换手。`;
        tacticalGuidance = `多空博弈白热化，建议收窄仓位，等待明确放量突破或大单流向确认。`;
      }

      list.push({
        stock,
        signal: sig,
        mappedEtf: mappedDef,
        etfChange,
        etfPrice: etfLive.currentPrice,
        etfRsi: etfLive.rsi6,
        stockChange,
        stockAmplitude: Number(intradayAmp.toFixed(2)),
        etfAmplitude: Number(etfAmp.toFixed(2)),
        relativeSpread,
        correlationR,
        beta,
        movementType,
        typeTitle,
        typeBadgeColor,
        typeBgColor,
        verdictSummary,
        tacticalGuidance,
      });
    });

    return list.sort((a, b) => Math.abs(b.relativeSpread) - Math.abs(a.relativeSpread));
  }, [stocks, signals]);

  const volatileAlertsMap = useMemo(() => {
    const map = new Map<string, VolatileAlertAnalysis>();
    volatileAlerts.forEach((v) => map.set(v.stock.symbol, v));
    return map;
  }, [volatileAlerts]);

  const activeVolatileAlert = useMemo(() => {
    if (selectedVolatileSymbol) {
      const found = volatileAlerts.find((v) => v.stock.symbol === selectedVolatileSymbol);
      if (found) return found;
    }
    return volatileAlerts[0] || null;
  }, [volatileAlerts, selectedVolatileSymbol]);

  // 筛选用于计算矩阵的关注股票集合
  const targetStocks = useMemo(() => {
    let pool: StockQuote[] = [];

    if (stockFilterPreset === 'volatile_alerts') {
      const vSymbols = new Set(volatileAlerts.map((v) => v.stock.symbol));
      pool = stocks.filter((s) => vSymbols.has(s.symbol));
      if (pool.length === 0) pool = stocks.slice(0, 8);
    } else if (stockFilterPreset === 'extreme_oversold') {
      pool = stocks.filter((s) => s.rsi6 <= 30 || s.rsi14 <= 34 || s.changePercent <= -2.5);
      if (pool.length === 0) pool = stocks.slice(0, 8);
    } else if (stockFilterPreset === 'extreme_overbought') {
      pool = stocks.filter((s) => s.rsi6 >= 70 || s.rsi14 >= 68 || s.changePercent >= 2.5);
      if (pool.length === 0) pool = stocks.slice(0, 8);
    } else if (stockFilterPreset === 'watchlist') {
      const positionSymbols = new Set(positions.map((p) => p.symbol));
      pool = stocks.filter((s) => positionSymbols.has(s.symbol));
      if (pool.length === 0) pool = stocks.slice(0, 10);
    } else if (stockFilterPreset === 'signals') {
      const signalSymbols = new Set(signals.map((s) => s.symbol));
      pool = stocks.filter((s) => signalSymbols.has(s.symbol));
      if (pool.length === 0) pool = stocks.slice(0, 10);
    } else if (stockFilterPreset === 'semiconductors') {
      pool = stocks.filter((s) => SectorEtfService.getStockSectorMeta(s.symbol, s.sector).primaryEtf === 'SMH');
    } else if (stockFilterPreset === 'tech') {
      pool = stocks.filter((s) => SectorEtfService.getStockSectorMeta(s.symbol, s.sector).primaryEtf === 'XLK');
    } else if (stockFilterPreset === 'consumer') {
      pool = stocks.filter((s) => SectorEtfService.getStockSectorMeta(s.symbol, s.sector).primaryEtf === 'XLY');
    } else if (stockFilterPreset === 'finance') {
      pool = stocks.filter((s) => SectorEtfService.getStockSectorMeta(s.symbol, s.sector).primaryEtf === 'XLF');
    } else if (stockFilterPreset === 'energy_clean') {
      pool = stocks.filter((s) => ['XLE', 'ICLN'].includes(SectorEtfService.getStockSectorMeta(s.symbol, s.sector).primaryEtf));
    } else if (stockFilterPreset === 'comm_health') {
      pool = stocks.filter((s) => ['XLC', 'XLV'].includes(SectorEtfService.getStockSectorMeta(s.symbol, s.sector).primaryEtf));
    } else if (stockFilterPreset === 'industrial_re') {
      pool = stocks.filter((s) => ['XLI', 'XLRE'].includes(SectorEtfService.getStockSectorMeta(s.symbol, s.sector).primaryEtf));
    } else if (stockFilterPreset === 'crypto') {
      pool = stocks.filter((s) => SectorEtfService.getStockSectorMeta(s.symbol, s.sector).primaryEtf === 'IBIT');
    } else {
      // 综合精选：展示全部关注股票
      pool = stocks;
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      pool = pool.filter((s) => s.symbol.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw));
    }

    return pool;
  }, [stocks, positions, signals, stockFilterPreset, searchKeyword, volatileAlerts]);

  // 实时矩阵数据计算
  const matrixData: SectorCorrelationMatrixData = useMemo(() => {
    return SectorCorrelationService.computeMatrix(selectedEtfs, targetStocks);
  }, [selectedEtfs, targetStocks]);

  // 资金流向板块热力数据计算
  const allSectorFlows: SectorMoneyFlowItem[] = useMemo(() => {
    return SectorCorrelationService.getAllSectorMoneyFlows(selectedEtfs);
  }, [selectedEtfs]);

  // 关联个股的实时买卖压力分析
  const stockPressures: StockPressureMetrics[] = useMemo(() => {
    return targetStocks.map((stock) => {
      const mappedEtfSymbol = SectorEtfService.getEtfForSector(stock.sector, stock.symbol).etfSymbol;
      const matchedFlow = allSectorFlows.find((f) => f.etfSymbol === mappedEtfSymbol);
      return SectorCorrelationService.evaluateStockPressure(stock, matchedFlow);
    });
  }, [targetStocks, allSectorFlows]);

  // 筛选在当前选定ETF下的个股买卖压力列表
  const displayedStockPressures = useMemo(() => {
    let list = stockPressures;
    if (selectedFlowEtf) {
      const constituents = SectorCorrelationService.ETF_CONSTITUENTS_MAP[selectedFlowEtf] || [];
      list = list.filter(
        (sp) => sp.mappedEtf === selectedFlowEtf || constituents.includes(sp.symbol)
      );
    }
    if (pressureFilter === 'buy_only') {
      list = list.filter((sp) => sp.buyPressurePercent >= 52);
    } else if (pressureFilter === 'sell_only') {
      list = list.filter((sp) => sp.sellPressurePercent >= 52);
    }
    return list;
  }, [stockPressures, selectedFlowEtf, pressureFilter]);

  // 资金热力统计汇总
  const moneyFlowStats = useMemo(() => {
    const totalNetFlow = allSectorFlows.reduce((acc, curr) => acc + curr.netInflowMillion, 0);
    const topInflow = [...allSectorFlows].sort((a, b) => b.inflowScore - a.inflowScore)[0];
    const topOutflow = [...allSectorFlows].sort((a, b) => a.inflowScore - b.inflowScore)[0];
    const heavyBuyStocksCount = stockPressures.filter((s) => s.pressureLevel === 'HEAVY_BUY').length;
    const heavySellStocksCount = stockPressures.filter((s) => s.pressureLevel === 'HEAVY_SELL').length;
    return { totalNetFlow, topInflow, topOutflow, heavyBuyStocksCount, heavySellStocksCount };
  }, [allSectorFlows, stockPressures]);

  // 超卖同步统计计数
  const syncStats = useMemo(() => {
    const rankings = matrixData.syncRanking;
    const contagionCount = rankings.filter((r) => r.syncType === 'SECTOR_CONTAGION').length;
    const decouplingCount = rankings.filter((r) => r.syncType === 'ISOLATED_DECOUPLING').length;
    const bullishCount = rankings.filter((r) => r.syncType === 'BULLISH_SUPPORT').length;
    return { contagionCount, decouplingCount, bullishCount };
  }, [matrixData]);

  // 切换ETF勾选状态
  const toggleEtf = (symbol: string) => {
    if (selectedEtfs.includes(symbol)) {
      if (selectedEtfs.length <= 2) return; // 至少保留2个
      setSelectedEtfs(selectedEtfs.filter((s) => s !== symbol));
    } else {
      setSelectedEtfs([...selectedEtfs, symbol]);
    }
  };

  // 根据皮尔逊 r 值获取热力图颜色
  const getCorrelationColor = (r: number) => {
    if (r >= 0.75) return 'bg-emerald-500/35 text-emerald-300 border-emerald-500/40 font-bold';
    if (r >= 0.50) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/25';
    if (r >= 0.25) return 'bg-teal-500/15 text-teal-300 border-teal-500/20';
    if (r >= -0.15 && r < 0.25) return 'bg-slate-800/40 text-slate-400 border-slate-700/30';
    if (r >= -0.45 && r < -0.15) return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
    return 'bg-rose-500/25 text-rose-300 border-rose-500/30 font-bold';
  };

  return (
    <div className="space-y-4 text-slate-100">
      {/* 顶部轻量一体化 HUD 驾驶舱 (高空间利用率 · 移动端首屏秒达核心数据) */}
      <div className="bg-[#141722]/95 backdrop-blur-md border border-[#262c3c] rounded-2xl p-2.5 sm:p-3 relative overflow-hidden shadow-lg">
        {/* 背景光效 */}
        <div className="absolute top-0 right-0 w-80 h-28 bg-gradient-to-bl from-blue-500/15 via-purple-500/10 to-transparent pointer-events-none rounded-full blur-2xl" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 relative z-10">
          {/* 左侧：3大智能微报胶囊 */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {/* 1. 市场做多做空情绪罗盘胶囊 (点击展开抽屉) */}
            <button
              onClick={() => setShowSentimentDrawer(true)}
              className="h-9 px-3 rounded-xl bg-[#1b202e] hover:bg-[#252b3d] border border-[#2f374a] hover:border-blue-400/50 flex items-center gap-2 text-xs transition-all shrink-0 cursor-pointer shadow-xs active:scale-[0.98]"
              title="点击展开全维度市场做多做空情绪罗盘抽屉"
            >
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <Gauge className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-semibold text-slate-300">情绪罗盘:</span>
              <span className="font-bold font-mono text-white">{sentimentMetrics.compositeScore}</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {sentimentMetrics.sentimentLabel}
              </span>
              <span className="text-[10px] text-blue-400 font-sans ml-0.5 font-bold">详情 ↗</span>
            </button>

            {/* 2. 宏观资金流向微报胶囊 */}
            <button
              onClick={() => setViewMode('money_flow')}
              className="h-9 px-3 rounded-xl bg-[#1b202e] hover:bg-[#252b3d] border border-[#2f374a] hover:border-emerald-400/50 flex items-center gap-2 text-xs transition-all shrink-0 cursor-pointer shadow-xs active:scale-[0.98]"
              title="点击切换至资金热力图面板"
            >
              <Flame className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-slate-300">资金净流:</span>
              <span className={`font-bold font-mono ${moneyFlowStats.totalNetFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {moneyFlowStats.totalNetFlow >= 0 ? '+' : ''}${moneyFlowStats.totalNetFlow.toLocaleString()}M
              </span>
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                领涨: {moneyFlowStats.topInflow?.etfSymbol}
              </span>
            </button>

            {/* 3. 预警异动脱钩穿透监控胶囊 */}
            {volatileAlerts.length > 0 ? (
              <button
                onClick={() => setShowVolatileDrawer(true)}
                className="h-9 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 hover:border-amber-400 flex items-center gap-2 text-xs transition-all shrink-0 cursor-pointer shadow-xs active:scale-[0.98]"
                title="点击展开大幅震荡异动与对应板块ETF对比穿透抽屉"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-bold text-amber-300">预警异动:</span>
                <span className="font-mono font-bold text-white">{volatileAlerts.length}只标的</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/25 text-amber-200 border border-amber-400/40">
                  {volatileAlerts[0]?.stock.symbol} {volatileAlerts[0]?.stockChange > 0 ? '+' : ''}{volatileAlerts[0]?.stockChange.toFixed(1)}%
                </span>
                <span className="text-[10px] text-amber-400 font-sans ml-0.5 font-bold">对比 ↗</span>
              </button>
            ) : (
              <div className="h-9 px-3 rounded-xl bg-[#1b202e] border border-[#2f374a] flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>板块运行平稳 · 暂无独立脱钩</span>
              </div>
            )}
          </div>

          {/* 右侧：量化模型标记与更新时间 */}
          <div className="flex items-center justify-between sm:justify-end gap-2 text-[11px] font-mono text-slate-400">
            <span className="hidden md:inline px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
              皮尔逊 r · 贝塔 Beta
            </span>
            <span className="text-slate-500 font-sans">更新: {matrixData.timestamp}</span>
          </div>
        </div>
      </div>

      {/* 视图模式导航栏 (Material 3 Segmented Control) + 卡片/网格切换 */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-none pb-0.5">
        <div className="flex items-center gap-1 bg-[#12151e] p-1 rounded-2xl border border-[#262c3a] shrink-0">
          <button
            onClick={() => setViewMode('matrix')}
            className={`h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'matrix'
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>相关性矩阵</span>
          </button>
          <button
            onClick={() => setViewMode('money_flow')}
            className={`h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'money_flow'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-emerald-400" />
            <span>资金热力图</span>
          </button>
          <button
            onClick={() => setViewMode('quant_radar')}
            className={`h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'quant_radar'
                ? 'bg-cyan-600 text-white shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>量化雷达</span>
          </button>
          <button
            onClick={() => setViewMode('sync_radar')}
            className={`h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'sync_radar'
                ? 'bg-amber-500 text-neutral-950 shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>超卖同步 ({syncStats.contagionCount + syncStats.decouplingCount})</span>
          </button>
          <button
            onClick={() => setViewMode('cross_etf')}
            className={`h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'cross_etf'
                ? 'bg-purple-600 text-white shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>ETF交叉</span>
          </button>
        </div>

        {/* 矩阵模式下的卡片流 vs 大表格切换器 */}
        {viewMode === 'matrix' && (
          <div className="flex items-center gap-1 bg-[#12151e] p-1 rounded-2xl border border-[#262c3a] shrink-0">
            <button
              onClick={() => setMatrixViewType('card')}
              className={`h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                matrixViewType === 'card'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="移动端自适应卡片流"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">精简卡片</span>
            </button>
            <button
              onClick={() => setMatrixViewType('grid')}
              className={`h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                matrixViewType === 'grid'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="完整二维网格大表"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">完整矩阵</span>
            </button>
          </div>
        )}
      </div>

      {/* 控制筛选仓：板块选择器触发器、股票池横向滚动筛选条、搜索框 */}
      <div className="bg-[#14161f] border border-[#262c3a] rounded-2xl p-2.5 space-y-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          {/* 股票池水平筛选条 */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 text-xs">
            {volatileAlerts.length > 0 && (
              <button
                onClick={() => setStockFilterPreset('volatile_alerts')}
                className={`h-7 px-2.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                  stockFilterPreset === 'volatile_alerts'
                    ? 'bg-amber-500 text-neutral-950 shadow-xs'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                }`}
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>异动 ({volatileAlerts.length})</span>
              </button>
            )}
            <button
              onClick={() => setStockFilterPreset('all')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'all'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              全量 ({stocks.length})
            </button>
            <button
              onClick={() => setStockFilterPreset('extreme_oversold')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'extreme_oversold'
                  ? 'bg-rose-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-rose-300 hover:text-white border border-rose-500/30'
              }`}
            >
              恐慌超卖
            </button>
            <button
              onClick={() => setStockFilterPreset('extreme_overbought')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'extreme_overbought'
                  ? 'bg-purple-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-purple-300 hover:text-white border border-purple-500/30'
              }`}
            >
              狂热超买
            </button>
            <button
              onClick={() => setStockFilterPreset('watchlist')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'watchlist'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              持仓 ({positions.length})
            </button>
            <button
              onClick={() => setStockFilterPreset('signals')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'signals'
                  ? 'bg-amber-500 text-neutral-950 font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              预警 ({signals.length})
            </button>
            <button
              onClick={() => setStockFilterPreset('semiconductors')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'semiconductors'
                  ? 'bg-cyan-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              半导体
            </button>
            <button
              onClick={() => setStockFilterPreset('tech')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'tech'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              科技
            </button>
            <button
              onClick={() => setStockFilterPreset('consumer')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'consumer'
                  ? 'bg-pink-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              消费
            </button>
            <button
              onClick={() => setStockFilterPreset('finance')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'finance'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              金融
            </button>
            <button
              onClick={() => setStockFilterPreset('energy_clean')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'energy_clean'
                  ? 'bg-amber-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              能源清洁
            </button>
            <button
              onClick={() => setStockFilterPreset('comm_health')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'comm_health'
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              通信医疗
            </button>
            <button
              onClick={() => setStockFilterPreset('industrial_re')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'industrial_re'
                  ? 'bg-teal-600 text-white font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              工业房产
            </button>
            <button
              onClick={() => setStockFilterPreset('crypto')}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                stockFilterPreset === 'crypto'
                  ? 'bg-orange-500 text-neutral-950 font-bold shadow-xs'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
            >
              数字资产
            </button>
          </div>

          {/* 右侧：板块ETF折叠选择按钮 + 搜索框 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsEtfPickerOpen(!isEtfPickerOpen)}
              className={`h-8 px-2.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                isEtfPickerOpen
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'bg-[#1b1f2b] text-slate-300 hover:text-white border border-[#2a3040]'
              }`}
              title="展开/收起基准板块ETF配置"
            >
              <Filter className="w-3 h-3 text-blue-400" />
              <span>板块ETF ({selectedEtfs.length})</span>
              {isEtfPickerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索代码或名称..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="h-8 bg-[#181b24] border border-[#2a3040] rounded-full pl-7 pr-3 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500 w-36 sm:w-44"
              />
            </div>
          </div>
        </div>

        {/* 可折叠的板块ETF配置区 (仅在展开时显示) */}
        {isEtfPickerOpen && (
          <div className="pt-2 border-t border-[#232838] space-y-2 animate-fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">配置矩阵包含的基准ETF:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSelectedEtfs(['XLK', 'XLE', 'XLF'])}
                  className="px-2 py-0.5 rounded-full bg-[#1b1f2b] hover:bg-[#252b3d] text-blue-300 border border-blue-500/30 text-[11px] cursor-pointer"
                >
                  核心三剑客
                </button>
                <button
                  onClick={() => setSelectedEtfs(['XLK', 'XLE', 'XLF', 'SMH', 'XLY', 'XLV', 'XLI', 'SPY'])}
                  className="px-2 py-0.5 rounded-full bg-[#1b1f2b] hover:bg-[#252b3d] text-slate-300 border border-[#2a3040] text-[11px] cursor-pointer"
                >
                  主力板块
                </button>
                <button
                  onClick={() => setSelectedEtfs(ALL_ETF_OPTIONS.map((e) => e.symbol))}
                  className="px-2 py-0.5 rounded-full bg-[#1b1f2b] hover:bg-[#252b3d] text-slate-300 border border-[#2a3040] text-[11px] cursor-pointer"
                >
                  全选
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ALL_ETF_OPTIONS.map((etf) => {
                const isSelected = selectedEtfs.includes(etf.symbol);
                const liveEtf = matrixData.etfs.find((e) => e.etfSymbol === etf.symbol);
                const change = liveEtf?.changePercent ?? 0;
                return (
                  <button
                    key={etf.symbol}
                    onClick={() => toggleEtf(etf.symbol)}
                    className={`h-7 px-2.5 rounded-full text-xs font-mono transition-all border flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-200 font-bold shadow-xs'
                        : 'bg-[#181b24] border-[#2a3040] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-bold">{etf.symbol}</span>
                    <span className="text-[10px] font-sans text-slate-400">{etf.name.split(' ')[0]}</span>
                    <span className={`text-[10px] font-bold ${change < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {change > 0 ? '+' : ''}{change.toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 紧凑型异动预警跑马条 (仅当检测到大幅震荡时显示极简条目，点击任意展开抽屉) */}
      {volatileAlerts.length > 0 && (
        <div className="bg-[#181512] border border-amber-500/30 rounded-2xl p-2 px-3 flex items-center justify-between gap-2 text-xs overflow-hidden">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="flex items-center gap-1 text-amber-300 font-bold shrink-0">
              <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>实时异动 ({volatileAlerts.length}):</span>
            </span>
            {volatileAlerts.slice(0, 6).map((v) => (
              <button
                key={v.stock.symbol}
                onClick={() => {
                  setSelectedVolatileSymbol(v.stock.symbol);
                  setShowVolatileDrawer(true);
                }}
                className="px-2 py-0.5 rounded-full bg-black/40 hover:bg-black/70 border border-white/10 hover:border-amber-400/50 font-mono text-[11px] shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span className="font-bold text-white">{v.stock.symbol}</span>
                <span className={v.stockChange < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {v.stockChange > 0 ? '+' : ''}{v.stockChange.toFixed(1)}%
                </span>
                <span className="text-slate-500 font-sans text-[10px]">vs {v.mappedEtf.etfSymbol}</span>
                <span className={`text-[9px] px-1 rounded font-sans border ${v.typeBadgeColor}`}>
                  {v.movementType === 'STOCK_DECOUPLING' ? '错杀' : v.movementType === 'ALPHA_LEADER' ? '领跑' : '共振'}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowVolatileDrawer(true)}
            className="px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-1 transition-all"
          >
            <span>穿透对比</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 视图一：板块ETF × 关注个股 实时相关性研判 (Card Feed vs 2D Grid) */}
      {viewMode === 'matrix' && (
        <div className="space-y-3">
          {/* 模式状态说明与快捷图例 */}
          <div className="bg-[#14161f] border border-[#262c3a] rounded-2xl p-2.5 sm:p-3 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                板块ETF vs 关注个股 相关性研判
              </span>
              <span className="text-slate-400 text-[11px] font-mono">
                [关注: {targetStocks.length}只 · 基准ETF: {matrixData.etfs.length}个]
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 border border-blue-500/20 text-blue-300">
                均值 r = {matrixData.avgCorrelation >= 0 ? '+' : ''}{matrixData.avgCorrelation.toFixed(2)}
              </span>
            </div>

            {/* 图例色条 */}
            <div className="flex items-center gap-1 text-[10px] font-mono flex-wrap">
              <span className="text-slate-400 font-sans mr-0.5">图例:</span>
              <span className="px-1.5 py-0.2 rounded bg-rose-500/25 text-rose-300 border border-rose-500/30">负相关 &lt;0</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800/40 text-slate-400 border border-slate-700/30">弱 0~0.3</span>
              <span className="px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-300 border border-teal-500/20">中 0.3~0.5</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 font-bold">强正相关 &gt;0.7</span>
            </div>
          </div>

          {/* 卡片流视图 (Mobile-first Card Feed) */}
          {matrixViewType === 'card' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {targetStocks.map((stock) => {
                const meta = SectorEtfService.getStockSectorMeta(stock.symbol, stock.sector);
                const mappedEtfSymbol = meta.primaryEtf;
                const primaryCell = matrixData.cells.get(`${mappedEtfSymbol}-${stock.symbol}`);
                const vInfo = volatileAlertsMap.get(stock.symbol);
                const isOversold = stock.rsi6 <= 30 || stock.changePercent <= -4.0;

                // 排序获取前 3 个最高相关板块ETF
                const topCorrelatedEtfs = matrixData.etfs
                  .map((e) => ({
                    etf: e.etfSymbol,
                    cell: matrixData.cells.get(`${e.etfSymbol}-${stock.symbol}`),
                  }))
                  .filter((x) => x.cell)
                  .sort((a, b) => (b.cell?.r ?? 0) - (a.cell?.r ?? 0))
                  .slice(0, 3);

                return (
                  <div
                    key={stock.symbol}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                      vInfo
                        ? `${vInfo.typeBgColor} border-l-4 ${
                            vInfo.movementType === 'STOCK_DECOUPLING'
                              ? 'border-l-emerald-400'
                              : vInfo.movementType === 'ALPHA_LEADER'
                              ? 'border-l-cyan-400'
                              : 'border-l-amber-400'
                          }`
                        : 'bg-[#141620] border-[#252b38] hover:border-[#384154]'
                    }`}
                  >
                    {/* 卡片头部：代码、名称、现价、涨跌 */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => onSelectStock(stock.symbol)}
                            className="text-base font-bold font-mono text-white hover:text-blue-400 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>{stock.symbol}</span>
                            {vInfo && (
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" title="大幅震荡预警标的" />
                            )}
                            {isOversold && !vInfo && (
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" title="区间超卖" />
                            )}
                          </button>
                          <span className="text-xs text-slate-400 truncate max-w-[85px] font-sans" title={stock.name}>
                            {stock.name.split(' ')[0]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-sans">
                          <span className="px-1.5 py-0.2 rounded bg-blue-500/15 border border-blue-500/25 text-blue-300 font-mono font-bold">
                            ★ {meta.primaryEtf}
                          </span>
                          <span className="truncate max-w-[110px]">
                            {meta.gicsSectorZh.split(' · ')[1] || meta.gicsSectorZh}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className="text-sm font-bold text-white">${stock.price.toFixed(2)}</div>
                        <div
                          className={`text-xs font-bold ${
                            stock.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    {/* 异动脱钩穿透横条 (若存在) */}
                    {vInfo && (
                      <div
                        onClick={() => {
                          setSelectedVolatileSymbol(stock.symbol);
                          setShowVolatileDrawer(true);
                        }}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center justify-between cursor-pointer transition-all ${vInfo.typeBadgeColor}`}
                      >
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>{vInfo.typeTitle.split(' · ')[1] || vInfo.typeTitle}</span>
                        </span>
                        <span className="font-mono text-[11px] underline">
                          超额偏离 {vInfo.relativeSpread > 0 ? '+' : ''}{vInfo.relativeSpread}% ↗
                        </span>
                      </div>
                    )}

                    {/* 4格核心量化指标条 (主ETF相关性, Beta, 偏离Spread, RSI) */}
                    <div className="grid grid-cols-4 gap-1.5 bg-black/40 p-2 rounded-xl border border-white/5 text-center font-mono text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">相关度 r</div>
                        <div className={`font-bold mt-0.5 ${getCorrelationColor(primaryCell?.r ?? 0)} px-1 rounded`}>
                          {primaryCell ? `${primaryCell.r >= 0 ? '+' : ''}${primaryCell.r.toFixed(2)}` : '--'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">贝塔 β</div>
                        <div className="font-bold text-slate-200 mt-0.5">
                          {primaryCell ? primaryCell.beta.toFixed(2) : '--'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">价差偏离</div>
                        <div className={`font-bold mt-0.5 ${(primaryCell?.rollingSpread ?? 0) < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {primaryCell ? `${primaryCell.rollingSpread > 0 ? '+' : ''}${primaryCell.rollingSpread.toFixed(1)}%` : '--'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">RSI(6)</div>
                        <div className={`font-bold mt-0.5 ${stock.rsi6 <= 28 ? 'text-rose-400 font-bold' : stock.rsi6 >= 72 ? 'text-purple-400 font-bold' : 'text-slate-200'}`}>
                          {stock.rsi6.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    {/* 底部：前3相关板块联动与快捷操作按钮 */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none max-w-[65%]">
                        {topCorrelatedEtfs.map((t) => (
                          <span
                            key={t.etf}
                            onClick={() => {
                              if (t.cell) setSelectedCell(t.cell);
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-slate-300 hover:text-white cursor-pointer transition-colors border border-white/5 shrink-0"
                            title={`点击查看与 ${t.etf} 详情`}
                          >
                            {t.etf}: <strong className="text-blue-300">{t.cell && t.cell.r >= 0 ? '+' : ''}{t.cell?.r.toFixed(2)}</strong>
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            setSelectedStockForRadar(stock);
                            setRadarModalStock(stock);
                          }}
                          className="px-2 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                          title="查看雷达"
                        >
                          <Activity className="w-3 h-3 text-cyan-400" />
                          <span>雷达</span>
                        </button>
                        <button
                          onClick={() => onSelectStock(stock.symbol)}
                          className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-0.5 transition-all cursor-pointer"
                          title="进入K线"
                        >
                          <span>K线</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 完整二维网格大表 (Grid View for Power Users) */}
          {matrixViewType === 'grid' && (
            <div className="bg-[#14161c] border border-[#262a36] rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
                <table className="w-full border-collapse text-xs text-left">
                  <thead className="bg-[#101216] sticky top-0 z-20 border-b border-[#262a36]">
                    <tr>
                      <th className="p-2.5 font-semibold text-slate-300 sticky left-0 bg-[#101216] z-30 min-w-[140px] border-r border-[#262a36]">
                        关注股票 / 指标
                      </th>
                      {matrixData.etfs.map((etf) => (
                        <th key={etf.etfSymbol} className="p-2 text-center min-w-[85px] border-r border-[#222630]">
                          <div className="font-mono font-bold text-white text-xs">{etf.etfSymbol}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[80px] mx-auto font-sans">{etf.sectorName || etf.etfName}</div>
                          <div
                            className={`text-[10px] font-mono font-bold ${
                              etf.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {etf.changePercent > 0 ? '+' : ''}{etf.changePercent.toFixed(1)}%
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e222b]">
                    {targetStocks.map((stock) => {
                      const meta = SectorEtfService.getStockSectorMeta(stock.symbol, stock.sector);
                      const mappedEtfSymbol = meta.primaryEtf;
                      const isOversold = stock.rsi6 <= 30 || stock.changePercent <= -4.0;
                      const vInfo = volatileAlertsMap.get(stock.symbol);

                      return (
                        <tr
                          key={stock.symbol}
                          className={`transition-colors ${
                            vInfo
                              ? `${vInfo.movementType === 'STOCK_DECOUPLING' ? 'bg-emerald-950/20' : vInfo.movementType === 'ALPHA_LEADER' ? 'bg-cyan-950/20' : 'bg-amber-950/20'} border-l-4 ${vInfo.movementType === 'STOCK_DECOUPLING' ? 'border-l-emerald-400' : vInfo.movementType === 'ALPHA_LEADER' ? 'border-l-cyan-400' : 'border-l-amber-400'} hover:bg-white/5`
                              : 'hover:bg-[#1a1d24]/60'
                          }`}
                        >
                          {/* 行首：个股概览与权威美股分类 */}
                          <td className="p-2.5 sticky left-0 bg-[#14161c] z-10 border-r border-[#262a36] font-mono min-w-[135px]">
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => onSelectStock(stock.symbol)}
                                className="font-bold text-white hover:text-blue-400 text-xs flex items-center gap-1 cursor-pointer"
                              >
                                <span>{stock.symbol}</span>
                                {vInfo && (
                                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" title="预警大幅震荡标的" />
                                )}
                                {isOversold && !vInfo && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" title="当前处于超卖区间" />
                                )}
                              </button>
                              <span
                                className={`text-[11px] font-bold ${
                                  stock.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                              <span className="truncate max-w-[65px] font-sans" title={stock.name}>{stock.name.split(' ')[0]}</span>
                              <button
                                onClick={() => {
                                  setSelectedStockForRadar(stock);
                                  setRadarModalStock(stock);
                                }}
                                className="px-1.5 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[9px] font-sans flex items-center gap-0.5 cursor-pointer transition-colors"
                                title={`查看 ${stock.symbol} 量化多维雷达图`}
                              >
                                <Activity className="w-2.5 h-2.5 text-cyan-400" />
                                <span>雷达</span>
                              </button>
                            </div>
                            {/* 预警异动与板块对比徽章 */}
                            {vInfo && (
                              <div className="mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVolatileSymbol(stock.symbol);
                                    setShowVolatileDrawer(true);
                                  }}
                                  className={`w-full text-left px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center justify-between border cursor-pointer transition-colors ${vInfo.typeBadgeColor}`}
                                  title={`点击查看 ${stock.symbol} 与 ${vInfo.mappedEtf.etfSymbol} ETF 实时波动对比`}
                                >
                                  <span className="flex items-center gap-0.5">
                                    <Zap className="w-2.5 h-2.5 text-amber-400" />
                                    <span>{vInfo.movementType === 'STOCK_DECOUPLING' ? '错杀脱钩' : vInfo.movementType === 'ALPHA_LEADER' ? '独立领跑' : '板块共振'}</span>
                                  </span>
                                  <span className="font-mono text-[8px]">{vInfo.relativeSpread > 0 ? '+' : ''}{vInfo.relativeSpread}%</span>
                                </button>
                              </div>
                            )}
                            {/* 美股标准GICS分类与对应主行业ETF */}
                            <div className="flex items-center gap-1 mt-1">
                              <span
                                className="px-1.5 py-0.2 rounded bg-[#1c202c] border border-blue-500/25 text-[9px] text-blue-300 font-sans truncate max-w-[120px]"
                                title={`美股分类: ${meta.gicsSectorZh} (${meta.gicsSectorEn}) · 主关联基准: ${meta.primaryEtf} · ${meta.industryZh}`}
                              >
                                {meta.gicsSectorZh.split(' · ')[1] || meta.gicsSectorZh}
                              </span>
                            </div>
                          </td>

                          {/* 各板块ETF单元格 */}
                          {matrixData.etfs.map((etf) => {
                            const cellKey = `${etf.etfSymbol}-${stock.symbol}`;
                            const cell = matrixData.cells.get(cellKey);
                            if (!cell) return <td key={cellKey} className="p-2 text-center text-slate-600">-</td>;

                            const isMapped = etf.etfSymbol === mappedEtfSymbol;
                            const colorClass = getCorrelationColor(cell.r);
                            const isSync = cell.oversoldSync.syncType === 'SECTOR_CONTAGION';
                            const isDecoupled = cell.oversoldSync.syncType === 'ISOLATED_DECOUPLING';

                            return (
                              <td
                                key={cellKey}
                                onClick={() => {
                                  setSelectedCell(cell);
                                  if (vInfo && isMapped) {
                                    setSelectedVolatileSymbol(stock.symbol);
                                    setShowVolatileDrawer(true);
                                  }
                                }}
                                title={`点击查看 ${stock.symbol} 与 ${etf.etfSymbol} 联动详情 ${isMapped ? `(★ ${meta.gicsSectorZh} 主行业基准)` : ''}`}
                                className={`p-1.5 text-center border-r border-[#222630] cursor-pointer transition-all hover:ring-2 hover:ring-blue-400/50 relative group ${isMapped ? 'bg-blue-950/20' : ''}`}
                              >
                                <div className={`p-1.5 rounded-lg border text-xs font-mono transition-transform group-hover:scale-105 ${colorClass} ${
                                  isMapped && vInfo ? 'ring-2 ring-amber-400 shadow-md shadow-amber-500/20 animate-pulse' : isMapped ? 'ring-1 ring-amber-400/50' : ''
                                }`}>
                                  <div className="flex items-center justify-center gap-0.5">
                                    <span>{cell.r >= 0 ? '+' : ''}{cell.r.toFixed(2)}</span>
                                    {isMapped && (
                                      <span className="text-[9px] text-amber-300 font-bold" title={`★ ${stock.symbol} 所属美股主要基准 ETF (${meta.primaryEtf})`}>★</span>
                                    )}
                                  </div>
                                  <div className="text-[9px] text-slate-400 font-sans flex items-center justify-center gap-1 mt-0.5">
                                    <span>β {cell.beta.toFixed(1)}</span>
                                    {isSync && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="板块超卖同步" />
                                    )}
                                    {isDecoupled && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="个股孤立脱钩错杀" />
                                    )}
                                  </div>
                                  {isMapped && vInfo && (
                                    <div className="text-[8px] font-mono font-bold text-amber-300 mt-0.5 pt-0.5 border-t border-amber-400/30">
                                      偏离 {vInfo.relativeSpread > 0 ? '+' : ''}{vInfo.relativeSpread}%
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 视图二：美股板块资金热力图与关联个股买卖压力红绿高亮分析器 */}
      {viewMode === 'money_flow' && (
        <SectorMoneyFlowHeatmap
          stocks={targetStocks}
          positions={positions}
          selectedEtfs={selectedEtfs}
          onSelectStock={onSelectStock}
          onSelectEtf={(etf) => setSelectedFlowEtf(etf)}
          onOpenRadar={(sym) => {
            const s = stocks.find((x) => x.symbol === sym) || targetStocks.find((x) => x.symbol === sym);
            if (s) {
              setSelectedStockForRadar(s);
              setRadarModalStock(s);
            }
          }}
        />
      )}

      {/* 视图三：选定个股量化多维雷达图 (波动率 · 成交量突变 · RSI相对强弱 · 板块相关性) */}
      {viewMode === 'quant_radar' && (
        <QuantRadarChart
          stock={selectedStockForRadar || targetStocks[0] || stocks[0]}
          allStocks={targetStocks.length > 0 ? targetStocks : stocks}
          onSelectStock={onSelectStock}
          isInline={true}
        />
      )}

      {/* 视图四：超卖同步雷达榜单 (Oversold Synchronization Ranking) */}
      {viewMode === 'sync_radar' && (
        <div className="space-y-3">
          <div className="bg-[#14161c] border border-[#262a36] rounded-2xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  板块超卖同步 vs 孤立脱钩错杀 实时监测雷达
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  自动研判个股急跌是跟随对应板块出现“系统性超卖同步”还是“独立脱钩错杀”，提供差异化量化买入风控与胜率评估。
                </p>
              </div>

              {onOpenAlertDrawer && (
                <button
                  onClick={onOpenAlertDrawer}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>查看实时买入预警抽屉</span>
                </button>
              )}
            </div>

            {/* 榜单网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {matrixData.syncRanking.map((sync, idx) => {
                const stock = stocks.find((s) => s.symbol === sync.correlatedEtf || s.symbol === matrixData.stocks[idx]?.symbol) || matrixData.stocks[idx];
                if (!stock) return null;

                const isContagion = sync.syncType === 'SECTOR_CONTAGION';
                const isDecoupled = sync.syncType === 'ISOLATED_DECOUPLING';

                return (
                  <div
                    key={`${stock.symbol}-${idx}`}
                    className={`rounded-xl p-3.5 border transition-all space-y-2 ${
                      isContagion
                        ? 'bg-[#1b1416] border-rose-500/30 hover:border-rose-500/50'
                        : isDecoupled
                        ? 'bg-[#121c17] border-emerald-500/30 hover:border-emerald-500/50'
                        : 'bg-[#14161c] border-[#262a36]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${sync.badgeColor}`}>
                            {sync.badgeLabel}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            联动度评分 {sync.syncScore}分
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-lg font-bold font-mono text-white">{stock.symbol}</span>
                          <span className="text-xs text-slate-300">{stock.name}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className="text-sm font-bold text-white">${stock.price.toFixed(2)}</div>
                        <div
                          className={`text-xs font-bold ${
                            stock.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    {/* 指标比对条 */}
                    <div className="grid grid-cols-3 gap-1.5 bg-black/40 p-2 rounded-lg text-center font-mono text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">个股 RSI(6)</div>
                        <div className={`font-bold ${stock.rsi6 < 25 ? 'text-rose-400' : 'text-amber-400'}`}>
                          {stock.rsi6.toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">对应板块 {sync.correlatedEtf}</div>
                        <div className={`font-bold ${sync.etfChange < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {sync.etfChange > 0 ? '+' : ''}{sync.etfChange.toFixed(2)}% (RSI {sync.etfRsi.toFixed(1)})
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">相关系数 / Beta</div>
                        <div className="font-bold text-cyan-300">
                          r={sync.correlationR.toFixed(2)} / β={sync.beta.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* 研报分析文本 */}
                    <p className="text-[11px] leading-relaxed text-slate-200">
                      {sync.detailedAnalysis}
                    </p>

                    {/* 实战操作指引 */}
                    {sync.actionGuidance && (
                      <div className="text-[10px] bg-black/30 p-2 rounded-lg border border-white/10 text-slate-300 font-sans flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-white">交易实战策略: </strong>
                          {sync.actionGuidance}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
                      <button
                        onClick={() => onSelectStock(stock.symbol)}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <span>查看该股K线与指标</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 视图三：板块ETF 相互交叉矩阵 (Cross-ETF Matrix) */}
      {viewMode === 'cross_etf' && matrixData.etfCrossMatrix && (
        <div className="bg-[#14161c] border border-[#262a36] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                美股各大板块ETF相互交叉相关性矩阵
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                用于识别板块轮动、资金对冲分化（如科技XLK vs 能源XLE vs 防守公用事业XLU）的宏观结构。
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs text-center font-mono">
              <thead className="bg-[#101216] border-b border-[#262a36]">
                <tr>
                  <th className="p-2.5 text-left text-slate-400 font-sans min-w-[100px] border-r border-[#262a36]">
                    板块ETF
                  </th>
                  {matrixData.etfs.map((e) => (
                    <th key={e.etfSymbol} className="p-2 text-white font-bold min-w-[70px] border-r border-[#222630]">
                      {e.etfSymbol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e222b]">
                {matrixData.etfs.map((e1) => (
                  <tr key={e1.etfSymbol} className="hover:bg-[#1a1d24]/50">
                    <td className="p-2 text-left font-bold text-white border-r border-[#262a36] bg-[#14161c]">
                      {e1.etfSymbol}
                      <span className="text-[10px] text-slate-400 font-sans block">{e1.sectorName || e1.etfName}</span>
                    </td>
                    {matrixData.etfs.map((e2) => {
                      const crossR = matrixData.etfCrossMatrix!.get(`${e1.etfSymbol}-${e2.etfSymbol}`) ?? (e1.etfSymbol === e2.etfSymbol ? 1.0 : 0.65);
                      const color = getCorrelationColor(crossR);
                      return (
                        <td key={`${e1.etfSymbol}-${e2.etfSymbol}`} className="p-1.5 border-r border-[#222630]">
                          <span className={`inline-block px-2 py-1 rounded text-xs ${color}`}>
                            {crossR >= 0 ? '+' : ''}{crossR.toFixed(2)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 单元格钻取详情抽屉/模态框 */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#14161c] border border-neutral-700/80 rounded-2xl max-w-lg w-full p-5 text-neutral-100 shadow-2xl relative space-y-3.5">
            {/* 关闭按钮 */}
            <button
              onClick={() => setSelectedCell(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* 标头 */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 font-mono">
                  量化联动详情钻取
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${selectedCell.oversoldSync.badgeColor}`}>
                  {selectedCell.oversoldSync.badgeLabel}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mt-1 flex items-baseline gap-2">
                <span className="font-mono">{selectedCell.stockSymbol}</span>
                <span className="text-slate-400 text-sm">与</span>
                <span className="font-mono text-cyan-300">{selectedCell.etfSymbol} ETF</span>
              </h3>
            </div>

            {/* 数值指标4格 */}
            <div className="grid grid-cols-4 gap-2 bg-[#0e1014] p-3 rounded-xl border border-neutral-800 text-center font-mono">
              <div>
                <div className="text-[10px] text-slate-400 font-sans">皮尔逊相关性 r</div>
                <div className="text-base font-bold text-emerald-400">
                  {selectedCell.r >= 0 ? '+' : ''}{selectedCell.r.toFixed(3)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-sans">相对Beta系数</div>
                <div className="text-base font-bold text-cyan-300">
                  {selectedCell.beta.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-sans">决定系数 R²</div>
                <div className="text-base font-bold text-purple-300">
                  {selectedCell.rSquared.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-sans">实时价差偏离</div>
                <div className={`text-base font-bold ${selectedCell.rollingSpread < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {selectedCell.rollingSpread > 0 ? '+' : ''}{selectedCell.rollingSpread.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* 深度超卖同步研判结论 */}
            <div className="bg-[#181b22] p-3 rounded-xl border border-neutral-800 space-y-1.5">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>板块超卖同步与传导量化分析结论</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedCell.oversoldSync.detailedAnalysis}
              </p>
            </div>

            {/* 实战操作 */}
            {selectedCell.oversoldSync.actionGuidance && (
              <div className="text-xs bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30 text-slate-200 font-sans">
                💡 <strong className="text-amber-300">操盘风控指引: </strong>
                {selectedCell.oversoldSync.actionGuidance}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                onClick={() => {
                  onSelectStock(selectedCell.stockSymbol);
                  setSelectedCell(null);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1"
              >
                <span>进入该股票图谱与K线</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 独立弹窗：选定个股量化多维雷达图浮层 */}
      {radarModalStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <QuantRadarChart
            stock={radarModalStock}
            allStocks={stocks}
            onSelectStock={(sym) => {
              onSelectStock(sym);
              setRadarModalStock(null);
            }}
            onClose={() => setRadarModalStock(null)}
            isInline={false}
          />
        </div>
      )}

      {/* 底部抽屉 1：市场多空情绪罗盘全功能抽屉 (Bottom Sheet) */}
      {showSentimentDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#12141c] border-t border-[#2d3345] rounded-t-3xl max-w-4xl w-full mx-auto p-3 sm:p-5 text-neutral-100 shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-3 animate-slide-up">
            {/* 顶部拖拽指示条 */}
            <div className="w-12 h-1.5 bg-neutral-600 rounded-full mx-auto mb-1 cursor-grab" />
            
            <MarketSentimentGauge
              stocks={stocks}
              positions={positions}
              signals={signals}
              onSelectStock={(sym) => {
                onSelectStock(sym);
                setShowSentimentDrawer(false);
              }}
              onClose={() => setShowSentimentDrawer(false)}
            />
          </div>
        </div>
      )}

      {/* 底部抽屉 2：大幅震荡预警与板块ETF脱钩深度穿透对比抽屉 (Bottom Sheet) */}
      {showVolatileDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#12141c] border-t border-[#2d3345] rounded-t-3xl max-w-4xl w-full mx-auto p-4 sm:p-5 text-neutral-100 shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-4 animate-slide-up">
            {/* 顶部拖拽条 */}
            <div className="w-12 h-1.5 bg-neutral-600 rounded-full mx-auto cursor-grab" />

            {/* 抽屉头部 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>预警异动与板块脱钩深度穿透</span>
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono">
                  {volatileAlerts.length} 只标的
                </span>
              </div>
              <button
                onClick={() => setShowVolatileDrawer(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="关闭抽屉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 标的快捷切换标签栏 (Horizontal Scroll Chips) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {volatileAlerts.map((v) => {
                const isSelected = activeVolatileAlert?.stock.symbol === v.stock.symbol;
                return (
                  <button
                    key={v.stock.symbol}
                    onClick={() => setSelectedVolatileSymbol(v.stock.symbol)}
                    className={`h-8 px-3 rounded-full border text-xs font-mono transition-all shrink-0 cursor-pointer flex items-center gap-2 ${
                      isSelected
                        ? 'bg-amber-500/25 border-amber-400 text-white font-bold shadow-xs'
                        : 'bg-[#181b24] border-[#292d39] text-slate-300 hover:border-slate-500 hover:bg-[#202430]'
                    }`}
                  >
                    <span className="font-bold text-white">{v.stock.symbol}</span>
                    <span
                      className={`font-bold ${
                        v.stockChange < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {v.stockChange > 0 ? '+' : ''}{v.stockChange.toFixed(1)}%
                    </span>
                    <span className="text-slate-500">vs</span>
                    <span className="text-blue-300 font-sans text-[11px]">{v.mappedEtf.etfSymbol}</span>
                    <span
                      className={`text-[11px] font-bold ${
                        v.etfChange < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {v.etfChange > 0 ? '+' : ''}{v.etfChange.toFixed(1)}%
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-sans border ${v.typeBadgeColor}`}>
                      {v.movementType === 'STOCK_DECOUPLING' ? '错杀脱钩' : v.movementType === 'ALPHA_LEADER' ? '独立领跑' : '板块共振'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 选中的异动标的与对应ETF深度比对看板 */}
            {activeVolatileAlert && (
              <div className={`p-4 rounded-xl border relative z-10 ${activeVolatileAlert.typeBgColor} space-y-3`}>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  {/* 左侧：个股 vs ETF 核心波动指标并列卡片 (占用 5 栏) */}
                  <div className="lg:col-span-5 space-y-2 bg-black/40 p-3 rounded-xl border border-white/10">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-amber-400" />
                        <span>实时波动率 & 偏离度对比</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        相关性 r={activeVolatileAlert.correlationR >= 0 ? '+' : ''}{activeVolatileAlert.correlationR.toFixed(2)} · β={activeVolatileAlert.beta.toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center font-mono">
                      {/* 个股数据 */}
                      <div className="bg-[#151822] p-2.5 rounded-lg border border-white/5 space-y-1">
                        <div className="text-[11px] text-slate-300 font-sans font-semibold flex items-center justify-between">
                          <span>个股 {activeVolatileAlert.stock.symbol}</span>
                          <span className="text-[10px] text-slate-500">${activeVolatileAlert.stock.price.toFixed(2)}</span>
                        </div>
                        <div className={`text-lg font-bold ${activeVolatileAlert.stockChange < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {activeVolatileAlert.stockChange > 0 ? '+' : ''}{activeVolatileAlert.stockChange.toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans space-y-0.5">
                          <div>振幅: <strong className="text-white">{activeVolatileAlert.stockAmplitude}%</strong></div>
                          <div>RSI(6): <strong className={activeVolatileAlert.stock.rsi6 <= 28 ? 'text-rose-400' : 'text-slate-200'}>{activeVolatileAlert.stock.rsi6.toFixed(1)}</strong></div>
                        </div>
                      </div>

                      {/* 板块ETF数据 */}
                      <div className="bg-[#151822] p-2.5 rounded-lg border border-white/5 space-y-1">
                        <div className="text-[11px] text-slate-300 font-sans font-semibold flex items-center justify-between">
                          <span>板块 {activeVolatileAlert.mappedEtf.etfSymbol}</span>
                          <span className="text-[10px] text-slate-500">基准ETF</span>
                        </div>
                        <div className={`text-lg font-bold ${activeVolatileAlert.etfChange < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {activeVolatileAlert.etfChange > 0 ? '+' : ''}{activeVolatileAlert.etfChange.toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans space-y-0.5">
                          <div>振幅: <strong className="text-white">{activeVolatileAlert.etfAmplitude}%</strong></div>
                          <div>RSI(6): <strong className="text-slate-200">{activeVolatileAlert.etfRsi.toFixed(1)}</strong></div>
                        </div>
                      </div>
                    </div>

                    {/* 相对板块偏离度指示条 */}
                    <div className="bg-black/50 p-2 rounded-lg text-xs font-mono flex items-center justify-between">
                      <span className="text-slate-400 font-sans text-[11px]">相对板块超额脱轨偏离:</span>
                      <span className={`font-bold ${activeVolatileAlert.relativeSpread > 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                        {activeVolatileAlert.relativeSpread > 0 ? '+' : ''}{activeVolatileAlert.relativeSpread}%
                      </span>
                    </div>
                  </div>

                  {/* 中间与右侧：智能穿透诊断结论与实战操盘指引 (占用 7 栏) */}
                  <div className="lg:col-span-7 space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border font-mono ${activeVolatileAlert.typeBadgeColor}`}>
                        {activeVolatileAlert.typeTitle}
                      </span>
                      <span className="text-xs text-slate-300 font-sans">
                        所属美股行业: <strong className="text-white">{activeVolatileAlert.mappedEtf.etfName.split(' ')[0]}</strong>
                      </span>
                    </div>

                    {/* 核心研判文本 */}
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5 space-y-1.5">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>板块性行情 vs 个股异动 穿透研判结论</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">
                        {activeVolatileAlert.verdictSummary}
                      </p>
                    </div>

                    {/* 操盘决策指引 */}
                    <div className="text-xs bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30 text-slate-200 font-sans">
                      💡 <strong className="text-amber-300">实操决策与风控: </strong>
                      {activeVolatileAlert.tacticalGuidance}
                    </div>

                    {/* 快捷操作动作条 */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        onClick={() => {
                          setSelectedStockForRadar(activeVolatileAlert.stock);
                          setRadarModalStock(activeVolatileAlert.stock);
                          setShowVolatileDrawer(false);
                        }}
                        className="h-9 px-4 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        title="打开该股量化多维雷达图与时间轴对比"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>打开量化雷达 (时间轴对比)</span>
                      </button>

                      <button
                        onClick={() => {
                          onSelectStock(activeVolatileAlert.stock.symbol);
                          setShowVolatileDrawer(false);
                        }}
                        className="h-9 px-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <span>进入该股K线与指标</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
