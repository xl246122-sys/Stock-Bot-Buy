export type StrategyType = 
  | 'PLUNGE_DIP' 
  | 'OPENING_BREAKOUT' 
  | 'RANGE_OSCILLATOR' 
  | 'DIP_STARTED' 
  | 'DIP_EXHAUSTION' 
  | 'OVERBOUGHT_EXIT'
  | 'BREAKDOWN';

export type AlertLifecycleStage = 
  | 'STAGE_1_DIP_STARTED'       // 阶段一: 出现大幅急跌行情预警 (结合板块6个月基准)
  | 'STAGE_2_DIP_EXHAUSTION'    // 阶段二: 超卖乏力/准备触底预警 (RSI衰竭、布林带承接)
  | 'STAGE_3_BUY_REBOUND'       // 阶段三: 触底企稳反弹/买入预警 (拐头金叉，目标>0.8%~2.5%)
  | 'STAGE_4_OVERBOUGHT_EXIT'   // 阶段四: 持仓超买乏力/准备回调预警 (RSI>70冲高回落)
  | 'BREAKOUT_BUY'              // 开盘突破买入
  | 'RANGE_SCALP_BUY';          // 区间震荡微波买入

export interface SectorEtfInfo {
  etfSymbol: string;      // e.g. 'SMH', 'XLK', 'XLC', 'XLY', 'XLF', 'XLV'
  etfName: string;        // e.g. 'VanEck 半导体 ETF', '科技精选行业 SPDR'
  sectorName: string;     // e.g. 'Semiconductors', 'Technology'
  currentPrice: number;
  changePercent: number;  // ETF 当日涨跌幅
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // 板块大趋势
  trendStrength: '强劲多头' | '温和偏多' | '震荡中性' | '破位下行' | '极度超卖';
  rsi6: number;
  isAlignedWithStock: boolean; // 个股动量是否顺应板块大趋势
  macroDivergenceWarning?: string; // 若个股与板块严重背离时的量化预警提示
  // 6个月历史基准量化分析数据
  sixMonthVolPercent?: number;     // 6个月年化历史波动率 (如 28.5%)
  sixMonthBeta?: number;           // 板块对标普基准的6个月Beta系数 (如 1.25)
  sixMonthAvgDailyRange?: number;  // 6个月日均振幅 (如 2.3%)
  dynamicDipThreshold?: number;    // 基于6个月历史与Beta计算的个股动态急跌预警线
}

export interface MacroIndexInfo {
  symbol: 'SPY' | 'QQQ';
  name: string;           // '标普500 ETF' | '纳指100 ETF'
  currentPrice: number;
  changePercent: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendStrength: '强劲多头' | '温和偏多' | '震荡中性' | '破位下行' | '极度超卖';
  rsi6: number;
}

export interface MacroMarketContext {
  spy: MacroIndexInfo;
  qqq: MacroIndexInfo;
  overallMarketTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  isHeadwind: boolean; // 大盘趋势是否为负(逆风环境)
  headwindScoreDeduction: number; // 自动调低评分的分数 (如 -15 ~ -25)
  rawConfidence?: number; // 扣减前的原始爆发买入评分
  headwindWarning?: string; // 逆风风控提示
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  rvol: number; // Relative Volume
  marketCap: number; // in Billions USD
  rsi6: number;
  rsi14: number;
  rsi24?: number; // 币安常用第三档 RSI
  binanceSymbol?: string; // 币安现货/bStocks对应代码 (例如 AMD 对应 AMDBUSDT)
  isLiveBinance?: boolean; // 是否处于币安官方实盘直连状态
  isSimulatedTest?: boolean; // 是否处于模拟注入测试状态
  priceDirection?: 'up' | 'down' | 'flat'; // 当前实时跳动方向 (用于毫秒级绿涨红跌闪烁)
  lastTickTime?: number; // 最近一次价格实时跳动时间戳
  candleBars?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
  };
  vwap: number;
  atr: number;
  high52w: number;
  low52w: number;
  sector: string;
  exchange: 'NASDAQ' | 'NYSE' | 'BINANCE';
  lastUpdated: string;
  candleCloses: number[]; // Sequence of candle closes for precise Wilder's RSI calculation
  timeframeMetrics: Record<TimeFrame, {
    rsi6: number;
    rsi14: number;
    rsi24?: number;
    percentB: number;
    signalStrength: string;
  }>;
  sectorEtf?: SectorEtfInfo; // 对应行业板块 ETF 的量化趋势与背离分析
}

