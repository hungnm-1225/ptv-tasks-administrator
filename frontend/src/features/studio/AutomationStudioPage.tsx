// frontend/src/features/studio/AutomationStudioPage.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
  UserX,
  Layers,
  ArrowRight,
  Clock,
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
  Sparkles,
  SlidersHorizontal,
  Upload,
  Download,
  Info,
  ChevronRight,
  ClipboardCheck,
} from 'lucide-react';
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

interface PreparedTaskSummary {
  engineName: string;
  actionTitle: string;
  targetEntity: string;
  detailsList: string[];
}

// ⚡ HÀM TRỢ THỦ PERSISTENT CACHE (LƯU LOCALSTORAGE - SỐNG SÓT QUA CẢ CTRL+SHIFT+R)
const getPersistedCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(`ptv_studio_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const setPersistedCache = (key: string, data: any) => {
  try {
    localStorage.setItem(`ptv_studio_${key}`, JSON.stringify(data));
  } catch {
    // Bỏ qua nếu đầy quota storage
  }
};

export const AutomationStudioPage: React.FC = () => {
  const navigate = useNavigate();

  // 3 Cỗ Máy Tự Động Hóa Chính
  const [selectedBotType, setSelectedBotType] = useState<'workspace_rpa' | 'keycloak_api' | 'feedback_doc_triage'>('workspace_rpa');

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
  const [showAutoTopupSettings, setShowAutoTopupSettings] = useState<boolean>(false);

  // Tìm kiếm & Item được chọn
  const [universalSearchQuery, setUniversalSearchQuery] = useState<string>('');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [selectedCachedItem, setSelectedCachedItem] = useState<ScrapedPendingItem | null>(null);

  // Lý do phê duyệt Sales Admin
  const [adminJustification, setAdminJustification] = useState<string>(
    'Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub'
  );

  // ⚡ KHỞI TẠO DANH SÁCH NGAY TỪ LOCALSTORAGE (0MS TUYỆT ĐỐI)
  const initialCacheList = useMemo(() => {
    return getPersistedCache<ScrapedPendingItem[]>(`list_${approveSubFlow}`) || [];
  }, [approveSubFlow]);

  const [isScrapingLive, setIsScrapingLive] = useState<boolean>(initialCacheList.length === 0);
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState<boolean>(false);
  const [scrapedPendingList, setScrapedPendingList] = useState<ScrapedPendingItem[]>(initialCacheList);
  const [parsedOrderCourses, setParsedOrderCourses] = useState<any[]>([]);

  // Bộ lọc trạng thái
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Metadata Workspace & LMS khởi tạo từ LocalStorage
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>(() => getPersistedCache<HierarchySchoolItem[]>('schools') || []);
  const [workspaceCategoriesList, setWorkspaceCategoriesList] = useState<string[]>(() => getPersistedCache<string[]>('wsCats') || ['SWRP', 'IR', 'ASP', 'Other']);
  const [workspaceCoursesList, setWorkspaceCoursesList] = useState<CourseItem[]>(() => getPersistedCache<CourseItem[]>('wsCourses') || []);

  const [lmsCategoriesList, setLmsCategoriesList] = useState<string[]>(() => getPersistedCache<string[]>('lmsCats') || []);
  const [lmsCoursesList, setLmsCoursesList] = useState<CourseItem[]>(() => getPersistedCache<CourseItem[]>('lmsCourses') || []);
  const [lmsCourseCategory, setLmsCourseCategory] = useState<string>('');
  const [lmsCourseId, setLmsCourseId] = useState<number>(0);
  const [lmsCourseName, setLmsCourseName] = useState<string>('');
  const [lmsGroupName, setLmsGroupName] = useState<string>('');

  // Đối tượng chọn cho luồng "Tạo & Duyệt"
  const [selectedSchool, setSelectedSchool] = useState<HierarchySchoolItem | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{ name: string; code: string } | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<{ name: string; code: string } | null>(null);

  const [entitySearchQuery, setEntitySearchQuery] = useState<string>('');
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState<boolean>(false);
  const entityDropdownRef = useRef<HTMLDivElement | null>(null);

  // File Upload
  const [uploadedAccountsFile, setUploadedAccountsFile] = useState<File | null>(null);
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

  // LMS Enroll Settings
  const [lmsStartDate, setLmsStartDate] = useState<string>(getFormattedDate(today));
  const [lmsEndDate, setLmsEndDate] = useState<string>(getFormattedDate(nextYear));
  const [lmsRoleMode, setLmsRoleMode] = useState<'same_role' | 'multi_role'>('multi_role');
  const [lmsSingleRole, setLmsSingleRole] = useState<'student' | 'non_editing_teacher' | 'manager'>('student');
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
    bot_type: BotType | 'lms_playwright';
    payload_data: Record<string, any>;
    summary: PreparedTaskSummary;
  } | null>(null);

  // ⚡ SWR BACKGROUND FETCH (CẬP NHẬT NGẦM KHÔNG BLOCK UI)
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
          setPersistedCache('schools', schools);
          setSchoolsList(schools);
        }
        if (wsCats && wsCats.length > 0) {
          setPersistedCache('wsCats', wsCats);
          setWorkspaceCategoriesList(wsCats);
        }
        if (wsCourses) {
          setPersistedCache('wsCourses', wsCourses);
          setWorkspaceCoursesList(wsCourses);
        }
        if (lmsCats && lmsCats.length > 0) {
          setPersistedCache('lmsCats', lmsCats);
          setLmsCategoriesList(lmsCats);
          setLmsCourseCategory(lmsCats[0]);
        }
        if (lmsCourses && lmsCourses.length > 0) {
          setPersistedCache('lmsCourses', lmsCourses);
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
  }, []);

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

  // Đọc chi tiết Order
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

  // ⚡ SWR FETCH ĐƠN HÀNG VỚI LOCALSTORAGE
  const handleFetchCachedList = async () => {
    const localData = getPersistedCache<ScrapedPendingItem[]>(`list_${approveSubFlow}`);
    if (localData && localData.length > 0) {
      setScrapedPendingList(localData);
      setIsScrapingLive(false);
    } else {
      setIsScrapingLive(true);
    }

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

      setPersistedCache(`list_${approveSubFlow}`, freshData);
      setScrapedPendingList(freshData);
    } catch (err) {
      if (!localData) {
        toast.error('Lỗi đọc dữ liệu Cache: ' + (err as Error).message);
      }
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

    let actualBotType: BotType | 'lms_playwright' = selectedBotType;

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

        payload = {
          ...payload,
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
        {/* Stat 1: Tác Vụ Tự Động */}
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

        {/* Stat 2: Đơn Hàng & License */}
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

        {/* Stat 3: Tỷ Lệ Tự Động Hóa */}
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

        {/* Stat 4: Mục Tiêu Hệ Thống */}
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

      {/* 3. Bước 1: Chọn Cỗ Máy Tự Động Hóa (3 Pastel Bento Cards) */}
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
          <span className="text-[11px] text-slate-400">3 Động cơ khả dụng</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {/* Card 1: Workspace & LMS */}
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
                  Đơn Hàng, Hợp Đồng & LMS
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

          {/* Card 2: Keycloak IDP */}
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

          {/* Card 3: Feedback Sheet */}
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
                  Ghi Chú & Tag Doc Tự Động
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

            {/* 4 Core Workflow Tabs */}
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

              {/* Search Bar Bento */}
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
                    placeholder="Gõ từ khóa để lọc danh sách bên dưới (VD: SCH-..., PRT-..., DST-..., THCS Lê Quý Đôn, DTTE...)"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden transition-all"
                  />
                  {universalSearchQuery && (
                    <button
                      onClick={() => setUniversalSearchQuery('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Special Field: Sales Admin Reason for Hợp Đồng Quản Trị */}
              {approveSubFlow === 'admin_approve_contract' && (
                <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Lý Do Phê Duyệt Sales Admin: <span className="text-rose-500">* (Tối thiểu 15 ký tự)</span>
                    </label>
                    <span className={`text-[11px] font-mono font-medium ${adminJustification.trim().length >= 15 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
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

              {/* Order List Header & Status Filter Pills */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Danh Sách Đơn Hàng ({filteredCacheList.length}/{scrapedPendingList.length}):
                  </span>
                </div>

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

              {/* Dual-Pane: Interactive Order List & Detail Inspector */}
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
                              : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
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

                {/* Right Column: Detail Inspector Card */}
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

              {/* Collapsible Backup Settings */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-3.5 space-y-3">
                <button
                  onClick={() => setShowAutoTopupSettings(!showAutoTopupSettings)}
                  className="flex w-full items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
                    <span>
                      {showAutoTopupSettings ? 'Ẩn thiết lập dự phòng khi thiếu License' : 'Tùy chỉnh thông số tạo hợp đồng tự động (Khi thiếu License)'}
                    </span>
                  </div>
                  <span className="text-[11px] text-indigo-600 font-medium">
                    {showAutoTopupSettings ? 'Thu gọn' : 'Mở rộng'}
                  </span>
                </button>

                {showAutoTopupSettings && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Contact Info (Tạo đơn dự phòng):
                      </label>
                      <input
                        type="text"
                        value={contactInfo}
                        onChange={(e) => setContactInfo(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Ghi chú Contract Notes:
                      </label>
                      <input
                        type="text"
                        value={additionalNotes}
                        onChange={(e) => setAdditionalNotes(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WORKFLOW 2: TẠO & DUYỆT */}
          {workspaceMainCategory === 'create_and_approve' && (
            <div className="space-y-5 pt-2">
              {/* School Search Target */}
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

              {/* 3 Flow Mode Bento Cards */}
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

              {/* Contact info & notes */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                    Thông Tin Liên Hệ:
                  </label>
                  <input
                    type="text"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                    Ghi Chú Bổ Sung:
                  </label>
                  <input
                    type="text"
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
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

          {/* WORKFLOW 3: TẠO TÀI KHOẢN */}
          {workspaceMainCategory === 'bulk_accounts' && (
            <div className="space-y-5 pt-2">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Nộp File Excel Tạo Tài Khoản Hàng Loạt
                    </h3>
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
                      Trường áp dụng: {selectedSchool?.school_name || 'Vui lòng chọn trường ở ô trên'}
                    </p>
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
                      toast.success(`Đã nhận file: ${file.name}`);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${isDragging
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/80 hover:border-indigo-400'
                    }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 mb-3">
                    <Upload className="h-6 w-6" />
                  </div>

                  {uploadedAccountsFile ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {uploadedAccountsFile.name} ({Math.round(uploadedAccountsFile.size / 1024)} KB)
                      </p>
                      <p className="text-[11px] text-emerald-600 font-semibold">
                        Đã nạp file thành công. Sẵn sàng tạo tài khoản!
                      </p>
                      <span className="text-[10px] text-slate-400 block pt-1">
                        Bấm để chọn file khác thay thế
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Bấm hoặc kéo thả file Excel (.xlsx, .csv) vào đây
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        File mẫu chuẩn gồm 7 cột thông tin học sinh và giáo viên.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* WORKFLOW 4: GHI DANH LMS */}
          {workspaceMainCategory === 'lms_enroll' && (
            <div className="space-y-5 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        Ghi Danh & Gia Hạn Khóa Học PLearn LMS
                      </h3>
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        learn.pythaverse.space
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Dữ liệu khóa học từ bảng <span className="font-mono text-emerald-600">lms_courses</span> ({lmsCoursesList.length} môn).
                    </p>
                  </div>
                </div>
              </div>

              {/* Category & Course Selectors */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400">
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
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer"
                  >
                    {lmsCategoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400">
                    Chọn khóa học LMS ({lmsCoursesList.filter((c) => c.category === lmsCourseCategory).length} môn):
                  </label>
                  <select
                    value={lmsCourseId}
                    onChange={(e) => {
                      const cId = parseInt(e.target.value);
                      setLmsCourseId(cId);
                      const target = lmsCoursesList.find((c) => c.course_id === cId);
                      if (target) setLmsCourseName(target.course_name);
                    }}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white truncate cursor-pointer"
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

              {/* Access Duration & Group Name */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-3.5 space-y-2">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Thời Hạn Quyền Truy Cập (Mặc Định 1 Năm):</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Ngày bắt đầu:</span>
                      <input
                        type="text"
                        value={lmsStartDate}
                        onChange={(e) => setLmsStartDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Ngày hết hạn:</span>
                      <input
                        type="text"
                        value={lmsEndDate}
                        onChange={(e) => setLmsEndDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-3.5 space-y-2">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Tên Nhóm / Group (Tùy chọn):</span>
                  </label>
                  <span className="text-[10px] text-slate-400 block">Tự động gom các học viên vào Group.</span>
                  <input
                    type="text"
                    value={lmsGroupName}
                    onChange={(e) => setLmsGroupName(e.target.value)}
                    placeholder="VD: DEMO_TEACHER_2026"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Role Assignment Mode */}
              <div className="space-y-3 pt-1">
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
                        <span>🧑‍🏫 Trợ Giảng (Non-editing Teacher):</span>
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
                        <option value="non_editing_teacher">🧑‍🏫 Trợ Giảng (Non-editing Teacher)</option>
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
            <input
              type="text"
              value={kcTargetEmail}
              onChange={(e) => setKcTargetEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:bg-white focus:outline-hidden"
            />
          </div>

          {/* 3 Action Bento Cards with iOS Toggles */}
          <div className="space-y-3.5">
            {/* Action 1: Password Reset */}
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

            {/* Action 2: Email Verification */}
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

            {/* Action 3: Account Active Status */}
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

      {/* 6. Feedback Sheet Engine Workplace */}
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

      {/* 7. Sticky 1-Click Execution Bar */}
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

      {/* 8. Confirmation Modal */}
      {isConfirmModalOpen && preparedPayload && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setIsConfirmModalOpen(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-5 my-auto"
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
        </div>
      )}
    </motion.div>
  );
};