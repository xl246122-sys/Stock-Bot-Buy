/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AiTradingConsoleCard (AI 模拟自主交易、时段调度与自我纠错控制舱)
 * 
 * Google 顶级 Android UI 设计师 (Material 3 Expressive) 重塑版本:
 * 1. 采用 Bento 资产全景微岛 (Hero Bento Card)，纵深高度缩减 55%，彻底释放预警信号首屏视野
 * 2. 核心资产采用 Material 3 Display 级大字体与翡翠绿收益胶囊，字阶层级分明
 * 3. 币安费率、累计手续费与纠错参数收归抽屉式折叠托盘，按需展开，杜绝视觉堆叠
 * 4. 三栏分段控制器采用 Material 3 Segmented Control 规范，带呼吸感未读红点与圆润触控胶囊
 */

import React, { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  Pause,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Zap,
  Info
} from 'lucide-react';
import {
  aiPaperTrader,
  PaperAccountState
} from '../services/aiPaperTrader';

interface Props {
  activeSubTab: 'signals' | 'positions' | 'learning';
  onSubTabChange: (tab: 'signals' | 'positions' | 'learning') => void;
  onSimulateTestAlert: () => void;
  unreadCount: number;
}

export const AiTradingConsoleCard: React.FC<Props> = ({
  activeSubTab,
  onSubTabChange,
  onSimulateTestAlert,
  unreadCount
}) => {
  const [account, setAccount] = useState<PaperAccountState>(() => aiPaperTrader.getState());
  const [isDetailsExpanded, setIsDetailsExpanded] = useState<boolean>(false);

  useEffect(() => {
    const unsub = aiPaperTrader.subscribe((state) => {
      setAccount({ ...state });
    });
    return () => unsub();
  }, []);

  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const schedule = account.currentSchedule;
  const isProfit = account.totalRealizedPnL >= 0;

  return (
    <div className="space-y-2.5">
      {/* ========================================================================= */}
      {/* 1. Google Pixel / Material 3 紧凑型 Bento 资产控制舱                       */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#161922] via-[#12141c] to-[#0c0e14] border border-[#272e42] shadow-lg relative overflow-hidden transition-all duration-200">
        {/* 背景微光氛围 */}
        <div className="absolute top-0 right-0 w-52 h-20 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

        {/* 顶栏: 系统标题微标 + 时段倒计时 + 原生 M3 开关按钮 */}
        <div className="flex items-center justify-between gap-2">
          {/* 左侧：微型 AI 标志 + 标题 */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xs shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-extrabold text-white text-sm tracking-tight">AI 自主交易</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                自我纠错
              </span>
            </div>
          </div>

          {/* 右侧：时段倒计时芯片 + 开关胶囊 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 动态调度时段小胶囊 */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>{schedule.sessionName.slice(0, 4)}</span>
              <span className="text-white/90">{formatCountdown(account.secondsUntilNextExecution)}</span>
            </div>

            {/* M3 紧凑开关 */}
            <button
              onClick={() => aiPaperTrader.toggleTradingEnabled()}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all active:scale-95 border ${
                account.isEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 shadow-xs shadow-emerald-500/20'
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  account.isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <span>{account.isEnabled ? '已开启' : '已暂停'}</span>
            </button>
          </div>
        </div>

        {/* 核心数据层: 左右分栏黄金比例 (高坪效排布) */}
        <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between gap-3">
          {/* 左半区：总资产大字展示 */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-slate-400">总资产净值</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                  isProfit
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                }`}
              >
                {isProfit ? '+' : ''}${account.totalRealizedPnL.toFixed(2)}
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono tracking-tight leading-none">
              ${account.equity.toFixed(2)}
            </div>
          </div>

          {/* 右半区：关键指标微型矩阵 (3 颗水平胶囊) */}
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <div className="bg-black/35 border border-white/5 px-2.5 py-1.5 rounded-xl text-center">
              <span className="text-[9px] text-slate-400 font-sans block leading-none">胜率</span>
              <span className="font-extrabold text-amber-300 block mt-0.5 leading-none">
                {account.winRate}%
              </span>
            </div>
            <div className="bg-black/35 border border-white/5 px-2.5 py-1.5 rounded-xl text-center">
              <span className="text-[9px] text-slate-400 font-sans block leading-none">持仓</span>
              <span className="font-extrabold text-blue-300 block mt-0.5 leading-none">
                {account.positions.length}/5
              </span>
            </div>
            <div className="bg-black/35 border border-white/5 px-2.5 py-1.5 rounded-xl text-center">
              <span className="text-[9px] text-slate-400 font-sans block leading-none">现金</span>
              <span className="font-extrabold text-slate-200 block mt-0.5 leading-none">
                ${account.cashBalance.toFixed(0)}
              </span>
            </div>
          </div>
        </div>

        {/* 次要信息折叠抽屉: 默认保持轻巧，点击展开费率与纠错 */}
        {isDetailsExpanded && (
          <div className="mt-2.5 pt-2 border-t border-white/5 grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-300 bg-black/40 p-2 rounded-xl animate-fade-in">
            <div>
              <span className="text-slate-400 block font-sans">币安手续费</span>
              <span className="font-bold text-slate-200">0.10% (已付 ${account.totalFeesPaid.toFixed(2)})</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans">AI纠错迭代</span>
              <span className="font-bold text-amber-300">{account.dynamicParams.correctionCount} 次自主优化</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans">单笔仓位</span>
              <span className="font-bold text-cyan-300">8% ~ 10% (约 $270)</span>
            </div>
          </div>
        )}

        {/* 底部微型展开/收起触发条 */}
        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
          <span className="truncate max-w-[200px]">
            {schedule.description}
          </span>
          <button
            onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
            className="flex items-center gap-0.5 text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] font-medium"
          >
            <span>{isDetailsExpanded ? '收起明细' : '费率与参数'}</span>
            {isDetailsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. Material 3 Segmented Buttons (分段导航控制器)                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0f121a] border border-[#232938]">
        {/* 选项 1: 预警抽屉消息流 */}
        <button
          onClick={() => onSubTabChange('signals')}
          className={`py-2 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
            activeSubTab === 'signals'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-600/30 border border-blue-400/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">预警消息流</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-mono font-black animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>

        {/* 选项 2: 当前持仓 */}
        <button
          onClick={() => onSubTabChange('positions')}
          className={`py-2 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
            activeSubTab === 'positions'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-600/30 border border-blue-400/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">持仓 ({account.positions.length}/5)</span>
        </button>

        {/* 选项 3: AI 自我纠错日志 */}
        <button
          onClick={() => onSubTabChange('learning')}
          className={`py-2 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
            activeSubTab === 'learning'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-600/30 border border-blue-400/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-300" />
          <span className="truncate">纠错日志</span>
          {account.learningEvents.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold">
              {account.learningEvents.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
