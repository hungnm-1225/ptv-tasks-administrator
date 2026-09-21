// frontend/src/features/inbox/UnifiedInboxPage.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Inbox,
  Mail,
  Ticket,
  Search,
  RotateCcw,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import {
  InboxTicket,
  WorkflowDraft,
  WorkflowStep,
  CapabilityDefinition,
  WorkflowValidationResult
} from '../../types';
import { toast } from 'sonner';
import { HierarchySchoolItem, PreviewAttachmentFile } from './types';
import { TicketCard } from './components/TicketCard';
import { AttachmentPreviewModal } from './components/AttachmentPreviewModal';
import { WorkflowConsoleModal } from './components/WorkflowConsoleModal';

const TicketListSkeleton: React.FC = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((idx) => (
      <div
        key={idx}
        className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 animate-pulse"
      >
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

        <div className="space-y-2">
          <div className="h-6 w-3/4 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-3">
            <div className="h-4 w-48 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 w-36 rounded-md bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800/80 space-y-2">
          <div className="h-4 w-full rounded bg-slate-200/80 dark:bg-slate-800" />
          <div className="h-4 w-5/6 rounded bg-slate-200/60 dark:bg-slate-800/70" />
        </div>

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

export const UnifiedInboxPage: React.FC = () => {
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
  const [previewFile, setPreviewFile] = useState<PreviewAttachmentFile | null>(null);
  const [summarizingTicketId, setSummarizingTicketId] = useState<string | null>(null);

  // Metadata Phả hệ & Capabilities
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityDefinition[]>([]);

  // Workflow Console Modal State
  const [selectedWorkflowTicket, setSelectedWorkflowTicket] = useState<InboxTicket | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowDraft | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState<boolean>(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowValidating, setWorkflowValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [isConfirmingRun, setIsConfirmingRun] = useState<boolean>(false);

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
      if (target.closest('[data-category-dropdown]')) return;
      setActiveCategoryDropdown(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Workflow Handlers
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

  const handleOpenWorkflowConsole = async (ticket: InboxTicket) => {
    setSelectedWorkflowTicket(ticket);
    setWorkflowLoading(true);
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

  const handleReSummarize = async () => {
    if (!selectedWorkflowTicket) return;
    setWorkflowLoading(true);
    try {
      const res = await fetchApi<{ status: string; summary: any }>(
        `/tickets/${selectedWorkflowTicket.id}/re-summarize`,
        { method: 'POST' }
      );
      if (res && res.status === 'success') {
        const summaryText = typeof res.summary === 'string' ? res.summary : res.summary?.summary_vi || '';
        setSelectedWorkflowTicket((prev) => (prev ? { ...prev, ai_summary: summaryText } : null));
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
          const summaryText = typeof res.summary === 'string' ? res.summary : res.summary.summary_vi || '';
          setSelectedWorkflowTicket((prev) => (prev ? { ...prev, ai_summary: summaryText } : null));
        }
      }
    } catch (err) {
      toast.error('Lỗi tóm tắt vé: ' + (err as Error).message);
    } finally {
      setSummarizingTicketId(null);
    }
  };

  const handleReAssessIntent = async () => {
    if (!selectedWorkflowTicket) return;
    setWorkflowLoading(true);
    setWorkflowError(null);
    try {
      const res = await fetchApi<{ status: string; workflow?: any; result?: any }>(
        `/tickets/${selectedWorkflowTicket.id}/re-assess-intent`,
        { method: 'POST' }
      );
      const newWf = res?.workflow || res?.result?.workflow_draft || res?.result;

      if (newWf) {
        setActiveWorkflow(newWf);
        if (newWf.ai_analysis?.summary) {
          setSelectedWorkflowTicket((prev) => (prev ? { ...prev, ai_summary: newWf.ai_analysis.summary } : null));
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
    const reasonText = 'Quản trị viên tinh chỉnh thứ tự hoặc tham số bước';
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

  const handleConfirmAndRun = async () => {
    if (!activeWorkflow || isConfirmingRun) return;
    setIsConfirmingRun(true);

    try {
      const res = await fetchApi<{ status: string; message: string; workflow_id: string }>(
        `/workflows/${activeWorkflow.id}/approve_and_run`,
        {
          method: 'POST',
          body: JSON.stringify({ run_immediately: true }),
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

  // Ticket Operations
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
    const updated =
      selectedStatus === 'all'
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

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesSearch =
        searchQuery === '' ||
        (t.subject && t.subject.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.sender_email && t.sender_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.source_id && t.source_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.metadata?.school_name && t.metadata.school_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        selectedStatus === 'all' ? t.status !== 'dismissed' : t.status === selectedStatus;

      const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
      const matchesSource = selectedSource === 'all' || t.source === selectedSource;

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
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                ✕
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
          {filteredTickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onPreviewFile={setPreviewFile}
              onOpenWorkflowConsole={handleOpenWorkflowConsole}
              onSummarizeSingleTicket={handleSummarizeSingleTicket}
              onDismissTask={handleDismissTask}
              onRestoreTask={handleRestoreTask}
              onCompleteTask={handleCompleteTask}
              onCategoryChange={handleCategoryChange}
              actionLoading={actionLoading}
              summarizingTicketId={summarizingTicketId}
              activeCategoryDropdown={activeCategoryDropdown}
              setActiveCategoryDropdown={setActiveCategoryDropdown}
              spreadsheetId={SPREADSHEET_ID}
            />
          ))}
        </div>
      )}

      {/* Bento AI Workflow Console Modal */}
      <WorkflowConsoleModal
        selectedTicket={selectedWorkflowTicket}
        activeWorkflow={activeWorkflow}
        workflowLoading={workflowLoading}
        workflowError={workflowError}
        workflowValidating={workflowValidating}
        validationResult={validationResult}
        capabilities={capabilities}
        schoolsList={schoolsList}
        isConfirmingRun={isConfirmingRun}
        onClose={() => setSelectedWorkflowTicket(null)}
        onReSummarize={handleReSummarize}
        onReAssessIntent={handleReAssessIntent}
        onStepsChange={handleStepsChange}
        onSelectSchool={handleSelectSchool}
        onConfirmAndRun={handleConfirmAndRun}
        onRetryStep={handleRetryStep}
        onPreviewFile={setPreviewFile}
      />

      {/* Modal Xem Trước File Đính Kèm */}
      <AttachmentPreviewModal previewFile={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
};