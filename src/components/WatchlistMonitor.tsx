/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WatchlistMonitor (持仓盯盘 & 移动止损自动平仓引擎)
 * Material 3 Expressive Card Architecture with 44px+ touch targets & Trailing Stop Visuals
 */

import React, { useState } from 'react';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  BellRing,
  ToggleLeft,
  ToggleRight,
  Shield,
  Eye,
  CheckCircle2,
  Cpu,
  Zap,
  History,
  Activity,
  ChevronRight
} from 'lucide-react';
import {
  MonitoredPosition,
  StockQuote,
  StrategyType,
  AutoTradeConfig,
  TradeExecutionLog,
  AutoTradeCloseReason
} from '../types/stock';
import { PortfolioPnLChart } from './PortfolioPnLChart';
import { AutoTradeLogsPanel } from './AutoTradeLogsPanel';

interface WatchlistMonitorProps {
  positions: MonitoredPosition[];
  onRemovePosition: (id: string) => void;
  onUpdatePosition: (pos: MonitoredPosition) => void;
  onAddPosition: (newPos: Omit<MonitoredPosition, 'id'>) => void;
  quotesMap: Map<string, StockQuote>;
  onSelectStock: (symbol: string) => void;
  autoTradeConfig: AutoTradeConfig;
  onUpdateAutoTradeConfig: (config: AutoTradeConfig) => void;
  tradeLogs: TradeExecutionLog[];
  onClearTradeLogs: () => void;
  onExecuteMockClose: (pos: MonitoredPosition, reason: AutoTradeCloseReason, reasonDetail: string) => void;
  onTriggerTestOrder?: () => void;
}