export interface QuantSignal {
  id: string;
  symbol: string;
  name: string;
  strategy: StrategyType;
  strategyName: string;
  timeframe: TimeFrame;
  direction: 'BUY' | 'WATCH';
  timestamp: string;
  currentPrice: number;
  suggestedEntry: number;
  takeProfit1: number;
  takeProfit2: number;
  stopLoss: number;
  expectedHoldingHours: string;
  winRateEstimate: number; // e.g. 86.4%
  riskRewardRatio: string;
  modelConfidence: number; // 0-100
  rsi6: number;
  rsi14: number;
  changePercent: number;
  rvol: number;
  thesis: string;
  catalysts: string[];
  riskWarnings: string[];
  academicSource: string;
  sectorEtf?: SectorEtfInfo; // 注入对应行业板块ETF趋势校验
  macroMarket?: MacroMarketContext; // 宏观大盘标普500 (SPY) 与纳指 (QQQ) 趋势与逆风调减评分详情
  isRead?: boolean; // 已读状态 (点开抽屉或点击信号后标记已读)
  readAt?: string; // 标记已读的时间戳
  alertStage?: AlertLifecycleStage; // 四阶段全流程预警阶段
  dynamicThresholdInfo?: string; // 动态跌幅阈值依据
  // 量化自然语言分析因子 (RSI乖离率与板块历史波动率)
  rsiBias?: number; // 当前RSI偏离中轴50的绝对点数 (如 -33.5 或 +16.5)
  rsiBiasPercent?: number; // 当前RSI乖离率% (相对50中轴偏差百分比，如 -67.0% 或 +33.0%)
  sectorVol?: number; // 对应行业板块近6个月年化历史波动率 (如 29.8%)
  sectorDailyRange?: number; // 对应行业板块近6个月日均振幅 (如 2.85%)
  naturalAnalysis?: string; // 基于RSI乖离率与板块历史波动率生成的自然语言“为什么值得入手”权威解析
  // 板块超卖同步与相关性深度分析
  sectorOversoldSync?: SectorOversoldSyncAnalysis;
}

export interface SectorOversoldSyncAnalysis {
  isSynchronized: boolean;           // 是否处于板块超卖同步共振
  syncType: 'SECTOR_CONTAGION' | 'ISOLATED_DECOUPLING' | 'PARTIAL_SYNC' | 'BULLISH_SUPPORT';
  syncTypeName: string;              // '板块级系统性超卖同步' | '个股孤立脱钩错杀' | '局部弱同步' | '顺风共振'
  syncScore: number;                 // 0 - 100 联动同步度评分
  correlatedEtf: string;             // e.g. 'XLK', 'SMH', 'XLF', 'XLE'
  correlationR: number;              // 与所属板块ETF的皮尔逊相关系数 (-1.0 ~ +1.0)
  beta: number;                      // 对该板块ETF的Beta系数
  stockRsi: number;
  etfRsi: number;
  stockChange: number;
  etfChange: number;
  badgeLabel: string;                // e.g. '🔄 板块超卖同步' | '⭐ 独立脱钩错杀'
  badgeColor: string;
  detailedAnalysis: string;          // 自动深度研报解析
  actionGuidance: string;            // 实战操作指引
}

export interface CorrelationCell {
  etfSymbol: string;
  stockSymbol: string;
  r: number;                         // Pearson correlation (-1.0 to 1.0)
  beta: number;                      // Beta relative to ETF
  rSquared: number;                  // R^2
  isMappedSector: boolean;           // Is this ETF the primary mapped sector for this stock
  oversoldSync: SectorOversoldSyncAnalysis;
  rollingSpread: number;             // return difference (stock - ETF)
}

export interface SectorCorrelationMatrixData {
  etfs: SectorEtfInfo[];
  stocks: StockQuote[];
  cells: Map<string, CorrelationCell>; // key: `${etfSymbol}-${stockSymbol}`
  etfCrossMatrix?: Map<string, number>; // key: `${etf1}-${etf2}`
  timestamp: string;
  avgCorrelation: number;
  highestPair: { etf: string; stock: string; r: number };
  decoupledPair: { etf: string; stock: string; r: number };
  syncRanking: SectorOversoldSyncAnalysis[];
}

export interface SectorMoneyFlowItem {
  etfSymbol: string;
  etfName: string;
  sectorName: string;
  price: number;
  changePercent: number;
  rsi6: number;
  rvol: number;
  inflowScore: number;                 // -100 to +100 (资金流入强度评分)
  netInflowMillion: number;            // 估算净流入/净流出金额 (以百万美元为单位，例如 +420M 或 -180M)
  flowStatus: 'STRONG_INFLOW' | 'MILD_INFLOW' | 'NEUTRAL' | 'MILD_OUTFLOW' | 'HEAVY_OUTFLOW';
  flowStatusLabel: string;             // e.g. '🔥 主力强力抢筹' | '🟢 稳健净流入' | '⚪ 资金博弈平衡' | '🟠 减仓流出' | '🚨 恐慌抛压撤离'
  flowColor: string;
  leadingConstituents: string[];       // 核心代表成分股 (如 NVDA, AAPL, XOM, JPM 等)
}

