// frontend/src/features/studio/components/tabs/workspace/UpdateUserSection.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
    UserCheck, CheckCircle2, Search, Loader2, Zap, Check, X,
    Lock, Unlock, Users, User, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { HierarchySchoolItem } from '../../../types';

export interface EditableUserItem {
    user_id: string;
    user_login: string;
    first_name: string;
    last_name: string;
    email: string;
    day: string;
    month: string;
    year: string;
    country_id: string;
    city_id: string;
    school_id: string;
    school_name: string;
    partner_id: string;
    partner_name: string;
    id_user_md: string;
    user_role: string;
    original: {
        first_name: string;
        last_name: string;
        email: string;
        day: string;
        month: string;
        year: string;
        school_id: string;
        school_name: string;
        partner_id: string;
        partner_name: string;
    };
}

interface UpdateUserSectionProps {
    userSearchQuery: string;
    setUserSearchQuery: (val: string) => void;
    isSearchingUser: boolean;
    onSearchUserProfile: () => Promise<void>;
    loadedUserProfile: any | null;
    editableUsers: EditableUserItem[];
    setEditableUsers: React.Dispatch<React.SetStateAction<EditableUserItem[]>>;
    schoolsList: HierarchySchoolItem[];
    uniquePartnersList: { code: string; name: string }[];
}

