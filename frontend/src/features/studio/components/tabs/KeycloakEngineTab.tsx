// frontend/src/features/studio/components/tabs/KeycloakEngineTab.tsx
import React from 'react';
import {
    Key,
    Zap,
    Search,
    AtSign,
    ShieldCheck,
    UserCheck,
    Loader2,
    CheckCircle2,
    XCircle,
} from 'lucide-react';

interface KeycloakEngineTabProps {
    kcActiveMode: 'manage' | 'lookup';
    setKcActiveMode: (mode: 'manage' | 'lookup') => void;
    kcTargetEmail: string;
    setKcTargetEmail: (val: string) => void;
    kcEnableResetPass: boolean;
    setKcEnableResetPass: (val: boolean) => void;
    kcPasswordOption: 'email_lowercase' | 'custom' | 'default_secure';
    setKcPasswordOption: (val: 'email_lowercase' | 'custom' | 'default_secure') => void;
    kcTempPass: string;
    setKcTempPass: (val: string) => void;
    kcForceChange: boolean;
    setKcForceChange: (val: boolean) => void;
    kcEnableVerify: boolean;
    setKcEnableVerify: (val: boolean) => void;
    kcVerifyAction: 'verify' | 'unverify';
    setKcVerifyAction: (val: 'verify' | 'unverify') => void;
    kcEnableStatus: boolean;
    setKcEnableStatus: (val: boolean) => void;
    kcStatusAction: 'enable' | 'disable';
    setKcStatusAction: (val: 'enable' | 'disable') => void;
    kcLookupResults: any[];
    isKcLookingUp: boolean;
    onKeycloakLookup: () => void;
}

