import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  Github,
  Bot,
  FileSpreadsheet,
  Send,
  Zap,
  Home,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const menuItems = [
    { to: '/dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { to: '/inbox', label: 'Unified Inbox Feed', icon: Inbox },
    { to: '/tasks', label: 'Task & Approval Hub', icon: CheckSquare },
    { to: '/github', label: 'GitHub Dispatcher', icon: Github },
    { to: '/bots', label: 'Bot Execution Center', icon: Bot },
    { to: '/reports', label: 'Analytics & XLSX Export', icon: FileSpreadsheet },
    { to: '/telegram', label: 'Telegram Mini App', icon: Send },
  ];

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-[#0d1322] flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none">
      <div>
        {/* Brand Header */}
        <Link 
          to="/"
          className="h-16 px-5 flex items-center gap-3 border-b border-slate-800/80 hover:bg-slate-800/30 transition-colors"
        >
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-300 shadow-sm">
            <Zap className="w-4 h-4 fill-current" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-sm tracking-tight">Pythaverse Admin</h1>
            <p className="text-[10px] text-purple-300/80 font-semibold tracking-wider uppercase">Automation Hub</p>
          </div>
        </Link>

        {/* Navigation Menu */}
        <nav className="p-3.5 space-y-1">
          <Link
            to="/"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all mb-3 border border-transparent hover:border-slate-800/60"
          >
            <Home className="w-4 h-4 text-sky-400" />
            <span>Trang Chủ (Landing)</span>
          </Link>

          <div className="text-[10px] font-semibold text-slate-400 uppercase px-3 pt-2 pb-1.5 tracking-wider">
            Admin Modules
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-purple-500/10 border border-purple-500/25 text-purple-200 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-purple-300' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800/80 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-400">PTV Admin</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">v1.0.0</span>
        </div>
        <div className="text-[10px] text-slate-400 mt-1">Enterprise Automation SaaS</div>
      </div>
    </aside>
  );
};
