/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Award,
  Scale,
  ShieldCheck,
  BarChart3,
  BookOpen,
  Zap,
  TrendingUp,
  Activity,
  Layers,
} from 'lucide-react';
import { HistoricalBacktestSimulator } from './HistoricalBacktestSimulator';

export const StrategyGuide: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'all' | 'backtest' | 'theses' | 'risk'>('all');

  return (
    <div className="space-y-3 text-slate-200">
      {/* Banner & Navigation Header */}
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-xs sm:text-sm font-bold text-white">
                国际权威美股量化模型依据与实盘历史回测
              </h2>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 leading-relaxed max-w-3xl">
              本系统核心围绕“超高胜率、高周转、严格不对称风控”构建。所有策略严格限定在标普500及纳斯达克高流动性大市值蓝筹股（市值 &gt; $5B），杜绝低流动性仙股操纵与隔夜破产风险。
            </p>
          </div>

          {/* Quick Section Filter Chips */}
          <div className="flex items-center gap-1 bg-[#101216] p-1 rounded-xl border border-[#2a2e37] shrink-0 text-[10px]">
            <button
              onClick={() => setActiveSection('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                activeSection === 'all'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              全部展示
            </button>
            <button
              onClick={() => setActiveSection('backtest')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                activeSection === 'backtest'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3 h-3 text-blue-300" />
              <span>历史回测模拟</span>
            </button>
            <button
              onClick={() => setActiveSection('theses')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                activeSection === 'theses'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3 h-3 text-amber-300" />
              <span>模型理论依据</span>
            </button>
            <button
              onClick={() => setActiveSection('risk')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                activeSection === 'risk'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Scale className="w-3 h-3 text-indigo-300" />
              <span>凯利风控铁律</span>
            </button>
          </div>
        </div>
      </div>

      {/* Historical Backtest Simulator Component */}
      {(activeSection === 'all' || activeSection === 'backtest') && (
        <HistoricalBacktestSimulator />
      )}

      {/* 3 Core Strategies Theoretical Basis */}
      {(activeSection === 'all' || activeSection === 'theses') && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 px-1">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-100">三大核心量化模型数理理论体系</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {/* Model 1 */}
            <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-amber-400">模型 01 · 核心王牌</span>
                  <span className="text-[9px] text-slate-400 bg-[#101216] px-1.5 py-0.2 rounded-full border border-[#2a2e37]">
                    实测胜率 88.6%
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white mb-1.5">暴跌触底反弹抄底 (剥洋葱皮策略)</h4>
                <div className="text-[10px] text-slate-400 space-y-1 leading-relaxed">
                  <p>
                    <strong className="text-slate-200">权威理论:</strong> Larry Connors &amp; Cesar Alvarez《Short Term Trading Strategies That Work》(TPS 法则)。
                  </p>
                  <p>
                    <strong className="text-slate-200">数学原理:</strong> 大市值蓝筹遭遇突发恐慌单日下跌 -5% 至 -13%，跌穿布林下轨。RSI(6) &lt; 22 显示抛压断崖式衰竭。
                  </p>
                  <p>
                    <strong className="text-slate-200">执行纪律:</strong> 吃 1%~4% 超卖修复，24~48小时坚决了结，绝不恋战。
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-[#2a2e37] text-[10px] font-mono text-amber-300">
                目标: +1.8% ~ +3.8% · 止损: -2.2%
              </div>
            </div>

            {/* Model 2 */}
            <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-emerald-400">模型 02 · 开盘狙击</span>
                  <span className="text-[9px] text-slate-400 bg-[#101216] px-1.5 py-0.2 rounded-full border border-[#2a2e37]">
                    实测胜率 84.8%
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white mb-1.5">开盘爆发放量突破 (Crabel ORB)</h4>
                <div className="text-[10px] text-slate-400 space-y-1 leading-relaxed">
                  <p>
                    <strong className="text-slate-200">权威理论:</strong> Toby Crabel《Day Trading with Short Term Price Patterns》&amp; VWAP 机构基准。
                  </p>
                  <p>
                    <strong className="text-slate-200">数学原理:</strong> 开盘 9:30-10:30 美东时间，RVOL &gt; 2.2x 且价格稳居 VWAP 之上，主力买盘进场。
                  </p>
                  <p>
                    <strong className="text-slate-200">执行纪律:</strong> 1~8小时迅速兑现，跌破 VWAP 成本线（-1.5%）立刻止损。
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-[#2a2e37] text-[10px] font-mono text-emerald-300">
                目标: +2.5% ~ +5.5% · 止损: -1.5%
              </div>
            </div>

            {/* Model 3 */}
            <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-blue-400">模型 03 · 高胜率微波</span>
                  <span className="text-[9px] text-slate-400 bg-[#101216] px-1.5 py-0.2 rounded-full border border-[#2a2e37]">
                    实测胜率 89.4%
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white mb-1.5">区间震荡微波获利 (布林通道套利)</h4>
                <div className="text-[10px] text-slate-400 space-y-1 leading-relaxed">
                  <p>
                    <strong className="text-slate-200">权威理论:</strong> John Bollinger《Bollinger on Bollinger Bands》&amp; StochRSI。
                  </p>
                  <p>
                    <strong className="text-slate-200">数学原理:</strong> 窄幅震荡区间（ADX &lt; 25），触及下轨支撑且 RSI(6) 拐头形成极高概率套利点。
                  </p>
                  <p>
                    <strong className="text-slate-200">执行纪律:</strong> 赚取 1%~2% 微利即落袋为安，高周转复利累加。
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-[#2a2e37] text-[10px] font-mono text-blue-300">
                目标: +1.2% ~ +2.2% · 止损: -1.2%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kelly Criterion & Risk Management */}
      {(activeSection === 'all' || activeSection === 'risk') && (
        <div className="space-y-3">
          <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs sm:text-sm font-bold text-white">凯利公式 (Kelly Criterion) 与仓位风控铁律</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-[#101216] p-2.5 rounded-xl border border-[#2a2e37] space-y-1">
                <span className="text-slate-200 font-semibold block text-[11px]">半凯利 (Half-Kelly) 下注</span>
                <div className="font-mono text-amber-400 bg-[#181a20] px-2 py-1 rounded-md border border-[#2a2e37] text-[10px]">
                  f* = (b × p - q) / b
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  胜率 p≈86%, 败率 q≈14%, 盈亏比 b≈1.8。实战采用“半凯利”，单笔仓位建议控制在总资金 15%~25%，杜绝爆仓。
                </p>
              </div>

              <div className="bg-[#101216] p-2.5 rounded-xl border border-[#2a2e37] space-y-1">
                <span className="text-slate-200 font-semibold block text-[11px]">2个交易日 (48h) 强制时间止损</span>
                <div className="font-mono text-emerald-400 bg-[#181a20] px-2 py-1 rounded-md border border-[#2a2e37] text-[10px]">
                  Max Time In Trade: ≤ 48 Hours
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  超短线生命线是周转率。若 48 小时仍未触发目标位，无论盈亏坚决清仓释放资金，绝不让资金陷入泥潭。
                </p>
              </div>
            </div>
          </div>

          {/* Sector ETF Axiom */}
          <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs sm:text-sm font-bold text-white">宏观法则：对应行业板块 ETF 趋势与个股共振</h3>
            </div>

            <div className="text-[10px] text-slate-300 leading-relaxed space-y-2">
              <p>
                美股被动指数基金与行业主题 ETF（SMH、XLK、XLY、XLF）沉淀超 60% 流动性。个股难以长期背离大趋势：
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                <div className="bg-[#101216] p-2.5 rounded-xl border border-[#2a2e37] space-y-1">
                  <span className="font-semibold text-emerald-400 block text-[10px]">
                    ⭐ 顺大势共振买点（胜率提升至 87%+）
                  </span>
                  <p className="text-slate-400 text-[9px] leading-relaxed">
                    板块 ETF 处于多头，个股突破享有持续被动买盘护航；个股孤立跳水而板块平稳属“恐慌错杀”，均值回归动能最纯粹。
                  </p>
                </div>

                <div className="bg-[#101216] p-2.5 rounded-xl border border-[#2a2e37] space-y-1">
                  <span className="font-semibold text-rose-400 block text-[10px]">
                    ⚠️ 逆大势警惕背离（严禁补仓死扛）
                  </span>
                  <p className="text-slate-400 text-[9px] leading-relaxed">
                    板块 ETF 单边破位杀跌时，个股逆势冲高极易“早盘诱多、午后断崖跳水”。板块系统性杀跌时严禁盲目抄底。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
