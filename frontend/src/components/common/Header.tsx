import React from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldCheck, User, LogOut, Home } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();

  const userEmail = user?.email || 'admin@dtt.vn';
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Admin User';
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#0d1322]/90 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Search Input */}
      <div className="flex items-center gap-2.5 w-80 sm:w-96 bg-[#131b2e] border border-slate-800/80 rounded-xl px-3.5 py-2 text-xs transition-colors focus-within:border-purple-500/40 focus-within:ring-1 focus-within:ring-purple-500/20">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Tìm kiếm ticket, email, tác vụ bot..."
          className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-400 w-full text-xs"
        />
      </div>

      {/* Right User & Controls */}
      <div className="flex items-center gap-3">
        {/* Navigation back to Landing Page */}
        <Link
          to="/"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#131b2e] border border-slate-800/80 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-medium rounded-xl transition shadow-sm"
        >
          <Home className="w-3.5 h-3.5 text-sky-300" />
          <span>Trang Chủ</span>
        </Link>

        {/* Domain Whitelist Badge (Soft Sage) */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-medium rounded-full">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>@dtt.vn</span>
        </div>

        {/* Profile & Logout */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-800/80">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="w-8 h-8 rounded-full border border-purple-500/30 object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 font-semibold text-xs">
              <User className="w-4 h-4" />
            </div>
          )}
          <div className="hidden sm:block text-left">
            <div className="text-xs font-medium text-slate-200 truncate max-w-[120px]">{userName}</div>
            <div className="text-[10px] text-slate-400 truncate max-w-[130px]">{userEmail}</div>
          </div>
          {user && (
            <button
              onClick={() => signOut()}
              title="Đăng xuất"
              className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition ml-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
