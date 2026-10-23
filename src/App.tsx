/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { ScanControlBar } from './components/ScanControlBar';
import { DipReboundScanner } from './components/DipReboundScanner';
import { BreakoutScanner } from './components/BreakoutScanner';
import { RangeOscillatorScanner } from './components/RangeOscillatorScanner';
import { WatchlistMonitor } from './components/WatchlistMonitor';
import { AndroidServerBlueprint } from './components/AndroidServerBlueprint';
import { StrategyGuide } from './components/StrategyGuide';
import { StrategyStatsPanel } from './components/StrategyStatsPanel';
import { TopRightAlertDrawer } from './components/TopRightAlertDrawer';
import { StockDetailModal } from './components/StockDetailModal';
import { AlertModal } from './components/AlertModal';
import { RsiCalibrationModal } from './components/RsiCalibrationModal';
import { ServerSyncModal } from './components/ServerSyncModal';
import { PreMarketLiquidityStrip } from './components/PreMarketLiquidityStrip';
import { SectorCorrelationMatrixPanel } from './components/SectorCorrelationMatrixPanel';
import { stockService } from './services/stockService';
import { QuantEngine } from './services/quantEngine';
import { audioAlert } from './services/audioAlert';
import { androidBridge } from './services/androidBridge';
import { serverSyncService, SyncState } from './services/serverSyncService';
import { strategyStatsService } from './services/strategyStatsService';
import { backgroundKeepAliveService } from './services/backgroundWorker';
import {
  StockQuote,
  QuantSignal,
  MonitoredPosition,
  ScanSettings,
  AutoTradeConfig,
  TradeExecutionLog,
  AutoTradeCloseReason
} from './types/stock';
import {
  Zap,
  Flame,
  Activity,
  LineChart,
  Server,
  Shield,
  Wifi,
  Battery,
  Signal,
  BarChart3,
  Layers
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dip' | 'breakout' | 'range' | 'watchlist' | 'matrix' | 'blueprint' | 'guide' | 'stats'>('dip');
  const [isMobileFrame, setIsMobileFrame] = useState(false);
  const [stocks, setStocks] = useState<StockQuote[]>(() => stockService.getAllQuotes());
  const [isScanning, setIsScanning] = useState(true);

  const [settings, setSettings] = useState<ScanSettings>({
    interval: '2s',
    timeframe: '30m',
    minMarketCap: 5.0, // 严选市值门槛 5.0 Billion
    minPrice: 50.0, // 严选股价门槛 50.0 USD (股价不低于50美元)
    enablePriceAndCapFilter: true, // 默认开启股价>=50且市值>=5B严选过滤
    includeSub5BAndUnder10: false, // 默认屏蔽低价小盘股
    enableDynamicSectorThreshold: true, // 开启基于板块6个月基准动态阈值
    plungeMinDrop: -4.5,
    plungeMaxDrop: -16.0,
    rsi6OversoldThreshold: 22,
    rsi14OversoldThreshold: 28,
    soundEnabled: true,
    popupEnabled: false, // 默认关闭满屏弹窗，改为右上角抽屉闪烁与原生通知
    autoAddToWatchlist: false,
    vibrationEnabled: true,
    selectedSector: 'ALL',
  });

  const [countdown, setCountdown] = useState(2);
  const [signalsMap, setSignalsMap] = useState<Map<string, QuantSignal>>(new Map());
  const [latestBuySignal, setLatestBuySignal] = useState<QuantSignal | null>(null);
  const [popupAlertSignal, setPopupAlertSignal] = useState<QuantSignal | null>(null);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [selectedStockForDetail, setSelectedStockForDetail] = useState<StockQuote | null>(null);
  const [alertHistory, setAlertHistory] = useState<QuantSignal[]>([]);
  const [showRsiCalibrationModal, setShowRsiCalibrationModal] = useState(false);
  const [showServerSyncModal, setShowServerSyncModal] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(() => serverSyncService.getState());

  useEffect(() => {
    const unsub = serverSyncService.subscribe(setSyncState);
    return () => unsub();
  }, []);

  // 同一支股票防重复提醒冷却期: 3分钟 (180,000ms)，避免频繁轰炸
  const STOCK_ALERT_COOLDOWN_MS = 3 * 60 * 1000;
  // 全局声音与强提醒最小间隔: 25秒 (25,000ms)，彻底消灭 2~5 秒循环发声打扰
  const GLOBAL_ALERT_COOLDOWN_MS = 25 * 1000;
  const lastStockAlertTimesRef = useRef<Map<string, number>>(new Map());
  const lastGlobalAlertTimeRef = useRef<number>(0);

  // 计算未读预警数量
  const unreadAlertCount =
    alertHistory.filter((s) => !s.isRead).length +
    (latestBuySignal && !latestBuySignal.isRead && !alertHistory.some((h) => h.id === latestBuySignal.id) ? 1 : 0);

  // 标记全部预警为已读并立即消除正在响的提示音与系统通知
  const handleMarkAllAlertsAsRead = () => {
    audioAlert.silence();
    const nowMs = Date.now();
    // 关键优化：将当前所有已触发个股写入冷却表，并延展全局抑制20秒，彻底防止下一轮扫描2-5s继续响铃
    lastGlobalAlertTimeRef.current = nowMs + 20000;
    alertHistory.forEach((sig) => {
      lastStockAlertTimesRef.current.set(sig.symbol, nowMs);
    });
    if (latestBuySignal) {
      lastStockAlertTimesRef.current.set(latestBuySignal.symbol, nowMs);
    }
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setAlertHistory((prev) =>
      prev.map((sig) => ({ ...sig, isRead: true, readAt: nowStr }))
    );
    setLatestBuySignal((prev) => (prev ? { ...prev, isRead: true, readAt: nowStr } : null));
  };

  // 标记单个预警为已读并停止铃声
  const handleMarkSignalAsRead = (signalId: string) => {
    audioAlert.silence();
    const nowMs = Date.now();
    const foundSig = alertHistory.find((sig) => sig.id === signalId);
    if (foundSig) {
      lastStockAlertTimesRef.current.set(foundSig.symbol, nowMs);
    }
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setAlertHistory((prev) =>
      prev.map((sig) => (sig.id === signalId ? { ...sig, isRead: true, readAt: nowStr } : sig))
    );
    setLatestBuySignal((prev) => (prev && prev.id === signalId ? { ...prev, isRead: true, readAt: nowStr } : prev));
  };

  // 点开/收回预警抽屉
  const handleToggleAlertDrawer = () => {
    setIsAlertDrawerOpen((prev) => {
      const next = !prev;
      if (next) {
        audioAlert.silence();
        handleMarkAllAlertsAsRead();
      }
      return next;
    });
  };

  // Initial positions
  const [positions, setPositions] = useState<MonitoredPosition[]>(() => {
    const saved = localStorage.getItem('shot_stock_positions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [
      {
        id: 'pos-1',
        symbol: 'AMD',
        name: 'Advanced Micro Devices (超威半导体)',
        entryPrice: 605.00,
        quantity: 50,
        currentPrice: 613.10,
        targetProfitPercent: 3.5,
        stopLossPercent: 2.0,
        entryDate: '2026-10-12',
        strategyUsed: 'PLUNGE_DIP',
        highestPriceSinceEntry: 614.50,
        isAlertedProfit: false,
        isAlertedLoss: false,
        isTrailingEnabled: true,
        trailingActivationPercent: 1.8,
        trailingCallbackPercent: 0.8,
        isBreakevenLocked: true,
        isTrailingTriggered: false,
      },
      {
        id: 'pos-2',
        symbol: 'TSLA',
        name: 'Tesla Inc. (特斯拉)',
        entryPrice: 375.00,
        quantity: 100,
        currentPrice: 377.10,
        targetProfitPercent: 3.0,
        stopLossPercent: 2.2,
        entryDate: '2026-10-13',
        strategyUsed: 'PLUNGE_DIP',
        highestPriceSinceEntry: 378.50,
        isAlertedProfit: false,
        isAlertedLoss: false,
        isTrailingEnabled: true,
        trailingActivationPercent: 1.8,
        trailingCallbackPercent: 0.8,
        isBreakevenLocked: false,
        isTrailingTriggered: false,
      },
      {
        id: 'pos-3',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation (英伟达)',
        entryPrice: 227.00,
        quantity: 100,
        currentPrice: 229.80,
        targetProfitPercent: 3.5,
        stopLossPercent: 1.8,
        entryDate: '2026-10-13',
        strategyUsed: 'OPENING_BREAKOUT',
        highestPriceSinceEntry: 230.50,
        isAlertedProfit: false,
        isAlertedLoss: false,
        isTrailingEnabled: true,
        trailingActivationPercent: 1.8,
        trailingCallbackPercent: 0.8,
        isBreakevenLocked: true,
        isTrailingTriggered: false,
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('shot_stock_positions', JSON.stringify(positions));
    androidBridge.syncPositions(positions);
    serverSyncService.syncPositions(positions);
  }, [positions]);

  // 自动交易执行逻辑设置 (Auto-Trade Config)
  const [autoTradeConfig, setAutoTradeConfig] = useState<AutoTradeConfig>(() => {
    const saved = localStorage.getItem('shot_stock_auto_trade_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return {
      isEnabled: true,
      autoCloseOnProfit: true,
      autoCloseOnLoss: true,
      autoCloseOnTrailing: true,
      maxSlippagePercent: 0.05,
      notifyOnExecution: true,
      vibrateOnExecution: true,
    };
  });

  useEffect(() => {
    localStorage.setItem('shot_stock_auto_trade_config', JSON.stringify(autoTradeConfig));
  }, [autoTradeConfig]);

  // 自动平仓实盘模拟交易日志 (Trade Execution Logs)
  const [tradeLogs, setTradeLogs] = useState<TradeExecutionLog[]>(() => {
    const saved = localStorage.getItem('shot_stock_trade_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [
      {
        id: 'log-1',
        orderId: 'ORD-892104-XK39',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        side: 'SELL',
        orderType: 'MARKET',
        quantity: 150,
        entryPrice: 224.20,
        executionPrice: 231.80,
        realizedPnL: 1140.00,
        realizedPnLPercent: 3.39,
        reason: 'TAKE_PROFIT',
        reasonDetail: '突破预设止盈线 +3.39% (预设 +3.0%)，毫秒级市价单自动平仓',
        timestamp: '14:28:16',
        status: 'FILLED',
        executionLatencyMs: 14,
        strategyUsed: 'OPENING_BREAKOUT',
        isNativeExecuted: true,
      },
      {
        id: 'log-2',
        orderId: 'ORD-881902-MN41',
        symbol: 'AMD',
        name: 'Advanced Micro Devices',
        side: 'SELL',
        orderType: 'MARKET',
        quantity: 100,
        entryPrice: 156.40,
        executionPrice: 158.90,
        realizedPnL: 250.00,
        realizedPnLPercent: 1.60,
        reason: 'TRAILING_STOP',
        reasonDetail: '移动止损保本锁定触发，动态锁盈平仓',
        timestamp: '11:15:42',
        status: 'FILLED',
        executionLatencyMs: 9,
        strategyUsed: 'RANGE_OSCILLATOR',
        isNativeExecuted: true,
      },
      {
        id: 'log-3',
        orderId: 'ORD-873210-QL88',
        symbol: 'INTC',
        name: 'Intel Corporation',
        side: 'SELL',
        orderType: 'MARKET',
        quantity: 200,
        entryPrice: 23.40,
        executionPrice: 22.90,
        realizedPnL: -100.00,
        realizedPnLPercent: -2.14,
        reason: 'STOP_LOSS',
        reasonDetail: '触及硬止损阈值 -2.14%，系统强制截断亏损保护本金',
        timestamp: '09:42:08',
        status: 'FILLED',
        executionLatencyMs: 16,
        strategyUsed: 'PLUNGE_DIP',
        isNativeExecuted: true,
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('shot_stock_trade_logs', JSON.stringify(tradeLogs));
  }, [tradeLogs]);

  // Toast banner for trade execution
  const [tradeToast, setTradeToast] = useState<{
    message: string;
    pnl: number;
    pnlPercent: number;
    symbol: string;
  } | null>(null);

  useEffect(() => {
    if (!tradeToast) return;
    const timer = setTimeout(() => {
      setTradeToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [tradeToast]);

  // Execute mock close for a position via Android Bridge
  const handleExecuteMockClose = (
    pos: MonitoredPosition,
    reason: AutoTradeCloseReason,
    reasonDetail: string
  ) => {
    const live = stocks.find((s) => s.symbol === pos.symbol);
    const currPrice = live ? live.price : pos.currentPrice;
    const pnl = (currPrice - pos.entryPrice) * pos.quantity;
    const pnlPercent = ((currPrice - pos.entryPrice) / pos.entryPrice) * 100;

    const res = androidBridge.executeMockOrder({
      symbol: pos.symbol,
      name: pos.name,
      side: 'SELL',
      quantity: pos.quantity,
      price: currPrice,
      reason,
      reasonDetail,
      entryPrice: pos.entryPrice,
      realizedPnL: pnl,
      realizedPnLPercent: pnlPercent,
    });

    if (pnl >= 0) {
      if (settings.soundEnabled) audioAlert.playTakeProfitAlert();
      androidBridge.triggerHaptic('take_profit');
    } else {
      if (settings.soundEnabled) audioAlert.playStopLossAlert();
      androidBridge.triggerHaptic('stop_loss');
    }

    const newLog: TradeExecutionLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orderId: res.orderId,
      symbol: pos.symbol,
      name: pos.name,
      side: 'SELL',
      orderType: 'MARKET',
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      executionPrice: currPrice,
      realizedPnL: pnl,
      realizedPnLPercent: pnlPercent,
      reason,
      reasonDetail,
      timestamp: res.timestamp,
      status: 'FILLED',
      executionLatencyMs: res.latencyMs,
      strategyUsed: pos.strategyUsed,
      isNativeExecuted: res.isNative,
    };

    setTradeLogs((prev) => [newLog, ...prev]);
    setPositions((prev) => prev.filter((p) => p.id !== pos.id));

    setTradeToast({
      symbol: pos.symbol,
      message: `【自动平仓成交】已通过 androidBridge 自动平仓 ${pos.quantity} 股 (${reasonDetail})`,
      pnl,
      pnlPercent,
    });
  };

  // Trigger test mock order execution
  const handleTriggerTestOrder = () => {
    const symbols = ['NVDA', 'TSLA', 'SMCI', 'PLTR', 'AMD'];
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const quote = stocks.find((s) => s.symbol === sym) || stocks[0];
    const qty = 100;
    const isWin = Math.random() > 0.3;
    const diffPct = isWin ? Math.random() * 2.5 + 1.2 : -(Math.random() * 1.8 + 0.8);
    const entryPrice = quote.price / (1 + diffPct / 100);
    const currPrice = quote.price;
    const pnl = (currPrice - entryPrice) * qty;

    const res = androidBridge.executeMockOrder({
      symbol: sym,
      name: quote.name,
      side: 'SELL',
      quantity: qty,
      price: currPrice,
      reason: isWin ? 'TAKE_PROFIT' : 'STOP_LOSS',
      reasonDetail: isWin ? '测试触发：达到目标止盈线 +3.0%' : '测试触发：触及硬止损阈值 -2.0%',
      entryPrice,
      realizedPnL: pnl,
      realizedPnLPercent: diffPct,
    });

    if (isWin) {
      if (settings.soundEnabled) audioAlert.playTakeProfitAlert();
      androidBridge.triggerHaptic('take_profit');
    } else {
      if (settings.soundEnabled) audioAlert.playStopLossAlert();
      androidBridge.triggerHaptic('stop_loss');
    }

    const newLog: TradeExecutionLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orderId: res.orderId,
      symbol: sym,
      name: quote.name,
      side: 'SELL',
      orderType: 'MARKET',
      quantity: qty,
      entryPrice: parseFloat(entryPrice.toFixed(2)),
      executionPrice: currPrice,
      realizedPnL: parseFloat(pnl.toFixed(2)),
      realizedPnLPercent: parseFloat(diffPct.toFixed(2)),
      reason: isWin ? 'TAKE_PROFIT' : 'STOP_LOSS',
      reasonDetail: isWin ? '测试模拟：目标止盈达成平仓' : '测试模拟：风控止损自动平仓',
      timestamp: res.timestamp,
      status: 'FILLED',
      executionLatencyMs: res.latencyMs,
      strategyUsed: 'OPENING_BREAKOUT',
      isNativeExecuted: res.isNative,
    };

    setTradeLogs((prev) => [newLog, ...prev]);
    setTradeToast({
      symbol: sym,
      message: `【测试模拟下单】${sym} 模拟平仓已由 androidBridge 原生网关成交 (${res.latencyMs}ms)`,
      pnl,
      pnlPercent: diffPct,
    });
  };

  const getIntervalMs = (interval: string): number => {
    if (interval.endsWith('s')) return parseInt(interval) * 1000;
    if (interval.endsWith('m')) return parseInt(interval) * 60 * 1000;
    if (interval.endsWith('h')) return parseInt(interval) * 3600 * 1000;
    return 2000;
  };

  const runScanCycle = () => {
    const updatedStocks = stockService.tickScan();
    setStocks(updatedStocks);
    strategyStatsService.updateLiveTracking(updatedStocks);

    const minPrice = settings.enablePriceAndCapFilter ? (settings.minPrice ?? 50.0) : 0;
    const minCap = settings.enablePriceAndCapFilter ? (settings.minMarketCap ?? 5.0) : 0;

    const targetPool = updatedStocks.filter((s) => {
      if (s.price < minPrice) return false;
      if (s.exchange !== 'BINANCE' && s.marketCap < minCap) return false;
      return true;
    });

    const newSignalsMap = new Map<string, QuantSignal>();
    const newSignalsList: QuantSignal[] = [];

    targetPool.forEach((stock) => {
      const signal = QuantEngine.evaluateStock(stock, settings);
      if (signal) {
        newSignalsMap.set(stock.symbol, signal);
        newSignalsList.push(signal);
      }
    });

    setSignalsMap(newSignalsMap);

    const nowMs = Date.now();
    const freshSignals = newSignalsList.filter((sig) => {
      const lastAlert = lastStockAlertTimesRef.current.get(sig.symbol) || 0;
      return nowMs - lastAlert >= STOCK_ALERT_COOLDOWN_MS;
    });

    if (freshSignals.length > 0) {
      const topSignal: QuantSignal = {
        ...freshSignals[0],
        isRead: isAlertDrawerOpen,
      };
      setLatestBuySignal(topSignal);
      // 【本地策略模型预警已按用户设定停用】
      // 已全面改由单一“AI大脑”全盘接管扫描与预警 (币安美股市场 / 周一至周六 21:00-24:00 每10分钟一次)
      // 本地量化仅保留数据计算与图表看板展示，不再触发独立声音、弹窗与系统推送
    } else if (newSignalsList.length > 0 && !latestBuySignal) {
      setLatestBuySignal(newSignalsList[0]);
    }

    // 检查是否有持仓或个股突发破位跌破支撑位（触发深紫破位预警与触觉警示长震动）
    const bdStock = updatedStocks.find(
      (s) => s.changePercent <= -6.0 && s.bollinger && s.bollinger.percentB < -0.05
    );
    if (bdStock && freshSignals.length === 0) {
      const lastBreakdownAlert = lastStockAlertTimesRef.current.get(`bd-${bdStock.symbol}`) || 0;
      if (nowMs - lastBreakdownAlert >= STOCK_ALERT_COOLDOWN_MS) {
        lastStockAlertTimesRef.current.set(`bd-${bdStock.symbol}`, nowMs);
        const bdSignal = QuantEngine.createBreakdownSignal(bdStock);
        setLatestBuySignal(bdSignal);
        setAlertHistory((prev) => [bdSignal, ...prev.slice(0, 49)]);
        androidBridge.triggerHaptic('breakdown');
        backgroundKeepAliveService.sendBackgroundNotification(
          `【深紫破位预警】${bdStock.symbol} $${bdStock.price.toFixed(2)}`,
          `放量击穿布林下轨与关键支撑位，触发深紫风控警报！`
        );
      }
    }

    // Monitor positions for trailing stop-loss, overbought exit, and custom thresholds
    const quotesLookup = new Map<string, StockQuote>();
    updatedStocks.forEach((s) => quotesLookup.set(s.symbol, s));

    setPositions((prevPositions) => {
      const remainingPositions: MonitoredPosition[] = [];
      const newlyClosedOrders: TradeExecutionLog[] = [];
      let lastToastInfo: { symbol: string; message: string; pnl: number; pnlPercent: number } | null = null;

      for (const pos of prevPositions) {
        const live = quotesLookup.get(pos.symbol);
        if (!live) {
          remainingPositions.push(pos);
          continue;
        }

        const currentPrice = live.price;
        const highestPrice = Math.max(pos.highestPriceSinceEntry || pos.entryPrice, currentPrice);
        const pnl = (currentPrice - pos.entryPrice) * pos.quantity;
        const pnlPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const highestProfitPct = ((highestPrice - pos.entryPrice) / pos.entryPrice) * 100;

        const targetProfitPrice = pos.entryPrice * (1 + pos.targetProfitPercent / 100);
        const initialStopLossPrice = pos.entryPrice * (1 - pos.stopLossPercent / 100);

        let updatedPos: MonitoredPosition = {
          ...pos,
          currentPrice,
          highestPriceSinceEntry: highestPrice,
        };

        // 1. 检查持仓阶段四: 超买乏力准备回调预警 (OVERBOUGHT_EXIT)
        const overboughtSignal = QuantEngine.evaluatePositionOverbought(pos, live, settings);
        if (overboughtSignal && !pos.isOverboughtAlerted) {
          const lastAlert = lastStockAlertTimesRef.current.get(`ob-${pos.symbol}`) || 0;
          if (nowMs - lastAlert >= STOCK_ALERT_COOLDOWN_MS) {
            lastStockAlertTimesRef.current.set(`ob-${pos.symbol}`, nowMs);
            updatedPos.isOverboughtAlerted = true;
            setLatestBuySignal(overboughtSignal);
            setAlertHistory((prev) => [overboughtSignal, ...prev.slice(0, 49)]);
            if (settings.soundEnabled && !isSoundMuted && !isAlertDrawerOpen) {
              audioAlert.playTakeProfitAlert();
            }
            androidBridge.triggerHaptic('take_profit');
            backgroundKeepAliveService.sendBackgroundNotification(
              `🔔 [持仓超买乏力预警] ${pos.symbol} 建议止盈`,
              `盈利 +${pnlPercent.toFixed(1)}%, RSI(6)=${live.rsi6.toFixed(1)} 达超买线，准备回调！`
            );
          }
        }

        // 2. 检查持仓自定义跌幅预警阈值
        const customDropThreshold = pos.alertDropPercent ?? -2.5;
        if (pnlPercent <= customDropThreshold && !pos.isDropThresholdAlerted) {
          const lastAlert = lastStockAlertTimesRef.current.get(`drop-${pos.symbol}`) || 0;
          if (nowMs - lastAlert >= STOCK_ALERT_COOLDOWN_MS) {
            lastStockAlertTimesRef.current.set(`drop-${pos.symbol}`, nowMs);
            updatedPos.isDropThresholdAlerted = true;
            if (settings.soundEnabled && !isSoundMuted) {
              audioAlert.playStopLossAlert();
            }
            backgroundKeepAliveService.sendBackgroundNotification(
              `🚨 [持仓跌幅警戒预警] ${pos.symbol} 跌幅已达 ${pnlPercent.toFixed(1)}%`,
              `已击穿你设定的 ${customDropThreshold}% 跌幅警戒线，请密切注意风控！`
            );
          }
        }

        // 3. 检查持仓自定义金额浮亏预警阈值
        const customLossLimit = pos.alertLossAmount ?? -200;
        if (pnl <= customLossLimit && !pos.isLossAmountAlerted) {
          const lastAlert = lastStockAlertTimesRef.current.get(`loss-${pos.symbol}`) || 0;
          if (nowMs - lastAlert >= STOCK_ALERT_COOLDOWN_MS) {
            lastStockAlertTimesRef.current.set(`loss-${pos.symbol}`, nowMs);
            updatedPos.isLossAmountAlerted = true;
            if (settings.soundEnabled && !isSoundMuted) {
              audioAlert.playStopLossAlert();
            }
            backgroundKeepAliveService.sendBackgroundNotification(
              `🛑 [持仓亏损金额超限] ${pos.symbol} 浮亏 $${pnl.toFixed(0)}`,
              `已触及你设定的 $${customLossLimit} 最大金额亏损线！`
            );
          }
        }

        let isClosedByAutoTrade = false;

        if (pos.isTrailingEnabled) {
          const activationPct = pos.trailingActivationPercent ?? 1.8;
          const callbackPct = pos.trailingCallbackPercent ?? 0.8;

          const shouldLockBreakeven =
            pos.isBreakevenLocked || pnlPercent >= activationPct || highestProfitPct >= activationPct;

          if (shouldLockBreakeven && !pos.isBreakevenLocked) {
            updatedPos.isBreakevenLocked = true;
            if (settings.soundEnabled) {
              audioAlert.playTrailingLockAlert();
            }
            androidBridge.triggerHaptic('trailing_lock');
          }

          const dynamicStopPrice = shouldLockBreakeven
            ? Math.max(pos.entryPrice, highestPrice * (1 - callbackPct / 100))
            : initialStopLossPrice;

          if (shouldLockBreakeven && currentPrice <= dynamicStopPrice && !pos.isTrailingTriggered) {
            updatedPos.isTrailingTriggered = true;
            if (settings.soundEnabled) {
              audioAlert.playTrailingLockAlert();
            }
            androidBridge.triggerHaptic('take_profit');

            // Auto-execution on trailing stop hit
            if (autoTradeConfig.isEnabled && autoTradeConfig.autoCloseOnTrailing) {
              const res = androidBridge.executeMockOrder({
                symbol: pos.symbol,
                name: pos.name,
                side: 'SELL',
                quantity: pos.quantity,
                price: currentPrice,
                reason: 'TRAILING_STOP',
                reasonDetail: `移动保本止盈触发 (保本线 $${dynamicStopPrice.toFixed(2)})，锁定收益 +${pnlPercent.toFixed(2)}%`,
                entryPrice: pos.entryPrice,
                realizedPnL: pnl,
                realizedPnLPercent: pnlPercent,
              });

              newlyClosedOrders.push({
                id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                orderId: res.orderId,
                symbol: pos.symbol,
                name: pos.name,
                side: 'SELL',
                orderType: 'MARKET',
                quantity: pos.quantity,
                entryPrice: pos.entryPrice,
                executionPrice: currentPrice,
                realizedPnL: pnl,
                realizedPnLPercent: pnlPercent,
                reason: 'TRAILING_STOP',
                reasonDetail: `动态移动保本触发 (保本价 $${dynamicStopPrice.toFixed(2)})，锁定收益 +${pnlPercent.toFixed(2)}%`,
                timestamp: res.timestamp,
                status: 'FILLED',
                executionLatencyMs: res.latencyMs,
                strategyUsed: pos.strategyUsed,
                isNativeExecuted: res.isNative,
              });

              isClosedByAutoTrade = true;
              lastToastInfo = {
                symbol: pos.symbol,
                message: `【自动交易执行】移动保本触发，已自动平仓锁定盈利 +$${pnl.toFixed(1)}`,
                pnl,
                pnlPercent,
              };
            }
          } else if (!shouldLockBreakeven && currentPrice <= initialStopLossPrice && !pos.isAlertedLoss) {
            updatedPos.isAlertedLoss = true;
            if (settings.soundEnabled) {
              audioAlert.playStopLossAlert();
            }
            androidBridge.triggerHaptic('stop_loss');

            // Auto-execution on hard stop-loss hit
            if (autoTradeConfig.isEnabled && autoTradeConfig.autoCloseOnLoss) {
              const res = androidBridge.executeMockOrder({
                symbol: pos.symbol,
                name: pos.name,
                side: 'SELL',
                quantity: pos.quantity,
                price: currentPrice,
                reason: 'STOP_LOSS',
                reasonDetail: `跌破硬止损阈值 $${initialStopLossPrice.toFixed(2)} (-${pos.stopLossPercent}%)，强制截断风险`,
                entryPrice: pos.entryPrice,
                realizedPnL: pnl,
                realizedPnLPercent: pnlPercent,
              });

              newlyClosedOrders.push({
                id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                orderId: res.orderId,
                symbol: pos.symbol,
                name: pos.name,
                side: 'SELL',
                orderType: 'MARKET',
                quantity: pos.quantity,
                entryPrice: pos.entryPrice,
                executionPrice: currentPrice,
                realizedPnL: pnl,
                realizedPnLPercent: pnlPercent,
                reason: 'STOP_LOSS',
                reasonDetail: `跌破硬止损阈值 $${initialStopLossPrice.toFixed(2)} (-${pos.stopLossPercent}%)，强制截断风险`,
                timestamp: res.timestamp,
                status: 'FILLED',
                executionLatencyMs: res.latencyMs,
                strategyUsed: pos.strategyUsed,
                isNativeExecuted: res.isNative,
              });

              isClosedByAutoTrade = true;
              lastToastInfo = {
                symbol: pos.symbol,
                message: `【自动交易执行】击穿止损线，已市价单平仓截断！亏损 $${pnl.toFixed(1)}`,
                pnl,
                pnlPercent,
              };
            }
          }
        } else {
          if (currentPrice <= initialStopLossPrice && !pos.isAlertedLoss) {
            updatedPos.isAlertedLoss = true;
            if (settings.soundEnabled) {
              audioAlert.playStopLossAlert();
            }
            androidBridge.triggerHaptic('stop_loss');

            if (autoTradeConfig.isEnabled && autoTradeConfig.autoCloseOnLoss) {
              const res = androidBridge.executeMockOrder({
                symbol: pos.symbol,
                name: pos.name,
                side: 'SELL',
                quantity: pos.quantity,
                price: currentPrice,
                reason: 'STOP_LOSS',
                reasonDetail: `跌破止损位 $${initialStopLossPrice.toFixed(2)} (-${pos.stopLossPercent}%)`,
                entryPrice: pos.entryPrice,
                realizedPnL: pnl,
                realizedPnLPercent: pnlPercent,
              });

              newlyClosedOrders.push({
                id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                orderId: res.orderId,
                symbol: pos.symbol,
                name: pos.name,
                side: 'SELL',
                orderType: 'MARKET',
                quantity: pos.quantity,
                entryPrice: pos.entryPrice,
                executionPrice: currentPrice,
                realizedPnL: pnl,
                realizedPnLPercent: pnlPercent,
                reason: 'STOP_LOSS',
                reasonDetail: `跌破止损位 $${initialStopLossPrice.toFixed(2)} (-${pos.stopLossPercent}%)`,
                timestamp: res.timestamp,
                status: 'FILLED',
                executionLatencyMs: res.latencyMs,
                strategyUsed: pos.strategyUsed,
                isNativeExecuted: res.isNative,
              });

              isClosedByAutoTrade = true;
              lastToastInfo = {
                symbol: pos.symbol,
                message: `【自动交易执行】触及止损位，已自动平仓截断风险！`,
                pnl,
                pnlPercent,
              };
            }
          }
        }

        // Check Target Profit
        if (!isClosedByAutoTrade && currentPrice >= targetProfitPrice && !pos.isAlertedProfit) {
          updatedPos.isAlertedProfit = true;
          if (settings.soundEnabled) {
            audioAlert.playTakeProfitAlert();
          }
          androidBridge.triggerHaptic('take_profit');

          if (autoTradeConfig.isEnabled && autoTradeConfig.autoCloseOnProfit) {
            const res = androidBridge.executeMockOrder({
              symbol: pos.symbol,
              name: pos.name,
              side: 'SELL',
              quantity: pos.quantity,
              price: currentPrice,
              reason: 'TAKE_PROFIT',
              reasonDetail: `达到预设目标止盈价 $${targetProfitPrice.toFixed(2)} (+${pos.targetProfitPercent}%)`,
              entryPrice: pos.entryPrice,
              realizedPnL: pnl,
              realizedPnLPercent: pnlPercent,
            });

            newlyClosedOrders.push({
              id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              orderId: res.orderId,
              symbol: pos.symbol,
              name: pos.name,
              side: 'SELL',
              orderType: 'MARKET',
              quantity: pos.quantity,
              entryPrice: pos.entryPrice,
              executionPrice: currentPrice,
              realizedPnL: pnl,
              realizedPnLPercent: pnlPercent,
              reason: 'TAKE_PROFIT',
              reasonDetail: `达到预设目标止盈价 $${targetProfitPrice.toFixed(2)} (+${pos.targetProfitPercent}%)`,
              timestamp: res.timestamp,
              status: 'FILLED',
              executionLatencyMs: res.latencyMs,
              strategyUsed: pos.strategyUsed,
              isNativeExecuted: res.isNative,
            });

            isClosedByAutoTrade = true;
            lastToastInfo = {
              symbol: pos.symbol,
              message: `【自动交易执行】目标止盈达成！已自动平仓获利 +$${pnl.toFixed(1)} (+${pnlPercent.toFixed(1)}%)`,
              pnl,
              pnlPercent,
            };
          }
        }

        if (!isClosedByAutoTrade) {
          remainingPositions.push(updatedPos);
        }
      }

      if (newlyClosedOrders.length > 0) {
        setTradeLogs((prev) => [...newlyClosedOrders, ...prev]);
      }
      if (lastToastInfo) {
        setTradeToast(lastToastInfo);
      }

      return remainingPositions;
    });
  };

  // 实时订阅数据源广播更新 (无论实时跳动还是币安同步完成，即刻刷新渲染)
  useEffect(() => {
    const unsub = stockService.subscribe((updatedQuotes) => {
      setStocks([...updatedQuotes]);
    });
    return () => unsub();
  }, []);

  // 保持当前查看详情的个股实时跳动与最新指标同步
  useEffect(() => {
    if (selectedStockForDetail) {
      const live = stocks.find((s) => s.symbol === selectedStockForDetail.symbol);
      if (live && (live.price !== selectedStockForDetail.price || live.lastUpdated !== selectedStockForDetail.lastUpdated)) {
        setSelectedStockForDetail(live);
      }
    }
  }, [stocks, selectedStockForDetail]);

  // 高频量化扫描周期执行器 (解耦计时器与扫描循环，集成后台 Web Worker 保活)
  useEffect(() => {
    if (!isScanning) {
      backgroundKeepAliveService.stop();
      return;
    }

    const intervalMs = getIntervalMs(settings.interval);
    const intervalSec = Math.max(1, Math.round(intervalMs / 1000));
    setCountdown(intervalSec);

    // 立即执行一次初始量化扫描
    runScanCycle();

    // 启动后台 Web Worker 保证页面最小化/切到后台时定时器不被节流沉睡
    backgroundKeepAliveService.start(intervalMs, () => {
      runScanCycle();
    });

    // 核心前台扫描周期定时器
    const scanTimer = setInterval(() => {
      runScanCycle();
    }, intervalMs);

    // 独立界面倒计时定时器 (每秒递减，到达0重置)
    const countdownTimer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? intervalSec : prev - 1));
    }, 1000);

    return () => {
      backgroundKeepAliveService.stop();
      clearInterval(scanTimer);
      clearInterval(countdownTimer);
    };
  }, [isScanning, settings.interval, settings.timeframe]);

  // 首次挂载时清除一切本地遗留模拟状态，并立即向 Finnhub & 币安拉取实盘真实行情
  useEffect(() => {
    stockService.clearAllSimulations();
    stockService.syncAllRealMarketData().then(() => {
      runScanCycle();
    });
  }, []);

  // 周期切换时立即同步官方实盘量化指标
  useEffect(() => {
    stockService.syncAllRealMarketData().then(() => {
      runScanCycle();
    });
  }, [settings.timeframe]);

  const handleSelectStock = (symbol: string) => {
    const q = stockService.getQuote(symbol);
    if (q) setSelectedStockForDetail(q);
  };

  // 响应 Android 原生通知点击跳转到对应标的详情与量化预警卡片
  const handleOpenAlertDetailBySymbol = (symbol: string) => {
    audioAlert.silence();
    if (!symbol) return;
    const cleanSym = symbol.toUpperCase().trim();
    console.log('>> [Stock-G] 接收到原生预警跳转通知:', cleanSym);

    // 1. 查找或加入股票行情并立即打开技术详情页
    const existingQuote = stockService.getQuote(cleanSym);
    if (existingQuote) {
      setSelectedStockForDetail(existingQuote);
    } else {
      stockService.addStockToUniverse(cleanSym).then((q) => {
        if (q) {
          setStocks(stockService.getAllQuotes());
          setSelectedStockForDetail(q);
        }
      });
    }

    // 2. 如果存在该标的的未读预警或历史预警，立即展示诊断卡并标记已读
    const activeSig = signalsMap.get(cleanSym) || alertHistory.find((s) => s.symbol === cleanSym);
    if (activeSig) {
      setPopupAlertSignal(activeSig);
      setLatestBuySignal(activeSig);
      handleMarkSignalAsRead(activeSig.id);
    }

    // 3. 展开预警抽屉
    setIsAlertDrawerOpen(true);
  };

  // 监听来自 Android 原生通知栏点击的跳转指令 (包括热启动与冷启动)
  useEffect(() => {
    (window as any).onNativeNavigateToAlert = (sym: string) => {
      handleOpenAlertDetailBySymbol(sym);
    };

    // 检查是否有冷启动时挂起的标的代码
    const pendingSym = androidBridge.getPendingAlertSymbol();
    if (pendingSym) {
      handleOpenAlertDetailBySymbol(pendingSym);
    }

    return () => {
      delete (window as any).onNativeNavigateToAlert;
    };
  }, [signalsMap, alertHistory]);

  const handleSearchCustomSymbol = async (symbol: string) => {
    const q = await stockService.addStockToUniverse(symbol);
    if (q) {
      setStocks(stockService.getAllQuotes());
      setSelectedStockForDetail(q);
    }
  };

  const handleAddStockToWatchlist = (stock: StockQuote) => {
    const newPos: MonitoredPosition = {
      id: `pos-${Date.now()}`,
      symbol: stock.symbol,
      name: stock.name,
      entryPrice: stock.price,
      quantity: 100,
      currentPrice: stock.price,
      targetProfitPercent: 3.0,
      stopLossPercent: 2.0,
      entryDate: new Date().toLocaleDateString('zh-CN'),
      strategyUsed: stock.changePercent <= -4.5 ? 'PLUNGE_DIP' : stock.changePercent >= 2.0 ? 'OPENING_BREAKOUT' : 'RANGE_OSCILLATOR',
      highestPriceSinceEntry: stock.price,
      isAlertedProfit: false,
      isAlertedLoss: false,
      isTrailingEnabled: true,
      trailingActivationPercent: 1.8,
      trailingCallbackPercent: 0.8,
      isBreakevenLocked: false,
      isTrailingTriggered: false,
      alertDropPercent: -2.5,
      alertLossAmount: -200,
      alertOverboughtRsi: 72,
    };
    setPositions((prev) => [newPos, ...prev]);
    setActiveTab('watchlist');
  };

  const handleAddSignalToWatchlist = (signal: QuantSignal) => {
    const profitPct = Math.round(((signal.takeProfit1 - signal.suggestedEntry) / signal.suggestedEntry) * 1000) / 10;
    const lossPct = Math.abs(Math.round(((signal.stopLoss - signal.suggestedEntry) / signal.suggestedEntry) * 1000) / 10);

    const newPos: MonitoredPosition = {
      id: `pos-${Date.now()}`,
      symbol: signal.symbol,
      name: signal.name,
      entryPrice: signal.suggestedEntry,
      quantity: 100,
      currentPrice: signal.currentPrice,
      targetProfitPercent: profitPct || 2.5,
      stopLossPercent: lossPct || 2.0,
      entryDate: new Date().toLocaleDateString('zh-CN'),
      strategyUsed: signal.strategy,
      highestPriceSinceEntry: signal.currentPrice,
      isAlertedProfit: false,
      isAlertedLoss: false,
      isTrailingEnabled: true,
      trailingActivationPercent: 1.8,
      trailingCallbackPercent: 0.8,
      isBreakevenLocked: false,
      isTrailingTriggered: false,
      alertDropPercent: -2.5,
      alertLossAmount: -200,
      alertOverboughtRsi: 72,
    };
    setPositions((prev) => [newPos, ...prev]);
    setActiveTab('watchlist');
  };

  const handleTriggerSimDipStarted = () => {
    lastStockAlertTimesRef.current.delete('SOFI');
    stockService.triggerDipStartedScenario('SOFI');
    runScanCycle();
    audioAlert.silence();
    const q = stockService.getQuote('SOFI');
    if (q) {
      const sig = QuantEngine.evaluateStock(q, settings);
      if (sig) {
        setLatestBuySignal(sig);
      }
    }
    setIsAlertDrawerOpen(true);
    handleMarkAllAlertsAsRead();
  };

  const handleTriggerSimDipExhaustion = () => {
    lastStockAlertTimesRef.current.delete('NIO');
    stockService.triggerDipExhaustionScenario('NIO');
    runScanCycle();
    audioAlert.silence();
    const q = stockService.getQuote('NIO');
    if (q) {
      const sig = QuantEngine.evaluateStock(q, settings);
      if (sig) {
        setLatestBuySignal(sig);
      }
    }
    setIsAlertDrawerOpen(true);
    handleMarkAllAlertsAsRead();
  };

  const handleTriggerSimDip = () => {
    lastStockAlertTimesRef.current.delete('TSLA');
    lastStockAlertTimesRef.current.delete('INTC');
    stockService.triggerDipScenario('TSLA', -8.6);
    stockService.triggerDipScenario('INTC', -11.2);
    runScanCycle();
    audioAlert.silence();
    const q = stockService.getQuote('TSLA');
    if (q) {
      const sig = QuantEngine.evaluateStock(q, settings);
      if (sig) {
        setLatestBuySignal(sig);
      }
    }
    setIsAlertDrawerOpen(true);
    handleMarkAllAlertsAsRead();
  };

  const handleTriggerSimOverbought = () => {
    lastStockAlertTimesRef.current.delete('TSLA');
    lastStockAlertTimesRef.current.delete('ob-TSLA');
    stockService.triggerOverboughtScenario('TSLA');
    runScanCycle();
    audioAlert.silence();
    const quote = stockService.getQuote('TSLA');
    if (quote) {
      const dummyPos: MonitoredPosition = {
        id: 'sim-pos',
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        entryPrice: 200,
        quantity: 50,
        currentPrice: quote.price,
        targetProfitPercent: 3.0,
        stopLossPercent: 2.0,
        entryDate: '2026-10-18',
        strategyUsed: 'PLUNGE_DIP',
        highestPriceSinceEntry: quote.price,
        isAlertedProfit: false,
        isAlertedLoss: false,
        alertOverboughtRsi: 68,
      };
      const sig = QuantEngine.evaluatePositionOverbought(dummyPos, quote, settings);
      if (sig) {
        setLatestBuySignal(sig);
      }
    }
    setIsAlertDrawerOpen(true);
    handleMarkAllAlertsAsRead();
  };

  const handleTriggerSimBreakout = () => {
    lastStockAlertTimesRef.current.delete('NVDA');
    lastStockAlertTimesRef.current.delete('PLTR');
    stockService.triggerBreakoutScenario('NVDA', 4.5);
    stockService.triggerBreakoutScenario('PLTR', 5.2);
    runScanCycle();
    audioAlert.silence();
    const q = stockService.getQuote('NVDA');
    if (q) {
      const sig = QuantEngine.evaluateStock(q, settings);
      if (sig) {
        setLatestBuySignal(sig);
      }
    }
    setIsAlertDrawerOpen(true);
    handleMarkAllAlertsAsRead();
  };

  const handleTriggerSimBreakdown = () => {
    lastStockAlertTimesRef.current.delete('INTC');
    lastStockAlertTimesRef.current.delete('bd-INTC');
    stockService.triggerBreakdownScenario('INTC', -7.8);
    runScanCycle();
    audioAlert.silence();
    const q = stockService.getQuote('INTC');
    if (q) {
      const sig = QuantEngine.createBreakdownSignal(q);
      setLatestBuySignal(sig);
      setAlertHistory((prev) => [sig, ...prev.filter((h) => h.id !== sig.id).slice(0, 49)]);
    }
    setIsAlertDrawerOpen(true);
  };

  const quotesMap = new Map<string, StockQuote>();
  stocks.forEach((s) => quotesMap.set(s.symbol, s));

  // 严选质优股票池 (股价不低于50美元，市值不低于5B)
  const filteredStocks = useMemo(() => {
    if (!settings.enablePriceAndCapFilter) return stocks;
    const minPrice = settings.minPrice ?? 50.0;
    const minCap = settings.minMarketCap ?? 5.0;
    return stocks.filter((s) => {
      if (s.price < minPrice) return false;
      if (s.exchange !== 'BINANCE' && s.marketCap < minCap) return false;
      return true;
    });
  }, [stocks, settings.enablePriceAndCapFilter, settings.minPrice, settings.minMarketCap]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dip':
        return (
          <DipReboundScanner
            stocks={filteredStocks}
            activeTimeframe={settings.timeframe}
            onSelectStock={handleSelectStock}
            onOpenSignal={(sig) => {
              audioAlert.silence();
              handleMarkSignalAsRead(sig.id);
              setLatestBuySignal(sig);
              setIsAlertDrawerOpen(true);
            }}
            onAddToWatchlist={handleAddStockToWatchlist}
            signalsMap={signalsMap}
          />
        );
      case 'breakout':
        return (
          <BreakoutScanner
            stocks={filteredStocks}
            activeTimeframe={settings.timeframe}
            onSelectStock={handleSelectStock}
            onOpenSignal={(sig) => {
              audioAlert.silence();
              handleMarkSignalAsRead(sig.id);
              setLatestBuySignal(sig);
              setIsAlertDrawerOpen(true);
            }}
            onAddToWatchlist={handleAddStockToWatchlist}
            signalsMap={signalsMap}
          />
        );
      case 'range':
        return (
          <RangeOscillatorScanner
            stocks={filteredStocks}
            activeTimeframe={settings.timeframe}
            onSelectStock={handleSelectStock}
            onOpenSignal={(sig) => {
              audioAlert.silence();
              handleMarkSignalAsRead(sig.id);
              setLatestBuySignal(sig);
              setIsAlertDrawerOpen(true);
            }}
            onAddToWatchlist={handleAddStockToWatchlist}
            signalsMap={signalsMap}
          />
        );
      case 'watchlist':
        return (
          <WatchlistMonitor
            positions={positions}
            onRemovePosition={(id) => setPositions((prev) => prev.filter((p) => p.id !== id))}
            onUpdatePosition={(pos) => setPositions((prev) => prev.map((p) => (p.id === pos.id ? pos : p)))}
            onAddPosition={(newP) => setPositions((prev) => [{ ...newP, id: `pos-${Date.now()}` }, ...prev])}
            quotesMap={quotesMap}
            onSelectStock={handleSelectStock}
            autoTradeConfig={autoTradeConfig}
            onUpdateAutoTradeConfig={setAutoTradeConfig}
            tradeLogs={tradeLogs}
            onClearTradeLogs={() => setTradeLogs([])}
            onExecuteMockClose={handleExecuteMockClose}
            onTriggerTestOrder={handleTriggerTestOrder}
          />
        );
      case 'matrix':
        return (
          <SectorCorrelationMatrixPanel
            stocks={stocks}
            positions={positions}
            signals={Array.from(signalsMap.values())}
            onSelectStock={handleSelectStock}
            onOpenAlertDrawer={handleToggleAlertDrawer}
          />
        );
      case 'stats':
        return (
          <AndroidServerBlueprint
            onOpenServerSync={() => setShowServerSyncModal(true)}
            onSelectStock={handleSelectStock}
            initialDrawerTab="stats"
            initialDrawerOpen={true}
          />
        );
      case 'guide':
        return (
          <AndroidServerBlueprint
            onOpenServerSync={() => setShowServerSyncModal(true)}
            onSelectStock={handleSelectStock}
            initialDrawerTab="guide"
            initialDrawerOpen={true}
          />
        );
      case 'blueprint':
        return (
          <AndroidServerBlueprint
            onOpenServerSync={() => setShowServerSyncModal(true)}
            onSelectStock={handleSelectStock}
          />
        );
      default:
        return null;
    }
  };

  // Google Material 3 Navigation Bar Destinations (Android 16 标准导航栏)
  const navTabs = [
    { id: 'dip' as const, label: '抄底', icon: Zap },
    { id: 'breakout' as const, label: '爆发', icon: Flame },
    { id: 'range' as const, label: '微波', icon: Activity },
    { id: 'watchlist' as const, label: '持仓', icon: LineChart },
    { id: 'matrix' as const, label: '矩阵热力', icon: Layers },
    { id: 'blueprint' as const, label: '部署运维', icon: Server },
  ];

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Google Material 3 Top App Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMobileFrame={isMobileFrame}
        setIsMobileFrame={setIsMobileFrame}
        isScanning={isScanning}
        alertCount={unreadAlertCount}
        isAlertOpen={isAlertDrawerOpen}
        latestSignal={latestBuySignal}
        onOpenAlerts={handleToggleAlertDrawer}
        onOpenRsiCalibration={() => setShowRsiCalibrationModal(true)}
        isMuted={isSoundMuted}
        onToggleSound={() => {
          const next = !isSoundMuted;
          setIsSoundMuted(next);
          audioAlert.setMuted(next);
        }}
        onOpenServerSync={() => setShowServerSyncModal(true)}
        syncStatus={syncState.status}
        latencyMs={syncState.latencyMs}
      />

      {/* Pre-Market Volume & Volatility Trend Strip (Real-Time Market Liquidity) - Full View */}
      {!isMobileFrame && (
        <PreMarketLiquidityStrip stocks={stocks} onSelectStock={handleSelectStock} />
      )}

      {/* If Mobile Frame mode is toggled, render in Google Pixel Frame container */}
      {isMobileFrame ? (
        <div className="flex-1 flex items-center justify-center p-2 sm:p-6 bg-[#07080b]">
          <div className="w-full max-w-[412px] bg-[#0b0d11] rounded-[48px] border-4 border-[#282e3c] shadow-2xl overflow-hidden flex flex-col min-h-[820px] max-h-[92vh] relative ring-1 ring-white/10">
            {/* Android 16 Status Bar with Camera Punch-hole */}
            <div className="px-6 pt-3.5 pb-2 bg-[#0b0d11] flex items-center justify-between text-slate-400 text-xs font-mono shrink-0 select-none relative">
              <span className="font-semibold text-white text-xs">09:30</span>
              {/* Pixel Camera Punch-hole */}
              <div className="w-3.5 h-3.5 rounded-full bg-black border border-[#282e3c] absolute left-1/2 -translate-x-1/2 top-3" />
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                <Signal className="w-3.5 h-3.5" />
                <Wifi className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">5G</span>
                <Battery className="w-4 h-4 text-[#81c995]" />
              </div>
            </div>

            {/* Pre-Market Volume & Volatility Trend Strip in Mobile Frame */}
            <PreMarketLiquidityStrip stocks={stocks} onSelectStock={handleSelectStock} />

            {/* Mobile Scan Control */}
            <div className="shrink-0">
              <ScanControlBar
                settings={settings}
                setSettings={setSettings}
                isScanning={isScanning}
                setIsScanning={setIsScanning}
                countdown={countdown}
                onSearchSymbol={handleSearchCustomSymbol}
                onTriggerSimDip={handleTriggerSimDip}
                onTriggerSimBreakout={handleTriggerSimBreakout}
                onTriggerSimDipStarted={handleTriggerSimDipStarted}
                onTriggerSimDipExhaustion={handleTriggerSimDipExhaustion}
                onTriggerSimOverbought={handleTriggerSimOverbought}
                onTriggerSimBreakdown={handleTriggerSimBreakdown}
                totalMonitored={filteredStocks.length}
              />
            </div>

            {/* Scrollable Viewport */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-6">
              {renderTabContent()}
            </div>

            {/* Material 3 Bottom Navigation Bar in Phone Frame (Android 16 80dp Navigation Bar) */}
            <div className="bg-[#12151c]/98 border-t border-[#282e3c] px-3 py-2 flex items-center justify-around shrink-0">
              {navTabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id || (t.id === 'blueprint' && (activeTab === 'stats' || activeTab === 'guide'));
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className="flex flex-col items-center justify-center py-1 px-1 transition-all select-none cursor-pointer active:scale-[0.93]"
                  >
                    <div
                      className={`w-14 h-7 rounded-full flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-[#1b3764] text-[#8ab4f8] shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span
                      className={`text-[10px] tracking-tight mt-1 transition-colors ${
                        isActive ? 'text-[#8ab4f8] font-bold' : 'text-slate-400 font-medium'
                      }`}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Android 16 Gesture Bar */}
            <div className="py-2 bg-[#12151c] flex justify-center shrink-0">
              <div className="w-28 h-1 bg-slate-500 rounded-full" />
            </div>
          </div>
        </div>
      ) : (
        /* Full Android Native Application Layout */
        <div className="flex-1 flex flex-col pb-24">
          <ScanControlBar
            settings={settings}
            setSettings={setSettings}
            isScanning={isScanning}
            setIsScanning={setIsScanning}
            countdown={countdown}
            onSearchSymbol={handleSearchCustomSymbol}
            onTriggerSimDip={handleTriggerSimDip}
            onTriggerSimBreakout={handleTriggerSimBreakout}
            onTriggerSimDipStarted={handleTriggerSimDipStarted}
            onTriggerSimDipExhaustion={handleTriggerSimDipExhaustion}
            onTriggerSimOverbought={handleTriggerSimOverbought}
            onTriggerSimBreakdown={handleTriggerSimBreakdown}
            totalMonitored={filteredStocks.length}
          />

          <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-4 space-y-3.5">
            {renderTabContent()}
          </main>

          {/* Fixed Android Material 3 Navigation Bar (Android 16 80dp Dock) */}
          <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#12151c]/95 backdrop-blur-xl border-t border-[#282e3c] px-3 py-2 flex items-center justify-around shadow-2xl">
            <div className="max-w-md w-full mx-auto flex items-center justify-around">
              {navTabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id || (t.id === 'blueprint' && (activeTab === 'stats' || activeTab === 'guide'));
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className="flex flex-col items-center justify-center py-1 px-2 transition-all select-none cursor-pointer active:scale-[0.93]"
                  >
                    <div
                      className={`w-16 h-8 rounded-full flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-[#1b3764] text-[#8ab4f8] shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-[11px] tracking-tight mt-1 transition-colors ${
                        isActive ? 'text-[#8ab4f8] font-bold' : 'text-slate-400 font-medium'
                      }`}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      )}

      {/* Real-time Buy & Strategy Model Popup Alert Modal (仅在用户显式开启弹窗时生效，默认关闭避免满屏干扰) */}
      {popupAlertSignal && settings.popupEnabled && (
        <AlertModal
          signal={popupAlertSignal}
          onClose={() => setPopupAlertSignal(null)}
          onAddToWatchlist={handleAddSignalToWatchlist}
          onViewDetail={(sym: string) => {
            setPopupAlertSignal(null);
            handleSelectStock(sym);
          }}
        />
      )}

      {/* Stock Technical Detail Modal */}
      {selectedStockForDetail && (
        <StockDetailModal
          stock={stocks.find((s) => s.symbol === selectedStockForDetail.symbol) || selectedStockForDetail}
          onClose={() => setSelectedStockForDetail(null)}
          onAddToWatchlist={handleAddStockToWatchlist}
        />
      )}

      {/* Binance RSI Calibration & Verification Modal */}
      {showRsiCalibrationModal && (
        <RsiCalibrationModal
          onClose={() => setShowRsiCalibrationModal(false)}
        />
      )}

      {/* Android Studio & Backend Server Sync Modal */}
      <ServerSyncModal
        isOpen={showServerSyncModal}
        onClose={() => setShowServerSyncModal(false)}
        positions={positions}
      />

      {/* Android Top/Bottom Alert Drawer */}
      <TopRightAlertDrawer
        isOpen={isAlertDrawerOpen}
        onToggle={handleToggleAlertDrawer}
        latestSignal={latestBuySignal}
        alertHistory={alertHistory}
        unreadCount={unreadAlertCount}
        onClearHistory={() => setAlertHistory([])}
        onMarkAllAsRead={handleMarkAllAlertsAsRead}
        onMarkSignalAsRead={handleMarkSignalAsRead}
        onAddToWatchlist={handleAddSignalToWatchlist}
        onViewDetail={handleSelectStock}
        onSelectSignal={(sig) => {
          handleMarkSignalAsRead(sig.id);
          setLatestBuySignal(sig);
        }}
        isSoundMuted={isSoundMuted}
        onToggleSound={() => {
          const next = !isSoundMuted;
          setIsSoundMuted(next);
          audioAlert.setMuted(next);
        }}
      />

      {/* Real-time Auto-Trade Execution Toast Notification */}
      {tradeToast && (
        <div className="fixed bottom-20 sm:bottom-6 right-3 sm:right-6 z-50 max-w-sm w-full bg-[#181a20]/95 backdrop-blur-md border border-blue-500/40 rounded-2xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  tradeToast.pnl >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}
              >
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-xs text-white">{tradeToast.symbol} 模拟自动平仓</span>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      tradeToast.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {tradeToast.pnl >= 0 ? '+' : ''}${tradeToast.pnl.toFixed(2)} ({tradeToast.pnlPercent >= 0 ? '+' : ''}
                    {tradeToast.pnlPercent.toFixed(2)}%)
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 mt-0.5 leading-snug">{tradeToast.message}</p>
                <span className="text-[9px] text-cyan-400/80 font-mono block mt-0.5">
                  已通过 Android Bridge 原生模拟撮合网关执行
                </span>
              </div>
            </div>
            <button
              onClick={() => setTradeToast(null)}
              className="text-slate-500 hover:text-slate-300 text-xs px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
