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
  BookOpen
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

  // State thêm người dùng
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('teacher');

  // State thêm khóa học
  const [showAddCourse, setShowAddCourse] = useState<boolean>(false);
  const [newCourseName, setNewCourseName] = useState<string>('');

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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> THÀNH CÔNG
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200 border border-sky-300 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" /> ĐANG CHẠY
          </span>
        );
      case 'waiting_poll':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" /> ĐỢI BATCH
          </span>
        );
      case 'waiting_dependency':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> CHỜ BƯỚC TRƯỚC
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-600" /> LỖI BƯỚC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200 border border-teal-300">
            <Zap className="w-3.5 h-3.5 text-teal-600" /> SẴN SÀNG
          </span>
        );
    }
  };

  const handleSaveInput = (key: string, customValue?: any) => {
    if (!onUpdateStep) return;
    let finalVal = customValue !== undefined ? customValue : tempInputValue;
    if (typeof finalVal === 'string') {
      try {
        if (finalVal.startsWith('{') || finalVal.startsWith('[')) {
          finalVal = JSON.parse(finalVal);
        }
      } catch { }
    }

    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        [key]: finalVal,
      },
    });
    setEditingInputKey(null);
  };

  const handleRemoveUser = (userIndex: number) => {
    if (!onUpdateStep) return;
    const currentUsers = Array.isArray(step.inputs?.users) ? [...step.inputs.users] : [];
    currentUsers.splice(userIndex, 1);

    const updatedInputs: Record<string, any> = {
      ...step.inputs,
      users: currentUsers,
      total_count: currentUsers.length,
    };
    onUpdateStep(step.step_id, { inputs: updatedInputs });
  };

  const handleAddUser = () => {
    if (!newEmail.trim() || !onUpdateStep) return;
    const currentUsers = Array.isArray(step.inputs?.users) ? [...step.inputs.users] : [];
    currentUsers.push({
      email: newEmail.trim(),
      role: newRole,
      ...(newName.trim() ? { full_name: newName.trim() } : {}),
    });

    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        users: currentUsers,
        total_count: currentUsers.length,
      },
    });
    setNewEmail('');
    setNewName('');
    setShowAddUserModal(false);
  };

  const handleRemoveCourse = (courseIndex: number) => {
    if (!onUpdateStep) return;
    const currentCourses = Array.isArray(step.inputs?.courses) ? [...step.inputs.courses] : [];
    currentCourses.splice(courseIndex, 1);
    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        courses: currentCourses,
      },
    });
  };

  const handleAddCourse = () => {
    if (!newCourseName.trim() || !onUpdateStep) return;
    const currentCourses = Array.isArray(step.inputs?.courses) ? [...step.inputs.courses] : [];
    currentCourses.push(newCourseName.trim());
    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        courses: currentCourses,
      },
    });
    setNewCourseName('');
    setShowAddCourse(false);
  };

  // BỘ LỌC TỐI GIẢN: NHỮNG KEY TRÙNG LẶP / VÔ DUYÊN BỊ TRIỆT TIÊU HOÀN TOÀN
  const shouldSkipKey = (key: string) => {
    // 1. Không hiển thị school_identifier (vì đã có school_name)
    if (key === 'school_identifier') return true;
    // 2. Không hiển thị school_id rời rạc (sẽ được gom vào chung thẻ trường học)
    if (key === 'school_id') return true;
    // 3. Trong bước tạo tài khoản, đã có users thì không hiển thị lại student_emails
    if (step.capability_id === 'workspace.bulk_account_creation' && (key === 'student_emails' || key === 'user_emails')) return true;
    // 4. Trong bước poll batch, chỉ hiển thị request_id, bỏ các trường râu ria
    if (step.capability_id === 'workspace.poll_account_batch' && (key === 'school_name' || key === 'school_id')) return true;
    return false;
  };

  // RENDER THÔNG MINH CHO TỪNG LOẠI DỮ LIỆU
  const renderField = (key: string, val: any) => {
    const isBound = typeof val === 'string' && val.includes('{{');
    const isEditing = editingInputKey === key;

    // 🏢 1. GOM NHÓM TRƯỜNG HỌC (SCHOOL NAME + SCHOOL ID GOM CHUNG 1 THẺ)
    if (key === 'school_name') {
      const schoolId = step.inputs?.school_id || '';
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Trường Học:</span>
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                    {val || '(Chưa xác định)'}
                  </span>
                </div>
                {schoolId && (
                  <div className="text-[10px] font-mono text-slate-400 truncate">
                    UUID: {schoolId}
                  </div>
                )}
              </div>
            </div>

            {isEditable && (
              <button
                type="button"
                onClick={() => {
                  setEditingInputKey(key);
                  setTempInputValue(val || '');
                }}
                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                title="Chỉnh sửa tên trường"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      );
    }

    // 👥 2. DANH SÁCH TÀI KHOẢN (USERS)
    if (key === 'users' && Array.isArray(val)) {
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs space-y-2">
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
            {val.map((u: any, idx: number) => (
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

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${u.role === 'teacher'
                      ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200'
                      : 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200'
                      }`}
                  >
                    {u.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                  </span>

                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => handleRemoveUser(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                      title="Xóa người này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {showAddUserModal && (
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-2 mt-2">
              <div className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                Thêm tài khoản vào danh sách:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Họ và tên..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
                />
                <input
                  type="email"
                  placeholder="Email *..."
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none cursor-pointer"
                >
                  <option value="teacher">Giáo viên (Teacher)</option>
                  <option value="student">Học sinh (Student)</option>
                </select>
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="px-3 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                >
                  Xác Nhận
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 🎓 3. DANH MỤC KHÓA HỌC (COURSES) CÓ NÚT THÊM KHÓA HỌC
    if (key === 'courses') {
      const coursesList = Array.isArray(val) ? val : [];
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
              <GraduationCap className="w-4 h-4 text-sky-600" />
              <span>Khóa Học LMS Áp Dụng ({coursesList.length} khóa):</span>
            </span>
            {isEditable && (
              <button
                type="button"
                onClick={() => setShowAddCourse(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Thêm Khóa Học
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {coursesList.length === 0 ? (
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium italic">
                ⚠️ Chưa có khóa học nào được chọn. Nhấp "Thêm Khóa Học" để chỉ định.
              </div>
            ) : (
              coursesList.map((c: string, cIdx: number) => (
                <span
                  key={cIdx}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 shadow-2xs"
                >
                  <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                  <span>{c}</span>
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCourse(cIdx)}
                      className="text-sky-500 hover:text-rose-600 ml-1"
                      title="Xóa khóa học này"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))
            )}
          </div>

          {showAddCourse && (
            <div className="p-2.5 bg-sky-50/70 dark:bg-sky-950/40 rounded-xl border border-sky-200 dark:border-sky-800 flex items-center gap-2 mt-2">
              <input
                type="text"
                autoFocus
                placeholder="Nhập tên khóa học (VD: SWRP 11, SWRP 8...)"
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCourse();
                  if (e.key === 'Escape') setShowAddCourse(false);
                }}
                className="flex-1 h-9 px-3 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-sky-300 rounded-lg outline-none shadow-xs"
              />
              <button
                type="button"
                onClick={handleAddCourse}
                className="h-9 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold"
              >
                Thêm
              </button>
              <button
                type="button"
                onClick={() => setShowAddCourse(false)}
                className="h-9 px-2 text-xs text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Hủy
              </button>
            </div>
          )}
        </div>
      );
    }

    // 🏷️ 4. VAI TRÒ LMS (ROLE): PHÂN RÕ NON-EDITING TEACHER / STUDENT / MANAGER
    if (key === 'role') {
      const roleLabel =
        val === 'teacher'
          ? '🧑‍🏫 Giáo viên (Non-editing Teacher)'
          : val === 'manager'
            ? '🛡️ Quản lý (Manager)'
            : '🎓 Học viên (Student)';

      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Vai Trò Ghi Danh:</span>
            <span className="text-xs font-extrabold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2.5 py-1 rounded-md border border-purple-200">
              {roleLabel}
            </span>
          </div>

          {isEditable && (
            <select
              value={val || 'teacher'}
              onChange={(e) => handleSaveInput(key, e.target.value)}
              className="text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-slate-300 rounded-lg px-2 py-1 outline-none cursor-pointer"
            >
              <option value="teacher">Giáo viên (Non-editing Teacher)</option>
              <option value="student">Học viên (Student)</option>
              <option value="manager">Quản lý (Manager)</option>
            </select>
          )}
        </div>
      );
    }

    // 🔗 5. GIT REPO URL: SỬA MÀU CHỮ ĐEN ĐẬM, TƯƠNG PHẢN CỰC CAO
    if (key === 'repo_url') {
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs text-indigo-700 shrink-0">repo_url:</span>
              <input
                type="text"
                autoFocus
                value={tempInputValue}
                onChange={(e) => setTempInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveInput(key);
                  if (e.key === 'Escape') setEditingInputKey(null);
                }}
                placeholder="Nhập Git Repo URL (vd: https://git.pythaverse.space/...)"
                className="flex-1 h-9 px-3 text-xs font-mono font-extrabold text-slate-950 dark:text-white bg-white dark:bg-slate-800 border-2 border-indigo-500 rounded-lg outline-none shadow-sm"
              />
              <button
                type="button"
                onClick={() => handleSaveInput(key)}
                className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => setEditingInputKey(null)}
                className="h-9 px-2.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-xs"
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
                    className="font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline truncate flex items-center gap-1"
                  >
                    <span>{val}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200">
                    ⚠️ Chưa có Git Repo (Bấm nút sửa để nhập tay)
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

    // 📎 6. ATTACHMENT_URL: KHÔNG ĐỂ NULL VÔ DUYÊN NỮA
    if (key === 'attachment_url') {
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs flex items-center justify-between">
          <span className="text-slate-500 font-bold">Tệp Đính Kèm COF:</span>
          <span className="text-slate-400 italic">
            {val ? String(val) : '(Không có tệp đính kèm - xử lý từ văn bản)'}
          </span>
        </div>
      );
    }

    // 📝 7. CÁC TRƯỜNG DỮ LIỆU ĐƠN GIẢN CÒN LẠI (TƯƠNG PHẢN ĐEN ĐẬM CHUẨN MỰC)
    return (
      <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
        {isEditing ? (
          <div className="flex items-center gap-2 w-full">
            <span className="font-mono font-bold text-slate-900 dark:text-indigo-200 text-xs shrink-0">
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
              className="flex-1 h-9 px-3 text-xs font-mono font-extrabold text-slate-950 dark:text-white bg-white dark:bg-slate-800 border-2 border-indigo-500 rounded-lg outline-none shadow-sm"
            />
            <button
              type="button"
              onClick={() => handleSaveInput(key)}
              className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Lưu
            </button>
            <button
              type="button"
              onClick={() => setEditingInputKey(null)}
              className="h-9 px-2 bg-slate-200 dark:bg-slate-700 rounded-lg text-xs"
            >
              Hủy
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-xs shrink-0">
                {key === 'student_emails' ? 'Tài Khoản Ghi Danh:' : `${key}:`}
              </span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded-lg break-all font-extrabold ${isBound
                  ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200'
                  : 'text-slate-950 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-200'
                  }`}
              >
                {val === null || val === undefined || String(val).trim() === '' ? '(Không có)' : String(val)}
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
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300'
        }`}
    >
      {/* Header Thẻ Bước */}
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 flex-wrap bg-slate-50/70 dark:bg-slate-850/40 rounded-t-2xl border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-black text-slate-900 dark:text-white shrink-0 font-mono">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white truncate">
                {getDomainIcon(capDef?.domain)}
                <span>{step.name}</span>
              </span>

              {capDef?.risk_level === 'high_mutation' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  <ShieldAlert className="w-3 h-3 text-amber-700" /> MUTATION
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

        {/* Nút Điều Khiển */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditable && (
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMoveStep && onMoveStep(step.step_id, 'up')}
                className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100 cursor-pointer"
                title="Di chuyển lên"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={index === totalSteps - 1}
                onClick={() => onMoveStep && onMoveStep(step.step_id, 'down')}
                className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100 cursor-pointer"
                title="Di chuyển xuống"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteStep && onDeleteStep(step.step_id)}
                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
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
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Thử Lại
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {step.error_message && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2 font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{step.error_message}</span>
        </div>
      )}

      {/* Thân Thẻ */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          <div className="space-y-2 bg-slate-100/70 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            {Object.keys(step.inputs || {}).length === 0 ? (
              <div className="text-slate-500 italic text-xs py-1">Không có tham số đầu vào.</div>
            ) : (
              Object.entries(step.inputs)
                .filter(([key]) => !shouldSkipKey(key))
                .map(([key, val]) => renderField(key, val))
            )}
          </div>

          {step.outputs && Object.keys(step.outputs).length > 0 && (
            <div>
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
                Kết Quả Đầu Ra (Outputs):
              </div>
              <pre className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-300 text-xs font-mono font-bold text-emerald-900 dark:text-emerald-200 max-h-40 overflow-y-auto leading-relaxed">
                {JSON.stringify(step.outputs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};