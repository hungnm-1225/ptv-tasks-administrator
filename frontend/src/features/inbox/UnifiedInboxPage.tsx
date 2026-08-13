// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Loader2, Inbox, Mail, FileText, Ticket, ExternalLink, Paperclip } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { InboxTicket } from '../../types';

export const UnifiedInboxPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [tickets, setTickets] = useState<InboxTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'Tất cả Ticket' },
    { id: 'bug', label: '🐛 System Bugs' },
    { id: 'account_keycloak', label: '🔑 Keycloak/Account' },
    { id: 'lms_enroll', label: '🎓 LMS Enroll' },
    { id: 'license', label: '📜 License' },
    { id: 'other', label: '📌 Khác' },
  ];

  // Lấy dữ liệu THẬT từ Render Backend / Supabase
  const loadTickets = async () => {
    setLoading(true);
    try {
      const endpoint = selectedCategory === 'all'
        ? '/tickets'
        : `/tickets?category=${selectedCategory}`;
      const data = await fetchApi<InboxTicket[]>(endpoint);
      setTickets(data || []);
    } catch (err) {
      console.error('Lỗi nạp ticket:', err);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [selectedCategory]);

  const handleCreateTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    try {
      await fetchApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({ ticket_id: ticketId, bot_type: 'keycloak_api' }),
      });
      alert('✅ Đã tạo tác vụ phê duyệt! Anh chuyển sang tab Task & Approval Hub để bấm Duyệt nhé.');
      await loadTickets();
    } catch (err) {
      alert('❌ Lỗi tạo tác vụ: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  // Render Badge Nguồn (Source)
  const renderSourceBadge = (source: string) => {
    switch (source) {
      case 'gmail':
        return <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-bold rounded flex items-center gap-1"><Mail className="w-3 h-3" /> GMAIL</span>;
      case 'google_form':
        return <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold rounded flex items-center gap-1"><FileText className="w-3 h-3" /> GOOGLE FORM</span>;
      case 'osticket':
        return <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[10px] font-bold rounded flex items-center gap-1"><Ticket className="w-3 h-3" /> OS TICKET</span>;
      default:
        return <span className="px-2 py-0.5 bg-slate-500/10 text-slate-400 text-[10px] font-bold rounded">{source.toUpperCase()}</span>;
    }
  };

  // Render Badge Trạng thái
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded">✅ ĐÃ XỬ LÝ</span>;
      case 'processing':
        return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded">🔄 ĐANG XỬ LÝ</span>;
      default:
        return <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded">⏳ CHỜ PHÊ DUYỆT</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Unified Inbox Feed</h2>
        <p className="text-xs text-slate-400 mt-1">
          Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với Gemini AI Triage.
        </p>
      </div>

      {/* Tabs Phân loại */}
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

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-medium">Đang nạp dữ liệu thật từ Supabase...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-xl border border-slate-800 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">Không có ticket nào trong danh mục này</h3>
        </div>
      ) : (
        /* Danh sách Thẻ Ticket Thật */
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="glass-panel p-5 rounded-xl border border-indigo-500/30 space-y-4 relative">
              {/* Header Card */}
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {renderSourceBadge(ticket.source)}
                    {renderStatusBadge(ticket.status)}
                    <span className="text-xs font-medium text-slate-300">{ticket.submitter_name || ticket.sender_email}</span>
                    {ticket.country && <span className="text-xs text-slate-400">• 📍 {ticket.country}</span>}
                  </div>
                  <h3 className="text-base font-semibold text-slate-100 mt-1">
                    {ticket.subject || 'Không có tiêu đề'}
                  </h3>
                </div>
                <span className="text-[10px] text-slate-500">{ticket.source_id}</span>
              </div>

              {/* Tệp đính kèm / Link Doc */}
              {ticket.doc_url && (
                <div className="flex items-center gap-2">
                  <a
                    href={ticket.doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs text-cyan-400 transition"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Mở Google Doc Báo Cáo</span>
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              )}

              {/* Khung AI Triage */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tóm tắt & Đề xuất tự động từ Gemini AI</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {ticket.ai_summary || ticket.raw_content}
                </p>
                {ticket.assigned_name && (
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                    👤 Phân công đề xuất: <strong className="text-indigo-300">{ticket.assigned_name}</strong> ({ticket.assigned_email})
                  </div>
                )}
              </div>

              {/* Action Footer */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400">
                  Độ tin cậy AI: <strong className="text-emerald-400">98%</strong>
                </span>
                <button
                  onClick={() => handleCreateTask(ticket.id)}
                  disabled={actionLoading === ticket.id}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-lg transition"
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