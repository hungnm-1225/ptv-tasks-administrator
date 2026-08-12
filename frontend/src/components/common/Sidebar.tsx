import React from 'react';
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  Github,
  Bot,
  FileSpreadsheet,
  Send,
  Zap,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: 'unified-inbox', label: 'Unified Inbox Feed', icon: Inbox },
    { id: 'task-management', label: 'Task & Approval Hub', icon: CheckSquare },
    { id: 'github-reporter', label: 'GitHub Issue Dispatcher', icon: Github },
    { id: 'bot-commander', label: 'Bot Execution Center', icon: Bot },
    { id: 'reports-export', label: 'Analytics & XLSX Export', icon: FileSpreadsheet },
    { id: 'telegram-app', label: 'Telegram Mini App', icon: Send },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/80 backdrop-blur-xl flex flex-col justify-between h-screen sticky top-0 shrink-0">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-sm tracking-wide">Pythaverse Admin</h1>
            <p className="text-[10px] text-cyan-400 font-semibold tracking-wider uppercase">Automation Hub</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-4 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500">
        <div>Pythaverse Admin v1.0.0</div>
        <div className="text-[10px] text-slate-600 mt-0.5">FastAPI + React 19 + Supabase</div>
      </div>
    </aside>
  );
};
