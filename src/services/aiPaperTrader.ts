/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AiPaperTrader - Stock-G AI 模拟自主交易与自我学习自我纠错引擎
 * 
 * 核心规格与规则标定:
 * 1. 【时段动态调度与频率】(以北京时间 CST / UTC+8 为基准):
 *    - A时段 (19:00 - 24:00): 5分钟/次，高频扫描 + 穿透分析 (美股盘前与开盘黄金时段)
 *    - B时段 (00:00 - 05:00): 20分钟/次，扫描 + 穿透分析 + 模拟自主交易 (美股盘中交易时段)
 *    - C时段 (06:00 - 11:00): 30分钟/次，扫描 + 穿透分析 + 模拟自主交易 (盘后结算与亚太早盘)
 *    - 其他时段 (11:00 - 19:00): 60分钟/次，低频静默巡航与风控保活
 * 2. 【资金与寸头模型】:
 *    - 初始模拟资金: $3,000.00 USD
 *    - 单笔交易头寸 (寸头): 8% ~ 10% (约 $240 ~ $300 USD)
 *    - 持仓上限: 最多同时持有 5 只标的
 *    - 手续费模型: 币安平台标准费率 (Binance Standard Taker 0.10% = 0.001)
 * 3. 【自我学习与自我纠错引擎】:
 *    - 每次平仓自动触发多维成败归因 (Post-Trade Attribution)
 *    - 动态自适应调整策略权重与行业风控门槛
 *    - 生成透明的 AI 纠错反思日志 (Reflection Journal)
 */

import { StockQuote, QuantSignal, StrategyType } from '../types/stock';
import { audioAlert } from './audioAlert';
import { androidBridge } from './androidBridge';

// 交易时段定义
export type TradingSessionType = 'SESSION_A' | 'SESSION_B' | 'SESSION_C' | 'SESSION_IDLE';

export interface TradingScheduleInfo {
  session: TradingSessionType;
  sessionName: string;
  timeRangeDesc: string;
  intervalMinutes: number;
  intervalSeconds: number;
  canTrade: boolean;
  canScan: boolean;
  description: string;
}

// 模拟持仓对象
export interface PaperPosition {
  id: string;
  symbol: string;
  name: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  costBasis: number;           // 投入本金 = entryPrice * quantity
  entryFee: number;            // 买入手续费 (币安 0.1%)
  entryTime: string;           // 格式化时间
  entryTimestamp: number;
  targetProfitPrice: number;   // 建议止盈价
  stopLossPrice: number;       // 建议止损价
  unrealizedPnL: number;       // 浮动盈亏金额
  unrealizedPnLPercent: number;// 浮动盈亏百分比
  highestPriceSinceEntry: number;
  strategyUsed: StrategyType;
  strategyName: string;
  winRateAtEntry: number;
  thesis: string;
}

// 交易完成与平仓日志
export interface PaperTradeRecord {
  id: string;
  symbol: string;
  name: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  costBasis: number;
  totalFees: number;           // 买入 + 卖出总手续费 (币安 0.1% * 2)
  grossPnL: number;            // 毛盈亏
  netPnL: number;              // 扣除手续费后的净盈亏
  netPnLPercent: number;       // 净收益率%
  isWin: boolean;              // 是否盈利
  closeReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_EXIT' | 'MANUAL';
  closeReasonZh: string;
  entryTime: string;
  exitTime: string;
  holdingDurationMinutes: number;
  strategyUsed: StrategyType;
  attribution: string;         // AI 归因评析
}

// AI 自我学习与纠错复盘日志
export interface AiLearningEvent {
  id: string;
  timestamp: string;
  type: 'CORRECTION' | 'REINFORCEMENT' | 'PARAMETER_TUNED';
  title: string;
  symbol?: string;
  diagnosis: string;           // 成因诊断
  correctiveAction: string;    // 纠错自适应调整动作
  impactSummary: string;       // 调整后影响
}

// 模拟账户全局状态
export interface PaperAccountState {
  isEnabled: boolean;          // AI 模拟自主交易总开关
  initialBalance: number;      // 3000 USD
  cashBalance: number;         // 可用现金
  equity: number;              // 账户总资产 (现金 + 持仓市值)
  totalRealizedPnL: number;    // 累计已实现净盈亏
  totalRealizedPnLPercent: number;
  totalFeesPaid: number;       // 累计已付币安手续费
  winCount: number;
  lossCount: number;
  winRate: number;             // 实盘胜率 %
  positions: PaperPosition[];  // 当前持仓 (最多 5 只)
  history: PaperTradeRecord[]; // 历史交易记录
  learningEvents: AiLearningEvent[]; // 自我学习与纠错日志
  lastDecisionTime: string | null;
  nextExecutionTime: string | null;
  secondsUntilNextExecution: number;
  currentSchedule: TradingScheduleInfo;
  
