/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MobileAlertDrawerItem (Material 3 抽屉式长条预警组件)
 * 
 * Google 顶级 Android UI 设计师 (Material 3 Expressive) 重塑版本:
 * 1. 54dp 标准触控长条，信息密度高，层级分明，视觉轻盈
 * 2. 智能感知方向 (BUY 核心买点 vs WATCH 观望风控拦截)，避免误把瀑布接飞刀当买点
 * 3. AI 穿透分析剧本结构化分段排版 (盘面诊断 / 板块归因 / 风控警示)，告别密不透风的文字墙
 * 4. 操盘点位看板与主次操作按钮黄金比例对齐
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Target,
  Bot,
  AlertTriangle
} from 'lucide-react';
import { QuantSignal, StockQuote } from '../types/stock';
import { aiPaperTrader } from '../services/aiPaperTrader';
import { androidBridge } from '../services/androidBridge';

interface Props {
  signal: QuantSignal;
  stocks: StockQuote[];
  onOpenStockDetail: (stock: StockQuote) => void;
  defaultExpanded?: boolean;
}

export const MobileAlertDrawerItem: React.FC<Props> = ({
  signal,
  stocks,
  onOpenStockDetail,
  defaultExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [isBuying, setIsBuying] = useState<boolean>(false);

  React.useEffect(() => {
    if (defaultExpanded) {
      setIsExpanded(true);
    }
  }, [defaultExpanded]);

  // 策略与方向判断
  const isWatchOnly = signal.direction === 'WATCH';
  const isPlungeDip = signal.strategy === 'PLUNGE_DIP';
  const isBreakout = signal.strategy === 'OPENING_BREAKOUT';
  const isKnifeWarning = signal.strategy === 'DIP_EXHAUSTION' || signal.strategyName.includes('卖压') || signal.strategyName.includes('等待');

  // 策略徽标色彩体系 (M3 Tonal Chips)
  let badgeBg = 'bg-amber-500/15 border-amber-500/35 text-amber-300';
  let badgeText = '⚖️ 微波震荡';

  if (isKnifeWarning || isWatchOnly) {
    badgeBg = 'bg-rose-500/20 border-rose-500/40 text-rose-300';
    badgeText = '⚠️ 卖压观望';
  } else if (isPlungeDip) {
    badgeBg = 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300';
    badgeText = '⚡ 急跌抄底';
  } else if (isBreakout) {
    badgeBg = 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300';
    badgeText = '🚀 放量突破';
  }

  // 手动触发模拟建仓
  const handleSimulateBuy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWatchOnly) {
      androidBridge.showToast('⚠️ 当前标的卖压沉重/处于空头瀑布，建议等待右侧企稳，暂不宜开仓');
      return;
    }
    setIsBuying(true);
    // 默认按 $270 (初始 3000 美元的 9%) 建仓
    const targetAmount = 270.0;
    const ok = aiPaperTrader.executeBuy(signal, targetAmount);
    setTimeout(() => setIsBuying(false), 800);
  };

  const handleOpenDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    const found = stocks.find((s) => s.symbol.toUpperCase() === signal.symbol.toUpperCase());
    if (found) {
      onOpenStockDetail(found);
    }
  };

  return (
    <div
      onClick={() => setIsExpanded(!isExpanded)}
      className={`rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer select-none ${
        isExpanded
          ? 'bg-[#141824] border-blue-500/40 shadow-lg'
          : 'bg-[#10131b] hover:bg-[#141722] border-[#222736] shadow-xs active:scale-[0.99]'
      }`}
    >
      {/* ========================================================================= */}
      {/* 1. 折叠态长条消息条 (高度 54dp，紧凑克制)                                  */}
      {/* ========================================================================= */}
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
        {/* 左侧：策略胶囊 + 标的代码 + 名称 */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border shrink-0 ${badgeBg}`}>
            {badgeText}
          </span>
          <div className="flex items-baseline gap-1.5 truncate">
            <span className="font-extrabold text-white text-sm font-mono tracking-tight">
              {signal.symbol}
            </span>
            <span className="text-slate-400 text-xs truncate font-sans max-w-[80px] sm:max-w-[120px]">
              {signal.name}
            </span>
          </div>
        </div>

        {/* 右侧：现价 + 跌幅 + 预估胜率 + 展开箭头 */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 font-mono text-xs">
          <div className="text-right">
            <span className="font-bold text-white block">
              ${signal.currentPrice.toFixed(2)}
            </span>
            <span
              className={`text-[10px] font-semibold block leading-tight ${
                signal.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {signal.changePercent >= 0 ? '+' : ''}
              {signal.changePercent.toFixed(2)}%
            </span>
          </div>

          {/* 预估胜率微标签 */}
          <span
            className={`hidden xs:inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
              isWatchOnly || signal.winRateEstimate < 70
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {isWatchOnly ? `风控 ${signal.winRateEstimate}%` : `胜率 ${signal.winRateEstimate}%`}
          </span>

          {/* 展开指示箭头 */}
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              isExpanded ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. 展开态抽屉内容区 (模块化信息架构)                                      */}
      {/* ========================================================================= */}
      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-1.5 border-t border-white/5 space-y-2.5 bg-[#0c0f16]/90 animate-fade-in">
          {/* 4 维量化核心指标速览条 */}
          <div className="grid grid-cols-4 gap-1.5 bg-black/40 p-2 rounded-xl border border-white/5 font-mono text-center text-xs">
            <div>
              <div className="text-[10px] text-slate-400 font-sans">现价</div>
              <div className="font-bold text-white mt-0.5">${signal.currentPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">涨跌幅</div>
              <div className={`font-bold mt-0.5 ${signal.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">RSI(6)</div>
              <div className={`font-bold mt-0.5 ${signal.rsi6 <= 25 ? 'text-rose-400' : 'text-amber-300'}`}>
                {signal.rsi6.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">预估胜率</div>
              <div
                className={`font-bold mt-0.5 ${
                  signal.winRateEstimate >= 80 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {signal.winRateEstimate}%
              </div>
            </div>
          </div>

          {/* 若为高危卖压/空头瀑布，渲染专属醒目风控警示条 */}
          {isWatchOnly && (
            <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-rose-300 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>风控拦截：卖压严重 · 严禁左侧接飞刀</span>
              </div>
              <p className="text-[11px] text-rose-200/80 leading-relaxed font-sans">
                标的出现单边空头瀑布下杀 (多因财报不及预期或黑天鹅)，当前下方无均线支撑，RSI 存在严重超卖钝化风险。模型已降为【观察等待】，请等待右侧放量企稳收阳。
              </p>
            </div>
          )}

          {/* AI 穿透分析剧本 (结构化排版) */}
          <div className="bg-[#131622] p-2.5 rounded-xl border border-white/5 space-y-1.5 text-xs">
            <div className="text-amber-300 font-bold flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>AI 穿透分析剧本与因果逻辑</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                周期 [{signal.timeframe}]
              </span>
            </div>
            <p className="text-[11.5px] text-slate-300 leading-relaxed font-sans select-text">
              {signal.naturalAnalysis || signal.thesis}
            </p>
          </div>

          {/* 操盘风控点位 */}
          <div className="grid grid-cols-3 gap-1.5 bg-black/30 p-2 rounded-xl border border-white/5 font-mono text-xs">
            <div className="text-center">
              <span className="text-[10px] text-slate-400 font-sans block">建议止损</span>
              <span className="font-bold text-rose-400">${signal.stopLoss.toFixed(2)}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-slate-400 font-sans block">第一止盈</span>
              <span className="font-bold text-emerald-400">${signal.takeProfit1.toFixed(2)}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-slate-400 font-sans block">建议持仓</span>
              <span className="font-bold text-blue-300 truncate block text-[11px]">{signal.expectedHoldingHours}</span>
            </div>
          </div>

          {/* 交互操作栏 (主次按钮分明) */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={handleOpenDetail}
              className="flex-1 py-2 rounded-xl bg-[#191d2a] hover:bg-[#23293b] text-slate-300 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border border-white/5"
            >
              <span>查看K线</span>
              <ArrowRight className="w-3 h-3" />
            </button>

            <button
              onClick={handleSimulateBuy}
              disabled={isBuying || isWatchOnly}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ${
                isWatchOnly
                  ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-80'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white disabled:opacity-50'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>
                {isWatchOnly
                  ? '⚠️ 观望中 (暂不建议买入)'
                  : isBuying
                  ? '模拟建仓中...'
                  : 'AI 模拟买入 (~$270)'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
