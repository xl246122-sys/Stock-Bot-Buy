import {licenseService} from './licenseService';
// Server-owned AI decisions only. No model key, local strategy or fallback.
import { serverSyncService } from './serverSyncService';
export type AiOpportunityHabit = 
  | 'OPENING_TREND'     // 1. 开盘上涨趋势 (第一时间预警，弹窗提示买入)
  | 'PLUNGE_REBOUND'    // 2. 暴跌反弹 (超卖乏力企稳，抄底反弹，赚取>0.8%利润)
  | 'RANGE_SCALP'       // 3. 区间震荡获利 (小幅震荡，收益>0.8%，高胜率，周期5m-48h)
  | 'OVERBOUGHT_PEAK';  // 4. 高位超买预警 (高位超买乏力，准备下跌提前预警)

export interface AiAlertCardData {
  id: string;
  validUntil: number;
  cardType?: string;
  triggerTime: string;             // 触发信号时间 (如 "2026-10-22 21:05:00")
  triggerTimestamp: number;
  symbol: string;
  name: string;
  sector: string;                  // 板块名称 (如 "半导体板块 (SMH)")
  sectorEtf: string;               // 对应板块 ETF 代号 (SMH, XLK, XLY 等)
  habit: AiOpportunityHabit;
  habitName: string;
  isBuyOpportunity: boolean;       // true 为买入机会，false 为高位准备下跌预警
  opportunityTitle: string;        // 买入机会标语 (例如 "买入机会：半导体板块 · NVDA 开盘放量冲高")
  briefReason: string;             // 简单说一下买入理由 (一句话理由，杜绝长篇分析技术指标)
  suggestedEntry: number;          // 建议买入价
  takeProfitPrice: number;         // 目标止盈点
  targetProfitPercent: number;     // 预期收益率% (确保 > 0.8%)
  stopLossPrice: number;           // 严格止损点
  stopLossPercent: number;         // 止损比例%
  suggestedHoldingPeriod: string;  // 建议持有时间 (如 "5分钟 - 48小时" / "15分钟 - 4小时")
  currentPrice: number;
  changePercent: number;
  rsi6: number;
  winRateEstimate: number;         // 测算胜率% (如 88.5%)
  riskRewardRatio: string;         // 盈亏比 (如 "1:2.6")
  modelBadge: string;              // 模型微标 (如 "DeepSeek V3 Flash")
  isRead: boolean;
  readAt?: string | null;
  disclaimer: string;              // Grok Bot 风格风控声明
}

export interface AiBrainState {
  taskName: string;
  targetMarket: string;
  scheduleDescription: string;
  modelName: string;               // DeepSeek V3 Flash
  scanIntervalSeconds: number;     // 300秒 (5分钟)
  isWithinActiveWindow: boolean;   // 当前北京时间是否处于 周一至周六 21:00-24:00
  secondsUntilNextScan: number;    // 距离下次 5分钟扫描倒计时秒数
  lastScanTime: string | null;
  totalScansCount: number;
  signals: AiAlertCardData[];
  latestPopupSignal: AiAlertCardData | null; // 用于触发即时弹窗卡片 (有信号才弹)
  isScanningNow: boolean;
  activeSectorFocus: string;
  lastExecutionSummary: string;    // Grok Bot 风格巡航摘要 (如 "扫描完成：55只标的监控中，未出现符合极高胜率特征的买点，继续静默巡航")
}


