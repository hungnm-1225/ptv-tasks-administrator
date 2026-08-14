// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  Loader2, 
  Inbox, 
  Mail, 
  FileText, 
  Ticket, 
  ExternalLink, 
  Paperclip, 
  XCircle, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp, 
  FileCode, 
  Tag, 
  Calendar, 
  ArrowUpDown, 
  Image as ImageIcon,
  FileSpreadsheet
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { InboxTicket } from '../../types';
import { toast } from 'sonner';

interface FileViewerModalProps {
  file: { filename: string; url: string } | null;
  onClose: () => void;
}

export const UnifiedInboxPage: React.FC = () => {
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [tickets, setTickets] = useState<InboxTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{ filename: string; url: string } | null>(null);

  const SPREADSHEET_ID = "1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go";

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
      let endpoint = `/tickets?sort=${sortOrder}`;
      if (selectedCategory === 'dismissed') {
        endpoint += '&status=dismissed';
      } else if (selectedCategory !== 'all') {
        endpoint += `&category=${selectedCategory}`;
      }

      let data = await fetchApi<InboxTicket[]>(endpoint);

      if (selectedSource !== 'all') {
        data = data.filter(t => t.source === selectedSource);
      }

      setTickets(data || []);
    } catch (err) {
      console.error('Lỗi nạp ticket:', err);
      toast.error('Không thể tải danh sách ticket: ' + (err as Error).message);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [selectedCategory, selectedSource, sortOrder]);

  const getDirectSourceUrl = (ticket: InboxTicket) => {
    if (ticket.source === 'gmail') {
      return `https://mail.google.com/mail/u/0/#search/id%3A${ticket.source_id}`;
    } else if (ticket.source === 'google_form') {
      const rowIdx = ticket.metadata?.row_index || 2;
      return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0&range=A${rowIdx}:P${rowIdx}`;
    } else if (ticket.source === 'osticket') {
      return `https://support.pythaverse.space/scp/tickets.php?id=${ticket.source_id}`;
    }
    return '#';
  };

  const handleCategoryChange = async (ticketId: string, newCategory: string) => {
    try {
      await fetchApi(`/tickets/${ticketId}/category`, {
        method: 'PUT',
        body: JSON.stringify({ category: newCategory })
      });
      toast.success(`Đã cập nhật phân loại thành [${newCategory.toUpperCase()}]`);
      await loadTickets();
    } catch (err) {
      toast.error('Lỗi đổi Category: ' + (err as Error).message);
    }
  };

  const handleDismissTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    try {
      await fetchApi(`/tickets/${ticketId}/dismiss`, { method: 'PUT' });
      toast.success('Đã chuyển ticket vào mục Đã bỏ qua');
      await loadTickets();
    } catch (err) {
      toast.error('Lỗi bỏ qua ticket: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    try {
      await fetchApi(`/tickets/${ticketId}/restore`, { method: 'PUT' });
      toast.success('Đã khôi phục ticket về Hòm Thư thành công');
      await loadTickets();
    } catch (err) {
      toast.error('Lỗi khôi phục ticket: ' + (err as Error).message);
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
      toast.success('Đã tạo tác vụ phê duyệt Bot thành công! Chuyển sang tab Task Hub để duyệt.');
      await loadTickets();
    } catch (err) {
      toast.error('Lỗi tạo tác vụ: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const renderSourceBadge = (source: string) => {
    switch (source) {
      case 'gmail':
        return (
          <span className="px-2.5 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[10px] font-semibold rounded-lg flex items-center gap-1.5">
            <Mail className="w-3 h-3" /> GMAIL
          </span>
        );
      case 'google_form':
        return (
          <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-semibold rounded-lg flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> GOOGLE FORM
          </span>
        );
      case 'osticket':
        return (
          <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[10px] font-semibold rounded-lg flex items-center gap-1.5">
            <Ticket className="w-3 h-3" /> OS TICKET
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-slate-500/10 border border-slate-500/20 text-slate-300 text-[10px] font-semibold rounded-lg">
            {source.toUpperCase()}
          </span>
        );
    }
  };

  const FileViewerModal: React.FC<FileViewerModalProps> = ({ file, onClose }) => {
    if (!file) return null;

    const ext = file.filename.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
    const isPdf = ext === 'pdf';
    const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);

    return (
      <div className="fixed inset-0 z-50 bg-[#0b0f19]/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="surface-card border border-slate-700/80 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0b0f19]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">{file.filename}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-purple-500/15 text-purple-300 border border-purple-500/25 rounded uppercase">{ext}</span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={file.url}
                target="_blank"
                download
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition"
              >
                Tải file về
              </a>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Modal Content Preview */}
          <div className="flex-1 p-4 bg-[#0b0f19] overflow-auto flex items-center justify-center">
            {isImage && (
              <img src={file.url} alt={file.filename} className="max-h-full max-w-full rounded-xl object-contain shadow-md" />
            )}

            {isPdf && (
              <iframe src={file.url} title={file.filename} className="w-full h-full rounded-xl border border-slate-800" />
            )}

            {isDoc && (
              <iframe
                src={`https://docs.google.com/gview?url=${encodeURIComponent(file.url)}&embedded=true`}
                title={file.filename}
                className="w-full h-full rounded-xl border border-slate-800"
              />
            )}

            {!isImage && !isPdf && !isDoc && (
              <div className="text-center space-y-3">
                <p className="text-xs text-slate-400">Định dạng file này chưa hỗ trợ xem trước trực tiếp.</p>
                <a href={file.url} target="_blank" download className="inline-block px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-xl">
                  Bấm vào đây để tải file về máy
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sort Button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">Unified Inbox Feed</h2>
          <p className="text-xs text-slate-400 mt-1">
            Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage.
          </p>
        </div>

        <button
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131b2e] border border-slate-800 hover:border-slate-700 rounded-xl text-xs text-slate-300 transition shadow-sm"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-purple-300" />
          <span>{sortOrder === 'desc' ? "Mới nhất ➔ Cũ nhất" : "Cũ nhất ➔ Mới nhất"}</span>
        </button>
      </div>

      {/* Segmented Filter Bars (Pastel Theme) */}
      <div className="space-y-3 border-b border-slate-800/80 pb-5">
        {/* Nguồn */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium mr-1">Nguồn:</span>
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSource(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                selectedSource === s.id
                  ? 'bg-sky-500/15 border border-sky-500/30 text-sky-200 font-semibold shadow-sm'
                  : 'bg-[#131b2e] border border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Phân loại */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium mr-1">Phân loại:</span>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                selectedCategory === cat.id
                  ? 'bg-purple-500/15 border border-purple-500/30 text-purple-200 font-semibold shadow-sm'
                  : 'bg-[#131b2e] border border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading & Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
          <span className="text-xs font-medium text-slate-400">Đang nạp danh sách ticket...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="surface-card p-12 text-center rounded-2xl border border-slate-800 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">Không có ticket nào trong bộ lọc này</h3>
        </div>
      ) : (
        /* Danh sách Card phẳng & sắc nét */
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const isExpanded = expandedContent[ticket.id] || false;
            const directUrl = getDirectSourceUrl(ticket);
            const attachments = ticket.attachments || ticket.metadata?.attachments || [];

            return (
              <div key={ticket.id} className="surface-card p-5 sm:p-6 rounded-2xl hover:border-slate-700/80 space-y-4 relative transition-all duration-200">
                {/* Header Card */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {renderSourceBadge(ticket.source)}

                      {/* Dropdown Đổi Tag Category Inline */}
                      <div className="flex items-center gap-1 bg-[#0b0f19] border border-slate-700/60 rounded-lg px-2 py-0.5">
                        <Tag className="w-3 h-3 text-purple-300" />
                        <select
                          value={ticket.category || 'other'}
                          onChange={(e) => handleCategoryChange(ticket.id, e.target.value)}
                          className="bg-transparent text-purple-200 text-[10px] font-semibold uppercase focus:outline-none cursor-pointer"
                        >
                          <option value="bug" className="bg-[#131b2e] text-slate-200">BUG</option>
                          <option value="account_keycloak" className="bg-[#131b2e] text-slate-200">KEYCLOAK</option>
                          <option value="lms_enroll" className="bg-[#131b2e] text-slate-200">LMS ENROLL</option>
                          <option value="license" className="bg-[#131b2e] text-slate-200">LICENSE</option>
                          <option value="other" className="bg-[#131b2e] text-slate-200">OTHER</option>
                        </select>
                      </div>

                      <span className="text-xs font-medium text-slate-300 truncate max-w-[200px]">
                        {ticket.submitter_name || ticket.sender_email}
                      </span>

                      {/* Thời gian */}
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {ticket.ticket_timestamp || new Date(ticket.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-semibold text-slate-100 leading-snug">
                      {ticket.subject || 'Không có tiêu đề'}
                    </h3>
                  </div>

                  {/* Nút bấm mở trực tiếp trang gốc */}
                  <a
                    href={directUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0b0f19] hover:bg-slate-800 border border-slate-700/60 text-sky-300 text-xs font-medium rounded-xl transition shrink-0"
                    title="Mở nội dung gốc trên Gmail / Google Sheet / OS Ticket"
                  >
                    <span>Mở trang gốc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Tệp đính kèm (Google Doc / PDF / Images / Excel) */}
                {(ticket.doc_url || attachments.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {ticket.doc_url && (
                      <a
                        href={ticket.doc_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 transition"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>Google Doc Báo Cáo</span>
                      </a>
                    )}

                    {attachments.map((att: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setPreviewFile(att)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-xl text-xs text-sky-300 transition"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>{att.filename || `File đính kèm ${idx + 1}`}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Tóm tắt Gemini AI (Pastel Lavender box) */}
                <div className="bg-purple-500/5 border border-purple-500/15 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Tóm tắt & Đề xuất tự động từ Gemini AI</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-normal">
                    {ticket.ai_summary || "Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích tóm tắt..."}
                  </p>
                  {ticket.assigned_name && (
                    <div className="text-[11px] text-slate-400 pt-2 border-t border-purple-500/10">
                      👤 Phân công đề xuất: <strong className="text-purple-300 font-semibold">{ticket.assigned_name}</strong> ({ticket.assigned_email})
                    </div>
                  )}
                </div>

                {/* Xem nội dung email gốc */}
                <div className="border-t border-slate-800/60 pt-2">
                  <button
                    onClick={() => setExpandedContent(prev => ({ ...prev, [ticket.id]: !prev[ticket.id] }))}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition font-medium"
                  >
                    <FileCode className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isExpanded ? "Thu gọn nội dung email gốc" : "Xem nội dung email gốc đầy đủ"}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 p-3 bg-[#0b0f19] rounded-xl border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono leading-relaxed">
                      {ticket.raw_content}
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                  <span className="text-[11px] text-slate-400">
                    <span className="text-emerald-300">✓ AI-Powered Feed</span>
                  </span>

                  <div className="flex items-center gap-2">
                    {selectedCategory === 'dismissed' ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#18223a] hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Khôi phục Hòm Thư</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium rounded-xl transition"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>Bỏ qua</span>
                        </button>

                        <button
                          onClick={() => handleCreateTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-sm"
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

      {/* Modal Xem File Đính Kèm */}
      {previewFile && (
        <FileViewerModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
};