// frontend/src/features/bots/BotCommanderPage.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Terminal,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCw,
  Copy,
  Trash2,
  Search,
  ArrowDownCircle,
  ShieldCheck,
  Cpu,
  Zap,
  Mail,
  LifeBuoy,
  FileSpreadsheet,
  Database,
  KeyRound,
  GraduationCap,
  GitPullRequest,
  Boxes,
  Sparkles
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

// ⚡ TRỢ THỦ PERSISTENT STORAGE (LƯU LOCALSTORAGE - 0MS INSTANT RENDER)
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
    cronInterval: 'Chu kỳ 5 phút',
    syncType: 'gmail',
    icon: Mail,
    badgeClass: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/50',
    iconClass: 'text-sky-600 dark:text-sky-400'
  },
  {
    key: 'osticket_sync_worker',
    name: 'OS Ticket Support Scraper',
    description: 'Cào vé mở từ helpdesk support.pythaverse.space qua Playwright',
    cronInterval: 'Chu kỳ 5 phút',
    syncType: 'osticket',
    icon: LifeBuoy,
    badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/50',
    iconClass: 'text-amber-600 dark:text-amber-400'
  },
  {
    key: 'feedback_sheet_worker',
    name: 'Google Form Feedback Sync',
    description: 'Quét phản hồi từ Google Sheets & đồng bộ trạng thái Assigned',
    cronInterval: 'Chu kỳ 5 phút',
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
  // ⚡ KHỞI TẠO STATE NGAY TỪ LOCALSTORAGE (0MS)
  const initialStatus = useMemo(() => getBotLocalCache<Record<string, { status: string; failed_count: number }>>('workers_status'), []);
  const initialLogs = useMemo(() => getBotLocalCache<BotTerminalLog[]>('terminal_logs') || [], []);

  const [botStatus, setBotStatus] = useState<Record<string, { status: string; failed_count: number }> | null>(initialStatus);
  const [logs, setLogs] = useState<BotTerminalLog[]>(initialLogs);
  const [loading, setLoading] = useState<boolean>(!initialStatus);

  const [syncingType, setSyncingType] = useState<string | null>(null);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [purgingRam, setPurgingRam] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // ⚡ SWR TẢI DỮ LIỆU BOT & LOGS (KHÔNG BẬT SPINNER NẾU ĐÃ CÓ CACHE)
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
    const interval = setInterval(() => {
      loadBotData();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadBotData]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // ⚡ Ép quét ngay lập tức
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

  // 🔄 Chạy lại các task lỗi của Worker
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

  // 🧹 Dọn dẹp bộ nhớ RAM (Garbage Collection)
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
    toast.success('Đã sao chép toàn bộ nhật ký log vào clipboard!');
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
    toast.info('Đã xóa màn hình console');
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(l =>
      (l.raw_line || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.worker || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.message || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [logs, searchQuery]);

  // 🟢 Hàm lấy màu sắc log
  const getLogColorClass = (level: string) => {
    switch (level) {
      case 'SUCCESS':
        return 'text-emerald-400 font-medium';
      case 'ERROR':
        return 'text-rose-400 font-semibold';
      case 'SSO_SEEDING':
        return 'text-indigo-400 font-medium';
      case 'RETRY':
        return 'text-amber-400 font-medium';
      case 'CRON':
        return 'text-sky-400';
      default:
        return 'text-slate-300';
    }
  };

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
          {/* Badge Human in the loop */}
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 text-xs font-semibold shadow-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>Human-in-the-Loop Active</span>
          </span>

          {/* Dọn dẹp RAM */}
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

          {/* Làm mới dữ liệu */}
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

      {/* SECTION 1: INGESTION PIPELINES (BỘ THU THẬP DỮ LIỆU) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              1. Bộ Thu Thập Dữ Liệu Đa Kênh (Ingestion Crons)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Hệ thống quét tự động ngầm — Bấm nút để ép quét ngay lập tức</span>
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
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    {p.cronInterval}
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

      {/* SECTION 2: AUTOMATION EXECUTION ENGINES (CỖ MÁY THỰC THI TỰ ĐỘNG) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              2. Cỗ Máy Thực Thi Tự Động (Automation Execution Engines)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Tiếp nhận và thực thi các tác vụ sau khi được Quản trị viên duyệt</span>
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
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    {w.engineType}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleRetryWorker(w.key, w.name)}
                    disabled={isRetrying}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs ${isDegraded
                      ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 animate-pulse'
                      : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50'
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

      {/* SECTION 3: LIVE TERMINAL CONSOLE */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        {/* Terminal Header */}
        <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-white">Live Worker Execution Terminal</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Real-time Stream
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Lọc logs theo từ khóa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-36 sm:w-56 transition"
              />
            </div>

            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${autoScroll ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              title="Tự động cuộn theo log mới"
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Auto-scroll</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
              title="Sao chép toàn bộ logs"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Copy</span>
            </button>

            <button
              type="button"
              onClick={handleClearLogs}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
              title="Xóa màn hình"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="p-4 bg-slate-950 font-mono text-xs space-y-1.5 h-80 overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-500 italic py-10 text-center">Không tìm thấy dòng nhật ký nào phù hợp.</div>
          ) : (
            filteredLogs.map((log, index) => (
              <div key={index} className={`flex items-start gap-2 hover:bg-slate-900/60 px-1.5 py-0.5 rounded transition ${getLogColorClass(log.level)}`}>
                <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                <span className="shrink-0 font-bold">[{log.level}]</span>
                <span className="text-indigo-400 shrink-0">[{log.worker}]:</span>
                <span className="break-all">{log.message}</span>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};
