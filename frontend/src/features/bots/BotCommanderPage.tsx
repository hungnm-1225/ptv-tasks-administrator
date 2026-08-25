// frontend/src/features/bots/BotCommanderPage.tsx
import React, { useState, useEffect, useRef } from 'react';
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
  iconColor: string;
}

interface ExecutionWorkerConfig {
  key: string;
  name: string;
  description: string;
  engineType: string;
  icon: React.ElementType;
  iconColor: string;
}

const INGESTION_PIPELINES: IngestionWorkerConfig[] = [
  {
    key: 'gmail_sync_worker',
    name: 'Gmail Workspace Ingestion',
    description: 'Quét thư chưa đọc @dtt.vn, trích xuất tệp COF & đính kèm',
    cronInterval: 'Chu kỳ 5 phút',
    syncType: 'gmail',
    icon: Mail,
    iconColor: 'text-sky-500 bg-sky-500/10 border-sky-500/20'
  },
  {
    key: 'osticket_sync_worker',
    name: 'OS Ticket Support Scraper',
    description: 'Cào vé mở từ helpdesk support.pythaverse.space qua Playwright',
    cronInterval: 'Chu kỳ 5 phút',
    syncType: 'osticket',
    icon: LifeBuoy,
    iconColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20'
  },
  {
    key: 'feedback_sheet_worker',
    name: 'Google Form Feedback Sync',
    description: 'Quét phản hồi từ Google Sheets & đồng bộ trạng thái Assigned',
    cronInterval: 'Chu kỳ 5 phút',
    syncType: 'sheet',
    icon: FileSpreadsheet,
    iconColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
  },
  {
    key: 'distributor_cache_worker',
    name: 'Distributors Cache Scanner',
    description: 'Quét cache Orders & Hợp đồng từ 5 Master Distributors',
    cronInterval: 'Chu kỳ 45 phút',
    syncType: 'distributor_cache',
    icon: Database,
    iconColor: 'text-violet-500 bg-violet-500/10 border-violet-500/20'
  }
];

const EXECUTION_ENGINES: ExecutionWorkerConfig[] = [
  {
    key: 'workspace_license_worker',
    name: 'Workspace License RPA',
    description: 'Tạo đơn, cấp phép 4 cấp, nộp batch user & ghi ngược COF',
    engineType: 'Playwright Chromium',
    icon: Boxes,
    iconColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20'
  },
  {
    key: 'keycloak_api_worker',
    name: 'Keycloak Identity Engine',
    description: 'Đổi mật khẩu tạm thời, kích hoạt tài khoản & xác thực email',
    engineType: '2-Tier Hybrid REST/RPA',
    icon: KeyRound,
    iconColor: 'text-violet-500 bg-violet-500/10 border-violet-500/20'
  },
  {
    key: 'lms_git_worker',
    name: 'LMS PLearn & Git Provisioning',
    description: 'Ghi danh khóa học Moodle theo vai trò & tạo Group lớp',
    engineType: 'Hybrid Automator',
    icon: GraduationCap,
    iconColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
  },
  {
    key: 'github_dispatcher',
    name: 'GitHub Issue Dispatcher',
    description: 'Tạo Bug Issue Markdown vào Private Repo kèm telemetry log',
    engineType: 'GitHub REST API v3',
    icon: GitPullRequest,
    iconColor: 'text-purple-500 bg-purple-500/10 border-purple-500/20'
  }
];

