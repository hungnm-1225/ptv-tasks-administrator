import React from 'react';
import { Send, CheckCircle2, ShieldCheck } from 'lucide-react';

export const TelegramAppPage: React.FC = () => {
  return (
    <div className="space-y-4 max-w-sm mx-auto">
      {/* Mobile Telegram Mini App Container */}
      <div className="border border-slate-800 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl">
        {/* Telegram Header Bar */}
        <div className="bg-sky-600 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            <div>
              <h3 className="font-bold text-sm">Pythaverse Admin Bot</h3>
              <p className="text-[10px] text-sky-200">Telegram Mini App View</p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-sky-700 text-[10px] font-bold rounded-full">v1.0</span>
        </div>

        {/* Mini App Content */}
        <div className="p-4 space-y-4">
          <div className="glass-card p-3 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-cyan-400">#TASK-8902</span>
              <span className="text-[10px] text-amber-400 font-semibold">Cần Phê Duyệt</span>
            </div>
            <p className="text-xs text-slate-300">Reset mật khẩu Keycloak cho người dùng nguyenvana@dtt.vn</p>
            <button className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition flex items-center justify-center gap-1.5 shadow-md">
              <CheckCircle2 className="w-4 h-4" />
              <span>Phê Duyệt Nhanh Trên Mobile</span>
            </button>
          </div>

          <div className="text-center text-[10px] text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Tích hợp Haptic Feedback SDK & OAuth Guard</span>
          </div>
        </div>
      </div>
    </div>
  );
};
