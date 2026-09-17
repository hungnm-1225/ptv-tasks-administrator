// frontend/src/features/studio/components/modals/TaskConfirmationModal.tsx
import React from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X, Code2, Loader2, Send } from 'lucide-react';
import { PreparedPayload } from '../../types';

interface TaskConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    submitting: boolean;
    preparedPayload: PreparedPayload | null;
}

export const TaskConfirmationModal: React.FC<TaskConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    submitting,
    preparedPayload,
}) => {
    if (!isOpen || !preparedPayload || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-full sm:max-w-2xl lg:max-w-3xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-5 my-auto"
            >
                <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                                Xác Nhận Kích Hoạt Worker Tự Động
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Vui lòng kiểm tra lại thông số nghiệp vụ trước khi Worker can thiệp hệ thống.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                            {preparedPayload.summary.engineName}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
                            {preparedPayload.bot_type}
                        </span>
                    </div>

                    <div>
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                            {preparedPayload.summary.actionTitle}
                        </div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-bold font-mono mt-0.5">
                            👉 {preparedPayload.summary.targetEntity}
                        </div>
                    </div>

                    {preparedPayload.summary.detailsList.length > 0 && (
                        <div className="pt-2 border-t border-indigo-100/60 dark:border-indigo-900/40 space-y-1">
                            {preparedPayload.summary.detailsList.map((dt, idx) => (
                                <div key={idx} className="text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                    <span>{dt}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1">
                            <Code2 className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Tham Số Thực Thi (Payload JSON):</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Tự động đồng bộ</span>
                    </div>
                    <pre className="p-3.5 bg-slate-950 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto max-h-36 border border-slate-800 scrollbar-thin">
                        {JSON.stringify(preparedPayload.payload_data, null, 2)}
                    </pre>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                        Hủy Bỏ
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={submitting}
                        className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Đang Khởi Chạy...</span>
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                <span>Xác Nhận & Chạy Ngay</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};