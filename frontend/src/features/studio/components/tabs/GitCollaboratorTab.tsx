// frontend/src/features/studio/components/tabs/GitCollaboratorTab.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    GitBranch,
    Search,
    X,
    Check,
    UserPlus,
    UserMinus,
    AlertTriangle,
    PlusCircle,
    Globe,
    Zap,
    Eye,
    EyeOff,
    CheckCircle2,
    XCircle,
    Loader2,
    FileSpreadsheet,
    Trash2,
    Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../../../lib/api';
import { AvailableGitRepo } from '../../types';

export type GitSubActionType = 'add' | 'remove' | 'jit';

interface GitCollaboratorTabProps {
    gitSelectedRepos: string[];
    setGitSelectedRepos: (repos: string[]) => void;
    customRepoInput: string;
    setCustomRepoInput: (val: string) => void;
    gitActionType?: string;
    setGitActionType?: (val: any) => void;
    gitTargetRole: 'GUEST' | 'DEVELOPER' | 'ADMIN';
    setGitTargetRole: (role: 'GUEST' | 'DEVELOPER' | 'ADMIN') => void;
    gitUsersList: string;
    setGitUsersList: (val: string) => void;
    allAvailableGitRepos: AvailableGitRepo[];
}

interface ParsedJitAccount {
    id: number;
    username: string;
    password: string;
    isValid: boolean;
    error?: string;
    status: 'idle' | 'running' | 'success' | 'failed';
    message?: string;
}

