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
  Activity,
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
    { to: '/monitor', label: 'Site Health Monitor', icon: Activity },
  ];

  return (
    <aside className="w-64 border-r border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none transition-colors duration-200">
      <div>
        {/* Brand Header */}
        <Link
          to="/"
          className="h-16 px-5 flex items-center gap-3 border-b border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <img src="/logo.png" alt="Pythaverse Logo" className="w-8 h-8 rounded-xl" />
          <div>
            <h1 className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight">Pythaverse Admin</h1>
            <p className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold tracking-wider uppercase">Automation Hub</p>
          </div>
        </Link>

        {/* Navigation Menu */}
        <nav className="p-3.5 space-y-1">

          <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase px-3 pt-2 pb-1.5 tracking-wider">
            Admin Modules
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${isActive
                    ? 'bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50 border border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-violet-600 dark:text-violet-300' : 'text-slate-400 dark:text-slate-400'}`} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-700 dark:text-slate-300">PTV Admin</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 font-mono">v1.0.0</span>
        </div>
        <div className="text-[10px] text-slate-400 dark:text-slate-400 mt-1">Enterprise Automation SaaS</div>
      </div>
    </aside>
  );
};
