import React from 'react';
import { Bell, Search, ShieldCheck, User } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Search Input */}
      <div className="flex items-center gap-3 w-96 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-sm">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm kiếm ticket, tác vụ bot, email..."
          className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 w-full"
        />
      </div>

      {/* Right User & Controls */}
      <div className="flex items-center gap-4">
        {/* Domain Whitelist Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-full">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Verified @dtt.vn</span>
        </div>

        {/* Notifications */}
        <button className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition">
          <Bell className="w-5 h-5" />
        </button>

        {/* Profile */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-sm font-semibold text-slate-200">Admin User</div>
            <div className="text-xs text-slate-500">admin@dtt.vn</div>
          </div>
        </div>
      </div>
    </header>
  );
};