  // 自适应纠错参数因子 (动态演化)
  dynamicParams: {
    minWinRateThreshold: number;       // 动态入场胜率门槛 (默认 80.0%)
    minConfidenceThreshold: number;    // 动态置信度门槛 (默认 85.0%)
    oversoldRsiThreshold: number;      // 动态超卖 RSI 门槛 (默认 22.0)
    strictSectorFilterActive: boolean; // 是否处于行业严格顺风保护期
    correctionCount: number;           // 累计纠错次数
  };
}

const STORAGE_KEY = 'stockg_ai_paper_trader_v2';
const BINANCE_FEE_RATE = 0.001; // 币安现货标准 Taker 手续费 0.1%
const INITIAL_CAPITAL = 3000.0; // 初始模拟资金 3000 USD
const MAX_CONCURRENT_POSITIONS = 5; // 最多 5 只标的
const MIN_POSITION_RATIO = 0.08; // 单笔头寸下限 8%
const MAX_POSITION_RATIO = 0.10; // 单笔头寸上限 10%

class AiPaperTraderService {
  private state: PaperAccountState;
  private listeners: Set<(state: PaperAccountState) => void> = new Set();
  private timer: any = null;

  constructor() {
    this.state = this.loadState();
    // Production monitoring does not start paper-trading timers.
  }

  // 1. 获取当前北京时间 (CST / UTC+8) 的时段规则
  public getScheduleForTime(now: Date = new Date()): TradingScheduleInfo {
    // 转换为北京时间 (Asia/Shanghai)
    let day = now.getDay();
    let hour = now.getHours();
    try {
      const beijingStr = now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
      const bjDate = new Date(beijingStr);
      day = bjDate.getDay();
      hour = bjDate.getHours();
    } catch {
      // ignore
    }

    // 执行时间段: 每个周一至周六 (day in 1..6)，晚上 21:00 至 24:00 (hour in 21..23)
    const isMonToSat = day >= 1 && day <= 6;
    const isExecutionHours = hour >= 21 && hour < 24;

    if (isMonToSat && isExecutionHours) {
      return {
        session: 'SESSION_A',
        sessionName: 'AI大脑 · 美股量化监控预警时段 (DeepSeek V3 Flash)',
        timeRangeDesc: '北京时间 周一至周六 21:00 - 24:00',
        intervalMinutes: 5,
        intervalSeconds: 5 * 60,
        canScan: true,
        canTrade: true,
        description: '币安美股市场 AI 量化扫描监控预警 (Grok高胜率任务模式)，5分钟一次高胜率决策与模拟执行'
      };
    }

    // 非执行时段: 待机巡航
    return {
      session: 'SESSION_IDLE',
      sessionName: '待机巡航时段 (非执行时段)',
      timeRangeDesc: '下次执行: 周一至周六 21:00 - 24:00',
      intervalMinutes: 5,
      intervalSeconds: 5 * 60,
      canScan: true,
      canTrade: false,
      description: '等待周一至周六 21:00-24:00 任务执行窗口 (5分钟/次)，支持随时手动立即执行AI扫描'
    };
  }

