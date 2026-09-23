// frontend/src/features/studio/components/tabs/workspace/CreateAndApproveSection.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
    FileCheck2,
    Trash2,
    Upload,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Sparkles,
    X,
    Users,
    Building2,
    Search,
    Check,
    BookOpen,
    Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    HierarchySchoolItem,
    CourseItem,
    OrderCourseSelection,
    ClassGroupItem,
    TeacherAllocationItem,
    LicenseTrayItem,
    CofExtractionResult,
} from '../../../types';
import { TeacherAllocationModal } from '../../modals/TeacherAllocationModal';

interface CreateAndApproveSectionProps {
    uploadedCofFile: File | null;
    setUploadedCofFile: (f: File | null) => void;
    cofExtractionResult: CofExtractionResult | null;
    setCofExtractionResult: (r: CofExtractionResult | null) => void;
    onProcessCofFile: (f: File) => void;
    cofTrays: LicenseTrayItem[];
    cofClassAssignments: Record<string, ClassGroupItem[]>;
    setCofClassAssignments: React.Dispatch<React.SetStateAction<Record<string, ClassGroupItem[]>>>;
    cofUnassignedClasses: ClassGroupItem[];
    setCofUnassignedClasses: React.Dispatch<React.SetStateAction<ClassGroupItem[]>>;
    cofTeachersAllocation: TeacherAllocationItem[];
    setCofTeachersAllocation: React.Dispatch<React.SetStateAction<TeacherAllocationItem[]>>;
    editingTeacherIndex: number | null;
    setEditingTeacherIndex: (idx: number | null) => void;
    selectedSchool: HierarchySchoolItem | null;
    setSelectedSchool: (s: HierarchySchoolItem | null) => void;
    setSelectedPartner: (p: { name: string; code: string } | null) => void;
    setSelectedDistributor: (d: { name: string; code: string } | null) => void;
    schoolsList: HierarchySchoolItem[];
    createApproveSubFlow: 'end_to_end' | 'partner_create_chain' | 'distributor_create_chain';
    setCreateApproveSubFlow: (val: 'end_to_end' | 'partner_create_chain' | 'distributor_create_chain') => void;
    selectedCourses: OrderCourseSelection[];
    setSelectedCourses: React.Dispatch<React.SetStateAction<OrderCourseSelection[]>>;
    workspaceCoursesList: CourseItem[];
    workspaceCategoriesList: string[];
    onAddCourseRow: () => void;
    onRemoveCourseRow: (idx: number) => void;
    contactInfo: string;
    setContactInfo: (val: string) => void;
    additionalNotes: string;
    setAdditionalNotes: (val: string) => void;
}