export const GitCollaboratorTab: React.FC<GitCollaboratorTabProps> = ({
    gitSelectedRepos,
    setGitSelectedRepos,
    customRepoInput,
    setCustomRepoInput,
    gitActionType = 'add',
    setGitActionType,
    gitTargetRole,
    setGitTargetRole,
    gitUsersList,
    setGitUsersList,
    allAvailableGitRepos,
}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    // Chế độ JIT Activation
    const [jitRawInput, setJitRawInput] = useState<string>('');
    const [showPasswords, setShowPasswords] = useState<boolean>(false);
    const [isActivatingJit, setIsActivatingJit] = useState<boolean>(false);
    const [jitProgress, setJitProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
    const [accountStatuses, setAccountStatuses] = useState<Record<string, { status: 'success' | 'failed'; msg?: string }>>({});

    // Chuẩn hóa Action Type: 'add' | 'remove' | 'jit'
    const activeMode: GitSubActionType = (gitActionType as GitSubActionType) || 'add';
    const isRemoveMode = activeMode === 'remove';
    const isJitMode = activeMode === 'jit';

    const handleSwitchMode = (mode: GitSubActionType) => {
        if (setGitActionType) {
            setGitActionType(mode);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Khử ký tự HTML Entity &amp; ➔ &
    const cleanHtmlEntities = (str: string) => (str || '').replace(/&amp;/g, '&');

    // Lọc danh sách repos theo từ khóa
    const filteredAvailableGitRepos = useMemo(() => {
        const q = customRepoInput.trim().toLowerCase();
        if (!q) return allAvailableGitRepos;
        return allAvailableGitRepos.filter(
            (r) =>
                r.repo_name.toLowerCase().includes(q) ||
                r.repo_url.toLowerCase().includes(q) ||
                cleanHtmlEntities(r.course_name).toLowerCase().includes(q) ||
                r.category.toLowerCase().includes(q)
        );
    }, [allAvailableGitRepos, customRepoInput]);

    // Kiểm tra xem chuỗi nhập vào có phải repo ngoài không
    const isCustomCandidate = useMemo(() => {
        const val = customRepoInput.trim();
        if (!val) return false;
        const existsInCatalog = allAvailableGitRepos.some(
            (r) => r.repo_url.toLowerCase() === val.toLowerCase() || r.repo_name.toLowerCase() === val.toLowerCase()
        );
        return !existsInCatalog && !gitSelectedRepos.includes(val);
    }, [customRepoInput, allAvailableGitRepos, gitSelectedRepos]);

    const handleAddCustomRepo = () => {
        const val = customRepoInput.trim();
        if (val && !gitSelectedRepos.includes(val)) {
            setGitSelectedRepos([...gitSelectedRepos, val]);
            setCustomRepoInput('');
            setIsDropdownOpen(false);
        }
    };

    // =========================================================================
    // 📊 BỘ BÓC TÁCH DỮ LIỆU GOOGLE SHEETS / EXCEL (2 CỘT TÀI KHOẢN & MẬT KHẨU)
    // =========================================================================
    const parsedJitAccounts = useMemo<ParsedJitAccount[]>(() => {
        if (!jitRawInput.trim()) return [];
        const lines = jitRawInput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const results: ParsedJitAccount[] = [];

        lines.forEach((line, index) => {
            const lower = line.toLowerCase();
            // Tự động bỏ qua dòng Header nếu người dùng copy dính tiêu đề
            if (
                index === 0 &&
                (lower.includes('username') || lower.includes('tài khoản') || lower.includes('email')) &&
                (lower.includes('password') || lower.includes('mật khẩu') || lower.includes('pass'))
            ) {
                return;
            }

            let u = '';
            let p = '';

            // Phân tách theo Tab (\t) từ Google Sheet
            if (line.includes('\t')) {
                const parts = line.split('\t').map((s) => s.trim());
                u = parts[0] || '';
                p = parts[1] || '';
            } else if (line.includes(',')) {
                const parts = line.split(',').map((s) => s.trim());
                u = parts[0] || '';
                p = parts.slice(1).join(',').trim();
            } else if (line.includes(';')) {
                const parts = line.split(';').map((s) => s.trim());
                u = parts[0] || '';
                p = parts.slice(1).join(';').trim();
            } else {
                // Tách theo khoảng trắng
                const parts = line.split(/\s+/).map((s) => s.trim());
                u = parts[0] || '';
                p = parts.slice(1).join(' ').trim();
            }

            const isValid = Boolean(u && p);
            let error = '';
            if (!u) error = 'Thiếu tài khoản';
            else if (!p) error = 'Thiếu mật khẩu';

            const statusInfo = accountStatuses[u.toLowerCase()] || { status: 'idle' };

            results.push({
                id: results.length + 1,
                username: u,
                password: p,
                isValid,
                error,
                status: isActivatingJit ? 'running' : statusInfo.status,
                message: statusInfo.msg,
            });
        });

        return results;
    }, [jitRawInput, accountStatuses, isActivatingJit]);

    const validJitAccounts = useMemo(() => parsedJitAccounts.filter((a) => a.isValid), [parsedJitAccounts]);
    const invalidJitCount = parsedJitAccounts.length - validJitAccounts.length;

    // =========================================================================
    // ⚡ KÍCH HOẠT JIT TRỰC TIẾP (1-CLICK DIRECT ACTIVATION)
    // =========================================================================
    const handleTriggerBatchJit = async () => {
        if (validJitAccounts.length === 0) {
            toast.error('Vui lòng dán danh sách tài khoản & mật khẩu hợp lệ trước khi kích hoạt!');
            return;
        }

        setIsActivatingJit(true);
        setJitProgress({ current: 0, total: validJitAccounts.length });
        const newStatuses: Record<string, { status: 'success' | 'failed'; msg?: string }> = {};

        try {
            const payload = {
                accounts: validJitAccounts.map((a) => ({
                    username: a.username,
                    password: a.password,
                })),
                concurrency: 3,
            };

            toast.loading(`Đang kích hoạt JIT cho ${validJitAccounts.length} tài khoản...`, { id: 'jit-run' });

            const res = await fetchApi<{
                total: number;
                activated: string[];
                failed: string[];
                elapsed_seconds: number;
            }>('/workspace/git/batch-activate-jit', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            // Ghi nhận trạng thái từng dòng
            res.activated.forEach((u) => {
                newStatuses[u.toLowerCase()] = { status: 'success', msg: 'Đã Online trên Git' };
            });
            res.failed.forEach((u) => {
                newStatuses[u.toLowerCase()] = { status: 'failed', msg: 'Lỗi Keycloak/Pass' };
            });

            setAccountStatuses(newStatuses);
            setJitProgress({ current: res.total, total: res.total });

            toast.success(
                `🎉 Kích hoạt JIT hoàn tất! Thành công: ${res.activated.length}/${res.total} (${res.elapsed_seconds}s)`,
                { id: 'jit-run' }
            );

            // Đồng bộ danh sách username đã thành công vào gitUsersList để tiện dùng tiếp
            if (res.activated.length > 0) {
                setGitUsersList(res.activated.join('\n'));
            }
        } catch (err: any) {
            toast.error(`Kích hoạt JIT thất bại: ${err?.message || 'Lỗi không xác định'}`, { id: 'jit-run' });
        } finally {
            setIsActivatingJit(false);
        }
    };

    return (
        <div
            className={`space-y-5 rounded-[2rem] border transition-colors p-6 sm:p-7 shadow-xs ${isJitMode
                    ? 'border-amber-200/80 dark:border-amber-900/60 bg-white dark:bg-slate-900'
                    : isRemoveMode
                        ? 'border-rose-200/80 dark:border-rose-900/60 bg-white dark:bg-slate-900'
                        : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
        >
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <GitBranch
                        className={`h-4 w-4 ${isJitMode
                                ? 'text-amber-500'
                                : isRemoveMode
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-violet-600 dark:text-violet-400'
                            }`}
                    />
                    <span>Quản Trị Cộng Tác Viên Pythaverse Git (Fast Engine Hybrid V4.0):</span>
                </div>
                <div className="flex items-center gap-2">
                    {isJitMode ? (
                        <span className="rounded-full bg-amber-100 dark:bg-amber-950/70 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                            Kích Hoạt JIT Cấp Tốc (~300ms/user)
                        </span>
                    ) : isRemoveMode ? (
                        <span className="rounded-full bg-rose-100 dark:bg-rose-950/70 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            🗑️ Chế Độ: Gỡ Quyền (Remove)
                        </span>
                    ) : (
                        <span className="rounded-full bg-violet-100 dark:bg-violet-950/70 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                            ⚡ 1 Phiên Đăng Nhập Duy Nhất
                        </span>
                    )}
                </div>
            </div>

            {/* BẬT/TẮT CHUYỂN ĐỔI 3 HÀNH ĐỘNG: THÊM vs GỠ BỎ vs KÍCH HOẠT JIT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-750">
                <button
                    type="button"
                    onClick={() => handleSwitchMode('add')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${activeMode === 'add'
                            ? 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                >
                    <UserPlus className="w-3.5 h-3.5 text-violet-600" />
                    <span>Thêm / Cập Nhật Quyền</span>
                </button>

                <button
                    type="button"
                    onClick={() => handleSwitchMode('remove')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${isRemoveMode
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
                        }`}
                >
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>Gỡ Khỏi Repository</span>
                </button>

                <button
                    type="button"
                    onClick={() => handleSwitchMode('jit')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${isJitMode
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
                        }`}
                >
                    <Zap className="w-3.5 h-3.5" />
                    <span>⚡ Kích Hoạt JIT Hàng Loạt</span>
                </button>
            </div>

            {/* ================================================================= */}
            {/* 🎯 GIAO DIỆN CHUYÊN BIỆT: KÍCH HOẠT JIT HÀNG LOẠT (OIDC SEEDING) */}
            {/* ================================================================= */}
            {isJitMode ? (
                <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Banner hướng dẫn Bento Grid */}
                    <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
                        <FileSpreadsheet className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                            <p className="font-bold flex items-center gap-1.5">
                                Kích hoạt JIT (Just-In-Time) siêu tốc không cần mở trình duyệt:
                            </p>
                            <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/80">
                                Copy 2 cột <strong>Tài khoản</strong> và <strong>Mật khẩu</strong> từ Google Sheet hoặc Excel rồi dán thẳng vào ô bên dưới. Hệ thống sẽ tự động bắt tay OIDC với Keycloak (~300ms/user) để khởi tạo tài khoản trên GitBucket mà không cần quyền Admin!
                            </p>
                        </div>
                    </div>

                    {/* Ô dán dữ liệu 2 cột */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                            <span className="flex items-center gap-1.5">
                                <span>DÁN DỮ LIỆU TỪ GOOGLE SHEET (TÀI KHOẢN + MẬT KHẨU):</span>
                                <span className="text-amber-500">*</span>
                            </span>
                            {jitRawInput && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setJitRawInput('');
                                        setAccountStatuses({});
                                    }}
                                    className="text-[11px] text-slate-400 hover:text-rose-500 transition flex items-center gap-1 cursor-pointer"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Xóa nội dung</span>
                                </button>
                            )}
                        </div>

                        <textarea
                            rows={4}
                            value={jitRawInput}
                            onChange={(e) => setJitRawInput(e.target.value)}
                            placeholder={"stdntsabah1\tPtv@2026\nstdntsabah2\tPtv@2026\ngvdttemd\tteacher_pass"}
                            className="w-full rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-slate-900/50 p-3 font-mono text-xs text-slate-900 dark:text-white focus:border-amber-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden"
                        />
                    </div>

                    {/* BẢNG LIVE PREVIEW BENTO GRID */}
                    {parsedJitAccounts.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                        Bảng Nhận Diện Dữ Liệu ({validJitAccounts.length} hợp lệ):
                                    </span>
                                    {invalidJitCount > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200">
                                            {invalidJitCount} dòng lỗi
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords(!showPasswords)}
                                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5 cursor-pointer font-medium"
                                >
                                    {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    <span>{showPasswords ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</span>
                                </button>
                            </div>

                            <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 scrollbar-thin">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/70 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                            <th className="py-2.5 px-3 w-12 text-center">STT</th>
                                            <th className="py-2.5 px-3">Tài khoản / Email</th>
                                            <th className="py-2.5 px-3">Mật khẩu</th>
                                            <th className="py-2.5 px-3 w-36 text-center">Trạng thái JIT</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
                                        {parsedJitAccounts.map((acc) => (
                                            <tr
                                                key={acc.id}
                                                className={`hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors ${!acc.isValid ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                                                    }`}
                                            >
                                                <td className="py-2 px-3 text-center text-slate-400 font-sans text-[11px]">
                                                    {acc.id}
                                                </td>
                                                <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">
                                                    {acc.username || <span className="text-rose-500 italic">Trống</span>}
                                                </td>
                                                <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                                                    {showPasswords ? (
                                                        <span>{acc.password || <span className="text-rose-500 italic">Trống</span>}</span>
                                                    ) : (
                                                        <span>{acc.password ? '••••••••' : <span className="text-rose-500 italic">Trống</span>}</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-center font-sans">
                                                    {acc.status === 'running' ? (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                            <span>Đang chạy...</span>
                                                        </span>
                                                    ) : acc.status === 'success' ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                                                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                            <span>Online Git</span>
                                                        </span>
                                                    ) : acc.status === 'failed' ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200">
                                                            <XCircle className="w-3 h-3 text-rose-600" />
                                                            <span>{acc.message || 'Lỗi'}</span>
                                                        </span>
                                                    ) : acc.isValid ? (
                                                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                                                            <Check className="w-3 h-3" />
                                                            <span>Hợp lệ</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            <span>{acc.error}</span>
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Nút bấm Kích hoạt JIT Trực Tiếp */}
                            <div className="pt-2">
                                <button
                                    type="button"
                                    disabled={isActivatingJit || validJitAccounts.length === 0}
                                    onClick={handleTriggerBatchJit}
                                    className={`w-full py-3.5 px-4 rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer ${isActivatingJit || validJitAccounts.length === 0
                                            ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-amber-500/20'
                                        }`}
                                >
                                    {isActivatingJit ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Đang Kích Hoạt ({jitProgress.current}/{jitProgress.total})...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-4 h-4 fill-white" />
                                            <span>
                                                Kích Hoạt JIT Ngay Cho {validJitAccounts.length} Tài Khoản (Headless OIDC)
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* ================================================================= */
                /* 🐙 GIAO DIỆN GỐC: QUẢN TRỊ COLLABORATORS (THÊM / GỠ KHỎI REPO)    */
                /* ================================================================= */
                <div className="space-y-4">
                    {/* 1. KHU VỰC UNIFIED SMART COMBOBOX REPO */}
                    <div className="space-y-2 relative" ref={dropdownRef}>
                        <div className="flex items-center justify-between text-xs">
                            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <span>
                                    Các Repository Mục Tiêu ({gitSelectedRepos.length} Repos đã chọn):{' '}
                                    <span className="text-rose-500">*</span>
                                </span>
                            </label>
                            {gitSelectedRepos.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setGitSelectedRepos([])}
                                    className="text-[11px] font-bold text-slate-400 hover:text-rose-500 transition cursor-pointer"
                                >
                                    Xóa tất cả đã chọn
                                </button>
                            )}
                        </div>

                        {/* Tags Pill các Repos đã chọn */}
                        {gitSelectedRepos.length > 0 && (
                            <div className="flex flex-wrap gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                                {gitSelectedRepos.map((repoUrl, rIdx) => {
                                    const shortName = repoUrl.split('/').pop() || repoUrl;
                                    return (
                                        <span
                                            key={rIdx}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border text-xs font-mono font-bold shadow-2xs ${isRemoveMode
                                                    ? 'border-rose-200 dark:border-rose-900/70 text-rose-700 dark:text-rose-300'
                                                    : 'border-violet-200 dark:border-violet-800/60 text-violet-700 dark:text-violet-300'
                                                }`}
                                        >
                                            <span>🐙 {shortName}</span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setGitSelectedRepos(gitSelectedRepos.filter((_, i) => i !== rIdx))
                                                }
                                                className="hover:text-rose-500 transition cursor-pointer"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        {/* Ô nhập thông minh repo */}
                        <div className="relative flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    type="text"
                                    value={customRepoInput}
                                    onChange={(e) => {
                                        setCustomRepoInput(e.target.value);
                                        setIsDropdownOpen(true);
                                    }}
                                    onFocus={() => setIsDropdownOpen(true)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (isCustomCandidate) {
                                                handleAddCustomRepo();
                                            }
                                        }
                                    }}
                                    placeholder="Gõ tìm repo trong danh mục (30 repos) hoặc dán link repo ngoài..."
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 font-mono text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden"
                                />
                            </div>
                            {isCustomCandidate && (
                                <button
                                    type="button"
                                    onClick={handleAddCustomRepo}
                                    className={`px-4 py-2.5 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${isRemoveMode ? 'bg-rose-600 hover:bg-rose-700' : 'bg-violet-600 hover:bg-violet-700'
                                        }`}
                                >
                                    <PlusCircle className="w-3.5 h-3.5" />
                                    <span>Thêm Repo Ngoài</span>
                                </button>
                            )}
                        </div>

                        {/* Dropdown danh sách gợi ý */}
                        {isDropdownOpen && (
                            <div className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
                                {isCustomCandidate && (
                                    <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-violet-50/60 dark:bg-violet-950/40">
                                        <button
                                            type="button"
                                            onClick={handleAddCustomRepo}
                                            className="w-full text-left p-2 rounded-xl text-xs flex items-center gap-2 text-violet-700 dark:text-violet-300 hover:bg-violet-100/60 dark:hover:bg-violet-900/50 transition cursor-pointer font-semibold"
                                        >
                                            <Globe className="w-4 h-4 text-violet-500 shrink-0" />
                                            <span className="truncate">
                                                ➕ Thêm repo tùy chỉnh: <strong className="font-mono">{customRepoInput.trim()}</strong>
                                            </span>
                                            <span className="text-[10px] text-violet-500 ml-auto font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-violet-200 dark:border-violet-700">
                                                Enter ↵
                                            </span>
                                        </button>
                                    </div>
                                )}

                                <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin max-h-64">
                                    {filteredAvailableGitRepos.length === 0 && !isCustomCandidate ? (
                                        <p className="p-4 text-center text-xs text-slate-400">
                                            Không tìm thấy repo nào khớp trong danh mục. Hãy nhập link repo để thêm ngoài!
                                        </p>
                                    ) : (
                                        filteredAvailableGitRepos.map((repo, idx) => {
                                            const isSelected = gitSelectedRepos.includes(repo.repo_url);
                                            const cleanCourseName = cleanHtmlEntities(repo.course_name);

                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setGitSelectedRepos(gitSelectedRepos.filter((u) => u !== repo.repo_url));
                                                        } else {
                                                            setGitSelectedRepos([...gitSelectedRepos, repo.repo_url]);
                                                        }
                                                    }}
                                                    className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${isSelected
                                                            ? isRemoveMode
                                                                ? 'bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700'
                                                                : 'bg-violet-50 dark:bg-violet-950/60 border border-violet-300 dark:border-violet-700'
                                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-transparent'
                                                        }`}
                                                >
                                                    <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono font-bold text-slate-900 dark:text-white truncate">
                                                                🐙 {repo.repo_name}
                                                            </span>
                                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                                {repo.target === 'teacher_only' ? 'GV' : 'Cả Lớp'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 truncate">
                                                            Môn: <strong>{cleanCourseName}</strong>
                                                        </p>
                                                    </div>
                                                    {isSelected && (
                                                        <Check
                                                            className={`w-4 h-4 shrink-0 ${isRemoveMode ? 'text-rose-600' : 'text-violet-600'
                                                                }`}
                                                        />
                                                    )}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. KHU VỰC VAI TRÒ */}
                    {!isRemoveMode ? (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Vai Trò Áp Dụng Cho Tất Cả Các Repos Đã Chọn:
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'GUEST', label: 'Guest (Khách xem)', desc: 'Khuyên dùng cho học sinh & GV' },
                                    { id: 'DEVELOPER', label: 'Developer (Lập trình)', desc: 'Có quyền push code lên repo' },
                                    { id: 'ADMIN', label: 'Admin (Quản trị)', desc: 'Toàn quyền cấu hình repo' },
                                ].map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => setGitTargetRole(r.id as any)}
                                        className={`rounded-2xl border p-3 text-left transition-all cursor-pointer ${gitTargetRole === r.id
                                                ? 'border-violet-600 bg-violet-50/80 dark:bg-violet-950/40 ring-1 ring-violet-500'
                                                : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 hover:bg-slate-50'
                                            }`}
                                    >
                                        <p
                                            className={`text-xs font-bold ${gitTargetRole === r.id
                                                    ? 'text-violet-700 dark:text-violet-300'
                                                    : 'text-slate-800 dark:text-slate-200'
                                                }`}
                                        >
                                            {r.label}
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{r.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div className="text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
                                <span className="font-bold">Lưu ý khi gỡ quyền:</span> Toàn bộ tài khoản nhập bên dưới sẽ bị xóa vĩnh viễn khỏi danh sách Collaborators của tất cả các Repositories được chọn. Không cần chọn vai trò.
                            </div>
                        </div>
                    )}

                    {/* 3. DANH SÁCH USER CHO CHẾ ĐỘ THÊM/GỠ */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                            <span>
                                {isRemoveMode
                                    ? 'DANH SÁCH USERNAME HOẶC EMAIL CẦN GỠ KHỎI REPO:'
                                    : 'DANH SÁCH USERNAME HOẶC EMAIL CẦN THÊM:'}
                            </span>
                            <span
                                className={`font-mono text-[11px] font-bold ${isRemoveMode ? 'text-rose-600' : 'text-violet-600'
                                    }`}
                            >
                                {gitUsersList.split(/[\n,;]+/).filter((x) => x.trim().length > 0).length} tài khoản
                            </span>
                        </div>
                        <textarea
                            rows={4}
                            value={gitUsersList}
                            onChange={(e) => setGitUsersList(e.target.value)}
                            placeholder={
                                isRemoveMode
                                    ? 'gvdttemd@pythaverse.net\nhsdttemd'
                                    : 'hsdttemd\ngvdttemd@pythaverse.net'
                            }
                            className={`w-full rounded-xl border p-3 font-mono text-xs text-slate-900 dark:text-white focus:outline-hidden ${isRemoveMode
                                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50/20 dark:bg-slate-900 focus:border-rose-500'
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-violet-500'
                                }`}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};