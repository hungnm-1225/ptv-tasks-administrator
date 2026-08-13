import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Loader2, Inbox } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { InboxTicket } from '../../types';

export const UnifiedInboxPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [tickets, setTickets] = useState<InboxTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'All Tickets' },
    { id: 'bug', label: '🐛 System Bugs' },
    { id: 'account_keycloak', label: '🔑 Keycloak/Account' },
    { id: 'lms_enroll', label: '🎓 LMS Enroll' },
    { id: 'license', label: '📜 License' },
    { id: 'other', label: '📌 Others' },
  ];

  // Fetch real tickets from FastAPI Render Backend
  const loadTickets = async () => {
    setLoading(true);
    try {
      const endpoint = selectedCategory === 'all' 
        ? '/tickets' 
        : `/tickets?category=${selectedCategory}`;
      const data = await fetchApi<InboxTicket[]>(endpoint);
      setTickets(data || []);
    } catch (err) {
      console.error('Lỗi khi tải ticket:', err);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [selectedCategory]);

  // Create Bot Automation Task for Approval
  const handleCreateTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    try {
      await fetchApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({ ticket_id: ticketId, bot_type: 'keycloak_api' }),
      });
      alert('✅ Đã tạo tác vụ phê duyệt thành công! Vui lòng chuyển sang tab Task & Approval Hub.');
      await loadTickets();
    } catch (err) {
      alert('❌ Lỗi tạo tác vụ: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

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
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              selectedCategory === cat.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-medium">Đang kết nối Render API & lấy dữ liệu thật...</span>
        </div>
      ) : tickets.length === 0 ? (
        /* Empty State */
        <div className="glass-panel p-12 text-center rounded-xl border border-slate-800 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">Không có ticket nào</h3>
          <p className="text-xs text-slate-500">
            Hiện chưa có dữ liệu chưa xử lý trong danh mục "{selectedCategory}".
          </p>
        </div>
      ) : (
        /* Dynamic Ticket List */
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div 
              key={ticket.id} 
              className="glass-panel p-5 rounded-xl border border-indigo-500/30 space-y-4 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-bl-lg flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>{(ticket.source || 'TICKET').toUpperCase()} • Gemini AI Triaged</span>
              </div>

              <div className="flex items-start justify-between pr-32">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold rounded uppercase">
                      {ticket.category || 'OTHER'}
                    </span>
                    <span className="text-xs text-slate-400">{ticket.sender_email}</span>
                    <span className="text-xs text-slate-500">• {new Date(ticket.created_at || Date.now()).toLocaleTimeString('vi-VN')}</span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-100 mt-2">
                    {ticket.subject || 'Không có tiêu đề'}
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
                  {ticket.ai_summary || ticket.raw_content}
                </p>
              </div>

              {/* Action Trigger */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Trạng thái: <strong className="text-emerald-400 uppercase">{ticket.status || 'PENDING'}</strong></span>
                </div>
                <button 
                  onClick={() => handleCreateTask(ticket.id)}
                  disabled={actionLoading === ticket.id}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-lg transition shadow-md shadow-indigo-600/20"
                >
                  {actionLoading === ticket.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Tạo Tác Vụ Phê Duyệt Bot</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};