// frontend/src/features/inbox/components/WorkflowStepCard.tsx
import React, { useState, useEffect } from 'react';
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
  X,
  Zap,
  ShieldAlert,
  User,
  Users,
  Plus,
  BookOpen,
  Search,
  Check,
  UserPlus
} from 'lucide-react';
import { WorkflowStep, CapabilityDefinition, CourseItem, GitRepoConfig } from '../../../types';
import { fetchApi } from '../../../lib/api';

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

  // Quản lý Course Picker
  const [showCoursePicker, setShowCoursePicker] = useState<boolean>(false);
  const [dbCourses, setDbCourses] = useState<CourseItem[]>([]);
  const [courseSearch, setCourseSearch] = useState<string>('');
  const [loadingCourses, setLoadingCourses] = useState<boolean>(false);

  // Quản lý Thêm User Mới
  const [showAddUserForm, setShowAddUserForm] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newRole, setNewRole] = useState<'teacher' | 'student'>('student');
  const [newClass, setNewClass] = useState<string>('');

  // Quản lý Thêm Repo URL Mới
  const [showAddRepoInput, setShowAddRepoInput] = useState<boolean>(false);
  const [newRepoUrl, setNewRepoUrl] = useState<string>('');

  const capDef = capabilitiesMap[step.capability_id];

  useEffect(() => {
    if (showCoursePicker && dbCourses.length === 0) {
      loadCoursesFromApi();
    }
  }, [showCoursePicker]);

  const loadCoursesFromApi = async () => {
    setLoadingCourses(true);
    try {
      const isCof = Boolean(step.inputs?.attachment_url);
      const pane = isCof ? 'workspace' : 'lms';
      const data = await fetchApi<CourseItem[]>(`/courses/${pane}`);
      if (Array.isArray(data)) {
        setDbCourses(data);
      }
    } catch (err) {
      console.error('Lỗi nạp khóa học từ API:', err);
    } finally {
      setLoadingCourses(false);
    }
  };

  const getDomainIcon = (domain?: string) => {
    switch (domain) {
      case 'School Workspace':
        return <Building2 className="w-4 h-4 text-emerald-600" />;
      case 'Moodle PLearn LMS':
        return <GraduationCap className="w-4 h-4 text-sky-600" />;
      case 'Keycloak Auth IDP':
        return <KeyRound className="w-4 h-4 text-amber-600" />;
      case 'Pythaverse Git':
        return <GitBranch className="w-4 h-4 text-purple-600" />;
      case 'COF Processing':
        return <FileSpreadsheet className="w-4 h-4 text-teal-600" />;
      default:
        return <FileText className="w-4 h-4 text-indigo-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> THÀNH CÔNG
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-900 border border-sky-300 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" /> ĐANG CHẠY
          </span>
        );
      case 'waiting_poll':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" /> ĐỢI BATCH
          </span>
        );
      case 'waiting_dependency':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> CHỜ BƯỚC TRƯỚC
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-600" /> LỖI BƯỚC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-50 text-teal-800 border border-teal-300">
            <Zap className="w-3.5 h-3.5 text-teal-600" /> SẴN SÀNG
          </span>
        );
    }
  };

  const handleSaveInput = (key: string, customValue?: any) => {
    if (!onUpdateStep) return;
    let finalVal = customValue !== undefined ? customValue : tempInputValue;
    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        [key]: finalVal,
      },
    });
    setEditingInputKey(null);
  };

  // 🎯 QUẢN LÝ DANH SÁCH USERS
  const handleAddUser = () => {
    if (!onUpdateStep || (!newName.trim() && !newEmail.trim())) return;
    const currentUsers = Array.isArray(step.inputs?.users) ? [...step.inputs.users] : [];

    // Tự động phân tách First/Last name nếu người dùng chỉ nhập họ tên
    const cleanName = newName.trim();
    const words = cleanName.split(' ');
    const firstName = words.length > 1 ? words.slice(0, -1).join(' ') : (newRole === 'teacher' ? 'Teacher' : 'Student');
    const lastName = words.length > 1 ? words[words.length - 1] : (words[0] || 'User');

    currentUsers.push({
      first_name: firstName,
      last_name: lastName,
      full_name: cleanName || `${firstName} ${lastName}`,
      email: newEmail.trim() || null,
      role: newRole,
      class_name: newClass.trim() || null,
      dob: newRole === 'teacher' ? '01/01/1990' : '01/01/2016'
    });

    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        users: currentUsers,
      }
    });

    // Reset form
    setNewName('');
    setNewEmail('');
    setNewClass('');
    setShowAddUserForm(false);
  };

  const handleRemoveUser = (userIdx: number) => {
    if (!onUpdateStep) return;
    const currentUsers = Array.isArray(step.inputs?.users) ? [...step.inputs.users] : [];
    currentUsers.splice(userIdx, 1);
    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        users: currentUsers,
      }
    });
  };

  // 🎯 QUẢN LÝ REPOSITORIES
  const handleAddRepo = () => {
    if (!onUpdateStep || !newRepoUrl.trim()) return;
    const currentRepos = Array.isArray(step.inputs?.repositories) ? [...step.inputs.repositories] : [];
    if (!currentRepos.includes(newRepoUrl.trim())) {
      currentRepos.push(newRepoUrl.trim());
    }
    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        repositories: currentRepos,
        repo_urls: currentRepos
      }
    });
    setNewRepoUrl('');
    setShowAddRepoInput(false);
  };

  const handleRemoveRepo = (repoIdx: number) => {
    if (!onUpdateStep) return;
    const currentRepos = Array.isArray(step.inputs?.repositories) ? [...step.inputs.repositories] : [];
    currentRepos.splice(repoIdx, 1);
    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        repositories: currentRepos,
        repo_urls: currentRepos
      }
    });
  };

  // 🎯 QUẢN LÝ KHÓA HỌC
  const handleSelectCourse = (course: CourseItem) => {
    if (!onUpdateStep) return;
    const currentCourses = Array.isArray(step.inputs?.courses) ? [...step.inputs.courses] : [];
    if (!currentCourses.includes(course.course_name)) {
      currentCourses.push(course.course_name);
    }

    const currentPairings = { ...(step.inputs?.course_repo_pairings || {}) };
    const currentRole = step.inputs?.role || 'teacher';
    const gitRepos: GitRepoConfig[] = Array.isArray(course.git_repos) ? course.git_repos : [];

    if (gitRepos.length > 0) {
      let matchedRepo: GitRepoConfig | undefined;
      if (currentRole === 'teacher') {
        matchedRepo = gitRepos.find((r) => r.target === 'teacher_only') || gitRepos[0];
      } else {
        matchedRepo = gitRepos.find((r) => r.target === 'all') || gitRepos[0];
      }
      if (matchedRepo?.repo_url) {
        currentPairings[course.course_name] = matchedRepo.repo_url;
      }
    }

    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        courses: currentCourses,
        course_repo_pairings: currentPairings,
        attached_git_repos: Object.values(currentPairings),
      },
    });
    setShowCoursePicker(false);
  };

  const handleRemoveCourse = (index: number) => {
    if (!onUpdateStep) return;
    const currentCourses = Array.isArray(step.inputs?.courses) ? [...step.inputs.courses] : [];
    const removedCourseName = currentCourses[index];
    currentCourses.splice(index, 1);

    const currentPairings = { ...(step.inputs?.course_repo_pairings || {}) };
    if (removedCourseName && currentPairings[removedCourseName]) {
      delete currentPairings[removedCourseName];
    }

    onUpdateStep(step.step_id, {
      inputs: {
        ...step.inputs,
        courses: currentCourses,
        course_repo_pairings: currentPairings,
        attached_git_repos: Object.values(currentPairings),
      },
    });
  };

  const shouldSkipKey = (key: string) => {
    if (key === 'school_identifier') return true;
    if (key === 'school_id') return true;
    if (key === 'sync_git_repo') return true;
    if (key === 'attached_git_repo') return true;
    if (key === 'attached_git_repos') return true;
    if (key === 'course_repo_pairings') return true;
    if (key === 'repo_urls' && step.inputs?.repositories) return true;
    if (step.capability_id === 'workspace.bulk_account_creation' && (key === 'student_emails' || key === 'user_emails')) return true;
    if (step.capability_id === 'workspace.poll_account_batch' && (key === 'school_name' || key === 'school_id')) return true;
    return false;
  };

  const renderField = (key: string, val: any) => {
    const isBound = typeof val === 'string' && val.includes('{{');
    const isEditing = editingInputKey === key;

    // 1. TRƯỜNG HỌC
    if (key === 'school_name') {
      const schoolId = step.inputs?.school_id || '';
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Trường Học:</span>
                  <span className="text-xs font-extrabold text-slate-950 dark:text-white truncate">
                    {val || '(Chưa xác định - Bấm sửa để gõ)'}
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
                className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg cursor-pointer transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      );
    }

    // 2. DANH SÁCH USERS (CHO PHÉP THÊM, SỬA, XÓA TRỰC QUAN)
    if (key === 'users' && Array.isArray(val)) {
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              <span>Danh Sách Người Dùng Áp Dụng ({val.length} người):</span>
            </span>

            {isEditable && (
              <button
                type="button"
                onClick={() => setShowAddUserForm(!showAddUserForm)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 transition cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{showAddUserForm ? 'Đóng' : 'Thêm Thành Viên'}</span>
              </button>
            )}
          </div>

          {/* Form Thêm User Mới Nhanh */}
          {showAddUserForm && (
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800/60 space-y-2.5 animate-in fade-in duration-150">
              <span className="text-[11px] font-black uppercase text-indigo-900 dark:text-indigo-200 block">
                Bổ Sung Tài Khoản Mới Vào Bước Này:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Họ và tên (VD: Nguyễn Văn A)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
                />
                <input
                  type="email"
                  placeholder="Email (bắt buộc cho GV)"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'teacher' | 'student')}
                  className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
                >
                  <option value="student">🎓 Học sinh</option>
                  <option value="teacher">🧑‍🏫 Giáo viên</option>
                </select>
                <input
                  type="text"
                  placeholder="Lớp (VD: 6A1)"
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                  className="w-24 px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="ml-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-xs"
                >
                  Thêm Ngay
                </button>
              </div>
            </div>
          )}

          {/* Danh Sách User Hiện Tại */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {val.length === 0 ? (
              <div className="text-xs text-amber-600 dark:text-amber-400 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg italic">
                ⚠️ Chưa có người dùng nào. Nhấn "Thêm Thành Viên" ở trên để bổ sung.
              </div>
            ) : (
              val.map((u: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-950 dark:text-white truncate">
                        {u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email?.split('@')[0]}
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate font-semibold">
                        {u.email || '(Không có email)'} {u.class_name ? `• Lớp ${u.class_name}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${u.role === 'teacher'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                        : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
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
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    // 3. GIT ROLE (CHỌN DROPDOWN AN TOÀN TUYỆT ĐỐI)
    if (key === 'git_role') {
      const currentGitRole = val || 'GUEST';
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-bold text-slate-500 uppercase">Vai Trò Git Collaborator:</span>
            <span className="text-xs font-extrabold text-purple-900 dark:text-purple-200 bg-purple-100 dark:bg-purple-950 px-2.5 py-1 rounded-md border border-purple-300 dark:border-purple-800">
              {currentGitRole}
            </span>
          </div>

          {isEditable && (
            <select
              value={currentGitRole}
              onChange={(e) => handleSaveInput(key, e.target.value)}
              className="text-xs font-extrabold text-slate-950 dark:text-white bg-white dark:bg-slate-900 border-2 border-purple-400 dark:border-purple-600 rounded-lg px-2.5 py-1 outline-none cursor-pointer"
            >
              <option value="GUEST">GUEST (Chỉ Clone / Xem bài học)</option>
              <option value="DEVELOPER">DEVELOPER (Đẩy Code / Làm Bài)</option>
              <option value="ADMIN">ADMIN (Quản Trị Toàn Quyền)</option>
            </select>
          )}
        </div>
      );
    }

    // 4. DANH SÁCH REPOSITORIES
    if ((key === 'repositories' || key === 'repo_urls') && Array.isArray(val)) {
      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-200 uppercase">
              <GitBranch className="w-4 h-4 text-purple-600" />
              <span>Kho Mã Nguồn Áp Dụng ({val.length} repos):</span>
            </span>

            {isEditable && (
              <button
                type="button"
                onClick={() => setShowAddRepoInput(!showAddRepoInput)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddRepoInput ? 'Đóng' : 'Thêm Repo URL'}</span>
              </button>
            )}
          </div>

          {showAddRepoInput && (
            <div className="flex items-center gap-2 p-2 bg-purple-50/70 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800">
              <input
                type="text"
                placeholder="Dán link Git repo (VD: https://git.pythaverse.space/owner/repo)..."
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
              />
              <button
                type="button"
                onClick={handleAddRepo}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
              >
                Lưu Repo
              </button>
            </div>
          )}

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {val.length === 0 ? (
              <div className="text-xs text-slate-400 italic p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                (Chưa có link repo nào)
              </div>
            ) : (
              val.map((r: string, rIdx: number) => (
                <div
                  key={rIdx}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 text-xs font-mono"
                >
                  <span className="truncate font-bold text-slate-800 dark:text-slate-200">{r}</span>
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRepo(rIdx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                      title="Xóa repo này"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    // 5. KHÓA HỌC LMS & ĐỒNG BỘ GIT REPO
    if (key === 'courses') {
      const coursesList = Array.isArray(val) ? val : [];
      const pairings: Record<string, string> = step.inputs?.course_repo_pairings || {};
      const isSyncGitEnabled = step.inputs?.sync_git_repo !== false;

      const filteredDbCourses = dbCourses.filter((c) =>
        (c.course_name || '').toLowerCase().includes(courseSearch.toLowerCase()) ||
        (c.sku || '').toLowerCase().includes(courseSearch.toLowerCase()) ||
        String(c.course_id || '').includes(courseSearch)
      );

      return (
        <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
              <GraduationCap className="w-4 h-4 text-sky-600" />
              <span>Khóa Học LMS Áp Dụng ({coursesList.length} khóa):</span>
            </span>
            {isEditable && (
              <button
                type="button"
                onClick={() => setShowCoursePicker(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Chọn Khóa Học Từ Danh Mục
              </button>
            )}
          </div>

          <div className="space-y-2">
            {coursesList.length === 0 ? (
              <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold italic p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                ⚠️ Chưa có khóa học nào được chọn. Nhấp "Chọn Khóa Học Từ Danh Mục" để gán khóa học.
              </div>
            ) : (
              coursesList.map((c: string, cIdx: number) => {
                const repoForThisCourse = pairings[c];
                return (
                  <div
                    key={cIdx}
                    className="p-2.5 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/60 dark:bg-sky-950/30 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <BookOpen className="w-4 h-4 text-sky-600 shrink-0" />
                        <span className="text-xs font-extrabold text-slate-950 dark:text-white truncate">{c}</span>
                      </div>
                      {isEditable && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCourse(cIdx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                          title="Xóa khóa học này"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {repoForThisCourse ? (
                      <div className="flex items-center gap-2 text-[11px] font-mono text-purple-900 dark:text-purple-200 bg-purple-100/70 dark:bg-purple-950/60 p-1.5 rounded-lg border border-purple-200 dark:border-purple-800">
                        <GitBranch className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400 shrink-0" />
                        <span className="truncate font-bold">Repo: {repoForThisCourse}</span>
                        <span className="ml-auto text-[9px] font-sans font-black uppercase text-purple-700 dark:text-purple-300 bg-purple-200 dark:bg-purple-900 px-1.5 py-0.2 rounded shrink-0">
                          Auto Git
                        </span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic">
                        (Môn học này không cấu hình Git Repo)
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Tự Động Đồng Bộ Quyền Git Repos Tương Ứng:
              </span>
            </div>

            <button
              type="button"
              disabled={!isEditable}
              onClick={() => handleSaveInput('sync_git_repo', !isSyncGitEnabled)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition cursor-pointer ${isSyncGitEnabled
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
            >
              <span>{isSyncGitEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}</span>
            </button>
          </div>

          {showCoursePicker && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 border-2 border-sky-400 rounded-xl shadow-md space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 dark:text-white uppercase">
                  Chọn Khóa Học Từ Course Management:
                </span>
                <button
                  type="button"
                  onClick={() => setShowCoursePicker(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Tìm theo tên môn, mã SKU, ID (VD: SWRP 11, SWRP 8...)"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 text-xs font-bold text-slate-950 dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none"
                />
              </div>

              <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                {loadingCourses ? (
                  <div className="p-4 text-center text-xs text-slate-500">Đang tải danh mục môn học...</div>
                ) : filteredDbCourses.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">Không tìm thấy khóa học nào phù hợp.</div>
                ) : (
                  filteredDbCourses.map((c) => (
                    <div
                      key={c.id || c.course_id}
                      onClick={() => handleSelectCourse(c)}
                      className="p-2.5 hover:bg-sky-50 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-950 dark:text-white truncate">
                          {c.course_name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          ID: #{c.course_id} | SKU: {c.sku || 'N/A'}
                        </div>
                      </div>

                      {c.git_repos && Array.isArray(c.git_repos) && c.git_repos.length > 0 && (
                        <span className="shrink-0 text-[10px] font-black text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                          <GitBranch className="w-3 h-3" />
                          <span>{c.git_repos.length} Repos</span>
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 6. VAI TRÒ LMS
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
            <span className="text-xs font-bold text-slate-500 uppercase">Vai Trò Ghi Danh LMS:</span>
            <span className="text-xs font-extrabold text-purple-800 dark:text-purple-300 bg-purple-100 dark:bg-purple-950 px-2.5 py-1 rounded-md border border-purple-300 dark:border-purple-800">
              {roleLabel}
            </span>
          </div>

          {isEditable && (
            <select
              value={val || 'teacher'}
              onChange={(e) => handleSaveInput(key, e.target.value)}
              className="text-xs font-bold text-slate-950 dark:text-white bg-white dark:bg-slate-900 border-2 border-indigo-400 rounded-lg px-2.5 py-1 outline-none cursor-pointer"
            >
              <option value="teacher">Giáo viên (Non-editing Teacher)</option>
              <option value="student">Học viên (Student)</option>
              <option value="manager">Quản lý (Manager)</option>
            </select>
          )}
        </div>
      );
    }

    // 7. CÁC TRƯỜNG DỮ LIỆU ĐƠN GIẢN HOẶC MẢNG KHÁC
    return (
      <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
        {isEditing ? (
          <div className="flex items-center gap-2 w-full">
            <span className="font-mono font-extrabold text-slate-950 dark:text-white text-xs shrink-0">
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
              className="flex-1 h-9 px-3 text-xs font-mono font-extrabold text-slate-950 dark:text-white bg-white dark:bg-slate-900 border-2 border-indigo-500 rounded-lg outline-none shadow-sm"
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
              className="h-9 px-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs cursor-pointer"
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
                className={`font-mono text-xs px-2.5 py-0.5 rounded-lg break-all font-extrabold ${isBound
                  ? 'text-indigo-900 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-800'
                  : 'text-slate-950 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                  }`}
              >
                {val === null || val === undefined || String(val).trim() === ''
                  ? '(Không có)'
                  : typeof val === 'object'
                    ? JSON.stringify(val)
                    : String(val)}
              </span>
            </div>

            {isEditable && (
              <button
                type="button"
                onClick={() => {
                  setEditingInputKey(key);
                  setTempInputValue(typeof val === 'object' ? JSON.stringify(val) : String(val || ''));
                }}
                className="p-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded cursor-pointer"
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
            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300'
        }`}
    >
      {/* Header Thẻ Bước */}
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 flex-wrap bg-slate-50/80 dark:bg-slate-800/60 rounded-t-2xl border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs font-black text-slate-950 dark:text-white shrink-0 font-mono">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-950 dark:text-white truncate">
                {getDomainIcon(capDef?.domain)}
                <span>{step.name}</span>
              </span>

              {capDef?.risk_level === 'high_mutation' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
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
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                title="Di chuyển lên"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={index === totalSteps - 1}
                onClick={() => onMoveStep && onMoveStep(step.step_id, 'down')}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                title="Di chuyển xuống"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteStep && onDeleteStep(step.step_id)}
                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
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
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {step.error_message && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2 font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{step.error_message}</span>
        </div>
      )}

      {/* Thân Thẻ Bước */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          <div className="space-y-2 bg-slate-100/70 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
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
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">
                Kết Quả Đầu Ra (Outputs):
              </div>
              <pre className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-mono font-bold text-emerald-950 dark:text-emerald-200 max-h-40 overflow-y-auto leading-relaxed">
                {JSON.stringify(step.outputs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};