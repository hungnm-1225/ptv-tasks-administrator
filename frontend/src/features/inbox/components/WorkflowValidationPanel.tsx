// frontend/src/features/inbox/components/WorkflowValidationPanel.tsx
import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Info
} from 'lucide-react';
import { WorkflowValidationResult } from '../../../types';

interface WorkflowValidationPanelProps {
  validation: WorkflowValidationResult | null;
  isValidating?: boolean;
  isSchoolResolved?: boolean;
  totalSteps?: number;
}

export const WorkflowValidationPanel: React.FC<WorkflowValidationPanelProps> = ({
  validation,
  isValidating = false,
  isSchoolResolved = true,
  totalSteps = 0,
}) => {
  if (!validation) return null;

  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;

  return (
    <div className="rounded-2xl border p-4 transition-all duration-200 bg-slate-50/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      {/* Tiêu đề & Trạng thái Validation */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          {hasErrors ? (
            <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              <XCircle className="w-4 h-4" />
            </div>
          ) : hasWarnings ? (
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4" />
            </div>
          ) : (
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck className="w-4 h-4" />
            </div>
          )}

          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Safety Gate & Dependency Validation
            </h4>
            <p className="text-[11px] text-slate-500">
              {hasErrors
                ? 'Phát hiện vấn đề ngăn cản thực thi luồng.'
                : hasWarnings
                ? 'Luồng hợp lệ kèm cảnh báo an toàn cần lưu ý.'
                : 'Đồ thị luồng và toàn bộ tham số hoàn toàn hợp lệ.'}
            </p>
          </div>
        </div>

        {/* Trạng thái tổng quát */}
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-extrabold uppercase ${
            hasErrors
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              : hasWarnings
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
          }`}
        >
          {hasErrors ? 'Chưa thể chạy' : hasWarnings ? 'Cần xem xét' : 'Sẵn sàng khởi chạy'}
        </span>
      </div>

      {/* Danh sách tiêu chí kiểm tra nhanh (Checklist) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="font-semibold truncate">{totalSteps} Bước quy trình</span>
        </div>

        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
          {hasErrors ? (
            <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
          <span className="font-semibold truncate">
            {hasErrors ? 'Lỗi phụ thuộc' : 'DAG hợp lệ'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
          {isSchoolResolved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          <span className="font-semibold truncate">
            {isSchoolResolved ? 'Trường đã chọn' : 'Chưa chọn trường'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="font-semibold truncate">Không chu trình kín</span>
        </div>
      </div>

      {/* Lỗi nghiêm trọng (Errors) */}
      {hasErrors && (
        <div className="space-y-1.5 mb-2">
          {validation.errors.map((err, i) => (
            <div
              key={i}
              className="p-2.5 rounded-xl bg-rose-100/70 dark:bg-rose-950/40 border border-rose-300 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2"
            >
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cảnh báo an toàn (Warnings) */}
      {hasWarnings && (
        <div className="space-y-1.5">
          {validation.warnings.map((warn, i) => (
            <div
              key={i}
              className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
