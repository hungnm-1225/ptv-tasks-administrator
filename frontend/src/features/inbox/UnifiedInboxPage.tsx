// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect, useRef } from 'react';
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
  Layers,
  Search,
  Check,
  Plus,
  Trash2,
  Wand2,
  Clock,
  CheckCheck,
  Filter
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
  id?: string;
  course_id: number;
  category: string;
  course_name: string;
  lms_url: string;
}

interface OrderCourseSelection {
  category: string;
  course_id: number;
  course_name: string;
  lms_url: string;
  licenses: number;
  start_date: string;
  end_date: string;
}

// Hàm làm sạch toàn bộ thẻ HTML rác từ Gmail và OS Ticket
const stripHtmlTags = (htmlString: string | null | undefined): string => {
  if (!htmlString) return '';
  return htmlString
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
};

export const UnifiedInboxPage: React.FC = () => {
  const navigate = useNavigate();

  // State bộ lọc và sắp xếp
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const [tickets, setTickets] = useState<InboxTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{ filename: string; url: string } | null>(null);

  // Modal tạo Task Bot
  const [taskModalTicket, setTaskModalTicket] = useState<InboxTicket | null>(null);
  const [selectedBotType, setSelectedBotType] = useState<BotType>('workspace_rpa');
  const [payloadText, setPayloadText] = useState<string>('');
  const [creatingTask, setCreatingTask] = useState<boolean>(false);
  const [extractingCof, setExtractingCof] = useState<boolean>(false);

  // Dữ liệu Phả hệ & Khóa học
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>(['SWRP', 'IR', 'ASP', 'Other']);
  const [coursesList, setCoursesList] = useState<CourseItem[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<HierarchySchoolItem | null>(null);

  const [selectedCourses, setSelectedCourses] = useState<OrderCourseSelection[]>([
    {
      category: 'SWRP',
      course_id: 654,
      course_name: 'SWRP 9: LEANBOT Programming Applications with IoT [V2] (EN)',
      lms_url: 'https://learn.pythaverse.space/course/view.php?id=654',
      licenses: 174,
      start_date: '22-06-2026',
      end_date: '30-05-2027'
    }
  ]);

  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const [isSchoolDropdownOpen, setIsSchoolDropdownOpen] = useState<boolean>(false);
  const schoolDropdownRef = useRef<HTMLDivElement | null>(null);

  const SPREADSHEET_ID = "1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go";

  const loadTickets = async () => {
    setLoading(true);
    try {
      let endpoint = `/tickets?sort=${sortOrder}&status=${selectedStatus}&category=${selectedCategory}&source=${selectedSource}`;
      const data = await fetchApi<InboxTicket[]>(endpoint);
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
    const loadMetadata = async () => {
      try {
        const [schools, cats, courses] = await Promise.all([
          fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools'),
          fetchApi<string[]>('/workspace/categories'),
          fetchApi<CourseItem[]>('/workspace/courses')
        ]);
        setSchoolsList(schools || []);
        if (cats && cats.length > 0) setCategoriesList(cats);
        setCoursesList(courses || []);
      } catch (e) {
        console.warn('Chưa nạp được metadata:', e);
      }
    };
    loadMetadata();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (schoolDropdownRef.current && !schoolDropdownRef.current.contains(event.target as Node)) {
        setIsSchoolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadTickets();
  }, [selectedCategory, selectedSource, selectedStatus, sortOrder]);

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
      toast.success('Đã chuyển ticket vào mục Đã Bỏ Qua');
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

  const handleCompleteTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    try {
      await fetchApi(`/tickets/${ticketId}/complete`, { method: 'PUT' });
      toast.success('Đã đánh dấu hoàn thành ticket thành công!');
      await loadTickets();
    } catch (err) {
      toast.error('Lỗi hoàn thành ticket: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleNavigateToGitHub = (ticket: InboxTicket) => {
    navigate('/github', { state: { ticket } });
  };

  const handleOpenTaskModal = (ticket: InboxTicket) => {
    setTaskModalTicket(ticket);

    const fullText = `${ticket.subject || ''} ${ticket.raw_content || ''} ${ticket.submitter_name || ''}`.toLowerCase();
    const matchedSchool = schoolsList.find(s =>
      fullText.includes(s.school_name.toLowerCase()) ||
      fullText.includes(s.school_code.toLowerCase())
    ) || schoolsList[0] || null;

    setSelectedSchool(matchedSchool);
    setSchoolSearchQuery(matchedSchool ? `${matchedSchool.school_name} (${matchedSchool.school_code})` : '');

    let botType: BotType = 'workspace_rpa';
    if (ticket.category === 'account_keycloak') botType = 'keycloak_api';
    else if (ticket.category === 'lms_enroll' || ticket.category === 'license') botType = 'workspace_rpa';
    else if (ticket.source === 'google_form') botType = 'feedback_doc_triage';

    setSelectedBotType(botType);
    syncPayloadJson(botType, ticket, matchedSchool, selectedCourses);
  };

  const syncPayloadJson = (
    bType: BotType,
    ticket: InboxTicket,
    school: HierarchySchoolItem | null,
    courses: OrderCourseSelection[]
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
          school_name: school?.school_name || "Pythaverse School Demo",
          school_code: school?.school_code || "SCH_10266",
          partner_name: school?.partner_name || "Partner DTTE test",
          distributor_name: school?.distributor_name || "PTV Distributor Demo"
        },
        order_details: {
          contact_info: ticket.sender_email,
          additional_notes: `Auto Order from Ticket #${ticket.source_id || ticket.id.slice(0, 8)}`,
          courses: courses.map(c => ({
            category: c.category,
            course_id: c.course_id,
            course_name: c.course_name,
            lms_url: c.lms_url,
            licenses: c.licenses,
            start_date: c.start_date,
            end_date: c.end_date
          }))
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

  const handleAddCourseRow = () => {
    const defaultCourse = coursesList.find(c => c.category === 'SWRP') || coursesList[0] || {
      course_id: 766,
      category: 'SWRP',
      course_name: 'SWRP 1: Exploring the Miniature World with PMinetest (EN)',
      lms_url: 'https://learn.pythaverse.space/course/view.php?id=766'
    };

    const newCourses = [
      ...selectedCourses,
      {
        category: defaultCourse.category,
        course_id: defaultCourse.course_id,
        course_name: defaultCourse.course_name,
        lms_url: defaultCourse.lms_url,
        licenses: 50,
        start_date: '01-09-2026',
        end_date: '31-05-2027'
      }
    ];

    setSelectedCourses(newCourses);
    if (taskModalTicket) syncPayloadJson(selectedBotType, taskModalTicket, selectedSchool, newCourses);
  };

  const handleRemoveCourseRow = (index: number) => {
    if (selectedCourses.length <= 1) {
      toast.error('Phải có ít nhất 1 khóa học trong Order!');
      return;
    }
    const newCourses = selectedCourses.filter((_, idx) => idx !== index);
    setSelectedCourses(newCourses);
    if (taskModalTicket) syncPayloadJson(selectedBotType, taskModalTicket, selectedSchool, newCourses);
  };

  const handleCourseRowChange = (index: number, field: keyof OrderCourseSelection, value: any) => {
    const updated = [...selectedCourses];
    if (field === 'category') {
      const matchingCourses = coursesList.filter(c => c.category === value);
      const firstCourse = matchingCourses[0] || coursesList[0];
      if (firstCourse) {
        updated[index] = {
          ...updated[index],
          category: value,
          course_id: firstCourse.course_id,
          course_name: firstCourse.course_name,
          lms_url: firstCourse.lms_url
        };
      }
    } else if (field === 'course_id') {
      const selectedObj = coursesList.find(c => c.course_id === parseInt(value));
      if (selectedObj) {
        updated[index] = {
          ...updated[index],
          course_id: selectedObj.course_id,
          course_name: selectedObj.course_name,
          lms_url: selectedObj.lms_url,
          category: selectedObj.category
        };
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }

    setSelectedCourses(updated);
    if (taskModalTicket) syncPayloadJson(selectedBotType, taskModalTicket, selectedSchool, updated);
  };

  const handleAutoExtractCof = async () => {
    if (!taskModalTicket) return;
    setExtractingCof(true);
    try {
      const res = await fetchApi<any>('/workspace/extract-cof', {
        method: 'POST',
        body: JSON.stringify({ cof_text: taskModalTicket.raw_content || taskModalTicket.subject })
      });

      const matchedSch = schoolsList.find(s =>
        s.school_name.toLowerCase().includes(res.school_name.toLowerCase())
      ) || selectedSchool;

      if (matchedSch) {
        setSelectedSchool(matchedSch);
        setSchoolSearchQuery(`${matchedSch.school_name} (${matchedSch.school_code})`);
      }

      if (res.courses && res.courses.length > 0) {
        setSelectedCourses(res.courses);
        syncPayloadJson(selectedBotType, taskModalTicket, matchedSch, res.courses);
      }

      toast.success(`AI đã bóc tách thành công ${res.courses?.length || 1} khóa học chuẩn cho trường [${res.school_name}]!`);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi bóc tách COF: ' + (err as Error).message);
    } finally {
      setExtractingCof(false);
    }
  };

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
          <div className="font-bold">Đã tạo tác vụ Bot thành công! (Ticket chuyển sang Đang xử lý)</div>
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
          <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 text-[10px] font-semibold rounded-lg flex items-center gap-1 shadow-2xs">
            <Mail className="w-3 h-3" /> GMAIL
          </span>
        );
      case 'google_form':
        return (
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 text-[10px] font-semibold rounded-lg flex items-center gap-1 shadow-2xs">
            <FileText className="w-3 h-3" /> FORM
          </span>
        );
      case 'osticket':
        return (
          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 text-[10px] font-semibold rounded-lg flex items-center gap-1 shadow-2xs">
            <Ticket className="w-3 h-3" /> OS TICKET
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 text-[10px] font-semibold rounded-lg">
            {source.toUpperCase()}
          </span>
        );
    }
  };

  const renderStatusPill = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 text-[10px] font-bold rounded-md flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> ĐÃ XỬ LÝ
          </span>
        );
      case 'processing':
        return (
          <span className="px-2 py-0.5 bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300 text-[10px] font-bold rounded-md flex items-center gap-1 animate-pulse">
            <Clock className="w-3 h-3" /> ĐANG XỬ LÝ (BOT)
          </span>
        );
      case 'dismissed':
        return (
          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 text-[10px] font-bold rounded-md flex items-center gap-1">
            <XCircle className="w-3 h-3" /> ĐÃ BỎ QUA
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 text-[10px] font-bold rounded-md">
            CHỜ XỬ LÝ
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Tiêu đề */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Unified Inbox Feed</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage.
        </p>
      </div>

      {/* 🎯 THANH CÔNG CỤ COMPACT: 3 SELECTION BOXES + NÚT SẮP XẾP GỌN GÀNG TRÊN 1 DÒNG */}
      <div className="bg-white dark:bg-slate-800/90 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs flex items-center justify-between flex-wrap gap-3">

        {/* Nhóm 3 Dropdown Selection Boxes */}
        <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">

          {/* 1. Nguồn */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Nguồn:</span>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-800">Tất cả Nguồn</option>
              <option value="gmail" className="bg-white dark:bg-slate-800">✉️ Gmail</option>
              <option value="google_form" className="bg-white dark:bg-slate-800">📝 Google Form</option>
              <option value="osticket" className="bg-white dark:bg-slate-800">🎫 OS Ticket</option>
            </select>
          </div>

          {/* 2. Phân loại */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Phân loại:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-800">Tất cả Category</option>
              <option value="bug" className="bg-white dark:bg-slate-800">🐛 System Bugs</option>
              <option value="account_keycloak" className="bg-white dark:bg-slate-800">🔑 Keycloak/Account</option>
              <option value="lms_enroll" className="bg-white dark:bg-slate-800">🎓 LMS Enroll</option>
              <option value="license" className="bg-white dark:bg-slate-800">📜 License</option>
              <option value="other" className="bg-white dark:bg-slate-800">📌 Khác</option>
            </select>
          </div>

          {/* 3. Trạng thái */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Trạng thái:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-800">Tất cả Trạng Thái</option>
              <option value="pending" className="bg-white dark:bg-slate-800">⏳ Chờ Xử Lý</option>
              <option value="processing" className="bg-white dark:bg-slate-800">🔄 Đang Xử Lý (Bot)</option>
              <option value="completed" className="bg-white dark:bg-slate-800">✅ Đã Giải Quyết</option>
              <option value="dismissed" className="bg-white dark:bg-slate-800">🗑️ Đã Bỏ Qua</option>
            </select>
          </div>

        </div>

        {/* 🎯 Nút Sắp Xếp: Đã Đưa Xuống Cùng Dòng Filter */}
        <button
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 shadow-2xs transition shrink-0 cursor-pointer"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          <span>{sortOrder === 'desc' ? "Mới nhất ➔ Cũ nhất" : "Cũ nhất ➔ Mới nhất"}</span>
        </button>

      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-violet-600" />
          <span className="text-xs font-medium">Đang nạp danh sách ticket...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Không có ticket nào trong bộ lọc này</h3>
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const isExpanded = expandedContent[ticket.id] || false;
            const directUrl = getDirectSourceUrl(ticket);
            const attachments = ticket.attachments || ticket.metadata?.attachments || [];
            const isDismissed = ticket.status === 'dismissed';
            const isCompleted = ticket.status === 'completed';
            const cleanRawContent = stripHtmlTags(ticket.raw_content);

            return (
              <div key={ticket.id} className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 space-y-4 shadow-xs transition-all">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {renderSourceBadge(ticket.source)}
                      {renderStatusPill(ticket.status)}

                      {/* Dropdown Đổi Tag Inline */}
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5">
                        <Tag className="w-3 h-3 text-violet-600" />
                        <select
                          value={ticket.category || 'other'}
                          onChange={(e) => handleCategoryChange(ticket.id, e.target.value)}
                          className="bg-transparent text-violet-700 dark:text-violet-300 text-[10px] font-semibold uppercase outline-none cursor-pointer"
                        >
                          <option value="bug">BUG</option>
                          <option value="account_keycloak">KEYCLOAK</option>
                          <option value="lms_enroll">LMS ENROLL</option>
                          <option value="license">LICENSE</option>
                          <option value="other">OTHER</option>
                        </select>
                      </div>

                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                        {ticket.submitter_name || ticket.sender_email}
                      </span>

                      <span className="text-xs text-slate-400 flex items-center gap-1">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-300 text-xs font-medium rounded-xl transition shrink-0 shadow-2xs cursor-pointer"
                  >
                    <span>Mở trang gốc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Tóm tắt Gemini AI */}
                <div className="bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-800/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                    <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                    <span>Tóm tắt & Đề xuất tự động từ Gemini AI</span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                    {ticket.ai_summary || "Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích..."}
                  </p>
                  {ticket.assigned_name && (
                    <div className="text-[11px] text-slate-500 pt-2 border-t border-violet-200/60 dark:border-violet-800/40">
                      👤 Phân công đề xuất: <strong className="text-violet-700 dark:text-violet-300 font-semibold">{ticket.assigned_name}</strong> ({ticket.assigned_email})
                    </div>
                  )}
                </div>

                {/* 🎯 NỘI DUNG EMAIL GỐC MỞ RỘNG (ĐÃ BÓC SẠCH THẺ HTML) */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto font-mono leading-relaxed shadow-inner">
                    {cleanRawContent || "(Không có nội dung văn bản gốc)"}
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-1 flex-wrap gap-2">

                  {/* Cụm trái: AI-Powered & Nút Mở rộng nội dung gốc */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ AI-Powered Feed
                    </span>

                    {/* Nút Xem/Thu gọn nội dung gốc */}
                    <button
                      type="button"
                      onClick={() => setExpandedContent(prev => ({ ...prev, [ticket.id]: !prev[ticket.id] }))}
                      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium transition cursor-pointer"
                    >
                      <FileCode className="w-3.5 h-3.5 text-slate-400" />
                      <span>{isExpanded ? "Thu gọn nội dung gốc" : "Xem nội dung gốc"}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Cụm phải: Các nút Hành động */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {isDismissed ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition shadow-2xs cursor-pointer"
                      >
                        {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>Khôi phục Hòm Thư</span>
                      </button>
                    ) : isCompleted ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Mở lại Ticket</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 text-xs font-medium rounded-xl transition shadow-2xs cursor-pointer"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>Bỏ qua</span>
                        </button>

                        <button
                          onClick={() => handleCompleteTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-xs font-semibold rounded-xl transition shadow-2xs cursor-pointer"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                          <span>Hoàn thành</span>
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

      {/* Modal Tạo Tác Vụ Bot (Multi-Course & Lineage Selector) */}
      {taskModalTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden space-y-4 p-6 max-h-[92vh] overflow-y-auto">

            {/* Header & Nút AI Bóc Tách COF */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Khởi Tạo Tác Vụ Bot Automation
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {selectedBotType === 'workspace_rpa' && (
                  <button
                    type="button"
                    onClick={handleAutoExtractCof}
                    disabled={extractingCof}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200/80 text-xs font-semibold rounded-xl transition cursor-pointer shadow-2xs hover:bg-violet-100"
                  >
                    {extractingCof ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    <span>AI Tự Động Bóc Tách File COF</span>
                  </button>
                )}

                <button onClick={() => setTaskModalTicket(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Ticket Info */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {taskModalTicket.subject || 'Không có tiêu đề'}
              </div>
              <div className="text-[11px] text-slate-500">
                Người gửi: {taskModalTicket.sender_email} | Nguồn: {taskModalTicket.source.toUpperCase()}
              </div>
            </div>

            {/* Selector Bot Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Chọn Cỗ Máy Bot Worker</label>
              <select
                value={selectedBotType}
                onChange={(e) => {
                  const bType = e.target.value as BotType;
                  setSelectedBotType(bType);
                  syncPayloadJson(bType, taskModalTicket, selectedSchool, selectedCourses);
                }}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 font-medium outline-none focus:border-violet-500 cursor-pointer"
              >
                <option value="workspace_rpa">🏢 Workspace License RPA (Tạo Order, Cấp Contract Phả Hệ)</option>
                <option value="keycloak_api">🔑 Keycloak Identity Bot (Reset Pass / Quản Trị User)</option>
                <option value="feedback_doc_triage">📝 Feedback Doc Triage (Gắn tag @Doc & Check Sheet)</option>
                <option value="github_issue_creator">🐙 GitHub Issue Dispatcher (Tạo Bug Issue)</option>
              </select>
            </div>

            {/* PHẦN CHỌN PHẢ HỆ VÀ NHIỀU KHÓA HỌC */}
            {selectedBotType === 'workspace_rpa' && (
              <div className="space-y-4 p-4 rounded-2xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/70 dark:border-violet-800/40">

                {/* 1. Searchable School Combobox */}
                <div className="space-y-1.5 relative" ref={schoolDropdownRef}>
                  <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-violet-600" />
                      <span>Trường Học (Tra Cứu Trong 480 Trường Phả Hệ):</span>
                    </span>
                    <span className="text-[10px] text-violet-600 font-normal">Gõ tên hoặc mã SCH_</span>
                  </label>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Gõ để tìm kiếm trường học (VD: Amsterdam, San Beda, 10266...)"
                      value={schoolSearchQuery}
                      onFocus={() => setIsSchoolDropdownOpen(true)}
                      onChange={(e) => {
                        setSchoolSearchQuery(e.target.value);
                        setIsSchoolDropdownOpen(true);
                      }}
                      className="w-full pl-9 pr-8 bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 font-medium"
                    />
                  </div>

                  {isSchoolDropdownOpen && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-52 overflow-y-auto p-1.5 space-y-1">
                      {schoolsList
                        .filter(s => s.school_name.toLowerCase().includes(schoolSearchQuery.toLowerCase()) || s.school_code.toLowerCase().includes(schoolSearchQuery.toLowerCase()))
                        .slice(0, 30)
                        .map(s => (
                          <button
                            key={s.school_code}
                            type="button"
                            onClick={() => {
                              setSelectedSchool(s);
                              setSchoolSearchQuery(`${s.school_name} (${s.school_code})`);
                              setIsSchoolDropdownOpen(false);
                              syncPayloadJson(selectedBotType, taskModalTicket, s, selectedCourses);
                            }}
                            className="w-full text-left p-2 rounded-xl text-xs hover:bg-violet-50 dark:hover:bg-slate-700 flex items-center justify-between cursor-pointer"
                          >
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{s.school_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">Mã: {s.school_code} | Partner: {s.partner_name}</div>
                            </div>
                            {selectedSchool?.school_code === s.school_code && <Check className="w-4 h-4 text-violet-600" />}
                          </button>
                        ))}
                    </div>
                  )}

                  {selectedSchool && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-violet-200 text-[11px] font-mono text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      <span>{selectedSchool.full_lineage}</span>
                    </div>
                  )}
                </div>

                {/* 2. Multi-Course Rows */}
                <div className="space-y-3 pt-2 border-t border-violet-200/60 dark:border-violet-800/40">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                      <span>Danh Sách Khóa Học Trong Order ({selectedCourses.length} Môn):</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleAddCourseRow}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg font-semibold hover:bg-sky-100 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm Khóa Học</span>
                    </button>
                  </div>

                  {selectedCourses.map((cRow, idx) => {
                    const filteredCoursesForCategory = coursesList.filter(c => c.category === cRow.category);

                    return (
                      <div key={idx} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-violet-200 dark:border-violet-700 space-y-2 relative shadow-2xs">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          <span>Khóa học #{idx + 1}</span>
                          {selectedCourses.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCourseRow(idx)}
                              className="text-rose-500 hover:text-rose-700 p-0.5 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Category & Course Selection */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500">1. Phân loại:</label>
                            <select
                              value={cRow.category}
                              onChange={(e) => handleCourseRowChange(idx, 'category', e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-lg p-1.5 text-xs font-medium cursor-pointer"
                            >
                              {categoriesList.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-semibold text-slate-500">2. Chọn khóa học ({filteredCoursesForCategory.length} môn):</label>
                            <select
                              value={cRow.course_id}
                              onChange={(e) => handleCourseRowChange(idx, 'course_id', e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-lg p-1.5 text-xs font-medium cursor-pointer truncate"
                            >
                              {filteredCoursesForCategory.map(c => (
                                <option key={c.course_id} value={c.course_id}>
                                  {c.course_name} (ID: {c.course_id})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Licenses & Dates */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500">Số Licenses:</label>
                            <input
                              type="number"
                              value={cRow.licenses}
                              min={1}
                              onChange={(e) => handleCourseRowChange(idx, 'licenses', parseInt(e.target.value) || 1)}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-lg p-1.5 text-xs font-bold"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-slate-500">Start Date:</label>
                            <input
                              type="text"
                              value={cRow.start_date}
                              placeholder="dd-mm-yyyy"
                              onChange={(e) => handleCourseRowChange(idx, 'start_date', e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-lg p-1.5 text-xs font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-slate-500">End Date:</label>
                            <input
                              type="text"
                              value={cRow.end_date}
                              placeholder="dd-mm-yyyy"
                              onChange={(e) => handleCourseRowChange(idx, 'end_date', e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-lg p-1.5 text-xs font-mono"
                            />
                          </div>
                        </div>

                        {/* LMS Link */}
                        <div className="pt-0.5">
                          <a
                            href={cRow.lms_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 font-mono"
                          >
                            <span>🔗 Mở trang khóa học LMS ({cRow.lms_url})</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}

            {/* Payload JSON Editor */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Tham Số Thực Thi (Payload JSON)</span>
                <span className="text-[10px] text-slate-400 font-normal">Đồng bộ tự động theo các khóa học</span>
              </label>
              <textarea
                rows={7}
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 leading-relaxed"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setTaskModalTicket(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={creatingTask}
                onClick={handleConfirmCreateTask}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {creatingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Lưu Tác Vụ Vào Hàng Đợi Duyệt</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};