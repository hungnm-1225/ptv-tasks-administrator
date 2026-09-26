import React, { useState, useRef, useEffect, useMemo } from 'react';
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
    DollarSign,
    Infinity as InfinityIcon,
    ChevronDown,
    UserCheck,
    GraduationCap,
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
    // 1. Quản lý kéo thả lớp
    const [draggedClassInfo, setDraggedClassInfo] = useState<{
        sourceTrayId: string | null;
        classItem: ClassGroupItem;
    } | null>(null);
    const [activeDropTrayId, setActiveDropTrayId] = useState<string | null>(null);
    const [isDropToUnassignedActive, setIsDropToUnassignedActive] = useState<boolean>(false);

    // 2. Ref cho input file
    const cofFileInputRef = useRef<HTMLInputElement | null>(null);

    // 3. Combobox tìm kiếm đối tượng
    const [entitySearchQuery, setEntitySearchQuery] = useState<string>('');
    const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState<boolean>(false);
    const entityDropdownRef = useRef<HTMLDivElement | null>(null);

    // 4. Tìm kiếm môn học
    const [courseSearchTerms, setCourseSearchTerms] = useState<Record<number, string>>({});
    const [activeCourseDropdownRow, setActiveCourseDropdownRow] = useState<number | null>(null);

    // 5. State cho Popover Gán Giáo Viên nhanh trong thẻ lớp
    const [activeTeacherPopoverGroup, setActiveTeacherPopoverGroup] = useState<string | null>(null);

    const isContractFlow = createApproveSubFlow === 'partner_create_chain' || createApproveSubFlow === 'distributor_create_chain';

    // 6. Danh sách Đối tác & Nhà phân phối duy nhất
    const uniquePartners = useMemo(() => {
        const map = new Map<string, { name: string; code: string; distributor_name: string; distributor_code: string }>();
        schoolsList.forEach((s) => {
            if (s.partner_code && s.partner_name && !map.has(s.partner_code)) {
                map.set(s.partner_code, {
                    name: s.partner_name,
                    code: s.partner_code,
                    distributor_name: s.distributor_name,
                    distributor_code: s.distributor_code,
                });
            }
        });
        return Array.from(map.values());
    }, [schoolsList]);

    const uniqueDistributors = useMemo(() => {
        const map = new Map<string, { name: string; code: string }>();
        schoolsList.forEach((s) => {
            if (s.distributor_code && s.distributor_name && !map.has(s.distributor_code)) {
                map.set(s.distributor_code, {
                    name: s.distributor_name,
                    code: s.distributor_code,
                });
            }
        });
        return Array.from(map.values());
    }, [schoolsList]);

    // Đồng bộ input hiển thị trường học
    useEffect(() => {
        if (createApproveSubFlow === 'end_to_end') {
            setEntitySearchQuery(selectedSchool ? selectedSchool.school_name : '');
        }
    }, [selectedSchool, createApproveSubFlow]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
                setIsEntityDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 7. Helpers xử lý gán & gỡ Giáo viên thời gian thực
    const getTeachersForGroup = (lmsGroupName: string) => {
        return cofTeachersAllocation.filter((t) => t.assignedLmsGroups.includes(lmsGroupName));
    };

    const toggleTeacherInGroup = (teacherEmail: string, lmsGroupName: string, teacherName: string) => {
        setCofTeachersAllocation((prev) =>
            prev.map((t) => {
                if (t.email !== teacherEmail) return t;
                const exists = t.assignedLmsGroups.includes(lmsGroupName);
                const nextGroups = exists
                    ? t.assignedLmsGroups.filter((g) => g !== lmsGroupName)
                    : [...t.assignedLmsGroups, lmsGroupName];

                if (!exists) {
                    toast.success(`Đã gán GV ${teacherName} vào nhóm '${lmsGroupName}'`);
                } else {
                    toast.info(`Đã gỡ GV ${teacherName} khỏi nhóm '${lmsGroupName}'`);
                }

                return { ...t, assignedLmsGroups: nextGroups };
            })
        );
    };

    const assignTeacherToAllTrayGroups = (teacherEmail: string, trayGroupNames: string[], teacherName: string) => {
        setCofTeachersAllocation((prev) =>
            prev.map((t) => {
                if (t.email !== teacherEmail) return t;
                const merged = Array.from(new Set([...t.assignedLmsGroups, ...trayGroupNames]));
                return { ...t, assignedLmsGroups: merged };
            })
        );
        toast.success(`Đã gán GV ${teacherName} vào toàn bộ lớp trong khay!`);
    };

    const clearTeacherAllGroups = (teacherEmail: string, teacherName: string) => {
        setCofTeachersAllocation((prev) =>
            prev.map((t) => {
                if (t.email !== teacherEmail) return t;
                return { ...t, assignedLmsGroups: [] };
            })
        );
        toast.info(`Đã gỡ tất cả nhóm của GV ${teacherName}`);
    };

    // 8. Tính toán tổng ngân sách thời gian thực
    const totalOrderLicenses = useMemo(() => {
        return selectedCourses.reduce((sum, c) => sum + (Number(c.licenses) || 0), 0);
    }, [selectedCourses]);

    const totalOrderAmount = useMemo(() => {
        return selectedCourses.reduce((sum, c) => {
            const price = Number((c as any).unit_price) || 0;
            const count = Number(c.licenses) || 0;
            return sum + price * count;
        }, 0);
    }, [selectedCourses]);

    return (
        <div className="space-y-5 pt-2">
            {/* ========================================================================= */}
            {/* 1. KHU VỰC NỘP FILE ĐỂ AUTO-FILL (HỖ TRỢ CẢ COF VÀ BULK ACCOUNTS FORM)     */}
            {/* ========================================================================= */}
            {createApproveSubFlow === 'end_to_end' && (
                <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                                <FileCheck2 className="h-5 w-5 text-amber-300" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <span>Nộp File COF hoặc Phôi Bulk Account Tự Động Điền Dữ Liệu</span>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                                        Auto-Fill AI Engine
                                    </span>
                                </h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Hệ thống hỗ trợ cả file COF 3 Tabs và file Bulk Account Request Form (đa sheet theo khối lớp).
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
                                <span>Xóa file</span>
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
                                    {uploadedCofFile ? uploadedCofFile.name : 'Nhấp hoặc Kéo thả file COF / Bulk Accounts (.xlsx) vào đây'}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    Hỗ trợ COF 3 Tabs hoặc Account Creation Request Form (Class 7s, Class 8a...)
                                </p>
                            </div>
                        </div>
                        <span className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-xs font-bold">
                            {uploadedCofFile ? 'Đổi File' : 'Chọn File'}
                        </span>
                    </div>

                    {/* BÁO CÁO KẾT QUẢ ĐỐI SOÁT TRƯỜNG & LOẠI PHÔI */}
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
                                        {cofExtractionResult.confidence === 'medium' && 'CẢNH BÁO: KHỚP TRƯỜNG GẦN ĐÚNG'}
                                        {cofExtractionResult.confidence === 'none' && 'LỖI: KHÔNG TÌM THẤY TRƯỜNG TRONG 480 TRƯỜNG'}
                                    </span>
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-white/80 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                        Phôi: {cofExtractionResult.fileType === 'BULK_ACCOUNTS' ? 'Bulk Accounts Form' : 'Curriculum Order Form (COF)'}
                                    </span>
                                    <span className="font-mono text-[11px] font-extrabold">
                                        {Math.round(cofExtractionResult.score * 100)}% Match
                                    </span>
                                </div>
                            </div>

                            <div className="text-[11px] space-y-1">
                                <p>• Tên nhận diện: <b>"{cofExtractionResult.rawSchoolName || 'Chưa xác định từ file'}"</b></p>
                                {cofExtractionResult.matchedSchool ? (
                                    <p>
                                        • Trường xác định: <b>{cofExtractionResult.matchedSchool.school_name}</b> (Mã: {cofExtractionResult.matchedSchool.school_code})
                                    </p>
                                ) : (
                                    <p className="text-rose-600 font-bold">• Vui lòng tự tìm và chọn trường ở danh sách bên dưới!</p>
                                )}
                                <p>
                                    • Đã phân tích: <b>{cofExtractionResult.coursesCount} Môn học</b> | {cofExtractionResult.studentsCount} Học sinh | {cofExtractionResult.teachersCount} Giáo viên.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* 2. GIAO DIỆN KHAY KHÓA HỌC & XẾP LỚP (CÓ GIÁO VIÊN TÍCH HỢP TRỰC TIẾP)      */}
            {/* ========================================================================= */}
            {uploadedCofFile && cofTrays.length > 0 && (
                <div className="rounded-3xl border border-indigo-200 dark:border-indigo-900 bg-gradient-to-b from-indigo-50/40 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 p-5 sm:p-6 space-y-5 shadow-xs">
                    {/* Header Khay Phân Bổ */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100 dark:border-slate-800 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
                                <Sparkles className="h-5 w-5 text-amber-300" />
                            </div>
                            <div>
                                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                    <span>KHAY PHÂN BỔ KHÓA HỌC & GIẤY PHÉP</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                        DRAG & DROP ENGINE
                                    </span>
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Kéo thả các thẻ lớp học trực tiếp vào khay hoặc dùng nút bấm nhanh để khớp đủ 100% hạn ngạch.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-mono font-bold">
                            <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Hạn Ngạch: {cofTrays.reduce((sum, t) => sum + t.quota, 0)} licenses
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

                            // Danh sách tên Group LMS trong khay này
                            const trayGroupNames = tray.assignedClasses.map((c) => c.lmsGroupName);

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
                                        toast.success(`Đã xếp lớp '${classItem.rawClassName}' vào Khay #${tray.courseId}!`);
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
                                                {isOverflow ? `TRÀN +${Math.abs(diff)}` : isExact ? 'KHỚP 100%' : `DƯ ${diff} CHỖ`}
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
                                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                <span>CÁC LỚP TRONG KHAY ({tray.assignedClasses.length} LỚP):</span>
                                                <span className="text-[9px] lowercase font-normal italic text-slate-400">kéo để chuyển khay</span>
                                            </div>

                                            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                                                {tray.assignedClasses.length === 0 ? (
                                                    <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-400 italic">
                                                        Thả các lớp học từ bên dưới vào đây
                                                    </div>
                                                ) : (
                                                    tray.assignedClasses.map((clsItem) => {
                                                        const classTeachers = getTeachersForGroup(clsItem.lmsGroupName);
                                                        const isPopoverOpen = activeTeacherPopoverGroup === clsItem.lmsGroupName;

                                                        return (
                                                            <div
                                                                key={clsItem.rawClassName}
                                                                draggable
                                                                onDragStart={(e) => {
                                                                    setDraggedClassInfo({ sourceTrayId: tray.courseId, classItem: clsItem });
                                                                    e.dataTransfer.setData('text/plain', clsItem.rawClassName);
                                                                }}
                                                                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-xs cursor-grab active:cursor-grabbing hover:border-indigo-400 hover:shadow-2xs transition space-y-1.5"
                                                            >
                                                                {/* Tên Lớp & Nút Thao Tác */}
                                                                <div className="flex items-center justify-between">
                                                                    <div className="min-w-0 pr-2">
                                                                        <p className="font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                                                                            <span className="text-slate-400">⠿</span>
                                                                            <span>{clsItem.rawClassName}</span>
                                                                        </p>
                                                                        <p className="text-[10px] text-slate-400 font-mono truncate pl-3" title={clsItem.lmsGroupName}>
                                                                            Group: {clsItem.lmsGroupName}
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
                                                                                        next[tray.courseId] = next[tray.courseId].filter(
                                                                                            (c) => c.rawClassName !== clsItem.rawClassName
                                                                                        );
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

                                                                {/* 🎯 HÀNG GIÁO VIÊN GẮN TRỰC TIẾP TRONG THẺ LỚP */}
                                                                <div className="flex flex-wrap items-center gap-1 pl-3 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 text-[10px] relative">
                                                                    <span className="font-semibold text-slate-400 flex items-center gap-0.5">
                                                                        <GraduationCap className="w-3 h-3 text-indigo-500" />
                                                                        <span>GV:</span>
                                                                    </span>

                                                                    {classTeachers.length === 0 ? (
                                                                        <span className="text-[10px] text-amber-500 dark:text-amber-400 italic">
                                                                            Chưa có GV
                                                                        </span>
                                                                    ) : (
                                                                        classTeachers.map((t) => (
                                                                            <span
                                                                                key={t.email}
                                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200/60 dark:border-indigo-800"
                                                                            >
                                                                                <span className="truncate max-w-[85px]" title={t.teacherName}>
                                                                                    {t.teacherName}
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        toggleTeacherInGroup(t.email, clsItem.lmsGroupName, t.teacherName);
                                                                                    }}
                                                                                    className="text-slate-400 hover:text-rose-500 font-bold ml-0.5 cursor-pointer"
                                                                                    title="Gỡ GV khỏi group này"
                                                                                >
                                                                                    ×
                                                                                </button>
                                                                            </span>
                                                                        ))
                                                                    )}

                                                                    {/* Nút bấm mở menu Gán Giáo Viên nhanh */}
                                                                    <div className="relative inline-block ml-auto">
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setActiveTeacherPopoverGroup(isPopoverOpen ? null : clsItem.lmsGroupName);
                                                                            }}
                                                                            className="px-1.5 py-0.5 rounded-md bg-slate-200/70 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-indigo-950 dark:hover:text-indigo-300 font-bold text-[9px] transition cursor-pointer flex items-center gap-0.5"
                                                                        >
                                                                            <Plus className="w-2.5 h-2.5" />
                                                                            <span>Gán GV</span>
                                                                        </button>

                                                                        {/* Popover danh sách GV để chọn nhanh */}
                                                                        {isPopoverOpen && (
                                                                            <div
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className="absolute z-40 right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100"
                                                                            >
                                                                                <div className="px-2 py-1 text-[9px] font-bold uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                                                                    <span>Chọn GV cho lớp</span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setActiveTeacherPopoverGroup(null)}
                                                                                        className="text-slate-400 hover:text-slate-600"
                                                                                    >
                                                                                        ✕
                                                                                    </button>
                                                                                </div>

                                                                                {cofTeachersAllocation.length === 0 ? (
                                                                                    <div className="p-2 text-center text-[10px] text-slate-400 italic">
                                                                                        Không có GV nào trong danh sách
                                                                                    </div>
                                                                                ) : (
                                                                                    cofTeachersAllocation.map((t) => {
                                                                                        const isAssigned = t.assignedLmsGroups.includes(clsItem.lmsGroupName);
                                                                                        return (
                                                                                            <button
                                                                                                key={t.email}
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    toggleTeacherInGroup(t.email, clsItem.lmsGroupName, t.teacherName);
                                                                                                }}
                                                                                                className={`w-full text-left p-1.5 rounded-lg text-[10px] flex items-center justify-between transition cursor-pointer ${isAssigned
                                                                                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 font-bold text-indigo-700 dark:text-indigo-300'
                                                                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                                                                                    }`}
                                                                                            >
                                                                                                <span className="truncate pr-1">{t.teacherName}</span>
                                                                                                {isAssigned && <Check className="w-3 h-3 text-indigo-600 shrink-0" />}
                                                                                            </button>
                                                                                        );
                                                                                    })
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 2.2. HÀNG ĐỢI LỚP CHƯA XẾP VÀO KHAY (CÓ DROPDOWN CHỌN NHANH) */}
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
                                    Các Khối Lớp Chưa Xếp Vào Khay ({cofUnassignedClasses.length} lớp - {cofUnassignedClasses.reduce((s, c) => s + c.studentsCount, 0)} học sinh):
                                </h5>
                            </div>
                            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium italic">
                                👉 Nhấp chọn khay để đưa lớp vào, hoặc nắm kéo thả
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
                                        className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 flex items-center justify-between gap-2.5 text-xs shadow-2xs hover:border-amber-400 cursor-grab active:cursor-grabbing transition"
                                    >
                                        <div className="min-w-0 pr-2">
                                            <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate">
                                                <span className="text-slate-400">⠿</span>
                                                <span>{uCls.rawClassName || 'Chưa phân lớp'}</span>
                                            </p>
                                            <span className="text-[10px] text-slate-400 font-mono pl-3">
                                                {uCls.studentsCount} học sinh {uCls.gradeDetected ? `(Khối ${uCls.gradeDetected})` : ''}
                                            </span>
                                        </div>

                                        {/* NÚT SELECT DROPDOWN XẾP NHANH VÀO KHAY */}
                                        <div className="relative shrink-0">
                                            <select
                                                defaultValue=""
                                                onChange={(e) => {
                                                    const targetTrayId = e.target.value;
                                                    if (!targetTrayId) return;

                                                    setCofClassAssignments((prev) => ({
                                                        ...prev,
                                                        [targetTrayId]: [...(prev[targetTrayId] || []), uCls],
                                                    }));
                                                    setCofUnassignedClasses((prev) => prev.filter((c) => c.rawClassName !== uCls.rawClassName));
                                                    toast.success(`Đã xếp lớp '${uCls.rawClassName}' vào Khay #${targetTrayId}!`);
                                                }}
                                                className="appearance-none px-3 py-1.5 pr-7 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono text-[11px] font-bold hover:bg-indigo-100 transition cursor-pointer outline-hidden"
                                            >
                                                <option value="" disabled>+ Xếp vào Khay...</option>
                                                {cofTrays.map((t) => (
                                                    <option key={t.courseId} value={t.courseId}>
                                                        Khay #{t.courseId} ({t.quota - t.assignedStudentsCount} slots)
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className="w-3.5 h-3.5 text-indigo-500 absolute right-2 top-2.5 pointer-events-none" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 2.3. TRẠM ĐIỀU PHỐI GIÁO VIÊN THÔNG MINH (INTERACTIVE TEACHER HUB) */}
                    {cofTeachersAllocation.length > 0 && (
                        <div className="p-4.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs border-b border-slate-200/60 dark:border-slate-800 pb-2">
                                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-indigo-600" />
                                    <span>Trạm Điều Phối Giáo Viên ({cofTeachersAllocation.length} GV - Không tốn License):</span>
                                </span>
                                <span className="text-[11px] text-slate-400 italic">
                                    Bấm vào thẻ để cấu hình chi tiết, hoặc dùng nút thao tác nhanh bên cạnh.
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                                {cofTeachersAllocation.map((t, tIdx) => {
                                    const hasGroups = t.assignedLmsGroups.length > 0;
                                    const allSchoolGroupNames = cofTrays.flatMap((tray) =>
                                        tray.assignedClasses.map((c) => c.lmsGroupName)
                                    );

                                    return (
                                        <div
                                            key={tIdx}
                                            className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 text-xs shadow-2xs transition flex flex-col justify-between space-y-2 group"
                                        >
                                            <div
                                                onClick={() => setEditingTeacherIndex(tIdx)}
                                                className="cursor-pointer space-y-1"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <p className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 truncate flex items-center gap-1">
                                                        <span>🧑‍🏫</span>
                                                        <span className="truncate">{t.teacherName}</span>
                                                    </p>
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold ${hasGroups
                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                                            }`}
                                                    >
                                                        {hasGroups ? `✓ ${t.assignedLmsGroups.length} groups` : 'Chưa gán'}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-400 font-mono truncate" title={t.email}>
                                                    {t.email}
                                                </p>
                                            </div>

                                            {/* Thao tác 1-Click gán nhanh */}
                                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        assignTeacherToAllTrayGroups(t.email, allSchoolGroupNames, t.teacherName)
                                                    }
                                                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                                                    title="Gán thầy/cô này vào tất cả các lớp của trường"
                                                >
                                                    <UserCheck className="w-3 h-3" />
                                                    <span>Gán hết lớp</span>
                                                </button>

                                                {hasGroups && (
                                                    <button
                                                        type="button"
                                                        onClick={() => clearTeacherAllGroups(t.email, t.teacherName)}
                                                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                                        title="Gỡ khỏi tất cả nhóm"
                                                    >
                                                        Bỏ gán
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* MODAL PHÂN BỔ GIÁO VIÊN TOÀN DIỆN */}
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

            {/* ========================================================================= */}
            {/* 3. CHỌN SUB-FLOW TẠO & DUYỆT (SCHOOL ORDER vs PRT CONTRACT vs DST CONTRACT) */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                    { id: 'end_to_end', label: '1. School Order (Trường Học)', desc: 'Cấp theo niên khóa cho Trường' },
                    { id: 'partner_create_chain', label: '2. PRT Contract (Đối Tác)', desc: 'Hạn ngạch vĩnh viễn cấp vào kho' },
                    { id: 'distributor_create_chain', label: '3. DST Contract (Nhà Phân Phối)', desc: 'Hạn ngạch vĩnh viễn cấp vào kho' },
                ].map((sub) => (
                    <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                            setCreateApproveSubFlow(sub.id as any);
                            setEntitySearchQuery('');
                        }}
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

            {/* ========================================================================= */}
            {/* 4. CHỌN ĐỐI TƯỢNG ÁP DỤNG (School vs Partner vs Distributor)              */}
            {/* ========================================================================= */}
            <div className="space-y-1.5 relative" ref={entityDropdownRef}>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                        <span>
                            {createApproveSubFlow === 'end_to_end' && 'Trường học áp dụng (School):'}
                            {createApproveSubFlow === 'partner_create_chain' && 'Đối tác tạo hợp đồng (Partner):'}
                            {createApproveSubFlow === 'distributor_create_chain' && 'Nhà phân phối tạo hợp đồng (Distributor):'}
                        </span>
                    </span>
                    {createApproveSubFlow === 'end_to_end' && selectedSchool && (
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
                        placeholder={
                            createApproveSubFlow === 'end_to_end'
                                ? 'Tìm kiếm trường học theo tên hoặc mã trường...'
                                : createApproveSubFlow === 'partner_create_chain'
                                    ? 'Tìm kiếm đối tác (Partner)...'
                                    : 'Tìm kiếm nhà phân phối (Distributor)...'
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
                    />
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                </div>

                {isEntityDropdownOpen && (
                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1">
                        {createApproveSubFlow === 'end_to_end' &&
                            schoolsList
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

                        {createApproveSubFlow === 'partner_create_chain' &&
                            uniquePartners
                                .filter(
                                    (p) =>
                                        p.name.toLowerCase().includes(entitySearchQuery.toLowerCase()) ||
                                        p.code.toLowerCase().includes(entitySearchQuery.toLowerCase())
                                )
                                .map((p) => (
                                    <button
                                        key={p.code}
                                        type="button"
                                        onClick={() => {
                                            setSelectedPartner({ name: p.name, code: p.code });
                                            setSelectedDistributor({ name: p.distributor_name, code: p.distributor_code });
                                            setSelectedSchool(null);
                                            setEntitySearchQuery(p.name);
                                            setIsEntityDropdownOpen(false);
                                            toast.success(`Đã chọn Đối tác: ${p.name}`);
                                        }}
                                        className="w-full text-left p-3 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition"
                                    >
                                        <div>
                                            <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                                            <div className="text-[11px] text-slate-400 font-mono">
                                                Mã: {p.code} | Cấp trên: {p.distributor_name}
                                            </div>
                                        </div>
                                    </button>
                                ))}

                        {createApproveSubFlow === 'distributor_create_chain' &&
                            uniqueDistributors
                                .filter(
                                    (d) =>
                                        d.name.toLowerCase().includes(entitySearchQuery.toLowerCase()) ||
                                        d.code.toLowerCase().includes(entitySearchQuery.toLowerCase())
                                )
                                .map((d) => (
                                    <button
                                        key={d.code}
                                        type="button"
                                        onClick={() => {
                                            setSelectedDistributor({ name: d.name, code: d.code });
                                            setSelectedPartner(null);
                                            setSelectedSchool(null);
                                            setEntitySearchQuery(d.name);
                                            setIsEntityDropdownOpen(false);
                                            toast.success(`Đã chọn Nhà phân phối: ${d.name}`);
                                        }}
                                        className="w-full text-left p-3 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition"
                                    >
                                        <div>
                                            <div className="font-bold text-slate-900 dark:text-white">{d.name}</div>
                                            <div className="text-[11px] text-slate-400 font-mono">
                                                Mã: {d.code} | Người nhận duyệt: Sales Admin
                                            </div>
                                        </div>
                                    </button>
                                ))}
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* 5. THÔNG TIN LIÊN HỆ & GHI CHÚ BỔ SUNG                                    */}
            {/* ========================================================================= */}
            <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 dark:from-slate-900 dark:via-indigo-950/20 dark:to-slate-900 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-indigo-100 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                        <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-indigo-600 text-white font-mono text-[10px]">
                            ℹ️
                        </span>
                        <span>Thông Tin Liên Hệ & Ghi Chú Đơn Hàng</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Đầu Mối Liên Hệ (Contact Info):
                        </label>
                        <input
                            type="text"
                            value={contactInfo}
                            onChange={(e) => setContactInfo(e.target.value)}
                            placeholder="VD: Nguyễn Văn A - 0912345678 (admin@school.edu.vn)"
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-hidden"
                        />
                    </div>

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

            {/* ========================================================================= */}
            {/* 6. DANH SÁCH KHÓA HỌC, ĐƠN GIÁ & TÍNH TIỀN (REAL-TIME RECALCULATION)      */}
            {/* ========================================================================= */}
            <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <BookOpen className="h-4 w-4 text-indigo-600" />
                        <span>Danh Sách Khóa Học Cấp Phép ({selectedCourses.length} Môn):</span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Box tổng kết tài chính */}
                        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs">
                            <span className="text-slate-500">Tổng: <b>{totalOrderLicenses}</b> licenses</span>
                            <span className="text-slate-300">|</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <DollarSign className="w-3.5 h-3.5" />
                                {totalOrderAmount.toLocaleString()}
                            </span>
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
                </div>

                {selectedCourses.map((cRow, idx) => {
                    const rowUnitPrice = Number((cRow as any).unit_price) || 0;
                    const rowLicenses = Number(cRow.licenses) || 0;
                    const rowTotalAmount = rowUnitPrice * rowLicenses;

                    return (
                        <div
                            key={idx}
                            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-4 space-y-3"
                        >
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                                <span>Khóa học #{idx + 1}</span>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                                        Thành tiền: {rowTotalAmount.toLocaleString()}
                                    </span>
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

                                <div className="sm:col-span-2 relative">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center justify-between">
                                        <span>Chọn môn học:</span>
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
                                            placeholder="Gõ tên môn hoặc ID để tìm..."
                                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white pr-8 focus:border-indigo-500 focus:outline-hidden"
                                        />
                                        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                                    </div>

                                    {activeCourseDropdownRow === idx && (
                                        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-64 overflow-y-auto p-1.5 space-y-1">
                                            <div className="flex items-center justify-between px-2 py-1 text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100 dark:border-slate-800">
                                                <span>Gợi ý môn học</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveCourseDropdownRow(null)}
                                                    className="text-slate-400 hover:text-slate-600"
                                                >
                                                    ✕
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
                                                .map((c) => (
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
                                                        }}
                                                        className="w-full text-left p-2.5 rounded-xl text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                                                    >
                                                        <div className="truncate pr-2">
                                                            <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                                                {c.course_name}
                                                            </div>
                                                            <div className="text-[10px] font-mono text-slate-400">
                                                                [{c.category}] ID: #{c.course_id}
                                                            </div>
                                                        </div>
                                                        {cRow.course_id === c.course_id && (
                                                            <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                                                        )}
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* CẤU HÌNH SỐ LƯỢNG, ĐƠN GIÁ & NGÀY THÁNG */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500">Số lượng license:</label>
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
                                    <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                                        <span>Đơn giá / License:</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={(cRow as any).unit_price ?? 0}
                                        min={0}
                                        step={1}
                                        placeholder="0"
                                        onChange={(e) => {
                                            const updated = [...selectedCourses];
                                            const val = parseFloat(e.target.value) || 0;
                                            (updated[idx] as any).unit_price = val;
                                            (updated[idx] as any).total_amount = val * (updated[idx].licenses || 1);
                                            setSelectedCourses(updated);
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:border-emerald-500 focus:outline-hidden"
                                    />
                                </div>

                                {!isContractFlow ? (
                                    <>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-slate-500">Ngày bắt đầu:</label>
                                            <input
                                                type="text"
                                                value={cRow.start_date || '2026-09-16'}
                                                placeholder="YYYY-MM-DD"
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
                                                value={cRow.end_date || '2027-09-16'}
                                                placeholder="YYYY-MM-DD"
                                                onChange={(e) => {
                                                    const updated = [...selectedCourses];
                                                    updated[idx].end_date = e.target.value;
                                                    setSelectedCourses(updated);
                                                }}
                                                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="sm:col-span-2 flex items-center gap-2 p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs">
                                        <InfinityIcon className="w-4 h-4 shrink-0 text-indigo-500" />
                                        <span className="font-semibold">
                                            Hạn ngạch vĩnh viễn: License cấp vào kho Pool không có thời hạn kết thúc.
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};