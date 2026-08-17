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
  RefreshCw
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotAutomationTask } from '../../types';
import { toast } from 'sonner';

export const TaskManagementPage: React.FC = () => {
  const [tasks, setTasks] = useState<BotAutomationTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');
  const [selectedTask, setSelectedTask] = useState<BotAutomationTask | null>(null);
  const [viewLogTask, setViewLogTask] = useState<BotAutomationTask | null>(null);
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

  const handleOpenReview = (task: BotAutomationTask) => {
    setSelectedTask(task);
    setJsonPayload(JSON.stringify(task.payload_data, null, 2));
  };

  const handleApprove = async () => {
    if (!selectedTask) return;
    setApproving(true);
    try {
      let parsedPayload = selectedTask.payload_data;
      try {
        parsedPayload = JSON.parse(jsonPayload);
      } catch (e) {
        toast.error('JSON không hợp lệ! Vui lòng kiểm tra lại cú pháp.');
        setApproving(false);
        return;
      }

      await fetchApi(`/tasks/${selectedTask.id}/approve`, {
        method: 'PUT',
        body: JSON.stringify({
          approval_status: 'approved',
          edited_payload: parsedPayload,
        }),
      });

      toast.success(`Đã phê duyệt và khởi chạy worker cho tác vụ #${selectedTask.id.slice(0, 8)}!`);
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
      toast.info(`Đã từ chối tác vụ #${taskId.slice(0, 8)}.`);
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
            Cổng Human-in-the-Loop: Kiểm duyệt và chỉnh sửa payload JSON trước khi cho phép Bot Worker thực thi.
          </p>
        </div>

        <button
          onClick={loadTasks}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Segmented Filter Tabs */}
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

      {/* Task List Table */}
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
                <th className="p-3.5">Ticket Gốc</th>
                <th className="p-3.5">Bot Type</th>
                <th className="p-3.5">Trạng Thái</th>
                <th className="p-3.5">Thời Gian</th>
                <th className="p-3.5 pr-5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-slate-800 dark:text-slate-200">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition">
                  <td className="p-3.5 pl-5 font-mono text-[11px] text-violet-700 dark:text-violet-300 font-medium">
                    #{task.id.slice(0, 8)}
                  </td>
                  <td className="p-3.5 font-medium max-w-xs truncate text-slate-900 dark:text-slate-100">
                    {task.inbox_tickets?.subject || `Ticket #${task.ticket_id.slice(0, 8)}`}
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {task.bot_type}
                  </td>
                  <td className="p-3.5">
                    {renderStatusBadge(task.approval_status, task.execution_status)}
                  </td>
                  <td className="p-3.5 text-slate-400 dark:text-slate-500 text-[11px]">
                    {new Date(task.created_at).toLocaleString('vi-VN')}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal 1: Duyệt & Chỉnh Sửa Payload (Human-in-the-Loop) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Phê Duyệt Tác Vụ #{selectedTask.id.slice(0, 8)} ({selectedTask.bot_type})
                </h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Payload JSON Điều Khiển Bot Worker (Có thể chỉnh sửa trực tiếp):
                </label>
                <textarea
                  rows={9}
                  value={jsonPayload}
                  onChange={(e) => setJsonPayload(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-violet-700 dark:text-violet-300 outline-none focus:border-violet-500/50 leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={rejecting}
                  onClick={() => handleReject(selectedTask.id)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Từ Chối (Reject)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTask(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
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

      {/* Modal 2: Xem Chi Tiết Nhật Ký Logs Thực Thi */}
      {viewLogTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-3 p-6 font-mono">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-200">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Terminal className="w-4 h-4 text-violet-400" />
                <span>Execution Logs: #{viewLogTask.id.slice(0, 8)} ({viewLogTask.bot_type})</span>
              </div>
              <button
                onClick={() => setViewLogTask(null)}
                className="text-slate-400 hover:text-slate-100"
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
                      line.includes('SUCCESS')
                        ? 'text-emerald-400'
                        : line.includes('ERROR')
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
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-sans"
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