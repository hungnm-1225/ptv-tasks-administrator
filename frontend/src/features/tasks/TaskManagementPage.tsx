import React, { useState, useEffect } from 'react';
import { Check, X, ShieldAlert, Code, Loader2, Inbox } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotAutomationTask } from '../../types';
import { toast } from 'sonner';

export const TaskManagementPage: React.FC = () => {
  const [tasks, setTasks] = useState<BotAutomationTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTask, setSelectedTask] = useState<BotAutomationTask | null>(null);
  const [payloadJson, setPayloadJson] = useState<string>('');
  const [approving, setApproving] = useState<boolean>(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<BotAutomationTask[]>('/tasks?approval_status=pending');
      setTasks(data || []);
    } catch (err) {
      console.error('Lỗi khi tải danh sách tác vụ:', err);
      toast.error('Lỗi khi tải danh sách tác vụ: ' + (err as Error).message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleOpenModal = (task: BotAutomationTask) => {
    setSelectedTask(task);
    setPayloadJson(JSON.stringify(task.payload_data || {}, null, 2));
  };

  const handleCloseModal = () => {
    setSelectedTask(null);
    setPayloadJson('');
  };

  const handleApprove = async () => {
    if (!selectedTask) return;
    setApproving(true);
    try {
      await fetchApi(`/tasks/${selectedTask.id}/approve`, {
        method: 'PUT',
      });
      toast.success(`Đã phê duyệt và khởi chạy worker cho tác vụ #${selectedTask.id.slice(0, 8)}!`);
      handleCloseModal();
      await loadTasks();
    } catch (err) {
      toast.error('Lỗi phê duyệt tác vụ: ' + (err as Error).message);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">Task Management & Approval Hub</h2>
        <p className="text-xs text-slate-400 mt-1">
          Cổng kiểm soát Human-in-the-Loop: Phê duyệt payload thực thi bot trước khi chạy Cloud Worker.
        </p>
      </div>

      {/* Loading & Empty State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
          <span className="text-xs font-medium text-slate-400">Đang tải danh sách tác vụ chờ phê duyệt...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="surface-card p-12 text-center rounded-2xl border border-slate-800 space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">Không có tác vụ nào cần phê duyệt</h3>
          <p className="text-xs text-slate-400">Tất cả tác vụ bot đã được xử lý hoặc hoàn thành.</p>
        </div>
      ) : (
        /* Task Queue Table (Pastel Theme) */
        <div className="surface-card rounded-2xl border border-slate-800/80 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0b0f19] text-slate-400 font-semibold border-b border-slate-800/80 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-4">Bot Type</th>
                <th className="p-4">Payload Thô</th>
                <th className="p-4">Trạng Thái Phê Duyệt</th>
                <th className="p-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 font-semibold text-purple-300">
                    <span className="px-2.5 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                      {task.bot_type}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                    {JSON.stringify(task.payload_data)}
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-200 font-semibold rounded-full text-[10px] uppercase">
                      {task.approval_status || 'pending'} Human Approval
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleOpenModal(task)}
                      className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl transition shadow-sm"
                    >
                      Xem & Phê Duyệt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Human-in-the-Loop Approval Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-[#0b0f19]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="surface-card bg-[#131b2e] border border-slate-700/80 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                <ShieldAlert className="w-5 h-5 text-amber-300" />
                <span>Phê Duyệt Thực Thi Tác Vụ Cloud Bot ({selectedTask.bot_type})</span>
              </h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Proposed Bot Payload Editor */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Code className="w-4 h-4 text-purple-300" />
                <span>Proposed Bot Payload (JSON)</span>
              </label>
              <textarea
                rows={7}
                value={payloadJson}
                onChange={(e) => setPayloadJson(e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl p-3 text-xs font-mono text-purple-200 outline-none focus:border-purple-500/40"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 font-medium text-xs rounded-xl transition"
              >
                Hủy Bỏ / Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-medium text-xs rounded-xl transition shadow-sm flex items-center gap-1.5"
              >
                {approving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Approve & Run Worker</span>
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
