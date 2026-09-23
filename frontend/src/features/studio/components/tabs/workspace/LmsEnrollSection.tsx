// frontend/src/features/studio/components/tabs/workspace/LmsEnrollSection.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    GraduationCap,
    Trash2,
    Plus,
    Calendar,
    Users,
    GitBranch,
    UserCheck,
    Search,
    ChevronsUpDown,
    Check,
    AlertCircle,
    X,
} from 'lucide-react';
import { CourseItem, LmsCourseSelectionItem } from '../../../types';
import { toast } from 'sonner';

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

// =========================================================================
// 🎯 SUB-COMPONENT: COMBOBOX TÌM KIẾM KHÓA HỌC XUYÊN PHÂN LOẠI
// =========================================================================
interface CourseComboboxProps {
    currentCourseId: number;
    currentCategory: string;
    allCourses: CourseItem[];
    otherSelectedIds: Set<number>;
    onSelectCourse: (course: CourseItem) => void;
}

const CourseCombobox: React.FC<CourseComboboxProps> = ({
    currentCourseId,
    currentCategory,
    allCourses,
    otherSelectedIds,
    onSelectCourse,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Đóng dropdown khi click ra ngoài
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Tự động focus ô tìm kiếm khi mở popup
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const activeCourse = useMemo(
        () => allCourses.find((c) => c.course_id === currentCourseId),
        [allCourses, currentCourseId]
    );

    // Lọc theo từ khóa tìm kiếm (tên khóa học, ID, hoặc phân loại)
    const filteredList = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return allCourses;
        return allCourses.filter(
            (c) =>
                c.course_name.toLowerCase().includes(term) ||
                String(c.course_id).includes(term) ||
                c.category.toLowerCase().includes(term)
        );
    }, [allCourses, searchTerm]);

    // Nhóm 1: Các khóa học cùng Phân loại hiện tại
    const sameCategoryCourses = useMemo(() => {
        const list = filteredList.filter((c) => c.category === currentCategory);
        // Sắp xếp: Khóa khả dụng lên trước, khóa đã chọn xuống sau
        return list.sort((a, b) => {
            const aSelected = otherSelectedIds.has(a.course_id);
            const bSelected = otherSelectedIds.has(b.course_id);
            if (aSelected === bSelected) return a.course_name.localeCompare(b.course_name);
            return aSelected ? 1 : -1;
        });
    }, [filteredList, currentCategory, otherSelectedIds]);

    // Nhóm 2: Các khóa học thuộc Phân loại khác (Xuyên phân loại)
    const otherCategoryCourses = useMemo(() => {
        const list = filteredList.filter((c) => c.category !== currentCategory);
        return list.sort((a, b) => {
            const aSelected = otherSelectedIds.has(a.course_id);
            const bSelected = otherSelectedIds.has(b.course_id);
            if (aSelected === bSelected) return a.course_name.localeCompare(b.course_name);
            return aSelected ? 1 : -1;
        });
    }, [filteredList, currentCategory, otherSelectedIds]);

    return (
        <div className="relative mt-1 w-full" ref={containerRef}>
            {/* Nút hiển thị giá trị hiện tại */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-slate-900 dark:text-white hover:border-indigo-400 dark:hover:border-indigo-600 transition shadow-2xs cursor-pointer"
            >
                <div className="flex items-center gap-2 truncate">
                    <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50">
                        {activeCourse?.category || currentCategory}
                    </span>
                    <span className="truncate">
                        {activeCourse ? `${activeCourse.course_name} (ID: ${activeCourse.course_id})` : 'Chọn môn học...'}
                    </span>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>

            {/* Dropdown Menu Popup */}
            {isOpen && (
                <div className="absolute z-50 mt-1.5 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                    {/* Ô Search Input */}
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Tìm kiếm theo tên môn, mã ID hoặc phân loại..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 pl-8.5 pr-8 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Danh sách cuộn */}
                    <div className="max-h-64 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
                        {/* ========================================== */}
                        {/* KHỐI 1: KHÓA HỌC THUỘC PHÂN LOẠI HIỆN TẠI */}
                        {/* ========================================== */}
                        {sameCategoryCourses.length > 0 && (
                            <div>
                                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center justify-between">
                                    <span>Khóa học thuộc [{currentCategory}]</span>
                                    <span>
                                        {sameCategoryCourses.filter((c) => !otherSelectedIds.has(c.course_id)).length} môn khả dụng
                                    </span>
                                </div>
                                <div className="mt-1 space-y-1">
                                    {sameCategoryCourses.map((c) => {
                                        const isSelected = otherSelectedIds.has(c.course_id);
                                        const isCurrent = c.course_id === currentCourseId;

                                        return (
                                            <div
                                                key={c.course_id}
                                                onClick={() => {
                                                    if (!isSelected) {
                                                        onSelectCourse(c);
                                                        setIsOpen(false);
                                                        setSearchTerm('');
                                                    }
                                                }}
                                                className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-all ${isSelected
                                                    ? 'opacity-40 bg-slate-100/70 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 cursor-not-allowed select-none pointer-events-none'
                                                    : isCurrent
                                                        ? 'bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800'
                                                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 cursor-pointer'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className="truncate">{c.course_name}</span>
                                                    <span className="text-[10px] font-mono text-slate-400">ID: {c.course_id}</span>
                                                </div>

                                                <div className="shrink-0 flex items-center gap-1.5 ml-2">
                                                    {isCurrent && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                                                    {isSelected && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                            Đã chọn
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ========================================== */}
                        {/* KHỐI 2: KHÓA HỌC THUỘC PHÂN LOẠI KHÁC     */}
                        {/* ========================================== */}
                        {otherCategoryCourses.length > 0 && (
                            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-2">
                                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center justify-between">
                                    <span>Khóa học phân loại khác</span>
                                    <span>{otherCategoryCourses.length} môn</span>
                                </div>
                                <div className="mt-1 space-y-1">
                                    {otherCategoryCourses.map((c) => {
                                        const isSelected = otherSelectedIds.has(c.course_id);

                                        return (
                                            <div
                                                key={c.course_id}
                                                onClick={() => {
                                                    if (!isSelected) {
                                                        onSelectCourse(c);
                                                        setIsOpen(false);
                                                        setSearchTerm('');
                                                    }
                                                }}
                                                className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-all ${isSelected
                                                    ? 'opacity-40 bg-slate-100/70 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 cursor-not-allowed select-none pointer-events-none'
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 cursor-pointer'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50 shrink-0">
                                                        {c.category}
                                                    </span>
                                                    <span className="truncate">{c.course_name}</span>
                                                    <span className="text-[10px] font-mono text-slate-400">ID: {c.course_id}</span>
                                                </div>

                                                <div className="shrink-0 ml-2">
                                                    {isSelected ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                            Đã chọn
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-indigo-500 font-semibold opacity-0 group-hover:opacity-100">
                                                            Chọn ➔
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {sameCategoryCourses.length === 0 && otherCategoryCourses.length === 0 && (
                            <div className="py-6 text-center text-xs text-slate-400">
                                <AlertCircle className="mx-auto mb-1 h-5 w-5 text-slate-400 opacity-60" />
                                Không tìm thấy khóa học nào phù hợp với từ khóa!
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// =========================================================================
// 🚀 MAIN COMPONENT: LMS ENROLL SECTION
// =========================================================================
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
    // 🎯 TẬP HỢP CÁC ID KHÓA HỌC ĐÃ ĐƯỢC CHỌN TOÀN HỆ THỐNG
    const selectedCourseIds = useMemo(
        () => new Set(lmsSelectedCourses.map((c) => c.course_id)),
        [lmsSelectedCourses]
    );

    // Kiểm tra xem đã chọn hết toàn bộ khóa học trong hệ thống chưa
    const isAllCoursesExhausted = useMemo(() => {
        return (
            lmsCoursesList.length > 0 &&
            lmsCoursesList.every((c) => selectedCourseIds.has(c.course_id))
        );
    }, [lmsCoursesList, selectedCourseIds]);

    // 🎯 THUẬT TOÁN THÊM KHÓA HỌC THÔNG MINH (SMART CLONE PREVIOUS ROW)
    const handleSmartAddCourse = () => {
        if (isAllCoursesExhausted) {
            toast.warning('Tất cả các khóa học trong hệ thống đã được chọn hết!');
            return;
        }

        const lastRow = lmsSelectedCourses[lmsSelectedCourses.length - 1];

        // 1. Kế thừa ngày tháng và tên group từ dòng trước đó
        const defaultStart = lastRow?.start_date || '01-09-2026';
        const defaultEnd = lastRow?.end_date || '01-09-2027';
        const defaultGroup = lastRow?.group_name || '';

        // 2. Ưu tiên tìm khóa học tiếp theo trong cùng phân loại của dòng trước đó
        let targetCategory = lastRow?.category || lmsCategoriesList[0] || 'SWRP';
        let availableCourse = lmsCoursesList.find(
            (c) => c.category === targetCategory && !selectedCourseIds.has(c.course_id)
        );

        // 3. Nếu phân loại của dòng trước đã hết sạch khóa học, tự động tìm phân loại đầu tiên còn slot trống
        if (!availableCourse) {
            for (const cat of lmsCategoriesList) {
                const found = lmsCoursesList.find(
                    (c) => c.category === cat && !selectedCourseIds.has(c.course_id)
                );
                if (found) {
                    targetCategory = cat;
                    availableCourse = found;
                    break;
                }
            }
        }

        // 4. Fallback cuối cùng nếu vẫn chưa có (bốc bất kỳ khóa nào chưa chọn)
        if (!availableCourse) {
            availableCourse = lmsCoursesList.find((c) => !selectedCourseIds.has(c.course_id));
            if (availableCourse) {
                targetCategory = availableCourse.category;
            }
        }

        if (!availableCourse) {
            toast.warning('Không còn khóa học nào khả dụng để thêm mới!');
            return;
        }

        // 5. Thêm dòng mới vào mảng
        const newCourseRow: LmsCourseSelectionItem = {
            category: targetCategory,
            course_id: availableCourse.course_id,
            course_name: availableCourse.course_name,
            start_date: defaultStart,
            end_date: defaultEnd,
            group_name: defaultGroup,
        };

        setLmsSelectedCourses((prev) => [...prev, newCourseRow]);
        toast.success(`Đã thêm môn "${availableCourse.course_name}" ([${targetCategory}])`);
    };

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

            {/* Banner Tiêu Đề & Nút Thêm Khóa Học Thông Minh */}
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

                {/* 🎯 Nút thêm khóa học tích hợp Smart Clone */}
                <button
                    type="button"
                    onClick={handleSmartAddCourse}
                    disabled={isAllCoursesExhausted}
                    className={`flex items-center gap-1.5 rounded-xl border bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer self-start sm:self-auto disabled:opacity-40 disabled:cursor-not-allowed ${lmsActionType === 'enroll'
                        ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        : 'border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                        }`}
                >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAllCoursesExhausted ? 'Đã Chọn Hết Khóa Học' : 'Thêm Khóa Học LMS'}</span>
                </button>
            </div>

            {/* Danh sách các khóa học LMS cần thực thi */}
            <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 px-1">
                    <span>DANH SÁCH KHÓA HỌC LMS ÁP DỤNG ({lmsSelectedCourses.length} KHÓA):</span>
                    {isAllCoursesExhausted && (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Đã chọn toàn bộ khóa học trong hệ thống
                        </span>
                    )}
                </div>

                {lmsSelectedCourses.map((lmsItem, idx) => {
                    // Tập hợp các ID đã chọn ở các dòng KHÁC dòng hiện tại (để dòng này vẫn giữ được chính nó)
                    const otherSelectedIds = new Set(
                        lmsSelectedCourses.filter((_, i) => i !== idx).map((c) => c.course_id)
                    );

                    return (
                        <div
                            key={idx}
                            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3.5 transition-all"
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
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        [{lmsItem.category}]
                                    </span>
                                </div>

                                {lmsSelectedCourses.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveLmsCourseRow(idx)}
                                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                        title="Xóa khóa học này"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                {/* CỘT 1: PHÂN LOẠI KHÓA HỌC (CÓ BADGE ĐÃ CHỌN HẾT & AUTO FALLBACK) */}
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500">Phân loại:</label>
                                    <select
                                        value={lmsItem.category}
                                        onChange={(e) => {
                                            const newCat = e.target.value;
                                            // Tìm khóa học đầu tiên trong phân loại mới mà chưa bị chọn ở các dòng khác
                                            const availableInNewCat = lmsCoursesList.find(
                                                (c) => c.category === newCat && !otherSelectedIds.has(c.course_id)
                                            );
                                            const fallbackCourse =
                                                availableInNewCat ||
                                                lmsCoursesList.find((c) => c.category === newCat) ||
                                                lmsCoursesList[0];

                                            const updated = [...lmsSelectedCourses];
                                            updated[idx] = {
                                                ...updated[idx],
                                                category: newCat,
                                                course_id: fallbackCourse.course_id,
                                                course_name: fallbackCourse.course_name,
                                            };
                                            setLmsSelectedCourses(updated);
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer focus:outline-hidden focus:border-indigo-500"
                                    >
                                        {lmsCategoriesList.map((cat) => {
                                            const coursesInCat = lmsCoursesList.filter((c) => c.category === cat);
                                            // Kiểm tra xem phân loại này đã bị chọn hết sạch chưa
                                            const isCatExhausted =
                                                coursesInCat.length > 0 &&
                                                coursesInCat.every((c) => otherSelectedIds.has(c.course_id));

                                            const remainingCount = coursesInCat.filter(
                                                (c) => !otherSelectedIds.has(c.course_id)
                                            ).length;

                                            return (
                                                <option
                                                    key={cat}
                                                    value={cat}
                                                    disabled={isCatExhausted}
                                                    className={isCatExhausted ? 'text-slate-400 bg-slate-100 dark:bg-slate-800' : ''}
                                                >
                                                    {cat} {isCatExhausted ? '(Đã chọn hết)' : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                {/* CỘT 2: COMBOBOX TÌM KIẾM KHÓA HỌC XUYÊN PHÂN LOẠI */}
                                <div className="sm:col-span-2">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center justify-between">
                                        <span>Chọn môn học (Tìm kiếm xuyên phân loại):</span>
                                        <span className="text-slate-400 font-normal">
                                            Khóa đã chọn sẽ bị làm mờ & không click được
                                        </span>
                                    </label>
                                    <CourseCombobox
                                        currentCourseId={lmsItem.course_id}
                                        currentCategory={lmsItem.category}
                                        allCourses={lmsCoursesList}
                                        otherSelectedIds={otherSelectedIds}
                                        onSelectCourse={(selectedCourse) => {
                                            const updated = [...lmsSelectedCourses];
                                            updated[idx] = {
                                                ...updated[idx],
                                                category: selectedCourse.category, // 👈 Tự động đổi Category nếu chọn môn thuộc phân loại khác!
                                                course_id: selectedCourse.course_id,
                                                course_name: selectedCourse.course_name,
                                            };
                                            setLmsSelectedCourses(updated);
                                        }}
                                    />
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
                                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-emerald-500" />
                                            <span>Ngày hết hạn:</span>
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
                                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500"
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
                                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500"
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