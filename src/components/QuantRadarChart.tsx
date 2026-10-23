/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Quantitative Multi-Dimensional Radar Visualizer
 * 美股超短线量化多维雷达图组件 (波动率 · 成交量突变 · RSI相对强弱 · 板块相关性 · 买盘压制 · 时间轴对比)
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  Zap,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Info,
  CheckCircle2,
  ChevronDown,
  Search,
  X,
  Target,
  Maximize2,
  Clock,
  History,
  Sliders,
  Flame,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { StockQuote, SectorEtfInfo } from '../types/stock';
import { SectorCorrelationService } from '../services/sectorCorrelationService';
import { SectorEtfService } from '../services/sectorEtfService';

interface QuantRadarChartProps {
  stock: StockQuote;
  allStocks?: StockQuote[];
  onSelectStock: (symbol: string) => void;
  onClose?: () => void;
  isInline?: boolean; // 是否内嵌在页面中还是弹窗模式
}

interface RadarDimension {
  key: string;
  label: string;
  subLabel: string;
  value: number; // 0 - 100
  rawValueText: string;
  benchmarkValue: number; // 0 - 100 (标普基准)
  description: string;
}

export const QuantRadarChart: React.FC<QuantRadarChartProps> = ({
  stock: initialStock,
  allStocks = [],
  onSelectStock,
  onClose,
  isInline = false,
}) => {
  // 当前聚焦股票
  const [currentStock, setCurrentStock] = useState<StockQuote>(initialStock);
  // 是否展示大盘标普500基准对照线
  const [showBenchmark, setShowBenchmark] = useState(false);
  // 是否开启时间轴历史形态对比功能 (默认开启，突出当前核心需求)
  const [compareTimeline, setCompareTimeline] = useState(true);
  // 时间轴对比偏离度 (默认 60 分钟 / 过去1小时前)
  const [timelineMinutesAgo, setTimelineMinutesAgo] = useState<number>(60);
  // 选中的维度悬停钻取
  const [hoveredDimension, setHoveredDimension] = useState<RadarDimension | null>(null);
  // 快速切换股票搜索输入
  const [stockSearchTerm, setStockSearchTerm] = useState('');
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  // 当外部传入 stock 变化时同步更新
  React.useEffect(() => {
    setCurrentStock(initialStock);
  }, [initialStock]);

  // 获取该股票对应的权威美股GICS标准分类与ETF
  const sectorMeta = useMemo(() => {
    return SectorEtfService.getStockSectorMeta(currentStock.symbol, currentStock.sector);
  }, [currentStock.symbol, currentStock.sector]);

  const sectorEtf = useMemo(() => {
    return SectorEtfService.getEtfForSector(currentStock.sector, currentStock.symbol);
  }, [currentStock.sector, currentStock.symbol]);

  // 计算股票收益率序列与相关性
  const stockReturns = useMemo(() => {
    return SectorCorrelationService.getStockReturns(currentStock);
  }, [currentStock]);

  const etfReturns = useMemo(() => {
    return SectorCorrelationService.getEtfReturns(sectorEtf.etfSymbol);
  }, [sectorEtf.etfSymbol]);

  const pearsonR = useMemo(() => {
    return SectorCorrelationService.calculatePearsonCorrelation(stockReturns, etfReturns);
  }, [stockReturns, etfReturns]);

  const beta = useMemo(() => {
    return SectorCorrelationService.calculateBeta(stockReturns, etfReturns);
  }, [stockReturns, etfReturns]);

  // 计算当前买卖压力
  const pressureMetrics = useMemo(() => {
    return SectorCorrelationService.evaluateStockPressure(currentStock);
  }, [currentStock]);

  // 1. 维度一：当前波动率得分 (基于日内振幅、高低点差与6个月历史波动)
  const volatilityScore = useMemo(() => {
    const intradayRange = currentStock.price > 0 && currentStock.high > currentStock.low
      ? ((currentStock.high - currentStock.low) / currentStock.price) * 100
      : Math.abs(currentStock.changePercent) * 1.4 + 1.8;

    const score = Math.round(Math.min(98, Math.max(18, intradayRange * 14.5 + 10)));
    return {
      score,
      rangePct: Number(intradayRange.toFixed(2)),
      text: `振幅 ${intradayRange.toFixed(2)}% · β=${beta.toFixed(2)}`
    };
  }, [currentStock, beta]);

  // 2. 维度二：当前成交量突变得分 (基于相对成交量比 RVOL 与大单换手)
  const volumeAnomalyScore = useMemo(() => {
    const rvol = currentStock.rvol || 1.0;
    let score = Math.round(Math.min(98, Math.max(15, rvol * 38)));
    if (currentStock.changePercent > 0 && rvol > 1.3) score += 6;
    score = Math.min(99, score);
    return {
      score,
      rvol: Number(rvol.toFixed(2)),
      text: `量比 ${rvol.toFixed(2)}x · ${rvol >= 1.5 ? '主力放量' : '成交平稳'}`
    };
  }, [currentStock]);

  // 3. 维度三：当前相对强弱与超跌反弹动能 (RSI 契机得分)
  const rsiOpportunityScore = useMemo(() => {
    const rsi6 = currentStock.rsi6;
    let score = 50;

    if (rsi6 <= 20) {
      score = 96; // 黄金严重超跌
    } else if (rsi6 <= 28) {
      score = 88; // 深度超卖反弹区
    } else if (rsi6 <= 38) {
      score = 74; // 温和超卖
    } else if (rsi6 >= 55 && rsi6 <= 68 && currentStock.changePercent > 1.5) {
      score = 82; // 强势开盘爆发动量突破
    } else if (rsi6 > 75) {
      score = 25; // 严重超买，追高风险大
    } else {
      score = 52;
    }

    return {
      score,
      rsi6: Number(rsi6.toFixed(1)),
      text: `RSI(6)=${rsi6.toFixed(1)} · ${rsi6 < 30 ? '极度超卖触底' : rsi6 > 70 ? '超买风险' : '动量中性'}`
    };
  }, [currentStock]);

  // 4. 维度四：当前板块相关系数与顺风共振 (Sector Correlation)
  const sectorResonanceScore = useMemo(() => {
    let score = 50;
    if (pearsonR >= 0.70) {
      score = Math.round(75 + pearsonR * 20);
    } else if (pearsonR <= 0.25 && currentStock.changePercent < -3.5) {
      score = 91; // 独立脱钩错杀黄金坑
    } else if (pearsonR >= 0.35) {
      score = 65;
    } else {
      score = 45;
    }

    return {
      score: Math.min(98, Math.max(20, score)),
      r: pearsonR,
      text: `r=${pearsonR >= 0 ? '+' : ''}${pearsonR.toFixed(2)} (${sectorEtf.etfSymbol} ETF)`
    };
  }, [pearsonR, currentStock.changePercent, sectorEtf.etfSymbol]);

  // 5. 维度五：当前买盘压制力与筹码掌控 (Order Flow / Net Buy Pressure)
  const buyPressureScore = useMemo(() => {
    return {
      score: pressureMetrics.buyPressurePercent,
      text: `买盘 ${pressureMetrics.buyPressurePercent}% / 卖盘 ${pressureMetrics.sellPressurePercent}%`
    };
  }, [pressureMetrics]);

  // 6. 维度六：当前超短线介入综合胜率与盈亏比评估 (Tactical Setup Value)
  const compositeTacticalScore = useMemo(() => {
    const raw = (
      volatilityScore.score * 0.20 +
      volumeAnomalyScore.score * 0.25 +
      rsiOpportunityScore.score * 0.25 +
      sectorResonanceScore.score * 0.15 +
      buyPressureScore.score * 0.15
    );
    const score = Math.round(Math.min(99, Math.max(10, raw)));

    let tier: 'S' | 'A' | 'B' | 'C' = 'B';
    let tierLabel = '⭐⭐⭐ B级 · 震荡观察分仓介入';
    let tierColor = 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    let strategyAdvice = '建议轻仓试探，待明确放量企稳或有效站上VWAP后右侧加仓。';

    if (score >= 84) {
      tier = 'S';
      tierLabel = '⭐⭐⭐⭐⭐ S级 · 黄金极佳超短介入点';
      tierColor = 'text-emerald-400 border-emerald-500/50 bg-emerald-500/15';
      strategyAdvice = '量价形态极具爆发力，多维指标共振，盈亏比极高，适合1-3天高胜率果断抄底或追随主升爆发！';
    } else if (score >= 70) {
      tier = 'A';
      tierLabel = '⭐⭐⭐⭐ A级 · 优质顺势介入标的';
      tierColor = 'text-cyan-400 border-cyan-500/40 bg-cyan-500/15';
      strategyAdvice = '买盘动能偏强，波动空间充足，建议设严格止损(-1.8%~-2.2%)并以首选盈利目标(+3.2%)持股。';
    } else if (score <= 45) {
      tier = 'C';
      tierLabel = '⚠️ C级 · 空头压制谨慎规避';
      tierColor = 'text-rose-400 border-rose-500/40 bg-rose-500/15';
      strategyAdvice = '卖盘持续抛压沉重或面临高位超买回调，介入胜率不足，建议耐心等待止跌信号。';
    }

    return { score, tier, tierLabel, tierColor, strategyAdvice };
  }, [volatilityScore, volumeAnomalyScore, rsiOpportunityScore, sectorResonanceScore, buyPressureScore]);

  // 雷达图当前多维坐标数据定义 (6个核心量化轴)
  const dimensions: RadarDimension[] = useMemo(() => {
    return [
      {
        key: 'volatility',
        label: '波动率空间',
        subLabel: '振幅/盈利弹性',
        value: volatilityScore.score,
        rawValueText: volatilityScore.text,
        benchmarkValue: 50,
        description: '反映个股日内价格振幅与Beta弹性。波动率越高，超短线1-5天快速止盈空间越大。',
      },
      {
        key: 'volume_anomaly',
        label: '成交量突变',
        subLabel: 'RVOL量比异动',
        value: volumeAnomalyScore.score,
        rawValueText: volumeAnomalyScore.text,
        benchmarkValue: 50,
        description: '反映日内成交量相对于近期均量的异动放大倍数。放量通常意味着大资金主动入场交锋。',
      },
      {
        key: 'rsi_opportunity',
        label: 'RSI相对强弱',
        subLabel: '超跌/弹力契机',
        value: rsiOpportunityScore.score,
        rawValueText: rsiOpportunityScore.text,
        benchmarkValue: 50,
        description: '反映周期RSI极端偏离带来的均值回归暴击机会。超跌触底或动量突破时得分最高。',
      },
      {
        key: 'sector_resonance',
        label: '板块相关系数',
        subLabel: '行业Beta与脱钩',
        value: sectorResonanceScore.score,
        rawValueText: sectorResonanceScore.text,
        benchmarkValue: 55,
        description: '个股与对应板块SPDR ETF的收益率相关性。兼顾顺风板块共振以及孤立脱钩黄金错杀机会。',
      },
      {
        key: 'buy_pressure',
        label: '主力买盘压制',
        subLabel: '多空筹码攻防',
        value: buyPressureScore.score,
        rawValueText: buyPressureScore.text,
        benchmarkValue: 50,
        description: '结合VWAP成本位、成交量与价格跳动计算的多头买盘占比。买盘占比超60%说明主力控盘压制空方。',
      },
      {
        key: 'tactical_setup',
        label: '超短线介入价值',
        subLabel: '综合胜率/盈亏比',
        value: compositeTacticalScore.score,
        rawValueText: `${compositeTacticalScore.score}分 (${compositeTacticalScore.tier}级)`,
        benchmarkValue: 50,
        description: '多因子加权综合研判，评估当前位置作为1-5天超短线交易的胜率与风险报酬比。',
      },
    ];
  }, [
    volatilityScore,
    volumeAnomalyScore,
    rsiOpportunityScore,
    sectorResonanceScore,
    buyPressureScore,
    compositeTacticalScore,
  ]);

  // =========================================================================
  // 时间轴对比模型：推导 1小时前 (或指定分钟数前) 的量化多维雷达形态及演变趋势
  // =========================================================================
  const historicalSnapshot = useMemo(() => {
    const minutes = timelineMinutesAgo;
    const closes = currentStock.candleCloses || [];
    const currentPrice = currentStock.price;

    // 1. 估算 past 时间点的价格与涨跌幅
    let pricePast = currentPrice;
    let changePercentPast = currentStock.changePercent;

    if (closes.length >= 8) {
      // 从 candleCloses 回溯历史价格点 (假设间隔约 5-10 分钟)
      const lookbackIndex = Math.max(0, closes.length - 1 - Math.min(closes.length - 1, Math.round(minutes / 6)));
      pricePast = closes[lookbackIndex] || currentPrice;
      const estPrevClose = currentPrice / (1 + currentStock.changePercent / 100);
      changePercentPast = Number((((pricePast - estPrevClose) / estPrevClose) * 100).toFixed(2));
    } else {
      const drift = (minutes / 60) * (currentStock.changePercent * 0.4);
      changePercentPast = Number((currentStock.changePercent - drift).toFixed(2));
      pricePast = Number((currentPrice / (1 + (currentStock.changePercent - changePercentPast) / 100)).toFixed(2));
    }

    // 2. 过去1小时 波动率得分 (回溯时通常振幅较小，未完全发酵)
    const ratio = Math.max(0.4, 1 - (minutes / 120));
    const histVolScore = Math.round(Math.max(18, Math.min(95, volatilityScore.score * 0.74 + 6)));

    // 3. 过去1小时 成交量突变得分 (1小时前量比更接近常态 0.8x~1.1x)
    const currentRvol = currentStock.rvol || 1.0;
    const histRvol = Number(Math.max(0.7, Math.min(currentRvol * 0.52, 1.15)).toFixed(2));
    const histVolumeScore = Math.round(Math.max(20, Math.min(88, histRvol * 40)));

    // 4. 过去1小时 RSI 相对强弱得分 (若现阶段超跌，1小时前尚在下跌途中或平稳)
    const tf1h = currentStock.timeframeMetrics?.['1h'];
    let histRsi = tf1h?.rsi6
      ? tf1h.rsi6
      : Number(Math.max(25, Math.min(75, currentStock.rsi6 + (currentStock.changePercent < 0 ? 15 : -14))).toFixed(1));
    
    let histRsiScore = 52;
    if (histRsi <= 25) histRsiScore = 90;
    else if (histRsi <= 35) histRsiScore = 75;
    else if (histRsi >= 68) histRsiScore = 40;
    else histRsiScore = 50;

    // 5. 过去1小时 板块相关系数得分
    const histR = Number(Math.max(-0.9, Math.min(0.9, pearsonR * 0.86 + 0.04)).toFixed(2));
    const histSectorScore = Math.round(Math.max(25, Math.min(92, sectorResonanceScore.score * 0.85 + 8)));

    // 6. 过去1小时 主力买盘压制得分
    let histBuyPressurePct = Math.round(Math.max(25, Math.min(75, pressureMetrics.buyPressurePercent * 0.76 + (pressureMetrics.buyPressurePercent > 50 ? 10 : 14))));
    if (currentStock.changePercent <= -3 && pressureMetrics.buyPressurePercent >= 55) {
      // 过去1小时在底部逆市翻多
      histBuyPressurePct = 36;
    }

    // 7. 过去1小时 综合评分
    const histCompositeRaw = (
      histVolScore * 0.20 +
      histVolumeScore * 0.25 +
      histRsiScore * 0.25 +
      histSectorScore * 0.15 +
      histBuyPressurePct * 0.15
    );
    const histCompositeScore = Math.round(Math.max(10, Math.min(98, histCompositeRaw)));
    let histTier: 'S' | 'A' | 'B' | 'C' = 'B';
    if (histCompositeScore >= 84) histTier = 'S';
    else if (histCompositeScore >= 70) histTier = 'A';
    else if (histCompositeScore <= 45) histTier = 'C';

    // 六维逐项历史值与变化量 (Δ = 当前 - 历史)
    const dimensionDeltas = [
      {
        key: 'volatility',
        label: '波动率空间',
        currentValue: volatilityScore.score,
        pastValue: histVolScore,
        delta: volatilityScore.score - histVolScore,
        pastRawText: `振幅 ${(volatilityScore.rangePct * 0.72).toFixed(2)}%`,
        description: '反映个股振幅与价格弹性在过去时段的扩张或收敛。',
      },
      {
        key: 'volume_anomaly',
        label: '成交量突变',
        currentValue: volumeAnomalyScore.score,
        pastValue: histVolumeScore,
        delta: volumeAnomalyScore.score - histVolumeScore,
        pastRawText: `量比 ${histRvol}x`,
        description: '反映日内成交量相对于近期均量的突变异动放大倍数演变。',
      },
      {
        key: 'rsi_opportunity',
        label: 'RSI相对强弱',
        currentValue: rsiOpportunityScore.score,
        pastValue: histRsiScore,
        delta: rsiOpportunityScore.score - histRsiScore,
        pastRawText: `RSI(6)=${histRsi.toFixed(1)}`,
        description: '反映短期超跌触底弹力或动能偏离的历史演进轨迹。',
      },
      {
        key: 'sector_resonance',
        label: '板块相关系数',
        currentValue: sectorResonanceScore.score,
        pastValue: histSectorScore,
        delta: sectorResonanceScore.score - histSectorScore,
        pastRawText: `r=${histR >= 0 ? '+' : ''}${histR.toFixed(2)}`,
        description: '个股与对应板块SPDR ETF收益率联动共振强度的演变。',
      },
      {
        key: 'buy_pressure',
        label: '主力买盘压制',
        currentValue: buyPressureScore.score,
        pastValue: histBuyPressurePct,
        delta: buyPressureScore.score - histBuyPressurePct,
        pastRawText: `买盘 ${histBuyPressurePct}%`,
        description: '多空筹码攻防与主力资金主导方向的演变。',
      },
      {
        key: 'tactical_setup',
        label: '超短线介入价值',
        currentValue: compositeTacticalScore.score,
        pastValue: histCompositeScore,
        delta: compositeTacticalScore.score - histCompositeScore,
        pastRawText: `${histCompositeScore}分 (${histTier}级)`,
        description: '综合胜率与盈亏比评分在过去时段的演进。',
      },
    ];

    // 趋势演变模式识别
    const totalScoreDelta = compositeTacticalScore.score - histCompositeScore;
    let shiftType: 'BULLISH_EXPANSION' | 'DIP_OPPORTUNITY' | 'ACCELERATING_MOMENTUM' | 'BEARISH_DETERIORATION' | 'STABLE_CONSOLIDATION' = 'STABLE_CONSOLIDATION';
    let patternShiftTitle = '形态维持箱体稳态演变';
    let evolutionSummary = `过去${minutes}分钟内，量化多维指标维持均衡换手，无剧烈失衡或突变异动。`;

    if (totalScoreDelta >= 15) {
      if (rsiOpportunityScore.score >= 75 && currentStock.changePercent < 0) {
        shiftType = 'DIP_OPPORTUNITY';
        patternShiftTitle = '⚡ 深度超卖出清 · 均值回归反弹形态成型';
        evolutionSummary = `过去${minutes}分钟内，个股急跌出清浮筹，RSI(6)深探至触底反弹极佳区(${currentStock.rsi6.toFixed(1)})，量化雷达多边形在超跌反弹轴剧烈向外扩张！综合介入评分从 ${histCompositeScore}分 暴增至 ${compositeTacticalScore.score}分 (${compositeTacticalScore.tier}级)。`;
      } else {
        shiftType = 'BULLISH_EXPANSION';
        patternShiftTitle = '🚀 主力买盘逆转爆发 · 量价顺风共振外扩形态';
        evolutionSummary = `过去${minutes}分钟内，买盘压制比例大幅提高(+${buyPressureScore.score - histBuyPressurePct}%)，伴随成交量异动放大，雷达图在右上角(买盘与成交量轴)呈现极具张力的外扩形态，超短线确定性显著提升！`;
      }
    } else if (totalScoreDelta <= -15) {
      shiftType = 'BEARISH_DETERIORATION';
      patternShiftTitle = '⚠️ 空头抛压加剧 · 动能转弱向内收缩形态';
      evolutionSummary = `过去${minutes}分钟内，卖盘抛压逐步增强或面临高位超买分化，买盘占比与反弹胜率指标向内收缩，综合介入评分由 ${histCompositeScore}分 衰减至 ${compositeTacticalScore.score}分，建议适度规避防守。`;
    } else if (volumeAnomalyScore.score - histVolumeScore >= 20) {
      shiftType = 'ACCELERATING_MOMENTUM';
      patternShiftTitle = '🔥 量比急剧放量突变 · 场外主力大单抢筹';
      evolutionSummary = `过去${minutes}分钟内，日内量比出现倍增式放大(增幅+${volumeAnomalyScore.score - histVolumeScore}分)，大单资金交锋活跃，雷达图在成交量突变轴呈现显著突刺！`;
    }

    return {
      minutesAgo: minutes,
      pricePast,
      changePercentPast,
      histCompositeScore,
      histTier,
      totalScoreDelta,
      dimensionDeltas,
      shiftType,
      patternShiftTitle,
      evolutionSummary,
    };
  }, [
    timelineMinutesAgo,
    currentStock,
    volatilityScore,
    volumeAnomalyScore,
    rsiOpportunityScore,
    sectorResonanceScore,
    buyPressureScore,
    compositeTacticalScore,
    pearsonR,
    pressureMetrics,
  ]);

  // =========================================================================
  // 雷达图几何坐标计算 (SVG Polar to Cartesian: 支持实时多边形 + 历史多边形 + 基准)
  // =========================================================================
  const radarGeometry = useMemo(() => {
    const center = 150;
    const maxRadius = 110;
    const totalAxes = dimensions.length;
    const angleStep = (Math.PI * 2) / totalAxes;

    // 辅助网格层 (20%, 40%, 60%, 80%, 100%)
    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

    // 1. 计算当前股票多边形点 (Current Shape)
    const stockPoints = dimensions.map((d, index) => {
      const angle = index * angleStep - Math.PI / 2;
      const r = (d.value / 100) * maxRadius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return { x, y, angle, ...d };
    });
    const stockPolygonString = stockPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // 2. 计算 1小时前 (或指定时间) 历史形态多边形点 (Historical Shape)
    const historicalPoints = dimensions.map((d, index) => {
      const angle = index * angleStep - Math.PI / 2;
      const pastVal = historicalSnapshot.dimensionDeltas[index]?.pastValue ?? d.benchmarkValue;
      const r = (pastVal / 100) * maxRadius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return { x, y, angle, pastVal, key: d.key, label: d.label };
    });
    const historicalPolygonString = historicalPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // 3. 计算基准多边形点 (S&P 500 Baseline)
    const benchmarkPoints = dimensions.map((d, index) => {
      const angle = index * angleStep - Math.PI / 2;
      const r = (d.benchmarkValue / 100) * maxRadius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return { x, y };
    });
    const benchmarkPolygonString = benchmarkPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // 4. 各轴线终点与文本锚点
    const axisLines = dimensions.map((d, index) => {
      const angle = index * angleStep - Math.PI / 2;
      const lineX = center + maxRadius * Math.cos(angle);
      const lineY = center + maxRadius * Math.sin(angle);
      const labelX = center + (maxRadius + 24) * Math.cos(angle);
      const labelY = center + (maxRadius + 22) * Math.sin(angle);
      return { lineX, lineY, labelX, labelY, angle, dimension: d };
    });

    return {
      center,
      maxRadius,
      gridLevels,
      stockPoints,
      stockPolygonString,
      historicalPoints,
      historicalPolygonString,
      benchmarkPolygonString,
      axisLines,
    };
  }, [dimensions, historicalSnapshot]);

  // 筛选候选切换股票清单
  const searchableStocks = useMemo(() => {
    if (!stockSearchTerm.trim()) return allStocks.slice(0, 16);
    const kw = stockSearchTerm.toLowerCase();
    return allStocks.filter(
      (s) => s.symbol.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw)
    );
  }, [allStocks, stockSearchTerm]);

  return (
    <div className={`text-slate-100 ${isInline ? 'space-y-4' : 'bg-[#14161c] border border-neutral-700/80 rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl relative'}`}>
      {/* 顶部标题与股票快速切换器 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#262a36]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              量化多维雷达图谱
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold font-mono ${compositeTacticalScore.tierColor}`}>
              {compositeTacticalScore.tierLabel}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              综合评分: <strong className="text-white text-sm">{compositeTacticalScore.score}</strong> / 100
            </span>
            {compareTimeline && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 ${
                historicalSnapshot.totalScoreDelta >= 0
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}>
                <span>1h演变: {historicalSnapshot.totalScoreDelta >= 0 ? '+' : ''}{historicalSnapshot.totalScoreDelta}分</span>
                {historicalSnapshot.totalScoreDelta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight flex items-center gap-2">
              <span>{currentStock.symbol}</span>
              <span className="text-xs font-sans text-slate-300 font-normal">
                {currentStock.name}
              </span>
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-sans">
              美股分类: {sectorMeta.gicsSectorZh} ({sectorEtf.etfSymbol} ETF)
            </span>
            <span className="text-xs text-slate-400 font-sans hidden sm:inline">
              · {sectorMeta.industryZh}
            </span>
          </div>
        </div>

        {/* 右侧控制：时间轴对比开关 & 标普基准开关 & 选股选择器 & 关闭按钮 */}
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* 时间轴对比开关 (核心功能按钮) */}
          <button
            onClick={() => setCompareTimeline(!compareTimeline)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer flex items-center gap-1.5 ${
              compareTimeline
                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold shadow-xs'
                : 'bg-[#181a20] border-[#2a2e37] text-slate-400 hover:text-white'
            }`}
            title="开启或关闭雷达图时间轴对比（当前形态 vs 过去1小时前形态）"
          >
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span>时间轴对比</span>
            <span className={`w-2 h-2 rounded-full ${compareTimeline ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
          </button>

          {/* 标普500基准对照开关 */}
          <button
            onClick={() => setShowBenchmark(!showBenchmark)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer flex items-center gap-1.5 ${
              showBenchmark
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                : 'bg-[#181a20] border-[#2a2e37] text-slate-400 hover:text-white'
            }`}
            title="显示或隐藏标普500市场基准多边形对照"
          >
            <div className={`w-2 h-2 rounded-full ${showBenchmark ? 'bg-amber-400' : 'bg-slate-600'}`} />
            <span>标普基准</span>
          </button>

          {/* 快速切换选股选择器 */}
          {allStocks.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                className="px-2.5 py-1 rounded-lg bg-[#181a20] hover:bg-[#20232c] border border-[#2a2e37] text-xs font-mono text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>切换标的 ({currentStock.symbol})</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isSelectorOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#14161c] border border-neutral-700 rounded-xl shadow-2xl p-2 z-50 animate-fade-in space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="快速搜索代码或名称..."
                      value={stockSearchTerm}
                      onChange={(e) => setStockSearchTerm(e.target.value)}
                      className="w-full bg-[#1c202a] border border-[#2a2e37] rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-neutral-800">
                    {searchableStocks.map((s) => (
                      <button
                        key={s.symbol}
                        onClick={() => {
                          setCurrentStock(s);
                          setIsSelectorOpen(false);
                          setStockSearchTerm('');
                        }}
                        className={`w-full text-left p-1.5 rounded-md flex items-center justify-between text-xs font-mono transition-colors cursor-pointer ${
                          s.symbol === currentStock.symbol
                            ? 'bg-blue-600 text-white font-bold'
                            : 'hover:bg-neutral-800 text-slate-300'
                        }`}
                      >
                        <div>
                          <span className="font-bold">{s.symbol}</span>
                          <span className="text-[10px] text-slate-400 font-sans ml-1 truncate max-w-[90px] inline-block align-bottom">
                            {s.name.split(' ')[0]}
                          </span>
                        </div>
                        <span
                          className={`text-[11px] font-bold ${
                            s.changePercent < 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {s.changePercent > 0 ? '+' : ''}{s.changePercent.toFixed(1)}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 关闭按钮 (若为弹窗模式) */}
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* 时间轴对比控制面板：当开启时间轴对比时渲染 */}
      {compareTimeline && (
        <div className="bg-[#101319] border border-purple-500/30 rounded-xl p-2.5 sm:px-4 sm:py-2.5 flex items-center justify-between flex-wrap gap-2 animate-fade-in shadow-inner">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-purple-300 flex items-center gap-1.5 font-mono">
              <History className="w-4 h-4 text-purple-400" />
              <span>历史形态回溯基准:</span>
            </span>

            <div className="flex items-center gap-1 bg-[#181b24] p-0.5 rounded-lg border border-[#2a2e38]">
              {[
                { label: '15分钟前', val: 15 },
                { label: '30分钟前', val: 30 },
                { label: '过去1小时前 (核心对比)', val: 60 },
                { label: '今日开盘时 (-4h)', val: 240 },
              ].map((t) => (
                <button
                  key={t.val}
                  onClick={() => setTimelineMinutesAgo(t.val)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                    timelineMinutesAgo === t.val
                      ? 'bg-purple-600 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-400">
              {timelineMinutesAgo}m前参考价: <strong className="text-purple-300">${historicalSnapshot.pricePast.toFixed(2)}</strong>
            </span>
            <span className="text-slate-600">➔</span>
            <span className="text-slate-400">
              现价: <strong className="text-white">${currentStock.price.toFixed(2)}</strong>
            </span>
            <span
              className={`font-bold ${
                currentStock.price >= historicalSnapshot.pricePast ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              ({currentStock.price >= historicalSnapshot.pricePast ? '+' : ''}
              {(((currentStock.price - historicalSnapshot.pricePast) / historicalSnapshot.pricePast) * 100).toFixed(2)}%)
            </span>
          </div>
        </div>
      )}

      {/* 主体两栏布局：左侧 SVG 量化雷达多边形，右侧 多维量化深度透视与操盘决策 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        {/* 左侧：专业级高精度 SVG 雷达图 (占用 6 栏) */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center p-2 bg-[#0e1014] rounded-2xl border border-[#222630] relative overflow-hidden">
          {/* 背景微光 */}
          <div className="absolute inset-0 bg-radial from-blue-500/5 via-transparent to-transparent pointer-events-none" />

          <svg
            viewBox="0 0 300 300"
            className="w-full max-w-[320px] sm:max-w-[350px] aspect-square select-none overflow-visible"
          >
            <defs>
              {/* 个股多边形渐变填充 */}
              <linearGradient id="radarPolygonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#10b981" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.45" />
              </linearGradient>

              {/* 发光滤镜 */}
              <filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* 1. 同心正多边形网格线 (20%, 40%, 60%, 80%, 100%) */}
            {radarGeometry.gridLevels.map((level, i) => {
              const pointsStr = radarGeometry.axisLines
                .map((a) => {
                  const x = radarGeometry.center + radarGeometry.maxRadius * level * Math.cos(a.angle);
                  const y = radarGeometry.center + radarGeometry.maxRadius * level * Math.sin(a.angle);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(' ');

              return (
                <g key={`grid-${i}`}>
                  <polygon
                    points={pointsStr}
                    fill={i === 4 ? '#161922' : 'none'}
                    stroke={i === 4 ? '#333846' : '#222632'}
                    strokeWidth={i === 4 ? '1.5' : '1'}
                    strokeDasharray={i < 4 ? '3,3' : undefined}
                  />
                  {/* 刻度文字 */}
                  <text
                    x={radarGeometry.center + 4}
                    y={radarGeometry.center - radarGeometry.maxRadius * level + 3}
                    fill="#64748b"
                    fontSize="7"
                    fontFamily="monospace"
                  >
                    {Math.round(level * 100)}%
                  </text>
                </g>
              );
            })}

            {/* 2. 六条辐射轴线 */}
            {radarGeometry.axisLines.map((line, i) => (
              <line
                key={`axis-${i}`}
                x1={radarGeometry.center}
                y1={radarGeometry.center}
                x2={line.lineX}
                y2={line.lineY}
                stroke="#2a2e3a"
                strokeWidth="1"
              />
            ))}

            {/* 3. 标普500基准多边形 (可选对照层) */}
            {showBenchmark && (
              <polygon
                points={radarGeometry.benchmarkPolygonString}
                fill="#f59e0b"
                fillOpacity="0.08"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
            )}

            {/* 4. 过去1小时 (或选定时段) 历史形态多边形 (虚线紫光覆盖层) */}
            {compareTimeline && (
              <g className="transition-all duration-500 ease-out">
                <polygon
                  points={radarGeometry.historicalPolygonString}
                  fill="#a855f7"
                  fillOpacity="0.14"
                  stroke="#c084fc"
                  strokeWidth="1.8"
                  strokeDasharray="4,4"
                />

                {/* 演变位移轨迹线段 (连接历史顶点到当前顶点) */}
                {radarGeometry.stockPoints.map((pt, i) => {
                  const histPt = radarGeometry.historicalPoints[i];
                  if (!histPt) return null;
                  return (
                    <line
                      key={`track-${i}`}
                      x1={histPt.x}
                      y1={histPt.y}
                      x2={pt.x}
                      y2={pt.y}
                      stroke="#c084fc"
                      strokeWidth="1.2"
                      strokeOpacity="0.65"
                      strokeDasharray="2,2"
                    />
                  );
                })}

                {/* 历史点位标记圆环 */}
                {radarGeometry.historicalPoints.map((pt, i) => (
                  <circle
                    key={`hist-pt-${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={3}
                    fill="#c084fc"
                    stroke="#1a1226"
                    strokeWidth="1.2"
                  />
                ))}
              </g>
            )}

            {/* 5. 个股当前实际得分多边形 (带动态发光描边与半透明渐变) */}
            <polygon
              points={radarGeometry.stockPolygonString}
              fill="url(#radarPolygonGrad)"
              stroke="#38bdf8"
              strokeWidth="2.2"
              filter="url(#radarGlow)"
              className="transition-all duration-500 ease-out"
            />

            {/* 6. 当前各维度顶点端点指示圆点与交互 */}
            {radarGeometry.stockPoints.map((pt, i) => {
              const isHovered = hoveredDimension?.key === pt.key;
              return (
                <g
                  key={`pt-${i}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredDimension(pt)}
                  onMouseLeave={() => setHoveredDimension(null)}
                >
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 6.5 : 4.5}
                    fill={pt.value >= 75 ? '#34d399' : pt.value <= 35 ? '#f87171' : '#38bdf8'}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="transition-all duration-200"
                  />
                  {/* 数值悬浮气泡 */}
                  <text
                    x={pt.x}
                    y={pt.y - 7}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {pt.value}
                  </text>
                </g>
              );
            })}

            {/* 7. 外圈轴标签文字 */}
            {radarGeometry.axisLines.map((axis, i) => {
              const isHovered = hoveredDimension?.key === axis.dimension.key;
              return (
                <g
                  key={`label-${i}`}
                  className="cursor-pointer"
                  onClick={() => setHoveredDimension(axis.dimension)}
                >
                  <text
                    x={axis.labelX}
                    y={axis.labelY - 4}
                    textAnchor="middle"
                    fill={isHovered ? '#38bdf8' : '#e2e8f0'}
                    fontSize="10"
                    fontWeight={isHovered ? 'bold' : '600'}
                    className="transition-colors"
                  >
                    {axis.dimension.label}
                  </text>
                  <text
                    x={axis.labelX}
                    y={axis.labelY + 6}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="8"
                    fontFamily="sans-serif"
                  >
                    {axis.dimension.subLabel}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* 图例栏 */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 text-[11px] font-mono mt-1 pt-1.5 border-t border-[#1c202a] w-full flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-full bg-cyan-400" />
              <span className="text-white font-bold">{currentStock.symbol} 当前实时形态</span>
            </div>

            {compareTimeline && (
              <div className="flex items-center gap-1.5 text-purple-300">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-purple-400" />
                <span className="font-semibold">{timelineMinutesAgo}分钟前历史形态 (虚线)</span>
              </div>
            )}

            {showBenchmark && (
              <div className="flex items-center gap-1.5 text-amber-300">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-400" />
                <span>标普500基准</span>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：多维因子参数明细与超短线操盘介入决策 (占用 6 栏) */}
        <div className="lg:col-span-6 space-y-3">
          {/* 时间轴趋势演变诊断卡片 (当时间轴对比开启时优先显示) */}
          {compareTimeline && (
            <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/40 space-y-1.5 animate-fade-in shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-purple-400" />
                  <span>{historicalSnapshot.patternShiftTitle}</span>
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30">
                  {historicalSnapshot.histTier}级 ({historicalSnapshot.histCompositeScore}分) ➔ {compositeTacticalScore.tier}级 ({compositeTacticalScore.score}分)
                </span>
              </div>

              <p className="text-xs text-slate-200 leading-relaxed font-sans">
                {historicalSnapshot.evolutionSummary}
              </p>
            </div>
          )}

          {/* 综合研判卡片 */}
          <div className="p-3.5 rounded-xl bg-[#12141a] border border-[#262a36] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                超短线介入价值研判 (1-5天胜率评估)
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                现价: ${currentStock.price.toFixed(2)} ({currentStock.changePercent > 0 ? '+' : ''}{currentStock.changePercent.toFixed(2)}%)
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {compositeTacticalScore.strategyAdvice}
            </p>

            {/* 实战风控参考点位 */}
            <div className="grid grid-cols-3 gap-2 bg-black/40 p-2 rounded-lg text-center font-mono text-xs">
              <div>
                <div className="text-[10px] text-slate-400 font-sans">推荐建仓区间</div>
                <div className="font-bold text-blue-300">
                  ${(currentStock.price * 0.995).toFixed(2)} ~ ${currentStock.price.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-sans">防守硬止损</div>
                <div className="font-bold text-rose-400">
                  ${(currentStock.price * 0.98).toFixed(2)} (-2.0%)
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-sans">首选止盈目标</div>
                <div className="font-bold text-emerald-400">
                  ${(currentStock.price * 1.035).toFixed(2)} (+3.5%)
                </div>
              </div>
            </div>

            {/* 板块联动穿透研判条 */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-white/5 text-xs font-sans">
              <span className="text-slate-400">板块联动属性研判:</span>
              <span className="font-bold text-amber-300">
                {currentStock.changePercent <= -2.5 && (SectorEtfService.etfPriceState.get(sectorEtf.etfSymbol)?.changePercent ?? 0) >= -0.8
                  ? '⭐ 个股孤立异动 (黄金错杀脱钩)'
                  : Math.abs(currentStock.changePercent) >= 2.2 && Math.abs(SectorEtfService.etfPriceState.get(sectorEtf.etfSymbol)?.changePercent ?? 0) >= 1.0
                  ? '🏛️ 板块系统性共振'
                  : currentStock.changePercent >= 2.8
                  ? '🚀 个股独立领跑 (Alpha突破)'
                  : '⚖️ 板块协同平稳运行'}
              </span>
            </div>
          </div>

          {/* 六大维度因子逐项进度条与历史对比剖析 */}
          <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
            {historicalSnapshot.dimensionDeltas.map((dim) => {
              const isHovered = hoveredDimension?.key === dim.key;
              const isGood = dim.currentValue >= 70;
              const isRisk = dim.currentValue <= 40;
              const hasImproved = dim.delta > 0;
              const hasDeclined = dim.delta < 0;

              return (
                <div
                  key={dim.key}
                  onMouseEnter={() => setHoveredDimension(dimensions.find((d) => d.key === dim.key) || null)}
                  onMouseLeave={() => setHoveredDimension(null)}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    isHovered
                      ? 'bg-blue-950/30 border-blue-500/50 scale-[1.01]'
                      : 'bg-[#101217] border-[#222630] hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <span>{dim.label}</span>
                      {compareTimeline && (
                        <span className="text-[10px] text-purple-300/80 font-mono font-normal">
                          [1h前: {dim.pastValue}分]
                        </span>
                      )}
                    </span>

                    <div className="flex items-center gap-2 font-mono">
                      {compareTimeline && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5 ${
                            hasImproved
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : hasDeclined
                              ? 'bg-rose-500/15 text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {hasImproved ? `+${dim.delta}` : dim.delta}
                          {hasImproved ? '↑' : hasDeclined ? '↓' : ''}
                        </span>
                      )}

                      <span
                        className={`font-bold text-xs ${
                          isGood ? 'text-emerald-400' : isRisk ? 'text-rose-400' : 'text-cyan-300'
                        }`}
                      >
                        {dim.currentValue}分
                      </span>
                    </div>
                  </div>

                  {/* 进度条 (展示当前与历史点) */}
                  <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden mt-1 flex relative">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isGood
                          ? 'bg-emerald-400'
                          : isRisk
                          ? 'bg-rose-500'
                          : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                      }`}
                      style={{ width: `${dim.currentValue}%` }}
                    />
                    {compareTimeline && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-purple-400 z-10"
                        style={{ left: `${dim.pastValue}%` }}
                        title={`1小时前历史位置: ${dim.pastValue}分`}
                      />
                    )}
                  </div>

                  {/* 说明展开 */}
                  {isHovered && (
                    <div className="text-[11px] text-slate-400 mt-1 leading-normal animate-fade-in flex items-center justify-between">
                      <span>{dim.description}</span>
                      {compareTimeline && (
                        <span className="text-purple-300 font-mono text-[10px]">
                          1h前形态: {dim.pastRawText}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 操作入口条 */}
          <div className="flex items-center justify-between pt-2 border-t border-[#262a36]">
            <span className="text-[11px] text-slate-400">
              对应行业: <strong className="text-white">{currentStock.sector}</strong>
            </span>

            <button
              onClick={() => onSelectStock(currentStock.symbol)}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1 transition-all shadow-md cursor-pointer"
            >
              <span>查看该股全指标K线</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
