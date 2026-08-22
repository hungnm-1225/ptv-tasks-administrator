// frontend/src/features/studio/AutomationStudioPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  Building2,
  KeyRound,
  FileText,
  Github,
  BookOpen,
  Search,
  Check,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  UserX,
  Layers,
  ArrowRight,
  Clock,
  RefreshCw,
  FileCheck,
  Crown,
  Users,
  GraduationCap,
  Calendar,
  Sparkles,
  UserCheck,
  ShieldAlert,
  Edit3,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotType } from '../../types';
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
  data_id?: string;
  order_code?: string;
  contract_code?: string;
  school_name?: string;
  created_at?: string;
  date?: string;
  type?: string;
  status?: string;
}

export const AutomationStudioPage: React.FC = () => {
  const navigate = useNavigate();

  const [selectedBotType, setSelectedBotType] = useState<BotType>('workspace_rpa');

  // 4 Mục chính của Workspace RPA
  const [workspaceMainCategory, setWorkspaceMainCategory] = useState<
    'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll'
  >('approve');

  // Phân luồng con trong mục "1. Duyệt"
  const [approveSubFlow, setApproveSubFlow] = useState<
    'approve_school_order' | 'approve_partner_contract' | 'admin_approve_contract'
  >('approve_school_order');

  // Phân luồng con trong mục "2. Tạo & Duyệt"
  const [createApproveSubFlow, setCreateApproveSubFlow] = useState<
    'end_to_end' | 'partner_create_chain' | 'distributor_create_chain'
  >('end_to_end');

  // Contact Info & Ghi chú chung
  const [contactInfo, setContactInfo] = useState<string>('Admin Automation Hub (operation@pythaverse.space)');
  const [additionalNotes, setAdditionalNotes] = useState<string>('Pythaverse Auto-Pipeline Managed');

  // Specific Order / Contract identifiers
  const [targetOrderCode, setTargetOrderCode] = useState<string>('');
  const [targetContractCode, setTargetContractCode] = useState<string>('');
  const [adminJustification, setAdminJustification] = useState<string>(
    'Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub'
  );

  // Live Scraper State
  const [isScrapingLive, setIsScrapingLive] = useState<boolean>(false);
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState<boolean>(false);
  const [scrapedPendingList, setScrapedPendingList] = useState<ScrapedPendingItem[]>([]);
  const [parsedOrderCourses, setParsedOrderCourses] = useState<any[]>([]);

  // =========================================================================
  // LMS STANDALONE REVAMP STATE (Ghi danh Moodle PLearn trực tiếp)
  // =========================================================================
  const [lmsIsCustomCourse, setLmsIsCustomCourse] = useState<boolean>(false);
  const [lmsCourseCategory, setLmsCourseCategory] = useState<string>('SWRP');
  const [lmsCourseId, setLmsCourseId] = useState<number>(654);
  const [lmsCourseName, setLmsCourseName] = useState<string>(
    'SWRP 9: LEANBOT Programming Applications with IoT [V2] (EN)'
  );

  // Tính ngày mặc định: hôm nay -> 1 năm sau (ví dụ: 22-08-2026 -> 21-08-2027)
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

  const [lmsStartDate, setLmsStartDate] = useState<string>(getFormattedDate(today));
  const [lmsEndDate, setLmsEndDate] = useState<string>(getFormattedDate(nextYear));

  // Role Mode: 'same_role' (Cùng 1 vai trò) | 'multi_role' (Phân chia 3 vai trò)
  const [lmsRoleMode, setLmsRoleMode] = useState<'same_role' | 'multi_role'>('multi_role');
  const [lmsSingleRole, setLmsSingleRole] = useState<'student' | 'non_editing_teacher' | 'manager'>('student');
  const [lmsBulkSingleEmails, setLmsBulkSingleEmails] = useState<string>('');

  // 3 Role Textareas
  const [lmsStudentEmails, setLmsStudentEmails] = useState<string>('');
  const [lmsTeacherEmails, setLmsTeacherEmails] = useState<string>('');
  const [lmsManagerEmails, setLmsManagerEmails] = useState<string>('');

  // Quick Date Setter
  const setQuickEndDate = (monthsToAdd: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsToAdd);
    d.setDate(d.getDate() - 1);
    setLmsEndDate(getFormattedDate(d));
    toast.success(`Đã đặt hạn truy cập: +${monthsToAdd} tháng (${getFormattedDate(d)})`);
  };

  // Keycloak Safe Controls
  const [kcTargetEmail, setKcTargetEmail] = useState<string>('teacher.demo@pythaverse.space');
  const [kcEnableResetPass, setKcEnableResetPass] = useState<boolean>(true);
  const [kcTempPass, setKcTempPass] = useState<string>('Ptv@2026');
  const [kcForceChange, setKcForceChange] = useState<boolean>(true);
  const [kcEnableVerify, setKcEnableVerify] = useState<boolean>(false);
  const [kcVerifyAction, setKcVerifyAction] = useState<'verify' | 'unverify'>('verify');
  const [kcEnableStatus, setKcEnableStatus] = useState<boolean>(false);
  const [kcStatusAction, setKcStatusAction] = useState<'enable' | 'disable'>('enable');

  // Sheets & Docs triage
  const [docUrl, setDocUrl] = useState<string>('');
  const [assigneeEmail, setAssigneeEmail] = useState<string>('hung.nguyenmanh@dtt.vn');
  const [rowIndex, setRowIndex] = useState<number>(2);

  // GitHub Issue
  const [githubTitle, setGithubTitle] = useState<string>('[FEAT] Tạo luồng tự động mới cho hệ thống');
  const [githubAssignee, setGithubAssignee] = useState<string>('nguyenthetrung5-PTV');

  // Metadata Phả hệ & Khóa học
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
      licenses: 50,
      start_date: getFormattedDate(today),
      end_date: getFormattedDate(nextYear),
    },
  ]);

  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const [isSchoolDropdownOpen, setIsSchoolDropdownOpen] = useState<boolean>(false);
  const schoolDropdownRef = useRef<HTMLDivElement | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [schools, cats, courses] = await Promise.all([
          fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools'),
          fetchApi<string[]>('/workspace/categories'),
          fetchApi<CourseItem[]>('/workspace/courses'),
        ]);
        setSchoolsList(schools || []);
        if (schools && schools.length > 0) {
          setSelectedSchool(schools[0]);
          setSchoolSearchQuery(`${schools[0].school_name} (${schools[0].school_code})`);
        }
        if (cats && cats.length > 0) setCategoriesList(cats);
        setCoursesList(courses || []);
      } catch (e) {
        console.warn('Lỗi nạp metadata:', e);
      }
    };
    loadMetadata();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (schoolDropdownRef.current && !schoolDropdownRef.current.contains(event.target as Node)) {
        setIsSchoolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Bóc tách chi tiết Order được chọn
  const handleLoadOrderDetails = async (orderCodeToLoad: string) => {
    setIsLoadingOrderDetails(true);
    try {
      const res = await fetchApi<any>(
        `/workspace/school-order-details?order_code=${encodeURIComponent(
          orderCodeToLoad
        )}&school_identifier=${encodeURIComponent(selectedSchool?.school_name || '')}`
      );
      if (res?.courses && res.courses.length > 0) {
        setParsedOrderCourses(res.courses);
        toast.success(`Đã bóc tách thành công ${res.courses.length} khóa học trong Order!`);
      } else {
        setParsedOrderCourses([]);
      }
    } catch (err) {
      console.warn('Lỗi đọc chi tiết Order:', err);
    } finally {
      setIsLoadingOrderDetails(false);
    }
  };

  // Quét danh sách Pending Live
  const handleLiveScrapePending = async () => {
    setIsScrapingLive(true);
    setScrapedPendingList([]);
    setParsedOrderCourses([]);
    try {
      if (approveSubFlow === 'approve_school_order') {
        const res = await fetchApi<any>(
          `/workspace/pending-school-orders?school_identifier=${encodeURIComponent(
            selectedSchool?.school_name || ''
          )}`
        );
        const orders = res?.orders || [];
        setScrapedPendingList(orders);
        if (orders.length > 0) {
          const firstCode = orders[0].order_code;
          setTargetOrderCode(firstCode);
          toast.success(`Tìm thấy ${orders.length} đơn hàng trường đang chờ duyệt!`);
          handleLoadOrderDetails(firstCode);
        } else {
          toast.info('Không có đơn hàng trường nào đang chờ duyệt.');
        }
      } else if (approveSubFlow === 'approve_partner_contract') {
        const res = await fetchApi<any>(
          `/workspace/pending-partner-contracts?distributor_code=${encodeURIComponent(
            selectedSchool?.distributor_name || ''
          )}`
        );
        const contracts = res?.contracts || [];
        setScrapedPendingList(contracts);
        if (contracts.length > 0) {
          setTargetContractCode(contracts[0].contract_code);
          toast.success(`Tìm thấy ${contracts.length} hợp đồng đối tác đang chờ duyệt!`);
        } else {
          toast.info('Không có hợp đồng đối tác nào đang chờ duyệt.');
        }
      } else if (approveSubFlow === 'admin_approve_contract') {
        const res = await fetchApi<any>('/workspace/pending-distributor-contracts');
        const contracts = res?.contracts || [];
        setScrapedPendingList(contracts);
        if (contracts.length > 0) {
          setTargetContractCode(contracts[0].contract_code);
          toast.success(`Tìm thấy ${contracts.length} hợp đồng đang chờ quản trị duyệt!`);
        } else {
          toast.info('Không có hợp đồng nào đang chờ quản trị duyệt.');
        }
      }
    } catch (err) {
      toast.error('Lỗi quét dữ liệu: ' + (err as Error).message);
    } finally {
      setIsScrapingLive(false);
    }
  };

  const handleAddCourseRow = () => {
    const defaultCourse =
      coursesList.find((c) => c.category === 'SWRP') ||
      coursesList[0] || {
        course_id: 766,
        category: 'SWRP',
        course_name: 'SWRP 1: Exploring the Miniature World with PMinetest (EN)',
        lms_url: 'https://learn.pythaverse.space/course/view.php?id=766',
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

  // Nộp tác vụ vào Task & Approval Hub
  const handleSubmitStudioTask = async () => {
    let payload: Record<string, any> = {
      is_manual_dispatch: true,
      creator: 'Admin Studio',
    };

    if (selectedBotType === 'workspace_rpa') {
      if (workspaceMainCategory === 'approve') {
        if (approveSubFlow === 'approve_school_order') {
          if (!targetOrderCode) {
            toast.error('Vui lòng nhập hoặc chọn mã đơn hàng trường cần duyệt!');
            return;
          }
          payload = {
            action: 'approve_school_order_standalone',
            order_code: targetOrderCode,
            school_name: selectedSchool?.school_name,
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : undefined,
          };
        } else if (approveSubFlow === 'approve_partner_contract') {
          if (!targetContractCode) {
            toast.error('Vui lòng nhập hoặc chọn mã hợp đồng đối tác cần duyệt!');
            return;
          }
          payload = {
            action: 'approve_partner_contract_standalone',
            contract_code: targetContractCode,
            partner_name: selectedSchool?.partner_name,
          };
        } else if (approveSubFlow === 'admin_approve_contract') {
          if (!targetContractCode) {
            toast.error('Vui lòng nhập hoặc chọn mã hợp đồng cần duyệt!');
            return;
          }
          payload = {
            action: 'admin_approve_contract',
            contract_code: targetContractCode,
            justification: adminJustification,
          };
        }
      } else if (workspaceMainCategory === 'create_and_approve') {
        if (createApproveSubFlow === 'end_to_end') {
          payload = {
            action: 'pipeline_end_to_end',
            school_name: selectedSchool?.school_name || 'Pythaverse School Demo',
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
          };
        } else if (createApproveSubFlow === 'partner_create_chain') {
          payload = {
            action: 'partner_create_and_approve_chain',
            partner_name: selectedSchool?.partner_name,
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
            action: 'distributor_create_and_approve_chain',
            distributor_name: selectedSchool?.distributor_name,
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
          action: 'bulk_account_creation',
          school_name: selectedSchool?.school_name,
          record_count: 50,
        };
      } else if (workspaceMainCategory === 'lms_enroll') {
        // Parse emails based on role mode
        let studentsList: string[] = [];
        let teachersList: string[] = [];
        let managersList: string[] = [];

        if (lmsRoleMode === 'same_role') {
          const bulkEmails = lmsBulkSingleEmails
            .split('\n')
            .map((e) => e.trim())
            .filter((e) => e.length > 0);

          if (lmsSingleRole === 'student') studentsList = bulkEmails;
          else if (lmsSingleRole === 'non_editing_teacher') teachersList = bulkEmails;
          else if (lmsSingleRole === 'manager') managersList = bulkEmails;
        } else {
          studentsList = lmsStudentEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
          teachersList = lmsTeacherEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
          managersList = lmsManagerEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
        }

        if (studentsList.length === 0 && teachersList.length === 0 && managersList.length === 0) {
          toast.error('Vui lòng nhập ít nhất một email cần ghi danh hoặc gia hạn!');
          return;
        }

        payload = {
          action: 'direct_moodle_lms_enroll',
          platform: 'learn.pythaverse.space',
          course_id: lmsCourseId,
          course_name: lmsCourseName,
          category: lmsCourseCategory,
          start_date: lmsStartDate,
          end_date: lmsEndDate,
          role_mode: lmsRoleMode,
          students: studentsList,
          non_editing_teachers: teachersList,
          managers: managersList,
          auto_renew_existing: true,
        };
      }
    } else if (selectedBotType === 'keycloak_api') {
      const actions: string[] = [];
      const conf: Record<string, any> = { target_email: kcTargetEmail };
      if (kcEnableResetPass) {
        actions.push('reset_password');
        conf.temporary_password = kcTempPass;
        conf.force_change_on_first_login = kcForceChange;
      }
      if (kcEnableVerify) actions.push(kcVerifyAction === 'verify' ? 'mark_email_verified' : 'mark_email_unverified');
      if (kcEnableStatus) actions.push(kcStatusAction === 'enable' ? 'enable_account' : 'disable_account');
      conf.actions = actions.length > 0 ? actions : ['noop_preview'];
      payload = conf;
    } else if (selectedBotType === 'feedback_doc_triage') {
      payload = {
        action: 'comment_and_assign',
        doc_url: docUrl,
        assignee_email: assigneeEmail,
        row_index: rowIndex,
      };
    } else if (selectedBotType === 'github_issue_creator') {
      payload = {
        action: 'create_github_issue',
        title: githubTitle,
        assignees: [githubAssignee],
      };
    }

    setSubmitting(true);
    try {
      await fetchApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: null,
          bot_type: selectedBotType === 'workspace_rpa' && workspaceMainCategory === 'lms_enroll' ? 'lms_playwright' : selectedBotType,
          payload_data: payload,
        }),
      });

      toast.success(
        <div className="space-y-1">
          <div className="font-bold">Đã đưa tác vụ vào hàng đợi phê duyệt!</div>
          <button
            onClick={() => navigate('/tasks')}
            className="text-violet-400 underline text-xs font-semibold cursor-pointer"
          >
            Mở Task Hub để kiểm tra và duyệt ➔
          </button>
        </div>
      );
    } catch (err) {
      toast.error('Lỗi điều phối tác vụ: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Tiêu đề trang */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl shadow-md shadow-violet-500/20">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Automation Studio
              </h2>
              <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300 uppercase tracking-wider">
                Direct Engine
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Khởi tạo và điều phối các chuỗi tác vụ tự động hóa độc lập.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-xs transition"
        >
          <span>Xem Task Hub</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Panel Form Chính */}
      <div className="space-y-6 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {/* Bước 1: Chọn Cỗ Máy Tự Động Hóa */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300 flex items-center justify-center text-[10px] font-extrabold">
              1
            </span>
            <span>Chọn Cỗ Máy Tự Động Hóa:</span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'workspace_rpa', label: 'Workspace & LMS', icon: Building2, desc: 'Đơn Hàng, Hợp Đồng & LMS' },
              { id: 'keycloak_api', label: 'Keycloak IDP', icon: KeyRound, desc: 'Quản Trị Người Dùng' },
              { id: 'feedback_doc_triage', label: 'Feedback Sheet', icon: FileText, desc: 'Ghi Chú Tài Liệu' },
              { id: 'github_issue_creator', label: 'GitHub Issue', icon: Github, desc: 'Báo Cáo Lỗi' },
            ].map((tab) => {
              const Icon = tab.icon;
              const isSel = selectedBotType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedBotType(tab.id as any)}
                  className={`flex flex-col items-start gap-1 p-4 rounded-2xl border text-left transition-all duration-150 cursor-pointer ${isSel
                    ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white border-transparent shadow-md shadow-violet-500/25'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Icon className={`w-5 h-5 ${isSel ? 'text-white' : 'text-violet-600 dark:text-violet-400'}`} />
                  <span className="text-xs font-bold mt-1">{tab.label}</span>
                  <span className={`text-[10px] ${isSel ? 'text-violet-100' : 'text-slate-400'}`}>
                    {tab.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bước 2: Cấu Hình Chi Tiết Phân Hệ */}
        {selectedBotType === 'workspace_rpa' && (
          <div className="space-y-6 p-6 rounded-2xl bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/70 dark:border-violet-800/40">
            {/* 4 MỤC CHÍNH CỦA WORKSPACE RPA */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-violet-200 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[10px] font-extrabold">
                  2
                </span>
                <span>Chọn Phân Luồng Nghiệp Vụ Cốt Lõi:</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-violet-100/60 dark:bg-violet-900/40 p-2 rounded-2xl text-xs font-medium">
                {[
                  { id: 'approve', label: '1. Phê Duyệt', icon: FileCheck },
                  { id: 'create_and_approve', label: '2. Tạo & Duyệt', icon: Zap },
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
                        setScrapedPendingList([]);
                        setParsedOrderCourses([]);
                      }}
                      className={`py-3 px-3 rounded-xl text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs ${isCur
                        ? 'bg-white dark:bg-slate-800 font-bold text-violet-700 dark:text-violet-300 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                    >
                      <MIcon className="w-4 h-4" />
                      <span>{mTab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TRƯỜNG HỌC ÁP DỤNG (Ẩn khi ở Tab 4 - LMS Standalone không cần trường) */}
            {workspaceMainCategory !== 'lms_enroll' && (
              <div className="space-y-2 relative" ref={schoolDropdownRef}>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-violet-600" />
                    <span>Trường Học Áp Dụng (Trong 480 Trường Phả Hệ):</span>
                  </span>
                  <span className="text-xs text-violet-600 font-bold font-mono">
                    {selectedSchool?.school_code || ''}
                  </span>
                </label>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={schoolSearchQuery}
                    onFocus={() => setIsSchoolDropdownOpen(true)}
                    onChange={(e) => {
                      setSchoolSearchQuery(e.target.value);
                      setIsSchoolDropdownOpen(true);
                    }}
                    placeholder="Tìm theo tên trường hoặc mã SCH_..."
                    className="w-full pl-10 pr-4 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition shadow-2xs"
                  />
                </div>

                {isSchoolDropdownOpen && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1">
                    {schoolsList
                      .filter((s) => s.school_name.toLowerCase().includes(schoolSearchQuery.toLowerCase()))
                      .slice(0, 30)
                      .map((s) => (
                        <button
                          key={s.school_code}
                          type="button"
                          onClick={() => {
                            setSelectedSchool(s);
                            setSchoolSearchQuery(`${s.school_name} (${s.school_code})`);
                            setIsSchoolDropdownOpen(false);
                          }}
                          className="w-full text-left p-3 rounded-xl text-xs hover:bg-violet-50 dark:hover:bg-slate-700/60 flex items-center justify-between cursor-pointer transition"
                        >
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">{s.school_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              Mã: {s.school_code} | Đối Tác: {s.partner_name}
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
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-violet-200/80 dark:border-violet-800/50 text-xs font-mono text-violet-700 dark:text-violet-300 flex items-center gap-2 shadow-2xs">
                    <Layers className="w-4 h-4 text-violet-500 shrink-0" />
                    <span className="truncate">{selectedSchool.full_lineage}</span>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* MỤC 1: PHÊ DUYỆT CÁC ĐƠN HÀNG / HỢP ĐỒNG ĐANG CHỜ              */}
            {/* ============================================================= */}
            {workspaceMainCategory === 'approve' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'approve_school_order', label: 'Đơn Hàng Trường', desc: 'Đối tác duyệt' },
                    { id: 'approve_partner_contract', label: 'Hợp Đồng Đối Tác', desc: 'Nhà phân phối duyệt' },
                    { id: 'admin_approve_contract', label: 'Hợp Đồng Quản Trị', desc: 'Quản trị viên duyệt' },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setApproveSubFlow(sub.id as any);
                        setScrapedPendingList([]);
                        setParsedOrderCourses([]);
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${approveSubFlow === sub.id
                        ? 'bg-violet-600 text-white border-transparent shadow-xs'
                        : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      <div className="font-bold text-xs">{sub.label}</div>
                      <div className={`text-[10px] ${approveSubFlow === sub.id ? 'text-violet-100' : 'text-slate-400'}`}>
                        {sub.desc}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="p-5 bg-white dark:bg-slate-800/90 rounded-2xl border border-violet-200 dark:border-slate-700 space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-violet-600" />
                      <span>
                        {approveSubFlow === 'approve_school_order'
                          ? 'Mã Đơn Hàng Trường Cần Duyệt:'
                          : approveSubFlow === 'approve_partner_contract'
                            ? 'Mã Hợp Đồng Đối Tác Cần Duyệt:'
                            : 'Mã Hợp Đồng Nhà Phân Phối Cần Duyệt:'}
                      </span>
                    </label>

                    <button
                      type="button"
                      disabled={isScrapingLive}
                      onClick={handleLiveScrapePending}
                      className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      {isScrapingLive ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>Quét Danh Sách Đang Chờ</span>
                    </button>
                  </div>

                  <div>
                    {approveSubFlow === 'approve_school_order' ? (
                      <input
                        type="text"
                        value={targetOrderCode}
                        onChange={(e) => setTargetOrderCode(e.target.value)}
                        placeholder="VD: SCH-10266-20260821-1347"
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-violet-300 dark:border-violet-700 rounded-xl p-3 text-xs font-mono font-bold outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={targetContractCode}
                        onChange={(e) => setTargetContractCode(e.target.value)}
                        placeholder={
                          approveSubFlow === 'approve_partner_contract'
                            ? 'VD: PRT-20260603-444'
                            : 'VD: DST-20260603-102'
                        }
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-violet-300 dark:border-violet-700 rounded-xl p-3 text-xs font-mono font-bold outline-none"
                      />
                    )}
                  </div>

                  {approveSubFlow === 'admin_approve_contract' && (
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                        <span>Lý Do Phê Duyệt (Tối thiểu 15 ký tự):</span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {adminJustification.length} ký tự
                        </span>
                      </label>
                      <textarea
                        rows={2}
                        value={adminJustification}
                        onChange={(e) => setAdminJustification(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs outline-none"
                      />
                    </div>
                  )}

                  {scrapedPendingList.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Chọn nhanh từ danh sách đang chờ duyệt ({scrapedPendingList.length}):
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 p-1.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                        {scrapedPendingList.map((item, pIdx) => {
                          const itemCode = item.order_code || item.contract_code || item.data_id;
                          const isCurrent =
                            targetOrderCode === itemCode || targetContractCode === itemCode;
                          return (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => {
                                if (approveSubFlow === 'approve_school_order') {
                                  setTargetOrderCode(itemCode || '');
                                  handleLoadOrderDetails(itemCode || '');
                                } else {
                                  setTargetContractCode(itemCode || '');
                                }
                                toast.success(`Đã chọn mã: ${itemCode}`);
                              }}
                              className={`w-full text-left p-3 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${isCurrent
                                ? 'bg-violet-100 dark:bg-violet-950/70 border border-violet-300 text-violet-800 dark:text-violet-200 font-bold shadow-2xs'
                                : 'hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                            >
                              <div>
                                <div className="font-mono text-xs">{itemCode}</div>
                                <div className="text-[11px] text-slate-400">
                                  {item.school_name ? `${item.school_name} | ` : ''}
                                  {item.created_at || item.date || ''}
                                </div>
                              </div>
                              <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                                {item.status || 'Chờ duyệt'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {approveSubFlow === 'approve_school_order' && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-sky-600" />
                          <span>Khóa Học Bên Trong Đơn Hàng ({parsedOrderCourses.length} môn):</span>
                        </span>
                        {isLoadingOrderDetails && (
                          <span className="text-[11px] text-sky-600 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Đang đọc chi tiết...</span>
                          </span>
                        )}
                      </div>

                      {parsedOrderCourses.length > 0 ? (
                        <div className="space-y-2">
                          {parsedOrderCourses.map((pc, pIdx) => (
                            <div
                              key={pIdx}
                              className="p-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl border border-sky-200 dark:border-sky-800/60 text-xs flex items-center justify-between"
                            >
                              <div>
                                <div className="font-bold text-sky-900 dark:text-sky-200">{pc.course_name}</div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  Phân loại: {pc.category} | Thời hạn: {pc.start_date} ➔ {pc.end_date}
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 rounded-lg font-extrabold border border-sky-200 dark:border-sky-700">
                                {pc.licenses} Giấy phép
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-400 text-xs text-center">
                          Bấm "Quét Danh Sách Đang Chờ" hoặc click chọn đơn hàng để hệ thống tự động bóc tách khóa học.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* MỤC 2: TẠO MỚI & DUYỆT CHUỖI LIÊN THÔNG                       */}
            {/* ============================================================= */}
            {workspaceMainCategory === 'create_and_approve' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'end_to_end', label: 'Trọn Gói Toàn Trình', desc: 'Trường ➔ Quản trị ➔ LMS' },
                    { id: 'partner_create_chain', label: 'Đối Tác Tạo & Duyệt', desc: 'Đối tác ➔ Quản trị' },
                    { id: 'distributor_create_chain', label: 'Nhà Phân Phối Tạo & Duyệt', desc: 'Nhà phân phối ➔ Quản trị' },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setCreateApproveSubFlow(sub.id as any)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${createApproveSubFlow === sub.id
                        ? 'bg-violet-600 text-white border-transparent shadow-xs'
                        : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      <div className="font-bold text-xs">{sub.label}</div>
                      <div className={`text-[10px] ${createApproveSubFlow === sub.id ? 'text-violet-100' : 'text-slate-400'}`}>
                        {sub.desc}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-white dark:bg-slate-800/90 rounded-2xl border border-violet-200 dark:border-slate-700 shadow-2xs">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Thông Tin Liên Hệ:
                    </label>
                    <input
                      type="text"
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Ghi Chú Bổ Sung:
                    </label>
                    <input
                      type="text"
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-sky-600" />
                      <span>Danh Sách Khóa Học Cấp Phép ({selectedCourses.length} Môn):</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleAddCourseRow}
                      className="flex items-center gap-1 text-xs px-3.5 py-1.5 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 rounded-xl font-bold hover:bg-sky-100 cursor-pointer shadow-2xs transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Môn Học</span>
                    </button>
                  </div>

                  {selectedCourses.map((cRow, idx) => {
                    const filteredCoursesForCategory = coursesList.filter((c) => c.category === cRow.category);
                    return (
                      <div
                        key={idx}
                        className="p-4 bg-white dark:bg-slate-800/90 rounded-2xl border border-violet-200/80 dark:border-slate-700 space-y-3 relative shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                          <span>Khóa học #{idx + 1}</span>
                          {selectedCourses.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCourseRow(idx)}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Phân loại:</label>
                            <select
                              value={cRow.category}
                              onChange={(e) => {
                                const cat = e.target.value;
                                const match = coursesList.filter((c) => c.category === cat);
                                const first = match[0] || coursesList[0];
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
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold cursor-pointer outline-none"
                            >
                              {categoriesList.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Chọn môn học ({filteredCoursesForCategory.length} môn):
                            </label>
                            <select
                              value={cRow.course_id}
                              onChange={(e) => {
                                const cId = parseInt(e.target.value);
                                const target = coursesList.find((c) => c.course_id === cId);
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
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold cursor-pointer outline-none truncate"
                            >
                              {filteredCoursesForCategory.map((c) => (
                                <option key={c.course_id} value={c.course_id}>
                                  {c.course_name} (ID: {c.course_id})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Số lượng Giấy phép:</label>
                            <input
                              type="number"
                              value={cRow.licenses}
                              min={1}
                              onChange={(e) => {
                                const updated = [...selectedCourses];
                                updated[idx].licenses = parseInt(e.target.value) || 1;
                                setSelectedCourses(updated);
                              }}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-bold outline-none"
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
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Kết Thúc:</label>
                            <input
                              type="text"
                              value={cRow.end_date}
                              placeholder="dd-mm-yyyy"
                              onChange={(e) => {
                                const updated = [...selectedCourses];
                                updated[idx].end_date = e.target.value;
                                setSelectedCourses(updated);
                              }}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* MỤC 3: TẠO TÀI KHOẢN HÀNG LOẠT                                */}
            {/* ============================================================= */}
            {workspaceMainCategory === 'bulk_accounts' && (
              <div className="p-5 bg-white dark:bg-slate-800/90 rounded-2xl border border-violet-200 dark:border-slate-700 space-y-4 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-violet-600" />
                  <div>
                    <div className="font-bold text-xs text-slate-800 dark:text-slate-200">
                      Nộp File Batch Tạo Tài Khoản Hàng Loạt
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Hệ thống sẽ đăng nhập vào trường đã chọn, nộp file và theo dõi tiến độ đến khi hoàn tất.
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    Trường áp dụng: <span className="font-bold text-violet-600">{selectedSchool?.school_name}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    File mẫu accounts.xlsx sẽ được tự động chuẩn hóa và nộp lên Workspace.
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* MỤC 4: GHI DANH KHÓA HỌC LMS (REVAMP ĐỘC LẬP HOÀN TOÀN)       */}
            {/* ============================================================= */}
            {workspaceMainCategory === 'lms_enroll' && (
              <div className="p-6 bg-white dark:bg-slate-800/90 rounded-3xl border border-emerald-200/80 dark:border-emerald-800/50 space-y-5 shadow-2xs">
                {/* Header Sub-Module */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 rounded-xl">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>Ghi Danh & Gia Hạn Khóa Học PLearn LMS</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-bold">
                          learn.pythaverse.space
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Tự động ghi danh người dùng mới hoặc tự động gia hạn (Renew Access) nếu đã có trong khóa.
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLmsIsCustomCourse(!lmsIsCustomCourse)}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl border font-bold transition cursor-pointer ${lmsIsCustomCourse
                      ? 'bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950/60 dark:text-violet-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{lmsIsCustomCourse ? 'Khóa Tự Đặt (Custom)' : 'Khóa Chuẩn (Standard)'}</span>
                  </button>
                </div>

                {/* 1. Chọn Khóa Học LMS */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Khóa Học LMS Cần Ghi Danh:</span>
                  </label>

                  {lmsIsCustomCourse ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Moodle Course ID:</label>
                        <input
                          type="number"
                          value={lmsCourseId}
                          onChange={(e) => setLmsCourseId(parseInt(e.target.value) || 0)}
                          placeholder="VD: 654"
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Tên Khóa Học Tự Đặt:</label>
                        <input
                          type="text"
                          value={lmsCourseName}
                          onChange={(e) => setLmsCourseName(e.target.value)}
                          placeholder="VD: Khóa Đào Tạo Giáo Viên STEM 2026"
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Phân loại:</label>
                        <select
                          value={lmsCourseCategory}
                          onChange={(e) => {
                            const cat = e.target.value;
                            setLmsCourseCategory(cat);
                            const match = coursesList.filter((c) => c.category === cat);
                            if (match.length > 0) {
                              setLmsCourseId(match[0].course_id);
                              setLmsCourseName(match[0].course_name);
                            }
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold outline-none"
                        >
                          {categoriesList.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          Chọn khóa học ({coursesList.filter((c) => c.category === lmsCourseCategory).length} môn):
                        </label>
                        <select
                          value={lmsCourseId}
                          onChange={(e) => {
                            const cId = parseInt(e.target.value);
                            setLmsCourseId(cId);
                            const target = coursesList.find((c) => c.course_id === cId);
                            if (target) setLmsCourseName(target.course_name);
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold outline-none truncate"
                        >
                          {coursesList
                            .filter((c) => c.category === lmsCourseCategory)
                            .map((c) => (
                              <option key={c.course_id} value={c.course_id}>
                                {c.course_name} (ID: {c.course_id})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Thiết lập Thời Hạn Quyền Truy Cập (Start Date -> End Date) */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-violet-600" />
                      <span>Thời Hạn Quyền Truy Cập (Mặc Định 1 Năm):</span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQuickEndDate(6)}
                        className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-violet-400 cursor-pointer transition"
                      >
                        +6 Tháng
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickEndDate(12)}
                        className="px-2.5 py-1 text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border border-violet-300 dark:border-violet-800 rounded-lg cursor-pointer transition"
                      >
                        +1 Năm (Chuẩn)
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickEndDate(24)}
                        className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-violet-400 cursor-pointer transition"
                      >
                        +2 Năm
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Bắt Đầu Truy Cập:</label>
                      <input
                        type="text"
                        value={lmsStartDate}
                        onChange={(e) => setLmsStartDate(e.target.value)}
                        placeholder="dd-mm-yyyy"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Hết Hạn Truy Cập:</label>
                      <input
                        type="text"
                        value={lmsEndDate}
                        onChange={(e) => setLmsEndDate(e.target.value)}
                        placeholder="dd-mm-yyyy"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Chế Độ Phân Vai Trò (Same Role vs Multi Role) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Phương Thức Gán Vai Trò (3 Role Moodle Chuẩn):</span>
                    </label>

                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setLmsRoleMode('multi_role')}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${lmsRoleMode === 'multi_role'
                          ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs'
                          : 'text-slate-500'
                          }`}
                      >
                        Phân Chia 3 Vai Trò
                      </button>
                      <button
                        type="button"
                        onClick={() => setLmsRoleMode('same_role')}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${lmsRoleMode === 'same_role'
                          ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs'
                          : 'text-slate-500'
                          }`}
                      >
                        Cùng Một Vai Trò
                      </button>
                    </div>
                  </div>

                  {/* Chế độ 1: Cùng một vai trò */}
                  {lmsRoleMode === 'same_role' ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Chọn Vai Trò Áp Dụng:</label>
                        <select
                          value={lmsSingleRole}
                          onChange={(e) => setLmsSingleRole(e.target.value as any)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                        >
                          <option value="student">🎓 Học Viên (Student)</option>
                          <option value="non_editing_teacher">👨‍🏫 Giáo Viên Trợ Giảng (Non-editing Teacher)</option>
                          <option value="manager">🛡️ Quản Lý Khóa Học (Manager)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          Danh Sách Email Người Dùng (Mỗi dòng 1 email):
                        </label>
                        <textarea
                          rows={4}
                          value={lmsBulkSingleEmails}
                          onChange={(e) => setLmsBulkSingleEmails(e.target.value)}
                          placeholder="user1@pythaverse.space&#10;user2@pythaverse.space&#10;user3@pythaverse.space"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Chế độ 2: Phân chia chi tiết 3 Textareas */
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Học viên */}
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <label className="text-[11px] font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1">
                          <span>🎓 Học Viên (Student):</span>
                        </label>
                        <textarea
                          rows={5}
                          value={lmsStudentEmails}
                          onChange={(e) => setLmsStudentEmails(e.target.value)}
                          placeholder="student1@pythaverse.space&#10;student2@pythaverse.space"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono outline-none"
                        />
                      </div>

                      {/* Giáo viên trợ giảng */}
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <label className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <span>👨‍🏫 Trợ Giảng (Non-editing Teacher):</span>
                        </label>
                        <textarea
                          rows={5}
                          value={lmsTeacherEmails}
                          onChange={(e) => setLmsTeacherEmails(e.target.value)}
                          placeholder="teacher1@pythaverse.space&#10;teacher2@pythaverse.space"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono outline-none"
                        />
                      </div>

                      {/* Quản lý */}
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <label className="text-[11px] font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                          <span>🛡️ Quản Lý (Manager):</span>
                        </label>
                        <textarea
                          rows={5}
                          value={lmsManagerEmails}
                          onChange={(e) => setLmsManagerEmails(e.target.value)}
                          placeholder="manager1@pythaverse.space"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cấu hình Keycloak Identity Bot */}
        {selectedBotType === 'keycloak_api' && (
          <div className="space-y-4 p-6 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>Quản Trị Danh Tính Keycloak:</span>
              </label>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-bold">
                Bảo vệ 3 lớp
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Email hoặc Username Cần Xử Lý:
              </label>
              <input
                type="text"
                value={kcTargetEmail}
                onChange={(e) => setKcTargetEmail(e.target.value)}
                placeholder="VD: teacher@pythaverse.space"
                className="w-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/80 rounded-xl p-3 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <div className="space-y-3 pt-1">
              {/* 1. Reset Pass */}
              <div
                className={`p-4 rounded-2xl border transition-all ${kcEnableResetPass
                  ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
                        1. Đặt Lại Mật Khẩu Tạm Thời
                      </div>
                      <div className="text-[10px] text-slate-400">Gán mật khẩu khởi tạo an toàn</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setKcEnableResetPass(!kcEnableResetPass)}
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
                        onChange={(e) => setKcTempPass(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono font-bold outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => setKcForceChange(!kcForceChange)}
                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition ${kcForceChange
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                          }`}
                      >
                        {kcForceChange && <Check className="w-3 h-3" />}
                      </button>
                      <label
                        onClick={() => setKcForceChange(!kcForceChange)}
                        className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Bắt buộc đổi khi đăng nhập
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Email Verified */}
              <div
                className={`p-4 rounded-2xl border transition-all ${kcEnableVerify
                  ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
                    onClick={() => setKcEnableVerify(!kcEnableVerify)}
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
                      onClick={() => setKcVerifyAction('verify')}
                      className={`flex-1 py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${kcVerifyAction === 'verify'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                    >
                      ✓ Đã Xác Thực
                    </button>
                    <button
                      type="button"
                      onClick={() => setKcVerifyAction('unverify')}
                      className={`flex-1 py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${kcVerifyAction === 'unverify'
                        ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                    >
                      ✗ Gỡ Xác Thực
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Account Status */}
              <div
                className={`p-4 rounded-2xl border transition-all ${kcEnableStatus
                  ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
                    onClick={() => setKcEnableStatus(!kcEnableStatus)}
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
                      onClick={() => setKcStatusAction('enable')}
                      className={`flex-1 py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${kcStatusAction === 'enable'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                    >
                      ✓ Kích Hoạt
                    </button>
                    <button
                      type="button"
                      onClick={() => setKcStatusAction('disable')}
                      className={`flex-1 py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${kcStatusAction === 'disable'
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

        {/* Cấu hình Feedback Doc Triage */}
        {selectedBotType === 'feedback_doc_triage' && (
          <div className="space-y-4 p-6 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-800/40">
            <label className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Đường dẫn Google Doc & Email Phân Công:</span>
            </label>
            <input
              type="text"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              className="w-full bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-xl p-3 text-xs outline-none"
            />
            <div className="grid grid-cols-2 gap-4">
              <input
                type="email"
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                placeholder="Email người phụ trách (@dtt.vn)"
                className="bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-xl p-2.5 text-xs outline-none"
              />
              <input
                type="number"
                value={rowIndex}
                onChange={(e) => setRowIndex(parseInt(e.target.value) || 2)}
                placeholder="Dòng trong Sheet (row_index)"
                className="bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-xl p-2.5 text-xs outline-none font-mono font-bold"
              />
            </div>
          </div>
        )}

        {/* Cấu hình GitHub Issue Creator */}
        {selectedBotType === 'github_issue_creator' && (
          <div className="space-y-4 p-6 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Github className="w-4 h-4" />
              <span>Tiêu Đề & Người Phụ Trách GitHub Issue:</span>
            </label>
            <input
              type="text"
              value={githubTitle}
              onChange={(e) => setGithubTitle(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl p-3 text-xs font-bold outline-none"
            />
            <input
              type="text"
              value={githubAssignee}
              onChange={(e) => setGithubAssignee(e.target.value)}
              placeholder="Assignee GitHub username (VD: nguyenthetrung5-PTV)"
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl p-2.5 text-xs font-mono outline-none"
            />
          </div>
        )}

        {/* Nút Submit Duy Nhất */}
        <div className="pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmitStudioTask}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-extrabold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            <span>Đưa Tác Vụ Vào Hàng Đợi Phê Duyệt Ngay</span>
          </button>
        </div>
      </div>
    </div>
  );
};