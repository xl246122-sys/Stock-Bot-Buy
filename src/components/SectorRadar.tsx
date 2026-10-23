import React, { useEffect, useState } from 'react';

type Member = { underlying_symbol: string; instrument_symbol: string };
type Sector = {
  sector_id: string; name: string; etf: string;
  mega: Member[]; mid_high_volatility: Member[];
};
type Trend = {
  sector_id: string; trend: 'UP' | 'DOWN' | 'MIXED' | 'UNKNOWN';
  reason: string | null; as_of?: number;
  periods: Record<string, { direction: string; close?: number }>;
};
export type Status = {
  selection: { selected_count: number; sectors: Sector[] };
  sector_trends: Trend[]; trend_status?: string;
  reference_trends?: (Trend & { reference_id: string; name: string; instrument_symbol: string })[];
  watchlist?: {
    selected_count: number; binance_spot_code_available_count: number;
    sectors: { sector_id: string; etf: string;
      leaders: { symbol: string; binance_spot_symbol: string | null }[];
      mid_high_volatility: { symbol: string; binance_spot_symbol: string | null }[] }[];
  };
  watchlist_needs_refresh?: boolean;
  us_etf_trends?: (Trend & { etf: string; last_observed_trend: string; latest_bar_close_time?: number;
    observation_state?: string; last_successful_fetch_at?: number; collection_status?: string })[];
  etf_refresh_completed?: boolean;
  etf_refresh_failures?: Record<string, string>;
};

export const initial: Sector[] = [
  ['technology', '科技', 'XLK'], ['communication', '通信服务', 'XLC'],
  ['consumer_discretionary', '可选消费', 'XLY'], ['financials', '金融', 'XLF'],
  ['healthcare', '医疗', 'XLV'], ['industrials', '工业', 'XLI'],
  ['energy', '能源', 'XLE'], ['materials', '材料', 'XLB'],
].map(([sector_id, name, etf]) => ({ sector_id, name, etf, mega: [], mid_high_volatility: [] }));
const labels: Record<string, string> = { UP: '向上', DOWN: '向下', MIXED: '分歧 / 震荡', UNKNOWN: '数据待接入' };
const observationLabels: Record<string, string> = {
  no_completed_regular_bar: '暂无完整常规时段数据',
  future_bar_rejected: '时间异常，暂停使用',
  fetch_failed_using_history: '本次更新失败，保留历史样本',
  collector_not_fresh: '采集尚未运行或已停止，保留历史样本',
  outside_regular_hours_history: '常规时段之外，展示历史样本',
  recent_bar_observed: '已观察到近期分钟数据，实时权限仍待验收',
  regular_window_bar_not_fresh: '分钟数据尚未更新，可能延迟或休市',
};

