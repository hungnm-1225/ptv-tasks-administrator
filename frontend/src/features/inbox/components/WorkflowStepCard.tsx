// frontend/src/features/inbox/components/WorkflowStepCard.tsx
import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  XCircle,
  Building2,
  GraduationCap,
  KeyRound,
  GitBranch,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit3,
  Check,
  X,
  Zap,
  ShieldAlert,
  User,
  Users,
  Plus,
  Mail,
  ExternalLink,
  Copy
} from 'lucide-react';
import { WorkflowStep, CapabilityDefinition } from '../../../types';

interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  totalSteps: number;
  capabilitiesMap: Record<string, CapabilityDefinition>;
  isEditable?: boolean;
  onUpdateStep?: (stepId: string, updated: Partial<WorkflowStep>) => void;
  onDeleteStep?: (stepId: string) => void;
  onMoveStep?: (stepId: string, direction: 'up' | 'down') => void;
  onRetryStep?: (stepId: string) => void;
}

export const WorkflowStepCard: React.FC<WorkflowStepCardProps> = ({
  step,
  index,
  totalSteps,
  capabilitiesMap,
  isEditable = false,
  onUpdateStep,
  onDeleteStep,
  onMoveStep,
  onRetryStep,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [editingInputKey, setEditingInputKey] = useState<string | null>(null);
  const [tempInputValue, setTempInputValue] = useState<string>('');

  // State thêm nhanh người dùng
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('teacher');

  const capDef = capabilitiesMap[step.capability_id];

  const getDomainIcon = (domain?: string) => {
    switch (domain) {
      case 'School Workspace':
        return <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'Moodle PLearn LMS':
        return <GraduationCap className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
      case 'Keycloak Auth IDP':
        return <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'Pythaverse Git':
        return <GitBranch className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case 'COF Processing':
        return <FileSpreadsheet className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
      default:
        return <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> THÀNH CÔNG
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200 border border-sky-300 dark:border-sky-700 animate-pulse shadow-2xs">
            <RefreshCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 animate-spin" /> ĐANG CHẠY
          </span>
        );
      case 'waiting_poll':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-spin" /> ĐỢI BATCH
          </span>
        );
      case 'waiting_dependency':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> CHỜ BƯỚC TRƯỚC
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200 border border-rose-300 dark:border-rose-700 shadow-2xs">
            <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> LỖI BƯỚC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200 border border-teal-300 dark:border-teal-700 shadow-2xs">
            <Zap className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> SẴN SÀNG
          </span>
        );
    }
  };

  // Cập nhật giá trị input chung
  const handleSaveInput = (key: string, customValue?: any) => {
    if (!onUpdateStep) return;
    let finalVal = customValue !== undefined ? customValue : tempInputValue;
    if (typeof finalVal === 'string') {
      try {
        if (finalVal.startsWith('{') || finalVal.startsWith('[')) {
          finalVal = JSON.parse(finalVal);
        }
      } catch {
        // Giữ nguyên chuỗi
      }
    }

    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        [key]: finalVal,
      },
    });
    setEditingInputKey(null);
  };

  // Xóa 1 người dùng khỏi danh sách users
  const handleRemoveUser = (userIndex: number) => {
    if (!onUpdateStep) return;
    const currentUsers = Array.isArray(step.inputs?.users) ? [...step.inputs.users] : [];
    currentUsers.splice(userIndex, 1);

    const updatedInputs: Record<string, any> = {
      ...step.inputs,
      users: currentUsers,
      total_count: currentUsers.length,
    };

    // Đồng bộ luôn mảng student_emails / user_emails nếu có
    const remainingEmails = currentUsers.map((u: any) => u.email).filter(Boolean);
    if (step.inputs?.student_emails) updatedInputs.student_emails = remainingEmails;
    if (step.inputs?.user_emails) updatedInputs.user_emails = remainingEmails;
    if (step.inputs?.collaborators) updatedInputs.collaborators = remainingEmails;

    onUpdateStep(step.step_id, { inputs: updatedInputs });
  };

  // Thêm 1 người dùng mới
  const handleAddUser = () => {
    if (!newEmail.trim() || !onUpdateStep) return;
    const currentUsers = Array.isArray(step.inputs?.users) ? [...step.inputs.users] : [];
    const newUser = {
      email: newEmail.trim(),
      role: newRole,
      ...(newName.trim() ? { full_name: newName.trim() } : {}),
    };

    currentUsers.push(newUser);
    const updatedInputs: Record<string, any> = {
      ...step.inputs,
      users: currentUsers,
      total_count: currentUsers.length,
    };

    const remainingEmails = currentUsers.map((u: any) => u.email).filter(Boolean);
    if (step.inputs?.student_emails) updatedInputs.student_emails = remainingEmails;
    if (step.inputs?.user_emails) updatedInputs.user_emails = remainingEmails;
    if (step.inputs?.collaborators) updatedInputs.collaborators = remainingEmails;

    onUpdateStep(step.step_id, { inputs: updatedInputs });
    setNewEmail('');
    setNewName('');
    setShowAddUserModal(false);
  };

  // Xóa 1 email khỏi mảng đơn giản
  const handleRemoveEmailFromArray = (key: string, emailIndex: number) => {
    if (!onUpdateStep) return;
    const list = Array.isArray(step.inputs?.[key]) ? [...step.inputs[key]] : [];
    list.splice(emailIndex, 1);
    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        [key]: list,
      },
    });
  };

  // RENDER THÔNG MINH CHO TỪNG THAM SỐ
  const renderInputField = (key: string, val: any) => {
    const isBound = typeof val === 'string' && val.includes('{{');
    const isEditing = editingInputKey === key;

    // 1. Nếu là mảng Danh Sách Người Dùng (users)
    if (key === 'users' && Array.isArray(val)) {
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              <span>Danh Sách Tài Khoản Cần Tạo ({val.length} người):</span>
            </span>
            {isEditable && (
              <button
                type="button"
                onClick={() => setShowAddUserModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Thêm Người
              </button>
            )}
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {val.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-1">Chưa có người dùng nào.</div>
            ) : (
              val.map((u: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {u.full_name || u.email?.split('@')[0]}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {u.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${u.role === 'teacher'
                        ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                        : 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                        }`}
                    >
                      {u.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                    </span>

                    {isEditable && (
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                        title="Xóa người này khỏi danh sách"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Modal Mini thêm người dùng */}
          {showAddUserModal && (
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-2 mt-2">
              <div className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                Nhập thông tin người dùng bổ sung:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Họ và tên..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
                />
                <input
                  type="email"
                  placeholder="Địa chỉ email *..."
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
                >
                  <option value="teacher">Giáo viên (Teacher)</option>
                  <option value="student">Học sinh (Student)</option>
                </select>
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="px-3 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                >
                  Thêm Vào
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 2. Nếu là Mảng Email hoặc Danh sách chuỗi (student_emails, user_emails, collaborators, courses)
    if (Array.isArray(val)) {
      const isCourseList = key === 'courses';
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
              {key === 'student_emails' ? 'Danh sách Email Ghi Danh:' : `${key}:`}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">({val.length} mục)</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {val.map((item: string, itemIdx: number) => (
              <span
                key={itemIdx}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-medium ${isCourseList
                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                  }`}
              >
                {isCourseList ? <GraduationCap className="w-3 h-3 text-teal-600" /> : <Mail className="w-3 h-3 text-slate-400" />}
                <span>{item}</span>
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => handleRemoveEmailFromArray(key, itemIdx)}
                    className="text-slate-400 hover:text-rose-600 ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      );
    }

    // 3. Nếu là Repo URL (repo_url)
    if (key === 'repo_url') {
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs text-indigo-600 shrink-0">repo_url:</span>
              <input
                type="text"
                autoFocus
                value={tempInputValue}
                onChange={(e) => setTempInputValue(e.target.value)}
                placeholder="Nhập Git Repo URL (vd: https://git.pythaverse.space/...)"
                className="flex-1 h-8 px-2 text-xs font-mono bg-white dark:bg-slate-800 border border-indigo-400 rounded-lg outline-none"
              />
              <button
                type="button"
                onClick={() => handleSaveInput(key)}
                className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-bold"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => setEditingInputKey(null)}
                className="px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded text-xs"
              >
                Hủy
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="font-mono font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">repo_url:</span>
                {val ? (
                  <a
                    href={val}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate flex items-center gap-1"
                  >
                    <span>{val}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                    ⚠️ Chưa liên kết Git Repo
                  </span>
                )}
              </div>

              {isEditable && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingInputKey(key);
                    setTempInputValue(val || '');
                  }}
                  className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    // 4. Các trường đơn giản khác
    return (
      <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 transition-all shadow-2xs">
        {isEditing ? (
          <div className="flex items-center gap-2 w-full">
            <span className="font-mono font-bold text-indigo-900 dark:text-indigo-200 text-xs shrink-0">
              {key}:
            </span>
            <input
              type="text"
              autoFocus
              value={tempInputValue}
              onChange={(e) => setTempInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveInput(key);
                if (e.key === 'Escape') setEditingInputKey(null);
              }}
              className="flex-1 h-8 px-2 text-xs font-mono bg-white dark:bg-slate-800 border border-indigo-400 rounded-lg outline-none"
            />
            <button
              type="button"
              onClick={() => handleSaveInput(key)}
              className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold"
            >
              Lưu
            </button>
            <button
              type="button"
              onClick={() => setEditingInputKey(null)}
              className="h-8 px-2 bg-slate-200 dark:bg-slate-700 rounded text-xs"
            >
              Hủy
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-xs shrink-0">
                {key}:
              </span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded-lg break-all font-semibold ${isBound
                  ? 'text-indigo-700 dark:text-indigo-300 font-black bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800'
                  : val === null || val === undefined || String(val).trim() === ''
                    ? 'text-slate-400 italic bg-slate-50 dark:bg-slate-800'
                    : 'text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700'
                  }`}
              >
                {val === null || val === undefined || String(val).trim() === '' ? 'null' : String(val)}
              </span>
            </div>

            {isEditable && (
              <button
                type="button"
                onClick={() => {
                  setEditingInputKey(key);
                  setTempInputValue(String(val || ''));
                }}
                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-200 ${step.status === 'running'
        ? 'bg-sky-50/60 dark:bg-sky-950/30 border-sky-400 shadow-md ring-2 ring-sky-300/40'
        : step.status === 'failed'
          ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-300 shadow-sm'
          : step.status === 'success'
            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700'
        }`}
    >
      {/* Header Dòng Thẻ Bước */}
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 flex-wrap bg-slate-50/50 dark:bg-slate-850/40 rounded-t-2xl border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-black text-slate-900 dark:text-white shrink-0 shadow-2xs font-mono">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white truncate">
                {getDomainIcon(capDef?.domain)}
                <span>{step.name}</span>
              </span>

              {capDef?.risk_level === 'high_mutation' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                  <ShieldAlert className="w-3 h-3 text-amber-700 dark:text-amber-400" /> MUTATION
                </span>
              )}

              {getStatusBadge(step.status)}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mt-1 flex-wrap font-mono">
              <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {step.capability_id}
              </span>
              {step.depends_on && step.depends_on.length > 0 && (
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  ↳ Phụ thuộc: {step.depends_on.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Nút Thao Tác Điều Khiển */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditable && (
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMoveStep && onMoveStep(step.step_id, 'up')}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition"
                title="Di chuyển lên trước"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={index === totalSteps - 1}
                onClick={() => onMoveStep && onMoveStep(step.step_id, 'down')}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition"
                title="Di chuyển xuống sau"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteStep && onDeleteStep(step.step_id)}
                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition cursor-pointer"
                title="Xóa bước này"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {step.status === 'failed' && onRetryStep && (
            <button
              type="button"
              onClick={() => onRetryStep(step.step_id)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Thử Lại
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title={isExpanded ? 'Thu gọn chi tiết' : 'Bung mở chi tiết'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Thông Báo Lỗi */}
      {step.error_message && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2 font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <span>{step.error_message}</span>
        </div>
      )}

      {/* Thân Thẻ Mở Rộng */}
      {isExpanded && (
        <div className="p-4 space-y-3.5">
          {step.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed bg-slate-50 dark:bg-slate-850 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
              💡 {step.description}
            </p>
          )}

          {/* Danh Sách Inputs */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Tham Số Đầu Vào (Inputs):</span>
              {isEditable && (
                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold normal-case">
                  Nhấp vào biểu tượng ✎ hoặc 🗑️ để can thiệp trực tiếp
                </span>
              )}
            </div>

            <div className="space-y-2 bg-slate-100/70 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              {Object.keys(step.inputs || {}).length === 0 ? (
                <div className="text-slate-500 italic text-xs py-1">Không có tham số đầu vào cố định.</div>
              ) : (
                Object.entries(step.inputs).map(([key, val]) => renderInputField(key, val))
              )}
            </div>
          </div>

          {/* Hiển Thị Outputs */}
          {step.outputs && Object.keys(step.outputs).length > 0 && (
            <div>
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1.5">
                Kết Quả Đầu Ra (Outputs):
              </div>
              <pre className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs font-mono font-bold text-emerald-900 dark:text-emerald-200 max-h-40 overflow-y-auto leading-relaxed shadow-inner">
                {JSON.stringify(step.outputs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};