import React, { useState } from 'react';
import { Check, X, Edit3, ShieldAlert, Code } from 'lucide-react';

export const TaskManagementPage: React.FC = () => {
  const [showModal, setShowModal] = useState<boolean>(false);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">Task Management & Approval Hub</h2>
        <p className="text-xs text-slate-400 mt-1">
          Cổng kiểm soát Human-in-the-Loop: Phê duyệt payload thực thi bot trước khi chạy Cloud Worker.
        </p>
      </div>

      {/* Task Queue Table */}
      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th className="p-4">Bot Type</th>
              <th className="p-4">Payload Thô</th>
              <th className="p-4">Trạng Thái Phê Duyệt</th>
              <th className="p-4 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            <tr className="hover:bg-slate-900/40">
              <td className="p-4 font-semibold text-indigo-400">keycloak_api</td>
              <td className="p-4 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                {"{ action: 'create_user', username: 'nguyenvana', realm: 'master' }"}
              </td>
              <td className="p-4">
                <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold rounded-full text-[10px]">
                  Pending Human Approval
                </span>
              </td>
              <td className="p-4 text-right space-x-2">
                <button
                  onClick={() => setShowModal(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition"
                >
                  Xem & Phê Duyệt
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Human-in-the-Loop Approval Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <span>Phê Duyệt Thực Thi Tác Vụ Cloud Bot</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Proposed Bot Payload Editor */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Code className="w-4 h-4 text-cyan-400" />
                <span>Proposed Bot Payload (JSON)</span>
              </label>
              <textarea
                rows={6}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-cyan-300 outline-none focus:border-indigo-500"
                defaultValue={JSON.stringify(
                  {
                    action: 'create_user',
                    username: 'nguyenvana',
                    email: 'nguyenvana@dtt.vn',
                    realm: 'master',
                    roles: ['teacher'],
                  },
                  null,
                  2
                )}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-rose-600/20 text-rose-400 border border-rose-500/30 hover:bg-rose-600/30 font-semibold text-xs rounded-lg transition"
              >
                Reject Task
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition shadow-lg shadow-emerald-600/20 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Approve & Run Worker</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
