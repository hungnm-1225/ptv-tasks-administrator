// frontend/src/features/inbox/components/WorkflowStepCard.tsx
import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  XCircle,
  Building2,
  GraduationCap,
  KeyRound,
  GitBranch,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit3,
  Check,
  Zap,
  ShieldAlert
} from 'lucide-react';
import { WorkflowStep, CapabilityDefinition } from '../../../types';

interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  totalSteps: number;
  capabilitiesMap: Record<string, CapabilityDefinition>;
  isEditable?: boolean;
  onUpdateStep?: (stepId: string, updated: Partial<WorkflowStep>) => void;
  onDeleteStep?: (stepId: string) => void;
  onMoveStep?: (stepId: string, direction: 'up' | 'down') => void;
  onRetryStep?: (stepId: string) => void;
}

export const WorkflowStepCard: React.FC<WorkflowStepCardProps> = ({
  step,
  index,
  totalSteps,
  capabilitiesMap,
  isEditable = false,
  onUpdateStep,
  onDeleteStep,
  onMoveStep,
  onRetryStep,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [editingInputKey, setEditingInputKey] = useState<string | null>(null);
  const [tempInputValue, setTempInputValue] = useState<string>('');

  const capDef = capabilitiesMap[step.capability_id];

  const getDomainIcon = (domain?: string) => {
    switch (domain) {
      case 'School Workspace':
        return <Building2 className="w-4 h-4 text-emerald-500" />;
      case 'Moodle PLearn LMS':
        return <GraduationCap className="w-4 h-4 text-sky-500" />;
      case 'Keycloak Auth IDP':
        return <KeyRound className="w-4 h-4 text-amber-500" />;
      case 'Pythaverse Git':
        return <GitBranch className="w-4 h-4 text-purple-500" />;
      case 'COF Processing':
        return <FileSpreadsheet className="w-4 h-4 text-teal-500" />;
      default:
        return <FileText className="w-4 h-4 text-indigo-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> THÀNH CÔNG
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300/40 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" /> ĐANG CHẠY
          </span>
        );
      case 'waiting_poll':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/40">
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" /> ĐỢI BATCH (POLLING)
          </span>
        );
      case 'waiting_dependency':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> CHỜ BƯỚC TRƯỚC
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300/40">
            <XCircle className="w-3.5 h-3.5 text-rose-600" /> LỖI BƯỚC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-300/40">
            <Zap className="w-3.5 h-3.5 text-teal-600" /> SẴN SÀNG
          </span>
        );
    }
  };

  const handleSaveInput = (key: string) => {
    if (onUpdateStep) {
      let finalVal: any = tempInputValue;
      try {
        if (tempInputValue.startsWith('{') || tempInputValue.startsWith('[')) {
          finalVal = JSON.parse(tempInputValue);
        }
      } catch {
        finalVal = tempInputValue;
      }
      onUpdateStep(step.step_id, {
        inputs: {
          ...step.inputs,
          [key]: finalVal,
        },
      });
    }
    setEditingInputKey(null);
  };

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-200 ${
        step.status === 'running'
          ? 'bg-sky-50/40 dark:bg-sky-950/20 border-sky-400 shadow-md ring-2 ring-sky-300/30'
          : step.status === 'failed'
          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 shadow-sm'
          : step.status === 'success'
          ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      {/* Header dòng thẻ */}
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {/* Thứ tự bước */}
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-black text-slate-700 dark:text-slate-300 shrink-0">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {getDomainIcon(capDef?.domain)}
                <span>{step.name}</span>
              </span>

              {capDef?.risk_level === 'high_mutation' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Tác động thay đổi dữ liệu thực tế">
                  <ShieldAlert className="w-3 h-3 text-amber-600" /> MUTATION
                </span>
              )}

              {getStatusBadge(step.status)}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
              <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                {step.capability_id}
              </span>
              {step.depends_on && step.depends_on.length > 0 && (
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                  ↳ Phụ thuộc: {step.depends_on.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Nút thao tác điều khiển */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditable && (
            <>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMoveStep && onMoveStep(step.step_id, 'up')}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Di chuyển lên trước"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={index === totalSteps - 1}
                onClick={() => onMoveStep && onMoveStep(step.step_id, 'down')}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Di chuyển xuống sau"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteStep && onDeleteStep(step.step_id)}
                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                title="Xóa bước này"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          {step.status === 'failed' && onRetryStep && (
            <button
              type="button"
              onClick={() => onRetryStep(step.step_id)}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Thông báo lỗi nếu thất bại */}
      {step.error_message && (
        <div className="mx-4 mb-3 p-2.5 rounded-xl bg-rose-100/70 dark:bg-rose-950/40 border border-rose-300 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{step.error_message}</span>
        </div>
      )}

      {/* Thân thẻ mở rộng: Xem & sửa Inputs / Outputs */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
          {step.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
              {step.description}
            </p>
          )}

          {/* Bảng cấu hình Inputs */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Tham số đầu vào (Inputs)</span>
              {isEditable && (
                <span className="text-[10px] lowercase text-slate-400 font-normal">
                  (Nhấp bút để chỉnh sửa giá trị)
                </span>
              )}
            </div>

            <div className="space-y-1.5 bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono">
              {Object.keys(step.inputs || {}).length === 0 ? (
                <div className="text-slate-400 italic text-xs">Không có tham số đầu vào cố định.</div>
              ) : (
                Object.entries(step.inputs).map(([key, val]) => {
                  const isBound = typeof val === 'string' && val.includes('{{');
                  const isEditing = editingInputKey === key;

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 p-1.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                    >
                      <span className="font-bold text-slate-700 dark:text-slate-300">{key}:</span>

                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1 max-w-md">
                          <input
                            type="text"
                            value={tempInputValue}
                            onChange={(e) => setTempInputValue(e.target.value)}
                            className="w-full px-2 py-1 text-xs border rounded-md dark:bg-slate-800 dark:border-slate-700"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveInput(key)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 max-w-[70%]">
                          <span
                            className={`truncate ${
                              isBound
                                ? 'text-indigo-600 dark:text-indigo-400 font-extrabold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                            title={typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          >
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>

                          {isEditable && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingInputKey(key);
                                setTempInputValue(
                                  typeof val === 'object' ? JSON.stringify(val) : String(val || '')
                                );
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Hiển thị Outputs nếu đã hoàn thành */}
          {step.outputs && Object.keys(step.outputs).length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                Kết quả sinh ra (Outputs)
              </div>
              <pre className="p-2.5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono text-emerald-900 dark:text-emerald-200 max-h-36 overflow-y-auto">
                {JSON.stringify(step.outputs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
