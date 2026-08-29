// frontend/src/components/common/ConfirmDialog.tsx
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, HelpCircle, X, Check } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const iconBg = {
    danger: 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/60',
    warning: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60',
    primary: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60',
  }[variant];

  const confirmBtnBg = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20',
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20',
  }[variant];

  return createPortal(
    <AnimatePresence>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoading) onCancel();
        }}
        className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,460px)] shadow-2xl p-6 relative my-auto space-y-4"
        >
          <button
            disabled={isLoading}
            onClick={onCancel}
            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-3.5">
            <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${iconBg}`}>
              {variant === 'danger' ? (
                <Trash2 className="w-5 h-5" />
              ) : variant === 'warning' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <HelpCircle className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-pre-line">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={isLoading}
              onClick={onCancel}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer border border-slate-200 dark:border-slate-700 disabled:opacity-50"
            >
              {cancelText}
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={onConfirm}
              className={`inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50 ${confirmBtnBg}`}
            >
              <Check className="w-4 h-4" />
              <span>{confirmText}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
