/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DeploymentDrawerPanel: 抽屉式量化统计与模型依据小面板
 * 聚合“7日实盘与回测统计”及“权威量化模型依据”，以内嵌抽屉小面板呈现于部署模块内
 */

import React, { useEffect } from 'react';
import {
  X,
  BarChart3,
  Shield,
  Layers,
  Sparkles,
  Maximize2,
  ExternalLink,
  Info
} from 'lucide-react';
import { StrategyStatsPanel } from './StrategyStatsPanel';
import { StrategyGuide } from './StrategyGuide';

interface DeploymentDrawerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'stats' | 'guide';
  onTabChange: (tab: 'stats' | 'guide') => void;
  onSelectStock: (symbol: string) => void;
}

export const DeploymentDrawerPanel: React.FC<DeploymentDrawerPanelProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  onSelectStock,
}) => {
  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Slide-over Drawer Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-2 sm:pl-10">
        <div className="w-screen max-w-3xl lg:max-w-4xl bg-[#121418] border-l border-[#2a2e37] shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-out animate-in slide-in-from-right">
          {/* Drawer Header */}
          <div className="px-4 py-3 bg-[#181a20]/95 backdrop-blur-md border-b border-[#2a2e37] flex flex-col gap-2.5 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                  {activeTab === 'stats' ? (
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Shield className="w-4 h-4 text-cyan-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm sm:text-base text-white tracking-tight">
                      {activeTab === 'stats' ? '7日量化策略实盘与回测统计' : '国际权威量化模型与依据'}
                    </h2>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#222630] border border-[#2a2e37] text-slate-400">
                      抽屉小面板
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    部署模块内置 · 实时监控策略命中率与学术模型依据
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-[#222630] hover:bg-[#2c3240] text-slate-400 hover:text-white border border-[#2a2e37] transition-colors cursor-pointer"
                  title="关闭抽屉 (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Segmented Switcher for merged modules */}
            <div className="flex items-center gap-1.5 bg-[#101216] p-1 rounded-xl border border-[#2a2e37] self-start sm:self-auto w-full sm:w-auto">
              <button
                onClick={() => onTabChange('stats')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'stats'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#181a20]'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                <span>7日策略实盘统计</span>
              </button>
              <button
                onClick={() => onTabChange('guide')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'guide'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#181a20]'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span>国际量化权威依据</span>
              </button>
            </div>
          </div>

          {/* Drawer Body (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#0f1115] text-slate-100">
            {activeTab === 'stats' ? (
              <StrategyStatsPanel onSelectStock={onSelectStock} />
            ) : (
              <StrategyGuide />
            )}
          </div>

          {/* Drawer Footer Status Bar */}
          <div className="px-4 py-2 bg-[#14161b] border-t border-[#2a2e37] flex items-center justify-between text-[11px] text-slate-400 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>标普500/纳斯达克 毫秒级量化统计引擎在线</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline font-mono text-[10px] text-slate-400">
                按 ESC 随时快速收回
              </span>
              <button
                onClick={onClose}
                className="px-2.5 py-1 rounded-md bg-[#222630] hover:bg-[#2a303c] text-slate-300 text-[10px] font-semibold border border-[#2a2e37] transition-colors cursor-pointer"
              >
                收起面板
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
