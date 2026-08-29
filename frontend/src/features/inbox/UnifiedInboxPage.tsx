import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
  SlidersHorizontal,
  FileCheck,
  Users,
  GraduationCap,
  UploadCloud,
  Code2,
  GitPullRequest,
  RefreshCw,
  ClipboardCheck,
  Info
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
  const [activeCategoryDropdown, setActiveCategoryDropdown] = useState<string | null>(null);

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
  // 🚀 STATE STUDIO PRO MODAL
  // =========================================================================
  const [taskModalTicket, setTaskModalTicket] = useState<InboxTicket | null>(null);
  const [selectedBotType, setSelectedBotType] = useState<'workspace_rpa' | 'keycloak_api' | 'feedback_doc_triage'>('workspace_rpa');

  const [workspaceMainCategory, setWorkspaceMainCategory] = useState<'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll'>('create_and_approve');
  const [approveSubFlow, setApproveSubFlow] = useState<'approve_school_order' | 'approve_partner_contract' | 'admin_approve_contract'>('approve_school_order');
  const [createApproveSubFlow, setCreateApproveSubFlow] = useState<'end_to_end' | 'partner_create_chain' | 'distributor_create_chain'>('end_to_end');

  const [contactInfo, setContactInfo] = useState<string>('Admin Automation Hub (operation@pythaverse.space)');
  const [additionalNotes, setAdditionalNotes] = useState<string>('Pythaverse Auto-Pipeline Managed');

  const [universalSearchQuery, setUniversalSearchQuery] = useState<string>('');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [selectedCachedItem, setSelectedCachedItem] = useState<ScrapedPendingItem | null>(null);
  const [adminJustification, setAdminJustification] = useState<string>('Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub');
  const [scrapedPendingList, setScrapedPendingList] = useState<ScrapedPendingItem[]>([]);
  const [isScrapingLive, setIsScrapingLive] = useState<boolean>(false);
  const [parsedOrderCourses, setParsedOrderCourses] = useState<any[]>([]);

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

  const [creatingTask, setCreatingTask] = useState<boolean>(false);
  const [runningImmediate, setRunningImmediate] = useState<boolean>(false);
  const [extractingCof, setExtractingCof] = useState<boolean>(false);
  const [payloadText, setPayloadText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const SPREADSHEET_ID = '1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go';

  // Nạp danh sách tickets
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

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
        setIsEntityDropdownOpen(false);
      }
      setActiveCategoryDropdown(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Nạp danh sách đơn hàng Cache khi chọn tab Approve
  const handleFetchCachedList = async () => {
    setIsScrapingLive(true);
    try {
      let freshData: ScrapedPendingItem[] = [];
      if (approveSubFlow === 'approve_school_order') {
        const res = await fetchApi<any>(`/workspace/cached-pending-orders`);
        freshData = res?.orders || [];
      } else if (approveSubFlow === 'approve_partner_contract') {
        const res = await fetchApi<any>(`/workspace/cached-pending-contracts?contract_type=PRT`);
        freshData = res?.contracts || [];
      } else if (approveSubFlow === 'admin_approve_contract') {
        const res = await fetchApi<any>(`/workspace/cached-pending-contracts?contract_type=DST`);
        freshData = res?.contracts || [];
      }
      setScrapedPendingList(freshData);
    } catch (err) {
      console.warn('Lỗi đọc dữ liệu Cache:', err);
    } finally {
      setIsScrapingLive(false);
    }
  };

  useEffect(() => {
    if (taskModalTicket && selectedBotType === 'workspace_rpa' && workspaceMainCategory === 'approve') {
      handleFetchCachedList();
    }
  }, [approveSubFlow, workspaceMainCategory, selectedBotType, taskModalTicket]);

  const stats = useMemo(() => {
    const total = tickets.length;
    const pending = tickets.filter((t) => !t.status || t.status === 'pending').length;
    const processing = tickets.filter((t) => t.status === 'processing' || t.status === 'waiting_poll').length;
    const resolved = tickets.filter((t) => t.status === 'completed').length;
    return { total, pending, processing, resolved };
  }, [tickets]);

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

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedSource('all');
    setSelectedCategory('all');
    setSelectedStatus('all');
    setSortOrder('desc');
    toast.info('Đã xóa tất cả bộ lọc');
  };

  const getDirectSourceUrl = (ticket: InboxTicket) => {
    if (ticket.source === 'gmail') {
      return `https://mail.google.com/mail/u/0/#search/id%3A${ticket.source_id}`;
    } else if (ticket.source === 'google_form') {
      if (ticket.doc_url) return ticket.doc_url;
      const rowIdx = ticket.metadata?.row_index || 2;
      return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0&range=A${rowIdx}:P${rowIdx}`;
    } else if (ticket.source === 'osticket') {
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
  // ⚡ AUTO-PREFILL THÔNG MINH TỪ REQUEST VÀO MODAL STUDIO
  // =========================================================================
  const handleOpenTaskModal = (ticket: InboxTicket) => {
    setTaskModalTicket(ticket);
    setViewMode('form');

    const fullText = `${ticket.subject || ''} ${ticket.raw_content || ''} ${ticket.submitter_name || ''} ${ticket.metadata?.school_name || ''}`.toLowerCase();

    // 1. Tự động nhận diện trường học từ phả hệ
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

    setKcTargetEmail(ticket.sender_email);
    setDocUrl(ticket.doc_url || '');
    setAssigneeEmail(ticket.assigned_email || 'hung.nguyenmanh@dtt.vn');

    // 2. Điền thông tin COF nếu backend đã parse sẵn trong metadata
    if (ticket.metadata?.cof_courses && ticket.metadata.cof_courses.length > 0) {
      setSelectedCourses(ticket.metadata.cof_courses);
    } else {
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

    // 3. Phân loại Cỗ máy theo phân loại AI Triage
    let botType: 'workspace_rpa' | 'keycloak_api' | 'feedback_doc_triage' = 'workspace_rpa';
    let mainCat: 'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll' = 'create_and_approve';

    if (ticket.category === 'account_keycloak') {
      botType = 'keycloak_api';
      setKcEnableResetPass(true);
    } else if (ticket.category === 'lms_enroll') {
      botType = 'workspace_rpa';
      mainCat = 'lms_enroll';
      const emailMatches = ticket.raw_content?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const cleanEmails = Array.from(new Set(emailMatches.filter(e => !e.includes('pythaverse.space') && !e.includes('dtt.vn'))));
      if (cleanEmails.length > 0) {
        setLmsStudentEmails(cleanEmails.join('\n'));
      }
    } else if (ticket.category === 'license') {
      botType = 'workspace_rpa';
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

  // ⚡ TỰ ĐỘNG TÍNH TOÁN PAYLOAD JSON ĐỒNG BỘ
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

  // ⚡ HÀM GỬI TÁC VỤ (HỖ TRỢ CẢ "ĐƯA VÀO HÀNG ĐỢI" VÀ "CHẠY NGAY 1-CLICK")
  const handleSubmitBotTask = async (runImmediately: boolean) => {
    if (!taskModalTicket) return;

    let finalPayloadData = {};
    try {
      finalPayloadData = JSON.parse(payloadText);
    } catch (e) {
      toast.error('JSON không hợp lệ! Vui lòng kiểm tra lại cú pháp.');
      return;
    }

    if (runImmediately) setRunningImmediate(true);
    else setCreatingTask(true);

    try {
      let actualBotType: BotType | 'lms_playwright' = selectedBotType;
      if (selectedBotType === 'workspace_rpa' && workspaceMainCategory === 'lms_enroll') {
        actualBotType = 'lms_playwright';
      }

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
          run_immediately: runImmediately,
          approval_status: runImmediately ? 'approved' : 'pending',
        }),
      });

      if (runImmediately) {
        toast.success(
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã kích hoạt Worker chạy ngay!</span>
            </div>
            <button
              onClick={() => navigate('/bots')}
              className="text-indigo-400 hover:underline text-xs font-semibold cursor-pointer block mt-1 transition"
            >
              Mở Bot Command Center xem Live Terminal ➔
            </button>
          </div>,
          { duration: 5000 }
        );
      } else {
        toast.success(
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã đưa tác vụ vào Hàng Đợi Phê Duyệt!</span>
            </div>
            <button
              onClick={() => navigate('/tasks')}
              className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-semibold cursor-pointer block mt-1 transition"
            >
              Chuyển đến Task & Approval Hub để duyệt ➔
            </button>
          </div>,
          { duration: 5000 }
        );
      }

      setTaskModalTicket(null);
      await loadTickets(true);
    } catch (err) {
      toast.error('Lỗi tạo tác vụ: ' + (err as Error).message);
    } finally {
      setCreatingTask(false);
      setRunningImmediate(false);
    }
  };

  const renderSourceBadge = (source: string) => {
    switch (source) {
      case 'gmail':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-2xs">
            <Mail className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> GMAIL
          </span>
        );
      case 'google_form':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs">
            <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> FORM
          </span>
        );
      case 'osticket':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
            <Ticket className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> OS TICKET
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
            {source.toUpperCase()}
          </span>
        );
    }
  };

  const renderStatusPill = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> ĐÃ XỬ LÝ
          </span>
        );
      case 'processing':
      case 'waiting_poll':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs">
            <RefreshCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 animate-spin" /> ĐANG XỬ LÝ
          </span>
        );
      case 'dismissed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <XCircle className="w-3.5 h-3.5 text-slate-500" /> ĐÃ BỎ QUA
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> CHỜ XỬ LÝ
          </span>
        );
    }
  };

  const getCategoryBadge = (category: string, ticketId: string) => {
    const isDropdownOpen = activeCategoryDropdown === ticketId;
    const catLabel =
      category === 'bug'
        ? 'System Bugs'
        : category === 'account_keycloak'
          ? 'Keycloak/Account'
          : category === 'lms_enroll'
            ? 'LMS Enroll'
            : category === 'license'
              ? 'License'
              : 'Khác';

    return (
      <div className="relative inline-block">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveCategoryDropdown(isDropdownOpen ? null : ticketId);
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors shadow-2xs cursor-pointer"
        >
          <Tag className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          <span>{catLabel.toUpperCase()}</span>
          <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
        </button>

        {isDropdownOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400">
              Đổi Phân Loại
            </div>
            {[
              { id: 'bug', label: '🐛 System Bugs' },
              { id: 'account_keycloak', label: '🔑 Keycloak/Account' },
              { id: 'lms_enroll', label: '🎓 LMS Enroll' },
              { id: 'license', label: '📜 License' },
              { id: 'other', label: '📌 Khác' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  handleCategoryChange(ticketId, opt.id);
                  setActiveCategoryDropdown(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${category === opt.id
                  ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <span>{opt.label}</span>
                {category === opt.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="space-y-6 max-w-7xl mx-auto pb-16"
      onClick={() => setActiveCategoryDropdown(null)}
    >
      {/* 1. Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
              Unified Inbox Feed
            </h1>
            <span className="px-3 py-1 text-xs font-bold rounded-full bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shadow-2xs">
              Tổng cộng: {tickets.length} ticket
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
            Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage.
          </p>
        </div>
      </div>

      {/* 2. Bento Metric Summary Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          className="bg-blue-50 dark:bg-blue-950/40 rounded-[2rem] p-5 border border-blue-100 dark:border-blue-900/50 flex flex-col justify-between shadow-xs hover:-translate-y-0.5 transition-transform duration-200"
        >
          <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">
            Tổng số yêu cầu
          </span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.total}
            </div>
            <div className="text-xs text-blue-400 font-medium">100% feed đồng bộ</div>
          </div>
        </div>

        <div
          className="bg-amber-50 dark:bg-amber-950/40 rounded-[2rem] p-5 border border-amber-100 dark:border-amber-900/50 flex flex-col justify-between shadow-xs hover:-translate-y-0.5 transition-transform duration-200"
        >
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
            Chờ xử lý
          </span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.pending}
            </div>
            <div className="text-xs text-amber-500 font-medium">Cần thực thi ngay</div>
          </div>
        </div>

        <div
          className="bg-purple-50 dark:bg-purple-950/40 rounded-[2rem] p-5 border border-purple-100 dark:border-purple-900/50 flex flex-col justify-between shadow-xs hover:-translate-y-0.5 transition-transform duration-200"
        >
          <span className="text-xs font-bold text-purple-500 uppercase tracking-widest">
            Đang xử lý
          </span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.processing}
            </div>
            <div className="text-xs text-purple-400 font-medium">Đang chạy qua Bot/Worker</div>
          </div>
        </div>

        <div
          className="bg-emerald-50 dark:bg-emerald-950/40 rounded-[2rem] p-5 border border-emerald-100 dark:border-emerald-900/50 flex flex-col justify-between shadow-xs hover:-translate-y-0.5 transition-transform duration-200"
        >
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
            Đã giải quyết
          </span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.resolved}
            </div>
            <div className="text-xs text-emerald-500 font-medium">Hoàn tất quy trình</div>
          </div>
        </div>
      </div>

      {/* 3. Bento Search & Filter Control Bar */}
      <div className="p-5 sm:p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm nhanh theo tiêu đề, người gửi, tóm tắt AI, mã ID, nội dung, trường học..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Nguồn:</span>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-900">Tất cả Nguồn</option>
                <option value="gmail" className="bg-white dark:bg-slate-900">✉️ Gmail</option>
                <option value="google_form" className="bg-white dark:bg-slate-900">📝 Google Form</option>
                <option value="osticket" className="bg-white dark:bg-slate-900">🎫 OS Ticket</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Phân loại:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-900">Tất cả Category</option>
                <option value="bug" className="bg-white dark:bg-slate-900">🐛 System Bugs</option>
                <option value="account_keycloak" className="bg-white dark:bg-slate-900">🔑 Keycloak/Account</option>
                <option value="lms_enroll" className="bg-white dark:bg-slate-900">🎓 LMS Enroll</option>
                <option value="license" className="bg-white dark:bg-slate-900">📜 License</option>
                <option value="other" className="bg-white dark:bg-slate-900">📌 Khác</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Trạng thái:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-900">Tất cả trạng thái</option>
                <option value="pending" className="bg-white dark:bg-slate-900">⏳ Chờ xử lý</option>
                <option value="processing" className="bg-white dark:bg-slate-900">🔄 Đang xử lý</option>
                <option value="completed" className="bg-white dark:bg-slate-900">✅ Đã giải quyết</option>
                <option value="dismissed" className="bg-white dark:bg-slate-900">🗑️ Đã bỏ qua</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{sortOrder === 'desc' ? 'Mới nhất ➔ Cũ nhất' : 'Cũ nhất ➔ Mới nhất'}</span>
            </button>

            {(searchQuery || selectedSource !== 'all' || selectedCategory !== 'all' || selectedStatus !== 'all') && (
              <button
                onClick={resetFilters}
                className="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-medium hover:bg-rose-100 transition-colors cursor-pointer"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Danh Sách Ticket */}
      {loading && tickets.length === 0 ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="p-6 sm:p-7 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-xs"
            >
              <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="h-20 w-full bg-slate-100 dark:bg-slate-800/40 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="p-12 text-center rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-indigo-500">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Không tìm thấy yêu cầu nào phù hợp
          </h3>
          <button
            onClick={resetFilters}
            className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : (
        <div className="space-y-5">
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
                id={`ticket-card-${ticket.id}`}
                className="p-6 sm:p-7 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all duration-200 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderSourceBadge(ticket.source)}
                    {renderStatusPill(ticket.status || 'pending')}
                    {getCategoryBadge(ticket.category || 'other', ticket.id)}

                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pl-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                        {ticket.submitter_name || ticket.sender_email}
                      </span>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 opacity-60" />
                        <span>{displayTime}</span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={directUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 transition-colors shadow-2xs"
                  >
                    <span>Mở trang gốc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-snug">
                    {ticket.subject || 'Không có tiêu đề'}
                  </h2>
                  {ticket.metadata?.school_name && (
                    <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-0.5 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{ticket.metadata.school_name}</span>
                    </p>
                  )}
                </div>

                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {attachments.map((file: any, idx: number) => {
                      const isExcel = file.filename?.endsWith('.xlsx') || file.filename?.endsWith('.xls');
                      const isImage = file.filename?.endsWith('.png') || file.filename?.endsWith('.jpg') || file.filename?.endsWith('.jpeg');

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all shadow-2xs group cursor-pointer"
                        >
                          {isImage ? (
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                          ) : isExcel ? (
                            <FileSpreadsheetIcon className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
                          )}
                          <span className="truncate max-w-[200px]">{file.filename}</span>
                          <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 ml-0.5 transition-colors" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Gemini AI Summary Box */}
                <div className="p-5 sm:p-6 rounded-[2rem] bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      Tóm tắt & Đề xuất tự động từ Gemini AI
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-emerald-100/70 dark:border-emerald-900/30 text-xs shadow-xs space-y-1">
                    <p className="text-slate-700 dark:text-slate-300 font-normal leading-relaxed whitespace-pre-line">
                      {ticket.ai_summary || 'Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích...'}
                    </p>
                  </div>
                </div>

                {/* Collapsible raw content */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedContent((prev) => ({ ...prev, [ticket.id]: !prev[ticket.id] }))
                    }
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{isExpanded ? 'Thu gọn nội dung gốc' : 'Xem nội dung gốc'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap leading-relaxed shadow-inner max-h-72 overflow-y-auto">
                      {cleanRawContent || '(Không có nội dung văn bản gốc)'}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400">
                    Mã tham chiếu: #{ticket.source_id || ticket.id.slice(0, 8)}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isDismissed ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                      >
                        {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>Khôi phục Hòm Thư</span>
                      </button>
                    ) : isCompleted ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Mở lại Ticket</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900 hover:bg-rose-100 transition-colors shadow-2xs cursor-pointer"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>Bỏ qua</span>
                        </button>

                        <button
                          onClick={() => handleCompleteTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                          <span>Hoàn thành</span>
                        </button>

                        <button
                          onClick={() => navigate('/github', { state: { ticket } })}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
                        >
                          <GitPullRequest className="w-3.5 h-3.5" />
                          <span>Tạo Issue GitHub</span>
                        </button>

                        <button
                          onClick={() => handleOpenTaskModal(ticket)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
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

      {/* ========================================================================= */}
      {/* 🚀 STUDIO PRO MODAL (DÙNG REACT PORTAL ĐƯA THẲNG VÀO BODY) */}
      {/* ========================================================================= */}
      {taskModalTicket && createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setTaskModalTicket(null); }}
          className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-full sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl shadow-2xl overflow-hidden p-6 sm:p-8 max-h-[92vh] flex flex-col my-auto"
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-md">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                      Automation Studio Pro (Điều Phối Cho Request)
                    </h3>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold uppercase">
                      Auto Pre-filled
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Dữ liệu đã được tự động điền dựa trên phân tích Request #{taskModalTicket.source_id || taskModalTicket.id.slice(0, 8)}.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setViewMode('form')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${viewMode === 'form'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs'
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
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs'
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
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Thân Modal cuộn */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-3">
              {viewMode === 'form' ? (
                <>
                  {/* BƯỚC 1: CHỌN CỖ MÁY BOT */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-extrabold">
                        1
                      </span>
                      <span>Chọn Cỗ Máy Tự Động Hóa:</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        { id: 'workspace_rpa', label: 'Workspace & LMS', icon: Building2, desc: 'Đơn Hàng, Hợp Đồng & LMS' },
                        { id: 'keycloak_api', label: 'Keycloak IDP', icon: KeyRound, desc: 'Quản Trị Người Dùng' },
                        { id: 'feedback_doc_triage', label: 'Feedback Sheet', icon: FileText, desc: 'Ghi Chú & Tag Doc Tự Động' },
                      ].map((tab) => {
                        const Icon = tab.icon;
                        const isSel = selectedBotType === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedBotType(tab.id as any)}
                            className={`flex flex-col items-start gap-1 p-3.5 rounded-2xl border text-left transition cursor-pointer ${isSel
                              ? 'bg-indigo-600 text-white border-transparent shadow-md'
                              : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                              }`}
                          >
                            <Icon className={`w-4 h-4 ${isSel ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
                            <span className="text-xs font-bold mt-1">{tab.label}</span>
                            <span className={`text-[10px] ${isSel ? 'text-indigo-200' : 'text-slate-400'}`}>{tab.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* BƯỚC 2A: WORKSPACE & LMS */}
                  {selectedBotType === 'workspace_rpa' && (
                    <div className="space-y-4 p-5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-extrabold">
                            2
                          </span>
                          <span>Chọn Phân Luồng Nghiệp Vụ Cốt Lõi:</span>
                        </label>

                        <button
                          type="button"
                          onClick={handleAutoExtractCof}
                          disabled={extractingCof}
                          className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold rounded-xl transition cursor-pointer shadow-2xs hover:bg-indigo-50"
                        >
                          {extractingCof ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                          <span>AI Tái Bóc Tách File COF</span>
                        </button>
                      </div>

                      {/* 4 Tabs Nghiệp vụ như Studio */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl text-xs font-medium">
                        {[
                          { id: 'approve', label: '1. Phê Duyệt', icon: ClipboardCheck },
                          { id: 'create_and_approve', label: '2. Tạo & Duyệt', icon: Zap },
                          { id: 'bulk_accounts', label: '3. Tạo Tài Khoản', icon: Users },
                          { id: 'lms_enroll', label: '4. Ghi Danh LMS', icon: GraduationCap },
                        ].map((mTab) => {
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
                                ? 'bg-white dark:bg-slate-900 font-bold text-indigo-600 dark:text-indigo-400 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                              <span>{mTab.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* LUỒNG 1: PHÊ DUYỆT ĐƠN HÀNG/HỢP ĐỒNG */}
                      {workspaceMainCategory === 'approve' && (
                        <div className="space-y-4 pt-1">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { id: 'approve_school_order', label: 'Đơn Hàng Trường', desc: 'Duyệt Order của Trường' },
                              { id: 'approve_partner_contract', label: 'Hợp Đồng Đối Tác', desc: 'Duyệt Contract PRT' },
                              { id: 'admin_approve_contract', label: 'Hợp Đồng Quản Trị', desc: 'Duyệt Contract DST' },
                            ].map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => {
                                  setApproveSubFlow(sub.id as any);
                                  setSelectedItemCode('');
                                  setSelectedCachedItem(null);
                                }}
                                className={`rounded-xl border p-3 text-left transition cursor-pointer ${approveSubFlow === sub.id
                                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                                  }`}
                              >
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{sub.label}</p>
                                <p className="text-[10px] text-slate-400">{sub.desc}</p>
                              </button>
                            ))}
                          </div>

                          <div className="relative">
                            <input
                              type="text"
                              value={universalSearchQuery}
                              onChange={(e) => setUniversalSearchQuery(e.target.value)}
                              placeholder="Tìm kiếm mã đơn / tên trường trong danh sách..."
                              className="w-full pl-3 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-white dark:bg-slate-900">
                            {isScrapingLive ? (
                              <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                <span>Đang nạp danh sách cache...</span>
                              </div>
                            ) : scrapedPendingList.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400">Không có mục nào trong danh sách cache.</div>
                            ) : (
                              scrapedPendingList.map((item, idx) => {
                                const code = item.order_code || item.contract_code || `ITEM-${idx}`;
                                const isSel = selectedItemCode === code;
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => {
                                      setSelectedItemCode(code);
                                      setSelectedCachedItem(item);
                                      if (item.courses_data) setParsedOrderCourses(item.courses_data);
                                    }}
                                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${isSel ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-100 dark:border-slate-800'}`}
                                  >
                                    <div className="flex justify-between font-bold">
                                      <span>{code}</span>
                                      <span className="text-[10px] text-amber-600">{item.status || 'Pending'}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-500">{item.school_name || item.sender_name}</div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                      {/* LUỒNG 2: TẠO MỚI & DUYỆT TRỌN GÓI */}
                      {workspaceMainCategory === 'create_and_approve' && (
                        <div className="space-y-4">
                          {/* Trường học áp dụng */}
                          <div className="space-y-1.5 relative" ref={entityDropdownRef}>
                            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Trường Học Áp Dụng (Phả hệ 480 trường):</span>
                              </span>
                              {selectedSchool && (
                                <span className="text-xs text-indigo-600 font-bold font-mono">
                                  {selectedSchool.school_code}
                                </span>
                              )}
                            </label>

                            <input
                              type="text"
                              value={entitySearchQuery}
                              onFocus={() => setIsEntityDropdownOpen(true)}
                              onChange={(e) => {
                                setEntitySearchQuery(e.target.value);
                                setIsEntityDropdownOpen(true);
                              }}
                              placeholder="Tra cứu trong 480 trường..."
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white outline-none"
                            />

                            {isEntityDropdownOpen && (
                              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1">
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
                                      className="w-full text-left p-2.5 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                                    >
                                      <div>
                                        <div className="font-bold text-slate-800 dark:text-slate-200">{s.school_name}</div>
                                        <div className="text-[11px] text-slate-400 font-mono">
                                          Mã: {s.school_code} | Tuyến: {s.partner_name} ➔ {s.distributor_name}
                                        </div>
                                      </div>
                                      {selectedSchool?.school_code === s.school_code && <Check className="w-4 h-4 text-indigo-600" />}
                                    </button>
                                  ))}
                              </div>
                            )}

                            {selectedSchool && (
                              <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-slate-800 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 shadow-2xs">
                                <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span>{selectedSchool.full_lineage}</span>
                              </div>
                            )}
                          </div>

                          {/* Danh Sách Khóa Học */}
                          <div className="space-y-3 pt-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                                <BookOpen className="w-4 h-4 text-indigo-600" />
                                <span>Danh Sách Khóa Học ({selectedCourses.length} Môn):</span>
                              </label>

                              <button
                                type="button"
                                onClick={handleAddCourseRow}
                                className="flex items-center gap-1 text-xs px-3 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl font-bold hover:bg-indigo-100 cursor-pointer shadow-2xs transition"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Thêm Khóa Học</span>
                              </button>
                            </div>

                            {selectedCourses.map((cRow, idx) => {
                              const filteredCourses = workspaceCoursesList.filter((c) => c.category === cRow.category);
                              return (
                                <div
                                  key={idx}
                                  className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-slate-800 space-y-2 shadow-2xs"
                                >
                                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
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
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold"
                                      >
                                        {workspaceCategoriesList.map((cat) => (
                                          <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="sm:col-span-2">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Chọn khóa học:</label>
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
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold truncate"
                                      >
                                        {filteredCourses.map((c) => (
                                          <option key={c.course_id} value={c.course_id}>
                                            {c.course_name} (ID: {c.course_id})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-bold"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Start Date:</label>
                                      <input
                                        type="text"
                                        value={cRow.start_date}
                                        onChange={(e) => {
                                          const updated = [...selectedCourses];
                                          updated[idx].start_date = e.target.value;
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">End Date:</label>
                                      <input
                                        type="text"
                                        value={cRow.end_date}
                                        onChange={(e) => {
                                          const updated = [...selectedCourses];
                                          updated[idx].end_date = e.target.value;
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* LUỒNG 3: TẠO TÀI KHOẢN BATCH */}
                      {workspaceMainCategory === 'bulk_accounts' && (
                        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-slate-800 space-y-3 shadow-2xs">
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
                            className="border-2 border-dashed border-indigo-200 dark:border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center gap-1.5"
                          >
                            <UploadCloud className="w-6 h-6 text-indigo-600" />
                            {uploadedAccountsFile ? (
                              <span className="font-bold text-xs text-indigo-600">
                                📎 {uploadedAccountsFile.name} ({Math.round(uploadedAccountsFile.size / 1024)} KB)
                              </span>
                            ) : taskModalTicket.attachments?.length ? (
                              <span className="text-xs text-indigo-600 font-semibold">
                                Sẽ dùng file từ Ticket: {taskModalTicket.attachments[0].filename} (Bấm để đổi)
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Bấm hoặc kéo thả file Excel vào đây
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* LUỒNG 4: GHI DANH LMS */}
                      {workspaceMainCategory === 'lms_enroll' && (
                        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 space-y-3 shadow-2xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Khóa học LMS:</label>
                              <select
                                value={lmsCourseId}
                                onChange={(e) => {
                                  const cId = parseInt(e.target.value);
                                  setLmsCourseId(cId);
                                  const target = lmsCoursesList.find((c) => c.course_id === cId);
                                  if (target) setLmsCourseName(target.course_name);
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold truncate"
                              >
                                {lmsCoursesList.map((c) => (
                                  <option key={c.course_id} value={c.course_id}>
                                    {c.course_name} (ID: {c.course_id})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Tên Nhóm / Group:</label>
                              <input
                                type="text"
                                value={lmsGroupName}
                                onChange={(e) => setLmsGroupName(e.target.value)}
                                placeholder="VD: CLASS_2026"
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-sky-700 dark:text-sky-300">
                              🎓 Danh Sách Email Học Viên (Mỗi dòng 1 email):
                            </label>
                            <textarea
                              rows={4}
                              value={lmsStudentEmails}
                              onChange={(e) => setLmsStudentEmails(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BƯỚC 2B: KEYCLOAK IDENTITY */}
                  {selectedBotType === 'keycloak_api' && (
                    <div className="space-y-3 p-5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Email Cần Xử Lý:
                        </label>
                        <input
                          type="text"
                          value={kcTargetEmail}
                          onChange={(e) => setKcTargetEmail(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                        />
                      </div>

                      <div className="p-3 rounded-xl border bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 flex items-center justify-between">
                        <span className="text-xs font-bold">1. Đổi Mật Khẩu Tạm Thời</span>
                        <input
                          type="text"
                          value={kcTempPass}
                          onChange={(e) => setKcTempPass(e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-xs font-mono font-bold w-36 text-center"
                        />
                      </div>
                    </div>
                  )}

                  {/* BƯỚC 2C: FEEDBACK SHEET */}
                  {selectedBotType === 'feedback_doc_triage' && (
                    <div className="space-y-3 p-5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Google Doc URL:</label>
                        <input
                          type="text"
                          value={docUrl}
                          onChange={(e) => setDocUrl(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl p-2.5 text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Email Phân Công (@dtt.vn):</label>
                        <input
                          type="email"
                          value={assigneeEmail}
                          onChange={(e) => setAssigneeEmail(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl p-2.5 text-xs outline-none"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* CHẾ ĐỘ JSON */
                <textarea
                  rows={14}
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  className="w-full bg-slate-900 text-emerald-400 rounded-2xl p-4 text-xs font-mono outline-none border border-slate-800 leading-relaxed shadow-inner"
                />
              )}
            </div>

            {/* Footer Modal: 2 Nút Đưa vào Hàng Đợi & Chạy Ngay 1-Click */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setTaskModalTicket(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Hủy Bỏ
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={creatingTask || runningImmediate}
                  onClick={() => handleSubmitBotTask(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {creatingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4 text-amber-500" />}
                  <span>Đưa Vào Hàng Đợi Duyệt</span>
                </button>

                <button
                  type="button"
                  disabled={creatingTask || runningImmediate}
                  onClick={() => handleSubmitBotTask(true)}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white text-xs font-extrabold rounded-xl transition flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {runningImmediate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang Khởi Chạy...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-300" />
                      <span>Kích Hoạt Chạy Ngay (1-Click)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 🖼️ MODAL XEM TRƯỚC FILE ĐÍNH KÈM (ATTACHMENT PREVIEW) */}
      {/* ========================================================================= */}
      {previewFile && createPortal(
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-full sm:max-w-2xl lg:max-w-3xl p-6 shadow-2xl space-y-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold truncate max-w-[400px] text-slate-800 dark:text-slate-200">
                  {previewFile.filename}
                </span>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center min-h-[250px] max-h-[60vh] overflow-auto bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4">
              {previewFile.filename.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.filename}
                  className="max-h-[55vh] object-contain rounded-xl shadow-sm"
                />
              ) : (
                <div className="text-center space-y-3">
                  <FileSpreadsheetIcon className="w-12 h-12 text-emerald-600 mx-auto" />
                  <p className="text-xs text-slate-500">
                    File tài liệu hoặc bảng tính không thể hiển thị trực tiếp.
                  </p>
                  <a
                    href={previewFile.url}
                    target="_blank"
                    rel="noreferrer"
                    download={previewFile.filename}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải File Về Máy</span>
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <a
                href={previewFile.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở trong Tab Mới</span>
              </a>
              <button
                onClick={() => setPreviewFile(null)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};