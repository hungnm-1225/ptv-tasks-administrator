// frontend/src/features/studio/AutomationStudioPage.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Users,
  GraduationCap,
  Calendar,
  UserCheck,
  UploadCloud,
  FileSpreadsheet,
  Filter,
  Briefcase,
  Store,
  X,
  AlertCircle,
  Terminal,
  Code2,
  Send,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotType } from '../../types';
import { toast } from 'sonner';
import { supabase } from "../../lib/supabase"

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

  // 👉 MÃ ĐỊNH DANH & ITEM ĐƯỢC CHỌN TRỰC TIẾP TỪ CACHE
  const [targetOrderCode, setTargetOrderCode] = useState<string>('');
  const [targetContractCode, setTargetContractCode] = useState<string>('');
  const [selectedCachedItem, setSelectedCachedItem] = useState<ScrapedPendingItem | null>(null);

  const [adminJustification, setAdminJustification] = useState<string>(
    'Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub'
  );

  // Live Cache State & Bộ lọc trạng thái Order/Contract
  const [isScrapingLive, setIsScrapingLive] = useState<boolean>(false);
  const [isSyncingBackground, setIsSyncingBackground] = useState<boolean>(false);
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState<boolean>(false);
  const [scrapedPendingList, setScrapedPendingList] = useState<ScrapedPendingItem[]>([]);
  const [parsedOrderCourses, setParsedOrderCourses] = useState<any[]>([]);

  // 👉 BỘ LỌC TRẠNG THÁI (Mặc định 'pending')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // =========================================================================
  // 🏢 METADATA WORKSPACE (Bảng workspace_courses & hierarchy_schools)
  // =========================================================================
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [workspaceCategoriesList, setWorkspaceCategoriesList] = useState<string[]>(['SWRP', 'IR', 'ASP', 'Other']);
  const [workspaceCoursesList, setWorkspaceCoursesList] = useState<CourseItem[]>([]);

  // =========================================================================
  // 🎓 METADATA LMS DIRECT (Bảng lms_courses)
  // =========================================================================
  const [lmsCategoriesList, setLmsCategoriesList] = useState<string[]>([]);
  const [lmsCoursesList, setLmsCoursesList] = useState<CourseItem[]>([]);
  const [lmsCourseCategory, setLmsCourseCategory] = useState<string>('');
  const [lmsCourseId, setLmsCourseId] = useState<number>(0);
  const [lmsCourseName, setLmsCourseName] = useState<string>('');
  const [lmsGroupName, setLmsGroupName] = useState<string>('');

  // 👉 ĐỐI TƯỢNG TÌM KIẾM BÊN TRÊN
  const [selectedSchool, setSelectedSchool] = useState<HierarchySchoolItem | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{ name: string; code: string } | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<{ name: string; code: string } | null>(null);

  // Input tìm kiếm động theo cấp
  const [entitySearchQuery, setEntitySearchQuery] = useState<string>('');
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState<boolean>(false);
  const entityDropdownRef = useRef<HTMLDivElement | null>(null);

  // File Upload cho Tạo tài khoản hàng loạt
  const [uploadedAccountsFile, setUploadedAccountsFile] = useState<File | null>(null);
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

  // Khóa học được chọn khi Tạo & Duyệt (Workspace)
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

  // Thời hạn LMS Enroll
  const [lmsStartDate, setLmsStartDate] = useState<string>(getFormattedDate(today));
  const [lmsEndDate, setLmsEndDate] = useState<string>(getFormattedDate(nextYear));

  // Role Mode
  const [lmsRoleMode, setLmsRoleMode] = useState<'same_role' | 'multi_role'>('multi_role');
  const [lmsSingleRole, setLmsSingleRole] = useState<'student' | 'non_editing_teacher' | 'manager'>('student');
  const [lmsBulkSingleEmails, setLmsBulkSingleEmails] = useState<string>('');
  const [lmsStudentEmails, setLmsStudentEmails] = useState<string>('');
  const [lmsTeacherEmails, setLmsTeacherEmails] = useState<string>('');
  const [lmsManagerEmails, setLmsManagerEmails] = useState<string>('');

  // Keycloak Safe Controls
  const [kcTargetEmail, setKcTargetEmail] = useState<string>('teacher.demo@pythaverse.space');
  const [kcEnableResetPass, setKcEnableResetPass] = useState<boolean>(true);
  const [kcTempPass, setKcTempPass] = useState<string>('Ptv@2026');
  const [kcForceChange, setKcForceChange] = useState<boolean>(true);
  const [kcEnableVerify, setKcEnableVerify] = useState<boolean>(false);
  const [kcVerifyAction, setKcVerifyAction] = useState<'verify' | 'unverify'>('verify');
  const [kcEnableStatus, setKcEnableStatus] = useState<boolean>(false);
  const [kcStatusAction, setKcStatusAction] = useState<'enable' | 'disable'>('enable');

  // Feedback Doc & GitHub Issue
  const [docUrl, setDocUrl] = useState<string>('');
  const [assigneeEmail, setAssigneeEmail] = useState<string>('hung.nguyenmanh@dtt.vn');
  const [rowIndex, setRowIndex] = useState<number>(2);
  const [githubTitle, setGithubTitle] = useState<string>('[FEAT] Tạo luồng tự động mới cho hệ thống');
  const [githubAssignee, setGithubAssignee] = useState<string>('nguyenthetrung5-PTV');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // =========================================================================
  // 🛡️ STATE CONFIRMATION MODAL (XÁC NHẬN AN TOÀN TRƯỚC KHI CHẠY)
  // =========================================================================
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [preparedPayload, setPreparedPayload] = useState<{
    bot_type: BotType | 'lms_playwright';
    payload_data: Record<string, any>;
    summary: PreparedTaskSummary;
  } | null>(null);

  // Nạp metadata ban đầu
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

        setSchoolsList(schools || []);
        if (wsCats && wsCats.length > 0) setWorkspaceCategoriesList(wsCats);
        setWorkspaceCoursesList(wsCourses || []);

        if (lmsCats && lmsCats.length > 0) {
          setLmsCategoriesList(lmsCats);
          setLmsCourseCategory(lmsCats[0]);
        }
        setLmsCoursesList(lmsCourses || []);

        if (lmsCourses && lmsCourses.length > 0) {
          const firstCat = lmsCats && lmsCats.length > 0 ? lmsCats[0] : lmsCourses[0].category;
          const matchFirst = lmsCourses.filter((c) => c.category === firstCat);
          const activeFirst = matchFirst.length > 0 ? matchFirst[0] : lmsCourses[0];
          setLmsCourseId(activeFirst.course_id);
          setLmsCourseName(activeFirst.course_name);
          setLmsCourseCategory(activeFirst.category);
        }
      } catch (e) {
        console.warn('Lỗi nạp metadata:', e);
      }
    };
    loadAllMetadata();
  }, []);

  // Đóng Dropdown khi click ra ngoài
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
    if (workspaceMainCategory === 'approve') {
      if (approveSubFlow === 'approve_partner_contract') return 'partner';
      if (approveSubFlow === 'admin_approve_contract') return 'distributor';
      return 'school';
    }
    if (workspaceMainCategory === 'create_and_approve') {
      if (createApproveSubFlow === 'partner_create_chain') return 'partner';
      if (createApproveSubFlow === 'distributor_create_chain') return 'distributor';
      return 'school';
    }
    return 'school';
  }, [workspaceMainCategory, approveSubFlow, createApproveSubFlow]);

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

  const handleFetchCachedList = async () => {
    setIsScrapingLive(true);
    setScrapedPendingList([]);
    setParsedOrderCourses([]);
    setSelectedCachedItem(null);
    try {
      if (approveSubFlow === 'approve_school_order') {
        const res = await fetchApi<any>(`/workspace/cached-pending-orders`);
        const orders = res?.orders || [];
        setScrapedPendingList(orders);
        if (orders.length > 0) {
          toast.success(`⚡ [Cache] Đã nạp ${orders.length} đơn hàng trường học!`);
        } else {
          toast.info('Chưa có đơn hàng nào trong Cache.');
        }
      } else if (approveSubFlow === 'approve_partner_contract') {
        const res = await fetchApi<any>(`/workspace/cached-pending-contracts?contract_type=PRT`);
        const contracts = res?.contracts || [];
        setScrapedPendingList(contracts);
        if (contracts.length > 0) {
          toast.success(`⚡ [Cache] Đã nạp ${contracts.length} hợp đồng đối tác!`);
        }
      } else if (approveSubFlow === 'admin_approve_contract') {
        const res = await fetchApi<any>(`/workspace/cached-pending-contracts?contract_type=DST`);
        const contracts = res?.contracts || [];
        setScrapedPendingList(contracts);
        if (contracts.length > 0) {
          toast.success(`⚡ [Cache] Đã nạp ${contracts.length} hợp đồng quản trị!`);
        }
      }
    } catch (err) {
      toast.error('Lỗi đọc Cache: ' + (err as Error).message);
    } finally {
      setIsScrapingLive(false);
    }
  };

  useEffect(() => {
    if (workspaceMainCategory === 'approve') {
      handleFetchCachedList();
    }
  }, [approveSubFlow, workspaceMainCategory]);

  const handleTriggerSyncBackground = async () => {
    setIsSyncingBackground(true);
    try {
      const res = await fetchApi<any>('/workspace/sync-cache-now', { method: 'POST' });
      toast.success(res?.message || 'Đã kích hoạt bot cào ngầm 5 Distributor! Vui lòng chờ 30s rồi bấm nạp lại.');
    } catch (err) {
      toast.error('Lỗi kích hoạt quét: ' + (err as Error).message);
    } finally {
      setIsSyncingBackground(false);
    }
  };

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

      const entityQuery = entitySearchQuery.trim().toLowerCase();
      if (entityQuery) {
        if (currentEntityMode === 'school') {
          const matchSchool = (item.school_name || '').toLowerCase().includes(entityQuery) ||
            (item.school_code || '').toLowerCase().includes(entityQuery);
          if (!matchSchool) return false;
        } else if (currentEntityMode === 'partner') {
          const matchPartner = (item.partner_name || item.sender_name || '').toLowerCase().includes(entityQuery);
          if (!matchPartner) return false;
        } else if (currentEntityMode === 'distributor') {
          const matchDist = (item.distributor_name || item.sender_name || item.receiver_name || '').toLowerCase().includes(entityQuery) ||
            (item.distributor_code || '').toLowerCase().includes(entityQuery);
          if (!matchDist) return false;
        }
      }

      if (approveSubFlow === 'approve_school_order') {
        const orderQuery = targetOrderCode.trim().toLowerCase();
        if (orderQuery) {
          const matchCode = (item.order_code || item.data_id || '').toLowerCase().includes(orderQuery) ||
            (item.school_name || '').toLowerCase().includes(orderQuery);
          if (!matchCode) return false;
        }
      } else {
        const contractQuery = targetContractCode.trim().toLowerCase();
        if (contractQuery) {
          const matchCode = (item.contract_code || item.data_id || '').toLowerCase().includes(contractQuery) ||
            (item.partner_name || item.sender_name || '').toLowerCase().includes(contractQuery);
          if (!matchCode) return false;
        }
      }

      return true;
    });
  }, [scrapedPendingList, statusFilter, entitySearchQuery, currentEntityMode, approveSubFlow, targetOrderCode, targetContractCode]);

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

  // =========================================================================
  // 🛡️ BƯỚC 1: KIỂM TRA DỮ LIỆU & MỞ CONFIRMATION MODAL
  // =========================================================================
  const handleOpenConfirmModal = () => {
    let payload: Record<string, any> = {
      is_manual_dispatch: true,
      creator: 'Admin Studio',
    };

    let summary: PreparedTaskSummary = {
      engineName: '',
      actionTitle: '',
      targetEntity: '',
      detailsList: [],
    };

    let actualBotType: BotType | 'lms_playwright' = selectedBotType;

    if (selectedBotType === 'workspace_rpa') {
      summary.engineName = '🏢 Workspace RPA & LMS Pipeline';

      if (workspaceMainCategory === 'approve') {
        if (approveSubFlow === 'approve_school_order') {
          if (!targetOrderCode) {
            toast.error('Vui lòng nhập hoặc chọn mã đơn hàng trường cần duyệt!');
            return;
          }
          const resolvedSchoolName = selectedCachedItem?.school_name || selectedSchool?.school_name || 'Tự động truy vết theo Order';
          const resolvedPartnerName = selectedCachedItem?.partner_name || selectedSchool?.partner_name || 'Tự động truy vết';

          payload = {
            action: 'approve_school_order_standalone',
            order_code: targetOrderCode,
            school_name: resolvedSchoolName,
            partner_name: resolvedPartnerName,
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : undefined,
          };

          summary.actionTitle = 'Phê Duyệt Đơn Hàng Trường Học (School Order)';
          summary.targetEntity = `Mã Đơn: ${targetOrderCode}`;
          summary.detailsList = [
            `Trường học: ${resolvedSchoolName}`,
            `Đối tác quản lý: ${resolvedPartnerName}`,
            `Số lượng môn học bóc tách: ${parsedOrderCourses.length} môn`,
          ];
        } else if (approveSubFlow === 'approve_partner_contract') {
          if (!targetContractCode) {
            toast.error('Vui lòng nhập hoặc chọn mã hợp đồng đối tác cần duyệt!');
            return;
          }
          const resolvedPartnerName = selectedCachedItem?.partner_name || selectedCachedItem?.sender_name || selectedPartner?.name || 'Tự động truy vết';
          const resolvedDistName = selectedCachedItem?.distributor_name || selectedCachedItem?.receiver_name || selectedDistributor?.name || 'Tự động truy vết';
          const resolvedDistCode = selectedCachedItem?.distributor_code || selectedDistributor?.code;

          payload = {
            action: 'approve_partner_contract_standalone',
            contract_code: targetContractCode,
            partner_name: resolvedPartnerName,
            distributor_name: resolvedDistName,
            distributor_code: resolvedDistCode,
            courses: parsedOrderCourses.length > 0 ? parsedOrderCourses : undefined,
          };

          summary.actionTitle = 'Phê Duyệt Hợp Đồng Đối Tác (PRT Contract)';
          summary.targetEntity = `Mã Hợp Đồng: ${targetContractCode}`;
          summary.detailsList = [
            `Đối tác gửi: ${resolvedPartnerName}`,
            `Nhà phân phối nhận: ${resolvedDistName}`,
          ];
        } else if (approveSubFlow === 'admin_approve_contract') {
          if (!targetContractCode) {
            toast.error('Vui lòng nhập hoặc chọn mã hợp đồng quản trị cần duyệt!');
            return;
          }
          const resolvedDistName = selectedCachedItem?.distributor_name || selectedCachedItem?.sender_name || selectedDistributor?.name || 'Tự động truy vết';
          const resolvedDistCode = selectedCachedItem?.distributor_code || selectedDistributor?.code;

          payload = {
            action: 'admin_approve_contract',
            contract_code: targetContractCode,
            distributor_name: resolvedDistName,
            distributor_code: resolvedDistCode,
            justification: adminJustification,
          };

          summary.actionTitle = 'Sales Admin Phê Duyệt Hợp Đồng Quản Trị (DST Contract)';
          summary.targetEntity = `Mã Hợp Đồng: ${targetContractCode}`;
          summary.detailsList = [
            `Nhà phân phối: ${resolvedDistName}`,
            `Lý do phê duyệt: "${adminJustification.slice(0, 45)}..."`,
          ];
        }
      } else if (workspaceMainCategory === 'create_and_approve') {
        if (createApproveSubFlow === 'end_to_end') {
          if (!selectedSchool) {
            toast.error('Vui lòng chọn trường học áp dụng từ danh sách!');
            return;
          }
          payload = {
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

        payload = {
          action: 'bulk_account_creation',
          school_name: selectedSchool.school_name,
          school_code: selectedSchool.school_code,
          filename: uploadedAccountsFile.name,
          file_size_kb: Math.round(uploadedAccountsFile.size / 1024),
        };

        summary.actionTitle = 'Tạo Tài Khoản Hàng Loạt Từ File Excel (Hybrid Fast-Check)';
        summary.targetEntity = selectedSchool.school_name;
        summary.detailsList = [
          `File tải lên: ${uploadedAccountsFile.name} (${Math.round(uploadedAccountsFile.size / 1024)} KB)`,
          `Trường thụ hưởng: ${selectedSchool.school_name} (Mã: ${selectedSchool.school_code})`,
          `Chế độ: Tự động trích xuất + Kiểm tra nhanh 15s (Tải file kết quả ngay khi xong)`,
        ];
      } else if (workspaceMainCategory === 'lms_enroll') {
        actualBotType = 'lms_playwright';
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

        summary.engineName = '🎓 PLearn Moodle LMS Direct Enroller';
        summary.actionTitle = 'Ghi Danh & Phân Quyền Khóa Học Trực Tiếp';
        summary.targetEntity = `${lmsCourseName} (ID: ${lmsCourseId})`;
        summary.detailsList = [
          `Tổng số tài khoản: ${totalEmails} người dùng`,
          `Thời hạn: ${lmsStartDate} ➔ ${lmsEndDate}`,
          `Tên Group: ${lmsGroupName.trim() || '(Không gán group)'}`,
        ];
      }
    } else if (selectedBotType === 'keycloak_api') {
      const actions: string[] = [];
      const conf: Record<string, any> = { target_email: kcTargetEmail };
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
      summary.actionTitle = 'Quản Trị Danh Tính & Mật Khẩu Người Dùng';
      summary.targetEntity = kcTargetEmail;
      summary.detailsList = details.length > 0 ? details : ['Chưa chọn hành động can thiệp nào'];
    } else if (selectedBotType === 'feedback_doc_triage') {
      payload = {
        action: 'comment_and_assign',
        doc_url: docUrl,
        assignee_email: assigneeEmail,
        row_index: rowIndex,
      };

      summary.engineName = '🤖 Feedback Sheet & Google Doc Triage';
      summary.actionTitle = 'Đọc Tài Liệu & @Mention Giao Việc';
      summary.targetEntity = `Dòng #${rowIndex} trên Sheet`;
      summary.detailsList = [`Google Doc: ${docUrl || 'N/A'}`, `Gán nhân sự: ${assigneeEmail}`];
    } else if (selectedBotType === 'github_issue_creator') {
      payload = {
        action: 'create_github_issue',
        title: githubTitle,
        assignees: [githubAssignee],
      };

      summary.engineName = '🐙 GitHub Issue Dispatcher';
      summary.actionTitle = 'Khởi Tạo Bug Report Trong Private Repo';
      summary.targetEntity = githubTitle;
      summary.detailsList = [`Người phụ trách: @${githubAssignee}`, `Kho lưu trữ: PTV-TechHub/Pythaverse2026`];
    }

    setPreparedPayload({
      bot_type: actualBotType,
      payload_data: payload,
      summary,
    });
    setIsConfirmModalOpen(true);
  };

  // =========================================================================
  // 🚀 BƯỚC 2: XÁC NHẬN & CHẠY WORKER NGẦM LẬP TỨC (DIRECT 1-CLICK DISPATCH)
  // =========================================================================
  const handleConfirmExecute = async () => {
    if (!preparedPayload) return;

    setSubmitting(true);
    try {
      let finalPayloadData = { ...preparedPayload.payload_data };

      // 🟢 Nếu là tạo tài khoản hàng loạt, upload file lên Supabase Storage trước
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

      await fetchApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: null,
          bot_type: preparedPayload.bot_type,
          payload_data: finalPayloadData,
          run_immediately: true,
          approval_status: 'approved',
        }),
      });

      setIsConfirmModalOpen(false);

      toast.success(
        <div className="space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Đã kích hoạt Worker tạo tài khoản!</span>
          </div>
          <div className="text-xs text-slate-300">Bot đang nộp batch và chạy Fast-Check dưới nền.</div>
          <button
            onClick={() => navigate('/bots')}
            className="text-violet-400 hover:text-violet-300 underline text-xs font-semibold cursor-pointer block mt-1 transition"
          >
            Mở Bot Command Center xem Live Terminal & Tải kết quả ➔
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
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header Trang */}
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
          onClick={() => navigate('/bots')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-xs transition"
        >
          <Terminal className="w-3.5 h-3.5 text-violet-500" />
          <span>Xem Bot Center</span>
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
                  <span className={`text-[10px] ${isSel ? 'text-violet-100' : 'text-slate-400'}`}>{tab.desc}</span>
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
                        setParsedOrderCourses([]);
                        setSelectedCachedItem(null);
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

            {/* TÌM KIẾM ĐỐI TƯỢNG ĐỘNG */}
            {workspaceMainCategory !== 'lms_enroll' && (
              <div className="space-y-2 relative" ref={entityDropdownRef}>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    {currentEntityMode === 'school' ? (
                      <Building2 className="w-3.5 h-3.5 text-violet-600" />
                    ) : currentEntityMode === 'partner' ? (
                      <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <Store className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    <span>
                      {currentEntityMode === 'school'
                        ? 'Trường học áp dụng (Lọc theo trường):'
                        : currentEntityMode === 'partner'
                          ? 'Đối tác phụ trách (Lọc theo đối tác):'
                          : 'Nhà phân phối (Lọc theo nhà phân phối):'}
                    </span>
                  </span>
                  {(selectedSchool || selectedPartner || selectedDistributor) && (
                    <span className="text-xs text-violet-600 font-bold font-mono">
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
                    placeholder={
                      currentEntityMode === 'school'
                        ? 'Tất cả trường học (Gõ để tìm kiếm & lọc danh sách)...'
                        : currentEntityMode === 'partner'
                          ? 'Tất cả đối tác (Gõ để tìm kiếm & lọc danh sách)...'
                          : 'Tất cả nhà phân phối (Gõ để tìm kiếm & lọc danh sách)...'
                    }
                    className="w-full pl-10 pr-10 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition shadow-2xs"
                  />
                  {entitySearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setEntitySearchQuery('');
                        setSelectedSchool(null);
                        setSelectedPartner(null);
                        setSelectedDistributor(null);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown Gợi Ý Đối Tượng */}
                {isEntityDropdownOpen && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1">
                    {currentEntityMode === 'school' &&
                      schoolsList
                        .filter((s) => s.school_name.toLowerCase().includes(entitySearchQuery.toLowerCase()))
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
                            className="w-full text-left p-3 rounded-xl text-xs hover:bg-violet-50 dark:hover:bg-slate-700/60 flex items-center justify-between cursor-pointer transition"
                          >
                            <div>
                              <div className="font-bold text-slate-800 dark:text-slate-200">{s.school_name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                Mã: {s.school_code} | Tuyến: {s.partner_name} ➔ {s.distributor_name}
                              </div>
                            </div>
                            {selectedSchool?.school_code === s.school_code && (
                              <Check className="w-4 h-4 text-violet-600" />
                            )}
                          </button>
                        ))}

                    {currentEntityMode === 'partner' &&
                      uniquePartners
                        .filter((p) => p.name.toLowerCase().includes(entitySearchQuery.toLowerCase()))
                        .map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSelectedPartner(p);
                              setEntitySearchQuery(p.name);
                              setIsEntityDropdownOpen(false);
                            }}
                            className="w-full text-left p-3 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-700/60 flex items-center justify-between cursor-pointer transition"
                          >
                            <div>
                              <div className="font-bold text-slate-800 dark:text-slate-200">{p.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">Mã đối tác: {p.code}</div>
                            </div>
                            {selectedPartner?.name === p.name && <Check className="w-4 h-4 text-indigo-600" />}
                          </button>
                        ))}

                    {currentEntityMode === 'distributor' &&
                      uniqueDistributors
                        .filter((d) => d.name.toLowerCase().includes(entitySearchQuery.toLowerCase()))
                        .map((d, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSelectedDistributor(d);
                              setEntitySearchQuery(d.name);
                              setIsEntityDropdownOpen(false);
                            }}
                            className="w-full text-left p-3 rounded-xl text-xs hover:bg-amber-50 dark:hover:bg-slate-700/60 flex items-center justify-between cursor-pointer transition"
                          >
                            <div>
                              <div className="font-bold text-slate-800 dark:text-slate-200">{d.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">Mã phân phối: {d.code}</div>
                            </div>
                            {selectedDistributor?.name === d.name && <Check className="w-4 h-4 text-amber-600" />}
                          </button>
                        ))}
                  </div>
                )}

                {selectedSchool && currentEntityMode === 'school' && (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-violet-200/80 dark:border-violet-800/50 text-xs font-mono text-violet-700 dark:text-violet-300 flex items-center gap-2 shadow-2xs">
                    <Layers className="w-4 h-4 text-violet-500 shrink-0" />
                    <span className="truncate">{selectedSchool.full_lineage}</span>
                  </div>
                )}
              </div>
            )}

            {/* MỤC 1: PHÊ DUYỆT */}
            {workspaceMainCategory === 'approve' && (
              <div className="space-y-4">
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
                        setTargetOrderCode('');
                        setTargetContractCode('');
                        setSelectedCachedItem(null);
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
                  {/* Thanh điều khiển & Nút Sync */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-bold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-violet-600" />
                      <span>
                        {approveSubFlow === 'approve_school_order'
                          ? 'Mã Đơn Hàng Trường (Tìm & Duyệt):'
                          : approveSubFlow === 'approve_partner_contract'
                            ? 'Mã Hợp Đồng Đối Tác (Tìm & Duyệt):'
                            : 'Mã Hợp Đồng Quản Trị (Tìm & Duyệt):'}
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSyncingBackground}
                        onClick={handleTriggerSyncBackground}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold transition cursor-pointer disabled:opacity-50"
                        title="Kích hoạt bot Playwright quét mới 5 Distributor"
                      >
                        {isSyncingBackground ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-amber-500" />}
                        <span>Đồng Bộ Mới</span>
                      </button>

                      <button
                        type="button"
                        disabled={isScrapingLive}
                        onClick={handleFetchCachedList}
                        className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        {isScrapingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                        <span>Nạp Dữ Liệu Cache</span>
                      </button>
                    </div>
                  </div>

                  {/* Input mã đơn/hợp đồng */}
                  <div className="relative">
                    {approveSubFlow === 'approve_school_order' ? (
                      <input
                        type="text"
                        value={targetOrderCode}
                        onChange={(e) => setTargetOrderCode(e.target.value)}
                        placeholder="Gõ để lọc hoặc chọn mã đơn hàng (VD: SCH-10266...)"
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-violet-300 dark:border-violet-700 rounded-xl p-3 pr-10 text-xs font-mono font-bold outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={targetContractCode}
                        onChange={(e) => setTargetContractCode(e.target.value)}
                        placeholder={
                          approveSubFlow === 'approve_partner_contract'
                            ? 'Gõ để lọc hoặc chọn mã hợp đồng (VD: PRT-2026...)'
                            : 'Gõ để lọc hoặc chọn mã hợp đồng (VD: DST-2025...)'
                        }
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-violet-300 dark:border-violet-700 rounded-xl p-3 pr-10 text-xs font-mono font-bold outline-none"
                      />
                    )}

                    {(targetOrderCode || targetContractCode) && (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetOrderCode('');
                          setTargetContractCode('');
                          setSelectedCachedItem(null);
                          setParsedOrderCourses([]);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {approveSubFlow === 'admin_approve_contract' && (
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                        <span>Lý Do Phê Duyệt (Tối thiểu 15 ký tự):</span>
                        <span className="text-[11px] text-slate-400 font-mono">{adminJustification.length} ký tự</span>
                      </label>
                      <textarea
                        rows={2}
                        value={adminJustification}
                        onChange={(e) => setAdminJustification(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs outline-none"
                      />
                    </div>
                  )}

                  {/* DANH SÁCH LỌC THEO TỪ KHÓA & TRẠNG THÁI */}
                  {scrapedPendingList.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Filter className="w-3.5 h-3.5 text-violet-600" />
                          <span>
                            Kết Quả Lọc ({filteredCacheList.length}/{scrapedPendingList.length}):
                          </span>
                        </div>

                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[11px] font-semibold">
                          {[
                            { id: 'pending', label: '⏳ Chờ duyệt' },
                            { id: 'approved', label: '✅ Đã duyệt' },
                            { id: 'rejected', label: '❌ Bị từ chối' },
                            { id: 'all', label: '📋 Tất cả' },
                          ].map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => setStatusFilter(st.id as any)}
                              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${statusFilter === st.id
                                ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 font-bold shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="max-h-52 overflow-y-auto space-y-1.5 p-1.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                        {filteredCacheList.length === 0 ? (
                          <div className="text-center py-4 text-xs text-slate-400">
                            Không có đơn hàng / hợp đồng nào khớp với từ khóa tìm kiếm.
                          </div>
                        ) : (
                          filteredCacheList.map((item, pIdx) => {
                            const itemCode = item.order_code || item.contract_code || item.data_id;
                            const isCurrent = targetOrderCode === itemCode || targetContractCode === itemCode;
                            const isPending =
                              (item.status || '').toLowerCase().includes('pending') ||
                              (item.status || '').toLowerCase().includes('awaiting');

                            return (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => {
                                  setSelectedCachedItem(item);

                                  if (approveSubFlow === 'approve_school_order') {
                                    setTargetOrderCode(itemCode || '');
                                    if (item.courses_data && item.courses_data.length > 0) {
                                      setParsedOrderCourses(item.courses_data);
                                    } else {
                                      handleLoadOrderDetails(itemCode || '', item.school_name);
                                    }
                                  } else {
                                    setTargetContractCode(itemCode || '');
                                    if (item.courses_data) setParsedOrderCourses(item.courses_data);
                                  }
                                  toast.success(`Đã chọn: ${itemCode}`);
                                }}
                                className={`w-full text-left p-3 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${isCurrent
                                  ? 'bg-violet-100 dark:bg-violet-950/70 border border-violet-300 text-violet-800 dark:text-violet-200 font-bold shadow-2xs'
                                  : 'hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                              >
                                <div>
                                  <div className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {itemCode}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {item.school_name ? `${item.school_name} | ` : ''}
                                    {item.partner_name || item.sender_name ? `${item.partner_name || item.sender_name} | ` : ''}
                                    {item.order_date || item.contract_date || item.created_at || ''}
                                  </div>
                                </div>
                                <span
                                  className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${isPending
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    }`}
                                >
                                  {item.status || 'Chờ duyệt'}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Chi tiết môn học Order */}
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
                            <span>Đang bóc tách chi tiết...</span>
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
                                  Phân loại: {pc.category || 'SWRP'} | Hạn:{' '}
                                  {pc.start_date || pc.course_enroll_start_date || '2026-09-01'} ➔{' '}
                                  {pc.end_date || pc.course_enroll_end_date || '2027-05-31'}
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 rounded-lg font-extrabold border border-sky-200 dark:border-sky-700">
                                {pc.licenses || pc.course_count || 1} Giấy phép
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-400 text-xs text-center">
                          Click chọn một đơn hàng từ danh sách trên để xem chi tiết môn học và số lượng License.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MỤC 2: TẠO MỚI & DUYỆT CHUỖI */}
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
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Thông Tin Liên Hệ:</label>
                    <input
                      type="text"
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Ghi Chú Bổ Sung:</label>
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
                    const filteredCourses = workspaceCoursesList.filter((c) => c.category === cRow.category);
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
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold cursor-pointer outline-none"
                            >
                              {workspaceCategoriesList.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Chọn môn học ({filteredCourses.length} môn):
                            </label>
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
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold cursor-pointer outline-none truncate"
                            >
                              {filteredCourses.map((c) => (
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
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Kết Thúc (1 Năm):</label>
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

            {/* MỤC 3: TẠO TÀI KHOẢN HÀNG LOẠT */}
            {workspaceMainCategory === 'bulk_accounts' && (
              <div className="p-6 bg-white dark:bg-slate-800/90 rounded-3xl border border-violet-200 dark:border-slate-700 space-y-4 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-300 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-800 dark:text-slate-200">
                      Nộp File Excel Tạo Tài Khoản Hàng Loạt
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Trường áp dụng:{' '}
                      <span className="font-bold text-violet-600 font-mono">
                        {selectedSchool?.school_name || 'Vui lòng chọn trường ở ô trên'}
                      </span>
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
                      toast.success(`Đã chọn file: ${file.name} (${Math.round(file.size / 1024)} KB)`);
                    }
                  }}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-violet-300 dark:border-violet-700/80 hover:border-violet-500 dark:hover:border-violet-500 rounded-2xl p-8 text-center cursor-pointer transition bg-violet-50/40 dark:bg-violet-950/20 flex flex-col items-center justify-center gap-2"
                >
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-full shadow-2xs text-violet-600 dark:text-violet-300">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  {uploadedAccountsFile ? (
                    <div className="space-y-1">
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center justify-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>{uploadedAccountsFile.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Kích thước: {Math.round(uploadedAccountsFile.size / 1024)} KB | Bấm để chọn file khác
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="font-bold text-xs text-slate-800 dark:text-slate-200">
                        Bấm hoặc kéo thả file Excel (.xlsx, .csv) vào đây
                      </div>
                      <div className="text-[11px] text-slate-400">
                        File mẫu chuẩn gồm 7 cột thông tin học sinh và giáo viên.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MỤC 4: GHI DANH LMS */}
            {workspaceMainCategory === 'lms_enroll' && (
              <div className="p-6 bg-white dark:bg-slate-800/90 rounded-3xl border border-emerald-200/80 dark:border-emerald-800/50 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 rounded-xl">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>Ghi Danh & Gia Hạn Khóa Học PLearn LMS (Demo/Training)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-bold">
                          learn.pythaverse.space
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Dữ liệu khóa học được đồng bộ chuẩn xác từ bảng{' '}
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">lms_courses</span> ({lmsCoursesList.length} môn).
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">
                      Phân loại ({lmsCategoriesList.length} Categories):
                    </label>
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
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold outline-none truncate cursor-pointer"
                    >
                      {lmsCategoriesList.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">
                      Chọn khóa học LMS ({lmsCoursesList.filter((c) => c.category === lmsCourseCategory).length} môn trong danh mục):
                    </label>
                    <select
                      value={lmsCourseId}
                      onChange={(e) => {
                        const cId = parseInt(e.target.value);
                        setLmsCourseId(cId);
                        const target = lmsCoursesList.find((c) => c.course_id === cId);
                        if (target) setLmsCourseName(target.course_name);
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold outline-none truncate cursor-pointer"
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 sm:col-span-2">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-violet-600" />
                      <span>Thời Hạn Quyền Truy Cập (Mặc Định 1 Năm):</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Bắt Đầu:</label>
                        <input
                          type="text"
                          value={lmsStartDate}
                          onChange={(e) => setLmsStartDate(e.target.value)}
                          placeholder="dd-mm-yyyy"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Hết Hạn:</label>
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

                  <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-between">
                    <div>
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tên Nhóm / Group (Tùy chọn):</span>
                      </label>
                      <p className="text-[10px] text-slate-500 mt-1">Tự động gom các học viên vào Group trong Moodle.</p>
                    </div>
                    <input
                      type="text"
                      value={lmsGroupName}
                      onChange={(e) => setLmsGroupName(e.target.value)}
                      placeholder="VD: DEMO_TEACHER_2026"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Phương Thức Gán Vai Trò:</span>
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

                  {lmsRoleMode === 'same_role' ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Chọn Vai Trò Áp Dụng:</label>
                        <select
                          value={lmsSingleRole}
                          onChange={(e) => setLmsSingleRole(e.target.value as any)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none cursor-pointer"
                        >
                          <option value="student">🎓 Học Viên (Student)</option>
                          <option value="non_editing_teacher">👨‍🏫 Giáo Viên Trợ Giảng (Non-editing Teacher)</option>
                          <option value="manager">🛡️ Quản Lý Khóa Học (Manager)</option>
                        </select>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Danh Sách Email (Mỗi dòng 1 email):
                          </label>
                          <span className="text-[10px] font-mono font-bold text-emerald-600">
                            {lmsBulkSingleEmails.split('\n').filter((x) => x.trim().length > 0).length} emails
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={lmsBulkSingleEmails}
                          onChange={(e) => setLmsBulkSingleEmails(e.target.value)}
                          placeholder="user1@pythaverse.space&#10;user2@pythaverse.space"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-bold text-sky-700 dark:text-sky-300">🎓 Học Viên (Student):</label>
                          <span className="text-[10px] font-mono text-sky-600 font-bold">
                            {lmsStudentEmails.split('\n').filter((x) => x.trim().length > 0).length}
                          </span>
                        </div>
                        <textarea
                          rows={5}
                          value={lmsStudentEmails}
                          onChange={(e) => setLmsStudentEmails(e.target.value)}
                          placeholder="student1@pythaverse.space&#10;student2@pythaverse.space"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            👨‍🏫 Trợ Giảng (Non-editing Teacher):
                          </label>
                          <span className="text-[10px] font-mono text-emerald-600 font-bold">
                            {lmsTeacherEmails.split('\n').filter((x) => x.trim().length > 0).length}
                          </span>
                        </div>
                        <textarea
                          rows={5}
                          value={lmsTeacherEmails}
                          onChange={(e) => setLmsTeacherEmails(e.target.value)}
                          placeholder="teacher1@pythaverse.space&#10;teacher2@pythaverse.space"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-bold text-purple-700 dark:text-purple-300">🛡️ Quản Lý (Manager):</label>
                          <span className="text-[10px] font-mono text-purple-600 font-bold">
                            {lmsManagerEmails.split('\n').filter((x) => x.trim().length > 0).length}
                          </span>
                        </div>
                        <textarea
                          rows={5}
                          value={lmsManagerEmails}
                          onChange={(e) => setLmsManagerEmails(e.target.value)}
                          placeholder="manager1@pythaverse.space"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Keycloak Config */}
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
                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition ${kcForceChange ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 dark:border-slate-600'
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
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">2. Xác Thực Email</div>
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

        {/* Feedback Sheet */}
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

        {/* GitHub Issue */}
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

        {/* 🟢 Nút Bấm Chính: Mở Confirmation Modal để kiểm tra và duyệt ngay */}
        <div className="pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={handleOpenConfirmModal}
            className="w-full py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-extrabold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
          >
            <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
            <span>Kiểm Tra & Kích Hoạt Worker Chạy Ngay (1-Click)</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 🛡️ CONFIRMATION MODAL (XÁC NHẬN AN TOÀN TRƯỚC KHI THỰC THI THẬT)       */}
      {/* ===================================================================== */}
      {isConfirmModalOpen && preparedPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-7 space-y-5">
            {/* Header Modal */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
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

            {/* Thông Tin Tóm Tắt Nghiệp Vụ */}
            <div className="p-4 rounded-2xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-800/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-violet-900 dark:text-violet-200">
                  {preparedPayload.summary.engineName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-200 dark:bg-violet-900 text-violet-800 dark:text-violet-200 font-mono font-bold">
                  {preparedPayload.bot_type}
                </span>
              </div>

              <div>
                <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  {preparedPayload.summary.actionTitle}
                </div>
                <div className="text-xs text-violet-700 dark:text-violet-300 font-bold font-mono mt-0.5">
                  👉 {preparedPayload.summary.targetEntity}
                </div>
              </div>

              {preparedPayload.summary.detailsList.length > 0 && (
                <div className="pt-2 border-t border-violet-200/60 dark:border-violet-800/40 space-y-1">
                  {preparedPayload.summary.detailsList.map((dt, idx) => (
                    <div key={idx} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                      <span>{dt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Khung Xem Trước JSON Payload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5 text-violet-500" />
                  <span>Tham Số Thực Thi (Payload JSON):</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Tự động đồng bộ</span>
              </div>
              <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl text-[11px] font-mono overflow-x-auto max-h-36 border border-slate-800 scrollbar-thin">
                {JSON.stringify(preparedPayload.payload_data, null, 2)}
              </pre>
            </div>

            {/* Nút Điều Khiển Trong Modal */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Hủy Bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmExecute}
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-extrabold transition shadow-md shadow-violet-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
        </div>
      )}
    </div>
  );
};