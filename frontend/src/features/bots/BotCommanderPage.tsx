// frontend/src/features/bots/BotCommanderPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
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
  Layers
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotWorkersStatusResponse, BotTerminalLog } from '../../types';
import { toast } from 'sonner';

interface WorkerConfig {
  key: string;
  name: string;
  description: string;
  type: string;
  iconColor: string;
}

const WORKERS_LIST: WorkerConfig[] = [
  {
    key: 'gmail_sync_worker',
    name: 'Gmail Sync Worker',
    description: 'Quét mail chưa đọc @dtt.vn & tách file đính kèm',
    type: 'cron_listener (3m)',
    iconColor: 'text-sky-500'
  },
  {
    key: 'keycloak_api_worker',
    name: 'Keycloak Identity Bot',
    description: 'Reset password, verify & quản trị tài khoản',
    type: 'rest_executor',
    iconColor: 'text-violet-500'
  },
  {
    key: 'workspace_license_worker',
    name: 'Workspace License RPA',
    description: 'Bulk User .xlsx, duyệt Order & cấp Contract',
    type: 'playwright_rpa',
    iconColor: 'text-amber-500'
  },
  {
    key: 'lms_git_worker',
    name: 'LMS & Git Provisioning',
    description: 'Ghi danh khóa học, SSO Seeding & add repo',
    type: 'hybrid_automator',
    iconColor: 'text-emerald-500'
  },
  {
    key: 'google_doc_triage',
    name: 'Feedback Doc Triage',
    description: 'Quét Form Sheet, @mention Doc & gán nhân sự',
    type: 'gemini_drive_api',
    iconColor: 'text-rose-500'
  },
  {
    key: 'github_dispatcher',
    name: 'GitHub Issue Dispatcher',
    description: 'Tạo Bug Issue Markdown vào Private Repo',
    type: 'github_rest_api',
    iconColor: 'text-purple-500'
  },
];

export const BotCommanderPage: React.FC = () => {
  const [botStatus, setBotStatus] = useState<BotWorkersStatusResponse | null>(null);
  const [logs, setLogs] = useState<BotTerminalLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const loadBotData = async (showToast = false) => {
    try {
      const [statusData, logsData] = await Promise.all([
        fetchApi<BotWorkersStatusResponse>('/bots/status'),
        fetchApi<BotTerminalLog[]>('/bots/logs')
      ]);
      setBotStatus(statusData);
      setLogs(logsData);
      if (showToast) toast.success('Đã đồng bộ trạng thái Workers & Logs!');
    } catch (err) {
      console.error('Lỗi khi nạp dữ liệu Bot Commander:', err);
      if (showToast) toast.error('Không thể kiểm tra Bot: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBotData();
    // Tự động làm mới log mỗi 15 giây
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

  const handleRetryWorker = async (workerKey: string) => {
    setRetryingKey(workerKey);
    try {
      const res = await fetchApi<{ message?: string }>(`/bots/${workerKey}/retry`, { method: 'POST' });
      toast.success(res?.message || `Đã gửi tín hiệu khởi động lại cho [${workerKey}]`);
      await loadBotData();
    } catch (err) {
      toast.error('Lỗi gửi tín hiệu retry: ' + (err as Error).message);
    } finally {
      setRetryingKey(null);
    }
  };

  const handleCopyLogs = () => {
    const textToCopy = logs.map(l => l.raw_line).join('\n');
    navigator.clipboard.writeText(textToCopy);
    toast.success('Đã sao chép toàn bộ nhật ký log vào clipboard!');
  };

  const handleClearLogs = () => {
    setLogs([{
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      level: 'INFO',
      worker: 'Console',
      message: 'Terminal logs cleared locally.',
      raw_line: `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [INFO] [Console]: Terminal cleared.`
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 tracking-tight">
            <Cpu className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <span>Bot Command & Execution Center</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Trung tâm chỉ huy 6 Cloud Workers, giám sát tiến trình và live terminal execution audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Human-in-the-Loop Active</span>
          </span>
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

      {/* 6 Cloud Workers Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {WORKERS_LIST.map((w) => {
          const status = botStatus?.[w.key] || 'active';
          const isOnline = status === 'active' || status === 'online';
          const isDegraded = status === 'degraded';

          return (
            <div
              key={w.key}
              className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between space-y-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold text-slate-900 dark:text-slate-100`}>{w.name}</span>
                  </div>
                  {isOnline ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ONLINE</span>
                    </span>
                  ) : isDegraded ? (
                    <span className="flex items-center gap-1 text-[11px] text-amber-500 font-semibold">
                      <AlertTriangle className="w-4 h-4" />
                      <span>DEGRADED</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold">
                      <span>IDLE</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{w.description}</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-md">
                  {w.type}
                </span>
                <button
                  type="button"
                  onClick={() => handleRetryWorker(w.key)}
                  disabled={retryingKey === w.key}
                  className="flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-semibold transition"
                >
                  {retryingKey === w.key ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Restart / Retry</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution Terminal Console */}
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
                placeholder="Lọc logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 w-36 sm:w-48 transition"
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