// frontend/src/features/inbox/components/WorkflowValidationPanel.tsx
import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  FileSearch,
  Scale,
  Cpu
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
  const isNeedsInfo = validation.status === 'needs_information';

  return (
    <div className="rounded-2xl border p-4 transition-all duration-200 bg-slate-50/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 space-y-3">
      {/* Tiêu đề & Trạng thái Validation */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {hasErrors ? (
            <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              <XCircle className="w-4 h-4" />
            </div>
          ) : isNeedsInfo ? (
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4" />
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
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Safety Gate & Policy Invariant Validation</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              {hasErrors
                ? 'Phát hiện vi phạm chính sách hoặc capability chưa hỗ trợ bot handler.'
                : isNeedsInfo
                  ? 'Thiếu thông tin đầu vào cốt tử để hoàn thành hợp đồng dữ liệu.'
                  : hasWarnings
                    ? 'Luồng hợp lệ kèm cảnh báo an toàn cần quản trị viên xem xét.'
                    : 'Đồ thị DAG và chính sách nghiệp vụ hoàn toàn hợp lệ (100% Khớp).'}
            </p>
          </div>
        </div>

        {/* Trạng thái tổng quát */}
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-extrabold uppercase ${hasErrors
            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
            : isNeedsInfo
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              : hasWarnings
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            }`}
        >
          {hasErrors ? 'Chặn khởi chạy' : isNeedsInfo ? 'Thiếu thông tin' : hasWarnings ? 'Cần xem xét' : 'Sẵn sàng khởi chạy'}
        </span>
      </div>

      {/* Checklist 4 Tiêu Chí Kiểm Tra Nhanh */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {/* Tiêu chí 1: Số bước quy trình */}
        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 shadow-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{totalSteps} Bước quy trình</span>
        </div>

        {/* Tiêu chí 2: Đồ thị DAG / Chu trình */}
        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 shadow-xs">
          {hasErrors ? (
            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          )}
          <span className={`font-bold truncate ${hasErrors ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {hasErrors ? 'Lỗi phụ thuộc' : 'DAG Tô-pô hợp lệ'}
          </span>
        </div>

        {/* Tiêu chí 3: Phân giải trường học */}
        <div className={`flex items-center gap-1.5 p-2 rounded-xl border shadow-xs transition-colors ${isSchoolResolved
          ? 'bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700'
          : 'bg-amber-100/90 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700'
          }`}>
          {isSchoolResolved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
          )}
          <span className={`font-black truncate ${isSchoolResolved
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-amber-950 dark:text-amber-200'
            }`}>
            {isSchoolResolved ? 'Trường đã chọn' : 'Chưa chọn trường'}
          </span>
        </div>

        {/* Tiêu chí 4: Hỗ trợ Bot Handler */}
        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 shadow-xs">
          <Cpu className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">100% Handler Hỗ Trợ</span>
        </div>
      </div>

      {/* Lỗi nghiêm trọng (Errors) */}
      {hasErrors && (
        <div className="space-y-1.5">
          {validation.errors.map((err, i) => (
            <div
              key={i}
              className="p-2.5 rounded-xl bg-rose-100/80 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100 text-xs flex items-start gap-2 font-medium"
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
              className="p-2.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/70 text-amber-950 dark:text-amber-100 text-xs flex items-start gap-2 font-medium"
            >
              <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};