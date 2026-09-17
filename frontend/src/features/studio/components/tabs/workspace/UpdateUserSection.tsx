// frontend/src/features/studio/components/tabs/workspace/UpdateUserSection.tsx
import React, { useState, useRef, useEffect } from 'react';
import { UserCheck, CheckCircle2, Search, Loader2, Zap, Check } from 'lucide-react';
import { toast } from 'sonner';
import { HierarchySchoolItem, LoadedUserProfile } from '../../../types';

interface UpdateUserSectionProps {
    userSearchQuery: string;
    setUserSearchQuery: (val: string) => void;
    isSearchingUser: boolean;
    onSearchUserProfile: () => Promise<void>;
    loadedUserProfile: LoadedUserProfile | null;
    editFirstName: string;
    setEditFirstName: (val: string) => void;
    editLastName: string;
    setEditLastName: (val: string) => void;
    editEmail: string;
    setEditEmail: (val: string) => void;
    editDay: string;
    setEditDay: (val: string) => void;
    editMonth: string;
    setEditMonth: (val: string) => void;
    editYear: string;
    setEditYear: (val: string) => void;
    editSchoolCode: string;
    setEditSchoolCode: (val: string) => void;
    editSchoolName: string;
    setEditSchoolName: (val: string) => void;
    schoolSearchQuery: string;
    setSchoolSearchQuery: (val: string) => void;
    editPartnerCode: string;
    setEditPartnerCode: (val: string) => void;
    editPartnerName: string;
    setEditPartnerName: (val: string) => void;
    partnerSearchQuery: string;
    setPartnerSearchQuery: (val: string) => void;
    schoolsList: HierarchySchoolItem[];
    uniquePartnersList: { code: string; name: string }[];
}

