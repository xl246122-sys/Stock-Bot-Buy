/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * High-Precision Web Audio Alert Synthesizer
 * Zero-dependency trader sound chimes for breakouts, dip rebounds, and risk alerts.
 * Features:
 * - Exactly 2 clean chimes per alert (双响提示音，绝不无限循环或持续鸣叫)
 * - Immediate silence() capability when user opens alert panel (点开后立即停止发声)
 * - Anti-collision throttle protection
 */
import { androidBridge } from './androidBridge';

class AudioAlertService {
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;
  private activeOscillators: OscillatorNode[] = [];
  private activeGains: GainNode[] = [];
  private lastPlayTimestamp: number = 0;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.silence();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * 点开预警信息后，立即切断并停止当前所有正在发声的提醒铃声
   */
  public silence() {
    try {
      this.activeOscillators.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // Ignore already stopped oscillators
        }
      });
      this.activeGains.forEach((gain) => {
        try {
          if (this.audioCtx) {
            gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
          }
          gain.disconnect();
        } catch {
          // Ignore
        }
      });
    } catch {
      // Ignore
    }
    this.activeOscillators = [];
    this.activeGains = [];
    androidBridge.silenceNativeAlert();
  }

  /**
   * Sound 1: 暴跌超卖抄底预警 (Plunge Dip)
   * 规范: 清脆两响叮咚 (Dual Chime: 587Hz -> 880Hz), 严谨播放2下即自动停止，不循环
   */
  public playPlungeDipAlert(symbol = 'TSLA', price = 0, changePercent = -6.5, thesis?: string) {
    if (this.isMuted) return;
    const nowMs = Date.now();
    if (nowMs - this.lastPlayTimestamp < 800) return; // 节流防重叠冲突
    this.lastPlayTimestamp = nowMs;

    this.silence();
    const title = `⚡ ${symbol} 暴跌超卖抄底预警`;
    const sign = changePercent >= 0 ? '+' : '';
    const body = `现价: $${price.toFixed(2)} (${sign}${changePercent.toFixed(2)}%) · ${thesis || 'RSI极度超卖触底企稳反弹'}`;
    androidBridge.triggerNativeAlert('PLUNGE_DIP', symbol, price, changePercent, title, body);

    // 在 Android 原生环境下由 NotificationManager 与原生系统提示音播放，避免 Web Audio 混杂重复发声
    if (androidBridge.isNativeAndroid()) return;

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      // 第1下 (587Hz D5) 与 第2下 (880Hz A5)
      const rings = [
        { freq: 587.33, offset: 0.0, duration: 0.22, vol: 0.16 },
        { freq: 880.00, offset: 0.18, duration: 0.35, vol: 0.18 },
      ];

      rings.forEach(({ freq, offset, duration, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0 + offset);

        gain.gain.setValueAtTime(0, t0 + offset);
        gain.gain.linearRampToValueAtTime(vol, t0 + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0 + offset);
        osc.stop(t0 + offset + duration + 0.05);

        this.activeOscillators.push(osc);
        this.activeGains.push(gain);

        osc.onended = () => {
          this.activeOscillators = this.activeOscillators.filter((o) => o !== osc);
          this.activeGains = this.activeGains.filter((g) => g !== gain);
        };
      });
    } catch {
      // Audio autoplay restrictions or headless environment
    }
  }

  /**
   * Sound 2: 开盘爆发动量预警 (Opening Breakout)
   * 规范: 清脆两响扬调 (Dual Chime: 784Hz -> 1175Hz), 严谨播放2下即自动停止，不循环
   */
  public playBreakoutAlert(symbol = 'NVDA', price = 0, changePercent = 3.5, thesis?: string) {
    if (this.isMuted) return;
    const nowMs = Date.now();
    if (nowMs - this.lastPlayTimestamp < 800) return;
    this.lastPlayTimestamp = nowMs;

    this.silence();
    const title = `🔥 ${symbol} 开盘爆发突破预警`;
    const sign = changePercent >= 0 ? '+' : '';
    const body = `现价: $${price.toFixed(2)} (${sign}${changePercent.toFixed(2)}%) · ${thesis || '突破关键阻力位，放量冲刺'}`;
    androidBridge.triggerNativeAlert('OPENING_BREAKOUT', symbol, price, changePercent, title, body);

    if (androidBridge.isNativeAndroid()) return;

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      // 第1下 (784Hz G5) 与 第2下 (1175Hz D6)
      const rings = [
        { freq: 783.99, offset: 0.0, duration: 0.18, vol: 0.17 },
        { freq: 1174.66, offset: 0.16, duration: 0.32, vol: 0.19 },
      ];

      rings.forEach(({ freq, offset, duration, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0 + offset);

        gain.gain.setValueAtTime(0, t0 + offset);
        gain.gain.linearRampToValueAtTime(vol, t0 + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0 + offset);
        osc.stop(t0 + offset + duration + 0.05);

        this.activeOscillators.push(osc);
        this.activeGains.push(gain);

        osc.onended = () => {
          this.activeOscillators = this.activeOscillators.filter((o) => o !== osc);
          this.activeGains = this.activeGains.filter((g) => g !== gain);
        };
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Sound 3: 区间震荡高胜率模型预警 (Range Oscillator)
   * 规范: 温和两响风铃 (Dual Chime: 659Hz -> 988Hz), 严谨播放2下即停止
   */
  public playRangeAlert(symbol = 'AAPL', price = 0, changePercent = 0.5, thesis?: string) {
    if (this.isMuted) return;
    const nowMs = Date.now();
    if (nowMs - this.lastPlayTimestamp < 800) return;
    this.lastPlayTimestamp = nowMs;

    this.silence();
    const title = `🌊 ${symbol} 区间震荡微波获利预警`;
    const sign = changePercent >= 0 ? '+' : '';
    const body = `现价: $${price.toFixed(2)} (${sign}${changePercent.toFixed(2)}%) · ${thesis || '触及布林带极值通道微波反弹'}`;
    androidBridge.triggerNativeAlert('RANGE_OSCILLATOR', symbol, price, changePercent, title, body);

    if (androidBridge.isNativeAndroid()) return;

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      // 第1下与第2下
      const rings = [
        { freq: 659.25, offset: 0.0, duration: 0.18, vol: 0.14 },
        { freq: 987.77, offset: 0.16, duration: 0.28, vol: 0.15 },
      ];

      rings.forEach(({ freq, offset, duration, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0 + offset);

        gain.gain.setValueAtTime(0, t0 + offset);
        gain.gain.linearRampToValueAtTime(vol, t0 + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0 + offset);
        osc.stop(t0 + offset + duration + 0.05);

        this.activeOscillators.push(osc);
        this.activeGains.push(gain);

        osc.onended = () => {
          this.activeOscillators = this.activeOscillators.filter((o) => o !== osc);
          this.activeGains = this.activeGains.filter((g) => g !== gain);
        };
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Sound 4: 止盈达标确认提示音 (平稳单次两响)
   */
  public playTakeProfitAlert() {
    if (this.isMuted) return;
    this.silence();

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      const rings = [
        { freq: 783.99, offset: 0.0, duration: 0.20, vol: 0.18 },
        { freq: 1046.50, offset: 0.14, duration: 0.35, vol: 0.20 },
      ];

      rings.forEach(({ freq, offset, duration, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0 + offset);

        gain.gain.setValueAtTime(0, t0 + offset);
        gain.gain.linearRampToValueAtTime(vol, t0 + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0 + offset);
        osc.stop(t0 + offset + duration + 0.05);

        this.activeOscillators.push(osc);
        this.activeGains.push(gain);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Sound 4.1: 移动止损锁本金 / 动态追踪提醒 (两响提示)
   */
  public playTrailingLockAlert() {
    if (this.isMuted) return;
    this.silence();

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      const rings = [
        { freq: 880.00, offset: 0.0, duration: 0.18, vol: 0.16 },
        { freq: 1174.66, offset: 0.15, duration: 0.30, vol: 0.18 },
      ];

      rings.forEach(({ freq, offset, duration, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0 + offset);

        gain.gain.setValueAtTime(0, t0 + offset);
        gain.gain.linearRampToValueAtTime(vol, t0 + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0 + offset);
        osc.stop(t0 + offset + duration + 0.05);

        this.activeOscillators.push(osc);
        this.activeGains.push(gain);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Sound 5: 止损预警音 (单次双响警告音，绝不循环)
   */
  public playStopLossAlert() {
    if (this.isMuted) return;
    this.silence();

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      const rings = [
        { freq: 360, offset: 0.0, duration: 0.18, vol: 0.15 },
        { freq: 260, offset: 0.15, duration: 0.28, vol: 0.15 },
      ];

      rings.forEach(({ freq, offset, duration, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t0 + offset);

        gain.gain.setValueAtTime(0, t0 + offset);
        gain.gain.linearRampToValueAtTime(vol, t0 + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0 + offset);
        osc.stop(t0 + offset + duration + 0.05);

        this.activeOscillators.push(osc);
        this.activeGains.push(gain);
      });
    } catch {
      // Ignore
    }
  }
}

export const audioAlert = new AudioAlertService();
