// frontend/src/features/studio/components/modals/TeacherAllocationModal.tsx
import React from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { TeacherAllocationItem, LicenseTrayItem } from '../../types';

interface TeacherAllocationModalProps {
    isOpen: boolean;
    editingTeacherIndex: number | null;
    teachersAllocation: TeacherAllocationItem[];
    setTeachersAllocation: (list: TeacherAllocationItem[]) => void;
    onClose: () => void;
    trays: LicenseTrayItem[];
}

export const TeacherAllocationModal: React.FC<TeacherAllocationModalProps> = ({
    isOpen,
    editingTeacherIndex,
    teachersAllocation,
    setTeachersAllocation,
    onClose,
    trays,
}) => {
    if (!isOpen || editingTeacherIndex === null || !teachersAllocation[editingTeacherIndex] || typeof document === 'undefined') {
        return null;
    }

    const currentTeacher = teachersAllocation[editingTeacherIndex];

    return createPortal(
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: '94vw', maxWidth: '1050px', maxHeight: '90vh' }}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl overflow-hidden flex flex-col my-auto"
            >
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                            🧑‍🏫
                        </div>
                        <div>
                            <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                                Phân Bổ Khóa Học & Group LMS Cho Giáo Viên
                            </h4>
                            <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                                {currentTeacher.teacherName} ({currentTeacher.email})
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Thân Modal: Bố Cục 2 Cột Rộng Rãi */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 py-4 overflow-y-auto flex-1 scrollbar-thin text-xs">
                    {/* CỘT 1 (BÊN TRÁI): CHỌN CÁC KHÓA HỌC PHỤ TRÁCH (MULTI-SELECT) */}
                    <div className="md:col-span-5 space-y-3 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 pb-4 md:pb-0 md:pr-4">
                        <div className="flex items-center justify-between">
                            <label className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                                1. Khóa Học Phụ Trách ({currentTeacher.assignedCourses.length} môn):
                            </label>
                            <span className="text-[10px] text-slate-400 italic">Có thể chọn nhiều môn</span>
                        </div>

                        <div className="space-y-2">
                            {trays.map((tray) => {
                                const isCourseSelected = currentTeacher.assignedCourses.includes(tray.courseId);

                                return (
                                    <label
                                        key={tray.courseId}
                                        className={`flex items-start gap-3 p-3 rounded-2xl border transition cursor-pointer ${isCourseSelected
                                            ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs'
                                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isCourseSelected}
                                            onChange={(e) => {
                                                const updated = [...teachersAllocation];
                                                const curCourses = updated[editingTeacherIndex].assignedCourses;
                                                let nextCourses: string[] = [];

                                                if (e.target.checked) {
                                                    nextCourses = [...curCourses, tray.courseId];
                                                    const newGroups = tray.assignedClasses.map((c) => c.lmsGroupName);
                                                    updated[editingTeacherIndex].assignedLmsGroups = Array.from(
                                                        new Set([...updated[editingTeacherIndex].assignedLmsGroups, ...newGroups])
                                                    );
                                                } else {
                                                    nextCourses = curCourses.filter((id) => id !== tray.courseId);
                                                    const trayGroupNames = new Set(tray.assignedClasses.map((c) => c.lmsGroupName));
                                                    updated[editingTeacherIndex].assignedLmsGroups = updated[editingTeacherIndex].assignedLmsGroups.filter(
                                                        (g) => !trayGroupNames.has(g)
                                                    );
                                                }

                                                updated[editingTeacherIndex].assignedCourses = nextCourses;
                                                setTeachersAllocation(updated);
                                            }}
                                            className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-[10px]">
                                                    #{tray.courseId}
                                                </span>
                                                <span className="px-1.5 py-0.2 rounded font-bold text-[9px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                                    {tray.category}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-mono ml-auto">
                                                    ({tray.assignedClasses.length} lớp)
                                                </span>
                                            </div>
                                            <p className="font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                                                {tray.courseName}
                                            </p>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* CỘT 2 (BÊN PHẢI): DANH SÁCH GROUP LMS THEO CÁC MÔN ĐÃ CHỌN */}
                    <div className="md:col-span-7 space-y-3 flex flex-col">
                        <div className="flex items-center justify-between">
                            <label className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                                2. Group LMS Được Gán ({currentTeacher.assignedLmsGroups.length} groups):
                            </label>
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">
                                Không tốn bản quyền
                            </span>
                        </div>

                        {currentTeacher.assignedCourses.length === 0 ? (
                            <div className="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-400 italic flex flex-col items-center justify-center my-auto space-y-2">
                                <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                                <span>Vui lòng chọn ít nhất 1 khóa học ở cột bên trái để hiển thị danh sách Group LMS.</span>
                            </div>
                        ) : (
                            <div className="space-y-4 overflow-y-auto pr-1 flex-1 scrollbar-thin">
                                {currentTeacher.assignedCourses.map((cid) => {
                                    const tray = trays.find((t) => t.courseId === cid);
                                    if (!tray) return null;

                                    const allTrayGroupNames = tray.assignedClasses.map((c) => c.lmsGroupName);
                                    const isAllSelectedInTray =
                                        allTrayGroupNames.length > 0 &&
                                        allTrayGroupNames.every((g) =>
                                            currentTeacher.assignedLmsGroups.includes(g)
                                        );

                                    return (
                                        <div
                                            key={cid}
                                            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3.5 space-y-2.5"
                                        >
                                            <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2">
                                                <div className="truncate pr-2">
                                                    <span className="font-mono text-indigo-600 font-bold text-[10px] mr-1.5">
                                                        #{tray.courseId}
                                                    </span>
                                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                                                        {tray.courseName}
                                                    </span>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = [...teachersAllocation];
                                                        const curGroups = updated[editingTeacherIndex].assignedLmsGroups;

                                                        if (isAllSelectedInTray) {
                                                            const traySet = new Set(allTrayGroupNames);
                                                            updated[editingTeacherIndex].assignedLmsGroups = curGroups.filter((g) => !traySet.has(g));
                                                        } else {
                                                            updated[editingTeacherIndex].assignedLmsGroups = Array.from(
                                                                new Set([...curGroups, ...allTrayGroupNames])
                                                            );
                                                        }
                                                        setTeachersAllocation(updated);
                                                    }}
                                                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 cursor-pointer"
                                                >
                                                    {isAllSelectedInTray ? '✕ Bỏ chọn môn này' : '+ Chọn hết môn này'}
                                                </button>
                                            </div>

                                            <div className="space-y-1.5">
                                                {tray.assignedClasses.length === 0 ? (
                                                    <p className="text-[11px] text-slate-400 italic py-1">
                                                        Chưa có lớp nào được xếp vào khay môn học này.
                                                    </p>
                                                ) : (
                                                    tray.assignedClasses.map((cls) => {
                                                        const isChecked = currentTeacher.assignedLmsGroups.includes(
                                                            cls.lmsGroupName
                                                        );
                                                        return (
                                                            <label
                                                                key={cls.lmsGroupName}
                                                                className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-slate-700 cursor-pointer transition shadow-2xs"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        const updated = [...teachersAllocation];
                                                                        const curList = updated[editingTeacherIndex].assignedLmsGroups;
                                                                        if (e.target.checked) {
                                                                            updated[editingTeacherIndex].assignedLmsGroups = [...curList, cls.lmsGroupName];
                                                                        } else {
                                                                            updated[editingTeacherIndex].assignedLmsGroups = curList.filter(
                                                                                (g) => g !== cls.lmsGroupName
                                                                            );
                                                                        }
                                                                        setTeachersAllocation(updated);
                                                                    }}
                                                                    className="h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                                />
                                                                <div className="min-w-0 flex-1">
                                                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                                                        {cls.rawClassName}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 font-mono ml-2">
                                                                        ({cls.lmsGroupName})
                                                                    </span>
                                                                </div>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Modal */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="text-[11px] text-slate-500">
                        Đang gán: <b>{currentTeacher.assignedCourses.length} môn</b> |{' '}
                        <b>{currentTeacher.assignedLmsGroups.length} Group LMS</b>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            toast.success(`Đã lưu phân bổ cho giáo viên ${currentTeacher.teacherName}!`);
                        }}
                        className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md shadow-indigo-500/20 cursor-pointer"
                    >
                        Lưu & Hoàn Tất
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};