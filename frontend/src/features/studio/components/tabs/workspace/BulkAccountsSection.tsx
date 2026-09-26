// frontend/src/features/studio/components/tabs/workspace/BulkAccountsSection.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
    Building2,
    Search,
    Check,
    Users,
    Trash2,
    Upload,
    CheckCircle2,
    AlertCircle,
    Zap,
    Loader2,
    FileCheck2,
    Download,
    Clock,
    Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    HierarchySchoolItem,
    ParsedUserRow,
    AccountValidationStats,
    LiveExecutedTask,
} from '../../../types';

interface BulkAccountsSectionProps {
    selectedSchool: HierarchySchoolItem | null;
    setSelectedSchool: (s: HierarchySchoolItem | null) => void;
    setSelectedPartner: (p: { name: string; code: string } | null) => void;
    setSelectedDistributor: (d: { name: string; code: string } | null) => void;
    schoolsList: HierarchySchoolItem[];
    uploadedAccountsFile: File | null;
    setUploadedAccountsFile: (f: File | null) => void;
    parsedAccountRows: ParsedUserRow[];
    setParsedAccountRows: (rows: ParsedUserRow[]) => void;
    accountValidationStats: AccountValidationStats;
    onProcessAccountsFile: (f: File) => void;
    liveExecutedTask: LiveExecutedTask | null;
}