export interface StockPressureMetrics {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  rsi6: number;
  rvol: number;
  mappedEtf: string;
  mappedEtfName?: string;
  gicsSectorZh?: string;
  industryZh?: string;
  correlationR: number;
  buyPressurePercent: number;          // 0% - 100% 买盘压力比例
  sellPressurePercent: number;         // 0% - 100% 卖盘压力比例
  pressureLevel: 'HEAVY_BUY' | 'MILD_BUY' | 'BALANCED' | 'MILD_SELL' | 'HEAVY_SELL';
  pressureLabel: string;               // '🟢 强劲买盘压制' | '🌱 买盘占优' | '⚖️ 多空均衡' | '🟠 抛盘偏重' | '🔴 沉重卖压砸盘'
  highlightColor: string;              // Red/Green highlight class for borders/backgrounds
  statusSummary: string;               // 实时买卖压力与板块资金关联简要评析
}

export interface MonitoredPosition {
  id: string;
  symbol: string;
  name: string;
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  targetProfitPercent: number; // e.g. 3.0%
  stopLossPercent: number; // e.g. 2.0%
  entryDate: string;
  notes?: string;
  strategyUsed: StrategyType;
  highestPriceSinceEntry: number;
  isAlertedProfit: boolean;
  isAlertedLoss: boolean;
  // Trailing Stop-Loss (移动止盈止损)
  isTrailingEnabled?: boolean;
  trailingActivationPercent?: number; // e.g. 1.8%
  trailingCallbackPercent?: number; // e.g. 0.8%
  isBreakevenLocked?: boolean;
  isTrailingTriggered?: boolean;

  // 用户自定义监控预警方案 (Custom Position Alert Setup)
  alertDropPercent?: number; // 跌幅% 预警阈值 (如 -2.5%)
  alertLossAmount?: number;  // 浮亏金额预警 (如 -200 美元)
  alertOverboughtRsi?: number; // 超买乏力 RSI 警戒线 (默认 72)
  isOverboughtAlerted?: boolean; // 是否已触发超买乏力准备回调预警
  isDropThresholdAlerted?: boolean; // 是否已触发跌幅警戒预警
  isLossAmountAlerted?: boolean; // 是否已触发金额亏损警戒预警
}

export type ScanInterval = '2s' | '5s' | '10s' | '1m' | '3m' | '5m' | '10m' | '30m' | '1h';
export type TimeFrame = '30m' | '1h' | '2h' | '4h' | '1d' | '1w';

export interface ScanSettings {
  interval: ScanInterval;
  timeframe: TimeFrame;
  minMarketCap: number; // 严选市值门槛 (默认 5.0 Billion)
  minPrice: number; // 严选股价门槛 (默认 50.0 USD，股价不低于50美元)
  enablePriceAndCapFilter: boolean; // 是否开启股价>=50且市值>=5B严选过滤 (默认开启)
  includeSub5BAndUnder10: boolean; // 默认关闭低价小盘股
  enableDynamicSectorThreshold: boolean; // 启用板块近6个月基准动态跌幅阈值
  plungeMinDrop: number; // -5%
  plungeMaxDrop: number; // -13%
  rsi6OversoldThreshold: number; // 22
  rsi14OversoldThreshold: number; // 28
  soundEnabled: boolean;
  popupEnabled: boolean;
  autoAddToWatchlist: boolean;
  vibrationEnabled: boolean;
  selectedSector: string;
}

export type AutoTradeCloseReason = 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'MANUAL';

export interface TradeExecutionLog {
  id: string;
  orderId: string;
  symbol: string;
  name: string;
  side: 'SELL' | 'BUY';
  orderType: 'MARKET' | 'LIMIT';
  quantity: number;
  entryPrice: number;
  executionPrice: number;
  realizedPnL: number;
  realizedPnLPercent: number;
  reason: AutoTradeCloseReason;
  reasonDetail: string;
  timestamp: string;
  status: 'FILLED' | 'CANCELLED' | 'REJECTED';
  executionLatencyMs: number;
  strategyUsed?: StrategyType;
  isNativeExecuted: boolean;
}

export interface AutoTradeConfig {
  isEnabled: boolean;
  autoCloseOnProfit: boolean;
  autoCloseOnLoss: boolean;
  autoCloseOnTrailing: boolean;
  maxSlippagePercent: number; // e.g. 0.05%
  notifyOnExecution: boolean;
  vibrateOnExecution: boolean;
}
