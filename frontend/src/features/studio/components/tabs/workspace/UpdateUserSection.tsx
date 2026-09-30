// frontend/src/features/studio/components/tabs/workspace/UpdateUserSection.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
    UserCheck, CheckCircle2, Search, Loader2, Zap, Check, X,
    Lock, Unlock, Users, User, AlertCircle, Building2
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
    editableUsers,
    setEditableUsers,
    schoolsList,
    uniquePartnersList,
}) => {
    // Chế độ: false = Thẻ riêng lẻ, true = Cập nhật hàng loạt
    const [isBulkMode, setIsBulkMode] = useState<boolean>(false);

    // 🔒 TRẠNG THÁI KHÓA TOÀN BỘ MẶC ĐỊNH CHO BULK SYNC
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

    // Dropdown quản lý nổi duy nhất (Single Active Dropdown chống lag 24 cards)
    const [activeDropdown, setActiveDropdown] = useState<{
        userId: string;
        type: 'school' | 'partner';
        search: string;
    } | null>(null);

    const dropdownContainerRef = useRef<HTMLDivElement | null>(null);

    // Đóng dropdown khi click ra ngoài
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 🔄 CHUYỂN SANG CHẾ ĐỘ BULK: ÉP TOÀN BỘ CÁC TRƯỜNG PHẢI KHÓA MẶC ĐỊNH
    const handleSwitchToBulkMode = () => {
        setIsBulkMode(true);
        setLockedFields({
            firstName: true,
            lastName: true,
            dob: true,
            schoolPartner: true,
        });
        setBulkFirstName('');
        setBulkLastName('');
        setBulkSchoolCode('');
        setBulkSchoolName('');
        setBulkPartnerCode('');
        setBulkPartnerName('');
        toast.info('Chuyển sang Cập Nhật Hàng Loạt: Các trường được Khóa an toàn mặc định.');
    };

    // Xóa bớt một user khỏi danh sách
    const handleDismissUser = (userId: string) => {
        setEditableUsers(prev => {
            const nextList = prev.filter(u => u.user_id !== userId);
            if (nextList.length === 0) {
                toast.info('Đã xóa toàn bộ người dùng khỏi danh sách.');
            } else {
                toast.success('Đã loại bỏ 1 người dùng khỏi danh sách.');
            }
            return nextList;
        });
    };

    // Toggle Khóa/Mở Khóa trong Master Bulk
    const toggleFieldLock = (field: 'firstName' | 'lastName' | 'dob' | 'schoolPartner') => {
        const nextState = !lockedFields[field];
        setLockedFields(prev => ({ ...prev, [field]: nextState }));

        if (nextState) {
            // Khi Khóa lại: Khôi phục dữ liệu gốc của từng người
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
            toast.info(`Đã khóa trường: Bảo toàn dữ liệu gốc của từng người.`);
        } else {
            toast.success(`Đã mở khóa: Giá trị nhập bên dưới sẽ áp dụng đồng loạt.`);
        }
    };

    // Áp dụng giá trị Bulk vào toàn bộ mảng users
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

    // Cập nhật giá trị thẻ riêng lẻ
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
        <div className="space-y-5 pt-2 animate-in fade-in duration-150" ref={dropdownContainerRef}>
            {/* 1. THANH TÌM KIẾM DẠNG TEXTAREA HỖ TRỢ BULK PASTE TỪ EXCEL */}
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
                            Nhập <b>tiền tố</b> (VD: <code>stdntsabah</code>) HOẶC <b>dán danh sách nhiều tài khoản</b> từ Excel (mỗi dòng một email/username, tối đa 25).
                        </p>
                    </div>

                    {hasUsers && !isSearchingUser && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-xs self-start sm:self-auto">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Khớp: {editableUsers.length} tài khoản</span>
                        </span>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                        <textarea
                            rows={3}
                            value={userSearchQuery}
                            onChange={(e) => setUserSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                    onSearchUserProfile();
                                }
                            }}
                            placeholder="Nhập 1 từ khóa (VD: stdntsabah)&#10;HOẶC dán danh sách nhiều tài khoản:&#10;teacher01@edu.my&#10;teacher02@edu.my..."
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden shadow-xs resize-y"
                        />
                        <span className="absolute right-3 bottom-2 text-[10px] text-slate-400 font-mono pointer-events-none">
                            Ctrl + Enter để tìm
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={onSearchUserProfile}
                        disabled={isSearchingUser}
                        className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0 self-stretch sm:self-auto"
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
                            onClick={handleSwitchToBulkMode}
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
                    <p className="text-xs font-medium text-slate-500">Đang quét danh sách và bốc chi tiết tối đa 25 hồ sơ song song...</p>
                </div>
            ) : hasUsers ? (
                isBulkMode ? (
                    // =========================================================
                    // 🌟 CHẾ ĐỘ 1: MASTER BULK CONTROLLER (MẶC ĐỊNH KHÓA 100%)
                    // =========================================================
                    <div className="rounded-3xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-6 space-y-6 shadow-xs animate-in fade-in duration-150">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-2">
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    <span>Bảng Điều Khiển Cập Nhật Hàng Loạt ({editableUsers.length} Tài Khoản)</span>
                                </h4>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Tất cả các trường đang được <b>Khóa an toàn mặc định</b>. Chỉ mở khóa những mục anh muốn ghi đè đồng bộ.
                                </p>
                            </div>
                        </div>

                        {/* Danh sách Pill Chips các tài khoản đang chọn */}
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
                                        <div className="relative">
                                            <label className="text-[10px] font-bold uppercase text-slate-500 flex justify-between">
                                                <span>Đối Tác Áp Dụng:</span>
                                                {bulkPartnerCode && <span className="font-mono text-purple-600 font-bold">Mã: {bulkPartnerCode}</span>}
                                            </label>
                                            <div className="relative mt-1">
                                                <input
                                                    type="text"
                                                    value={bulkPartnerSearch}
                                                    onFocus={() => setActiveDropdown({ userId: 'bulk', type: 'partner', search: bulkPartnerSearch })}
                                                    onChange={(e) => {
                                                        setBulkPartnerSearch(e.target.value);
                                                        setActiveDropdown({ userId: 'bulk', type: 'partner', search: e.target.value });
                                                    }}
                                                    placeholder="Gõ tìm đối tác..."
                                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-purple-500 focus:outline-hidden pr-8"
                                                />
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                                            </div>

                                            {activeDropdown?.userId === 'bulk' && activeDropdown?.type === 'partner' && (
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
                                                                    setActiveDropdown(null);
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
                                        <div className="relative">
                                            <label className="text-[10px] font-bold uppercase text-slate-500 flex justify-between">
                                                <span>Trường Học Áp Dụng:</span>
                                                {bulkSchoolCode && <span className="font-mono text-indigo-600 font-bold">Mã: {bulkSchoolCode}</span>}
                                            </label>
                                            <div className="relative mt-1">
                                                <input
                                                    type="text"
                                                    value={bulkSchoolSearch}
                                                    onFocus={() => setActiveDropdown({ userId: 'bulk', type: 'school', search: bulkSchoolSearch })}
                                                    onChange={(e) => {
                                                        setBulkSchoolSearch(e.target.value);
                                                        setActiveDropdown({ userId: 'bulk', type: 'school', search: e.target.value });
                                                    }}
                                                    placeholder="Gõ tìm tên trường..."
                                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden pr-8"
                                                />
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                                            </div>

                                            {activeDropdown?.userId === 'bulk' && activeDropdown?.type === 'school' && (
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
                                                                    setActiveDropdown(null);

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
                    // 🌟 CHẾ ĐỘ 2: DANH SÁCH THẺ RIÊNG LẺ (CHO EDIT CẢ TRƯỜNG & PARTNER)
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

                                    {/* NÚT THÙNG RÁC XÓA BẢN GHI THỪA */}
                                    <button
                                        type="button"
                                        onClick={() => handleDismissUser(u.user_id)}
                                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-1.5 rounded-xl transition cursor-pointer"
                                        title="Xóa người dùng này khỏi danh sách sửa"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* CỘT TRÁI: HỌ TÊN, EMAIL & NGÀY SINH */}
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
                                                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white cursor-pointer"
                                                >
                                                    {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                                                        <option key={d} value={d}>Ngày {d}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={u.month}
                                                    onChange={(e) => updateSingleUserField(u.user_id, 'month', e.target.value)}
                                                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white cursor-pointer"
                                                >
                                                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                                                        <option key={m} value={m}>Tháng {m}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={u.year}
                                                    onChange={(e) => updateSingleUserField(u.user_id, 'year', e.target.value)}
                                                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white cursor-pointer"
                                                >
                                                    {Array.from({ length: 45 }, (_, i) => String(2025 - i)).map((y) => (
                                                        <option key={y} value={y}>{y}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* CỘT PHẢI: BỘ CHỌN ĐỐI TÁC & TRƯỜNG HỌC CHO TỪNG THẺ */}
                                    <div className="space-y-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                                        {/* 1. ĐỐI TÁC QUẢN LÝ */}
                                        <div className="relative">
                                            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 mb-1">
                                                <span>Đối Tác (Partner):</span>
                                                {u.partner_id && <span className="font-mono text-purple-600 font-bold">Mã: {u.partner_id}</span>}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={activeDropdown?.userId === u.user_id && activeDropdown?.type === 'partner' ? activeDropdown.search : u.partner_name}
                                                    onFocus={() => setActiveDropdown({ userId: u.user_id, type: 'partner', search: u.partner_name })}
                                                    onChange={(e) => setActiveDropdown({ userId: u.user_id, type: 'partner', search: e.target.value })}
                                                    placeholder="Gõ tìm đối tác..."
                                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-purple-500 focus:outline-hidden pr-7"
                                                />
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                                            </div>

                                            {activeDropdown?.userId === u.user_id && activeDropdown?.type === 'partner' && (
                                                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-40 overflow-y-auto p-1 space-y-0.5">
                                                    {uniquePartnersList
                                                        .filter(p => !activeDropdown.search || p.name.toLowerCase().includes(activeDropdown.search.toLowerCase()))
                                                        .map(p => (
                                                            <button
                                                                key={p.code}
                                                                type="button"
                                                                onClick={() => {
                                                                    updateSingleUserField(u.user_id, 'partner_id', p.code);
                                                                    updateSingleUserField(u.user_id, 'partner_name', p.name);
                                                                    setActiveDropdown(null);
                                                                }}
                                                                className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between items-center cursor-pointer"
                                                            >
                                                                <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                                                                <span className="text-[10px] text-slate-400 font-mono">Mã: {p.code}</span>
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* 2. TRƯỜNG HỌC THỤ HƯỞNG */}
                                        <div className="relative">
                                            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 mb-1">
                                                <span>Trường Học (School):</span>
                                                {u.school_id && <span className="font-mono text-indigo-600 font-bold">Mã: {u.school_id}</span>}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={activeDropdown?.userId === u.user_id && activeDropdown?.type === 'school' ? activeDropdown.search : u.school_name}
                                                    onFocus={() => setActiveDropdown({ userId: u.user_id, type: 'school', search: u.school_name })}
                                                    onChange={(e) => setActiveDropdown({ userId: u.user_id, type: 'school', search: e.target.value })}
                                                    placeholder="Gõ tìm tên trường..."
                                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden pr-7"
                                                />
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                                            </div>

                                            {activeDropdown?.userId === u.user_id && activeDropdown?.type === 'school' && (
                                                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto p-1 space-y-0.5">
                                                    {schoolsList
                                                        .filter(s => !activeDropdown.search || s.school_name.toLowerCase().includes(activeDropdown.search.toLowerCase()) || String(s.school_code).includes(activeDropdown.search))
                                                        .slice(0, 40)
                                                        .map(s => (
                                                            <button
                                                                key={`${s.school_id}-${s.school_code}`}
                                                                type="button"
                                                                onClick={() => {
                                                                    updateSingleUserField(u.user_id, 'school_id', s.school_code);
                                                                    updateSingleUserField(u.user_id, 'school_name', s.school_name);
                                                                    if (s.partner_code && s.partner_code !== 'N/A') {
                                                                        updateSingleUserField(u.user_id, 'partner_id', s.partner_code);
                                                                        updateSingleUserField(u.user_id, 'partner_name', s.partner_name);
                                                                    }
                                                                    setActiveDropdown(null);
                                                                }}
                                                                className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between items-center cursor-pointer"
                                                            >
                                                                <span className="font-bold text-slate-900 dark:text-white truncate">{s.school_name}</span>
                                                                <span className="text-[10px] text-slate-400 font-mono ml-2 shrink-0">Mã: {s.school_code}</span>
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-1 text-[10px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-200/40 dark:border-slate-700/40">
                                            <span>Moodle User ID: <b>{u.id_user_md || 'Chưa liên kết'}</b></span>
                                            <span>Quốc gia: {u.country_id}</span>
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
                    <span>Nhập tiền tố hoặc dán danh sách tài khoản từ Excel vào ô trên và bấm "Dò Tìm Hồ Sơ".</span>
                </div>
            )}
        </div>
    );
};