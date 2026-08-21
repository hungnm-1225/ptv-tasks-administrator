// frontend/src/features/tasks/TaskManagementPage.tsx
import React, { useState, useEffect } from 'react';
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
  Zap
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotAutomationTask } from '../../types';
import { toast } from 'sonner';

// Helper bóc tách email sạch từ chuỗi phức tạp
const extractCleanEmail = (raw: any): string => {
  if (!raw || typeof raw !== 'string') return '';
  const match = raw.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  return match ? match[0].trim().toLowerCase() : raw.replace(/["'<>]/g, '').trim().toLowerCase();
};

export const TaskManagementPage: React.FC = () => {
  const [tasks, setTasks] = useState<BotAutomationTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');
  const [selectedTask, setSelectedTask] = useState<BotAutomationTask | null>(null);
  const [viewLogTask, setViewLogTask] = useState<BotAutomationTask | null>(null);
  const [modalMode, setModalMode] = useState<'form' | 'json'>('form');

  // State cho Visual Form Điều Khiển Keycloak
  const [kcIdentifiersText, setKcIdentifiersText] = useState<string>('');
  const [kcActionType, setKcActionType] = useState<string>('bulk_both');
  const [kcTargetStatus, setKcTargetStatus] = useState<string>('enabled'); // 'enabled' | 'disabled' | 'keep'
  const [kcPasswordOption, setKcPasswordOption] = useState<string>('email_lowercase'); // 'email_lowercase' | 'default_secure' | 'custom'
  const [kcCustomPassword, setKcCustomPassword] = useState<string>('');
  const [kcTemporary, setKcTemporary] = useState<boolean>(false);

  const [jsonPayload, setJsonPayload] = useState<string>('');
  const [approving, setApproving] = useState<boolean>(false);
  const [rejecting, setRejecting] = useState<boolean>(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      let endpoint = '/tasks';
      if (activeTab !== 'all') {
        endpoint += `?approval_status=${activeTab}`;
      }
      const data = await fetchApi<BotAutomationTask[]>(endpoint);
      setTasks(data || []);
    } catch (err) {
      console.error('Lỗi khi tải danh sách tác vụ:', err);
      toast.error('Không thể nạp danh sách tác vụ bot: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [activeTab]);

  // Khởi tạo dữ liệu khi mở Modal Review
  const handleOpenReview = (task: BotAutomationTask) => {
    setSelectedTask(task);
    const payload = task.payload_data || {};

    // 1. Phân giải danh sách tài khoản
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

    // 2. Phân giải hành động & cấu hình
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

    // Khởi tạo JSON thô
    setJsonPayload(JSON.stringify(payload, null, 2));
    setModalMode(task.bot_type === 'keycloak_api' ? 'form' : 'json');
  };

  // Đồng bộ từ Form sang JSON trước khi Approve
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
    try {
      const finalPayload = buildFinalPayload();

      if (selectedTask.bot_type === 'keycloak_api' && modalMode === 'form') {
        const identifiers = finalPayload.identifiers || [];
        if (identifiers.length === 0) {
          toast.error('Vui lòng nhập ít nhất 1 email/tài khoản cần xử lý!');
          setApproving(false);
          return;
        }
      }

      await fetchApi(`/tasks/${selectedTask.id}/approve`, {
        method: 'PUT',
        body: JSON.stringify({
          approval_status: 'approved',
          edited_payload: finalPayload,
        }),
      });

      const taskIdShort = selectedTask.id ? selectedTask.id.slice(0, 8) : '';
      toast.success(`Đã phê duyệt và khởi chạy worker #${taskIdShort} thành công!`);
      setSelectedTask(null);
      await loadTasks();
    } catch (err) {
      toast.error('Lỗi phê duyệt tác vụ: ' + (err as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (taskId: string) => {
    setRejecting(true);
    try {
      await fetchApi(`/tasks/${taskId}/reject`, { method: 'PUT' });
      const taskIdShort = taskId ? taskId.slice(0, 8) : '';
      toast.info(`Đã từ chối tác vụ #${taskIdShort}.`);
      setSelectedTask(null);
      await loadTasks();
    } catch (err) {
      toast.error('Lỗi từ chối tác vụ: ' + (err as Error).message);
    } finally {
      setRejecting(false);
    }
  };

  const renderStatusBadge = (approval: string, execution: string) => {
    if (approval === 'pending') {
      return (
        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 text-[10px] font-semibold rounded-lg inline-flex items-center gap-1 shadow-2xs">
          <Clock className="w-3 h-3" /> PENDING
        </span>
      );
    } else if (approval === 'approved') {
      if (execution === 'success') {
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 text-[10px] font-semibold rounded-lg inline-flex items-center gap-1 shadow-2xs">
            <CheckCircle2 className="w-3 h-3" /> SUCCESS
          </span>
        );
      } else if (execution === 'failed') {
        return (
          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 text-[10px] font-semibold rounded-lg inline-flex items-center gap-1 shadow-2xs">
            <AlertTriangle className="w-3 h-3" /> FAILED
          </span>
        );
      }
      return (
        <span className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 text-[10px] font-semibold rounded-lg inline-flex items-center gap-1 shadow-2xs">
          <Loader2 className="w-3 h-3 animate-spin" /> RUNNING
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 text-[10px] font-semibold rounded-lg inline-flex items-center gap-1">
          <XCircle className="w-3 h-3" /> REJECTED
        </span>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Task & Bot Automation Hub</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cổng Human-in-the-Loop: Phê duyệt trực quan và tùy chỉnh tham số Bot Worker trước khi thực thi.
          </p>
        </div>

        <button
          onClick={loadTasks}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 shadow-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${activeTab === 'pending'
            ? 'bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 font-semibold shadow-xs'
            : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
        >
          ⏳ Chờ Phê Duyệt
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${activeTab === 'approved'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 font-semibold shadow-xs'
            : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
        >
          ✓ Đã Phê Duyệt & Thực Thi
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${activeTab === 'all'
            ? 'bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 font-semibold shadow-xs'
            : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
        >
          Tất Cả Tác Vụ
        </button>
      </div>

      {/* Task Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Đang nạp danh sách tác vụ...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-3 shadow-xs">
          <CheckSquare className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Không có tác vụ nào trong danh sách</h3>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-semibold">
                <th className="p-3.5 pl-5">Mã Tác Vụ</th>
                <th className="p-3.5">Ticket Gốc / Nguồn</th>
                <th className="p-3.5">Bot Type</th>
                <th className="p-3.5">Trạng Thái</th>
                <th className="p-3.5">Thời Gian</th>
                <th className="p-3.5 pr-5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-slate-800 dark:text-slate-200">
              {tasks.map((task) => {
                // 🎯 XỬ LÝ AN TOÀN TUYỆT ĐỐI CHO TICKET ID VÀ SOURCE
                const taskIdDisplay = task.id ? `#${task.id.slice(0, 8)}` : '#TASK';
                const ticketTitle = task.inbox_tickets?.subject ||
                  (task.ticket_id ? `Ticket #${task.ticket_id.slice(0, 8)}` : null);

                return (
                  <tr key={task.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition">
                    <td className="p-3.5 pl-5 font-mono text-[11px] text-violet-700 dark:text-violet-300 font-medium">
                      {taskIdDisplay}
                    </td>
                    <td className="p-3.5 font-medium max-w-xs truncate text-slate-900 dark:text-slate-100">
                      {ticketTitle ? (
                        <span>{ticketTitle}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 text-[10px] font-semibold">
                          <Zap className="w-3 h-3 text-violet-500" /> Tác vụ Direct (Studio)
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {task.bot_type}
                    </td>
                    <td className="p-3.5">
                      {renderStatusBadge(task.approval_status, task.execution_status)}
                    </td>
                    <td className="p-3.5 text-slate-400 dark:text-slate-500 text-[11px]">
                      {task.created_at ? new Date(task.created_at).toLocaleString('vi-VN') : '---'}
                    </td>
                    <td className="p-3.5 pr-5 text-right space-x-2">
                      {task.approval_status === 'pending' ? (
                        <button
                          onClick={() => handleOpenReview(task)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold transition shadow-2xs cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Duyệt & Chạy</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setViewLogTask(task)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-medium transition cursor-pointer"
                        >
                          <Terminal className="w-3 h-3 text-violet-500" />
                          <span>Xem Logs</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Phê Duyệt Trực Quan (Human-in-the-Loop Visual Form) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-4 animate-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 flex items-center justify-center font-bold">
                  {selectedTask.bot_type === 'keycloak_api' ? <Key className="w-4 h-4" /> : <Code className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Phê Duyệt Tác Vụ #{selectedTask.id ? selectedTask.id.slice(0, 8) : ''} ({selectedTask.bot_type})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tùy chỉnh tham số thực thi trước khi bàn giao cho Bot Worker.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Switcher Form vs JSON */}
                <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setModalMode('form')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${modalMode === 'form'
                      ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
                      ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                  >
                    <Code className="w-3 h-3" /> JSON
                  </button>
                </div>

                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {modalMode === 'form' && selectedTask.bot_type === 'keycloak_api' ? (
                <div className="space-y-5">
                  {/* 1. Danh sách Email / Username */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-violet-600" />
                        Danh sách Tài Khoản / Email (Hỗ trợ 1 hoặc nhiều người):
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">Mỗi email 1 dòng</span>
                    </label>
                    <textarea
                      rows={3}
                      value={kcIdentifiersText}
                      onChange={(e) => setKcIdentifiersText(e.target.value)}
                      placeholder="teacher1@dtt.vn&#10;teacher2@dtt.vn"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 leading-relaxed"
                    />
                  </div>

                  {/* 2. Loại Hành Động */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Hành Động Cần Thực Thi:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'bulk_both', label: 'Reset & Verify' },
                        { id: 'bulk_reset_pass', label: 'Chỉ Reset Pass' },
                        { id: 'bulk_verify', label: 'Chỉ Verify Mail' },
                        { id: 'bulk_set_status', label: 'Chỉ Đổi Trạng Thái' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setKcActionType(item.id)}
                          className={`p-2.5 rounded-xl border text-xs font-medium text-center transition cursor-pointer ${kcActionType === item.id
                            ? 'bg-violet-50 dark:bg-violet-500/20 border-violet-500 text-violet-700 dark:text-violet-300 font-bold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Tùy Chọn Mật Khẩu */}
                  {kcActionType !== 'bulk_verify' && kcActionType !== 'bulk_set_status' && (
                    <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                        Tùy Chọn Mật Khẩu Đặt Lại:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <label
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${kcPasswordOption === 'email_lowercase'
                            ? 'bg-white dark:bg-slate-800 border-violet-500 text-violet-700 dark:text-violet-300 font-semibold shadow-2xs'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                        >
                          <input
                            type="radio"
                            name="pass_opt"
                            checked={kcPasswordOption === 'email_lowercase'}
                            onChange={() => setKcPasswordOption('email_lowercase')}
                            className="text-violet-600"
                          />
                          <span>Email chữ thường</span>
                        </label>

                        <label
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${kcPasswordOption === 'default_secure'
                            ? 'bg-white dark:bg-slate-800 border-violet-500 text-violet-700 dark:text-violet-300 font-semibold shadow-2xs'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                        >
                          <input
                            type="radio"
                            name="pass_opt"
                            checked={kcPasswordOption === 'default_secure'}
                            onChange={() => setKcPasswordOption('default_secure')}
                            className="text-violet-600"
                          />
                          <span>Pythaverse@2026</span>
                        </label>

                        <label
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${kcPasswordOption === 'custom'
                            ? 'bg-white dark:bg-slate-800 border-violet-500 text-violet-700 dark:text-violet-300 font-semibold shadow-2xs'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                        >
                          <input
                            type="radio"
                            name="pass_opt"
                            checked={kcPasswordOption === 'custom'}
                            onChange={() => setKcPasswordOption('custom')}
                            className="text-violet-600"
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
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-violet-500"
                        />
                      )}
                    </div>
                  )}

                  {/* 4. Trạng Thái & Temporary Toggle */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Gán Trạng Thái Tài Khoản:
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[
                          { id: 'enabled', label: 'Kích Hoạt (Enabled)' },
                          { id: 'disabled', label: 'Khóa (Disabled)' },
                          { id: 'keep', label: 'Giữ Nguyên' },
                        ].map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setKcTargetStatus(st.id)}
                            className={`flex-1 py-2 px-2 text-[11px] rounded-xl border text-center transition cursor-pointer ${kcTargetStatus === st.id
                              ? 'bg-violet-600 text-white font-bold border-violet-600 shadow-2xs'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Bắt Buộc Đổi Pass Lần Đầu?
                      </label>
                      <button
                        type="button"
                        onClick={() => setKcTemporary(!kcTemporary)}
                        className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition cursor-pointer ${kcTemporary
                          ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
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
                /* JSON View cho Bot khác hoặc khi chuyển tab */
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-violet-500" />
                    Payload JSON Điều Khiển Worker:
                  </label>
                  <textarea
                    rows={10}
                    value={jsonPayload}
                    onChange={(e) => setJsonPayload(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-xs font-mono text-violet-700 dark:text-violet-300 outline-none focus:border-violet-500 leading-relaxed"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={rejecting}
                  onClick={() => handleReject(selectedTask.id)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Từ Chối (Reject)</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTask(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {approving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Approve & Run Worker</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xem Chi Tiết Logs */}
      {viewLogTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-3 p-6 font-mono">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-200">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Terminal className="w-4 h-4 text-violet-400" />
                <span>Execution Logs: #{viewLogTask.id ? viewLogTask.id.slice(0, 8) : ''} ({viewLogTask.bot_type})</span>
              </div>
              <button
                onClick={() => setViewLogTask(null)}
                className="text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-900 rounded-xl text-xs space-y-1.5 max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
              {viewLogTask.execution_logs ? (
                viewLogTask.execution_logs.split('\n').map((line, idx) => (
                  <div
                    key={idx}
                    className={
                      line.includes('SUCCESS') || line.includes('success')
                        ? 'text-emerald-400'
                        : line.includes('ERROR') || line.includes('failed')
                          ? 'text-rose-400 font-semibold'
                          : 'text-slate-300'
                    }
                  >
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-slate-500 italic">Chưa có nhật ký log cho tác vụ này.</div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewLogTask(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-sans cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};