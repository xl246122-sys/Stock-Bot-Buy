/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Stock-G Material 3 Control Deck (Android 16 Expressive Edition)
 * Unified touch targets, collapsible layout, consistent 40px/44px touch ergonomics
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Search,
  Plus,
  Sparkles,
  Clock,
  Layers,
  Radio,
  Cpu,
  DollarSign,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Bell,
  RefreshCw
} from 'lucide-react';
import { ScanInterval, TimeFrame, ScanSettings } from '../types/stock';
import { stockService } from '../services/stockService';
import { backgroundKeepAliveService } from '../services/backgroundWorker';
import { SearchableStockItem } from '../data/sp500Universe';

interface ScanControlBarProps {
  settings: ScanSettings;
  setSettings: React.Dispatch<React.SetStateAction<ScanSettings>>;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
  countdown: number;
  onSearchSymbol: (sym: string) => void;
  onTriggerSimDip: () => void;
  onTriggerSimBreakout: () => void;
  onTriggerSimDipStarted?: () => void;
  onTriggerSimDipExhaustion?: () => void;
  onTriggerSimOverbought?: () => void;
  onTriggerSimBreakdown?: () => void;
  totalMonitored: number;
}

export const ScanControlBar: React.FC<ScanControlBarProps> = ({
  settings,
  setSettings,
  isScanning,
  setIsScanning,
  countdown,
  onSearchSymbol,
  onTriggerSimDip,
  onTriggerSimBreakout,
  onTriggerSimDipStarted,
  onTriggerSimDipExhaustion,
  onTriggerSimOverbought,
  onTriggerSimBreakdown,
  totalMonitored,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchableStockItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const intervals: ScanInterval[] = ['2s', '5s', '10s', '1m', '3m', '5m', '10m', '30m', '1h'];
  const timeframes: TimeFrame[] = ['30m', '1h', '2h', '4h', '1d', '1w'];

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifGranted(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    if (searchInput.trim().length > 0) {
      const results = stockService.searchCatalog(searchInput);
      setSearchResults(results);
      setShowDropdown(true);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  }, [searchInput]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddSymbol = async (sym: string) => {
    if (!sym.trim()) return;
    setIsSearching(true);
    setShowDropdown(false);
    setSearchInput('');
    await onSearchSymbol(sym.trim().toUpperCase());
    setIsSearching(false);
  };

  const handleRequestNotif = async () => {
    const granted = await backgroundKeepAliveService.requestNotificationPermission();
    setNotifGranted(granted);
  };

  return (
    <div className="bg-[#12151c] border-b border-[#282e3c] text-slate-200 py-2 px-3 sm:px-4 select-none">
      <div className="max-w-7xl mx-auto space-y-2">
        {/* Row 1: Unified M3 Search & Primary Controls */}
        <div className="flex items-center gap-2">
          {/* Main Scan Trigger Button (Unified h-10 pill with tactile response) */}
          <button
            onClick={() => setIsScanning(!isScanning)}
            className={`flex items-center justify-center gap-2 h-10 px-4 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer shadow-sm shrink-0 active:scale-[0.97] ${
              isScanning
                ? 'bg-[#1b3764] text-[#8ab4f8] border border-[#8ab4f8]/50 shadow-[0_0_12px_rgba(138,180,248,0.2)]'
                : 'bg-[#202430] text-amber-300 border border-amber-500/40 hover:bg-[#282d3b]'
            }`}
            title={isScanning ? '点击暂停量化高频巡检' : '点击启动实时巡检'}
          >
            {isScanning ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8ab4f8] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#8ab4f8]" />
              </span>
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isScanning ? '巡检中' : '启动'}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-black/40">
              {settings.interval}
            </span>
          </button>

          {/* Search Box with Autocomplete (Standard M3 Search Field, h-10) */}
          <div className="relative flex-1" ref={dropdownRef}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddSymbol(searchInput);
              }}
              className="flex items-center relative"
            >
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索代码/公司/币安 (如 TSLA, AMD, 苹果)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => {
                  if (searchInput.trim().length > 0) setShowDropdown(true);
                }}
                className="w-full h-10 bg-[#181b24] border border-[#282e3c] rounded-full pl-9 pr-14 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#8ab4f8] focus:bg-[#202430] font-mono uppercase transition-colors"
              />
              <button
                type="submit"
                disabled={isSearching || !searchInput.trim()}
                className="absolute right-1.5 h-7 px-3 flex items-center justify-center bg-[#8ab4f8] hover:bg-[#a8c7fa] disabled:opacity-0 text-[#041e42] rounded-full text-[11px] font-bold transition-all cursor-pointer active:scale-[0.95]"
              >
                +加自选
              </button>
            </form>

            {/* Autocomplete Dropdown Menu */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-[#181b24] border border-[#282e3c] rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-[#282e3c] max-h-72 overflow-y-auto">
                {searchResults.map((item) => (
                  <button
                    key={item.symbol}
                    onClick={() => handleAddSymbol(item.symbol)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#202430] flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-amber-300 text-xs shrink-0">
                        {item.symbol}
                      </span>
                      <span className="text-xs text-slate-200 truncate">
                        {item.chineseName || item.name}
                      </span>
                      {item.basePrice < 10.0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                          &lt;$10低价
                        </span>
                      )}
                      {item.marketCap < 5.0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                          &lt;5B小盘
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono">
                      <span className="text-xs text-slate-300 font-semibold">
                        ${item.basePrice.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-[#8ab4f8] bg-[#1b3764] px-2 py-0.5 rounded-full font-medium">
                        +添加
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Filter Toggle (Standard M3 Icon Button h-10 w-10) */}
          <button
            onClick={() => setShowAdvancedParams(!showAdvancedParams)}
            className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors cursor-pointer shrink-0 active:scale-[0.95] ${
              showAdvancedParams
                ? 'bg-[#1b3764] border-[#8ab4f8] text-[#8ab4f8]'
                : 'bg-[#181b24] hover:bg-[#202430] border-[#282e3c] text-slate-300'
            }`}
            title="展开/折叠量化参数过滤面板"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Row 2: Swipeable Horizontal Metrics & Toggles Dock */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {/* Status & Countdown Chip */}
          <div className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#181b24] border border-[#282e3c] text-[11px] shrink-0 font-mono">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-400 font-sans">倒计时:</span>
            <span className="font-bold text-amber-300 tabular-nums">
              {isScanning ? `${countdown}s` : '暂停'}
            </span>
          </div>

          {/* Monitored Count Chip */}
          <div className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#181b24] border border-[#282e3c] text-[11px] shrink-0 font-mono">
            <Layers className="w-3.5 h-3.5 text-[#8ab4f8] shrink-0" />
            <span className="text-slate-400 font-sans">监控:</span>
            <span className="font-bold text-[#8ab4f8] tabular-nums">
              {totalMonitored}只
            </span>
          </div>

          {/* Price >= $50 & Market Cap >= $5B Filter Switch Chip */}
          <button
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                enablePriceAndCapFilter: !(prev.enablePriceAndCapFilter ?? true),
              }))
            }
            className={`h-8 px-3 rounded-full text-[11px] font-medium border flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 select-none active:scale-[0.97] ${
              (settings.enablePriceAndCapFilter ?? true)
                ? 'bg-[#142c23] text-[#81c995] border-[#81c995]/40 font-semibold shadow-xs'
                : 'bg-[#181b24] text-slate-400 border-[#282e3c] hover:text-slate-200'
            }`}
            title="开启/关闭 股价≥$50且市值≥$5B 严选过滤 (排除低于50美元低价股与低于5B小盘股)"
          >
            <DollarSign className="w-3 h-3" />
            <span>≥$50/5B: {(settings.enablePriceAndCapFilter ?? true) ? '严选已过滤' : '全量放开'}</span>
          </button>

          {/* Background Keep-Alive Notification Pill */}
          <button
            onClick={handleRequestNotif}
            className={`h-8 px-3 rounded-full text-[11px] font-medium border flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 select-none active:scale-[0.97] ${
              notifGranted
                ? 'bg-[#142c23] text-[#81c995] border-[#81c995]/40'
                : 'bg-[#181b24] text-amber-300 border-[#282e3c] hover:bg-[#202430]'
            }`}
            title={notifGranted ? 'Android 系统后台通知已授权' : '点击授权 Android 原生后台预警通知'}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>{notifGranted ? '后台通知: 正常' : '开启通知'}</span>
          </button>

          {/* Active Timeframe Badge */}
          <div className="flex items-center gap-1 h-8 px-3 rounded-full bg-[#181b24] border border-[#282e3c] text-[11px] shrink-0 font-mono">
            <span className="text-slate-400 font-sans">K线周期:</span>
            <span className="text-amber-300 font-bold">{settings.timeframe}</span>
          </div>
        </div>

        {/* Row 3 (Collapsible): Material 3 Segmented Interval & Timeframe Bar */}
        {showAdvancedParams && (
          <div className="pt-2 pb-1 border-t border-[#282e3c] space-y-2 animate-in fade-in duration-150">
            {/* Frequency Segmented Control */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-slate-400 text-xs font-medium whitespace-nowrap shrink-0">巡检频次:</span>
              <div className="flex items-center bg-[#181b24] p-0.5 rounded-full border border-[#282e3c]">
                {intervals.map((item) => (
                  <button
                    key={item}
                    onClick={() => setSettings((prev) => ({ ...prev, interval: item }))}
                    className={`h-7 px-3 rounded-full font-mono text-xs whitespace-nowrap transition-all cursor-pointer select-none active:scale-[0.96] ${
                      settings.interval === item
                        ? 'bg-[#8ab4f8] text-[#041e42] font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe Segmented Control */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-slate-400 text-xs font-medium whitespace-nowrap shrink-0">计算周期:</span>
              <div className="flex items-center bg-[#181b24] p-0.5 rounded-full border border-[#282e3c]">
                {timeframes.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSettings((prev) => ({ ...prev, timeframe: tf }))}
                    className={`h-7 px-3 rounded-full font-mono text-xs whitespace-nowrap transition-all cursor-pointer select-none active:scale-[0.96] ${
                      settings.timeframe === tf
                        ? 'bg-[#8ab4f8] text-[#041e42] font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Professional Live Market Engine Status Deck */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pt-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#81c995] animate-pulse shrink-0" />
                <span className="text-slate-300 font-medium whitespace-nowrap">
                  实盘直连: Finnhub & 币安 · 连续竞价巡检中
                </span>
                <span className="text-[11px] font-mono text-slate-500 hidden sm:inline whitespace-nowrap">
                  (门禁: Connors TPS RSI(6)&lt;22 / ORB突破)
                </span>
              </div>
              <button
                onClick={async () => {
                  await stockService.syncAllRealMarketData();
                  stockService.clearAllSimulations();
                }}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#1b3764] hover:bg-[#1b3764]/80 text-[#8ab4f8] text-[11px] font-semibold transition-all border border-[#8ab4f8]/30 cursor-pointer active:scale-[0.96] shrink-0"
                title="立即向 Finnhub & 币安拉取最新美股行情"
              >
                <RefreshCw className="w-3 h-3" />
                <span>刷新实盘行情</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