export const BulkAccountsSection: React.FC<BulkAccountsSectionProps> = ({
    selectedSchool,
    setSelectedSchool,
    setSelectedPartner,
    setSelectedDistributor,
    schoolsList,
    uploadedAccountsFile,
    setUploadedAccountsFile,
    parsedAccountRows,
    setParsedAccountRows,
    accountValidationStats,
    onProcessAccountsFile,
    liveExecutedTask,
}) => {
    const [entitySearchQuery, setEntitySearchQuery] = useState<string>(
        selectedSchool ? selectedSchool.school_name : ''
    );
    const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState<boolean>(false);
    const entityDropdownRef = useRef<HTMLDivElement | null>(null);

    const [isDragging, setIsDragging] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
                setIsEntityDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 🎯 TÍNH TOÁN THỜI GIAN ƯỚC TÍNH (15S / TÀI KHOẢN HỢP LỆ, TỐI THIỂU 30S)
    const validAccountsCount = accountValidationStats.validCount || parsedAccountRows.length || 0;
    const totalEstimatedSeconds = Math.max(validAccountsCount * 15, 30);
    const estMinutes = Math.floor(totalEstimatedSeconds / 60);
    const estRemainingSecs = totalEstimatedSeconds % 60;
    const formattedEtaText = estMinutes > 0
        ? `~${estMinutes} phút${estRemainingSecs > 0 ? ` ${estRemainingSecs}s` : ''}`
        : `~${estRemainingSecs} giây`;

    return (
        <div className="space-y-5 pt-2">
            {/* 1. Ô CHỌN TRƯỜNG HỌC THỤ HƯỞNG (480 TRƯỜNG PHẢ HỆ) */}
            <div className="space-y-1.5 relative" ref={entityDropdownRef}>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 text-indigo-600" />
                        <span>Trường Học Thụ Hưởng Tài Khoản: <span className="text-rose-500">* (Bắt buộc)</span></span>
                    </span>
                    {selectedSchool && (
                        <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold font-mono">
                            Mã Trường: {selectedSchool.school_code}
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
                        placeholder="Gõ tên trường hoặc mã trường để chọn (VD: Vinschool, FPT, Master...)"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden transition"
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
                                        toast.success(`Đã chọn trường: ${s.school_name}`);
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

            {/* 2. KHU VỰC TẢI FILE EXCEL */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                            <Users className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                                Nộp File Excel Danh Sách Học Sinh / Giáo Viên
                            </h3>
                            <p className="text-[11px] text-slate-500">
                                Hỗ trợ file định dạng chuẩn 6-7 cột (.xlsx, .xls)
                            </p>
                        </div>
                    </div>

                    {uploadedAccountsFile && (
                        <button
                            type="button"
                            onClick={() => {
                                setUploadedAccountsFile(null);
                                setParsedAccountRows([]);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa file</span>
                        </button>
                    )}
                </div>

                <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setUploadedAccountsFile(file);
                            onProcessAccountsFile(file);
                        }
                    }}
                    className="hidden"
                />

                <div
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.[0]) {
                            const file = e.dataTransfer.files[0];
                            setUploadedAccountsFile(file);
                            onProcessAccountsFile(file);
                        }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${isDragging
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/80 hover:border-indigo-400'
                        }`}
                >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 mb-2.5">
                        <Upload className="h-5 w-5" />
                    </div>

                    {uploadedAccountsFile ? (
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                                {uploadedAccountsFile.name} ({Math.round(uploadedAccountsFile.size / 1024)} KB)
                            </p>
                            <p className="text-[11px] text-emerald-600 font-semibold flex items-center justify-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Đã phân tích xong nội dung file! Nhấp để đổi file khác</span>
                            </p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                Bấm hoặc kéo thả file Excel (.xlsx) vào đây
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                                Chuẩn cột: First Name (*) | Last Name (*) | Mobile (Opt) | Email (*) | DOB (*) | Role (*)
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. BẢNG THỐNG KÊ (5 BENTO CARDS KÈM THỜI GIAN ƯỚC TÍNH) & PREVIEW EXCEL */}
            {parsedAccountRows.length > 0 && (
                <div className="space-y-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Tổng Tài Khoản</p>
                            <p className="text-lg font-mono font-extrabold text-slate-900 dark:text-white">
                                {accountValidationStats.total}
                            </p>
                            <p className="text-[10px] text-slate-500">
                                👨‍🎓 {accountValidationStats.students} HS | 🧑‍🏫 {accountValidationStats.teachers} GV
                            </p>
                        </div>

                        <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Hợp Lệ</p>
                            <p className="text-lg font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                                {accountValidationStats.validCount}
                            </p>
                            <p className="text-[10px] text-emerald-600/80">Sẵn sàng tạo</p>
                        </div>

                        <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                            <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Thiếu Thông Tin</p>
                            <p className="text-lg font-mono font-extrabold text-rose-600 dark:text-rose-400">
                                {accountValidationStats.errorCount}
                            </p>
                            <p className="text-[10px] text-rose-500">Cần bổ sung</p>
                        </div>

                        <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Trùng Lặp Email</p>
                            <p className="text-lg font-mono font-extrabold text-amber-600 dark:text-amber-400">
                                {accountValidationStats.duplicateCount}
                            </p>
                            <p className="text-[10px] text-amber-600">Trong file</p>
                        </div>

                        {/* 🎯 BENTO CARD THỨ 5: THỜI GIAN ƯỚC TÍNH HOÀN THÀNH */}
                        <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 col-span-2 sm:col-span-1 shadow-2xs">
                            <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1">
                                <Timer className="w-3 h-3" />
                                <span>Ước Tính Xử Lý</span>
                            </p>
                            <p className="text-lg font-mono font-extrabold text-indigo-600 dark:text-indigo-300">
                                {formattedEtaText}
                            </p>
                            <p className="text-[10px] text-indigo-500/80 font-medium">⏱️ Chuẩn 15s / tài khoản</p>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                            <span>XEM TRƯỚC DANH SÁCH TÀI KHOẢN ({parsedAccountRows.length} DÒNG):</span>
                            <span className="text-[11px] text-slate-400 font-normal">
                                *Học sinh được phép bỏ trống email. Giáo viên bắt buộc có email.
                            </span>
                        </div>

                        <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 scrollbar-thin">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold uppercase text-slate-500 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-2.5 text-center w-10">#</th>
                                        <th className="p-2.5">Họ & Tên</th>
                                        <th className="p-2.5">Email</th>
                                        <th className="p-2.5">Ngày Sinh</th>
                                        <th className="p-2.5">Vai Trò</th>
                                        <th className="p-2.5">Trạng Thái</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                                    {parsedAccountRows.map((row) => (
                                        <tr
                                            key={row.index}
                                            className={`transition-colors ${!row.isValid
                                                ? 'bg-rose-50/60 dark:bg-rose-950/20 hover:bg-rose-100/50'
                                                : row.isDuplicateEmail
                                                    ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/50'
                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                                }`}
                                        >
                                            <td className="p-2.5 text-center text-slate-400">{row.index}</td>
                                            <td className="p-2.5 font-sans font-semibold text-slate-900 dark:text-white">
                                                {row.lastName} {row.firstName}
                                            </td>
                                            <td className="p-2.5">
                                                {row.email ? (
                                                    <span className={row.isDuplicateEmail ? 'text-amber-600 font-bold' : 'text-slate-600 dark:text-slate-300'}>
                                                        {row.email}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 italic font-sans text-[10px]">
                                                        (Tự sinh email định danh)
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-2.5 text-slate-600 dark:text-slate-300">{row.dob || '—'}</td>
                                            <td className="p-2.5">
                                                <span
                                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-sans ${row.isStudent
                                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                                                        : 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'
                                                        }`}
                                                >
                                                    {row.role}
                                                </span>
                                            </td>
                                            <td className="p-2.5">
                                                {row.isValid ? (
                                                    <span className="inline-flex items-center gap-1 text-emerald-600 font-bold font-sans text-[10px]">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Hợp lệ
                                                    </span>
                                                ) : (
                                                    <span
                                                        className="inline-flex items-center gap-1 text-rose-600 font-bold font-sans text-[10px]"
                                                        title={row.errors.join(' | ')}
                                                    >
                                                        <AlertCircle className="w-3.5 h-3.5" /> {row.errors[0]}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* 4. WIDGET TIẾN TRÌNH THỰC THI & HIỂN THỊ ĐẾM GIỜ ƯỚC TÍNH */}
            {liveExecutedTask && (
                <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 p-5 shadow-md space-y-4 animate-in fade-in duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                                <Zap className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                                    Tiến Trình Tạo Tài Khoản Thời Gian Thực
                                </h4>
                                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                                    Mã Tác Vụ: #{liveExecutedTask.id.slice(0, 8)}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {liveExecutedTask.status === 'success' || liveExecutedTask.status === 'completed' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> HOÀN THÀNH XUẤT SẮC
                                </span>
                            ) : liveExecutedTask.status === 'failed' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold">
                                    <AlertCircle className="w-3.5 h-3.5" /> GẶP SỰ CỐ
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-bold">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    {liveExecutedTask.status === 'waiting_poll'
                                        ? `Đang tạo ngầm (${liveExecutedTask.request_id ? `#REQ-${liveExecutedTask.request_id}` : 'Polling'} - Dự kiến ${formattedEtaText})`
                                        : 'Worker đang thực thi...'}
                                </span>
                            )}
                        </div>
                    </div>

                    {liveExecutedTask.resultUrl ? (
                        <div className="p-4 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="space-y-0.5">
                                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                                    <FileCheck2 className="w-4 h-4 text-emerald-600" />
                                    <span>File kết quả tài khoản đã tạo xong thành công!</span>
                                </p>
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80">
                                    Bao gồm username thật từ Keycloak, mật khẩu email chuẩn và nhóm lớp phân bổ.
                                </p>
                            </div>

                            <a
                                href={liveExecutedTask.resultUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm flex items-center justify-center gap-2 transition hover:scale-[1.02] cursor-pointer"
                            >
                                <Download className="w-4 h-4" />
                                <span>TẢI FILE KẾT QUẢ (.XLSX) VỀ MÁY</span>
                            </a>
                        </div>
                    ) : (
                        <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-slate-800/60 border border-indigo-100 dark:border-indigo-900/40 text-xs text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-pulse shrink-0" />
                                <span>
                                    Hệ thống đang tự động tạo ngầm cho <strong>{validAccountsCount}</strong> tài khoản.
                                    Thời gian ước tính: <strong className="text-indigo-600 dark:text-indigo-400">{formattedEtaText}</strong>.
                                </span>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-slate-700 shadow-2xs self-start sm:self-auto shrink-0">
                                Cron kiểm tra: 5 phút/lần
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};