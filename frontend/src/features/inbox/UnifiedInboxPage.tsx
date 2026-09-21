// frontend/src/features/inbox/UnifiedInboxPage.tsx
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
  Image as ImageIcon,
  CheckCircle2,
  X,
  Building2,
  BookOpen,
  Layers,
  Search,
  Check,
  Globe,
  Plus,
  Wand2,
  Clock,
  CheckCheck,
  Eye,
  Download,
  Zap,
  SlidersHorizontal,
  RefreshCw,
  GitPullRequest,
  AlertTriangle,
  Play,
  CheckCircle,
  HelpCircle,
  ShieldCheck,
  Edit3,
  Copy,
  Info,
  ListChecks,
  Quote,
  ShieldAlert,
  FileEdit
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import {
  InboxTicket,
  WorkflowDraft,
  WorkflowStep,
  CapabilityDefinition,
  WorkflowValidationResult,
  CourseItem
} from '../../types';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { WorkflowBuilder } from './components/WorkflowBuilder';
import { WorkflowValidationPanel } from './components/WorkflowValidationPanel';

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

const TicketListSkeleton: React.FC = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((idx) => (
      <div
        key={idx}
        className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 animate-pulse"
      >
        {/* Top badges & timestamp */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-6 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="h-6 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-4 w-32 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 w-16 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>

        {/* Title & Sender */}
        <div className="space-y-2">
          <div className="h-6 w-3/4 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-3">
            <div className="h-4 w-48 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 w-36 rounded-md bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>

        {/* Content preview box */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800/80 space-y-2">
          <div className="h-4 w-full rounded bg-slate-200/80 dark:bg-slate-800" />
          <div className="h-4 w-5/6 rounded bg-slate-200/60 dark:bg-slate-800/70" />
        </div>

        {/* Footer action buttons */}
        <div className="pt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-8 w-28 rounded-xl bg-slate-100 dark:bg-slate-800/80" />
          </div>
          <div className="h-8 w-20 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    ))}
  </div>
);

const WorkflowDrawerSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse pr-1 py-4">
    {/* Top Bento Grid Skeletons */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Zone A Skeleton */}
      <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-md" />
        </div>
        <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-16 w-full bg-slate-200/60 dark:bg-slate-700/60 rounded-xl" />
        <div className="space-y-2 pt-2">
          <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-7 w-full bg-slate-200/50 dark:bg-slate-700/50 rounded-lg" />
        </div>
      </div>
      {/* Zone B Skeleton */}
      <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-12 w-full bg-slate-200/60 dark:bg-slate-700/60 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="h-12 bg-slate-200/50 dark:bg-slate-700/50 rounded-xl" />
          <div className="h-12 bg-slate-200/50 dark:bg-slate-700/50 rounded-xl" />
        </div>
      </div>
    </div>
    {/* DAG Graph Skeleton */}
    <div className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex justify-between items-center">
        <div className="h-4 w-44 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded-md" />
      </div>
      <div className="space-y-3 pt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-1/3 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-1/2 bg-slate-200/60 dark:bg-slate-700/60 rounded" />
            </div>
            <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  </div>
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
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<{
    sheetNames: string[];
    activeSheet: string;
    sheetsData: Record<string, string[][]>;
  } | null>(null);
  const [spreadsheetPreviewError, setSpreadsheetPreviewError] = useState<string | null>(null);
  const [isSpreadsheetLoading, setIsSpreadsheetLoading] = useState<boolean>(false);
  const [summarizingTicketId, setSummarizingTicketId] = useState<string | null>(null);
  const [vungAViewMode, setVungAViewMode] = useState<'summary' | 'raw'>('summary');

  // Metadata Phả hệ & Khóa học
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityDefinition[]>([]);

  // Workflow Console State
  const [selectedWorkflowTicket, setSelectedWorkflowTicket] = useState<InboxTicket | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowDraft | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState<boolean>(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowValidating, setWorkflowValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [isEditingWorkflow, setIsEditingWorkflow] = useState<boolean>(false);
  const [operatorReason, setOperatorReason] = useState<string>('');
  const [isConfirmingRun, setIsConfirmingRun] = useState<boolean>(false);

  // Entity Resolution Autocomplete
  const [isSchoolPickerOpen, setIsSchoolPickerOpen] = useState<boolean>(false);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const schoolPickerRef = useRef<HTMLDivElement | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const SPREADSHEET_ID = '1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go';

  const currentOperatorEmail = useMemo(() => {
    return localStorage.getItem('user_email') || 'hung.nguyenmanh@dtt.vn';
  }, []);

  const loadTickets = useCallback(async (forceSpinner = false) => {
    if (forceSpinner) setLoading(true);
    try {
      const endpoint = `/tickets?sort=${sortOrder}`;
      const data = await fetchApi<InboxTicket[]>(endpoint);
      if (data) setTickets(data);
    } catch (err) {
      toast.error('Không thể tải danh sách ticket: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sortOrder]);

  const loadMetadata = useCallback(async () => {
    try {
      const [schoolsData, capsRes] = await Promise.all([
        fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools').catch(() => []),
        fetchApi<{ capabilities: CapabilityDefinition[] }>('/workflows/capabilities').catch(() => ({ capabilities: [] })),
      ]);

      if (schoolsData) setSchoolsList(schoolsData);
      if (capsRes && capsRes.capabilities) setCapabilities(capsRes.capabilities);
    } catch (e) {
      console.warn('Lỗi nạp metadata workflow:', e);
    }
  }, []);

  useEffect(() => {
    loadMetadata();
    loadTickets();
  }, [loadMetadata, loadTickets]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (schoolPickerRef.current && !schoolPickerRef.current.contains(target)) {
        setIsSchoolPickerOpen(false);
      }
      if (target.closest('[data-category-dropdown]')) {
        return;
      }

      setActiveCategoryDropdown(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSpreadsheet = async () => {
      setSpreadsheetPreview(null);
      setSpreadsheetPreviewError(null);
      if (!previewFile || !/\.xlsx?$/i.test(previewFile.filename)) return;
      setIsSpreadsheetLoading(true);
      try {
        const response = await fetch(previewFile.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
        const sheetNames = workbook.SheetNames;
        if (!sheetNames || sheetNames.length === 0) throw new Error('Không có worksheet');

        const sheetsData: Record<string, string[][]> = {};
        sheetNames.forEach((sName) => {
          const ws = workbook.Sheets[sName];
          if (ws) {
            const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
              .slice(0, 150)
              .map(row => row.slice(0, 40).map(value => String(value ?? '')));
            sheetsData[sName] = rows;
          } else {
            sheetsData[sName] = [];
          }
        });

        if (!cancelled) {
          setSpreadsheetPreview({
            sheetNames,
            activeSheet: sheetNames[0],
            sheetsData,
          });
        }
      } catch {
        if (!cancelled) setSpreadsheetPreviewError('Không thể đọc trực tiếp bảng tính này. Bạn vẫn có thể mở hoặc tải file để đối chiếu.');
      } finally {
        if (!cancelled) setIsSpreadsheetLoading(false);
      }
    };
    loadSpreadsheet();
    return () => { cancelled = true; };
  }, [previewFile]);

  const filteredSchools = useMemo(() => {
    const q = schoolSearchQuery.trim().toLowerCase();
    if (!q) return schoolsList.slice(0, 30);
    return schoolsList
      .filter(
        (s) =>
          s.school_name.toLowerCase().includes(q) ||
          (s.school_code && s.school_code.toLowerCase().includes(q)) ||
          s.partner_name.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [schoolsList, schoolSearchQuery]);

  // =========================================================================
  // ⚡ WORKFLOW CONSOLE HANDLERS
  // =========================================================================
  const handleOpenWorkflowConsole = async (ticket: InboxTicket) => {
    setSelectedWorkflowTicket(ticket);
    setWorkflowLoading(true);
    setIsEditingWorkflow(false);
    setOperatorReason('');
    setValidationResult(null);
    setWorkflowError(null);

    try {
      const wf = await fetchApi<WorkflowDraft>(`/workflows/ticket/${ticket.id}`);
      if (wf) {
        setActiveWorkflow(wf);
        if (wf.steps && wf.steps.length > 0) {
          runValidation(wf.id);
        }
      }
    } catch (err) {
      const msg = (err as Error).message || 'Lỗi không xác định';
      setWorkflowError(msg);
      toast.error('Lỗi tải Workflow: ' + msg);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const runValidation = async (workflowId: string) => {
    setWorkflowValidating(true);
    try {
      const res = await fetchApi<WorkflowValidationResult>(`/workflows/${workflowId}/validate`, {
        method: 'POST',
      });
      if (res) setValidationResult(res);
    } catch (err) {
      console.warn('Lỗi kiểm tra validation:', err);
    } finally {
      setWorkflowValidating(false);
    }
  };

  // 🎯 1. SỬA HÀM TÓM TẮT LẠI: ĐỒNG BỘ NGAY VÀO VÙNG A CỦA MODAL ĐANG MỞ
  const handleReSummarize = async () => {
    if (!selectedWorkflowTicket) return;
    setWorkflowLoading(true);
    try {
      const res = await fetchApi<{ status: string; summary: any }>(`/tickets/${selectedWorkflowTicket.id}/re-summarize`, {
        method: 'POST',
      });
      if (res && res.status === 'success') {
        const summaryText = typeof res.summary === 'string' ? res.summary : (res.summary?.summary_vi || '');
        // Cập nhật ngay State của Modal đang mở
        setSelectedWorkflowTicket(prev => prev ? { ...prev, ai_summary: summaryText } : null);
        toast.success('📝 Đã làm tươi bản tóm tắt Inbox thành công!');
        await loadTickets(false);
      }
    } catch (err) {
      toast.error('Lỗi tóm tắt lại: ' + (err as Error).message);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleSummarizeSingleTicket = async (ticketId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSummarizingTicketId(ticketId);
    try {
      const res = await fetchApi<{ status: string; summary: any }>(`/tickets/${ticketId}/re-summarize`, {
        method: 'POST',
      });
      if (res && res.status === 'success') {
        toast.success('📝 Đã tóm tắt vé thành công!');
        await loadTickets(false);
        if (selectedWorkflowTicket?.id === ticketId && res.summary) {
          const summaryText = typeof res.summary === 'string' ? res.summary : (res.summary.summary_vi || '');
          setSelectedWorkflowTicket(prev => prev ? { ...prev, ai_summary: summaryText } : null);
        }
      }
    } catch (err) {
      toast.error('Lỗi tóm tắt vé: ' + (err as Error).message);
    } finally {
      setSummarizingTicketId(null);
    }
  };

  // 🎯 2. SỬA HÀM ĐÁNH GIÁ LẠI Ý ĐỊNH: BẮT ĐÚNG BIẾN `res.workflow` ĐỂ MODAL LẬP TỨC NHẢY SỐ MỚI
  const handleReAssessIntent = async () => {
    if (!selectedWorkflowTicket) return;
    setWorkflowLoading(true);
    setWorkflowError(null);
    try {
      const res = await fetchApi<{ status: string; workflow?: any; result?: any }>(`/tickets/${selectedWorkflowTicket.id}/re-assess-intent`, {
        method: 'POST',
      });

      // ✅ BẮT TRÚNG CẢ res.workflow LẪN CÁC BIẾN FALLBACK
      const newWf = res?.workflow || res?.result?.workflow_draft || res?.result;

      if (newWf) {
        // Cập nhật ngay lập tức Workflow mới vào State Modal!
        setActiveWorkflow(newWf);

        // Nếu có tóm tắt mới thì đồng bộ luôn sang Vùng A
        if (newWf.ai_analysis?.summary) {
          setSelectedWorkflowTicket(prev => prev ? { ...prev, ai_summary: newWf.ai_analysis.summary } : null);
        }

        if (newWf.steps && newWf.steps.length > 0) {
          runValidation(newWf.id);
        }

        toast.success('✨ AI đã bóc tách sự thật và cập nhật Proposal mới lên Modal!');
        await loadTickets(false);
      } else {
        toast.warning('Đã phân tích lại nhưng không nhận được cấu trúc workflow mới.');
      }
    } catch (err) {
      const msg = (err as Error).message || 'Lỗi không xác định';
      setWorkflowError(msg);
      toast.error('Lỗi đánh giá lại ý định: ' + msg);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleStepsChange = async (updatedSteps: WorkflowStep[]) => {
    if (!activeWorkflow) return;
    const reasonText = operatorReason.trim() || 'Quản trị viên tinh chỉnh thứ tự hoặc tham số bước';
    const updatedWf = { ...activeWorkflow, steps: updatedSteps };
    setActiveWorkflow(updatedWf);

    try {
      const res = await fetchApi<WorkflowDraft>(`/workflows/${activeWorkflow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          steps: updatedSteps,
          ai_analysis: activeWorkflow.ai_analysis,
          updated_by: currentOperatorEmail,
          operator_reason: reasonText,
        }),
      });
      if (res) {
        setActiveWorkflow(res);
        runValidation(res.id);
        toast.success('Đã lưu cấu trúc luồng kèm nhật ký audit!');
      }
    } catch (err) {
      toast.error('Lỗi lưu thay đổi luồng: ' + (err as Error).message);
    }
  };

  const handleSelectSchool = async (school: HierarchySchoolItem) => {
    if (!activeWorkflow) return;
    setIsSchoolPickerOpen(false);

    const updatedAnalysis = {
      ...activeWorkflow.ai_analysis,
      detected_school: {
        id: school.school_id,
        name: school.school_name,
        code: school.school_code,
        confidence: 1.0,
      },
    };

    const updatedSteps = (activeWorkflow.steps || []).map((s) => {
      const newInputs = { ...s.inputs };
      if ('school_identifier' in newInputs || s.capability_id === 'workspace.bulk_account_creation') {
        newInputs.school_identifier = school.school_name;
        newInputs.school_name = school.school_name;
        newInputs.school_id = school.school_id;
      }
      return { ...s, inputs: newInputs };
    });

    const updatedWf = {
      ...activeWorkflow,
      ai_analysis: updatedAnalysis as any,
      steps: updatedSteps,
    };
    setActiveWorkflow(updatedWf);

    try {
      const res = await fetchApi<WorkflowDraft>(`/workflows/${activeWorkflow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          steps: updatedSteps,
          ai_analysis: updatedAnalysis,
          updated_by: currentOperatorEmail,
          operator_reason: `Gán trường học mục tiêu: ${school.school_name}`,
        }),
      });
      if (res) {
        setActiveWorkflow(res);
        runValidation(res.id);
      }
      toast.success(`Đã chọn trường: ${school.school_name}`);
    } catch (err) {
      toast.error('Lỗi cập nhật trường học: ' + (err as Error).message);
    }
  };

  const handleConfirmAndRun = async () => {
    if (!activeWorkflow || isConfirmingRun) return;
    setIsConfirmingRun(true);

    try {
      const res = await fetchApi<{ status: string; message: string; workflow_id: string }>(
        `/workflows/${activeWorkflow.id}/approve_and_run`,
        {
          method: 'POST',
          body: JSON.stringify({
            run_immediately: true,
          }),
        }
      );

      if (res && res.status === 'success') {
        toast.success(
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              <span>Workflow đã được duyệt an toàn và đang chạy ngầm!</span>
            </div>
            <p className="text-xs text-slate-500">Hệ thống đang chiếm Lease và thực thi theo thứ tự Tô-pô DAG.</p>
          </div>,
          { duration: 6000 }
        );

        setActiveWorkflow((prev) => (prev ? { ...prev, status: 'running' } : null));
        startExecutionPolling(activeWorkflow.id);
      }
    } catch (err) {
      toast.error('Lỗi khởi chạy workflow: ' + (err as Error).message);
    } finally {
      setIsConfirmingRun(false);
    }
  };

  const startExecutionPolling = (workflowId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const latestWf = await fetchApi<WorkflowDraft>(`/workflows/${workflowId}`);
        if (latestWf) {
          setActiveWorkflow(latestWf);
          if (latestWf.status === 'success' || latestWf.status === 'failed') {
            clearInterval(pollInterval);
            await loadTickets(false);
          }
        }
      } catch {
        clearInterval(pollInterval);
      }
    }, 3000);
  };

  const handleRetryStep = async (stepId: string) => {
    if (!activeWorkflow) return;
    try {
      toast.info(`Đang kích hoạt retry cho bước [${stepId}]...`);
      await fetchApi(`/workflows/${activeWorkflow.id}/steps/${stepId}/retry`, {
        method: 'POST',
      });
      startExecutionPolling(activeWorkflow.id);
    } catch (err) {
      toast.error('Lỗi retry bước: ' + (err as Error).message);
    }
  };

  // Bộ lọc danh sách Ticket
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesSearch =
        searchQuery === '' ||
        (t.subject && t.subject.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.sender_email && t.sender_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.source_id && t.source_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.metadata?.school_name && t.metadata.school_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        selectedStatus === 'all'
          ? t.status !== 'dismissed'
          : t.status === selectedStatus;

      const matchesCategory =
        selectedCategory === 'all' || t.category === selectedCategory;

      const matchesSource =
        selectedSource === 'all' || t.source === selectedSource;

      return matchesSearch && matchesStatus && matchesCategory && matchesSource;
    });
  }, [tickets, searchQuery, selectedStatus, selectedCategory, selectedSource]);

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
      <div className="relative inline-block" data-category-dropdown="true">
        <button
          type="button"
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
            data-category-dropdown="true"
            onMouseDown={(e) => e.stopPropagation()}
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
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
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

  // Kiểm định tính sẵn sàng khởi chạy của Workflow
  const isWorkflowRunnable = useMemo(() => {
    if (!activeWorkflow) return false;
    const blockedStatuses = ['no_action', 'needs_information', 'invalid', 'cancelled', 'running', 'waiting_poll', 'success', 'succeeded'];
    if (blockedStatuses.includes(activeWorkflow.status)) {
      return false;
    }
    if (!activeWorkflow.steps || activeWorkflow.steps.length === 0) {
      return false;
    }
    if (validationResult && !validationResult.is_valid) {
      return false;
    }
    return true;
  }, [activeWorkflow, validationResult]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
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
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Hòm thư tập trung điều phối & AI Workflow Pre-processing Console cho Hệ sinh thái Pythaverse.
          </p>
        </div>

        {/* Nút Sync On-Demand */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => loadTickets(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tải Lại</span>
          </button>

          <button
            onClick={async () => {
              toast.info('Đang kích hoạt quét Gmail...');
              try {
                await fetchApi('/tickets/sync/gmail', { method: 'POST' });
                toast.success('Đã kích hoạt quét Gmail ngầm!');
              } catch (e) {
                toast.error('Lỗi quét Gmail: ' + (e as Error).message);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 shadow-2xs cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-rose-600" />
            <span>Quét Gmail</span>
          </button>

          <button
            onClick={async () => {
              toast.info('Đang kích hoạt quét osTicket...');
              try {
                await fetchApi('/tickets/sync/osticket', { method: 'POST' });
                toast.success('Đã kích hoạt quét osTicket ngầm!');
              } catch (e) {
                toast.error('Lỗi quét osTicket: ' + (e as Error).message);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 hover:bg-amber-100 shadow-2xs cursor-pointer"
          >
            <Ticket className="w-3.5 h-3.5 text-amber-600" />
            <span>Quét osTicket</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Tìm kiếm theo tiêu đề, người gửi, mã ticket hoặc tên trường..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {[
                { id: 'pending', label: 'Chờ Xử Lý' },
                { id: 'all', label: 'Tất Cả' },
                { id: 'completed', label: 'Đã Xử Lý' },
                { id: 'dismissed', label: 'Bỏ Qua' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${selectedStatus === tab.id
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300"
            >
              <option value="all">Mọi Nguồn</option>
              <option value="gmail">Gmail</option>
              <option value="osticket">osTicket</option>
              <option value="google_form">Google Form</option>
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300"
            >
              <option value="all">Mọi Danh Mục</option>
              <option value="bug">System Bugs</option>
              <option value="account_keycloak">Keycloak / Account</option>
              <option value="lms_enroll">LMS Enroll</option>
              <option value="license">License</option>
              <option value="other">Khác</option>
            </select>

            {(searchQuery || selectedStatus !== 'pending' || selectedSource !== 'all' || selectedCategory !== 'all') && (
              <button
                onClick={resetFilters}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Đặt lại bộ lọc"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ticket List View */}
      {loading ? (
        <TicketListSkeleton />
      ) : filteredTickets.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy ticket nào</h3>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTickets.map((ticket) => {
            const isCompleted = ticket.status === 'completed';
            const isDismissed = ticket.status === 'dismissed';
            const attachments = ticket.attachments || [];
            const cleanRawContent = stripHtmlTags(ticket.raw_content);
            const isExpanded = !!expandedContent[ticket.id];
            const excelMeta = ticket.metadata?.excel_summary;

            return (
              <div
                key={ticket.id}
                className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-200 dark:hover:border-indigo-900/60 transition space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderSourceBadge(ticket.source)}
                    {renderStatusPill(ticket.status)}
                    {getCategoryBadge(ticket.category || 'other', ticket.id)}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDateTime(ticket.created_at)}</span>
                    </span>
                    <a
                      href={getDirectSourceUrl(ticket)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Mở gốc</span>
                    </a>
                  </div>
                </div>

                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug">
                    {ticket.subject || 'Không có tiêu đề'}
                  </h2>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span>Người gửi: <b className="text-slate-800 dark:text-slate-200">{ticket.sender_email}</b></span>
                    {ticket.submitter_name && <span>({ticket.submitter_name})</span>}
                    {ticket.metadata?.school_name && (
                      <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{ticket.metadata.school_name}</span>
                      </span>
                    )}
                  </div>
                </div>

                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {attachments.map((file: any, idx: number) => {
                      const isExcel = /\.xlsx?$/i.test(file.filename || '');
                      const isImage = /\.(png|jpe?g|webp|gif)$/i.test(file.filename || '');

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 transition shadow-2xs group cursor-pointer"
                        >
                          {isImage ? (
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                          ) : isExcel ? (
                            <FileSpreadsheetIcon className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
                          )}
                          <span className="truncate max-w-[200px]">{file.filename}</span>
                          <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 ml-0.5 transition" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Gemini AI Summary Banner */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-teal-50/40 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-teal-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                        Phân tích & Tóm tắt từ Gemini AI
                      </span>
                    </div>

                    {excelMeta?.is_cof && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-mono font-bold">
                        COF: {excelMeta.courses?.length || 0} Môn | {excelMeta.students_to_create || 0} HS Mới
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line font-medium">
                    {ticket.ai_summary || 'Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích...'}
                  </p>
                </div>

                {/* Collapsible raw content */}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedContent((prev) => ({ ...prev, [ticket.id]: !prev[ticket.id] }))}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{isExpanded ? 'Thu gọn nội dung email gốc' : 'Xem nội dung email gốc'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner max-h-72 overflow-y-auto">
                      {cleanRawContent || '(Không có nội dung văn bản gốc)'}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 font-bold">
                    Mã tham chiếu: #{ticket.source_id || ticket.id.slice(0, 8)}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isDismissed ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Khôi phục</span>
                      </button>
                    ) : isCompleted ? (
                      <button
                        onClick={() => handleRestoreTask(ticket.id)}
                        disabled={actionLoading === ticket.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Mở lại Ticket</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={(e) => handleSummarizeSingleTicket(ticket.id, e)}
                          disabled={summarizingTicketId === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60 transition shadow-2xs cursor-pointer disabled:opacity-60"
                          title={ticket.ai_summary ? 'Chạy lại AI tóm tắt cho vé này' : 'Tạo tóm tắt AI cho vé này'}
                        >
                          {summarizingTicketId === ticket.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          )}
                          <span>{ticket.ai_summary ? 'Tóm tắt lại' : 'Tóm tắt'}</span>
                        </button>
                        <button
                          onClick={() => handleDismissTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Bỏ qua</span>
                        </button>

                        <button
                          onClick={() => handleCompleteTask(ticket.id)}
                          disabled={actionLoading === ticket.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Hoàn thành</span>
                        </button>

                        <button
                          onClick={() => navigate('/github', { state: { ticket } })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
                        >
                          <GitPullRequest className="w-3.5 h-3.5" />
                          <span>GitHub Issue</span>
                        </button>

                        <button
                          onClick={() => handleOpenWorkflowConsole(ticket)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white hover:brightness-110 transition shadow-md shadow-indigo-500/20 cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                          <span>Xem & Duyệt AI Workflow</span>
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
      {/* 🚀 BENTO AI WORKFLOW CONSOLE (OPERATOR REVIEW & SAFETY GATE V3.1) */}
      {/* ========================================================================= */}
      {selectedWorkflowTicket && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedWorkflowTicket(null);
          }}
          className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl w-full max-w-full sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl shadow-2xl overflow-hidden p-6 sm:p-8 max-h-[94vh] flex flex-col my-auto"
          >
            {/* Header Console */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl shadow-md shadow-indigo-500/20">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                      AI Workflow Pre-processing & Execution Console
                    </h3>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-extrabold uppercase">
                      Proposal v{activeWorkflow?.version || 1}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Request #{selectedWorkflowTicket.source_id || selectedWorkflowTicket.id.slice(0, 8)} • Provenance Traced
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReSummarize}
                  disabled={workflowLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                  title="Chỉ làm tươi lại bản tóm tắt Inbox"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Tóm tắt lại</span>
                </button>

                <button
                  type="button"
                  onClick={handleReAssessIntent}
                  disabled={workflowLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                  title="Bắt Gemini AI bóc tách lại sự thật và sinh Proposal version mới"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  <span>AI Đánh giá lại ý định</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedWorkflowTicket(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Thân cuộn Bento Console */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 py-4">
              {workflowLoading ? (
                <WorkflowDrawerSkeleton />
              ) : !activeWorkflow ? (
                <div className="py-16 text-center text-slate-400 text-xs space-y-2">
                  <p>Không tìm thấy dữ liệu workflow cho yêu cầu này.</p>
                  {workflowError && <p className="text-rose-500 text-[11px] font-mono">{workflowError}</p>}
                  <button
                    type="button"
                    onClick={handleReAssessIntent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 transition mt-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Kích hoạt AI Phân tích ngay</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* BENTO GRID: VÙNG A + VÙNG B */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* ✅ VÙNG A NÂNG CẤP: TÍCH HỢP ĐỐI CHIẾU TÓM TẮT AI & NỘI DUNG GỐC */}
                    <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3.5 flex flex-col">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                            VÙNG A • Thông Tin Yêu Cầu & Đối Chiếu
                          </span>
                          {renderSourceBadge(selectedWorkflowTicket.source)}
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          {selectedWorkflowTicket.subject || 'Không có tiêu đề'}
                        </h4>

                        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                          <p>
                            <span className="text-slate-400 font-medium">Người gửi:</span>{' '}
                            <b>{selectedWorkflowTicket.sender_email}</b>
                          </p>
                          {selectedWorkflowTicket.submitter_name && (
                            <p>
                              <span className="text-slate-400 font-medium">Tên:</span>{' '}
                              {selectedWorkflowTicket.submitter_name}
                            </p>
                          )}
                          <p>
                            <span className="text-slate-400 font-medium">Thời gian:</span>{' '}
                            {formatDateTime(selectedWorkflowTicket.created_at)}
                          </p>
                        </div>

                        {selectedWorkflowTicket.attachments && selectedWorkflowTicket.attachments.length > 0 && (
                          <div className="pt-1">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                              Tài liệu đính kèm ({selectedWorkflowTicket.attachments.length}):
                            </span>
                            <div className="space-y-1.5">
                              {selectedWorkflowTicket.attachments.map((att: any, i: number) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs shadow-2xs"
                                >
                                  <span className="truncate max-w-[190px] font-medium text-slate-700 dark:text-slate-300">
                                    {att.filename}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewFile(att)}
                                    className="p-1 text-indigo-600 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Xem</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* KHUNG ĐỐI CHIẾU: TAB CHUYỂN ĐỔI GIỮA TÓM TẮT AI VÀ NỘI DUNG NGUYÊN BẢN */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-750 flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg text-[11px]">
                            <button
                              type="button"
                              onClick={() => setVungAViewMode('summary')}
                              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${vungAViewMode === 'summary'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                              Tóm Tắt AI
                            </button>
                            <button
                              type="button"
                              onClick={() => setVungAViewMode('raw')}
                              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${vungAViewMode === 'raw'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                              Văn Bản Gốc
                            </button>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">
                            {vungAViewMode === 'summary' ? 'Bản mềm Inbox' : 'Thân email nguyên thủy'}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs overflow-y-auto max-h-48 flex-1 leading-relaxed shadow-inner">
                          {vungAViewMode === 'summary' ? (
                            <p className="whitespace-pre-line text-slate-800 dark:text-slate-200 font-medium">
                              {selectedWorkflowTicket.ai_summary || 'Chưa có bản tóm tắt. Bạn có thể nhấn nút "Tóm tắt lại" ở trên góc phải để AI sinh tóm tắt.'}
                            </p>
                          ) : (
                            <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {stripHtmlTags(selectedWorkflowTicket.raw_content) || '(Không có nội dung văn bản gốc)'}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* VÙNG B: AI UNDERSTANDING & EVIDENCE PROVENANCE */}
                    <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 space-y-3.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>VÙNG B • AI Understanding & Evidence Provenance</span>
                        </span>
                        <div className="flex items-center gap-2">
                          {activeWorkflow.ai_analysis?.model_used && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                              {activeWorkflow.ai_analysis.model_used}
                            </span>
                          )}

                          {/* HIỂN THỊ ĐỘ TIN CẬY THỰC CHẤT */}
                          {activeWorkflow.status === 'needs_information' ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300">
                              ⚠️ Chưa Đủ Bằng Chứng
                            </span>
                          ) : (
                            <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-indigo-600 border border-indigo-200 dark:border-indigo-800">
                              Độ tin cậy: {activeWorkflow.ai_analysis?.overall_confidence !== undefined
                                ? `${Math.round(activeWorkflow.ai_analysis.overall_confidence * 100)}%`
                                : 'N/A'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mục tiêu */}
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 text-xs">
                        <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">
                          Mục Tiêu Nhận Diện (Goal):
                        </span>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {activeWorkflow.title}
                        </p>
                      </div>

                      {/* Ý ĐỊNH VẬN HÀNH & MỨC ĐỘ RỦI RO */}
                      {activeWorkflow.ai_analysis?.requested_operations && activeWorkflow.ai_analysis.requested_operations.length > 0 && (
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 space-y-1.5">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                            Ý Định Vận Hành Được Phê Duyệt:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {activeWorkflow.ai_analysis.requested_operations.map((op: any, i: number) => {
                              const intentName = typeof op === 'string' ? op : op.intent;
                              const isHighRisk = intentName === 'create_accounts' || intentName === 'reset_password';
                              return (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${isHighRisk
                                    ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                                    }`}
                                >
                                  <span>{intentName}</span>
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-black/10 font-mono">
                                    {isHighRisk ? 'High Mutation' : 'Medium'}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 🎯 BẰNG CHỨNG TRÍCH DẪN NGUYÊN VĂN (EVIDENCE PROVENANCE) */}
                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/40 space-y-2">
                        <span className="text-[10px] font-extrabold uppercase text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                          <Quote className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Căn Cứ Trích Dẫn Từ Yêu Cầu (Verified Evidence Grounding):</span>
                        </span>

                        {activeWorkflow.ai_analysis?.evidence_quotes && activeWorkflow.ai_analysis.evidence_quotes.length > 0 ? (
                          <div className="space-y-1.5">
                            {activeWorkflow.ai_analysis.evidence_quotes.map((q, q_idx) => (
                              <div
                                key={q_idx}
                                className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border-l-2 border-indigo-600 text-xs font-mono text-slate-800 dark:text-slate-200 italic"
                              >
                                ❝ {q} ❞
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">
                            Chưa phát hiện trích dẫn trực tiếp từ văn bản gốc.
                          </p>
                        )}
                      </div>

                      {/* 🎯 PHÂN GIẢI TRƯỜNG HỌC (ĐÃ DECOUPLE: CHỈ HIỂN THỊ KHI TÁC VỤ CẦN TRƯỜNG HỌC) */}
                      {activeWorkflow.ai_analysis?.school_required === false ? (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                Phạm Vi Vận Hành:
                              </span>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                Toàn Cục / Nền Tảng Độc Lập (Git, Keycloak, Đối tác ngoài)
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                            Không cần School
                          </span>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-indigo-500" />
                              <span>Trường Học Mục Tiêu (Detected School):</span>
                            </span>

                            {activeWorkflow.ai_analysis?.detected_school && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                ✓ Khớp {activeWorkflow.ai_analysis.detected_school.confidence
                                  ? `${Math.round(activeWorkflow.ai_analysis.detected_school.confidence * 100)}%`
                                  : 'Đã xác nhận'}
                              </span>
                            )}
                          </div>

                          <div className="relative" ref={schoolPickerRef}>
                            <div
                              onClick={() => setIsSchoolPickerOpen(!isSchoolPickerOpen)}
                              className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer shadow-xs ${activeWorkflow.ai_analysis?.detected_school?.name
                                ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/60'
                                : 'border-amber-400 dark:border-amber-700 bg-amber-100/80 dark:bg-amber-950/40 hover:bg-amber-100'
                                }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Building2 className={`w-4 h-4 shrink-0 ${activeWorkflow.ai_analysis?.detected_school?.name ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-400'
                                  }`} />
                                <span className={`text-xs font-black truncate ${activeWorkflow.ai_analysis?.detected_school?.name
                                  ? 'text-slate-900 dark:text-white'
                                  : 'text-amber-950 dark:text-amber-200'
                                  }`}>
                                  {activeWorkflow.ai_analysis?.detected_school?.name ||
                                    '⚠️ Chưa xác định chắc chắn trường học (Nhấp để chọn)'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 text-indigo-700 dark:text-indigo-400 font-bold">
                                <span className="text-xs underline">Thay đổi</span>
                                <ChevronDown className="w-4 h-4" />
                              </div>
                            </div>

                            {isSchoolPickerOpen && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 p-2 z-50 max-h-60 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-100">
                                <div className="relative w-full">
                                  <input
                                    type="text"
                                    value={schoolSearchQuery}
                                    onChange={(e) => setSchoolSearchQuery(e.target.value)}
                                    placeholder="Nhập tên trường hoặc mã trường..."
                                    className="w-full h-10 pl-9 pr-3 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-600 rounded-xl shadow-xs outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-slate-400"
                                  />
                                  <Search className="w-4 h-4 text-amber-600 dark:text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                </div>

                                {filteredSchools.length === 0 ? (
                                  <div className="p-3 text-center text-xs text-slate-400">Không tìm thấy trường nào.</div>
                                ) : (
                                  filteredSchools.map((s) => (
                                    <button
                                      key={s.school_id}
                                      type="button"
                                      onClick={() => handleSelectSchool(s)}
                                      className="w-full text-left p-2 rounded-lg text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                                    >
                                      <div className="truncate pr-2">
                                        <div className="font-bold text-slate-800 dark:text-slate-200">{s.school_name}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">
                                          Mã: {s.school_code} | Đối tác: {s.partner_name}
                                        </div>
                                      </div>
                                      <Check className="w-3.5 h-3.5 text-indigo-600 opacity-0 group-hover:opacity-100" />
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Khóa học & Git Role */}
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {activeWorkflow.ai_analysis?.detected_courses && activeWorkflow.ai_analysis.detected_courses.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                              <BookOpen className="w-3 h-3 text-indigo-500" /> Khóa học:
                            </span>
                            {activeWorkflow.ai_analysis.detected_courses.map((c, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                {typeof c === 'string' ? c : c.course_name}
                              </span>
                            ))}
                          </div>
                        )}

                        {activeWorkflow.ai_analysis?.entities?.git_role && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold uppercase text-slate-400">Git Role:</span>
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-mono text-xs font-extrabold">
                              {activeWorkflow.ai_analysis.entities.git_role}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Lý do lựa chọn luồng */}
                      {activeWorkflow.ai_analysis?.reason_summary_vi && (
                        <div className="p-3.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/70 text-xs text-amber-950 dark:text-amber-100 font-medium leading-relaxed shadow-xs">
                          <div className="font-extrabold mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-900 dark:text-amber-300">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                            <span>Lý do lựa chọn luồng (Policy Decision):</span>
                          </div>
                          <p>{activeWorkflow.ai_analysis.reason_summary_vi}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* VÙNG C: 4 TRẠNG THÁI HIỂN THỊ CHÍNH (FOUR WORKFLOW STATES) */}

                  {/* 🔴 TRẠNG THÁI 1: INVALID (LỖI POLICY / DAG CHU TRÌNH) */}
                  {activeWorkflow.status === 'invalid' ? (
                    <div className="p-6 rounded-3xl bg-rose-500/10 border-2 border-rose-500/40 space-y-4 shadow-sm">
                      <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400">
                        <div className="p-2 rounded-xl bg-rose-600 text-white shadow-sm">
                          <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-wider">
                            Cấu Trúc Workflow Không Hợp Lệ (Invalid Policy/DAG Violation)
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            Phát hiện lỗi chu trình phụ thuộc hoặc capability không được hỗ trợ. Khóa hoàn toàn chốt phê duyệt.
                          </p>
                        </div>
                      </div>

                      {validationResult && validationResult.errors.length > 0 && (
                        <div className="space-y-1.5 pt-2">
                          {validationResult.errors.map((err, err_idx) => (
                            <div
                              key={err_idx}
                              className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900/60 text-xs font-mono text-rose-600 dark:text-rose-400 flex items-center gap-2"
                            >
                              <XCircle className="w-4 h-4 shrink-0" />
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : activeWorkflow.status === 'needs_information' ? (
                    /* 🟡 TRẠNG THÁI 2: NEEDS_INFORMATION (VỪA HIỆN CHECKLIST THIẾU, VỪA HIỆN ĐỒ THỊ BƯỚC ĐỂ SỬA) */
                    <div className="space-y-4">
                      <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 space-y-3 shadow-xs">
                        <div className="flex items-center gap-3 text-amber-800 dark:text-amber-300">
                          <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                            <ListChecks className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider">
                              Yêu Cầu Cần Bổ Sung Thông Tin Trước Khi Khởi Chạy
                            </h4>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                              Hệ thống đã tự động dựng sẵn các bước dự thảo bên dưới. Quản trị viên vui lòng hoàn thiện các trường màu vàng hoặc bấm "Chỉnh sửa luồng".
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          {activeWorkflow.ai_analysis?.missing_requirements?.map((item: any, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-900/60 text-xs shadow-2xs"
                            >
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <span className="font-bold text-slate-900 dark:text-white font-mono mr-1">
                                  [{item.field || 'Thiếu thông tin'}]:
                                </span>
                                <span className="text-slate-700 dark:text-slate-300">
                                  {item.message || JSON.stringify(item)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* VẪN HIỂN THỊ WORKFLOW BUILDER ĐỂ QUẢN TRỊ VIÊN XEM & CHỈNH SỬA */}
                      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                              Đồ Thị Các Bước Dự Thảo ({activeWorkflow.steps?.length || 0} bước)
                            </h4>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsEditingWorkflow(!isEditingWorkflow)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{isEditingWorkflow ? 'Đóng Chỉnh Sửa' : 'Chỉnh Sửa Luồng Này'}</span>
                          </button>
                        </div>

                        <WorkflowBuilder
                          steps={activeWorkflow.steps || []}
                          capabilities={capabilities}
                          isEditable={isEditingWorkflow}
                          onStepsChange={handleStepsChange}
                          onRetryStep={handleRetryStep}
                        />
                      </div>
                    </div>
                  ) : activeWorkflow.status === 'no_action' ? (
                    /* ⚪ TRẠNG THÁI 3: NO_ACTION (KHÔNG THỰC HIỆN TỰ ĐỘNG) */
                    <div className="p-8 text-center rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                      <Info className="w-10 h-10 text-slate-400 mx-auto" />
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        Không Có Hành Động Tự Động Hóa Nào Được Kích Hoạt
                      </h4>
                      <p className="text-xs text-slate-500 mx-auto">
                        Email này được phân loại là bản tin, thông báo tự động hoặc không chứa yêu cầu can thiệp hệ sinh thái.
                      </p>
                    </div>
                  ) : (
                    /* 🟢 TRẠNG THÁI 4: READY_FOR_REVIEW / READY (THỰC THI CHUẨN MỰC) */
                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                              VÙNG C • Prepared Workflow & Execution Console
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {isEditingWorkflow
                                ? 'Chế độ chỉnh sửa: Bắt buộc nhập lý do can thiệp thủ công bên dưới.'
                                : 'Kiểm tra thứ tự và các liên kết phụ thuộc trước khi khởi chạy.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsEditingWorkflow(!isEditingWorkflow)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${isEditingWorkflow
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                              }`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{isEditingWorkflow ? 'Đóng Chỉnh Sửa' : 'Chỉnh Sửa Luồng'}</span>
                          </button>
                        </div>
                      </div>

                      {/* KHUNG NHẬP OPERATOR REASON KHI CHỈNH SỬA THỦ CÔNG */}
                      {isEditingWorkflow && (
                        <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2 animate-in fade-in duration-150">
                          <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-900 dark:text-indigo-200">
                            <FileEdit className="w-4 h-4 text-indigo-600" />
                            <span>Lý Do Can Thiệp Thủ Công (Bắt buộc lưu Audit Log):</span>
                          </div>
                          <input
                            type="text"
                            placeholder="Ví dụ: Bổ sung quyền Git theo trao đổi trực tiếp, đổi thứ tự bước..."
                            className="w-full px-3.5 py-2 text-xs font-bold text-slate-950 dark:text-white bg-white dark:bg-slate-900 border-2 border-indigo-400 dark:border-indigo-600 rounded-xl outline-none shadow-xs focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400"
                          />
                        </div>
                      )}

                      <WorkflowBuilder
                        steps={activeWorkflow.steps || []}
                        capabilities={capabilities}
                        isEditable={isEditingWorkflow}
                        onStepsChange={handleStepsChange}
                        onRetryStep={handleRetryStep}
                      />

                      <WorkflowValidationPanel
                        validation={validationResult}
                        isValidating={workflowValidating}
                        isSchoolResolved={!!activeWorkflow.ai_analysis?.detected_school}
                        totalSteps={(activeWorkflow.steps || []).length}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Console Bar */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span>Single Playwright Semaphore: 1 Slot • Render 512MB RAM Shield</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedWorkflowTicket(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Đóng
                </button>

                {activeWorkflow?.status === 'running' || activeWorkflow?.status === 'waiting_poll' ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-xs font-extrabold border border-sky-300 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>
                      {activeWorkflow.status === 'waiting_poll'
                        ? 'Đang đợi kiểm tra Polling Batch...'
                        : 'Workflow đang thực thi ngầm...'}
                    </span>
                  </div>
                ) : activeWorkflow?.status === 'success' || activeWorkflow?.status === 'succeeded' ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-extrabold border border-emerald-300">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Đã Hoàn Thành Toàn Bộ Luồng!</span>
                  </div>
                ) : activeWorkflow?.status === 'no_action' ? (
                  <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700">
                    <Info className="w-4 h-4 text-slate-400" />
                    <span>Không yêu cầu thao tác tự động</span>
                  </div>
                ) : activeWorkflow?.status === 'needs_information' ? (
                  <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold border border-amber-300 dark:border-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Thiếu thông tin đầu vào (Đã khóa van an toàn)</span>
                  </div>
                ) : activeWorkflow?.status === 'invalid' ? (
                  <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 text-xs font-bold border border-rose-300 dark:border-rose-800">
                    <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span>Cấu trúc không hợp lệ (Đã khóa chạy)</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isConfirmingRun || !isWorkflowRunnable}
                    onClick={handleConfirmAndRun}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-indigo-500/25 cursor-pointer"
                  >
                    {isConfirmingRun ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang Khởi Chạy...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span>Xác Nhận & Khởi Chạy (Confirm & Run)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* ✅ MODAL XEM TRƯỚC FILE ĐÍNH KÈM ĐA NĂNG (MULTI-TAB EXCEL PREVIEW CHUẨN MỰC) */}
      {previewFile && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl w-full shadow-2xl space-y-4 my-auto flex flex-col max-h-[92vh] ${previewFile.filename.match(/\.xlsx?$/i)
              ? 'max-w-full sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl p-5 sm:p-7'
              : 'max-w-full sm:max-w-2xl lg:max-w-3xl p-6'
              }`}
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                {previewFile.filename.match(/\.xlsx?$/i) ? (
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <FileSpreadsheetIcon className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    <Paperclip className="w-4 h-4" />
                  </div>
                )}
                <div className="truncate">
                  <span className="text-xs sm:text-sm font-bold truncate text-slate-900 dark:text-slate-100 block">
                    {previewFile.filename}
                  </span>
                  {spreadsheetPreview && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      Phát hiện {spreadsheetPreview.sheetNames.length} Sheet(s) • Đang xem: <b className="text-emerald-600">{spreadsheetPreview.activeSheet}</b>
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thanh Tab Navigation dành riêng cho Excel (Hỗ trợ COF 4-5 Tabs) */}
            {spreadsheetPreview && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin shrink-0 border-b border-slate-150 dark:border-slate-800/80">
                <span className="text-[10px] uppercase font-black text-slate-400 pr-1 shrink-0 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Tabs:
                </span>
                {spreadsheetPreview.sheetNames.map((sheet) => {
                  const isActive = sheet === spreadsheetPreview.activeSheet;
                  const rowCount = spreadsheetPreview.sheetsData[sheet]?.length || 0;
                  return (
                    <button
                      key={sheet}
                      type="button"
                      onClick={() => setSpreadsheetPreview((prev) => prev ? { ...prev, activeSheet: sheet } : null)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${isActive
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                    >
                      <span>{sheet}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-medium ${isActive ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                        }`}>
                        {rowCount} dòng
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Vùng Render Nội Dung Tệp */}
            <div className="flex-1 min-h-[300px] max-h-[62vh] overflow-auto bg-slate-50 dark:bg-slate-850/50 rounded-2xl p-4 flex flex-col justify-start">
              {previewFile.filename.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                <div className="flex items-center justify-center h-full">
                  <img src={previewFile.url} alt={previewFile.filename} className="max-h-[55vh] object-contain rounded-xl shadow-sm" />
                </div>
              ) : previewFile.filename.match(/\.pdf$/i) ? (
                <iframe title={`Xem trước ${previewFile.filename}`} src={previewFile.url} className="w-full h-[55vh] rounded-xl bg-white" />
              ) : previewFile.filename.match(/\.xlsx?$/i) && isSpreadsheetLoading ? (
                <div className="w-full space-y-3 animate-pulse p-2">
                  <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-64" />
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="h-10 bg-slate-200 dark:bg-slate-700 w-full" />
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[1, 2, 3, 4, 5, 6, 7].map((idx) => (
                        <div key={idx} className="h-9 bg-slate-100/60 dark:bg-slate-800/40 w-full flex items-center px-3 gap-3">
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : previewFile.filename.match(/\.xlsx?$/i) && spreadsheetPreview ? (
                <div className="w-full flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      Đang xem Sheet: <b className="text-slate-900 dark:text-white font-mono">{spreadsheetPreview.activeSheet}</b>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      (Tối đa 150 hàng x 40 cột được tải)
                    </span>
                  </div>

                  <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                    <table className="w-full border-collapse text-left text-xs">
                      <tbody>
                        {(spreadsheetPreview.sheetsData[spreadsheetPreview.activeSheet] || []).map((row, rowIndex) => (
                          <tr
                            key={rowIndex}
                            className={`${rowIndex === 0
                              ? 'sticky top-0 bg-slate-200 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white z-10 shadow-2xs border-b border-slate-300 dark:border-slate-700'
                              : rowIndex % 2 === 0
                                ? 'bg-white dark:bg-slate-900/60 hover:bg-indigo-50/40 dark:hover:bg-slate-800/60'
                                : 'bg-slate-50/70 dark:bg-slate-850 hover:bg-indigo-50/40 dark:hover:bg-slate-800/60'
                              }`}
                          >
                            <td className="px-2 py-1.5 text-[10px] font-mono font-bold text-slate-400 bg-slate-100/70 dark:bg-slate-800/80 border-r border-slate-200 dark:border-slate-700 select-none text-center w-8">
                              {rowIndex + 1}
                            </td>
                            {row.map((cell, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="max-w-64 truncate px-3 py-1.5 text-slate-800 dark:text-slate-200 border-b border-r border-slate-200/70 dark:border-slate-750/70"
                                title={cell}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-2 text-[10px] text-slate-400 shrink-0">
                    💡 Chế độ xem trước trực tiếp: Bấm các tab phía trên để chuyển đổi nhanh giữa các Sheet (Curriculum Order Form, Student Info, Teacher Info...).
                  </p>
                </div>
              ) : previewFile.filename.match(/\.(docx?|pptx?)$/i) ? (
                <div className="text-center space-y-3 m-auto">
                  <FileText className="w-12 h-12 text-sky-700 mx-auto" />
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Tài liệu Office cần trình xem của trình duyệt hoặc ứng dụng phù hợp.</p>
                  <a href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(previewFile.url)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-700 text-white text-xs font-bold hover:bg-sky-800 transition">
                    <ExternalLink className="w-4 h-4" /> Mở bằng Office Viewer
                  </a>
                </div>
              ) : (
                <div className="text-center space-y-3 m-auto">
                  <FileSpreadsheetIcon className="w-12 h-12 text-emerald-600 mx-auto" />
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{spreadsheetPreviewError || 'Định dạng này chưa có trình xem trực tiếp.'}</p>
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

            {/* Footer Modal */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Khung xem kiểm định an toàn đính kèm (Fail-Closed Review)
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-300 hover:bg-slate-200 transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở trong Tab Mới</span>
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
