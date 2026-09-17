// frontend/src/features/studio/components/tabs/workspace/LmsEnrollSection.tsx
import React from 'react';
import {
    GraduationCap,
    Trash2,
    Plus,
    Calendar,
    Users,
    GitBranch,
    UserCheck,
} from 'lucide-react';
import { CourseItem, LmsCourseSelectionItem } from '../../../types';

interface LmsEnrollSectionProps {
    lmsActionType: 'enroll' | 'unenrol';
    setLmsActionType: (val: 'enroll' | 'unenrol') => void;
    lmsSelectedCourses: LmsCourseSelectionItem[];
    setLmsSelectedCourses: React.Dispatch<React.SetStateAction<LmsCourseSelectionItem[]>>;
    lmsCoursesList: CourseItem[];
    lmsCategoriesList: string[];
    onAddLmsCourseRow: () => void;
    onRemoveLmsCourseRow: (idx: number) => void;
    lmsAutoSyncGit: boolean;
    setLmsAutoSyncGit: (val: boolean) => void;
    lmsUnenrolEmails: string;
    setLmsUnenrolEmails: (val: string) => void;
    lmsRoleMode: 'same_role' | 'multi_role';
    setLmsRoleMode: (val: 'same_role' | 'multi_role') => void;
    lmsSingleRole: 'student' | 'non_editing_teacher' | 'manager';
    setLmsSingleRole: (val: 'student' | 'non_editing_teacher' | 'manager') => void;
    lmsBulkSingleEmails: string;
    setLmsBulkSingleEmails: (val: string) => void;
    lmsStudentEmails: string;
    setLmsStudentEmails: (val: string) => void;
    lmsTeacherEmails: string;
    setLmsTeacherEmails: (val: string) => void;
    lmsManagerEmails: string;
    setLmsManagerEmails: (val: string) => void;
}

