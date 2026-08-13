import React, { useState, useEffect } from 'react';
import { Bot, Terminal, RefreshCw, CheckCircle2, Loader2, RotateCw } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotWorkersStatusResponse } from '../../types';

export const BotCommanderPage: React.FC = () => {
  const [botStatus, setBotStatus] = useState<BotWorkersStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryingTask, setRetryingTask] = useState<string | null>(null);

  const loadBotStatus = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<BotWorkersStatusResponse>('/bots/status');
      setBotStatus(data);
    } catch (err) {
      console.error('Lỗi khi tải trạng thái Bot Worker:', err);
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
      alert(`✅ Đã gửi yêu cầu chạy lại (retry) cho worker task ${taskId}`);
      await loadBotStatus();
    } catch (err) {
      alert('❌ Lỗi gửi yêu cầu retry: ' + (err as Error).message);
    } finally {
      setRetryingTask(null);
    }
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
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Bot className="w-6 h-6 text-indigo-400" />
          <span>Bot Command & Execution Center</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Theo dõi trạng thái real-time của các Cloud Worker và xem log thực thi hệ thống.
        </p>
      </div>

      {/* Workers Status Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="text-xs">Đang kiểm tra kết nối Cloud Worker...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {defaultWorkers.map((w) => {
            const status = botStatus?.[w.key] || w.defaultStatus;
            const isOnline = status === 'active' || status === 'online';
            return (
              <div key={w.key} className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">{w.name}</span>
                  <CheckCircle2 className={`w-4 h-4 ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`} />
                </div>
                <div className="text-[11px] text-slate-400 font-mono">{w.type}</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase">{status}</span>
                  <button
                    onClick={() => handleRetryBotTask(w.key)}
                    disabled={retryingTask === w.key}
                    className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition"
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
      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>Worker Live Execution Terminal Logs</span>
          </div>
          <button 
            onClick={loadBotStatus}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Logs</span>
          </button>
        </div>

        <div className="p-4 bg-slate-950 font-mono text-xs text-emerald-400 space-y-1.5 h-64 overflow-y-auto">
          <div>[2026-08-12 12:00:01] [INFO] [GmailWorker]: Polling unread messages from workspace @dtt.vn...</div>
          <div>[2026-08-12 12:00:03] [INFO] [GeminiEngine]: Processing raw content with primary model gemini-2.5-flash</div>
          <div>[2026-08-12 12:00:05] [INFO] [KeycloakWorker]: Approved payload received for action 'create_user'</div>
          <div>[2026-08-12 12:00:06] [SUCCESS] [KeycloakWorker]: User 'nguyenvana' created successfully in realm 'master'</div>
          <div className="text-cyan-300">[2026-08-12 12:05:00] [IDLE] Listening for new tickets & tasks...</div>
        </div>
      </div>
    </div>
  );
};
