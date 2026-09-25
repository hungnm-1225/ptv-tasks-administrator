// frontend/src/features/inbox/components/TicketCard.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Mail,
    FileText,
    Ticket,
    ExternalLink,
    Paperclip,
    XCircle,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    FileCode,
    Tag,
    Calendar,
    Image as ImageIcon,
    CheckCircle2,
    Building2,
    Check,
    Sparkles,
    ArrowRight,
    Loader2,
    Clock,
    CheckCheck,
    Eye,
    RefreshCw,
    GitPullRequest,
    History
} from 'lucide-react';
import { InboxTicket } from '../../../types';
import { PreviewAttachmentFile } from '../types';
import { FileSpreadsheetIcon } from './AttachmentPreviewModal';

export const stripHtmlTags = (htmlString: string | null | undefined): string => {
    if (!htmlString) return '';
    return htmlString
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
};

export const formatDateTime = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const hours = d.getHours().toString().padStart(2, '0');
        const mins = d.getMinutes().toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${hours}:${mins} - ${day}/${month}/${year}`;
    } catch {
        return dateStr;
    }
};

interface TicketCardProps {
    ticket: InboxTicket;
    onPreviewFile: (file: PreviewAttachmentFile) => void;
    onOpenWorkflowConsole: (ticket: InboxTicket) => void;
    onSummarizeSingleTicket: (ticketId: string, e: React.MouseEvent) => void;
    onDismissTask: (ticketId: string) => void;
    onRestoreTask: (ticketId: string) => void;
    onCompleteTask: (ticketId: string) => void;
    onCategoryChange: (ticketId: string, newCategory: string) => void;
    actionLoading: string | null;
    summarizingTicketId: string | null;
    activeCategoryDropdown: string | null;
    setActiveCategoryDropdown: (ticketId: string | null) => void;
    spreadsheetId: string;
}

export const TicketCard: React.FC<TicketCardProps> = ({
    ticket,
    onPreviewFile,
    onOpenWorkflowConsole,
    onSummarizeSingleTicket,
    onDismissTask,
    onRestoreTask,
    onCompleteTask,
    onCategoryChange,
    actionLoading,
    summarizingTicketId,
    activeCategoryDropdown,
    setActiveCategoryDropdown,
    spreadsheetId
}) => {
    const navigate = useNavigate();
    const [isExpanded, setIsExpanded] = useState<boolean>(false);

    const isCompleted = ticket.status === 'completed';
    const isDismissed = ticket.status === 'dismissed';
    const attachments = ticket.attachments || [];
    const cleanRawContent = stripHtmlTags(ticket.raw_content);
    const excelMeta = ticket.metadata?.excel_summary;

    // 🌟 NHẬN DIỆN THỜI ĐIỂM HOẠT ĐỘNG GẦN NHẤT ĐỂ HIỂN THỊ CHUẨN XÁC
    const latestActivityDate = (ticket as any).source_updated_at || ticket.updated_at || ticket.created_at;
    const hasBeenUpdated = Boolean(
        ((ticket as any).source_updated_at && (ticket as any).source_updated_at !== ticket.created_at) ||
        (ticket.updated_at && ticket.updated_at !== ticket.created_at)
    );

    const getDirectSourceUrl = (t: InboxTicket) => {
        if (t.source === 'gmail') {
            return `https://mail.google.com/mail/u/0/#search/id%3A${t.source_id}`;
        } else if (t.source === 'google_form') {
            if (t.doc_url) return t.doc_url;
            const rowIdx = t.metadata?.row_index || 2;
            return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0&range=A${rowIdx}:P${rowIdx}`;
        } else if (t.source === 'osticket') {
            if (t.doc_url) return t.doc_url;
            const internalId = t.metadata?.internal_id || t.source_id;
            return `https://support.pythaverse.space/scp/tickets.php?id=${internalId}`;
        }
        return '#';
    };

    const renderSourceBadge = (source: string) => {
        switch (source) {
            case 'gmail':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-2xs">
                        <Mail className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> GMAIL
                    </span>
                );
            case 'google_form':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs">
                        <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> FORM
                    </span>
                );
            case 'osticket':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
                        <Ticket className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> OS TICKET
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                        {source.toUpperCase()}
                    </span>
                );
        }
    };

    const renderStatusPill = (status: string) => {
        switch (status) {
            case 'completed':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> ĐÃ XỬ LÝ
                    </span>
                );
            case 'processing':
            case 'waiting_poll':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs">
                        <RefreshCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 animate-spin" /> ĐANG XỬ LÝ
                    </span>
                );
            case 'dismissed':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <XCircle className="w-3.5 h-3.5 text-slate-500" /> ĐÃ BỎ QUA
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> CHỜ XỬ LÝ
                    </span>
                );
        }
    };

    const getCategoryBadge = (category: string, ticketId: string) => {
        const isDropdownOpen = activeCategoryDropdown === ticketId;
        const catLabel =
            category === 'bug'
                ? 'System Bugs'
                : category === 'account_keycloak'
                    ? 'Keycloak/Account'
                    : category === 'lms_enroll'
                        ? 'LMS Enroll'
                        : category === 'license'
                            ? 'License'
                            : 'Khác';

        return (
            <div className="relative inline-block" data-category-dropdown="true">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setActiveCategoryDropdown(isDropdownOpen ? null : ticketId);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors shadow-2xs cursor-pointer"
                >
                    <Tag className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span>{catLabel.toUpperCase()}</span>
                    <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
                </button>

                {isDropdownOpen && (
                    <div
                        data-category-dropdown="true"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                    >
                        <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400">Đổi Phân Loại</div>
                        {[
                            { id: 'bug', label: '🐛 System Bugs' },
                            { id: 'account_keycloak', label: '🔑 Keycloak/Account' },
                            { id: 'lms_enroll', label: '🎓 LMS Enroll' },
                            { id: 'license', label: '📜 License' },
                            { id: 'other', label: '📌 Khác' },
                        ].map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCategoryChange(ticketId, opt.id);
                                    setActiveCategoryDropdown(null);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${category === opt.id
                                    ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                                    : 'text-slate-700 dark:text-slate-300'
                                    }`}
                            >
                                <span>{opt.label}</span>
                                {category === opt.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-200 dark:hover:border-indigo-900/60 transition space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                    {renderSourceBadge(ticket.source)}
                    {renderStatusPill(ticket.status)}
                    {getCategoryBadge(ticket.category || 'other', ticket.id)}
                </div>

                {/* 🌟 HIỂN THỊ THỜI GIAN THÔNG MINH: ƯU TIÊN NGÀY CẬP NHẬT HOẠT ĐỘNG MỚI NHẤT */}
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <div
                        className="flex items-center gap-1.5"
                        title={`Thời điểm tạo gốc: ${formatDateTime(ticket.created_at)}`}
                    >
                        {hasBeenUpdated ? (
                            <>
                                <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md">
                                    Cập nhật: {formatDateTime(latestActivityDate)}
                                </span>
                            </>
                        ) : (
                            <>
                                <Calendar className="w-3.5 h-3.5" />
                                <span>{formatDateTime(ticket.created_at)}</span>
                            </>
                        )}
                    </div>

                    <a
                        href={getDirectSourceUrl(ticket)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Mở gốc</span>
                    </a>
                </div>
            </div>

            <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug">
                    {ticket.subject || 'Không có tiêu đề'}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span>
                        Người gửi: <b className="text-slate-800 dark:text-slate-200">{ticket.sender_email}</b>
                    </span>
                    {ticket.submitter_name && <span>({ticket.submitter_name})</span>}
                    {ticket.metadata?.school_name && (
                        <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                            <Building2 className="w-3.5 h-3.5" />
                            <span>{ticket.metadata.school_name}</span>
                        </span>
                    )}
                </div>
            </div>

            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                    {attachments.map((file: any, idx: number) => {
                        const isExcel = /\.xlsx?$/i.test(file.filename || '');
                        const isImage = /\.(png|jpe?g|webp|gif)$/i.test(file.filename || '');

                        return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => onPreviewFile(file)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 transition shadow-2xs group cursor-pointer"
                            >
                                {isImage ? (
                                    <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                                ) : isExcel ? (
                                    <FileSpreadsheetIcon className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                    <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
                                )}
                                <span className="truncate max-w-[200px]">{file.filename}</span>
                                <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 ml-0.5 transition" />
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Gemini AI Summary Banner */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-teal-50/40 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-teal-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
                            <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                            Phân tích & Tóm tắt từ Gemini AI
                        </span>
                    </div>

                    {excelMeta?.is_cof && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-mono font-bold">
                            COF: {excelMeta.courses?.length || 0} Môn | {excelMeta.students_to_create || 0} HS Mới
                        </span>
                    )}
                </div>

                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line font-medium">
                    {ticket.ai_summary || 'Hệ thống đã nhận thông tin và đang chờ Gemini AI phân tích...'}
                </p>
            </div>

            {/* Collapsible raw content */}
            <div>
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{isExpanded ? 'Thu gọn nội dung email gốc' : 'Xem nội dung email gốc'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {isExpanded && (
                    <div className="mt-2.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner max-h-72 overflow-y-auto">
                        {cleanRawContent || '(Không có nội dung văn bản gốc)'}
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="text-[11px] font-mono text-slate-400 font-bold">
                    Mã tham chiếu: #{ticket.source_id || ticket.id.slice(0, 8)}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {isDismissed ? (
                        <button
                            onClick={() => onRestoreTask(ticket.id)}
                            disabled={actionLoading === ticket.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Khôi phục</span>
                        </button>
                    ) : isCompleted ? (
                        <button
                            onClick={() => onRestoreTask(ticket.id)}
                            disabled={actionLoading === ticket.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Mở lại Ticket</span>
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={(e) => onSummarizeSingleTicket(ticket.id, e)}
                                disabled={summarizingTicketId === ticket.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60 transition shadow-2xs cursor-pointer disabled:opacity-60"
                                title={ticket.ai_summary ? 'Chạy lại AI tóm tắt cho vé này' : 'Tạo tóm tắt AI cho vé này'}
                            >
                                {summarizingTicketId === ticket.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                                ) : (
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                )}
                                <span>{ticket.ai_summary ? 'Tóm tắt lại' : 'Tóm tắt'}</span>
                            </button>

                            <button
                                onClick={() => onDismissTask(ticket.id)}
                                disabled={actionLoading === ticket.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                            >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Bỏ qua</span>
                            </button>

                            <button
                                onClick={() => onCompleteTask(ticket.id)}
                                disabled={actionLoading === ticket.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                            >
                                <CheckCheck className="w-3.5 h-3.5" />
                                <span>Hoàn thành</span>
                            </button>

                            <button
                                onClick={() => navigate('/github', { state: { ticket } })}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
                            >
                                <GitPullRequest className="w-3.5 h-3.5" />
                                <span>GitHub Issue</span>
                            </button>

                            <button
                                onClick={() => onOpenWorkflowConsole(ticket)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white hover:brightness-110 transition shadow-md shadow-indigo-500/20 cursor-pointer"
                            >
                                <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                                <span>Xem & Duyệt AI Workflow</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};