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
  Clock,
  XCircle,
  AtSign,
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

interface ClassGroupItem {
  rawClassName: string;
  lmsGroupName: string;
  studentsCount: number;
  gradeDetected: number | null;
}

interface TeacherAllocationItem {
  teacherName: string;
  email: string;
  courseAssign: string;
  assignedLmsGroups: string[];
}

interface LicenseTrayItem {
  courseId: string;
  courseName: string;
  category: string;
  targetGrade: number | null;
  quota: number;              // Hạn ngạch giấy phép mua (Cột Q)
  assignedStudentsCount: number;
  assignedClasses: ClassGroupItem[];
  startDate: string;
  endDate: string;
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
  const cleanSchoolText = (str: string): string => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(school|international|sdn|bhd|smk|sma|academy|trường|tieu hoc|thcs|thpt)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const matchSchoolWithHierarchy = (
    rawCofName: string,
    hierarchyList: HierarchySchoolItem[]
  ): {
    matched: HierarchySchoolItem | null;
    confidence: 'high' | 'medium' | 'none';
    score: number;
    cleanedName: string;
  } => {
    if (!rawCofName || hierarchyList.length === 0) {
      return { matched: null, confidence: 'none', score: 0, cleanedName: '' };
    }

    const cleanInput = cleanSchoolText(rawCofName);
    if (!cleanInput) {
      return { matched: null, confidence: 'none', score: 0, cleanedName: '' };
    }

    const inputWords = new Set(cleanInput.split(' ').filter(w => w.length > 1));
    let bestMatch: HierarchySchoolItem | null = null;
    let bestScore = 0;

    for (const s of hierarchyList) {
      const cleanTarget = cleanSchoolText(s.school_name);

      // 1. Khớp tuyệt đối sau khi lọc từ thừa
      if (cleanInput === cleanTarget) {
        return { matched: s, confidence: 'high', score: 1.0, cleanedName: cleanInput };
      }

      // 2. Chứa nhau toàn phần
      if (cleanTarget.includes(cleanInput) || cleanInput.includes(cleanTarget)) {
        const score = Math.min(cleanInput.length, cleanTarget.length) / Math.max(cleanInput.length, cleanTarget.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = s;
        }
      }

      // 3. Jaccard Index theo từ vựng
      const targetWords = new Set(cleanTarget.split(' ').filter(w => w.length > 1));
      let intersection = 0;
      inputWords.forEach(w => { if (targetWords.has(w)) intersection++; });
      const union = new Set([...inputWords, ...targetWords]).size;
      const jaccard = union > 0 ? intersection / union : 0;

      if (jaccard > bestScore) {
        bestScore = jaccard;
        bestMatch = s;
      }
    }

    if (bestScore >= 0.70 && bestMatch) {
      return { matched: bestMatch, confidence: 'high', score: bestScore, cleanedName: cleanInput };
    } else if (bestScore >= 0.35 && bestMatch) {
      return { matched: bestMatch, confidence: 'medium', score: bestScore, cleanedName: cleanInput };
    }

    return { matched: null, confidence: 'none', score: bestScore, cleanedName: cleanInput };
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

  // =========================================================================
  // 🧠 [PATCH 2] THUẬT TOÁN BÓC TÁCH COF THÔNG MINH & TỰ ĐỘNG XẾP KHAY
  // =========================================================================
  const cleanLmsText = (text: string): string => {
    if (!text) return '';
    return text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const extractGradeNumberClient = (text: string): number | null => {
    if (!text) return null;
    // Nhận diện các phân ban Lớp 11 & 12 Philippines (STEM, ABM, HUMSS, TVL, GAS)
    const shsMatch = text.match(/(?:stem|abm|humss|humms|tvl|gas|shs)\s*(\d{1,2})/i);
    if (shsMatch) return parseInt(shsMatch[1], 10);

    // Nhận diện Gr, Grade, Year, Khối, Lớp
    const grMatch = text.match(/(?:gr|grade|year|khối|lớp)\s*(\d{1,2})/i);
    if (grMatch) return parseInt(grMatch[1], 10);

    // Fallback số độc lập
    const numMatch = text.match(/\b(\d{1,2})\b/);
    if (numMatch) return parseInt(numMatch[1], 10);
    return null;
  };

  const processAndAutoFillCOF = (file: File) => {
    setUploadedCofFile(file);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetNames = workbook.SheetNames;

        // 1. ĐỌC TAB 1: CURRICULUM ORDER FORM
        const cofSheetName = sheetNames.find(s => s.toLowerCase().includes('cof') || s.toLowerCase().includes('curriculum')) || sheetNames[0];
        const ws1 = workbook.Sheets[cofSheetName];
        const rawJson1: any[][] = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });

        let extractedSchoolName = '';
        if (rawJson1.length > 6) {
          extractedSchoolName = String(rawJson1[5]?.[2] || '').trim(); // Cột C hàng 6
        }

        const dateSuffix = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }).replace(' ', ''); // Ví dụ: 2026Sep
        const cleanSchool = cleanLmsText(extractedSchoolName) || 'School';

        const traysMap: Record<string, LicenseTrayItem> = {};
        const parsedCoursesForForm: OrderCourseSelection[] = [];

        // Quét bảng môn học từ hàng 28
        for (let r = 27; r < rawJson1.length; r++) {
          const row = rawJson1[r];
          const courseIdRaw = row[7]; // Cột H (Course ID)
          if (!courseIdRaw) continue;

          const courseIdStr = String(courseIdRaw).replace(/\.0$/, '').trim();
          const courseNameColG = String(row[6] || '').trim(); // Cột G (Tên môn thật)
          const courseLink = String(row[2] || '').trim();

          const startDate = formatExcelDateClient(row[8]);  // Cột I
          const endDate = formatExcelDateClient(row[11]);   // Cột L
          const qtyRaw = parseInt(String(row[16] || '0').trim(), 10); // Cột Q (Số lượng thật!)
          const licenses = !isNaN(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0;

          // Lọc cốt tử: ít nhất 1 trong 3 thông tin phải có
          if (!startDate && !endDate && licenses === 0) continue;

          // Tìm thông tin môn trong DB nếu có
          const dbCourse = workspaceCoursesList.find(c => String(c.course_id) === courseIdStr);
          const finalCourseName = courseNameColG || dbCourse?.course_name || `Course #${courseIdStr}`;
          const finalCategory = dbCourse?.category || (finalCourseName.includes('ASP') ? 'ASP' : (finalCourseName.includes('IR') ? 'IR' : 'SWRP'));

          // Nhận diện khối lớp mục tiêu từ tên môn (SWRP 7 -> 7, SWRP 11 -> 11)
          const swrpMatch = finalCourseName.match(/SWRP\s*(\d+)/i);
          const targetGrade = swrpMatch ? parseInt(swrpMatch[1], 10) : null;

          const trayItem: LicenseTrayItem = {
            courseId: courseIdStr,
            courseName: finalCourseName,
            category: finalCategory,
            targetGrade,
            quota: licenses,
            assignedStudentsCount: 0,
            assignedClasses: [],
            startDate: startDate || getFormattedDate(today),
            endDate: endDate || getFormattedDate(nextYear),
          };

          traysMap[courseIdStr] = trayItem;

          parsedCoursesForForm.push({
            category: finalCategory,
            course_id: parseInt(courseIdStr, 10) || 1,
            course_name: finalCourseName,
            lms_url: dbCourse?.lms_url || courseLink || '',
            licenses: licenses,
            start_date: trayItem.startDate,
            end_date: trayItem.endDate,
          });
        }

        // 2. ĐỌC TAB 2: STUDENT INFORMATION & GOM LỚP (ĐÃ FIX LỖI Ô DẤU CÁCH)
        const studentSheetName = sheetNames.find(s => s.toLowerCase().includes('student'));
        const classesMap: Record<string, { count: number; grade: number | null }> = {};
        let totalStudents = 0;

        if (studentSheetName) {
          const ws2 = workbook.Sheets[studentSheetName];
          const rawJson2: any[][] = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });

          for (let r = 6; r < rawJson2.length; r++) {
            const row = rawJson2[r];
            const fn = String(row[2] || '').trim();
            const ln = String(row[3] || '').trim();
            const email = String(row[5] || '').trim();

            // Bỏ qua dòng trống hoàn toàn hoặc dòng tổng kết Total
            if (!fn && !ln && !email) continue;
            if (fn.toLowerCase().includes('total') || ln.toLowerCase().includes('total')) continue;

            totalStudents++;

            const c10 = String(row[10] || '').trim();
            const c9 = String(row[9] || '').trim();
            const c8 = String(row[8] || '').trim();
            const rawClassName = c10 || c9 || c8 || 'Chưa phân lớp (No Class)';

            if (!classesMap[rawClassName]) {
              classesMap[rawClassName] = {
                count: 0,
                grade: extractGradeNumberClient(rawClassName),
              };
            }
            classesMap[rawClassName].count++;
          }
        }

        // 3. THUẬT TOÁN GHÉP LỚP VÀO KHAY
        const newClassAssignments: Record<string, ClassGroupItem[]> = {};
        const unassigned: ClassGroupItem[] = [];

        Object.entries(classesMap).forEach(([className, info]) => {
          const cleanClass = cleanLmsText(className);
          const lmsGroupName = `${cleanSchool} ${cleanClass} ${dateSuffix}`.replace(/\s+/g, ' ').trim();

          const classItem: ClassGroupItem = {
            rawClassName: className,
            lmsGroupName,
            studentsCount: info.count,
            gradeDetected: info.grade,
          };

          let matchedTrayId: string | null = null;
          for (const [cid, tray] of Object.entries(traysMap)) {
            if (tray.targetGrade !== null && info.grade === tray.targetGrade) {
              matchedTrayId = cid;
              break;
            }
          }

          if (matchedTrayId) {
            if (!newClassAssignments[matchedTrayId]) newClassAssignments[matchedTrayId] = [];
            newClassAssignments[matchedTrayId].push(classItem);
          } else {
            unassigned.push(classItem);
          }
        });

        // 4. ĐỌC TAB 3: TEACHER INFORMATION (KHAI BÁO TRƯỚC)
        const teacherSheetName = sheetNames.find(s => s.toLowerCase().includes('teacher'));
        const teachersAlloc: TeacherAllocationItem[] = [];
        let totalTeachers = 0;

        if (teacherSheetName) {
          const ws3 = workbook.Sheets[teacherSheetName];
          const rawJson3: any[][] = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: '' });

          for (let r = 6; r < rawJson3.length; r++) {
            const row = rawJson3[r];
            const tName = String(row[4] || row[5] || '').trim();
            const email = String(row[7] || row[3] || '').trim().toLowerCase();
            const courseAssign = String(row[10] || '').trim();
            const rawTargetClass = String(row[2] || '').trim();

            if (!tName && !email) continue;
            totalTeachers++;

            const assignedLmsGroups: string[] = [];
            if (rawTargetClass && classesMap[rawTargetClass]) {
              assignedLmsGroups.push(`${cleanSchool} ${cleanLmsText(rawTargetClass)} ${dateSuffix}`);
            } else {
              Object.values(traysMap).forEach(tray => {
                if (tray.courseName.toLowerCase().includes(courseAssign.toLowerCase()) ||
                  (tray.targetGrade && courseAssign.toLowerCase().includes(`swrp ${tray.targetGrade}`))) {
                  tray.assignedClasses.forEach(c => assignedLmsGroups.push(c.lmsGroupName));
                }
              });
            }

            teachersAlloc.push({
              teacherName: tName,
              email,
              courseAssign,
              assignedLmsGroups: Array.from(new Set(assignedLmsGroups)),
            });
          }
        }

        // 🎯 5. BÂY GIỜ MỚI CẬP NHẬT TẤT CẢ CÁC STATE (ĐẢM BẢO teachersAlloc ĐÃ CÓ!)
        setCofClassAssignments(newClassAssignments);
        setCofUnassignedClasses(unassigned);
        setCofTeachersAllocation(teachersAlloc);
        if (parsedCoursesForForm.length > 0) {
          setSelectedCourses(parsedCoursesForForm);
        }

        // 5. ĐỐI SOÁT PHẢ HỆ VỚI 480 TRƯỜNG
        const matchResult = matchSchoolWithHierarchy(extractedSchoolName, schoolsList);
        if (matchResult.matched) {
          setSelectedSchool(matchResult.matched);
          setSelectedPartner({ name: matchResult.matched.partner_name, code: matchResult.matched.partner_code });
          setSelectedDistributor({ name: matchResult.matched.distributor_name, code: matchResult.matched.distributor_code });
          setEntitySearchQuery(matchResult.matched.school_name);
        } else {
          setEntitySearchQuery(extractedSchoolName);
        }

        // Cập nhật state toàn hệ thống
        setCofClassAssignments(newClassAssignments);
        setCofUnassignedClasses(unassigned);
        setCofTeachersAllocation(teachersAlloc);
        if (parsedCoursesForForm.length > 0) {
          setSelectedCourses(parsedCoursesForForm);
        }

        setCofExtractionResult({
          rawSchoolName: extractedSchoolName,
          matchedSchool: matchResult.matched,
          confidence: matchResult.confidence,
          score: matchResult.score,
          coursesCount: Object.keys(traysMap).length,
          studentsCount: totalStudents,
          teachersCount: totalTeachers,
        });

        toast.success(`✨ Đã phân tích xong COF: ${Object.keys(traysMap).length} Khay khóa học, ${totalStudents} Học sinh, ${totalTeachers} Giáo viên!`);
      } catch (err) {
        toast.error('Lỗi khi đọc file COF: ' + (err as Error).message);
      }
    };

    reader.readAsArrayBuffer(file);
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

          // 🐙 TỰ ĐỘNG QUÉT REPO CỦA CÁC KHÓA HỌC LMS ĐANG CHỌN
          const gitSyncPlan: { repo_url: string; role: string; users: string[] }[] = [];
          if (lmsAutoSyncGit) {
            lmsSelectedCourses.forEach((selCourse) => {
              const fullCourse = lmsCoursesList.find((c) => c.course_id === selCourse.course_id) ||
                workspaceCoursesList.find((c) => c.course_id === selCourse.course_id);
              if (fullCourse && (fullCourse as any).git_repos) {
                let rawRepos: any[] = (fullCourse as any).git_repos;
                if (typeof rawRepos === 'string') {
                  try { rawRepos = JSON.parse(rawRepos); } catch { rawRepos = []; }
                }
                if (Array.isArray(rawRepos)) {
                  rawRepos.forEach((r) => {
                    if (r && r.repo_url) {
                      const cleanUrl = r.repo_url.trim();
                      const isTeacherOnly = r.target === 'teacher_only';
                      // Nếu là teacher_only thì chỉ add GV & Manager; nếu là all thì add cả HS + GV + Manager
                      const targetUsers = isTeacherOnly
                        ? [...teachersList, ...managersList]
                        : [...studentsList, ...teachersList, ...managersList];

                      if (targetUsers.length > 0) {
                        const existingEntry = gitSyncPlan.find((p) => p.repo_url === cleanUrl);
                        if (existingEntry) {
                          existingEntry.users = Array.from(new Set([...existingEntry.users, ...targetUsers]));
                        } else {
                          gitSyncPlan.push({
                            repo_url: cleanUrl,
                            role: 'GUEST',
                            users: Array.from(new Set(targetUsers)),
                          });
                        }
                      }
                    }
                  });
                }
              }
            });
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
            sync_git_repos: lmsAutoSyncGit && gitSyncPlan.length > 0,
            git_sync_plan: gitSyncPlan,
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
      // 🐙 THÊM THÀNH VIÊN VÀO NHIỀU REPOSITORIES CÙNG LÚC (MULTI-REPOS)
      const validRepos = gitSelectedRepos.map((r) => r.trim()).filter((r) => r.length > 0);
      if (validRepos.length === 0) {
        toast.error('Vui lòng chọn ít nhất 1 Repository trên git.pythaverse.space!');
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
        repo_urls: validRepos,
        role: gitTargetRole,
        users: usersArr,
      };

      summary.engineName = '🐙 Pythaverse Git (Single-Session Multi-Repo RPA)';
      summary.actionTitle = `Thêm ${usersArr.length} Thành Viên Vào ${validRepos.length} Repositories`;
      summary.targetEntity = `${validRepos.length} Repos (${validRepos.map((r) => r.split('/').pop()).join(', ')})`;
      summary.detailsList = [
        `Danh sách kho: ${validRepos.map((r) => r.split('/').pop()).join(', ')}`,
        `Vai trò gán: ${gitTargetRole} (Single login session)`,
        `Số lượng tài khoản: ${usersArr.length} người dùng`,
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
        conf.password_option = kcPasswordOption;
        conf.force_change_on_first_login = kcForceChange;

        if (kcPasswordOption === 'email_lowercase') {
          details.push('Đặt lại pass: Sử dụng chính EMAIL tài khoản (viết thường)');
        } else {
          const finalPass = kcTempPass.trim() || 'Pythaverse@2026';
          conf.custom_password = finalPass;
          details.push(`Đặt lại pass: "${finalPass}"`);
        }
        details.push(`Bắt buộc đổi mật khẩu khi đăng nhập: ${kcForceChange ? 'Có' : 'Không'}`);
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
              {/* 🎯 [NEW] KHU VỰC NỘP FILE COF ĐỂ AUTO-FILL TOÀN TRÌNH */}
              <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                      <FileCheck2 className="h-5 w-5 text-amber-300" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Nộp File COF (Curriculum Order Form) Tự Động Điền Dữ Liệu</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                          Auto-Fill AI Engine
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Hệ thống tự bóc tách Tên Trường, Môn học, Số lượng License và điền vào các trường bên dưới.
                      </p>
                    </div>
                  </div>

                  {uploadedCofFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedCofFile(null);
                        setCofExtractionResult(null);
                        if (cofFileInputRef.current) cofFileInputRef.current.value = '';
                      }}
                      className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa file COF</span>
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={cofFileInputRef}
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processAndAutoFillCOF(f);
                  }}
                  className="hidden"
                />

                <div
                  onClick={() => cofFileInputRef.current?.click()}
                  className="flex items-center justify-between p-4 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900/80 hover:border-indigo-500 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-indigo-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {uploadedCofFile ? uploadedCofFile.name : 'Nhấp hoặc Kéo thả file COF (.xlsx) vào đây'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Hỗ trợ file COF 3 Tabs (Curriculum Order Form, Student Info, Teacher Info)
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-xs font-bold">
                    {uploadedCofFile ? 'Đổi File' : 'Chọn File'}
                  </span>
                </div>

                {/* THẺ BÁO CÁO KẾT QUẢ ĐỐI SOÁT TRƯỜNG & KHÓA HỌC */}
                {cofExtractionResult && (
                  <div className={`p-3.5 rounded-xl border text-xs space-y-2 ${cofExtractionResult.confidence === 'high'
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 text-emerald-950 dark:text-emerald-100'
                    : cofExtractionResult.confidence === 'medium'
                      ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 text-amber-950 dark:text-amber-100'
                      : 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 text-rose-950 dark:text-rose-100'
                    }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        {cofExtractionResult.confidence === 'high' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {cofExtractionResult.confidence === 'medium' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                        {cofExtractionResult.confidence === 'none' && <XCircle className="w-4 h-4 text-rose-600" />}
                        <span>
                          {cofExtractionResult.confidence === 'high' && 'ĐÃ KHỚP TRƯỜNG HỌC THÀNH CÔNG'}
                          {cofExtractionResult.confidence === 'medium' && 'CẢNH BÁO: KHỚP TRƯỜNG GẦN ĐÚNG (CẦN KIỂM TRA)'}
                          {cofExtractionResult.confidence === 'none' && 'LỖI: KHÔNG TÌM THẤY TRƯỜNG TRONG 480 TRƯỜNG'}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] font-extrabold">
                        {Math.round(cofExtractionResult.score * 100)}% Match
                      </span>
                    </div>

                    <div className="text-[11px] space-y-1">
                      <p>• Tên trong file COF: <b>"{cofExtractionResult.rawSchoolName || 'Không tìm thấy'}"</b></p>
                      {cofExtractionResult.matchedSchool ? (
                        <p>• Trường được gán trên hệ thống: <b>{cofExtractionResult.matchedSchool.school_name}</b> (Mã: {cofExtractionResult.matchedSchool.school_code})</p>
                      ) : (
                        <p className="text-rose-600 font-bold">• Vui lòng tự tìm và chọn trường ở ô tìm kiếm bên dưới!</p>
                      )}
                      <p>• Bóc tách thành công: <b>{cofExtractionResult.coursesCount} Môn học</b> | {cofExtractionResult.studentsCount} Học sinh | {cofExtractionResult.teachersCount} Giáo viên.</p>
                    </div>
                  </div>
                )}
              </div>
              {/* ========================================================================= */}
              {/* 🏆 GIAO DIỆN BENTO GRID KHAY KHÓA HỌC KÉO THẢ & ĐỒNG BỘ 2 CHIỀU TỨC THỜI  */}
              {/* ========================================================================= */}
              {cofTrays.length > 0 && (
                <div className="rounded-3xl border border-indigo-200 dark:border-indigo-900 bg-gradient-to-b from-indigo-50/40 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 p-5 sm:p-6 space-y-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
                        <Sparkles className="h-5 w-5 text-amber-300" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <span>Khay Phân Bổ Khóa Học & Giấy Phép (Kéo & Thả)</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            TWO-WAY SYNC
                          </span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Tự động đồng bộ số lượng & thông số môn học với bảng cấu hình bên dưới. Kéo thả để phân bổ lớp.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono font-bold">
                      <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Tổng Hạn Ngạch: {cofTrays.reduce((sum, t) => sum + t.quota, 0)} licenses
                      </span>
                      <span className="px-3 py-1 rounded-xl bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        Đã Xếp: {cofTrays.reduce((sum, t) => sum + t.assignedStudentsCount, 0)} học sinh
                      </span>
                    </div>
                  </div>

                  {/* 1. DANH SÁCH CÁC KHAY KHÓA HỌC (HIỂN THỊ PHẦN TRĂM THỰC TẾ VƯỢT 100%) */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {cofTrays.map((tray) => {
                      const diff = tray.quota - tray.assignedStudentsCount;
                      const isOverflow = diff < 0;
                      const isExact = diff === 0 && tray.quota > 0;

                      // 🎯 TÍNH PHẦN TRĂM THỰC TẾ: Không bị chặn trần 100% nữa!
                      const rawPercent = Math.round((tray.assignedStudentsCount / (tray.quota || 1)) * 100);
                      const displayPercent = isNaN(rawPercent) ? 0 : rawPercent;
                      const barWidth = Math.min(displayPercent, 100);
                      const isBeingHovered = activeDropTrayId === tray.courseId;

                      return (
                        <div
                          key={tray.courseId}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            setActiveDropTrayId(tray.courseId);
                          }}
                          onDragLeave={() => setActiveDropTrayId(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setActiveDropTrayId(null);
                            if (!draggedClassInfo) return;

                            const { sourceTrayId, classItem } = draggedClassInfo;
                            if (sourceTrayId === tray.courseId) return;

                            // Chuyển lớp vào khay đích
                            setCofClassAssignments((prev) => {
                              const next = { ...prev };
                              if (sourceTrayId && next[sourceTrayId]) {
                                next[sourceTrayId] = next[sourceTrayId].filter((c) => c.rawClassName !== classItem.rawClassName);
                              }
                              next[tray.courseId] = [...(next[tray.courseId] || []), classItem];
                              return next;
                            });

                            if (!sourceTrayId) {
                              setCofUnassignedClasses((prev) => prev.filter((c) => c.rawClassName !== classItem.rawClassName));
                            }

                            setDraggedClassInfo(null);
                            toast.success(`🎯 Đã thả lớp '${classItem.rawClassName}' vào Khay #${tray.courseId}!`);
                          }}
                          className={`rounded-2xl border p-4.5 flex flex-col justify-between transition-all duration-200 ${isBeingHovered
                            ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/60 ring-2 ring-indigo-500 scale-[1.01] shadow-md'
                            : isOverflow
                              ? 'border-rose-300 bg-rose-50/40 dark:bg-rose-950/20 ring-1 ring-rose-400'
                              : isExact
                                ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-400'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs'
                            }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mb-1">
                                  {tray.category} • ID: #{tray.courseId}
                                </span>
                                <h5 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2" title={tray.courseName}>
                                  {tray.courseName}
                                </h5>
                                {tray.targetGrade && (
                                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                                    Khối mục tiêu: Khối {tray.targetGrade}
                                  </p>
                                )}
                              </div>

                              {/* 🎯 BADGE TRẠNG THÁI HIỂN THỊ PHẦN TRĂM THỰC TẾ VƯỢT 100% */}
                              <span
                                className={`shrink-0 px-2.5 py-1 rounded-xl text-[10px] font-extrabold font-mono ${isOverflow
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'
                                  : isExact
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                                  }`}
                              >
                                {isOverflow ? `TRÀN +${Math.abs(diff)} (${displayPercent}%)` : isExact ? 'KHỚP 100%' : `DƯ ${diff} CHỖ (${displayPercent}%)`}
                              </span>
                            </div>

                            {/* Thanh tiến độ sức chứa */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-mono">
                                <span className="text-slate-500">
                                  Đã xếp: <b>{tray.assignedStudentsCount}</b> / {tray.quota} slots
                                </span>
                                <span className={`font-bold ${isOverflow ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {displayPercent}%
                                </span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${isOverflow ? 'bg-rose-500' : isExact ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </div>

                            {/* Danh sách các lớp trong Khay */}
                            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                <span>Các Lớp Trong Khay ({tray.assignedClasses.length} lớp):</span>
                                <span className="text-[9px] lowercase font-normal italic text-slate-400">kéo để chuyển khay</span>
                              </span>

                              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                                {tray.assignedClasses.length === 0 ? (
                                  <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-400 italic">
                                    Thả các lớp học từ bên dưới vào đây
                                  </div>
                                ) : (
                                  tray.assignedClasses.map((clsItem) => (
                                    <div
                                      key={clsItem.rawClassName}
                                      draggable
                                      onDragStart={(e) => {
                                        setDraggedClassInfo({ sourceTrayId: tray.courseId, classItem: clsItem });
                                        e.dataTransfer.setData('text/plain', clsItem.rawClassName);
                                      }}
                                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-xs cursor-grab active:cursor-grabbing hover:border-indigo-400 hover:shadow-2xs transition"
                                    >
                                      <div className="min-w-0 pr-2">
                                        <p className="font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                                          <span className="text-slate-400">⠿</span>
                                          <span>{clsItem.rawClassName}</span>
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-mono truncate pl-3" title={clsItem.lmsGroupName}>
                                          {clsItem.lmsGroupName}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-mono font-bold text-[11px]">
                                          {clsItem.studentsCount} hs
                                        </span>
                                        {/* Nút tháo lớp nhanh */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCofClassAssignments((prev) => {
                                              const next = { ...prev };
                                              if (next[tray.courseId]) {
                                                next[tray.courseId] = next[tray.courseId].filter((c) => c.rawClassName !== clsItem.rawClassName);
                                              }
                                              return next;
                                            });
                                            setCofUnassignedClasses((prev) => [...prev, clsItem]);
                                            toast.info(`Đã đưa lớp '${clsItem.rawClassName}' ra danh sách chờ.`);
                                          }}
                                          className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer transition"
                                          title="Đưa lớp này ra danh sách chờ"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 2. VÙNG DANH SÁCH LỚP CHỜ (VÙNG KÉO ĐI HOẶC THẢ NGƯỢC LẠI) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDropToUnassignedActive(true);
                    }}
                    onDragLeave={() => setIsDropToUnassignedActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDropToUnassignedActive(false);
                      if (!draggedClassInfo || !draggedClassInfo.sourceTrayId) return;

                      const { sourceTrayId, classItem } = draggedClassInfo;
                      setCofClassAssignments((prev) => {
                        const next = { ...prev };
                        if (next[sourceTrayId]) {
                          next[sourceTrayId] = next[sourceTrayId].filter((c) => c.rawClassName !== classItem.rawClassName);
                        }
                        return next;
                      });
                      setCofUnassignedClasses((prev) => [...prev, classItem]);
                      setDraggedClassInfo(null);
                      toast.info(`Đã chuyển lớp '${classItem.rawClassName}' về hàng đợi.`);
                    }}
                    className={`p-4.5 rounded-2xl border transition-all duration-200 ${isDropToUnassignedActive
                      ? 'border-amber-500 bg-amber-100/60 ring-2 ring-amber-400'
                      : 'border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20'
                      } space-y-3`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <h5 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          Hàng Đợi Các Khối Lớp Chưa Xếp Vào Khay ({cofUnassignedClasses.length} lớp - {cofUnassignedClasses.reduce((s, c) => s + c.studentsCount, 0)} học sinh):
                        </h5>
                      </div>
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium italic">
                        ✋ Nắm kéo thẻ lớp thả vào khay, hoặc bấm nút xếp nhanh
                      </span>
                    </div>

                    {cofUnassignedClasses.length === 0 ? (
                      <div className="p-6 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 text-center text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Tuyệt vời! Tất cả các khối lớp đã được xếp gọn gàng vào các khay môn học!</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {cofUnassignedClasses.map((uCls) => (
                          <div
                            key={uCls.rawClassName}
                            draggable
                            onDragStart={(e) => {
                              setDraggedClassInfo({ sourceTrayId: null, classItem: uCls });
                              e.dataTransfer.setData('text/plain', uCls.rawClassName);
                            }}
                            className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 flex flex-col justify-between gap-2.5 text-xs shadow-2xs hover:border-amber-400 cursor-grab active:cursor-grabbing transition"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                  <span className="text-slate-400">⠿</span>
                                  <span>{uCls.rawClassName || 'Chưa phân lớp (No Class)'}</span>
                                </p>
                                <span className="text-[10px] text-slate-400 font-mono pl-3">
                                  {uCls.studentsCount} học sinh {uCls.gradeDetected ? `(Khối ${uCls.gradeDetected})` : ''}
                                </span>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-[10px] font-mono font-bold">
                                Chờ xếp
                              </span>
                            </div>

                            {/* CÁC NÚT XẾP NHANH 1-CHẠM THAY THẾ DROPDOWN */}
                            <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] text-slate-400 font-semibold shrink-0">Xếp vào:</span>
                              <div className="flex flex-wrap gap-1">
                                {cofTrays.map((t) => (
                                  <button
                                    key={t.courseId}
                                    type="button"
                                    onClick={() => {
                                      setCofClassAssignments((prev) => ({
                                        ...prev,
                                        [t.courseId]: [...(prev[t.courseId] || []), uCls],
                                      }));
                                      setCofUnassignedClasses((prev) => prev.filter((c) => c.rawClassName !== uCls.rawClassName));
                                      toast.success(`Đã xếp lớp '${uCls.rawClassName}' vào Khay #${t.courseId}!`);
                                    }}
                                    className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 font-mono text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 cursor-pointer transition"
                                  >
                                    #{t.courseId} ({t.quota - t.assignedStudentsCount})
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. 🧑‍🏫 MỞ KHÓA CHỈNH SỬA PHÂN BỔ GIÁO VIÊN */}
                  {cofTeachersAllocation.length > 0 && (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-indigo-600" />
                          <span>Phân Bổ Giáo Viên ({cofTeachersAllocation.length} GV - Không tốn License):</span>
                        </span>
                        <span className="text-[11px] text-slate-500 italic">
                          Click vào biểu tượng ✎ trên từng giáo viên để sửa môn hoặc gán lại Group LMS
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {cofTeachersAllocation.map((t, tIdx) => (
                          <div
                            key={tIdx}
                            className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2 text-xs shadow-2xs hover:border-indigo-300 transition"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>🧑‍🏫 {t.teacherName}</span>
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono">{t.email}</p>
                              </div>

                              {/* Nút sửa giáo viên */}
                              <button
                                type="button"
                                onClick={() => setEditingTeacherIndex(tIdx)}
                                className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 cursor-pointer transition"
                                title="Sửa phân bổ môn & group cho giáo viên này"
                              >
                                ✎
                              </button>
                            </div>

                            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-1">
                              <p className="text-slate-600 dark:text-slate-300 truncate">
                                📚 Môn: <b>{t.courseAssign || 'Chưa gán'}</b>
                              </p>
                              <p className="text-indigo-600 dark:text-indigo-400 font-mono text-[10px]">
                                👥 {t.assignedLmsGroups.length} Group LMS được gán
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 🎯 MODAL SỬA PHÂN BỔ GIÁO VIÊN (SỬ DỤNG CREATEPORTAL TRÁNH CO SỤP WIDTH) */}
                  {editingTeacherIndex !== null && cofTeachersAllocation[editingTeacherIndex] && typeof document !== 'undefined' && createPortal(
                    <div
                      onClick={(e) => {
                        if (e.target === e.currentTarget) setEditingTeacherIndex(null);
                      }}
                      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
                    >
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-full sm:max-w-lg min-w-[320px] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl my-auto relative"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                              🧑‍🏫
                            </div>
                            <div>
                              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                                Sửa Phân Bổ Giáo Viên
                              </h4>
                              <p className="text-[11px] text-slate-400 font-mono">
                                {cofTeachersAllocation[editingTeacherIndex].teacherName} ({cofTeachersAllocation[editingTeacherIndex].email})
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingTeacherIndex(null)}
                            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="space-y-4 text-xs">
                          <div>
                            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                              Khóa Học Phụ Trách:
                            </label>
                            <select
                              value={cofTeachersAllocation[editingTeacherIndex].courseAssign}
                              onChange={(e) => {
                                const newCourse = e.target.value;
                                const updated = [...cofTeachersAllocation];
                                updated[editingTeacherIndex].courseAssign = newCourse;

                                // Tự động gợi ý gán tất cả Group của môn này
                                const matchedTray = cofTrays.find(t => t.courseName === newCourse || t.courseId === newCourse);
                                if (matchedTray) {
                                  updated[editingTeacherIndex].assignedLmsGroups = matchedTray.assignedClasses.map(c => c.lmsGroupName);
                                }
                                setCofTeachersAllocation(updated);
                              }}
                              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 p-2.5 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                            >
                              <option value="">-- Chưa gán môn --</option>
                              {cofTrays.map((t) => (
                                <option key={t.courseId} value={t.courseName}>
                                  [{t.category}] {t.courseName} (ID: #{t.courseId})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="font-bold text-slate-700 dark:text-slate-300">
                                Danh Sách Group LMS Giáo Viên Được Tham Gia:
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  // Nút gán tất cả group của trường
                                  const allGroups: string[] = [];
                                  cofTrays.forEach(t => t.assignedClasses.forEach(c => allGroups.push(c.lmsGroupName)));
                                  const updated = [...cofTeachersAllocation];
                                  updated[editingTeacherIndex].assignedLmsGroups = Array.from(new Set(allGroups));
                                  setCofTeachersAllocation(updated);
                                }}
                                className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                              >
                                + Gán tất cả Group của trường
                              </button>
                            </div>

                            <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 scrollbar-thin">
                              {cofTrays.flatMap(t => t.assignedClasses).length === 0 ? (
                                <div className="p-4 text-center text-[11px] text-slate-400 italic">
                                  Chưa có lớp nào được xếp vào khay môn học. Vui lòng xếp lớp vào khay môn học trước.
                                </div>
                              ) : (
                                cofTrays.flatMap(t => t.assignedClasses).map((cls, gIdx) => {
                                  const isChecked = cofTeachersAllocation[editingTeacherIndex].assignedLmsGroups.includes(cls.lmsGroupName);
                                  return (
                                    <label
                                      key={`${cls.lmsGroupName}-${gIdx}`}
                                      className="flex items-center gap-2.5 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition text-slate-800 dark:text-slate-200"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          const updated = [...cofTeachersAllocation];
                                          const curList = updated[editingTeacherIndex].assignedLmsGroups;
                                          if (e.target.checked) {
                                            updated[editingTeacherIndex].assignedLmsGroups = [...curList, cls.lmsGroupName];
                                          } else {
                                            updated[editingTeacherIndex].assignedLmsGroups = curList.filter(g => g !== cls.lmsGroupName);
                                          }
                                          setCofTeachersAllocation(updated);
                                        }}
                                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                      />
                                      <span className="truncate font-mono text-[11px]">{cls.lmsGroupName}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setEditingTeacherIndex(null)}
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                          >
                            Hoàn Tất
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
              )}
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

                        {/* 🎯 BỘ TÌM KIẾM MÔN HỌC LINH HOẠT XUYÊN CATEGORY */}
                        <div className="sm:col-span-2 relative">
                          <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center justify-between">
                            <span>Chọn môn học (Tìm kiếm mọi Category):</span>
                            <span className="font-mono text-indigo-600 font-semibold">ID: {cRow.course_id}</span>
                          </label>

                          <div className="relative mt-1">
                            <input
                              type="text"
                              value={
                                activeCourseDropdownRow === idx
                                  ? (courseSearchTerms[idx] ?? '')
                                  : cRow.course_name
                              }
                              onFocus={() => {
                                setActiveCourseDropdownRow(idx);
                                setCourseSearchTerms(prev => ({ ...prev, [idx]: '' }));
                              }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCourseSearchTerms(prev => ({ ...prev, [idx]: val }));
                              }}
                              placeholder="Gõ tên môn, mã ID, hoặc category để tìm..."
                              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white pr-8 focus:border-indigo-500 focus:outline-hidden"
                            />
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                          </div>

                          {/* Popover danh sách môn khi đang focus */}
                          {activeCourseDropdownRow === idx && (
                            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-64 overflow-y-auto p-1.5 space-y-1 animate-in fade-in duration-100">
                              <div className="flex items-center justify-between px-2 py-1 text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100 dark:border-slate-800">
                                <span>Gợi ý môn học</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveCourseDropdownRow(null)}
                                  className="text-slate-400 hover:text-slate-600"
                                >
                                  ✕ Đóng
                                </button>
                              </div>

                              {workspaceCoursesList
                                .filter(c => {
                                  const term = (courseSearchTerms[idx] || '').trim().toLowerCase();
                                  if (!term) return true;
                                  return (
                                    c.course_name.toLowerCase().includes(term) ||
                                    c.category.toLowerCase().includes(term) ||
                                    String(c.course_id).includes(term)
                                  );
                                })
                                .map(c => {
                                  const isSameCategory = c.category === cRow.category;
                                  return (
                                    <button
                                      key={c.course_id}
                                      type="button"
                                      onClick={() => {
                                        const updated = [...selectedCourses];
                                        updated[idx] = {
                                          ...updated[idx],
                                          category: c.category, // 🎯 Tự động đổi Category theo môn được chọn!
                                          course_id: c.course_id,
                                          course_name: c.course_name,
                                          lms_url: c.lms_url,
                                        };
                                        setSelectedCourses(updated);
                                        setActiveCourseDropdownRow(null);
                                        toast.success(`Đã chọn [${c.category}] - ${c.course_name}`);
                                      }}
                                      className="w-full text-left p-2.5 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                                    >
                                      <div className="truncate pr-2">
                                        <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                          {c.course_name}
                                        </div>
                                        <div className="text-[10px] font-mono flex items-center gap-1.5 mt-0.5">
                                          <span className={`px-1.5 py-0.2 rounded font-bold ${isSameCategory
                                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                            {c.category}
                                          </span>
                                          <span className="text-slate-400">ID: {c.course_id}</span>
                                        </div>
                                      </div>
                                      {cRow.course_id === c.course_id && (
                                        <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                                      )}
                                    </button>
                                  );
                                })}
                            </div>
                          )}
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
                  <span>2. Hủy Ghi Danh</span>
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
                          ? 'Ghi Danh & Đổi Quyền Khóa Học PLearn LMS'
                          : 'Hủy Ghi Danh Học Viên Khỏi Khóa Học PLearn LMS'}
                      </h3>
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        learn.pythaverse.space
                      </span>
                    </div>
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

              {/* 🐙 BENTO SMART BANNER: TỰ ĐỘNG THÊM VÀO GIT REPOS NẾU KHÓA HỌC CÓ CẤU HÌNH REPO */}
              {lmsActionType === 'enroll' && (
                <div className="p-4 rounded-2xl border border-violet-200/80 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-violet-600 text-white shadow-xs">
                        <GitBranch className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>Tự Động Đồng Bộ Quyền Pythaverse Git (Single-Session)</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300">
                            git.pythaverse.space
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Tự động thêm tài khoản vào các Repo tương ứng của khóa học đã chọn (Tự phân loại Giáo viên & Học sinh).
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lmsAutoSyncGit}
                        onChange={(e) => setLmsAutoSyncGit(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                    </label>
                  </div>
                </div>
              )}

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

      {/* 5. 🔑 KEYCLOAK IDP ENGINE WORKPLACE (BẢN PATCH ĐẦY ĐỦ TÙY CHỌN PASS & BULK LOOKUP) */}
      {selectedBotType === 'keycloak_api' && (
        <div className="space-y-5 rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
          {/* Header & Sub-tab Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Key className="h-4 w-4 text-purple-600" />
              <span>Quản Trị & Tra Cứu Danh Tính Keycloak eID:</span>
            </div>

            {/* Switcher: Cập nhật vs Tra cứu */}
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setKcActiveMode('manage')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${kcActiveMode === 'manage'
                  ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>1. Cập Nhật & Đổi Mật Khẩu</span>
              </button>

              <button
                type="button"
                onClick={() => setKcActiveMode('lookup')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${kcActiveMode === 'lookup'
                  ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>2. Tra Cứu Danh Tính eID (Bulk Lookup)</span>
              </button>
            </div>
          </div>

          {/* Ô Nhập Danh Sách Email/Username */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <label>Danh Sách Email hoặc Username Cần Xử Lý (Mỗi dòng 1 tài khoản):</label>
              <span className="font-mono text-purple-600 font-bold">
                {kcTargetEmail.split(/[\n,;]+/).filter((x) => x.trim().length > 0).length} tài khoản
              </span>
            </div>
            <textarea
              rows={3}
              value={kcTargetEmail}
              onChange={(e) => setKcTargetEmail(e.target.value)}
              placeholder="Nhập danh sách email hoặc username...&#10;teacher.demo@pythaverse.space&#10;student.demo@pythaverse.space"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3 font-mono text-xs text-slate-900 dark:text-white focus:border-purple-500 focus:bg-white focus:outline-hidden leading-relaxed"
            />
          </div>

          {/* CHẾ ĐỘ 1: CẬP NHẬT & ĐỔI MẬT KHẨU */}
          {kcActiveMode === 'manage' && (
            <div className="space-y-3.5">
              {/* Box 1: Đổi Mật Khẩu */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600">
                      <Key className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        1. Đặt Lại Mật Khẩu Khởi Tạo
                      </h4>
                      <p className="text-[11px] text-slate-400">Gán mật khẩu ban đầu cho người dùng</p>
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
                  <div className="space-y-3 pt-3 border-t border-slate-200/60 dark:border-slate-800">
                    <label className="text-[11px] font-bold uppercase text-slate-500">
                      Chọn Quy Chuẩn Mật Khẩu Áp Dụng:
                    </label>

                    {/* GỘP GỌN THÀNH 2 NẤC LỰA CHỌN CÂN ĐỐI */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Nấc 1: Dùng chính email */}
                      <button
                        type="button"
                        onClick={() => setKcPasswordOption('email_lowercase')}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${kcPasswordOption === 'email_lowercase'
                          ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 ring-1 ring-amber-500 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                          }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-300">
                          <AtSign className="w-4 h-4" />
                          <span>1. Dùng Chính Email Tài Khoản</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          Tự động lấy email viết thường của từng người làm mật khẩu (chuẩn quen thuộc cho HS/GV).
                        </p>
                      </button>

                      {/* Nấc 2: Mật khẩu chung / tùy chỉnh (Đề xuất sẵn Pythaverse@2026) */}
                      <button
                        type="button"
                        onClick={() => setKcPasswordOption('custom')}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${kcPasswordOption === 'custom'
                          ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 ring-1 ring-amber-500 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-300">
                            <Key className="w-4 h-4" />
                            <span>2. Mật Khẩu Chung / Tùy Chỉnh</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                            Gợi ý sẵn
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          Áp dụng một mật khẩu cố định cho toàn bộ danh sách (mặc định hoặc tự nhập đè).
                        </p>
                      </button>
                    </div>

                    {/* Ô Input hiển thị khi chọn nấc 2, có sẵn Pythaverse@2026 */}
                    {kcPasswordOption === 'custom' && (
                      <div className="pt-2 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase text-slate-500 mb-1">
                          <span>Mật Khẩu Áp Dụng (Có thể sửa tùy ý):</span>
                          <button
                            type="button"
                            onClick={() => setKcTempPass('Pythaverse@2026')}
                            className="text-amber-600 hover:underline cursor-pointer lowercase text-[10px]"
                          >
                            ↺ đặt lại Pythaverse@2026
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={kcTempPass}
                            onChange={(e) => setKcTempPass(e.target.value)}
                            placeholder="Pythaverse@2026"
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 font-mono text-xs font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-hidden"
                          />
                          <ShieldCheck className="absolute right-3 top-2.5 w-4 h-4 text-emerald-500" />
                        </div>
                      </div>
                    )}

                    <div className="pt-1">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={kcForceChange}
                          onChange={(e) => setKcForceChange(e.target.checked)}
                          className="h-4 w-4 rounded-md border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span>Bắt buộc đổi mật khẩu khi đăng nhập lần đầu (Temporary = TRUE)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Box 2: Xác Thực Email */}
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
                      ✓ Đã Xác Thực (Email Verified = True)
                    </button>
                    <button
                      type="button"
                      onClick={() => setKcVerifyAction('unverify')}
                      className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcVerifyAction === 'unverify'
                        ? 'border border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                    >
                      ✗ Gỡ Xác Thực (Email Verified = False)
                    </button>
                  </div>
                )}
              </div>

              {/* Box 3: Trạng Thái Hoạt Động */}
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
                      ✓ Kích Hoạt (Enabled = True)
                    </button>
                    <button
                      type="button"
                      onClick={() => setKcStatusAction('disable')}
                      className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcStatusAction === 'disable'
                        ? 'border border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                    >
                      ✗ Vô Hiệu Hóa (Enabled = False)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CHẾ ĐỘ 2: 🔍 BULK LOOKUP ĐỐI SOÁT DANH TÍNH TRỰC TUYẾN */}
          {kcActiveMode === 'lookup' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Kiểm Tra Tài Khoản eID Trực Tuyến
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Đối soát trực tiếp qua Keycloak REST API để kiểm tra sự tồn tại và trạng thái tài khoản.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleKeycloakLookup}
                  disabled={isKcLookingUp}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  {isKcLookingUp ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang tra cứu eID...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>🔍 Tra Cứu Thông Tin Ngay</span>
                    </>
                  )}
                </button>
              </div>

              {/* Bảng Kết Quả Tra Cứu */}
              {kcLookupResults.length > 0 && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-xs space-y-0">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Kết Quả Đối Soát ({kcLookupResults.length} tài khoản):
                    </span>
                    <div className="flex items-center gap-2 text-[11px] font-mono font-bold">
                      <span className="text-emerald-600">
                        {kcLookupResults.filter((u) => u.exists).length} Tồn tại
                      </span>
                      <span>|</span>
                      <span className="text-rose-500">
                        {kcLookupResults.filter((u) => !u.exists).length} Không có
                      </span>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/50 dark:bg-slate-800/40 text-[10px] font-bold uppercase text-slate-500 sticky top-0">
                        <tr>
                          <th className="p-3">Định Danh Đầu Vào</th>
                          <th className="p-3">Username eID</th>
                          <th className="p-3">Email</th>
                          <th className="p-3">Họ & Tên</th>
                          <th className="p-3 text-center">Tồn Tại</th>
                          <th className="p-3 text-center">Kích Hoạt</th>
                          <th className="p-3 text-center">Verify Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px] font-mono">
                        {kcLookupResults.map((u, idx) => (
                          <tr
                            key={idx}
                            className={`transition ${u.exists ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'bg-rose-50/30 dark:bg-rose-950/20'
                              }`}
                          >
                            <td className="p-3 font-semibold text-slate-900 dark:text-white">
                              {u.identifier}
                            </td>
                            <td className="p-3 text-purple-600 font-bold">
                              {u.username || '—'}
                            </td>
                            <td className="p-3 font-sans text-slate-700 dark:text-slate-300">
                              {u.email || '—'}
                            </td>
                            <td className="p-3 font-sans text-slate-700 dark:text-slate-300">
                              {u.exists ? `${u.lastName} ${u.firstName}`.trim() || '(Chưa đặt tên)' : '—'}
                            </td>
                            <td className="p-3 text-center">
                              {u.exists ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                                  <CheckCircle2 className="w-3 h-3" /> CÓ
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                                  <XCircle className="w-3 h-3" /> KHÔNG
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {u.exists ? (
                                u.enabled ? (
                                  <span className="text-emerald-600 font-bold">Đang Mở</span>
                                ) : (
                                  <span className="text-rose-500 font-bold">Bị Khóa</span>
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {u.exists ? (
                                u.emailVerified ? (
                                  <span className="text-emerald-600 font-bold">✓ Đã xác thực</span>
                                ) : (
                                  <span className="text-amber-500 font-bold">Chưa xác thực</span>
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 🌟 6. Pythaverse Git Collaborator Engine Workplace (HỖ TRỢ MULTI-REPOS) */}
      {selectedBotType === 'git_collaborator' && (
        <div className="space-y-5 rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <GitBranch className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span>Phân Quyền Kho Mã Nguồn Pythaverse Git (Multi-Repos Single-Session):</span>
            </div>
            <span className="rounded-full bg-violet-100 dark:bg-violet-950/70 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
              1 Phiên Đăng Nhập Duy Nhất
            </span>
          </div>

          <div className="space-y-4">
            {/* 1. KHU VỰC MULTI-SELECT REPOS */}
            <div className="space-y-2 relative" ref={gitRepoDropdownRef}>
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>Các Repository Mục Tiêu ({gitSelectedRepos.length} Repos đã chọn): <span className="text-rose-500">*</span></span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsGitRepoDropdownOpen(!isGitRepoDropdownOpen)}
                  className="text-xs text-violet-600 dark:text-violet-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>{isGitRepoDropdownOpen ? 'Đóng danh sách ✕' : `+ Chọn thêm từ danh mục (${allAvailableGitRepos.length} repos) ▼`}</span>
                </button>
              </div>

              {/* Danh sách Tags Pill các Repos đã chọn */}
              {gitSelectedRepos.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                  {gitSelectedRepos.map((repoUrl, rIdx) => {
                    const shortName = repoUrl.split('/').pop() || repoUrl;
                    return (
                      <span
                        key={rIdx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-800/60 text-xs font-mono font-bold text-violet-700 dark:text-violet-300 shadow-2xs"
                      >
                        <span>🐙 {shortName}</span>
                        <button
                          type="button"
                          onClick={() => setGitSelectedRepos(gitSelectedRepos.filter((_, i) => i !== rIdx))}
                          className="hover:text-rose-500 transition cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Ô Nhập URL thủ công bổ sung */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customRepoInput}
                  onChange={(e) => setCustomRepoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customRepoInput.trim()) {
                      e.preventDefault();
                      if (!gitSelectedRepos.includes(customRepoInput.trim())) {
                        setGitSelectedRepos([...gitSelectedRepos, customRepoInput.trim()]);
                      }
                      setCustomRepoInput('');
                    }
                  }}
                  placeholder="Dán link repo khác và bấm Enter (VD: https://git.pythaverse.space/...)"
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2 font-mono text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:bg-white focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customRepoInput.trim() && !gitSelectedRepos.includes(customRepoInput.trim())) {
                      setGitSelectedRepos([...gitSelectedRepos, customRepoInput.trim()]);
                      setCustomRepoInput('');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition cursor-pointer"
                >
                  Thêm Repo
                </button>
              </div>

              {/* Popover Danh Sách Repos Gợi Ý */}
              {isGitRepoDropdownOpen && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-80 overflow-hidden flex flex-col">
                  <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        autoFocus
                        value={gitRepoSearchQuery}
                        onChange={(e) => setGitRepoSearchQuery(e.target.value)}
                        placeholder="Gõ tên môn, category hoặc tên repo..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin max-h-60">
                    {filteredAvailableGitRepos.map((repo, idx) => {
                      const isSelected = gitSelectedRepos.includes(repo.repo_url);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setGitSelectedRepos(gitSelectedRepos.filter((u) => u !== repo.repo_url));
                            } else {
                              setGitSelectedRepos([...gitSelectedRepos, repo.repo_url]);
                            }
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
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300">
                                {repo.target === 'teacher_only' ? 'GV' : 'Cả Lớp'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">
                              Môn: <strong>{repo.course_name}</strong>
                            </p>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-violet-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. CHỌN VAI TRÒ */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Vai Trò Áp Dụng Cho Tất Cả Các Repos Đã Chọn:
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
                    <p className="text-[10px] text-slate-500 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. DANH SÁCH USER */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>DANH SÁCH USERNAME HOẶC EMAIL:</span>
                <span className="font-mono text-[11px] text-violet-600">
                  {gitUsersList.split(/[\n,;]+/).filter((x) => x.trim().length > 0).length} tài khoản
                </span>
              </div>
              <textarea
                rows={4}
                value={gitUsersList}
                onChange={(e) => setGitUsersList(e.target.value)}
                placeholder="hsdttemd&#10;gvdttemd@pythaverse.net"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 font-mono text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-hidden"
              />
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