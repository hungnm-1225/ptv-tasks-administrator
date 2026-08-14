import React, { useState, useEffect } from 'react';
import { Bot, Terminal, RefreshCw, CheckCircle2, Loader2, RotateCw, Copy, Trash2 } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotWorkersStatusResponse } from '../../types';
import { toast } from 'sonner';

export const BotCommanderPage: React.FC = () => {
  const [botStatus, setBotStatus] = useState<BotWorkersStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryingTask, setRetryingTask] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    '[2026-08-14 12:00:01] [INFO] [GmailWorker]: Polling unread messages from workspace @dtt.vn...',
    '[2026-08-14 12:00:03] [INFO] [GeminiEngine]: Processing raw content with primary model gemini-2.5-flash',
    '[2026-08-14 12:00:05] [INFO] [KeycloakWorker]: Approved payload received for action \'create_user\'',
    '[2026-08-14 12:00:06] [SUCCESS] [KeycloakWorker]: User \'nguyenvana\' created successfully in realm \'master\'',
    '[2026-08-14 12:05:00] [IDLE] Listening for new tickets & tasks...',
  ]);

  const loadBotStatus = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<BotWorkersStatusResponse>('/bots/status');
      setBotStatus(data);
    } catch (err) {
      console.error('Lỗi khi tải trạng thái Bot Worker:', err);
      toast.error('Không thể kiểm tra trạng thái Bot Worker: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBotStatus();
  }, []);

  const handleRetryBotTask = async (taskId: string) => {
    setRetryingTask(taskId);
    try {
      await fetchApi(`/bots/${taskId}/retry`, { method: 'POST' });
      toast.success(`Đã gửi yêu cầu chạy lại (retry) cho worker task [${taskId}]`);
      setLogs((prev) => [
        `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [RETRY] Triggered manual retry for ${taskId}`,
        ...prev,
      ]);
      await loadBotStatus();
    } catch (err) {
      toast.error('Lỗi gửi yêu cầu retry: ' + (err as Error).message);
    } finally {
      setRetryingTask(null);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    toast.success('Đã sao chép toàn bộ nhật ký log vào bộ nhớ tạm!');
  };

  const handleClearLogs = () => {
    setLogs([`[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [CONSOLE] Terminal cleared`]);
    toast.info('Đã xóa màn hình console');
  };

  const defaultWorkers = [
    { key: 'gmail_sync_worker', name: 'Gmail Sync Worker', type: 'cron_listener', defaultStatus: 'active' },
    { key: 'keycloak_api_worker', name: 'Keycloak REST Worker', type: 'api_executor', defaultStatus: 'active' },
    { key: 'lms_playwright_worker', name: 'LMS Playwright Worker', type: 'headless_browser', defaultStatus: 'active' },
    { key: 'github_dispatcher', name: 'GitHub Issue Dispatcher', type: 'rest_client', defaultStatus: 'active' },
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2.5 tracking-tight">
          <Bot className="w-5 h-5 text-purple-300" />
          <span>Bot Command & Execution Center</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Theo dõi trạng thái real-time của các Cloud Worker và xem log thực thi hệ thống.
        </p>
      </div>

      {/* Workers Status Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          <span className="text-xs text-slate-400">Đang kiểm tra kết nối Cloud Worker...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {defaultWorkers.map((w) => {
            const status = botStatus?.[w.key] || w.defaultStatus;
            const isOnline = status === 'active' || status === 'online';
            return (
              <div key={w.key} className="surface-card p-4 rounded-2xl border border-slate-800/80 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">{w.name}</span>
                  <CheckCircle2 className={`w-4 h-4 ${isOnline ? 'text-emerald-300' : 'text-amber-300'}`} />
                </div>
                <div className="text-[11px] text-slate-400 font-mono">{w.type}</div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span className="text-[10px] text-emerald-300 font-semibold uppercase">{status}</span>
                  <button
                    onClick={() => handleRetryBotTask(w.key)}
                    disabled={retryingTask === w.key}
                    className="flex items-center gap-1 text-[10px] text-purple-300 hover:text-purple-200 transition font-medium"
                  >
                    {retryingTask === w.key ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <RotateCw className="w-3 h-3" />
                        <span>Retry</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Execution Terminal Console */}
      <div className="surface-card rounded-2xl border border-slate-800/80 overflow-hidden shadow-sm">
        <div className="bg-[#0b0f19] px-4 py-3 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Terminal className="w-4 h-4 text-purple-300" />
            <span>Worker Live Execution Terminal Logs</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#131b2e] hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] text-slate-300 transition"
              title="Sao chép toàn bộ logs"
            >
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </button>
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#131b2e] hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] text-slate-300 transition"
              title="Xóa màn hình console"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
            <button 
              onClick={loadBotStatus}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#131b2e] hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] text-slate-300 transition"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="p-4 bg-[#0b0f19] font-mono text-xs text-emerald-300/90 space-y-1.5 h-64 overflow-y-auto leading-relaxed">
          {logs.map((log, index) => (
            <div key={index} className={log.includes('RETRY') ? 'text-amber-200' : log.includes('SUCCESS') ? 'text-emerald-300' : 'text-slate-300'}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
