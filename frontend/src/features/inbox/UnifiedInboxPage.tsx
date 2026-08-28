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
  Sliders,
  SlidersHorizontal,
  FileCheck,
  Users,
  GraduationCap,
  UserCheck,
  UploadCloud,
  FileSpreadsheet,
  Filter,
  Briefcase,
  Store,
  Send,
  Code2
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { InboxTicket, BotType } from '../../types';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

interface HierarchySchoolItem {
  school_id: string;
  school_code: string;
  school_name: string;
  partner_name: string;
  partner_code?: string;
  distributor_name: string;
  distributor_code?: string;
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

interface ScrapedPendingItem {
  id?: string;
  data_id?: string;
  order_code?: string;
  contract_code?: string;
  school_name?: string;
  school_code?: string;
  partner_name?: string;
  partner_code?: string;
  distributor_name?: string;
  distributor_code?: string;
  sender_name?: string;
  receiver_name?: string;
  created_at?: string;
  order_date?: string;
  contract_date?: string;
  date?: string;
  type?: string;
  status?: string;
  notes?: string;
  courses_data?: any[];
}

// ⚡ TRỢ THỦ PERSISTENT STORAGE (0MS)
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

  // State bộ lọc và tìm kiếm Inbox
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

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

  // =========================================================================
  // 🚀 STATE ĐẦY ĐỦ CỦA SMART ACTION MODAL (STUDIO CLONE)
  // =========================================================================
  const [taskModalTicket, setTaskModalTicket] = useState<InboxTicket | null>(null);
  const [selectedBotType, setSelectedBotType] = useState<'workspace_rpa' | 'keycloak_api' | 'feedback_doc_triage' | 'github_issue_creator'>('workspace_rpa');

  // 4 Mục chính Workspace RPA
  const [workspaceMainCategory, setWorkspaceMainCategory] = useState<'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll'>('create_and_approve');
  const [approveSubFlow, setApproveSubFlow] = useState<'approve_school_order' | 'approve_partner_contract' | 'admin_approve_contract'>('approve_school_order');
  const [createApproveSubFlow, setCreateApproveSubFlow] = useState<'end_to_end' | 'partner_create_chain' | 'distributor_create_chain'>('end_to_end');

  const [contactInfo, setContactInfo] = useState<string>('Admin Automation Hub (operation@pythaverse.space)');
  const [additionalNotes, setAdditionalNotes] = useState<string>('Pythaverse Auto-Pipeline Managed');
  const [showAutoTopupSettings, setShowAutoTopupSettings] = useState<boolean>(false);

  const [universalSearchQuery, setUniversalSearchQuery] = useState<string>('');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [selectedCachedItem, setSelectedCachedItem] = useState<ScrapedPendingItem | null>(null);
  const [adminJustification, setAdminJustification] = useState<string>('Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub');

  const [scrapedPendingList, setScrapedPendingList] = useState<ScrapedPendingItem[]>([]);
  const [isScrapingLive, setIsScrapingLive] = useState<boolean>(false);
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState<boolean>(false);
  const [parsedOrderCourses, setParsedOrderCourses] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Metadata Phả hệ & Khóa học
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>(() => getInboxCache<HierarchySchoolItem[]>('schools') || []);
  const [workspaceCategoriesList, setWorkspaceCategoriesList] = useState<string[]>(() => getInboxCache<string[]>('wsCats') || ['SWRP', 'IR', 'ASP', 'Other']);
  const [workspaceCoursesList, setWorkspaceCoursesList] = useState<CourseItem[]>(() => getInboxCache<CourseItem[]>('wsCourses') || []);

  const [lmsCategoriesList, setLmsCategoriesList] = useState<string[]>(() => getInboxCache<string[]>('lmsCats') || []);
  const [lmsCoursesList, setLmsCoursesList] = useState<CourseItem[]>(() => getInboxCache<CourseItem[]>('lmsCourses') || []);
  const [lmsCourseCategory, setLmsCourseCategory] = useState<string>('');
  const [lmsCourseId, setLmsCourseId] = useState<number>(0);
  const [lmsCourseName, setLmsCourseName] = useState<string>('');
  const [lmsGroupName, setLmsGroupName] = useState<string>('');

  const [selectedSchool, setSelectedSchool] = useState<HierarchySchoolItem | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{ name: string; code: string } | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<{ name: string; code: string } | null>(null);

  const [entitySearchQuery, setEntitySearchQuery] = useState<string>('');
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState<boolean>(false);
  const entityDropdownRef = useRef<HTMLDivElement | null>(null);

  const [uploadedAccountsFile, setUploadedAccountsFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getFormattedDate = (d: Date) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);
  nextYear.setDate(nextYear.getDate() - 1);

  const [selectedCourses, setSelectedCourses] = useState<OrderCourseSelection[]>([]);

  // LMS Enroll
  const [lmsStartDate, setLmsStartDate] = useState<string>(getFormattedDate(today));
  const [lmsEndDate, setLmsEndDate] = useState<string>(getFormattedDate(nextYear));
  const [lmsRoleMode, setLmsRoleMode] = useState<'same_role' | 'multi_role'>('multi_role');
  const [lmsSingleRole, setLmsSingleRole] = useState<'student' | 'non_editing_teacher' | 'manager'>('student');
  const [lmsBulkSingleEmails, setLmsBulkSingleEmails] = useState<string>('');
  const [lmsStudentEmails, setLmsStudentEmails] = useState<string>('');
  const [lmsTeacherEmails, setLmsTeacherEmails] = useState<string>('');
  const [lmsManagerEmails, setLmsManagerEmails] = useState<string>('');

  // Keycloak
  const [kcTargetEmail, setKcTargetEmail] = useState<string>('');
  const [kcEnableResetPass, setKcEnableResetPass] = useState<boolean>(true);
  const [kcTempPass, setKcTempPass] = useState<string>('Ptv@2026');
  const [kcForceChange, setKcForceChange] = useState<boolean>(true);
  const [kcEnableVerify, setKcEnableVerify] = useState<boolean>(false);
  const [kcVerifyAction, setKcVerifyAction] = useState<'verify' | 'unverify'>('verify');
  const [kcEnableStatus, setKcEnableStatus] = useState<boolean>(false);
  const [kcStatusAction, setKcStatusAction] = useState<'enable' | 'disable'>('enable');

  // Feedback Doc
  const [docUrl, setDocUrl] = useState<string>('');
  const [assigneeEmail, setAssigneeEmail] = useState<string>('hung.nguyenmanh@dtt.vn');
  const [feedbackCommentContent, setFeedbackCommentContent] = useState<string>('Kính gửi anh/chị, em xin phép chuyển thông tin phản hồi này để team kỹ thuật rà soát và hỗ trợ giải quyết.');
  const [isGeneratingDocComment, setIsGeneratingDocComment] = useState<boolean>(false);

