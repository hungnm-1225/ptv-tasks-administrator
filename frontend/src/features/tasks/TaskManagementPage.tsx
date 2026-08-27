// frontend/src/features/tasks/TaskManagementPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  CheckSquare,
  Edit3,
  Play,
  X,
  Code,
  Terminal,
  AlertTriangle,
  RefreshCw,
  Key,
  Users,
  ShieldCheck,
  Lock,
  Sliders,
  FileText,
  Zap,
  Download,
  Building2,
  GraduationCap,
  Github,
  Mail,
  Search,
  RotateCw,
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

// Helper bóc tách email sạch từ chuỗi phức tạp
const extractCleanEmail = (raw: any): string => {
  if (!raw || typeof raw !== 'string') return '';
  const match = raw.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  return match ? match[0].trim().toLowerCase() : raw.replace(/["'<>]/g, '').trim().toLowerCase();
};

// Helper định dạng giờ Việt Nam chuẩn
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
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('all');

  // ⚡ KHỞI TẠO STATE NGAY TỪ LOCALSTORAGE (0MS)
  const initialCachedTasks = useMemo(() => {
    return getTaskLocalCache<BotAutomationTask[]>(activeTab) || [];
  }, [activeTab]);

  const [tasks, setTasks] = useState<BotAutomationTask[]>(initialCachedTasks);
  const [loading, setLoading] = useState<boolean>(initialCachedTasks.length === 0);
  const [selectedBotFilter, setSelectedBotFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [selectedTask, setSelectedTask] = useState<BotAutomationTask | null>(null);
  const [detailModalTask, setDetailModalTask] = useState<BotAutomationTask | null>(null);
  const [modalMode, setModalMode] = useState<'form' | 'json'>('form');

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

  // ⚡ SWR TẢI TASKS (KHÔNG BẬT SPINNER NẾU ĐÃ CÓ CACHE)
  const loadTasks = useCallback(async (forceSpinner = false) => {
    const cached = getTaskLocalCache<BotAutomationTask[]>(activeTab);
    if (cached && !forceSpinner) {
      setTasks(cached);
      setLoading(false);
    } else if (forceSpinner || !cached) {
      setLoading(true);
    }

    try {
      let endpoint = '/tasks';
      if (activeTab !== 'all') {
        endpoint += `?approval_status=${activeTab}`;
      }
      const data = await fetchApi<BotAutomationTask[]>(endpoint);
      setTasks(data || []);
      setTaskLocalCache(activeTab, data || []);
    } catch (err) {
      if (!cached) {
        toast.error('Không thể nạp danh sách tác vụ bot: ' + (err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(() => {
      loadTasks();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Bóc tách thông tin nghiệp vụ chi tiết cho từng Task
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
      badgeColor = 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/50';

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

  // Khởi tạo dữ liệu khi mở Modal Review
  const handleOpenReview = (task: BotAutomationTask) => {
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

  // ⚡ OPTIMISTIC UI: PHÊ DUYỆT TỨC THÌ
  const handleApprove = async () => {
    if (!selectedTask) return;
    setApproving(true);
    const prevTasks = [...tasks];
    const taskId = selectedTask.id;
    const finalPayload = buildFinalPayload();

    if (selectedTask.bot_type === 'keycloak_api' && modalMode === 'form') {
      const identifiers = finalPayload.identifiers || [];
      if (identifiers.length === 0) {
        toast.error('Vui lòng nhập ít nhất 1 email/tài khoản cần xử lý!');
        setApproving(false);
        return;
      }
    }

    const updatedTasks: BotAutomationTask[] = tasks.map(t => t.id === taskId ? {
      ...t,
      approval_status: 'approved' as any,
      execution_status: 'queued' as any,
      payload_data: finalPayload
    } : t);

    setTasks(updatedTasks);
    setTaskLocalCache(activeTab, updatedTasks);
    setSelectedTask(null);
    const taskIdShort = taskId ? taskId.slice(0, 8) : '';
    toast.success(`Đã phê duyệt và khởi chạy worker #${taskIdShort} thành công!`);

    try {
      await fetchApi(`/tasks/${taskId}/approve`, {
        method: 'PUT',
        body: JSON.stringify({
          approval_status: 'approved',
          edited_payload: finalPayload,
        }),
      });
    } catch (err) {
      setTasks(prevTasks);
      toast.error('Lỗi phê duyệt tác vụ: ' + (err as Error).message);
    } finally {
      setApproving(false);
    }
  };

  // ⚡ OPTIMISTIC UI: TỪ CHỐI TỨC THÌ
  const handleReject = async (taskId: string) => {
    setRejecting(true);
    const prevTasks = [...tasks];

    const updatedTasks: BotAutomationTask[] = activeTab === 'pending'
      ? tasks.filter(t => t.id !== taskId)
      : tasks.map(t => t.id === taskId ? {
        ...t,
        approval_status: 'rejected' as any,
        execution_status: 'dismissed' as any
      } : t);

    setTasks(updatedTasks);
    setTaskLocalCache(activeTab, updatedTasks);
    setSelectedTask(null);
    const taskIdShort = taskId ? taskId.slice(0, 8) : '';
    toast.info(`Đã từ chối tác vụ #${taskIdShort}.`);

    try {
      await fetchApi(`/tasks/${taskId}/reject`, { method: 'PUT' });
    } catch (err) {
      setTasks(prevTasks);
      toast.error('Lỗi từ chối tác vụ: ' + (err as Error).message);
    } finally {
      setRejecting(false);
    }
  };

  const handleRetryTask = async (taskId: string) => {
    setRetryingId(taskId);
    try {
      await fetchApi(`/bots/${taskId}/retry`, { method: 'POST' });
      toast.success(`Đã đưa tác vụ #${taskId.slice(0, 8)} vào hàng đợi chạy lại!`);
      await loadTasks(true);
    } catch (err) {
      toast.error('Lỗi khi kích hoạt chạy lại: ' + (err as Error).message);
    } finally {
      setRetryingId(null);
    }
  };

  // Render Badge trạng thái chi tiết
  const renderStatusBadge = (approval: string, execution: string, payload: any) => {
    if (approval === 'pending') {
      return (
        <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50 text-[10px] font-bold rounded-lg inline-flex items-center gap-1 shadow-xs">
          <Clock className="w-3 h-3" /> CHỜ PHÊ DUYỆT
        </span>
      );
    } else if (approval === 'approved') {
      if (execution === 'success') {
        return (
          <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 text-[10px] font-bold rounded-lg inline-flex items-center gap-1 shadow-xs">
            <CheckCircle2 className="w-3 h-3" /> THÀNH CÔNG
          </span>
        );
      } else if (execution === 'failed') {
        return (
          <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/50 text-[10px] font-bold rounded-lg inline-flex items-center gap-1 shadow-xs">
            <AlertTriangle className="w-3 h-3" /> THẤT BẠI
          </span>
        );
      } else if (execution === 'waiting_poll') {
        return (
          <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50 text-[10px] font-bold rounded-lg inline-flex items-center gap-1 shadow-xs">
            <Clock className="w-3 h-3 animate-spin" /> {payload?.request_id ? `ĐỢI BATCH #${payload.request_id}` : 'ĐANG ĐỢI POLLING'}
          </span>
        );
      }
      return (
        <span className="px-2.5 py-1 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50 text-[10px] font-bold rounded-lg inline-flex items-center gap-1 shadow-xs">
          <Loader2 className="w-3 h-3 animate-spin" /> ĐANG XỬ LÝ
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[10px] font-bold rounded-lg inline-flex items-center gap-1">
          <XCircle className="w-3 h-3" /> BỊ TỪ CHỐI
        </span>
      );
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (activeTab === 'pending' && t.approval_status !== 'pending') return false;
      if (activeTab === 'approved' && t.approval_status !== 'approved') return false;
      if (selectedBotFilter !== 'all' && t.bot_type !== selectedBotFilter) return false;

      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const tId = (t.id || '').toLowerCase();
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

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-2xl shadow-xs">
              <CheckSquare className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Task & Bot Automation Hub
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cổng điều phối và theo dõi tiến trình thực thi của toàn bộ hệ thống Bot Workers.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => loadTasks(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-xs transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm Mới Danh Sách</span>
        </button>
      </div>

      {/* Bộ Điều Khiển Lọc & Tìm Kiếm */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bento-card p-3.5">
        {/* Tabs Trạng Thái */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'Tất Cả Tác Vụ' },
            { id: 'pending', label: '⏳ Chờ Phê Duyệt' },
            { id: 'approved', label: '✓ Đã Duyệt & Thực Thi' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Ô Tìm Kiếm & Dropdown Loại Bot */}
        <div className="flex items-center gap-2">
          <select
            value={selectedBotFilter}
            onChange={(e) => setSelectedBotFilter(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">Tất cả Phân Hệ</option>
            <option value="workspace_rpa">🏢 Workspace RPA</option>
            <option value="lms_playwright">🎓 PLearn LMS</option>
            <option value="keycloak_api">🔑 Keycloak IDP</option>
            <option value="github_issue_creator">🐙 GitHub Issue</option>
            <option value="feedback_doc_triage">📝 Feedback Sheet</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mã, tên trường, email..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-sky-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bảng Danh Sách Tác Vụ Chi Tiết */}
      {loading && tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-600 dark:text-sky-400" />
          <span className="text-xs font-bold">Đang nạp dữ liệu tiến trình tác vụ...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bento-card p-16 text-center space-y-3">
          <CheckSquare className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Không tìm thấy tác vụ nào phù hợp</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Thử thay đổi từ khóa tìm kiếm hoặc chuyển tab trạng thái khác.
          </p>
        </div>
      ) : (
        <div className="bento-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-850/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4 pl-6">Mã Tác Vụ</th>
                  <th className="p-4">Nội Dung Nghiệp Vụ Cốt Lõi</th>
                  <th className="p-4">Nguồn Yêu Cầu</th>
                  <th className="p-4">Trạng Thái & Tiến Trình</th>
                  <th className="p-4">Thời Gian</th>
                  <th className="p-4 pr-6 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-800 dark:text-slate-200">
                {filteredTasks.map((task) => {
                  const taskIdDisplay = task.id ? `#${task.id.slice(0, 8)}` : '#TASK';
                  const info = getTaskBusinessInfo(task);
                  const Icon = info.icon;
                  const payload = task.payload_data || {};
                  const resultUrl = payload.result_file_url;

                  const ticket = task.inbox_tickets;
                  const isFromStudio = !task.ticket_id && !ticket;

                  return (
                    <tr key={task.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      {/* Cột 1: Mã ID & Loại Bot */}
                      <td className="p-4 pl-6 align-top whitespace-nowrap">
                        <div className="space-y-1">
                          <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400">
                            {taskIdDisplay}
                          </span>
                          <div>
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${info.badgeColor}`}>
                              <Icon className="w-3 h-3" />
                              <span>{task.bot_type}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Cột 2: Nội Dung Nghiệp Vụ */}
                      <td className="p-4 align-top max-w-sm">
                        <div className="space-y-1">
                          <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{info.title}</span>
                          </div>
                          {info.subtitle && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              {info.subtitle}
                            </div>
                          )}
                          {info.target && (
                            <div className="text-[10px] font-mono text-sky-600 dark:text-sky-400 font-semibold">
                              {info.target}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Cột 3: Nguồn Yêu Cầu */}
                      <td className="p-4 align-top whitespace-nowrap">
                        {isFromStudio ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50 text-[10px] font-bold shadow-xs">
                            <Zap className="w-3 h-3 text-sky-600 dark:text-sky-400" /> Tác vụ Studio
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {ticket?.source === 'gmail' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-md border border-sky-200/60 dark:border-sky-800/50">
                                  <Mail className="w-3 h-3" /> Gmail
                                </span>
                              ) : ticket?.source === 'osticket' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/50">
                                  🎫 OS Ticket
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-800/50">
                                  📝 Form
                                </span>
                              )}
                              {ticket?.category && (
                                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase">
                                  [{ticket.category}]
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={ticket?.subject || ''}>
                              {ticket?.subject || `Ticket #${task.ticket_id?.slice(0, 8)}`}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Cột 4: Trạng Thái & Nút Tải Kết Quả */}
                      <td className="p-4 align-top whitespace-nowrap space-y-1.5">
                        <div>{renderStatusBadge(task.approval_status, task.execution_status, payload)}</div>

                        {resultUrl && (
                          <div>
                            <a
                              href={resultUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition shadow-xs cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              <span>Tải File (.xlsx)</span>
                            </a>
                          </div>
                        )}
                      </td>

                      {/* Cột 5: Thời Gian */}
                      <td className="p-4 align-top text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap font-mono">
                        {formatVNDateTime(task.executed_at || task.created_at)}
                      </td>

                      {/* Cột 6: Thao Tác */}
                      <td className="p-4 pr-6 align-top text-right space-x-2 whitespace-nowrap">
                        {task.approval_status === 'pending' ? (
                          <button
                            onClick={() => handleOpenReview(task)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Duyệt & Chạy</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {task.execution_status === 'failed' && (
                              <button
                                onClick={() => handleRetryTask(task.id)}
                                disabled={retryingId === task.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 rounded-xl text-xs font-bold transition cursor-pointer"
                                title="Chạy lại tác vụ bị lỗi này"
                              >
                                {retryingId === task.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCw className="w-3.5 h-3.5" />
                                )}
                                <span>Chạy Lại</span>
                              </button>
                            )}

                            <button
                              onClick={() => setDetailModalTask(task)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                            >
                              <Terminal className="w-3.5 h-3.5 text-sky-500" />
                              <span>Chi Tiết & Log</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CHI TIẾT & LOGS */}
      {detailModalTask && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-4 p-6 sm:p-7 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 rounded-2xl border border-sky-200/60 dark:border-sky-800/50">
                  <Terminal className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Chi Tiết Tác Vụ #{detailModalTask.id?.slice(0, 8)}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-mono font-bold border border-sky-200/60 dark:border-sky-800/50">
                      {detailModalTask.bot_type}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Thời gian tạo: {formatVNDateTime(detailModalTask.created_at)} | Thực thi: {formatVNDateTime(detailModalTask.executed_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailModalTask(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Nghiệp Vụ: {getTaskBusinessInfo(detailModalTask).title}
                </span>
                <div>{renderStatusBadge(detailModalTask.approval_status, detailModalTask.execution_status, detailModalTask.payload_data)}</div>
              </div>

              {detailModalTask.payload_data?.result_file_url && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Đã tạo thành công file kết quả:
                  </span>
                  <a
                    href={detailModalTask.payload_data.result_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải File (.xlsx)</span>
                  </a>
                </div>
              )}
            </div>

            <div className="space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <Code className="w-4 h-4 text-sky-500" />
                  <span>Audit Logs Thực Thi:</span>
                </span>
              </div>
              <div className="p-4 bg-slate-950 text-slate-300 rounded-2xl text-xs leading-relaxed max-h-56 overflow-y-auto border border-slate-800 space-y-1 scrollbar-thin">
                {detailModalTask.execution_logs ? (
                  detailModalTask.execution_logs.split('\n').map((line, idx) => (
                    <div
                      key={idx}
                      className={
                        line.includes('SUCCESS') || line.includes('Thành công')
                          ? 'text-emerald-400 font-medium'
                          : line.includes('ERROR') || line.includes('failed')
                            ? 'text-rose-400 font-semibold'
                            : 'text-slate-400'
                      }
                    >
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic">Chưa có nhật ký ghi nhận cho tác vụ này.</div>
                )}
              </div>
            </div>

            <details className="text-xs">
              <summary className="font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer">
                ▶ Xem Tham Số Đầu Vào (Input Payload JSON)
              </summary>
              <pre className="mt-2 p-3 bg-slate-950 text-slate-300 rounded-xl font-mono text-[11px] overflow-x-auto max-h-36 border border-slate-800">
                {JSON.stringify(detailModalTask.payload_data, null, 2)}
              </pre>
            </details>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setDetailModalTask(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PHÊ DUYỆT (HUMAN-IN-THE-LOOP) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50 flex items-center justify-center font-bold">
                  {selectedTask.bot_type === 'keycloak_api' ? <Key className="w-4 h-4" /> : <Code className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Phê Duyệt Tác Vụ #{selectedTask.id ? selectedTask.id.slice(0, 8) : ''} ({selectedTask.bot_type})
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                      modalMode === 'form'
                        ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                      modalMode === 'json'
                        ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Code className="w-3 h-3" /> JSON
                  </button>
                </div>

                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition cursor-pointer"
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
                        <Users className="w-3.5 h-3.5 text-sky-500" />
                        Danh Sách Tài Khoản Hoặc Email:
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">Mỗi email 1 dòng</span>
                    </label>
                    <textarea
                      rows={3}
                      value={kcIdentifiersText}
                      onChange={(e) => setKcIdentifiersText(e.target.value)}
                      placeholder="teacher1@dtt.vn&#10;teacher2@dtt.vn"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-sky-500 leading-relaxed"
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
                          className={`p-2.5 rounded-xl border text-xs font-medium text-center transition cursor-pointer ${
                            kcActionType === item.id
                              ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 font-bold'
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
                        <label
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                            kcPasswordOption === 'email_lowercase'
                              ? 'bg-white dark:bg-slate-900 border-sky-500 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pass_opt"
                            checked={kcPasswordOption === 'email_lowercase'}
                            onChange={() => setKcPasswordOption('email_lowercase')}
                            className="text-sky-600 cursor-pointer"
                          />
                          <span>Email chữ thường</span>
                        </label>

                        <label
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                            kcPasswordOption === 'default_secure'
                              ? 'bg-white dark:bg-slate-900 border-sky-500 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pass_opt"
                            checked={kcPasswordOption === 'default_secure'}
                            onChange={() => setKcPasswordOption('default_secure')}
                            className="text-sky-600 cursor-pointer"
                          />
                          <span>Pythaverse@2026</span>
                        </label>

                        <label
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                            kcPasswordOption === 'custom'
                              ? 'bg-white dark:bg-slate-900 border-sky-500 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pass_opt"
                            checked={kcPasswordOption === 'custom'}
                            onChange={() => setKcPasswordOption('custom')}
                            className="text-sky-600 cursor-pointer"
                          />
                          <span>Tự gõ mật khẩu</span>
                        </label>
                      </div>

                      {kcPasswordOption === 'custom' && (
                        <input
                          type="text"
                          value={kcCustomPassword}
                          onChange={(e) => setKcCustomPassword(e.target.value)}
                          placeholder="Nhập mật khẩu tùy chỉnh..."
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500"
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
                            className={`flex-1 py-2 px-2 text-[11px] rounded-xl border text-center transition cursor-pointer ${
                              kcTargetStatus === st.id
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
                        className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                          kcTemporary
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <span>{kcTemporary ? 'Bật: Bắt đổi khi đăng nhập' : 'Tắt: Dùng mật khẩu này luôn'}</span>
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${
                            kcTemporary ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
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
                    <FileText className="w-3.5 h-3.5 text-sky-500" />
                    Payload JSON Điều Khiển Worker:
                  </label>
                  <textarea
                    rows={10}
                    value={jsonPayload}
                    onChange={(e) => setJsonPayload(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-sky-300 outline-none focus:border-sky-500 leading-relaxed"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={rejecting}
                  onClick={() => handleReject(selectedTask.id)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Từ Chối</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTask(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
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
          </div>
        </div>
      )}
    </div>
  );
};