export default function SectorRadar() {
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 5000);
      try {
        const base = (import.meta.env.VITE_SECTOR_API_URL || '').replace(/\/$/, '');
        const response = await fetch(import.meta.env.VITE_SECTOR_SNAPSHOT_URL || `${base}/api/v2/sectors/status`, { signal: controller.signal });
        if (!response.ok) throw new Error('板块数据接口尚未连接');
        const data = await response.json() as Status;
        if (!Array.isArray(data.selection?.sectors) || !Array.isArray(data.sector_trends))
          throw new Error('板块数据格式不完整');
        if (active) { setStatus(data); setError(''); }
      } catch {
        if (active) { setStatus(null); setError('板块数据尚未接通，当前显示目标配置'); }
      } finally {
        clearTimeout(timeout);
        if (active) timer = setTimeout(refresh, 15000);
      }
    };
    void refresh();
    return () => { active = false; controller?.abort(); clearTimeout(timer); };
  }, []);
  const sectors = status?.watchlist?.sectors.map(g => ({
    sector_id: g.sector_id, name: initial.find(s => s.sector_id === g.sector_id)?.name || g.sector_id,
    etf: g.etf,
    mega: g.leaders.map(r => ({ underlying_symbol: r.symbol, instrument_symbol: r.binance_spot_symbol || '币安映射未找到' })),
    mid_high_volatility: g.mid_high_volatility.map(r => ({ underlying_symbol: r.symbol, instrument_symbol: r.binance_spot_symbol || '币安映射未找到' })),
  })) || status?.selection.sectors || initial;
  return <main className="min-h-screen bg-slate-950 text-slate-100 px-5 py-8">
    <div className="max-w-6xl mx-auto">
      <p className="text-xs tracking-widest text-cyan-300 mb-2">STOCK-G · 板块优先</p>
      <h1 className="text-3xl font-semibold mb-3">先看板块，再看个股</h1>
      <p className="text-slate-400 mb-6">8 个板块 · 80 个个股位置 · 8 只行业 ETF</p>
      {import.meta.env.VITE_SECTOR_SNAPSHOT_URL && <p className="rounded-xl border border-amber-700 p-4 mb-6 text-amber-200">
        离线测试版 · 内置打包时的历史快照，不更新实时行情，不发送买入通知。
      </p>}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 mb-6">
        <strong>美股观察名单 {status?.watchlist?.selected_count ?? status?.selection.selected_count ?? 0} / 80</strong>
        {status?.watchlist && <p className="text-xs text-slate-400 mt-2">
          币安现货代码可用 {status.watchlist.binance_spot_code_available_count} / 80，仍需映射身份复核
          {status.watchlist_needs_refresh ? ' · 公司资料需要更新' : ''}
        </p>}
        <p className="text-sm text-amber-200 mt-2">
          {error || 'ETF 趋势与个股资格分别核验；缺失数据保留空位。新买入通知尚未开启。'}
        </p>
        <p className="text-xs text-slate-400 mt-2">ETF 代码表示目标行业参照；币安映射数据不等于美股 ETF 现货行情。</p>
      </div>
      <h2 className="text-xl font-semibold mb-2">可用市场参照</h2>
      <p className="text-sm text-slate-400 mb-4">币安现货映射 · USDT · 独立展示，不替代下方八个板块 ETF</p>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {[
          ['broad_market', '标普 500 大盘', 'SPYBUSDT'],
          ['nasdaq100', '纳斯达克 100', 'QQQBUSDT'],
          ['semiconductors', '半导体', 'SMHBUSDT'],
        ].map(([id, name, symbol]) => {
          const card = status?.reference_trends?.find(c => c.reference_id === id);
          const fresh = card?.as_of != null && now >= card.as_of && now - card.as_of <= 90000;
          const direction = fresh ? card?.trend || 'UNKNOWN' : 'UNKNOWN';
          return <section key={id} className="rounded-xl border border-cyan-900 bg-slate-900 p-4">
            <h3 className="font-semibold">{name}</h3>
            <p className="text-xs text-cyan-300 mt-1">{symbol} · USDT</p>
            <p className="text-xl mt-4">{labels[direction]}</p>
            <div className="flex gap-3 text-xs text-slate-400 mt-3">
              {['1m', '5m', '15m'].map(p => <span key={p}>
                {p} · {fresh ? labels[card?.periods[p]?.direction || 'UNKNOWN'] : '未知'}
              </span>)}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              {fresh && card?.as_of ? `快照：${new Date(card.as_of).toLocaleTimeString('zh-CN')}` : '尚未采集或已过期'}
            </p>
            <p className="text-xs text-slate-500 mt-2">仅供趋势观察，非买入信号</p>
          </section>;
        })}
      </div>
      <h2 className="text-xl font-semibold mb-4">八板块目标观察池</h2>
      <p className="text-xs text-slate-400 mb-4">
        ETF 按现有配额错峰更新，持续采集时整轮至少 120 秒。
        {status?.etf_refresh_completed === false ? ' 本轮更新中，各板块独立更新。' : ''}
        {status?.etf_refresh_failures && Object.keys(status.etf_refresh_failures).length > 0
          ? ` ${Object.keys(status.etf_refresh_failures).length} 个板块本轮更新失败。` : ''}
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sectors.map(sector => {
          const trend = status?.sector_trends.find(t => t.sector_id === sector.sector_id);
          const usEtf = status?.us_etf_trends?.find(t => t.etf === sector.etf);
          const observationState = usEtf?.last_successful_fetch_at && now-usEtf.last_successful_fetch_at > 180000
            ? 'collector_not_fresh' : usEtf?.observation_state || 'collector_not_fresh';
          const stale = !trend?.as_of || now - trend.as_of > 90000 || now < trend.as_of;
          const direction = usEtf ? usEtf.last_observed_trend : stale ? 'UNKNOWN' : trend?.trend || 'UNKNOWN';
          return <section key={sector.sector_id} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">{sector.name}</h2><span className="text-cyan-300">{sector.etf}</span>
            </div>
            <p className={`text-lg mb-2 ${direction === 'UP' ? 'text-emerald-300' : direction === 'DOWN' ? 'text-rose-300' : 'text-slate-300'}`}>
              {labels[direction]}
            </p>
            {usEtf && <p className="text-xs text-amber-200 mb-3">
              美股 ETF · USD · 观察趋势，非买入信号<br />
              {observationLabels[observationState]}<br />
              最近完整分钟：{usEtf.latest_bar_close_time ? new Date(usEtf.latest_bar_close_time).toLocaleString('zh-CN') : '暂无'}
              {usEtf.last_successful_fetch_at && <><br />上次成功采集：{new Date(usEtf.last_successful_fetch_at).toLocaleTimeString('zh-CN')}</>}
            </p>}
            <div className="text-xs text-slate-400 flex gap-3 mb-5">
              {['1m', '5m', '15m'].map(period => <span key={period}>
                {period} · {usEtf ? labels[usEtf.periods[period]?.direction || 'UNKNOWN'] : stale ? '未知' : labels[trend?.periods[period]?.direction || 'UNKNOWN']}
              </span>)}
            </div>
            {([['板块前列大型企业', sector.mega], ['高波动中型企业', sector.mid_high_volatility]] as const).map(([label, members]) =>
              <div key={label} className="border-t border-slate-800 pt-3 mt-3">
                <h3 className="text-sm mb-2">{label} <span className="text-slate-500">{members.length}/5</span></h3>
                {Array.from({ length: 5 }, (_, i) => <p key={i} className="text-sm py-1 text-slate-400">
                  {members[i] ? `${members[i].underlying_symbol} · ${members[i].instrument_symbol}` : `${i + 1}. 等待市值 / 波动率核验`}
                </p>)}
              </div>)}
          </section>;
        })}
      </div>
    </div>
  </main>;
}
