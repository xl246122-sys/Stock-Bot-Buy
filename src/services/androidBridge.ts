/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Android Native Bridge & Cloud Sync Service
 * Seamlessly interfaces React SPA with Android Studio (WebView JavascriptInterface)
 * and Tencent Cloud Tokyo Server (43.163.192.120).
 */

export type HapticAlertLevel =
  | 'bottom_fishing'   // 抄底预警：双段式清脆短震
  | 'breakdown'        // 破位预警：警示型长震动
  | 'take_profit'      // 止盈预警：三段式递增欢快短震
  | 'stop_loss'        // 止损预警：重度持续单次长震
  | 'breakout'         // 突破预警：动量冲刺双短震
  | 'trailing_lock'    // 保本锁定：双轻击确认短震
  | 'subtle';          // 极轻触觉反馈

export interface AndroidNativeInterface {
  playNativeAlert?: (strategy: string, symbol: string, price: number, changePercent: number) => void;
  playNativeAlertWithDetails?: (strategy: string, symbol: string, price: number, changePercent: number, title: string, body: string) => void;
  silenceNativeAlert?: () => void;
  getPendingAlertSymbol?: () => string;
  vibrate?: (patternMs: number) => void;
  vibratePattern?: (patternJson: string) => void;
  triggerHaptic?: (level: string) => void;
  executeMockOrder?: (orderJson: string) => string;
  updateNotification?: (isScanning: boolean, scannedCount: number, statusText: string) => void;
  syncPositionsToNative?: (positionsJson: string) => void;
  requestServerSync?: () => void;
  requestBatteryExemption?: () => void;
  openDaemonNotificationSettings?: () => void;
  getDeviceInfo?: () => string;
  getDeviceId?: () => string;
  syncLicenseState?: (json: string) => void;
  getCachedLicenseState?: () => string;
  isNativeApp?: () => boolean;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidNativeInterface;
    AndroidInterface?: AndroidNativeInterface;
  }
}

class AndroidBridgeService {
  private getNative(): AndroidNativeInterface | null {
    if (typeof window === 'undefined') return null;
    return window.AndroidBridge || window.AndroidInterface || null;
  }