export const UpdateUserSection: React.FC<UpdateUserSectionProps> = ({
    userSearchQuery,
    setUserSearchQuery,
    isSearchingUser,
    onSearchUserProfile,
    loadedUserProfile,
    editableUsers,
    setEditableUsers,
    schoolsList,
    uniquePartnersList,
}) => {
    // Chế độ: false = Thẻ riêng lẻ, true = Cập nhật hàng loạt
    const [isBulkMode, setIsBulkMode] = useState<boolean>(false);

    // Trạng thái KHÓA / MỞ KHÓA từng trường ở Master Bulk (Mặc định: KHÓA để bảo toàn dữ liệu gốc)
    const [lockedFields, setLockedFields] = useState<{
        firstName: boolean;
        lastName: boolean;
        dob: boolean;
        schoolPartner: boolean;
    }>({
        firstName: true,
        lastName: true,
        dob: true,
        schoolPartner: true,
    });

    // Giá trị chung của Master Bulk khi Mở Khóa
    const [bulkFirstName, setBulkFirstName] = useState<string>('');
    const [bulkLastName, setBulkLastName] = useState<string>('');
    const [bulkDay, setBulkDay] = useState<string>('1');
    const [bulkMonth, setBulkMonth] = useState<string>('1');
    const [bulkYear, setBulkYear] = useState<string>('2012');
    const [bulkSchoolCode, setBulkSchoolCode] = useState<string>('');
    const [bulkSchoolName, setBulkSchoolName] = useState<string>('');
    const [bulkSchoolSearch, setBulkSchoolSearch] = useState<string>('');
    const [bulkPartnerCode, setBulkPartnerCode] = useState<string>('');
    const [bulkPartnerName, setBulkPartnerName] = useState<string>('');
    const [bulkPartnerSearch, setBulkPartnerSearch] = useState<string>('');

    // Combobox Dropdowns State cho Master Bulk
    const [isBulkSchoolOpen, setIsBulkSchoolOpen] = useState<boolean>(false);
    const bulkSchoolRef = useRef<HTMLDivElement | null>(null);
    const [isBulkPartnerOpen, setIsBulkPartnerOpen] = useState<boolean>(false);
    const bulkPartnerRef = useRef<HTMLDivElement | null>(null);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (bulkSchoolRef.current && !bulkSchoolRef.current.contains(e.target as Node)) {
                setIsBulkSchoolOpen(false);
            }
            if (bulkPartnerRef.current && !bulkPartnerRef.current.contains(e.target as Node)) {
                setIsBulkPartnerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Xóa bớt một user khỏi danh sách
    const handleDismissUser = (userId: string) => {
        setEditableUsers(prev => {
            const nextList = prev.filter(u => u.user_id !== userId);
            if (nextList.length === 0) {
                toast.info('Đã xóa toàn bộ người dùng khỏi phiên chỉnh sửa.');
            } else {
                toast.success('Đã loại bỏ 1 người dùng khỏi danh sách.');
            }
            return nextList;
        });
    };

    // Toggle Khóa/Mở Khóa và đồng bộ dữ liệu vào editableUsers
    const toggleFieldLock = (field: 'firstName' | 'lastName' | 'dob' | 'schoolPartner') => {
        const nextState = !lockedFields[field];
        setLockedFields(prev => ({ ...prev, [field]: nextState }));

        if (nextState) {
            // Khi KHÓA LẠI ➔ Khôi phục lại dữ liệu gốc ban đầu cho từng người
            setEditableUsers(prev => prev.map(u => {
                if (field === 'firstName') return { ...u, first_name: u.original.first_name };
                if (field === 'lastName') return { ...u, last_name: u.original.last_name };
                if (field === 'dob') return { ...u, day: u.original.day, month: u.original.month, year: u.original.year };
                if (field === 'schoolPartner') return {
                    ...u,
                    school_id: u.original.school_id,
                    school_name: u.original.school_name,
                    partner_id: u.original.partner_id,
                    partner_name: u.original.partner_name
                };
                return u;
            }));
            toast.info(`Đã khóa trường: Dữ liệu của từng người được giữ nguyên.`);
        } else {
            toast.success(`Đã mở khóa: Giá trị nhập bên dưới sẽ áp dụng cho tất cả.`);
        }
    };

    // Cập nhật giá trị Bulk vào toàn bộ mảng users
    const applyBulkValue = (field: string, val: any) => {
        setEditableUsers(prev => prev.map(u => {
            if (field === 'firstName') return { ...u, first_name: val };
            if (field === 'lastName') return { ...u, last_name: val };
            if (field === 'day') return { ...u, day: val };
            if (field === 'month') return { ...u, month: val };
            if (field === 'year') return { ...u, year: val };
            if (field === 'schoolPartner') return {
                ...u,
                school_id: val.school_id,
                school_name: val.school_name,
                partner_id: val.partner_id,
                partner_name: val.partner_name
            };
            return u;
        }));
    };

    // Cập nhật từng trường ở chế độ thẻ riêng lẻ
    const updateSingleUserField = (userId: string, field: string, value: string) => {
        setEditableUsers(prev => prev.map(u => {
            if (u.user_id === userId) {
                return { ...u, [field]: value };
            }
            return u;
        }));
    };

    const hasUsers = editableUsers && editableUsers.length > 0;

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
                            Nhập tiền tố Email hoặc Username để tìm kiếm gần đúng (tối đa 25 bản ghi).
                        </p>
                    </div>

                    {hasUsers && !isSearchingUser && (
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Khớp: {editableUsers.length} tài khoản</span>
                            </span>
                        </div>
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
                            placeholder="Nhập email hoặc username (VD: teachersabah, hsdttemd)..."
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden shadow-xs"
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
                                <span>Đang dò tìm...</span>
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

            {/* 2. THANH ĐIỀU HƯỚNG CHUYỂN CHẾ ĐỘ: TỪNG THẺ VS HÀNG LOẠT */}
            {hasUsers && !isSearchingUser && editableUsers.length > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs gap-3">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Đã nạp {editableUsers.length} người dùng vào bộ nhớ
                        </span>
                    </div>

                    {/* SEGMENTED TOGGLE TỐI GIẢN */}
                    <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 self-start sm:self-auto">
                        <button
                            type="button"
                            onClick={() => setIsBulkMode(false)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${!isBulkMode
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                        >
                            <User className="w-3.5 h-3.5" />
                            <span>Từng Thẻ Riêng Lẻ</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsBulkMode(true)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${isBulkMode
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                        >
                            <Users className="w-3.5 h-3.5" />
                            <span>Cập Nhật Hàng Loạt</span>
                        </button>
                    </div>
                </div>
            )}

            {/* 3. KHU VỰC CHỈNH SỬA DỮ LIỆU */}
            {isSearchingUser ? (
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
                    <p className="text-xs font-medium text-slate-500">Đang quét danh sách và tải chi tiết tối đa 25 hồ sơ...</p>
                </div>
            ) : hasUsers ? (
                isBulkMode ? (
                    // =========================================================
                    // 🌟 CHẾ ĐỘ 1: MASTER BULK CONTROLLER (GỘP THÀNH 1 THẺ CHUNG)
                    // =========================================================
                    <div className="rounded-3xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-6 space-y-6 shadow-xs animate-in fade-in duration-150">
                        {/* Header Thẻ Master */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-2">
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    <span>Bảng Điều Khiển Cập Nhật Hàng Loạt ({editableUsers.length} Tài Khoản)</span>
                                </h4>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Bấm vào nút Khóa/Mở để quyết định trường nào áp dụng chung, trường nào giữ nguyên theo từng người.
                                </p>
                            </div>
                        </div>

                        {/* Danh sách Pill Chips các tài khoản đang chọn (Cho phép click X để loại bỏ) */}
                        <div className="space-y-1.5">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Danh sách tài khoản áp dụng:</span>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                                {editableUsers.map(u => (
                                    <span
                                        key={u.user_id}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-700 dark:text-slate-300 shadow-2xs"
                                    >
                                        <span>{u.user_login || u.email}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleDismissUser(u.user_id)}
                                            title="Loại bỏ tài khoản này khỏi danh sách sửa"
                                            className="text-slate-400 hover:text-rose-600 cursor-pointer transition"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* CỘT TRÁI: FIRST NAME, LAST NAME, EMAIL & NGÀY SINH */}
                            <div className="space-y-4">
                                {/* FIRST NAME & LAST NAME */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* FIRST NAME */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold uppercase text-slate-500">First Name:</label>
                                            <button
                                                type="button"
                                                onClick={() => toggleFieldLock('firstName')}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition cursor-pointer ${lockedFields.firstName
                                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                                                    }`}
                                            >
                                                {lockedFields.firstName ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                                <span>{lockedFields.firstName ? 'Khóa' : 'Đồng bộ'}</span>
                                            </button>
                                        </div>

                                        {lockedFields.firstName ? (
                                            <div className="w-full rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2 text-xs text-slate-400 italic">
                                                Giữ nguyên theo từng người
                                            </div>
                                        ) : (
                                            <input
                                                type="text"
                                                value={bulkFirstName}
                                                onChange={(e) => {
                                                    setBulkFirstName(e.target.value);
                                                    applyBulkValue('firstName', e.target.value);
                                                }}
                                                placeholder="Nhập First Name chung..."
                                                className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold focus:outline-hidden ${!bulkFirstName.trim()
                                                    ? 'border-rose-400 bg-rose-50/20 text-rose-900 dark:text-rose-200'
                                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                                                    }`}
                                            />
                                        )}
                                    </div>

                                    {/* LAST NAME */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold uppercase text-slate-500">Last Name:</label>
                                            <button
                                                type="button"
                                                onClick={() => toggleFieldLock('lastName')}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition cursor-pointer ${lockedFields.lastName
                                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                                                    }`}
                                            >
                                                {lockedFields.lastName ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                                <span>{lockedFields.lastName ? 'Khóa' : 'Đồng bộ'}</span>
                                            </button>
                                        </div>

                                        {lockedFields.lastName ? (
                                            <div className="w-full rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2 text-xs text-slate-400 italic">
                                                Giữ nguyên theo từng người
                                            </div>
                                        ) : (
                                            <input
                                                type="text"
                                                value={bulkLastName}
                                                onChange={(e) => {
                                                    setBulkLastName(e.target.value);
                                                    applyBulkValue('lastName', e.target.value);
                                                }}
                                                placeholder="Nhập Last Name chung..."
                                                className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold focus:outline-hidden ${!bulkLastName.trim()
                                                    ? 'border-rose-400 bg-rose-50/20 text-rose-900 dark:text-rose-200'
                                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                                                    }`}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* EMAIL (KHÓA CỨNG VĨNH VIỄN) */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold uppercase text-slate-500">Email:</label>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                            <Lock className="w-3 h-3" />
                                            <span>Bắt buộc riêng biệt (Unique)</span>
                                        </span>
                                    </div>
                                    <div className="w-full rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-3.5 py-2 text-xs text-slate-400 italic font-mono flex items-center justify-between">
                                        <span>Bảo toàn 100% email riêng của từng tài khoản</span>
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                    </div>
                                </div>

                                {/* NGÀY SINH */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold uppercase text-slate-500">Ngày Sinh:</label>
                                        <button
                                            type="button"
                                            onClick={() => toggleFieldLock('dob')}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition cursor-pointer ${lockedFields.dob
                                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                                : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                                                }`}
                                        >
                                            {lockedFields.dob ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                            <span>{lockedFields.dob ? 'Khóa' : 'Đồng bộ'}</span>
                                        </button>
                                    </div>

                                    {lockedFields.dob ? (
                                        <div className="w-full rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2 text-xs text-slate-400 italic">
                                            Giữ nguyên theo từng người
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2">
                                            <select
                                                value={bulkDay}
                                                onChange={(e) => {
                                                    setBulkDay(e.target.value);
                                                    applyBulkValue('day', e.target.value);
                                                }}
                                                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white cursor-pointer"
                                            >
                                                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                                                    <option key={d} value={d}>Ngày {d}</option>
                                                ))}
                                            </select>

                                            <select
                                                value={bulkMonth}
                                                onChange={(e) => {
                                                    setBulkMonth(e.target.value);
                                                    applyBulkValue('month', e.target.value);
                                                }}
                                                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white cursor-pointer"
                                            >
                                                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                                                    <option key={m} value={m}>Tháng {m}</option>
                                                ))}
                                            </select>

                                            <select
                                                value={bulkYear}
                                                onChange={(e) => {
                                                    setBulkYear(e.target.value);
                                                    applyBulkValue('year', e.target.value);
                                                }}
                                                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white cursor-pointer"
                                            >
                                                {Array.from({ length: 45 }, (_, i) => String(2025 - i)).map((y) => (
                                                    <option key={y} value={y}>{y}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* CỘT PHẢI: BỘ ĐÔI ĐỐI TÁC & TRƯỜNG HỌC GẮN KẾT */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <span className="text-[10px] font-bold uppercase text-slate-500">Đối Tác & Trường Học:</span>
                                    <button
                                        type="button"
                                        onClick={() => toggleFieldLock('schoolPartner')}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition cursor-pointer ${lockedFields.schoolPartner
                                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                            : 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800'
                                            }`}
                                    >
                                        {lockedFields.schoolPartner ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                        <span>{lockedFields.schoolPartner ? 'Khóa Trường & Đối tác' : 'Đồng bộ Trường & Đối tác'}</span>
                                    </button>
                                </div>

                                {lockedFields.schoolPartner ? (
                                    <div className="w-full rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 text-xs text-slate-400 italic text-center">
                                        Trường học và Đối tác của từng người được bảo toàn nguyên vẹn.
                                    </div>
                                ) : (
                                    <div className="space-y-3.5">
                                        {/* 1. COMBOBOX CHỌN ĐỐI TÁC */}
                                        <div className="relative" ref={bulkPartnerRef}>
                                            <label className="text-[10px] font-bold uppercase text-slate-500 flex justify-between">
                                                <span>Đối Tác Áp Dụng:</span>
                                                {bulkPartnerCode && <span className="font-mono text-purple-600 font-bold">Mã: {bulkPartnerCode}</span>}
                                            </label>
                                            <div className="relative mt-1">
                                                <input
                                                    type="text"
                                                    value={bulkPartnerSearch}
                                                    onFocus={() => setIsBulkPartnerOpen(true)}
                                                    onChange={(e) => {
                                                        setBulkPartnerSearch(e.target.value);
                                                        setIsBulkPartnerOpen(true);
                                                    }}
                                                    placeholder="Gõ tìm đối tác..."
                                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-purple-500 focus:outline-hidden pr-8"
                                                />
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                                            </div>

                                            {isBulkPartnerOpen && (
                                                <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-48 overflow-y-auto p-1.5 space-y-1">
                                                    {uniquePartnersList
                                                        .filter(p => !bulkPartnerSearch || p.name.toLowerCase().includes(bulkPartnerSearch.toLowerCase()))
                                                        .map(p => (
                                                            <button
                                                                key={p.code}
                                                                type="button"
                                                                onClick={() => {
                                                                    setBulkPartnerCode(p.code);
                                                                    setBulkPartnerName(p.name);
                                                                    setBulkPartnerSearch(p.name);
                                                                    setIsBulkPartnerOpen(false);
                                                                }}
                                                                className="w-full text-left p-2 rounded-xl text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex justify-between items-center cursor-pointer"
                                                            >
                                                                <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                                                                <span className="text-[10px] text-slate-400 font-mono">Mã: {p.code}</span>
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* 2. COMBOBOX CHỌN TRƯỜNG HỌC */}
                                        <div className="relative" ref={bulkSchoolRef}>
                                            <label className="text-[10px] font-bold uppercase text-slate-500 flex justify-between">
                                                <span>Trường Học Áp Dụng:</span>
                                                {bulkSchoolCode && <span className="font-mono text-indigo-600 font-bold">Mã: {bulkSchoolCode}</span>}
                                            </label>
                                            <div className="relative mt-1">
                                                <input
                                                    type="text"
                                                    value={bulkSchoolSearch}
                                                    onFocus={() => setIsBulkSchoolOpen(true)}
                                                    onChange={(e) => {
                                                        setBulkSchoolSearch(e.target.value);
                                                        setIsBulkSchoolOpen(true);
                                                    }}
                                                    placeholder="Gõ tìm tên trường..."
                                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden pr-8"
                                                />
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                                            </div>

                                            {isBulkSchoolOpen && (
                                                <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1">
                                                    {schoolsList
                                                        .filter(s => !bulkSchoolSearch || s.school_name.toLowerCase().includes(bulkSchoolSearch.toLowerCase()))
                                                        .slice(0, 50)
                                                        .map(s => (
                                                            <button
                                                                key={`${s.school_id}-${s.school_code}`}
                                                                type="button"
                                                                onClick={() => {
                                                                    setBulkSchoolCode(s.school_code);
                                                                    setBulkSchoolName(s.school_name);
                                                                    setBulkSchoolSearch(s.school_name);
                                                                    setIsBulkSchoolOpen(false);

                                                                    const pCode = s.partner_code && s.partner_code !== 'N/A' ? s.partner_code : bulkPartnerCode;
                                                                    const pName = s.partner_name && s.partner_name !== 'N/A' ? s.partner_name : bulkPartnerName;

                                                                    setBulkPartnerCode(pCode);
                                                                    setBulkPartnerName(pName);
                                                                    setBulkPartnerSearch(pName);

                                                                    applyBulkValue('schoolPartner', {
                                                                        school_id: s.school_code,
                                                                        school_name: s.school_name,
                                                                        partner_id: pCode,
                                                                        partner_name: pName,
                                                                    });
                                                                }}
                                                                className="w-full text-left p-2 rounded-xl text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex justify-between items-center cursor-pointer"
                                                            >
                                                                <span className="font-bold text-slate-900 dark:text-white truncate">{s.school_name}</span>
                                                                <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">Mã: {s.school_code}</span>
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    // =========================================================
                    // 🌟 CHẾ ĐỘ 2: DANH SÁCH THẺ RIÊNG LẺ (MỖI USER 1 BENTO CARD)
                    // =========================================================
                    <div className="space-y-4">
                        {editableUsers.map((u, idx) => (
                            <div
                                key={u.user_id}
                                className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs relative"
                            >
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950 text-[10px] font-mono font-bold text-indigo-600">
                                            #{idx + 1}
                                        </span>
                                        <h4 className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                                            {u.user_login || u.email}
                                        </h4>
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                            ID: #{u.user_id} ({u.user_role})
                                        </span>
                                    </div>

                                    {/* NÚT THÙNG RÁC / XÓA BẢN GHI THỪA */}
                                    <button
                                        type="button"
                                        onClick={() => handleDismissUser(u.user_id)}
                                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-1.5 rounded-xl transition cursor-pointer"
                                        title="Xóa người dùng này khỏi danh sách sửa"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-slate-500">First Name:</label>
                                                <input
                                                    type="text"
                                                    value={u.first_name}
                                                    onChange={(e) => updateSingleUserField(u.user_id, 'first_name', e.target.value)}
                                                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-slate-500">Last Name:</label>
                                                <input
                                                    type="text"
                                                    value={u.last_name}
                                                    onChange={(e) => updateSingleUserField(u.user_id, 'last_name', e.target.value)}
                                                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-slate-500">Email:</label>
                                            <input
                                                type="email"
                                                value={u.email}
                                                onChange={(e) => updateSingleUserField(u.user_id, 'email', e.target.value)}
                                                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-hidden"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Ngày Sinh:</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                <select
                                                    value={u.day}
                                                    onChange={(e) => updateSingleUserField(u.user_id, 'day', e.target.value)}
                                                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                                                >
                                                    {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                                                        <option key={d} value={d}>Ngày {d}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={u.month}
                                                    onChange={(e) => updateSingleUserField(u.user_id, 'month', e.target.value)}
                                                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                                                >
                                                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                                                        <option key={m} value={m}>Tháng {m}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={u.year}
                                                    onChange={(e) => updateSingleUserField(u.user_id, 'year', e.target.value)}
                                                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                                                >
                                                    {Array.from({ length: 45 }, (_, i) => String(2025 - i)).map((y) => (
                                                        <option key={y} value={y}>{y}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* CỘT PHẢI: TRƯỜNG & ĐỐI TÁC CỦA TỪNG NGƯỜI */}
                                    <div className="space-y-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Trường Học:</span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200">{u.school_name}</span>
                                            <span className="text-[10px] font-mono text-indigo-500 ml-2">(Mã: {u.school_id})</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Đối Tác Quản Lý:</span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200">{u.partner_name}</span>
                                            <span className="text-[10px] font-mono text-purple-500 ml-2">(Mã: {u.partner_id})</span>
                                        </div>
                                        <div className="pt-1 text-[10px] text-slate-400 font-mono">
                                            Moodle ID: {u.id_user_md || 'Chưa liên kết'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400 animate-in fade-in duration-150">
                    <UserCheck className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                    <span>Nhập tiền tố Email hoặc Username và bấm "Dò Tìm Hồ Sơ" để mở bảng chỉnh sửa.</span>
                </div>
            )}
        </div>
    );
};