export const WatchlistMonitor: React.FC<WatchlistMonitorProps> = ({
  positions,
  onRemovePosition,
  onUpdatePosition,
  onAddPosition,
  quotesMap,
  onSelectStock,
  autoTradeConfig,
  onUpdateAutoTradeConfig,
  tradeLogs,
  onClearTradeLogs,
  onExecuteMockClose,
  onTriggerTestOrder,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'POSITIONS' | 'TRADE_LOGS'>('POSITIONS');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<MonitoredPosition | null>(null);

  // New position form states
  const [newSymbol, setNewSymbol] = useState('');
  const [newEntryPrice, setNewEntryPrice] = useState('');
  const [newQuantity, setNewQuantity] = useState('100');
  const [newTargetProfit, setNewTargetProfit] = useState('3.0');
  const [newStopLoss, setNewStopLoss] = useState('2.0');
  const [newStrategy, setNewStrategy] = useState<StrategyType>('PLUNGE_DIP');
  const [newTrailingEnabled, setNewTrailingEnabled] = useState(true);
  const [newTrailingActivation, setNewTrailingActivation] = useState('1.8');
  const [newTrailingCallback, setNewTrailingCallback] = useState('0.8');
  const [newAlertDropPercent, setNewAlertDropPercent] = useState('-2.5');
  const [newAlertLossAmount, setNewAlertLossAmount] = useState('-200');
  const [newAlertOverboughtRsi, setNewAlertOverboughtRsi] = useState('72');

  // Edit trailing & alert plan form states
  const [editTrailingEnabled, setEditTrailingEnabled] = useState(true);
  const [editTrailingActivation, setEditTrailingActivation] = useState('1.8');
  const [editTrailingCallback, setEditTrailingCallback] = useState('0.8');
  const [editTargetProfit, setEditTargetProfit] = useState('3.0');
  const [editStopLoss, setEditStopLoss] = useState('2.0');
  const [editAlertDropPercent, setEditAlertDropPercent] = useState('-2.5');
  const [editAlertLossAmount, setEditAlertLossAmount] = useState('-200');
  const [editAlertOverboughtRsi, setEditAlertOverboughtRsi] = useState('72');

  // Calculate totals
  let totalCost = 0;
  let totalCurrentVal = 0;
  let breakevenLockedCount = 0;
  let trailingActiveCount = 0;

  positions.forEach((p) => {
    const live = quotesMap.get(p.symbol);
    const currPrice = live ? live.price : p.currentPrice;
    totalCost += p.entryPrice * p.quantity;
    totalCurrentVal += currPrice * p.quantity;

    if (p.isTrailingEnabled) {
      trailingActiveCount++;
      const currentHighest = Math.max(p.highestPriceSinceEntry || p.entryPrice, currPrice);
      const currentProfitPct = ((currPrice - p.entryPrice) / p.entryPrice) * 100;
      const highestProfitPct = ((currentHighest - p.entryPrice) / p.entryPrice) * 100;
      const activationPct = p.trailingActivationPercent ?? 1.8;

      if (p.isBreakevenLocked || currentProfitPct >= activationPct || highestProfitPct >= activationPct) {
        breakevenLockedCount++;
      }
    }
  });

  const totalPnL = totalCurrentVal - totalCost;
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim() || !newEntryPrice) return;

    const sym = newSymbol.trim().toUpperCase();
    const live = quotesMap.get(sym);
    const name = live ? live.name : sym;
    const price = parseFloat(newEntryPrice);

    onAddPosition({
      symbol: sym,
      name,
      entryPrice: price,
      quantity: parseInt(newQuantity) || 100,
      currentPrice: live ? live.price : price,
      targetProfitPercent: parseFloat(newTargetProfit) || 3.0,
      stopLossPercent: parseFloat(newStopLoss) || 2.0,
      entryDate: new Date().toLocaleDateString('zh-CN'),
      strategyUsed: newStrategy,
      highestPriceSinceEntry: price,
      isAlertedProfit: false,
      isAlertedLoss: false,
      isTrailingEnabled: newTrailingEnabled,
      trailingActivationPercent: parseFloat(newTrailingActivation) || 1.8,
      trailingCallbackPercent: parseFloat(newTrailingCallback) || 0.8,
      isBreakevenLocked: false,
      isTrailingTriggered: false,
      alertDropPercent: parseFloat(newAlertDropPercent) || -2.5,
      alertLossAmount: parseFloat(newAlertLossAmount) || -200,
      alertOverboughtRsi: parseFloat(newAlertOverboughtRsi) || 72,
    });

    setNewSymbol('');
    setNewEntryPrice('');
    setShowAddModal(false);
  };

  const openEditModal = (pos: MonitoredPosition) => {
    setEditingPosition(pos);
    setEditTrailingEnabled(pos.isTrailingEnabled ?? true);
    setEditTrailingActivation((pos.trailingActivationPercent ?? 1.8).toString());
    setEditTrailingCallback((pos.trailingCallbackPercent ?? 0.8).toString());
    setEditTargetProfit(pos.targetProfitPercent.toString());
    setEditStopLoss(pos.stopLossPercent.toString());
    setEditAlertDropPercent((pos.alertDropPercent ?? -2.5).toString());
    setEditAlertLossAmount((pos.alertLossAmount ?? -200).toString());
    setEditAlertOverboughtRsi((pos.alertOverboughtRsi ?? 72).toString());
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPosition) return;

    const updated: MonitoredPosition = {
      ...editingPosition,
      isTrailingEnabled: editTrailingEnabled,
      trailingActivationPercent: parseFloat(editTrailingActivation) || 1.8,
      trailingCallbackPercent: parseFloat(editTrailingCallback) || 0.8,
      targetProfitPercent: parseFloat(editTargetProfit) || 3.0,
      stopLossPercent: parseFloat(editStopLoss) || 2.0,
      alertDropPercent: parseFloat(editAlertDropPercent) || -2.5,
      alertLossAmount: parseFloat(editAlertLossAmount) || -200,
      alertOverboughtRsi: parseFloat(editAlertOverboughtRsi) || 72,
    };

    onUpdatePosition(updated);
    setEditingPosition(null);
  };

  const handleQuickToggleTrailing = (pos: MonitoredPosition) => {
    const updated: MonitoredPosition = {
      ...pos,
      isTrailingEnabled: !pos.isTrailingEnabled,
      trailingActivationPercent: pos.trailingActivationPercent ?? 1.8,
      trailingCallbackPercent: pos.trailingCallbackPercent ?? 0.8,
    };
    onUpdatePosition(updated);
  };

  return (
    <div className="space-y-3">
      {/* Portfolio Overview KPI Cards (Google Material 3 Surfaces) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3.5 shadow-sm">
          <span className="text-slate-400 text-xs block mb-1 font-medium">持仓总市值</span>
          <span className="text-lg sm:text-xl font-bold font-mono text-white tabular-nums">
            ${totalCurrentVal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1 font-mono">成本: ${totalCost.toFixed(0)}</span>
        </div>

        <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3.5 shadow-sm">
          <span className="text-slate-400 text-xs block mb-1 font-medium">浮动盈亏</span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-lg sm:text-xl font-bold font-mono tabular-nums ${
                totalPnL >= 0 ? 'text-[#81c995]' : 'text-[#f28b82]'
              }`}
            >
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(1)}
            </span>
            <span
              className={`text-xs font-mono font-semibold ${
                totalPnLPercent >= 0 ? 'text-[#81c995]' : 'text-[#f28b82]'
              }`}
            >
              ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">24-48h 超短持仓</span>
        </div>

        <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 text-xs font-medium">移动保本锁定</span>
            <span className="w-2 h-2 rounded-full bg-[#81c995] animate-pulse" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold font-mono text-[#81c995] tabular-nums">
              {breakevenLockedCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ {positions.length} 标的已保本</span>
          </div>
          <span className="text-[11px] text-[#81c995] block mt-1 flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>杜绝利润回吐</span>
          </span>
        </div>

        <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3.5 flex flex-col justify-between shadow-sm">
          <span className="text-slate-400 text-xs block font-medium">持仓管理</span>
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full h-10 bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#041e42] font-bold text-xs rounded-full flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" />
            <span>添加监控持仓</span>
          </button>
        </div>
      </div>

      {/* Trailing Stop Explanation Card */}
      <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3 text-xs text-slate-300 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-500/15 text-[#8ab4f8] rounded-xl shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-white flex items-center gap-2">
              <span>移动止盈止损机制 (Trailing Stop-Loss 自动保本追踪)</span>
              <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold">
                保本算法运行中
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              浮盈达目标（默认 +1.8%），系统<strong className="text-emerald-400 font-semibold">自动将止损线平移至买入成本价</strong>；股价继续走高则动态上抬，杜绝利润回吐！
            </p>
          </div>
        </div>
      </div>

      {/* Auto-Trading Execution Logic Strip (Material 3 Banner) */}
      <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${
              autoTradeConfig.isEnabled
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">自动交易执行逻辑</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 ${
                  autoTradeConfig.isEnabled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    autoTradeConfig.isEnabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
                  }`}
                />
                {autoTradeConfig.isEnabled ? 'ON 自动执行中' : 'OFF 已暂停'}
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5 truncate">
              触及止盈线、硬止损线或动态保本触发时，调用 <span className="font-mono text-[#8ab4f8]">androidBridge</span> 模拟下单 API 进行自动平仓并记入日志。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveSubTab(activeSubTab === 'TRADE_LOGS' ? 'POSITIONS' : 'TRADE_LOGS')}
            className={`h-9 px-3 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer active:scale-[0.97] ${
              activeSubTab === 'TRADE_LOGS'
                ? 'bg-[#1b3764] text-[#8ab4f8] border-[#8ab4f8]'
                : 'bg-[#202430] text-slate-300 border-[#282e3c] hover:bg-[#282d3b]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>平仓日志 ({tradeLogs.length})</span>
          </button>

          <button
            onClick={() =>
              onUpdateAutoTradeConfig({
                ...autoTradeConfig,
                isEnabled: !autoTradeConfig.isEnabled,
              })
            }
            className={`transition-colors cursor-pointer active:scale-[0.95] ${
              autoTradeConfig.isEnabled ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-400'
            }`}
            title={autoTradeConfig.isEnabled ? '点击暂停自动交易执行' : '点击开启自动交易执行'}
          >
            {autoTradeConfig.isEnabled ? (
              <ToggleRight className="w-9 h-9" />
            ) : (
              <ToggleLeft className="w-9 h-9" />
            )}
          </button>
        </div>
      </div>

      {/* 7-Day Portfolio Total PnL Trend Chart */}
      <PortfolioPnLChart positions={positions} quotesMap={quotesMap} />

      {/* Positions / Logs Container */}
      <div className="bg-[#181b24] border border-[#282e3c] rounded-2xl overflow-hidden shadow-sm">
        {/* Sub-tab Navigation Header */}
        <div className="px-4 py-2.5 border-b border-[#282e3c] flex items-center justify-between text-xs bg-[#12151c]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('POSITIONS')}
              className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-[0.97] ${
                activeSubTab === 'POSITIONS'
                  ? 'bg-[#8ab4f8] text-[#041e42] shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>持仓标的监控 ({positions.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('TRADE_LOGS')}
              className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-[0.97] ${
                activeSubTab === 'TRADE_LOGS'
                  ? 'bg-[#8ab4f8] text-[#041e42] shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>平仓日志 ({tradeLogs.length})</span>
              {autoTradeConfig.isEnabled && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </div>
          <span className="text-slate-500 text-xs hidden sm:inline font-mono">
            {activeSubTab === 'POSITIONS' ? '高频秒级盯盘 · 达目标价自动执行' : 'Android Bridge 模拟撮合记录'}
          </span>
        </div>

        {activeSubTab === 'TRADE_LOGS' ? (
          <div className="p-3 sm:p-4">
            <AutoTradeLogsPanel
              logs={tradeLogs}
              onClearLogs={onClearTradeLogs}
              autoTradeConfig={autoTradeConfig}
              onUpdateConfig={onUpdateAutoTradeConfig}
              onTriggerTestOrder={onTriggerTestOrder}
            />
          </div>
        ) : positions.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            <p className="mb-3 text-sm">暂无监控持仓。点击上方“添加监控持仓”或在扫描池中点击“+自选”。</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="h-10 px-5 bg-[#8ab4f8] text-[#041e42] rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm active:scale-[0.97]"
            >
              <Plus className="w-4 h-4" />
              <span>添加第一笔持仓</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#282e3c]/70">
            {positions.map((pos) => {
              const live = quotesMap.get(pos.symbol);
              const currPrice = live ? live.price : pos.currentPrice;
              const pnl = (currPrice - pos.entryPrice) * pos.quantity;
              const pnlPercent = ((currPrice - pos.entryPrice) / pos.entryPrice) * 100;

              const highestPrice = Math.max(pos.highestPriceSinceEntry || pos.entryPrice, currPrice);
              const highestProfitPct = ((highestPrice - pos.entryPrice) / pos.entryPrice) * 100;

              const targetProfitPrice = pos.entryPrice * (1 + pos.targetProfitPercent / 100);
              const initialStopLossPrice = pos.entryPrice * (1 - pos.stopLossPercent / 100);

              const isTrailing = pos.isTrailingEnabled ?? true;
              const activationPct = pos.trailingActivationPercent ?? 1.8;
              const callbackPct = pos.trailingCallbackPercent ?? 0.8;

              const isBreakevenActive =
                pos.isBreakevenLocked || pnlPercent >= activationPct || highestProfitPct >= activationPct;

              const dynamicTrailingStopPrice = isBreakevenActive
                ? Math.max(pos.entryPrice, highestPrice * (1 - callbackPct / 100))
                : initialStopLossPrice;

              return (
                <div
                  key={pos.id}
                  className="p-3 sm:p-4 hover:bg-[#202430] transition-colors flex flex-col gap-2.5"
                >
                  {/* Row 1: Symbol, Strategy, Cost, Current, P&L */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => onSelectStock(pos.symbol)}
                        className="font-mono font-bold text-white hover:text-[#8ab4f8] text-base text-left truncate cursor-pointer transition-colors"
                      >
                        {pos.symbol}
                      </button>
                      <span className="text-xs text-slate-400 truncate max-w-[100px] sm:max-w-[150px]">
                        {pos.name}
                      </span>
                      <span className="text-[10px] text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/25 shrink-0 font-mono font-semibold">
                        {pos.strategyUsed === 'PLUNGE_DIP'
                          ? '抄底'
                          : pos.strategyUsed === 'OPENING_BREAKOUT'
                          ? '爆发'
                          : '微波'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono hidden xs:inline">
                        {pos.quantity}股
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-right font-mono shrink-0">
                      <div>
                        <span
                          className={`text-sm sm:text-base font-bold tabular-nums ${
                            live?.priceDirection === 'up'
                              ? 'text-[#81c995]'
                              : live?.priceDirection === 'down'
                              ? 'text-[#f28b82]'
                              : 'text-white'
                          }`}
                        >
                          ${currPrice.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-slate-400 ml-1.5 font-normal">
                          成本: ${pos.entryPrice.toFixed(1)}
                        </span>
                      </div>
                      <div
                        className={`text-xs font-bold tabular-nums px-2.5 py-1 rounded-full ${
                          pnl >= 0
                            ? 'bg-emerald-500/20 text-[#81c995] border border-emerald-500/30'
                            : 'bg-rose-500/20 text-[#f28b82] border border-rose-500/30'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(1)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Trailing Progress, Targets, Standard M3 Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#282e3c]/60">
                    <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                      {isTrailing && isBreakevenActive ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1 text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>已保本锁定: ${dynamicTrailingStopPrice.toFixed(2)}</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-[#12151c] text-slate-400 border border-[#282e3c] text-[11px]">
                          止损: ${initialStopLossPrice.toFixed(2)} (-{pos.stopLossPercent}%)
                        </span>
                      )}

                      <span className="bg-[#12151c] px-2.5 py-1 rounded-full text-slate-300 border border-[#282e3c] text-[11px]">
                        目标: ${targetProfitPrice.toFixed(2)} (+{pos.targetProfitPercent}%)
                      </span>

                      {live && (
                        <span className="bg-[#12151c] px-2.5 py-1 rounded-full border border-[#282e3c] text-[11px]">
                          <span className={live.rsi6 <= 22 ? 'text-rose-400 font-bold' : live.rsi6 >= 70 ? 'text-emerald-400 font-bold' : 'text-amber-300'}>
                            R6: {live.rsi6.toFixed(1)}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Standardized M3 Action Buttons (Unified h-9) */}
                    <div className="flex items-center gap-1.5 shrink-0 font-sans">
                      <button
                        onClick={() => {
                          const isProfit = currPrice >= pos.entryPrice;
                          onExecuteMockClose(
                            pos,
                            isProfit ? 'TAKE_PROFIT' : 'STOP_LOSS',
                            `手动执行模拟平仓 (${pos.symbol} @ $${currPrice.toFixed(2)})`
                          );
                        }}
                        className="h-9 px-3.5 text-xs font-bold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-full transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.97]"
                        title="立即通过 Android Bridge 执行模拟平仓"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>模拟平仓</span>
                      </button>

                      <button
                        onClick={() => openEditModal(pos)}
                        className="w-9 h-9 flex items-center justify-center text-slate-300 hover:text-white bg-[#202430] hover:bg-[#282d3b] rounded-full border border-[#282e3c] transition-colors cursor-pointer active:scale-[0.95]"
                        title="配置移动止损参数"
                      >
                        <Sliders className="w-4 h-4 text-[#8ab4f8]" />
                      </button>

                      <button
                        onClick={() => handleQuickToggleTrailing(pos)}
                        className={`h-9 px-3 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer border active:scale-[0.95] text-xs font-medium ${
                          isTrailing
                            ? 'bg-[#142c23] text-[#81c995] border-[#81c995]/40'
                            : 'bg-[#202430] text-slate-400 border-[#282e3c]'
                        }`}
                        title={isTrailing ? '已开启移动止损' : '未开启移动止损'}
                      >
                        {isTrailing ? <ToggleRight className="w-4 h-4 text-[#81c995]" /> : <ToggleLeft className="w-4 h-4" />}
                        <span>{isTrailing ? '保本开启' : '保本关闭'}</span>
                      </button>

                      <button
                        onClick={() => onSelectStock(pos.symbol)}
                        className="w-9 h-9 flex items-center justify-center text-[#8ab4f8] hover:text-white bg-[#202430] hover:bg-[#282d3b] rounded-full border border-[#282e3c] transition-colors cursor-pointer active:scale-[0.95]"
                        title="查看K线"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onRemovePosition(pos.id)}
                        className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-[#f28b82] bg-[#202430] hover:bg-[#282d3b] rounded-full border border-[#282e3c] transition-colors cursor-pointer active:scale-[0.95]"
                        title="移除监控"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Edit Trailing Stop */}
      {editingPosition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#181b24] border border-[#282e3c] rounded-3xl max-w-sm w-full p-5 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#282e3c] mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#8ab4f8]" />
                  <span>配置移动止损参数 ({editingPosition.symbol})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  成本: ${editingPosition.entryPrice.toFixed(2)} | 最新: $
                  {(quotesMap.get(editingPosition.symbol)?.price ?? editingPosition.currentPrice).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setEditingPosition(null)}
                className="w-8 h-8 rounded-full bg-[#202430] hover:bg-[#282d3b] flex items-center justify-center text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSave} className="space-y-3.5 text-xs">
              <div className="bg-[#12151c] border border-[#282e3c] rounded-2xl p-3 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-white text-xs block">启用移动止盈止损</span>
                  <span className="text-[11px] text-slate-400">
                    盈利达标后自动将止损移至成本保本点
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditTrailingEnabled(!editTrailingEnabled)}
                  className={`cursor-pointer transition-colors ${
                    editTrailingEnabled ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                >
                  {editTrailingEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                </button>
              </div>

              {editTrailingEnabled && (
                <div className="grid grid-cols-2 gap-2.5 bg-[#12151c] border border-[#282e3c] rounded-2xl p-3">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-medium">
                      保本激活门槛 (+%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={editTrailingActivation}
                      onChange={(e) => setEditTrailingActivation(e.target.value)}
                      className="w-full bg-[#181b24] border border-[#282e3c] rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-medium">
                      高点回调比例 (-%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={editTrailingCallback}
                      onChange={(e) => setEditTrailingCallback(e.target.value)}
                      className="w-full bg-[#181b24] border border-[#282e3c] rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-medium">目标止盈率 (+%)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editTargetProfit}
                    onChange={(e) => setEditTargetProfit(e.target.value)}
                    className="w-full bg-[#12151c] border border-[#282e3c] rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-medium">防守止损率 (-%)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editStopLoss}
                    onChange={(e) => setEditStopLoss(e.target.value)}
                    className="w-full bg-[#12151c] border border-[#282e3c] rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-[#12151c] border border-[#282e3c] rounded-2xl p-3 space-y-2.5">
                <div className="flex items-center gap-2 pb-1.5 border-b border-[#282e3c]">
                  <BellRing className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-white text-xs">实时监控预警方案设定</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1 font-medium">跌幅阈值 (-%)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={editAlertDropPercent}
                      onChange={(e) => setEditAlertDropPercent(e.target.value)}
                      className="w-full bg-[#181b24] border border-[#282e3c] rounded-lg px-2 py-1 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1 font-medium">浮亏金额 ($)</label>
                    <input
                      type="number"
                      step="10"
                      required
                      value={editAlertLossAmount}
                      onChange={(e) => setEditAlertLossAmount(e.target.value)}
                      className="w-full bg-[#181b24] border border-[#282e3c] rounded-lg px-2 py-1 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1 font-medium">超买 RSI 线</label>
                    <input
                      type="number"
                      step="1"
                      required
                      value={editAlertOverboughtRsi}
                      onChange={(e) => setEditAlertOverboughtRsi(e.target.value)}
                      className="w-full bg-[#181b24] border border-[#282e3c] rounded-lg px-2 py-1 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#282e3c]">
                <button
                  type="button"
                  onClick={() => setEditingPosition(null)}
                  className="h-10 px-4 bg-[#202430] hover:bg-[#282d3b] text-slate-300 rounded-full text-xs font-semibold cursor-pointer active:scale-[0.97]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#041e42] font-bold rounded-full text-xs shadow-sm cursor-pointer active:scale-[0.97]"
                >
                  保存配置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New Position */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#181b24] border border-[#282e3c] rounded-3xl max-w-sm w-full p-5 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#282e3c] mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#8ab4f8]" />
                <span>添加持仓 / 移动止损监控</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-[#202430] hover:bg-[#282d3b] flex items-center justify-center text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 text-xs mb-1 font-medium">股票代码 (如 NVDA, TSLA)</label>
                <input
                  type="text"
                  required
                  placeholder="TSLA"
                  value={newSymbol}
                  onChange={(e) => {
                    const sym = e.target.value.toUpperCase();
                    setNewSymbol(sym);
                    const q = quotesMap.get(sym);
                    if (q) setNewEntryPrice(q.price.toString());
                  }}
                  className="w-full bg-[#12151c] border border-[#282e3c] rounded-xl px-3 py-2 text-white font-mono uppercase text-xs focus:border-[#8ab4f8] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-300 text-xs mb-1 font-medium">买入单价 ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="245.50"
                    value={newEntryPrice}
                    onChange={(e) => setNewEntryPrice(e.target.value)}
                    className="w-full bg-[#12151c] border border-[#282e3c] rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs mb-1 font-medium">持股数量</label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    className="w-full bg-[#12151c] border border-[#282e3c] rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                  />
                </div>
              </div>

              {/* Trailing stop toggle */}
              <div className="bg-[#12151c] border border-[#282e3c] rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-white font-semibold">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>自动移动止损 (Trailing Stop)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewTrailingEnabled(!newTrailingEnabled)}
                    className={`cursor-pointer transition-colors ${
                      newTrailingEnabled ? 'text-emerald-400' : 'text-slate-600'
                    }`}
                  >
                    {newTrailingEnabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                  </button>
                </div>

                {newTrailingEnabled && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#282e3c]">
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">保本门槛 (+%)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={newTrailingActivation}
                        onChange={(e) => setNewTrailingActivation(e.target.value)}
                        className="w-full bg-[#181b24] border border-[#282e3c] rounded-lg px-2 py-1 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">高点回调 (-%)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={newTrailingCallback}
                        onChange={(e) => setNewTrailingCallback(e.target.value)}
                        className="w-full bg-[#181b24] border border-[#282e3c] rounded-lg px-2 py-1 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-medium">止盈率 (+%)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newTargetProfit}
                    onChange={(e) => setNewTargetProfit(e.target.value)}
                    className="w-full bg-[#12151c] border border-[#282e3c] rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-medium">止损率 (-%)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newStopLoss}
                    onChange={(e) => setNewStopLoss(e.target.value)}
                    className="w-full bg-[#12151c] border border-[#282e3c] rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-[#8ab4f8] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-xs mb-1 font-medium">归属交易模型</label>
                <select
                  value={newStrategy}
                  onChange={(e) => setNewStrategy(e.target.value as StrategyType)}
                  className="w-full h-10 bg-[#12151c] border border-[#282e3c] rounded-xl px-3 text-white text-xs focus:border-[#8ab4f8] focus:outline-none"
                >
                  <option value="PLUNGE_DIP">暴跌抄底 (TPS 均值回归)</option>
                  <option value="OPENING_BREAKOUT">开盘爆发突破 (ORB)</option>
                  <option value="RANGE_OSCILLATOR">区间微波震荡 (通道套利)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#282e3c]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-10 px-4 bg-[#202430] hover:bg-[#282d3b] text-slate-300 rounded-full text-xs font-semibold cursor-pointer active:scale-[0.97]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#041e42] font-bold rounded-full text-xs shadow-sm cursor-pointer active:scale-[0.97]"
                >
                  加入监控
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
