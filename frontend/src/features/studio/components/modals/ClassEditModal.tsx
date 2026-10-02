// frontend/src/features/studio/components/modals/ClassEditModal.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Users,
    UserCheck,
    GraduationCap,
    Copy,
    Plus,
    Trash2,
    Check,
    Save,
    AlertCircle,
    Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { ClassGroupItem, TeacherAllocationItem } from '../../types';

interface ClassEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    classItem: ClassGroupItem | null;
    sourceTrayId: string | null;
    onSave: (
        updatedClass: ClassGroupItem,
        sourceTrayId: string | null,
        oldGroupName: string,
        newGroupName: string
    ) => void;
    onDuplicate: (classToDuplicate: ClassGroupItem) => void;
    teachersList: TeacherAllocationItem[];
    setTeachersList: React.Dispatch<React.SetStateAction<TeacherAllocationItem[]>>;
}

export const ClassEditModal: React.FC<ClassEditModalProps> = ({
    isOpen,
    onClose,
    classItem,
    sourceTrayId,
    onSave,
    onDuplicate,
    teachersList,
    setTeachersList,
}) => {
    if (!isOpen || !classItem || typeof document === 'undefined') {
        return null;
    }

    const [rawClassName, setRawClassName] = useState<string>(classItem.rawClassName || '');
    const [lmsGroupName, setLmsGroupName] = useState<string>(classItem.lmsGroupName || '');
    const [students, setStudents] = useState<string[]>(classItem.students ? [...classItem.students] : []);
    const [newStudentEmail, setNewStudentEmail] = useState<string>('');
    const [assignedTeacherEmails, setAssignedTeacherEmails] = useState<Set<string>>(new Set());

    const initialGroupName = classItem.lmsGroupName;

    useEffect(() => {
        if (!classItem) return;
        setRawClassName(classItem.rawClassName || '');
        setLmsGroupName(classItem.lmsGroupName || '');
        setStudents(classItem.students ? [...classItem.students] : []);
        setNewStudentEmail('');

        // Tìm các giáo viên đang được gán vào group này
        const assignedEmails = new Set<string>();
        teachersList.forEach((t) => {
            if (t.assignedLmsGroups.includes(classItem.lmsGroupName)) {
                assignedEmails.add(t.email);
            }
        });
        setAssignedTeacherEmails(assignedEmails);
    }, [classItem, teachersList]);

    // Thêm học sinh vào danh sách
    const handleAddStudent = () => {
        const email = newStudentEmail.trim().toLowerCase();
        if (!email) return;

        if (students.includes(email)) {
            toast.error('Email học sinh này đã tồn tại trong nhóm lớp!');
            return;
        }

        setStudents((prev) => [...prev, email]);
        setNewStudentEmail('');
        toast.success(`Đã thêm học sinh ${email}`);
    };

    // Xóa học sinh khỏi danh sách
    const handleRemoveStudent = (indexToRemove: number) => {
        const removed = students[indexToRemove];
        setStudents((prev) => prev.filter((_, idx) => idx !== indexToRemove));
        toast.info(`Đã xóa học sinh ${removed}`);
    };

    // Toggle giáo viên phụ trách
    const handleToggleTeacher = (email: string) => {
        setAssignedTeacherEmails((prev) => {
            const next = new Set(prev);
            if (next.has(email)) {
                next.delete(email);
            } else {
                next.add(email);
            }
            return next;
        });
    };

    // Lưu các thay đổi
    const handleSave = () => {
        const finalRawName = rawClassName.trim() || classItem.rawClassName;
        const finalGroupName = lmsGroupName.trim() || classItem.lmsGroupName;

        const updatedClass: ClassGroupItem = {
            ...classItem,
            rawClassName: finalRawName,
            lmsGroupName: finalGroupName,
            students,
            studentsCount: students.length,
            isCustomGroup: true,
        };

        // Đồng bộ danh sách giáo viên phụ trách theo state assignedTeacherEmails
        setTeachersList((prev) =>
            prev.map((t) => {
                const shouldBeAssigned = assignedTeacherEmails.has(t.email);
                // Gỡ tên group cũ (nếu có)
                let nextGroups = t.assignedLmsGroups.filter((g) => g !== initialGroupName);

                if (shouldBeAssigned) {
                    if (!nextGroups.includes(finalGroupName)) {
                        nextGroups.push(finalGroupName);
                    }
                } else {
                    nextGroups = nextGroups.filter((g) => g !== finalGroupName);
                }

                return {
                    ...t,
                    assignedLmsGroups: nextGroups,
                };
            })
        );

        onSave(updatedClass, sourceTrayId, initialGroupName, finalGroupName);
        toast.success(`Đã cập nhật thông tin lớp '${finalRawName}'!`);
        onClose();
    };

    // Nhân bản nhóm lớp
    const handleDuplicate = () => {
        const finalRawName = rawClassName.trim() || classItem.rawClassName;
        const finalGroupName = lmsGroupName.trim() || classItem.lmsGroupName;

        const baseClassForDuplicate: ClassGroupItem = {
            ...classItem,
            rawClassName: finalRawName,
            lmsGroupName: finalGroupName,
            students,
            studentsCount: students.length,
        };

        onDuplicate(baseClassForDuplicate);
        onClose();
    };

    return createPortal(
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: '94vw', maxWidth: '850px', maxHeight: '92vh' }}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl overflow-hidden flex flex-col my-auto"
            >
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20 font-bold">
                            <GraduationCap className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>Chỉnh Sửa Nhóm Lớp</span>
                                {classItem.isDuplicate && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                        Bản Nhân Bản
                                    </span>
                                )}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {sourceTrayId ? `Đang thuộc Khay #${sourceTrayId}` : 'Đang ở hàng đợi chưa xếp'} • {students.length} học sinh
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

                {/* Nội dung Modal (Scrollable) */}
                <div className="overflow-y-auto flex-1 py-4 space-y-5 scrollbar-thin text-xs">
                    {/* Phần 1: Tên Lớp & Nhóm LMS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                Tên Khối / Lớp Học:
                            </label>
                            <input
                                type="text"
                                value={rawClassName}
                                onChange={(e) => setRawClassName(e.target.value)}
                                placeholder="VD: Class 7A, Khối 8, AIROC 2026..."
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                            />
                            <p className="text-[10px] text-slate-400">Tên lớp gốc hoặc ký hiệu hiển thị.</p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                Tên Group Trên LMS (Moodle):
                            </label>
                            <input
                                type="text"
                                value={lmsGroupName}
                                onChange={(e) => setLmsGroupName(e.target.value)}
                                placeholder="VD: School AIROC 2026 Vietnam Oct2026..."
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-semibold text-indigo-700 dark:text-indigo-300 focus:border-indigo-500 focus:outline-hidden"
                            />
                            <p className="text-[10px] text-slate-400">Mã nhóm tạo thực tế trên Moodle LMS.</p>
                        </div>
                    </div>

                    {/* Phần 2: Giáo Viên Phụ Trách */}
                    <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-extrabold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                                <Users className="w-4 h-4 text-indigo-600" />
                                <span>Giáo Viên Phụ Trách Nhóm ({assignedTeacherEmails.size} Đã Chọn):</span>
                            </label>
                            <span className="text-[10px] text-slate-400 italic">Tick chọn để gán giáo viên vào nhóm này</span>
                        </div>

                        {teachersList.length === 0 ? (
                            <div className="p-3 text-center text-slate-400 italic rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                Không có giáo viên nào trong danh sách.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                                {teachersList.map((t) => {
                                    const isAssigned = assignedTeacherEmails.has(t.email);
                                    return (
                                        <button
                                            key={t.email}
                                            type="button"
                                            onClick={() => handleToggleTeacher(t.email)}
                                            className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                                                isAssigned
                                                    ? 'border-indigo-400 bg-indigo-100/70 dark:bg-indigo-900/50 text-indigo-900 dark:text-indigo-200 shadow-2xs'
                                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                                            }`}
                                        >
                                            <div className="truncate pr-2">
                                                <div className="font-bold truncate flex items-center gap-1">
                                                    <span>🧑‍🏫</span>
                                                    <span>{t.teacherName}</span>
                                                </div>
                                                <div className="text-[10px] font-mono text-slate-400 truncate">{t.email}</div>
                                            </div>
                                            <div
                                                className={`h-5 w-5 rounded-lg flex items-center justify-center shrink-0 border ${
                                                    isAssigned
                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                                                }`}
                                            >
                                                {isAssigned && <Check className="w-3.5 h-3.5" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Phần 3: Danh Sách Học Sinh */}
                    <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                <UserCheck className="w-4 h-4 text-emerald-600" />
                                <span>Danh Sách Học Sinh Trong Lớp ({students.length} Học Sinh):</span>
                            </label>
                            <span className="text-[10px] text-slate-400 italic">Thêm hoặc xóa học sinh theo email</span>
                        </div>

                        {/* Input thêm học sinh */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="email"
                                    value={newStudentEmail}
                                    onChange={(e) => setNewStudentEmail(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddStudent();
                                        }
                                    }}
                                    placeholder="Nhập email học sinh mới (VD: student@school.edu.vn)..."
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 pl-8 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-hidden"
                                />
                                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            </div>
                            <button
                                type="button"
                                onClick={handleAddStudent}
                                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shrink-0 transition cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Thêm</span>
                            </button>
                        </div>

                        {/* Danh sách email học sinh */}
                        {students.length === 0 ? (
                            <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-400 italic">
                                Lớp hiện chưa có danh sách email học sinh. Bạn có thể nhập email ở trên để bổ sung.
                            </div>
                        ) : (
                            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                                {students.map((email, idx) => (
                                    <div
                                        key={idx}
                                        className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono"
                                    >
                                        <div className="flex items-center gap-2 truncate pr-2">
                                            <span className="text-slate-400 text-[10px] w-5 text-right font-sans">{idx + 1}.</span>
                                            <span className="truncate text-slate-800 dark:text-slate-200">{email}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveStudent(idx)}
                                            className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer transition"
                                            title="Xóa học sinh này khỏi nhóm"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Modal: Hành Động (Duplicate / Lưu / Hủy) */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 shrink-0">
                    <button
                        type="button"
                        onClick={handleDuplicate}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 font-bold text-xs transition cursor-pointer"
                        title="Tạo bản sao nhóm lớp này với cùng số HS và GV. Nhóm mới sẽ nằm ở hàng đợi chưa xếp."
                    >
                        <Copy className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <span>Duplicate Nhóm Lớp Này</span>
                    </button>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 transition cursor-pointer"
                        >
                            Hủy Bỏ
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition cursor-pointer"
                        >
                            <Save className="w-4 h-4" />
                            <span>Lưu Thay Đổi</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
