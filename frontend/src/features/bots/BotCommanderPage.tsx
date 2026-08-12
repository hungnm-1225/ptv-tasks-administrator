import React from 'react';
import { Bot, Terminal, RefreshCw, CheckCircle2 } from 'lucide-react';

export const BotCommanderPage: React.FC = () => {
  const workers = [
    { name: 'Gmail Sync Worker', type: 'cron_listener', status: 'online', lastRun: '2 phút trước' },
    { name: 'Keycloak REST Worker', type: 'api_executor', status: 'online', lastRun: '5 phút trước' },
    { name: 'LMS Playwright Worker', type: 'headless_browser', status: 'online', lastRun: '12 phút trước' },
    { name: 'GitHub Issue Dispatcher', type: 'rest_client', status: 'online', lastRun: '1 giờ trước' },
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {workers.map((worker, idx) => (
          <div key={idx} className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">{worker.name}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-[11px] text-slate-400 font-mono">{worker.type}</div>
            <div className="text-[10px] text-slate-500">Chạy gần nhất: {worker.lastRun}</div>
          </div>
        ))}
      </div>

      {/* Execution Terminal Console */}
      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>Worker Live Execution Terminal Logs</span>
          </div>
          <button className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">
            <RefreshCw className="w-3 h-3" />
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