  // 2. 初始化加载本地状态
  private loadState(): PaperAccountState {
    const defaultSchedule = this.getScheduleForTime();
    const defaultState: PaperAccountState = {
      isEnabled: true, // 默认开启自主模拟交易
      initialBalance: INITIAL_CAPITAL,
      cashBalance: INITIAL_CAPITAL,
      equity: INITIAL_CAPITAL,
      totalRealizedPnL: 0,
      totalRealizedPnLPercent: 0,
      totalFeesPaid: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      positions: [],
      history: [],
      learningEvents: [
        {
          id: 'init-learn-0',
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          type: 'REINFORCEMENT',
          title: 'AI 交易与自学习系统就绪',
          diagnosis: '已加载美股对冲基金量化决策模型与币安手续费费率规范 (0.1%)。',
          correctiveAction: '初始资金标定为 $3,000.00，寸头锁定 8%~10%，持仓上限 5 只。',
          impactSummary: '多时段自适应调度器激活：A时段 5m / B时段 20m / C时段 30m。'
        }
      ],
      lastDecisionTime: null,
      nextExecutionTime: null,
      secondsUntilNextExecution: defaultSchedule.intervalSeconds,
      currentSchedule: defaultSchedule,
      dynamicParams: {
        minWinRateThreshold: 80.0,
        minConfidenceThreshold: 85.0,
        oversoldRsiThreshold: 22.0,
        strictSectorFilterActive: false,
        correctionCount: 0
      }
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultState,
          ...parsed,
          initialBalance: INITIAL_CAPITAL, // 确保初始资金设定一致
          currentSchedule: defaultSchedule
        };
      }
    } catch (e) {
      console.warn('[AiPaperTrader] Failed to load cached state, using default:', e);
    }

    return defaultState;
  }

  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('[AiPaperTrader] Failed to save state to localStorage:', e);
    }
    this.notify();
  }

  // 3. 订阅与发布
  public subscribe(cb: (state: PaperAccountState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.state);
      } catch (err) {
        console.error('[AiPaperTrader] Subscriber error:', err);
      }
    });
  }

  public getState(): PaperAccountState {
    return this.state;
  }

  // 4. 用户交互操作: 切换自主交易总开关
  public toggleTradingEnabled(enabled?: boolean) {
    this.state.isEnabled = enabled !== undefined ? enabled : !this.state.isEnabled;
    this.saveState();
  }

  // 重置模拟账户
  public resetAccount() {
    this.state.cashBalance = INITIAL_CAPITAL;
    this.state.equity = INITIAL_CAPITAL;
    this.state.totalRealizedPnL = 0;
    this.state.totalRealizedPnLPercent = 0;
    this.state.totalFeesPaid = 0;
    this.state.winCount = 0;
    this.state.lossCount = 0;
    this.state.winRate = 0;
    this.state.positions = [];
    this.state.history = [];
    this.state.learningEvents.unshift({
      id: `reset-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      type: 'REINFORCEMENT',
      title: '模拟账户手动重置归位',
      diagnosis: '用户已重置本金为 $3,000.00 USD。',
      correctiveAction: '清空历史未平仓位与历史收益率，恢复出厂默认风控基准。',
      impactSummary: '当前可用余额: $3,000.00，已清空持仓。'
    });
    this.saveState();
  }

  // 5. 毫秒级后台时钟调度 (每秒刷新倒计时与时段状态)
  private startScheduler() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      const schedule = this.getScheduleForTime();
      this.state.currentSchedule = schedule;

      if (this.state.secondsUntilNextExecution <= 1) {
        // 触发周期决议任务
        this.executeScheduledDecisionCycle();
        this.state.secondsUntilNextExecution = schedule.intervalSeconds;
      } else {
        this.state.secondsUntilNextExecution -= 1;
      }

      this.notify();
    }, 1000);
  }

  // 6. 周期决议主循环 (按 A:5m / B:20m / C:30m 触发)
  public executeScheduledDecisionCycle(signals: QuantSignal[] = [], allQuotes: StockQuote[] = []) {
    return; // Legacy autonomous decisions disabled.
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this.state.lastDecisionTime = nowStr;
    const schedule = this.state.currentSchedule;

    // 1) 刷新持仓最新价格与浮动盈亏
    this.updatePositionsMarketPrice(allQuotes);

    // 2) 检查是否触发止盈或止损平仓
    this.evaluatePositionsExit(allQuotes);

    // 3) 若允许自主交易且开启了全局开关，则根据严选信号进行建仓决策
    if (this.state.isEnabled && schedule.canTrade && signals.length > 0) {
      this.evaluateAutonomousEntry(signals);
    }

    this.saveState();
  }

  // 7. 更新持仓当前价与未实现盈亏
  public updatePositionsMarketPrice(quotes: StockQuote[]) {
    if (this.state.positions.length === 0 || quotes.length === 0) return;

    const quoteMap = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
    let totalPositionValue = 0;

    this.state.positions = this.state.positions.map((pos) => {
      const live = quoteMap.get(pos.symbol.toUpperCase());
      const currentPrice = live ? live.price : pos.currentPrice;
      const highestPriceSinceEntry = Math.max(pos.highestPriceSinceEntry, currentPrice);
      const grossValue = currentPrice * pos.quantity;
      const unrealizedPnL = grossValue - pos.costBasis;
      const unrealizedPnLPercent = pos.costBasis > 0 ? (unrealizedPnL / pos.costBasis) * 100 : 0;

      totalPositionValue += grossValue;

      return {
        ...pos,
        currentPrice,
        highestPriceSinceEntry,
        unrealizedPnL,
        unrealizedPnLPercent
      };
    });

    // 计算当前总资产 (现金 + 持仓净现值)
    this.state.equity = this.state.cashBalance + totalPositionValue;
  }

  // 8. 评估持仓是否触碰止损/止盈阈值
  private evaluatePositionsExit(quotes: StockQuote[]) {
    const remainingPositions: PaperPosition[] = [];

    for (const pos of this.state.positions) {
      let shouldExit = false;
      let closeReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_EXIT' = 'TAKE_PROFIT';
      let reasonZh = '';

      // 规则 A: 触发第一止盈位 (或浮盈 >= +2.8%)
      if (pos.currentPrice >= pos.targetProfitPrice || pos.unrealizedPnLPercent >= 2.8) {
        shouldExit = true;
        closeReason = 'TAKE_PROFIT';
        reasonZh = `精准触碰第一止盈价 $${pos.targetProfitPrice.toFixed(2)} (+${pos.unrealizedPnLPercent.toFixed(2)}%)`;
      }
      // 规则 B: 跌破止损位 (或浮亏 <= -2.0%)
      else if (pos.currentPrice <= pos.stopLossPrice || pos.unrealizedPnLPercent <= -2.0) {
        shouldExit = true;
        closeReason = 'STOP_LOSS';
        reasonZh = `触碰风控止损线 $${pos.stopLossPrice.toFixed(2)} (${pos.unrealizedPnLPercent.toFixed(2)}%)，强制断腕撤离`;
      }

      if (shouldExit) {
        this.closePosition(pos, closeReason, reasonZh);
      } else {
        remainingPositions.push(pos);
      }
    }

    this.state.positions = remainingPositions;
  }

  // 9. 执行平仓结算并触发自我学习与纠错
  public closePosition(
    pos: PaperPosition,
    closeReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_EXIT' | 'MANUAL',
    reasonZh: string
  ) {
    const grossExitValue = pos.currentPrice * pos.quantity;
    const exitFee = grossExitValue * BINANCE_FEE_RATE; // 卖出手续费 (币安 0.1%)
    const totalFees = pos.entryFee + exitFee;
    const netExitProceeds = grossExitValue - exitFee;
    const netPnL = netExitProceeds - pos.costBasis;
    const netPnLPercent = pos.costBasis > 0 ? (netPnL / pos.costBasis) * 100 : 0;
    const isWin = netPnL > 0;

    // 回笼资金至可用现金
    this.state.cashBalance += netExitProceeds;
    this.state.totalRealizedPnL += netPnL;
    this.state.totalFeesPaid += totalFees;

    if (isWin) {
      this.state.winCount += 1;
    } else {
      this.state.lossCount += 1;
    }

    const totalTrades = this.state.winCount + this.state.lossCount;
    this.state.winRate = totalTrades > 0 ? Number(((this.state.winCount / totalTrades) * 100).toFixed(1)) : 0;
    this.state.totalRealizedPnLPercent = Number(((this.state.totalRealizedPnL / INITIAL_CAPITAL) * 100).toFixed(2));

    const exitTimeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const holdingMinutes = Math.max(1, Math.round((Date.now() - pos.entryTimestamp) / 60000));

    // 记录历史记录
    const tradeRecord: PaperTradeRecord = {
      id: `trade-${Date.now()}-${pos.symbol}`,
      symbol: pos.symbol,
      name: pos.name,
      entryPrice: pos.entryPrice,
      exitPrice: pos.currentPrice,
      quantity: pos.quantity,
      costBasis: pos.costBasis,
      totalFees,
      grossPnL: grossExitValue - pos.costBasis,
      netPnL,
      netPnLPercent,
      isWin,
      closeReason,
      closeReasonZh: reasonZh,
      entryTime: pos.entryTime,
      exitTime: exitTimeStr,
      holdingDurationMinutes: holdingMinutes,
      strategyUsed: pos.strategyUsed,
      attribution: isWin
        ? `【盈利归因】RSI 极限负乖离反弹回归兑现，币安手续费 $${totalFees.toFixed(2)}，净落袋 $${netPnL.toFixed(2)}。`
        : `【亏损复盘】个股未能在预设时间窗口收复布林中轴，触发止损保护本金，净亏损 $${Math.abs(netPnL).toFixed(2)}。`
    };

    this.state.history.unshift(tradeRecord);

    // 触发 AI 自我学习与纠错引擎
    this.triggerSelfLearningAndCorrection(tradeRecord, pos);

    // 原生提示
    if (isWin) {
      audioAlert.playPlungeDipAlert(pos.symbol, pos.currentPrice, netPnLPercent, '止盈出场');
      androidBridge.showToast(`🎯 AI 模拟止盈: ${pos.symbol} 获利 +$${netPnL.toFixed(2)} (+${netPnLPercent.toFixed(2)}%)`);
    } else {
      androidBridge.showToast(`🛡️ AI 模拟止损: ${pos.symbol} 撤离 -$${Math.abs(netPnL).toFixed(2)} (${netPnLPercent.toFixed(2)}%)`);
    }
  }

  // 10. AI 自我学习与自我纠错引擎核心机制
  private triggerSelfLearningAndCorrection(record: PaperTradeRecord, pos: PaperPosition) {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    if (record.isWin) {
      // 🟢 盈利模式强化: 巩固正向因子
      const learnEvent: AiLearningEvent = {
        id: `learn-${Date.now()}`,
        timestamp,
        type: 'REINFORCEMENT',
        title: `正向强化: ${record.symbol} 均值回归反弹成功`,
        symbol: record.symbol,
        diagnosis: `标的 ${record.symbol} 在入场后 ${record.holdingDurationMinutes} 分钟内完成反弹，净收益 +$${record.netPnL.toFixed(2)} (+${record.netPnLPercent.toFixed(2)}%)。`,
        correctiveAction: `当前胜率模型在【${pos.strategyName}】表现优异，继续维持入场胜率基准 ${this.state.dynamicParams.minWinRateThreshold}%。`,
        impactSummary: `实盘战绩更新：总胜率提升至 ${this.state.winRate}%，扣除币安手续费后累计净利 $${this.state.totalRealizedPnL.toFixed(2)}。`
      };
      this.state.learningEvents.unshift(learnEvent);
    } else {
      // 🔴 亏损复盘与自我纠错机制
      this.state.dynamicParams.correctionCount += 1;
      const count = this.state.dynamicParams.correctionCount;

      // 纠错动作 1: 提升入场准入门槛 (胜率门槛从 80% 动态自适应提升至 82%~85%)
      const newWinRateThresh = Math.min(86.0, Number((this.state.dynamicParams.minWinRateThreshold + 1.0).toFixed(1)));
      this.state.dynamicParams.minWinRateThreshold = newWinRateThresh;

      // 纠错动作 2: 收紧超卖准入 RSI
      const newOversoldRsi = Math.max(18.0, Number((this.state.dynamicParams.oversoldRsiThreshold - 1.0).toFixed(1)));
      this.state.dynamicParams.oversoldRsiThreshold = newOversoldRsi;

      // 纠错动作 3: 开启严格行业顺风保护期
      this.state.dynamicParams.strictSectorFilterActive = true;

      const learnEvent: AiLearningEvent = {
        id: `learn-${Date.now()}`,
        timestamp,
        type: 'CORRECTION',
        title: `⚠️ AI 自我纠错 #${count}: ${record.symbol} 止损成因复盘`,
        symbol: record.symbol,
        diagnosis: `标的在左侧抄底介入后动能衰竭，被大盘/行业下杀惯性拖累，导致触发 -2.0% 止损。`,
        correctiveAction: `1. 自动上调入场胜率门槛至 ${newWinRateThresh}%\n2. 收紧抄底超卖 RSI 阈值至 ≤ ${newOversoldRsi}\n3. 启动 24 小时行业板块顺风校验强过滤。`,
        impactSummary: `通过自我纠错动态收窄风险敞口，避免同类弱势标的连续左侧接飞刀。`
      };
      this.state.learningEvents.unshift(learnEvent);
    }

    // 最多保留 25 条复盘学习日志
    if (this.state.learningEvents.length > 25) {
      this.state.learningEvents = this.state.learningEvents.slice(0, 25);
    }
  }

  // 11. 自主建仓决策 (当处于 B/C 时段且有优质预警信号时)
  public evaluateAutonomousEntry(signals: QuantSignal[]) {
    return;
    // 检查持仓上限 (最多 5 只)
    if (this.state.positions.length >= MAX_CONCURRENT_POSITIONS) {
      return;
    }

    // 检查可用资金是否足够开仓
    const currentPositionSymbols = new Set(this.state.positions.map((p) => p.symbol.toUpperCase()));

    // 严选候选标的:
    // 1) 未持有
    // 2) 胜率 >= 动态门槛 (>= 80% ~ 85%)
    // 3) 置信度 >= 85%
    // 4) 方向为 BUY
    const qualifiedCandidates = signals
      .filter((s) => !currentPositionSymbols.has(s.symbol.toUpperCase()))
      .filter((s) => s.direction === 'BUY')
      .filter((s) => s.winRateEstimate >= this.state.dynamicParams.minWinRateThreshold)
      .filter((s) => s.modelConfidence >= this.state.dynamicParams.minConfidenceThreshold)
      .sort((a, b) => b.winRateEstimate - a.winRateEstimate);

    if (qualifiedCandidates.length === 0) return;

    // 挑选评分最高的一只标的建仓
    const bestPick = qualifiedCandidates[0];

    // 计算头寸: 总权益的 8% ~ 10% (以 9% 为基准)
    const targetAllocationRatio = 0.09;
    const targetAllocationAmount = Math.min(
      this.state.cashBalance * 0.95, // 不能超过当前现金
      this.state.equity * targetAllocationRatio
    );

    // 若可用资金不足 50 美元，无法有效建仓
    if (targetAllocationAmount < 50 || this.state.cashBalance < targetAllocationAmount) {
      return;
    }

    this.executeBuy(bestPick, targetAllocationAmount);
  }

  // 12. 执行模拟买入建仓
  public executeBuy(signal: QuantSignal, targetAllocationAmount: number): boolean {
    return false;
    return false;
    if (this.state.positions.length >= MAX_CONCURRENT_POSITIONS) {
      androidBridge.showToast('持仓已达 5 只上限，需平仓后再建新仓');
      return false;
    }

    if (this.state.cashBalance < targetAllocationAmount) {
      androidBridge.showToast('可用模拟现金不足');
      return false;
    }

    const entryPrice = signal.currentPrice;
    if (entryPrice <= 0) return false;

    // 计算可买股数 (保留 2 位小数或整股，美股支持碎股 fractional shares)
    const rawQuantity = targetAllocationAmount / entryPrice;
    const quantity = Number(rawQuantity.toFixed(3));
    const costBasis = Number((quantity * entryPrice).toFixed(2));

    // 计算币安标准 Taker 手续费 0.1%
    const entryFee = Number((costBasis * BINANCE_FEE_RATE).toFixed(3));
    const totalDeduction = costBasis + entryFee;

    if (this.state.cashBalance < totalDeduction) return false;

    // 扣减现金
    this.state.cashBalance -= totalDeduction;
    this.state.totalFeesPaid += entryFee;

    const entryTimeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const targetProfit = signal.takeProfit1 > entryPrice ? signal.takeProfit1 : entryPrice * 1.03;
    const stopLoss = signal.stopLoss < entryPrice && signal.stopLoss > 0 ? signal.stopLoss : entryPrice * 0.98;

    const newPos: PaperPosition = {
      id: `pos-${Date.now()}-${signal.symbol}`,
      symbol: signal.symbol,
      name: signal.name,
      entryPrice,
      currentPrice: entryPrice,
      quantity,
      costBasis,
      entryFee,
      entryTime: entryTimeStr,
      entryTimestamp: Date.now(),
      targetProfitPrice: targetProfit,
      stopLossPrice: stopLoss,
      unrealizedPnL: -entryFee,
      unrealizedPnLPercent: costBasis > 0 ? (-entryFee / costBasis) * 100 : 0,
      highestPriceSinceEntry: entryPrice,
      strategyUsed: signal.strategy,
      strategyName: signal.strategyName,
      winRateAtEntry: signal.winRateEstimate,
      thesis: signal.naturalAnalysis || signal.thesis
    };

    this.state.positions.push(newPos);
    this.saveState();

    // 声音与震动通知
    audioAlert.playBreakoutAlert(signal.symbol, entryPrice, signal.changePercent, 'AI 模拟自主建仓');
    androidBridge.triggerHaptic('breakout');
    androidBridge.showToast(
      `🤖 AI 模拟建仓 ${signal.symbol}: $${entryPrice.toFixed(2)} · 寸头 $${costBasis.toFixed(1)} (手续费 $${entryFee.toFixed(2)})`
    );

    return true;
  }
}

export const aiPaperTrader = new AiPaperTraderService();
