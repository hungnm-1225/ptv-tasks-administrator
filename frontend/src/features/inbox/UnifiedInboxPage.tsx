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
  X,
  Building2,
  BookOpen,
  Layers
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { InboxTicket, BotType } from '../../types';
import { toast } from 'sonner';

interface HierarchySchoolItem {
  school_id: string;
  school_code: string;
  school_name: string;
  partner_name: string;
  distributor_name: string;
  full_lineage: string;
}

interface CourseItem {
  course_code: string;
  course_name: string;
  lms_id: number;
  lms_url: string;
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

  // Modal tạo Task Bot với Phả Hệ & Khóa Học
  const [taskModalTicket, setTaskModalTicket] = useState<InboxTicket | null>(null);
  const [selectedBotType, setSelectedBotType] = useState<BotType>('keycloak_api');
  const [payloadText, setPayloadText] = useState<string>('');
  const [creatingTask, setCreatingTask] = useState<boolean>(false);

  // Dữ liệu Phả hệ & Khóa học
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [coursesList, setCoursesList] = useState<CourseItem[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<HierarchySchoolItem | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);
  const [licenseCount, setLicenseCount] = useState<number>(50);

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

  // Nạp danh sách Trường & Khóa học từ API
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [schools, courses] = await Promise.all([
          fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools'),
          fetchApi<CourseItem[]>('/workspace/courses')
        ]);
        setSchoolsList(schools || []);
        setCoursesList(courses || []);
      } catch (e) {
        console.warn('Chưa nạp được metadata workspace:', e);
      }
    };
    loadMetadata();
  }, []);

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

  const handleNavigateToGitHub = (ticket: InboxTicket) => {
    navigate('/github', { state: { ticket } });
  };

  // Mở Modal tạo Bot Task
  const handleOpenTaskModal = (ticket: InboxTicket) => {
    setTaskModalTicket(ticket);

    // Tự động tìm trường phù hợp trong 480 trường
    const matchedSchool = schoolsList.find(s =>
      ticket.subject?.toLowerCase().includes(s.school_name.toLowerCase()) ||
      ticket.raw_content?.toLowerCase().includes(s.school_name.toLowerCase())
    ) || schoolsList[0] || null;

    const defaultCourse = coursesList[0] || null;

    setSelectedSchool(matchedSchool);
    setSelectedCourse(defaultCourse);

    let botType: BotType = 'keycloak_api';
    if (ticket.category === 'account_keycloak') botType = 'keycloak_api';
    else if (ticket.category === 'lms_enroll' || ticket.category === 'license') botType = 'workspace_rpa';
    else if (ticket.source === 'google_form') botType = 'feedback_doc_triage';

    setSelectedBotType(botType);
    updatePayloadPreview(botType, ticket, matchedSchool, defaultCourse, 50);
  };

  // Tự động cập nhật JSON Payload khi đổi Phả hệ hoặc Khóa học
  const updatePayloadPreview = (
    bType: BotType,
    ticket: InboxTicket,
    school: HierarchySchoolItem | null,
    course: CourseItem | null,
    qty: number
  ) => {
    let payload: Record<string, any> = {
      ticket_id: ticket.id,
      sender_email: ticket.sender_email
    };

    if (bType === 'workspace_rpa') {
      payload = {
        action: "school_create_order_and_enroll",
        ticket_id: ticket.id,
        hierarchy: {
          school_name: school?.school_name || "THPT Amsterdam",
          school_code: school?.school_code || "SCH_AMS",
          partner_name: school?.partner_name || "VietStem",
          distributor_name: school?.distributor_name || "PTV Distributor Demo"
        },
        order_details: {
          contact_info: ticket.sender_email,
          additional_notes: `Order tự động từ Ticket #${ticket.source_id || ticket.id.slice(0, 8)}`,
          courses: [
            {
              course_code: course?.course_code || "SWRP_01",
              course_name: course?.course_name || "SWRP 1: Exploring the Miniature World",
              lms_id: course?.lms_id || 102,
              lms_url: course?.lms_url || "http://learn.pythaverse.space/course/view.php?id=102",
              licenses: qty,
              start_date: "09/01/2026",
              end_date: "05/31/2027"
            }
          ]
        }
      };
    } else if (bType === 'keycloak_api') {
      payload = {
        action: "reset_password",
        target_email: ticket.sender_email,
        temp_pass: "Ptv@2026",
        ticket_id: ticket.id
      };
    } else if (bType === 'feedback_doc_triage') {
      payload = {
        action: "comment_and_assign",
        doc_url: ticket.doc_url || "",
        assignee_email: ticket.assigned_email || "hung.nguyenmanh@dtt.vn",
        category: ticket.category || "other",
        row_index: ticket.metadata?.row_index || 2,
        ticket_id: ticket.id
      };
    }

    setPayloadText(JSON.stringify(payload, null, 2));
  };

  // Gửi tạo Task (đảm bảo gọi đúng /tasks không lỗi 405)
  const handleConfirmCreateTask = async () => {
    if (!taskModalTicket) return;

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (e) {
      toast.error('JSON không hợp lệ! Vui lòng kiểm tra lại cú pháp.');
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
          <div className="font-bold">Đã tạo tác vụ Bot thành công!</div>
          <button
            onClick={() => navigate('/tasks')}
            className="text-violet-400 underline text-xs font-semibold cursor-pointer"
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

                      <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {ticket.ticket_timestamp || new Date(ticket.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {ticket.subject || 'Không có tiêu đề'}
                    </h3>
                  </div>

                  <a
                    href={directUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-300 text-xs font-medium rounded-xl transition shrink-0 shadow-2xs cursor-pointer"
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
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 border border-emerald-200 rounded-xl text-xs transition shadow-2xs cursor-pointer"
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

                {/* Tóm tắt Gemini AI */}
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

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="text-emerald-600 dark:text-emerald-400">✓ AI-Powered Feed</span>
                  </span>

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
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:border-rose-500/20 dark:text-rose-300 text-xs font-medium rounded-xl transition shadow-2xs cursor-pointer"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>Bỏ qua</span>
                        </button>

                        <button
                          onClick={() => handleNavigateToGitHub(ticket)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
                        >
                          <Github className="w-3.5 h-3.5" />
                          <span>Tạo Issue GitHub</span>
                        </button>

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

      {/* Modal Tạo Tác Vụ Bot Có Chọn Phả Hệ & Khóa Học */}
      {taskModalTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden space-y-4 p-6 max-h-[90vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Khởi Tạo Tác Vụ Bot Automation
                </h3>
              </div>
              <button
                onClick={() => setTaskModalTicket(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ticket Info */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {taskModalTicket.subject || 'Không có tiêu đề'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Người gửi: {taskModalTicket.sender_email} | Nguồn: {taskModalTicket.source.toUpperCase()}
              </div>
            </div>

            {/* Bot Type Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Chọn Cỗ Máy Bot Worker
              </label>
              <select
                value={selectedBotType}
                onChange={(e) => {
                  const bType = e.target.value as BotType;
                  setSelectedBotType(bType);
                  updatePayloadPreview(bType, taskModalTicket, selectedSchool, selectedCourse, licenseCount);
                }}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 font-medium outline-none focus:border-violet-500 cursor-pointer"
              >
                <option value="keycloak_api">🔑 Keycloak Identity Bot (Reset Pass / Quản Trị User)</option>
                <option value="workspace_rpa">🏢 Workspace License RPA (Tạo Order, Cấp Contract Phả Hệ)</option>
                <option value="feedback_doc_triage">📝 Feedback Doc Triage (Gắn tag @Doc & Check Sheet)</option>
                <option value="github_issue_creator">🐙 GitHub Issue Dispatcher (Tạo Bug Issue)</option>
              </select>
            </div>

            {/* 🎯 NẾU LÀ WORKSPACE RPA: HIỂN THỊ BỘ CHỌN PHẢ HỆ VÀ KHÓA HỌC */}
            {selectedBotType === 'workspace_rpa' && (
              <div className="space-y-3 p-4 rounded-2xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/70 dark:border-violet-800/40">

                {/* 1. Chọn Trường Học */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-violet-600" />
                    <span>Chọn Trường Học (Trong 480 Trường Phả Hệ):</span>
                  </label>
                  <select
                    value={selectedSchool?.school_code || ''}
                    onChange={(e) => {
                      const sch = schoolsList.find(s => s.school_code === e.target.value) || null;
                      setSelectedSchool(sch);
                      updatePayloadPreview(selectedBotType, taskModalTicket, sch, selectedCourse, licenseCount);
                    }}
                    className="w-full bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none cursor-pointer"
                  >
                    {schoolsList.map(s => (
                      <option key={s.school_code} value={s.school_code}>
                        {s.school_name} ({s.school_code})
                      </option>
                    ))}
                  </select>

                  {/* Hiển thị Breadcrumb Phả Hệ 3 Cấp */}
                  {selectedSchool && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800/60 text-[11px] font-mono text-violet-700 dark:text-violet-300 flex items-center gap-1.5 flex-wrap">
                      <Layers className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      <span>{selectedSchool.full_lineage}</span>
                    </div>
                  )}
                </div>

                {/* 2. Chọn Khóa Học & Số Lượng */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                      <span>Khóa Học LMS:</span>
                    </label>
                    <select
                      value={selectedCourse?.course_code || ''}
                      onChange={(e) => {
                        const crs = coursesList.find(c => c.course_code === e.target.value) || null;
                        setSelectedCourse(crs);
                        updatePayloadPreview(selectedBotType, taskModalTicket, selectedSchool, crs, licenseCount);
                      }}
                      className="w-full bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 outline-none cursor-pointer"
                    >
                      {coursesList.map(c => (
                        <option key={c.course_code} value={c.course_code}>
                          {c.course_name} (ID: {c.lms_id})
                        </option>
                      ))}
                    </select>

                    {/* Hiển thị link LMS trực tiếp */}
                    {selectedCourse && (
                      <a
                        href={selectedCourse.lms_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 font-mono pt-0.5"
                      >
                        <span>🔗 Mở trang khóa học LMS ({selectedCourse.lms_url})</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-violet-900 dark:text-violet-300">
                      Số Licenses (Học viên):
                    </label>
                    <input
                      type="number"
                      value={licenseCount}
                      min={1}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setLicenseCount(val);
                        updatePayloadPreview(selectedBotType, taskModalTicket, selectedSchool, selectedCourse, val);
                      }}
                      className="w-full bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 outline-none font-bold"
                    />
                  </div>
                </div>

              </div>
            )}

            {/* Payload JSON Editor */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Tham Số Thực Thi (Payload JSON)</span>
                <span className="text-[10px] text-slate-400 font-normal">Tự động đồng bộ theo lựa chọn</span>
              </label>
              <textarea
                rows={7}
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
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
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