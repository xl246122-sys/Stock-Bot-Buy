/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  Activity,
  Download,
  Check,
  Copy,
  Wifi,
  Smartphone,
  ShieldCheck,
  RefreshCw,
  FolderSync,
  Layers,
  ArrowDownUp,
  Cpu
} from 'lucide-react';
import { serverSyncService, SERVER_PRESETS, SyncState, SyncMode } from '../services/serverSyncService';
import { androidBridge } from '../services/androidBridge';
import { MonitoredPosition } from '../types/stock';

interface ServerSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  positions: MonitoredPosition[];
  onPositionsSynced?: () => void;
}

export const ServerSyncModal: React.FC<ServerSyncModalProps> = ({
  isOpen,
  onClose,
  positions,
  onPositionsSynced,
}) => {
  const [syncState, setSyncState] = useState<SyncState>(() => serverSyncService.getState());
  const [customUrl, setCustomUrl] = useState('');
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; latency: number; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = serverSyncService.subscribe(setSyncState);
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handlePing = async (url?: string) => {
    setIsPinging(true);
    setPingResult(null);
    const target = url || syncState.activeEndpointUrl;
    const res = await serverSyncService.ping();
    setPingResult(res);
    setIsPinging(false);
  };

  const handleSelectPreset = (presetId: string, url: string) => {
    serverSyncService.setEndpoint(url, presetId);
    handlePing(url);
  };

  const handleApplyCustomUrl = () => {
    if (!customUrl.trim()) return;
    serverSyncService.setEndpoint(customUrl, 'custom');
    handlePing(customUrl);
  };

  const handleSyncPositionsNow = async () => {
    setIsSyncingData(true);
    setSyncFeedback(null);
    const res = await serverSyncService.syncPositions(positions);
    setIsSyncingData(false);
    if (res.success) {
      setSyncFeedback(`✅ 成功同步 ${res.count} 支持仓至后端`);
      if (onPositionsSynced) onPositionsSynced();
    } else {
      setSyncFeedback('⚠️ 已安全保存在本地，后端连通后将自动补传');
    }
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  const handleExportAndroidBundle = () => {
    const bundleStr = androidBridge.exportProjectConfig(
      positions,
      {
        syncUrl: syncState.activeEndpointUrl,
        mode: syncState.syncMode,
        timestamp: Date.now(),
      }
    );
    const blob = new Blob([bundleStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shot_stock_android_sync_bundle.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = () => {
    if (syncState.status === 'connected') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          已连接 ({syncState.latencyMs}ms)
        </span>
      );
    }
    if (syncState.status === 'checking') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono">
          <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
          正在测速...
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        本地单机模式 (引擎热备运行中)
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#181a20] border border-[#242936] w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header (Google Material 3 Dialog Header) */}
        <div className="px-4 py-3.5 border-b border-[#242936] flex items-center justify-between bg-[#12141a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Server className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-white">Android Studio & 后端同步中心</h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                支持 Android 模拟器 (10.0.2.2)、东京云端服务器 (43.163.192.120) 实时双向联调
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#222630] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Section 1: Server Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-blue-400" />
                目标开发与同步服务器 (Endpoint)
              </span>
              <button
                onClick={() => handlePing()}
                disabled={isPinging}
                className="px-2.5 py-1 rounded-lg bg-[#222630] hover:bg-[#2a2e37] border border-[#343a46] text-slate-200 text-[11px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isPinging ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
                <span>实时测速 (Ping)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SERVER_PRESETS.map((preset) => {
                const isSelected = syncState.activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset.id, preset.url)}
                    className={`text-left p-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/30'
                        : 'bg-[#1e2129] border-[#2a2e37] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-semibold text-xs ${isSelected ? 'text-blue-300' : 'text-slate-200'}`}>
                        {preset.name}
                      </span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 truncate mb-1">
                      {preset.url}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom URL Input */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="或输入自定义后端地址，例如: http://192.168.1.100:8000"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="flex-1 bg-[#1e2129] border border-[#2a2e37] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                onClick={handleApplyCustomUrl}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors shrink-0"
              >
                应用并连接
              </button>
            </div>

            {/* Ping Result Banner */}
            {pingResult && (
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                  pingResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 shrink-0" />
                  <span>{pingResult.message}</span>
                </div>
                {pingResult.success && (
                  <span className="font-mono text-[11px] font-bold">RTT: {pingResult.latency} ms</span>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Sync Mode & Bi-directional triggers */}
          <div className="bg-[#1e2129] border border-[#2a2e37] rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ArrowDownUp className="w-3.5 h-3.5 text-emerald-400" />
                本地与后端数据双向同步
              </span>
              <div className="flex items-center gap-1">
                {(['hybrid', 'cloud_auto', 'local_only'] as SyncMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => serverSyncService.setSyncMode(mode)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                      syncState.syncMode === mode
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'hybrid' ? '双向混合' : mode === 'cloud_auto' ? '云端集中' : '离线单机'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-[#181a20] p-2.5 rounded-lg border border-[#2a2e37]/70">
                <div className="text-slate-400 mb-0.5">本地持仓列表</div>
                <div className="font-semibold text-white font-mono text-sm">
                  {positions.length} <span className="text-xs font-normal text-slate-400">支股票</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">支持跟踪止损与移动保本锁定</div>
              </div>
              <div className="bg-[#181a20] p-2.5 rounded-lg border border-[#2a2e37]/70">
                <div className="text-slate-400 mb-0.5">上次同步状态</div>
                <div className="font-semibold text-emerald-400 font-mono text-xs">
                  {syncState.lastSyncTime ? `已同步于 ${syncState.lastSyncTime}` : '待同步'}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">本地与 Android SQLite 双向映射</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <button
                onClick={handleSyncPositionsNow}
                disabled={isSyncingData}
                className="w-full sm:flex-1 h-9 px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <FolderSync className={`w-3.5 h-3.5 ${isSyncingData ? 'animate-spin' : ''}`} />
                <span>立即与后端同步持仓及策略参数</span>
              </button>
              <button
                onClick={handleExportAndroidBundle}
                className="w-full sm:w-auto h-9 px-4 rounded-full bg-[#242936] hover:bg-[#2e3444] text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-[#343b4e]"
                title="导出配置文件放入 Android Studio assets/ 目录"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>导出离线资源包</span>
              </button>
            </div>

            {syncFeedback && (
              <div className="text-xs text-emerald-300 text-center font-medium animate-in fade-in">
                {syncFeedback}
              </div>
            )}
          </div>

          {/* Section 3: Android Studio Quick Migration Tips */}
          <div className="bg-[#14161f] border border-[#242936] rounded-2xl p-3.5 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5 text-xs">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span>Android Studio 本地同步开发提示 (Dev Quick Tips)</span>
            </div>
            <ul className="space-y-1.5 text-xs text-slate-400 list-disc list-inside">
              <li>
                <strong className="text-slate-200">模拟器联调地址:</strong> 在 Android Emulator 中请使用{' '}
                <code className="text-cyan-300 bg-cyan-950/40 px-1 py-0.5 rounded font-mono">10.0.2.2:8000</code> 访问本机
                FastAPI 后端，切勿写 <code className="text-rose-300 bg-rose-950/40 px-1 py-0.5 rounded font-mono">127.0.0.1</code>。
              </li>
              <li>
                <strong className="text-slate-200">真机 USB 调试:</strong> 运行{' '}
                <code className="text-amber-300 bg-amber-950/40 px-1 py-0.5 rounded font-mono">adb reverse tcp:8000 tcp:8000</code>{' '}
                即可直接在真机上通过 localhost:8000 同步本地后端。
              </li>
              <li>
                <strong className="text-slate-200">云端生产服务器:</strong> 东京 Tencent Cloud 服务器已开放{' '}
                <code className="text-emerald-300 bg-emerald-950/40 px-1 py-0.5 rounded font-mono">43.163.192.120:8000</code>，随时支持公网热同步。
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer (Google Material 3 Dialog Actions) */}
        <div className="px-4 py-3 border-t border-[#242936] flex items-center justify-between bg-[#12141a]">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>本地量化引擎全天候自主运转，无网络状态下绝不中断</span>
          </div>
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all cursor-pointer shadow-xs"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
