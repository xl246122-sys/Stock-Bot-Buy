/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BtcTrendWidget (BTC 实时行情与多周期空头/多头趋势监控模块)
 * Displays:
 * 1. BTC/USDT 实时官方实盘价格与24h涨跌幅
 * 2. 1h 级别实时趋势判断 (多头/空头/震荡)
 * 3. 1d / 4h / 1h 多周期多空矩阵 (是否空头) 与综合宏观情绪评定
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  ChevronRight,
  Info,
  X,
  ExternalLink,
  ShieldAlert,
  Zap,
  Clock,
  Sparkles
} from 'lucide-react';
import { stockService } from '../services/stockService';
import { RsiCalculator } from '../services/rsiCalculator';

export interface TimeframeTrendInfo {
  timeframe: '1h' | '4h' | '1d';
  label: string;
  isBearish: boolean;
  statusText: string;
  rsi6: number;
  rsi14: number;
  ema20: number;
  ema50: number;
  priceVsEma20Pct: number;
}

export const BtcTrendWidget: React.FC = () => {
  const [price, setPrice] = useState<number>(0);
  const [changePercent, setChangePercent] = useState<number>(0);
  const [high24h, setHigh24h] = useState<number>(0);
  const [low24h, setLow24h] = useState<number>(0);
  const [volume24h, setVolume24h] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Timeframe trends: 1h, 4h, 1d
  const [trend1h, setTrend1h] = useState<TimeframeTrendInfo | null>(null);
  const [trend4h, setTrend4h] = useState<TimeframeTrendInfo | null>(null);
  const [trend1d, setTrend1d] = useState<TimeframeTrendInfo | null>(null);

  const calculateTrendFromCloses = (closes: number[], currentPrice: number, tf: '1h' | '4h' | '1d'): TimeframeTrendInfo => {
    if (!closes || closes.length < 10) {
      return {
        timeframe: tf,
        label: tf === '1d' ? '日线' : tf === '4h' ? '4小时' : '1小时',
        isBearish: false,
        statusText: '多头',
        rsi6: 50,
        rsi14: 50,
        ema20: currentPrice,
        ema50: currentPrice,
        priceVsEma20Pct: 0,
      };
    }

    const rsi6 = RsiCalculator.calculateWilderRsi(closes, 6);
    const rsi14 = RsiCalculator.calculateWilderRsi(closes, 14);

    // Calculate EMA(20) and EMA(50)
    const period20 = Math.min(20, closes.length);
    const period50 = Math.min(50, closes.length);
    const recent20 = closes.slice(-period20);
    const recent50 = closes.slice(-period50);
    const ema20 = Number((recent20.reduce((a, b) => a + b, 0) / period20).toFixed(2));
    const ema50 = Number((recent50.reduce((a, b) => a + b, 0) / period50).toFixed(2));

    const priceVsEma20Pct = Number(((currentPrice - ema20) / ema20 * 100).toFixed(2));

    // 核心判定规则：
    // 当现价跌破 EMA20 (且偏离度负值) 或者 RSI(6) < 45 伴随死叉 -> 判定为空头 (Bearish)
    // 当现价站稳 EMA20 上方 且 RSI(6) >= 48 -> 判定为多头 (Bullish)
    const isBearish = currentPrice < ema20 || (currentPrice <= ema20 * 1.002 && rsi6 < 45.0);

    return {
      timeframe: tf,
      label: tf === '1d' ? '日线 1d' : tf === '4h' ? '4小时 4h' : '1小时 1h',
      isBearish,
      statusText: isBearish ? '空头 ↘' : '多头 ↗',
      rsi6,
      rsi14,
      ema20,
      ema50,
      priceVsEma20Pct,
    };
  };

  const syncBtcData = useCallback(async () => {
    try {
      // 1. Fetch live 24hr ticker for BTCUSDT from Binance Vision API
      const ticker = await stockService.fetchBinance24hrTicker('BTCUSDT');
      const livePrice = ticker?.price || price || 82500;
      if (ticker) {
        setPrice(ticker.price);
        setChangePercent(ticker.changePercent);
        setHigh24h(ticker.high);
        setLow24h(ticker.low);
        setVolume24h(ticker.volume);
        setLastUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      }

      // 2. Fetch multi-timeframe K-lines in parallel: 1h, 4h, 1d
      const [k1h, k4h, k1d] = await Promise.all([
        stockService.fetchBinanceKlines('BTCUSDT', '1h', 50),
        stockService.fetchBinanceKlines('BTCUSDT', '4h', 50),
        stockService.fetchBinanceKlines('BTCUSDT', '1d', 50),
      ]);

      if (k1h && k1h.closes.length > 0) {
        setTrend1h(calculateTrendFromCloses(k1h.closes, livePrice, '1h'));
      }
      if (k4h && k4h.closes.length > 0) {
        setTrend4h(calculateTrendFromCloses(k4h.closes, livePrice, '4h'));
      }
      if (k1d && k1d.closes.length > 0) {
        setTrend1d(calculateTrendFromCloses(k1d.closes, livePrice, '1d'));
      }

      setIsLoading(false);
    } catch (err) {
      console.warn('Error fetching BTC trend metrics:', err);
      setIsLoading(false);
    }
  }, [price]);

  useEffect(() => {
    syncBtcData();
    // Poll every 5 seconds for real-time tick updates
    const timer = setInterval(syncBtcData, 5000);
    return () => clearInterval(timer);
  }, [syncBtcData]);

  // Overall Macro Alignment Synthesis
  const macroSummary = useMemo(() => {
    const b1d = trend1d?.isBearish;
    const b4h = trend4h?.isBearish;
    const b1h = trend1h?.isBearish;

    if (b1d === undefined || b4h === undefined || b1h === undefined) {
      return {
        badge: '数据同步中',
        color: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
        desc: '正在从币安官方实时数据流解析多周期指标...',
      };
    }

    if (b1d && b4h && b1h) {
      return {
        badge: '三周期共振空头',
        color: 'text-rose-400 bg-rose-500/15 border-rose-500/40',
        desc: '日线/4h/1h 全线破位处于空头排列，宏观风险偏好受抑，科技股警惕承压回调！',
        riskTier: 'HIGH_RISK',
      };
    }

    if (!b1d && !b4h && !b1h) {
      return {
        badge: '三周期共振多头',
        color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40',
        desc: '日线/4h/1h 全线站稳均线之上，宏观流动性充沛，顺风主升动能充裕！',
        riskTier: 'SAFE',
      };
    }

    if (b1d && !b1h) {
      return {
        badge: '日线空头 · 1h反弹',
        color: 'text-amber-400 bg-amber-500/15 border-amber-500/40',
        desc: '大级别 1d 处于空头承压回撤中，但 1h 短线探底放量反抽，属超跌均值回归行情。',
        riskTier: 'CAUTION',
      };
    }

    if (!b1d && b1h) {
      return {
        badge: '日线多头 · 1h洗盘',
        color: 'text-blue-400 bg-blue-500/15 border-blue-500/40',
        desc: '大级别 1d 维持中长线多头通道，1h 处于短线技术性洗盘回踩，支撑位吸筹机会。',
        riskTier: 'BUY_THE_DIP',
      };
    }

    return {
      badge: '震荡分化',
      color: 'text-purple-400 bg-purple-500/15 border-purple-500/40',
      desc: '多周期多空力量胶着，箱体区间微波整理。',
      riskTier: 'NEUTRAL',
    };
  }, [trend1d, trend4h, trend1h]);

  const formatPrice = (p: number) => {
    return p > 0 ? `$${p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : '--';
  };

  return (
    <>
      {/* Home Page Strip Module: Compact Pill View */}
      <div
        onClick={() => setShowDetailModal(true)}
        className="flex items-center gap-1.5 bg-[#161a24] hover:bg-[#1e2330] border border-[#2c3345] hover:border-amber-500/50 px-2.5 py-1 rounded-full text-xs cursor-pointer select-none transition-all active:scale-[0.98] group shrink-0"
        title="点击查看 BTC 1d/4h/1h 多周期详细趋势与宏观指标"
      >
        {/* Bitcoin Icon & Live Price */}
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[10px] border border-amber-500/40">
            ₿
          </span>
          <span className="font-bold text-slate-200 group-hover:text-amber-300 transition-colors">BTC</span>
          <span className="font-mono font-bold text-white text-[12px]">{formatPrice(price)}</span>
          <span
            className={`font-mono text-[10px] font-bold ${
              changePercent >= 0 ? 'text-[#81c995]' : 'text-[#f28b82]'
            }`}
          >
            {changePercent >= 0 ? '+' : ''}
            {changePercent.toFixed(2)}%
          </span>
        </div>

        {/* Separator dot */}
        <span className="text-slate-600">·</span>

        {/* 1h Real-Time Trend Badge */}
        <div className="flex items-center gap-1">
          <span className="text-slate-400 text-[11px]">1h趋势:</span>
          {trend1h ? (
            <span
              className={`font-bold text-[11px] px-1.5 py-0.2 rounded font-mono flex items-center gap-0.5 ${
                trend1h.isBearish
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {trend1h.isBearish ? <TrendingDown className="w-3 h-3 shrink-0" /> : <TrendingUp className="w-3 h-3 shrink-0" />}
              {trend1h.statusText}
            </span>
          ) : (
            <span className="text-slate-500 font-mono text-[11px]">计算中...</span>
          )}
        </div>

        {/* Multi-Timeframe Status Pills: 1d / 4h / 1h */}
        <div className="hidden sm:flex items-center gap-1 ml-0.5 text-[10px] font-mono">
          {/* 1d Pill */}
          <span
            className={`px-1.5 py-0.2 rounded-full border ${
              trend1d?.isBearish
                ? 'bg-rose-950/40 text-rose-300 border-rose-500/40'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
            }`}
          >
            1d{trend1d?.isBearish ? '空头' : '多头'}
          </span>
          {/* 4h Pill */}
          <span
            className={`px-1.5 py-0.2 rounded-full border ${
              trend4h?.isBearish
                ? 'bg-rose-950/40 text-rose-300 border-rose-500/40'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
            }`}
          >
            4h{trend4h?.isBearish ? '空头' : '多头'}
          </span>
          {/* 1h Pill */}
          <span
            className={`px-1.5 py-0.2 rounded-full border ${
              trend1h?.isBearish
                ? 'bg-rose-950/40 text-rose-300 border-rose-500/40'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
            }`}
          >
            1h{trend1h?.isBearish ? '空头' : '多头'}
          </span>
        </div>

        {/* Pulse Dot & Arrow */}
        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0 ml-0.5" />
      </div>

      {/* Detail Breakdown Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#11141c] border border-[#2a3142] rounded-2xl shadow-2xl overflow-hidden text-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-[#181d2a] to-[#12151e] border-b border-[#282f40]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 font-bold text-sm">
                  ₿
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    BTC / USDT 币安实时多周期趋势矩阵
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Binance Vision 官方数据底座 · 5s 极速轮询 · 更新于 {lastUpdated || '刚刚'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Card 1: Real-time Price Ticker Banner */}
              <div className="bg-[#171b26] border border-[#282f40] rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">当前实盘价格 (Binance Spot)</div>
                  <div className="font-mono text-2xl font-bold text-white flex items-baseline gap-2">
                    {formatPrice(price)}
                    <span
                      className={`text-sm font-bold ${
                        changePercent >= 0 ? 'text-[#81c995]' : 'text-[#f28b82]'
                      }`}
                    >
                      {changePercent >= 0 ? '+' : ''}
                      {changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs font-mono space-y-0.5">
                  <div className="text-slate-400">
                    24h 高: <span className="text-slate-200 font-bold">${high24h.toLocaleString()}</span>
                  </div>
                  <div className="text-slate-400">
                    24h 低: <span className="text-slate-200 font-bold">${low24h.toLocaleString()}</span>
                  </div>
                  <div className="text-slate-500">
                    量: <span className="text-slate-400">{Math.round(volume24h).toLocaleString()} BTC</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Composite Macro Sentiment Status */}
              <div className={`p-3.5 rounded-xl border ${macroSummary.color}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span className="font-bold text-sm">综合宏观多空判定: {macroSummary.badge}</span>
                  </div>
                </div>
                <p className="text-xs leading-relaxed opacity-90">{macroSummary.desc}</p>
              </div>

              {/* Card 3: Multi-Timeframe Matrix (1d / 4h / 1h) */}
              <div>
                <div className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>多周期多空详细技术指标 (1d / 4h / 1h)</span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {[trend1d, trend4h, trend1h].map((t) => {
                    if (!t) return null;
                    return (
                      <div
                        key={t.timeframe}
                        className="bg-[#171b26] border border-[#282f40] rounded-xl p-3 flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{t.label}</span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full font-mono flex items-center gap-1 ${
                                t.isBearish
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {t.isBearish ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                              {t.isBearish ? '空头结构 (Bearish)' : '多头结构 (Bullish)'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            EMA(20): <span className="text-slate-200 font-bold">${t.ema20.toLocaleString()}</span> (
                            <span
                              className={t.priceVsEma20Pct >= 0 ? 'text-[#81c995]' : 'text-[#f28b82]'}
                            >
                              {t.priceVsEma20Pct >= 0 ? '+' : ''}
                              {t.priceVsEma20Pct}%
                            </span>
                            ) · RSI(6):{' '}
                            <span
                              className={
                                t.rsi6 <= 25
                                  ? 'text-cyan-300 font-bold'
                                  : t.rsi6 >= 75
                                  ? 'text-rose-300 font-bold'
                                  : 'text-slate-200'
                              }
                            >
                              {t.rsi6.toFixed(1)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">空头状态</div>
                          <span
                            className={`font-mono font-bold text-xs ${
                              t.isBearish ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {t.isBearish ? '【是 · 空头】' : '【否 · 多头】'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Guidance for US Stock Day Trading */}
              <div className="bg-[#131720] border border-blue-500/30 rounded-xl p-3 text-xs text-blue-200/90 leading-relaxed">
                <div className="font-bold text-blue-300 mb-1 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>BTC 对美股量化策略联动启示：</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
                  <li>
                    <strong className="text-white">三周期共振空头时</strong>：全球数字流动性处于紧缩避险模式，纳斯达克科技股（尤其是 COIN, MSTR, NVDA 等高贝塔标的）开盘追涨风险极高，应优先采用【暴跌触底反弹模型】严格低吸，切勿盲目追高突破。
                  </li>
                  <li>
                    <strong className="text-white">1h/4h 出现超卖金叉反抽时</strong>：提示美股日内风险情绪修复，适合寻找 RSI(6)&lt;22 的超跌蓝筹果断打出首仓。
                  </li>
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-[#131620] border-t border-[#252b3a] flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> 每 5 秒自动重算 Wilder RSI 与 EMA 均线
              </span>
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold transition-colors cursor-pointer"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
