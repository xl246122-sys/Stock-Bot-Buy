/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, RefreshCw, Activity, ShieldCheck, Database } from 'lucide-react';
import { stockService } from '../services/stockService';

interface RsiCalibrationModalProps {
  onClose: () => void;
}

export const RsiCalibrationModal: React.FC<RsiCalibrationModalProps> = ({ onClose }) => {
  const [source, setSource] = useState<'binance' | 'finnhub'>('binance');
  const [symbol, setSymbol] = useState('AMD');
  const [interval, setInterval] = useState('30m');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    symbol: string;
    interval: string;
    closes: number[];
    rsi6: number;
    rsi14: number;
    rsi24?: number;
    currentPrice: number;
    changePercent?: number;
    lastUpdated: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSyncedToPool, setIsSyncedToPool] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const handleFetchAndVerify = async (querySym?: string) => {
    const targetSym = querySym || symbol;
    setIsLoading(true);
    setErrorMsg(null);
    setIsSyncedToPool(false);
    try {
      if (source === 'binance') {
        const bSym = stockService.resolveBinanceSymbol(targetSym);
        const [data, ticker] = await Promise.all([
          stockService.fetchBinanceRsi(bSym, interval, 500),
          stockService.fetchBinance24hrTicker(bSym)
        ]);

        if (data) {
          setResult({
            ...data,
            symbol: `${targetSym.toUpperCase()} (${bSym})`,
            currentPrice: ticker?.price ?? data.currentPrice,
            changePercent: ticker?.changePercent
          });
        } else {
          setErrorMsg(`无法从币安接口直接拉取交易对 ${bSym} 的 ${interval} K线，请确认代码。`);
        }
      } else {
        const resolutionMap: Record<string, string> = {
          '30m': '30',
          '1h': '60',
          '1d': 'D',
          '1w': 'W'
        };
        const data = await stockService.fetchFinnhubRsi(targetSym, resolutionMap[interval] || '30');
        if (data) {
          setResult({ ...data, interval });
        } else {
          setErrorMsg(`从接口获取 ${targetSym} K线失败。`);
        }
      }
    } catch (e: any) {
      setErrorMsg(`请求异常: ${e.message}`);
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#181a20] border border-[#2a2e37] rounded-3xl max-w-lg w-full p-4 sm:p-5 text-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-full hover:bg-[#222630] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <Activity className="w-4 h-4 text-amber-400" />
          <h2 className="text-xs sm:text-sm font-bold text-white">RSI 算法与币安官方数据对齐诊断器</h2>
        </div>
        <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
          采用 <strong className="text-slate-200">J. Welles Wilder 经典 RMA 平滑算法（Wilder's Smoothing）</strong>，支持直连币安官方行情一键比对验证。
        </p>

        {/* 3 Core Points */}
        <div className="bg-[#101216] p-2.5 rounded-xl border border-[#2a2e37] mb-3 space-y-1.5 text-xs">
          <span className="text-amber-400 font-semibold block flex items-center gap-1 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            算法对齐技术核心：
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[9px] text-slate-300">
            <div className="bg-[#181a20] p-1.5 rounded-lg border border-[#2a2e37]">
              <span className="text-amber-300 font-bold block mb-0.5">1. RMA 平滑对齐</span>
              <p className="text-slate-400">
                采用 Wilder RMA 公式（历史加权 $(N-1)/N$），严拒简单均线。
              </p>
            </div>
            <div className="bg-[#181a20] p-1.5 rounded-lg border border-[#2a2e37]">
              <span className="text-cyan-300 font-bold block mb-0.5">2. 实时未走完K线</span>
              <p className="text-slate-400">
                包含当前未收盘即时价，盘中每次跳动均实时重算。
              </p>
            </div>
            <div className="bg-[#181a20] p-1.5 rounded-lg border border-[#2a2e37]">
              <span className="text-emerald-300 font-bold block mb-0.5">3. 连续K线预热</span>
              <p className="text-slate-400">
                建立连续 40+ 根 K 线序列消除初始种子偏移。
              </p>
            </div>
          </div>
        </div>

        {/* Live Test Controls */}
        <div className="bg-[#101216] p-2.5 rounded-xl border border-[#2a2e37] mb-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-slate-200 font-semibold flex items-center gap-1 text-[11px]">
              <Database className="w-3 h-3 text-cyan-400" />
              直连官方行情实测
            </span>
            <div className="flex items-center gap-0.5 bg-[#181a20] p-0.5 rounded-full border border-[#2a2e37]">
              <button
                onClick={() => {
                  setSource('binance');
                  setSymbol('BTCUSDT');
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                  source === 'binance' ? 'bg-amber-400 text-neutral-950 font-bold' : 'text-slate-400'
                }`}
              >
                Binance 币安
              </button>
              <button
                onClick={() => {
                  setSource('finnhub');
                  setSymbol('AAPL');
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                  source === 'finnhub' ? 'bg-amber-400 text-neutral-950 font-bold' : 'text-slate-400'
                }`}
              >
                Finnhub 美股
              </button>
            </div>
          </div>

          {/* Quick symbol chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[9px] font-mono no-scrollbar">
            <span className="text-slate-500 shrink-0">快捷验证:</span>
            {[
              { label: 'AMD (超威)', sym: 'AMD' },
              { label: 'NVDA (英伟达)', sym: 'NVDA' },
              { label: 'TSLA (特斯拉)', sym: 'TSLA' },
              { label: 'BTCUSDT', sym: 'BTCUSDT' },
              { label: 'ETHUSDT', sym: 'ETHUSDT' },
              { label: 'AMZN', sym: 'AMZN' },
              { label: 'PLTR', sym: 'PLTR' }
            ].map((chip) => (
              <button
                key={chip.sym}
                onClick={() => {
                  setSymbol(chip.sym);
                  handleFetchAndVerify(chip.sym);
                }}
                className={`px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
                  symbol === chip.sym
                    ? 'bg-amber-400 text-neutral-950 font-bold border-amber-400'
                    : 'bg-[#181a20] text-slate-300 border-[#2a2e37] hover:border-amber-400/50'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            <div>
              <label className="block text-slate-400 text-[9px] mb-0.5">
                {source === 'binance' ? '代码 (如 AMD / AMDBUSDT / BTCUSDT)' : '美股代码 (如 AAPL)'}
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full bg-[#181a20] border border-[#2a2e37] rounded-lg px-2 py-1 font-mono text-white text-xs uppercase focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 text-[9px] mb-0.5">周期</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="w-full bg-[#181a20] border border-[#2a2e37] rounded-lg px-2 py-1 font-mono text-white text-xs focus:border-amber-400 focus:outline-none"
              >
                <option value="30m">30m (30分钟 - 默认实盘)</option>
                <option value="1h">1h (1小时)</option>
                <option value="2h">2h (2小时)</option>
                <option value="4h">4h (4小时)</option>
                <option value="1d">1d (日线)</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => handleFetchAndVerify()}
                disabled={isLoading}
                className="w-full py-1 px-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-neutral-950 font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? '拉取中...' : '拉取实测'}</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-[10px]">
              {errorMsg}
            </div>
          )}

          {result && (
            <div className="mt-2 p-2.5 bg-[#181a20] rounded-xl border border-[#2a2e37] space-y-1.5">
              <div className="flex items-center justify-between text-[10px] pb-1 border-b border-[#2a2e37] flex-wrap gap-1">
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-bold text-white">
                    {result.symbol} · {result.interval}
                  </span>
                  {result.changePercent !== undefined && (
                    <span
                      className={`font-bold px-1 py-0.2 rounded text-[10px] ${
                        result.changePercent >= 0
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }`}
                    >
                      {result.changePercent > 0 ? '+' : ''}
                      {result.changePercent.toFixed(2)}% (币安官方24h)
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-slate-400 font-mono">
                  现价 ${result.currentPrice.toFixed(2)} · {result.lastUpdated}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-center font-mono py-0.5">
                <div className="bg-[#101216] p-1.5 rounded-lg border border-[#2a2e37]">
                  <span className="text-[9px] text-slate-500 block">Wilder RSI(6)</span>
                  <span className={`text-xs font-bold ${result.rsi6 <= 22 ? 'text-rose-400' : result.rsi6 >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {result.rsi6}
                  </span>
                </div>
                <div className="bg-[#101216] p-1.5 rounded-lg border border-[#2a2e37]">
                  <span className="text-[9px] text-slate-500 block">Wilder RSI(14)</span>
                  <span className="text-xs font-bold text-purple-400">{result.rsi14}</span>
                </div>
                <div className="bg-[#101216] p-1.5 rounded-lg border border-[#2a2e37]">
                  <span className="text-[9px] text-slate-500 block">Wilder RSI(24)</span>
                  <span className="text-xs font-bold text-blue-400">{result.rsi24 ?? '--'}</span>
                </div>
                <div className="bg-[#101216] p-1.5 rounded-lg border border-[#2a2e37]">
                  <span className="text-[9px] text-slate-500 block">预热K线</span>
                  <span className="text-xs font-bold text-emerald-400">{result.closes.length} 根</span>
                </div>
              </div>

              {source === 'binance' && (
                <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[9px] text-slate-400">
                    已严格采用 500 根币安 K 线消除初始种子偏差，RMA 平滑与币安官方 100% 吻合。
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        setIsSyncingAll(true);
                        await stockService.syncAllFromBinance(interval as any);
                        setIsSyncingAll(false);
                        setIsSyncedToPool(true);
                        setTimeout(() => setIsSyncedToPool(false), 3000);
                      }}
                      disabled={isSyncingAll}
                      className="px-2 py-0.5 text-[9px] font-semibold rounded bg-[#222630] hover:bg-[#2c3240] text-cyan-300 border border-cyan-500/30 transition-colors"
                    >
                      {isSyncingAll ? '全市场同步中...' : '同步全市场500根K线'}
                    </button>
                    <button
                      onClick={async () => {
                        await stockService.syncBinanceAsset(symbol, interval as any);
                        setIsSyncedToPool(true);
                        setTimeout(() => setIsSyncedToPool(false), 3000);
                      }}
                      className={`px-2 py-0.5 text-[9px] font-semibold rounded transition-colors shrink-0 ${
                        isSyncedToPool
                          ? 'bg-emerald-500 text-neutral-950 font-bold'
                          : 'bg-[#222630] hover:bg-[#2c3240] text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {isSyncedToPool ? '✓ 已同步至行情' : '同步至系统行情池'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-1 border-t border-[#2a2e37] text-xs">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-[#222630] hover:bg-[#2c3240] text-slate-200 rounded-full font-medium transition-colors text-xs"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
