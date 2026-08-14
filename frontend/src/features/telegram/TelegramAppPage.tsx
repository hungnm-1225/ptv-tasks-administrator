import React from 'react';
import { Send, CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export const TelegramAppPage: React.FC = () => {
  const handleMobileApprove = () => {
    toast.success('Đã gửi phê duyệt nhanh tác vụ #TASK-8902 qua Telegram Mini App SDK!');
  };

  return (
    <div className="space-y-4 max-w-sm mx-auto">
      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">Telegram Mini App Simulator</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Giao diện điều khiển tối ưu hóa cho ứng dụng Telegram di động</p>
      </div>

      {/* Mobile Telegram Mini App Container */}
      <div className="border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl">
        {/* Telegram Header Bar */}
        <div className="bg-sky-600 dark:bg-slate-800 p-4 text-white flex items-center justify-between border-b border-sky-700/40 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs text-white">Pythaverse Admin Bot</h3>
              <p className="text-[10px] text-sky-100 dark:text-sky-300">Telegram Mini App View</p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] font-semibold rounded-full">v1.0</span>
        </div>

        {/* Mini App Content */}
        <div className="p-4 space-y-3.5">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 shadow-xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-violet-700 dark:text-violet-300">#TASK-8902</span>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 text-[10px] font-medium rounded-full">
                Cần Phê Duyệt
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
              Reset mật khẩu Keycloak cho người dùng <code className="text-violet-700 dark:text-violet-300 font-mono font-medium">nguyenvana@dtt.vn</code>
            </p>
            <button 
              onClick={handleMobileApprove}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Phê Duyệt Nhanh Trên Mobile</span>
            </button>
          </div>

          <div className="text-center text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Tích hợp Haptic Feedback SDK & OAuth Guard</span>
          </div>
        </div>
      </div>
    </div>
  );
};
