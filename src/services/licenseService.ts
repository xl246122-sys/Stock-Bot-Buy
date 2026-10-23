/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Stock-G Software License & Activation Service
 * 软件授权与在线激活云端校验服务
 * 
 * 核心特性:
 * 1. 绑定单台硬件指纹设备 (一机一码防盗用)
 * 2. 直连东京云端节点 (43.163.192.120) 进行在线校验与激活
 * 3. 本地与原生持久化双重缓存，保障断网不闪退，联网强校验
 * 4. 实时倒计时计算 (剩余天数与小时数)
 */

import { androidBridge } from './androidBridge';

export type LicenseStatus = 'ACTIVE' | 'EXPIRED' | 'UNACTIVATED';

export interface LicenseInfo {
  isActivated: boolean;
  status: LicenseStatus;
  code: string;
  deviceId: string;
  activatedAt: number | null;
  expiresAt: number | null;
  remainingDays: number;
  remainingHours: number;
  message: string;
  lastCheckedAt: number;
}

const STORAGE_KEY = 'stockg_personal_binding_v1';
const DEVICE_KEY = 'stockg_device_fingerprint';
const SERVER_URL = 'http://43.163.192.120/api/v1/license';

class LicenseService {
  private currentInfo: LicenseInfo;
  private listeners: Array<(info: LicenseInfo) => void> = [];

