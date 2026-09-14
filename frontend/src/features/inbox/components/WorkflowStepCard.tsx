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
  Check
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

  const [showCoursePicker, setShowCoursePicker] = useState<boolean>(false);
  const [dbCourses, setDbCourses] = useState<CourseItem[]>([]);
  const [courseSearch, setCourseSearch] = useState<string>('');
  const [loadingCourses, setLoadingCourses] = useState<boolean>(false);

  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('teacher');

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

  // 🎯 CHỌN KHÓA HỌC: LƯU VÀO MẢNG KHÓA HỌC & GIỮ NGUYÊN REPO TƯƠNG ỨNG
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

  // 🛑 BỘ LỌC TỐI GIẢN: TRIỆT TIÊU TOÀN BỘ CÁC BIẾN RÁC THÔ THIỂN
  const shouldSkipKey = (key: string) => {
    if (key === 'school_identifier') return true;
    if (key === 'school_id') return true;
    if (key === 'sync_git_repo') return true; // ĐÃ CHUYỂN THÀNH TOGGLE TRÊN UI
    if (key === 'attached_git_repo') return true; // ĐÃ GOM VÀO BẢNG REPO
    if (key === 'attached_git_repos') return true;
    if (key === 'course_repo_pairings') return true;
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
        <div key={key} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Trường Học:</span>
                  <span className="text-xs font-extrabold text-slate-950 dark:text-white truncate">
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
                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      );
    }

    // 2. DANH SÁCH USERS
    if (key === 'users' && Array.isArray(val)) {
      return (
        <div key={key} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-3 shadow-2xs space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              <span>Danh Sách Tài Khoản Cần Tạo ({val.length} người):</span>
            </span>
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {val.map((u: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-950 dark:text-white truncate">
                      {u.full_name || u.email?.split('@')[0]}
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate font-semibold">
                      {u.email}
                    </div>
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${u.role === 'teacher'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-sky-100 text-sky-800 border border-sky-200'
                    }`}
                >
                  {u.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 3. KHÓA HỌC LMS & ĐỒNG BỘ GIT REPO THEO TỪNG MÔN
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
        <div key={key} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-3.5 shadow-2xs space-y-3">
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

          {/* Danh sách các khóa học + Repo tương ứng của từng khóa */}
          <div className="space-y-2">
            {coursesList.length === 0 ? (
              <div className="text-xs text-amber-600 font-semibold italic p-2 bg-amber-50 rounded-lg border border-amber-200">
                ⚠️ Chưa có khóa học nào được chọn. Nhấp "Chọn Khóa Học Từ Danh Mục" để gán khóa học.
              </div>
            ) : (
              coursesList.map((c: string, cIdx: number) => {
                const repoForThisCourse = pairings[c];
                return (
                  <div
                    key={cIdx}
                    className="p-2.5 rounded-xl border border-sky-200 bg-sky-50/60 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <BookOpen className="w-4 h-4 text-sky-600 shrink-0" />
                        <span className="text-xs font-extrabold text-slate-950 truncate">{c}</span>
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

                    {/* Hiển thị Repo của riêng khóa học này */}
                    {repoForThisCourse ? (
                      <div className="flex items-center gap-2 text-[11px] font-mono text-purple-900 bg-purple-100/70 p-1.5 rounded-lg border border-purple-200">
                        <GitBranch className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                        <span className="truncate font-bold">Repo: {repoForThisCourse}</span>
                        <span className="ml-auto text-[9px] font-sans font-black uppercase text-purple-700 bg-purple-200 px-1.5 py-0.2 rounded shrink-0">
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

          {/* TOGGLE THÔNG MINH BẬT/TẮT TỰ ĐỘNG ĐỒNG BỘ GIT REPO */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-bold text-slate-800">
                Tự Động Đồng Bộ Quyền Git Repos Tương Ứng:
              </span>
            </div>

            <button
              type="button"
              disabled={!isEditable}
              onClick={() => handleSaveInput('sync_git_repo', !isSyncGitEnabled)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition cursor-pointer ${isSyncGitEnabled
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-200 text-slate-600'
                }`}
            >
              <span>{isSyncGitEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}</span>
            </button>
          </div>

          {/* BẢNG CHỌN KHÓA HỌC TỪ DATABASE */}
          {showCoursePicker && (
            <div className="p-3 bg-slate-50 border-2 border-sky-400 rounded-xl shadow-md space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 uppercase">
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
                  className="w-full h-9 pl-8 pr-3 text-xs font-bold text-slate-950 bg-white border border-slate-300 rounded-lg outline-none"
                />
              </div>

              <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
                {loadingCourses ? (
                  <div className="p-4 text-center text-xs text-slate-500">Đang tải danh mục môn học...</div>
                ) : filteredDbCourses.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">Không tìm thấy khóa học nào phù hợp.</div>
                ) : (
                  filteredDbCourses.map((c) => (
                    <div
                      key={c.id || c.course_id}
                      onClick={() => handleSelectCourse(c)}
                      className="p-2.5 hover:bg-sky-50 transition cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-950 truncate">
                          {c.course_name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          ID: #{c.course_id} | SKU: {c.sku || 'N/A'}
                        </div>
                      </div>

                      {c.git_repos && Array.isArray(c.git_repos) && c.git_repos.length > 0 && (
                        <span className="shrink-0 text-[10px] font-black text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
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

    // 4. VAI TRÒ LMS
    if (key === 'role') {
      const roleLabel =
        val === 'teacher'
          ? '🧑‍🏫 Giáo viên (Non-editing Teacher)'
          : val === 'manager'
            ? '🛡️ Quản lý (Manager)'
            : '🎓 Học viên (Student)';

      return (
        <div key={key} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-2.5 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Vai Trò Ghi Danh:</span>
            <span className="text-xs font-extrabold text-purple-800 bg-purple-100 px-2.5 py-1 rounded-md border border-purple-300">
              {roleLabel}
            </span>
          </div>

          {isEditable && (
            <select
              value={val || 'teacher'}
              onChange={(e) => handleSaveInput(key, e.target.value)}
              className="text-xs font-bold text-slate-950 bg-white border-2 border-indigo-400 rounded-lg px-2.5 py-1 outline-none cursor-pointer"
            >
              <option value="teacher">Giáo viên (Non-editing Teacher)</option>
              <option value="student">Học viên (Student)</option>
              <option value="manager">Quản lý (Manager)</option>
            </select>
          )}
        </div>
      );
    }

    // 5. ATTACHMENT_URL
    if (key === 'attachment_url') {
      return (
        <div key={key} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-2.5 text-xs flex items-center justify-between">
          <span className="text-slate-500 font-bold">Tệp Đính Kèm COF:</span>
          <span className="text-slate-400 italic">
            {val ? String(val) : '(Không có tệp đính kèm - xử lý từ văn bản)'}
          </span>
        </div>
      );
    }

    // 6. CÁC TRƯỜNG DỮ LIỆU ĐƠN GIẢN (ĐEN ĐẬM CHUẨN MỰC)
    return (
      <div key={key} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
        {isEditing ? (
          <div className="flex items-center gap-2 w-full">
            <span className="font-mono font-extrabold text-slate-950 text-xs shrink-0">
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
              className="flex-1 h-9 px-3 text-xs font-mono font-extrabold text-slate-950 bg-white border-2 border-indigo-500 rounded-lg outline-none shadow-sm"
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
              className="h-9 px-2 bg-slate-200 rounded-lg text-xs cursor-pointer"
            >
              Hủy
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-mono font-bold text-slate-700 text-xs shrink-0">
                {key === 'student_emails' ? 'Tài Khoản Ghi Danh:' : `${key}:`}
              </span>
              <span
                className={`font-mono text-xs px-2.5 py-0.5 rounded-lg break-all font-extrabold ${isBound
                  ? 'text-indigo-900 bg-indigo-50 border border-indigo-300'
                  : 'text-slate-950 bg-slate-50 border border-slate-200'
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
                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
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
        ? 'bg-sky-50/60 border-sky-400 shadow-md ring-2 ring-sky-300/40'
        : step.status === 'failed'
          ? 'bg-rose-50/60 border-rose-300 shadow-sm'
          : step.status === 'success'
            ? 'bg-emerald-50/40 border-emerald-200'
            : 'bg-white dark:bg-slate-900 border-slate-200 shadow-xs hover:border-slate-300'
        }`}
    >
      {/* Header Thẻ Bước */}
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 flex-wrap bg-slate-50/80 rounded-t-2xl border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center text-xs font-black text-slate-950 shrink-0 font-mono">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-950 dark:text-white truncate">
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

            <div className="flex items-center gap-2 text-xs text-slate-600 mt-1 flex-wrap font-mono">
              <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700 border border-slate-200">
                {step.capability_id}
              </span>
              {step.depends_on && step.depends_on.length > 0 && (
                <span className="text-indigo-600 font-bold">
                  ↳ Phụ thuộc: {step.depends_on.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Nút Điều Khiển */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditable && (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
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

      {/* Thân Thẻ Bước */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          <div className="space-y-2 bg-slate-100/70 p-3 rounded-2xl border border-slate-200">
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
              <pre className="p-3 bg-emerald-50 border border-emerald-300 text-xs font-mono font-bold text-emerald-950 max-h-40 overflow-y-auto leading-relaxed">
                {JSON.stringify(step.outputs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};