class AiBrainService {
  private listeners = new Set<(state: AiBrainState) => void>();
  private busy = false;
  private revision = 0;
  private seen = new Set<string>(JSON.parse(localStorage.getItem('stockg_seen_v3') || '[]'));
  private state: AiBrainState = {
    taskName: '币安平台美股 AI 监控预警', targetMarket: '已核验交易产品',
    scheduleDescription: '北京时间周一至周六 21:00–24:00 · 每10分钟',
    modelName: '等待服务器', scanIntervalSeconds: 600,
    isWithinActiveWindow: false, secondsUntilNextScan: 0, lastScanTime: null,
    totalScansCount: 0, signals: [], latestPopupSignal: null,
    isScanningNow: false, activeSectorFocus: '等待监控池核验',
    lastExecutionSummary: '正在连接服务器任务',
  };
  constructor() { void this.runAiBrainScanNow(); setInterval(() => void this.runAiBrainScanNow(), 10000); }
  checkIsWithinActiveWindow(date = new Date()) {
    const bj = new Date(date.getTime() + 8 * 3600000);
    return bj.getUTCDay() > 0 && bj.getUTCHours() >= 21;
  }
  getState() { return {...this.state, signals: [...this.state.signals]}; }
  subscribe(fn: (s: AiBrainState) => void) { this.listeners.add(fn); fn(this.getState()); return () => {this.listeners.delete(fn);}; }
  private notify() { this.listeners.forEach(fn => fn(this.getState())); }
  async runAiBrainScanNow(_test = false): Promise<AiAlertCardData[]> {
    if (this.busy) return [];
    this.busy = true;
    const revision=this.revision;
    try {
      const base = serverSyncService.getState().activeEndpointUrl;
      const res = await fetch(base + '/api/v2/task', {signal: AbortSignal.timeout(8000)});
      if (!res.ok) throw new Error('task_unavailable');
      const data = await res.json();
      if(revision!==this.revision) return this.state.signals;
      const cards: AiAlertCardData[] = (data.signals || []).filter((s: any) =>
        typeof s.id === 'string' && typeof s.briefReason === 'string' &&
        Number.isFinite(s.validUntil));
      const fresh = cards.find(s => !this.seen.has(s.id) && s.validUntil > Date.now());
      cards.forEach(s => this.seen.add(s.id));
      localStorage.setItem('stockg_seen_v3', JSON.stringify([...this.seen].slice(-1000)));
      this.state = {...this.state, ...data.state, signals: cards,
        latestPopupSignal: fresh || this.state.latestPopupSignal};
    } catch {
      this.state.lastExecutionSummary = '服务器任务不可用，暂停展示买入机会';
      this.state.signals = []; this.state.latestPopupSignal = null;
    } finally { this.busy = false; this.notify(); }
    return this.state.signals;
  }
  async requestManualScan() {
    const license=licenseService.getLicenseInfo();
    const base=serverSyncService.getState().activeEndpointUrl;
    const res=await fetch(base+'/api/v2/task/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:license.deviceId,code:license.code,requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(120000)});
    if(!res.ok) throw new Error((await res.json()).detail || '扫描未完成');
    await this.runAiBrainScanNow();
  }
  markSignalAsRead(id: string) { this.state.signals = this.state.signals.map(s => s.id === id ? {...s,isRead:true} : s); this.dismissPopupModal(); }
  markAllSignalsAsRead() { this.state.signals = this.state.signals.map(s => ({...s,isRead:true})); this.dismissPopupModal(); }
  dismissPopupModal() { this.state.latestPopupSignal = null; this.notify(); }
  async clearAllSignals() {
    const ids=this.state.signals.map(s=>s.id);
    if(!ids.length)return;
    const license=licenseService.getLicenseInfo();
    const base=serverSyncService.getState().activeEndpointUrl;
    const res=await fetch(base+'/api/v2/alerts/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:license.deviceId,code:license.code,ids}),signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw new Error('服务器删除失败，请重试');
    this.revision++;
    this.state.signals=this.state.signals.filter(s=>!ids.includes(s.id));
    this.dismissPopupModal();
  }
  triggerTestPopupAlert(): AiAlertCardData {
    return {validUntil:Date.now()+600000,id: 'test-' + Date.now(), triggerTime: new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}),
      triggerTimestamp: Date.now(), symbol:'TEST',name:'通知测试',sector:'测试',sectorEtf:'',
      habit:'OPENING_TREND',habitName:'测试通知',isBuyOpportunity:false,
      opportunityTitle:'测试卡片 · 非交易信号',briefReason:'仅检查卡片显示，不保存到生产记录。',
      suggestedEntry:0,takeProfitPrice:0,targetProfitPercent:0,stopLossPrice:0,stopLossPercent:0,
      suggestedHoldingPeriod:'不适用',currentPrice:0,changePercent:0,rsi6:0,winRateEstimate:0,
      riskRewardRatio:'不适用',modelBadge:'测试',isRead:false,disclaimer:'非交易信号'};
  }
}
export const aiBrainService = new AiBrainService();
