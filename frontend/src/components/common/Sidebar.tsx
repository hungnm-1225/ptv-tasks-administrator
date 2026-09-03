// frontend/src/components/common/Sidebar.tsx
import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Kanban,
  Inbox,
  Zap,
  CheckSquare,
  BookOpen,
  GitBranch,
  Bot,
  FileSpreadsheet,
  Activity,
  ChevronRight,
  X,
} from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface MenuItem {
  to: string;
  label: string;
  icon: React.ElementType;
  isMain?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const menuItems: MenuItem[] = [
    { to: '/dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { to: '/board', label: 'Work Board', icon: Kanban, isMain: true },
    { to: '/inbox', label: 'Unified Inbox Feed', icon: Inbox },
    { to: '/studio', label: 'Automation Studio', icon: Zap },
    { to: '/tasks', label: 'Task & Approval Hub', icon: CheckSquare },
    { to: '/courses', label: 'Courses Management', icon: BookOpen },
    { to: '/github', label: 'GitHub Dispatcher', icon: GitBranch },
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
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs lg:hidden transition-opacity duration-300 animate-in fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container — Bento Rail with Glassmorphism */}
      <aside
        id="app-sidebar"
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-auto w-72 lg:w-64 border-r border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col justify-between h-screen shrink-0 select-none transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Brand Header */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 shrink-0">
            <Link
              to="/"
              onClick={handleLinkClick}
              className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            >
              <div className="relative">
                <img src="/logo.png" alt="Pythaverse Logo" className="w-8 h-8 rounded-xl shadow-xs" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse"></span>
              </div>
              <div>
                <h1 className="font-bold text-slate-900 dark:text-white text-sm tracking-tight flex items-center gap-1.5">
                  <span>Pythaverse</span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 rounded-md">
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

          {/* Navigation Category Label */}
          <div className="px-6 pt-4 pb-1.5 shrink-0">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              Workspace Modules
            </span>
          </div>

          {/* Menu Items List */}
          <nav className="flex-1 px-3.5 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleLinkClick}
                  className={({ isActive }) =>
                    `w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 group cursor-pointer ${isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-3 truncate">
                        <Icon
                          size={16}
                          className={`shrink-0 transition-colors ${isActive
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                            }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.isMain && !isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      )}

                      {isActive && (
                        <ChevronRight size={13} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
};