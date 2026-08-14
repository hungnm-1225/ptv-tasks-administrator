import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  RefreshCw,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PauseCircle,
  ToggleLeft,
  ToggleRight,
  Bell,
  BellOff,
  Clock,
  Zap,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────
interface DayHistory {
  date: string;          // YYYY-MM-DD
  status: 'UP' | 'DOWN' | 'DEGRADED';
  incidents: number;
  downtime_s: number;
}

interface MonitoredSite {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
  show_live_alert: boolean;
  last_status: 'UP' | 'DOWN' | 'WARNING' | 'PAUSED' | 'CHECKING';
  http_code: number;
  response_time_ms: number;
  last_checked_at: string | null;
  login_status: string;
  details: string;
  uptime_pct_24h: number;
  uptime_pct_7d: number;
  uptime_pct_30d: number;
  total_incidents: number;
  is_down_since: string | null;
  // enriched client-side
  history?: DayHistory[];
  historyLoading?: boolean;
}

interface MonitorSummary {
  total_sites: number;
  enabled_sites: number;
  up_count: number;
  down_count: number;
  warning_count: number;
  paused_count: number;
  avg_latency_ms: number;
  last_checked_at: string;
}

interface Incident {
  id: string;
  site_id: string;
  site_name: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  http_code: number | null;
  error_msg: string | null;
  is_ongoing: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// ─── Uptime Bar (giống UptimeRobot) ─────────────────────────────────────────
interface UptimeBarProps {
  history: DayHistory[];
  loading?: boolean;
  uptime_pct?: number;
}

const UptimeBar: React.FC<UptimeBarProps> = ({ history, loading, uptime_pct = 100 }) => {
  const [tooltip, setTooltip] = useState<{ day: DayHistory; x: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 h-8">
        {Array.from({ length: 45 }).map((_, i) => (
          <div key={i} className="flex-1 h-full rounded-sm bg-slate-100 dark:bg-slate-700 animate-pulse" />
        ))}
      </div>
    );
  }

  const BAR_COUNT = 45;
  const display = history.slice(-BAR_COUNT);
  // Pad nếu chưa đủ 45 ngày (site mới)
  const padded: DayHistory[] = [
    ...Array.from({ length: BAR_COUNT - display.length }, (_, i) => ({
      date: '',
      status: 'UP' as const,
      incidents: 0,
      downtime_s: 0,
    })),
    ...display,
  ];

  const barColor = (day: DayHistory) => {
    if (!day.date) return 'bg-slate-100 dark:bg-slate-800'; // padding (no data)
    switch (day.status) {
      case 'DOWN':     return 'bg-rose-500 dark:bg-rose-500';
      case 'DEGRADED': return 'bg-amber-400 dark:bg-amber-500';
      default:         return 'bg-emerald-400 dark:bg-emerald-500';
    }
  };

