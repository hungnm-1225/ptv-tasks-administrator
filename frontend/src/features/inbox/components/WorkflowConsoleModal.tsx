// frontend/src/features/inbox/components/WorkflowConsoleModal.tsx
import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
    Sparkles,
    ArrowRight,
    Loader2,
    FileText,
    X,
    Building2,
    BookOpen,
    Layers,
    Search,
    Check,
    Globe,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    HelpCircle,
    Edit3,
    Info,
    ListChecks,
    Quote,
    ShieldAlert,
    FileEdit,
    Zap,
    ChevronDown,
    Eye,
    XCircle
} from 'lucide-react';
import {
    InboxTicket,
    WorkflowDraft,
    WorkflowStep,
    CapabilityDefinition,
    WorkflowValidationResult
} from '../../../types';
import { HierarchySchoolItem, PreviewAttachmentFile } from '../types';
import { WorkflowBuilder } from './WorkflowBuilder';
import { WorkflowValidationPanel } from './WorkflowValidationPanel';
import { stripHtmlTags, formatDateTime } from './TicketCard';

const WorkflowDrawerSkeleton: React.FC = () => (
    <div className="space-y-6 animate-pulse pr-1 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                    <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-md" />
                </div>
                <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-16 w-full bg-slate-200/60 dark:bg-slate-700/60 rounded-xl" />
                <div className="space-y-2 pt-2">
                    <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-7 w-full bg-slate-200/50 dark:bg-slate-700/50 rounded-lg" />
                </div>
            </div>
            <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                    <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>
                <div className="space-y-2">
                    <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-12 w-full bg-slate-200/60 dark:bg-slate-700/60 rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="h-12 bg-slate-200/50 dark:bg-slate-700/50 rounded-xl" />
                    <div className="h-12 bg-slate-200/50 dark:bg-slate-700/50 rounded-xl" />
                </div>
            </div>
        </div>
        <div className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex justify-between items-center">
                <div className="h-4 w-44 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded-md" />
            </div>
            <div className="space-y-3 pt-2">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="flex items-center gap-4 p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60"
                    >
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                        <div className="space-y-1.5 flex-1">
                            <div className="h-3.5 w-1/3 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="h-3 w-1/2 bg-slate-200/60 dark:bg-slate-700/60 rounded" />
                        </div>
                        <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-md" />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

interface WorkflowConsoleModalProps {
    selectedTicket: InboxTicket | null;
    activeWorkflow: WorkflowDraft | null;
    workflowLoading: boolean;
    workflowError: string | null;
    workflowValidating: boolean;
    validationResult: WorkflowValidationResult | null;
    capabilities: CapabilityDefinition[];
    schoolsList: HierarchySchoolItem[];
    isConfirmingRun: boolean;
    onClose: () => void;
    onReSummarize: () => void;
    onReAssessIntent: () => void;
    onStepsChange: (steps: WorkflowStep[]) => void;
    onSelectSchool: (school: HierarchySchoolItem) => void;
    onConfirmAndRun: () => void;
    onRetryStep: (stepId: string) => void;
    onPreviewFile: (file: PreviewAttachmentFile) => void;
}

export const WorkflowConsoleModal: React.FC<WorkflowConsoleModalProps> = ({
    selectedTicket,
    activeWorkflow,
    workflowLoading,
    workflowError,
    workflowValidating,
    validationResult,
    capabilities,
    schoolsList,
    isConfirmingRun,
    onClose,
    onReSummarize,
    onReAssessIntent,
    onStepsChange,
    onSelectSchool,
    onConfirmAndRun,
    onRetryStep,
    onPreviewFile
}) => {
    const [vungAViewMode, setVungAViewMode] = useState<'summary' | 'raw'>('summary');
    const [isEditingWorkflow, setIsEditingWorkflow] = useState<boolean>(false);
    const [isSchoolPickerOpen, setIsSchoolPickerOpen] = useState<boolean>(false);
    const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
    const schoolPickerRef = useRef<HTMLDivElement | null>(null);

    const filteredSchools = useMemo(() => {
        const q = schoolSearchQuery.trim().toLowerCase();
        if (!q) return schoolsList.slice(0, 30);
        return schoolsList
            .filter(
                (s) =>
                    s.school_name.toLowerCase().includes(q) ||
                    (s.school_code && s.school_code.toLowerCase().includes(q)) ||
                    s.partner_name.toLowerCase().includes(q)
            )
            .slice(0, 30);
    }, [schoolsList, schoolSearchQuery]);

    const isWorkflowRunnable = useMemo(() => {
        if (!activeWorkflow) return false;
        const blockedStatuses = [
            'no_action',
            'needs_information',
            'invalid',
            'cancelled',
            'running',
            'waiting_poll',
            'success',
            'succeeded',
        ];
        if (blockedStatuses.includes(activeWorkflow.status)) {
            return false;
        }
        if (!activeWorkflow.steps || activeWorkflow.steps.length === 0) {
            return false;
        }
        if (validationResult && !validationResult.is_valid) {
            return false;
        }
        return true;
    }, [activeWorkflow, validationResult]);

    if (!selectedTicket || typeof document === 'undefined') return null;

    return createPortal(
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 15 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl w-full max-w-full sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl shadow-2xl overflow-hidden p-6 sm:p-8 max-h-[94vh] flex flex-col my-auto"
            >
                {/* Header Console */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl shadow-md shadow-indigo-500/20">
                            <Sparkles className="w-5 h-5 text-amber-300" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                                    AI Workflow Pre-processing & Execution Console
                                </h3>
                                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-extrabold uppercase">
                                    Proposal v{activeWorkflow?.version || 1}
                                </span>
                            </div>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Request #{selectedTicket.source_id || selectedTicket.id.slice(0, 8)} • Provenance Traced
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onReSummarize}
                            disabled={workflowLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                            title="Chỉ làm tươi lại bản tóm tắt Inbox"
                        >
                            <FileText className="w-3.5 h-3.5 text-slate-500" />
                            <span>Tóm tắt lại</span>
                        </button>

                        <button
                            type="button"
                            onClick={onReAssessIntent}
                            disabled={workflowLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                            title="Bắt Gemini AI bóc tách lại sự thật và sinh Proposal version mới"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                            <span>AI Đánh giá lại ý định</span>
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Thân cuộn Bento Console */}
                <div className="flex-1 overflow-y-auto space-y-6 pr-1 py-4">
                    {workflowLoading ? (
                        <WorkflowDrawerSkeleton />
                    ) : !activeWorkflow ? (
                        <div className="py-16 text-center text-slate-400 text-xs space-y-2">
                            <p>Không tìm thấy dữ liệu workflow cho yêu cầu này.</p>
                            {workflowError && <p className="text-rose-500 text-[11px] font-mono">{workflowError}</p>}
                            <button
                                type="button"
                                onClick={onReAssessIntent}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 transition mt-2 cursor-pointer"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Kích hoạt AI Phân tích ngay</span>
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* BENTO GRID: VÙNG A + VÙNG B */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                {/* VÙNG A: THÔNG TIN YÊU CẦU & ĐỐI CHIẾU */}
                                <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3.5 flex flex-col">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                                                VÙNG A • Thông Tin Yêu Cầu & Đối Chiếu
                                            </span>
                                        </div>

                                        <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                                            {selectedTicket.subject || 'Không có tiêu đề'}
                                        </h4>

                                        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                                            <p>
                                                <span className="text-slate-400 font-medium">Người gửi:</span>{' '}
                                                <b>{selectedTicket.sender_email}</b>
                                            </p>
                                            {selectedTicket.submitter_name && (
                                                <p>
                                                    <span className="text-slate-400 font-medium">Tên:</span> {selectedTicket.submitter_name}
                                                </p>
                                            )}
                                            <p>
                                                <span className="text-slate-400 font-medium">Thời gian:</span>{' '}
                                                {formatDateTime(selectedTicket.created_at)}
                                            </p>
                                        </div>

                                        {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                                            <div className="pt-1">
                                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                                    Tài liệu đính kèm ({selectedTicket.attachments.length}):
                                                </span>
                                                <div className="space-y-1.5">
                                                    {selectedTicket.attachments.map((att: any, i: number) => (
                                                        <div
                                                            key={i}
                                                            className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs shadow-2xs"
                                                        >
                                                            <span className="truncate max-w-[190px] font-medium text-slate-700 dark:text-slate-300">
                                                                {att.filename}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => onPreviewFile(att)}
                                                                className="p-1 text-indigo-600 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                                                            >
                                                                <Eye className="w-3.5 h-3.5" />
                                                                <span>Xem</span>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* TABS ĐỐI CHIẾU VĂN BẢN */}
                                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-750 flex-1 flex flex-col min-h-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg text-[11px]">
                                                <button
                                                    type="button"
                                                    onClick={() => setVungAViewMode('summary')}
                                                    className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${vungAViewMode === 'summary'
                                                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                                        }`}
                                                >
                                                    Tóm Tắt AI
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setVungAViewMode('raw')}
                                                    className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${vungAViewMode === 'raw'
                                                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                                        }`}
                                                >
                                                    Văn Bản Gốc
                                                </button>
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-400">
                                                {vungAViewMode === 'summary' ? 'Bản mềm Inbox' : 'Thân email nguyên thủy'}
                                            </span>
                                        </div>

                                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs overflow-y-auto max-h-48 flex-1 leading-relaxed shadow-inner">
                                            {vungAViewMode === 'summary' ? (
                                                <p className="whitespace-pre-line text-slate-800 dark:text-slate-200 font-medium">
                                                    {selectedTicket.ai_summary ||
                                                        'Chưa có bản tóm tắt. Bạn có thể nhấn nút "Tóm tắt lại" ở trên góc phải để AI sinh tóm tắt.'}
                                                </p>
                                            ) : (
                                                <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                                    {stripHtmlTags(selectedTicket.raw_content) || '(Không có nội dung văn bản gốc)'}
                                                </pre>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* VÙNG B: AI UNDERSTANDING & EVIDENCE PROVENANCE */}
                                <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 space-y-3.5">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                            <span>VÙNG B • AI Understanding & Evidence Provenance</span>
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {activeWorkflow.ai_analysis?.model_used && (
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                                                    {activeWorkflow.ai_analysis.model_used}
                                                </span>
                                            )}

                                            {activeWorkflow.status === 'needs_information' ? (
                                                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300">
                                                    ⚠️ Chưa Đủ Bằng Chứng
                                                </span>
                                            ) : (
                                                <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-indigo-600 border border-indigo-200 dark:border-indigo-800">
                                                    Độ tin cậy:{' '}
                                                    {activeWorkflow.ai_analysis?.overall_confidence !== undefined
                                                        ? `${Math.round(activeWorkflow.ai_analysis.overall_confidence * 100)}%`
                                                        : 'N/A'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Mục tiêu */}
                                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 text-xs">
                                        <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">
                                            Mục Tiêu Nhận Diện (Goal):
                                        </span>
                                        <p className="font-bold text-slate-800 dark:text-slate-200">{activeWorkflow.title}</p>
                                    </div>

                                    {/* Ý định vận hành */}
                                    {activeWorkflow.ai_analysis?.requested_operations &&
                                        activeWorkflow.ai_analysis.requested_operations.length > 0 && (
                                            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 space-y-1.5">
                                                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                                                    Ý Định Vận Hành Được Phê Duyệt:
                                                </span>
                                                <div className="flex flex-wrap gap-2">
                                                    {activeWorkflow.ai_analysis.requested_operations.map((op: any, i: number) => {
                                                        const intentName = typeof op === 'string' ? op : op.intent;
                                                        const isHighRisk = intentName === 'create_accounts' || intentName === 'reset_password';
                                                        return (
                                                            <span
                                                                key={i}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${isHighRisk
                                                                    ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                                                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                                                                    }`}
                                                            >
                                                                <span>{intentName}</span>
                                                                <span className="text-[9px] px-1 py-0.2 rounded bg-black/10 font-mono">
                                                                    {isHighRisk ? 'High Mutation' : 'Medium'}
                                                                </span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                    {/* Bằng chứng trích dẫn */}
                                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/40 space-y-2">
                                        <span className="text-[10px] font-extrabold uppercase text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                                            <Quote className="w-3.5 h-3.5 text-indigo-600" />
                                            <span>Căn Cứ Trích Dẫn Từ Yêu Cầu (Verified Evidence Grounding):</span>
                                        </span>

                                        {activeWorkflow.ai_analysis?.evidence_quotes &&
                                            activeWorkflow.ai_analysis.evidence_quotes.length > 0 ? (
                                            <div className="space-y-1.5">
                                                {activeWorkflow.ai_analysis.evidence_quotes.map((q, q_idx) => (
                                                    <div
                                                        key={q_idx}
                                                        className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border-l-2 border-indigo-600 text-xs font-mono text-slate-800 dark:text-slate-200 italic"
                                                    >
                                                        ❝ {q} ❞
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-slate-400 italic">
                                                Chưa phát hiện trích dẫn trực tiếp từ văn bản gốc.
                                            </p>
                                        )}
                                    </div>

                                    {/* Autocomplete Trường Học */}
                                    {activeWorkflow.ai_analysis?.school_required === false ? (
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                                <div className="space-y-0.5">
                                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                                        Phạm Vi Vận Hành:
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                        Toàn Cục / Nền Tảng Độc Lập (Git, Keycloak, Đối tác ngoài)
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                                                Không cần School
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                                                    <Building2 className="w-3 h-3 text-indigo-500" />
                                                    <span>Trường Học Mục Tiêu (Detected School):</span>
                                                </span>

                                                {activeWorkflow.ai_analysis?.detected_school && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                        ✓ Khớp{' '}
                                                        {activeWorkflow.ai_analysis.detected_school.confidence
                                                            ? `${Math.round(activeWorkflow.ai_analysis.detected_school.confidence * 100)}%`
                                                            : 'Đã xác nhận'}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="relative" ref={schoolPickerRef}>
                                                <div
                                                    onClick={() => setIsSchoolPickerOpen(!isSchoolPickerOpen)}
                                                    className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer shadow-xs ${activeWorkflow.ai_analysis?.detected_school?.name
                                                        ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/60'
                                                        : 'border-amber-400 dark:border-amber-700 bg-amber-100/80 dark:bg-amber-950/40 hover:bg-amber-100'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Building2
                                                            className={`w-4 h-4 shrink-0 ${activeWorkflow.ai_analysis?.detected_school?.name
                                                                ? 'text-emerald-600'
                                                                : 'text-amber-700 dark:text-amber-400'
                                                                }`}
                                                        />
                                                        <span
                                                            className={`text-xs font-black truncate ${activeWorkflow.ai_analysis?.detected_school?.name
                                                                ? 'text-slate-900 dark:text-white'
                                                                : 'text-amber-950 dark:text-amber-200'
                                                                }`}
                                                        >
                                                            {activeWorkflow.ai_analysis?.detected_school?.name ||
                                                                '⚠️ Chưa xác định chắc chắn trường học (Nhấp để chọn)'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 shrink-0 text-indigo-700 dark:text-indigo-400 font-bold">
                                                        <span className="text-xs underline">Thay đổi</span>
                                                        <ChevronDown className="w-4 h-4" />
                                                    </div>
                                                </div>

                                                {isSchoolPickerOpen && (
                                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 p-2 z-50 max-h-60 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-100">
                                                        <div className="relative w-full">
                                                            <input
                                                                type="text"
                                                                value={schoolSearchQuery}
                                                                onChange={(e) => setSchoolSearchQuery(e.target.value)}
                                                                placeholder="Nhập tên trường hoặc mã trường..."
                                                                className="w-full h-10 pl-9 pr-3 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-600 rounded-xl shadow-xs outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-slate-400"
                                                            />
                                                            <Search className="w-4 h-4 text-amber-600 dark:text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                                        </div>

                                                        {filteredSchools.length === 0 ? (
                                                            <div className="p-3 text-center text-xs text-slate-400">Không tìm thấy trường nào.</div>
                                                        ) : (
                                                            filteredSchools.map((s) => (
                                                                <button
                                                                    key={s.school_id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setIsSchoolPickerOpen(false);
                                                                        onSelectSchool(s);
                                                                    }}
                                                                    className="w-full text-left p-2 rounded-lg text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                                                                >
                                                                    <div className="truncate pr-2">
                                                                        <div className="font-bold text-slate-800 dark:text-slate-200">{s.school_name}</div>
                                                                        <div className="text-[10px] text-slate-400 font-mono">
                                                                            Mã: {s.school_code} | Đối tác: {s.partner_name}
                                                                        </div>
                                                                    </div>
                                                                    <Check className="w-3.5 h-3.5 text-indigo-600 opacity-0 group-hover:opacity-100" />
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Khóa học & Git Role */}
                                    <div className="flex items-center gap-2 flex-wrap text-xs">
                                        {activeWorkflow.ai_analysis?.detected_courses &&
                                            activeWorkflow.ai_analysis.detected_courses.length > 0 && (
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[10px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                                                        <BookOpen className="w-3 h-3 text-indigo-500" /> Khóa học:
                                                    </span>
                                                    {activeWorkflow.ai_analysis.detected_courses.map((c, i) => (
                                                        <span
                                                            key={i}
                                                            className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                                                        >
                                                            {typeof c === 'string' ? c : (c as any).course_name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                        {activeWorkflow.ai_analysis?.entities?.git_role && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-extrabold uppercase text-slate-400">Git Role:</span>
                                                <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-mono text-xs font-extrabold">
                                                    {activeWorkflow.ai_analysis.entities.git_role}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Lý do lựa chọn luồng */}
                                    {activeWorkflow.ai_analysis?.reason_summary_vi && (
                                        <div className="p-3.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/70 text-xs text-amber-950 dark:text-amber-100 font-medium leading-relaxed shadow-xs">
                                            <div className="font-extrabold mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-900 dark:text-amber-300">
                                                <HelpCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                                                <span>Lý do lựa chọn luồng (Policy Decision):</span>
                                            </div>
                                            <p>{activeWorkflow.ai_analysis.reason_summary_vi}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* VÙNG C: 4 TRẠNG THÁI HIỂN THỊ */}
                            {activeWorkflow.status === 'invalid' ? (
                                <div className="p-6 rounded-3xl bg-rose-500/10 border-2 border-rose-500/40 space-y-4 shadow-sm">
                                    <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400">
                                        <div className="p-2 rounded-xl bg-rose-600 text-white shadow-sm">
                                            <ShieldAlert className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black uppercase tracking-wider">
                                                Cấu Trúc Workflow Không Hợp Lệ (Invalid Policy/DAG Violation)
                                            </h4>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                                                Phát hiện lỗi chu trình phụ thuộc hoặc capability không được hỗ trợ. Khóa hoàn toàn chốt phê duyệt.
                                            </p>
                                        </div>
                                    </div>

                                    {validationResult && validationResult.errors.length > 0 && (
                                        <div className="space-y-1.5 pt-2">
                                            {validationResult.errors.map((err, err_idx) => (
                                                <div
                                                    key={err_idx}
                                                    className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900/60 text-xs font-mono text-rose-600 dark:text-rose-400 flex items-center gap-2"
                                                >
                                                    <XCircle className="w-4 h-4 shrink-0" />
                                                    <span>{err}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : activeWorkflow.status === 'needs_information' ? (
                                <div className="space-y-4">
                                    <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 space-y-3 shadow-xs">
                                        <div className="flex items-center gap-3 text-amber-800 dark:text-amber-300">
                                            <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                                                <ListChecks className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black uppercase tracking-wider">
                                                    Yêu Cầu Cần Bổ Sung Thông Tin Trước Khi Khởi Chạy
                                                </h4>
                                                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                                                    Hệ thống đã tự động dựng sẵn các bước dự thảo bên dưới. Quản trị viên vui lòng hoàn thiện các trường
                                                    màu vàng hoặc bấm "Chỉnh sửa luồng".
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-2 pt-1">
                                            {activeWorkflow.ai_analysis?.missing_requirements?.map((item: any, idx: number) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-start gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-900/60 text-xs shadow-2xs"
                                                >
                                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                                    <div className="space-y-0.5">
                                                        <span className="font-bold text-slate-900 dark:text-white font-mono mr-1">
                                                            [{item.field || 'Thiếu thông tin'}]:
                                                        </span>
                                                        <span className="text-slate-700 dark:text-slate-300">
                                                            {item.message || JSON.stringify(item)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap gap-2">
                                            <div className="flex items-center gap-2">
                                                <Layers className="w-4 h-4 text-indigo-600" />
                                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                                    Đồ Thị Các Bước Dự Thảo ({activeWorkflow.steps?.length || 0} bước)
                                                </h4>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setIsEditingWorkflow(!isEditingWorkflow)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                                <span>{isEditingWorkflow ? 'Đóng Chỉnh Sửa' : 'Chỉnh Sửa Luồng Này'}</span>
                                            </button>
                                        </div>

                                        <WorkflowBuilder
                                            steps={activeWorkflow.steps || []}
                                            capabilities={capabilities}
                                            isEditable={isEditingWorkflow}
                                            onStepsChange={onStepsChange}
                                            onRetryStep={onRetryStep}
                                        />
                                    </div>
                                </div>
                            ) : activeWorkflow.status === 'no_action' ? (
                                <div className="p-8 text-center rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                                    <Info className="w-10 h-10 text-slate-400 mx-auto" />
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                        Không Có Hành Động Tự Động Hóa Nào Được Kích Hoạt
                                    </h4>
                                    <p className="text-xs text-slate-500 mx-auto">
                                        Email này được phân loại là bản tin, thông báo tự động hoặc không chứa yêu cầu can thiệp hệ sinh thái.
                                    </p>
                                </div>
                            ) : (
                                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
                                                <Layers className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                                    VÙNG C • Prepared Workflow & Execution Console
                                                </h4>
                                                <p className="text-[11px] text-slate-500">
                                                    {isEditingWorkflow
                                                        ? 'Chế độ chỉnh sửa: Bắt buộc nhập lý do can thiệp thủ công bên dưới.'
                                                        : 'Kiểm tra thứ tự và các liên kết phụ thuộc trước khi khởi chạy.'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingWorkflow(!isEditingWorkflow)}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${isEditingWorkflow
                                                    ? 'bg-indigo-600 text-white shadow-sm'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                                                    }`}
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                                <span>{isEditingWorkflow ? 'Đóng Chỉnh Sửa' : 'Chỉnh Sửa Luồng'}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {isEditingWorkflow && (
                                        <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2 animate-in fade-in duration-150">
                                            <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-900 dark:text-indigo-200">
                                                <FileEdit className="w-4 h-4 text-indigo-600" />
                                                <span>Lý Do Can Thiệp Thủ Công (Bắt buộc lưu Audit Log):</span>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Ví dụ: Bổ sung quyền Git theo trao đổi trực tiếp, đổi thứ tự bước..."
                                                className="w-full px-3.5 py-2 text-xs font-bold text-slate-950 dark:text-white bg-white dark:bg-slate-900 border-2 border-indigo-400 dark:border-indigo-600 rounded-xl outline-none shadow-xs focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400"
                                            />
                                        </div>
                                    )}

                                    <WorkflowBuilder
                                        steps={activeWorkflow.steps || []}
                                        capabilities={capabilities}
                                        isEditable={isEditingWorkflow}
                                        onStepsChange={onStepsChange}
                                        onRetryStep={onRetryStep}
                                    />

                                    <WorkflowValidationPanel
                                        validation={validationResult}
                                        isValidating={workflowValidating}
                                        isSchoolResolved={!!activeWorkflow.ai_analysis?.detected_school}
                                        totalSteps={(activeWorkflow.steps || []).length}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Console Bar */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 shrink-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>Single Playwright Semaphore: 1 Slot • Render 512MB RAM Shield</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                            Đóng
                        </button>

                        {activeWorkflow?.status === 'running' || activeWorkflow?.status === 'waiting_poll' ? (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-xs font-extrabold border border-sky-300 animate-pulse">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>
                                    {activeWorkflow.status === 'waiting_poll'
                                        ? 'Đang đợi kiểm tra Polling Batch...'
                                        : 'Workflow đang thực thi ngầm...'}
                                </span>
                            </div>
                        ) : activeWorkflow?.status === 'success' || activeWorkflow?.status === 'succeeded' ? (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-extrabold border border-emerald-300">
                                <CheckCircle className="w-4 h-4 text-emerald-600" />
                                <span>Đã Hoàn Thành Toàn Bộ Luồng!</span>
                            </div>
                        ) : activeWorkflow?.status === 'no_action' ? (
                            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700">
                                <Info className="w-4 h-4 text-slate-400" />
                                <span>Không yêu cầu thao tác tự động</span>
                            </div>
                        ) : activeWorkflow?.status === 'needs_information' ? (
                            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold border border-amber-300 dark:border-amber-800">
                                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                <span>Thiếu thông tin đầu vào (Đã khóa van an toàn)</span>
                            </div>
                        ) : activeWorkflow?.status === 'invalid' ? (
                            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 text-xs font-bold border border-rose-300 dark:border-rose-800">
                                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                <span>Cấu trúc không hợp lệ (Đã khóa chạy)</span>
                            </div>
                        ) : (
                            <button
                                type="button"
                                disabled={isConfirmingRun || !isWorkflowRunnable}
                                onClick={onConfirmAndRun}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-indigo-500/25 cursor-pointer"
                            >
                                {isConfirmingRun ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Đang Khởi Chạy...</span>
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4 text-amber-300" />
                                        <span>Xác Nhận & Khởi Chạy (Confirm & Run)</span>
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};