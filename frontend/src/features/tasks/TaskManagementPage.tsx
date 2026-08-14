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
  Code
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotAutomationTask } from '../../types';
import { toast } from 'sonner';

export const TaskManagementPage: React.FC = () => {
  const [tasks, setTasks] = useState<BotAutomationTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');
  const [selectedTask, setSelectedTask] = useState<BotAutomationTask | null>(null);
  const [jsonPayload, setJsonPayload] = useState<string>('');
  const [approving, setApproving] = useState<boolean>(false);

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

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 text-[10px] font-semibold rounded-lg inline-flex items-center gap-1 shadow-2xs">
            <Clock className="w-3 h-3" /> PENDING
          </span>
        );
      case 'approved':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 text-[10px] font-semibold rounded-lg inline-flex items-center gap-1 shadow-2xs">
            <CheckCircle2 className="w-3 h-3" /> APPROVED
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 text-[10px] font-semibold rounded-lg inline-flex items-center gap-1 shadow-2xs">
            <XCircle className="w-3 h-3" /> REJECTED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-[10px] font-semibold rounded-lg">
            {status.toUpperCase()}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Task & Bot Automation Hub</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Cổng Human-in-the-Loop: Kiểm duyệt và chỉnh sửa payload JSON trước khi cho phép Bot Worker thực thi.
        </p>
      </div>

      {/* Segmented Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
            activeTab === 'pending'
              ? 'bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 font-semibold shadow-xs'
              : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          ⏳ Chờ Phê Duyệt
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
            activeTab === 'approved'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 font-semibold shadow-xs'
              : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          ✓ Đã Phê Duyệt
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
            activeTab === 'all'
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
                    {renderStatusBadge(task.approval_status)}
                  </td>
                  <td className="p-3.5 text-slate-400 dark:text-slate-500 text-[11px]">
                    {new Date(task.created_at).toLocaleString('vi-VN')}
                  </td>
                  <td className="p-3.5 pr-5 text-right">
                    {task.approval_status === 'pending' ? (
                      <button
                        onClick={() => handleOpenReview(task)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-medium transition shadow-2xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Duyệt & Sửa</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Đã Xử Lý</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Duyệt Human-in-the-Loop */}
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
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition"
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
                  rows={10}
                  value={jsonPayload}
                  onChange={(e) => setJsonPayload(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-violet-700 dark:text-violet-300 outline-none focus:border-violet-500/50 leading-relaxed"
                />
              </div>

              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 rounded-xl text-[11px] space-y-1">
                <strong>Lưu ý:</strong> Khi bạn bấm Phê Duyệt, hệ thống sẽ gọi worker tương ứng để thực thi ngay lập tức và tự động đồng bộ kết quả ngược về Google Sheet.
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition shadow-2xs"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={approving}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition shadow-xs"
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
      )}
    </div>
  );
};