export const CreateAndApproveSection: React.FC<CreateAndApproveSectionProps> = ({
    uploadedCofFile,
    setUploadedCofFile,
    cofExtractionResult,
    setCofExtractionResult,
    onProcessCofFile,
    cofTrays,
    setCofClassAssignments,
    cofUnassignedClasses,
    setCofUnassignedClasses,
    cofTeachersAllocation,
    setCofTeachersAllocation,
    editingTeacherIndex,
    setEditingTeacherIndex,
    selectedSchool,
    setSelectedSchool,
    setSelectedPartner,
    setSelectedDistributor,
    schoolsList,
    createApproveSubFlow,
    setCreateApproveSubFlow,
    selectedCourses,
    setSelectedCourses,
    workspaceCoursesList,
    workspaceCategoriesList,
    onAddCourseRow,
    onRemoveCourseRow,
    contactInfo,
    setContactInfo,
    additionalNotes,
    setAdditionalNotes,
}) => {
    // 1. Quản lý kéo thả cục bộ
    const [draggedClassInfo, setDraggedClassInfo] = useState<{
        sourceTrayId: string | null;
        classItem: ClassGroupItem;
    } | null>(null);
    const [activeDropTrayId, setActiveDropTrayId] = useState<string | null>(null);
    const [isDropToUnassignedActive, setIsDropToUnassignedActive] = useState<boolean>(false);

    // 2. Ref cho input file COF
    const cofFileInputRef = useRef<HTMLInputElement | null>(null);

    // 3. Quản lý Combobox trường học cục bộ
    const [entitySearchQuery, setEntitySearchQuery] = useState<string>(
        selectedSchool ? selectedSchool.school_name : ''
    );
    const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState<boolean>(false);
    const entityDropdownRef = useRef<HTMLDivElement | null>(null);

    // 4. Quản lý tìm kiếm môn học linh hoạt cục bộ
    const [courseSearchTerms, setCourseSearchTerms] = useState<Record<number, string>>({});
    const [activeCourseDropdownRow, setActiveCourseDropdownRow] = useState<number | null>(null);

    // Đồng bộ tên trường khi selectedSchool thay đổi từ bên ngoài (ví dụ do COF phân tích)
    useEffect(() => {
        if (selectedSchool) {
            setEntitySearchQuery(selectedSchool.school_name);
        }
    }, [selectedSchool]);

    // Click outside cho dropdown trường học
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
                setIsEntityDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="space-y-5 pt-2">
            {/* 1. KHU VỰC NỘP FILE COF ĐỂ AUTO-FILL TOÀN TRÌNH */}
            <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                            <FileCheck2 className="h-5 w-5 text-amber-300" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>Nộp File COF (Curriculum Order Form) Tự Động Điền Dữ Liệu</span>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                                    Auto-Fill AI Engine
                                </span>
                            </h3>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Hệ thống tự bóc tách Tên Trường, Môn học, Số lượng License và điền vào các trường bên dưới.
                            </p>
                        </div>
                    </div>

                    {uploadedCofFile && (
                        <button
                            type="button"
                            onClick={() => {
                                setUploadedCofFile(null);
                                setCofExtractionResult(null);
                                if (cofFileInputRef.current) cofFileInputRef.current.value = '';
                            }}
                            className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer font-semibold"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa file COF</span>
                        </button>
                    )}
                </div>

                <input
                    type="file"
                    ref={cofFileInputRef}
                    accept=".xlsx,.xls"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onProcessCofFile(f);
                    }}
                    className="hidden"
                />

                <div
                    onClick={() => cofFileInputRef.current?.click()}
                    className="flex items-center justify-between p-4 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900/80 hover:border-indigo-500 transition cursor-pointer"
                >
                    <div className="flex items-center gap-3">
                        <Upload className="w-5 h-5 text-indigo-600" />
                        <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {uploadedCofFile ? uploadedCofFile.name : 'Nhấp hoặc Kéo thả file COF (.xlsx) vào đây'}
                            </p>
                            <p className="text-[10px] text-slate-400">
                                Hỗ trợ file COF 3 Tabs (Curriculum Order Form, Student Info, Teacher Info)
                            </p>
                        </div>
                    </div>
                    <span className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-xs font-bold">
                        {uploadedCofFile ? 'Đổi File' : 'Chọn File'}
                    </span>
                </div>

                {/* THẺ BÁO CÁO KẾT QUẢ ĐỐI SOÁT TRƯỜNG & KHÓA HỌC */}
                {cofExtractionResult && (
                    <div
                        className={`p-3.5 rounded-xl border text-xs space-y-2 ${cofExtractionResult.confidence === 'high'
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 text-emerald-950 dark:text-emerald-100'
                            : cofExtractionResult.confidence === 'medium'
                                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 text-amber-950 dark:text-amber-100'
                                : 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 text-rose-950 dark:text-rose-100'
                            }`}
                    >
                        <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1.5">
                                {cofExtractionResult.confidence === 'high' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                                {cofExtractionResult.confidence === 'medium' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                                {cofExtractionResult.confidence === 'none' && <XCircle className="w-4 h-4 text-rose-600" />}
                                <span>
                                    {cofExtractionResult.confidence === 'high' && 'ĐÃ KHỚP TRƯỜNG HỌC THÀNH CÔNG'}
                                    {cofExtractionResult.confidence === 'medium' && 'CẢNH BÁO: KHỚP TRƯỜNG GẦN ĐÚNG (CẦN KIỂM TRA)'}
                                    {cofExtractionResult.confidence === 'none' && 'LỖI: KHÔNG TÌM THẤY TRƯỜNG TRONG 480 TRƯỜNG'}
                                </span>
                            </span>
                            <span className="font-mono text-[11px] font-extrabold">
                                {Math.round(cofExtractionResult.score * 100)}% Match
                            </span>
                        </div>

                        <div className="text-[11px] space-y-1">
                            <p>• Tên trong file COF: <b>"{cofExtractionResult.rawSchoolName || 'Không tìm thấy'}"</b></p>
                            {cofExtractionResult.matchedSchool ? (
                                <p>
                                    • Trường được gán trên hệ thống: <b>{cofExtractionResult.matchedSchool.school_name}</b> (Mã: {cofExtractionResult.matchedSchool.school_code})
                                </p>
                            ) : (
                                <p className="text-rose-600 font-bold">• Vui lòng tự tìm và chọn trường ở ô tìm kiếm bên dưới!</p>
                            )}
                            <p>
                                • Bóc tách thành công: <b>{cofExtractionResult.coursesCount} Môn học</b> | {cofExtractionResult.studentsCount} Học sinh | {cofExtractionResult.teachersCount} Giáo viên.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. GIAO DIỆN BENTO GRID KHAY KHÓA HỌC KÉO THẢ & ĐỒNG BỘ 2 CHIỀU TỨC THỜI */}
            {cofTrays.length > 0 && (
                <div className="rounded-3xl border border-indigo-200 dark:border-indigo-900 bg-gradient-to-b from-indigo-50/40 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 p-5 sm:p-6 space-y-5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100 dark:border-slate-800 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
                                <Sparkles className="h-5 w-5 text-amber-300" />
                            </div>
                            <div>
                                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                    <span>Khay Phân Bổ Khóa Học & Giấy Phép (Kéo & Thả)</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                        TWO-WAY SYNC
                                    </span>
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Tự động đồng bộ số lượng & thông số môn học với bảng cấu hình bên dưới. Kéo thả để phân bổ lớp.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-mono font-bold">
                            <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Tổng Hạn Ngạch: {cofTrays.reduce((sum, t) => sum + t.quota, 0)} licenses
                            </span>
                            <span className="px-3 py-1 rounded-xl bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                                Đã Xếp: {cofTrays.reduce((sum, t) => sum + t.assignedStudentsCount, 0)} học sinh
                            </span>
                        </div>
                    </div>

                    {/* 2.1. DANH SÁCH CÁC KHAY KHÓA HỌC */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {cofTrays.map((tray) => {
                            const diff = tray.quota - tray.assignedStudentsCount;
                            const isOverflow = diff < 0;
                            const isExact = diff === 0 && tray.quota > 0;
                            const rawPercent = Math.round((tray.assignedStudentsCount / (tray.quota || 1)) * 100);
                            const displayPercent = isNaN(rawPercent) ? 0 : rawPercent;
                            const barWidth = Math.min(displayPercent, 100);
                            const isBeingHovered = activeDropTrayId === tray.courseId;

                            return (
                                <div
                                    key={tray.courseId}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        setActiveDropTrayId(tray.courseId);
                                    }}
                                    onDragLeave={() => setActiveDropTrayId(null)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setActiveDropTrayId(null);
                                        if (!draggedClassInfo) return;

                                        const { sourceTrayId, classItem } = draggedClassInfo;
                                        if (sourceTrayId === tray.courseId) return;

                                        setCofClassAssignments((prev) => {
                                            const next = { ...prev };
                                            if (sourceTrayId && next[sourceTrayId]) {
                                                next[sourceTrayId] = next[sourceTrayId].filter((c) => c.rawClassName !== classItem.rawClassName);
                                            }
                                            next[tray.courseId] = [...(next[tray.courseId] || []), classItem];
                                            return next;
                                        });

                                        if (!sourceTrayId) {
                                            setCofUnassignedClasses((prev) => prev.filter((c) => c.rawClassName !== classItem.rawClassName));
                                        }

                                        setDraggedClassInfo(null);
                                        toast.success(`🎯 Đã thả lớp '${classItem.rawClassName}' vào Khay #${tray.courseId}!`);
                                    }}
                                    className={`rounded-2xl border p-4.5 flex flex-col justify-between transition-all duration-200 ${isBeingHovered
                                        ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/60 ring-2 ring-indigo-500 scale-[1.01] shadow-md'
                                        : isOverflow
                                            ? 'border-rose-300 bg-rose-50/40 dark:bg-rose-950/20 ring-1 ring-rose-400'
                                            : isExact
                                                ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-400'
                                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs'
                                        }`}
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mb-1">
                                                    {tray.category} • ID: #{tray.courseId}
                                                </span>
                                                <h5 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2" title={tray.courseName}>
                                                    {tray.courseName}
                                                </h5>
                                                {tray.targetGrade && (
                                                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                                                        Khối mục tiêu: Khối {tray.targetGrade}
                                                    </p>
                                                )}
                                            </div>

                                            <span
                                                className={`shrink-0 px-2.5 py-1 rounded-xl text-[10px] font-extrabold font-mono ${isOverflow
                                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'
                                                    : isExact
                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                                                    }`}
                                            >
                                                {isOverflow ? `TRÀN +${Math.abs(diff)} (${displayPercent}%)` : isExact ? 'KHỚP 100%' : `DƯ ${diff} CHỖ (${displayPercent}%)`}
                                            </span>
                                        </div>

                                        {/* Thanh tiến độ sức chứa */}
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between text-[11px] font-mono">
                                                <span className="text-slate-500">
                                                    Đã xếp: <b>{tray.assignedStudentsCount}</b> / {tray.quota} slots
                                                </span>
                                                <span className={`font-bold ${isOverflow ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    {displayPercent}%
                                                </span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-300 ${isOverflow ? 'bg-rose-500' : isExact ? 'bg-emerald-500' : 'bg-amber-500'
                                                        }`}
                                                    style={{ width: `${barWidth}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Danh sách các lớp trong Khay */}
                                        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                                <span>Các Lớp Trong Khay ({tray.assignedClasses.length} lớp):</span>
                                                <span className="text-[9px] lowercase font-normal italic text-slate-400">kéo để chuyển khay</span>
                                            </span>

                                            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                                                {tray.assignedClasses.length === 0 ? (
                                                    <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-400 italic">
                                                        Thả các lớp học từ bên dưới vào đây
                                                    </div>
                                                ) : (
                                                    tray.assignedClasses.map((clsItem) => (
                                                        <div
                                                            key={clsItem.rawClassName}
                                                            draggable
                                                            onDragStart={(e) => {
                                                                setDraggedClassInfo({ sourceTrayId: tray.courseId, classItem: clsItem });
                                                                e.dataTransfer.setData('text/plain', clsItem.rawClassName);
                                                            }}
                                                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-xs cursor-grab active:cursor-grabbing hover:border-indigo-400 hover:shadow-2xs transition"
                                                        >
                                                            <div className="min-w-0 pr-2">
                                                                <p className="font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                                                                    <span className="text-slate-400">⠿</span>
                                                                    <span>{clsItem.rawClassName}</span>
                                                                </p>
                                                                <p className="text-[10px] text-slate-400 font-mono truncate pl-3" title={clsItem.lmsGroupName}>
                                                                    {clsItem.lmsGroupName}
                                                                </p>
                                                            </div>

                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-mono font-bold text-[11px]">
                                                                    {clsItem.studentsCount} hs
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setCofClassAssignments((prev) => {
                                                                            const next = { ...prev };
                                                                            if (next[tray.courseId]) {
                                                                                next[tray.courseId] = next[tray.courseId].filter((c) => c.rawClassName !== clsItem.rawClassName);
                                                                            }
                                                                            return next;
                                                                        });
                                                                        setCofUnassignedClasses((prev) => [...prev, clsItem]);
                                                                        toast.info(`Đã đưa lớp '${clsItem.rawClassName}' ra danh sách chờ.`);
                                                                    }}
                                                                    className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer transition"
                                                                    title="Đưa lớp này ra danh sách chờ"
                                                                >
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 2.2. VÙNG DANH SÁCH LỚP CHỜ (HÀNG ĐỢI KÉO THẢ) */}
                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDropToUnassignedActive(true);
                        }}
                        onDragLeave={() => setIsDropToUnassignedActive(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setIsDropToUnassignedActive(false);
                            if (!draggedClassInfo || !draggedClassInfo.sourceTrayId) return;

                            const { sourceTrayId, classItem } = draggedClassInfo;
                            setCofClassAssignments((prev) => {
                                const next = { ...prev };
                                if (next[sourceTrayId]) {
                                    next[sourceTrayId] = next[sourceTrayId].filter((c) => c.rawClassName !== classItem.rawClassName);
                                }
                                return next;
                            });
                            setCofUnassignedClasses((prev) => [...prev, classItem]);
                            setDraggedClassInfo(null);
                            toast.info(`Đã chuyển lớp '${classItem.rawClassName}' về hàng đợi.`);
                        }}
                        className={`p-4.5 rounded-2xl border transition-all duration-200 ${isDropToUnassignedActive
                            ? 'border-amber-500 bg-amber-100/60 ring-2 ring-amber-400'
                            : 'border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20'
                            } space-y-3`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-600" />
                                <h5 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                                    Hàng Đợi Các Khối Lớp Chưa Xếp Vào Khay ({cofUnassignedClasses.length} lớp - {cofUnassignedClasses.reduce((s, c) => s + c.studentsCount, 0)} học sinh):
                                </h5>
                            </div>
                            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium italic">
                                ✋ Nắm kéo thẻ lớp thả vào khay, hoặc bấm nút xếp nhanh
                            </span>
                        </div>

                        {cofUnassignedClasses.length === 0 ? (
                            <div className="p-6 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 text-center text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>Tuyệt vời! Tất cả các khối lớp đã được xếp gọn gàng vào các khay môn học!</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {cofUnassignedClasses.map((uCls) => (
                                    <div
                                        key={uCls.rawClassName}
                                        draggable
                                        onDragStart={(e) => {
                                            setDraggedClassInfo({ sourceTrayId: null, classItem: uCls });
                                            e.dataTransfer.setData('text/plain', uCls.rawClassName);
                                        }}
                                        className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 flex flex-col justify-between gap-2.5 text-xs shadow-2xs hover:border-amber-400 cursor-grab active:cursor-grabbing transition"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                                    <span className="text-slate-400">⠿</span>
                                                    <span>{uCls.rawClassName || 'Chưa phân lớp (No Class)'}</span>
                                                </p>
                                                <span className="text-[10px] text-slate-400 font-mono pl-3">
                                                    {uCls.studentsCount} học sinh {uCls.gradeDetected ? `(Khối ${uCls.gradeDetected})` : ''}
                                                </span>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-[10px] font-mono font-bold">
                                                Chờ xếp
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                                            <span className="text-[10px] text-slate-400 font-semibold shrink-0">Xếp vào:</span>
                                            <div className="flex flex-wrap gap-1">
                                                {cofTrays.map((t) => (
                                                    <button
                                                        key={t.courseId}
                                                        type="button"
                                                        onClick={() => {
                                                            setCofClassAssignments((prev) => ({
                                                                ...prev,
                                                                [t.courseId]: [...(prev[t.courseId] || []), uCls],
                                                            }));
                                                            setCofUnassignedClasses((prev) => prev.filter((c) => c.rawClassName !== uCls.rawClassName));
                                                            toast.success(`Đã xếp lớp '${uCls.rawClassName}' vào Khay #${t.courseId}!`);
                                                        }}
                                                        className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 font-mono text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 cursor-pointer transition"
                                                    >
                                                        #{t.courseId} ({t.quota - t.assignedStudentsCount})
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 2.3. DANH SÁCH GIÁO VIÊN PHÂN BỔ */}
                    {cofTeachersAllocation.length > 0 && (
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-indigo-600" />
                                    <span>Phân Bổ Giáo Viên ({cofTeachersAllocation.length} GV - Không tốn License):</span>
                                </span>
                                <span className="text-[11px] text-slate-500 italic">
                                    Click vào biểu tượng ✎ trên từng giáo viên để sửa môn hoặc gán lại Group LMS
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {cofTeachersAllocation.map((t, tIdx) => (
                                    <div
                                        key={tIdx}
                                        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2 text-xs shadow-2xs hover:border-indigo-300 transition"
                                    >
                                        <div className="flex items-start justify-between gap-1.5">
                                            <div>
                                                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                                    <span>🧑‍🏫 {t.teacherName}</span>
                                                </p>
                                                <p className="text-[10px] text-slate-400 font-mono">{t.email}</p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setEditingTeacherIndex(tIdx)}
                                                className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 cursor-pointer transition"
                                                title="Sửa phân bổ môn & group cho giáo viên này"
                                            >
                                                ✎
                                            </button>
                                        </div>

                                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-1">
                                            <p className="text-slate-600 dark:text-slate-300 truncate">
                                                📚 Môn: <b>{t.courseAssign || 'Chưa gán'}</b>
                                            </p>
                                            <p className="text-indigo-600 dark:text-indigo-400 font-mono text-[10px]">
                                                👥 {t.assignedLmsGroups.length} Group LMS được gán
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 2.4. MODAL PHÂN BỔ GIÁO VIÊN BẰNG CREATEPORTAL */}
                    <TeacherAllocationModal
                        isOpen={editingTeacherIndex !== null}
                        editingTeacherIndex={editingTeacherIndex}
                        teachersAllocation={cofTeachersAllocation}
                        setTeachersAllocation={setCofTeachersAllocation}
                        onClose={() => setEditingTeacherIndex(null)}
                        trays={cofTrays}
                    />
                </div>
            )}

            {/* 3. Ô CHỌN TRƯỜNG HỌC ÁP DỤNG TRONG 480 TRƯỜNG */}
            <div className="space-y-1.5 relative" ref={entityDropdownRef}>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Trường học áp dụng (Trong 480 trường phả hệ):</span>
                    </span>
                    {selectedSchool && (
                        <span className="text-xs text-indigo-600 font-bold font-mono">
                            Mã: {selectedSchool.school_code}
                        </span>
                    )}
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={entitySearchQuery}
                        onFocus={() => setIsEntityDropdownOpen(true)}
                        onChange={(e) => {
                            setEntitySearchQuery(e.target.value);
                            setIsEntityDropdownOpen(true);
                        }}
                        placeholder="Tìm kiếm trường học theo tên hoặc mã trường..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
                    />
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                </div>

                {isEntityDropdownOpen && (
                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1">
                        {schoolsList
                            .filter(
                                (s) =>
                                    s.school_name.toLowerCase().includes(entitySearchQuery.toLowerCase()) ||
                                    s.school_code.toLowerCase().includes(entitySearchQuery.toLowerCase())
                            )
                            .slice(0, 30)
                            .map((s) => (
                                <button
                                    key={s.school_code}
                                    type="button"
                                    onClick={() => {
                                        setSelectedSchool(s);
                                        setSelectedPartner({ name: s.partner_name, code: s.partner_code });
                                        setSelectedDistributor({ name: s.distributor_name, code: s.distributor_code });
                                        setEntitySearchQuery(s.school_name);
                                        setIsEntityDropdownOpen(false);
                                    }}
                                    className="w-full text-left p-3 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition"
                                >
                                    <div>
                                        <div className="font-bold text-slate-900 dark:text-white">{s.school_name}</div>
                                        <div className="text-[11px] text-slate-400 font-mono">
                                            Mã: {s.school_code} | Tuyến: {s.partner_name} ➔ {s.distributor_name}
                                        </div>
                                    </div>
                                    {selectedSchool?.school_code === s.school_code && (
                                        <Check className="w-4 h-4 text-indigo-600" />
                                    )}
                                </button>
                            ))}
                    </div>
                )}
            </div>

            {/* 4. CHỌN SUB-FLOW TẠO & DUYỆT */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                    { id: 'end_to_end', label: 'Trọn Gói Toàn Trình', desc: 'Trường ➔ Quản trị ➔ LMS' },
                    { id: 'partner_create_chain', label: 'Đối Tác Tạo & Duyệt', desc: 'Đối tác ➔ Quản trị' },
                    { id: 'distributor_create_chain', label: 'Nhà Phân Phối Tạo & Duyệt', desc: 'Nhà phân phối ➔ Quản trị' },
                ].map((sub) => (
                    <button
                        key={sub.id}
                        type="button"
                        onClick={() => setCreateApproveSubFlow(sub.id as any)}
                        className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${createApproveSubFlow === sub.id
                            ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50'
                            }`}
                    >
                        <p className={`text-xs font-bold ${createApproveSubFlow === sub.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}`}>
                            {sub.label}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{sub.desc}</p>
                    </button>
                ))}
            </div>
            {/* 4.5. THÔNG TIN LIÊN HỆ & GHI CHÚ BỔ SUNG KHI TẠO ORDER / CONTRACT */}
            <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 dark:from-slate-900 dark:via-indigo-950/20 dark:to-slate-900 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-indigo-100 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                        <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-indigo-600 text-white font-mono text-[10px]">
                            ℹ️
                        </span>
                        <span>Thông Tin Liên Hệ & Ghi Chú Đơn Hàng (Contact Info & Additional Information)</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Bắt buộc khi tạo Order/Contract</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* ĐẦU MỐI LIÊN HỆ */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Đầu Mối Liên Hệ (Contact Info):
                        </label>
                        <input
                            type="text"
                            value={contactInfo}
                            onChange={(e) => setContactInfo(e.target.value)}
                            placeholder="VD: Thầy Nguyễn Văn A - 0912345678 (admin@school.edu.vn)"
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-hidden transition"
                        />
                    </div>

                    {/* GHI CHÚ BỔ SUNG */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Ghi Chú Bổ Sung (Additional Information):
                        </label>
                        <textarea
                            rows={2}
                            value={additionalNotes}
                            onChange={(e) => setAdditionalNotes(e.target.value)}
                            placeholder="Ghi chú đơn hàng hoặc nội dung hợp đồng bổ sung..."
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-hidden resize-none"
                        />
                    </div>
                </div>
            </div>

            {/* 5. CẤU HÌNH DANH SÁCH KHÓA HỌC CẤP PHÉP (COURSE LICENSE BUILDER) */}
            <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <BookOpen className="h-4 w-4 text-indigo-600" />
                        <span>Danh Sách Khóa Học Cấp Phép ({selectedCourses.length} Môn):</span>
                    </div>
                    <button
                        type="button"
                        onClick={onAddCourseRow}
                        className="flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Thêm Môn Học</span>
                    </button>
                </div>

                {selectedCourses.map((cRow, idx) => (
                    <div
                        key={idx}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-4 space-y-3"
                    >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                            <span>Khóa học #{idx + 1}</span>
                            {selectedCourses.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => onRemoveCourseRow(idx)}
                                    className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500">Phân loại:</label>
                                <select
                                    value={cRow.category}
                                    onChange={(e) => {
                                        const cat = e.target.value;
                                        const match = workspaceCoursesList.filter((c) => c.category === cat);
                                        const first = match[0] || workspaceCoursesList[0];
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
                                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                                >
                                    {workspaceCategoriesList.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* BỘ TÌM KIẾM MÔN HỌC LINH HOẠT XUYÊN CATEGORY */}
                            <div className="sm:col-span-2 relative">
                                <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center justify-between">
                                    <span>Chọn môn học (Tìm kiếm mọi Category):</span>
                                    <span className="font-mono text-indigo-600 font-semibold">ID: {cRow.course_id}</span>
                                </label>

                                <div className="relative mt-1">
                                    <input
                                        type="text"
                                        value={
                                            activeCourseDropdownRow === idx
                                                ? (courseSearchTerms[idx] ?? '')
                                                : cRow.course_name
                                        }
                                        onFocus={() => {
                                            setActiveCourseDropdownRow(idx);
                                            setCourseSearchTerms((prev) => ({ ...prev, [idx]: '' }));
                                        }}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setCourseSearchTerms((prev) => ({ ...prev, [idx]: val }));
                                        }}
                                        placeholder="Gõ tên môn, mã ID, hoặc category để tìm..."
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white pr-8 focus:border-indigo-500 focus:outline-hidden"
                                    />
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                                </div>

                                {/* Popover gợi ý môn học */}
                                {activeCourseDropdownRow === idx && (
                                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-64 overflow-y-auto p-1.5 space-y-1 animate-in fade-in duration-100">
                                        <div className="flex items-center justify-between px-2 py-1 text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100 dark:border-slate-800">
                                            <span>Gợi ý môn học</span>
                                            <button
                                                type="button"
                                                onClick={() => setActiveCourseDropdownRow(null)}
                                                className="text-slate-400 hover:text-slate-600"
                                            >
                                                ✕ Đóng
                                            </button>
                                        </div>

                                        {workspaceCoursesList
                                            .filter((c) => {
                                                const term = (courseSearchTerms[idx] || '').trim().toLowerCase();
                                                if (!term) return true;
                                                return (
                                                    c.course_name.toLowerCase().includes(term) ||
                                                    c.category.toLowerCase().includes(term) ||
                                                    String(c.course_id).includes(term)
                                                );
                                            })
                                            .map((c) => {
                                                const isSameCategory = c.category === cRow.category;
                                                return (
                                                    <button
                                                        key={c.course_id}
                                                        type="button"
                                                        onClick={() => {
                                                            const updated = [...selectedCourses];
                                                            updated[idx] = {
                                                                ...updated[idx],
                                                                category: c.category,
                                                                course_id: c.course_id,
                                                                course_name: c.course_name,
                                                                lms_url: c.lms_url,
                                                            };
                                                            setSelectedCourses(updated);
                                                            setActiveCourseDropdownRow(null);
                                                            toast.success(`Đã chọn [${c.category}] - ${c.course_name}`);
                                                        }}
                                                        className="w-full text-left p-2.5 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                                                    >
                                                        <div className="truncate pr-2">
                                                            <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                                                {c.course_name}
                                                            </div>
                                                            <div className="text-[10px] font-mono flex items-center gap-1.5 mt-0.5">
                                                                <span
                                                                    className={`px-1.5 py-0.2 rounded font-bold ${isSameCategory
                                                                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                                                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                                        }`}
                                                                >
                                                                    {c.category}
                                                                </span>
                                                                <span className="text-slate-400">ID: {c.course_id}</span>
                                                            </div>
                                                        </div>
                                                        {cRow.course_id === c.course_id && (
                                                            <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500">Số lượng giấy phép:</label>
                                <input
                                    type="number"
                                    value={cRow.licenses}
                                    min={1}
                                    onChange={(e) => {
                                        const updated = [...selectedCourses];
                                        updated[idx].licenses = parseInt(e.target.value) || 1;
                                        setSelectedCourses(updated);
                                    }}
                                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500">Ngày bắt đầu:</label>
                                <input
                                    type="text"
                                    value={cRow.start_date}
                                    placeholder="dd-mm-yyyy"
                                    onChange={(e) => {
                                        const updated = [...selectedCourses];
                                        updated[idx].start_date = e.target.value;
                                        setSelectedCourses(updated);
                                    }}
                                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500">Ngày kết thúc:</label>
                                <input
                                    type="text"
                                    value={cRow.end_date}
                                    placeholder="dd-mm-yyyy"
                                    onChange={(e) => {
                                        const updated = [...selectedCourses];
                                        updated[idx].end_date = e.target.value;
                                        setSelectedCourses(updated);
                                    }}
                                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};