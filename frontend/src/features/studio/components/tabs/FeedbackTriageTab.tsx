// frontend/src/features/studio/components/tabs/FeedbackTriageTab.tsx
import React from 'react';
import { FileText, Sparkles } from 'lucide-react';

interface FeedbackTriageTabProps {
    docUrl: string;
    setDocUrl: (val: string) => void;
    assigneeEmail: string;
    setAssigneeEmail: (val: string) => void;
    feedbackCommentContent: string;
    setFeedbackCommentContent: (val: string) => void;
    isGeneratingDocComment: boolean;
    onAIGenerateDocComment: () => void;
}

export const FeedbackTriageTab: React.FC<FeedbackTriageTabProps> = ({
    docUrl,
    setDocUrl,
    assigneeEmail,
    setAssigneeEmail,
    feedbackCommentContent,
    setFeedbackCommentContent,
    isGeneratingDocComment,
    onAIGenerateDocComment,
}) => {
    return (
        <div className="space-y-5 rounded-[2rem] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <FileText className="h-4 w-4 text-emerald-500" />
                    <span>Đường Dẫn Google Doc Báo Cáo Sự Cố:</span>
                </div>

                <button
                    type="button"
                    onClick={onAIGenerateDocComment}
                    disabled={isGeneratingDocComment}
                    className="flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                    <Sparkles className={`h-3.5 w-3.5 text-indigo-600 ${isGeneratingDocComment ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingDocComment ? 'AI đang đọc tài liệu...' : 'AI Đọc Doc & Soạn Ghi Chú Tag'}</span>
                </button>
            </div>

            <div className="space-y-4">
                <div className="space-y-1.5">
                    <input
                        type="text"
                        value={docUrl}
                        onChange={(e) => setDocUrl(e.target.value)}
                        placeholder="https://docs.google.com/document/d/..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 font-mono text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:bg-white focus:outline-hidden"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Email Nhân Sự Cần Giao Việc (@dtt.vn):
                    </label>
                    <input
                        type="email"
                        value={assigneeEmail}
                        onChange={(e) => setAssigneeEmail(e.target.value)}
                        placeholder="hung.nguyenmanh@dtt.vn"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:bg-white focus:outline-hidden"
                    />
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">
                            Nội Dung Cần Gắn Bình Luận / Tag Vào Doc:
                        </label>
                        <span className="text-slate-400 text-[11px]">Tự động gắn vào trang đầu</span>
                    </div>
                    <textarea
                        rows={4}
                        value={feedbackCommentContent}
                        onChange={(e) => setFeedbackCommentContent(e.target.value)}
                        placeholder="Nhập nội dung comment..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden leading-relaxed"
                    />
                </div>
            </div>
        </div>
    );
};