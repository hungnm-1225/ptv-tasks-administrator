// frontend/src/features/bots/BotCommanderPage.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Terminal as TerminalIcon,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCw,
  Copy,
  Trash2,
  Search,
  ShieldCheck,
  Zap,
  Mail,
  LifeBuoy,
  FileSpreadsheet,
  Database,
  KeyRound,
  GraduationCap,
  GitPullRequest,
  Boxes,
  Sparkles,
  Play,
  Pause,
  Clock,
  Check,
  Tag,
  Filter,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotTerminalLog } from '../../types';
import { toast } from 'sonner';

interface IngestionWorkerConfig {
  key: string;
  name: string;
  description: string;
  cronInterval: string;
  syncType: string;
  icon: React.ElementType;
  badgeClass: string;
  iconClass: string;
}

interface ExecutionWorkerConfig {
  key: string;
  name: string;
  description: string;
  engineType: string;
  icon: React.ElementType;
  badgeClass: string;
  iconClass: string;
}

const getBotLocalCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(`ptv_bot_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const setBotLocalCache = (key: string, data: any) => {
  try {
    localStorage.setItem(`ptv_bot_${key}`, JSON.stringify(data));
  } catch { }
};

const INGESTION_PIPELINES: IngestionWorkerConfig[] = [
  {
    key: 'gmail_sync_worker',
    name: 'Gmail Workspace Ingestion',
    description: 'Quét thư chưa đọc @dtt.vn, trích xuất tệp COF & đính kèm',
    cronInterval: 'Chu kỳ 5 phút (So Le)',
    syncType: 'gmail',
    icon: Mail,
    badgeClass: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/50',
    iconClass: 'text-sky-600 dark:text-sky-400'
  },
  {
    key: 'osticket_sync_worker',
    name: 'OS Ticket Support Scraper',
    description: 'Cào vé mở từ helpdesk support.pythaverse.space qua Playwright',
    cronInterval: 'Chu kỳ 5 phút (So Le)',
    syncType: 'osticket',
    icon: LifeBuoy,
    badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/50',
    iconClass: 'text-amber-600 dark:text-amber-400'
  },
  {
    key: 'feedback_sheet_worker',
    name: 'Google Form Feedback Sync',
    description: 'Quét phản hồi từ Google Sheets & đồng bộ trạng thái Assigned',
    cronInterval: 'Chu kỳ 5 phút (So Le)',
    syncType: 'sheet',
    icon: FileSpreadsheet,
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/50',
    iconClass: 'text-emerald-600 dark:text-emerald-400'
  },
  {
    key: 'distributor_cache_worker',
    name: 'Distributors Cache Scanner',
    description: 'Quét cache Orders & Hợp đồng từ 5 Master Distributors',
    cronInterval: 'Chu kỳ 45 phút',
    syncType: 'distributor_cache',
    icon: Database,
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/50',
    iconClass: 'text-indigo-600 dark:text-indigo-400'
  }
];

const EXECUTION_ENGINES: ExecutionWorkerConfig[] = [
  {
    key: 'workspace_license_worker',
    name: 'Workspace License RPA',
    description: 'Tạo đơn, cấp phép 4 cấp, nộp batch user & ghi ngược COF',
    engineType: 'Playwright Chromium',
    icon: Boxes,
    badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/50',
    iconClass: 'text-amber-600 dark:text-amber-400'
  },
  {
    key: 'keycloak_api_worker',
    name: 'Keycloak Identity Engine',
    description: 'Đổi mật khẩu tạm thời, kích hoạt tài khoản & xác thực email',
    engineType: '2-Tier Hybrid REST/RPA',
    icon: KeyRound,
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/50',
    iconClass: 'text-indigo-600 dark:text-indigo-400'
  },
  {
    key: 'lms_git_worker',
    name: 'LMS PLearn & Git Provisioning',
    description: 'Ghi danh khóa học Moodle theo vai trò & tạo Group lớp',
    engineType: 'Hybrid Automator',
    icon: GraduationCap,
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/50',
    iconClass: 'text-emerald-600 dark:text-emerald-400'
  },
  {
    key: 'github_dispatcher',
    name: 'GitHub Issue Dispatcher',
    description: 'Tạo Bug Issue Markdown vào Private Repo kèm telemetry log',
    engineType: 'GitHub REST API v3',
    icon: GitPullRequest,
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    iconClass: 'text-slate-700 dark:text-slate-300'
  }
];

export const BotCommanderPage: React.FC = () => {
  const initialStatus = useMemo(() => getBotLocalCache<Record<string, { status: string; failed_count: number }>>('workers_status'), []);
  const initialLogs = useMemo(() => getBotLocalCache<BotTerminalLog[]>('terminal_logs') || [], []);

  const [botStatus, setBotStatus] = useState<Record<string, { status: string; failed_count: number }> | null>(initialStatus);
  const [logs, setLogs] = useState<BotTerminalLog[]>(initialLogs);
  const [loading, setLoading] = useState<boolean>(!initialStatus);

  const [syncingType, setSyncingType] = useState<string | null>(null);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [purgingRam, setPurgingRam] = useState<boolean>(false);

  // Terminal Controls
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const loadBotData = useCallback(async (showToast = false, forceSpinner = false) => {
    const cachedStatus = getBotLocalCache<Record<string, { status: string; failed_count: number }>>('workers_status');
    if (!cachedStatus || forceSpinner) {
      setLoading(true);
    }

    try {
      const [statusData, logsData] = await Promise.all([
        fetchApi<Record<string, { status: string; failed_count: number }>>('/bots/status'),
        fetchApi<BotTerminalLog[]>('/bots/logs')
      ]);
      setBotStatus(statusData);
      setLogs(logsData);
      setBotLocalCache('workers_status', statusData);
      setBotLocalCache('terminal_logs', logsData);
      if (showToast) toast.success('Đã cập nhật trạng thái Workers & Logs thời gian thực!');
    } catch (err) {
      console.error('Lỗi khi nạp dữ liệu Bot Commander:', err);
      if (showToast) toast.error('Không thể kiểm tra Bot: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBotData();
    if (!isStreaming) return;

    const interval = setInterval(() => {
      loadBotData();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadBotData, isStreaming]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleForceSync = async (syncType: string, pipelineName: string) => {
    setSyncingType(syncType);
    try {
      const res = await fetchApi<{ message?: string }>(`/bots/force-sync/${syncType}`, { method: 'POST' });
      toast.success(res?.message || `Đã kích hoạt quét ngay cho [${pipelineName}]!`);
      setTimeout(() => loadBotData(false, false), 1500);
    } catch (err) {
      toast.error('Lỗi ép quét dữ liệu: ' + (err as Error).message);
    } finally {
      setSyncingType(null);
    }
  };

  const handleRetryWorker = async (workerKey: string, workerName: string) => {
    setRetryingKey(workerKey);
    try {
      const res = await fetchApi<{ message?: string }>(`/bots/${workerKey}/retry`, { method: 'POST' });
      toast.success(res?.message || `Đã gửi tín hiệu chạy lại cho [${workerName}]`);
      setTimeout(() => loadBotData(false, false), 1500);
    } catch (err) {
      toast.error('Lỗi gửi tín hiệu retry: ' + (err as Error).message);
    } finally {
      setRetryingKey(null);
    }
  };

  const handlePurgeMemory = async () => {
    setPurgingRam(true);
    try {
      const res = await fetchApi<{ message?: string }>('/bots/purge-memory', { method: 'POST' });
      toast.success(res?.message || 'Đã giải phóng bộ nhớ RAM Render thành công!');
      loadBotData(false, false);
    } catch (err) {
      toast.error('Lỗi dọn RAM: ' + (err as Error).message);
    } finally {
      setPurgingRam(false);
    }
  };

  const handleCopyLogs = () => {
    const textToCopy = logs.map(l => l.raw_line).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedLogs(true);
    toast.success('Đã sao chép toàn bộ nhật ký log vào clipboard!');
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleClearLogs = () => {
    const nowLocal = new Date().toLocaleString('sv-SE', { hour12: false }).replace('T', ' ');
    const cleared: BotTerminalLog[] = [{
      timestamp: nowLocal,
      level: 'INFO',
      worker: 'Console',
      message: 'Terminal logs cleared locally.',
      raw_line: `[${nowLocal}] [INFO] [Console]: Terminal cleared.`
    }];
    setLogs(cleared);
    setBotLocalCache('terminal_logs', cleared);
    toast.info('Đã xóa sạch nhật ký terminal');
  };

  // 🔍 BÓC TÁCH TASK ID TỪ LOG LINE
  const parseLogLineDetails = (log: BotTerminalLog) => {
    const text = `${log.raw_line || ''} ${log.message || ''}`;

    const taskMatch = text.match(/\[Task\s*#?([a-fA-F0-9]{8})\]/i) ||
      text.match(/Task\s*#?([a-fA-F0-9]{8})/i) ||
      text.match(/#([a-fA-F0-9]{8})/i);

    const taskId = taskMatch ? taskMatch[1].toLowerCase() : null;

    let cleanMsg = log.message || '';
    if (taskId && cleanMsg.includes(`[Task #${taskId}]`)) {
      cleanMsg = cleanMsg.replace(`[Task #${taskId}]:`, '').replace(`[Task #${taskId}]`, '').trim();
    }

    return { taskId, cleanMsg };
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase().replace(/^#/, '');
    return logs.filter(l =>
      (l.raw_line || '').toLowerCase().includes(q) ||
      (l.worker || '').toLowerCase().includes(q) ||
      (l.message || '').toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Bot Command & Execution Center
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            Trung tâm chỉ huy toàn diện các luồng Thu thập dữ liệu (Ingestion) và Cỗ máy thực thi tự động (Execution Engines).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 text-xs font-semibold shadow-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>Human-in-the-Loop Active</span>
          </span>

          <button
            type="button"
            onClick={handlePurgeMemory}
            disabled={purgingRam}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 border border-amber-200/80 dark:border-amber-800/60 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 transition-all shadow-xs cursor-pointer"
            title="Kích hoạt Garbage Collector giải phóng RAM máy chủ Render"
          >
            <Sparkles className={`w-3.5 h-3.5 ${purgingRam ? 'animate-spin' : ''}`} />
            <span>{purgingRam ? 'Đang dọn RAM...' : 'Dọn RAM (512MB)'}</span>
          </button>

          <button
            type="button"
            onClick={() => loadBotData(true, true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Đồng bộ</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: INGESTION PIPELINES */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              1. Bộ Thu Thập Dữ Liệu Đa Kênh (Ingestion Crons)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Chế độ Lệch Pha (So Le) — Tránh tràn RAM 512MB</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {INGESTION_PIPELINES.map((p) => {
            const IconComp = p.icon;
            const isSyncing = syncingType === p.syncType;

            return (
              <div
                key={p.key}
                className="bento-card p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl border ${p.badgeClass}`}>
                        <IconComp className={`w-4 h-4 ${p.iconClass}`} />
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{p.name}</span>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 px-2 py-0.5 rounded-full shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>ONLINE</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 line-clamp-2 leading-relaxed">{p.description}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{p.cronInterval}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleForceSync(p.syncType, p.name)}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Đang quét...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3 h-3 text-indigo-600 dark:text-indigo-400 fill-indigo-600 dark:fill-indigo-400" />
                        <span>Ép Quét Ngay</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: AUTOMATION EXECUTION ENGINES */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              2. Cỗ Máy Thực Thi Tự Động (Automation Execution Engines)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Bảo vệ Crash Guard & Truy vết [Task #ID]</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {EXECUTION_ENGINES.map((w) => {
            const IconComp = w.icon;
            const statusInfo = botStatus?.[w.key] || { status: 'active', failed_count: 0 };
            const isDegraded = statusInfo.status === 'degraded' || statusInfo.failed_count > 0;
            const isRetrying = retryingKey === w.key;

            return (
              <div
                key={w.key}
                className="bento-card p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl border ${w.badgeClass}`}>
                        <IconComp className={`w-4 h-4 ${w.iconClass}`} />
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{w.name}</span>
                    </div>
                    {isDegraded ? (
                      <span className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200/80 dark:border-amber-800/60 shadow-xs">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{statusInfo.failed_count} LỖI</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 px-2 py-0.5 rounded-full shadow-xs">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>READY</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 line-clamp-2 leading-relaxed">{w.description}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md truncate max-w-[130px]" title={w.engineType}>
                    {w.engineType}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleRetryWorker(w.key, w.name)}
                    disabled={isRetrying}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs ${isDegraded
                      ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 animate-pulse'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                  >
                    {isRetrying ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <RotateCw className="w-3 h-3" />
                        <span>{isDegraded ? 'Thử Lại Task Lỗi' : 'Kích Hoạt Lại'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: LIVE WORKER EXECUTION TERMINAL */}
      <section id="section-live-terminal" className="space-y-2.5">
        <div className="bg-[#0B1120] rounded-2xl border border-slate-800 shadow-xl overflow-hidden transition-all">
          {/* Terminal Header Bar */}
          <div className="px-4 py-3 bg-[#131E32] border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-slate-200 font-mono text-sm font-semibold">
                <TerminalIcon className="w-4 h-4 text-emerald-400" />
                <span>Live Execution Terminal</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Real-time Stream</span>
              </div>

              {searchQuery && (
                <div className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-950/80 text-indigo-300 border border-indigo-700/80 rounded-md text-[11px] font-mono">
                  <Filter className="w-3 h-3" />
                  <span>Đang lọc: #{searchQuery}</span>
                  <button onClick={() => setSearchQuery('')} className="hover:text-white ml-1">×</button>
                </div>
              )}
            </div>

            {/* Terminal Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Lọc mã Task (VD: 7a057e0b)..."
                  className="w-48 sm:w-60 pl-8 pr-3 py-1 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsStreaming(!isStreaming)}
                className={`p-1.5 rounded-xl border text-xs font-mono transition-colors cursor-pointer ${isStreaming
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                title={isStreaming ? 'Tạm dừng luồng log' : 'Tiếp tục luồng log'}
              >
                {isStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2.5 py-1 rounded-xl border text-xs font-mono transition-colors inline-flex items-center gap-1.5 cursor-pointer ${autoScroll
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                title="Tự động cuộn khi có log mới"
              >
                <span>Auto-scroll</span>
                <span className="text-[10px] font-bold">{autoScroll ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLogs}
                className="p-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Sao chép toàn bộ logs"
              >
                {copiedLogs ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy</span>
              </button>

              <button
                type="button"
                onClick={handleClearLogs}
                className="p-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700 text-xs font-mono inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Xóa sạch nhật ký"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Terminal Logs Output Viewport */}
          <div
            id="terminal-logs-viewport"
            className="p-4 sm:p-5 font-mono text-xs sm:text-[12px] leading-relaxed max-h-[400px] overflow-y-auto space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-slate-500 py-8 text-center italic">
                Không tìm thấy dòng nhật ký nào khớp với bộ lọc &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredLogs.map((log, index) => {
                const { taskId, cleanMsg } = parseLogLineDetails(log);

                // 🟢 Ép kiểu String để TypeScript không báo lỗi No Overlap ts(2367)
                const lvl = String(log.level || '').toUpperCase();
                const isError = lvl === 'ERROR' || lvl.includes('CRITICAL') || lvl.includes('ERR');
                const isSuccess = lvl === 'SUCCESS' || cleanMsg.toLowerCase().includes('success') || cleanMsg.includes('hoàn thành');
                const isApproval = lvl.includes('APPROVAL');
                const isRetry = lvl === 'RETRY' || lvl.includes('WARN');

                return (
                  <div
                    key={index}
                    className="flex flex-wrap items-start gap-x-2 gap-y-1 hover:bg-slate-800/40 px-2 py-1 rounded transition-colors"
                  >
                    {/* Timestamp */}
                    <span className="text-slate-500 shrink-0 font-medium">
                      [{log.timestamp}]
                    </span>

                    {/* Level Tag */}
                    <span
                      className={`font-semibold shrink-0 px-1.5 py-0.2 rounded text-[11px] ${isError
                        ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                        : isSuccess
                          ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-bold'
                          : isApproval
                            ? 'text-indigo-300 bg-indigo-500/10 border border-indigo-500/20'
                            : isRetry
                              ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                              : 'text-sky-300 bg-sky-500/10'
                        }`}
                    >
                      [{log.level}]
                    </span>

                    {/* Worker Tag */}
                    <span className="text-violet-300 shrink-0 font-medium">
                      [{log.worker}]
                    </span>

                    {/* Task ID Tag (1-Click Filterable) */}
                    {taskId && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery(taskId)}
                        className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[11px] font-mono font-bold bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 transition cursor-pointer"
                        title={`Bấm để lọc toàn bộ log của Task #${taskId}`}
                      >
                        <Tag className="w-2.5 h-2.5" />
                        <span>#{taskId}</span>
                      </button>
                    )}

                    {/* Message Content */}
                    <span
                      className={`flex-1 break-all ${isError
                        ? 'text-rose-300 font-medium'
                        : isSuccess
                          ? 'text-emerald-300'
                          : isApproval
                            ? 'text-indigo-200'
                            : cleanMsg.includes('queued with status') || cleanMsg.includes('approved')
                              ? 'text-indigo-300'
                              : 'text-slate-200'
                        }`}
                    >
                      {cleanMsg}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </section>
    </div>
  );
};