export const BotCommanderPage: React.FC = () => {
  const [botStatus, setBotStatus] = useState<Record<string, { status: string; failed_count: number }> | null>(null);
  const [logs, setLogs] = useState<BotTerminalLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncingType, setSyncingType] = useState<string | null>(null);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [purgingRam, setPurgingRam] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const loadBotData = async (showToast = false) => {
    try {
      const [statusData, logsData] = await Promise.all([
        fetchApi<Record<string, { status: string; failed_count: number }>>('/bots/status'),
        fetchApi<BotTerminalLog[]>('/bots/logs')
      ]);
      setBotStatus(statusData);
      setLogs(logsData);
      if (showToast) toast.success('Đã cập nhật trạng thái Workers & Logs thời gian thực!');
    } catch (err) {
      console.error('Lỗi khi nạp dữ liệu Bot Commander:', err);
      if (showToast) toast.error('Không thể kiểm tra Bot: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBotData();
    const interval = setInterval(() => {
      loadBotData();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

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
      // Đợi 2 giây nạp lại log
      setTimeout(() => loadBotData(), 2000);
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
      setTimeout(() => loadBotData(), 1500);
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
    setLogs([{
      timestamp: nowLocal,
      level: 'INFO',
      worker: 'Console',
      message: 'Terminal logs cleared locally.',
      raw_line: `[${nowLocal}] [INFO] [Console]: Terminal cleared.`
    }]);
    toast.info('Đã xóa màn hình console');
  };

  const filteredLogs = logs.filter(l =>
    l.raw_line.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.worker.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getLogColorClass = (level: string) => {
    switch (level) {
      case 'SUCCESS':
        return 'text-emerald-400 font-medium';
      case 'ERROR':
        return 'text-rose-400 font-semibold';
      case 'SSO_SEEDING':
        return 'text-violet-400 font-medium';
      case 'RETRY':
        return 'text-amber-400 font-medium';
      case 'CRON':
        return 'text-sky-400';
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 tracking-tight">
            <Cpu className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            <span>Bot Command & Execution Center</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Trung tâm chỉ huy toàn diện các luồng Thu thập dữ liệu (Ingestion) và Cỗ máy thực thi tự động (Execution Engines).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Badge Human in the loop */}
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Human-in-the-Loop Active</span>
          </span>

          {/* Dọn dẹp RAM */}
          <button
            type="button"
            onClick={handlePurgeMemory}
            disabled={purgingRam}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 transition shadow-xs"
            title="Kích hoạt Garbage Collector giải phóng RAM máy chủ Render"
          >
            <Sparkles className={`w-3.5 h-3.5 ${purgingRam ? 'animate-spin' : ''}`} />
            <span>{purgingRam ? 'Đang dọn RAM...' : 'Dọn RAM (512MB)'}</span>
          </button>

          {/* Làm mới dữ liệu */}
          <button
            type="button"
            onClick={() => loadBotData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 transition shadow-xs"
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
            <Zap className="w-4 h-4 text-sky-500" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              1. Bộ Thu Thập Dữ Liệu Đa Kênh (Ingestion Crons)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Hệ thống quét tự động ngầm — Bấm nút để ép quét ngay lập tức</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {INGESTION_PIPELINES.map((p) => {
            const IconComp = p.icon;
            const isSyncing = syncingType === p.syncType;

            return (
              <div
                key={p.key}
                className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between space-y-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl border ${p.iconColor}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{p.name}</span>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>ONLINE</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">{p.description}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-md">
                    {p.cronInterval}
                  </span>

                  {/* Nút ÉP QUÉT NGAY */}
                  <button
                    type="button"
                    onClick={() => handleForceSync(p.syncType, p.name)}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/10 dark:hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 rounded-lg text-[11px] font-semibold transition"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Đang quét...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3 h-3 text-sky-500 fill-sky-500" />
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
            <Boxes className="w-4 h-4 text-violet-500" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              2. Cỗ Máy Thực Thi Tự Động (Automation Execution Engines)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Tiếp nhận và thực thi các tác vụ sau khi được Quản trị viên duyệt</span>
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
                className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between space-y-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl border ${w.iconColor}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{w.name}</span>
                    </div>
                    {isDegraded ? (
                      <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/20">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{statusInfo.failed_count} LỖI</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>READY</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">{w.description}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-md">
                    {w.engineType}
                  </span>

                  {/* Nút CHẠY LẠI TASK LỖI */}
                  <button
                    type="button"
                    onClick={() => handleRetryWorker(w.key, w.name)}
                    disabled={isRetrying}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${isDegraded
                        ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 animate-pulse'
                        : 'bg-violet-50 hover:bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30'
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
      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        {/* Terminal Header */}
        <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Terminal className="w-4 h-4 text-violet-400" />
            <span className="font-semibold text-slate-100">Live Worker Execution Terminal</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Real-time Stream</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Lọc logs theo từ khóa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 w-36 sm:w-56 transition"
              />
            </div>

            {/* Auto scroll toggle */}
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${autoScroll ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              title="Tự động cuộn theo log mới"
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Auto-scroll</span>
            </button>

            {/* Copy */}
            <button
              type="button"
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] text-slate-300 transition"
              title="Sao chép toàn bộ logs"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Copy</span>
            </button>

            {/* Clear */}
            <button
              type="button"
              onClick={handleClearLogs}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] text-slate-300 transition"
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
                <span className="text-sky-400/90 shrink-0">[{log.worker}]:</span>
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