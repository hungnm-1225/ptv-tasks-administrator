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
    Sparkles
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
    const [workspaceSubFlow, setWorkspaceSubFlow] = useState<'end_to_end' | 'order_contract' | 'bulk_accounts' | 'lms_enroll'>('end_to_end');

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
            end_date: '31-05-2027'
        }
    ]);

    const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
    const [isSchoolDropdownOpen, setIsSchoolDropdownOpen] = useState<boolean>(false);
    const schoolDropdownRef = useRef<HTMLDivElement | null>(null);

    const [payloadText, setPayloadText] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);

    useEffect(() => {
        const loadMetadata = async () => {
            try {
                const [schools, cats, courses] = await Promise.all([
                    fetchApi<HierarchySchoolItem[]>('/workspace/hierarchy-schools'),
                    fetchApi<string[]>('/workspace/categories'),
                    fetchApi<CourseItem[]>('/workspace/courses')
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

    // Đồng bộ payload
    useEffect(() => {
        let payload: Record<string, any> = {
            is_manual_dispatch: true,
            creator: 'Admin Studio'
        };

        if (selectedBotType === 'workspace_rpa') {
            payload = {
                action: workspaceSubFlow === 'end_to_end' ? 'pipeline_end_to_end' : workspaceSubFlow === 'order_contract' ? 'create_order_and_contracts' : workspaceSubFlow === 'bulk_accounts' ? 'bulk_account_creation' : 'school_enroll_users',
                school_name: selectedSchool?.school_name || 'Pythaverse School Demo',
                hierarchy: {
                    school_name: selectedSchool?.school_name,
                    school_code: selectedSchool?.school_code,
                    partner_name: selectedSchool?.partner_name,
                    distributor_name: selectedSchool?.distributor_name
                },
                courses: selectedCourses.map((c) => ({
                    category: c.category,
                    course_id: c.course_id,
                    course_name: c.course_name,
                    licenses: c.licenses,
                    start_date: c.start_date,
                    end_date: c.end_date
                }))
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
                row_index: rowIndex
            };
        } else if (selectedBotType === 'github_issue_creator') {
            payload = {
                action: 'create_github_issue',
                title: githubTitle,
                assignees: [githubAssignee]
            };
        }

        setPayloadText(JSON.stringify(payload, null, 2));
    }, [selectedBotType, workspaceSubFlow, selectedSchool, selectedCourses, kcTargetEmail, kcEnableResetPass, kcTempPass, kcForceChange, kcEnableVerify, kcVerifyAction, kcEnableStatus, kcStatusAction, docUrl, assigneeEmail, rowIndex, githubTitle, githubAssignee]);

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
                    payload_data: parsedPayload
                })
            });

            toast.success(
                <div className="space-y-1">
                    <div className="font-bold">Đã đưa tác vụ vào hàng đợi!</div>
                    <button onClick={() => navigate('/tasks')} className="text-violet-400 underline text-xs font-semibold cursor-pointer">
                        Xem tại Task & Approval Hub ➔
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
        <div className="space-y-6 max-w-5xl">
            <div>
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300 rounded-xl">
                        <Zap className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                            Automation Studio & Direct Dispatcher
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Khởi tạo và chạy các luồng tự động hóa độc lập mà không cần qua Ticket Inbox.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Cột trái: Form điều khiển */}
                <div className="lg:col-span-7 space-y-5 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs">
                    {/* Nhóm Bot */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            1. Chọn Cỗ Máy Bot Cần Chạy:
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                                { id: 'workspace_rpa', label: 'Workspace RPA', icon: Building2 },
                                { id: 'keycloak_api', label: 'Keycloak IDP', icon: KeyRound },
                                { id: 'feedback_doc_triage', label: 'Feedback Sheet', icon: FileText },
                                { id: 'github_issue_creator', label: 'GitHub Issue', icon: Github },
                            ].map((tab) => {
                                const Icon = tab.icon;
                                const isSel = selectedBotType === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setSelectedBotType(tab.id as any)}
                                        className={`flex items-center gap-2 p-3 rounded-2xl border text-xs font-semibold transition cursor-pointer ${isSel
                                            ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Form chi tiết theo Bot */}
                    {selectedBotType === 'workspace_rpa' && (
                        <div className="space-y-4 p-4 rounded-2xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/70 dark:border-violet-800/40">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-violet-100/60 dark:bg-violet-900/40 p-1.5 rounded-xl text-[11px] font-medium">
                                {[
                                    { id: 'end_to_end', label: 'Trọn Gói 3-in-1' },
                                    { id: 'order_contract', label: 'Tạo Order & Phả Hệ' },
                                    { id: 'bulk_accounts', label: 'Tạo User Hàng Loạt' },
                                    { id: 'lms_enroll', label: 'Ghi Danh LMS' },
                                ].map((sub) => (
                                    <button
                                        key={sub.id}
                                        type="button"
                                        onClick={() => setWorkspaceSubFlow(sub.id as any)}
                                        className={`py-1.5 px-2 rounded-lg text-center transition cursor-pointer ${workspaceSubFlow === sub.id
                                            ? 'bg-white dark:bg-slate-800 font-bold text-violet-700 dark:text-violet-300 shadow-2xs'
                                            : 'text-slate-600 dark:text-slate-400'
                                            }`}
                                    >
                                        {sub.label}
                                    </button>
                                ))}
                            </div>

                            {/* Trường */}
                            <div className="space-y-1.5 relative" ref={schoolDropdownRef}>
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Trường Học:</label>
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
                                        className="w-full pl-9 pr-4 bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700 rounded-xl p-2.5 text-xs outline-none"
                                    />
                                </div>

                                {isSchoolDropdownOpen && (
                                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-52 overflow-y-auto p-1.5 space-y-1">
                                        {schoolsList
                                            .filter((s) => s.school_name.toLowerCase().includes(schoolSearchQuery.toLowerCase()))
                                            .slice(0, 20)
                                            .map((s) => (
                                                <button
                                                    key={s.school_code}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedSchool(s);
                                                        setSchoolSearchQuery(`${s.school_name} (${s.school_code})`);
                                                        setIsSchoolDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl text-xs hover:bg-violet-50 dark:hover:bg-slate-700 flex items-center justify-between cursor-pointer"
                                                >
                                                    <div>
                                                        <div className="font-semibold text-slate-800 dark:text-slate-200">{s.school_name}</div>
                                                        <div className="text-[10px] text-slate-400 font-mono">Partner: {s.partner_name}</div>
                                                    </div>
                                                    {selectedSchool?.school_code === s.school_code && <Check className="w-4 h-4 text-violet-600" />}
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Keycloak Identity Controls */}
                    {selectedBotType === 'keycloak_api' && (
                        <div className="space-y-3.5 p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
                            <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Email hoặc Username Cần Xử Lý:</label>
                                <input
                                    type="text"
                                    value={kcTargetEmail}
                                    onChange={(e) => setKcTargetEmail(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl p-2.5 text-xs font-semibold outline-none"
                                />
                            </div>

                            {/* 3 Switches */}
                            <div className="space-y-2 pt-1">
                                <div className={`p-3 rounded-xl border transition ${kcEnableResetPass ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs' : 'bg-slate-50 opacity-70'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">1. Đổi Mật Khẩu Tạm Thời</span>
                                        <input type="checkbox" checked={kcEnableResetPass} onChange={(e) => setKcEnableResetPass(e.target.checked)} className="w-4 h-4 accent-amber-600 cursor-pointer" />
                                    </div>
                                    {kcEnableResetPass && (
                                        <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
                                            <input type="text" value={kcTempPass} onChange={(e) => setKcTempPass(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border rounded-lg p-1.5 text-xs font-mono font-bold" />
                                        </div>
                                    )}
                                </div>

                                <div className={`p-3 rounded-xl border transition ${kcEnableVerify ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs' : 'bg-slate-50 opacity-70'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">2. Xác Thực Email (Verified)</span>
                                        <input type="checkbox" checked={kcEnableVerify} onChange={(e) => setKcEnableVerify(e.target.checked)} className="w-4 h-4 accent-amber-600 cursor-pointer" />
                                    </div>
                                </div>

                                <div className={`p-3 rounded-xl border transition ${kcEnableStatus ? 'bg-white dark:bg-slate-800 border-amber-400 shadow-2xs' : 'bg-slate-50 opacity-70'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">3. Khóa / Mở Khóa Tài Khoản</span>
                                        <input type="checkbox" checked={kcEnableStatus} onChange={(e) => setKcEnableStatus(e.target.checked)} className="w-4 h-4 accent-amber-600 cursor-pointer" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Cột phải: Live JSON & Dispatch */}
                <div className="lg:col-span-5 space-y-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs flex flex-col justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Live JSON Payload:</span>
                            <span className="text-[10px] text-slate-400">Tự động cấu trúc</span>
                        </div>
                        <textarea
                            rows={12}
                            value={payloadText}
                            onChange={(e) => setPayloadText(e.target.value)}
                            className="w-full bg-slate-900 text-violet-300 font-mono text-xs p-3.5 rounded-2xl outline-none leading-relaxed border border-slate-800"
                        />
                    </div>

                    <button
                        type="button"
                        disabled={submitting}
                        onClick={handleSubmitStudioTask}
                        className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span>Đưa Vào Hàng Đợi Phê Duyệt</span>
                    </button>
                </div>
            </div>
        </div>
    );
};