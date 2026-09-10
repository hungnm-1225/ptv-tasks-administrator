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
  Copy
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

const SQL_MIGRATION_TEXT = `-- Copy & Chạy toàn bộ khối lệnh này trong Supabase Dashboard > SQL Editor:
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS automation_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES inbox_tickets(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    goal TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    version INT DEFAULT 1,
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_workflow_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES automation_workflows(id) ON DELETE CASCADE,
    field_changed VARCHAR(100) NOT NULL,
    old_val JSONB,
    new_val JSONB,
    changed_by VARCHAR(255) DEFAULT 'hung.nguyenmanh@dtt.vn',
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_ticket_id ON automation_workflows(ticket_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status    ON automation_workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created   ON automation_workflows(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_history_wf_id    ON automation_workflow_history(workflow_id);

ALTER TABLE automation_workflows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflow_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_dtt_vn_only" ON automation_workflows;
CREATE POLICY "admin_dtt_vn_only" ON automation_workflows
    FOR ALL
    USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

DROP POLICY IF EXISTS "admin_dtt_vn_only" ON automation_workflow_history;
CREATE POLICY "admin_dtt_vn_only" ON automation_workflow_history
    FOR ALL
    USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

DROP TRIGGER IF EXISTS trg_automation_workflows_updated_at ON automation_workflows;
CREATE TRIGGER trg_automation_workflows_updated_at
    BEFORE UPDATE ON automation_workflows
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
`;

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

  // Metadata Phả hệ & Khóa học
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityDefinition[]>([]);

  // =========================================================================
  // ⚡ WORKFLOW PRE-PROCESSING & EXECUTION CONSOLE STATE
  // =========================================================================
  const [selectedWorkflowTicket, setSelectedWorkflowTicket] = useState<InboxTicket | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowDraft | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState<boolean>(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowValidating, setWorkflowValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [isEditingWorkflow, setIsEditingWorkflow] = useState<boolean>(false);
  const [isConfirmingRun, setIsConfirmingRun] = useState<boolean>(false);

  // Entity Resolution: School Picker Autocomplete
  const [isSchoolPickerOpen, setIsSchoolPickerOpen] = useState<boolean>(false);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const schoolPickerRef = useRef<HTMLDivElement | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const SPREADSHEET_ID = '1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go';

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
      if (schoolPickerRef.current && !schoolPickerRef.current.contains(event.target as Node)) {
        setIsSchoolPickerOpen(false);
      }
      setActiveCategoryDropdown(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lọc trường học phục vụ Autocomplete Entity Resolution
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
    setValidationResult(null);
    setWorkflowError(null);

    try {
      const wf = await fetchApi<WorkflowDraft>(`/workflows/ticket/${ticket.id}`);
      if (wf) {
        setActiveWorkflow(wf);
        // Tự động kiểm tra validation
        runValidation(wf.id);
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

  const handleRePlanWorkflow = async () => {
    if (!selectedWorkflowTicket) return;
    setWorkflowLoading(true);
    setWorkflowError(null);
    try {
      const res = await fetchApi<{ status: string; workflow: WorkflowDraft }>('/workflows/plan', {
        method: 'POST',
        body: JSON.stringify({ ticket_id: selectedWorkflowTicket.id }),
      });
      if (res && res.workflow) {
        setActiveWorkflow(res.workflow);
        runValidation(res.workflow.id);
        toast.success('✨ AI đã lập lại kế hoạch Workflow thành công!');
      }
    } catch (err) {
      const msg = (err as Error).message || 'Lỗi không xác định';
      setWorkflowError(msg);
      toast.error('Lỗi khi AI tái lập plan: ' + msg);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleStepsChange = async (updatedSteps: WorkflowStep[]) => {
    if (!activeWorkflow) return;
    const updatedWf = { ...activeWorkflow, steps: updatedSteps };
    setActiveWorkflow(updatedWf);

    try {
      const res = await fetchApi<WorkflowDraft>(`/workflows/${activeWorkflow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          steps: updatedSteps,
          ai_analysis: activeWorkflow.ai_analysis,
          updated_by: 'hung.nguyenmanh@dtt.vn',
        }),
      });
      if (res) {
        setActiveWorkflow(res);
        runValidation(res.id);
      }
    } catch (err) {
      toast.error('Lỗi lưu thay đổi luồng: ' + (err as Error).message);
    }
  };

  const handleSelectSchool = async (school: HierarchySchoolItem) => {
    if (!activeWorkflow) return;
    setIsSchoolPickerOpen(false);

    // Cập nhật trường học vào detected_school và bind vào steps
    const updatedAnalysis = {
      ...activeWorkflow.ai_analysis,
      detected_school: {
        id: school.school_id,
        name: school.school_name,
        code: school.school_code,
        confidence: 1.0,
      },
    };

    const updatedSteps = activeWorkflow.steps.map((s) => {
      const newInputs = { ...s.inputs };
      if ('school_identifier' in newInputs || s.capability_id === 'workspace.resolve_school') {
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
          updated_by: 'hung.nguyenmanh@dtt.vn',
        }),
      });
      if (res) {
        setActiveWorkflow(res);
        runValidation(res.id);
      }
      toast.success(`Đã chọn trường: ${school.school_name} (100%)`);
    } catch (err) {
      toast.error('Lỗi cập nhật trường học: ' + (err as Error).message);
    }
  };

  const handleConfirmAndRun = async () => {
    if (!activeWorkflow) return;
    setIsConfirmingRun(true);

    try {
      const res = await fetchApi<{ status: string; message: string; workflow_id: string }>(
        `/workflows/${activeWorkflow.id}/approve_and_run`,
        {
          method: 'POST',
          body: JSON.stringify({
            approved_by: 'hung.nguyenmanh@dtt.vn',
            run_immediately: true,
            frozen_steps: activeWorkflow.steps,
          }),
        }
      );

      if (res && res.status === 'success') {
        toast.success(
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              <span>Workflow đã được duyệt và đang chạy ngầm!</span>
            </div>
            <p className="text-xs text-slate-500">Hệ thống đang thực thi từng bước theo thứ tự phụ thuộc.</p>
          </div>,
          { duration: 6000 }
        );

        setActiveWorkflow((prev) => (prev ? { ...prev, status: 'running' } : null));

        // Bắt đầu Polling trạng thái live execution mỗi 3s
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

  // =========================================================================
  // ⚡ INBOX TICKET FILTER & ACTION HANDLERS
  // =========================================================================
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
            {/* Filter Status Tabs */}
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

            {/* Filter Source */}
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

            {/* Filter Category */}
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
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-xs font-medium text-slate-500">Đang đồng bộ danh sách ticket...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy ticket nào</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Không có ticket phù hợp với bộ lọc hiện tại. Thử thay đổi điều kiện tìm kiếm hoặc bấm Quét Mới.
          </p>
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
                {/* Dòng 1: Tags, Người gửi, Thời gian */}
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

                {/* Tiêu đề & Thông tin trường */}
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

                {/* File Attachments */}
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

                {/* Gemini AI Summary & Auto-prefilled Banner */}
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

                        {/* NÚT TRỌNG TÂM: MỞ AI WORKFLOW CONSOLE */}
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
      {/* 🚀 BENTO AI WORKFLOW PRE-PROCESSING & EXECUTION CONSOLE (REVAMPED) */}
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
                      v{activeWorkflow?.version || 1}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Request #{selectedWorkflowTicket.source_id || selectedWorkflowTicket.id.slice(0, 8)} • AI đã lập kế hoạch & tiền xử lý luồng.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRePlanWorkflow}
                  disabled={workflowLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                  title="Yêu cầu Gemini AI phân tích và lập lại kế hoạch luồng"
                >
                  <Wand2 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>AI Tái Lập Plan</span>
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

            {/* Thân cuộn của Bento Console */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 py-4">
              {workflowLoading ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <p className="text-xs font-medium text-slate-500">Đang nạp và phân giải đồ thị Workflow...</p>
                </div>
              ) : !activeWorkflow ? (
                <div className="py-10 px-4 max-w-2xl mx-auto space-y-4">
                  {workflowError && (workflowError.includes('automation_workflows') || workflowError.includes('PGRST205') || workflowError.includes('503')) ? (
                    <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-slate-800 dark:text-slate-100 space-y-4 shadow-xl">
                      <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-6 h-6 shrink-0" />
                        <h4 className="text-sm font-black">Chưa khởi tạo bảng cơ sở dữ liệu `automation_workflows`</h4>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        Hệ thống phát hiện cơ sở dữ liệu Supabase chưa áp dụng migration cho tính năng AI Workflow Console.
                        Vui lòng copy đoạn mã SQL bên dưới và chạy trong <b>Supabase Dashboard &gt; SQL Editor</b> để hoàn tất thiết lập.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(SQL_MIGRATION_TEXT);
                            toast.success("📋 Đã sao chép mã SQL Migration vào Clipboard!");
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition shadow-md shadow-amber-600/20 cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                          <span>Sao Chép SQL Migration (1-Click)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => selectedWorkflowTicket && handleOpenWorkflowConsole(selectedWorkflowTicket)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span>Thử Lại (Reload)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-slate-400 text-xs space-y-2">
                      <p>Không tìm thấy dữ liệu workflow cho yêu cầu này.</p>
                      {workflowError && <p className="text-rose-500 text-[11px] font-mono">{workflowError}</p>}
                      <button
                        type="button"
                        onClick={handleRePlanWorkflow}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 transition mt-2 cursor-pointer"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Yêu cầu AI Lập Kế Hoạch Ngay</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* BENTO GRID: VÙNG A (REQUEST) + VÙNG B (AI UNDERSTANDING) */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* VÙNG A: REQUEST CONTEXT (4 cols) */}
                    <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                            VÙNG A • Thông Tin Yêu Cầu
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

                        {/* File attachments */}
                        {selectedWorkflowTicket.attachments && selectedWorkflowTicket.attachments.length > 0 && (
                          <div className="pt-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                              Tài liệu đính kèm ({selectedWorkflowTicket.attachments.length}):
                            </span>
                            <div className="space-y-1.5">
                              {selectedWorkflowTicket.attachments.map((att: any, i: number) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                                >
                                  <span className="truncate max-w-[200px] font-medium text-slate-700 dark:text-slate-300">
                                    {att.filename}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewFile(att)}
                                    className="p-1 text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
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
                    </div>

                    {/* VÙNG B: AI UNDERSTANDING & ENTITY RESOLUTION (7 cols) */}
                    <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>VÙNG B • AI Understanding & Entity Resolution</span>
                        </span>
                        <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-indigo-600 border border-indigo-200 dark:border-indigo-800">
                          Độ tin cậy: {Math.round((activeWorkflow.ai_analysis?.overall_confidence || 0.9) * 100)}%
                        </span>
                      </div>

                      {/* Mục tiêu (Goal) */}
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 text-xs">
                        <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">
                          Mục Tiêu Nhận Diện (Goal):
                        </span>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {activeWorkflow.title}
                        </p>
                      </div>

                      {/* ENTITY RESOLUTION: TRƯỜNG HỌC (SCHOOL) */}
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-indigo-500" />
                            <span>Trường Học Mục Tiêu (Detected School):</span>
                          </span>

                          {activeWorkflow.ai_analysis?.detected_school && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              ✓ Khớp {Math.round((activeWorkflow.ai_analysis.detected_school.confidence || 0.9) * 100)}%
                            </span>
                          )}
                        </div>

                        {/* Card hiển thị trường hoặc Selector nếu chưa chắc chắn */}
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

                          {/* Dropdown tìm kiếm từ danh sách 480 trường */}
                          {isSchoolPickerOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 p-2 z-50 max-h-60 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-100">
                              <div className="relative w-full">
                                <input
                                  type="text"
                                  value={schoolSearchQuery}
                                  onChange={(e) => setSchoolSearchQuery(e.target.value)}
                                  placeholder="Nhập tên trường hoặc mã trường (VD: Saint Joseph, 123...)"
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

                      {/* Khóa học nhận diện */}
                      {activeWorkflow.ai_analysis?.detected_courses && activeWorkflow.ai_analysis.detected_courses.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                            <BookOpen className="w-3 h-3 text-indigo-500" /> Khóa học:
                          </span>
                          {activeWorkflow.ai_analysis.detected_courses.map((c, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                            >
                              {c.course_name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Giải thích lý do (Why this workflow?) */}
                      {activeWorkflow.ai_analysis?.reason_summary_vi && (
                        <div className="p-3.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/70 text-xs text-amber-950 dark:text-amber-100 font-medium leading-relaxed shadow-xs">
                          <div className="font-extrabold mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-900 dark:text-amber-300">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                            <span>Lý do lựa chọn luồng này (Why this workflow?):</span>
                          </div>
                          <p>{activeWorkflow.ai_analysis.reason_summary_vi}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* VÙNG C: PREPARED WORKFLOW & EXECUTION CONSOLE */}
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
                              ? 'Chế độ chỉnh sửa: Bạn có thể thêm, bớt, đổi thứ tự và sửa inputs của từng bước.'
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
                          <span>{isEditingWorkflow ? 'Hoàn Tất Chỉnh Sửa' : 'Chỉnh Sửa Luồng'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Workflow Builder Component */}
                    <WorkflowBuilder
                      steps={activeWorkflow.steps}
                      capabilities={capabilities}
                      isEditable={isEditingWorkflow}
                      onStepsChange={handleStepsChange}
                      onRetryStep={handleRetryStep}
                    />

                    {/* Safety Gate & Validation Panel */}
                    <WorkflowValidationPanel
                      validation={validationResult}
                      isValidating={workflowValidating}
                      isSchoolResolved={!!activeWorkflow.ai_analysis?.detected_school}
                      totalSteps={activeWorkflow.steps.length}
                    />
                  </div>
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
                ) : activeWorkflow?.status === 'success' ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-extrabold border border-emerald-300">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Đã Hoàn Thành Toàn Bộ Luồng!</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isConfirmingRun || (validationResult ? !validationResult.is_valid : false)}
                    onClick={handleConfirmAndRun}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white hover:brightness-110 disabled:opacity-50 transition shadow-lg shadow-indigo-500/25 cursor-pointer"
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