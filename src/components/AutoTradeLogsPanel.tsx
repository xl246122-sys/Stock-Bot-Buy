/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Auto-Trade Execution Logs & Simulator Gateway Panel
 * Displays real-time auto-closed position history, execution latency,
 * realized profit & loss, and interface with Android Bridge mock order API.
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
  Sliders,
  Download,
  Trash2,
  Search,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  Info
} from 'lucide-react';
import { TradeExecutionLog, AutoTradeConfig, AutoTradeCloseReason } from '../types/stock';

interface AutoTradeLogsPanelProps {
  logs: TradeExecutionLog[];
  onClearLogs: () => void;
  autoTradeConfig: AutoTradeConfig;
  onUpdateConfig: (config: AutoTradeConfig) => void;
  onTriggerTestOrder?: () => void;
}

export const AutoTradeLogsPanel: React.FC<AutoTradeLogsPanelProps> = ({
  logs,
  onClearLogs,
  autoTradeConfig,
  onUpdateConfig,
  onTriggerTestOrder,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'PROFIT' | 'LOSS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfigSettings, setShowConfigSettings] = useState(false);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalTrades = logs.length;
    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        totalRealizedPnL: 0,
        avgLatencyMs: 0,
      };
    }

    let winCount = 0;
    let totalRealizedPnL = 0;
    let sumLatency = 0;

    logs.forEach((log) => {
      if (log.realizedPnL > 0) winCount++;
      totalRealizedPnL += log.realizedPnL;
      sumLatency += log.executionLatencyMs || 12;
    });

    const winRate = (winCount / totalTrades) * 100;
    const avgLatencyMs = Math.round(sumLatency / totalTrades);

    return {
      totalTrades,
      winCount,
      lossCount: totalTrades - winCount,
      winRate,
      totalRealizedPnL,
      avgLatencyMs,
    };
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterType === 'PROFIT' && log.realizedPnL <= 0) return false;
      if (filterType === 'LOSS' && log.realizedPnL > 0) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        return (
          log.symbol.toLowerCase().includes(query) ||
          log.name.toLowerCase().includes(query) ||
          log.orderId.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [logs, filterType, searchQuery]);

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `shot_stock_auto_trade_logs_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const getReasonBadge = (reason: AutoTradeCloseReason) => {
    switch (reason) {
      case 'TAKE_PROFIT':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <TrendingUp className="w-2.5 h-2.5" />
            <span>目标止盈平仓</span>
          </span>
        );
      case 'TRAILING_STOP':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <ShieldCheck className="w-2.5 h-2.5" />
            <span>移动保本止盈</span>
          </span>
        );
      case 'STOP_LOSS':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>硬止损截断</span>
          </span>
        );
      case 'MANUAL':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30">
            <Activity className="w-2.5 h-2.5" />
            <span>手动模拟平仓</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* Top Engine Status & Config Switch Bar */}
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${
                autoTradeConfig.isEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-100">
                  自动交易执行引擎 (Auto-Execution Gateway)
                </span>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold flex items-center gap-1 ${
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
                  {autoTradeConfig.isEnabled ? '系统自动执行已开启' : '已暂停自动执行'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                触及止盈线、硬止损线或动态保本触发时，毫秒级调用{' '}
                <strong className="text-blue-400 font-mono">androidBridge.executeMockOrder()</strong> 进行模拟平仓并记录日志。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setShowConfigSettings(!showConfigSettings)}
              className="h-8 px-3 text-xs font-semibold rounded-full bg-[#1c202a] hover:bg-[#242936] text-slate-300 border border-[#2a2f3e] flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              <span>规则参数</span>
            </button>

            {/* Master Toggle (Google Material 3 Filled Button) */}
            <button
              onClick={() =>
                onUpdateConfig({
                  ...autoTradeConfig,
                  isEnabled: !autoTradeConfig.isEnabled,
                })
              }
              className={`h-8 px-3.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                autoTradeConfig.isEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/30'
                  : 'bg-[#2a2e38] hover:bg-[#343a46] text-slate-300'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{autoTradeConfig.isEnabled ? '执行中 (ON)' : '已暂停 (OFF)'}</span>
            </button>
          </div>
        </div>

        {/* Expandable Auto Trade Fine-tuning Config */}
        {showConfigSettings && (
          <div className="mt-3 pt-3 border-t border-[#2a2e37] grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
            <label className="flex items-center justify-between p-2 rounded-lg bg-[#14151b] border border-[#2a2e37] cursor-pointer hover:border-slate-600 transition-colors">
              <span className="text-slate-300">达标目标止盈自动平仓</span>
              <input
                type="checkbox"
                checked={autoTradeConfig.autoCloseOnProfit}
                onChange={(e) =>
                  onUpdateConfig({
                    ...autoTradeConfig,
                    autoCloseOnProfit: e.target.checked,
                  })
                }
                className="w-3.5 h-3.5 accent-emerald-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-2 rounded-lg bg-[#14151b] border border-[#2a2e37] cursor-pointer hover:border-slate-600 transition-colors">
              <span className="text-slate-300">跌破硬止损自动平仓</span>
              <input
                type="checkbox"
                checked={autoTradeConfig.autoCloseOnLoss}
                onChange={(e) =>
                  onUpdateConfig({
                    ...autoTradeConfig,
                    autoCloseOnLoss: e.target.checked,
                  })
                }
                className="w-3.5 h-3.5 accent-rose-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-2 rounded-lg bg-[#14151b] border border-[#2a2e37] cursor-pointer hover:border-slate-600 transition-colors">
              <span className="text-slate-300">动态移动保本触发平仓</span>
              <input
                type="checkbox"
                checked={autoTradeConfig.autoCloseOnTrailing}
                onChange={(e) =>
                  onUpdateConfig({
                    ...autoTradeConfig,
                    autoCloseOnTrailing: e.target.checked,
                  })
                }
                className="w-3.5 h-3.5 accent-blue-500 rounded"
              />
            </label>
          </div>
        )}
      </div>

      {/* Auto-Trade Realized Performance Metric Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-0.5">累计已平仓盈亏</span>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-sm sm:text-base font-bold font-mono tabular-nums ${
                stats.totalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats.totalRealizedPnL >= 0 ? '+' : ''}${stats.totalRealizedPnL.toFixed(1)}
            </span>
          </div>
          <span className="text-[9px] text-slate-500 block mt-0.5">
            实盘模拟已落袋
          </span>
        </div>

        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-0.5">平仓交易胜率</span>
          <div className="flex items-baseline gap-1">
            <span className="text-sm sm:text-base font-bold font-mono text-white tabular-nums">
              {stats.winRate.toFixed(1)}%
            </span>
            <span className="text-[9px] text-slate-400">
              ({stats.winCount}胜 / {stats.lossCount}负)
            </span>
          </div>
          <span className="text-[9px] text-emerald-400/80 block mt-0.5 flex items-center gap-0.5">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
            <span>自动纪律平仓</span>
          </span>
        </div>

        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-0.5">平仓执行总笔数</span>
          <div className="flex items-baseline gap-1">
            <span className="text-sm sm:text-base font-bold font-mono text-cyan-400 tabular-nums">
              {stats.totalTrades}
            </span>
            <span className="text-[9px] text-slate-400">笔撮合单</span>
          </div>
          <span className="text-[9px] text-slate-500 block mt-0.5">
            状态: 全部 FILLED
          </span>
        </div>

        <div className="bg-[#181a20] border border-[#2a2e37] rounded-xl p-2.5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block mb-0.5">平均网关撮合延迟</span>
            <span className="text-sm sm:text-base font-bold font-mono text-amber-400 tabular-nums">
              {stats.avgLatencyMs || 12} ms
            </span>
          </div>
          <span className="text-[9px] text-emerald-400/80 block mt-0.5 flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5 text-amber-400" />
            <span>Android 原生模拟</span>
          </span>
        </div>
      </div>

      {/* Trade Logs List Container */}
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-2xl overflow-hidden shadow-xs">
        {/* Header & Controls */}
        <div className="px-3 py-2 border-b border-[#2a2e37] bg-[#14151b] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">
              自动交易平仓日志 ({filteredLogs.length})
            </span>
            {/* Filter buttons (Google Material 3 Filter Chips) */}
            <div className="flex items-center gap-1 bg-[#12141a] p-1 rounded-full border border-[#242936]">
              <button
                onClick={() => setFilterType('ALL')}
                className={`h-7 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilterType('PROFIT')}
                className={`h-7 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'PROFIT' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                盈利
              </button>
              <button
                onClick={() => setFilterType('LOSS')}
                className={`h-7 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  filterType === 'LOSS' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                止损
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="搜索代码 / 单号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-28 sm:w-36 bg-[#181a20] border border-[#2a2e37] rounded-full pl-7 pr-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            {/* Test Execution Button */}
            {onTriggerTestOrder && (
              <button
                onClick={onTriggerTestOrder}
                className="h-8 px-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                title="触发一笔测试模拟平仓"
              >
                <Zap className="w-3 h-3" />
                <span>测试模拟下单</span>
              </button>
            )}

            {/* Export */}
            <button
              onClick={handleExportJSON}
              disabled={logs.length === 0}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 disabled:opacity-40 rounded-full hover:bg-[#232731] transition-all cursor-pointer"
              title="导出交易日志 JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Clear */}
            <button
              onClick={onClearLogs}
              disabled={logs.length === 0}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 disabled:opacity-40 rounded-full hover:bg-[#232731] transition-all cursor-pointer"
              title="清空日志"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Logs List */}
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <Info className="w-6 h-6 mx-auto mb-2 text-slate-600" />
            <p className="mb-2">暂无符合条件的自动平仓日志。</p>
            <p className="text-[10px] text-slate-600">
              当开启自动交易执行且持仓触发止盈或止损时，系统将在此处自动记录成交明细。
            </p>
            {onTriggerTestOrder && (
              <button
                onClick={onTriggerTestOrder}
                className="mt-3 px-3 py-1 bg-[#222630] hover:bg-[#2c3240] text-slate-200 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <Zap className="w-2.5 h-2.5 text-blue-400" />
                <span>立即模拟触发一笔成交</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#232731] max-h-[460px] overflow-y-auto">
            {filteredLogs.map((log) => {
              const isProfit = log.realizedPnL >= 0;
              return (
                <div
                  key={log.id}
                  className="p-2.5 hover:bg-[#1a1d24] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm font-mono text-white tracking-wide">
                        {log.symbol}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                        {log.name}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                        {log.side} {log.quantity} 股
                      </span>
                      {getReasonBadge(log.reason)}
                      <span className="text-[9px] font-mono text-emerald-400/90 bg-emerald-500/10 px-1 rounded flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        <span>已成交 ({log.status})</span>
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                      <span>{log.reasonDetail}</span>
                    </p>

                    <div className="flex items-center gap-3 text-[9px] text-slate-500 font-mono">
                      <span>单号: {log.orderId}</span>
                      <span>时间: {log.timestamp}</span>
                      <span className="text-cyan-400/80">
                        耗时: {log.executionLatencyMs}ms (Android Bridge 网关)
                      </span>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-1.5 sm:pt-0 border-[#252934]">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-sm sm:text-base font-bold font-mono tabular-nums flex items-center ${
                          isProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isProfit ? (
                          <ArrowUpRight className="w-3.5 h-3.5 inline mr-0.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 inline mr-0.5" />
                        )}
                        {isProfit ? '+' : ''}${log.realizedPnL.toFixed(2)}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-semibold ${
                          isProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        ({isProfit ? '+' : ''}{log.realizedPnLPercent.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      成交价: ${log.executionPrice.toFixed(2)} / 成本: ${log.entryPrice.toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
