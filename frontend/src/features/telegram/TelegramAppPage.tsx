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
        <h2 className="text-lg font-bold text-slate-100 tracking-tight">Telegram Mini App Simulator</h2>
        <p className="text-xs text-slate-400">Giao diện điều khiển tối ưu hóa cho ứng dụng Telegram di động</p>
      </div>

      {/* Mobile Telegram Mini App Container */}
      <div className="border border-slate-800 bg-[#0d1322] rounded-3xl overflow-hidden shadow-2xl">
        {/* Telegram Header Bar */}
        <div className="bg-[#18223a] p-4 text-white flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-300">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs text-slate-100">Pythaverse Admin Bot</h3>
              <p className="text-[10px] text-sky-300">Telegram Mini App View</p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[10px] font-semibold rounded-full">v1.0</span>
        </div>

        {/* Mini App Content */}
        <div className="p-4 space-y-3.5">
          <div className="surface-card p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-purple-300">#TASK-8902</span>
              <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[10px] font-medium rounded-full">
                Cần Phê Duyệt
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Reset mật khẩu Keycloak cho người dùng <code className="text-purple-300 font-mono">nguyenvana@dtt.vn</code>
            </p>
            <button 
              onClick={handleMobileApprove}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Phê Duyệt Nhanh Trên Mobile</span>
            </button>
          </div>

          <div className="text-center text-[10px] text-slate-400 flex items-center justify-center gap-1.5 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tích hợp Haptic Feedback SDK & OAuth Guard</span>
          </div>
        </div>
      </div>
    </div>
  );
};
