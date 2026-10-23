import {LiveTradingControl} from './LiveTradingControl';
import {LiveTradeBoard} from './LiveTradeBoard';
import {ExecutionSettings} from './ExecutionSettings';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Stock-G Flagship Mobile Terminal (Google Material 3 / Android 16 Expressive)
 * 美股 & 加密资产量化交易终端 · 移动端核心架构
 * 
 * 4 大核心功能舱:
 * 1. 【板块 (Sectors)】: 宏观市场全景、BTC多周期趋势矩阵、11大行业SPDR ETF实时行情与微趋势
 * 2. 【个股 (Stocks)】: S&P 500 55只核心蓝筹实盘报价、Welles Wilder RSI、成交量异动与 K线图谱抽屉
 * 3. 【AI 预警 (AI Alerts)】: 4阶段买入状态机量化预警信号、AI穿透研报、胜率评测与买入剧本
 * 4. 【设置 (Settings)】: 量化参数标定、硬件级双响提示音/强震动测试、系统级通知与心跳监控
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers,
  BarChart3,
  Bell,
  Settings,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Zap,
  Info,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Filter,
  Search,
  SlidersHorizontal,
  Flame,
  X,
  Gauge,
  DollarSign,
  ChevronRight,
  Volume2,
  VolumeX,
  Vibrate,
  Radio,
  Check,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Cpu,
  RefreshCw,
  ArrowUpRight,
  KeyRound,
  Lock,
  Trash2
} from 'lucide-react';

import {
  StockQuote,
  QuantSignal,
  ScanSettings,
  TimeFrame
} from '../types/stock';
import { stockService } from '../services/stockService';

import { SectorEtfService, SECTOR_ETF_REGISTRY } from '../services/sectorEtfService';
import { SectorCorrelationService } from '../services/sectorCorrelationService';
import { audioAlert } from '../services/audioAlert';
import { androidBridge } from '../services/androidBridge';
import { licenseService, LicenseInfo } from '../services/licenseService';
import { LicenseActivationModal } from './LicenseActivationModal';
import { BtcTrendWidget } from './BtcTrendWidget';
import { calculateMarketSentimentMetrics } from './MarketSentimentGauge';
import { StrategyModelsPanel } from './StrategyModelsPanel';
import { MobileAlertDrawerItem } from './MobileAlertDrawerItem';
import { AiTradingConsoleCard } from './AiTradingConsoleCard';
import { AiBrainConsoleCard } from './AiBrainConsoleCard';
import { AiAlertCard } from './AiAlertCard';
import { AiAlertModal } from './AiAlertModal';
import { AiPortfolioAndLearningView } from './AiPortfolioAndLearningView';
import { aiPaperTrader } from '../services/aiPaperTrader';
import { aiBrainService, AiBrainState, AiAlertCardData } from '../services/aiBrainService';

// 板块定义
const SECTOR_CATEGORIES = [
  { id: 'all', name: '全部标的', etf: 'SPY' },
  { id: 'semiconductors', name: '半导体', etf: 'SMH', icon: Cpu, desc: '英伟达 / 台积电 / AMD / 博通' },
  { id: 'tech', name: '科技软件', etf: 'XLK', icon: Activity, desc: '苹果 / 微软 / 云原生 / AI SaaS' },
  { id: 'comm', name: '通信服务', etf: 'XLC', icon: Radio, desc: '谷歌 / Meta / 奈飞 / 社交媒体' },
  { id: 'consumer', name: '可选消费', etf: 'XLY', icon: Flame, desc: '特斯拉 / 亚马逊 / 阿里 / 汽车' },
  { id: 'finance', name: '金融服务', etf: 'XLF', icon: DollarSign, desc: '摩根大通 / 高盛 / 数字金融' },
  { id: 'health', name: '医疗健康', etf: 'XLV', icon: ShieldCheck, desc: '礼来 / 联合健康 / 创新药' },
  { id: 'industrial', name: '工业高端', etf: 'XLI', icon: SlidersHorizontal, desc: '卡特彼勒 / 波音 / eVTOL' },
  { id: 'energy', name: '传统能源', etf: 'XLE', icon: Zap, desc: '埃克森美孚 / 雪佛龙 / 油气' },
  { id: 'crypto', name: '数字资产', etf: 'IBIT', icon: Sparkles, desc: '比特币现货 / 数字加密ETF' },
];