  const [creatingTask, setCreatingTask] = useState<boolean>(false);
  const [extractingCof, setExtractingCof] = useState<boolean>(false);
  const [payloadText, setPayloadText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const SPREADSHEET_ID = '1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go';

  // Nạp tickets
  const loadTickets = useCallback(async (forceSpinner = false) => {
    const cached = getInboxCache<InboxTicket[]>('all_tickets_master');
    if (cached && !forceSpinner) {
      setTickets(cached);
      setLoading(false);
    } else if (forceSpinner || !cached) {
      setLoading(true);
    }

    try {
      const endpoint = `/tickets?sort=desc`;
      const data = await fetchApi<InboxTicket[]>(endpoint);
      if (data) {
        setInboxCache('all_tickets_master', data);
        setTickets(data);
      }
    } catch (err) {
      if (!cached) {
        toast.error('Không thể tải danh sách ticket: ' + (err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Nạp metadata ngầm (SWR)
  useEffect(() => {
    const loadAllMetadata = async () => {
      try {
        const [schools, wsCats, wsCourses, lmsCats, lmsCourses] = await Promise.all([
          fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools').catch(() => []),
          fetchApi<string[]>('/workspace/categories').catch(() => ['SWRP', 'IR', 'ASP', 'Other']),
          fetchApi<CourseItem[]>('/workspace/courses').catch(() => []),
          fetchApi<string[]>('/courses/lms/categories').catch(() => []),
          fetchApi<CourseItem[]>('/courses/lms').catch(() => []),
        ]);

        if (schools) {
          setInboxCache('schools', schools);
          setSchoolsList(schools);
        }
        if (wsCats && wsCats.length > 0) {
          setInboxCache('wsCats', wsCats);
          setWorkspaceCategoriesList(wsCats);
        }
        if (wsCourses) {
          setInboxCache('wsCourses', wsCourses);
          setWorkspaceCoursesList(wsCourses);
        }
        if (lmsCats && lmsCats.length > 0) {
          setInboxCache('lmsCats', lmsCats);
          setLmsCategoriesList(lmsCats);
          setLmsCourseCategory(lmsCats[0]);
        }
        if (lmsCourses && lmsCourses.length > 0) {
          setInboxCache('lmsCourses', lmsCourses);
          setLmsCoursesList(lmsCourses);
          const firstCat = lmsCats && lmsCats.length > 0 ? lmsCats[0] : lmsCourses[0].category;
          const matchFirst = lmsCourses.filter((c) => c.category === firstCat);
          const activeFirst = matchFirst.length > 0 ? matchFirst[0] : lmsCourses[0];
          setLmsCourseId(activeFirst.course_id);
          setLmsCourseName(activeFirst.course_name);
          setLmsCourseCategory(activeFirst.category);
        }
      } catch (e) {
        console.warn('Lỗi nạp metadata ngầm:', e);
      }
    };
    loadAllMetadata();
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
        setIsEntityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const uniquePartners = useMemo(() => {
    const map = new Map<string, { name: string; code: string }>();
    schoolsList.forEach((s) => {
      if (s.partner_name && !map.has(s.partner_name)) {
        map.set(s.partner_name, { name: s.partner_name, code: s.partner_code || 'PAR' });
      }
    });
    return Array.from(map.values());
  }, [schoolsList]);

  const uniqueDistributors = useMemo(() => {
    const map = new Map<string, { name: string; code: string }>();
    schoolsList.forEach((s) => {
      if (s.distributor_name && !map.has(s.distributor_name)) {
        map.set(s.distributor_name, { name: s.distributor_name, code: s.distributor_code || 'DST' });
      }
    });
    return Array.from(map.values());
  }, [schoolsList]);

  const currentEntityMode = useMemo<'school' | 'partner' | 'distributor'>(() => {
    if (createApproveSubFlow === 'partner_create_chain') return 'partner';
    if (createApproveSubFlow === 'distributor_create_chain') return 'distributor';
    return 'school';
  }, [createApproveSubFlow]);

  // Bộ lọc ticket
  const filteredTickets = useMemo(() => {
    let result = [...tickets];
    if (selectedSource !== 'all') result = result.filter((t) => t.source === selectedSource);
    if (selectedCategory !== 'all') result = result.filter((t) => t.category === selectedCategory);
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'processing') {
        result = result.filter((t) => t.status === 'processing' || t.status === 'waiting_poll');
      } else {
        result = result.filter((t) => (t.status || 'pending') === selectedStatus);
      }
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter((t) => {
        return (
          t.subject?.toLowerCase().includes(query) ||
          t.sender_email?.toLowerCase().includes(query) ||
          t.submitter_name?.toLowerCase().includes(query) ||
          t.ai_summary?.toLowerCase().includes(query) ||
          t.source_id?.toLowerCase().includes(query) ||
          t.raw_content?.toLowerCase().includes(query) ||
          t.country?.toLowerCase().includes(query) ||
          t.metadata?.school_name?.toLowerCase().includes(query)
        );
      });
    }
    result.sort((a, b) => {
      const timeA = new Date(a.created_at || a.ticket_timestamp || 0).getTime();
      const timeB = new Date(b.created_at || b.ticket_timestamp || 0).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
    return result;
  }, [tickets, selectedSource, selectedCategory, selectedStatus, searchQuery, sortOrder]);

  const getDirectSourceUrl = (ticket: InboxTicket) => {
    if (ticket.source === 'gmail') {
      return `https://mail.google.com/mail/u/0/#search/id%3A${ticket.source_id}`;
    } else if (ticket.source === 'google_form') {
      if (ticket.doc_url) return ticket.doc_url;
      const rowIdx = ticket.metadata?.row_index || 2;
      return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0&range=A${rowIdx}:P${rowIdx}`;
    } else if (ticket.source === 'osticket') {
      // 🎯 Ưu tiên mở theo doc_url (chứa Internal ID 4 số: tickets.php?id=3370)
      if (ticket.doc_url) return ticket.doc_url;
      const internalId = ticket.metadata?.internal_id || ticket.source_id;
      return `https://support.pythaverse.space/scp/tickets.php?id=${internalId}`;
    }
    return '#';
  };

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

  // =========================================================================
  // ⚡ AUTO-MAPPING THÔNG MINH TỪ TICKET VÀO POPUP STUDIO
  // =========================================================================
  const handleOpenTaskModal = (ticket: InboxTicket) => {
    setTaskModalTicket(ticket);
    setViewMode('form');

    // 1. Tự động truy vết trường học từ Subject / Raw Content / Metadata
    const fullText = `${ticket.subject || ''} ${ticket.raw_content || ''} ${ticket.submitter_name || ''} ${ticket.metadata?.school_name || ''}`.toLowerCase();
    const matchedSchool =
      schoolsList.find(
        (s) =>
          fullText.includes(s.school_name.toLowerCase()) ||
          (s.school_code && fullText.includes(s.school_code.toLowerCase()))
      ) ||
      schoolsList[0] ||
      null;

    setSelectedSchool(matchedSchool);
    if (matchedSchool) {
      setEntitySearchQuery(matchedSchool.school_name);
      setSelectedPartner({ name: matchedSchool.partner_name, code: matchedSchool.partner_code || 'PAR' });
      setSelectedDistributor({ name: matchedSchool.distributor_name, code: matchedSchool.distributor_code || 'DST' });
    }

    // 2. Điền sẵn email Keycloak & Doc Url
    setKcTargetEmail(ticket.sender_email);
    setDocUrl(ticket.doc_url || '');
    setAssigneeEmail(ticket.assigned_email || 'hung.nguyenmanh@dtt.vn');

    // 3. Khởi tạo khóa học mặc định nếu danh sách trống
    if (selectedCourses.length === 0) {
      const defaultCourse =
        workspaceCoursesList.find((c) => c.category === 'SWRP') ||
        workspaceCoursesList[0] || {
          course_id: 654,
          category: 'SWRP',
          course_name: 'SWRP 9: LEANBOT Programming Applications with IoT [V2] (EN)',
          lms_url: 'https://learn.pythaverse.space/course/view.php?id=654',
        };

      setSelectedCourses([
        {
          category: defaultCourse.category,
          course_id: defaultCourse.course_id,
          course_name: defaultCourse.course_name,
          lms_url: defaultCourse.lms_url,
          licenses: 50,
          start_date: getFormattedDate(today),
          end_date: getFormattedDate(nextYear),
        },
      ]);
    }

    // 4. Smart Engine Selection dựa vào AI Category & Source
    let botType: 'workspace_rpa' | 'keycloak_api' | 'feedback_doc_triage' | 'github_issue_creator' = 'workspace_rpa';
    let mainCat: 'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll' = 'create_and_approve';

    if (ticket.category === 'account_keycloak') {
      botType = 'keycloak_api';
      setKcEnableResetPass(true);
    } else if (ticket.category === 'lms_enroll') {
      botType = 'workspace_rpa';
      mainCat = 'lms_enroll';
      // Trích xuất email từ raw_content nếu có
      const emailMatches = ticket.raw_content?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const cleanEmails = Array.from(new Set(emailMatches.filter(e => !e.includes('pythaverse.space') && !e.includes('dtt.vn'))));
      if (cleanEmails.length > 0) {
        setLmsStudentEmails(cleanEmails.join('\n'));
      }
    } else if (ticket.category === 'license') {
      botType = 'workspace_rpa';
      // Nếu có file đính kèm là excel -> Gợi ý nộp bulk account
      const hasExcelAttach = ticket.attachments?.some((a: any) => a.filename?.endsWith('.xlsx') || a.filename?.endsWith('.xls'));
      if (hasExcelAttach) {
        mainCat = 'create_and_approve';
      } else {
        mainCat = 'approve';
      }
    } else if (ticket.source === 'google_form') {
      botType = 'feedback_doc_triage';
    }

    setSelectedBotType(botType);
    setWorkspaceMainCategory(mainCat);
  };

  // ⚡ TỰ ĐỘNG TÍNH TOÁN VÀ SINH PAYLOAD JSON REAL-TIME
  const computedPayload = useMemo(() => {
    const tId = taskModalTicket?.id || null;
    const firstAttachmentUrl = taskModalTicket?.attachments?.[0]?.url || '';

    let payload: Record<string, any> = {
      ticket_id: tId,
      source: taskModalTicket?.source,
      contact_info: contactInfo,
      additional_notes: additionalNotes,
    };

    if (selectedBotType === 'workspace_rpa') {
      if (workspaceMainCategory === 'approve') {
        if (approveSubFlow === 'approve_school_order') {
          payload = {
            ...payload,
            action: 'approve_school_order_standalone',
            order_code: selectedItemCode || 'SCH-PENDING',
            school_name: selectedCachedItem?.school_name || selectedSchool?.school_name,
            partner_name: selectedCachedItem?.partner_name || selectedSchool?.partner_name,
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : undefined,
          };
        } else if (approveSubFlow === 'approve_partner_contract') {
          payload = {
            ...payload,
            action: 'approve_partner_contract_standalone',
            contract_code: selectedItemCode || 'PRT-PENDING',
            partner_name: selectedCachedItem?.partner_name || selectedPartner?.name,
            distributor_name: selectedCachedItem?.distributor_name || selectedDistributor?.name,
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : selectedCachedItem?.courses_data,
          };
        } else if (approveSubFlow === 'admin_approve_contract') {
          payload = {
            ...payload,
            action: 'admin_approve_contract',
            contract_code: selectedItemCode || 'DST-PENDING',
            distributor_name: selectedCachedItem?.distributor_name || selectedDistributor?.name,
            justification: adminJustification.trim(),
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : selectedCachedItem?.courses_data,
          };
        }
      } else if (workspaceMainCategory === 'create_and_approve') {
        if (createApproveSubFlow === 'end_to_end') {
          payload = {
            ...payload,
            action: 'pipeline_end_to_end',
            school_name: selectedSchool?.school_name,
            attachment_url: firstAttachmentUrl,
            hierarchy: {
              school_name: selectedSchool?.school_name,
              school_code: selectedSchool?.school_code,
              partner_name: selectedSchool?.partner_name,
              distributor_name: selectedSchool?.distributor_name,
            },
            order_details: {
              contact_info: contactInfo,
              additional_notes: additionalNotes,
              courses: selectedCourses.map((c) => ({
                category: c.category,
                course_id: c.course_id,
                course_name: c.course_name,
                licenses: c.licenses,
                start_date: c.start_date,
                end_date: c.end_date,
              })),
            },
            auto_enroll_lms: true,
          };
        } else if (createApproveSubFlow === 'partner_create_chain') {
          payload = {
            ...payload,
            action: 'partner_create_and_approve_chain',
            partner_name: selectedPartner?.name,
            partner_code: selectedPartner?.code,
            contract_data: {
              notes: additionalNotes,
              courses: selectedCourses.map((c) => ({
                category: c.category,
                course_name: c.course_name,
                licenses: c.licenses,
              })),
            },
          };
        } else if (createApproveSubFlow === 'distributor_create_chain') {
          payload = {
            ...payload,
            action: 'distributor_create_and_approve_chain',
            distributor_name: selectedDistributor?.name,
            distributor_code: selectedDistributor?.code,
            contract_data: {
              notes: additionalNotes,
              justification: adminJustification,
              courses: selectedCourses.map((c) => ({
                category: c.category,
                course_name: c.course_name,
                licenses: c.licenses,
              })),
            },
          };
        }
      } else if (workspaceMainCategory === 'bulk_accounts') {
        payload = {
          ...payload,
          action: 'bulk_account_creation',
          school_name: selectedSchool?.school_name,
          school_code: selectedSchool?.school_code,
          attachment_url: firstAttachmentUrl,
          filename: uploadedAccountsFile?.name || taskModalTicket?.attachments?.[0]?.filename || 'accounts.xlsx',
        };
      } else if (workspaceMainCategory === 'lms_enroll') {
        let studentsList: string[] = [];
        let teachersList: string[] = [];
        let managersList: string[] = [];

        if (lmsRoleMode === 'same_role') {
          const bulkEmails = lmsBulkSingleEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
          if (lmsSingleRole === 'student') studentsList = bulkEmails;
          else if (lmsSingleRole === 'non_editing_teacher') teachersList = bulkEmails;
          else if (lmsSingleRole === 'manager') managersList = bulkEmails;
        } else {
          studentsList = lmsStudentEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
          teachersList = lmsTeacherEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
          managersList = lmsManagerEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
        }

        payload = {
          action: 'direct_moodle_lms_enroll',
          platform: 'learn.pythaverse.space',
          course_id: lmsCourseId,
          course_name: lmsCourseName,
          category: lmsCourseCategory,
          start_date: lmsStartDate,
          end_date: lmsEndDate,
          group_name: lmsGroupName.trim() || undefined,
          role_mode: lmsRoleMode,
          student_emails: studentsList,
          teacher_emails: teachersList,
          manager_emails: managersList,
          auto_renew_existing: true,
        };
      }
    } else if (selectedBotType === 'keycloak_api') {
      const actions: string[] = [];
      const conf: Record<string, any> = { target_email: kcTargetEmail, ticket_id: tId };

      if (kcEnableResetPass) {
        actions.push('reset_password');
        conf.temporary_password = kcTempPass;
        conf.force_change_on_first_login = kcForceChange;
      }
      if (kcEnableVerify) {
        actions.push(kcVerifyAction === 'verify' ? 'mark_email_verified' : 'mark_email_unverified');
      }
      if (kcEnableStatus) {
        actions.push(kcStatusAction === 'enable' ? 'enable_account' : 'disable_account');
      }

      conf.actions = actions.length > 0 ? actions : ['noop_preview'];
      payload = conf;
    } else if (selectedBotType === 'feedback_doc_triage') {
      payload = {
        action: 'comment_and_assign',
        ticket_id: tId,
        doc_url: docUrl,
        assignee_email: assigneeEmail,
        comment_content: feedbackCommentContent,
        row_index: taskModalTicket?.metadata?.row_index || 1,
      };
    } else if (selectedBotType === 'github_issue_creator') {
      payload = {
        action: 'create_github_issue',
        ticket_id: tId,
        title: `[BUG] ${taskModalTicket?.subject || 'Báo lỗi hệ thống'}`,
        assignees: ['nguyenthetrung5-PTV', 'thetrungdtt'],
      };
    }

    return payload;
  }, [
    taskModalTicket,
    selectedBotType,
    workspaceMainCategory,
    approveSubFlow,
    createApproveSubFlow,
    selectedSchool,
    selectedPartner,
    selectedDistributor,
    selectedItemCode,
    selectedCachedItem,
    parsedOrderCourses,
    adminJustification,
    contactInfo,
    additionalNotes,
    selectedCourses,
    uploadedAccountsFile,
    lmsCourseId,
    lmsCourseName,
    lmsCourseCategory,
    lmsStartDate,
    lmsEndDate,
    lmsGroupName,
    lmsRoleMode,
    lmsSingleRole,
    lmsBulkSingleEmails,
    lmsStudentEmails,
    lmsTeacherEmails,
    lmsManagerEmails,
    kcTargetEmail,
    kcEnableResetPass,
    kcTempPass,
    kcForceChange,
    kcEnableVerify,
    kcVerifyAction,
    kcEnableStatus,
    kcStatusAction,
    docUrl,
    assigneeEmail,
    feedbackCommentContent,
  ]);

  // Đồng bộ payloadText khi form thay đổi
  useEffect(() => {
    setPayloadText(JSON.stringify(computedPayload, null, 2));
  }, [computedPayload]);

  const handleAddCourseRow = () => {
    const defaultCourse =
      workspaceCoursesList.find((c) => c.category === 'SWRP') ||
      workspaceCoursesList[0] || {
        course_id: 654,
        category: 'SWRP',
        course_name: 'SWRP 9: LEANBOT Programming Applications with IoT [V2] (EN)',
        lms_url: 'https://learn.pythaverse.space/course/view.php?id=654',
      };

    setSelectedCourses([
      ...selectedCourses,
      {
        category: defaultCourse.category,
        course_id: defaultCourse.course_id,
        course_name: defaultCourse.course_name,
        lms_url: defaultCourse.lms_url,
        licenses: 50,
        start_date: getFormattedDate(today),
        end_date: getFormattedDate(nextYear),
      },
    ]);
  };

  const handleRemoveCourseRow = (index: number) => {
    if (selectedCourses.length <= 1) {
      toast.error('Cần ít nhất 1 khóa học trong danh sách!');
      return;
    }
    setSelectedCourses(selectedCourses.filter((_, idx) => idx !== index));
  };

  const handleAutoExtractCof = async () => {
    if (!taskModalTicket) return;
    setExtractingCof(true);
    try {
      const res = await fetchApi<any>('/workspace/extract-cof', {
        method: 'POST',
        body: JSON.stringify({ cof_text: taskModalTicket.raw_content || taskModalTicket.subject }),
      });

      const matchedSch =
        schoolsList.find((s) => s.school_name.toLowerCase().includes(res.school_name?.toLowerCase() || '')) ||
        selectedSchool;

      if (matchedSch) {
        setSelectedSchool(matchedSch);
        setEntitySearchQuery(matchedSch.school_name);
      }

      if (res.courses && res.courses.length > 0) {
        setSelectedCourses(res.courses);
      }

      toast.success(`AI đã bóc tách thành công ${res.courses?.length || 1} khóa học cho [${res.school_name}]!`);
    } catch (err) {
      toast.error('Lỗi khi bóc tách COF: ' + (err as Error).message);
    } finally {
      setExtractingCof(false);
    }
  };

  const handleConfirmCreateTask = async () => {
    if (!taskModalTicket) return;

    let finalPayloadData = {};
    try {
      finalPayloadData = JSON.parse(payloadText);
    } catch (e) {
      toast.error('JSON không hợp lệ! Vui lòng kiểm tra lại cú pháp.');
      return;
    }

    setCreatingTask(true);
    try {
      let actualBotType: BotType | 'lms_playwright' = selectedBotType;
      if (selectedBotType === 'workspace_rpa' && workspaceMainCategory === 'lms_enroll') {
        actualBotType = 'lms_playwright';
      }

      // Xử lý upload file nếu có file mới
      if (workspaceMainCategory === 'bulk_accounts' && uploadedAccountsFile) {
        toast.info('Đang tải file Excel lên hệ thống lưu trữ...');
        const cleanFileName = `inbox_accounts/${Date.now()}_${uploadedAccountsFile.name.replace(/\s+/g, '_')}`;

        const { error: uploadErr } = await supabase.storage
          .from('ticket-attachments')
          .upload(cleanFileName, uploadedAccountsFile, { upsert: true });

        if (uploadErr) throw new Error(`Lỗi upload file: ${uploadErr.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('ticket-attachments')
          .getPublicUrl(cleanFileName);

        (finalPayloadData as any).attachment_url = publicUrlData.publicUrl;
      }

      await fetchApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: taskModalTicket.id,
          bot_type: actualBotType,
          payload_data: finalPayloadData,
        }),
      });

      toast.success(
        <div className="space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Đã đưa tác vụ vào Hàng Đợi Phê Duyệt!</span>
          </div>
          <button
            onClick={() => navigate('/tasks')}
            className="text-accent-2 hover:text-accent underline text-xs font-semibold cursor-pointer block mt-1 transition"
          >
            Chuyển đến Task & Approval Hub để duyệt ➔
          </button>
        </div>,
        { duration: 5000 }
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
          <span className="px-2 py-0.5 bg-paper-2 text-ink border border-rule dark:bg-rule-2 dark:text-primary-ink text-[10px] font-semibold rounded-lg">
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-ink dark:text-primary-ink tracking-tight">Unified Inbox Feed</h2>
          <p className="text-xs text-slate-500 dark:text-ink-3 mt-1">
            Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="px-3 py-1 bg-accent-soft text-accent dark:bg-ink dark:text-accent-2 border border-accent-soft dark:border-rule-2 rounded-xl shadow-2xs">
            Tổng cộng: {tickets.length} ticket
          </span>
          {searchQuery.trim() && (
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50 rounded-xl shadow-2xs animate-in fade-in">
              Khớp tìm kiếm: {filteredTickets.length}
            </span>
          )}
        </div>
      </div>

      {/* THANH CÔNG CỤ LỌC & TÌM KIẾM */}
      <div className="bg-white dark:bg-ink/90 p-3.5 rounded-2xl border border-rule/80 dark:border-rule-2/60 shadow-xs space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm nhanh theo tiêu đề, người gửi, tóm tắt AI, mã ID, nội dung, trường học..."
            className="w-full pl-10 pr-10 py-2.5 bg-paper-2 dark:bg-ink/90 border border-rule dark:border-rule-2 rounded-xl text-xs font-medium text-ink dark:text-primary-ink placeholder-ink-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent transition-all shadow-2xs"
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

        <div className="flex items-center justify-between flex-wrap gap-2.5 pt-1 border-t border-rule dark:border-rule-2/50">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <div className="flex items-center gap-1.5 bg-paper-2 dark:bg-ink border border-rule dark:border-rule-2 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-ink-3 whitespace-nowrap">Nguồn:</span>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="bg-transparent text-xs font-semibold text-ink dark:text-primary-ink outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-ink">Tất cả Nguồn</option>
                <option value="gmail" className="bg-white dark:bg-ink">✉️ Gmail</option>
                <option value="google_form" className="bg-white dark:bg-ink">📝 Google Form</option>
                <option value="osticket" className="bg-white dark:bg-ink">🎫 OS Ticket</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-paper-2 dark:bg-ink border border-rule dark:border-rule-2 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-ink-3 whitespace-nowrap">Phân loại:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs font-semibold text-ink dark:text-primary-ink outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-ink">Tất cả Category</option>
                <option value="bug" className="bg-white dark:bg-ink">🐛 System Bugs</option>
                <option value="account_keycloak" className="bg-white dark:bg-ink">🔑 Keycloak/Account</option>
                <option value="lms_enroll" className="bg-white dark:bg-ink">🎓 LMS Enroll</option>
                <option value="license" className="bg-white dark:bg-ink">📜 License</option>
                <option value="other" className="bg-white dark:bg-ink">📌 Khác</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-paper-2 dark:bg-ink border border-rule dark:border-rule-2 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-ink-3 whitespace-nowrap">Trạng thái:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-semibold text-ink dark:text-primary-ink outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-ink">Tất cả trạng thái</option>
                <option value="pending" className="bg-white dark:bg-ink">⏳ Chờ xử lý</option>
                <option value="processing" className="bg-white dark:bg-ink">🔄 Đang xử lý</option>
                <option value="completed" className="bg-white dark:bg-ink">✅ Đã giải quyết</option>
                <option value="dismissed" className="bg-white dark:bg-ink">🗑️ Đã bỏ qua</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-paper-2 hover:bg-paper-2 dark:bg-ink dark:hover:bg-rule-2 border border-rule dark:border-rule-2 rounded-xl text-xs font-medium text-ink dark:text-primary-ink shadow-2xs transition shrink-0 cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-accent dark:text-accent-2" />
            <span>{sortOrder === 'desc' ? 'Mới nhất ➔ Cũ nhất' : 'Cũ nhất ➔ Mới nhất'}</span>
          </button>
        </div>
      </div>

      {/* Danh Sách Tickets */}
      {loading && tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-accent" />
          <span className="text-xs font-medium">Đang nạp danh sách ticket...</span>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white dark:bg-ink p-12 text-center rounded-2xl border border-rule/80 dark:border-rule-2/60 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-400" />
          <h3 className="text-sm font-semibold text-ink dark:text-primary-ink">
            {searchQuery
              ? `Không tìm thấy ticket nào khớp với từ khóa "${searchQuery}"`
              : 'Không có ticket nào trong bộ lọc này'}
          </h3>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs font-semibold text-accent hover:underline cursor-pointer"
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
                className="bento-card p-5 sm:p-6 space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {renderSourceBadge(ticket.source)}
                      {renderStatusPill(ticket.status)}

                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5">
                        <Tag className="w-3 h-3 text-indigo-500" />
                        <select
                          value={ticket.category || 'other'}
                          onChange={(e) => handleCategoryChange(ticket.id, e.target.value)}
                          className="bg-transparent text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase outline-none cursor-pointer"
                        >
                          <option value="bug">BUG</option>
                          <option value="account_keycloak">KEYCLOAK</option>
                          <option value="lms_enroll">LMS ENROLL</option>
                          <option value="license">LICENSE</option>
                          <option value="other">OTHER</option>
                        </select>
                      </div>

                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                        {ticket.submitter_name || ticket.sender_email}
                      </span>

                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{displayTime}</span>
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                      {ticket.subject || 'Không có tiêu đề'}
                    </h3>

                    {attachments.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        {attachments.map((file: any, idx: number) => {
                          const isExcel = file.filename?.endsWith('.xlsx') || file.filename?.endsWith('.xls');
                          const isImage = file.filename?.endsWith('.png') || file.filename?.endsWith('.jpg') || file.filename?.endsWith('.jpeg');

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setPreviewFile(file)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-medium rounded-lg transition shadow-2xs cursor-pointer"
                            >
                              {isImage ? (
                                <ImageIcon className="w-3 h-3 text-emerald-500" />
                              ) : isExcel ? (
                                <FileSpreadsheetIcon className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Paperclip className="w-3 h-3 text-indigo-500" />
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-300 text-xs font-semibold rounded-xl transition shrink-0 shadow-2xs cursor-pointer"
                  >
                    <span>Mở trang gốc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/60 dark:border-indigo-900/40 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Tóm tắt & Đề xuất tự động từ Gemini AI</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal whitespace-pre-line">
                    {ticket.ai_summary || 'Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích...'}
                  </p>
                  {ticket.assigned_name && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-indigo-100/60 dark:border-indigo-900/40">
                      👤 Phân công đề xuất:{' '}
                      <strong className="text-indigo-700 dark:text-indigo-300 font-bold">
                        {ticket.assigned_name}
                      </strong>{' '}
                      ({ticket.assigned_email})
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="p-4 bg-paper-2 dark:bg-ink/90 rounded-xl border border-rule dark:border-rule-2 text-xs text-ink dark:text-primary-ink whitespace-pre-wrap max-h-72 overflow-y-auto font-mono leading-relaxed shadow-inner">
                    {cleanRawContent || '(Không có nội dung văn bản gốc)'}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedContent((prev) => ({ ...prev, [ticket.id]: !prev[ticket.id] }))
                    }
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-ink dark:text-ink-3 dark:hover:text-slate-200 font-medium transition cursor-pointer"
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
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-paper-2 hover:bg-rule text-ink text-xs font-medium rounded-xl transition shadow-2xs cursor-pointer"
                      >
                        {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>Khôi phục Hòm Thư</span>
                      </button>
                    ) : isCompleted ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-paper-2 hover:bg-rule text-ink text-xs font-medium rounded-xl transition cursor-pointer"
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
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-paper-2 dark:hover:bg-white dark:text-ink text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
                        >
                          <Github className="w-3.5 h-3.5" />
                          <span>Tạo Issue GitHub</span>
                        </button>

                        <button
                          onClick={() => handleOpenTaskModal(ticket)}
                          className="flex items-center gap-2 px-3.5 py-1.5 bg-accent hover:bg-accent active:bg-accent-2 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
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
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewFile(null); }}
          className="fixed inset-0 z-50 bg-white/75 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-ink border border-rule dark:border-rule-2 rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto"
          >
            <div className="flex items-center justify-between p-4 border-b border-rule dark:border-rule-2">
              <div className="flex items-center gap-2 truncate">
                <Paperclip className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold text-ink dark:text-primary-ink truncate">
                  {previewFile.filename}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewFile.url}
                  download={previewFile.filename}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1 bg-accent-soft hover:bg-accent-soft text-accent text-xs font-medium rounded-lg transition cursor-pointer"
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

            <div className="flex-1 p-4 overflow-auto flex items-center justify-center bg-paper-2 dark:bg-ink">
              {previewFile.filename?.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.filename}
                  className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-md"
                />
              ) : previewFile.filename?.endsWith('.pdf') ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.filename}
                  className="w-full h-[75vh] rounded-xl border border-rule"
                />
              ) : (
                <div className="text-center p-8 space-y-3">
                  <FileSpreadsheetIcon className="w-12 h-12 mx-auto text-emerald-600" />
                  <div className="text-xs font-medium text-ink dark:text-primary-ink">
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

      {/* ========================================================================= */}
      {/* 🚀 SMART ACTION MODAL (BẢN CLONE HOÀN HẢO TỪ AUTOMATION STUDIO) */}
      {/* ========================================================================= */}
      {taskModalTicket && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setTaskModalTicket(null); }}
          className="fixed inset-0 z-50 bg-white/75 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-ink border border-rule dark:border-rule-2 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden space-y-5 p-6 sm:p-8 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto"
          >

            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-rule dark:border-rule-2 flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-accent text-white rounded-2xl shadow-md">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-ink dark:text-primary-ink tracking-tight">
                      Điều Phối Tác Vụ Tự Động Hóa
                    </h3>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-accent-soft dark:bg-ink/60 text-accent dark:text-accent-2 font-bold uppercase">
                      Smart Triage
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-ink-3">
                    Bắn tác vụ vào Hàng đợi Phê duyệt Human-in-the-Loop hoặc duyệt chạy ngay.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Switch chế độ Form / JSON */}
                <div className="flex items-center bg-paper-2 dark:bg-ink p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setViewMode('form')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${viewMode === 'form'
                      ? 'bg-white dark:bg-rule-2 text-accent dark:text-accent-2 font-bold shadow-2xs'
                      : 'text-slate-500'
                      }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Form</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('json')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${viewMode === 'json'
                      ? 'bg-white dark:bg-rule-2 text-accent dark:text-accent-2 font-bold shadow-2xs'
                      : 'text-slate-500'
                      }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setTaskModalTicket(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-paper-2 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Thông tin Ticket đầu vào */}
            <div className="p-3.5 rounded-2xl bg-paper-2 dark:bg-ink/90 border border-rule/80 dark:border-rule-2 text-xs space-y-1.5 shrink-0">
              <div className="font-bold text-ink dark:text-primary-ink truncate">
                📌 {taskModalTicket.subject || 'Không có tiêu đề'}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                <span>Người gửi: <strong className="text-ink dark:text-primary-ink">{taskModalTicket.sender_email}</strong></span>
                <span>•</span>
                <span>Nguồn: <strong>{taskModalTicket.source.toUpperCase()}</strong></span>
                {taskModalTicket.metadata?.school_name && (
                  <>
                    <span>•</span>
                    <span>Trường theo Ticket: <strong className="text-accent">{taskModalTicket.metadata.school_name}</strong></span>
                  </>
                )}
              </div>
            </div>

            {/* Thân Modal cuộn */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 scrollbar-thin">
              {viewMode === 'form' ? (
                <>
                  {/* BƯỚC 1: CHỌN CỖ MÁY BOT */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-ink dark:text-primary-ink uppercase tracking-wider flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-accent-soft dark:bg-ink/50 text-accent dark:text-accent-2 flex items-center justify-center text-[10px] font-extrabold">
                        1
                      </span>
                      <span>Chọn Cỗ Máy Tự Động Hóa:</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'workspace_rpa', label: 'Workspace & LMS', icon: Building2, desc: 'License, Order & LMS' },
                        { id: 'keycloak_api', label: 'Keycloak IDP', icon: KeyRound, desc: 'Quản Trị Người Dùng' },
                        { id: 'feedback_doc_triage', label: 'Feedback Sheet', icon: FileText, desc: 'Tag Doc & Comment' },
                        { id: 'github_issue_creator', label: 'GitHub Issue', icon: Github, desc: 'Báo Lỗi Dev' },
                      ].map((tab) => {
                        const Icon = tab.icon;
                        const isSel = selectedBotType === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedBotType(tab.id as any)}
                            className={`flex flex-col items-start gap-1 p-3 rounded-2xl border text-left transition cursor-pointer ${isSel
                              ? 'bg-accent text-white border-transparent shadow-md'
                              : 'bg-paper-2 dark:bg-ink/60 border-rule dark:border-rule-2/80 text-ink dark:text-primary-ink hover:bg-paper-2'
                              }`}
                          >
                            <Icon className={`w-4 h-4 ${isSel ? 'text-white' : 'text-accent dark:text-accent-2'}`} />
                            <span className="text-xs font-bold mt-1">{tab.label}</span>
                            <span className={`text-[10px] ${isSel ? 'text-accent-2' : 'text-ink-3'}`}>{tab.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* BƯỚC 2A: WORKSPACE & LMS PIPELINE */}
                  {selectedBotType === 'workspace_rpa' && (
                    <div className="space-y-5 p-5 rounded-2xl bg-accent-soft/50 dark:bg-ink/20 border border-accent-soft dark:border-rule-2/40">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-xs font-bold text-accent dark:text-accent-2 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-accent-soft dark:bg-ink/60 text-accent dark:text-accent-2 flex items-center justify-center text-[10px] font-extrabold">
                            2
                          </span>
                          <span>Chọn Phân Luồng Nghiệp Vụ Cốt Lõi:</span>
                        </label>

                        <button
                          type="button"
                          onClick={handleAutoExtractCof}
                          disabled={extractingCof}
                          className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-ink text-accent dark:text-accent-2 border border-accent-soft dark:border-rule-2 text-xs font-semibold rounded-xl transition cursor-pointer shadow-2xs hover:bg-accent-soft"
                        >
                          {extractingCof ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                          <span>AI Bóc Tách File COF</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-accent-soft/60 dark:bg-ink/40 p-1.5 rounded-2xl text-xs font-medium">
                        {[
                          { id: 'create_and_approve', label: '1. Tạo & Duyệt', icon: Zap },
                          { id: 'approve', label: '2. Phê Duyệt', icon: FileCheck },
                          { id: 'bulk_accounts', label: '3. Tạo Tài Khoản', icon: Users },
                          { id: 'lms_enroll', label: '4. Ghi Danh LMS', icon: GraduationCap },
                        ].map((mTab) => {
                          const MIcon = mTab.icon;
                          const isCur = workspaceMainCategory === mTab.id;
                          return (
                            <button
                              key={mTab.id}
                              type="button"
                              onClick={() => {
                                setWorkspaceMainCategory(mTab.id as any);
                                setParsedOrderCourses([]);
                              }}
                              className={`py-2.5 px-2 rounded-xl text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs ${isCur
                                ? 'bg-white dark:bg-ink font-bold text-accent dark:text-accent-2 shadow-2xs'
                                : 'text-slate-600 dark:text-ink-3 hover:text-ink'
                                }`}
                            >
                              <MIcon className="w-3.5 h-3.5" />
                              <span>{mTab.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Ô TÌM KIẾM ĐỐI TƯỢNG PHẢ HỆ */}
                      {workspaceMainCategory !== 'approve' && workspaceMainCategory !== 'lms_enroll' && (
                        <div className="space-y-2 relative" ref={entityDropdownRef}>
                          <label className="text-xs font-bold text-ink dark:text-primary-ink flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              {currentEntityMode === 'school' ? (
                                <Building2 className="w-3.5 h-3.5 text-accent" />
                              ) : currentEntityMode === 'partner' ? (
                                <Briefcase className="w-3.5 h-3.5 text-accent" />
                              ) : (
                                <Store className="w-3.5 h-3.5 text-amber-600" />
                              )}
                              <span>
                                {currentEntityMode === 'school'
                                  ? 'Trường học áp dụng (Chọn trường thụ hưởng):'
                                  : currentEntityMode === 'partner'
                                    ? 'Đối tác phụ trách (Chọn đối tác):'
                                    : 'Nhà phân phối (Chọn nhà phân phối):'}
                              </span>
                            </span>
                            {(selectedSchool || selectedPartner || selectedDistributor) && (
                              <span className="text-xs text-accent font-bold font-mono">
                                {currentEntityMode === 'school'
                                  ? selectedSchool?.school_code
                                  : currentEntityMode === 'partner'
                                    ? selectedPartner?.code
                                    : selectedDistributor?.code}
                              </span>
                            )}
                          </label>

                          <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={entitySearchQuery}
                              onFocus={() => setIsEntityDropdownOpen(true)}
                              onChange={(e) => {
                                setEntitySearchQuery(e.target.value);
                                setIsEntityDropdownOpen(true);
                              }}
                              placeholder="Tìm kiếm trường học theo tên hoặc mã trường..."
                              className="w-full pl-10 pr-10 bg-white dark:bg-ink border border-accent-soft dark:border-rule-2 rounded-xl p-2.5 text-xs text-ink dark:text-primary-ink outline-none focus:ring-2 focus:ring-accent"
                            />
                            {entitySearchQuery && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEntitySearchQuery('');
                                  setSelectedSchool(null);
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {isEntityDropdownOpen && (
                            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-ink border border-rule dark:border-rule-2 rounded-2xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1">
                              {schoolsList
                                .filter((s) => s.school_name.toLowerCase().includes(entitySearchQuery.toLowerCase()) || s.school_code.toLowerCase().includes(entitySearchQuery.toLowerCase()))
                                .slice(0, 30)
                                .map((s) => (
                                  <button
                                    key={s.school_code}
                                    type="button"
                                    onClick={() => {
                                      setSelectedSchool(s);
                                      setSelectedPartner({ name: s.partner_name, code: s.partner_code || 'PAR' });
                                      setSelectedDistributor({ name: s.distributor_name, code: s.distributor_code || 'DST' });
                                      setEntitySearchQuery(s.school_name);
                                      setIsEntityDropdownOpen(false);
                                    }}
                                    className="w-full text-left p-2.5 rounded-xl text-xs hover:bg-accent-soft dark:hover:bg-rule-2/60 flex items-center justify-between cursor-pointer"
                                  >
                                    <div>
                                      <div className="font-bold text-ink dark:text-primary-ink">{s.school_name}</div>
                                      <div className="text-[11px] text-slate-400 font-mono">
                                        Mã: {s.school_code} | Tuyến: {s.partner_name} ➔ {s.distributor_name}
                                      </div>
                                    </div>
                                    {selectedSchool?.school_code === s.school_code && <Check className="w-4 h-4 text-accent" />}
                                  </button>
                                ))}
                            </div>
                          )}

                          {selectedSchool && (
                            <div className="p-2.5 rounded-xl bg-white dark:bg-ink border border-accent-soft dark:border-rule-2/80 text-[11px] font-mono text-accent dark:text-accent-2 flex items-center gap-1.5 shadow-2xs">
                              <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                              <span>{selectedSchool.full_lineage}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* MỤC 1: TẠO MỚI & DUYỆT CHUỖI */}
                      {workspaceMainCategory === 'create_and_approve' && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { id: 'end_to_end', label: 'Trọn Gói Toàn Trình', desc: 'Trường ➔ Quản trị ➔ LMS' },
                              { id: 'partner_create_chain', label: 'Đối Tác Tạo & Duyệt', desc: 'Đối tác ➔ Quản trị' },
                              { id: 'distributor_create_chain', label: 'Nhà Phân Phối Tạo', desc: 'Phân phối ➔ Quản trị' },
                            ].map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => setCreateApproveSubFlow(sub.id as any)}
                                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${createApproveSubFlow === sub.id
                                  ? 'bg-accent text-accent-ink border-transparent shadow-xs'
                                  : 'bg-paper-2 border-rule-2 text-ink-2 hover:bg-paper'
                                  }`}
                              >
                                <div className="font-bold text-xs">{sub.label}</div>
                                <div className={`text-[10px] ${createApproveSubFlow === sub.id ? 'text-accent-ink' : 'text-ink-3'}`}>
                                  {sub.desc}
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Danh Sách Khóa Học Cấp Phép */}
                          <div className="space-y-3 pt-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-accent dark:text-accent-2 flex items-center gap-1.5">
                                <BookOpen className="w-4 h-4 text-sky-600" />
                                <span>Danh Sách Khóa Học Cấp Phép ({selectedCourses.length} Môn):</span>
                              </label>

                              <button
                                type="button"
                                onClick={handleAddCourseRow}
                                className="flex items-center gap-1 text-xs px-3 py-1 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 rounded-xl font-bold hover:bg-sky-100 cursor-pointer shadow-2xs transition"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Thêm Môn Học</span>
                              </button>
                            </div>

                            {selectedCourses.map((cRow, idx) => {
                              const filteredCourses = workspaceCoursesList.filter((c) => c.category === cRow.category);
                              return (
                                <div
                                  key={idx}
                                  className="p-3.5 bg-paper-2 rounded-2xl border border-accent-soft space-y-2.5 shadow-2xs"
                                >
                                  <div className="flex items-center justify-between text-xs font-bold text-ink dark:text-primary-ink">
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

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Phân loại:</label>
                                      <select
                                        value={cRow.category}
                                        onChange={(e) => {
                                          const cat = e.target.value;
                                          const match = workspaceCoursesList.filter((c) => c.category === cat);
                                          const first = match[0] || workspaceCoursesList[0];
                                          const updated = [...selectedCourses];
                                          updated[idx] = {
                                            ...updated[idx],
                                            category: cat,
                                            course_id: first.course_id,
                                            course_name: first.course_name,
                                            lms_url: first.lms_url,
                                          };
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-paper-2 dark:bg-ink border border-rule dark:border-rule-2 rounded-xl p-2 text-xs font-semibold cursor-pointer outline-none"
                                      >
                                        {workspaceCategoriesList.map((cat) => (
                                          <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="sm:col-span-2">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Chọn môn học ({filteredCourses.length} môn):</label>
                                      <select
                                        value={cRow.course_id}
                                        onChange={(e) => {
                                          const cId = parseInt(e.target.value);
                                          const target = workspaceCoursesList.find((c) => c.course_id === cId);
                                          if (target) {
                                            const updated = [...selectedCourses];
                                            updated[idx] = {
                                              ...updated[idx],
                                              course_id: target.course_id,
                                              course_name: target.course_name,
                                              lms_url: target.lms_url,
                                            };
                                            setSelectedCourses(updated);
                                          }
                                        }}
                                        className="w-full bg-paper-2 dark:bg-ink border border-rule dark:border-rule-2 rounded-xl p-2 text-xs font-semibold cursor-pointer outline-none truncate"
                                      >
                                        {filteredCourses.map((c) => (
                                          <option key={c.course_id} value={c.course_id}>
                                            {c.course_name} (ID: {c.course_id})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Licenses:</label>
                                      <input
                                        type="number"
                                        value={cRow.licenses}
                                        min={1}
                                        onChange={(e) => {
                                          const updated = [...selectedCourses];
                                          updated[idx].licenses = parseInt(e.target.value) || 1;
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2 text-xs font-bold outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Bắt Đầu:</label>
                                      <input
                                        type="text"
                                        value={cRow.start_date}
                                        placeholder="dd-mm-yyyy"
                                        onChange={(e) => {
                                          const updated = [...selectedCourses];
                                          updated[idx].start_date = e.target.value;
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2 text-xs font-mono outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Hết Hạn:</label>
                                      <input
                                        type="text"
                                        value={cRow.end_date}
                                        placeholder="dd-mm-yyyy"
                                        onChange={(e) => {
                                          const updated = [...selectedCourses];
                                          updated[idx].end_date = e.target.value;
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2 text-xs font-mono outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* MỤC 3: TẠO TÀI KHOẢN BATCH */}
                      {workspaceMainCategory === 'bulk_accounts' && (
                        <div className="p-4 bg-paper-2 rounded-2xl border border-accent-soft space-y-3 shadow-2xs">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-accent-soft text-accent rounded-xl">
                              <Users className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-bold text-xs text-primary">
                                Nộp File Excel Tạo Tài Khoản Hàng Loạt
                              </div>
                              <div className="text-[10px] text-ink-2">
                                Trường: <strong className="text-accent">{selectedSchool?.school_name}</strong>
                              </div>
                            </div>
                          </div>

                          <input
                            type="file"
                            ref={fileInputRef}
                            accept=".xlsx,.xls,.csv"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setUploadedAccountsFile(file);
                                toast.success(`Đã chọn file: ${file.name}`);
                              }
                            }}
                            className="hidden"
                          />

                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-accent-soft hover:border-accent rounded-xl p-6 text-center cursor-pointer transition bg-accent-soft/40 flex flex-col items-center justify-center gap-1.5"
                          >
                            <UploadCloud className="w-6 h-6 text-accent" />
                            {uploadedAccountsFile ? (
                              <span className="font-bold text-xs text-primary">
                                📎 {uploadedAccountsFile.name} ({Math.round(uploadedAccountsFile.size / 1024)} KB)
                              </span>
                            ) : taskModalTicket.attachments?.length ? (
                              <span className="text-xs text-accent font-semibold">
                                Sẽ dùng file đính kèm từ Ticket: {taskModalTicket.attachments[0].filename} (Bấm để đổi)
                              </span>
                            ) : (
                              <span className="text-xs text-ink-2">
                                Bấm hoặc kéo thả file Excel vào đây
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* MỤC 4: GHI DANH LMS */}
                      {workspaceMainCategory === 'lms_enroll' && (
                        <div className="p-4 bg-white dark:bg-ink rounded-2xl border border-emerald-200 space-y-4 shadow-2xs">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="w-4 h-4 text-emerald-600" />
                            <span className="font-extrabold text-xs text-ink dark:text-primary-ink">
                              Ghi Danh Khóa Học PLearn LMS (learn.pythaverse.space)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Phân loại:</label>
                              <select
                                value={lmsCourseCategory}
                                onChange={(e) => {
                                  const cat = e.target.value;
                                  setLmsCourseCategory(cat);
                                  const match = lmsCoursesList.filter((c) => c.category === cat);
                                  if (match.length > 0) {
                                    setLmsCourseId(match[0].course_id);
                                    setLmsCourseName(match[0].course_name);
                                  }
                                }}
                                className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2 text-xs font-semibold outline-none cursor-pointer"
                              >
                                {lmsCategoriesList.map((cat) => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Khóa học LMS ({lmsCoursesList.filter((c) => c.category === lmsCourseCategory).length} môn):</label>
                              <select
                                value={lmsCourseId}
                                onChange={(e) => {
                                  const cId = parseInt(e.target.value);
                                  setLmsCourseId(cId);
                                  const target = lmsCoursesList.find((c) => c.course_id === cId);
                                  if (target) setLmsCourseName(target.course_name);
                                }}
                                className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2 text-xs font-semibold outline-none cursor-pointer truncate"
                              >
                                {lmsCoursesList
                                  .filter((c) => c.category === lmsCourseCategory)
                                  .map((c) => (
                                    <option key={c.course_id} value={c.course_id}>
                                      {c.course_name} (ID: {c.course_id})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Bắt Đầu / Hết Hạn:</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={lmsStartDate}
                                  onChange={(e) => setLmsStartDate(e.target.value)}
                                  className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2 text-xs font-mono"
                                />
                                <span className="text-slate-400">➔</span>
                                <input
                                  type="text"
                                  value={lmsEndDate}
                                  onChange={(e) => setLmsEndDate(e.target.value)}
                                  className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2 text-xs font-mono"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Tên Nhóm / Group (Tùy chọn):</label>
                              <input
                                type="text"
                                value={lmsGroupName}
                                onChange={(e) => setLmsGroupName(e.target.value)}
                                placeholder="VD: CLASS_2026"
                                className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2 text-xs"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[11px] font-bold text-sky-700 dark:text-sky-300">
                              🎓 Danh Sách Email Học Viên (Mỗi dòng 1 email):
                            </label>
                            <textarea
                              rows={4}
                              value={lmsStudentEmails}
                              onChange={(e) => setLmsStudentEmails(e.target.value)}
                              placeholder="student1@pythaverse.space&#10;student2@pythaverse.space"
                              className="w-full bg-paper-2 dark:bg-ink border border-rule rounded-xl p-2.5 text-xs font-mono outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BƯỚC 2B: KEYCLOAK IDENTITY */}
                  {selectedBotType === 'keycloak_api' && (
                    <div className="space-y-4 p-5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                          <KeyRound className="w-4 h-4 text-amber-600" />
                          <span>Quản Trị Danh Tính Keycloak:</span>
                        </label>
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                          Bảo vệ 3 lớp
                        </span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-ink dark:text-primary-ink">
                          Email hoặc Username Cần Xử Lý:
                        </label>
                        <input
                          type="text"
                          value={kcTargetEmail}
                          onChange={(e) => setKcTargetEmail(e.target.value)}
                          className="w-full bg-white dark:bg-ink border border-amber-300 rounded-xl p-2.5 text-xs font-bold outline-none"
                        />
                      </div>

                      <div className="space-y-3">
                        {/* Reset Pass */}
                        <div className="p-3.5 rounded-2xl border bg-white dark:bg-ink border-amber-400 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <KeyRound className="w-4 h-4 text-amber-600" />
                              <span className="text-xs font-bold text-ink dark:text-primary-ink">1. Đặt Lại Mật Khẩu Tạm Thời</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setKcEnableResetPass(!kcEnableResetPass)}
                              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${kcEnableResetPass ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'}`}
                            >
                              <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                            </button>
                          </div>
                          {kcEnableResetPass && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-rule">
                              <input
                                type="text"
                                value={kcTempPass}
                                onChange={(e) => setKcTempPass(e.target.value)}
                                className="w-full bg-paper-2 border border-rule rounded-xl p-1.5 text-xs font-mono font-bold"
                              />
                              <label className="text-xs flex items-center gap-1.5 text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={kcForceChange}
                                  onChange={(e) => setKcForceChange(e.target.checked)}
                                />
                                <span>Bắt buộc đổi mật khẩu</span>
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Email Verified */}
                        <div className="p-3.5 rounded-2xl border bg-white dark:bg-ink border-amber-400 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                              <span className="text-xs font-bold text-ink dark:text-primary-ink">2. Xác Thực Email (Email Verified)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setKcEnableVerify(!kcEnableVerify)}
                              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${kcEnableVerify ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'}`}
                            >
                              <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                            </button>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="p-3.5 rounded-2xl border bg-white dark:bg-ink border-amber-400 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <UserX className="w-4 h-4 text-rose-600" />
                              <span className="text-xs font-bold text-ink dark:text-primary-ink">3. Trạng Thái Hoạt Động (Account Status)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setKcEnableStatus(!kcEnableStatus)}
                              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${kcEnableStatus ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'}`}
                            >
                              <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BƯỚC 2C: FEEDBACK SHEET & GOOGLE DOC */}
                  {selectedBotType === 'feedback_doc_triage' && (
                    <div className="space-y-3 p-5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span>Đường Dẫn Google Doc Báo Cáo:</span>
                        </label>
                      </div>

                      <input
                        type="text"
                        value={docUrl}
                        onChange={(e) => setDocUrl(e.target.value)}
                        placeholder="https://docs.google.com/document/d/..."
                        className="w-full bg-white dark:bg-ink border border-blue-300 rounded-xl p-2.5 text-xs outline-none"
                      />

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-ink">Email Phân Công (@dtt.vn):</label>
                        <input
                          type="email"
                          value={assigneeEmail}
                          onChange={(e) => setAssigneeEmail(e.target.value)}
                          className="w-full bg-white dark:bg-ink border border-blue-300 rounded-xl p-2.5 text-xs outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-ink">Nội Dung Comment Gắn Vào Doc:</label>
                        <textarea
                          rows={3}
                          value={feedbackCommentContent}
                          onChange={(e) => setFeedbackCommentContent(e.target.value)}
                          className="w-full bg-white dark:bg-ink border border-blue-300 rounded-xl p-2.5 text-xs outline-none"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* CHẾ ĐỘ JSON RAW */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-primary">
                    <span className="flex items-center gap-1.5">
                      <Code2 className="w-4 h-4 text-accent" />
                      <span>Chỉnh Sửa Trực Tiếp Tham Số Thực Thi (Payload JSON):</span>
                    </span>
                    <span className="text-[10px] text-ink-3 font-mono">Đồng bộ 2 chiều</span>
                  </div>
                  <textarea
                    rows={12}
                    value={payloadText}
                    onChange={(e) => setPayloadText(e.target.value)}
                    className="w-full bg-ink text-primary-ink rounded-2xl p-4 text-xs font-mono outline-none border border-rule-2 focus:border-accent leading-relaxed shadow-inner"
                  />
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-rule shrink-0">
              <button
                type="button"
                onClick={() => setTaskModalTicket(null)}
                className="px-4 py-2.5 rounded-xl border border-rule-2 text-xs font-bold text-ink-2 hover:bg-paper-2 transition cursor-pointer"
              >
                Hủy Bỏ
              </button>

              <button
                type="button"
                disabled={creatingTask}
                onClick={handleConfirmCreateTask}
                className="px-6 py-2.5 bg-accent hover:bg-accent-2 text-accent-ink text-xs font-extrabold rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {creatingTask ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang Lưu...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
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