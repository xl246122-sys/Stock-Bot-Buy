/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standard Wilder's RSI (Relative Strength Index) Engine
 * Exactly matches Binance (币安) and TradingView's RSI implementation.
 * Formula: J. Welles Wilder RMA (Running Moving Average / Smoothed Moving Average)
 * 
 * AvgGain = (PrevAvgGain * (period - 1) + CurrentGain) / period
 * AvgLoss = (PrevAvgLoss * (period - 1) + CurrentLoss) / period
 * RS = AvgGain / AvgLoss
 * RSI = 100 - (100 / (1 + RS))
 */

export interface RsiCalculationResult {
  rsi: number;
  avgGain: number;
  avgLoss: number;
  period: number;
  candleCount: number;
}

export class RsiCalculator {
  /**
   * Calculate standard Wilder's RSI over a series of closing prices.
   * Matches Binance / TradingView standard to the decimal point.
   * 
   * @param closes Array of closing prices in chronological order [oldest ... newest]
   * @param period Period length, e.g. 6 or 14
   */
  public static calculateWilderRsi(closes: number[], period: number): number {
    if (!closes || closes.length < period + 1) {
      return 50.0; // insufficient data default
    }

    // Step 1: Calculate price changes
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    if (changes.length < period) return 50.0;

    // Step 2: First period simple average of gains and losses
    let gainSum = 0;
    let lossSum = 0;

    for (let i = 0; i < period; i++) {
      const change = changes[i];
      if (change > 0) {
        gainSum += change;
      } else {
        lossSum += Math.abs(change);
      }
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    // Step 3: Wilder's smoothing (RMA) for remaining periods
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    // Step 4: Calculate RS and RSI
    if (avgLoss === 0) {
      return 100.0;
    }
    if (avgGain === 0) {
      return 0.0;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return Number(rsi.toFixed(2));
  }

  /**
   * Convenience helper to calculate RSI(6), RSI(14) and RSI(24) simultaneously
   * Exactly matches Binance indicator setup.
   */
  public static calculateDualWilderRsi(closes: number[]): { rsi6: number; rsi14: number; rsi24: number } {
    return {
      rsi6: this.calculateWilderRsi(closes, 6),
      rsi14: this.calculateWilderRsi(closes, 14),
      rsi24: this.calculateWilderRsi(closes, 24)
    };
  }

  /**
   * Calculate Exponential Moving Average (EMA) series
   * Matches Binance EMA(7), EMA(25), EMA(99)
   */
  public static calculateEmaSeries(closes: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    if (!closes || closes.length < period) {
      return closes.map(() => null);
    }

    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) {
      result.push(null);
      sum += closes[i];
    }

    let ema = sum / period;
    result[period - 1] = Number(ema.toFixed(2));

    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
      result.push(Number(ema.toFixed(2)));
    }

    return result;
  }

  /**
   * Calculate RSI series for all bars (for charting)
   */
  public static calculateRsiSeries(closes: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    if (!closes || closes.length < period + 1) {
      return closes.map(() => null);
    }

    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    result.push(null); // bar 0 has no change

    let gainSum = 0;
    let lossSum = 0;

    for (let i = 0; i < period; i++) {
      result.push(null);
      const chg = changes[i];
      if (chg > 0) gainSum += chg;
      else lossSum += Math.abs(chg);
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRs);
    result[period] = Number(firstRsi.toFixed(2));

    for (let i = period; i < changes.length; i++) {
      const chg = changes[i];
      const gain = chg > 0 ? chg : 0;
      const loss = chg < 0 ? Math.abs(chg) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        result.push(100.0);
      } else if (avgGain === 0) {
        result.push(0.0);
      } else {
        const rs = avgGain / avgLoss;
        result.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
      }
    }

    return result;
  }
}
