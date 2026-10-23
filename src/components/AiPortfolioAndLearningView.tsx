/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AiPortfolioAndLearningView
 * 展示模拟持仓列表与 AI 自我学习纠错复盘日志
 */

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  BookOpen,
  RotateCcw,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  History,
  Bot
} from 'lucide-react';
import {
  aiPaperTrader,
  PaperAccountState,
  PaperPosition,
  PaperTradeRecord,
  AiLearningEvent
} from '../services/aiPaperTrader';
import { StockQuote } from '../types/stock';

interface Props {
  viewMode: 'positions' | 'learning';
  stocks: StockQuote[];
  onOpenStockDetail: (stock: StockQuote) => void;
}

export const AiPortfolioAndLearningView: React.FC<Props> = ({
  viewMode,
  stocks,
  onOpenStockDetail
}) => {
  const [account, setAccount] = useState<PaperAccountState>(() => aiPaperTrader.getState());

  useEffect(() => {
    const unsub = aiPaperTrader.subscribe((state) => {
      setAccount({ ...state });
    });
    return () => unsub();
  }, []);

  // 手动平仓
  const handleManualClose = (pos: PaperPosition) => {
    aiPaperTrader.closePosition(
      pos,
      'MANUAL',
      `用户手动指令平仓 (现价 $${pos.currentPrice.toFixed(2)})`
    );
  };

  // =========================================================================
  // VIEW 1: 当前模拟持仓 (Positions)
  // =========================================================================
  if (viewMode === 'positions') {
    return (
      <div className="space-y-3 animate-fade-in">
        {account.positions.length > 0 ? (
          <div className="space-y-2.5">
            {account.positions.map((pos) => {
              const isProfit = pos.unrealizedPnL >= 0;
              return (
                <div
                  key={pos.id}
                  className="p-3.5 rounded-2xl bg-[#11141c] border border-[#222838] space-y-2.5 shadow-sm"
                >
                  {/* 头部：标的、买入成本、当前盈亏 */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-base font-mono">
                          {pos.symbol}
                        </span>
                        <span className="text-xs text-slate-300 font-sans">{pos.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {pos.strategyName || '急跌抄底'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        入场时间: {pos.entryTime} · 持股: {pos.quantity} 股
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="text-sm font-extrabold text-white">
                        ${pos.currentPrice.toFixed(2)}
                      </div>
                      <div
                        className={`text-xs font-bold ${
                          isProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isProfit ? '+' : ''}${pos.unrealizedPnL.toFixed(2)} ({isProfit ? '+' : ''}
                        {pos.unrealizedPnLPercent.toFixed(2)}%)
                      </div>
                    </div>
                  </div>

                  {/* 操盘点位条 */}
                  <div className="grid grid-cols-3 gap-1.5 bg-black/40 p-2 rounded-xl border border-white/5 font-mono text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">建仓成本</span>
                      <span className="font-bold text-slate-200">${pos.entryPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">建议止盈</span>
                      <span className="font-bold text-emerald-400">${pos.targetProfitPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">风控止损</span>
                      <span className="font-bold text-rose-400">${pos.stopLossPrice.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* 快捷动作 */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs">
                    <span className="text-[11px] text-slate-400 font-mono">
                      寸头成本: <strong className="text-white">${pos.costBasis.toFixed(1)}</strong> (含币安费 ${pos.entryFee.toFixed(2)})
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const found = stocks.find((s) => s.symbol.toUpperCase() === pos.symbol.toUpperCase());
                          if (found) onOpenStockDetail(found);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#1a1f2c] text-blue-300 hover:text-white font-medium transition-colors"
                      >
                        查看K线
                      </button>
                      <button
                        onClick={() => handleManualClose(pos)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold transition-colors cursor-pointer"
                      >
                        手动平仓
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-[#11141c] border border-[#222838] rounded-3xl space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">当前无模拟持仓 (0 / 5)</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                AI 模拟自主交易引擎正严格等待高置信度 (胜率 ≥ {account.dynamicParams.minWinRateThreshold}%) 买入信号触发，或可在预警流中手动点击一键买入。
              </p>
            </div>
          </div>
        )}

        {/* 历史平仓战绩速览 */}
        {account.history.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-blue-400" />
                <span>最近平仓结算记录 ({account.history.length})</span>
              </span>
              <span className="font-mono text-slate-400 text-[11px]">
                累计扣除币安手续费: ${account.totalFeesPaid.toFixed(2)}
              </span>
            </div>

            <div className="space-y-1.5">
              {account.history.slice(0, 5).map((rec) => (
                <div
                  key={rec.id}
                  className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        rec.isWin ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span className="font-bold text-white">{rec.symbol}</span>
                    <span className="text-[10px] text-slate-400 font-sans">{rec.closeReasonZh}</span>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-bold ${
                        rec.isWin ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {rec.isWin ? '+' : ''}${rec.netPnL.toFixed(2)} ({rec.isWin ? '+' : ''}
                      {rec.netPnLPercent.toFixed(2)}%)
                    </span>
                    <span className="text-[10px] text-slate-500 block font-sans">
                      {rec.exitTime} · 持仓 {rec.holdingDurationMinutes}m
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: AI 自我学习与纠错复盘日志 (Learning & Self-Correction)
  // =========================================================================
  return (
    <div className="space-y-3 animate-fade-in">
      {/* 纠错参数看板 */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#1a1728] via-[#141220] to-[#0d0b14] border border-[#352a55] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white">AI 自适应动态权重因子状态</h4>
          </div>
          <span className="text-[10px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-500/30">
            已自我纠错 {account.dynamicParams.correctionCount} 次
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono bg-black/40 p-2 rounded-xl border border-white/5">
          <div>
            <span className="text-[10px] text-slate-400 font-sans block">准入胜率门槛</span>
            <span className="font-bold text-emerald-400 mt-0.5">
              ≥ {account.dynamicParams.minWinRateThreshold}%
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-sans block">超卖买入RSI</span>
            <span className="font-bold text-amber-300 mt-0.5">
              ≤ {account.dynamicParams.oversoldRsiThreshold}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-sans block">板块顺风保护</span>
            <span
              className={`font-bold mt-0.5 ${
                account.dynamicParams.strictSectorFilterActive ? 'text-cyan-300' : 'text-slate-400'
              }`}
            >
              {account.dynamicParams.strictSectorFilterActive ? '高敏感强校验' : '常规模式'}
            </span>
          </div>
        </div>
      </div>

      {/* 纠错反思事件列表 */}
      <div className="space-y-2.5">
        {account.learningEvents.map((evt) => (
          <div
            key={evt.id}
            className={`p-3.5 rounded-2xl border space-y-2 ${
              evt.type === 'CORRECTION'
                ? 'bg-[#181116] border-rose-500/30'
                : 'bg-[#10171d] border-cyan-500/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {evt.type === 'CORRECTION' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span className="text-xs font-bold text-white">{evt.title}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">{evt.timestamp}</span>
            </div>

            <div className="text-xs text-slate-300 space-y-1 font-sans">
              <div className="bg-black/30 p-2 rounded-lg border border-white/5 leading-relaxed">
                <span className="text-slate-400 font-semibold block text-[11px]">成因归因诊断:</span>
                {evt.diagnosis}
              </div>

              <div className="bg-black/30 p-2 rounded-lg border border-white/5 leading-relaxed">
                <span className="text-amber-300 font-semibold block text-[11px]">自适应纠错动作:</span>
                <span className="whitespace-pre-line text-slate-200">{evt.correctiveAction}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-white/5 flex items-center justify-between">
              <span>{evt.impactSummary}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