export const UpdateUserSection: React.FC<UpdateUserSectionProps> = ({
    userSearchQuery,
    setUserSearchQuery,
    isSearchingUser,
    onSearchUserProfile,
    loadedUserProfile,
    editFirstName,
    setEditFirstName,
    editLastName,
    setEditLastName,
    editEmail,
    setEditEmail,
    editDay,
    setEditDay,
    editMonth,
    setEditMonth,
    editYear,
    setEditYear,
    editSchoolCode,
    setEditSchoolCode,
    editSchoolName,
    setEditSchoolName,
    schoolSearchQuery,
    setSchoolSearchQuery,
    editPartnerCode,
    setEditPartnerCode,
    editPartnerName,
    setEditPartnerName,
    partnerSearchQuery,
    setPartnerSearchQuery,
    schoolsList,
    uniquePartnersList,
}) => {
    const [isSchoolComboboxOpen, setIsSchoolComboboxOpen] = useState<boolean>(false);
    const schoolComboboxRef = useRef<HTMLDivElement | null>(null);

    const [isPartnerComboboxOpen, setIsPartnerComboboxOpen] = useState<boolean>(false);
    const partnerComboboxRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (schoolComboboxRef.current && !schoolComboboxRef.current.contains(event.target as Node)) {
                setIsSchoolComboboxOpen(false);
            }
            if (partnerComboboxRef.current && !partnerComboboxRef.current.contains(event.target as Node)) {
                setIsPartnerComboboxOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="space-y-5 pt-2 animate-in fade-in duration-150">
            {/* 1. THANH TÌM KIẾM DÒ TÌM USER */}
            <div className="p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>Dò Tìm Người Dùng Trên Admin Workspace</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                                pythaverse.space
                            </span>
                        </h3>
                        <p className="text-[11px] text-slate-500">
                            Nhập Email hoặc Username để bốc thông tin chi tiết từ hệ thống trường học.
                        </p>
                    </div>

                    {loadedUserProfile && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-mono font-bold flex items-center gap-1 self-start sm:self-auto">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>ID: #{loadedUserProfile.userId} ({loadedUserProfile.userRole})</span>
                        </span>
                    )}
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={userSearchQuery}
                            onChange={(e) => setUserSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onSearchUserProfile();
                            }}
                            placeholder="Nhập email hoặc username (VD: hsdttemd@pythaverse.net)..."
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                        />
                        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    </div>

                    <button
                        type="button"
                        onClick={onSearchUserProfile}
                        disabled={isSearchingUser}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
                    >
                        {isSearchingUser ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Đang dò quét (15-30s)...</span>
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4" />
                                <span>Dò Tìm Hồ Sơ</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* 2. BENTO CARD CHỈNH SỬA THÔNG TIN */}
            {loadedUserProfile ? (
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                                Chỉnh Sửa Thông Tin Người Dùng
                            </h4>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400">
                            Username: <b className="text-slate-700 dark:text-slate-300">{loadedUserProfile.userLogin}</b> (Cố định)
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* CỘT TRÁI: HỌ TÊN, EMAIL & NGÀY SINH */}
                        <div className="space-y-3.5">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500">First Name (*):</label>
                                    <input
                                        type="text"
                                        value={editFirstName}
                                        onChange={(e) => setEditFirstName(e.target.value)}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500">Last Name (*):</label>
                                    <input
                                        type="text"
                                        value={editLastName}
                                        onChange={(e) => setEditLastName(e.target.value)}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500">Email (*):</label>
                                <input
                                    type="email"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                                />
                            </div>

                            {/* 3 Dropdown Ngày Sinh */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Ngày Sinh (*):</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <select
                                        value={editDay}
                                        onChange={(e) => setEditDay(e.target.value)}
                                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                                    >
                                        {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                                            <option key={d} value={d}>Ngày {d}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={editMonth}
                                        onChange={(e) => setEditMonth(e.target.value)}
                                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                                    >
                                        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                                            <option key={m} value={m}>Tháng {m}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={editYear}
                                        onChange={(e) => setEditYear(e.target.value)}
                                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                                    >
                                        {Array.from({ length: 45 }, (_, i) => String(2025 - i)).map((y) => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* CỘT PHẢI: BỘ ĐÔI COMBOBOX TÌM KIẾM & CHỌN TRƯỜNG - PARTNER */}
                        <div className="space-y-3.5">
                            {/* 1. COMBOBOX CHỌN ĐỐI TÁC (PARTNER) */}
                            <div className="relative" ref={partnerComboboxRef}>
                                <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center justify-between">
                                    <span>Đối Tác Quản Lý (Partner):</span>
                                    {editPartnerCode && (
                                        <span className="font-mono text-purple-600 font-bold">Mã Partner: {editPartnerCode}</span>
                                    )}
                                </label>

                                <div className="relative mt-1">
                                    <input
                                        type="text"
                                        value={partnerSearchQuery}
                                        onFocus={() => setIsPartnerComboboxOpen(true)}
                                        onChange={(e) => {
                                            setPartnerSearchQuery(e.target.value);
                                            setIsPartnerComboboxOpen(true);
                                        }}
                                        placeholder="Gõ tìm kiếm đối tác (Partner)..."
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-purple-500 focus:outline-hidden pr-8"
                                    />
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                                </div>

                                {isPartnerComboboxOpen && (
                                    <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1 animate-in fade-in duration-100">
                                        {uniquePartnersList
                                            .filter((p) => {
                                                const q = partnerSearchQuery.trim().toLowerCase();
                                                if (!q) return true;
                                                return p.name.toLowerCase().includes(q) || p.code.includes(q);
                                            })
                                            .map((p) => (
                                                <button
                                                    key={p.code}
                                                    type="button"
                                                    onClick={() => {
                                                        const newPartnerCode = p.code;
                                                        const newPartnerName = p.name;

                                                        setEditPartnerCode(newPartnerCode);
                                                        setEditPartnerName(newPartnerName);
                                                        setPartnerSearchQuery(newPartnerName);
                                                        setIsPartnerComboboxOpen(false);

                                                        const partnerSchools = schoolsList.filter(
                                                            (s) => String(s.partner_code) === String(newPartnerCode)
                                                        );

                                                        const isCurrentSchoolValid = partnerSchools.some(
                                                            (s) => String(s.school_code) === String(editSchoolCode)
                                                        );

                                                        if (!isCurrentSchoolValid) {
                                                            if (partnerSchools.length > 0) {
                                                                const firstSchool = partnerSchools[0];
                                                                setEditSchoolCode(firstSchool.school_code);
                                                                setEditSchoolName(firstSchool.school_name);
                                                                setSchoolSearchQuery(firstSchool.school_name);
                                                                toast.info(
                                                                    `💡 Đổi Partner: ${newPartnerName} ➔ Tự động chọn trường: ${firstSchool.school_name} (Mã: ${firstSchool.school_code})`
                                                                );
                                                            } else {
                                                                setEditSchoolCode('');
                                                                setEditSchoolName('');
                                                                setSchoolSearchQuery('');
                                                                toast.warning(
                                                                    `⚠️ Đối tác ${newPartnerName} hiện chưa có trường học trực thuộc trong danh bạ.`
                                                                );
                                                            }
                                                        } else {
                                                            toast.success(`Đã chọn: ${newPartnerName} (Mã: ${newPartnerCode})`);
                                                        }
                                                    }}
                                                    className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${editPartnerCode === p.code
                                                        ? 'bg-purple-50 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-700'
                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                                                        }`}
                                                >
                                                    <div>
                                                        <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono ml-2">Mã: {p.code}</span>
                                                    </div>
                                                    {editPartnerCode === p.code && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>

                            {/* 2. COMBOBOX CHỌN TRƯỜNG HỌC (SCHOOL) */}
                            <div className="relative" ref={schoolComboboxRef}>
                                <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center justify-between">
                                    <span>Trường Học Thụ Hưởng (School):</span>
                                    {editSchoolCode && (
                                        <span className="font-mono text-indigo-600 font-bold">Mã Trường: {editSchoolCode}</span>
                                    )}
                                </label>

                                <div className="relative mt-1">
                                    <input
                                        type="text"
                                        value={schoolSearchQuery}
                                        onFocus={() => setIsSchoolComboboxOpen(true)}
                                        onChange={(e) => {
                                            setSchoolSearchQuery(e.target.value);
                                            setIsSchoolComboboxOpen(true);
                                        }}
                                        placeholder="Gõ tên trường hoặc mã số trường để chọn..."
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden pr-8"
                                    />
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                                </div>

                                {isSchoolComboboxOpen && (
                                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1 animate-in fade-in duration-100">
                                        {schoolsList
                                            .filter((s) => {
                                                const q = schoolSearchQuery.trim().toLowerCase();
                                                if (!q) return true;
                                                return (
                                                    s.school_name.toLowerCase().includes(q) ||
                                                    s.school_code.toLowerCase().includes(q) ||
                                                    s.partner_name.toLowerCase().includes(q)
                                                );
                                            })
                                            .sort((a, b) => {
                                                const aMatch = String(a.partner_code) === String(editPartnerCode);
                                                const bMatch = String(b.partner_code) === String(editPartnerCode);
                                                if (aMatch && !bMatch) return -1;
                                                if (!aMatch && bMatch) return 1;
                                                return 0;
                                            })
                                            .slice(0, 30)
                                            .map((s) => {
                                                const isCurrentPartner = String(s.partner_code) === String(editPartnerCode);
                                                return (
                                                    <button
                                                        key={s.school_code}
                                                        type="button"
                                                        onClick={() => {
                                                            setEditSchoolCode(s.school_code);
                                                            setEditSchoolName(s.school_name);
                                                            setSchoolSearchQuery(s.school_name);
                                                            setIsSchoolComboboxOpen(false);

                                                            if (s.partner_code) {
                                                                setEditPartnerCode(s.partner_code);
                                                                setEditPartnerName(s.partner_name);
                                                                setPartnerSearchQuery(s.partner_name);
                                                                toast.info(`💡 Đã tự động chọn: ${s.partner_name} (Mã: ${s.partner_code})`);
                                                            }
                                                        }}
                                                        className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${editSchoolCode === s.school_code
                                                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700'
                                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                                                            }`}
                                                    >
                                                        <div className="truncate pr-2">
                                                            <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                                                {isCurrentPartner && (
                                                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold">
                                                                        Partner hiện tại
                                                                    </span>
                                                                )}
                                                                <span>{s.school_name}</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                Mã: <b className="text-indigo-600 dark:text-indigo-400">{s.school_code}</b> | Thuộc: {s.partner_name}
                                                            </div>
                                                        </div>
                                                        {editSchoolCode === s.school_code && (
                                                            <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>

                            {/* Khối Metadata Kỹ Thuật */}
                            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
                                <p>• Quốc gia ID: <b>{loadedUserProfile.countryId}</b> | Thành phố ID: <b>{loadedUserProfile.cityId}</b></p>
                                <p>• Moodle User ID: <b>{loadedUserProfile.idUserMD || 'Chưa liên kết LMS'}</b></p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
                    <UserCheck className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                    <span>Vui lòng nhập Email hoặc Username và bấm "Dò Tìm Hồ Sơ" để mở bảng chỉnh sửa.</span>
                </div>
            )}
        </div>
    );
};