  const uptimeColor = uptime_pct >= 99.9
    ? 'text-emerald-600 dark:text-emerald-400'
    : uptime_pct >= 99
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="space-y-1.5">
      {/* Bar row */}
      <div ref={containerRef} className="relative flex items-end gap-[2px] h-8 group">
        {padded.map((day, i) => (
          <div
            key={i}
            className={`flex-1 rounded-[2px] transition-all duration-150 cursor-default ${barColor(day)} ${
              day.date ? 'opacity-80 hover:opacity-100 hover:scale-y-110 origin-bottom' : 'opacity-30'
            }`}
            style={{ height: day.status === 'DOWN' ? '100%' : day.status === 'DEGRADED' ? '85%' : '75%' }}
            onMouseEnter={(e) => {
              if (!day.date) return;
              setTooltip({ day, x: i });
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute bottom-full mb-2 z-20 pointer-events-none"
            style={{
              left: `${(tooltip.x / BAR_COUNT) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="bg-slate-900 dark:bg-slate-950 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl border border-slate-700 whitespace-nowrap min-w-max">
              <p className="font-semibold">{tooltip.day.date ? new Date(tooltip.day.date).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—'}</p>
              <p className={`mt-0.5 font-medium ${tooltip.day.status === 'DOWN' ? 'text-rose-400' : tooltip.day.status === 'DEGRADED' ? 'text-amber-400' : 'text-emerald-400'}`}>
                {tooltip.day.status === 'DOWN' ? '🔴 DOWN' : tooltip.day.status === 'DEGRADED' ? '🟡 Degraded' : '🟢 Hoạt động tốt'}
              </p>
              {tooltip.day.incidents > 0 && (
                <p className="text-slate-300 mt-0.5">{tooltip.day.incidents} sự cố · {formatDuration(tooltip.day.downtime_s)} downtime</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer: date labels + uptime % */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>45 ngày trước</span>
        <span className={`font-bold text-xs ${uptimeColor}`}>{uptime_pct.toFixed(2)}%</span>
        <span>Hôm nay</span>
      </div>
    </div>
  );
};

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: MonitoredSite['last_status'] }) {
  const map = {
    UP:       { pulse: 'bg-emerald-500', ring: 'ring-emerald-500/30', label: 'Đang hoạt động' },
    DOWN:     { pulse: 'bg-rose-500',    ring: 'ring-rose-500/30',    label: 'Bị sập' },
    WARNING:  { pulse: 'bg-amber-400',   ring: 'ring-amber-400/30',   label: 'Cảnh báo' },
    PAUSED:   { pulse: 'bg-slate-400',   ring: 'ring-slate-400/30',   label: 'Đã dừng' },
    CHECKING: { pulse: 'bg-sky-400',     ring: 'ring-sky-400/30',     label: 'Đang kiểm tra' },
  };
  const cfg = map[status] || map.WARNING;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`relative flex w-2.5 h-2.5`}>
        {status === 'UP' && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.pulse} opacity-50`} />
        )}
        <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${cfg.pulse}`} />
      </span>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{cfg.label}</span>
    </span>
  );
}

// ─── Site Card ───────────────────────────────────────────────────────────────
interface SiteCardProps {
  site: MonitoredSite;
  onToggleEnabled: (site: MonitoredSite) => void;
  onToggleAlert: (site: MonitoredSite) => void;
  onCheckSingle: (site: MonitoredSite) => void;
  checkingSiteId: string | null;
}

const SiteCard: React.FC<SiteCardProps> = ({
  site, onToggleEnabled, onToggleAlert, onCheckSingle, checkingSiteId,
}) => {
  const isDown = site.last_status === 'DOWN';
  const isWarning = site.last_status === 'WARNING';

  return (
    <div className={`bg-white dark:bg-slate-800/80 border rounded-2xl overflow-hidden shadow-xs transition-all duration-200 ${
      isDown    ? 'border-rose-200 dark:border-rose-500/30'
      : isWarning ? 'border-amber-200 dark:border-amber-500/30'
      : 'border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      {/* Accent line top */}
      <div className={`h-0.5 w-full ${isDown ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-emerald-400'}`} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5 flex-1 min-w-0">
            {/* Status dot + name */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusDot status={site.last_status} />
              {site.is_down_since && (
                <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-2 py-0.5 rounded-full">
                  ↓ Down since {site.last_checked_at || '—'}
                </span>
              )}
            </div>

            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{site.name}</h3>

            <a
              href={site.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-mono"
            >
              {site.url.replace(/\/$/, '')}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          {/* Right: metrics */}
          <div className="shrink-0 text-right space-y-1">
            {site.http_code > 0 && (
              <div className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                site.http_code < 400
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25'
                  : 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25'
              }`}>
                HTTP {site.http_code}
              </div>
            )}
            {site.response_time_ms > 0 && (
              <div className={`text-xs font-mono font-semibold ${
                site.response_time_ms < 300 ? 'text-emerald-600 dark:text-emerald-400'
                : site.response_time_ms < 800 ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400'
              }`}>
                <Zap className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                {site.response_time_ms}ms
              </div>
            )}
            {site.last_checked_at && (
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                <Clock className="w-3 h-3" />
                {site.last_checked_at}
              </div>
            )}
          </div>
        </div>

        {/* Uptime bars */}
        <div className="mt-4">
          <UptimeBar
            history={site.history || []}
            loading={site.historyLoading}
            uptime_pct={site.uptime_pct_30d ?? 100}
          />
        </div>

        {/* Stats row */}
        {(site.total_incidents > 0 || site.login_status) && (
          <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            {site.total_incidents > 0 && (
              <span><span className="font-semibold text-rose-500">{site.total_incidents}</span> sự cố / 45 ngày</span>
            )}
            {site.login_status && site.login_status !== 'SKIP' && (
              <span>
                SSO:{' '}
                <span className={`font-semibold ${
                  site.login_status === 'PASS' ? 'text-emerald-600 dark:text-emerald-400'
                  : site.login_status === 'FAIL' ? 'text-rose-500'
                  : 'text-slate-500'
                }`}>
                  {site.login_status}
                </span>
              </span>
            )}
            {site.details && (
              <span className="truncate max-w-xs">{site.details}</span>
            )}
          </div>
        )}

        {/* Controls footer */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onToggleEnabled(site)}
              className={`flex items-center gap-1.5 text-xs font-medium transition ${
                site.enabled
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
              title={site.enabled ? 'Tắt check' : 'Bật check'}
            >
              {site.enabled
                ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                : <ToggleLeft className="w-5 h-5 text-slate-400" />}
              <span className="hidden sm:inline">{site.enabled ? 'Check: Bật' : 'Check: Tắt'}</span>
            </button>

            <button
              onClick={() => onToggleAlert(site)}
              className={`flex items-center gap-1.5 text-xs font-medium transition ${
                site.show_live_alert
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
              title={site.show_live_alert ? 'Tắt thông báo' : 'Bật thông báo'}
            >
              {site.show_live_alert
                ? <Bell className="w-3.5 h-3.5" />
                : <BellOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{site.show_live_alert ? 'Alert: Bật' : 'Alert: Tắt'}</span>
            </button>
          </div>

          <button
            onClick={() => onCheckSingle(site)}
            disabled={checkingSiteId === site.id}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-700/60 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600/60 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition"
          >
            {checkingSiteId === site.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Kiểm tra ngay
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Incident Log ────────────────────────────────────────────────────────────
interface IncidentLogProps {
  incidents: Incident[];
  loading: boolean;
}

const IncidentLog: React.FC<IncidentLogProps> = ({ incidents, loading }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl overflow-hidden shadow-xs">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
      >
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">Incident Log</span>
          {incidents.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200/80 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25">
              {incidents.length} sự cố
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-700/60">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Đang tải incident log...</span>
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-xs font-medium">Không có sự cố nào được ghi nhận</p>
              <p className="text-[11px] text-slate-400">Dữ liệu sẽ xuất hiện sau lần kiểm tra đầu tiên phát hiện lỗi</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700/60">
                  <tr>
                    {['Website', 'Bắt đầu', 'Kết thúc', 'Thời gian down', 'HTTP', 'Trạng thái'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {incidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition">
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{inc.site_name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">{formatDate(inc.started_at)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">
                        {inc.ended_at ? formatDate(inc.ended_at) : <span className="text-rose-500 font-semibold">Đang diễn ra</span>}
                      </td>
                      <td className="px-4 py-3 text-rose-600 dark:text-rose-400 font-semibold whitespace-nowrap">
                        {inc.duration_s ? formatDuration(inc.duration_s) : inc.is_ongoing ? '⏱ Ongoing' : '< 1m'}
                      </td>
                      <td className="px-4 py-3">
                        {inc.http_code && (
                          <span className="font-mono text-[10px] bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25 px-1.5 py-0.5 rounded-md">
                            {inc.http_code}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inc.is_ongoing ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping inline-block" />
                            Ongoing
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────
export const SiteMonitorPage: React.FC = () => {
  const [sites, setSites] = useState<MonitoredSite[]>([]);
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [checkingSiteId, setCheckingSiteId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState('');

  // ── Load all sites + incident log ──────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<{ summary: MonitorSummary; sites: MonitoredSite[] }>('/monitor/sites');
      const enriched = data.sites.map(s => ({
        ...s,
        history: [],
        historyLoading: true,
      }));
      setSites(enriched);
      setSummary(data.summary);
      setLastRefreshed(new Date().toLocaleTimeString('vi-VN'));

      // Fetch history cho mỗi site (parallel)
      enriched.forEach(async (site) => {
        try {
          const h = await fetchApi<{ history: DayHistory[] }>(`/monitor/sites/${site.id}/history?days=45`);
          setSites(prev => prev.map(s =>
            s.id === site.id ? { ...s, history: h.history, historyLoading: false } : s
          ));
        } catch {
          setSites(prev => prev.map(s =>
            s.id === site.id ? { ...s, history: [], historyLoading: false } : s
          ));
        }
      });
    } catch {
      setSites(MOCK_SITES);
      setSummary(MOCK_SUMMARY);
      setLastRefreshed(new Date().toLocaleTimeString('vi-VN'));
    } finally {
      setLoading(false);
    }

    // Incident log
    setIncidentsLoading(true);
    try {
      const inc = await fetchApi<{ incidents: Incident[] }>('/monitor/incidents?limit=50');
      setIncidents(inc.incidents);
    } catch {
      setIncidents([]);
    } finally {
      setIncidentsLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Check all ─────────────────────────────────────────────────────────────
  const handleCheckNow = async () => {
    setChecking(true);
    setSites(prev => prev.map(s => s.enabled ? { ...s, last_status: 'CHECKING' as const } : s));
    try {
      const data = await fetchApi<{ summary: MonitorSummary; sites: MonitoredSite[] }>('/monitor/check-now', { method: 'POST' });
      setSites(prev => {
        return data.sites.map(s => {
          const old = prev.find(o => o.id === s.id);
          return { ...s, history: old?.history || [], historyLoading: false };
        });
      });
      setSummary(data.summary);
      setLastRefreshed(new Date().toLocaleTimeString('vi-VN'));
      toast.success(`✅ Đã kiểm tra ${data.sites.length} sites — ${data.summary.up_count} UP / ${data.summary.down_count} DOWN`);
      // Reload incidents
      const inc = await fetchApi<{ incidents: Incident[] }>('/monitor/incidents?limit=50');
      setIncidents(inc.incidents);
    } catch {
      toast.info('Không kết nối được backend — dùng dữ liệu demo');
      setSites(MOCK_SITES);
    } finally {
      setChecking(false);
    }
  };

  // ── Toggle enabled ────────────────────────────────────────────────────────
  const handleToggleEnabled = async (site: MonitoredSite) => {
    const newVal = !site.enabled;
    setSites(prev => prev.map(s => s.id === site.id ? { ...s, enabled: newVal } : s));
    try {
      await fetchApi(`/monitor/sites/${site.id}`, { method: 'PUT', body: JSON.stringify({ enabled: newVal }) });
      toast.success(`${newVal ? '▶️ Đã bật' : '⏸ Đã tắt'} kiểm tra "${site.name}"`);
    } catch {
      setSites(prev => prev.map(s => s.id === site.id ? { ...s, enabled: !newVal } : s));
      toast.error('Lỗi cập nhật — thử lại sau');
    }
  };

  // ── Toggle alert ──────────────────────────────────────────────────────────
  const handleToggleAlert = async (site: MonitoredSite) => {
    const newVal = !site.show_live_alert;
    setSites(prev => prev.map(s => s.id === site.id ? { ...s, show_live_alert: newVal } : s));
    try {
      await fetchApi(`/monitor/sites/${site.id}`, { method: 'PUT', body: JSON.stringify({ show_live_alert: newVal }) });
      toast.success(`${newVal ? '🔔 Bật' : '🔕 Tắt'} thông báo "${site.name}"`);
    } catch {
      setSites(prev => prev.map(s => s.id === site.id ? { ...s, show_live_alert: !newVal } : s));
      toast.error('Lỗi cập nhật thông báo');
    }
  };

  // ── Check single ──────────────────────────────────────────────────────────
  const handleCheckSingle = async (site: MonitoredSite) => {
    setCheckingSiteId(site.id);
    setSites(prev => prev.map(s => s.id === site.id ? { ...s, last_status: 'CHECKING' as const } : s));
    try {
      const data = await fetchApi<{ site: MonitoredSite }>(`/monitor/sites/${site.id}/check`, { method: 'POST' });
      setSites(prev => prev.map(s => {
        if (s.id !== site.id) return s;
        return { ...data.site, history: s.history, historyLoading: false };
      }));
      toast.success(`Kiểm tra "${site.name}": ${data.site.last_status}`);
      // Reload history cho site này
      const h = await fetchApi<{ history: DayHistory[] }>(`/monitor/sites/${site.id}/history?days=45`);
      setSites(prev => prev.map(s => s.id === site.id ? { ...s, history: h.history } : s));
    } catch {
      await loadAll();
    } finally {
      setCheckingSiteId(null);
    }
  };

  const overallStatus = summary
    ? summary.down_count > 0 ? 'DOWN' : summary.warning_count > 0 ? 'WARNING' : 'UP'
    : 'UP';

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Site Uptime & Health Monitor
            </h2>
            {/* Overall status pill */}
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              overallStatus === 'UP'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                : overallStatus === 'DOWN'
                ? 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
                : 'bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
            }`}>
              {overallStatus === 'UP' ? '● All Systems Operational' : overallStatus === 'DOWN' ? '● Có Sự Cố' : '● Cảnh Báo'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Giám sát hệ sinh thái Pythaverse · Tự động check 1h/lần
            {lastRefreshed && <span className="ml-2 text-slate-400">· Cập nhật: <strong>{lastRefreshed}</strong></span>}
          </p>
        </div>

        <button
          onClick={handleCheckNow}
          disabled={checking || loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Đang kiểm tra...' : '↺ Check Now'}
        </button>
      </div>

      {/* ── KPI Bar ── */}
      {summary && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Tổng Sites',       value: summary.total_sites,    icon: <Globe className="w-3.5 h-3.5" />,          cls: 'text-slate-700 dark:text-slate-100' },
            { label: 'Đang UP',          value: summary.up_count,       icon: <Wifi className="w-3.5 h-3.5" />,           cls: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Bị DOWN',          value: summary.down_count,     icon: <WifiOff className="w-3.5 h-3.5" />,        cls: summary.down_count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400' },
            { label: 'Cảnh Báo',         value: summary.warning_count,  icon: <AlertTriangle className="w-3.5 h-3.5" />,  cls: summary.warning_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400' },
            { label: 'Tạm Dừng',         value: summary.paused_count,   icon: <PauseCircle className="w-3.5 h-3.5" />,    cls: 'text-slate-500 dark:text-slate-400' },
            { label: 'Avg Latency',      value: `${summary.avg_latency_ms}ms`, icon: <Zap className="w-3.5 h-3.5" />, cls: 'text-sky-600 dark:text-sky-400' },
          ].map(({ label, value, icon, cls }) => (
            <div key={label} className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 rounded-xl px-4 py-3 text-center space-y-1 shadow-xs">
              <div className={`flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
                {icon}<span>{label}</span>
              </div>
              <div className={`text-2xl font-extrabold ${cls}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Site Cards ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-xs font-medium">Đang nạp danh sách website...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sites.map(site => (
            <SiteCard
              key={site.id}
              site={site}
              onToggleEnabled={handleToggleEnabled}
              onToggleAlert={handleToggleAlert}
              onCheckSingle={handleCheckSingle}
              checkingSiteId={checkingSiteId}
            />
          ))}
        </div>
      )}

      {/* ── Incident Log ── */}
      {!loading && (
        <IncidentLog incidents={incidents} loading={incidentsLoading} />
      )}

      {/* ── Note về Supabase setup ── */}
      {!loading && incidents.length === 0 && (
        <div className="flex items-start gap-3 p-4 bg-sky-50 dark:bg-sky-500/10 border border-sky-200/80 dark:border-sky-500/25 rounded-xl text-xs text-sky-800 dark:text-sky-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
          <div>
            <p className="font-semibold mb-1">Để xem lịch sử downtime, bạn cần tạo bảng Supabase:</p>
            <code className="block bg-white/60 dark:bg-sky-900/30 px-3 py-1.5 rounded-lg font-mono text-[10px] mt-1 border border-sky-200/50 dark:border-sky-500/20">
              CREATE TABLE site_downtime_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), site_id TEXT, site_name TEXT, started_at TIMESTAMPTZ DEFAULT now(), ended_at TIMESTAMPTZ, duration_s INTEGER, http_code INTEGER, error_msg TEXT, is_ongoing BOOLEAN DEFAULT TRUE);
            </code>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Mock data fallback (khi backend chưa chạy) ──────────────────────────────
const MOCK_SITES: MonitoredSite[] = [
  { id: 'pythaverse_main', name: 'Pythaverse Main Portal',  url: 'https://pythaverse.space/',                   category: 'core',      enabled: true, show_live_alert: true,  last_status: 'UP', http_code: 200, response_time_ms: 185, last_checked_at: null, login_status: 'PASS', details: 'Main Portal & 6/6 Roles', uptime_pct_24h: 100, uptime_pct_7d: 100, uptime_pct_30d: 100, total_incidents: 0, is_down_since: null, history: Array.from({length:45},(_,i)=>({date:'',status:'UP' as const,incidents:0,downtime_s:0})), historyLoading: false },
  { id: 'ide',             name: 'Pythaverse IDE',          url: 'https://ide.pythaverse.space/#/',              category: 'satellite', enabled: true, show_live_alert: true,  last_status: 'UP', http_code: 200, response_time_ms: 220, last_checked_at: null, login_status: 'SKIP', details: 'Online IDE', uptime_pct_24h: 100, uptime_pct_7d: 99.8, uptime_pct_30d: 99.9, total_incidents: 1, is_down_since: null, history: Array.from({length:45},(_,i)=>({date:'',status: i===40 ? 'DOWN' as const : 'UP' as const,incidents: i===40 ? 1 : 0,downtime_s: i===40 ? 1800 : 0})), historyLoading: false },
];

const MOCK_SUMMARY: MonitorSummary = {
  total_sites: 10, enabled_sites: 10, up_count: 10, down_count: 0, warning_count: 0, paused_count: 0, avg_latency_ms: 247, last_checked_at: '—',
};
