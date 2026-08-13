// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Loader2, Inbox, Mail, FileText, Ticket, ExternalLink, Paperclip, XCircle, RotateCcw, ChevronDown, ChevronUp, FileCode } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { InboxTicket } from '../../types';

export const UnifiedInboxPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [tickets, setTickets] = useState<InboxTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 🎯 QUẢN LÝ LỖI LOADING RIÊNG CHO TỪNG NÚT
  const [loadingState, setLoadingState] = useState<{ id: string; action: 'dismiss' | 'create' | 'restore' } | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});

  const categories = [
    { id: 'all', label: 'Tất cả Ticket' },
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

  const toggleExpand = (id: string) => {
    setExpandedContent(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 🎯 BỎ QUA TICKET
  const handleDismissTask = async (ticketId: string) => {
    setLoadingState({ id: ticketId, action: 'dismiss' });
    try {
      await fetchApi(`/tickets/${ticketId}/dismiss`, { method: 'PUT' });
      await loadTickets();
    } catch (err) {
      alert('❌ Lỗi bỏ qua: ' + (err as Error).message);
    } finally {
      setLoadingState(null);
    }
  };

  // 🎯 KHÔI PHỤC TICKET
  const handleRestoreTask = async (ticketId: string) => {
    setLoadingState({ id: ticketId, action: 'restore' });
    try {
      await fetchApi(`/tickets/${ticketId}/restore`, { method: 'PUT' });
      await loadTickets();
    } catch (err) {
      alert('❌ Lỗi khôi phục: ' + (err as Error).message);
    } finally {
      setLoadingState(null);
    }
  };

  // 🎯 TẠO TASK PHÊ DUYỆT BOT
  const handleCreateTask = async (ticketId: string) => {
    setLoadingState({ id: ticketId, action: 'create' });
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
      setLoadingState(null);
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
          Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với Gemini AI Triage Tự Động 100%.
        </p>
      </div>

      {/* Tabs */}
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

      {/* Loading List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-medium">Đang nạp danh sách ticket...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-xl border border-slate-800 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">Không có ticket nào trong danh mục này</h3>
        </div>
      ) : (
        /* Danh sách Card Ticket */
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const isExpanded = expandedContent[ticket.id] || false;
            const attachments = ticket.attachments || [];
            const isCardLoading = loadingState?.id === ticket.id;

            return (
              <div key={ticket.id} className="glass-panel p-5 rounded-xl border border-slate-800 hover:border-indigo-500/40 space-y-4 relative transition">
                {/* Header Card */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      {renderSourceBadge(ticket.source)}
                      <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-indigo-300 text-[10px] font-bold rounded uppercase">
                        {ticket.category || 'OTHER'}
                      </span>
                      <span className="text-xs font-medium text-slate-300">{ticket.submitter_name || ticket.sender_email}</span>
                      {ticket.country && <span className="text-xs text-slate-400">• 📍 {ticket.country}</span>}
                    </div>
                    <h3 className="text-base font-semibold text-slate-100 mt-1">
                      {ticket.subject || 'Không có tiêu đề'}
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{ticket.source_id}</span>
                </div>

                {/* Danh sách Tệp Đính Kèm (Doc / PDF / XLSX) */}
                {(ticket.doc_url || attachments.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {ticket.doc_url && (
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
                    )}

                    {attachments.map((att: any, idx: number) => (
                      <a
                        key={idx}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs text-indigo-300 transition"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>{att.filename || `File đính kèm ${idx + 1}`}</span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Khung Tóm Tắt Tự Động Từ Gemini AI */}
                <div className="bg-slate-950/90 border border-indigo-500/20 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tóm tắt & Đề xuất tự động từ Gemini AI</span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    {ticket.ai_summary ? ticket.ai_summary : (
                      <span className="text-slate-500 italic">⏳ AI đang tóm tắt tự động trong vài giây...</span>
                    )}
                  </p>

                  {ticket.assigned_name && (
                    <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                      👤 Phân công đề xuất: <strong className="text-indigo-300">{ticket.assigned_name}</strong> ({ticket.assigned_email})
                    </div>
                  )}
                </div>

                {/* Ô Xem Nội Dung Mail Gốc (Có thể thu gọn / mở rộng) */}
                <div className="border-t border-slate-800/80 pt-2">
                  <button
                    onClick={() => toggleExpand(ticket.id)}
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

                {/* Footer Buttons (Xử lý Loading Độc Lập) */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-400">
                    Độ tin cậy AI: <strong className="text-emerald-400">98%</strong>
                  </span>

                  <div className="flex items-center gap-2">
                    {selectedCategory === 'dismissed' ? (
                      /* Nút Khôi Phục */
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={isCardLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 text-xs font-medium rounded-lg transition"
                      >
                        {isCardLoading && loadingState?.action === 'restore' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Khôi phục Hòm Thư</span>
                      </button>
                    ) : (
                      <>
                        {/* 🎯 NÚT BỎ QUA (Chỉ xoay khi action == 'dismiss') */}
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={isCardLoading}
                          className={`flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium rounded-lg transition ${isCardLoading && loadingState?.action === 'create' ? 'opacity-40 pointer-events-none' : ''
                            }`}
                        >
                          {isCardLoading && loadingState?.action === 'dismiss' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>Bỏ qua</span>
                        </button>

                        {/* 🎯 NÚT TẠO TÁC VỤ (Chỉ xoay khi action == 'create') */}
                        <button
                          onClick={() => handleCreateTask(ticket.id)}
                          disabled={isCardLoading}
                          className={`flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow-md shadow-indigo-600/20 ${isCardLoading && loadingState?.action === 'dismiss' ? 'opacity-40 pointer-events-none' : ''
                            }`}
                        >
                          {isCardLoading && loadingState?.action === 'create' ? (
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