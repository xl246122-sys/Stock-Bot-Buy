/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Stock-G Material 3 Top App Bar (Android 16 Expressive Edition)
 * Standardized 56dp height, harmonious Google brand accents, anti-collision layout for Samsung S24+ punch hole
 */

import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Smartphone,
  Bell,
  Server,
  Activity,
  Zap,
  ChevronDown,
  ChevronUp,
  KeyRound,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { audioAlert } from '../services/audioAlert';
import { QuantSignal } from '../types/stock';
import { licenseService, LicenseInfo } from '../services/licenseService';
import { LicenseActivationModal } from './LicenseActivationModal';

interface HeaderProps {
  activeTab: 'dip' | 'breakout' | 'range' | 'watchlist' | 'matrix' | 'blueprint' | 'guide' | 'stats';
  setActiveTab: (tab: 'dip' | 'breakout' | 'range' | 'watchlist' | 'matrix' | 'blueprint' | 'guide' | 'stats') => void;
  isMobileFrame: boolean;
  setIsMobileFrame: (val: boolean) => void;
  isScanning: boolean;
  alertCount: number;
  onOpenAlerts: () => void;
  isAlertOpen?: boolean;
  latestSignal?: QuantSignal | null;
  onOpenRsiCalibration: () => void;
  isMuted?: boolean;
  onToggleSound?: () => void;
  onOpenServerSync?: () => void;
  syncStatus?: 'connected' | 'checking' | 'offline' | 'error';
  latencyMs?: number | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isMobileFrame,
  setIsMobileFrame,
  isScanning,
  alertCount,
  onOpenAlerts,
  isAlertOpen = false,
  latestSignal = null,
  onOpenRsiCalibration,
  isMuted: isMutedProp,
  onToggleSound: onToggleSoundProp,
  onOpenServerSync,
  syncStatus = 'offline',
  latencyMs = null,
}) => {
  const [isMutedLocal, setIsMutedLocal] = useState(false);
  const isMuted = isMutedProp !== undefined ? isMutedProp : isMutedLocal;
  const [estTime, setEstTime] = useState('');
  const [beijingTime, setBeijingTime] = useState('');
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo>(() => licenseService.getLicenseInfo());
  const [showLicenseModal, setShowLicenseModal] = useState<boolean>(false);

  useEffect(() => {
    const unsub = licenseService.subscribe((info) => {
      setLicenseInfo(info);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setEstTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      setBeijingTime(
        now.toLocaleTimeString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };

    updateClocks();
    const timer = setInterval(updateClocks, 1000);
    return () => clearInterval(timer);
  }, []);

  const hasUnread = alertCount > 0 || (latestSignal && !latestSignal.isRead);

  const toggleSound = () => {
    if (onToggleSoundProp) {
      onToggleSoundProp();
    } else {
      const nextState = !isMutedLocal;
      setIsMutedLocal(nextState);
      audioAlert.setMuted(nextState);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0b0d11]/95 backdrop-blur-xl border-b border-[#282e3c] text-slate-100 select-none transition-colors">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-4 h-14 flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Brand Section - Fixed single line, no text wrapping, safe on mobile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 min-w-0">
          {/* Google Quad-Color Dynamic Dot Emblem */}
          <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-[#181b24] border border-[#282e3c] flex items-center justify-center p-1.5 shadow-sm shrink-0">
            <Zap className="w-4 h-4 text-[#8ab4f8] fill-[#8ab4f8]/20" />
            <div className="absolute -top-0.5 -right-0.5 flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ea4335]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#fbbc05]" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Stock-G on one line with strict whitespace-nowrap */}
            <span className="font-bold text-sm sm:text-base tracking-tight text-white font-sans whitespace-nowrap shrink-0">
              Stock-G
            </span>
            {/* Android 16 badge: only shown on tablets/desktops to leave phone center 100% clear */}
            <span className="hidden md:inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-[#1b3764] text-[#8ab4f8] border border-[#8ab4f8]/30 whitespace-nowrap">
              Android 16
            </span>
            <span className="hidden lg:inline text-[10px] text-slate-400 tracking-tight font-medium whitespace-nowrap">
              美股实盘量化巡检
            </span>
          </div>

          {/* M3 Active Scan Status Pill (Tablet/Desktop) */}
          <div className="hidden lg:flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#181b24] border border-[#282e3c] text-[11px] text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                isScanning ? 'bg-[#81c995] animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span className="font-mono text-[11px] whitespace-nowrap">
              {isScanning ? '实盘巡检中' : '巡检暂停'}
            </span>
          </div>

          {/* Cloud Server Connectivity Pill (Tablet/Desktop) */}
          {onOpenServerSync && (
            <button
              onClick={onOpenServerSync}
              title="腾讯云日本服务器 (43.163.192.120) 状态与撮合同步"
              className={`hidden xl:flex items-center gap-1.5 h-8 px-3 rounded-full border text-[11px] transition-all cursor-pointer select-none active:scale-[0.97] ${
                syncStatus === 'connected'
                  ? 'bg-[#1b3764]/50 border-[#8ab4f8]/40 text-[#8ab4f8] hover:bg-[#1b3764]/70'
                  : syncStatus === 'checking'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-[#181b24] border-[#282e3c] text-slate-400 hover:text-slate-200 hover:bg-[#202430]'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-[#8ab4f8] shrink-0" />
              <span className="font-mono text-[11px] whitespace-nowrap">
                {syncStatus === 'connected' ? `东京 ${latencyMs ? `${latencyMs}ms` : '在线'}` : '后端同步'}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  syncStatus === 'connected'
                    ? 'bg-[#81c995]'
                    : syncStatus === 'checking'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-slate-500'
                }`}
              />
            </button>
          )}
        </div>

        {/* Global Market Clocks on Large Desktop */}
        <div className="hidden 2xl:flex items-center gap-2 text-[10px] font-mono tabular-nums text-slate-400 border border-[#282e3c] px-3 py-1 rounded-full bg-[#181b24] shrink-0">
          <span>美东 {estTime}</span>
          <span className="text-slate-600">·</span>
          <span>北京 {beijingTime}</span>
        </div>

        {/* Right Action Cluster - Streamlined for mobile to eliminate punch-hole & status-bar collisions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* M3 Quant Alert Button (Compact & responsive on mobile) */}
          <button
            onClick={onOpenAlerts}
            title={isAlertOpen ? '收起量化预警抽屉' : '展开量化预警抽屉'}
            className={`relative flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-full text-xs font-semibold transition-all duration-200 border cursor-pointer select-none active:scale-[0.97] shrink-0 ${
              isAlertOpen
                ? 'bg-[#1b3764] border-[#8ab4f8] text-[#8ab4f8] shadow-sm'
                : hasUnread
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.25)] animate-pulse'
                : latestSignal
                ? 'bg-[#181b24] hover:bg-[#202430] border-[#282e3c] text-slate-200'
                : 'bg-[#181b24] hover:bg-[#202430] border-[#282e3c] text-slate-300'
            }`}
          >
            {/* Status indicator dot */}
            <div className="relative flex items-center justify-center shrink-0">
              {hasUnread ? (
                <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-amber-400" />
                </span>
              ) : latestSignal ? (
                <span className="w-2 h-2 rounded-full bg-[#81c995]" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>

            {/* Signal ticker preview / Button label (Compact on mobile) */}
            {latestSignal ? (
              <div className="flex items-center gap-1 font-mono text-[11px] sm:text-xs whitespace-nowrap max-w-[120px] sm:max-w-none truncate">
                <span className="font-bold text-amber-300">{latestSignal.symbol}</span>
                <span
                  className={`font-semibold tabular-nums hidden xs:inline ${
                    latestSignal.changePercent < 0 ? 'text-[#f28b82]' : 'text-[#81c995]'
                  }`}
                >
                  {latestSignal.changePercent > 0 ? '+' : ''}
                  {latestSignal.changePercent.toFixed(1)}%
                </span>
              </div>
            ) : (
              <span className="text-[11px] sm:text-xs text-slate-200 font-medium whitespace-nowrap">
                预警中心
              </span>
            )}

            {/* Unread count badge */}
            {alertCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-neutral-950 text-[10px] font-mono font-bold leading-tight">
                {alertCount}
              </span>
            )}

            <div className="text-slate-400 shrink-0">
              {isAlertOpen ? (
                <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#8ab4f8]" />
              ) : (
                <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              )}
            </div>
          </button>

          {/* RSI Calibration Chip (Tablet/Desktop) */}
          <button
            onClick={onOpenRsiCalibration}
            className="hidden sm:flex items-center gap-1.5 h-9 sm:h-10 px-3 rounded-full bg-[#181b24] hover:bg-[#202430] text-amber-300 border border-[#282e3c] text-xs font-semibold transition-colors cursor-pointer active:scale-[0.97] shrink-0"
            title="实时拉取官方K线校准 Wilder RSI(6) 与 RSI(14)"
          >
            <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs">RSI校准</span>
          </button>

          {/* 软件授权状态胶囊 (VIP License Pill) */}
          <button
            onClick={() => setShowLicenseModal(true)}
            className={`flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer select-none active:scale-[0.97] shrink-0 ${
              licenseInfo.status === 'ACTIVE'
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
                : licenseInfo.status === 'EXPIRED'
                ? 'bg-rose-500/15 border-rose-500/35 text-rose-300 hover:bg-rose-500/25 animate-pulse'
                : 'bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25 animate-pulse'
            }`}
            title="点击查看授权与在线激活状态"
          >
            {licenseInfo.status === 'ACTIVE' ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-mono">VIP {licenseInfo.remainingDays}天</span>
              </>
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>激活软件</span>
              </>
            )}
          </button>

          {/* Sound Mute Toggle Icon Button */}
          <button
            onClick={toggleSound}
            title={isMuted ? '点击开启声音提示' : '点击静音'}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border transition-all duration-200 cursor-pointer select-none active:scale-[0.95] shrink-0 ${
              isMuted
                ? 'bg-[#181b24] border-[#282e3c] text-slate-500 hover:text-slate-400'
                : 'bg-[#142c23] border-[#81c995]/40 text-[#81c995] hover:bg-[#142c23]/80 shadow-xs'
            }`}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-slate-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#81c995]" />
            )}
          </button>

          {/* Desktop/Mobile Device Frame Toggle (Desktop Only) */}
          <button
            onClick={() => setIsMobileFrame(!isMobileFrame)}
            className={`hidden xl:flex w-10 h-10 rounded-full items-center justify-center border transition-all duration-200 cursor-pointer select-none active:scale-[0.95] shrink-0 ${
              isMobileFrame
                ? 'bg-[#1b3764] border-[#8ab4f8] text-[#8ab4f8] shadow-xs'
                : 'bg-[#181b24] hover:bg-[#202430] border-[#282e3c] text-slate-400 hover:text-slate-200'
            }`}
            title="切换桌面大屏/移动真机框架"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 软件授权与在线激活弹窗 (Material 3) */}
      <LicenseActivationModal
        isOpen={showLicenseModal}
        onClose={() => setShowLicenseModal(false)}
      />
    </header>
  );
};
