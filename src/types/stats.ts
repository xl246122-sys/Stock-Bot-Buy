/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 7-Day Strategy Alert Frequency & Price Performance Analytics Types
 */

import { StrategyType, TimeFrame } from './stock';

export type AlertOutcome = 'WIN' | 'LOSS' | 'OPEN';
export type AlertExitReason = 'TARGET_HIT' | 'TRAILING_PROFIT' | 'TIME_EXPIRED' | 'STOPPED_OUT' | 'TRACKING';

export interface StrategyAlertRecord {
  id: string;
  symbol: string;
  name: string;
  strategy: StrategyType;
  strategyName: string;
  triggerDate: string; // YYYY-MM-DD
  triggerTime: string; // HH:mm:ss
  dayOfWeek: string; // 周一, 周二, ...
  timeframe: TimeFrame;
  triggerPrice: number;
  rsi6AtTrigger: number;
  rsi14AtTrigger: number;
  rvolAtTrigger: number;
  
  // Subsequent price performance at key quantitative milestones
  price1h?: number;
  change1hPct: number; // +X.XX%
  price4h?: number;
  change4hPct: number; // +X.XX%
  price24h?: number;
  change24hPct: number; // +X.XX%
  price48h?: number;
  change48hPct: number; // +X.XX%
  
  // MFE & MAE
  maxGainPct: number; // Maximum Favorable Excursion (最高冲高 %)
  maxDrawdownPct: number; // Maximum Adverse Excursion (最大下探 %)
  
  // Real-time tracking
  currentPrice: number;
  currentChangePct: number;
  
  // Strategy outcome
  outcome: AlertOutcome;
  exitReason: AlertExitReason;
  realizedReturnPct: number;
  targetProfitPct: number;
  stopLossPct: number;
}

export interface StrategyDailyStats {
  date: string; // MM/DD
  fullDate: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "10/08 周三"
  plungeCount: number; // 抄底频次
  breakoutCount: number; // 爆发频次
  rangeCount: number; // 微波频次
  totalCount: number;
  avgReturn24h: number; // 平均24h收益 %
  winRate: number; // 当日胜率 %
}

export interface StrategyMetricSummary {
  strategy: StrategyType;
  label: string;
  shortLabel: string;
  totalTriggers: number;
  sharePercent: number; // 占全部触发的比例
  winCount: number;
  lossCount: number;
  openCount: number;
  winRate: number; // %
  avgReturn1h: number; // %
  avgReturn4h: number; // %
  avgReturn24h: number; // %
  avgReturn48h: number; // %
  avgMaxGain: number; // %
  avgMaxDrawdown: number; // %
  profitFactor: number; // 盈亏比 (盈利总和 / 亏损总和)
  bestTrade: {
    symbol: string;
    gainPct: number;
    date: string;
  };
  worstTrade: {
    symbol: string;
    lossPct: number;
    date: string;
  };
}

export interface HorizonComparisonPoint {
  horizon: string; // "1小时", "4小时", "24小时", "48小时"
  plungeReturn: number;
  breakoutReturn: number;
  rangeReturn: number;
  plungeWinRate: number;
  breakoutWinRate: number;
  rangeWinRate: number;
}
