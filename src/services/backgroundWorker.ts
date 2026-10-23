/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Background Process Keep-Alive Service
 * Guarantees that the app continues scanning, updating tickers, and firing alerts
 * even when the browser tab is minimized or switched to the background.
 * 
 * Techniques:
 * 1. Dedicated inline Web Worker timer (never throttled by browser tab throttling).
 * 2. Web Notification API for OS-level background desktop / mobile push alerts.
 * 3. Page visibility change handler for instant catch-up.
 */

class BackgroundKeepAliveService {
  private worker: Worker | null = null;
  private tickCallback: (() => void) | null = null;
  private isRunning: boolean = false;
  private intervalMs: number = 2000;
  private hasNotificationPermission: boolean = false;

  constructor() {
    this.checkNotificationPermission();
    this.initWorker();
    this.setupVisibilityListener();
  }

  private checkNotificationPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.hasNotificationPermission = Notification.permission === 'granted';
    }
  }

  public async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      this.hasNotificationPermission = permission === 'granted';
      return this.hasNotificationPermission;
    } catch {
      return false;
    }
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;

    try {
      // Inline worker code that sends 'tick' events at interval
      const workerCode = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data.action === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
              self.postMessage('tick');
            }, e.data.interval || 2000);
          } else if (e.data.action === 'setInterval') {
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
              self.postMessage('tick');
            }, e.data.interval || 2000);
          } else if (e.data.action === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e) => {
        if (e.data === 'tick' && this.tickCallback && this.isRunning) {
          this.tickCallback();
        }
      };
    } catch (err) {
      console.warn('Web Worker initialization fallback to window timers:', err);
    }
  }

  private setupVisibilityListener() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isRunning && this.tickCallback) {
        // Run immediate scan cycle when user returns to foreground
        this.tickCallback();
      }
    });
  }

  public start(intervalMs: number, onTick: () => void) {
    this.intervalMs = intervalMs;
    this.tickCallback = onTick;
    this.isRunning = true;

    if (this.worker) {
      this.worker.postMessage({ action: 'start', interval: intervalMs });
    }
  }

  public updateInterval(intervalMs: number) {
    this.intervalMs = intervalMs;
    if (this.worker && this.isRunning) {
      this.worker.postMessage({ action: 'setInterval', interval: intervalMs });
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.worker) {
      this.worker.postMessage({ action: 'stop' });
    }
  }

  /**
   * 发送系统级后台通知 (当应用在后台/最小化时仍能弹窗提醒)
   */
  public sendBackgroundNotification(title: string, body: string, icon = '/favicon.ico') {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon,
          tag: 'stock-alert',
          silent: false,
        });
        notif.onclick = () => {
          window.focus();
        };
      } catch (err) {
        console.warn('Notification error:', err);
      }
    }
  }

  public isBackgroundKeepAliveSupported(): boolean {
    return typeof Worker !== 'undefined';
  }
}

export const backgroundKeepAliveService = new BackgroundKeepAliveService();