  /**
   * 显示简易轻提示 (Toast)
   */
  public showToast(message: string): void {
    if (typeof window === 'undefined') return;
    try {
      const toast = document.createElement('div');
      toast.innerText = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(59, 130, 246, 0.4);
        color: #f8fafc;
        padding: 8px 16px;
        border-radius: 9999px;
        font-size: 12px;
        font-family: sans-serif;
        font-weight: 600;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        z-index: 9999;
        pointer-events: none;
        transition: opacity 0.3s ease, transform 0.3s ease;
      `;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }, 2500);
    } catch {
      // ignore
    }
  }

  /**
   * Check if running inside Android Studio native container
   */
  public isNativeAndroid(): boolean {
    const native = this.getNative();
    if (native && typeof native.isNativeApp === 'function') {
      try {
        return native.isNativeApp();
      } catch {
        return true;
      }
    }
    // Also detect common Android WebView User-Agents
    if (typeof navigator !== 'undefined') {
      return /Android.*Version\/[0-9.]+/i.test(navigator.userAgent) || Boolean(native);
    }
    return false;
  }

  /**
   * 检查原生通知点击挂起的跳转标的代码
   */
  public getPendingAlertSymbol(): string | null {
    const native = this.getNative();
    if (native && typeof native.getPendingAlertSymbol === 'function') {
      try {
        const sym = native.getPendingAlertSymbol();
        if (sym && sym.trim().length > 0) {
          return sym.trim().toUpperCase();
        }
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined' && (window as any).__pendingAlertSymbol) {
      const sym = (window as any).__pendingAlertSymbol;
      delete (window as any).__pendingAlertSymbol;
      return typeof sym === 'string' && sym.trim().length > 0 ? sym.trim().toUpperCase() : null;
    }
    return null;
  }

  /**
   * 获取原生设备唯一硬件识别码
   */
  public getDeviceId(): string {
    const native = this.getNative();
    if (native && typeof native.getDeviceId === 'function') {
      try {
        const id = native.getDeviceId();
        if (id && id.trim().length > 0) return id.trim();
      } catch {
        // fallback
      }
    }
    return '';
  }

  /**
   * 同步授权状态至 Android 原生持久化存储
   */
  public syncLicenseState(json: string): void {
    const native = this.getNative();
    if (native && typeof native.syncLicenseState === 'function') {
      try {
        native.syncLicenseState(json);
      } catch {
        // ignore
      }
    }
  }

  /**
   * 从 Android 原生持久层读取授权缓存
   */
  public getCachedLicenseState(): string {
    const native = this.getNative();
    if (native && typeof native.getCachedLicenseState === 'function') {
      try {
        return native.getCachedLicenseState() || '';
      } catch {
        // ignore
      }
    }
    return '';
  }

  /**
   * Natively play Android system sound & high-priority haptic vibration
   * Triggers Samsung S24+ Heads-up Banner, Lockscreen card, and Smart Band alert
   */
  public triggerNativeAlert(
    strategy: string,
    symbol: string,
    price: number,
    changePercent: number,
    title?: string,
    body?: string
  ) {
    const native = this.getNative();
    if (native) {
      if (title && body && typeof native.playNativeAlertWithDetails === 'function') {
        try {
          native.playNativeAlertWithDetails(strategy, symbol, price, changePercent, title, body);
        } catch (err) {
          console.warn('[AndroidBridge] Failed to invoke playNativeAlertWithDetails:', err);
        }
      } else if (typeof native.playNativeAlert === 'function') {
        try {
          native.playNativeAlert(strategy, symbol, price, changePercent);
        } catch (err) {
          console.warn('[AndroidBridge] Failed to invoke playNativeAlert:', err);
        }
      }
    }

    // Also trigger HTML5 navigator.vibrate if available
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([0, 250, 100, 250]);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Precise Haptic Feedback API for Android Native and Web
   * Distinct patterns for bottom fishing, breakdown, take-profit, stop-loss, breakout
   */
  public triggerHaptic(level: HapticAlertLevel) {
    const patterns: Record<HapticAlertLevel, number[]> = {
      // 抄底超卖预警：双段式清脆短震动 (短促敏捷，提神反弹)
      bottom_fishing: [0, 80, 70, 140],
      // 破位预警：急迫风险，强力警示型双重长震动
      breakdown: [0, 320, 100, 380],
      // 止盈离场：欢快三段式递增短震动
      take_profit: [0, 50, 50, 70, 50, 120],
      // 止损触发：重度持续单次长震动，警示立刻截断亏损
      stop_loss: [0, 500],
      // 开盘爆发突破：动量突进双震动
      breakout: [0, 100, 60, 160],
      // 移动止损保本锁定：双轻触确认短震
      trailing_lock: [0, 60, 50, 60],
      // 极轻触觉反馈
      subtle: [0, 35],
    };

    const pattern = patterns[level] || [0, 100];
    const native = this.getNative();

    // 1. Try Android Native Interface
    if (native) {
      try {
        if (typeof native.triggerHaptic === 'function') {
          native.triggerHaptic(level);
        } else if (typeof native.vibratePattern === 'function') {
          native.vibratePattern(JSON.stringify(pattern));
        } else if (typeof native.vibrate === 'function') {
          const sumDuration = pattern.reduce((acc, curr) => acc + curr, 0);
          native.vibrate(sumDuration);
        }
      } catch (err) {
        console.warn('[AndroidBridge] Native haptic error:', err);
      }
    }

    // 2. Browser / WebView HTML5 Vibration API
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore restricted contexts
      }
    }
  }

  /**
   * Immediately silence native Android ringtone & vibrations
   */
  public silenceNativeAlert() {
    const native = this.getNative();
    if (native && typeof native.silenceNativeAlert === 'function') {
      try {
        native.silenceNativeAlert();
      } catch (err) {
        console.warn('[AndroidBridge] Failed to invoke silenceNativeAlert:', err);
      }
    }
  }

  /**
   * Update Android Foreground Service Persistent Notification
   */
  public updateForegroundNotification(isScanning: boolean, totalMonitored: number, status: string) {
    const native = this.getNative();
    if (native && typeof native.updateNotification === 'function') {
      try {
        native.updateNotification(isScanning, totalMonitored, status);
      } catch (err) {
        console.warn('[AndroidBridge] Failed to update foreground notification:', err);
      }
    }
  }

  /**
   * Sync positions & settings to native Android SQLite/Room database
   */
  public syncPositions(positions: any[]) {
    const native = this.getNative();
    if (native && typeof native.syncPositionsToNative === 'function') {
      try {
        native.syncPositionsToNative(JSON.stringify(positions));
      } catch (err) {
        console.warn('[AndroidBridge] Failed to sync positions to native:', err);
      }
    }
  }

  /**
   * Execute simulated mock order through Android native bridge or browser engine.
   * Dispatches order payload to native Android execution gateway and returns execution receipt.
   */
  public executeMockOrder(orderPayload: {
    symbol: string;
    name?: string;
    side: 'SELL' | 'BUY';
    quantity: number;
    price: number;
    reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'MANUAL';
    reasonDetail?: string;
    entryPrice?: number;
    realizedPnL?: number;
    realizedPnLPercent?: number;
  }): {
    success: boolean;
    orderId: string;
    executionPrice: number;
    timestamp: string;
    latencyMs: number;
    isNative: boolean;
  } {
    const native = this.getNative();
    const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${randSuffix}`;
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const latencyMs = Math.floor(Math.random() * 15) + 8; // 8ms ~ 22ms ultra-low latency

    const fullOrder = {
      orderId,
      ...orderPayload,
      executionPrice: orderPayload.price,
      status: 'FILLED',
      timestamp,
      latencyMs,
    };

    let isNative = false;

    if (native && typeof native.executeMockOrder === 'function') {
      try {
        native.executeMockOrder(JSON.stringify(fullOrder));
        isNative = true;
      } catch (err) {
        console.warn('[AndroidBridge] Failed to execute native mock order:', err);
      }
    }

    console.info(
      `%c[AndroidBridge 自动下单 API] %c${orderPayload.side} ${orderPayload.symbol} x ${orderPayload.quantity} @ $${orderPayload.price.toFixed(2)} | 原因: ${orderPayload.reason} | 延迟: ${latencyMs}ms | 单号: ${orderId}`,
      'color: #3b82f6; font-weight: bold;',
      'color: #10b981; font-weight: bold;'
    );

    return {
      success: true,
      orderId,
      executionPrice: orderPayload.price,
      timestamp,
      latencyMs,
      isNative,
    };
  }

  /**
   * Request native battery optimization exemption on Samsung One UI & Android 16
   */
  public requestBatteryOptimizationExemption() {
    const native = this.getNative();
    if (native && typeof native.requestBatteryExemption === 'function') {
      try {
        native.requestBatteryExemption();
      } catch (err) {
        console.warn('[AndroidBridge] Failed to request battery exemption:', err);
      }
    }
  }

  /**
   * Open system notification channel settings to completely hide or manage the daemon notification
   */
  public openDaemonNotificationSettings() {
    const native = this.getNative();
    if (native && typeof native.openDaemonNotificationSettings === 'function') {
      try {
        native.openDaemonNotificationSettings();
      } catch (err) {
        console.warn('[AndroidBridge] Failed to open daemon notification settings:', err);
      }
    }
  }

  /**
   * Return target hardware and OS profile
   */
  public getTargetDeviceProfile() {
    return {
      targetModel: 'Samsung Galaxy S24+ (SM-S9260 / SM-S926B)',
      targetOS: 'Android 16 (API 36 - Baklava)',
      oneUiVersion: 'One UI 8.0',
      batteryPolicy: 'Unrestricted (未受限制) + Never Sleeping App (绝不休眠)',
      foregroundServiceType: 'dataSync',
      pushGateway: 'Google Firebase Cloud Messaging (FCM v1 High Priority)',
    };
  }

  /**
   * Export complete configuration package as JSON for Android Studio assets/
   */
  public exportProjectConfig(positions: any[], settings: any) {
    const payload = {
      appId: 'com.shotstock.quant',
      version: '2.5.0',
      targetDevice: 'Samsung Galaxy S24+ (Android 16)',
      exportedAt: new Date().toISOString(),
      serverEndpoint: 'http://43.163.192.120:8000',
      settings,
      positions,
    };
    return JSON.stringify(payload, null, 2);
  }
}

export const androidBridge = new AndroidBridgeService();
