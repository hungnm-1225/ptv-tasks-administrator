// frontend/src/features/studio/AutomationStudioPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  Building2,
  KeyRound,
  FileText,
  Github,
  BookOpen,
  Search,
  Check,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  UserX,
  Layers,
  ArrowRight,
  Sparkles,
  Copy,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { BotType } from '../../types';
import { toast } from 'sonner';

interface HierarchySchoolItem {
  school_id: string;
  school_code: string;
  school_name: string;
  partner_name: string;
  distributor_name: string;
  full_lineage: string;
}

interface CourseItem {
  course_id: number;
  category: string;
  course_name: string;
  lms_url: string;
}

interface OrderCourseSelection {
  category: string;
  course_id: number;
  course_name: string;
  lms_url: string;
  licenses: number;
  start_date: string;
  end_date: string;
}

export const AutomationStudioPage: React.FC = () => {
  const navigate = useNavigate();

  const [selectedBotType, setSelectedBotType] = useState<BotType>('workspace_rpa');
  const [workspaceSubFlow, setWorkspaceSubFlow] = useState<
    'end_to_end' | 'order_contract' | 'bulk_accounts' | 'lms_enroll'
  >('end_to_end');

  // Keycloak Safe Controls
  const [kcTargetEmail, setKcTargetEmail] = useState<string>('teacher.demo@pythaverse.space');
  const [kcEnableResetPass, setKcEnableResetPass] = useState<boolean>(true);
  const [kcTempPass, setKcTempPass] = useState<string>('Ptv@2026');
  const [kcForceChange, setKcForceChange] = useState<boolean>(true);
  const [kcEnableVerify, setKcEnableVerify] = useState<boolean>(false);
  const [kcVerifyAction, setKcVerifyAction] = useState<'verify' | 'unverify'>('verify');
  const [kcEnableStatus, setKcEnableStatus] = useState<boolean>(false);
  const [kcStatusAction, setKcStatusAction] = useState<'enable' | 'disable'>('enable');

  // Sheets & Docs triage
  const [docUrl, setDocUrl] = useState<string>('');
  const [assigneeEmail, setAssigneeEmail] = useState<string>('hung.nguyenmanh@dtt.vn');
  const [rowIndex, setRowIndex] = useState<number>(2);

  // GitHub Issue
  const [githubTitle, setGithubTitle] = useState<string>('[FEAT] Tạo luồng tự động mới cho hệ thống');
  const [githubAssignee, setGithubAssignee] = useState<string>('nguyenthetrung5-PTV');

  // Phả hệ & Khóa học
  const [schoolsList, setSchoolsList] = useState<HierarchySchoolItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>(['SWRP', 'IR', 'ASP', 'Other']);
  const [coursesList, setCoursesList] = useState<CourseItem[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<HierarchySchoolItem | null>(null);

  const [selectedCourses, setSelectedCourses] = useState<OrderCourseSelection[]>([
    {
      category: 'SWRP',
      course_id: 654,
      course_name: 'SWRP 9: LEANBOT Programming Applications with IoT [V2] (EN)',
      lms_url: 'https://learn.pythaverse.space/course/view.php?id=654',
      licenses: 50,
      start_date: '01-09-2026',
      end_date: '31-05-2027',
    },
  ]);

  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const [isSchoolDropdownOpen, setIsSchoolDropdownOpen] = useState<boolean>(false);
  const schoolDropdownRef = useRef<HTMLDivElement | null>(null);

  const [payloadText, setPayloadText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [schools, cats, courses] = await Promise.all([
          fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools'),
          fetchApi<string[]>('/workspace/categories'),
          fetchApi<CourseItem[]>('/workspace/courses'),
        ]);
        setSchoolsList(schools || []);
        if (schools && schools.length > 0) {
          setSelectedSchool(schools[0]);
          setSchoolSearchQuery(`${schools[0].school_name} (${schools[0].school_code})`);
        }
        if (cats && cats.length > 0) setCategoriesList(cats);
        setCoursesList(courses || []);
      } catch (e) {
        console.warn('Lỗi nạp metadata:', e);
      }
    };
    loadMetadata();
  }, []);

  // Close school dropdown outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (schoolDropdownRef.current && !schoolDropdownRef.current.contains(event.target as Node)) {
        setIsSchoolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Đồng bộ payload JSON
  useEffect(() => {
    let payload: Record<string, any> = {
      is_manual_dispatch: true,
      creator: 'Admin Studio',
    };

    if (selectedBotType === 'workspace_rpa') {
      payload = {
        action:
          workspaceSubFlow === 'end_to_end'
            ? 'pipeline_end_to_end'
            : workspaceSubFlow === 'order_contract'
            ? 'create_order_and_contracts'
            : workspaceSubFlow === 'bulk_accounts'
            ? 'bulk_account_creation'
            : 'school_enroll_users',
        school_name: selectedSchool?.school_name || 'Pythaverse School Demo',
        hierarchy: {
          school_name: selectedSchool?.school_name,
          school_code: selectedSchool?.school_code,
          partner_name: selectedSchool?.partner_name,
          distributor_name: selectedSchool?.distributor_name,
        },
        courses: selectedCourses.map((c) => ({
          category: c.category,
          course_id: c.course_id,
          course_name: c.course_name,
          licenses: c.licenses,
          start_date: c.start_date,
          end_date: c.end_date,
        })),
      };
    } else if (selectedBotType === 'keycloak_api') {
      const actions: string[] = [];
      const conf: Record<string, any> = { target_email: kcTargetEmail };
      if (kcEnableResetPass) {
        actions.push('reset_password');
        conf.temporary_password = kcTempPass;
        conf.force_change_on_first_login = kcForceChange;
      }
      if (kcEnableVerify) actions.push(kcVerifyAction === 'verify' ? 'mark_email_verified' : 'mark_email_unverified');
      if (kcEnableStatus) actions.push(kcStatusAction === 'enable' ? 'enable_account' : 'disable_account');

      conf.actions = actions.length > 0 ? actions : ['noop_preview'];
      payload = conf;
    } else if (selectedBotType === 'feedback_doc_triage') {
      payload = {
        action: 'comment_and_assign',
        doc_url: docUrl,
        assignee_email: assigneeEmail,
        row_index: rowIndex,
      };
    } else if (selectedBotType === 'github_issue_creator') {
      payload = {
        action: 'create_github_issue',
        title: githubTitle,
        assignees: [githubAssignee],
      };
    }

    setPayloadText(JSON.stringify(payload, null, 2));
  }, [
    selectedBotType,
    workspaceSubFlow,
    selectedSchool,
    selectedCourses,
    kcTargetEmail,
    kcEnableResetPass,
    kcTempPass,
    kcForceChange,
    kcEnableVerify,
    kcVerifyAction,
    kcEnableStatus,
    kcStatusAction,
    docUrl,
    assigneeEmail,
    rowIndex,
    githubTitle,
    githubAssignee,
  ]);

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(payloadText);
    setCopiedPayload(true);
    toast.success('Đã sao chép JSON Payload!');
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleAddCourseRow = () => {
    const defaultCourse =
      coursesList.find((c) => c.category === 'SWRP') ||
      coursesList[0] || {
        course_id: 766,
        category: 'SWRP',
        course_name: 'SWRP 1: Exploring the Miniature World with PMinetest (EN)',
        lms_url: 'https://learn.pythaverse.space/course/view.php?id=766',
      };

    setSelectedCourses([
      ...selectedCourses,
      {
        category: defaultCourse.category,
        course_id: defaultCourse.course_id,
        course_name: defaultCourse.course_name,
        lms_url: defaultCourse.lms_url,
        licenses: 50,
        start_date: '01-09-2026',
        end_date: '31-05-2027',
      },
    ]);
  };

  const handleRemoveCourseRow = (index: number) => {
    if (selectedCourses.length <= 1) {
      toast.error('Cần ít nhất 1 khóa học trong danh sách!');
      return;
    }
    setSelectedCourses(selectedCourses.filter((_, idx) => idx !== index));
  };

  const handleSubmitStudioTask = async () => {
    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch {
      toast.error('Cú pháp JSON không hợp lệ!');
      return;
    }

    setSubmitting(true);
    try {
      await fetchApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: null,
          bot_type: selectedBotType,
          payload_data: parsedPayload,
        }),
      });

      toast.success(
        <div className="space-y-1">
          <div className="font-bold">Đã đưa tác vụ vào hàng đợi phê duyệt!</div>
          <button
            onClick={() => navigate('/tasks')}
            className="text-violet-400 underline text-xs font-semibold cursor-pointer"
          >
            Mở Task & Approval Hub để duyệt ➔
          </button>
        </div>
      );
    } catch (err) {
      toast.error('Lỗi dispatch tác vụ: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl shadow-md shadow-violet-500/20">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Automation Studio
              </h2>
              <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300 uppercase tracking-wider">
                Direct Engine
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Khởi tạo và điều phối các chuỗi tác vụ tự động hóa trực tiếp độc lập mà không phụ thuộc Ticket Inbox.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-xs transition"
        >
          <span>Xem Task Hub</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6 bg-white dark:bg-slate-900 p-5 sm:p-7 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          {/* Step 1: Select Bot Engine */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300 flex items-center justify-center text-[10px] font-extrabold">
                  1
                </span>
                <span>Chọn Cỗ Máy Tự Động Hóa:</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'workspace_rpa', label: 'Workspace RPA', icon: Building2, desc: 'Order & Phả Hệ' },
                { id: 'keycloak_api', label: 'Keycloak IDP', icon: KeyRound, desc: 'Quản trị User' },
                { id: 'feedback_doc_triage', label: 'Feedback Sheet', icon: FileText, desc: 'Google Doc Tag' },
                { id: 'github_issue_creator', label: 'GitHub Issue', icon: Github, desc: 'Tạo Bug Issue' },
              ].map((tab) => {
                const Icon = tab.icon;
                const isSel = selectedBotType === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedBotType(tab.id as any)}
                    className={`flex flex-col items-start gap-1 p-3.5 rounded-2xl border text-left transition-all duration-150 cursor-pointer ${
                      isSel
                        ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white border-transparent shadow-md shadow-violet-500/25'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isSel ? 'text-white' : 'text-violet-600 dark:text-violet-400'}`} />
                    <span className="text-xs font-bold mt-1">{tab.label}</span>
                    <span className={`text-[10px] ${isSel ? 'text-violet-100' : 'text-slate-400'}`}>
                      {tab.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Sub Configuration per Bot Engine */}
          {selectedBotType === 'workspace_rpa' && (
            <div className="space-y-5 p-5 rounded-2xl bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/70 dark:border-violet-800/40">
              {/* 4 Chế độ phụ */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-violet-600" />
                  <span>Chọn Phân Luồng Nghiệp Vụ:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-violet-100/60 dark:bg-violet-900/40 p-1.5 rounded-xl text-xs font-medium">
                  {[
                    { id: 'end_to_end', label: 'Trọn Gói 3-in-1' },
                    { id: 'order_contract', label: 'Tạo Order & Contract' },
                    { id: 'bulk_accounts', label: 'Tạo Tài Khoản' },
                    { id: 'lms_enroll', label: 'Ghi Danh LMS' },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setWorkspaceSubFlow(sub.id as any)}
                      className={`py-2 px-2.5 rounded-lg text-center transition-all cursor-pointer ${
                        workspaceSubFlow === sub.id
                          ? 'bg-white dark:bg-slate-800 font-bold text-violet-700 dark:text-violet-300 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trường Học Selector */}
              <div className="space-y-1.5 relative" ref={schoolDropdownRef}>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-violet-600" />
                    <span>Trường Học Áp Dụng (Trong 480 Trường Phả Hệ):</span>
                  </span>
                  <span className="text-[10px] text-violet-600 font-semibold font-mono">
                    {selectedSchool?.school_code || ''}
                  </span>
                </label>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={schoolSearchQuery}
                    onFocus={() => setIsSchoolDropdownOpen(true)}
                    onChange={(e) => {
                      setSchoolSearchQuery(e.target.value);
                      setIsSchoolDropdownOpen(true);
                    }}
                    placeholder="Tìm theo tên hoặc mã SCH_..."
                    className="w-full pl-9 pr-4 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700/80 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition shadow-2xs"
                  />
                </div>

                {isSchoolDropdownOpen && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1">
                    {schoolsList
                      .filter((s) => s.school_name.toLowerCase().includes(schoolSearchQuery.toLowerCase()))
                      .slice(0, 25)
                      .map((s) => (
                        <button
                          key={s.school_code}
                          type="button"
                          onClick={() => {
                            setSelectedSchool(s);
                            setSchoolSearchQuery(`${s.school_name} (${s.school_code})`);
                            setIsSchoolDropdownOpen(false);
                          }}
                          className="w-full text-left p-2.5 rounded-xl text-xs hover:bg-violet-50 dark:hover:bg-slate-700/60 flex items-center justify-between cursor-pointer transition"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{s.school_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Mã: {s.school_code} | Partner: {s.partner_name}
                            </div>
                          </div>
                          {selectedSchool?.school_code === s.school_code && (
                            <Check className="w-4 h-4 text-violet-600" />
                          )}
                        </button>
                      ))}
                  </div>
                )}

                {selectedSchool && (
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-violet-200/80 dark:border-violet-800/50 text-[11px] font-mono text-violet-700 dark:text-violet-300 flex items-center gap-2 shadow-2xs">
                    <Layers className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                    <span className="truncate">{selectedSchool.full_lineage}</span>
                  </div>
                )}
              </div>

              {/* Danh Sách Khóa Học */}
              <div className="space-y-3 pt-3 border-t border-violet-200/60 dark:border-violet-800/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                    <span>Danh Sách Khóa Học Cấp Phép ({selectedCourses.length} Môn):</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleAddCourseRow}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 rounded-xl font-bold hover:bg-sky-100 cursor-pointer shadow-2xs transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm Môn Học</span>
                  </button>
                </div>

                {selectedCourses.map((cRow, idx) => {
                  const filteredCoursesForCategory = coursesList.filter((c) => c.category === cRow.category);
                  return (
                    <div
                      key={idx}
                      className="p-4 bg-white dark:bg-slate-800/90 rounded-2xl border border-violet-200/80 dark:border-slate-700 space-y-3 relative shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                        <span>Khóa học #{idx + 1}</span>
                        {selectedCourses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCourseRow(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Phân loại:</label>
                          <select
                            value={cRow.category}
                            onChange={(e) => {
                              const cat = e.target.value;
                              const match = coursesList.filter((c) => c.category === cat);
                              const first = match[0] || coursesList[0];
                              const updated = [...selectedCourses];
                              updated[idx] = {
                                ...updated[idx],
                                category: cat,
                                course_id: first.course_id,
                                course_name: first.course_name,
                                lms_url: first.lms_url,
                              };
                              setSelectedCourses(updated);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold cursor-pointer outline-none"
                          >
                            {categoriesList.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Chọn môn học ({filteredCoursesForCategory.length} môn):
                          </label>
                          <select
                            value={cRow.course_id}
                            onChange={(e) => {
                              const cId = parseInt(e.target.value);
                              const target = coursesList.find((c) => c.course_id === cId);
                              if (target) {
                                const updated = [...selectedCourses];
                                updated[idx] = {
                                  ...updated[idx],
                                  course_id: target.course_id,
                                  course_name: target.course_name,
                                  lms_url: target.lms_url,
                                };
                                setSelectedCourses(updated);
                              }
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold cursor-pointer outline-none truncate"
                          >
                            {filteredCoursesForCategory.map((c) => (
                              <option key={c.course_id} value={c.course_id}>
                                {c.course_name} (ID: {c.course_id})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Licenses:</label>
                          <input
                            type="number"
                            value={cRow.licenses}
                            min={1}
                            onChange={(e) => {
                              const updated = [...selectedCourses];
                              updated[idx].licenses = parseInt(e.target.value) || 1;
                              setSelectedCourses(updated);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-bold outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Start Date:</label>
                          <input
                            type="text"
                            value={cRow.start_date}
                            placeholder="dd-mm-yyyy"
                            onChange={(e) => {
                              const updated = [...selectedCourses];
                              updated[idx].start_date = e.target.value;
                              setSelectedCourses(updated);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">End Date:</label>
                          <input
                            type="text"
                            value={cRow.end_date}
                            placeholder="dd-mm-yyyy"
                            onChange={(e) => {
                              const updated = [...selectedCourses];
                              updated[idx].end_date = e.target.value;
                              setSelectedCourses(updated);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Keycloak Identity Controls */}
          {selectedBotType === 'keycloak_api' && (
            <div className="space-y-4 p-5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>Quản Trị Danh Tính Keycloak (Safe-by-Default):</span>
                </label>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-bold">
                  Bảo vệ 3 lớp
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Email hoặc Username Cần Xử Lý:
                </label>
                <input
                  type="text"
                  value={kcTargetEmail}
                  onChange={(e) => setKcTargetEmail(e.target.value)}
                  placeholder="VD: teacher@pythaverse.space"
                  className="w-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/80 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {/* 3 Custom Styled Interactive Toggle Cards */}
              <div className="space-y-3 pt-1">
                {/* 1. Reset Pass */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${
                    kcEnableResetPass
                      ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-2 rounded-xl ${
                          kcEnableResetPass
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                            : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                        }`}
                      >
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          1. Đặt Lại Mật Khẩu Tạm Thời
                        </div>
                        <div className="text-[10px] text-slate-400">Gán mật khẩu khởi tạo an toàn</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setKcEnableResetPass(!kcEnableResetPass)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                        kcEnableResetPass ? 'bg-amber-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                    </button>
                  </div>

                  {kcEnableResetPass && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 mt-3 border-t border-slate-100 dark:border-slate-700">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Mật khẩu mới:</label>
                        <input
                          type="text"
                          value={kcTempPass}
                          onChange={(e) => setKcTempPass(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono font-bold outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-4">
                        <button
                          type="button"
                          onClick={() => setKcForceChange(!kcForceChange)}
                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition ${
                            kcForceChange
                              ? 'bg-amber-500 border-amber-500 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {kcForceChange && <Check className="w-3 h-3" />}
                        </button>
                        <label
                          onClick={() => setKcForceChange(!kcForceChange)}
                          className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          Bắt buộc đổi khi đăng nhập
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Email Verified */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${
                    kcEnableVerify
                      ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-2 rounded-xl ${
                          kcEnableVerify
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          2. Xác Thực Email (Email Verified)
                        </div>
                        <div className="text-[10px] text-slate-400">Gỡ lỗi tài khoản chưa xác thực email</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setKcEnableVerify(!kcEnableVerify)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                        kcEnableVerify ? 'bg-amber-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                    </button>
                  </div>

                  {kcEnableVerify && (
                    <div className="flex items-center gap-3 pt-3 mt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                      <button
                        type="button"
                        onClick={() => setKcVerifyAction('verify')}
                        className={`flex-1 py-1.5 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                          kcVerifyAction === 'verify'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        ✓ Đã Xác Thực (Verified)
                      </button>
                      <button
                        type="button"
                        onClick={() => setKcVerifyAction('unverify')}
                        className={`flex-1 py-1.5 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                          kcVerifyAction === 'unverify'
                            ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        ✗ Gỡ Xác Thực
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Account Status */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${
                    kcEnableStatus
                      ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-2 rounded-xl ${
                          kcEnableStatus
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'
                            : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                        }`}
                      >
                        <UserX className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          3. Trạng Thái Hoạt Động
                        </div>
                        <div className="text-[10px] text-slate-400">Khóa hoặc kích hoạt lại người dùng</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setKcEnableStatus(!kcEnableStatus)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                        kcEnableStatus ? 'bg-amber-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                    </button>
                  </div>

                  {kcEnableStatus && (
                    <div className="flex items-center gap-3 pt-3 mt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                      <button
                        type="button"
                        onClick={() => setKcStatusAction('enable')}
                        className={`flex-1 py-1.5 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                          kcStatusAction === 'enable'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        ✓ Kích Hoạt (Enable)
                      </button>
                      <button
                        type="button"
                        onClick={() => setKcStatusAction('disable')}
                        className={`flex-1 py-1.5 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                          kcStatusAction === 'disable'
                            ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        ✗ Vô Hiệu Hóa (Disable)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Feedback Doc Triage */}
          {selectedBotType === 'feedback_doc_triage' && (
            <div className="space-y-3 p-5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-800/40">
              <label className="text-xs font-bold text-blue-900 dark:text-blue-300">
                Đường dẫn Google Doc & Email Phân Công:
              </label>
              <input
                type="text"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://docs.google.com/document/d/..."
                className="w-full bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-xl p-2.5 text-xs outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="email"
                  value={assigneeEmail}
                  onChange={(e) => setAssigneeEmail(e.target.value)}
                  placeholder="Email người phụ trách"
                  className="bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-xl p-2 text-xs outline-none"
                />
                <input
                  type="number"
                  value={rowIndex}
                  onChange={(e) => setRowIndex(parseInt(e.target.value) || 2)}
                  placeholder="Dòng trong Sheet"
                  className="bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-xl p-2 text-xs outline-none font-mono font-bold"
                />
              </div>
            </div>
          )}

          {/* GitHub Issue */}
          {selectedBotType === 'github_issue_creator' && (
            <div className="space-y-3 p-5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Tiêu Đề Issue GitHub:</label>
              <input
                type="text"
                value={githubTitle}
                onChange={(e) => setGithubTitle(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl p-2.5 text-xs font-bold outline-none"
              />
              <input
                type="text"
                value={githubAssignee}
                onChange={(e) => setGithubAssignee(e.target.value)}
                placeholder="Assignee GitHub username"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl p-2 text-xs font-mono outline-none"
              />
            </div>
          )}
        </div>

        {/* Right Column: Live JSON Preview & Dispatch (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-white dark:bg-slate-900 p-5 sm:p-7 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                <span>Live Payload JSON:</span>
              </span>

              <button
                type="button"
                onClick={handleCopyPayload}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                {copiedPayload ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPayload ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>

            <textarea
              rows={14}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="w-full bg-slate-950 text-violet-300 font-mono text-xs p-4 rounded-2xl outline-none leading-relaxed border border-slate-800 focus:border-violet-500 shadow-inner"
            />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmitStudioTask}
            className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>Đưa Vào Hàng Đợi Phê Duyệt Ngay</span>
          </button>
        </div>
      </div>
    </div>
  );
};