export const KeycloakEngineTab: React.FC<KeycloakEngineTabProps> = ({
    kcActiveMode,
    setKcActiveMode,
    kcTargetEmail,
    setKcTargetEmail,
    kcEnableResetPass,
    setKcEnableResetPass,
    kcPasswordOption,
    setKcPasswordOption,
    kcTempPass,
    setKcTempPass,
    kcForceChange,
    setKcForceChange,
    kcEnableVerify,
    setKcEnableVerify,
    kcVerifyAction,
    setKcVerifyAction,
    kcEnableStatus,
    setKcEnableStatus,
    kcStatusAction,
    setKcStatusAction,
    kcLookupResults,
    isKcLookingUp,
    onKeycloakLookup,
}) => {
    return (
        <div className="space-y-5 rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
            {/* Header & Sub-tab Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Key className="h-4 w-4 text-purple-600" />
                    <span>Quản Trị & Tra Cứu Danh Tính Keycloak eID:</span>
                </div>

                {/* Switcher: Cập nhật vs Tra cứu */}
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setKcActiveMode('manage')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${kcActiveMode === 'manage'
                            ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                    >
                        <Zap className="w-3.5 h-3.5" />
                        <span>1. Cập Nhật & Đổi Mật Khẩu</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setKcActiveMode('lookup')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${kcActiveMode === 'lookup'
                            ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                    >
                        <Search className="w-3.5 h-3.5" />
                        <span>2. Tra Cứu Danh Tính eID (Bulk Lookup)</span>
                    </button>
                </div>
            </div>

            {/* Ô Nhập Danh Sách Email/Username */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <label>Danh Sách Email hoặc Username Cần Xử Lý (Mỗi dòng 1 tài khoản):</label>
                    <span className="font-mono text-purple-600 font-bold">
                        {kcTargetEmail.split(/[\n,;]+/).filter((x) => x.trim().length > 0).length} tài khoản
                    </span>
                </div>
                <textarea
                    rows={3}
                    value={kcTargetEmail}
                    onChange={(e) => setKcTargetEmail(e.target.value)}
                    placeholder="Nhập danh sách email hoặc username...&#10;teacher.demo@pythaverse.space&#10;student.demo@pythaverse.space"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3 font-mono text-xs text-slate-900 dark:text-white focus:border-purple-500 focus:bg-white focus:outline-hidden leading-relaxed"
                />
            </div>

            {/* CHẾ ĐỘ 1: CẬP NHẬT & ĐỔI MẬT KHẨU */}
            {kcActiveMode === 'manage' && (
                <div className="space-y-3.5">
                    {/* Box 1: Đổi Mật Khẩu */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600">
                                    <Key className="h-4 w-4" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                        1. Đặt Lại Mật Khẩu Khởi Tạo
                                    </h4>
                                    <p className="text-[11px] text-slate-400">Gán mật khẩu ban đầu cho người dùng</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setKcEnableResetPass(!kcEnableResetPass)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${kcEnableResetPass ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${kcEnableResetPass ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>

                        {kcEnableResetPass && (
                            <div className="space-y-3 pt-3 border-t border-slate-200/60 dark:border-slate-800">
                                <label className="text-[11px] font-bold uppercase text-slate-500">
                                    Chọn Quy Chuẩn Mật Khẩu Áp Dụng:
                                </label>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Nấc 1: Dùng chính email */}
                                    <button
                                        type="button"
                                        onClick={() => setKcPasswordOption('email_lowercase')}
                                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${kcPasswordOption === 'email_lowercase'
                                            ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 ring-1 ring-amber-500 shadow-xs'
                                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                                            }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-300">
                                            <AtSign className="w-4 h-4" />
                                            <span>1. Dùng Chính Email Tài Khoản</span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                            Tự động lấy email viết thường của từng người làm mật khẩu (chuẩn quen thuộc cho HS/GV).
                                        </p>
                                    </button>

                                    {/* Nấc 2: Mật khẩu chung / tùy chỉnh */}
                                    <button
                                        type="button"
                                        onClick={() => setKcPasswordOption('custom')}
                                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${kcPasswordOption === 'custom'
                                            ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 ring-1 ring-amber-500 shadow-xs'
                                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-300">
                                                <Key className="w-4 h-4" />
                                                <span>2. Mật Khẩu Chung / Tùy Chỉnh</span>
                                            </div>
                                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                                                Gợi ý sẵn
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                            Áp dụng một mật khẩu cố định cho toàn bộ danh sách (mặc định hoặc tự nhập đè).
                                        </p>
                                    </button>
                                </div>

                                {/* Ô Input hiển thị khi chọn nấc 2 */}
                                {kcPasswordOption === 'custom' && (
                                    <div className="pt-2 animate-in fade-in duration-150">
                                        <div className="flex items-center justify-between text-[11px] font-bold uppercase text-slate-500 mb-1">
                                            <span>Mật Khẩu Áp Dụng (Có thể sửa tùy ý):</span>
                                            <button
                                                type="button"
                                                onClick={() => setKcTempPass('Pythaverse@2026')}
                                                className="text-amber-600 hover:underline cursor-pointer lowercase text-[10px]"
                                            >
                                                ↺ đặt lại Pythaverse@2026
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={kcTempPass}
                                                onChange={(e) => setKcTempPass(e.target.value)}
                                                placeholder="Pythaverse@2026"
                                                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 font-mono text-xs font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-hidden"
                                            />
                                            <ShieldCheck className="absolute right-3 top-2.5 w-4 h-4 text-emerald-500" />
                                        </div>
                                    </div>
                                )}

                                <div className="pt-1">
                                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={kcForceChange}
                                            onChange={(e) => setKcForceChange(e.target.checked)}
                                            className="h-4 w-4 rounded-md border-slate-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span>Bắt buộc đổi mật khẩu khi đăng nhập lần đầu (Temporary = TRUE)</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Box 2: Xác Thực Email */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600">
                                    <ShieldCheck className="h-4 w-4" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                        2. Xác Thực Email
                                    </h4>
                                    <p className="text-[11px] text-slate-400">Gỡ lỗi tài khoản chưa xác thực email</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setKcEnableVerify(!kcEnableVerify)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${kcEnableVerify ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${kcEnableVerify ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>

                        {kcEnableVerify && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setKcVerifyAction('verify')}
                                    className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcVerifyAction === 'verify'
                                        ? 'border border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                                        }`}
                                >
                                    ✓ Đã Xác Thực (Email Verified = True)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setKcVerifyAction('unverify')}
                                    className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcVerifyAction === 'unverify'
                                        ? 'border border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                        : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                                        }`}
                                >
                                    ✗ Gỡ Xác Thực (Email Verified = False)
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Box 3: Trạng Thái Hoạt Động */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-600">
                                    <UserCheck className="h-4 w-4" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                        3. Trạng Thái Hoạt Động
                                    </h4>
                                    <p className="text-[11px] text-slate-400">Khóa hoặc kích hoạt lại người dùng</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setKcEnableStatus(!kcEnableStatus)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${kcEnableStatus ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${kcEnableStatus ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>

                        {kcEnableStatus && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setKcStatusAction('enable')}
                                    className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcStatusAction === 'enable'
                                        ? 'border border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                                        }`}
                                >
                                    ✓ Kích Hoạt (Enabled = True)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setKcStatusAction('disable')}
                                    className={`rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${kcStatusAction === 'disable'
                                        ? 'border border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                        : 'border border-slate-200 dark:border-slate-800 text-slate-500'
                                        }`}
                                >
                                    ✗ Vô Hiệu Hóa (Enabled = False)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CHẾ ĐỘ 2: 🔍 BULK LOOKUP ĐỐI SOÁT DANH TÍNH TRỰC TUYẾN */}
            {kcActiveMode === 'lookup' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                Kiểm Tra Tài Khoản eID Trực Tuyến
                            </h4>
                            <p className="text-[11px] text-slate-500">
                                Đối soát trực tiếp qua Keycloak REST API để kiểm tra sự tồn tại và trạng thái tài khoản.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onKeycloakLookup}
                            disabled={isKcLookingUp}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                        >
                            {isKcLookingUp ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Đang tra cứu eID...</span>
                                </>
                            ) : (
                                <>
                                    <Search className="w-3.5 h-3.5" />
                                    <span>🔍 Tra Cứu Thông Tin Ngay</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Bảng Kết Quả Tra Cứu */}
                    {kcLookupResults.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-xs space-y-0">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                    Kết Quả Đối Soát ({kcLookupResults.length} tài khoản):
                                </span>
                                <div className="flex items-center gap-2 text-[11px] font-mono font-bold">
                                    <span className="text-emerald-600">
                                        {kcLookupResults.filter((u) => u.exists).length} Tồn tại
                                    </span>
                                    <span>|</span>
                                    <span className="text-rose-500">
                                        {kcLookupResults.filter((u) => !u.exists).length} Không có
                                    </span>
                                </div>
                            </div>

                            <div className="max-h-80 overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50/50 dark:bg-slate-800/40 text-[10px] font-bold uppercase text-slate-500 sticky top-0">
                                        <tr>
                                            <th className="p-3">Định Danh Đầu Vào</th>
                                            <th className="p-3">Username eID</th>
                                            <th className="p-3">Email</th>
                                            <th className="p-3">Họ & Tên</th>
                                            <th className="p-3 text-center">Tồn Tại</th>
                                            <th className="p-3 text-center">Kích Hoạt</th>
                                            <th className="p-3 text-center">Verify Email</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px] font-mono">
                                        {kcLookupResults.map((u, idx) => (
                                            <tr
                                                key={idx}
                                                className={`transition ${u.exists ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'bg-rose-50/30 dark:bg-rose-950/20'
                                                    }`}
                                            >
                                                <td className="p-3 font-semibold text-slate-900 dark:text-white">
                                                    {u.identifier}
                                                </td>
                                                <td className="p-3 text-purple-600 font-bold">
                                                    {u.username || '—'}
                                                </td>
                                                <td className="p-3 font-sans text-slate-700 dark:text-slate-300">
                                                    {u.email || '—'}
                                                </td>
                                                <td className="p-3 font-sans text-slate-700 dark:text-slate-300">
                                                    {u.exists ? `${u.lastName} ${u.firstName}`.trim() || '(Chưa đặt tên)' : '—'}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {u.exists ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                                                            <CheckCircle2 className="w-3 h-3" /> CÓ
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                                                            <XCircle className="w-3 h-3" /> KHÔNG
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {u.exists ? (
                                                        u.enabled ? (
                                                            <span className="text-emerald-600 font-bold">Đang Mở</span>
                                                        ) : (
                                                            <span className="text-rose-500 font-bold">Bị Khóa</span>
                                                        )
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {u.exists ? (
                                                        u.emailVerified ? (
                                                            <span className="text-emerald-600 font-bold">✓ Đã xác thực</span>
                                                        ) : (
                                                            <span className="text-amber-500 font-bold">Chưa xác thực</span>
                                                        )
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};