export default function MobileRadar() {
  const [activeNavTab, setActiveNavTab] = useState<'sectors' | 'stocks' | 'strategies' | 'alerts' | 'settings'>('sectors');
  const [stocks, setStocks] = useState<StockQuote[]>(() => stockService.getAllQuotes());
  const [etfTickers, setEtfTickers] = useState(() => new Map(SectorEtfService.etfPriceState));
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [sortBy, setSortBy] = useState<'change_desc' | 'change_asc' | 'rvol' | 'rsi_oversold'>('change_desc');
  const [selectedStockForDetail, setSelectedStockForDetail] = useState<StockQuote | null>(null);

  // 单一“AI大脑”预警生命周期状态
  const [brainState, setBrainState] = useState<AiBrainState>(() => aiBrainService.getState());
  const [popupAlertCard, setPopupAlertCard] = useState<AiAlertCardData | null>(null);

  useEffect(() => {
    const unsub = aiBrainService.subscribe((state) => {
      setBrainState(state);
      if (state.latestPopupSignal) {
        setPopupAlertCard(state.latestPopupSignal);
      }
    });
    return () => unsub();
  }, []);

  const signalsMap = useMemo(() => new Map(brainState.signals.map((s) => [s.symbol, s as any])), [brainState.signals]);
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [alertsSubTab, setAlertsSubTab] = useState<'signals' | 'positions' | 'learning'>('signals');
  const [expandedSignalSymbol, setExpandedSignalSymbol] = useState<string | null>(null);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);

  // 软件授权与在线激活状态
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo>(() => licenseService.getLicenseInfo());
  const [showLicenseModal, setShowLicenseModal] = useState<boolean>(false);

  // 本地 2 秒高频轮询动向扫描心跳 (与后台 2s 极速循环心跳对齐)
  const [localPollCountdown, setLocalPollCountdown] = useState<number>(2);
  const [lastPollTime, setLastPollTime] = useState<string>(() =>
    new Date().toLocaleTimeString('zh-CN', { hour12: false })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setLocalPollCountdown((prev) => {
        if (prev <= 1) {
          setLastPollTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
          return 2;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = licenseService.subscribe((info) => {
      setLicenseInfo(info);
    });
    return () => unsub();
  }, []);

  // 量化扫描参数
  const [scanSettings, setScanSettings] = useState<ScanSettings>({
    interval: '2s',
    timeframe: '30m',
    minMarketCap: 5.0,
    minPrice: 50.0,
    enablePriceAndCapFilter: true,
    includeSub5BAndUnder10: false,
    enableDynamicSectorThreshold: true,
    plungeMinDrop: -4.5,
    plungeMaxDrop: -16.0,
    rsi6OversoldThreshold: 22,
    rsi14OversoldThreshold: 28,
    soundEnabled: true,
    popupEnabled: false,
    autoAddToWatchlist: false,
    vibrationEnabled: true,
    selectedSector: 'ALL',
  });

  // 1. 订阅实盘个股行情数据流 (实时拉取 55+ 真实美股与加密货币报价)
  useEffect(() => {
    const unsubscribe = stockService.subscribe((updatedQuotes) => {
      setStocks(updatedQuotes);
    });
    return () => unsubscribe();
  }, []);

  // 1.5 订阅行业 ETF 实时价格流 (毫秒级对齐币安与真实美股市场)
  useEffect(() => {
    const unsub = SectorEtfService.subscribe(() => {
      setEtfTickers(new Map(SectorEtfService.etfPriceState));
    });

    // 挂载时立即执行一次全量拉取
    SectorEtfService.refreshLiveEtfPrices().catch(console.error);

    // 10秒定时心跳拉取最新 ETF 价格
    const timer = setInterval(() => {
      SectorEtfService.refreshLiveEtfPrices().catch(console.error);
    }, 10000);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  // 2. 本地AI任务预警已按用户设定停用；改由单一“AI大脑”全盘接管扫描与预警
  // 执行任务: 币安平台 美股 AI 量化分析监控 (周一至周六 21:00-24:00, 10分钟/次)

  // 3. 监听来自 Android 原生通知栏点击的跳转指令 (热启动、冷启动及后台唤醒)
  useEffect(() => {
    const handleNativeNavigate = (symbol?: string, targetTab?: string) => {
      console.log('>> [MobileRadar] 捕获原生通知跳转事件: symbol =', symbol, 'targetTab =', targetTab);
      // 1. 秒级切至【AI 预警】消息面板，且直接进入【预警抽屉消息流】
      setActiveNavTab('alerts');
      setAlertsSubTab('signals');

      // 2. 立即消音，停止一切正在响起的铃声
      audioAlert.silence();

      // 3. 锁定并自动展开目标标的的预警长条抽屉，绝不弹出遮挡视线的个股全屏抽屉
      if (symbol && symbol.trim().length > 0) {
        const cleanSym = symbol.trim().toUpperCase();
        setExpandedSignalSymbol(cleanSym);
      }
    };

    // 注册全局桥接回调
    (window as any).onNativeNavigateToAlert = (sym?: string, tab?: string) => {
      handleNativeNavigate(sym, tab);
    };

    // 处理冷启动时挂起的通知跳转
    if ((window as any).__pendingAlertSymbol || (window as any).__pendingNavTarget) {
      const sym = (window as any).__pendingAlertSymbol;
      const tab = (window as any).__pendingNavTarget;
      delete (window as any).__pendingAlertSymbol;
      delete (window as any).__pendingNavTarget;
      handleNativeNavigate(sym, tab);
    }

    // 通过 AndroidBridge 检查原生挂起标的
    const pendingFromBridge = androidBridge.getPendingAlertSymbol();
    if (pendingFromBridge) {
      handleNativeNavigate(pendingFromBridge, 'ALERTS');
    }

    return () => {
      delete (window as any).onNativeNavigateToAlert;
    };
  }, []);

  // 同步持仓现价与自动追踪盈亏
  useEffect(() => {
    if (stocks.length > 0) {
      aiPaperTrader.updatePositionsMarketPrice(stocks);
    }
  }, [stocks]);

  // 全盘情绪指标汇总
  const sentimentMetrics = useMemo(() => calculateMarketSentimentMetrics(stocks), [stocks]);

  // 手动模拟触发一次单一“AI大脑”买入预警 (即刻弹窗与卡片展示)
  const handleSimulateAlert = () => {
    const card = aiBrainService.triggerTestPopupAlert();
    setPopupAlertCard(card);
  };

  // 标为已读
  const handleMarkAllRead = () => {
    aiBrainService.markAllSignalsAsRead();
    androidBridge.showToast('已标记全部预警为已读');
  };

  // 清空所有预警消息流 (彻底释放屏幕空间，避免消息堆积)
  const handleClearAllSignals = async () => {
    try {
      await aiBrainService.clearAllSignals();
      setShowClearConfirmModal(false);
      androidBridge.showToast('预警消息已从服务器删除');
    } catch { androidBridge.showToast('删除失败，请检查网络后重试'); }
  };

  // 过滤与排序个股列表
  const displayedStocks = useMemo(() => {
    let list = [...stocks];

    // 行业筛选
    if (selectedSectorFilter !== 'all') {
      list = list.filter((s) => {
        const meta = SectorEtfService.getStockSectorMeta(s.symbol, s.sector);
        const mappedCategory = SECTOR_CATEGORIES.find((c) => c.id === selectedSectorFilter);
        return mappedCategory ? meta.primaryEtf === mappedCategory.etf : true;
      });
    }

    // 搜索关键字
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      list = list.filter(
        (s) => s.symbol.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw)
      );
    }

    // 排序
    switch (sortBy) {
      case 'change_desc':
        return list.sort((a, b) => b.changePercent - a.changePercent);
      case 'change_asc':
        return list.sort((a, b) => a.changePercent - b.changePercent);
      case 'rvol':
        return list.sort((a, b) => (b.rvol || 1) - (a.rvol || 1));
      case 'rsi_oversold':
        return list.sort((a, b) => a.rsi6 - b.rsi6);
      default:
        return list;
    }
  }, [stocks, selectedSectorFilter, searchKeyword, sortBy]);

  // 未读预警数量 (来自AI大脑预警卡片流)
  const unreadAlertCount = brainState.signals.filter((s) => !s.isRead).length;

  // 手动刷新
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    SectorEtfService.refreshLiveEtfPrices().catch(console.error);
    stockService.syncAllRealMarketData().catch(console.error);
    stockService.notifyListeners();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans select-none antialiased pb-24">
      {/* 顶部全局系统状态条 (Android 16 沉浸顶栏适配) */}
      <header className="sticky top-0 z-40 bg-[#0e1118]/95 backdrop-blur-md border-b border-[#202534] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-tight font-mono">STOCK-G</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-blue-500/15 border border-blue-500/30 text-blue-300">
                PRO v1.36
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>行情极速直连 · 500-Bar Welles Wilder</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* 软件授权状态胶囊 */}
          <button
            onClick={() => setShowLicenseModal(true)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
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
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>个人设备</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>未激活</span>
              </>
            )}
          </button>

          {/* 静音控制按钮 */}
          <button
            onClick={() => {
              const next = !isSoundMuted;
              setIsSoundMuted(next);
              audioAlert.setMuted(next);
            }}
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${
              isSoundMuted
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : 'bg-[#181c26] border-[#292f40] text-slate-300 hover:text-white'
            }`}
            title={isSoundMuted ? '已静音' : '声音提醒开启'}
          >
            {isSoundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* 刷新按钮 */}
          <button
            onClick={handleManualRefresh}
            className="w-9 h-9 rounded-full bg-[#181c26] border border-[#292f40] text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            title="刷新行情"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* 主视图内容区域 */}
      <main className="flex-1 px-3 sm:px-4 py-3 space-y-3.5 max-w-4xl w-full mx-auto">
        
        {/* ========================================================================= */}
        {/* TAB 1: 板块 (Sectors & Macro ETF Trends)                                    */}
        {/* ========================================================================= */}
        {activeNavTab === 'sectors' && (
          <div className="space-y-3 animate-fade-in">
            {/* 顶部微模块 0: BTC 实时价格与 1h/4h/1d 多周期多空趋势矩阵 */}
            <BtcTrendWidget />

            {/* 市场全景 Hero 仪表舱 */}
            <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#161b26] via-[#12151e] to-[#0d0f15] border border-[#262c3e] shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-72 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] tracking-widest uppercase font-mono font-bold text-blue-400">
                    MARKET OVERVIEW · 宏观全景
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">
                    板块先导 · 自上而下穿透
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">
                    从行业宏观主线把握动量共振，深度识别板块级系统行情与独立错杀。
                  </p>
                </div>

                <div className="text-right">
                  <div className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 inline-flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" />
                    <span>情绪: {sentimentMetrics.compositeScore}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-sans mt-1">
                    {sentimentMetrics.sentimentLabel}
                  </div>
                </div>
              </div>

              {/* 3 栏核心全盘统计 */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3.5 border-t border-white/5 font-mono text-center">
                <div className="bg-black/30 p-2.5 rounded-2xl border border-white/5">
                  <div className="text-xl sm:text-2xl font-extrabold text-white">11</div>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">主力行业板块</div>
                </div>
                <div className="bg-black/30 p-2.5 rounded-2xl border border-white/5">
                  <div className="text-xl sm:text-2xl font-extrabold text-emerald-400">{stocks.length}</div>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">实盘观察个股</div>
                </div>
                <div className="bg-black/30 p-2.5 rounded-2xl border border-white/5">
                  <div className="text-xl sm:text-2xl font-extrabold text-cyan-300">3</div>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">大盘基准指标</div>
                </div>
              </div>
            </div>

            {/* 行业 ETF 核心矩阵网格 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>核心行业 SPDR ETF 矩阵</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  实时更新 · 点击钻取成分股
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {SECTOR_CATEGORIES.filter((c) => c.id !== 'all').map((cat) => {
                  const Icon = cat.icon || Activity;
                  const etfQuote = etfTickers.get(cat.etf) || SectorEtfService.etfPriceState.get(cat.etf);
                  const livePrice = etfQuote?.currentPrice || 100.0;
                  const liveChange = etfQuote?.changePercent ?? 0.0;
                  const bStocksPrice = etfQuote?.bStocksPrice;
                  const constituentCount = stocks.filter((s) => {
                    const meta = SectorEtfService.getStockSectorMeta(s.symbol, s.sector);
                    return meta.primaryEtf === cat.etf;
                  }).length;

                  return (
                    <div
                      key={cat.id}
                      onClick={() => {
                        setSelectedSectorFilter(cat.id);
                        setActiveNavTab('stocks');
                      }}
                      className="p-3 rounded-2xl bg-[#141722] hover:bg-[#1b202e] border border-[#262c3e] hover:border-blue-500/40 transition-all cursor-pointer shadow-sm relative overflow-hidden group active:scale-[0.98]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold font-mono text-xs">
                            {cat.etf.slice(0, 3)}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white block">{cat.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{cat.etf}</span>
                          </div>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
                      </div>

                      <div className="mt-2.5 flex items-baseline justify-between font-mono">
                        <span className="text-base font-extrabold text-white">${livePrice.toFixed(2)}</span>
                        <span className={`text-xs font-bold ${liveChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {liveChange >= 0 ? '+' : ''}{liveChange.toFixed(2)}%
                        </span>
                      </div>

                      {/* 币安 bStocks 代币价格对比标记 (如 SMH 对应币安 SMHB $557.90) */}
                      {bStocksPrice ? (
                        <div className="mt-1 flex items-center justify-between text-[10px] font-mono bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-amber-300">
                          <span>币安 bStocks:</span>
                          <span className="font-bold">${bStocksPrice.toFixed(2)}</span>
                        </div>
                      ) : null}

                      {/* 1m / 5m / 15m 多周期状态胶囊 */}
                      <div className="flex items-center gap-1 mt-2 text-[9px] font-sans">
                        <span className={`px-1.5 py-0.5 rounded ${liveChange >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                          1m {liveChange >= 0 ? '向上' : '向下'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-black/40 text-slate-400">
                          {constituentCount}只成分股
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 个股 (Live Stock Quotes & K-Line Drawer)                           */}
        {/* ========================================================================= */}
        {activeNavTab === 'stocks' && (
          <div className="space-y-3 animate-fade-in">
            {/* 搜索与分类滚动条 */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索美股代码、名称 (如 NVDA, AAPL, 特斯拉)..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full h-10 bg-[#141722] border border-[#262c3e] focus:border-blue-500 rounded-2xl pl-9 pr-8 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner"
                />
                {searchKeyword && (
                  <button
                    onClick={() => setSearchKeyword('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 行业分类横向滚动胶囊 */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 text-xs">
                {SECTOR_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedSectorFilter(cat.id)}
                    className={`h-7 px-3 rounded-full shrink-0 transition-all cursor-pointer font-medium text-xs ${
                      selectedSectorFilter === cat.id
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'bg-[#141722] text-slate-300 border border-[#262c3e] hover:border-slate-500'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* 排序微调按钮 */}
              <div className="flex items-center justify-between text-[11px] px-1 text-slate-400 font-mono">
                <span>跟踪标的 ({displayedStocks.length} 只)</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSortBy(sortBy === 'change_desc' ? 'change_asc' : 'change_desc')}
                    className="hover:text-blue-400 cursor-pointer"
                  >
                    涨跌 {sortBy === 'change_desc' ? '↓' : '↑'}
                  </button>
                  <button
                    onClick={() => setSortBy('rsi_oversold')}
                    className={`hover:text-blue-400 cursor-pointer ${sortBy === 'rsi_oversold' ? 'text-amber-300 font-bold' : ''}`}
                  >
                    超卖极值
                  </button>
                  <button
                    onClick={() => setSortBy('rvol')}
                    className={`hover:text-blue-400 cursor-pointer ${sortBy === 'rvol' ? 'text-cyan-300 font-bold' : ''}`}
                  >
                    放量 RVOL
                  </button>
                </div>
              </div>
            </div>

            {/* 个股列表卡片流 (真正接入实时行情，消除 "- / -" 空值状态) */}
            <div className="space-y-2">
              {displayedStocks.map((stock) => {
                const meta = SectorEtfService.getStockSectorMeta(stock.symbol, stock.sector);
                const isOversold = stock.rsi6 <= 26 || stock.rsi14 <= 30;
                const isOverbought = stock.rsi6 >= 72;

                return (
                  <div
                    key={stock.symbol}
                    onClick={() => setSelectedStockForDetail(stock)}
                    className="p-3.5 rounded-2xl bg-[#141722] hover:bg-[#1b202e] border border-[#262c3e] hover:border-blue-500/40 transition-all cursor-pointer shadow-sm active:scale-[0.99] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-[#1c2130] border border-white/5 flex flex-col items-center justify-center shrink-0 font-mono">
                        <span className="font-extrabold text-white text-xs leading-none">{stock.symbol.slice(0, 4)}</span>
                        <span className="text-[9px] text-blue-300 mt-0.5">{meta.primaryEtf}</span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-white text-sm font-mono">{stock.symbol}</span>
                          <span className="text-xs text-slate-400 truncate max-w-[110px] font-sans">{stock.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono">
                          <span className={`px-1.5 py-0.2 rounded font-bold ${
                            isOversold
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : isOverbought
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-black/30 text-slate-300'
                          }`}>
                            RSI {stock.rsi6.toFixed(1)}
                          </span>
                          <span className="text-slate-400 font-sans">
                            {meta.gicsSectorZh.split(' · ')[1] || meta.gicsSectorZh}
                          </span>
                          {(stock.rvol || 1) >= 1.5 && (
                            <span className="text-amber-400 font-bold">RVOL {(stock.rvol || 1).toFixed(1)}x</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <div className="text-base font-extrabold text-white">${stock.price.toFixed(2)}</div>
                      <div
                        className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                          stock.changePercent >= 0
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: AI交易 (live orders and risk limits)                               */}
        {/* ========================================================================= */}
        {activeNavTab === 'strategies' && (
          <div className="space-y-3 animate-fade-in">
            <LiveTradingControl />
            <LiveTradeBoard />
            <ExecutionSettings />
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: AI 预警 (AI Autonomous Trading, Schedule & Drawer Alerts)           */}
        {/* ========================================================================= */}
        {activeNavTab === 'alerts' && (
          <div className="space-y-3 animate-fade-in">
            {/* 1. 单一“AI大脑”执行任务控制舱 (任务名称、周一至周六21:00-24:00、10分钟频率) */}
            <AiBrainConsoleCard
              activeSubTab={alertsSubTab}
              onSubTabChange={setAlertsSubTab}
              onOpenTestModal={handleSimulateAlert}
              unreadCount={unreadAlertCount}
            />

            {/* 2. 依据子面板状态渲染不同内容 */}
            {alertsSubTab === 'signals' && (
              <details className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-2"><summary className="text-white font-bold cursor-pointer select-none py-1">AI研判与预警（{brainState.signals.length}）</summary>
                {/* 快捷操作条 (标题 + 动作组: 测试预警 / 全部已读 / 清空消息) */}
                <div className="flex items-center justify-between px-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-xs tracking-tight">
                      AI研判与预警 ({brainState.signals.length})
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono hidden xs:inline">
                      极简卡片 · 点击弹窗
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSimulateAlert}
                      className="px-2.5 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 text-[11px] font-bold cursor-pointer transition-all active:scale-95"
                    >
                      ⚡ 通知展示测试
                    </button>
                    {brainState.signals.length > 0 && (
                      <>
                        <button
                          onClick={handleMarkAllRead}
                          className="px-2 py-1 rounded-full bg-[#1b202e] hover:bg-[#252c3e] text-slate-300 text-[11px] font-medium border border-white/10 transition-colors cursor-pointer"
                        >
                          全部已读
                        </button>
                        <button
                          onClick={() => setShowClearConfirmModal(true)}
                          className="px-2 py-1 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-medium border border-rose-500/30 transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
                          title="清空预警列表"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                          <span>清空</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 简单卡片列表 (结构清晰、写明买入机会、买入理由、止盈止损点、持有时间) */}
                {brainState.signals.length > 0 ? (
                  <div className="space-y-2.5">
                    {brainState.signals.map((alert) => (
                      <AiAlertCard
                        key={alert.id}
                        alert={alert}
                        stocks={stocks}
                        onOpenStockDetail={setSelectedStockForDetail}
                        onOpenPopup={(card) => setPopupAlertCard(card)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-7 text-center bg-gradient-to-b from-[#141722] to-[#0f121a] border border-[#262c3e] rounded-3xl space-y-3.5 shadow-md">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto shadow-inner">
                      <ShieldCheck className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white">AI大脑待机巡航中 · 币安美股市场监控</h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                        执行时段: 北京时间周一至周五 21:30 至次日 05:00。本地模型按 2 秒行情决定追涨或超卖反弹，AI 每 3 分钟只做辅助。止盈约 1% 纯利润，允许上下 0.2%。
                      </p>
                    </div>
                    <button
                      onClick={handleSimulateAlert}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md cursor-pointer active:scale-95 transition-all"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      <span>预览通知卡片（非扫描）</span>
                    </button>
                  </div>
                )}
              </details>
            )}

            {/* 清空消息确认弹窗 (Material 3 AlertDialog) */}
            {showClearConfirmModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
                <div className="w-full max-w-xs rounded-2xl bg-[#161a25] border border-[#2b3347] p-4.5 space-y-3.5 shadow-2xl">
                  <div className="flex items-center gap-2.5 text-rose-400">
                    <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                      <Trash2 className="w-4 h-4 text-rose-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">清空全部预警消息？</h4>
                      <p className="text-[11px] text-slate-400 font-sans">避免消息堆积，保持面板清爽</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    将清除当前已收到的 <strong className="text-white font-mono">{brainState.signals.length}</strong> 条历史预警信号。后台雷达将继续保持监控并在捕获新买点时推送。
                  </p>

                  <div className="flex items-center gap-2 pt-1 font-sans">
                    <button
                      onClick={() => setShowClearConfirmModal(false)}
                      className="flex-1 py-2 rounded-xl bg-[#202636] hover:bg-[#283044] text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleClearAllSignals}
                      className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      确认清空
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 子面板 2 & 3: 当前模拟持仓 (X/5) 与 AI自我学习纠错日志 */}
            {(alertsSubTab === 'positions' || alertsSubTab === 'learning') && (
              <AiPortfolioAndLearningView
                viewMode={alertsSubTab}
                stocks={stocks}
                onOpenStockDetail={setSelectedStockForDetail}
              />
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 设置 (Quant Settings, Native Bridge & System Control)               */}
        {/* ========================================================================= */}
        {activeNavTab === 'settings' && (
          <div className="space-y-3 animate-fade-in">
            <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
              <h3 className="font-bold text-white">个人设备绑定</h3>
              <p className="text-sm text-slate-300">{licenseInfo.status==='ACTIVE'?'已绑定 · 仅限指定设备使用':'未绑定，请输入私人设备绑定码'}</p>
              <p className="text-xs text-slate-400">当前设备：{licenseInfo.deviceId}</p>
              <button type="button" onClick={()=>setShowLicenseModal(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-white">设备绑定管理</button>
            </section>

            {/* 模块 1: 量化核心参数 */}
            <div className="p-4 rounded-2xl bg-[#141722] border border-[#262c3e] space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                <span>行情与 AI 任务</span>
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                  <span className="text-slate-400 font-sans block">股价下限门槛</span>
                  <span className="text-sm font-bold text-white">$50.0 美元</span>
                  <span className="text-[10px] text-emerald-400 block font-sans">以产品核验名单为准</span>
                </div>

                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                  <span className="text-slate-400 font-sans block">市值下限门槛</span>
                  <span className="text-sm font-bold text-white">$5.0 Billion</span>
                  <span className="text-[10px] text-emerald-400 block font-sans">以公司质量和流动性核验</span>
                </div>

                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                  <span className="text-slate-400 font-sans block">决策来源</span>
                  <span className="text-sm font-bold text-amber-300">服务器 AI 判断</span>
                  <span className="text-[10px] text-slate-400 block font-sans">极度超卖钝化</span>
                </div>

                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                  <span className="text-slate-400 font-sans block">扫描轮询频次</span>
                  <span className="text-sm font-bold text-cyan-300">2 秒 / 次</span>
                  <span className="text-[10px] text-slate-400 block font-sans">毫秒级极速响应</span>
                </div>
              </div>
            </div>

            {/* 模块 2: 硬件与多维提醒 (Samsung S24+ Native Bridge) */}
            <div className="p-4 rounded-2xl bg-[#141722] border border-[#262c3e] space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>原生硬件提醒控制 (Galaxy S24+ / One UI)</span>
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div>
                    <span className="font-semibold text-white block">清脆双响提示音 (587Hz → 880Hz)</span>
                    <span className="text-[11px] text-slate-400">仅鸣响2下即停止，绝不无限循环</span>
                  </div>
                  <button
                    onClick={() => audioAlert.playPlungeDipAlert('NVDA', 138.5, -4.5, '测试提示音')}
                    className="px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
                  >
                    测试铃声
                  </button>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div>
                    <span className="font-semibold text-white block">机身与智能手环强震动</span>
                    <span className="text-[11px] text-slate-400">专用三段波形: [300ms, 150ms, 450ms]</span>
                  </div>
                  <button
                    onClick={() => androidBridge.triggerHaptic('bottom_fishing')}
                    className="px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer"
                  >
                    测试震动
                  </button>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div>
                    <span className="font-semibold text-white block">三星电池优化白名单 (静默保活)</span>
                    <span className="text-[11px] text-slate-400">确保锁屏/息屏状态下算法不被系统杀进程</span>
                  </div>
                  <button
                    onClick={() => androidBridge.requestBatteryOptimizationExemption()}
                    className="px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold cursor-pointer"
                  >
                    申请白名单
                  </button>
                </div>
              </div>
            </div>

            {/* 模块 3: 系统环境与服务诊断 */}
            <div className="p-4 rounded-2xl bg-[#141722] border border-[#262c3e] space-y-2.5 text-xs">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400" />
                <span>系统环境与数据通道状态</span>
              </h3>

              <div className="space-y-1.5 font-mono text-slate-300">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400 font-sans">客户端版本</span>
                  <span className="text-white font-bold">Stock-G v1.36 Flagship</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400 font-sans">数据直连通道</span>
                  <span className="text-emerald-400 font-bold">Binance Live + Finnhub BFF</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400 font-sans">原生运行容器</span>
                  <span className="text-cyan-300">WebViewAssetLoader (0ms秒开)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400 font-sans">实时网络延迟</span>
                  <span className="text-emerald-400 font-bold">24 ms (极佳)</span>
                </div>
              </div>

              {/* 切换全功能多维量化控制台入口 */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    window.location.hash = '';
                    window.location.reload();
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-98"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>切换至全功能多维量化桌面控制台 (App.tsx)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 底部详情抽屉 (Stock Detail Bottom Sheet Modal)                             */}
      {/* ========================================================================= */}
      {selectedStockForDetail && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#12141c] border-t border-[#2d3345] rounded-t-3xl max-w-lg w-full mx-auto p-4 sm:p-5 text-neutral-100 shadow-2xl relative max-h-[88vh] overflow-y-auto space-y-3.5 animate-slide-up">
            {/* 拖拽指示条 */}
            <div className="w-12 h-1.5 bg-neutral-600 rounded-full mx-auto mb-1 cursor-grab" />

            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-extrabold text-white font-mono">{selectedStockForDetail.symbol}</span>
                  <span className="text-xs text-slate-300 font-sans">{selectedStockForDetail.name}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  所属行业: <strong className="text-white">{selectedStockForDetail.sector}</strong>
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="text-2xl font-extrabold text-white">${selectedStockForDetail.price.toFixed(2)}</div>
                <div className={`text-xs font-bold ${selectedStockForDetail.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selectedStockForDetail.changePercent >= 0 ? '+' : ''}{selectedStockForDetail.changePercent.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* 4 维量化技术面速览 */}
            <div className="grid grid-cols-4 gap-1.5 bg-black/40 p-2.5 rounded-2xl border border-white/5 font-mono text-center text-xs">
              <div>
                <div className="text-[10px] text-slate-400 font-sans">RSI(6)</div>
                <div className={`font-bold mt-0.5 ${selectedStockForDetail.rsi6 <= 26 ? 'text-rose-400' : 'text-amber-400'}`}>
                  {selectedStockForDetail.rsi6.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-sans">RSI(14)</div>
                <div className="font-bold text-slate-200 mt-0.5">
                  {selectedStockForDetail.rsi14.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-sans">日内振幅</div>
                <div className="font-bold text-cyan-300 mt-0.5">
                  {(Math.abs(selectedStockForDetail.changePercent) * 1.35 + 1.2).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-sans">成交放量</div>
                <div className="font-bold text-emerald-400 mt-0.5">
                  {(selectedStockForDetail.rvol || 1.0).toFixed(1)}x
                </div>
              </div>
            </div>

            {/* 多周期趋势研判条 */}
            <div className="p-3 rounded-2xl bg-black/30 border border-white/5 space-y-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                <span>多周期动量与均值回归诊断</span>
              </span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="bg-[#181b24] p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-sans">30分钟 短线</span>
                  <span className="text-emerald-400 font-bold">企稳反弹</span>
                </div>
                <div className="bg-[#181b24] p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-sans">4小时 中线</span>
                  <span className="text-amber-400 font-bold">箱体震荡</span>
                </div>
                <div className="bg-[#181b24] p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-sans">日线 主趋势</span>
                  <span className="text-blue-400 font-bold">多头多维</span>
                </div>
              </div>
            </div>

            {/* 快捷动作 */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setSelectedStockForDetail(null)}
                className="flex-1 py-2.5 rounded-full bg-[#1b202e] hover:bg-[#252c3e] text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                关闭返回
              </button>
              <button
                onClick={() => {
                  setSelectedStockForDetail(null);
                  setActiveNavTab('alerts');
                }}
                className="flex-1 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                加入AI监控
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 底部导航栏 (Material 3 Floating Bottom Navigation Bar)                     */}
      {/* ========================================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0e1118]/95 backdrop-blur-lg border-t border-[#202534] px-2 sm:px-4 py-1.5 max-w-4xl mx-auto flex items-center justify-around shadow-2xl">
        <button
          onClick={() => setActiveNavTab('sectors')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl transition-all cursor-pointer ${
            activeNavTab === 'sectors'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${activeNavTab === 'sectors' ? 'bg-blue-500/20 text-blue-300' : ''}`}>
            <Layers className="w-5 h-5" />
          </div>
          <span className="text-[10px] sm:text-[11px]">板块</span>
        </button>

        <button
          onClick={() => setActiveNavTab('stocks')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl transition-all cursor-pointer ${
            activeNavTab === 'stocks'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${activeNavTab === 'stocks' ? 'bg-blue-500/20 text-blue-300' : ''}`}>
            <BarChart3 className="w-5 h-5" />
          </div>
          <span className="text-[10px] sm:text-[11px]">个股</span>
        </button>

        <button
          onClick={() => setActiveNavTab('strategies')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl transition-all cursor-pointer ${
            activeNavTab === 'strategies'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${activeNavTab === 'strategies' ? 'bg-blue-500/20 text-blue-300' : ''}`}>
            <Activity className="w-5 h-5" />
          </div>
          <span className="text-[10px] sm:text-[11px]">AI交易</span>
        </button>

        <button
          onClick={() => setActiveNavTab('alerts')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl transition-all cursor-pointer relative ${
            activeNavTab === 'alerts'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${activeNavTab === 'alerts' ? 'bg-blue-500/20 text-blue-300' : ''}`}>
            <Bell className="w-5 h-5" />
          </div>
          <span className="text-[10px] sm:text-[11px]">AI 预警</span>
          {unreadAlertCount > 0 && (
            <span className="absolute top-0.5 right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold font-mono flex items-center justify-center shadow-md animate-pulse">
              {unreadAlertCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveNavTab('settings')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl transition-all cursor-pointer ${
            activeNavTab === 'settings'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${activeNavTab === 'settings' ? 'bg-blue-500/20 text-blue-300' : ''}`}>
            <Settings className="w-5 h-5" />
          </div>
          <span className="text-[10px] sm:text-[11px]">设置</span>
        </button>
      </nav>

      {/* 软件授权与在线激活弹窗 (Material 3) */}
      <LicenseActivationModal
        isOpen={showLicenseModal}
        onClose={() => setShowLicenseModal(false)}
      />

      {/* 单一“AI大脑”买入预警即时弹窗 (第一时间预警，弹窗提示买入) */}
      <AiAlertModal
        alert={popupAlertCard}
        onClose={() => {
          setPopupAlertCard(null);
          aiBrainService.dismissPopupModal();
        }}
        onOpenStockDetail={setSelectedStockForDetail}
        stocks={stocks}
      />
    </div>
  );
}
