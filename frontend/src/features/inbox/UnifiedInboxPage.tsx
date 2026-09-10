// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
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
  UserCheck,
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
  Info,
  GitBranch,
  AlertCircle,
  Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
  git_repos?: { repo_url: string; target: 'teacher_only' | 'all' }[];
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

interface LmsCourseSelectionItem {
  category: string;
  course_id: number;
  course_name: string;
  start_date: string;
  end_date: string;
  group_name: string;
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

interface ParsedUserRow {
  index: number;
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  dob: string;
  role: string;
  isStudent: boolean;
  isTeacher: boolean;
  isValid: boolean;
  errors: string[];
  isDuplicateEmail: boolean;
}

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
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [activeCategoryDropdown, setActiveCategoryDropdown] = useState<string | null>(null);

  const [tickets, setTickets] = useState<InboxTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{ filename: string; url: string } | null>(null);

  // State Modal Studio Pro
  const [taskModalTicket, setTaskModalTicket] = useState<InboxTicket | null>(null);

  const [selectedBotType, setSelectedBotType] = useState<
    'workspace_rpa' | 'keycloak_api' | 'git_collaborator' | 'feedback_doc_triage'
  >('workspace_rpa');

  const [workspaceMainCategory, setWorkspaceMainCategory] = useState<
    'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll'
  >('create_and_approve');

  const [approveSubFlow, setApproveSubFlow] = useState<
    'approve_school_order' | 'approve_partner_contract' | 'admin_approve_contract'
  >('approve_school_order');

  const [createApproveSubFlow, setCreateApproveSubFlow] = useState<
    'end_to_end' | 'partner_create_chain' | 'distributor_create_chain'
  >('end_to_end');

  const [contactInfo, setContactInfo] = useState<string>('Admin Automation Hub (operation@pythaverse.space)');
  const [additionalNotes, setAdditionalNotes] = useState<string>('Pythaverse Auto-Pipeline Managed');

  const [universalSearchQuery, setUniversalSearchQuery] = useState<string>('');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [selectedCachedItem, setSelectedCachedItem] = useState<ScrapedPendingItem | null>(null);
  const [adminJustification, setAdminJustification] = useState<string>(
    'Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub'
  );
  const [scrapedPendingList, setScrapedPendingList] = useState<ScrapedPendingItem[]>([]);
  const [isScrapingLive, setIsScrapingLive] = useState<boolean>(false);
  const [parsedOrderCourses, setParsedOrderCourses] = useState<any[]>([]);

  // Metadata Phả hệ & Khóa học
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [workspaceCategoriesList, setWorkspaceCategoriesList] = useState<string[]>(['SWRP', 'IR', 'ASP', 'Other']);
  const [workspaceCoursesList, setWorkspaceCoursesList] = useState<CourseItem[]>([]);

  const [lmsCategoriesList, setLmsCategoriesList] = useState<string[]>([]);
  const [lmsCoursesList, setLmsCoursesList] = useState<CourseItem[]>([]);

  const [selectedSchool, setSelectedSchool] = useState<HierarchySchoolItem | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{ name: string; code: string } | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<{ name: string; code: string } | null>(null);

  const [entitySearchQuery, setEntitySearchQuery] = useState<string>('');
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState<boolean>(false);
  const entityDropdownRef = useRef<HTMLDivElement | null>(null);

  // File Upload & Validate Excel
  const [uploadedAccountsFile, setUploadedAccountsFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsedAccountRows, setParsedAccountRows] = useState<ParsedUserRow[]>([]);
  const [accountValidationStats, setAccountValidationStats] = useState<{
    total: number;
    students: number;
    teachers: number;
    validCount: number;
    errorCount: number;
    duplicateCount: number;
  }>({ total: 0, students: 0, teachers: 0, validCount: 0, errorCount: 0, duplicateCount: 0 });

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
  const [lmsActionType, setLmsActionType] = useState<'enroll' | 'unenrol'>('enroll');
  const [lmsUnenrolEmails, setLmsUnenrolEmails] = useState<string>('');
  const [lmsSelectedCourses, setLmsSelectedCourses] = useState<LmsCourseSelectionItem[]>([]);
  const [lmsRoleMode, setLmsRoleMode] = useState<'same_role' | 'multi_role'>('same_role');
  const [lmsSingleRole, setLmsSingleRole] = useState<'student' | 'non_editing_teacher' | 'manager'>('student');
  const [lmsBulkSingleEmails, setLmsBulkSingleEmails] = useState<string>('');
  const [lmsStudentEmails, setLmsStudentEmails] = useState<string>('');
  const [lmsTeacherEmails, setLmsTeacherEmails] = useState<string>('');
  const [lmsManagerEmails, setLmsManagerEmails] = useState<string>('');

  // Pythaverse Git Controls
  const [gitRepoUrl, setGitRepoUrl] = useState<string>('https://git.pythaverse.space/ptvswrp/SWRP11_Teacher');
  const [gitTargetRole, setGitTargetRole] = useState<'GUEST' | 'DEVELOPER' | 'ADMIN'>('GUEST');
  const [gitUsersList, setGitUsersList] = useState<string>('');
  const [isGitRepoDropdownOpen, setIsGitRepoDropdownOpen] = useState<boolean>(false);
  const [gitRepoSearchQuery, setGitRepoSearchQuery] = useState<string>('');
  const gitRepoDropdownRef = useRef<HTMLDivElement | null>(null);

  // Keycloak Controls ĐẦY ĐỦ NHƯ STUDIO
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
  const [feedbackCommentContent, setFeedbackCommentContent] = useState<string>(
    'Kính gửi anh/chị, em xin phép chuyển thông tin phản hồi này để team kỹ thuật rà soát và hỗ trợ giải quyết.'
  );
  const [isGeneratingDocComment, setIsGeneratingDocComment] = useState<boolean>(false);