  constructor() {
    this.currentInfo = this.loadInitialState();
    // 启动 3 秒后进行一次静默后台在线校验
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.verify(false).catch(() => {});
      }, 3000);
    }
  }

  /**
   * 获取或持久化本机唯一硬件识别码
   */
  public getDeviceId(): string {
    // 优先读取 Android 原生层返回的稳定识别码
    const nativeId = androidBridge.getDeviceId();
    if (nativeId && nativeId.trim().length > 0) {
      return nativeId.trim().toUpperCase();
    }

    if (typeof window === 'undefined') return 'DEVICE-LOCAL-NODE';

    let localId = localStorage.getItem(DEVICE_KEY);
    if (!localId || localId.trim().length < 6) {
      const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      const timePart = Date.now().toString(36).slice(-4).toUpperCase();
      localId = `S24P-${randPart}-${timePart}`;
      localStorage.setItem(DEVICE_KEY, localId);
    }
    return localId;
  }

  /**
   * 加载初始授权状态 (优先从 localStorage 与 原生层恢复)
   */
  private loadInitialState(): LicenseInfo {
    const defaultDeviceId = this.getDeviceId();
    const defaultState: LicenseInfo = {
      isActivated: false,
      status: 'UNACTIVATED',
      code: '',
      deviceId: defaultDeviceId,
      activatedAt: null,
      expiresAt: null,
      remainingDays: 0,
      remainingHours: 0,
      message: '请输入私人设备绑定码',
      lastCheckedAt: 0,
    };

    if (typeof window === 'undefined') return defaultState;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as LicenseInfo;
        // 校验本地时间是否已自然到期
        if (parsed.expiresAt && Date.now() > parsed.expiresAt * 1000) {
          parsed.isActivated = false;
          parsed.status = 'EXPIRED';
          parsed.message = '授权已过期，请更换新激活码续期';
        }
        if(parsed.deviceId===defaultDeviceId && parsed.code?.startsWith("SG-PERSONAL-")) return {...parsed,isActivated:false,status:"UNACTIVATED",lastCheckedAt:0};
      }
    } catch {
      // ignore
    }

    // 尝试从 Android 原生持久层恢复
    const nativeSaved = androidBridge.getCachedLicenseState();
    if (nativeSaved) {
      try {
        const parsedNative = JSON.parse(nativeSaved) as LicenseInfo;
        if(parsedNative.deviceId===defaultDeviceId && parsedNative.code?.startsWith("SG-PERSONAL-")) return {...parsedNative,isActivated:false,status:"UNACTIVATED",lastCheckedAt:0};
      } catch {
        // ignore
      }
    }

    return defaultState;
  }

  /**
   * 保存并广播最新授权状态
   */
  private saveState(info: LicenseInfo) {
    this.currentInfo = info;
    if (typeof window !== 'undefined') {
      try {
        const jsonStr = JSON.stringify(info);
        localStorage.setItem(STORAGE_KEY, jsonStr);
        androidBridge.syncLicenseState(jsonStr);
      } catch {
        // ignore
      }
    }
    this.notify();
  }

  /**
   * 获取当前最新授权状态快照
   */
  public getLicenseInfo(): LicenseInfo {
    // 动态重算剩余时间
    if (this.currentInfo.expiresAt && this.currentInfo.status === 'ACTIVE') {
      const now = Math.floor(Date.now() / 1000);
      if (now > this.currentInfo.expiresAt) {
        this.currentInfo.isActivated = false;
        this.currentInfo.status = 'EXPIRED';
        this.currentInfo.remainingDays = 0;
        this.currentInfo.remainingHours = 0;
        this.currentInfo.message = '授权已过期，请续期';
        this.saveState(this.currentInfo);
      } else {
        const remSec = this.currentInfo.expiresAt - now;
        this.currentInfo.remainingDays = Math.floor(remSec / 86400);
        this.currentInfo.remainingHours = Math.floor((remSec % 86400) / 3600);
      }
    }
    return { ...this.currentInfo };
  }

  /**
   * 在线激活授权码
   */
  public async activate(code: string): Promise<{ ok: boolean; message: string; info: LicenseInfo }> {
    const cleanCode = (code || '').trim().toUpperCase();
    const deviceId = this.getDeviceId();
    const deviceInfo = typeof navigator !== 'undefined' ? navigator.userAgent : 'Stock-G Native Client';

    if (!cleanCode || cleanCode.length < 8) {
      return {
        ok: false,
        message: '请输入完整的私人设备绑定码',
        info: this.getLicenseInfo()
      };
    }

    try {
      const resp = await fetch(`${SERVER_URL}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          deviceId,
          deviceInfo
        }),
      });

      const data = await resp.json();
      if (resp.ok && data.ok) {
        const updated: LicenseInfo = {
          isActivated: true,
          status: 'ACTIVE',
          code: cleanCode,
          deviceId,
          activatedAt: data.activatedAt,
          expiresAt: data.expiresAt,
          remainingDays: data.remainingDays ?? 0,
          remainingHours: data.remainingHours ?? 0,
          message: data.message || '个人设备绑定成功',
          lastCheckedAt: Date.now()
        };
        this.saveState(updated);
        return { ok: true, message: updated.message, info: updated };
      } else {
        return {
          ok: false,
          message: data.message || '激活失败，请核对激活码后重试',
          info: this.getLicenseInfo()
        };
      }
    } catch (err: any) {
      console.warn('License activation network error:', err);
      return {
        ok: false,
        message: `无法连接东京验证服务器，请检查手机网络或VPN代理: ${err?.message || ''}`,
        info: this.getLicenseInfo()
      };
    }
  }

  /**
   * 与服务器在线验证当前授权状态
   */
  public async verify(force = false): Promise<LicenseInfo> {
    const deviceId = this.getDeviceId();
    const nowMs = Date.now();

    // 默认节流：非强制时 60 秒内不重复请求
    if (!force && nowMs - this.currentInfo.lastCheckedAt < 60000 && this.currentInfo.status === 'ACTIVE') {
      return this.getLicenseInfo();
    }

    try {
      const resp = await fetch(`${SERVER_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          code: this.currentInfo.code || undefined
        }),
      });

      const data = await resp.json();
      if (resp.ok && data.ok) {
        const isAct = Boolean(data.isActivated);
        const updated: LicenseInfo = {
          isActivated: isAct,
          status: isAct ? 'ACTIVE' : (data.status === 'EXPIRED' ? 'EXPIRED' : 'UNACTIVATED'),
          code: data.code || this.currentInfo.code || '',
          deviceId,
          activatedAt: data.activatedAt || this.currentInfo.activatedAt,
          expiresAt: data.expiresAt ?? null,
          remainingDays: data.remainingDays ?? 0,
          remainingHours: data.remainingHours ?? 0,
          message: data.message || (isAct ? '授权有效' : '未激活'),
          lastCheckedAt: nowMs
        };
        this.saveState(updated);
        return updated;
      }
    } catch (err) {
      console.warn('License verification fetch failed:', err);
    }

    return this.getLicenseInfo();
  }

  /**
   * 订阅授权状态变化
   */
  public subscribe(listener: (info: LicenseInfo) => void): () => void {
    this.listeners.push(listener);
    listener(this.getLicenseInfo());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    const info = this.getLicenseInfo();
    this.listeners.forEach(l => l(info));
  }
}

export const licenseService = new LicenseService();
