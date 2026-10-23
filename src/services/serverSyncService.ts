/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Android Studio & Backend Server Synchronization Service
 * Handles bi-directional sync between local Android app / WebView
 * and FastAPI backend server (Tokyo Tencent Cloud: 43.163.192.120:8000 / Local Dev: 10.0.2.2:8000 / localhost:8000)
 */

import { MonitoredPosition, QuantSignal } from '../types/stock';
import { API_CONFIG } from './apiKeys';
import { androidBridge } from './androidBridge';

export type SyncMode = 'cloud_auto' | 'local_only' | 'hybrid';
export type ConnectionStatus = 'connected' | 'checking' | 'offline' | 'error';

export interface ServerEndpointOption {
  id: string;
  name: string;
  url: string;
  description: string;
}

export const SERVER_PRESETS: ServerEndpointOption[] = [
  {
    id: 'tokyo_cloud',
    name: '日本东京腾讯云 (生产)',
    url: `http://${API_CONFIG.DEPLOYMENT.SERVER_IP}`,
    description: '43.163.192.120 - 7x24小时全天候扫描与FCM推送 (Nginx反向代理已就绪)',
  },
  {
    id: 'android_emulator',
    name: 'Android Studio 模拟器 (本地开发)',
    url: 'http://10.0.2.2:8000',
    description: 'Android 模拟器专用回环地址 -> 映射本地开发机端口',
  },
  {
    id: 'localhost',
    name: '本机调试 (Localhost)',
    url: 'http://localhost:8000',
    description: 'PC端浏览器与本地 Python FastAPI 联调',
  },
];

export interface SyncState {
  status: ConnectionStatus;
  activeEndpointUrl: string;
  activePresetId: string;
  latencyMs: number | null;
  lastSyncTime: string | null;
  syncedPositionsCount: number;
  syncedSignalsCount: number;
  syncMode: SyncMode;
  errorMessage: string | null;
}

class ServerSyncService {
  private state: SyncState = {
    status: 'offline',
    activeEndpointUrl: SERVER_PRESETS[0].url,
    activePresetId: 'tokyo_cloud',
    latencyMs: null,
    lastSyncTime: null,
    syncedPositionsCount: 0,
    syncedSignalsCount: 0,
    syncMode: 'hybrid',
    errorMessage: null,
  };

  private listeners: ((state: SyncState) => void)[] = [];

  constructor() {
    // Restore saved endpoint preferences
    if (typeof window !== 'undefined') {
      try {
        const savedUrl = localStorage.getItem('shot_stock_server_url');
        const savedPreset = localStorage.getItem('shot_stock_server_preset');
        const savedMode = localStorage.getItem('shot_stock_sync_mode') as SyncMode;
        if (savedUrl) this.state.activeEndpointUrl = savedUrl;
        if (savedPreset) this.state.activePresetId = savedPreset;
        if (savedMode) this.state.syncMode = savedMode;
      } catch {
        // ignore
      }
    }
  }

  public getState(): SyncState {
    return { ...this.state };
  }

  public subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  public setEndpoint(url: string, presetId = 'custom') {
    this.state.activeEndpointUrl = url.trim().replace(/\/+$/, '');
    this.state.activePresetId = presetId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('shot_stock_server_url', this.state.activeEndpointUrl);
      localStorage.setItem('shot_stock_server_preset', presetId);
    }
    this.notify();
    this.ping();
  }

  public setSyncMode(mode: SyncMode) {
    this.state.syncMode = mode;
    if (typeof window !== 'undefined') {
      localStorage.setItem('shot_stock_sync_mode', mode);
    }
    this.notify();
  }

  /**
   * Ping backend server health endpoint to test latency and reachability
   */
  public async ping(): Promise<{ success: boolean; latency: number; message: string }> {
    this.state.status = 'checking';
    this.notify();

    const startTime = performance.now();
    const endpoint = `${this.state.activeEndpointUrl}/api/v1/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latency = Math.round(performance.now() - startTime);

      if (res.ok) {
        this.state.status = 'connected';
        this.state.latencyMs = latency;
        this.state.errorMessage = null;
        this.notify();
        return { success: true, latency, message: `连接正常 (${latency}ms)` };
      } else {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
    } catch (err: unknown) {
      // Offline fallback: graceful local engine standby
      this.state.status = 'offline';
      this.state.latencyMs = null;
      const msg = err instanceof Error ? err.message : '服务器未响应';
      this.state.errorMessage = `后端离线: ${msg} (已启用本地高频量化引擎保底)`;
      this.notify();
      return { success: false, latency: 0, message: this.state.errorMessage };
    }
  }

  /**
   * Push local user positions to backend server for multi-device 24/7 trailing stop monitoring
   */
  public async syncPositions(positions: MonitoredPosition[]): Promise<{ success: boolean; count: number }> {
    // Also notify Android native layer if running inside Android Studio WebView
    androidBridge.syncPositions(positions);

    if (this.state.syncMode === 'local_only') {
      return { success: true, count: positions.length };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${this.state.activeEndpointUrl}/api/v1/positions/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'android_client_local',
          timestamp: Date.now(),
          positions,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        this.state.syncedPositionsCount = positions.length;
        this.state.lastSyncTime = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        this.state.status = 'connected';
        this.notify();
        return { success: true, count: positions.length };
      }
    } catch {
      // Graceful offline fallback
    }

    return { success: false, count: positions.length };
  }

  /**
   * Pull remote high-frequency quant signals from Tokyo server
   */
  public async pullRemoteSignals(): Promise<QuantSignal[]> {
    if (this.state.syncMode === 'local_only') return [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`${this.state.activeEndpointUrl}/api/v1/scan/signals`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.signals)) {
          this.state.syncedSignalsCount = data.signals.length;
          this.state.lastSyncTime = new Date().toLocaleTimeString('zh-CN', { hour12: false });
          this.state.status = 'connected';
          this.notify();
          return data.signals;
        }
      }
    } catch {
      // Offline fallback
    }
    return [];
  }
}

export const serverSyncService = new ServerSyncService();