  const [creatingTask, setCreatingTask] = useState<boolean>(false);
  const [runningImmediate, setRunningImmediate] = useState<boolean>(false);
  const [extractingCof, setExtractingCof] = useState<boolean>(false);
  const [payloadText, setPayloadText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const SPREADSHEET_ID = '1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go';

  const loadTickets = useCallback(async (forceSpinner = false) => {
    if (forceSpinner) setLoading(true);
    try {
      const endpoint = `/tickets?sort=desc`;
      const data = await fetchApi<InboxTicket[]>(endpoint);
      if (data) setTickets(data);
    } catch (err) {
      toast.error('Không thể tải danh sách ticket: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadAllMetadata = async () => {
      try {
        const [schools, wsCats, wsCourses, lmsCats, lmsCourses] = await Promise.all([
          fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools').catch(() => []),
          fetchApi<string[]>('/workspace/categories').catch(() => ['SWRP', 'IR', 'ASP', 'Other']),
          fetchApi<CourseItem[]>('/courses/workspace').catch(() => []),
          fetchApi<string[]>('/courses/lms/categories').catch(() => []),
          fetchApi<CourseItem[]>('/courses/lms').catch(() => []),
        ]);

        if (schools) setSchoolsList(schools);
        if (wsCats && wsCats.length > 0) setWorkspaceCategoriesList(wsCats);
        if (wsCourses) setWorkspaceCoursesList(wsCourses);
        if (lmsCats && lmsCats.length > 0) setLmsCategoriesList(lmsCats);
        if (lmsCourses && lmsCourses.length > 0) {
          setLmsCoursesList(lmsCourses);
          const firstCat = lmsCats && lmsCats.length > 0 ? lmsCats[0] : lmsCourses[0].category;
          const matchFirst = lmsCourses.filter((c) => c.category === firstCat);
          const activeFirst = matchFirst.length > 0 ? matchFirst[0] : lmsCourses[0];
          setLmsSelectedCourses([
            {
              category: activeFirst.category,
              course_id: activeFirst.course_id,
              course_name: activeFirst.course_name,
              start_date: getFormattedDate(today),
              end_date: getFormattedDate(nextYear),
              group_name: '',
            },
          ]);
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
      if (gitRepoDropdownRef.current && !gitRepoDropdownRef.current.contains(event.target as Node)) {
        setIsGitRepoDropdownOpen(false);
      }
      setActiveCategoryDropdown(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allAvailableGitRepos = useMemo(() => {
    const reposMap = new Map<string, {
      repo_url: string;
      repo_name: string;
      course_name: string;
      category: string;
      target: 'teacher_only' | 'all';
    }>();

    const allCourses = [...workspaceCoursesList, ...lmsCoursesList];
    allCourses.forEach((c) => {
      let rawRepos: any[] = [];
      const rawField: any = (c as any).git_repos;
      if (Array.isArray(rawField)) {
        rawRepos = rawField;
      } else if (typeof rawField === 'string' && rawField.trim()) {
        try {
          const parsed = JSON.parse(rawField);
          if (Array.isArray(parsed)) rawRepos = parsed;
        } catch { }
      }

      rawRepos.forEach((r) => {
        if (r && r.repo_url && typeof r.repo_url === 'string') {
          const cleanUrl = r.repo_url.trim();
          if (cleanUrl && !reposMap.has(cleanUrl)) {
            const shortName = cleanUrl.split('/').pop() || cleanUrl;
            reposMap.set(cleanUrl, {
              repo_url: cleanUrl,
              repo_name: shortName,
              course_name: c.course_name,
              category: c.category,
              target: r.target || 'all',
            });
          }
        }
      });
    });

    return Array.from(reposMap.values());
  }, [workspaceCoursesList, lmsCoursesList]);

  const filteredAvailableGitRepos = useMemo(() => {
    const q = gitRepoSearchQuery.trim().toLowerCase();
    if (!q) return allAvailableGitRepos;
    return allAvailableGitRepos.filter(
      (r) =>
        r.repo_name.toLowerCase().includes(q) ||
        r.repo_url.toLowerCase().includes(q) ||
        r.course_name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [allAvailableGitRepos, gitRepoSearchQuery]);

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
    const updated = tickets.map((t) => (t.id === ticketId ? { ...t, category: newCategory as any } : t));
    setTickets(updated);
    toast.success(`Đã cập nhật phân loại thành [${newCategory.toUpperCase()}]`);

    try {
      await fetchApi(`/tickets/${ticketId}/category`, {
        method: 'PUT',
        body: JSON.stringify({ category: newCategory }),
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
      ? tickets.filter((t) => t.id !== ticketId)
      : tickets.map((t) => (t.id === ticketId ? { ...t, status: 'dismissed' as any } : t));

    setTickets(updated);
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
    const updated = tickets.map((t) => (t.id === ticketId ? { ...t, status: 'pending' as any } : t));
    setTickets(updated);
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
    const updated = tickets.map((t) => (t.id === ticketId ? { ...t, status: 'completed' as any } : t));
    setTickets(updated);
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

  const formatExcelDateClient = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}/${month}/${year}`;
    }
    if (val instanceof Date) {
      const day = String(val.getDate()).padStart(2, '0');
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const year = val.getFullYear();
      return `${day}/${month}/${year}`;
    }
    const str = String(val).trim().split(' ')[0];
    return str.replace(/-/g, '/');
  };

  const processAndValidateAccountsFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheetNames = workbook.SheetNames;
        const isCOF = sheetNames.some((s) => s.toLowerCase().includes('student info')) || sheetNames.some((s) => s.toLowerCase() === 'cof');

        let targetSheets: string[] = [];
        if (isCOF) {
          targetSheets = sheetNames.filter((s) => s.toLowerCase().includes('student info') || s.toLowerCase().includes('teacher info'));
        } else {
          targetSheets = [sheetNames[0]];
        }

        const parsed: ParsedUserRow[] = [];
        let rGlobalIdx = 1;
        let studentsCount = 0;
        let teachersCount = 0;
        let validRows = 0;
        let errorRows = 0;

        targetSheets.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          if (rawJson.length < 2) return;

          let headerRowIndex = -1;
          for (let i = 0; i < Math.min(rawJson.length, 15); i++) {
            const rowStr = rawJson[i].map((c) => String(c).toLowerCase()).join(' ');
            if (rowStr.includes('first name') || (rowStr.includes('last name') && rowStr.includes('role')) || rowStr.includes('email')) {
              headerRowIndex = i;
              break;
            }
          }
          if (headerRowIndex === -1) headerRowIndex = 0;

          const headers = rawJson[headerRowIndex].map((h) => String(h).trim().toLowerCase());
          const fnIdx = headers.findIndex((h) => h.includes('first name') || h.includes('tên'));
          const lnIdx = headers.findIndex((h) => h.includes('last name') || h.includes('họ'));
          const mobIdx = headers.findIndex((h) => h.includes('mobile') || h.includes('sđt') || h.includes('phone'));
          const emIdx = headers.findIndex((h) => h.includes('email') || h.includes('thư'));
          const dobIdx = headers.findIndex((h) => h.includes('birth') || h.includes('dob') || h.includes('sinh'));
          const roleIdx = headers.findIndex((h) => h.includes('role') || h.includes('vai trò'));

          const rowsToParse = rawJson.slice(headerRowIndex + 1);
          rowsToParse.forEach((row) => {
            if (row.every((cell) => !cell || String(cell).trim() === '')) return;

            const firstName = String(row[fnIdx !== -1 ? fnIdx : 1] || '').trim();
            const lastName = String(row[lnIdx !== -1 ? lnIdx : 2] || '').trim();
            if (!firstName && !lastName) return;

            const mobile = String(row[mobIdx !== -1 ? mobIdx : 3] || '').trim();
            const email = String(row[emIdx !== -1 ? emIdx : 4] || '').trim();
            const dob = formatExcelDateClient(row[dobIdx !== -1 ? dobIdx : 5]);

            let roleRaw = String(row[roleIdx !== -1 ? roleIdx : 6] || '').trim();
            if (!roleRaw && sheetName.toLowerCase().includes('teacher')) roleRaw = 'Teacher';
            if (!roleRaw && sheetName.toLowerCase().includes('student')) roleRaw = 'Student';

            const isStudent = roleRaw.toLowerCase().includes('student');
            const isTeacher = !isStudent;

            if (isStudent) studentsCount++;
            else teachersCount++;

            const errors: string[] = [];
            if (!firstName) errors.push('Thiếu First Name (*)');
            if (!lastName) errors.push('Thiếu Last Name (*)');
            if (!dob) errors.push('Thiếu Ngày sinh (*)');
            if (isTeacher && !email) errors.push('Giáo viên bắt buộc có Email (*)');

            const isValid = errors.length === 0;
            if (isValid) validRows++;
            else errorRows++;

            parsed.push({
              index: rGlobalIdx++,
              firstName,
              lastName,
              mobile,
              email,
              dob,
              role: roleRaw || (isStudent ? 'Student' : 'Teacher'),
              isStudent,
              isTeacher,
              isValid,
              errors,
              isDuplicateEmail: false,
            });
          });
        });

        setParsedAccountRows(parsed);
        setAccountValidationStats({
          total: parsed.length,
          students: studentsCount,
          teachers: teachersCount,
          validCount: validRows,
          errorCount: errorRows,
          duplicateCount: 0,
        });

        toast.success(`Đã nạp thành công ${parsed.length} tài khoản (${isCOF ? 'File COF 3 Tabs' : 'File Danh sách'})!`);
      } catch (err) {
        toast.error('Lỗi khi đọc file Excel: ' + (err as Error).message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // =========================================================================
  // ⚡ SIÊU NĂNG LỰC PRE-FILL 2.0: TỰ BÓC TÁCH COMPOSITE WORKFLOW & DẢI SWRP 4-12
  // =========================================================================
  const [isCompositeMode, setIsCompositeMode] = useState<boolean>(false);
  const [compositeSteps, setCompositeSteps] = useState<{
    enableAccount: boolean;
    enableLms: boolean;
    enableGit: boolean;
  }>({ enableAccount: true, enableLms: true, enableGit: true });

  const handleOpenTaskModal = (ticket: InboxTicket) => {
    setTaskModalTicket(ticket);
    setViewMode('form');

    const meta = ticket.metadata || {};
    const suggestedTask = meta.suggested_bot_task || {};
    const fullText = `${ticket.subject || ''} \n ${ticket.raw_content || ''}`.toLowerCase();

    // 1. Tự động bóc tách danh sách Người Dùng (Cả Tên lẫn Email) từ raw text
    const lines = (ticket.raw_content || '').split('\n').map(l => l.trim()).filter(Boolean);
    const extractedTeachers: { name: string; email: string }[] = [];
    let tempName = '';
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

    lines.forEach(line => {
      const clean = line.replace(/^[\s\-\*•\d\.\)]+/, '').trim();
      const match = clean.match(emailRegex);
      if (match) {
        const email = match[1].toLowerCase();
        const inlineName = clean.replace(match[0], '').replace(/[-:()]/g, '').trim();
        const finalName = inlineName || tempName || email.split('@')[0];
        extractedTeachers.push({ name: finalName, email });
        tempName = '';
      } else if (!clean.toLowerCase().includes('support') && !clean.toLowerCase().includes('request') && clean.split(' ').length >= 2 && clean.length < 50) {
        tempName = clean;
      }
    });

    const teacherEmails = extractedTeachers.map(t => t.email);
    const emailsForInputs = teacherEmails.length > 0
      ? teacherEmails.join('\n')
      : (ticket.sender_email || '');

    setLmsBulkSingleEmails(emailsForInputs);
    setLmsStudentEmails(emailsForInputs);
    setGitUsersList(emailsForInputs);
    setKcTargetEmail(teacherEmails[0] || ticket.sender_email || '');

    // 2. Tự động phân tích Dải Khóa Học (VD: "SWRP 4–12" hoặc "SWRP 4-12")
    const swrpRangeMatch = fullText.match(/swrp\s*(\d+)\s*[-–—to]+\s*(\d+)/i);
    let targetCourseNumbers: number[] = [];
    if (swrpRangeMatch) {
      const startNum = parseInt(swrpRangeMatch[1]);
      const endNum = parseInt(swrpRangeMatch[2]);
      for (let i = startNum; i <= endNum; i++) {
        targetCourseNumbers.push(i);
      }
    }

    // Khớp môn học LMS theo số hiệu
    if (targetCourseNumbers.length > 0 && lmsCoursesList.length > 0) {
      const matchedLms = targetCourseNumbers.map(num => {
        const found = lmsCoursesList.find(c =>
          c.course_name.toLowerCase().includes(`swrp ${num}`) ||
          c.course_name.toLowerCase().includes(`swrp${num}`)
        );
        return found ? {
          category: found.category,
          course_id: found.course_id,
          course_name: found.course_name,
          start_date: getFormattedDate(today),
          end_date: getFormattedDate(nextYear),
          group_name: `TEACHER_TRAINING_SWRP_${num}`
        } : null;
      }).filter(Boolean) as LmsCourseSelectionItem[];

      if (matchedLms.length > 0) {
        setLmsSelectedCourses(matchedLms);
      }
    }

    // 3. Nhận diện ngữ cảnh Luồng Liên Hoàn (Composite Workflow)
    const isTeacherOrTraining = fullText.includes('teacher') || fullText.includes('training') || fullText.includes('demo');
    const hasRepoRequest = fullText.includes('repositor') || fullText.includes('git');
    const hasAccountAndLms = fullText.includes('account') && (fullText.includes('swrp') || fullText.includes('access') || fullText.includes('course'));

    if (hasAccountAndLms || hasRepoRequest) {
      setIsCompositeMode(true);
      setCompositeSteps({
        enableAccount: true,
        enableLms: true,
        enableGit: hasRepoRequest
      });
      toast.success(`⚡ Gemini AI phát hiện yêu cầu Đa Tác Vụ (${extractedTeachers.length} Giáo viên, SWRP 4–12)!`);
    } else {
      setIsCompositeMode(false);
    }
  };

  const computedPayload = useMemo(() => {
    const tId = taskModalTicket?.id || null;
    const firstAttachmentUrl = taskModalTicket?.attachments?.[0]?.url || '';

    let payload: Record<string, any> = {
      ticket_id: tId,
      source: taskModalTicket?.source,
      contact_info: contactInfo,
      additional_notes: additionalNotes,
    };
    // Nếu người dùng bật Chế độ Luồng Liên Hoàn
    if (isCompositeMode) {
      const stepsToRun: any[] = [];
      const teacherList = lmsBulkSingleEmails.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);

      // Bước 1: Keycloak / Account
      if (compositeSteps.enableAccount) {
        stepsToRun.push({
          step_name: "Tạo Định Danh Tài Khoản",
          bot_type: "keycloak_api",
          payload: {
            action: "batch_create_or_reset",
            target_emails: teacherList,
            temporary_password: kcTempPass,
            force_change_on_first_login: true
          }
        });
      }

      // Bước 2: LMS PLearn Direct
      if (compositeSteps.enableLms) {
        stepsToRun.push({
          step_name: "Ghi Danh Moodle LMS PLearn",
          bot_type: "lms_playwright",
          payload: {
            action: "enroll_users_pipeline",
            role_mode: "same_role",
            teacher_emails: teacherList,
            courses: lmsSelectedCourses.map(c => ({
              course_id: c.course_id,
              course_name: c.course_name,
              group_name: c.group_name || "TEACHER_TRAINING"
            }))
          }
        });
      }

      // Bước 3: Thêm Git Repos
      if (compositeSteps.enableGit) {
        stepsToRun.push({
          step_name: "Phân Quyền Pythaverse Git Repos",
          bot_type: "git_collaborator",
          payload: {
            action: "add_repo_collaborators",
            users: teacherList,
            role: "DEVELOPER",
            repo_url: gitRepoUrl
          }
        });
      }

      return {
        bot_type: "composite_workflow",
        ticket_id: tId,
        steps: stepsToRun
      };
    }

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
          total_count: accountValidationStats.total || parsedAccountRows.length,
          student_count: accountValidationStats.students,
          teacher_count: accountValidationStats.teachers,
        };
      } else if (workspaceMainCategory === 'lms_enroll') {
        if (lmsActionType === 'unenrol') {
          const unenrolList = lmsUnenrolEmails.split(/[\n,;]+/).map((e) => e.trim()).filter((e) => e.length > 0);
          payload = {
            action: 'unenrol_users_pipeline',
            platform: 'learn.pythaverse.space',
            courses: lmsSelectedCourses.map((c) => ({ course_id: c.course_id, course_name: c.course_name })),
            emails: unenrolList,
          };
        } else {
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
            courses: lmsSelectedCourses.map((c) => ({
              category: c.category,
              course_id: c.course_id,
              course_name: c.course_name,
              start_date: c.start_date,
              end_date: c.end_date,
              group_name: (c.group_name || '').trim() || undefined,
            })),
            role_mode: lmsRoleMode,
            student_emails: studentsList,
            teacher_emails: teachersList,
            manager_emails: managersList,
            auto_renew_existing: true,
          };
        }
      }
    } else if (selectedBotType === 'git_collaborator') {
      const usersArr = gitUsersList.split(/[\n,;]+/).map((u) => u.trim()).filter((u) => u.length > 0);
      payload = {
        action: 'add_repo_collaborators',
        repo_url: gitRepoUrl.trim(),
        role: gitTargetRole,
        users: usersArr,
      };
    } else if (selectedBotType === 'keycloak_api') {
      const rawEmails = kcTargetEmail.split(/[\n,;]+/).map((e) => e.trim()).filter((e) => e.length > 0);
      const actions: string[] = [];
      const conf: Record<string, any> = { target_email: rawEmails[0] || '', identifiers: rawEmails };

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
    accountValidationStats,
    parsedAccountRows,
    lmsActionType,
    lmsUnenrolEmails,
    lmsSelectedCourses,
    lmsRoleMode,
    lmsSingleRole,
    lmsBulkSingleEmails,
    lmsStudentEmails,
    lmsTeacherEmails,
    lmsManagerEmails,
    gitRepoUrl,
    gitTargetRole,
    gitUsersList,
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
    const defaultCourse = workspaceCoursesList.find((c) => c.category === 'SWRP') || workspaceCoursesList[0] || {
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

  const handleAddLmsCourseRow = () => {
    const defaultCat = lmsCategoriesList[0] || (lmsCoursesList[0] ? lmsCoursesList[0].category : 'TRAINING COURSES');
    const matchCourses = lmsCoursesList.filter((c) => c.category === defaultCat);
    const firstCourse = matchCourses[0] || lmsCoursesList[0] || {
      course_id: 735,
      category: defaultCat,
      course_name: 'Foundation of IoT and AI with Robotics and Arduino',
    };

    setLmsSelectedCourses([
      ...lmsSelectedCourses,
      {
        category: firstCourse.category,
        course_id: firstCourse.course_id,
        course_name: firstCourse.course_name,
        start_date: getFormattedDate(today),
        end_date: getFormattedDate(nextYear),
        group_name: '',
      },
    ]);
  };

  const handleRemoveLmsCourseRow = (index: number) => {
    if (lmsSelectedCourses.length <= 1) {
      toast.error('Cần ít nhất 1 khóa học LMS!');
      return;
    }
    setLmsSelectedCourses(lmsSelectedCourses.filter((_, idx) => idx !== index));
  };

  const handleAutoExtractCof = async () => {
    if (!taskModalTicket) return;
    setExtractingCof(true);
    try {
      const res = await fetchApi<any>('/workspace/extract-cof', {
        method: 'POST',
        body: JSON.stringify({ cof_text: taskModalTicket.raw_content || taskModalTicket.subject }),
      });

      const matchedSch = schoolsList.find((s) => s.school_name.toLowerCase().includes(res.school_name?.toLowerCase() || '')) || selectedSchool;

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
      let actualBotType: BotType | 'lms_playwright' | 'git_collaborator' = selectedBotType;
      if (selectedBotType === 'workspace_rpa' && workspaceMainCategory === 'lms_enroll') {
        actualBotType = 'lms_playwright';
      }

      if (workspaceMainCategory === 'bulk_accounts' && uploadedAccountsFile) {
        toast.info('Đang tải file Excel lên hệ thống lưu trữ...');
        const cleanFileName = `inbox_accounts/${Date.now()}_${uploadedAccountsFile.name.replace(/\s+/g, '_')}`;
        const { error: uploadErr } = await supabase.storage.from('ticket-attachments').upload(cleanFileName, uploadedAccountsFile, { upsert: true });

        if (uploadErr) throw new Error(`Lỗi upload file: ${uploadErr.message}`);

        const { data: publicUrlData } = supabase.storage.from('ticket-attachments').getPublicUrl(cleanFileName);
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
            <div className="font-bold flex items-center gap-1.5 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã kích hoạt Worker chạy ngay!</span>
            </div>
            <button
              onClick={() => navigate('/bots')}
              className="text-indigo-600 hover:underline text-xs font-semibold cursor-pointer block mt-1 transition"
            >
              Mở Bot Command Center xem Live Terminal ➔
            </button>
          </div>,
          { duration: 5000 }
        );
      } else {
        toast.success(
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã đưa tác vụ vào Hàng Đợi Phê Duyệt!</span>
            </div>
            <button
              onClick={() => navigate('/tasks')}
              className="text-indigo-600 hover:underline text-xs font-semibold cursor-pointer block mt-1 transition"
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-2xs">
            <Mail className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> GMAIL
          </span>
        );
      case 'google_form':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs">
            <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> FORM
          </span>
        );
      case 'osticket':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
            <Ticket className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> OS TICKET
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
            {source.toUpperCase()}
          </span>
        );
    }
  };

  const renderStatusPill = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> ĐÃ XỬ LÝ
          </span>
        );
      case 'processing':
      case 'waiting_poll':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs">
            <RefreshCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 animate-spin" /> ĐANG XỬ LÝ
          </span>
        );
      case 'dismissed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <XCircle className="w-3.5 h-3.5 text-slate-500" /> ĐÃ BỎ QUA
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
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
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors shadow-2xs cursor-pointer"
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
            <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400">Đổi Phân Loại</div>
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
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${category === opt.id ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30' : 'text-slate-700 dark:text-slate-300'
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
    <div className="space-y-6 max-w-7xl mx-auto pb-16" onClick={() => setActiveCategoryDropdown(null)}>
      {/* Header Bar */}
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
            Hợp nhất yêu cầu từ Gmail Workspace, Google Form và OS Ticket với sự hỗ trợ từ Gemini AI Triage & Tiền Xử Lý Tự Động.
          </p>
        </div>
      </div>

      {/* 4 Bento Pastel Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-[2rem] p-5 border border-blue-100 dark:border-blue-900/50 flex flex-col justify-between shadow-xs hover:-translate-y-0.5 transition-transform duration-200">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Tổng số yêu cầu</span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">{stats.total}</div>
            <div className="text-xs text-blue-500 font-medium">100% feed đồng bộ</div>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-[2rem] p-5 border border-amber-100 dark:border-amber-900/50 flex flex-col justify-between shadow-xs hover:-translate-y-0.5 transition-transform duration-200">
          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">Chờ xử lý</span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">{stats.pending}</div>
            <div className="text-xs text-amber-600 font-medium">Cần thực thi ngay</div>
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-950/40 rounded-[2rem] p-5 border border-purple-100 dark:border-purple-900/50 flex flex-col justify-between shadow-xs hover:-translate-y-0.5 transition-transform duration-200">
          <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">Đang xử lý</span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">{stats.processing}</div>
            <div className="text-xs text-purple-500 font-medium">Đang chạy qua Bot/Worker</div>
          </div>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-[2rem] p-5 border border-emerald-100 dark:border-emerald-900/50 flex flex-col justify-between shadow-xs hover:-translate-y-0.5 transition-transform duration-200">
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Đã giải quyết</span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">{stats.resolved}</div>
            <div className="text-xs text-emerald-600 font-medium">Hoàn tất quy trình</div>
          </div>
        </div>
      </div>

      {/* Bento Search & Filter Control Bar */}
      <div className="p-5 sm:p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm nhanh theo tiêu đề, người gửi, tóm tắt AI, mã ID, nội dung, trường học..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition shadow-2xs"
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
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Nguồn:</span>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-900">Tất cả Nguồn</option>
                <option value="gmail" className="bg-white dark:bg-slate-900">✉️ Gmail</option>
                <option value="google_form" className="bg-white dark:bg-slate-900">📝 Google Form</option>
                <option value="osticket" className="bg-white dark:bg-slate-900">🎫 OS Ticket</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Phân loại:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-900">Tất cả Category</option>
                <option value="bug" className="bg-white dark:bg-slate-900">🐛 System Bugs</option>
                <option value="account_keycloak" className="bg-white dark:bg-slate-900">🔑 Keycloak/Account</option>
                <option value="lms_enroll" className="bg-white dark:bg-slate-900">🎓 LMS Enroll</option>
                <option value="license" className="bg-white dark:bg-slate-900">📜 License</option>
                <option value="other" className="bg-white dark:bg-slate-900">📌 Khác</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Trạng thái:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{sortOrder === 'desc' ? 'Mới nhất ➔ Cũ nhất' : 'Cũ nhất ➔ Mới nhất'}</span>
            </button>

            {(searchQuery || selectedSource !== 'all' || selectedCategory !== 'all' || selectedStatus !== 'all') && (
              <button
                onClick={resetFilters}
                className="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Danh Sách Ticket */}
      {loading && tickets.length === 0 ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="p-6 sm:p-7 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
              <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="h-20 w-full bg-slate-100 dark:bg-slate-800/40 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="p-12 text-center rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-indigo-500">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Không tìm thấy yêu cầu nào phù hợp</h3>
          <button onClick={resetFilters} className="mt-4 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm cursor-pointer">
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
            const excelMeta = ticket.metadata?.excel_summary;

            return (
              <div
                key={ticket.id}
                id={`ticket-card-${ticket.id}`}
                className="p-6 sm:p-7 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition duration-200 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderSourceBadge(ticket.source)}
                    {renderStatusPill(ticket.status || 'pending')}
                    {getCategoryBadge(ticket.category || 'other', ticket.id)}

                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pl-1">
                      <span className="font-bold text-slate-900 dark:text-slate-200 truncate max-w-[200px]">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 transition shadow-2xs"
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
                    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 flex items-center gap-1">
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 transition shadow-2xs group cursor-pointer"
                        >
                          {isImage ? <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> : isExcel ? <FileSpreadsheetIcon className="w-3.5 h-3.5 text-emerald-600" /> : <Paperclip className="w-3.5 h-3.5 text-indigo-500" />}
                          <span className="truncate max-w-[200px]">{file.filename}</span>
                          <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 ml-0.5 transition" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Gemini AI Summary & Auto-prefilled Banner */}
                <div className="p-5 sm:p-6 rounded-[2rem] bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-extrabold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider">
                        Tóm tắt & Đề xuất tự động từ Gemini AI
                      </span>
                    </div>

                    {excelMeta?.is_cof && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-200">
                        Đã bóc tách COF ({excelMeta.courses?.length || 0} môn)
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/30 text-xs shadow-xs">
                    <p className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-line">
                      {ticket.ai_summary || 'Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích...'}
                    </p>
                  </div>
                </div>

                {/* Collapsible raw content */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setExpandedContent((prev) => ({ ...prev, [ticket.id]: !prev[ticket.id] }))}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{isExpanded ? 'Thu gọn nội dung gốc' : 'Xem nội dung gốc'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner max-h-72 overflow-y-auto">
                      {cleanRawContent || '(Không có nội dung văn bản gốc)'}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 font-bold">
                    Mã tham chiếu: #{ticket.source_id || ticket.id.slice(0, 8)}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isDismissed ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                      >
                        {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>Khôi phục Hòm Thư</span>
                      </button>
                    ) : isCompleted ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Mở lại Ticket</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>Bỏ qua</span>
                        </button>

                        <button
                          onClick={() => handleCompleteTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                        >
                          {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                          <span>Hoàn thành</span>
                        </button>

                        <button
                          onClick={() => navigate('/github', { state: { ticket } })}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 hover:bg-slate-800 transition shadow-2xs cursor-pointer"
                        >
                          <GitPullRequest className="w-3.5 h-3.5" />
                          <span>Tạo Issue GitHub</span>
                        </button>

                        <button
                          onClick={() => handleOpenTaskModal(ticket)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:brightness-110 transition shadow-md cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>Tạo Tác Vụ Bot (AI Đã Sẵn Sàng)</span>
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
      {/* 🚀 STUDIO PRO MODAL (BENTO HIGH-CONTRAST - ĐẦY ĐỦ 100% NHƯ STUDIO) */}
      {/* ========================================================================= */}
      {taskModalTicket && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setTaskModalTicket(null); }}
          className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl w-full max-w-full sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl shadow-2xl overflow-hidden p-6 sm:p-8 max-h-[92vh] flex flex-col my-auto"
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-md shadow-indigo-500/20">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                      Automation Studio Pro (Điều Phối Cho Request)
                    </h3>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-extrabold uppercase ring-1 ring-emerald-300/40">
                      ⚡ AI Auto-Prefilled
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Dữ liệu đã được bóc tách tự động cho Request #{taskModalTicket.source_id || taskModalTicket.id.slice(0, 8)}.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setViewMode('form')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${viewMode === 'form' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs' : 'text-slate-600'
                      }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Form</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('json')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${viewMode === 'json' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs' : 'text-slate-600'
                      }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setTaskModalTicket(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* BANNER CHUYỂN ĐỔI CHẾ ĐỘ: TÁC VỤ ĐƠN LẺ VS LUỒNG LIÊN HOÀN */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-sm">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                    Chế Độ Điều Phối Luồng:
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {isCompositeMode
                      ? "⚡ Đang kích hoạt Luồng Liên Hoàn (Tài Khoản ➔ LMS ➔ Git)"
                      : "Tác vụ đơn lẻ (Studio cổ điển)"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCompositeMode(!isCompositeMode)}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition shadow-2xs ${isCompositeMode
                    ? 'bg-indigo-600 text-white shadow-indigo-500/30 ring-2 ring-indigo-400'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300'
                    }`}
                >
                  {isCompositeMode ? "✓ Luồng Liên Hoàn (3-in-1)" : "Chuyển sang Luồng Liên Hoàn"}
                </button>
              </div>
            </div>

            {/* Thân Modal cuộn */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-3">
              {viewMode === 'form' ? (
                <>
                  {/* BƯỚC 1: CHỌN CỖ MÁY BOT (4 ENGINES) */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-extrabold">1</span>
                      <span>Chọn Cỗ Máy Tự Động Hóa:</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { id: 'workspace_rpa', label: 'Workspace & LMS', icon: Building2, desc: 'License, User & Moodle' },
                        { id: 'keycloak_api', label: 'Keycloak IDP', icon: KeyRound, desc: 'Mật Khẩu & Danh Tính' },
                        { id: 'git_collaborator', label: 'Pythaverse Git', icon: GitBranch, desc: 'Thêm Vào Repository' },
                        { id: 'feedback_doc_triage', label: 'Feedback Sheet', icon: FileText, desc: 'Ghi Chú & Tag Doc' },
                      ].map((tab) => {
                        const Icon = tab.icon;
                        const isSel = selectedBotType === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedBotType(tab.id as any)}
                            className={`flex flex-col items-start gap-1 p-3.5 rounded-2xl border text-left transition cursor-pointer ${isSel
                              ? 'bg-indigo-600 text-white border-transparent shadow-md ring-2 ring-indigo-500/30'
                              : 'bg-slate-50 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100'
                              }`}
                          >
                            <Icon className={`w-4 h-4 ${isSel ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
                            <span className="text-xs font-bold mt-1">{tab.label}</span>
                            <span className={`text-[10px] font-medium ${isSel ? 'text-indigo-200' : 'text-slate-500'}`}>{tab.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* BƯỚC 2A: WORKSPACE & LMS */}
                  {selectedBotType === 'workspace_rpa' && (
                    <div className="space-y-4 p-5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-extrabold">2</span>
                          <span>Phân Luồng Nghiệp Vụ Workspace:</span>
                        </label>

                        <button
                          type="button"
                          onClick={handleAutoExtractCof}
                          disabled={extractingCof}
                          className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 text-xs font-bold rounded-xl transition cursor-pointer shadow-2xs hover:bg-indigo-50"
                        >
                          {extractingCof ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                          <span>AI Tái Bóc Tách File COF</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-200/80 dark:bg-slate-800 p-1.5 rounded-2xl text-xs font-semibold">
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
                              className={`py-2.5 px-2 rounded-xl text-center transition cursor-pointer flex items-center justify-center gap-1.5 text-xs ${isCur ? 'bg-white dark:bg-slate-900 font-bold text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-700 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                              <span>{mTab.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* LUỒNG 1: PHÊ DUYỆT */}
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
                                className={`rounded-xl border p-3 text-left transition cursor-pointer ${approveSubFlow === sub.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-500' : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900'
                                  }`}
                              >
                                <p className="text-xs font-bold text-slate-900 dark:text-slate-200">{sub.label}</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">{sub.desc}</p>
                              </button>
                            ))}
                          </div>

                          <div className="relative">
                            <input
                              type="text"
                              value={universalSearchQuery}
                              onChange={(e) => setUniversalSearchQuery(e.target.value)}
                              placeholder="Tìm kiếm mã đơn / tên trường trong danh sách..."
                              className="w-full pl-3 pr-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-300 dark:border-slate-800 rounded-xl p-2 bg-white dark:bg-slate-900">
                            {isScrapingLive ? (
                              <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2 font-medium">
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                <span>Đang nạp danh sách cache...</span>
                              </div>
                            ) : scrapedPendingList.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-500 font-medium">Không có mục nào trong danh sách cache.</div>
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
                                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${isSel ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-800'
                                      }`}
                                  >
                                    <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                                      <span>{code}</span>
                                      <span className="text-[10px] text-amber-700">{item.status || 'Pending'}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-600 dark:text-slate-400">{item.school_name || item.sender_name}</div>
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
                          <div className="space-y-1.5 relative" ref={entityDropdownRef}>
                            <label className="text-xs font-bold text-slate-900 dark:text-slate-200 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Trường Học Áp Dụng (Trong 480 trường phả hệ):</span>
                              </span>
                              {selectedSchool && (
                                <span className="text-xs text-indigo-600 font-bold font-mono">{selectedSchool.school_code}</span>
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
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none"
                            />

                            {isEntityDropdownOpen && (
                              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1">
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
                                        <div className="font-bold text-slate-900 dark:text-slate-200">{s.school_name}</div>
                                        <div className="text-[11px] text-slate-500 font-mono">
                                          Mã: {s.school_code} | Tuyến: {s.partner_name} ➔ {s.distributor_name}
                                        </div>
                                      </div>
                                      {selectedSchool?.school_code === s.school_code && <Check className="w-4 h-4 text-indigo-600" />}
                                    </button>
                                  ))}
                              </div>
                            )}

                            {selectedSchool && (
                              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-slate-800 text-[11px] font-mono font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5 shadow-2xs">
                                <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span>{selectedSchool.full_lineage}</span>
                              </div>
                            )}
                          </div>

                          {/* Danh Sách Khóa Học */}
                          <div className="space-y-3 pt-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                                <BookOpen className="w-4 h-4 text-indigo-600" />
                                <span>Danh Sách Khóa Học ({selectedCourses.length} Môn):</span>
                              </label>

                              <button
                                type="button"
                                onClick={handleAddCourseRow}
                                className="flex items-center gap-1 text-xs px-3 py-1 bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 rounded-xl font-bold hover:bg-indigo-200 cursor-pointer shadow-2xs transition"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Thêm Khóa Học</span>
                              </button>
                            </div>

                            {selectedCourses.map((cRow, idx) => {
                              const filteredCourses = workspaceCoursesList.filter((c) => c.category === cRow.category);
                              return (
                                <div key={idx} className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-slate-800 space-y-2 shadow-2xs">
                                  <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-slate-200">
                                    <span>Khóa học #{idx + 1}</span>
                                    {selectedCourses.length > 1 && (
                                      <button type="button" onClick={() => handleRemoveCourseRow(idx)} className="text-rose-600 hover:text-rose-800 p-0.5 rounded cursor-pointer">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">Phân loại:</label>
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
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs font-bold text-slate-900 dark:text-white"
                                      >
                                        {workspaceCategoriesList.map((cat) => (
                                          <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="sm:col-span-2">
                                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">Chọn khóa học:</label>
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
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs font-bold text-slate-900 dark:text-white truncate"
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
                                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">Licenses:</label>
                                      <input
                                        type="number"
                                        value={cRow.licenses}
                                        min={1}
                                        onChange={(e) => {
                                          const updated = [...selectedCourses];
                                          updated[idx].licenses = parseInt(e.target.value) || 1;
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">Start Date:</label>
                                      <input
                                        type="text"
                                        value={cRow.start_date}
                                        onChange={(e) => {
                                          const updated = [...selectedCourses];
                                          updated[idx].start_date = e.target.value;
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">End Date:</label>
                                      <input
                                        type="text"
                                        value={cRow.end_date}
                                        onChange={(e) => {
                                          const updated = [...selectedCourses];
                                          updated[idx].end_date = e.target.value;
                                          setSelectedCourses(updated);
                                        }}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* LUỒNG 3: TẠO TÀI KHOẢN (ĐÃ BỔ SUNG Ô CHỌN TRƯỜNG PHẢ HỆ VÀ PREVIEW CHUẨN) */}
                      {workspaceMainCategory === 'bulk_accounts' && (
                        <div className="space-y-4">
                          {/* Ô chọn trường học thụ hưởng (480 trường) */}
                          <div className="space-y-1.5 relative" ref={entityDropdownRef}>
                            <label className="text-xs font-bold text-slate-900 dark:text-slate-200 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Building2 className="w-4 h-4 text-indigo-600" />
                                <span>Trường Học Thụ Hưởng Tài Khoản: <span className="text-rose-500">*</span></span>
                              </span>
                              {selectedSchool && (
                                <span className="text-xs text-indigo-600 font-mono font-bold">Mã: {selectedSchool.school_code}</span>
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
                              placeholder="Tra cứu tên hoặc mã trường học..."
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none"
                            />
                            {isEntityDropdownOpen && (
                              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1">
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
                                        <div className="font-bold text-slate-900 dark:text-slate-200">{s.school_name}</div>
                                        <div className="text-[11px] text-slate-500 font-mono">Mã: {s.school_code} | Tuyến: {s.partner_name} ➔ {s.distributor_name}</div>
                                      </div>
                                      {selectedSchool?.school_code === s.school_code && <Check className="w-4 h-4 text-indigo-600" />}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>

                          <input
                            type="file"
                            ref={fileInputRef}
                            accept=".xlsx,.xls,.csv"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setUploadedAccountsFile(file);
                                processAndValidateAccountsFile(file);
                              }
                            }}
                            className="hidden"
                          />

                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-indigo-300 dark:border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center gap-1.5"
                          >
                            <UploadCloud className="w-7 h-7 text-indigo-600" />
                            {uploadedAccountsFile ? (
                              <span className="font-bold text-xs text-indigo-700 dark:text-indigo-400">
                                📎 {uploadedAccountsFile.name} ({Math.round(uploadedAccountsFile.size / 1024)} KB) - Nhấp để đổi file khác
                              </span>
                            ) : taskModalTicket.attachments?.length ? (
                              <span className="text-xs text-indigo-700 dark:text-indigo-400 font-bold">
                                Dùng file từ Ticket: {taskModalTicket.attachments[0].filename} (Bấm để tải file mới)
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Bấm hoặc kéo thả file Excel (.xlsx) vào đây</span>
                            )}
                          </div>

                          {/* Preview Bảng Tài Khoản */}
                          {parsedAccountRows.length > 0 && (
                            <div className="space-y-3 rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase">Tổng</p>
                                  <p className="text-base font-bold font-mono text-slate-900 dark:text-white">{accountValidationStats.total}</p>
                                  <p className="text-[10px] text-slate-500">{accountValidationStats.students} HS | {accountValidationStats.teachers} GV</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                                  <p className="text-[10px] text-emerald-700 font-bold uppercase">Hợp lệ</p>
                                  <p className="text-base font-bold font-mono text-emerald-700">{accountValidationStats.validCount}</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
                                  <p className="text-[10px] text-rose-700 font-bold uppercase">Thiếu tin</p>
                                  <p className="text-base font-bold font-mono text-rose-700">{accountValidationStats.errorCount}</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
                                  <p className="text-[10px] text-amber-700 font-bold uppercase">Trùng email</p>
                                  <p className="text-base font-bold font-mono text-amber-700">{accountValidationStats.duplicateCount}</p>
                                </div>
                              </div>

                              <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-300 dark:border-slate-800">
                                <table className="w-full text-left text-[11px] font-mono">
                                  <thead className="bg-slate-100 dark:bg-slate-800/80 sticky top-0 uppercase text-[9px] text-slate-600 font-bold">
                                    <tr>
                                      <th className="p-2 text-center w-8">#</th>
                                      <th className="p-2">Họ & Tên</th>
                                      <th className="p-2">Email</th>
                                      <th className="p-2">Ngày Sinh</th>
                                      <th className="p-2">Vai Trò</th>
                                      <th className="p-2">Trạng Thái</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {parsedAccountRows.slice(0, 50).map((row) => (
                                      <tr key={row.index} className={!row.isValid ? 'bg-rose-50/50' : 'hover:bg-slate-50'}>
                                        <td className="p-2 text-center text-slate-500 font-bold">{row.index}</td>
                                        <td className="p-2 font-bold text-slate-900 dark:text-white font-sans">{row.lastName} {row.firstName}</td>
                                        <td className="p-2 font-semibold text-slate-800 dark:text-slate-300">{row.email || '—'}</td>
                                        <td className="p-2 font-bold text-slate-800 dark:text-slate-300">{row.dob}</td>
                                        <td className="p-2 font-bold">{row.role}</td>
                                        <td className="p-2">{row.isValid ? <span className="text-emerald-700 font-bold">✓ OK</span> : <span className="text-rose-600 font-bold">{row.errors[0]}</span>}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* LUỒNG 4: GHI DANH LMS (HỖ TRỢ CẢ ENROL & UNENROL VỚI MÀU CHỮ NÉT CĂNG) */}
                      {workspaceMainCategory === 'lms_enroll' && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-200/80 dark:bg-slate-800">
                            <button
                              type="button"
                              onClick={() => setLmsActionType('enroll')}
                              className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${lmsActionType === 'enroll' ? 'bg-white dark:bg-slate-900 text-emerald-700 shadow-sm' : 'text-slate-600'
                                }`}
                            >
                              <GraduationCap className="w-4 h-4" />
                              <span>1. Ghi Danh & Gia Hạn</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setLmsActionType('unenrol')}
                              className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${lmsActionType === 'unenrol' ? 'bg-white dark:bg-slate-900 text-rose-700 shadow-sm' : 'text-slate-600'
                                }`}
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>2. Hủy Ghi Danh</span>
                            </button>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-900 dark:text-slate-200">
                                Danh Sách Khóa Học LMS ({lmsSelectedCourses.length} khóa):
                              </label>
                              <button
                                type="button"
                                onClick={handleAddLmsCourseRow}
                                className="flex items-center gap-1 px-3 py-1 bg-white dark:bg-slate-900 text-xs font-bold border border-slate-300 dark:border-slate-800 rounded-xl shadow-2xs hover:bg-slate-50 text-slate-800 dark:text-slate-200"
                              >
                                <Plus className="w-3.5 h-3.5" /> Thêm Môn LMS
                              </button>
                            </div>

                            {lmsSelectedCourses.map((lItem, idx) => (
                              <div key={idx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-800 space-y-2 shadow-2xs">
                                <div className="flex justify-between items-center text-xs font-bold text-slate-900 dark:text-white">
                                  <span>#{idx + 1} {lItem.course_name}</span>
                                  {lmsSelectedCourses.length > 1 && (
                                    <button type="button" onClick={() => handleRemoveLmsCourseRow(idx)} className="text-rose-600">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  <select
                                    value={lItem.course_id}
                                    onChange={(e) => {
                                      const cId = parseInt(e.target.value);
                                      const target = lmsCoursesList.find((c) => c.course_id === cId);
                                      if (target) {
                                        const updated = [...lmsSelectedCourses];
                                        updated[idx].course_id = target.course_id;
                                        updated[idx].course_name = target.course_name;
                                        setLmsSelectedCourses(updated);
                                      }
                                    }}
                                    className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold truncate"
                                  >
                                    {lmsCoursesList.map((c) => (
                                      <option key={c.course_id} value={c.course_id}>{c.course_name} (ID: {c.course_id})</option>
                                    ))}
                                  </select>

                                  {lmsActionType === 'enroll' && (
                                    <input
                                      type="text"
                                      value={lItem.group_name}
                                      onChange={(e) => {
                                        const updated = [...lmsSelectedCourses];
                                        updated[idx].group_name = e.target.value;
                                        setLmsSelectedCourses(updated);
                                      }}
                                      placeholder="Tên Group lớp (VD: CLASS_2026)"
                                      className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                                    />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-900 dark:text-slate-200">
                              {lmsActionType === 'enroll' ? 'Danh Sách Email Học Viên Cần Ghi Danh:' : 'Danh Sách Email Cần Hủy Ghi Danh:'}
                            </label>
                            <textarea
                              rows={4}
                              value={lmsActionType === 'enroll' ? lmsBulkSingleEmails : lmsUnenrolEmails}
                              onChange={(e) => lmsActionType === 'enroll' ? setLmsBulkSingleEmails(e.target.value) : setLmsUnenrolEmails(e.target.value)}
                              placeholder="user1@pythaverse.space&#10;user2@pythaverse.space"
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BƯỚC 2B: KEYCLOAK IDENTITY (ĐẦY ĐỦ 3 CÔNG TẮC & ĐIỀN ĐÚNG EMAIL HỌC SINH) */}
                  {selectedBotType === 'keycloak_api' && (
                    <div className="space-y-4 p-5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/40">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <label className="font-extrabold text-slate-900 dark:text-slate-200">Email/Username Cần Can Thiệp:</label>
                          <span className="text-amber-800 dark:text-amber-400 font-bold">*Đã chọn đúng tài khoản học sinh</span>
                        </div>
                        <input
                          type="text"
                          value={kcTargetEmail}
                          onChange={(e) => setKcTargetEmail(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-amber-400 dark:border-amber-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none shadow-2xs"
                        />
                      </div>

                      {/* 1. Đặt Lại Mật Khẩu Tạm Thời */}
                      <div className="rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700">
                              <KeyRound className="h-4 w-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white">1. Đặt Lại Mật Khẩu Tạm Thời</h4>
                              <p className="text-[11px] text-slate-500 font-medium">Gán mật khẩu khởi tạo an toàn</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setKcEnableResetPass(!kcEnableResetPass)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${kcEnableResetPass ? 'bg-amber-500' : 'bg-slate-300'
                              }`}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${kcEnableResetPass ? 'translate-x-5' : 'translate-x-0'
                              }`} />
                          </button>
                        </div>

                        {kcEnableResetPass && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-600">Mật khẩu mới:</label>
                              <input
                                type="text"
                                value={kcTempPass}
                                onChange={(e) => setKcTempPass(e.target.value)}
                                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 font-mono text-xs font-bold text-slate-900 dark:text-white"
                              />
                            </div>
                            <div className="flex items-end pb-1.5">
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={kcForceChange}
                                  onChange={(e) => setKcForceChange(e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span>Bắt buộc đổi khi đăng nhập</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2. Xác Thực Email */}
                      <div className="rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white">2. Xác Thực Email</h4>
                              <p className="text-[11px] text-slate-500 font-medium">Gỡ lỗi tài khoản chưa verify email</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setKcEnableVerify(!kcEnableVerify)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${kcEnableVerify ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${kcEnableVerify ? 'translate-x-5' : 'translate-x-0'
                              }`} />
                          </button>
                        </div>

                        {kcEnableVerify && (
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => setKcVerifyAction('verify')}
                              className={`rounded-xl py-2 text-xs font-bold cursor-pointer transition ${kcVerifyAction === 'verify' ? 'border border-emerald-500 bg-emerald-100 text-emerald-800' : 'border border-slate-300 text-slate-600'
                                }`}
                            >
                              ✓ Đã Xác Thực
                            </button>
                            <button
                              type="button"
                              onClick={() => setKcVerifyAction('unverify')}
                              className={`rounded-xl py-2 text-xs font-bold cursor-pointer transition ${kcVerifyAction === 'unverify' ? 'border border-rose-500 bg-rose-100 text-rose-800' : 'border border-slate-300 text-slate-600'
                                }`}
                            >
                              ✗ Gỡ Xác Thực
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 3. Trạng Thái Hoạt Động */}
                      <div className="rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700">
                              <UserCheck className="h-4 w-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white">3. Trạng Thái Hoạt Động</h4>
                              <p className="text-[11px] text-slate-500 font-medium">Khóa hoặc kích hoạt lại người dùng</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setKcEnableStatus(!kcEnableStatus)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${kcEnableStatus ? 'bg-sky-500' : 'bg-slate-300'
                              }`}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${kcEnableStatus ? 'translate-x-5' : 'translate-x-0'
                              }`} />
                          </button>
                        </div>

                        {kcEnableStatus && (
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => setKcStatusAction('enable')}
                              className={`rounded-xl py-2 text-xs font-bold cursor-pointer transition ${kcStatusAction === 'enable' ? 'border border-emerald-500 bg-emerald-100 text-emerald-800' : 'border border-slate-300 text-slate-600'
                                }`}
                            >
                              ✓ Kích Hoạt
                            </button>
                            <button
                              type="button"
                              onClick={() => setKcStatusAction('disable')}
                              className={`rounded-xl py-2 text-xs font-bold cursor-pointer transition ${kcStatusAction === 'disable' ? 'border border-rose-500 bg-rose-100 text-rose-800' : 'border border-slate-300 text-slate-600'
                                }`}
                            >
                              ✗ Vô Hiệu Hóa
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* BƯỚC 2C: PYTHAVERSE GIT */}
                  {selectedBotType === 'git_collaborator' && (
                    <div className="space-y-4 p-5 rounded-2xl bg-violet-50/70 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/40">
                      <div className="space-y-1 relative" ref={gitRepoDropdownRef}>
                        <div className="flex justify-between items-center text-xs">
                          <label className="font-bold text-slate-900 dark:text-slate-200">Đường Dẫn Repository Git Mục Tiêu:</label>
                          <button
                            type="button"
                            onClick={() => setIsGitRepoDropdownOpen(!isGitRepoDropdownOpen)}
                            className="text-violet-700 font-bold hover:underline cursor-pointer"
                          >
                            {isGitRepoDropdownOpen ? 'Đóng danh sách ✕' : `Chọn từ danh mục (${allAvailableGitRepos.length} repos) ▼`}
                          </button>
                        </div>

                        <input
                          type="text"
                          value={gitRepoUrl}
                          onChange={(e) => setGitRepoUrl(e.target.value)}
                          placeholder="https://git.pythaverse.space/..."
                          className="w-full bg-white dark:bg-slate-900 border border-violet-300 dark:border-violet-700 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />

                        {isGitRepoDropdownOpen && (
                          <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-2 space-y-1">
                            {filteredAvailableGitRepos.map((r, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setGitRepoUrl(r.repo_url);
                                  setIsGitRepoDropdownOpen(false);
                                }}
                                className="w-full text-left p-2 rounded-xl text-xs hover:bg-violet-50 dark:hover:bg-slate-800 flex justify-between"
                              >
                                <div>
                                  <span className="font-bold text-slate-900 dark:text-white">🐙 {r.repo_name}</span>
                                  <p className="text-[10px] text-slate-500 font-medium">Môn: {r.course_name} ({r.category})</p>
                                </div>
                                {gitRepoUrl === r.repo_url && <Check className="w-4 h-4 text-violet-600" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-900 dark:text-slate-200">Chọn Vai Trò (Role):</label>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {['GUEST', 'DEVELOPER', 'ADMIN'].map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setGitTargetRole(r as any)}
                              className={`p-2.5 rounded-xl border text-center font-bold transition cursor-pointer ${gitTargetRole === r ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                                }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-900 dark:text-slate-200">Danh Sách Username / Email (Mỗi dòng 1 tài khoản):</label>
                        <textarea
                          rows={3}
                          value={gitUsersList}
                          onChange={(e) => setGitUsersList(e.target.value)}
                          placeholder="hsdttemd&#10;gvdttemd@pythaverse.net"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* BƯỚC 2D: FEEDBACK SHEET */}
                  {selectedBotType === 'feedback_doc_triage' && (
                    <div className="space-y-3 p-5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-900 dark:text-slate-200">Google Doc URL:</label>
                        <input
                          type="text"
                          value={docUrl}
                          onChange={(e) => setDocUrl(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-900 dark:text-slate-200">Email Phân Công (@dtt.vn):</label>
                        <input
                          type="email"
                          value={assigneeEmail}
                          onChange={(e) => setAssigneeEmail(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <textarea
                  rows={14}
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  className="w-full bg-slate-900 text-emerald-400 rounded-2xl p-4 text-xs font-mono outline-none border border-slate-800 leading-relaxed shadow-inner"
                />
              )}
            </div>

            {/* Footer Modal */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setTaskModalTicket(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
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

      {/* MODAL XEM TRƯỚC FILE ĐÍNH KÈM */}
      {previewFile && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl w-full max-w-full sm:max-w-2xl lg:max-w-3xl p-6 shadow-2xl space-y-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold truncate max-w-[400px] text-slate-900 dark:text-slate-200">{previewFile.filename}</span>
              </div>
              <button onClick={() => setPreviewFile(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center min-h-[250px] max-h-[60vh] overflow-auto bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4">
              {previewFile.filename.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                <img src={previewFile.url} alt={previewFile.filename} className="max-h-[55vh] object-contain rounded-xl shadow-sm" />
              ) : (
                <div className="text-center space-y-3">
                  <FileSpreadsheetIcon className="w-12 h-12 text-emerald-600 mx-auto" />
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">File tài liệu hoặc bảng tính không thể hiển thị trực tiếp.</p>
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

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <a
                href={previewFile.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-300 hover:bg-slate-200 transition flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở trong Tab Mới</span>
              </a>
              <button onClick={() => setPreviewFile(null)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition">
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