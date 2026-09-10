// frontend/src/features/inbox/components/WorkflowBuilder.tsx
import React, { useState } from 'react';
import {
  Plus,
  ArrowDown,
  Layers,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Check,
  X
} from 'lucide-react';
import { WorkflowStep, CapabilityDefinition } from '../../../types';
import { WorkflowStepCard } from './WorkflowStepCard';

interface WorkflowBuilderProps {
  steps: WorkflowStep[];
  capabilities: CapabilityDefinition[];
  isEditable: boolean;
  onStepsChange: (updatedSteps: WorkflowStep[]) => void;
  onRetryStep?: (stepId: string) => void;
}

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  steps,
  capabilities,
  isEditable,
  onStepsChange,
  onRetryStep,
}) => {
  const [isAddStepOpen, setIsAddStepOpen] = useState<boolean>(false);
  const [selectedCapId, setSelectedCapId] = useState<string>('');
  const [customStepName, setCustomStepName] = useState<string>('');

  const capabilitiesMap = React.useMemo(() => {
    const map: Record<string, CapabilityDefinition> = {};
    capabilities.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [capabilities]);

  const handleUpdateStep = (stepId: string, updated: Partial<WorkflowStep>) => {
    const nextSteps = steps.map((s) => (s.step_id === stepId ? { ...s, ...updated } : s));
    onStepsChange(nextSteps);
  };

  const handleDeleteStep = (stepId: string) => {
    // Kiểm tra xem có bước nào đang phụ thuộc vào bước này không
    const dependents = steps.filter((s) => s.depends_on.includes(stepId));
    if (dependents.length > 0) {
      const depNames = dependents.map((d) => d.name).join(', ');
      const confirmDelete = window.confirm(
        `Cảnh báo phụ thuộc:\nCác bước sau đây đang cần dữ liệu từ bước này: [${depNames}].\nNếu xóa, các bước trên có thể bị lỗi. Bạn có chắc chắn muốn xóa?`
      );
      if (!confirmDelete) return;
    }

    // Xóa bước và làm sạch dependencies của các bước sau
    const nextSteps = steps
      .filter((s) => s.step_id !== stepId)
      .map((s) => ({
        ...s,
        depends_on: s.depends_on.filter((d) => d !== stepId),
      }));

    onStepsChange(nextSteps);
  };

  const handleMoveStep = (stepId: string, direction: 'up' | 'down') => {
    const idx = steps.findIndex((s) => s.step_id === stepId);
    if (idx < 0) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;

    const nextSteps = [...steps];
    const temp = nextSteps[idx];
    nextSteps[idx] = nextSteps[targetIdx];
    nextSteps[targetIdx] = temp;

    onStepsChange(nextSteps);
  };

  const handleAddStep = () => {
    if (!selectedCapId) return;

    const capDef = capabilitiesMap[selectedCapId];
    const newStepId = `step_${String(steps.length + 1).padStart(2, '0')}`;
    const prevStepId = steps.length > 0 ? steps[steps.length - 1].step_id : undefined;

    const newStep: WorkflowStep = {
      step_id: newStepId,
      capability_id: selectedCapId,
      name: customStepName.trim() || (capDef ? capDef.name : selectedCapId),
      description: capDef?.description,
      status: 'ready',
      inputs: {},
      depends_on: prevStepId ? [prevStepId] : [],
    };

    onStepsChange([...steps, newStep]);
    setSelectedCapId('');
    setCustomStepName('');
    setIsAddStepOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Tiêu đề & Công cụ điều khiển */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Prepared Execution Workflow ({steps.length} Bước)
            </h4>
            <p className="text-[11px] text-slate-500">
              Đồ thị liên kết tự động tuần tự dựa trên Capability Registry.
            </p>
          </div>
        </div>

        {isEditable && (
          <button
            type="button"
            onClick={() => setIsAddStepOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Bước Vào Luồng</span>
          </button>
        )}
      </div>

      {/* Modal / Card thêm bước mới */}
      {isAddStepOpen && (
        <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-extrabold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
              Chọn Capability từ Registry:
            </h5>
            <button
              type="button"
              onClick={() => setIsAddStepOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Capability mẫu:
              </label>
              <select
                value={selectedCapId}
                onChange={(e) => {
                  setSelectedCapId(e.target.value);
                  const cap = capabilitiesMap[e.target.value];
                  if (cap) setCustomStepName(cap.name);
                }}
                className="w-full text-xs p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value="">-- Chọn Capability --</option>
                {capabilities.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.domain}] {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Tên hiển thị tùy chỉnh:
              </label>
              <input
                type="text"
                value={customStepName}
                onChange={(e) => setCustomStepName(e.target.value)}
                placeholder="Nhập tên bước..."
                className="w-full text-xs p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddStepOpen(false)}
              className="px-3 py-1 text-xs rounded-lg border text-slate-600 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!selectedCapId}
              onClick={handleAddStep}
              className="px-4 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 shadow-2xs"
            >
              Xác Nhận Thêm
            </button>
          </div>
        </div>
      )}

      {/* Danh sách các Step Cards kết nối trực quan */}
      <div className="space-y-2">
        {steps.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-400 text-xs">
            Chưa có bước nào trong quy trình. Nhấp "Thêm Bước" hoặc kích hoạt AI Tái Lập Plan.
          </div>
        ) : (
          steps.map((step, idx) => (
            <React.Fragment key={step.step_id || idx}>
              <WorkflowStepCard
                step={step}
                index={idx}
                totalSteps={steps.length}
                capabilitiesMap={capabilitiesMap}
                isEditable={isEditable}
                onUpdateStep={handleUpdateStep}
                onDeleteStep={handleDeleteStep}
                onMoveStep={handleMoveStep}
                onRetryStep={onRetryStep}
              />

              {/* Đường line kết nối giữa các bước */}
              {idx < steps.length - 1 && (
                <div className="flex items-center justify-center py-0.5">
                  <div className="w-0.5 h-3 bg-slate-200 dark:bg-slate-800 rounded-full" />
                </div>
              )}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
};
