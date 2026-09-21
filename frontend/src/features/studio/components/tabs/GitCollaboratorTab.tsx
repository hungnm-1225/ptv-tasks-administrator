// frontend/src/features/studio/components/tabs/GitCollaboratorTab.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    GitBranch,
    Search,
    X,
    Check,
    UserPlus,
    UserMinus,
    AlertTriangle
} from 'lucide-react';
import { AvailableGitRepo } from '../../types';

interface GitCollaboratorTabProps {
    gitSelectedRepos: string[];
    setGitSelectedRepos: (repos: string[]) => void;
    customRepoInput: string;
    setCustomRepoInput: (val: string) => void;
    gitActionType?: 'add' | 'remove';
    setGitActionType?: (val: 'add' | 'remove') => void;
    gitTargetRole: 'GUEST' | 'DEVELOPER' | 'ADMIN';
    setGitTargetRole: (role: 'GUEST' | 'DEVELOPER' | 'ADMIN') => void;
    gitUsersList: string;
    setGitUsersList: (val: string) => void;
    allAvailableGitRepos: AvailableGitRepo[];
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
    const [isGitRepoDropdownOpen, setIsGitRepoDropdownOpen] = useState<boolean>(false);
    const [gitRepoSearchQuery, setGitRepoSearchQuery] = useState<string>('');
    const gitRepoDropdownRef = useRef<HTMLDivElement | null>(null);

    const isRemoveMode = gitActionType === 'remove';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (gitRepoDropdownRef.current && !gitRepoDropdownRef.current.contains(event.target as Node)) {
                setIsGitRepoDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredAvailableGitRepos = useMemo(() => {
        const q = gitRepoSearchQuery.trim().toLowerCase();
        if (!q) return allAvailableGitRepos;
        return allAvailableGitRepos.filter(
            (r) =>
                r.repo_name.toLowerCase().includes(q) ||
                r.repo_url.toLowerCase().includes(q) ||
                r.course_name.toLowerCase().includes(q) ||
                r.category.toLowerCase().includes(q)
        );
    }, [allAvailableGitRepos, gitRepoSearchQuery]);

    return (
        <div
            className={`space-y-5 rounded-[2rem] border transition-colors p-6 sm:p-7 shadow-xs ${isRemoveMode
                ? 'border-rose-200/80 dark:border-rose-900/60 bg-white dark:bg-slate-900'
                : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
        >
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <GitBranch
                        className={`h-4 w-4 ${isRemoveMode ? 'text-rose-600 dark:text-rose-400' : 'text-violet-600 dark:text-violet-400'
                            }`}
                    />
                    <span>Quản Trị Cộng Tác Viên Pythaverse Git (Fast Engine Hybrid V3.6):</span>
                </div>
                <div className="flex items-center gap-2">
                    {isRemoveMode ? (
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

            {/* 🎯 BẬT/TẮT CHUYỂN ĐỔI HÀNH ĐỘNG: THÊM vs GỠ BỎ */}
            {setGitActionType && (
                <div className="flex items-center justify-between p-1.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-750">
                    <button
                        type="button"
                        onClick={() => setGitActionType('add')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${!isRemoveMode
                            ? 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                    >
                        <UserPlus className="w-3.5 h-3.5 text-violet-600" />
                        <span>Thêm / Cập Nhật Quyền (Add Collaborators)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setGitActionType('remove')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${isRemoveMode
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
                            }`}
                    >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>Gỡ Khỏi Repository (Remove Collaborators)</span>
                    </button>
                </div>
            )}

            <div className="space-y-4">
                {/* 1. KHU VỰC MULTI-SELECT REPOS */}
                <div className="space-y-2 relative" ref={gitRepoDropdownRef}>
                    <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <span>
                                Các Repository Mục Tiêu ({gitSelectedRepos.length} Repos đã chọn):{' '}
                                <span className="text-rose-500">*</span>
                            </span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setIsGitRepoDropdownOpen(!isGitRepoDropdownOpen)}
                            className={`text-xs font-bold hover:underline cursor-pointer flex items-center gap-1 ${isRemoveMode
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-violet-600 dark:text-violet-400'
                                }`}
                        >
                            <span>
                                {isGitRepoDropdownOpen
                                    ? 'Đóng danh sách ✕'
                                    : `+ Chọn thêm từ danh mục (${allAvailableGitRepos.length} repos) ▼`}
                            </span>
                        </button>
                    </div>

                    {/* Danh sách Tags Pill các Repos đã chọn */}
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
                                            onClick={() => setGitSelectedRepos(gitSelectedRepos.filter((_, i) => i !== rIdx))}
                                            className="hover:text-rose-500 transition cursor-pointer"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {/* Ô Nhập URL thủ công bổ sung */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={customRepoInput}
                            onChange={(e) => setCustomRepoInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && customRepoInput.trim()) {
                                    e.preventDefault();
                                    if (!gitSelectedRepos.includes(customRepoInput.trim())) {
                                        setGitSelectedRepos([...gitSelectedRepos, customRepoInput.trim()]);
                                    }
                                    setCustomRepoInput('');
                                }
                            }}
                            placeholder="Dán link repo khác và bấm Enter (VD: https://git.pythaverse.space/...)"
                            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2 font-mono text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:bg-white focus:outline-hidden"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                if (customRepoInput.trim() && !gitSelectedRepos.includes(customRepoInput.trim())) {
                                    setGitSelectedRepos([...gitSelectedRepos, customRepoInput.trim()]);
                                    setCustomRepoInput('');
                                }
                            }}
                            className={`px-3.5 py-2 rounded-xl text-white text-xs font-bold transition cursor-pointer ${isRemoveMode ? 'bg-rose-600 hover:bg-rose-700' : 'bg-violet-600 hover:bg-violet-700'
                                }`}
                        >
                            Thêm Repo
                        </button>
                    </div>

                    {/* Popover Danh Sách Repos Gợi Ý */}
                    {isGitRepoDropdownOpen && (
                        <div className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-80 overflow-hidden flex flex-col">
                            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                                    <input
                                        type="text"
                                        autoFocus
                                        value={gitRepoSearchQuery}
                                        onChange={(e) => setGitRepoSearchQuery(e.target.value)}
                                        placeholder="Gõ tên môn, category hoặc tên repo..."
                                        className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500"
                                    />
                                </div>
                            </div>

                            <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin max-h-60">
                                {filteredAvailableGitRepos.map((repo, idx) => {
                                    const isSelected = gitSelectedRepos.includes(repo.repo_url);
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
                                                    Môn: <strong>{repo.course_name}</strong>
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
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. KHU VỰC VAI TRÒ (ẨN KHI GỠ BỎ QUYỀN) */}
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

                {/* 3. DANH SÁCH USER */}
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
        </div>
    );
};