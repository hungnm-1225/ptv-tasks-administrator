// frontend/src/features/monitor/SiteMonitorPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  RefreshCw,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PauseCircle,
  Clock,
  Zap,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  Server,
  GitBranch,
  Terminal,
  Copy,
  Check,
  Filter,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────
interface HourlyHistoryItem {
  hour: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  latency_ms?: number;
  incident_duration?: string;
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
  details: string;
  uptime_pct_24h: number;
  uptime_pct_30d: number;
  total_incidents: number;
  is_down_since: string | null;
  history?: HourlyHistoryItem[];
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

interface DeploymentItem {
  id: string;
  name: string;
  url?: string;
  state?: string;
  status?: string;
  created_at: string | number;
  commit_msg: string;
  commit_author: string;
  provider: 'vercel' | 'render';
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(isoOrTs: string | number): string {
  try {
    const d = typeof isoOrTs === 'number' ? new Date(isoOrTs) : new Date(isoOrTs);
    return d.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(isoOrTs); }
}

// ─── Hourly Uptime Bar (24 Khối Giờ — Chống Lệch Sidebar & Gọn Chữ) ──────────
interface UptimeBarProps {
  siteId: string;
  history?: HourlyHistoryItem[];
  loading?: boolean;
  uptime_pct?: number;
}

const UptimeBar: React.FC<UptimeBarProps> = ({
  siteId,
  history = [],
  loading = false,
  uptime_pct = 100,
}) => {
  const [tooltip, setTooltip] = useState<{ item: HourlyHistoryItem; index: number } | null>(null);

  if (loading && history.length === 0) {
    return (
      <div className="flex items-center gap-1 h-6 animate-pulse">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="flex-1 h-full rounded-xs bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  // Đảm bảo luôn đủ 24 điểm giờ
  const displayHours: HourlyHistoryItem[] = history.length === 24
    ? history
    : Array.from({ length: 24 }, (_, i) => {
      const hourNum = (new Date().getHours() - (23 - i) + 24) % 24;
      return {
        hour: `${hourNum.toString().padStart(2, '0')}:00`,
        status: 'UP' as const,
        latency_ms: 0,
      };
    });

  return (
    <div className="space-y-1.5 select-none">
      <div className="relative flex items-end gap-1 h-6">
        {displayHours.map((h, i) => {
          const isDown = h.status === 'DOWN';
          const isDegraded = h.status === 'DEGRADED';
          const bgClass = isDown ? 'bg-rose-500' : isDegraded ? 'bg-amber-400' : 'bg-emerald-500';

          return (
            <div
              key={i}
              className={`flex-1 rounded-xs transition-all duration-150 cursor-pointer ${bgClass} hover:opacity-100 hover:scale-y-125 opacity-80 origin-bottom`}
              style={{ height: isDown ? '100%' : '75%' }}
              onMouseEnter={() => setTooltip({ item: h, index: i })}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Tooltip định vị thông minh chống tràn mép viền */}
        {tooltip && (
          <div
            className={`absolute bottom-full mb-2 z-30 pointer-events-none transition-all duration-75 ${tooltip.index < 3
              ? 'left-0'
              : tooltip.index > 20
                ? 'right-0'
                : '-translate-x-1/2'
              }`}
            style={
              tooltip.index >= 3 && tooltip.index <= 20
                ? { left: `${((tooltip.index + 0.5) / 24) * 100}%` }
                : undefined
            }
          >
            <div className="bg-slate-900 text-white text-[11px] font-mono rounded-lg px-2.5 py-1.5 shadow-2xl border border-slate-700 whitespace-nowrap flex items-center gap-1.5">
              <span className="font-semibold text-slate-300">{tooltip.item.hour}</span>
              <span>—</span>
              <span className={tooltip.item.status === 'DOWN' ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                {tooltip.item.status === 'DOWN' ? '🔴 Lỗi' : '🟢 Ổn định'}
              </span>
              {tooltip.item.incident_duration && (
                <span className="text-[10px] text-rose-300 ml-0.5">({tooltip.item.incident_duration})</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
        <span>24h trước</span>
        <span className={`font-bold text-xs ${uptime_pct < 99 ? 'text-amber-500' : 'text-emerald-500'}`}>
          Live Uptime {uptime_pct.toFixed(1)}%
        </span>
        <span>Hiện tại</span>
      </div>
    </div>
  );
};

// ─── Status Dot ─────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: MonitoredSite['last_status'] }) {
  const map = {
    UP: { pulse: 'bg-emerald-500', ring: 'ring-emerald-500/30', label: 'Đang hoạt động' },
    DOWN: { pulse: 'bg-rose-500', ring: 'ring-rose-500/30', label: 'Bị sập' },
    WARNING: { pulse: 'bg-amber-400', ring: 'ring-amber-400/30', label: 'Cảnh báo' },
    PAUSED: { pulse: 'bg-slate-400', ring: 'ring-slate-400/30', label: 'Đã dừng' },
    CHECKING: { pulse: 'bg-sky-400', ring: 'ring-sky-400/30', label: 'Đang kiểm tra' },
  };
  const cfg = map[status] || map.WARNING;
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex w-2.5 h-2.5">
        {status === 'UP' && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.pulse} opacity-50`} />
        )}
        <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${cfg.pulse}`} />
      </span>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{cfg.label}</span>
    </span>
  );
}

// ─── Skeletons Loader ───────────────────────────────────────────────────────
const SummarySkeleton = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 h-20" />
    ))}
  </div>
);

const SiteCardSkeleton = () => (
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 animate-pulse">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 h-44" />
    ))}
  </div>
);

const DeployCardSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 h-24" />
    ))}
  </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────
