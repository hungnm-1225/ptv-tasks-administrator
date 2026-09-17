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
  Clock,
  XCircle,
  AtSign,
  UserCheck,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotType } from '../../types';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import {
  HierarchySchoolItem,
  CourseItem,
  OrderCourseSelection,
  LmsCourseSelectionItem,
  ScrapedPendingItem,
  PreparedTaskSummary,
  ClassGroupItem,
  TeacherAllocationItem,
  LicenseTrayItem,
  ParsedUserRow,
  AccountValidationStats,
  LiveExecutedTask,
  LoadedUserProfile,
  CofExtractionResult,
  PreparedPayload,
  AvailableGitRepo,
} from './types';
import { TaskConfirmationModal } from './components/modals/TaskConfirmationModal';
import { FeedbackTriageTab } from './components/tabs/FeedbackTriageTab';
import { GitCollaboratorTab } from './components/tabs/GitCollaboratorTab';
import { KeycloakEngineTab } from './components/tabs/KeycloakEngineTab';
import { ApprovalFlowSection } from './components/tabs/workspace/ApprovalFlowSection';
import { UpdateUserSection } from './components/tabs/workspace/UpdateUserSection';
import { BulkAccountsSection } from './components/tabs/workspace/BulkAccountsSection';
import { LmsEnrollSection } from './components/tabs/workspace/LmsEnrollSection';
import { CreateAndApproveSection } from './components/tabs/workspace/CreateAndApproveSection';
import {
  formatExcelDateClient,
  cleanSchoolText,
  cleanLmsText,
  extractGradeNumberClient,
  matchSchoolWithHierarchy,
  getFormattedDate,
} from './components/utils/studioFormatters';
import { buildPreparedTaskPayload } from './components/utils/payloadBuilder';
import { parseAccountsExcelFile, parseCofExcelFile } from './components/utils/excelParsers';
export const AutomationStudioPage: React.FC = () => {
  const navigate = useNavigate();

  // 4 Cỗ Máy Tự Động Hóa Chính
  const [selectedBotType, setSelectedBotType] = useState<
    'workspace_rpa' | 'keycloak_api' | 'git_collaborator' | 'feedback_doc_triage'
  >('workspace_rpa');

  // 4 Mục chính của Workspace RPA
  const [workspaceMainCategory, setWorkspaceMainCategory] = useState<
    'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll' | 'update_user'
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
  // 📑 State dành riêng cho nộp file COF trong phân luồng "Tạo & Duyệt"
  const [uploadedCofFile, setUploadedCofFile] = useState<File | null>(null);
  const [cofExtractionResult, setCofExtractionResult] = useState<{
    rawSchoolName: string;
    matchedSchool: HierarchySchoolItem | null;
    confidence: 'high' | 'medium' | 'none';
    score: number;
    coursesCount: number;
    studentsCount: number;
    teachersCount: number;
  } | null>(null);
  const cofFileInputRef = useRef<HTMLInputElement | null>(null);

  // 🔍 State tìm kiếm môn học linh hoạt xuyên Category
  const [courseSearchTerms, setCourseSearchTerms] = useState<Record<number, string>>({});
  const [activeCourseDropdownRow, setActiveCourseDropdownRow] = useState<number | null>(null);

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

  const [userSearchQuery, setUserSearchQuery] = useState<string>('hsdttemd@pythaverse.net');
  const [isSearchingUser, setIsSearchingUser] = useState<boolean>(false);
  const [loadedUserProfile, setLoadedUserProfile] = useState<{
    userId: string;
    userLogin: string;
    countryId: string;
    cityId: string;
    idUserMD: string;
    userRole: string;
  } | null>(null);

  // Form chỉnh sửa
  const [editFirstName, setEditFirstName] = useState<string>('');
  const [editLastName, setEditLastName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editDay, setEditDay] = useState<string>('1');
  const [editMonth, setEditMonth] = useState<string>('1');
  const [editYear, setEditYear] = useState<string>('2012');

  // 🎯 QUẢN LÝ TRƯỜNG
  const [editSchoolCode, setEditSchoolCode] = useState<string>('');
  const [editSchoolName, setEditSchoolName] = useState<string>('');
  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const [isSchoolComboboxOpen, setIsSchoolComboboxOpen] = useState<boolean>(false);
  const schoolComboboxRef = useRef<HTMLDivElement | null>(null);

  // 🎯 QUẢN LÝ ĐỐI TÁC: HIỂN THỊ CẢ TÊN + MÃ (VD: Partner DTTE test - Mã: 60)
  const [editPartnerCode, setEditPartnerCode] = useState<string>('');
  const [editPartnerName, setEditPartnerName] = useState<string>('');
  const [partnerSearchQuery, setPartnerSearchQuery] = useState<string>('');
  const [isPartnerComboboxOpen, setIsPartnerComboboxOpen] = useState<boolean>(false);
  const partnerComboboxRef = useRef<HTMLDivElement | null>(null)

  // Danh sách các Partner duy nhất trích xuất từ 480 trường
  const uniquePartnersList = useMemo(() => {
    const pMap = new Map<string, { code: string; name: string }>();
    schoolsList.forEach((s) => {
      if (s.partner_code && !pMap.has(s.partner_code)) {
        pMap.set(s.partner_code, {
          code: s.partner_code,
          name: s.partner_name || `Partner #${s.partner_code}`,
        });
      }
    });
    return Array.from(pMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [schoolsList]);

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



  const processAndValidateAccountsFile = async (file: File) => {
    try {
      const { rows, stats, isCOF } = await parseAccountsExcelFile(file);
      setParsedAccountRows(rows);
      setAccountValidationStats(stats);
      toast.success(
        `Đã nạp thành công ${rows.length} tài khoản (${isCOF ? 'File COF 3 Tabs' : 'File Danh sách'})!`
      );
    } catch (err) {
      toast.error('Lỗi khi đọc file Excel: ' + (err as Error).message);
    }
  };

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);
  nextYear.setDate(nextYear.getDate() - 1);

  const [selectedCourses, setSelectedCourses] = useState<OrderCourseSelection[]>([]);

  // =========================================================================
  // 🎯 CÁC STATE PHẢN XẠ & KÉO THẢ CỦA KHAY KHÓA HỌC (ĐÃ ĐẶT ĐÚNG VỊ TRÍ)
  // =========================================================================
  const [cofClassAssignments, setCofClassAssignments] = useState<Record<string, ClassGroupItem[]>>({});
  const [cofUnassignedClasses, setCofUnassignedClasses] = useState<ClassGroupItem[]>([]);
  const [cofTeachersAllocation, setCofTeachersAllocation] = useState<TeacherAllocationItem[]>([]);

  const [editingTeacherIndex, setEditingTeacherIndex] = useState<number | null>(null);
  const [draggedClassInfo, setDraggedClassInfo] = useState<{ sourceTrayId: string | null; classItem: ClassGroupItem } | null>(null);
  const [activeDropTrayId, setActiveDropTrayId] = useState<string | null>(null);
  const [isDropToUnassignedActive, setIsDropToUnassignedActive] = useState<boolean>(false);

  // 🎯 [TWO-WAY REACTIVE BINDING]: Tự động đồng bộ 100% theo selectedCourses bên dưới!
  const cofTrays = useMemo(() => {
    if (!uploadedCofFile && selectedCourses.length === 0) return [];

    return selectedCourses.map((c: OrderCourseSelection) => {
      const cidStr = String(c.course_id);
      const assigned = cofClassAssignments[cidStr] || [];
      const assignedCount = assigned.reduce((sum, item) => sum + item.studentsCount, 0);
      const swrpM = c.course_name.match(/SWRP\s*(\d+)/i);
      const targetGrade = swrpM ? parseInt(swrpM[1], 10) : null;

      return {
        courseId: cidStr,
        courseName: c.course_name,
        category: c.category,
        targetGrade,
        quota: c.licenses || 0, // 👈 Bắt chuẩn 4360 khi anh sửa ở dưới!
        assignedStudentsCount: assignedCount,
        assignedClasses: assigned,
        startDate: c.start_date,
        endDate: c.end_date,
      };
    });
  }, [selectedCourses, cofClassAssignments, uploadedCofFile]);

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
  // 🔑 [PATCH] CÁC STATE MỚI CHO KEYCLOAK PASSWORD OPTION & BULK LOOKUP
  const [kcActiveMode, setKcActiveMode] = useState<'manage' | 'lookup'>('manage');
  const [kcPasswordOption, setKcPasswordOption] = useState<'email_lowercase' | 'custom' | 'default_secure'>('email_lowercase');
  const [kcLookupResults, setKcLookupResults] = useState<any[]>([]);
  const [isKcLookingUp, setIsKcLookingUp] = useState<boolean>(false);

  // 🐙 Pythaverse Git Controls (Hỗ trợ Multi-Repos)
  const [gitSelectedRepos, setGitSelectedRepos] = useState<string[]>([
    'https://git.pythaverse.space/ptvswrp/SWRP11_Teacher',
  ]);
  const [customRepoInput, setCustomRepoInput] = useState<string>('');
  const [gitTargetRole, setGitTargetRole] = useState<'GUEST' | 'DEVELOPER' | 'ADMIN'>('GUEST');
  const [gitUsersList, setGitUsersList] = useState<string>('hsdttemd\ngvdttemd');

  // 🎓 LMS Auto-Sync Git Controls
  const [lmsAutoSyncGit, setLmsAutoSyncGit] = useState<boolean>(true);
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
      if (gitRepoDropdownRef.current && !gitRepoDropdownRef.current.contains(event.target as Node)) {
        setIsGitRepoDropdownOpen(false);
      }
      if (schoolComboboxRef.current && !schoolComboboxRef.current.contains(event.target as Node)) {
        setIsSchoolComboboxOpen(false);
      }
      if (partnerComboboxRef.current && !partnerComboboxRef.current.contains(event.target as Node)) {
        setIsPartnerComboboxOpen(false);
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

  // =========================================================================
  // 🧠 [PATCH 2] THUẬT TOÁN BÓC TÁCH COF THÔNG MINH & TỰ ĐỘNG XẾP KHAY
  // =========================================================================
  const processAndAutoFillCOF = async (file: File) => {
    setUploadedCofFile(file);
    try {
      const result = await parseCofExcelFile(file, {
        schoolsList,
        workspaceCoursesList,
      });

      setCofClassAssignments(result.classAssignments);
      setCofUnassignedClasses(result.unassignedClasses);
      setCofTeachersAllocation(result.teachersAllocation);

      if (result.parsedCoursesForForm.length > 0) {
        setSelectedCourses(result.parsedCoursesForForm);
      }

      if (result.matchedSchool) {
        setSelectedSchool(result.matchedSchool);
        setSelectedPartner(result.matchedPartner);
        setSelectedDistributor(result.matchedDistributor);
        setEntitySearchQuery(result.matchedSchool.school_name);
      } else {
        setEntitySearchQuery(result.extractedSchoolName);
      }

      setCofExtractionResult(result.extractionResult);
      toast.success(
        `✨ Đã phân tích xong COF: ${result.coursesCount} Khay khóa học, ${result.totalStudents} Học sinh, ${result.totalTeachers} Giáo viên!`
      );
    } catch (err) {
      toast.error('Lỗi khi đọc file COF: ' + (err as Error).message);
    }
  };

  const handleAddCourseRow = () => {
    if (selectedCourses.length > 0) {
      // 🎯 Copy trọn vẹn Category, ID, Tên, Licenses, Ngày bắt đầu/kết thúc của môn cuối cùng
      const last = selectedCourses[selectedCourses.length - 1];
      setSelectedCourses([
        ...selectedCourses,
        {
          category: last.category,
          course_id: last.course_id,
          course_name: last.course_name,
          lms_url: last.lms_url,
          licenses: last.licenses,
          start_date: last.start_date,
          end_date: last.end_date,
        },
      ]);
      toast.info(`Đã nhân bản thông số từ Khóa học #${selectedCourses.length} (${last.category} - ${last.licenses} licenses)`);
      return;
    }

    // Lần đầu tiên nếu mảng trống: Sinh môn mặc định
    const defaultCourse =
      workspaceCoursesList.find((c) => c.category === 'SWRP') ||
      workspaceCoursesList[0] || {
        course_id: 654,
        category: 'SWRP',
        course_name: 'Plearn LMS',
        lms_url: 'https://learn.pythaverse.space/course/view.php?id=1',
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

  // 🔍 [PATCH] HÀM TRA CỨU DANH TÍNH KEYCLOAK (BULK USER LOOKUP)
  const handleKeycloakLookup = async () => {
    const rawEmails = kcTargetEmail
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (rawEmails.length === 0) {
      toast.error('Vui lòng nhập ít nhất 1 email hoặc username vào ô trên để tra cứu!');
      return;
    }

    setIsKcLookingUp(true);
    setKcLookupResults([]);

    try {
      const res = await fetchApi<{ users: any[] }>('/workspace/keycloak-lookup', {
        method: 'POST',
        body: JSON.stringify({ identifiers: rawEmails })
      });

      if (res?.users) {
        setKcLookupResults(res.users);
        const foundCount = res.users.filter((u: any) => u.exists).length;
        toast.success(`Đã tra cứu xong: ${foundCount}/${res.users.length} tài khoản tồn tại trên Keycloak!`);
      } else {
        toast.info('Không nhận được phản hồi từ máy chủ Keycloak.');
      }
    } catch (err) {
      toast.error('Lỗi khi tra cứu Keycloak: ' + (err as Error).message);
    } finally {
      setIsKcLookingUp(false);
    }
  };

  const handleRemoveLmsCourseRow = (index: number) => {
    if (lmsSelectedCourses.length <= 1) {
      toast.error('Cần ít nhất 1 khóa học để thực hiện ghi danh!');
      return;
    }
    setLmsSelectedCourses(lmsSelectedCourses.filter((_, idx) => idx !== index));
  };

  // 🔍 [CẬP NHẬT THÊM] HÀM DÒ TÌM HỒ SƠ TỪ ADMIN WORKSPACE (30s do WordPress)
  const handleSearchUserProfile = async () => {
    const cleanIdentifier = userSearchQuery.trim();
    if (!cleanIdentifier) {
      toast.error('Vui lòng nhập Email hoặc Username người dùng cần tìm!');
      return;
    }

    setIsSearchingUser(true);
    toast.info(`Đang dò tìm người dùng: ${cleanIdentifier} (có thể mất 15-30s)...`);

    try {
      const res = await fetchApi<any>('/workspace/users/search-and-detail', {
        method: 'POST',
        body: JSON.stringify({ identifier: cleanIdentifier }),
        timeoutMs: 90000, // 90s chống timeout
      });

      if (!res?.success || !res?.detail) {
        toast.error(res?.message || 'Không tìm thấy người dùng này trên hệ thống Workspace!');
        return;
      }

      const d = res.detail;
      const s = res.summary || {};

      setEditFirstName(d.firstName || '');
      setEditLastName(d.lastname || '');
      setEditEmail(d.inputEmailTeacherEdit || s.user_email || cleanIdentifier);
      setEditDay(String(d.day || '1'));
      setEditMonth(String(d.month || '1'));
      setEditYear(String(d.year || '2012'));

      // 🎯 PHÂN GIẢI CHÍNH XÁC THEO MÃ SỐ THẬT (10652) - KHÔNG DÙNG UUID!
      const rawSchoolId = String(d.school_id || '').trim();
      const rawPartnerId = String(d.partner_id || '').trim();

      // Tìm trường trong 480 trường khớp mã code hoặc tên
      const matched = schoolsList.find(
        (sch) =>
          sch.school_code === rawSchoolId ||
          sch.school_code.replace(/\D/g, '') === rawSchoolId.replace(/\D/g, '') ||
          sch.school_name.toLowerCase().includes((d.school_name || '').toLowerCase())
      );

      const finalSchoolCode = matched ? matched.school_code : rawSchoolId;
      const finalSchoolName = matched ? matched.school_name : (d.school_name || `Trường #${rawSchoolId}`);
      const finalPartnerCode = matched ? matched.partner_code : rawPartnerId;
      const finalPartnerName = matched ? matched.partner_name : `Partner #${rawPartnerId}`;

      setEditSchoolCode(finalSchoolCode);
      setEditSchoolName(finalSchoolName);
      setSchoolSearchQuery(finalSchoolName);

      setEditPartnerCode(finalPartnerCode);
      setEditPartnerName(finalPartnerName);
      setPartnerSearchQuery(finalPartnerName);

      setLoadedUserProfile({
        userId: res.user_id,
        userLogin: res.user_login || s.user_login || '',
        countryId: String(d.country_id || '3'),
        cityId: String(d.cityTeacherCompare || '2852'),
        idUserMD: String(d.idUserMD || ''),
        userRole: d.user_role || s.user_role || 'student',
      });

      toast.success(`🎉 Đã nạp hồ sơ: ${d.firstName} ${d.lastname} (#${res.user_id})!`);
    } catch (err) {
      toast.error('Lỗi khi dò tìm thông tin: ' + (err as Error).message);
    } finally {
      setIsSearchingUser(false);
    }
  };

  const handleOpenConfirmModal = () => {
    const result = buildPreparedTaskPayload({
      selectedBotType,
      workspaceMainCategory,
      approveSubFlow,
      createApproveSubFlow,
      contactInfo,
      additionalNotes,
      selectedItemCode,
      selectedCachedItem,
      parsedOrderCourses,
      adminJustification,
      selectedSchool,
      selectedPartner,
      selectedDistributor,
      selectedCourses,
      cofClassAssignments,
      cofTeachersAllocation,
      uploadedAccountsFile,
      accountValidationStats,
      parsedAccountRows,
      lmsSelectedCourses,
      lmsCoursesList,
      workspaceCoursesList,
      lmsActionType,
      lmsUnenrolEmails,
      lmsRoleMode,
      lmsSingleRole,
      lmsBulkSingleEmails,
      lmsStudentEmails,
      lmsTeacherEmails,
      lmsManagerEmails,
      lmsAutoSyncGit,
      loadedUserProfile,
      editFirstName,
      editLastName,
      editEmail,
      editDay,
      editMonth,
      editYear,
      editSchoolCode,
      editSchoolName,
      editPartnerCode,
      editPartnerName,
      gitSelectedRepos,
      gitUsersList,
      gitTargetRole,
      kcTargetEmail,
      kcEnableResetPass,
      kcPasswordOption,
      kcTempPass,
      kcForceChange,
      kcEnableVerify,
      kcVerifyAction,
      kcEnableStatus,
      kcStatusAction,
      docUrl,
      assigneeEmail,
      feedbackCommentContent,
    });

    if (result) {
      setPreparedPayload(result);
      setIsConfirmModalOpen(true);
    }
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 ">
              {[
                { id: 'approve', label: '1. Phê Duyệt', icon: ClipboardCheck },
                { id: 'create_and_approve', label: '2. Tạo & Duyệt', icon: Zap },
                { id: 'bulk_accounts', label: '3. Tạo Tài Khoản', icon: Users },
                { id: 'lms_enroll', label: '4. Ghi Danh LMS', icon: GraduationCap },
                { id: 'update_user', label: '5. Cập Nhật User', icon: UserCheck },
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
            <ApprovalFlowSection
              approveSubFlow={approveSubFlow}
              setApproveSubFlow={setApproveSubFlow}
              universalSearchQuery={universalSearchQuery}
              setUniversalSearchQuery={setUniversalSearchQuery}
              selectedItemCode={selectedItemCode}
              setSelectedItemCode={setSelectedItemCode}
              selectedCachedItem={selectedCachedItem}
              setSelectedCachedItem={setSelectedCachedItem}
              parsedOrderCourses={parsedOrderCourses}
              setParsedOrderCourses={setParsedOrderCourses}
              adminJustification={adminJustification}
              setAdminJustification={setAdminJustification}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              scrapedPendingList={scrapedPendingList}
              filteredCacheList={filteredCacheList}
              isScrapingLive={isScrapingLive}
              onLoadOrderDetails={handleLoadOrderDetails}
            />
          )}

          {/* WORKFLOW 2: TẠO & DUYỆT */}

          {workspaceMainCategory === 'create_and_approve' && (
            <CreateAndApproveSection
              uploadedCofFile={uploadedCofFile}
              setUploadedCofFile={setUploadedCofFile}
              cofExtractionResult={cofExtractionResult}
              setCofExtractionResult={setCofExtractionResult}
              onProcessCofFile={processAndAutoFillCOF}
              cofTrays={cofTrays}
              cofClassAssignments={cofClassAssignments}
              setCofClassAssignments={setCofClassAssignments}
              cofUnassignedClasses={cofUnassignedClasses}
              setCofUnassignedClasses={setCofUnassignedClasses}
              cofTeachersAllocation={cofTeachersAllocation}
              setCofTeachersAllocation={setCofTeachersAllocation}
              editingTeacherIndex={editingTeacherIndex}
              setEditingTeacherIndex={setEditingTeacherIndex}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              setSelectedPartner={setSelectedPartner}
              setSelectedDistributor={setSelectedDistributor}
              schoolsList={schoolsList}
              createApproveSubFlow={createApproveSubFlow}
              setCreateApproveSubFlow={setCreateApproveSubFlow}
              selectedCourses={selectedCourses}
              setSelectedCourses={setSelectedCourses}
              workspaceCoursesList={workspaceCoursesList}
              workspaceCategoriesList={workspaceCategoriesList}
              onAddCourseRow={handleAddCourseRow}
              onRemoveCourseRow={handleRemoveCourseRow}
            />
          )}

          {/* WORKFLOW 3: TẠO TÀI KHOẢN (ĐÃ TỐI ƯU CHỌN TRƯỜNG & VALIDATE CLIENT-SIDE) */}
          {workspaceMainCategory === 'bulk_accounts' && (
            <BulkAccountsSection
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              setSelectedPartner={setSelectedPartner}
              setSelectedDistributor={setSelectedDistributor}
              schoolsList={schoolsList}
              uploadedAccountsFile={uploadedAccountsFile}
              setUploadedAccountsFile={setUploadedAccountsFile}
              parsedAccountRows={parsedAccountRows}
              setParsedAccountRows={setParsedAccountRows}
              accountValidationStats={accountValidationStats}
              onProcessAccountsFile={processAndValidateAccountsFile}
              liveExecutedTask={liveExecutedTask}
            />
          )}

          {/* WORKFLOW 4: GHI DANH LMS (HỖ TRỢ CẢ ENROL & UNENROL) */}
          {workspaceMainCategory === 'lms_enroll' && (
            <LmsEnrollSection
              lmsActionType={lmsActionType}
              setLmsActionType={setLmsActionType}
              lmsSelectedCourses={lmsSelectedCourses}
              setLmsSelectedCourses={setLmsSelectedCourses}
              lmsCoursesList={lmsCoursesList}
              lmsCategoriesList={lmsCategoriesList}
              onAddLmsCourseRow={handleAddLmsCourseRow}
              onRemoveLmsCourseRow={handleRemoveLmsCourseRow}
              lmsAutoSyncGit={lmsAutoSyncGit}
              setLmsAutoSyncGit={setLmsAutoSyncGit}
              lmsUnenrolEmails={lmsUnenrolEmails}
              setLmsUnenrolEmails={setLmsUnenrolEmails}
              lmsRoleMode={lmsRoleMode}
              setLmsRoleMode={setLmsRoleMode}
              lmsSingleRole={lmsSingleRole}
              setLmsSingleRole={setLmsSingleRole}
              lmsBulkSingleEmails={lmsBulkSingleEmails}
              setLmsBulkSingleEmails={setLmsBulkSingleEmails}
              lmsStudentEmails={lmsStudentEmails}
              setLmsStudentEmails={setLmsStudentEmails}
              lmsTeacherEmails={lmsTeacherEmails}
              setLmsTeacherEmails={setLmsTeacherEmails}
              lmsManagerEmails={lmsManagerEmails}
              setLmsManagerEmails={setLmsManagerEmails}
            />
          )}
          {/* ========================================================================= */}
          {/* WORKFLOW 5: CẬP NHẬT HỒ SƠ NGƯỜI DÙNG (SMART SCHOOL-PARTNER COMBOBOX) */}
          {/* ========================================================================= */}
          {workspaceMainCategory === 'update_user' && (
            <UpdateUserSection
              userSearchQuery={userSearchQuery}
              setUserSearchQuery={setUserSearchQuery}
              isSearchingUser={isSearchingUser}
              onSearchUserProfile={handleSearchUserProfile}
              loadedUserProfile={loadedUserProfile}
              editFirstName={editFirstName}
              setEditFirstName={setEditFirstName}
              editLastName={editLastName}
              setEditLastName={setEditLastName}
              editEmail={editEmail}
              setEditEmail={setEditEmail}
              editDay={editDay}
              setEditDay={setEditDay}
              editMonth={editMonth}
              setEditMonth={setEditMonth}
              editYear={editYear}
              setEditYear={setEditYear}
              editSchoolCode={editSchoolCode}
              setEditSchoolCode={setEditSchoolCode}
              editSchoolName={editSchoolName}
              setEditSchoolName={setEditSchoolName}
              schoolSearchQuery={schoolSearchQuery}
              setSchoolSearchQuery={setSchoolSearchQuery}
              editPartnerCode={editPartnerCode}
              setEditPartnerCode={setEditPartnerCode}
              editPartnerName={editPartnerName}
              setEditPartnerName={setEditPartnerName}
              partnerSearchQuery={partnerSearchQuery}
              setPartnerSearchQuery={setPartnerSearchQuery}
              schoolsList={schoolsList}
              uniquePartnersList={uniquePartnersList}
            />
          )}
        </div>
      )}

      {/* 5. 🔑 KEYCLOAK IDP ENGINE WORKPLACE (BẢN PATCH ĐẦY ĐỦ TÙY CHỌN PASS & BULK LOOKUP) */}
      {selectedBotType === 'keycloak_api' && (
        <KeycloakEngineTab
          kcActiveMode={kcActiveMode}
          setKcActiveMode={setKcActiveMode}
          kcTargetEmail={kcTargetEmail}
          setKcTargetEmail={setKcTargetEmail}
          kcEnableResetPass={kcEnableResetPass}
          setKcEnableResetPass={setKcEnableResetPass}
          kcPasswordOption={kcPasswordOption}
          setKcPasswordOption={setKcPasswordOption}
          kcTempPass={kcTempPass}
          setKcTempPass={setKcTempPass}
          kcForceChange={kcForceChange}
          setKcForceChange={setKcForceChange}
          kcEnableVerify={kcEnableVerify}
          setKcEnableVerify={setKcEnableVerify}
          kcVerifyAction={kcVerifyAction}
          setKcVerifyAction={setKcVerifyAction}
          kcEnableStatus={kcEnableStatus}
          setKcEnableStatus={setKcEnableStatus}
          kcStatusAction={kcStatusAction}
          setKcStatusAction={setKcStatusAction}
          kcLookupResults={kcLookupResults}
          isKcLookingUp={isKcLookingUp}
          onKeycloakLookup={handleKeycloakLookup}
        />
      )}

      {/* 🌟 6. Pythaverse Git Collaborator Engine Workplace (HỖ TRỢ MULTI-REPOS) */}
      {selectedBotType === 'git_collaborator' && (
        <GitCollaboratorTab
          gitSelectedRepos={gitSelectedRepos}
          setGitSelectedRepos={setGitSelectedRepos}
          customRepoInput={customRepoInput}
          setCustomRepoInput={setCustomRepoInput}
          gitTargetRole={gitTargetRole}
          setGitTargetRole={setGitTargetRole}
          gitUsersList={gitUsersList}
          setGitUsersList={setGitUsersList}
          allAvailableGitRepos={allAvailableGitRepos}
        />
      )}

      {/* 7. Feedback Sheet Engine Workplace */}
      {selectedBotType === 'feedback_doc_triage' && (
        <FeedbackTriageTab
          docUrl={docUrl}
          setDocUrl={setDocUrl}
          assigneeEmail={assigneeEmail}
          setAssigneeEmail={setAssigneeEmail}
          feedbackCommentContent={feedbackCommentContent}
          setFeedbackCommentContent={setFeedbackCommentContent}
          isGeneratingDocComment={isGeneratingDocComment}
          onAIGenerateDocComment={handleAIGenerateDocComment}
        />
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
      <TaskConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmExecute}
        submitting={submitting}
        preparedPayload={preparedPayload}
      />
    </motion.div>
  );
};