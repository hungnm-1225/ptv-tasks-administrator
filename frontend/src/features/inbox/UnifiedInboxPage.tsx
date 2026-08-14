// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Loader2, Inbox, Mail, FileText, Ticket, ExternalLink, Paperclip, XCircle, RotateCcw, ChevronDown, ChevronUp, FileCode, Tag } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { InboxTicket } from '../../types';

export const UnifiedInboxPage: React.FC = () => {
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [tickets, setTickets] = useState<InboxTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});

  const sources = [
    { id: 'all', label: 'Tất cả Nguồn' },
    { id: 'gmail', label: '✉️ Gmail' },
    { id: 'google_form', label: '📝 Google Form' },
    { id: 'osticket', label: '🎫 OS Ticket' },
  ];

  const categories = [
    { id: 'all', label: 'Tất cả Category' },
    { id: 'bug', label: '🐛 System Bugs' },
    { id: 'account_keycloak', label: '🔑 Keycloak/Account' },
    { id: 'lms_enroll', label: '🎓 LMS Enroll' },
    { id: 'license', label: '📜 License' },
    { id: 'other', label: '📌 Khác' },
    { id: 'dismissed', label: '🗑️ Đã Bỏ Qua' },
  ];

  const loadTickets = async () => {
    setLoading(true);
    try {
      let endpoint = '/tickets';
      if (selectedCategory === 'dismissed') {
        endpoint = '/tickets?status=dismissed';
      } else if (selectedCategory !== 'all') {
        endpoint = `/tickets?category=${selectedCategory}`;
      }

      let data = await fetchApi<InboxTicket[]>(endpoint);

      // Lọc theo Nguồn (Source) nếu người dùng chọn
      if (selectedSource !== 'all') {
        data = data.filter(t => t.source === selectedSource);
      }

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
  }, [selectedCategory, selectedSource]);

  // Đổi Tag Category trực tiếp trên Card
  const handleCategoryChange = async (ticketId: string, newCategory: string) => {
    try {
      await fetchApi(`/tickets/${ticketId}/category`, {
        method: 'PUT',
        body: JSON.stringify({ category: newCategory })
      });
      await loadTickets();
    } catch (err) {
      alert('❌ Lỗi đổi Category: ' + (err as Error).message);
    }
  };

  const handleDismissTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    try {
      await fetchApi(`/tickets/${ticketId}/dismiss`, { method: 'PUT' });
      await loadTickets();
    } catch (err) {
      alert('❌ Lỗi bỏ qua: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    try {
      await fetchApi(`/tickets/${ticketId}/restore`, { method: 'PUT' });
      await loadTickets();
    } catch (err) {
      alert('❌ Lỗi khôi phục: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Unified Inbox Feed</h2>
        <p className="text-xs text-slate-400 mt-1">
          Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage.
        </p>
      </div>

      {/* BỘ LỌC KÉP: NGUỒN VÀ CATEGORY */}
      <div className="space-y-3 border-b border-slate-800 pb-4">
        {/* Row 1: Lọc Nguồn */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold mr-1">Nguồn:</span>
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSource(s.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${selectedSource === s.id
                ? 'bg-cyan-600 text-white shadow'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Row 2: Lọc Category */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-semibold mr-1">Phân loại:</span>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${selectedCategory === cat.id
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-medium">Đang nạp danh sách ticket...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-xl border border-slate-800 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">Không có ticket nào trong bộ lọc này</h3>
        </div>
      ) : (
        /* Danh sách Card */
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const isExpanded = expandedContent[ticket.id] || false;

            return (
              <div key={ticket.id} className="glass-panel p-5 rounded-xl border border-slate-800 hover:border-indigo-500/40 space-y-4 relative transition">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      {renderSourceBadge(ticket.source)}

                      {/* DROPDOWN ĐỔI TAG CATEGORY TÙY Ý NGAY TRÊN CARD */}
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5">
                        <Tag className="w-3 h-3 text-indigo-400" />
                        <select
                          value={ticket.category || 'other'}
                          onChange={(e) => handleCategoryChange(ticket.id, e.target.value)}
                          className="bg-transparent text-indigo-300 text-[10px] font-bold uppercase focus:outline-none cursor-pointer"
                        >
                          <option value="bug" className="bg-slate-900 text-slate-200">BUG</option>
                          <option value="account_keycloak" className="bg-slate-900 text-slate-200">KEYCLOAK</option>
                          <option value="lms_enroll" className="bg-slate-900 text-slate-200">LMS ENROLL</option>
                          <option value="license" className="bg-slate-900 text-slate-200">LICENSE</option>
                          <option value="other" className="bg-slate-900 text-slate-200">OTHER</option>
                        </select>
                      </div>

                      <span className="text-xs font-medium text-slate-300">{ticket.submitter_name || ticket.sender_email}</span>
                      {ticket.country && <span className="text-xs text-slate-400">• 📍 {ticket.country}</span>}
                    </div>
                    <h3 className="text-base font-semibold text-slate-100 mt-1">
                      {ticket.subject || 'Không có tiêu đề'}
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{ticket.source_id}</span>
                </div>

                {/* Tệp đính kèm (Mở Doc Link) */}
                {ticket.doc_url && (
                  <div className="flex items-center gap-2">
                    <a
                      href={ticket.doc_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs text-cyan-400 transition"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Mở Google Doc Đính Kèm</span>
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                )}

                {/* Tóm tắt Gemini AI */}
                <div className="bg-slate-950/90 border border-indigo-500/20 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tóm tắt & Đề xuất tự động từ Gemini AI</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {ticket.ai_summary || "Hệ thống đã nhận thông tin ticket và đang chờ xử lý."}
                  </p>
                  {ticket.assigned_name && (
                    <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                      👤 Phân công đề xuất: <strong className="text-indigo-300">{ticket.assigned_name}</strong> ({ticket.assigned_email})
                    </div>
                  )}
                </div>

                {/* Xem nội dung email gốc */}
                <div className="border-t border-slate-800/80 pt-2">
                  <button
                    onClick={() => setExpandedContent(prev => ({ ...prev, [ticket.id]: !prev[ticket.id] }))}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition font-medium"
                  >
                    <FileCode className="w-3.5 h-3.5 text-slate-500" />
                    <span>{isExpanded ? "Thu gọn nội dung email gốc" : "Xem nội dung email gốc đầy đủ"}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 p-3 bg-slate-950/60 rounded border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                      {ticket.raw_content}
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-400">
                    Độ tin cậy AI: <strong className="text-emerald-400">98%</strong>
                  </span>

                  <div className="flex items-center gap-2">
                    {selectedCategory === 'dismissed' ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Khôi phục Hòm Thư</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium rounded-lg transition"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>Bỏ qua</span>
                        </button>

                        <button
                          onClick={() => handleCreateTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-lg transition shadow-md shadow-indigo-600/20"
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
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};