export const SiteMonitorPage: React.FC = () => {
  // Đã lược bỏ hoàn toàn tab 'auth_matrix'
  const [activeTab, setActiveTab] = useState<'public' | 'cicd_deploy'>('public');

  // Filter KPI trạng thái
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UP' | 'DOWN' | 'WARNING' | 'PAUSED'>('ALL');

  // Tab 1 States
  const [sites, setSites] = useState<MonitoredSite[]>([]);
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // Tab 2 (CI/CD Deploys) States
  const [vercelDeploys, setVercelDeploys] = useState<DeploymentItem[]>([]);
  const [renderDeploys, setRenderDeploys] = useState<DeploymentItem[]>([]);
  const [deployLoading, setDeployLoading] = useState(true);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [currentLogs, setCurrentLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedDeployTitle, setSelectedDeployTitle] = useState('');
  const [copied, setCopied] = useState(false);

  // ⚡ 1. TẢI TAB GIÁM SÁT CÔNG KHAI TỪ SERVER
  const loadPublicSites = useCallback(async (forceSpinner = false) => {
    if (forceSpinner) setLoading(true);
    try {
      const data = await fetchApi<{ summary: MonitorSummary; sites: MonitoredSite[] }>('/monitor/sites');
      const baseSites = data.sites.map(s => ({ ...s, history: [], historyLoading: true }));
      setSites(baseSites);
      setSummary(data.summary);

      // Tải song song 24h history cho từng site
      baseSites.forEach(async (site) => {
        try {
          const h = await fetchApi<{ history: HourlyHistoryItem[] }>(`/monitor/sites/${site.id}/hourly?hours=24`);
          setSites(prev => prev.map(s => s.id === site.id ? { ...s, history: h.history, historyLoading: false } : s));
        } catch {
          setSites(prev => prev.map(s => s.id === site.id ? { ...s, history: [], historyLoading: false } : s));
        }
      });
    } catch {
      toast.error('Không thể kết nối đến máy chủ giám sát.');
    } finally {
      setLoading(false);
    }

    try {
      const inc = await fetchApi<{ incidents: Incident[] }>('/monitor/incidents?limit=20');
      setIncidents(inc.incidents || []);
    } catch {
      setIncidents([]);
    }
  }, []);

  // ⚡ 2. TẢI TAB CI/CD DEPLOYS (VERCEL & RENDER)
  const loadDeployments = useCallback(async (forceSpinner = false) => {
    if (forceSpinner) setDeployLoading(true);
    try {
      const [vercelRes, renderRes] = await Promise.allSettled([
        fetchApi<{ deployments: DeploymentItem[] }>('/monitor/deployments/vercel?limit=10'),
        fetchApi<{ deployments: DeploymentItem[] }>('/monitor/deployments/render?limit=10'),
      ]);

      if (vercelRes.status === 'fulfilled') {
        setVercelDeploys(vercelRes.value.deployments || []);
      }
      if (renderRes.status === 'fulfilled') {
        setRenderDeploys(renderRes.value.deployments || []);
      }
    } catch {
      toast.error('Lỗi khi tải lịch sử triển khai CI/CD');
    } finally {
      setDeployLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'public') loadPublicSites();
    if (activeTab === 'cicd_deploy') loadDeployments();
  }, [activeTab, loadPublicSites, loadDeployments]);

  // Quét thủ công tức thì
  const handleCheckAllPublic = async () => {
    setChecking(true);
    setSites(prev => prev.map(s => s.enabled ? { ...s, last_status: 'CHECKING' as const } : s));
    try {
      const data = await fetchApi<{ summary: MonitorSummary; sites: MonitoredSite[] }>('/monitor/check-now', { method: 'POST' });
      const updated = data.sites.map(s => {
        const old = sites.find(o => o.id === s.id);
        return { ...s, history: old?.history || [], historyLoading: false };
      });
      setSites(updated);
      setSummary(data.summary);
      toast.success(`Đã quét thật ${data.sites.length} website — ${data.summary.up_count} UP / ${data.summary.down_count} DOWN`);

      // Cập nhật lại incidents sau khi check
      const inc = await fetchApi<{ incidents: Incident[] }>('/monitor/incidents?limit=20');
      setIncidents(inc.incidents || []);
    } catch {
      toast.error('Lỗi khi gửi yêu cầu quét website');
    } finally {
      setChecking(false);
    }
  };

  // Xem Live Deploy Logs
  const handleViewLogs = async (item: DeploymentItem) => {
    setSelectedDeployTitle(`${item.provider.toUpperCase()}: ${item.name} (#${item.id.slice(0, 8)})`);
    setLogModalOpen(true);
    setLoadingLogs(true);
    setCurrentLogs('');
    try {
      const data = await fetchApi<{ logs: string }>(`/monitor/deployments/${item.provider}/${item.id}/logs`);
      setCurrentLogs(data.logs || 'Không có bản ghi log.');
    } catch {
      setCurrentLogs('Không thể lấy build logs từ nhà cung cấp.');
    } finally {
      setLoadingLogs(false);
    }
  };

  const copyLogsToClipboard = () => {
    navigator.clipboard.writeText(currentLogs);
    setCopied(true);
    toast.success('Đã copy logs vào clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Lọc sites theo thẻ KPI
  const filteredSites = useMemo(() => {
    if (statusFilter === 'ALL') return sites;
    return sites.filter(s => s.last_status === statusFilter);
  }, [sites, statusFilter]);

  return (
    <div className="space-y-6 w-full pb-10">
      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Site Uptime & Infrastructure Hub
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            Giám sát Uptime thời gian thực · Nhật ký sự cố · CI/CD Triển Khai Song Song
          </p>
        </div>

        {activeTab === 'public' ? (
          <button
            onClick={handleCheckAllPublic}
            disabled={checking || loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Đang ping thực tế...' : 'Quét Toàn Bộ Site Ngay'}
          </button>
        ) : (
          <button
            onClick={() => loadDeployments(true)}
            disabled={deployLoading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${deployLoading ? 'animate-spin' : ''}`} />
            Làm Mới CI/CD Pipelines
          </button>
        )}
      </div>

      {/* ── 2-Tabs Navigation Bar (Đã bỏ Tab 2) ── */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
        <button
          onClick={() => setActiveTab('public')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${activeTab === 'public'
            ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <Globe className="w-4 h-4" />
          <span>1. Giám Sát Sức Khỏe Uptime</span>
        </button>

        <button
          onClick={() => setActiveTab('cicd_deploy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${activeTab === 'cicd_deploy'
            ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <GitBranch className="w-4 h-4" />
          <span>2. CI/CD & Tiến Trình Triển Khai</span>
        </button>
      </div>

      {/* TAB 1: GIÁM SÁT SỨC KHỎE UPTIME */}
      {activeTab === 'public' && (
        <div className="space-y-6">
          {/* KPI Summary Cards với tính năng bấm lọc */}
          {loading && !summary ? (
            <SummarySkeleton />
          ) : summary ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { key: 'ALL', label: 'Tổng Sites', value: summary.total_sites, icon: <Globe className="w-3.5 h-3.5" />, cls: 'text-slate-700 dark:text-slate-200' },
                { key: 'UP', label: 'Đang UP', value: summary.up_count, icon: <Wifi className="w-3.5 h-3.5" />, cls: 'text-emerald-600 dark:text-emerald-400' },
                { key: 'DOWN', label: 'Bị DOWN', value: summary.down_count, icon: <WifiOff className="w-3.5 h-3.5" />, cls: summary.down_count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400' },
                { key: 'WARNING', label: 'Cảnh Báo', value: summary.warning_count, icon: <AlertTriangle className="w-3.5 h-3.5" />, cls: summary.warning_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400' },
                { key: 'PAUSED', label: 'Tạm Dừng', value: summary.paused_count, icon: <PauseCircle className="w-3.5 h-3.5" />, cls: 'text-slate-500' },
                { key: null, label: 'Avg Latency', value: `${summary.avg_latency_ms}ms`, icon: <Zap className="w-3.5 h-3.5" />, cls: 'text-sky-600 dark:text-sky-400' },
              ].map(({ key, label, value, icon, cls }) => (
                <div
                  key={label}
                  onClick={() => key && setStatusFilter(key as any)}
                  className={`bg-white dark:bg-slate-900 border rounded-xl px-4 py-3 text-center space-y-1 shadow-xs transition ${key ? 'cursor-pointer hover:border-slate-400 dark:hover:border-slate-600' : ''
                    } ${statusFilter === key ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-slate-200 dark:border-slate-800'}`}
                >
                  <div className={`flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
                    {icon}<span>{label}</span>
                  </div>
                  <div className={`text-2xl font-extrabold ${cls}`}>{value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Thanh báo đang áp dụng bộ lọc */}
          {statusFilter !== 'ALL' && (
            <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-emerald-500" />
                <span>Đang lọc danh sách theo trạng thái: <b>{statusFilter}</b> ({filteredSites.length} website)</span>
              </div>
              <button
                onClick={() => setStatusFilter('ALL')}
                className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer"
              >
                Hiện tất cả
              </button>
            </div>
          )}

          {/* Danh sách Site Cards */}
          {loading && sites.length === 0 ? (
            <SiteCardSkeleton />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredSites.map(site => (
                <div
                  key={site.id}
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-xs transition hover:border-slate-400 dark:hover:border-slate-700 ${site.last_status === 'DOWN' ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10' : 'border-slate-200 dark:border-slate-800'
                    }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusDot status={site.last_status} />
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{site.name}</span>
                      </div>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-mono"
                      >
                        {site.url.replace(/\/$/, '')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Badge HTTP hoặc Latency gọn gàng không trùng lặp */}
                    <div className="shrink-0 flex items-center gap-2">
                      {site.response_time_ms > 0 && site.last_status === 'UP' && (
                        <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          <Zap className="w-3 h-3 inline mr-0.5" />{site.response_time_ms}ms
                        </span>
                      )}
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${site.http_code >= 200 && site.http_code < 400
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300'
                        }`}>
                        {site.http_code > 0 ? `HTTP ${site.http_code}` : 'NO_RESP'}
                      </span>
                    </div>
                  </div>

                  {/* Thanh 24 Giờ Uptime Bar */}
                  <div className="mt-4">
                    <UptimeBar
                      siteId={site.id}
                      history={site.history || []}
                      loading={site.historyLoading}
                      uptime_pct={site.uptime_pct_30d ?? 100}
                    />
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate max-w-[70%]">{site.details}</span>
                    <span className="font-mono text-[10px] shrink-0">{site.last_checked_at || 'Vừa xong'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Incident Log (Đọc từ Supabase thật) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Incident Log (Nhật Ký Sự Cố Gần Đây)</h3>
            </div>
            {incidents.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Không có sự cố nào được ghi nhận trong 24 giờ. Tất cả hệ thống vận hành ổn định!</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {incidents.map(inc => (
                  <div key={inc.id} className="py-2.5 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="font-semibold text-slate-900 dark:text-white">{inc.site_name}</span>
                      <span className="text-slate-400">({formatDate(inc.started_at)})</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-rose-600 dark:text-rose-400 font-medium">{inc.error_msg || 'Sập kết nối'}</span>
                      {inc.is_ongoing ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 font-bold text-[10px]">
                          Đang diễn ra
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          Kéo dài: {inc.duration_s ? `${Math.round(inc.duration_s / 60)} phút` : '1 phút'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CI/CD DEPLOY MONITOR (CHIA 2 CỘT SONG SONG: VERCEL & RENDER) */}
      {activeTab === 'cicd_deploy' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── CỘT BÊN TRÁI: VERCEL (FRONTEND) ── */}
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-black text-white dark:bg-white dark:text-black rounded-xl">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-slate-900 dark:text-white">Frontend SPA (Vercel)</h2>
                    <p className="text-[11px] text-slate-500 font-mono">ptv-tasks-administrator.vercel.app</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded-full dark:bg-emerald-500/10 dark:text-emerald-300">
                  Auto-Deploy Edge
                </span>
              </div>

              {deployLoading && vercelDeploys.length === 0 ? (
                <DeployCardSkeleton />
              ) : (
                <div className="space-y-3">
                  {vercelDeploys.map((item, idx) => {
                    const isLatest = idx === 0 && (item.state === 'READY' || item.status === 'READY');
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl p-4 border transition ${isLatest
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-600/60 shadow-sm ring-1 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-75 hover:opacity-100'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-white">{item.name}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.state === 'READY'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300'
                                }`}>
                                {item.state || 'READY'}
                              </span>
                              {isLatest && (
                                <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  ● Đang chạy hiện tại
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                              <GitBranch className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-medium truncate max-w-[280px]">{item.commit_msg}</span>
                            </p>
                          </div>

                          <button
                            onClick={() => handleViewLogs(item)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-[11px] font-semibold rounded-lg transition cursor-pointer"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                            <span>Logs</span>
                          </button>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>by {item.commit_author}</span>
                          <span>{formatDate(item.created_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── CỘT BÊN PHẢI: RENDER.COM (BACKEND) ── */}
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-slate-900 dark:text-white">Backend FastAPI (Render)</h2>
                    <p className="text-[11px] text-slate-500 font-mono">ptv-tasks-backend (512MB RAM Budget)</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded-full dark:bg-emerald-500/10 dark:text-emerald-300">
                  Docker Live
                </span>
              </div>

              {deployLoading && renderDeploys.length === 0 ? (
                <DeployCardSkeleton />
              ) : (
                <div className="space-y-3">
                  {renderDeploys.map((item, idx) => {
                    const isLatest = idx === 0 && (item.status === 'live');
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl p-4 border transition ${isLatest
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-600/60 shadow-sm ring-1 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-75 hover:opacity-100'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-white">{item.name}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.status === 'live'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300'
                                }`}>
                                {item.status || 'live'}
                              </span>
                              {isLatest && (
                                <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  ● Đang chạy hiện tại
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                              <GitBranch className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-medium truncate max-w-[280px]">{item.commit_msg}</span>
                            </p>
                          </div>

                          <button
                            onClick={() => handleViewLogs(item)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-[11px] font-semibold rounded-lg transition cursor-pointer"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                            <span>Logs</span>
                          </button>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>by {item.commit_author}</span>
                          <span>{formatDate(item.created_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Live Terminal Build Logs */}
      {logModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setLogModalOpen(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
          >
            <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs font-mono">{selectedDeployTitle}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyLogsToClipboard}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
                </button>

                <button
                  onClick={() => setLogModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-slate-300 bg-slate-950">
              {loadingLogs ? (
                <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                  <span>Đang tải live build logs...</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap select-text">{currentLogs}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};