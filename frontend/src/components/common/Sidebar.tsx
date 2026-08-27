// frontend/src/components/common/Sidebar.tsx
import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  Zap,
  CheckSquare,
  Github,
  Bot,
  FileSpreadsheet,
  Activity,
  X,
  BookOpen,
  Trello
} from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const menuItems = [
    { to: '/dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { to: '/board', label: 'Work Board', icon: Trello },
    { to: '/inbox', label: 'Unified Inbox Feed', icon: Inbox },
    { to: '/studio', label: 'Automation Studio', icon: Zap },
    { to: '/tasks', label: 'Task & Approval Hub', icon: CheckSquare },
    { to: '/courses', label: 'Courses Management', icon: BookOpen },
    { to: '/github', label: 'GitHub Dispatcher', icon: Github },
    { to: '/bots', label: 'Bot Execution Center', icon: Bot },
    { to: '/reports', label: 'Analytics & XLSX Export', icon: FileSpreadsheet },
    { to: '/monitor', label: 'Site Health Monitor', icon: Activity },
  ];

  const handleLinkClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs lg:hidden transition-opacity duration-300 animate-in fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container — Enterprise Bento Rail with Glassmorphism */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-auto w-72 lg:w-64 border-r border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col justify-between h-screen shrink-0 select-none transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          {/* Brand Header */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80">
            <Link
              to="/"
              onClick={handleLinkClick}
              className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            >
              <div className="relative">
                <img src="/logo.png" alt="Pythaverse Logo" className="w-8 h-8 rounded-xl shadow-xs" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900"></span>
              </div>
              <div>
                <h1 className="font-bold text-slate-900 dark:text-white text-sm tracking-tight flex items-center gap-1.5">
                  <span>Pythaverse</span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50 rounded-md">
                    Admin
                  </span>
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold tracking-wider uppercase">
                  Automation Hub
                </p>
              </div>
            </Link>

            {/* Mobile Close Button */}
            <button
              onClick={onClose}
              aria-label="Close sidebar"
              className="lg:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="p-3.5 space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase px-3 pt-2 pb-1.5 tracking-wider flex items-center justify-between">
              <span>Admin Modules</span>
            </div>

            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleLinkClick}
                  className={({ isActive }) =>
                    `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold border-l-2 border-slate-900 dark:border-sky-400 shadow-xs pl-2.5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-[18px] h-[18px] transition-colors ${
                          isActive
                            ? 'text-slate-900 dark:text-sky-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer Info — version + status */}
        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-300">PTV Tasks Admin</span>
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-700 dark:text-slate-300 font-mono font-bold">
              v2.0.0
            </span>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>Enterprise Automation SaaS</span>
          </div>
        </div>
      </aside>
    </>
  );
};