export const LmsEnrollSection: React.FC<LmsEnrollSectionProps> = ({
    lmsActionType,
    setLmsActionType,
    lmsSelectedCourses,
    setLmsSelectedCourses,
    lmsCoursesList,
    lmsCategoriesList,
    onAddLmsCourseRow,
    onRemoveLmsCourseRow,
    lmsAutoSyncGit,
    setLmsAutoSyncGit,
    lmsUnenrolEmails,
    setLmsUnenrolEmails,
    lmsRoleMode,
    setLmsRoleMode,
    lmsSingleRole,
    setLmsSingleRole,
    lmsBulkSingleEmails,
    setLmsBulkSingleEmails,
    lmsStudentEmails,
    setLmsStudentEmails,
    lmsTeacherEmails,
    setLmsTeacherEmails,
    lmsManagerEmails,
    setLmsManagerEmails,
}) => {
    return (
        <div className="space-y-5 pt-2">
            {/* Thanh Chuyển Đổi Chế Độ: Ghi Danh vs Hủy Ghi Danh */}
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80">
                <button
                    type="button"
                    onClick={() => setLmsActionType('enroll')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${lmsActionType === 'enroll'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <GraduationCap className="w-4 h-4" />
                    <span>1. Ghi Danh & Gia Hạn Khóa Học</span>
                </button>

                <button
                    type="button"
                    onClick={() => setLmsActionType('unenrol')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${lmsActionType === 'unenrol'
                        ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Trash2 className="w-4 h-4" />
                    <span>2. Hủy Ghi Danh</span>
                </button>
            </div>

            <div
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border p-4 ${lmsActionType === 'enroll'
                    ? 'border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-rose-200/70 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20'
                    }`}
            >
                <div className="flex items-center gap-3">
                    <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${lmsActionType === 'enroll'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                            }`}
                    >
                        {lmsActionType === 'enroll' ? <GraduationCap className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                                {lmsActionType === 'enroll'
                                    ? 'Ghi Danh & Đổi Quyền Khóa Học PLearn LMS'
                                    : 'Hủy Ghi Danh Học Viên Khỏi Khóa Học PLearn LMS'}
                            </h3>
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                learn.pythaverse.space
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onAddLmsCourseRow}
                    className={`flex items-center gap-1.5 rounded-xl border bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer self-start sm:self-auto ${lmsActionType === 'enroll'
                        ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50'
                        : 'border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50'
                        }`}
                >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Thêm Khóa Học LMS</span>
                </button>
            </div>

            {/* Danh sách các khóa học LMS cần thực thi */}
            <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 px-1">
                    <span>DANH SÁCH KHÓA HỌC LMS ÁP DỤNG ({lmsSelectedCourses.length} KHÓA):</span>
                </div>

                {lmsSelectedCourses.map((lmsItem, idx) => {
                    const filteredCourses = lmsCoursesList.filter((c) => c.category === lmsItem.category);
                    return (
                        <div
                            key={idx}
                            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3.5"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white font-mono ${lmsActionType === 'enroll' ? 'bg-emerald-600' : 'bg-rose-600'
                                            }`}
                                    >
                                        #{idx + 1}
                                    </span>
                                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                        {lmsItem.course_name}
                                    </span>
                                </div>

                                {lmsSelectedCourses.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveLmsCourseRow(idx)}
                                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                        title="Xóa khóa học này"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500">Phân loại:</label>
                                    <select
                                        value={lmsItem.category}
                                        onChange={(e) => {
                                            const cat = e.target.value;
                                            const match = lmsCoursesList.filter((c) => c.category === cat);
                                            const first = match[0] || lmsCoursesList[0];
                                            const updated = [...lmsSelectedCourses];
                                            updated[idx] = {
                                                ...updated[idx],
                                                category: cat,
                                                course_id: first.course_id,
                                                course_name: first.course_name,
                                            };
                                            setLmsSelectedCourses(updated);
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer"
                                    >
                                        {lmsCategoriesList.map((cat) => (
                                            <option key={cat} value={cat}>
                                                {cat}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="text-[10px] font-bold uppercase text-slate-500">
                                        Chọn môn học ({filteredCourses.length} môn):
                                    </label>
                                    <select
                                        value={lmsItem.course_id}
                                        onChange={(e) => {
                                            const cId = parseInt(e.target.value);
                                            const target = lmsCoursesList.find((c) => c.course_id === cId);
                                            if (target) {
                                                const updated = [...lmsSelectedCourses];
                                                updated[idx] = {
                                                    ...updated[idx],
                                                    course_id: target.course_id,
                                                    course_name: target.course_name,
                                                };
                                                setLmsSelectedCourses(updated);
                                            }
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white truncate cursor-pointer"
                                    >
                                        {filteredCourses.map((c) => (
                                            <option key={c.course_id} value={c.course_id}>
                                                {c.course_name} (ID: {c.course_id})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Các trường Ngày tháng & Group CHỈ HIỂN THỊ khi ở chế độ ENROL */}
                            {lmsActionType === 'enroll' && (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-indigo-500" />
                                            <span>Ngày bắt đầu:</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={lmsItem.start_date}
                                            placeholder="dd-mm-yyyy"
                                            onChange={(e) => {
                                                const updated = [...lmsSelectedCourses];
                                                updated[idx].start_date = e.target.value;
                                                setLmsSelectedCourses(updated);
                                            }}
                                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-emerald-500" />
                                            <span>Ngày hết hạn (Mặc định 1 năm):</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={lmsItem.end_date}
                                            placeholder="dd-mm-yyyy"
                                            onChange={(e) => {
                                                const updated = [...lmsSelectedCourses];
                                                updated[idx].end_date = e.target.value;
                                                setLmsSelectedCourses(updated);
                                            }}
                                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                                            <Users className="w-3 h-3 text-amber-500" />
                                            <span>Tên Group (Tự động check tồn tại):</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={lmsItem.group_name}
                                            placeholder="VD: DEMO_TEACHER_2026"
                                            onChange={(e) => {
                                                const updated = [...lmsSelectedCourses];
                                                updated[idx].group_name = e.target.value;
                                                setLmsSelectedCourses(updated);
                                            }}
                                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* BANNER TỰ ĐỘNG ĐỒNG BỘ GIT REPO */}
            {lmsActionType === 'enroll' && (
                <div className="p-4 rounded-2xl border border-violet-200/80 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-violet-600 text-white shadow-xs">
                                <GitBranch className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <span>Tự Động Đồng Bộ Quyền Pythaverse Git (Single-Session)</span>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300">
                                        git.pythaverse.space
                                    </span>
                                </h4>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Tự động thêm tài khoản vào các Repo tương ứng của khóa học đã chọn (Tự phân loại Giáo viên & Học sinh).
                                </p>
                            </div>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={lmsAutoSyncGit}
                                onChange={(e) => setLmsAutoSyncGit(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                        </label>
                    </div>
                </div>
            )}

            {/* KHU VỰC NHẬP DANH SÁCH EMAIL */}
            {lmsActionType === 'unenrol' ? (
                <div className="rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20 p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                        <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                            <Trash2 className="w-4 h-4" />
                            <span>DANH SÁCH EMAIL CẦN HỦY GHI DANH (MỖI DÒNG 1 EMAIL):</span>
                        </span>
                        <span className="font-mono text-rose-600 dark:text-rose-400">
                            {lmsUnenrolEmails.split(/[\n,;]+/).filter((x) => x.trim().length > 0).length} tài khoản
                        </span>
                    </div>
                    <textarea
                        rows={5}
                        value={lmsUnenrolEmails}
                        onChange={(e) => setLmsUnenrolEmails(e.target.value)}
                        placeholder="student1@pythaverse.space&#10;teacher1@pythaverse.space"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 font-mono text-xs text-slate-900 dark:text-white focus:border-rose-500 focus:outline-hidden leading-relaxed"
                    />
                </div>
            ) : (
                <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                            <UserCheck className="h-4 w-4 text-indigo-600" />
                            <span>Phương Thức Gán Vai Trò:</span>
                        </div>

                        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                            <button
                                type="button"
                                onClick={() => setLmsRoleMode('multi_role')}
                                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${lmsRoleMode === 'multi_role'
                                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400'
                                    }`}
                            >
                                Phân Chia 3 Vai Trò
                            </button>
                            <button
                                type="button"
                                onClick={() => setLmsRoleMode('same_role')}
                                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${lmsRoleMode === 'same_role'
                                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400'
                                    }`}
                            >
                                Cùng Một Vai Trò
                            </button>
                        </div>
                    </div>

                    {lmsRoleMode === 'multi_role' ? (
                        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-3.5 space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                                    <span>🎓 Học Viên (Student):</span>
                                    <span className="font-mono text-indigo-600">
                                        {lmsStudentEmails.split('\n').filter((x) => x.trim().length > 0).length}
                                    </span>
                                </div>
                                <textarea
                                    rows={4}
                                    value={lmsStudentEmails}
                                    onChange={(e) => setLmsStudentEmails(e.target.value)}
                                    placeholder="student1@pythaverse.space&#10;student2@pythaverse.space"
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-3.5 space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                                    <span>🧑‍🏫 Giáo Viên (Non-editing Teacher):</span>
                                    <span className="font-mono text-amber-600">
                                        {lmsTeacherEmails.split('\n').filter((x) => x.trim().length > 0).length}
                                    </span>
                                </div>
                                <textarea
                                    rows={4}
                                    value={lmsTeacherEmails}
                                    onChange={(e) => setLmsTeacherEmails(e.target.value)}
                                    placeholder="teacher1@pythaverse.space&#10;teacher2@pythaverse.space"
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-3.5 space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                                    <span>🛡️ Quản Lý (Manager):</span>
                                    <span className="font-mono text-emerald-600">
                                        {lmsManagerEmails.split('\n').filter((x) => x.trim().length > 0).length}
                                    </span>
                                </div>
                                <textarea
                                    rows={4}
                                    value={lmsManagerEmails}
                                    onChange={(e) => setLmsManagerEmails(e.target.value)}
                                    placeholder="manager1@pythaverse.space"
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400">
                                    Chọn vai trò áp dụng:
                                </label>
                                <select
                                    value={lmsSingleRole}
                                    onChange={(e) => setLmsSingleRole(e.target.value as any)}
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white cursor-pointer"
                                >
                                    <option value="student">🎓 Học Viên (Student)</option>
                                    <option value="non_editing_teacher">🧑‍🏫 Giáo Viên (Non-editing Teacher)</option>
                                    <option value="manager">🛡️ Quản Lý (Manager)</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    <span>DANH SÁCH EMAIL (MỖI DÒNG 1 EMAIL):</span>
                                    <span className="font-mono text-[11px] text-indigo-600">
                                        {lmsBulkSingleEmails.split('\n').filter((x) => x.trim().length > 0).length} emails
                                    </span>
                                </div>
                                <textarea
                                    rows={4}
                                    value={lmsBulkSingleEmails}
                                    onChange={(e) => setLmsBulkSingleEmails(e.target.value)}
                                    placeholder="user1@pythaverse.space&#10;user2@pythaverse.space"
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};