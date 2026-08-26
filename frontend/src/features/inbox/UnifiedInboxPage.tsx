// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Eye,
  Download,
  KeyRound,
  ShieldCheck,
  UserX,
  Zap,
  Sliders
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

// ⚡ TRỢ THỦ PERSISTENT STORAGE (LƯU LOCALSTORAGE - HIỂN THỊ TỨC THÌ 0MS)
const getInboxCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(`ptv_inbox_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const setInboxCache = (key: string, data: any) => {
  try {
    localStorage.setItem(`ptv_inbox_${key}`, JSON.stringify(data));
  } catch { }
};

// Hàm làm sạch thẻ HTML
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

const formatDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${mins} - ${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
};

const FileSpreadsheetIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || 'w-4 h-4'}
  >
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M8 13h2" />
    <path d="M14 13h2" />
    <path d="M8 17h2" />
    <path d="M14 17h2" />
  </svg>
);

export const UnifiedInboxPage: React.FC = () => {
  const navigate = useNavigate();

  // State bộ lọc và tìm kiếm
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // ⚡ KHỞI TẠO STATE TỪ LOCALSTORAGE (0MS)
  const filterCacheKey = useMemo(() => {
    return `list_${selectedStatus}_${selectedCategory}_${selectedSource}_${sortOrder}`;
  }, [selectedStatus, selectedCategory, selectedSource, sortOrder]);

  const initialCachedTickets = useMemo(() => {
    return getInboxCache<InboxTicket[]>(filterCacheKey) || [];
  }, [filterCacheKey]);

  const [tickets, setTickets] = useState<InboxTicket[]>(initialCachedTickets);
  const [loading, setLoading] = useState<boolean>(initialCachedTickets.length === 0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{ filename: string; url: string } | null>(null);

  // Modal Tạo Task Bot
  const [taskModalTicket, setTaskModalTicket] = useState<InboxTicket | null>(null);
  const [selectedBotType, setSelectedBotType] = useState<BotType>('workspace_rpa');
  const [workspaceSubFlow, setWorkspaceSubFlow] = useState<'end_to_end' | 'order_contract' | 'bulk_accounts' | 'lms_enroll'>('end_to_end');

  // Safe-by-Default Keycloak Controls
  const [kcTargetEmail, setKcTargetEmail] = useState<string>('');
  const [kcEnableResetPass, setKcEnableResetPass] = useState<boolean>(false);
  const [kcTempPass, setKcTempPass] = useState<string>('Ptv@2026');
  const [kcForceChange, setKcForceChange] = useState<boolean>(true);

  const [kcEnableVerify, setKcEnableVerify] = useState<boolean>(false);
  const [kcVerifyAction, setKcVerifyAction] = useState<'verify' | 'unverify'>('verify');

  const [kcEnableStatus, setKcEnableStatus] = useState<boolean>(false);
  const [kcStatusAction, setKcStatusAction] = useState<'enable' | 'disable'>('enable');

  const [payloadText, setPayloadText] = useState<string>('');
  const [creatingTask, setCreatingTask] = useState<boolean>(false);
  const [extractingCof, setExtractingCof] = useState<boolean>(false);

  // Metadata Phả hệ & Khóa học (Lấy nhanh từ Storage)
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>(() => getInboxCache<HierarchySchoolItem[]>('schools') || []);
  const [categoriesList, setCategoriesList] = useState<string[]>(() => getInboxCache<string[]>('categories') || ['SWRP', 'IR', 'ASP', 'Other']);
  const [coursesList, setCoursesList] = useState<CourseItem[]>(() => getInboxCache<CourseItem[]>('courses') || []);
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const SPREADSHEET_ID = '1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go';

  // ⚡ SWR TẢI TICKETS (KHÔNG BẬT SPINNER NẾU ĐÃ CÓ DỮ LIỆU CACHE)
  const loadTickets = useCallback(async (forceSpinner = false) => {
    const cached = getInboxCache<InboxTicket[]>(filterCacheKey);
    if (cached && !forceSpinner) {
      setTickets(cached);
      setLoading(false);
    } else if (forceSpinner || !cached) {
      setLoading(true);
    }

    try {
      const endpoint = `/tickets?sort=${sortOrder}&status=${selectedStatus}&category=${selectedCategory}&source=${selectedSource}`;
      const data = await fetchApi<InboxTicket[]>(endpoint);
      setInboxCache(filterCacheKey, data || []);
      setTickets(data || []);
    } catch (err) {
      if (!cached) {
        toast.error('Không thể tải danh sách ticket: ' + (err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [filterCacheKey, sortOrder, selectedStatus, selectedCategory, selectedSource]);

  // Nạp metadata ngầm
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [schools, cats, courses] = await Promise.all([
          fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools'),
          fetchApi<string[]>('/workspace/categories'),
          fetchApi<CourseItem[]>('/workspace/courses')
        ]);
        if (schools) {
          setInboxCache('schools', schools);
          setSchoolsList(schools);
        }
        if (cats && cats.length > 0) {
          setInboxCache('categories', cats);
          setCategoriesList(cats);
        }
        if (courses) {
          setInboxCache('courses', courses);
          setCoursesList(courses);
        }
      } catch (e) {
        console.warn('Chưa nạp được metadata ngầm:', e);
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
  }, [loadTickets]);

  // Tìm kiếm tức thì đa trường (0ms)
  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return tickets;
    const query = searchQuery.trim().toLowerCase();

    return tickets.filter((t) => {
      const matchSubject = t.subject?.toLowerCase().includes(query);
      const matchSender = t.sender_email?.toLowerCase().includes(query);
      const matchSubmitter = t.submitter_name?.toLowerCase().includes(query);
      const matchSummary = t.ai_summary?.toLowerCase().includes(query);
      const matchSourceId = t.source_id?.toLowerCase().includes(query);
      const matchRaw = t.raw_content?.toLowerCase().includes(query);
      const matchCountry = t.country?.toLowerCase().includes(query);
      const matchSchoolMeta = t.metadata?.school_name?.toLowerCase().includes(query);

      return (
        matchSubject ||
        matchSender ||
        matchSubmitter ||
        matchSummary ||
        matchSourceId ||
        matchRaw ||
        matchCountry ||
        matchSchoolMeta
      );
    });
  }, [tickets, searchQuery]);

  const getDirectSourceUrl = (ticket: InboxTicket) => {
    if (ticket.source === 'gmail') {
      return `https://mail.google.com/mail/u/0/#search/id%3A${ticket.source_id}`;
    } else if (ticket.source === 'google_form') {
      if (ticket.doc_url) return ticket.doc_url;
      const rowIdx = ticket.metadata?.row_index || 2;
      return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0&range=A${rowIdx}:P${rowIdx}`;
    } else if (ticket.source === 'osticket') {
      return `https://support.pythaverse.space/scp/tickets.php?id=${ticket.source_id}`;
    }
    return '#';
  };

  // ⚡ OPTIMISTIC UI: ĐỔI CATEGORY NGAY TỨC THÌ
  const handleCategoryChange = async (ticketId: string, newCategory: string) => {
    const prevTickets = [...tickets];
    const updated = tickets.map(t => t.id === ticketId ? { ...t, category: newCategory as any } : t);
    setTickets(updated);
    setInboxCache(filterCacheKey, updated);
    toast.success(`Đã cập nhật phân loại thành [${newCategory.toUpperCase()}]`);

    try {
      await fetchApi(`/tickets/${ticketId}/category`, {
        method: 'PUT',
        body: JSON.stringify({ category: newCategory })
      });
    } catch (err) {
      setTickets(prevTickets);
      toast.error('Lỗi đổi Category: ' + (err as Error).message);
    }
  };

  // ⚡ OPTIMISTIC UI: BỎ QUA TICKET
  const handleDismissTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    const prevTickets = [...tickets];
    const updated = selectedStatus === 'all'
      ? tickets.filter(t => t.id !== ticketId)
      : tickets.map(t => t.id === ticketId ? { ...t, status: 'dismissed' as any } : t);

    setTickets(updated);
    setInboxCache(filterCacheKey, updated);
    toast.success('Đã chuyển ticket vào mục Đã Bỏ Qua');

    try {
      await fetchApi(`/tickets/${ticketId}/dismiss`, { method: 'PUT' });
    } catch (err) {
      setTickets(prevTickets);
      toast.error('Lỗi bỏ qua ticket: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  // ⚡ OPTIMISTIC UI: KHÔI PHỤC TICKET
  const handleRestoreTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    const prevTickets = [...tickets];
    const updated = tickets.map(t => t.id === ticketId ? { ...t, status: 'pending' as any } : t);
    setTickets(updated);
    setInboxCache(filterCacheKey, updated);
    toast.success('Đã khôi phục ticket về Hòm Thư');

    try {
      await fetchApi(`/tickets/${ticketId}/restore`, { method: 'PUT' });
    } catch (err) {
      setTickets(prevTickets);
      toast.error('Lỗi khôi phục ticket: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  // ⚡ OPTIMISTIC UI: HOÀN THÀNH TICKET
  const handleCompleteTask = async (ticketId: string) => {
    setActionLoading(ticketId);
    const prevTickets = [...tickets];
    const updated = tickets.map(t => t.id === ticketId ? { ...t, status: 'completed' as any } : t);
    setTickets(updated);
    setInboxCache(filterCacheKey, updated);
    toast.success('Đã đánh dấu hoàn thành ticket!');

    try {
      await fetchApi(`/tickets/${ticketId}/complete`, { method: 'PUT' });
    } catch (err) {
      setTickets(prevTickets);
      toast.error('Lỗi hoàn thành ticket: ' + (err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenTaskModal = (ticket: InboxTicket) => {
    setTaskModalTicket(ticket);

    const fullText = `${ticket.subject || ''} ${ticket.raw_content || ''} ${ticket.submitter_name || ''} ${ticket.metadata?.school_name || ''}`.toLowerCase();
    const matchedSchool =
      schoolsList.find(
        (s) =>
          fullText.includes(s.school_name.toLowerCase()) ||
          fullText.includes(s.school_code.toLowerCase())
      ) ||
      schoolsList[0] ||
      null;

    setSelectedSchool(matchedSchool);
    setSchoolSearchQuery(matchedSchool ? `${matchedSchool.school_name} (${matchedSchool.school_code})` : '');
    setKcTargetEmail(ticket.sender_email);

    setKcEnableResetPass(false);
    setKcEnableVerify(false);
    setKcEnableStatus(false);

    let botType: BotType = 'workspace_rpa';
    let subFlow: 'end_to_end' | 'order_contract' | 'bulk_accounts' | 'lms_enroll' = 'end_to_end';

    if (ticket.category === 'account_keycloak') {
      botType = 'keycloak_api';
      setKcEnableResetPass(true);
    } else if (ticket.category === 'lms_enroll') {
      botType = 'workspace_rpa';
      subFlow = 'lms_enroll';
    } else if (ticket.category === 'license') {
      botType = 'workspace_rpa';
      subFlow = 'order_contract';
    } else if (ticket.source === 'google_form') {
      botType = 'feedback_doc_triage';
    }

    setSelectedBotType(botType);
    setWorkspaceSubFlow(subFlow);
    generatePayloadJson(botType, subFlow, ticket, matchedSchool, selectedCourses, ticket.sender_email, false, 'Ptv@2026', true, false, 'verify', false, 'enable');
  };

  const generatePayloadJson = (
    bType: BotType,
    wSubFlow: string,
    ticket: InboxTicket | null,
    school: HierarchySchoolItem | null,
    courses: OrderCourseSelection[],
    targetEmail: string,
    enReset: boolean,
    tempPass: string,
    forceChange: boolean,
    enVerify: boolean,
    verifyAct: 'verify' | 'unverify',
    enStatus: boolean,
    statusAct: 'enable' | 'disable'
  ) => {
    const tId = ticket?.id || 'manual-standalone-task';
    const firstAttachmentUrl = ticket?.attachments?.[0]?.url || '';

    let payload: Record<string, any> = {
      ticket_id: tId,
      sender_email: targetEmail || ticket?.sender_email || 'admin@dtt.vn'
    };

    if (bType === 'workspace_rpa') {
      if (wSubFlow === 'end_to_end') {
        payload = {
          action: 'pipeline_end_to_end',
          ticket_id: tId,
          school_name: school?.school_name || 'Pythaverse School',
          attachment_url: firstAttachmentUrl,
          hierarchy: {
            school_name: school?.school_name || 'Pythaverse School',
            school_code: school?.school_code || 'SCH_10266',
            partner_name: school?.partner_name || 'Partner Demo',
            distributor_name: school?.distributor_name || 'PTV Distributor Demo'
          },
          order_courses: courses.map((c) => ({
            category: c.category,
            course_id: c.course_id,
            course_name: c.course_name,
            lms_url: c.lms_url,
            licenses: c.licenses,
            start_date: c.start_date,
            end_date: c.end_date
          })),
          auto_enroll_lms: true
        };
      } else if (wSubFlow === 'order_contract') {
        payload = {
          action: 'create_order_and_contracts',
          ticket_id: tId,
          school_name: school?.school_name || 'Pythaverse School',
          hierarchy: {
            school_name: school?.school_name,
            school_code: school?.school_code,
            partner_name: school?.partner_name,
            distributor_name: school?.distributor_name
          },
          courses: courses.map((c) => ({
            category: c.category,
            course_id: c.course_id,
            licenses: c.licenses,
            start_date: c.start_date,
            end_date: c.end_date
          }))
        };
      } else if (wSubFlow === 'bulk_accounts') {
        payload = {
          action: 'bulk_account_creation',
          ticket_id: tId,
          school_name: school?.school_name || 'Pythaverse School',
          school_code: school?.school_code || 'SCH_10266',
          attachment_url: firstAttachmentUrl
        };
      } else if (wSubFlow === 'lms_enroll') {
        payload = {
          action: 'school_enroll_users',
          ticket_id: tId,
          course_id: courses[0]?.course_id || 654,
          course_name: courses[0]?.course_name || 'SWRP Course',
          school_name: school?.school_name || 'Pythaverse School'
        };
      }
    } else if (bType === 'keycloak_api') {
      const actionsToRun: string[] = [];
      const configObj: Record<string, any> = {
        ticket_id: tId,
        target_email: targetEmail || ticket?.sender_email
      };

      if (enReset) {
        actionsToRun.push('reset_password');
        configObj.temporary_password = tempPass;
        configObj.force_change_on_first_login = forceChange;
      }
      if (enVerify) {
        actionsToRun.push(verifyAct === 'verify' ? 'mark_email_verified' : 'mark_email_unverified');
      }
      if (enStatus) {
        actionsToRun.push(statusAct === 'enable' ? 'enable_account' : 'disable_account');
      }

      if (actionsToRun.length === 0) {
        configObj.action = 'noop_safe_preview';
        configObj.note = 'Chưa chọn hành động nào. Gạt công tắc bên dưới để kích hoạt.';
      } else {
        configObj.actions = actionsToRun;
      }

      payload = configObj;
    } else if (bType === 'feedback_doc_triage') {
      payload = {
        action: 'comment_and_assign',
        doc_url: ticket?.doc_url || '',
        assignee_email: ticket?.assigned_email || 'hung.nguyenmanh@dtt.vn',
        category: ticket?.category || 'other',
        row_index: ticket?.metadata?.row_index || 2,
        ticket_id: tId
      };
    } else if (bType === 'github_issue_creator') {
      payload = {
        action: 'create_github_issue',
        ticket_id: tId,
        title: `[BUG] ${ticket?.subject || 'Báo lỗi từ Ticket'}`,
        assignees: ['nguyenthetrung5-PTV', 'thetrungdtt']
      };
    }

    setPayloadText(JSON.stringify(payload, null, 2));
  };

  const handleAddCourseRow = () => {
    const defaultCourse = coursesList.find((c) => c.category === 'SWRP') || coursesList[0] || {
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
    generatePayloadJson(selectedBotType, workspaceSubFlow, taskModalTicket, selectedSchool, newCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
  };

  const handleRemoveCourseRow = (index: number) => {
    if (selectedCourses.length <= 1) {
      toast.error('Phải có ít nhất 1 khóa học trong danh sách!');
      return;
    }
    const newCourses = selectedCourses.filter((_, idx) => idx !== index);
    setSelectedCourses(newCourses);
    generatePayloadJson(selectedBotType, workspaceSubFlow, taskModalTicket, selectedSchool, newCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
  };

  const handleCourseRowChange = (index: number, field: keyof OrderCourseSelection, value: any) => {
    const updated = [...selectedCourses];
    if (field === 'category') {
      const matchingCourses = coursesList.filter((c) => c.category === value);
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
      const selectedObj = coursesList.find((c) => c.course_id === parseInt(value));
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
    generatePayloadJson(selectedBotType, workspaceSubFlow, taskModalTicket, selectedSchool, updated, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
  };

  const handleAutoExtractCof = async () => {
    if (!taskModalTicket) return;
    setExtractingCof(true);
    try {
      const res = await fetchApi<any>('/workspace/extract-cof', {
        method: 'POST',
        body: JSON.stringify({ cof_text: taskModalTicket.raw_content || taskModalTicket.subject })
      });

      const matchedSch =
        schoolsList.find((s) => s.school_name.toLowerCase().includes(res.school_name?.toLowerCase() || '')) ||
        selectedSchool;

      if (matchedSch) {
        setSelectedSchool(matchedSch);
        setSchoolSearchQuery(`${matchedSch.school_name} (${matchedSch.school_code})`);
      }

      if (res.courses && res.courses.length > 0) {
        setSelectedCourses(res.courses);
        generatePayloadJson(selectedBotType, workspaceSubFlow, taskModalTicket, matchedSch, res.courses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
      }

      toast.success(`AI đã bóc tách thành công ${res.courses?.length || 1} khóa học cho [${res.school_name}]!`);
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
        })
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
      await loadTickets(true);
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
      case 'waiting_poll':
        return (
          <span className="px-2 py-0.5 bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300 text-[10px] font-bold rounded-md flex items-center gap-1 animate-pulse">
            <Clock className="w-3 h-3" /> ĐANG XỬ LÝ
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
      {/* Header Tiêu đề & Tổng quan số lượng */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Unified Inbox Feed</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="px-3 py-1 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200/80 dark:border-violet-800/50 rounded-xl shadow-2xs">
            Tổng cộng: {tickets.length} ticket
          </span>
          {searchQuery.trim() && (
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50 rounded-xl shadow-2xs animate-in fade-in">
              Khớp tìm kiếm: {filteredTickets.length}
            </span>
          )}
        </div>
      </div>

      {/* THANH CÔNG CỤ TỐI ƯU */}
      <div className="bg-white dark:bg-slate-800/90 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm nhanh theo tiêu đề, người gửi, tóm tắt AI, mã ID, nội dung, trường học..."
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              title="Xóa tìm kiếm"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
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

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Trạng thái:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-800">Tất cả trạng thái</option>
                <option value="pending" className="bg-white dark:bg-slate-800">⏳ Chờ xử lý</option>
                <option value="processing" className="bg-white dark:bg-slate-800">🔄 Đang xử lý</option>
                <option value="completed" className="bg-white dark:bg-slate-800">✅ Đã giải quyết</option>
                <option value="dismissed" className="bg-white dark:bg-slate-800">🗑️ Đã bỏ qua</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 shadow-2xs transition shrink-0 cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            <span>{sortOrder === 'desc' ? 'Mới nhất ➔ Cũ nhất' : 'Cũ nhất ➔ Mới nhất'}</span>
          </button>
        </div>
      </div>

      {/* Ticket List - Hỗ trợ SWR 0ms */}
      {loading && tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-violet-600" />
          <span className="text-xs font-medium">Đang nạp danh sách ticket...</span>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {searchQuery
              ? `Không tìm thấy ticket nào khớp với từ khóa "${searchQuery}"`
              : 'Không có ticket nào trong bộ lọc này'}
          </h3>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs font-semibold text-violet-600 hover:underline cursor-pointer"
            >
              Xóa bộ lọc tìm kiếm
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTickets.map((ticket) => {
            const isExpanded = expandedContent[ticket.id] || false;
            const directUrl = getDirectSourceUrl(ticket);
            const attachments = ticket.attachments || ticket.metadata?.attachments || [];
            const isDismissed = ticket.status === 'dismissed';
            const isCompleted = ticket.status === 'completed';
            const cleanRawContent = stripHtmlTags(ticket.raw_content);
            const displayTime = formatDateTime(ticket.created_at || ticket.ticket_timestamp);

            return (
              <div
                key={ticket.id}
                className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 space-y-4 shadow-xs transition-all"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {renderSourceBadge(ticket.source)}
                      {renderStatusPill(ticket.status)}

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
                        <span>{displayTime}</span>
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {ticket.subject || 'Không có tiêu đề'}
                    </h3>

                    {/* Attachments */}
                    {attachments.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        {attachments.map((file: any, idx: number) => {
                          const isExcel =
                            file.filename?.endsWith('.xlsx') || file.filename?.endsWith('.xls');
                          const isImage =
                            file.filename?.endsWith('.png') ||
                            file.filename?.endsWith('.jpg') ||
                            file.filename?.endsWith('.jpeg');

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setPreviewFile(file)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-medium rounded-lg transition shadow-2xs cursor-pointer"
                            >
                              {isImage ? (
                                <ImageIcon className="w-3 h-3 text-emerald-500" />
                              ) : isExcel ? (
                                <FileSpreadsheetIcon className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Paperclip className="w-3 h-3 text-violet-500" />
                              )}
                              <span className="truncate max-w-[220px]">{file.filename}</span>
                              <Eye className="w-3 h-3 text-slate-400" />
                            </button>
                          );
                        })}
                      </div>
                    )}
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
                    {ticket.ai_summary || 'Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích...'}
                  </p>
                  {ticket.assigned_name && (
                    <div className="text-[11px] text-slate-500 pt-2 border-t border-violet-200/60 dark:border-violet-800/40">
                      👤 Phân công đề xuất:{' '}
                      <strong className="text-violet-700 dark:text-violet-300 font-semibold">
                        {ticket.assigned_name}
                      </strong>{' '}
                      ({ticket.assigned_email})
                    </div>
                  )}
                </div>

                {/* Raw Content Expand */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto font-mono leading-relaxed shadow-inner">
                    {cleanRawContent || '(Không có nội dung văn bản gốc)'}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedContent((prev) => ({ ...prev, [ticket.id]: !prev[ticket.id] }))
                    }
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium transition cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isExpanded ? 'Thu gọn nội dung gốc' : 'Xem nội dung gốc'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

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
                          onClick={() => navigate('/github', { state: { ticket } })}
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

      {/* MODAL XEM TRƯỚC FILE */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 truncate">
                <Paperclip className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {previewFile.filename}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewFile.url}
                  download={previewFile.filename}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium rounded-lg transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải Về Máy</span>
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto flex items-center justify-center bg-slate-50 dark:bg-slate-900">
              {previewFile.filename?.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.filename}
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md"
                />
              ) : previewFile.filename?.endsWith('.pdf') ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.filename}
                  className="w-full h-[70vh] rounded-xl border border-slate-200"
                />
              ) : (
                <div className="text-center p-8 space-y-3">
                  <FileSpreadsheetIcon className="w-12 h-12 mx-auto text-emerald-600" />
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    File bảng tính Excel: <strong>{previewFile.filename}</strong>
                  </div>
                  <a
                    href={previewFile.url}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải File Excel Về Máy</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL KHỞI TẠO TÁC VỤ BOT */}
      {taskModalTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden space-y-4 p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300 rounded-xl">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Điều Phối Tác Vụ Tự Động Hóa
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Gắn tác vụ vào hàng đợi phê duyệt Human-in-the-Loop
                  </p>
                </div>
              </div>

              <button
                onClick={() => setTaskModalTicket(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {taskModalTicket.subject || 'Không có tiêu đề'}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-3">
                <span>Người gửi: <strong className="text-slate-700 dark:text-slate-300">{taskModalTicket.sender_email}</strong></span>
                <span>•</span>
                <span>Nguồn: <strong>{taskModalTicket.source.toUpperCase()}</strong></span>
              </div>
            </div>

            {/* BƯỚC 1: CHỌN NHÓM CỖ MÁY BOT */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                1. Chọn Phân Hệ Tự Động Hóa:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'workspace_rpa', label: 'Workspace RPA', icon: Building2 },
                  { id: 'keycloak_api', label: 'Keycloak IDP', icon: KeyRound },
                  { id: 'feedback_doc_triage', label: 'Feedback Sheet', icon: FileText },
                  { id: 'github_issue_creator', label: 'GitHub Issue', icon: Github },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isSelected = selectedBotType === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        const b = tab.id as BotType;
                        setSelectedBotType(b);
                        generatePayloadJson(b, workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
                      }}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${isSelected
                        ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* BƯỚC 2A: WORKSPACE RPA */}
            {selectedBotType === 'workspace_rpa' && (
              <div className="space-y-4 p-4 rounded-2xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/70 dark:border-violet-800/40">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-violet-600" />
                    <span>Chọn Luồng Xử Lý Workspace:</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleAutoExtractCof}
                    disabled={extractingCof}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-800 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 text-xs font-semibold rounded-xl transition cursor-pointer shadow-2xs hover:bg-violet-50"
                  >
                    {extractingCof ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    <span>AI Bóc Tách File COF</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-violet-100/60 dark:bg-violet-900/40 p-1.5 rounded-xl text-[11px] font-medium">
                  {[
                    { id: 'end_to_end', label: 'Trọn Gói (Order + User + LMS)' },
                    { id: 'order_contract', label: 'Tạo Order & Phả Hệ' },
                    { id: 'bulk_accounts', label: 'Tạo User Hàng Loạt' },
                    { id: 'lms_enroll', label: 'Ghi Danh LMS' },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setWorkspaceSubFlow(sub.id as any);
                        generatePayloadJson('workspace_rpa', sub.id, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-center transition cursor-pointer ${workspaceSubFlow === sub.id
                        ? 'bg-white dark:bg-slate-800 font-bold text-violet-700 dark:text-violet-300 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>

                {/* Chọn trường phả hệ */}
                <div className="space-y-1.5 relative" ref={schoolDropdownRef}>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-violet-600" />
                      <span>Trường Học Áp Dụng:</span>
                    </span>
                    <span className="text-[10px] text-violet-600 font-normal">Tra cứu trong 480 trường</span>
                  </label>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Gõ tìm trường (VD: Amsterdam, San Beda, 10266...)"
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
                        .filter(
                          (s) =>
                            s.school_name.toLowerCase().includes(schoolSearchQuery.toLowerCase()) ||
                            s.school_code.toLowerCase().includes(schoolSearchQuery.toLowerCase())
                        )
                        .slice(0, 30)
                        .map((s) => (
                          <button
                            key={s.school_code}
                            type="button"
                            onClick={() => {
                              setSelectedSchool(s);
                              setSchoolSearchQuery(`${s.school_name} (${s.school_code})`);
                              setIsSchoolDropdownOpen(false);
                              generatePayloadJson('workspace_rpa', workspaceSubFlow, taskModalTicket, s, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
                            }}
                            className="w-full text-left p-2 rounded-xl text-xs hover:bg-violet-50 dark:hover:bg-slate-700 flex items-center justify-between cursor-pointer"
                          >
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {s.school_name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Mã: {s.school_code} | Partner: {s.partner_name}
                              </div>
                            </div>
                            {selectedSchool?.school_code === s.school_code && (
                              <Check className="w-4 h-4 text-violet-600" />
                            )}
                          </button>
                        ))}
                    </div>
                  )}

                  {selectedSchool && (
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700 text-[11px] font-mono text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      <span>{selectedSchool.full_lineage}</span>
                    </div>
                  )}
                </div>

                {/* Chọn Khóa học */}
                {(workspaceSubFlow === 'end_to_end' || workspaceSubFlow === 'order_contract' || workspaceSubFlow === 'lms_enroll') && (
                  <div className="space-y-3 pt-2 border-t border-violet-200/60 dark:border-violet-800/40">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                        <span>Danh Sách Khóa Học ({selectedCourses.length} Môn):</span>
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
                      const filteredCoursesForCategory = coursesList.filter((c) => c.category === cRow.category);
                      return (
                        <div
                          key={idx}
                          className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-violet-200 dark:border-violet-700 space-y-2 relative shadow-2xs"
                        >
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

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500">Phân loại:</label>
                              <select
                                value={cRow.category}
                                onChange={(e) => handleCourseRowChange(idx, 'category', e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-lg p-1.5 text-xs font-medium cursor-pointer"
                              >
                                {categoriesList.map((cat) => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="text-[10px] font-semibold text-slate-500">Chọn khóa học ({filteredCoursesForCategory.length} môn):</label>
                              <select
                                value={cRow.course_id}
                                onChange={(e) => handleCourseRowChange(idx, 'course_id', e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-lg p-1.5 text-xs font-medium cursor-pointer truncate"
                              >
                                {filteredCoursesForCategory.map((c) => (
                                  <option key={c.course_id} value={c.course_id}>
                                    {c.course_name} (ID: {c.course_id})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500">Licenses:</label>
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* BƯỚC 2B: KEYCLOAK IDENTITY GUARD */}
            {selectedBotType === 'keycloak_api' && (
              <div className="space-y-3.5 p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                    <span>Quản Trị Danh Tính Keycloak (An Toàn Tuyệt Đối):</span>
                  </label>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 font-semibold">
                    Safe-by-Default
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Email hoặc Username Cần Xử Lý:</label>
                  <input
                    type="text"
                    value={kcTargetEmail}
                    onChange={(e) => {
                      setKcTargetEmail(e.target.value);
                      generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, e.target.value, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
                    }}
                    placeholder="VD: teacher@pythaverse.space"
                    className="w-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-3 pt-1">
                  {/* Card 1: Reset Pass */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all ${kcEnableResetPass
                      ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-2 rounded-xl ${kcEnableResetPass
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                            : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                            }`}
                        >
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            1. Đổi Mật Khẩu Tạm Thời
                          </div>
                          <div className="text-[10px] text-slate-400">Gán mật khẩu khởi tạo an toàn</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const val = !kcEnableResetPass;
                          setKcEnableResetPass(val);
                          generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, val, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
                        }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${kcEnableResetPass ? 'bg-amber-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                          }`}
                      >
                        <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                      </button>
                    </div>

                    {kcEnableResetPass && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 mt-3 border-t border-slate-100 dark:border-slate-700">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Mật khẩu mới:</label>
                          <input
                            type="text"
                            value={kcTempPass}
                            onChange={(e) => {
                              setKcTempPass(e.target.value);
                              generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, true, e.target.value, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono font-bold outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              const val = !kcForceChange;
                              setKcForceChange(val);
                              generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, true, kcTempPass, val, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
                            }}
                            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition ${kcForceChange
                              ? 'bg-amber-500 border-amber-500 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                              }`}
                          >
                            {kcForceChange && <Check className="w-3 h-3" />}
                          </button>
                          <label
                            onClick={() => {
                              const val = !kcForceChange;
                              setKcForceChange(val);
                              generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, true, kcTempPass, val, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction);
                            }}
                            className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            Bắt buộc đổi khi đăng nhập
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Xác thực Email */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all ${kcEnableVerify
                      ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-2 rounded-xl ${kcEnableVerify
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                            }`}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            2. Xác Thực Email
                          </div>
                          <div className="text-[10px] text-slate-400">Gỡ lỗi tài khoản chưa xác thực email</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const val = !kcEnableVerify;
                          setKcEnableVerify(val);
                          generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, val, kcVerifyAction, kcEnableStatus, kcStatusAction);
                        }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${kcEnableVerify ? 'bg-amber-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                          }`}
                      >
                        <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                      </button>
                    </div>

                    {kcEnableVerify && (
                      <div className="flex items-center gap-3 pt-3 mt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setKcVerifyAction('verify');
                            generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, true, 'verify', kcEnableStatus, kcStatusAction);
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${kcVerifyAction === 'verify'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                        >
                          ✓ Đã Xác Thực
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setKcVerifyAction('unverify');
                            generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, true, 'unverify', kcEnableStatus, kcStatusAction);
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${kcVerifyAction === 'unverify'
                            ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                        >
                          ✗ Gỡ Xác Thực
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card 3: Khóa / Mở Khóa */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all ${kcEnableStatus
                      ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-2 rounded-xl ${kcEnableStatus
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'
                            : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                            }`}
                        >
                          <UserX className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            3. Trạng Thái Hoạt Động
                          </div>
                          <div className="text-[10px] text-slate-400">Khóa hoặc kích hoạt lại người dùng</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const val = !kcEnableStatus;
                          setKcEnableStatus(val);
                          generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, val, kcStatusAction);
                        }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${kcEnableStatus ? 'bg-amber-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                          }`}
                      >
                        <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                      </button>
                    </div>

                    {kcEnableStatus && (
                      <div className="flex items-center gap-3 pt-3 mt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setKcStatusAction('enable');
                            generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, true, 'enable');
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${kcStatusAction === 'enable'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                        >
                          ✓ Kích Hoạt
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setKcStatusAction('disable');
                            generatePayloadJson('keycloak_api', workspaceSubFlow, taskModalTicket, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, true, 'disable');
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${kcStatusAction === 'disable'
                            ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                        >
                          ✗ Vô Hiệu Hóa
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* BƯỚC 3: PAYLOAD JSON PREVIEW */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Tham Số Thực Thi (JSON)</span>
                <span className="text-[10px] text-slate-400 font-normal">Tự động đồng bộ theo các lựa chọn trên</span>
              </label>
              <textarea
                rows={6}
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 leading-relaxed"
              />
            </div>

            {/* Actions Footer */}
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