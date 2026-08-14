import React from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldCheck, User, LogOut, Home, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const userEmail = user?.email || 'admin@dtt.vn';
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Admin User';
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  return (
    <header className="h-16 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20 transition-colors duration-200">
      {/* Search Input */}
      <div className="flex items-center gap-2.5 w-72 sm:w-96 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs transition-colors focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/20">
        <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Tìm kiếm ticket, email, tác vụ bot..."
          className="bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 w-full text-xs"
        />
      </div>

      {/* Right User & Controls */}
      <div className="flex items-center gap-3">
        {/* Navigation back to Landing Page */}
        <Link
          to="/"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition shadow-xs"
        >
          <Home className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>Trang Chủ</span>
        </Link>

        {/* Domain Whitelist Badge (Soft Sage Mint) */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 text-[11px] font-medium rounded-full transition-colors">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>@dtt.vn</span>
        </div>

        {/* ☀️ / 🌙 THEME TOGGLE BUTTON */}
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Chuyển sang Giao diện Tối' : 'Chuyển sang Giao diện Sáng'}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4 text-slate-700 hover:text-violet-600 transition-colors" />
          ) : (
            <Sun className="w-4 h-4 text-amber-300 hover:text-amber-200 transition-colors" />
          )}
        </button>

        {/* Profile & Logout */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-800">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="w-8 h-8 rounded-full border border-violet-500/30 object-cover shadow-xs" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center font-semibold text-xs">
              <User className="w-4 h-4" />
            </div>
          )}
          <div className="hidden sm:block text-left">
            <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">{userName}</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-400 truncate max-w-[130px]">{userEmail}</div>
          </div>
          {user && (
            <button
              onClick={() => signOut()}
              title="Đăng xuất"
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition ml-0.5"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
