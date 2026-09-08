// frontend/src/features/studio/AutomationStudioPage.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Zap,
  Building2,
  Key,
  FileText,
  BookOpen,
  Search,
  Check,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ArrowRight,
  Users,
  GraduationCap,
  Calendar,
  UserCheck,
  X,
  Code2,
  Send,
  Sparkles,
  Upload,
  Info,
  ClipboardCheck,
  GitBranch,
  AlertTriangle,
  AlertCircle,
  FileCheck2,
  Download,
  Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchApi } from '../../lib/api';
import { BotType } from '../../types';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

interface HierarchySchoolItem {
  school_id: string;
  school_code: string;
  school_name: string;
  partner_name: string;
  partner_code: string;
  distributor_name: string;
  distributor_code: string;
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

interface PreparedTaskSummary {
  engineName: string;
  actionTitle: string;
  targetEntity: string;
  detailsList: string[];
}

export const AutomationStudioPage: React.FC = () => {
  const navigate = useNavigate();

  // 4 Cỗ Máy Tự Động Hóa Chính
  const [selectedBotType, setSelectedBotType] = useState<
    'workspace_rpa' | 'keycloak_api' | 'git_collaborator' | 'feedback_doc_triage'
  >('workspace_rpa');

  // 4 Mục chính của Workspace RPA
  const [workspaceMainCategory, setWorkspaceMainCategory] = useState<
    'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll'
  >('approve');

  // Phân luồng con trong mục "1. Phê Duyệt"
  const [approveSubFlow, setApproveSubFlow] = useState<
    'approve_school_order' | 'approve_partner_contract' | 'admin_approve_contract'
  >('approve_school_order');

  // Phân luồng con trong mục "2. Tạo & Duyệt"
  const [createApproveSubFlow, setCreateApproveSubFlow] = useState<
    'end_to_end' | 'partner_create_chain' | 'distributor_create_chain'
  >('end_to_end');

  // Contact Info & Ghi chú dự phòng
  const [contactInfo, setContactInfo] = useState<string>('Admin Automation Hub (operation@pythaverse.space)');
  const [additionalNotes, setAdditionalNotes] = useState<string>('Pythaverse Auto-Pipeline Managed');

  // Tìm kiếm & Item được chọn
  const [universalSearchQuery, setUniversalSearchQuery] = useState<string>('');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [selectedCachedItem, setSelectedCachedItem] = useState<ScrapedPendingItem | null>(null);

  // Lý do phê duyệt Sales Admin
  const [adminJustification, setAdminJustification] = useState<string>(
    'Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub'
  );

  const [isScrapingLive, setIsScrapingLive] = useState<boolean>(false);
  const [, setIsLoadingOrderDetails] = useState<boolean>(false);
  const [scrapedPendingList, setScrapedPendingList] = useState<ScrapedPendingItem[]>([]);
  const [parsedOrderCourses, setParsedOrderCourses] = useState<any[]>([]);

  // Bộ lọc trạng thái
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Metadata Workspace & LMS khởi tạo trực tiếp
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [workspaceCategoriesList, setWorkspaceCategoriesList] = useState<string[]>(['SWRP', 'IR', 'ASP', 'Other']);
  const [workspaceCoursesList, setWorkspaceCoursesList] = useState<CourseItem[]>([]);

  const [lmsCategoriesList, setLmsCategoriesList] = useState<string[]>([]);
  const [lmsCoursesList, setLmsCoursesList] = useState<CourseItem[]>([]);

  // Đối tượng chọn cho luồng "Tạo & Duyệt"
  const [selectedSchool, setSelectedSchool] = useState<HierarchySchoolItem | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{ name: string; code: string } | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<{ name: string; code: string } | null>(null);

  const [entitySearchQuery, setEntitySearchQuery] = useState<string>('');
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState<boolean>(false);
  const entityDropdownRef = useRef<HTMLDivElement | null>(null);

  // File Upload
  const [uploadedAccountsFile, setUploadedAccountsFile] = useState<File | null>(null);
  // --- STATE DÀNH RIÊNG CHO BÓC TÁCH & VALIDATE EXCEL TẠO TÀI KHOẢN ---
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

  const [parsedAccountRows, setParsedAccountRows] = useState<ParsedUserRow[]>([]);
  const [accountValidationStats, setAccountValidationStats] = useState<{
    total: number;
    students: number;
    teachers: number;
    validCount: number;
    errorCount: number;
    duplicateCount: number;
  }>({ total: 0, students: 0, teachers: 0, validCount: 0, errorCount: 0, duplicateCount: 0 });
  // --- STATE THEO DÕI TIẾN TRÌNH & ĐÓN FILE KẾT QUẢ TẠI CHỖ ---
  const [liveExecutedTask, setLiveExecutedTask] = useState<{
    id: string;
    status: string;
    resultUrl?: string;
    logs?: string;
    request_id?: string;
  } | null>(null);

  // Polling theo dõi trạng thái tác vụ vừa kích hoạt từ Studio
  useEffect(() => {
    if (!liveExecutedTask?.id || liveExecutedTask.status === 'success' || liveExecutedTask.status === 'completed' || liveExecutedTask.status === 'failed') {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const freshTasks = await fetchApi<any[]>('/tasks');
        if (freshTasks) {
          const current = freshTasks.find((t) => t.id === liveExecutedTask.id);
          if (current) {
            const execStatus = current.execution_status;
            const resUrl = current.payload_data?.result_file_url;
            setLiveExecutedTask({
              id: current.id,
              status: execStatus,
              resultUrl: resUrl,
              logs: current.execution_logs,
              request_id: current.payload_data?.request_id,
            });

            if (execStatus === 'success' || execStatus === 'completed') {
              toast.success('🎉 Tác vụ đã hoàn tất! File kết quả đã sẵn sàng để tải về!');
            }
          }
        }
      } catch (e) {
        console.debug('Polling live task notice:', e);
      }
    }, 5000); // Quét mỗi 5 giây

    return () => clearInterval(timer);
  }, [liveExecutedTask]);

  // Hàm chuyển đổi số serial ngày của Excel (ví dụ 42370) thành chuỗi DD/MM/YYYY sạch
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

        // 🎯 THÔNG MINH: Nếu là file COF -> Đọc từ sheet 'Student Info' và 'Teacher Info'
        const sheetNames = workbook.SheetNames;
        const isCOF = sheetNames.some(s => s.toLowerCase().includes('student info')) || sheetNames.some(s => s.toLowerCase() === 'cof');

        let targetSheets: string[] = [];
        if (isCOF) {
          targetSheets = sheetNames.filter(s => s.toLowerCase().includes('student info') || s.toLowerCase().includes('teacher info'));
        } else {
          targetSheets = [sheetNames[0]];
        }

        const parsed: ParsedUserRow[] = [];
        let rGlobalIdx = 1;
        let studentsCount = 0;
        let teachersCount = 0;
        let validRows = 0;
        let errorRows = 0;

        targetSheets.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          if (rawJson.length < 2) return;

          // Tìm dòng header
          let headerRowIndex = -1;
          for (let i = 0; i < Math.min(rawJson.length, 15); i++) {
            const rowStr = rawJson[i].map(c => String(c).toLowerCase()).join(' ');
            if (rowStr.includes('first name') || (rowStr.includes('last name') && rowStr.includes('role')) || rowStr.includes('email')) {
              headerRowIndex = i;
              break;
            }
          }
          if (headerRowIndex === -1) headerRowIndex = 0;

          const headers = rawJson[headerRowIndex].map(h => String(h).trim().toLowerCase());
          const fnIdx = headers.findIndex(h => h.includes('first name') || h.includes('tên'));
          const lnIdx = headers.findIndex(h => h.includes('last name') || h.includes('họ'));
          const mobIdx = headers.findIndex(h => h.includes('mobile') || h.includes('sđt') || h.includes('phone'));
          const emIdx = headers.findIndex(h => h.includes('email') || h.includes('thư'));
          const dobIdx = headers.findIndex(h => h.includes('birth') || h.includes('dob') || h.includes('sinh'));
          const roleIdx = headers.findIndex(h => h.includes('role') || h.includes('vai trò'));

          const rowsToParse = rawJson.slice(headerRowIndex + 1);
          rowsToParse.forEach(row => {
            if (row.every(cell => !cell || String(cell).trim() === '')) return;

            const firstName = String(row[fnIdx !== -1 ? fnIdx : 1] || '').trim();
            const lastName = String(row[lnIdx !== -1 ? lnIdx : 2] || '').trim();
            if (!firstName && !lastName) return;

            const mobile = String(row[mobIdx !== -1 ? mobIdx : 3] || '').trim();
            const email = String(row[emIdx !== -1 ? emIdx : 4] || '').trim();

            // 🎯 CONVERT NGÀY SINH CHUẨN XÁC, KHÔNG CÒN BỊ SỐ 42370!
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
            if (isTeacher && !email) errors.push('Giáo viên bắt buộc phải có Email (*)');

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
              isDuplicateEmail: false
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
          duplicateCount: 0
        });

        toast.success(`Đã nạp thành công ${parsed.length} tài khoản (${isCOF ? 'File COF 3 Tabs' : 'File Danh sách'})!`);
      } catch (err) {
        toast.error('Lỗi khi đọc file Excel: ' + (err as Error).message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tính ngày mặc định
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

  // LMS State
  const [lmsSelectedCourses, setLmsSelectedCourses] = useState<LmsCourseSelectionItem[]>([
    {
      category: 'TRAINING COURSES',
      course_id: 735,
      course_name: 'Foundation of IoT and AI with Robotics and Arduino',
      start_date: getFormattedDate(today),
      end_date: getFormattedDate(nextYear),
      group_name: '',
    },
  ]);


  const [lmsActionType, setLmsActionType] = useState<'enroll' | 'unenrol'>('enroll');
  const [lmsUnenrolEmails, setLmsUnenrolEmails] = useState<string>('');

  const [lmsRoleMode, setLmsRoleMode] = useState<'same_role' | 'multi_role'>('same_role');
  const [lmsSingleRole, setLmsSingleRole] = useState<'student' | 'non_editing_teacher' | 'manager'>('non_editing_teacher');
  const [lmsBulkSingleEmails, setLmsBulkSingleEmails] = useState<string>('');
  const [lmsStudentEmails, setLmsStudentEmails] = useState<string>('');
  const [lmsTeacherEmails, setLmsTeacherEmails] = useState<string>('');
  const [lmsManagerEmails, setLmsManagerEmails] = useState<string>('');

  // Keycloak Controls
  const [kcTargetEmail, setKcTargetEmail] = useState<string>('teacher.demo@pythaverse.space');
  const [kcEnableResetPass, setKcEnableResetPass] = useState<boolean>(true);
  const [kcTempPass, setKcTempPass] = useState<string>('Ptv@2026');
  const [kcForceChange, setKcForceChange] = useState<boolean>(true);
  const [kcEnableVerify, setKcEnableVerify] = useState<boolean>(false);
  const [kcVerifyAction, setKcVerifyAction] = useState<'verify' | 'unverify'>('verify');
  const [kcEnableStatus, setKcEnableStatus] = useState<boolean>(false);
  const [kcStatusAction, setKcStatusAction] = useState<'enable' | 'disable'>('enable');

  // 🐙 Pythaverse Git Controls (MỚI)
  const [gitRepoUrl, setGitRepoUrl] = useState<string>('https://git.pythaverse.space/ptvswrp/SWRP11_Teacher');
  const [gitTargetRole, setGitTargetRole] = useState<'GUEST' | 'DEVELOPER' | 'ADMIN'>('GUEST');
  const [gitUsersList, setGitUsersList] = useState<string>('hsdttemd\ngvdttemd');
  const [isGitRepoDropdownOpen, setIsGitRepoDropdownOpen] = useState<boolean>(false);
  const [gitRepoSearchQuery, setGitRepoSearchQuery] = useState<string>('');
  const gitRepoDropdownRef = useRef<HTMLDivElement | null>(null);
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
        } catch {
          // Bỏ qua nếu parse JSON lỗi
        }
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

  // Lọc repo theo từ khóa tìm kiếm
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

  // Feedback Doc
  const [docUrl, setDocUrl] = useState<string>('');
  const [assigneeEmail, setAssigneeEmail] = useState<string>('hung.nguyenmanh@dtt.vn');
  const [feedbackCommentContent, setFeedbackCommentContent] = useState<string>(
    'Kính gửi anh/chị, em xin phép chuyển thông tin phản hồi này để team kỹ thuật rà soát và hỗ trợ giải quyết.'
  );
  const [isGeneratingDocComment, setIsGeneratingDocComment] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [preparedPayload, setPreparedPayload] = useState<{
    bot_type: BotType | 'lms_playwright' | 'git_collaborator';
    payload_data: Record<string, any>;
    summary: PreparedTaskSummary;
  } | null>(null);

  // SWR Metadata fetch
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
          const defaultCat = lmsCats && lmsCats.length > 0 ? lmsCats[0] : lmsCourses[0].category;
          const matchFirst = lmsCourses.filter((c) => c.category === defaultCat);
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
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
        setIsEntityDropdownOpen(false);
      }
      // 👈 Thêm dòng này để tự đóng Dropdown Repo khi click ra ngoài
      if (gitRepoDropdownRef.current && !gitRepoDropdownRef.current.contains(event.target as Node)) {
        setIsGitRepoDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLoadOrderDetails = async (orderCodeToLoad: string, schoolNameForQuery?: string) => {
    setIsLoadingOrderDetails(true);
    try {
      const schoolParam = schoolNameForQuery || selectedCachedItem?.school_name || selectedSchool?.school_name || '';
      const res = await fetchApi<any>(
        `/workspace/school-order-details?order_code=${encodeURIComponent(
          orderCodeToLoad
        )}&school_identifier=${encodeURIComponent(schoolParam)}`
      );
      if (res?.courses && res.courses.length > 0) {
        setParsedOrderCourses(res.courses);
      } else {
        setParsedOrderCourses([]);
      }
    } catch (err) {
      console.warn('Lỗi đọc chi tiết Order:', err);
    } finally {
      setIsLoadingOrderDetails(false);
    }
  };

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
      toast.error('Lỗi đọc dữ liệu danh sách: ' + (err as Error).message);
    } finally {
      setIsScrapingLive(false);
    }
  };

  useEffect(() => {
    if (selectedBotType === 'workspace_rpa' && workspaceMainCategory === 'approve') {
      handleFetchCachedList();
    }
  }, [approveSubFlow, workspaceMainCategory, selectedBotType]);

  const filteredCacheList = useMemo(() => {
    return scrapedPendingList.filter((item) => {
      const rawStat = (item.status || '').toLowerCase();
      if (statusFilter === 'pending') {
        const isPending = rawStat.includes('pending') || rawStat.includes('awaiting') || rawStat === '3' || rawStat === '7';
        if (!isPending) return false;
      } else if (statusFilter === 'approved') {
        const isApproved = rawStat.includes('approved') || rawStat === '1';
        if (!isApproved) return false;
      } else if (statusFilter === 'rejected') {
        const isRejected = rawStat.includes('rejected') || rawStat === '4';
        if (!isRejected) return false;
      }

      const q = universalSearchQuery.trim().toLowerCase();
      if (!q) return true;

      const codeMatch = (item.order_code || item.contract_code || item.data_id || '').toLowerCase().includes(q);
      const schoolMatch = (item.school_name || '').toLowerCase().includes(q) || (item.school_code || '').toLowerCase().includes(q);
      const partnerMatch = (item.partner_name || item.sender_name || '').toLowerCase().includes(q) || (item.partner_code || '').toLowerCase().includes(q);
      const distMatch = (item.distributor_name || item.receiver_name || '').toLowerCase().includes(q) || (item.distributor_code || '').toLowerCase().includes(q);

      return codeMatch || schoolMatch || partnerMatch || distMatch;
    });
  }, [scrapedPendingList, statusFilter, universalSearchQuery]);

  const handleAIGenerateDocComment = async () => {
    if (!docUrl) {
      toast.error('Vui lòng nhập đường dẫn Google Doc trước khi bấm AI tạo nội dung!');
      return;
    }
    setIsGeneratingDocComment(true);
    try {
      const res = await fetchApi<any>('/github/ai-template', {
        method: 'POST',
        body: JSON.stringify({
          ticket_subject: `Phản hồi tài liệu: ${docUrl}`,
          ticket_content: `Yêu cầu phân tích và tóm tắt nội dung từ link Google Doc: ${docUrl} để bàn giao xử lý.`,
          qa_investigation: `Người phụ trách: ${assigneeEmail}`,
        }),
      });

      if (res?.title || res?.body) {
        setFeedbackCommentContent(
          `Kính gửi anh/chị (@${assigneeEmail.split('@')[0]}),\n\nAI đã rà soát nội dung báo cáo: "${res.title || 'Vấn đề cần hỗ trợ'}".\nChi tiết: ${res.body?.slice(0, 180) || 'Đề nghị kiểm tra và xử lý theo quy trình.'}...\n\nNhờ anh/chị xử lý giúp ạ!`
        );
        toast.success('AI đã soạn thảo thành công nội dung ghi chú!');
      } else {
        setFeedbackCommentContent(`Kính gửi @${assigneeEmail.split('@')[0]}, nhờ bạn kiểm tra và xử lý tài liệu tại: ${docUrl}`);
      }
    } catch (e) {
      setFeedbackCommentContent(`Kính gửi @${assigneeEmail.split('@')[0]}, nhờ bạn rà soát và xử lý nội dung tài liệu này nhé.`);
      toast.info('Đã tạo mẫu ghi chú mặc định.');
    } finally {
      setIsGeneratingDocComment(false);
    }
  };

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
      toast.error('Cần ít nhất 1 khóa học để thực hiện ghi danh!');
      return;
    }
    setLmsSelectedCourses(lmsSelectedCourses.filter((_, idx) => idx !== index));
  };

  const handleOpenConfirmModal = () => {
    let payload: Record<string, any> = {
      is_manual_dispatch: true,
      creator: 'Admin Studio',
      contact_info: contactInfo,
      additional_notes: additionalNotes,
    };

    let summary: PreparedTaskSummary = {
      engineName: '',
      actionTitle: '',
      targetEntity: '',
      detailsList: [],
    };

    let actualBotType: BotType | 'lms_playwright' | 'git_collaborator' = selectedBotType;

    if (selectedBotType === 'workspace_rpa') {
      summary.engineName = '🏢 Workspace RPA & LMS Pipeline';

      if (workspaceMainCategory === 'approve') {
        if (!selectedItemCode) {
          toast.error('Vui lòng click chọn 1 Đơn Hàng / Hợp Đồng trong danh sách kết quả lọc phía dưới!');
          return;
        }

        if (approveSubFlow === 'approve_school_order') {
          const resolvedSchoolName = selectedCachedItem?.school_name || 'Tự động truy vết theo Order';
          const resolvedPartnerName = selectedCachedItem?.partner_name || 'Tự động truy vết';

          payload = {
            ...payload,
            action: 'approve_school_order_standalone',
            order_code: selectedItemCode,
            school_name: resolvedSchoolName,
            partner_name: resolvedPartnerName,
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : undefined,
          };

          summary.actionTitle = 'Phê Duyệt Đơn Hàng Trường Học (School Order)';
          summary.targetEntity = `Mã Đơn: ${selectedItemCode}`;
          summary.detailsList = [
            `Trường học: ${resolvedSchoolName}`,
            `Đối tác quản lý: ${resolvedPartnerName}`,
            `Số lượng môn học bóc tách: ${parsedOrderCourses.length} môn`,
          ];
        } else if (approveSubFlow === 'approve_partner_contract') {
          const resolvedPartnerName = selectedCachedItem?.partner_name || selectedCachedItem?.sender_name || undefined;
          const resolvedDistName = selectedCachedItem?.distributor_name || selectedCachedItem?.receiver_name || undefined;
          const resolvedDistCode = selectedCachedItem?.distributor_code;

          payload = {
            ...payload,
            action: 'approve_partner_contract_standalone',
            contract_code: selectedItemCode,
            partner_name: resolvedPartnerName,
            distributor_name: resolvedDistName,
            distributor_code: resolvedDistCode,
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : selectedCachedItem?.courses_data,
          };

          summary.actionTitle = 'Phê Duyệt Hợp Đồng Đối Tác (PRT Contract)';
          summary.targetEntity = `Mã Hợp Đồng: ${selectedItemCode}`;
          summary.detailsList = [
            `Đối tác gửi: ${resolvedPartnerName || 'Tự động truy vết từ Két sắt'}`,
            `Nhà phân phối nhận: ${resolvedDistName || 'Tự động truy vết từ Két sắt'}`,
          ];
        } else if (approveSubFlow === 'admin_approve_contract') {
          if (!adminJustification || adminJustification.trim().length < 15) {
            toast.error('Lý do phê duyệt của Sales Admin bắt buộc phải có ít nhất 15 ký tự!');
            return;
          }

          const resolvedDistName = selectedCachedItem?.distributor_name || selectedCachedItem?.sender_name || 'Tự động truy vết';
          const resolvedDistCode = selectedCachedItem?.distributor_code;

          payload = {
            ...payload,
            action: 'admin_approve_contract',
            contract_code: selectedItemCode,
            distributor_name: resolvedDistName,
            distributor_code: resolvedDistCode,
            justification: adminJustification.trim(),
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : selectedCachedItem?.courses_data,
          };

          summary.actionTitle = 'Sales Admin Phê Duyệt Hợp Đồng Quản Trị (DST Contract)';
          summary.targetEntity = `Mã Hợp Đồng: ${selectedItemCode}`;
          summary.detailsList = [
            `Nhà phân phối: ${resolvedDistName}`,
            `Lý do phê duyệt: "${adminJustification.trim()}"`,
          ];
        }
      } else if (workspaceMainCategory === 'create_and_approve') {
        if (createApproveSubFlow === 'end_to_end') {
          if (!selectedSchool) {
            toast.error('Vui lòng chọn trường học áp dụng từ danh sách!');
            return;
          }
          payload = {
            ...payload,
            action: 'pipeline_end_to_end',
            school_name: selectedSchool.school_name,
            hierarchy: {
              school_name: selectedSchool.school_name,
              school_code: selectedSchool.school_code,
              partner_name: selectedSchool.partner_name,
              distributor_name: selectedSchool.distributor_name,
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
          };

          summary.actionTitle = 'Chạy Toàn Trình Trọn Gói 4 Cấp (End-to-End Pipeline)';
          summary.targetEntity = selectedSchool.school_name;
          summary.detailsList = [
            `Tuyến phả hệ: ${selectedSchool.full_lineage}`,
            `Tổng số môn cấp phép: ${selectedCourses.length} môn`,
          ];
        } else if (createApproveSubFlow === 'partner_create_chain') {
          if (!selectedPartner) {
            toast.error('Vui lòng chọn đối tác phụ trách!');
            return;
          }
          payload = {
            ...payload,
            action: 'partner_create_and_approve_chain',
            partner_name: selectedPartner.name,
            partner_code: selectedPartner.code,
            contract_data: {
              notes: additionalNotes,
              courses: selectedCourses.map((c) => ({
                category: c.category,
                course_name: c.course_name,
                licenses: c.licenses,
              })),
            },
          };

          summary.actionTitle = 'Tạo & Duyệt Chuỗi Đối Tác (Partner ➔ Distributor)';
          summary.targetEntity = selectedPartner.name;
          summary.detailsList = [`Đối tác: ${selectedPartner.name} (Mã: ${selectedPartner.code})`];
        } else if (createApproveSubFlow === 'distributor_create_chain') {
          if (!selectedDistributor) {
            toast.error('Vui lòng chọn nhà phân phối!');
            return;
          }
          payload = {
            ...payload,
            action: 'distributor_create_and_approve_chain',
            distributor_name: selectedDistributor.name,
            distributor_code: selectedDistributor.code,
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

          summary.actionTitle = 'Tạo & Duyệt Chuỗi Nhà Phân Phối (Distributor ➔ Sales Admin)';
          summary.targetEntity = selectedDistributor.name;
          summary.detailsList = [`Nhà phân phối: ${selectedDistributor.name} (Mã: ${selectedDistributor.code})`];
        }
      } else if (workspaceMainCategory === 'bulk_accounts') {
        if (!uploadedAccountsFile) {
          toast.error('Vui lòng chọn file Excel (.xlsx) chứa danh sách tài khoản!');
          return;
        }
        if (!selectedSchool) {
          toast.error('Vui lòng chọn trường học áp dụng ở ô tìm kiếm phía trên!');
          return;
        }

        // Bổ sung đầy đủ phả hệ và thống kê từ bảng kiểm tra hợp lệ
        payload = {
          ...payload,
          action: 'bulk_account_creation',
          school_name: selectedSchool.school_name,
          school_code: selectedSchool.school_code,
          partner_name: selectedSchool.partner_name,
          distributor_name: selectedSchool.distributor_name,
          filename: uploadedAccountsFile.name,
          file_size_kb: Math.round(uploadedAccountsFile.size / 1024),
          total_count: accountValidationStats.total || parsedAccountRows.length,
          student_count: accountValidationStats.students,
          teacher_count: accountValidationStats.teachers,
          has_validation_errors: accountValidationStats.errorCount > 0,
        };

        summary.actionTitle = `Tạo Hàng Loạt ${accountValidationStats.total || parsedAccountRows.length} Tài Khoản (${accountValidationStats.students} HS, ${accountValidationStats.teachers} GV)`;
        summary.targetEntity = selectedSchool.school_name;
        summary.detailsList = [
          `File tải lên: ${uploadedAccountsFile.name} (${Math.round(uploadedAccountsFile.size / 1024)} KB)`,
          `Trường thụ hưởng: ${selectedSchool.school_name} (Mã: ${selectedSchool.school_code})`,
          `Tuyến phả hệ: ${selectedSchool.partner_name} ➔ ${selectedSchool.distributor_name}`,
          `Trạng thái kiểm tra file: ${accountValidationStats.validCount} hợp lệ, ${accountValidationStats.errorCount} cần chú ý`,
        ];
      } else if (workspaceMainCategory === 'lms_enroll') {
        actualBotType = 'lms_playwright';

        if (lmsSelectedCourses.length === 0) {
          toast.error('Vui lòng chọn ít nhất 1 khóa học LMS!');
          return;
        }

        if (lmsActionType === 'unenrol') {
          // 👉 HÀNH ĐỘNG HỦY GHI DANH (UNENROL)
          const unenrolList = lmsUnenrolEmails
            .split(/[\n,;]+/)
            .map((e) => e.trim())
            .filter((e) => e.length > 0);

          if (unenrolList.length === 0) {
            toast.error('Vui lòng nhập ít nhất 1 email cần hủy ghi danh khỏi khóa học!');
            return;
          }

          payload = {
            action: 'unenrol_users_pipeline',
            platform: 'learn.pythaverse.space',
            courses: lmsSelectedCourses.map((c) => ({
              course_id: c.course_id,
              course_name: c.course_name,
            })),
            emails: unenrolList,
          };

          summary.engineName = '🗑️ PLearn Moodle LMS Batch Unenroller';
          summary.actionTitle = `Hủy Ghi Danh ${unenrolList.length} Học Viên Khỏi ${lmsSelectedCourses.length} Khóa Học`;
          summary.targetEntity = `${lmsSelectedCourses.length} Khóa học (${lmsSelectedCourses.map((c) => c.course_name).join(', ')})`;
          summary.detailsList = [
            `Số lượng học viên cần xóa: ${unenrolList.length} tài khoản`,
            `Danh sách khóa học áp dụng: ${lmsSelectedCourses.map((c) => `#${c.course_id}`).join(', ')}`,
            `Hành động: Xóa vĩnh viễn quyền truy cập khóa học (Unenrol 🗑️)`,
          ];
        } else {
          // 👉 HÀNH ĐỘNG GHI DANH MỚI & GIA HẠN (ENROL)
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

          const totalEmails = studentsList.length + teachersList.length + managersList.length;
          if (totalEmails === 0) {
            toast.error('Vui lòng nhập ít nhất một email cần ghi danh vào LMS!');
            return;
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
            auto_update_roles: true,
          };

          summary.engineName = '🎓 PLearn Moodle LMS Batch Direct Enroller';
          summary.actionTitle = `Ghi Danh & Đổi Quyền Cho ${lmsSelectedCourses.length} Khóa Học (Single-Session)`;
          summary.targetEntity = `${lmsSelectedCourses.length} Khóa học (${lmsSelectedCourses.map((c) => c.course_name).join(', ')})`;
          summary.detailsList = [
            `Tổng số tài khoản: ${totalEmails} người dùng`,
            `Số lượng môn học thực thi: ${lmsSelectedCourses.length} môn (Không cần logout)`,
            `Tự động cập nhật Role & Gia hạn: Có kích hoạt`,
          ];
        }
      }
    } else if (selectedBotType === 'git_collaborator') {
      // 🐙 THÊM THÀNH VIÊN VÀO REPOSITORY GIT (GITBUCKET)
      const cleanRepo = gitRepoUrl.trim();
      if (!cleanRepo) {
        toast.error('Vui lòng nhập đường dẫn Repository trên git.pythaverse.space!');
        return;
      }

      const usersArr = gitUsersList
        .split(/[\n,;]+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      if (usersArr.length === 0) {
        toast.error('Vui lòng nhập ít nhất 1 username hoặc email cần thêm vào Repo!');
        return;
      }

      payload = {
        action: 'add_repo_collaborators',
        repo_url: cleanRepo,
        role: gitTargetRole,
        users: usersArr,
      };

      summary.engineName = '🐙 Pythaverse Git (GitBucket Collaborator RPA)';
      summary.actionTitle = `Thêm ${usersArr.length} Thành Viên Vào Repo Với Quyền [${gitTargetRole}]`;
      summary.targetEntity = cleanRepo;
      summary.detailsList = [
        `Kho lưu trữ: ${cleanRepo}`,
        `Vai trò gán: ${gitTargetRole} (Mặc định: GUEST)`,
        `Số lượng tài khoản xử lý: ${usersArr.length} người dùng (${usersArr.slice(0, 3).join(', ')}${usersArr.length > 3 ? '...' : ''})`,
      ];
    } else if (selectedBotType === 'keycloak_api') {
      const rawEmails = kcTargetEmail
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      if (rawEmails.length === 0) {
        toast.error('Vui lòng nhập ít nhất 1 email hoặc username cần xử lý!');
        return;
      }

      const actions: string[] = [];
      const conf: Record<string, any> = {
        identifiers: rawEmails,
        target_email: rawEmails[0],
      };
      const details: string[] = [];

      if (kcEnableResetPass) {
        actions.push('reset_password');
        conf.temporary_password = kcTempPass;
        conf.force_change_on_first_login = kcForceChange;
        details.push(`Đặt lại pass tạm: "${kcTempPass}" (Bắt buộc đổi: ${kcForceChange ? 'Có' : 'Không'})`);
      }
      if (kcEnableVerify) {
        actions.push(kcVerifyAction === 'verify' ? 'mark_email_verified' : 'mark_email_unverified');
        details.push(`Xác thực Email: ${kcVerifyAction === 'verify' ? 'Đã xác thực (TRUE)' : 'Gỡ xác thực (FALSE)'}`);
      }
      if (kcEnableStatus) {
        actions.push(kcStatusAction === 'enable' ? 'enable_account' : 'disable_account');
        details.push(`Trạng thái: ${kcStatusAction === 'enable' ? 'Kích hoạt (Enabled)' : 'Vô hiệu hóa (Disabled)'}`);
      }

      conf.actions = actions.length > 0 ? actions : ['noop_preview'];
      payload = conf;

      summary.engineName = '🔑 Keycloak IDP Management Bot';
      summary.actionTitle = `Quản Trị Danh Tính & Mật Khẩu (${rawEmails.length} Người Dùng)`;
      summary.targetEntity =
        rawEmails.length === 1
          ? rawEmails[0]
          : `${rawEmails[0]} (+${rawEmails.length - 1} tài khoản khác)`;
      summary.detailsList = details.length > 0 ? details : ['Chưa chọn hành động can thiệp nào'];
    } else if (selectedBotType === 'feedback_doc_triage') {
      if (!docUrl) {
        toast.error('Vui lòng nhập đường dẫn Google Doc cần xử lý!');
        return;
      }
      payload = {
        action: 'comment_and_assign',
        doc_url: docUrl,
        assignee_email: assigneeEmail,
        comment_content: feedbackCommentContent,
        row_index: 1,
      };

      summary.engineName = '🤖 Feedback Sheet & Google Doc Triage';
      summary.actionTitle = 'Đọc Tài Liệu & @Mention Giao Việc Tự Động';
      summary.targetEntity = docUrl;
      summary.detailsList = [
        `Gán nhân sự: ${assigneeEmail}`,
        `Nội dung tag: "${feedbackCommentContent.slice(0, 50)}..."`,
      ];
    }

    setPreparedPayload({
      bot_type: actualBotType,
      payload_data: payload,
      summary,
    });
    setIsConfirmModalOpen(true);
  };

  const handleConfirmExecute = async () => {
    if (!preparedPayload) return;

    setSubmitting(true);
    try {
      let finalPayloadData = { ...preparedPayload.payload_data };

      if (workspaceMainCategory === 'bulk_accounts' && uploadedAccountsFile) {
        toast.info('Đang tải file Excel lên hệ thống lưu trữ...');
        const cleanFileName = `studio_accounts/${Date.now()}_${uploadedAccountsFile.name.replace(/\s+/g, '_')}`;

        const { error: uploadErr } = await supabase.storage
          .from('ticket-attachments')
          .upload(cleanFileName, uploadedAccountsFile, { upsert: true });

        if (uploadErr) throw new Error(`Lỗi upload file: ${uploadErr.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('ticket-attachments')
          .getPublicUrl(cleanFileName);

        finalPayloadData.attachment_url = publicUrlData.publicUrl;
      }

      const createdTask = await fetchApi<any>('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: null,
          bot_type: preparedPayload.bot_type,
          payload_data: finalPayloadData,
          run_immediately: true,
          approval_status: 'approved',
        }),
      });

      // Lưu lại thông tin task để hiển thị widget tiến trình đón file ngay tại chỗ
      if (createdTask?.id) {
        setLiveExecutedTask({
          id: createdTask.id,
          status: createdTask.execution_status || 'queued',
          resultUrl: createdTask.payload_data?.result_file_url,
          request_id: createdTask.payload_data?.request_id,
        });
      }

      setIsConfirmModalOpen(false);

      toast.success(
        <div className="space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-emerald-500">
            <CheckCircle2 className="w-4 h-4" />
            <span>Đã kích hoạt Worker tự động hóa!</span>
          </div>
          <div className="text-xs text-slate-500">Tác vụ đang được thực thi dưới nền. Bạn có thể theo dõi tiến trình ngay bên dưới.</div>
        </div>,
        { duration: 5000 }
      );

      setIsConfirmModalOpen(false);

      toast.success(
        <div className="space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Đã kích hoạt Worker tự động hóa!</span>
          </div>
          <div className="text-xs text-primary-ink">Tác vụ đang được thực thi dưới nền.</div>
          <button
            onClick={() => navigate('/bots')}
            className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-semibold cursor-pointer block mt-1 transition"
          >
            Mở Bot Command Center xem Live Terminal ➔
          </button>
        </div>,
        { duration: 6000 }
      );
    } catch (err) {
      toast.error('Lỗi khi kích hoạt Worker: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 pb-24"
    >
      {/* 1. Header Card Bento */}
      <div
        id="automation-studio-header-card"
        className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
                  Automation Studio
                </h1>
                <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/80 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-300/40 uppercase tracking-wider">
                  BENTO DIRECT ENGINE
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Khởi tạo và điều phối các chuỗi tác vụ tự động hóa độc lập với kiến trúc Bento Grid.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-goto-bot-center"
              onClick={() => navigate('/bots')}
              className="group flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"
            >
              <span>Xem Bot Center</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. 4 Bento Pastel Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl border border-blue-100 dark:border-blue-950/60 bg-blue-50/90 dark:bg-blue-950/30 p-5 flex flex-col justify-between shadow-xs"
        >
          <div>
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">
              Tác Vụ Tự Động
            </p>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">24,850</h3>
          </div>
          <div className="flex items-center text-xs text-blue-500 font-medium mt-3">
            <span className="mr-1 font-bold">↑ 12%</span>
            <span className="opacity-60 text-slate-500 dark:text-slate-400">so với tháng trước</span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl border border-purple-100 dark:border-purple-950/60 bg-purple-50/90 dark:bg-purple-950/30 p-5 flex flex-col justify-between shadow-xs"
        >
          <div>
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1">
              Đơn Hàng & License
            </p>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {schoolsList.length > 0 ? `${schoolsList.length}+` : '490+'}
            </h3>
          </div>
          <div className="flex items-center text-xs text-purple-500 font-medium mt-3">
            <span className="mr-1 font-bold">480 Trường</span>
            <span className="opacity-60 text-slate-500 dark:text-slate-400">+ 158 PRT/DST</span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl border border-orange-100 dark:border-orange-950/60 bg-orange-50/90 dark:bg-orange-950/30 p-5 flex flex-col justify-between shadow-xs"
        >
          <div>
            <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-1">
              Duyệt Tự Động
            </p>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">98.6%</h3>
          </div>
          <div className="flex items-center text-xs text-orange-500 font-medium mt-3">
            <span className="mr-1 font-bold">Zero-error</span>
            <span className="opacity-60 text-slate-500 dark:text-slate-400">pipeline 4 cấp</span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl border border-emerald-100 dark:border-emerald-950/60 bg-emerald-50/90 dark:bg-emerald-950/30 p-5 flex flex-col justify-between shadow-xs"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-widest mb-0.5">
                Mục Tiêu Năm
              </p>
              <h4 className="text-base font-bold text-emerald-900 dark:text-emerald-200">Kỳ 2026 - 2027</h4>
            </div>
            <div className="w-8 h-8 rounded-full bg-white dark:bg-emerald-900/60 flex items-center justify-center text-emerald-500 shadow-xs text-sm">
              🎯
            </div>
          </div>
          <div className="space-y-1.5 mt-1">
            <div className="h-2 w-full bg-emerald-200/60 dark:bg-emerald-900/60 rounded-full overflow-hidden">
              <div className="h-full w-3/4 bg-emerald-500 rounded-full" />
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
              Đã hoàn thành 75% chỉ tiêu năm. Tiếp tục duy trì phong độ!
            </p>
          </div>
        </motion.div>
      </div>

      {/* 3. Bước 1: Chọn Cỗ Máy Tự Động Hóa (4 ENGINES) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white shadow-xs">
              1
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Chọn Cỗ Máy Tự Động Hóa
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">4 Động cơ khả dụng</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Engine 1: Workspace */}
          <button
            id="engine-card-workspace"
            onClick={() => setSelectedBotType('workspace_rpa')}
            className={`group relative flex flex-col justify-between rounded-3xl border p-5 text-left transition-all duration-150 cursor-pointer ${selectedBotType === 'workspace_rpa'
              ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-500/20 ring-2 ring-indigo-500/30'
              : 'border-blue-100 dark:border-blue-950/60 bg-blue-50/50 dark:bg-slate-900 hover:border-blue-300 hover:shadow-xs'
              }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors ${selectedBotType === 'workspace_rpa'
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                  }`}
              >
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className={`text-sm font-bold tracking-tight ${selectedBotType === 'workspace_rpa' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  Workspace & LMS
                </h3>
                <p className={`text-xs mt-0.5 ${selectedBotType === 'workspace_rpa' ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  Đơn Hàng & Moodle
                </p>
              </div>
            </div>

            {selectedBotType === 'workspace_rpa' && (
              <div className="mt-3 flex items-center justify-end">
                <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <Check className="h-3 w-3" /> Đang chọn
                </span>
              </div>
            )}
          </button>

          {/* Engine 2: Keycloak */}
          <button
            id="engine-card-keycloak"
            onClick={() => setSelectedBotType('keycloak_api')}
            className={`group relative flex flex-col justify-between rounded-3xl border p-5 text-left transition-all duration-150 cursor-pointer ${selectedBotType === 'keycloak_api'
              ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-500/20 ring-2 ring-purple-500/30'
              : 'border-purple-100 dark:border-purple-950/60 bg-purple-50/50 dark:bg-slate-900 hover:border-purple-300 hover:shadow-xs'
              }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors ${selectedBotType === 'keycloak_api'
                  ? 'bg-white/20 text-white'
                  : 'bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400'
                  }`}
              >
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h3 className={`text-sm font-bold tracking-tight ${selectedBotType === 'keycloak_api' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  Keycloak IDP
                </h3>
                <p className={`text-xs mt-0.5 ${selectedBotType === 'keycloak_api' ? 'text-purple-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  Quản Trị Người Dùng
                </p>
              </div>
            </div>

            {selectedBotType === 'keycloak_api' && (
              <div className="mt-3 flex items-center justify-end">
                <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <Check className="h-3 w-3" /> Đang chọn
                </span>
              </div>
            )}
          </button>

          {/* Engine 3: Pythaverse Git (MỚI) */}
          <button
            id="engine-card-git"
            onClick={() => setSelectedBotType('git_collaborator')}
            className={`group relative flex flex-col justify-between rounded-3xl border p-5 text-left transition-all duration-150 cursor-pointer ${selectedBotType === 'git_collaborator'
              ? 'border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-500/20 ring-2 ring-violet-500/30'
              : 'border-violet-100 dark:border-violet-950/60 bg-violet-50/50 dark:bg-slate-900 hover:border-violet-300 hover:shadow-xs'
              }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors ${selectedBotType === 'git_collaborator'
                  ? 'bg-white/20 text-white'
                  : 'bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400'
                  }`}
              >
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <h3 className={`text-sm font-bold tracking-tight ${selectedBotType === 'git_collaborator' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  Pythaverse Git
                </h3>
                <p className={`text-xs mt-0.5 ${selectedBotType === 'git_collaborator' ? 'text-violet-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  Thêm Vào Repo
                </p>
              </div>
            </div>

            {selectedBotType === 'git_collaborator' && (
              <div className="mt-3 flex items-center justify-end">
                <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <Check className="h-3 w-3" /> Đang chọn
                </span>
              </div>
            )}
          </button>

          {/* Engine 4: Feedback Sheet */}
          <button
            id="engine-card-feedback"
            onClick={() => setSelectedBotType('feedback_doc_triage')}
            className={`group relative flex flex-col justify-between rounded-3xl border p-5 text-left transition-all duration-150 cursor-pointer ${selectedBotType === 'feedback_doc_triage'
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-500/20 ring-2 ring-emerald-500/30'
              : 'border-emerald-100 dark:border-emerald-950/60 bg-emerald-50/50 dark:bg-slate-900 hover:border-emerald-300 hover:shadow-xs'
              }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors ${selectedBotType === 'feedback_doc_triage'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  }`}
              >
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className={`text-sm font-bold tracking-tight ${selectedBotType === 'feedback_doc_triage' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  Feedback Sheet
                </h3>
                <p className={`text-xs mt-0.5 ${selectedBotType === 'feedback_doc_triage' ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  Ghi Chú & Tag Doc
                </p>
              </div>
            </div>

            {selectedBotType === 'feedback_doc_triage' && (
              <div className="mt-3 flex items-center justify-end">
                <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <Check className="h-3 w-3" /> Đang chọn
                </span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* 4. Bước 2: Workspace & LMS Engine Workplace */}
      {selectedBotType === 'workspace_rpa' && (
        <div className="space-y-5 rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                2
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Chọn Phân Luồng Nghiệp Vụ Cốt Lõi:
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: 'approve', label: '1. Phê Duyệt', icon: ClipboardCheck },
                { id: 'create_and_approve', label: '2. Tạo & Duyệt', icon: Zap },
                { id: 'bulk_accounts', label: '3. Tạo Tài Khoản', icon: Users },
                { id: 'lms_enroll', label: '4. Ghi Danh LMS', icon: GraduationCap },
              ].map((mTab) => {
                const MIcon = mTab.icon;
                const isCur = workspaceMainCategory === mTab.id;
                return (
                  <button
                    key={mTab.id}
                    onClick={() => {
                      setWorkspaceMainCategory(mTab.id as any);
                      setParsedOrderCourses([]);
                      setSelectedCachedItem(null);
                      setSelectedItemCode('');
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-semibold transition-all cursor-pointer ${isCur
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    <MIcon className="h-4 w-4" />
                    <span>{mTab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* WORKFLOW 1: PHÊ DUYỆT */}
          {workspaceMainCategory === 'approve' && (
            <div className="space-y-5 pt-2">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {[
                  { id: 'approve_school_order', label: 'Đơn Hàng Trường', desc: 'Duyệt Order của Trường' },
                  { id: 'approve_partner_contract', label: 'Hợp Đồng Đối Tác', desc: 'Duyệt Contract PRT' },
                  { id: 'admin_approve_contract', label: 'Hợp Đồng Quản Trị', desc: 'Duyệt Contract DST' },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setApproveSubFlow(sub.id as any);
                      setUniversalSearchQuery('');
                      setSelectedItemCode('');
                      setSelectedCachedItem(null);
                      setParsedOrderCourses([]);
                    }}
                    className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${approveSubFlow === sub.id
                      ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                  >
                    <p className={`text-xs font-bold ${approveSubFlow === sub.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                      {sub.label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub.desc}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Search className="h-3.5 w-3.5 text-indigo-600" />
                    <span>
                      {approveSubFlow === 'approve_school_order' && 'Tìm Kiếm Đơn Hàng (Theo Mã Đơn, Tên Trường, hoặc Tên Đối Tác):'}
                      {approveSubFlow === 'approve_partner_contract' && 'Tìm Kiếm Hợp Đồng (Theo Mã PRT, Tên Đối Tác, hoặc Nhà Phân Phối):'}
                      {approveSubFlow === 'admin_approve_contract' && 'Tìm Kiếm Hợp Đồng (Theo Mã DST, hoặc Tên Nhà Phân Phối):'}
                    </span>
                  </span>
                  {selectedItemCode && (
                    <span className="text-xs text-indigo-600 font-mono font-bold">
                      Đang chọn: {selectedItemCode}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={universalSearchQuery}
                    onChange={(e) => setUniversalSearchQuery(e.target.value)}
                    placeholder="Gõ từ khóa để lọc danh sách bên dưới (VD: SCH-..., PRT-..., DST-...)"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden transition-all"
                  />
                  {universalSearchQuery && (
                    <button
                      onClick={() => setUniversalSearchQuery('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {approveSubFlow === 'admin_approve_contract' && (
                <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Lý Do Phê Duyệt Sales Admin: <span className="text-rose-500">* (Tối thiểu 15 ký tự)</span>
                    </label>
                    <span className={`text-[11px] font-mono font-medium ${adminJustification.trim().length >= 15 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {adminJustification.trim().length}/15 ký tự
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={adminJustification}
                    onChange={(e) => setAdminJustification(e.target.value)}
                    placeholder="Nhập lý do phê duyệt Sales Admin..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Danh Sách Đơn Hàng ({filteredCacheList.length}/{scrapedPendingList.length}):
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {[
                    { id: 'pending', label: '⏳ Chờ duyệt' },
                    { id: 'approved', label: '✅ Đã duyệt' },
                    { id: 'rejected', label: '❌ Bị từ chối' },
                    { id: 'all', label: '📑 Tất cả' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setStatusFilter(st.id as any)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${statusFilter === st.id
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 font-semibold ring-1 ring-indigo-300/60'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                    >
                      <span>{st.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {isScrapingLive && scrapedPendingList.length === 0 ? (
                    <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span>Đang nạp danh sách từ Cache...</span>
                    </div>
                  ) : filteredCacheList.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
                      Không tìm thấy đơn hàng hoặc hợp đồng phù hợp với điều kiện tìm kiếm.
                    </div>
                  ) : (
                    filteredCacheList.map((item, pIdx) => {
                      const itemCode = item.order_code || item.contract_code || item.data_id || `ITEM-${pIdx}`;
                      const isSelected = selectedItemCode === itemCode;
                      const isPending =
                        (item.status || '').toLowerCase().includes('pending') ||
                        (item.status || '').toLowerCase().includes('awaiting');

                      return (
                        <div
                          key={pIdx}
                          onClick={() => {
                            setSelectedItemCode(itemCode);
                            setSelectedCachedItem(item);
                            if (approveSubFlow === 'approve_school_order') {
                              if (item.courses_data && item.courses_data.length > 0) {
                                setParsedOrderCourses(item.courses_data);
                              } else {
                                handleLoadOrderDetails(itemCode, item.school_name);
                              }
                            } else {
                              if (item.courses_data && item.courses_data.length > 0) {
                                setParsedOrderCourses(item.courses_data);
                              } else {
                                setParsedOrderCourses([]);
                              }
                            }
                            toast.success(`Đã chọn: ${itemCode}`);
                          }}
                          className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-xs ring-1 ring-indigo-500'
                            : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-300'
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                {itemCode}
                              </span>
                              <p className="text-xs text-slate-600 dark:text-slate-300">
                                {item.school_name || item.sender_name || 'Đơn vị gửi'}
                              </p>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                <span>{item.partner_name || item.sender_name}</span>
                                <span>➔</span>
                                <span>{item.distributor_name || item.receiver_name}</span>
                                <span>|</span>
                                <span className="font-mono">{item.order_date || item.contract_date || item.created_at}</span>
                              </div>
                            </div>

                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${isPending
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                }`}
                            >
                              {item.status || 'Chờ duyệt'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="lg:col-span-5">
                  <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <BookOpen className="h-4 w-4 text-indigo-600" />
                        <span>Chi Tiết Khóa Học & Giấy Phép</span>
                      </div>
                      {selectedItemCode && (
                        <span className="font-mono text-[10px] text-slate-400 font-bold">
                          {selectedItemCode}
                        </span>
                      )}
                    </div>

                    {parsedOrderCourses.length > 0 ? (
                      <div className="space-y-2">
                        {parsedOrderCourses.map((course, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 p-3 text-xs border border-slate-100 dark:border-slate-800 shadow-2xs"
                          >
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[190px]">
                                {course.course_name || course.name}
                              </p>
                              <p className="text-slate-400 font-mono text-[10px]">
                                Phân loại: {course.category}
                              </p>
                            </div>
                            <span className="rounded-lg bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 font-bold font-mono text-indigo-700 dark:text-indigo-300 text-xs">
                              {course.licenses || course.quantity} licenses
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : selectedCachedItem ? (
                      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1.5 text-xs">
                        <p className="font-bold text-slate-900 dark:text-white">
                          {selectedCachedItem.school_name || selectedItemCode}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Ghi chú: {selectedCachedItem.notes || 'Không có ghi chú thêm.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
                        <Info className="h-6 w-6 text-slate-300 mb-2" />
                        <span>Vui lòng click chọn 1 đơn hàng/hợp đồng từ danh sách trên để xem chi tiết.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WORKFLOW 2: TẠO & DUYỆT */}
          {workspaceMainCategory === 'create_and_approve' && (
            <div className="space-y-5 pt-2">
              <div className="space-y-1.5 relative" ref={entityDropdownRef}>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Trường học áp dụng (Trong 480 trường phả hệ):</span>
                  </span>
                  {selectedSchool && (
                    <span className="text-xs text-indigo-600 font-bold font-mono">
                      Mã: {selectedSchool.school_code}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={entitySearchQuery}
                    onFocus={() => setIsEntityDropdownOpen(true)}
                    onChange={(e) => {
                      setEntitySearchQuery(e.target.value);
                      setIsEntityDropdownOpen(true);
                    }}
                    placeholder="Tìm kiếm trường học theo tên hoặc mã trường..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
                  />
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                </div>

                {isEntityDropdownOpen && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1">
                    {schoolsList
                      .filter((s) => s.school_name.toLowerCase().includes(entitySearchQuery.toLowerCase()) || s.school_code.toLowerCase().includes(entitySearchQuery.toLowerCase()))
                      .slice(0, 30)
                      .map((s) => (
                        <button
                          key={s.school_code}
                          type="button"
                          onClick={() => {
                            setSelectedSchool(s);
                            setSelectedPartner({ name: s.partner_name, code: s.partner_code });
                            setSelectedDistributor({ name: s.distributor_name, code: s.distributor_code });
                            setEntitySearchQuery(s.school_name);
                            setIsEntityDropdownOpen(false);
                          }}
                          className="w-full text-left p-3 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition"
                        >
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{s.school_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              Mã: {s.school_code} | Tuyến: {s.partner_name} ➔ {s.distributor_name}
                            </div>
                          </div>
                          {selectedSchool?.school_code === s.school_code && (
                            <Check className="w-4 h-4 text-indigo-600" />
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { id: 'end_to_end', label: 'Trọn Gói Toàn Trình', desc: 'Trường ➔ Quản trị ➔ LMS' },
                  { id: 'partner_create_chain', label: 'Đối Tác Tạo & Duyệt', desc: 'Đối tác ➔ Quản trị' },
                  { id: 'distributor_create_chain', label: 'Nhà Phân Phối Tạo & Duyệt', desc: 'Nhà phân phối ➔ Quản trị' },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => setCreateApproveSubFlow(sub.id as any)}
                    className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${createApproveSubFlow === sub.id
                      ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50'
                      }`}
                  >
                    <p className={`text-xs font-bold ${createApproveSubFlow === sub.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}`}>
                      {sub.label}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{sub.desc}</p>
                  </button>
                ))}
              </div>

              {/* Course License List Builder */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <BookOpen className="h-4 w-4 text-indigo-600" />
                    <span>Danh Sách Khóa Học Cấp Phép ({selectedCourses.length} Môn):</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCourseRow}
                    className="flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Thêm Môn Học</span>
                  </button>
                </div>

                {selectedCourses.map((cRow, idx) => {
                  const filteredCourses = workspaceCoursesList.filter((c) => c.category === cRow.category);
                  return (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>Khóa học #{idx + 1}</span>
                        {selectedCourses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCourseRow(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500">Phân loại:</label>
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
                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                          >
                            {workspaceCategoriesList.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Chọn môn học ({filteredCourses.length} môn):</label>
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
                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white truncate"
                          >
                            {filteredCourses.map((c) => (
                              <option key={c.course_id} value={c.course_id}>
                                {c.course_name} (ID: {c.course_id})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500">Số lượng giấy phép:</label>
                          <input
                            type="number"
                            value={cRow.licenses}
                            min={1}
                            onChange={(e) => {
                              const updated = [...selectedCourses];
                              updated[idx].licenses = parseInt(e.target.value) || 1;
                              setSelectedCourses(updated);
                            }}
                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500">Ngày bắt đầu:</label>
                          <input
                            type="text"
                            value={cRow.start_date}
                            placeholder="dd-mm-yyyy"
                            onChange={(e) => {
                              const updated = [...selectedCourses];
                              updated[idx].start_date = e.target.value;
                              setSelectedCourses(updated);
                            }}
                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500">Ngày kết thúc:</label>
                          <input
                            type="text"
                            value={cRow.end_date}
                            placeholder="dd-mm-yyyy"
                            onChange={(e) => {
                              const updated = [...selectedCourses];
                              updated[idx].end_date = e.target.value;
                              setSelectedCourses(updated);
                            }}
                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* WORKFLOW 3: TẠO TÀI KHOẢN (ĐÃ TỐI ƯU CHỌN TRƯỜNG & VALIDATE CLIENT-SIDE) */}
          {workspaceMainCategory === 'bulk_accounts' && (
            <div className="space-y-5 pt-2">
              {/* 1. Ô CHỌN TRƯỜNG HỌC THỤ HƯỞNG (480 TRƯỜNG PHẢ HỆ) */}
              <div className="space-y-1.5 relative" ref={entityDropdownRef}>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    <span>Trường Học Thụ Hưởng Tài Khoản: <span className="text-rose-500">* (Bắt buộc)</span></span>
                  </span>
                  {selectedSchool && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold font-mono">
                      Mã Trường: {selectedSchool.school_code}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={entitySearchQuery}
                    onFocus={() => setIsEntityDropdownOpen(true)}
                    onChange={(e) => {
                      setEntitySearchQuery(e.target.value);
                      setIsEntityDropdownOpen(true);
                    }}
                    placeholder="Gõ tên trường hoặc mã trường để chọn (VD: Vinschool, FPT, Master...)"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden transition"
                  />
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                </div>

                {isEntityDropdownOpen && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1">
                    {schoolsList
                      .filter((s) => s.school_name.toLowerCase().includes(entitySearchQuery.toLowerCase()) || s.school_code.toLowerCase().includes(entitySearchQuery.toLowerCase()))
                      .slice(0, 30)
                      .map((s) => (
                        <button
                          key={s.school_code}
                          type="button"
                          onClick={() => {
                            setSelectedSchool(s);
                            setSelectedPartner({ name: s.partner_name, code: s.partner_code });
                            setSelectedDistributor({ name: s.distributor_name, code: s.distributor_code });
                            setEntitySearchQuery(s.school_name);
                            setIsEntityDropdownOpen(false);
                            toast.success(`Đã chọn trường: ${s.school_name}`);
                          }}
                          className="w-full text-left p-3 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition"
                        >
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{s.school_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              Mã: {s.school_code} | Tuyến: {s.partner_name} ➔ {s.distributor_name}
                            </div>
                          </div>
                          {selectedSchool?.school_code === s.school_code && (
                            <Check className="w-4 h-4 text-indigo-600" />
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* 2. KHU VỰC TẢI FILE EXCEL */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        Nộp File Excel Danh Sách Học Sinh / Giáo Viên
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Hỗ trợ file định dạng chuẩn 6-7 cột (.xlsx, .xls)
                      </p>
                    </div>
                  </div>

                  {uploadedAccountsFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedAccountsFile(null);
                        setParsedAccountRows([]);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa file</span>
                    </button>
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
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.[0]) {
                      const file = e.dataTransfer.files[0];
                      setUploadedAccountsFile(file);
                      processAndValidateAccountsFile(file);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${isDragging
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/80 hover:border-indigo-400'
                    }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 mb-2.5">
                    <Upload className="h-5 w-5" />
                  </div>

                  {uploadedAccountsFile ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {uploadedAccountsFile.name} ({Math.round(uploadedAccountsFile.size / 1024)} KB)
                      </p>
                      <p className="text-[11px] text-emerald-600 font-semibold flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đã phân tích xong nội dung file! Nhấp để đổi file khác</span>
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Bấm hoặc kéo thả file Excel (.xlsx) vào đây
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Chuẩn cột: First Name (*) | Last Name (*) | Mobile (Opt) | Email (*) | DOB (*) | Role (*)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. BẢNG THỐNG KÊ & PREVIEW NỘI DUNG EXCEL */}
              {parsedAccountRows.length > 0 && (
                <div className="space-y-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                  {/* Stats Cards mini */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Tổng Tài Khoản</p>
                      <p className="text-lg font-mono font-extrabold text-slate-900 dark:text-white">
                        {accountValidationStats.total}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        👨‍🎓 {accountValidationStats.students} HS | 🧑‍🏫 {accountValidationStats.teachers} GV
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Hợp Lệ</p>
                      <p className="text-lg font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                        {accountValidationStats.validCount}
                      </p>
                      <p className="text-[10px] text-emerald-600/80">Sẵn sàng tạo</p>
                    </div>

                    <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                      <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Thiếu Thông Tin</p>
                      <p className="text-lg font-mono font-extrabold text-rose-600 dark:text-rose-400">
                        {accountValidationStats.errorCount}
                      </p>
                      <p className="text-[10px] text-rose-500">Cần bổ sung</p>
                    </div>

                    <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                      <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Trùng Lặp Email</p>
                      <p className="text-lg font-mono font-extrabold text-amber-600 dark:text-amber-400">
                        {accountValidationStats.duplicateCount}
                      </p>
                      <p className="text-[10px] text-amber-600">Trong file</p>
                    </div>
                  </div>

                  {/* Bảng Preview cuộn */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span>XEM TRƯỚC DANH SÁCH TÀI KHOẢN ({parsedAccountRows.length} DÒNG):</span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        *Học sinh được phép bỏ trống email. Giáo viên bắt buộc có email.
                      </span>
                    </div>

                    <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 scrollbar-thin">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold uppercase text-slate-500 sticky top-0 z-10">
                          <tr>
                            <th className="p-2.5 text-center w-10">#</th>
                            <th className="p-2.5">Họ & Tên</th>
                            <th className="p-2.5">Email</th>
                            <th className="p-2.5">Ngày Sinh</th>
                            <th className="p-2.5">Vai Trò</th>
                            <th className="p-2.5">Trạng Thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                          {parsedAccountRows.map((row) => (
                            <tr
                              key={row.index}
                              className={`transition-colors ${!row.isValid
                                ? 'bg-rose-50/60 dark:bg-rose-950/20 hover:bg-rose-100/50'
                                : row.isDuplicateEmail
                                  ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/50'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                            >
                              <td className="p-2.5 text-center text-slate-400">{row.index}</td>
                              <td className="p-2.5 font-sans font-semibold text-slate-900 dark:text-white">
                                {row.lastName} {row.firstName}
                              </td>
                              <td className="p-2.5">
                                {row.email ? (
                                  <span className={row.isDuplicateEmail ? 'text-amber-600 font-bold' : 'text-slate-600 dark:text-slate-300'}>
                                    {row.email}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic font-sans text-[10px]">
                                    (Tự sinh email định danh)
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-600 dark:text-slate-300">{row.dob || '—'}</td>
                              <td className="p-2.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-sans ${row.isStudent
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                                    : 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'
                                    }`}
                                >
                                  {row.role}
                                </span>
                              </td>
                              <td className="p-2.5">
                                {row.isValid ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 font-bold font-sans text-[10px]">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Hợp lệ
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 text-rose-600 font-bold font-sans text-[10px]"
                                    title={row.errors.join(' | ')}
                                  >
                                    <AlertCircle className="w-3.5 h-3.5" /> {row.errors[0]}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              {/* 4. WIDGET TIẾN TRÌNH THỰC THI & ĐÓN FILE KẾT QUẢ TRỰC TIẾP TẠI CHỖ */}
              {liveExecutedTask && (
                <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 p-5 shadow-md space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Tiến Trình Tạo Tài Khoản Thời Gian Thực
                        </h4>
                        <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                          Mã Tác Vụ: #{liveExecutedTask.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {liveExecutedTask.status === 'success' || liveExecutedTask.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> HOÀN THÀNH XUẤT SẮC
                        </span>
                      ) : liveExecutedTask.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold">
                          <AlertCircle className="w-3.5 h-3.5" /> GẶP SỰ CỐ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-bold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {liveExecutedTask.status === 'waiting_poll'
                            ? `Đang chờ hệ thống trường (${liveExecutedTask.request_id ? `#REQ-${liveExecutedTask.request_id}` : 'Polling'})`
                            : 'Worker đang thực thi...'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Khi có file kết quả: Nút bấm to đùng hiện ra ngay tại đây! */}
                  {liveExecutedTask.resultUrl ? (
                    <div className="p-4 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                          <FileCheck2 className="w-4 h-4 text-emerald-600" />
                          <span>File kết quả tài khoản đã tạo xong thành công!</span>
                        </p>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80">
                          Bao gồm tài khoản, mật khẩu định danh và nhóm lớp đã được phân bổ.
                        </p>
                      </div>

                      <a
                        href={liveExecutedTask.resultUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm flex items-center justify-center gap-2 transition hover:scale-[1.02] cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>TẢI FILE KẾT QUẢ (.XLSX) VỀ MÁY</span>
                      </a>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-500 animate-pulse" />
                      <span>
                        Hệ thống đang tự động xử lý. File kết quả sẽ hiển thị ngay tại đây khi quá trình tạo hoàn tất!
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* WORKFLOW 4: GHI DANH LMS (HỖ TRỢ CẢ ENROL & UNENROL) */}
          {workspaceMainCategory === 'lms_enroll' && (
            <div className="space-y-5 pt-2">
              {/* Thanh Chuyển Đổi Chế Độ: Ghi Danh vs Hủy Ghi Danh */}
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80">
                <button
                  type="button"
                  onClick={() => setLmsActionType('enroll')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${lmsActionType === 'enroll'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>1. Ghi Danh & Gia Hạn Khóa Học</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLmsActionType('unenrol')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${lmsActionType === 'unenrol'
                    ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>2. Hủy Ghi Danh (Unenrol 🗑️)</span>
                </button>
              </div>

              <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border p-4 ${lmsActionType === 'enroll'
                ? 'border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20'
                : 'border-rose-200/70 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20'
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${lmsActionType === 'enroll'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                    }`}>
                    {lmsActionType === 'enroll' ? <GraduationCap className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        {lmsActionType === 'enroll'
                          ? 'Ghi Danh & Đổi Quyền Khóa Học PLearn LMS (Single Session)'
                          : 'Hủy Ghi Danh Học Viên Khỏi Khóa Học PLearn LMS'}
                      </h3>
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        learn.pythaverse.space
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {lmsActionType === 'enroll'
                        ? 'Thực hiện ghi danh đồng loạt nhiều khóa học trong cùng 1 lần đăng nhập.'
                        : 'Lọc tìm và gỡ bỏ hoàn toàn quyền truy cập của danh sách học viên khỏi các khóa học đã chọn.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddLmsCourseRow}
                  className={`flex items-center gap-1.5 rounded-xl border bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer self-start sm:self-auto ${lmsActionType === 'enroll'
                    ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50'
                    : 'border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50'
                    }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Thêm Khóa Học LMS</span>
                </button>
              </div>

              {/* Danh sách các khóa học LMS cần thực thi */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 px-1">
                  <span>DANH SÁCH KHÓA HỌC LMS ÁP DỤNG ({lmsSelectedCourses.length} KHÓA):</span>
                  <span className="text-[11px] text-slate-400 font-normal">Tất cả khóa sẽ được duyệt tuần tự trong 1 phiên Playwright</span>
                </div>

                {lmsSelectedCourses.map((lmsItem, idx) => {
                  const filteredCourses = lmsCoursesList.filter((c) => c.category === lmsItem.category);
                  return (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white font-mono ${lmsActionType === 'enroll' ? 'bg-emerald-600' : 'bg-rose-600'
                            }`}>
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                            {lmsItem.course_name}
                          </span>
                        </div>

                        {lmsSelectedCourses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLmsCourseRow(idx)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="Xóa khóa học này"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500">Phân loại:</label>
                          <select
                            value={lmsItem.category}
                            onChange={(e) => {
                              const cat = e.target.value;
                              const match = lmsCoursesList.filter((c) => c.category === cat);
                              const first = match[0] || lmsCoursesList[0];
                              const updated = [...lmsSelectedCourses];
                              updated[idx] = {
                                ...updated[idx],
                                category: cat,
                                course_id: first.course_id,
                                course_name: first.course_name,
                              };
                              setLmsSelectedCourses(updated);
                            }}
                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer"
                          >
                            {lmsCategoriesList.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-slate-500">
                            Chọn môn học ({filteredCourses.length} môn):
                          </label>
                          <select
                            value={lmsItem.course_id}
                            onChange={(e) => {
                              const cId = parseInt(e.target.value);
                              const target = lmsCoursesList.find((c) => c.course_id === cId);
                              if (target) {
                                const updated = [...lmsSelectedCourses];
                                updated[idx] = {
                                  ...updated[idx],
                                  course_id: target.course_id,
                                  course_name: target.course_name,
                                };
                                setLmsSelectedCourses(updated);
                              }
                            }}
                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white truncate cursor-pointer"
                          >
                            {filteredCourses.map((c) => (
                              <option key={c.course_id} value={c.course_id}>
                                {c.course_name} (ID: {c.course_id})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Các trường Ngày tháng & Group CHỈ HIỂN THỊ khi ở chế độ ENROL */}
                      {lmsActionType === 'enroll' && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-indigo-500" />
                              <span>Ngày bắt đầu:</span>
                            </label>
                            <input
                              type="text"
                              value={lmsItem.start_date}
                              placeholder="dd-mm-yyyy"
                              onChange={(e) => {
                                const updated = [...lmsSelectedCourses];
                                updated[idx].start_date = e.target.value;
                                setLmsSelectedCourses(updated);
                              }}
                              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-emerald-500" />
                              <span>Ngày hết hạn (Mặc định 1 năm):</span>
                            </label>
                            <input
                              type="text"
                              value={lmsItem.end_date}
                              placeholder="dd-mm-yyyy"
                              onChange={(e) => {
                                const updated = [...lmsSelectedCourses];
                                updated[idx].end_date = e.target.value;
                                setLmsSelectedCourses(updated);
                              }}
                              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                              <Users className="w-3 h-3 text-amber-500" />
                              <span>Tên Group (Tự động check tồn tại):</span>
                            </label>
                            <input
                              type="text"
                              value={lmsItem.group_name}
                              placeholder="VD: DEMO_TEACHER_2026"
                              onChange={(e) => {
                                const updated = [...lmsSelectedCourses];
                                updated[idx].group_name = e.target.value;
                                setLmsSelectedCourses(updated);
                              }}
                              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* NỘI DUNG NHẬP EMAIL: PHÂN BIỆT RÕ GIỮA ENROL VÀ UNENROL */}
              {lmsActionType === 'unenrol' ? (
                <div className="rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20 p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                    <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                      <Trash2 className="w-4 h-4" />
                      <span>DANH SÁCH EMAIL CẦN HỦY GHI DANH (MỖI DÒNG 1 EMAIL):</span>
                    </span>
                    <span className="font-mono text-rose-600 dark:text-rose-400">
                      {lmsUnenrolEmails.split(/[\n,;]+/).filter((x) => x.trim().length > 0).length} tài khoản
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={lmsUnenrolEmails}
                    onChange={(e) => setLmsUnenrolEmails(e.target.value)}
                    placeholder="student1@pythaverse.space&#10;teacher1@pythaverse.space"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 font-mono text-xs text-slate-900 dark:text-white focus:border-rose-500 focus:outline-hidden leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400">
                    💡 Bot sẽ sử dụng bộ lọc Keyword 2 nhịp để tìm chính xác học viên và xác nhận Unenrol trên từng khóa học được chọn.
                  </p>
                </div>
              ) : (
                /* Role Assignment Mode cũ của Ghi danh */
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <UserCheck className="h-4 w-4 text-indigo-600" />
                      <span>Phương Thức Gán Vai Trò:</span>
                    </div>

                    <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                      <button
                        type="button"
                        onClick={() => setLmsRoleMode('multi_role')}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${lmsRoleMode === 'multi_role'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                          }`}
                      >
                        Phân Chia 3 Vai Trò
                      </button>
                      <button
                        type="button"
                        onClick={() => setLmsRoleMode('same_role')}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${lmsRoleMode === 'same_role'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                          }`}
                      >
                        Cùng Một Vai Trò
                      </button>
                    </div>
                  </div>

                  {lmsRoleMode === 'multi_role' ? (
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                          <span>🎓 Học Viên (Student):</span>
                          <span className="font-mono text-indigo-600">
                            {lmsStudentEmails.split('\n').filter((x) => x.trim().length > 0).length}
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={lmsStudentEmails}
                          onChange={(e) => setLmsStudentEmails(e.target.value)}
                          placeholder="student1@pythaverse.space&#10;student2@pythaverse.space"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>

                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                          <span>🧑‍🏫 Giáo Viên (Non-editing Teacher):</span>
                          <span className="font-mono text-amber-600">
                            {lmsTeacherEmails.split('\n').filter((x) => x.trim().length > 0).length}
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={lmsTeacherEmails}
                          onChange={(e) => setLmsTeacherEmails(e.target.value)}
                          placeholder="teacher1@pythaverse.space&#10;teacher2@pythaverse.space"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>

                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                          <span>🛡️ Quản Lý (Manager):</span>
                          <span className="font-mono text-emerald-600">
                            {lmsManagerEmails.split('\n').filter((x) => x.trim().length > 0).length}
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={lmsManagerEmails}
                          onChange={(e) => setLmsManagerEmails(e.target.value)}
                          placeholder="manager1@pythaverse.space"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400">
                          Chọn vai trò áp dụng:
                        </label>
                        <select
                          value={lmsSingleRole}
                          onChange={(e) => setLmsSingleRole(e.target.value as any)}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white cursor-pointer"
                        >
                          <option value="student">🎓 Học Viên (Student)</option>
                          <option value="non_editing_teacher">🧑‍🏫 Giáo Viên (Non-editing Teacher)</option>
                          <option value="manager">🛡️ Quản Lý (Manager)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <span>DANH SÁCH EMAIL (MỖI DÒNG 1 EMAIL):</span>
                          <span className="font-mono text-[11px] text-indigo-600">
                            {lmsBulkSingleEmails.split('\n').filter((x) => x.trim().length > 0).length} emails
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={lmsBulkSingleEmails}
                          onChange={(e) => setLmsBulkSingleEmails(e.target.value)}
                          placeholder="user1@pythaverse.space&#10;user2@pythaverse.space"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Keycloak IDP Engine Workplace */}
      {selectedBotType === 'keycloak_api' && (
        <div className="space-y-5 rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Key className="h-4 w-4 text-amber-500" />
              <span>Quản Trị Danh Tính Keycloak:</span>
            </div>
            <span className="rounded-full bg-amber-100 dark:bg-amber-950/70 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              Bảo vệ 3 lớp
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Email hoặc Username Cần Xử Lý:
            </label>
            <textarea
              rows={3}
              value={kcTargetEmail}
              onChange={(e) => setKcTargetEmail(e.target.value)}
              placeholder="Nhập mỗi email/username trên 1 dòng hoặc cách nhau bằng dấu phẩy..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3 font-mono text-xs text-slate-900 dark:text-white focus:border-purple-500 focus:bg-white focus:outline-hidden leading-relaxed"
            />
          </div>

          <div className="space-y-3.5">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600">
                    <Key className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      1. Đặt Lại Mật Khẩu Tạm Thời
                    </h4>
                    <p className="text-[11px] text-slate-400">Gán mật khẩu khởi tạo an toàn</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setKcEnableResetPass(!kcEnableResetPass)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${kcEnableResetPass ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${kcEnableResetPass ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              {kcEnableResetPass && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Mật khẩu mới:</label>
                    <input
                      type="text"
                      value={kcTempPass}
                      onChange={(e) => setKcTempPass(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={kcForceChange}
                        onChange={(e) => setKcForceChange(e.target.checked)}
                        className="h-4 w-4 rounded-md border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span>Bắt buộc đổi khi đăng nhập</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      2. Xác Thực Email
                    </h4>
                    <p className="text-[11px] text-slate-400">Gỡ lỗi tài khoản chưa xác thực email</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setKcEnableVerify(!kcEnableVerify)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${kcEnableVerify ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${kcEnableVerify ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              {kcEnableVerify && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setKcVerifyAction('verify')}
                    className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcVerifyAction === 'verify'
                      ? 'border border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                  >
                    ✓ Đã Xác Thực
                  </button>
                  <button
                    type="button"
                    onClick={() => setKcVerifyAction('unverify')}
                    className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcVerifyAction === 'unverify'
                      ? 'border border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                  >
                    ✗ Gỡ Xác Thực
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-600">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      3. Trạng Thái Hoạt Động
                    </h4>
                    <p className="text-[11px] text-slate-400">Khóa hoặc kích hoạt lại người dùng</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setKcEnableStatus(!kcEnableStatus)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${kcEnableStatus ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${kcEnableStatus ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              {kcEnableStatus && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setKcStatusAction('enable')}
                    className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcStatusAction === 'enable'
                      ? 'border border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                  >
                    ✓ Kích Hoạt
                  </button>
                  <button
                    type="button"
                    onClick={() => setKcStatusAction('disable')}
                    className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcStatusAction === 'disable'
                      ? 'border border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'border border-slate-200 dark:border-slate-800 text-slate-500'
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

      {/* 🌟 6. CỖ MÁY MỚI: Pythaverse Git Collaborator Engine Workplace */}
      {selectedBotType === 'git_collaborator' && (
        <div className="space-y-5 rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <GitBranch className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span>Phân Quyền Kho Mã Nguồn Pythaverse Git (GitBucket):</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                git.pythaverse.space
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. KHU VỰC CHỌN REPO (URL INPUT + DROPDOWN TỰ ĐỘNG NẠP TỪ COURSES) */}
            <div className="space-y-1.5 relative" ref={gitRepoDropdownRef}>
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>Đường Dẫn Repository Mục Tiêu: <span className="text-rose-500">*</span></span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsGitRepoDropdownOpen(!isGitRepoDropdownOpen)}
                  className="text-xs text-violet-600 dark:text-violet-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>{isGitRepoDropdownOpen ? 'Đóng danh sách ✕' : `Chọn từ danh mục (${allAvailableGitRepos.length} repos) ▼`}</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={gitRepoUrl}
                  onChange={(e) => setGitRepoUrl(e.target.value)}
                  placeholder="https://git.pythaverse.space/..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* Bảng Danh Sách Repos Gợi Ý (Bento Popover) */}
              {isGitRepoDropdownOpen && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-80 overflow-hidden flex flex-col">
                  {/* Ô tìm kiếm riêng biệt bên trong Dropdown */}
                  <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        autoFocus
                        value={gitRepoSearchQuery}
                        onChange={(e) => setGitRepoSearchQuery(e.target.value)}
                        placeholder="Gõ tên môn, category (SWRP, ASP...) hoặc tên repo để lọc..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  {/* Danh sách cuộn */}
                  <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin max-h-60">
                    {filteredAvailableGitRepos.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        {allAvailableGitRepos.length === 0
                          ? 'Đang nạp dữ liệu khóa học hoặc chưa có khóa học nào được gắn Git Repo...'
                          : 'Không tìm thấy repo nào khớp với từ khóa tìm kiếm.'}
                      </div>
                    ) : (
                      filteredAvailableGitRepos.map((repo, idx) => {
                        const isSelected = gitRepoUrl === repo.repo_url;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setGitRepoUrl(repo.repo_url);
                              setIsGitRepoDropdownOpen(false);
                              setGitRepoSearchQuery('');
                              toast.success(`Đã chọn repo: ${repo.repo_name}`);
                            }}
                            className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${isSelected
                              ? 'bg-violet-50 dark:bg-violet-950/60 border border-violet-300 dark:border-violet-700'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-transparent'
                              }`}
                          >
                            <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 dark:text-white truncate">
                                  🐙 {repo.repo_name}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${repo.target === 'teacher_only'
                                    ? 'bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300'
                                    : 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300'
                                    }`}
                                >
                                  {repo.target === 'teacher_only' ? 'GV (Non-editing)' : 'Cả GV & HS'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                Môn: <strong className="text-slate-700 dark:text-slate-300">{repo.course_name}</strong> ({repo.category})
                              </p>
                            </div>

                            {isSelected && <Check className="w-4 h-4 text-violet-600 shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. CHỌN VAI TRÒ (ROLE) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Chọn Vai Trò (Role) Cần Gán:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'GUEST', label: 'Guest (Khách xem)', desc: 'Khuyên dùng cho học sinh & GV' },
                  { id: 'DEVELOPER', label: 'Developer (Lập trình)', desc: 'Có quyền push code lên repo' },
                  { id: 'ADMIN', label: 'Admin (Quản trị)', desc: 'Toàn quyền cấu hình repo' },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setGitTargetRole(r.id as any)}
                    className={`rounded-2xl border p-3 text-left transition-all cursor-pointer ${gitTargetRole === r.id
                      ? 'border-violet-600 bg-violet-50/80 dark:bg-violet-950/40 ring-1 ring-violet-500'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 hover:bg-slate-50'
                      }`}
                  >
                    <p className={`text-xs font-bold ${gitTargetRole === r.id ? 'text-violet-700 dark:text-violet-300' : 'text-slate-800 dark:text-slate-200'}`}>
                      {r.label}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. DANH SÁCH NGƯỜI DÙNG */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>DANH SÁCH USERNAME HOẶC EMAIL (MỖI DÒNG 1 TÀI KHOẢN):</span>
                <span className="font-mono text-[11px] text-violet-600">
                  {gitUsersList.split(/[\n,;]+/).filter((x) => x.trim().length > 0).length} tài khoản
                </span>
              </div>
              <textarea
                rows={4}
                value={gitUsersList}
                onChange={(e) => setGitUsersList(e.target.value)}
                placeholder="hsdttemd&#10;gvdttemd@pythaverse.net&#10;htdttemd"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 font-mono text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-hidden leading-relaxed"
              />
              <p className="text-[11px] text-slate-400">
                💡 Lưu ý: Hệ thống hỗ trợ nhập cả Username và Email. Nếu tài khoản chưa từng đăng nhập SSO vào Git (chưa kích hoạt JIT), bot sẽ tự ghi log cảnh báo bỏ qua mà không làm gián đoạn các tài khoản khác.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. Feedback Sheet Engine Workplace */}
      {selectedBotType === 'feedback_doc_triage' && (
        <div className="space-y-5 rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <FileText className="h-4 w-4 text-emerald-500" />
              <span>Đường Dẫn Google Doc Báo Cáo Sự Cố:</span>
            </div>

            <button
              type="button"
              onClick={handleAIGenerateDocComment}
              disabled={isGeneratingDocComment}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              <Sparkles className={`h-3.5 w-3.5 text-indigo-600 ${isGeneratingDocComment ? 'animate-spin' : ''}`} />
              <span>{isGeneratingDocComment ? 'AI đang đọc tài liệu...' : 'AI Đọc Doc & Soạn Ghi Chú Tag'}</span>
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <input
                type="text"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://docs.google.com/document/d/..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Nhân Sự Cần Giao Việc (@dtt.vn):
              </label>
              <input
                type="email"
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                placeholder="hung.nguyenmanh@dtt.vn"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Nội Dung Cần Gắn Bình Luận / Tag Vào Doc:
                </label>
                <span className="text-slate-400 text-[11px]">Tự động gắn vào trang đầu</span>
              </div>
              <textarea
                rows={4}
                value={feedbackCommentContent}
                onChange={(e) => setFeedbackCommentContent(e.target.value)}
                placeholder="Nhập nội dung comment..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {/* 8. Sticky 1-Click Execution Bar */}
      <div className="sticky bottom-4 z-20">
        <div className="rounded-3xl border border-indigo-400/40 dark:border-indigo-800 bg-white/90 dark:bg-slate-900/90 p-2 sm:p-2.5 shadow-xl backdrop-blur-md">
          <button
            id="btn-trigger-worker"
            type="button"
            disabled={submitting}
            onClick={handleOpenConfirmModal}
            className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-600 to-purple-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all duration-150 hover:brightness-105 active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            <Zap className="h-5 w-5 text-amber-300 group-hover:animate-bounce" />
            <span>Kiểm Tra & Kích Hoạt Worker Chạy Ngay (1-Click)</span>
          </button>
        </div>
      </div>

      {/* 9. Confirmation Modal SỬ DỤNG CREATEPORTAL */}
      {isConfirmModalOpen && preparedPayload && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setIsConfirmModalOpen(false); }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-full sm:max-w-2xl lg:max-w-3xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-5 my-auto"
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Xác Nhận Kích Hoạt Worker Tự Động
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Vui lòng kiểm tra lại thông số nghiệp vụ trước khi Worker can thiệp hệ thống.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  {preparedPayload.summary.engineName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
                  {preparedPayload.bot_type}
                </span>
              </div>

              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {preparedPayload.summary.actionTitle}
                </div>
                <div className="text-xs text-indigo-600 dark:text-indigo-400 font-bold font-mono mt-0.5">
                  👉 {preparedPayload.summary.targetEntity}
                </div>
              </div>

              {preparedPayload.summary.detailsList.length > 0 && (
                <div className="pt-2 border-t border-indigo-100/60 dark:border-indigo-900/40 space-y-1">
                  {preparedPayload.summary.detailsList.map((dt, idx) => (
                    <div key={idx} className="text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      <span>{dt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Tham Số Thực Thi (Payload JSON):</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Tự động đồng bộ</span>
              </div>
              <pre className="p-3.5 bg-slate-950 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto max-h-36 border border-slate-800 scrollbar-thin">
                {JSON.stringify(preparedPayload.payload_data, null, 2)}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Hủy Bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmExecute}
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang Khởi Chạy...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Xác Nhận & Chạy Ngay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
};