// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Github,
  Bot,
  CheckCircle2,
  X
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { InboxTicket, BotType } from '../../types';
import { toast } from 'sonner';

interface FileViewerModalProps {
  file: { filename: string; url: string } | null;
  onClose: () => void;
}

export const UnifiedInboxPage: React.FC = () => {
  const navigate = useNavigate();

  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [tickets, setTickets] = useState<InboxTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{ filename: string; url: string } | null>(null);

  // Modal tạo Task Bot
  const [taskModalTicket, setTaskModalTicket] = useState<InboxTicket | null>(null);
  const [selectedBotType, setSelectedBotType] = useState<BotType>('keycloak_api');
  const [payloadText, setPayloadText] = useState<string>('');
  const [creatingTask, setCreatingTask] = useState<boolean>(false);

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

  // 1. Chuyển sang trang GitHub Issue kèm ngữ cảnh của Ticket
  const handleNavigateToGitHub = (ticket: InboxTicket) => {
    navigate('/github', { state: { ticket } });
  };

  // 2. Mở Modal tạo Bot Task với Payload được gợi ý tự động
  const handleOpenTaskModal = (ticket: InboxTicket) => {
    setTaskModalTicket(ticket);

    // Tự động đoán Bot Type theo category
    let botType: BotType = 'keycloak_api';
    let defaultPayload: Record<string, any> = {
      ticket_id: ticket.id,
      sender_email: ticket.sender_email,
      action: 'auto_triage'
    };

    if (ticket.category === 'account_keycloak') {
      botType = 'keycloak_api';
      defaultPayload = {
        action: 'reset_password',
        target_email: ticket.sender_email,
        temp_pass: 'Ptv@2026',
        ticket_id: ticket.id
      };
    } else if (ticket.category === 'lms_enroll') {
      botType = 'workspace_rpa';
      defaultPayload = {
        action: 'enroll_student',
        student_email: ticket.sender_email,
        school_name: ticket.submitter_name || 'Partner School',
        course_name: 'Python Robotics / AIROC',
        ticket_id: ticket.id
      };
    } else if (ticket.source === 'google_form') {
      botType = 'feedback_doc_triage';
      defaultPayload = {
        action: 'comment_and_assign',
        doc_url: ticket.doc_url || '',
        assignee_email: ticket.assigned_email || 'hung.nguyenmanh@dtt.vn',
        category: ticket.category || 'other',
        row_index: ticket.metadata?.row_index || 2,
        ticket_id: ticket.id
      };
    }

    setSelectedBotType(botType);
    setPayloadText(JSON.stringify(defaultPayload, null, 2));
  };

  // 3. Thực thi lưu Task vào database
  const handleConfirmCreateTask = async () => {
    if (!taskModalTicket) return;

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (e) {
      toast.error('Payload JSON không hợp lệ, vui lòng kiểm tra lại cú pháp!');
      return;
    }

    setCreatingTask(true);
    try {
      await fetchApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: taskModalTicket.id,
          bot_type: selectedBotType,
          payload_data: parsedPayload
        }),
      });

      toast.success(
        <div className="space-y-1">
          <div className="font-bold">Đã tạo tác vụ phê duyệt Bot thành công!</div>
          <button
            onClick={() => navigate('/tasks')}
            className="text-violet-400 underline text-xs font-semibold"
          >
            Chuyển đến Task Hub để duyệt ngay ➔
          </button>
        </div>
      );

      setTaskModalTicket(null);
      await loadTickets();
    } catch (err) {
      toast.error('Lỗi tạo tác vụ: ' + (err as Error).message);
    } finally {
      setCreatingTask(false);
    }
  };

  const renderSourceBadge = (source: string) => {
    switch (source) {
      case 'gmail':
        return (
          <span className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 text-[10px] font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs">
            <Mail className="w-3 h-3" /> GMAIL
          </span>
        );
      case 'google_form':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 text-[10px] font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs">
            <FileText className="w-3 h-3" /> GOOGLE FORM
          </span>
        );
      case 'osticket':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 text-[10px] font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs">
            <Ticket className="w-3 h-3" /> OS TICKET
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600 text-[10px] font-semibold rounded-lg">
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
      <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{file.filename}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 rounded uppercase">{ext}</span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={file.url}
                target="_blank"
                download
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition shadow-xs"
              >
                Tải file về
              </a>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg transition"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Modal Content Preview */}
          <div className="flex-1 p-4 bg-slate-100/50 dark:bg-slate-900 overflow-auto flex items-center justify-center">
            {isImage && (
              <img src={file.url} alt={file.filename} className="max-h-full max-w-full rounded-xl object-contain shadow-md" />
            )}

            {isPdf && (
              <iframe src={file.url} title={file.filename} className="w-full h-full rounded-xl border border-slate-200 dark:border-slate-700" />
            )}

            {isDoc && (
              <iframe
                src={`https://docs.google.com/gview?url=${encodeURIComponent(file.url)}&embedded=true`}
                title={file.filename}
                className="w-full h-full rounded-xl border border-slate-200 dark:border-slate-700"
              />
            )}

            {!isImage && !isPdf && !isDoc && (
              <div className="text-center space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Định dạng file này chưa hỗ trợ xem trước trực tiếp.</p>
                <a href={file.url} target="_blank" download className="inline-block px-4 py-2 bg-violet-600 text-white text-xs font-semibold rounded-xl">
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Unified Inbox Feed</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage.
          </p>
        </div>

        <button
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl text-xs text-slate-700 dark:text-slate-300 transition shadow-2xs cursor-pointer"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          <span>{sortOrder === 'desc' ? "Mới nhất ➔ Cũ nhất" : "Cũ nhất ➔ Mới nhất"}</span>
        </button>
      </div>

      {/* Segmented Filter Bars */}
      <div className="space-y-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-5">
        {/* Nguồn */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">Nguồn:</span>
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSource(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${selectedSource === s.id
                ? 'bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 font-semibold shadow-xs'
                : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Phân loại */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">Phân loại:</span>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${selectedCategory === cat.id
                ? 'bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 font-semibold shadow-xs'
                : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading & Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Đang nạp danh sách ticket...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-3 shadow-xs">
          <Inbox className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Không có ticket nào trong bộ lọc này</h3>
        </div>
      ) : (
        /* Danh sách Card phẳng & sắc nét */
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const isExpanded = expandedContent[ticket.id] || false;
            const directUrl = getDirectSourceUrl(ticket);
            const attachments = ticket.attachments || ticket.metadata?.attachments || [];

            return (
              <div key={ticket.id} className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 space-y-4 relative transition-all duration-200 shadow-xs">
                {/* Header Card */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {renderSourceBadge(ticket.source)}

                      {/* Dropdown Đổi Tag Category Inline */}
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5">
                        <Tag className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                        <select
                          value={ticket.category || 'other'}
                          onChange={(e) => handleCategoryChange(ticket.id, e.target.value)}
                          className="bg-transparent text-violet-700 dark:text-violet-300 text-[10px] font-semibold uppercase focus:outline-none cursor-pointer"
                        >
                          <option value="bug" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">BUG</option>
                          <option value="account_keycloak" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">KEYCLOAK</option>
                          <option value="lms_enroll" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">LMS ENROLL</option>
                          <option value="license" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">LICENSE</option>
                          <option value="other" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">OTHER</option>
                        </select>
                      </div>

                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                        {ticket.submitter_name || ticket.sender_email}
                      </span>

                      {/* Thời gian */}
                      <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {ticket.ticket_timestamp || new Date(ticket.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {ticket.subject || 'Không có tiêu đề'}
                    </h3>
                  </div>

                  {/* Nút bấm mở trực tiếp trang gốc */}
                  <a
                    href={directUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-300 text-xs font-medium rounded-xl transition shrink-0 shadow-2xs"
                    title="Mở nội dung gốc trên Gmail / Google Sheet / OS Ticket"
                  >
                    <span>Mở trang gốc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Tệp đính kèm */}
                {(ticket.doc_url || attachments.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {ticket.doc_url && (
                      <a
                        href={ticket.doc_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 border border-emerald-200 rounded-xl text-xs transition shadow-2xs"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>Google Doc Báo Cáo</span>
                      </a>
                    )}

                    {attachments.map((att: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setPreviewFile(att)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 border border-sky-200 rounded-xl text-xs transition shadow-2xs cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>{att.filename || `File đính kèm ${idx + 1}`}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Tóm tắt Gemini AI (Pastel Lavender box) */}
                <div className="bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-800/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                    <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                    <span>Tóm tắt & Đề xuất tự động từ Gemini AI</span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                    {ticket.ai_summary || "Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích tóm tắt..."}
                  </p>
                  {ticket.assigned_name && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-violet-200/60 dark:border-violet-800/40">
                      👤 Phân công đề xuất: <strong className="text-violet-700 dark:text-violet-300 font-semibold">{ticket.assigned_name}</strong> ({ticket.assigned_email})
                    </div>
                  )}
                </div>

                {/* Xem nội dung email gốc */}
                <div className="border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
                  <button
                    onClick={() => setExpandedContent(prev => ({ ...prev, [ticket.id]: !prev[ticket.id] }))}
                    className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition font-medium cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isExpanded ? "Thu gọn nội dung email gốc" : "Xem nội dung email gốc đầy đủ"}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono leading-relaxed">
                      {ticket.raw_content}
                    </div>
                  )}
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between pt-1 flex-wrap gap-2">

                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedCategory === 'dismissed' ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition shadow-2xs cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Khôi phục Hòm Thư</span>
                      </button>
                    ) : (
                      <>
                        {/* Nút Bỏ qua */}
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:border-rose-500/20 dark:text-rose-300 text-xs font-medium rounded-xl transition shadow-2xs cursor-pointer"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>Bỏ qua</span>
                        </button>

                        {/* Nút 1: Tạo GitHub Issue */}
                        <button
                          onClick={() => handleNavigateToGitHub(ticket)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
                          title="Tạo GitHub Issue từ Ticket này"
                        >
                          <Github className="w-3.5 h-3.5" />
                          <span>Tạo Issue GitHub</span>
                        </button>

                        {/* Nút 2: Tạo Tác Vụ Phê Duyệt Bot */}
                        <button
                          onClick={() => handleOpenTaskModal(ticket)}
                          className="flex items-center gap-2 px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>Tạo Tác Vụ Bot</span>
                          <ArrowRight className="w-3.5 h-3.5" />
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

      {/* Modal 1: Xem File Đính Kèm */}
      {previewFile && (
        <FileViewerModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Modal 2: Tạo & Tùy Chỉnh Bot Automation Task */}
      {taskModalTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden space-y-4 p-6">

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Khởi Tạo Tác Vụ Bot Automation
                </h3>
              </div>
              <button
                onClick={() => setTaskModalTicket(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ticket Info Summary */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {taskModalTicket.subject || 'Không có tiêu đề'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Người gửi: {taskModalTicket.sender_email} | Nguồn: {taskModalTicket.source.toUpperCase()}
              </div>
            </div>

            {/* Bot Type Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Chọn Cỗ Máy Bot Worker
              </label>
              <select
                value={selectedBotType}
                onChange={(e) => setSelectedBotType(e.target.value as BotType)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 font-medium outline-none focus:border-violet-500"
              >
                <option value="keycloak_api">🔑 Keycloak Identity Bot (Reset Pass / Quản Trị User)</option>
                <option value="workspace_rpa">🏢 Workspace License RPA (Bulk User .xlsx, Order / Contract)</option>
                <option value="lms_playwright">🎓 LMS Playwright Worker (Ghi danh khóa học PLearn)</option>
                <option value="feedback_doc_triage">📝 Feedback Doc Triage (Gắn tag @Doc & Check Sheet)</option>
                <option value="github_issue_creator">🐙 GitHub Issue Dispatcher (Tạo Bug Issue)</option>
              </select>
            </div>

            {/* Payload JSON Editor */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Tham Số Thực Thi (Payload JSON)</span>
                <span className="text-[10px] text-slate-400 font-normal">Có thể chỉnh sửa</span>
              </label>
              <textarea
                rows={6}
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 leading-relaxed"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setTaskModalTicket(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={creatingTask}
                onClick={handleConfirmCreateTask}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {creatingTask ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Lưu Tác Vụ Vào Hàng Đợi Duyệt</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};