// frontend/src/features/tasks/TaskManagementPage.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  RotateCw,
  Search,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Play,
  FileText,
  X,
  Copy,
  Check,
  Building2,
  GraduationCap,
  Key,
  Github,
  Mail,
  Users,
  Lock,
  Sliders,
  Code2,
  Terminal,
  Download,
  Loader2,
  Edit3,
  XCircle,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotAutomationTask } from '../../types';
import { toast } from 'sonner';

// ⚡ TRỢ THỦ PERSISTENT STORAGE (LƯU LOCALSTORAGE - 0MS INSTANT RENDER)
const getTaskLocalCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(`ptv_tasks_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const setTaskLocalCache = (key: string, data: any) => {
  try {
    localStorage.setItem(`ptv_tasks_${key}`, JSON.stringify(data));
  } catch { }
};

const extractCleanEmail = (raw: any): string => {
  if (!raw || typeof raw !== 'string') return '';
  const match = raw.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  return match ? match[0].trim().toLowerCase() : raw.replace(/["'<>]/g, '').trim().toLowerCase();
};

const formatVNDateTime = (isoString?: string) => {
  if (!isoString) return '---';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
};

export const TaskManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'executed' | 'failed'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'bento'>('table');

  const initialCachedTasks = useMemo(() => {
    return getTaskLocalCache<BotAutomationTask[]>('master_task_cache') || [];
  }, []);

  const [tasks, setTasks] = useState<BotAutomationTask[]>(initialCachedTasks);
  const [loading, setLoading] = useState<boolean>(initialCachedTasks.length === 0);
  const [selectedBotFilter, setSelectedBotFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Drawer State
  const [selectedTask, setSelectedTask] = useState<BotAutomationTask | null>(null);
  const [detailDrawerTask, setDetailDrawerTask] = useState<BotAutomationTask | null>(null);
  const detailDrawerTaskIdRef = useRef<string | null>(null);
  const [modalMode, setModalMode] = useState<'form' | 'json'>('form');

  const openDetailDrawer = (task: BotAutomationTask) => {
    detailDrawerTaskIdRef.current = task.id;
    setDetailDrawerTask(task);
  };

  const closeDetailDrawer = () => {
    detailDrawerTaskIdRef.current = null;
    setDetailDrawerTask(null);
  };

  // Clipboard Copied states
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [copiedTaskId, setCopiedTaskId] = useState<boolean>(false);

  // State cho Visual Form Điều Khiển Keycloak
  const [kcIdentifiersText, setKcIdentifiersText] = useState<string>('');
  const [kcActionType, setKcActionType] = useState<string>('bulk_both');
  const [kcTargetStatus, setKcTargetStatus] = useState<string>('enabled');
  const [kcPasswordOption, setKcPasswordOption] = useState<string>('email_lowercase');
  const [kcCustomPassword, setKcCustomPassword] = useState<string>('');
  const [kcTemporary, setKcTemporary] = useState<boolean>(false);

  const [jsonPayload, setJsonPayload] = useState<string>('');
  const [approving, setApproving] = useState<boolean>(false);
  const [rejecting, setRejecting] = useState<boolean>(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // ⚡ SWR TẢI TASKS
  const loadTasks = useCallback(async (forceSpinner = false) => {
    const cached = getTaskLocalCache<BotAutomationTask[]>('master_task_cache');
    if (cached && !forceSpinner) {
      setTasks(cached);
      setLoading(false);
    } else if (forceSpinner || !cached) {
      setLoading(true);
    }

    try {
      const data = await fetchApi<BotAutomationTask[]>('/tasks');
      if (data) {
        setTasks(data);
        setTaskLocalCache('master_task_cache', data);

        // Cập nhật lại detailDrawerTask nếu đang mở
        if (detailDrawerTaskIdRef.current) {
          const fresh = data.find(t => t.id === detailDrawerTaskIdRef.current);
          if (fresh) setDetailDrawerTask(fresh);
        }
      }
    } catch (err) {
      if (!cached) {
        toast.error('Không thể nạp danh sách tác vụ bot: ' + (err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(() => {
      loadTasks();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const getTaskBusinessInfo = (task: BotAutomationTask) => {
    const payload = task.payload_data || {};
    const botType = task.bot_type;
    const action = payload.action || payload.action_type || '';

    let title = 'Tác vụ tự động hóa';
    let subtitle = '';
    let target = '';
    let icon = Zap;
    let badgeColor = 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/50';

    if (botType === 'workspace_rpa' || botType === 'lms_playwright') {
      icon = Building2;
      badgeColor = 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/50';

      if (action === 'bulk_account_creation') {
        const school = payload.school_name || 'Trường học';
        const count = payload.total_count || payload.record_count || 'Nhiều';
        title = `Tạo tài khoản hàng loạt (${count} tài khoản)`;
        subtitle = school;
        target = payload.request_id ? `Mã Batch: #REQ-${payload.request_id}` : payload.filename || 'accounts.xlsx';
      } else if (action === 'approve_school_order_standalone') {
        title = `Duyệt School Order [${payload.order_code || 'N/A'}]`;
        subtitle = payload.school_name || payload.partner_name || 'Trường học';
      } else if (action === 'approve_partner_contract_standalone') {
        title = `Duyệt Hợp Đồng PRT [${payload.contract_code || 'N/A'}]`;
        subtitle = `Đối tác: ${payload.partner_name || 'N/A'}`;
      } else if (action === 'admin_approve_contract') {
        title = `Sales Admin Duyệt Contract DST [${payload.contract_code || 'N/A'}]`;
        subtitle = `Nhà phân phối: ${payload.distributor_name || 'N/A'}`;
      } else if (action === 'pipeline_end_to_end') {
        title = `Chuỗi Toàn Trình 4 Cấp (End-to-End)`;
        subtitle = payload.school_name || 'Trường học';
      } else if (action === 'direct_moodle_lms_enroll') {
        icon = GraduationCap;
        title = `Ghi danh PLearn LMS: ${payload.course_name || 'Khóa học'}`;
        const totalUsers = (payload.student_emails?.length || 0) + (payload.teacher_emails?.length || 0) + (payload.manager_emails?.length || 0);
        subtitle = `Tổng ${totalUsers || 'Nhiều'} người dùng | Hạn: ${payload.end_date || '1 năm'}`;
      } else {
        title = `Workspace RPA: ${action || 'Thực thi nghiệp vụ'}`;
        subtitle = payload.school_name || '';
      }
    } else if (botType === 'keycloak_api') {
      icon = Key;
      badgeColor = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/50';
      const email = payload.target_email || payload.identifier || (payload.identifiers && payload.identifiers[0]) || 'User';
      title = `Quản trị Keycloak: ${email}`;
      const actions = payload.actions || [];
      subtitle = actions.length > 0 ? actions.join(' | ') : 'Reset pass / Xác thực / Trạng thái';
    } else if (botType === 'github_issue_creator') {
      icon = Github;
      badgeColor = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
      title = `Tạo GitHub Issue: ${payload.title || 'Báo cáo sự cố'}`;
      subtitle = `Người phụ trách: @${payload.assignees?.join(', ') || 'QA Lead'}`;
    } else if (botType === 'feedback_doc_triage' || botType === 'google_doc_comment') {
      icon = FileText;
      badgeColor = 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/50';
      title = `Ghi chú Google Doc & Phân công (Dòng #${payload.row_index || 2})`;
      subtitle = payload.assignee_email ? `Gán việc: ${payload.assignee_email}` : '';
    }

    return { title, subtitle, target, icon, badgeColor };
  };

  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => t.approval_status === 'pending').length;
    const processing = tasks.filter(
      (t) =>
        t.approval_status === 'approved' &&
        (!t.execution_status ||
          t.execution_status === 'queued' ||
          (t.execution_status as string) === 'running' ||
          (t.execution_status as string) === 'processing' ||
          (t.execution_status as string) === 'waiting_poll')
    ).length;
    const success = tasks.filter((t) => t.execution_status === 'success').length;
    const failed = tasks.filter(
      (t) => t.execution_status === 'failed' || t.approval_status === 'rejected'
    ).length;
    const executedTotal = success + failed;
    const successRate = executedTotal > 0 ? Math.round((success / executedTotal) * 100) : 100;

    return { total, pending, processing, success, failed, successRate };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (activeTab === 'pending' && t.approval_status !== 'pending') return false;
      if (activeTab === 'executed' && (t.approval_status !== 'approved' || t.execution_status === 'failed')) return false;
      if (activeTab === 'failed' && t.execution_status !== 'failed' && t.approval_status !== 'rejected') return false;

      if (selectedBotFilter !== 'all' && t.bot_type !== selectedBotFilter) return false;

      const query = searchQuery.trim().toLowerCase().replace(/^#/, '');
      if (query) {
        const tId = (t.id || '').toLowerCase().replace(/-/g, '');
        const bType = (t.bot_type || '').toLowerCase();
        const pStr = JSON.stringify(t.payload_data || {}).toLowerCase();
        const subject = (t.inbox_tickets?.subject || '').toLowerCase();
        const sender = (t.inbox_tickets?.sender_email || '').toLowerCase();

        const match =
          tId.includes(query) ||
          bType.includes(query) ||
          pStr.includes(query) ||
          subject.includes(query) ||
          sender.includes(query);

        if (!match) return false;
      }

      return true;
    });
  }, [tasks, activeTab, selectedBotFilter, searchQuery]);

  const handleOpenReview = (task: BotAutomationTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedTask(task);
    const payload = task.payload_data || {};

    let emails: string[] = [];
    if (payload.identifiers && Array.isArray(payload.identifiers)) {
      emails = payload.identifiers.map(extractCleanEmail);
    } else if (payload.emails && Array.isArray(payload.emails)) {
      emails = payload.emails.map(extractCleanEmail);
    } else {
      const single = payload.identifier || payload.target_email || payload.email || payload.username || '';
      if (single) emails = [extractCleanEmail(single)];
    }
    setKcIdentifiersText(emails.filter(Boolean).join('\n'));

    const action = payload.action_type || payload.action || 'bulk_both';
    setKcActionType(action);

    if (payload.target_status) {
      setKcTargetStatus(payload.target_status);
    } else if (action === 'enable_user') {
      setKcTargetStatus('enabled');
    } else if (action === 'disable_user') {
      setKcTargetStatus('disabled');
    } else {
      setKcTargetStatus('keep');
    }

    const passOpt = payload.password_option || 'email_lowercase';
    setKcPasswordOption(passOpt);
    setKcCustomPassword(payload.new_password || payload.temp_pass || '');
    setKcTemporary(Boolean(payload.temporary));

    setJsonPayload(JSON.stringify(payload, null, 2));
    setModalMode(task.bot_type === 'keycloak_api' ? 'form' : 'json');
  };

  const buildFinalPayload = () => {
    if (selectedTask?.bot_type === 'keycloak_api' && modalMode === 'form') {
      const emailList = kcIdentifiersText
        .split('\n')
        .map((s) => extractCleanEmail(s))
        .filter(Boolean);

      return {
        bot_type: 'keycloak_api',
        action_type: kcActionType,
        target_status: kcTargetStatus === 'keep' ? null : kcTargetStatus,
        password_option: kcPasswordOption,
        new_password: kcPasswordOption === 'custom' ? kcCustomPassword : null,
        temporary: kcTemporary,
        identifiers: emailList,
      };
    }

    try {
      return JSON.parse(jsonPayload);
    } catch {
      return selectedTask?.payload_data || {};
    }
  };

  const handleApprove = async () => {
    if (!selectedTask) return;
    setApproving(true);
    const prevTasks = [...tasks];
    const taskId = selectedTask.id;
    const finalPayload = buildFinalPayload();

    const updatedTasks: BotAutomationTask[] = tasks.map(t => t.id === taskId ? {
      ...t,
      approval_status: 'approved' as any,
      execution_status: 'queued' as any,
      payload_data: finalPayload
    } : t);

    setTasks(updatedTasks);
    setTaskLocalCache('master_task_cache', updatedTasks);
    setSelectedTask(null);
    const taskIdShort = taskId ? taskId.slice(0, 8) : '';
    toast.success(`Đã phê duyệt và khởi chạy worker #${taskIdShort}!`);

    try {
      await fetchApi(`/tasks/${taskId}/approve`, {
        method: 'PUT',
        body: JSON.stringify({
          approval_status: 'approved',
          edited_payload: finalPayload,
        }),
      });
      await loadTasks(false);
    } catch (err) {
      setTasks(prevTasks);
      toast.error('Lỗi phê duyệt tác vụ: ' + (err as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (taskId: string) => {
    setRejecting(true);
    const prevTasks = [...tasks];

    const updatedTasks: BotAutomationTask[] = tasks.map(t => t.id === taskId ? {
      ...t,
      approval_status: 'rejected' as any,
      execution_status: 'dismissed' as any
    } : t);

    setTasks(updatedTasks);
    setTaskLocalCache('master_task_cache', updatedTasks);
    setSelectedTask(null);
    const taskIdShort = taskId ? taskId.slice(0, 8) : '';
    toast.info(`Đã từ chối tác vụ #${taskIdShort}.`);

    try {
      await fetchApi(`/tasks/${taskId}/reject`, { method: 'PUT' });
      await loadTasks(false);
    } catch (err) {
      setTasks(prevTasks);
      toast.error('Lỗi từ chối tác vụ: ' + (err as Error).message);
    } finally {
      setRejecting(false);
    }
  };

  // 🔄 Kích hoạt Retry qua đúng endpoint /tasks/{id}/retry
  const handleRetryTask = async (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRetryingId(taskId);
    try {
      await fetchApi(`/tasks/${taskId}/retry`, { method: 'PUT' });
      toast.success(`Đã đưa tác vụ #${taskId.slice(0, 8)} vào hàng đợi chạy lại!`);
      await loadTasks(true);
    } catch (err) {
      toast.error('Lỗi khi kích hoạt chạy lại: ' + (err as Error).message);
    } finally {
      setRetryingId(null);
    }
  };

  const copyPayloadToClipboard = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const copyLogsToClipboard = (logsText: string) => {
    navigator.clipboard.writeText(logsText);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const copyTaskIdToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTaskId(true);
    setTimeout(() => setCopiedTaskId(false), 2000);
  };

  const renderStatusBadge = (approval: string, execution: string, payload: any) => {
    if (approval === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
          <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span>CHỜ PHÊ DUYỆT</span>
        </span>
      );
    } else if (approval === 'approved') {
      if (execution === 'success') {
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>THÀNH CÔNG</span>
          </span>
        );
      } else if (execution === 'failed') {
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 text-xs font-bold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-2xs">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            <span>THẤT BẠI</span>
          </span>
        );
      } else if (execution === 'waiting_poll') {
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
            <Clock className="h-3.5 w-3.5 animate-spin" />
            <span>{payload?.request_id ? `ĐỢI BATCH #${payload.request_id}` : 'ĐANG ĐỢI POLLING'}</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 dark:bg-sky-950/60 px-2.5 py-1 text-xs font-bold text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500"></span>
          </span>
          <span>ĐANG XỬ LÝ</span>
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          <XCircle className="h-3.5 w-3.5 text-slate-500" />
          <span>BỊ TỪ CHỐI</span>
        </span>
      );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
              Task & Bot Automation Hub
            </h1>
            <span className="inline-flex rounded-full bg-indigo-50 dark:bg-indigo-950/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 shadow-2xs">
              Live Core Hub
            </span>
          </div>
          <p className="mt-1.5 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
            Cổng điều phối và theo dõi tiến trình thực thi của toàn bộ hệ thống Bot Workers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            id="btn-refresh-task-list"
            onClick={() => loadTasks(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-60"
          >
            <RotateCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{loading ? 'Đang Tải Dữ Liệu...' : 'Làm Mới Danh Sách'}</span>
          </button>
        </div>
      </div>

      {/* 2. Key Metrics & Status Deck */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Card 1: Tổng Tác Vụ */}
        <div
          className="relative overflow-hidden rounded-2xl border border-indigo-100 dark:border-indigo-950/60 bg-gradient-to-br from-[#EEF2FF] to-[#F5F3FF] dark:from-indigo-950/40 dark:to-slate-900 p-4.5 shadow-xs hover:-translate-y-0.5 transition-transform duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-900/70 dark:text-indigo-300">Tổng Tác Vụ Ghi Nhận</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-800 text-indigo-600 shadow-xs">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-mono">
              {stats.total}
            </span>
            <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">tác vụ toàn hệ thống</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
            <span>Phân hệ RPA & Playwright</span>
          </div>
        </div>

        {/* Card 2: Đang Xử Lý */}
        <div
          className="relative overflow-hidden rounded-2xl border border-sky-100 dark:border-sky-950/60 bg-gradient-to-br from-[#E0F2FE] to-[#F0F9FF] dark:from-sky-950/40 dark:to-slate-900 p-4.5 shadow-xs hover:-translate-y-0.5 transition-transform duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-sky-900/70 dark:text-sky-300">Đang Xử Lý (Active)</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-800 text-sky-600 shadow-xs">
              <RotateCw className="h-4 w-4 animate-spin" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-mono">
              {stats.processing}
            </span>
            <span className="text-[11px] font-medium text-sky-700 dark:text-sky-400">bot đang chạy</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse"></span>
            <span>Khả dụng: 6 workers</span>
          </div>
        </div>

        {/* Card 3: Chờ Phê Duyệt */}
        <div
          className="relative overflow-hidden rounded-2xl border border-amber-100 dark:border-amber-950/60 bg-gradient-to-br from-[#FEF3C7]/70 to-[#FFFBEB] dark:from-amber-950/40 dark:to-slate-900 p-4.5 shadow-xs hover:-translate-y-0.5 transition-transform duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900/80 dark:text-amber-300">Chờ Phê Duyệt</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-800 text-amber-600 shadow-xs">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-mono">
              {stats.pending}
            </span>
            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">yêu cầu chờ</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            <span>Cần Human-in-the-Loop xác nhận</span>
          </div>
        </div>

        {/* Card 4: Hiệu Suất */}
        <div
          className="relative overflow-hidden rounded-2xl border border-emerald-100 dark:border-emerald-950/60 bg-gradient-to-br from-[#ECFDF5] to-[#F0FDF4] dark:from-emerald-950/40 dark:to-slate-900 p-4.5 shadow-xs hover:-translate-y-0.5 transition-transform duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-900/80 dark:text-emerald-300">Hiệu Suất Thực Thi</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-800 text-emerald-600 shadow-xs">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400 font-mono">
              {stats.successRate}%
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              ({stats.success} ok / {stats.failed} lỗi)
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">Hoàn thành tốt</span>
            {stats.failed > 0 && (
              <span
                className="text-rose-600 dark:text-rose-400 font-medium cursor-pointer hover:underline"
                onClick={() => setActiveTab('failed')}
              >
                {stats.failed} cần chạy lại →
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Filter, Search & View Controls */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800 p-1 rounded-xl">
            {[
              { id: 'all', label: 'Tất Cả Tác Vụ', count: stats.total },
              { id: 'pending', label: '⏳ Chờ Phê Duyệt', count: stats.pending },
              { id: 'executed', label: '✓ Đã Duyệt & Thực Thi', count: stats.success + stats.processing },
              { id: 'failed', label: '⚠️ Thất Bại', count: stats.failed },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${activeTab === tab.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === tab.id
                    ? 'bg-white/20 dark:bg-slate-900/20 text-white dark:text-slate-900'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div className="relative">
              <select
                value={selectedBotFilter}
                onChange={(e) => setSelectedBotFilter(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">Tất cả Phân Hệ</option>
                <option value="workspace_rpa">🏢 Workspace RPA</option>
                <option value="lms_playwright">🎓 PLearn LMS</option>
                <option value="keycloak_api">🔑 Keycloak IDP</option>
                <option value="github_issue_creator">🐙 GitHub Issue</option>
                <option value="feedback_doc_triage">📝 Feedback Sheet</option>
              </select>
            </div>

            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã task (VD: 7a057e0b), tên trường, email..."
                className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-8 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
                  }`}
                title="Dạng bảng chi tiết"
              >
                <TableIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('bento')}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${viewMode === 'bento' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
                  }`}
                title="Dạng Bento Grid cards"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Main Data Display: Table or Bento Cards */}
      {loading && tasks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3 animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <span className="text-xs font-bold text-slate-500">Đang nạp dữ liệu tiến trình tác vụ...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-slate-800 text-indigo-500 mb-3">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Không tìm thấy tác vụ phù hợp</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Không có tác vụ nào khớp với bộ lọc hoặc từ khóa tìm kiếm.
          </p>
          <button
            onClick={() => {
              setActiveTab('all');
              setSelectedBotFilter('all');
              setSearchQuery('');
            }}
            className="mt-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-xs font-semibold shadow-sm cursor-pointer"
          >
            Đặt lại tất cả bộ lọc
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-850/50 text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
                  <th className="py-3.5 px-4 sm:px-6">MÃ TÁC VỤ</th>
                  <th className="py-3.5 px-4">NỘI DUNG NGHIỆP VỤ CỐT LÕI</th>
                  <th className="py-3.5 px-4">NGUỒN YÊU CẦU</th>
                  <th className="py-3.5 px-4">TRẠNG THÁI & TIẾN TRÌNH</th>
                  <th className="py-3.5 px-4">THỜI GIAN</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredTasks.map((task) => {
                  const rawId = task.id || '';
                  const taskIdClean = rawId.replace(/-/g, '');
                  const taskIdDisplay = taskIdClean ? `#${taskIdClean.slice(0, 8)}` : '#TASK';
                  const info = getTaskBusinessInfo(task);
                  const Icon = info.icon;
                  const payload = task.payload_data || {};
                  const resultUrl = payload.result_file_url;
                  const ticket = task.inbox_tickets;
                  const isFromStudio = !task.ticket_id && !ticket;

                  return (
                    <tr
                      key={task.id}
                      onClick={() => openDetailDrawer(task)}
                      className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      {/* Mã Tác Vụ */}
                      <td className="py-4 px-4 sm:px-6 align-top whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline">
                            {taskIdDisplay}
                          </span>
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${info.badgeColor}`}>
                            <Icon className="w-3 h-3" />
                            <span>{task.bot_type}</span>
                          </div>
                        </div>
                      </td>

                      {/* Nội Dung Nghiệp Vụ */}
                      <td className="py-4 px-4 align-top max-w-sm">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-slate-900 dark:text-white leading-snug">
                            {info.title}
                          </span>
                          {info.subtitle && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              {info.subtitle}
                            </span>
                          )}
                          {info.target && (
                            <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                              {info.target}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Nguồn Yêu Cầu */}
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        {isFromStudio ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
                            <Zap className="h-3.5 w-3.5 text-indigo-600" />
                            <span>Tác vụ Direct (Studio)</span>
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              <Mail className="h-3 w-3 text-slate-400" />
                              <span>{ticket?.submitter_name || ticket?.sender_email || 'Inbox Ticket'}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
                              {ticket?.subject || `Ticket #${task.ticket_id?.slice(0, 8)}`}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Trạng Thái & File Result */}
                      <td className="py-4 px-4 align-top whitespace-nowrap space-y-1.5">
                        <div>{renderStatusBadge(task.approval_status, task.execution_status, payload)}</div>
                        {resultUrl && (
                          <a
                            href={resultUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold transition shadow-xs"
                          >
                            <Download className="w-3 h-3" />
                            <span>Tải File (.xlsx)</span>
                          </a>
                        )}
                      </td>

                      {/* Thời Gian */}
                      <td className="py-4 px-4 align-top whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {formatVNDateTime(task.executed_at || task.created_at)}
                      </td>

                      {/* Thao Tác */}
                      <td className="py-4 px-4 sm:px-6 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {task.approval_status === 'pending' ? (
                            <button
                              onClick={(e) => handleOpenReview(task, e)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Duyệt & Chạy</span>
                            </button>
                          ) : (
                            <>
                              {task.execution_status === 'failed' && (
                                <button
                                  onClick={(e) => handleRetryTask(task.id, e)}
                                  disabled={retryingId === task.id}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition shadow-xs cursor-pointer disabled:opacity-60"
                                >
                                  {retryingId === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                                  <span>Chạy Lại</span>
                                </button>
                              )}

                              <button
                                onClick={() => openDetailDrawer(task)}
                                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition cursor-pointer"
                              >
                                <Terminal className="h-3.5 w-3.5 text-indigo-500" />
                                <span>Chi Tiết & Log</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Bento Grid Cards View */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map((task) => {
            const rawId = task.id || '';
            const taskIdClean = rawId.replace(/-/g, '');
            const taskIdDisplay = taskIdClean ? `#${taskIdClean.slice(0, 8)}` : '#TASK';
            const info = getTaskBusinessInfo(task);
            const payload = task.payload_data || {};

            return (
              <div
                key={task.id}
                onClick={() => openDetailDrawer(task)}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md cursor-pointer space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {taskIdDisplay}
                    </span>
                    {renderStatusBadge(task.approval_status, task.execution_status, payload)}
                  </div>

                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${info.badgeColor}`}>
                    <span>{task.bot_type}</span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug group-hover:text-indigo-600 transition-colors line-clamp-2">
                    {info.title}
                  </h3>

                  {info.subtitle && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {info.subtitle}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatVNDateTime(task.executed_at || task.created_at)}
                  </span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {task.approval_status === 'pending' ? (
                      <button
                        onClick={(e) => handleOpenReview(task, e)}
                        className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition cursor-pointer"
                      >
                        Duyệt
                      </button>
                    ) : (
                      <button
                        onClick={() => openDetailDrawer(task)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Chi Tiết
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SLIDE-OVER DETAIL & LIVE LOGS DRAWER (DÙNG REACT PORTAL) */}
      {/* ========================================================================= */}
      {detailDrawerTask && createPortal(
        <div
          id="task-detail-drawer-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetailDrawer();
          }}
          className="fixed inset-0 z-[9999] flex justify-end bg-slate-950/70 backdrop-blur-sm transition-opacity"
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[min(100vw,680px)] sm:w-[620px] lg:w-[680px] flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/70 dark:bg-slate-850/50 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => copyTaskIdToClipboard(detailDrawerTask.id)}
                  className="font-mono text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                  title="Bấm để sao chép Full Task UUID"
                >
                  <span>#{detailDrawerTask.id?.replace(/-/g, '').slice(0, 8)}</span>
                  {copiedTaskId ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                {renderStatusBadge(
                  detailDrawerTask.approval_status,
                  detailDrawerTask.execution_status,
                  detailDrawerTask.payload_data
                )}
              </div>

              <div className="flex items-center gap-2">
                {detailDrawerTask.execution_status === 'failed' && (
                  <button
                    onClick={(e) => {
                      handleRetryTask(detailDrawerTask.id, e);
                    }}
                    disabled={retryingId === detailDrawerTask.id}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-xs cursor-pointer disabled:opacity-60"
                  >
                    {retryingId === detailDrawerTask.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                    <span>Chạy Lại Tác Vụ</span>
                  </button>
                )}
                {detailDrawerTask.approval_status === 'pending' && (
                  <button
                    onClick={(e) => {
                      handleOpenReview(detailDrawerTask, e);
                      closeDetailDrawer();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs cursor-pointer"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Phê Duyệt</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeDetailDrawer();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <div className="mb-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-200/60">
                    {detailDrawerTask.bot_type}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {getTaskBusinessInfo(detailDrawerTask).title}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {getTaskBusinessInfo(detailDrawerTask).subtitle}
                </p>
              </div>

              {/* Live Console Logs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Nhật Ký Thực Thi (Terminal Logs)
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyLogsToClipboard(detailDrawerTask.execution_logs || '')}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {copiedLogs ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedLogs ? 'Đã sao chép' : 'Sao chép logs'}</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-4 font-mono text-[11px] text-slate-200 max-h-72 overflow-y-auto space-y-1.5 shadow-inner scrollbar-thin">
                  {detailDrawerTask.execution_logs ? (
                    detailDrawerTask.execution_logs.split('\n').filter(Boolean).map((line, index) => {
                      const isError = line.includes('ERROR') || line.includes('failed') || line.includes('CRITICAL');
                      const isSuccess = line.includes('SUCCESS') || line.includes('Hoàn thành') || line.includes('thành công');
                      const isApproval = line.includes('APPROVAL');

                      return (
                        <div
                          key={index}
                          className={`flex items-start gap-2 py-0.5 px-1.5 rounded transition-colors ${isError
                            ? 'bg-rose-950/30 text-rose-300'
                            : isSuccess
                              ? 'bg-emerald-950/20 text-emerald-300 font-medium'
                              : isApproval
                                ? 'bg-indigo-950/30 text-indigo-300'
                                : 'hover:bg-slate-800/40 text-slate-300'
                            }`}
                        >
                          <span className="text-slate-600 select-none">❯</span>
                          <span className="break-all">{line}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-slate-500 italic">Chưa có nhật ký ghi nhận cho tác vụ này.</div>
                  )}
                </div>
              </div>

              {/* Input Payload Parameters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Tham Số Đầu Vào (Payload Parameters)
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyPayloadToClipboard(detailDrawerTask.payload_data)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {copiedPayload ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedPayload ? 'Đã sao chép' : 'Sao chép JSON'}</span>
                  </button>
                </div>
                <pre className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] p-4 font-mono text-[11px] text-slate-800 dark:text-emerald-400 overflow-x-auto max-h-48 scrollbar-thin">
                  {JSON.stringify(detailDrawerTask.payload_data, null, 2)}
                </pre>
              </div>

              {/* Result File Download */}
              {detailDrawerTask.payload_data?.result_file_url && (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      File kết quả đã sẵn sàng
                    </span>
                  </div>
                  <a
                    href={detailDrawerTask.payload_data.result_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải Xuống File (.xlsx)</span>
                  </a>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 p-3">
                  <span className="text-slate-400 text-[11px]">Thời gian tạo:</span>
                  <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200 text-[11px] font-mono">
                    {formatVNDateTime(detailDrawerTask.created_at)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 p-3">
                  <span className="text-slate-400 text-[11px]">Thời gian thực thi:</span>
                  <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200 text-[11px] font-mono">
                    {formatVNDateTime(detailDrawerTask.executed_at)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL: PHÊ DUYỆT (DÙNG REACT PORTAL) */}
      {/* ========================================================================= */}
      {selectedTask && createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTask(null); }}
          className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,840px)] overflow-hidden shadow-2xl space-y-4 my-auto"
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 flex items-center justify-center font-bold">
                  {selectedTask.bot_type === 'keycloak_api' ? <Key className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Phê Duyệt Tác Vụ #{selectedTask.id ? selectedTask.id.replace(/-/g, '').slice(0, 8) : ''} ({selectedTask.bot_type})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tùy chỉnh tham số thực thi trước khi bàn giao cho Bot Worker.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setModalMode('form')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${modalMode === 'form'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                      }`}
                  >
                    <Sliders className="w-3 h-3" /> Form
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setJsonPayload(JSON.stringify(buildFinalPayload(), null, 2));
                      setModalMode('json');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${modalMode === 'json'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                      }`}
                  >
                    <Code2 className="w-3 h-3" /> JSON
                  </button>
                </div>

                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {modalMode === 'form' && selectedTask.bot_type === 'keycloak_api' ? (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-500" />
                        Danh Sách Tài Khoản Hoặc Email:
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">Mỗi email 1 dòng</span>
                    </label>
                    <textarea
                      rows={3}
                      value={kcIdentifiersText}
                      onChange={(e) => setKcIdentifiersText(e.target.value)}
                      placeholder="teacher1@dtt.vn&#10;teacher2@dtt.vn"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-indigo-500 leading-relaxed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Hành Động Cần Thực Thi:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'bulk_both', label: 'Đổi Mật Khẩu & Xác Thực' },
                        { id: 'bulk_reset_pass', label: 'Chỉ Đổi Mật Khẩu' },
                        { id: 'bulk_verify', label: 'Chỉ Xác Thực Email' },
                        { id: 'bulk_set_status', label: 'Chỉ Đổi Trạng Thái' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setKcActionType(item.id)}
                          className={`p-2.5 rounded-xl border text-xs font-medium text-center transition cursor-pointer ${kcActionType === item.id
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {kcActionType !== 'bulk_verify' && kcActionType !== 'bulk_set_status' && (
                    <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                        Tùy Chọn Mật Khẩu Đặt Lại:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { id: 'email_lowercase', label: 'Email chữ thường' },
                          { id: 'default_secure', label: 'Pythaverse@2026' },
                          { id: 'custom', label: 'Tự gõ mật khẩu' },
                        ].map((pOpt) => (
                          <label
                            key={pOpt.id}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${kcPasswordOption === pOpt.id
                              ? 'bg-white dark:bg-slate-900 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                              }`}
                          >
                            <input
                              type="radio"
                              name="pass_opt"
                              checked={kcPasswordOption === pOpt.id}
                              onChange={() => setKcPasswordOption(pOpt.id)}
                              className="text-indigo-600 cursor-pointer"
                            />
                            <span>{pOpt.label}</span>
                          </label>
                        ))}
                      </div>

                      {kcPasswordOption === 'custom' && (
                        <input
                          type="text"
                          value={kcCustomPassword}
                          onChange={(e) => setKcCustomPassword(e.target.value)}
                          placeholder="Nhập mật khẩu tùy chỉnh..."
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                        />
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Gán Trạng Thái Tài Khoản:
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[
                          { id: 'enabled', label: 'Kích Hoạt' },
                          { id: 'disabled', label: 'Khóa' },
                          { id: 'keep', label: 'Giữ Nguyên' },
                        ].map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setKcTargetStatus(st.id)}
                            className={`flex-1 py-2 px-2 text-[11px] rounded-xl border text-center transition cursor-pointer ${kcTargetStatus === st.id
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold border-transparent shadow-xs'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Bắt Buộc Đổi Pass Lần Đầu?
                      </label>
                      <button
                        type="button"
                        onClick={() => setKcTemporary(!kcTemporary)}
                        className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition cursor-pointer ${kcTemporary
                          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                      >
                        <span>{kcTemporary ? 'Bật: Bắt đổi khi đăng nhập' : 'Tắt: Dùng mật khẩu này luôn'}</span>
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${kcTemporary ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                        >
                          {kcTemporary ? '✓' : '✕'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    Payload JSON Điều Khiển Worker:
                  </label>
                  <textarea
                    rows={10}
                    value={jsonPayload}
                    onChange={(e) => setJsonPayload(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-emerald-400 outline-none focus:border-indigo-500 leading-relaxed"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={rejecting}
                  onClick={() => handleReject(selectedTask.id)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Từ Chối</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTask(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {approving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Phê Duyệt & Chạy Worker</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
};