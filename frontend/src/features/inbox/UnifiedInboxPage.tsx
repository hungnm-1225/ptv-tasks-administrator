import React, { useState } from 'react';
import { Sparkles, ArrowRight, CheckCircle, ShieldAlert } from 'lucide-react';

export const UnifiedInboxPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Tickets' },
    { id: 'bug', label: '🐛 System Bugs' },
    { id: 'account_keycloak', label: '🔑 Keycloak/Account' },
    { id: 'lms_enroll', label: '🎓 LMS Enroll' },
    { id: 'license', label: '📜 License' },
    { id: 'other', label: '📌 Others' },
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">Unified Inbox Feed</h2>
        <p className="text-xs text-slate-400 mt-1">
          Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${selectedCategory === cat.id
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Ticket List & AI Triage Cards */}
      <div className="space-y-4">
        {/* Sample AI Triage Card */}
        <div className="glass-panel p-5 rounded-xl border border-indigo-500/30 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-bl-lg flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>Gemini AI Triaged</span>
          </div>

          <div className="flex items-start justify-between pr-32">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold rounded">
                  KEYCLOAK
                </span>
                <span className="text-xs text-slate-400">nguyenvana@dtt.vn</span>
                <span className="text-xs text-slate-500">• 10 phút trước</span>
              </div>
              <h3 className="text-base font-semibold text-slate-100 mt-2">
                Yêu cầu cấp mới tài khoản Keycloak cho giảng viên khoa Công nghệ thông tin
              </h3>
            </div>
          </div>

          {/* AI Summary Box */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tóm tắt & Đề xuất tự động từ Gemini AI</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Yêu cầu tạo tài khoản Keycloak với realm `master`, gán quyền giảng viên. Gemini AI đã tự động trích xuất các tham số cần thiết và khởi tạo payload thực thi cho Keycloak API Bot Worker.
            </p>
          </div>

          {/* Action Trigger */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Độ tin cậy AI: <strong className="text-emerald-400">98%</strong></span>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow-md shadow-indigo-600/20">
              <span>Tạo Tác Vụ Phê Duyệt Bot</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
