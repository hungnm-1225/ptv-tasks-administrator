// frontend/src/features/inbox/components/WorkflowBuilder.tsx
import React, { useState, useMemo } from 'react';
import {
  Plus,
  Layers,
  Sparkles,
  X,
  Check,
  FolderTree,
  Edit3
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

  const capabilitiesMap = useMemo(() => {
    const map: Record<string, CapabilityDefinition> = {};
    capabilities.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [capabilities]);

  // Phân nhóm Capabilities theo Domain để hiển thị OptGroup chuyên nghiệp
  const capabilitiesByDomain = useMemo(() => {
    const groups: Record<string, CapabilityDefinition[]> = {};
    capabilities.forEach((c) => {
      const domain = c.domain || 'Phân Hệ Khác';
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(c);
    });
    return groups;
  }, [capabilities]);

  const handleUpdateStep = (stepId: string, updated: Partial<WorkflowStep>) => {
    const nextSteps = steps.map((s) => (s.step_id === stepId ? { ...s, ...updated } : s));
    onStepsChange(nextSteps);
  };

  const handleDeleteStep = (stepId: string) => {
    const dependents = steps.filter((s) => s.depends_on.includes(stepId));
    if (dependents.length > 0) {
      const depNames = dependents.map((d) => d.name).join(', ');
      const confirmDelete = window.confirm(
        `⚠️ Cảnh báo phụ thuộc:\nCác bước sau đang phụ thuộc vào bước này: [${depNames}].\nNếu xóa, các bước trên có thể bị thiếu dữ liệu. Bạn có chắc chắn muốn xóa?`
      );
      if (!confirmDelete) return;
    }

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
    if (capDef && capDef.available === false) {
      alert("⚠️ Cỗ máy này hiện đang bị tạm khóa do chưa có Bot Handler trên máy chủ.");
      return;
    }

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
    <div className="space-y-4">
      {/* Tiêu Đề & Công Cụ Điều Khiển */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 dark:bg-slate-850 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Prepared Execution Workflow
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700">
                {steps.length} BƯỚC
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Đồ thị liên kết thực thi tự động dựa trên Capability Registry.
            </p>
          </div>
        </div>

        {isEditable && (
          <button
            type="button"
            onClick={() => setIsAddStepOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Bước Vào Luồng</span>
          </button>
        )}
      </div>

      {/* Panel Thêm Bước Mới (Khóa capability không có handler) */}
      {isAddStepOpen && (
        <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/60 border-2 border-indigo-300 dark:border-indigo-700 shadow-md space-y-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-indigo-200 dark:border-indigo-800 pb-3">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
              <h5 className="text-xs font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
                Thêm Bước Thực Thi Từ Capability Registry:
              </h5>
            </div>
            <button
              type="button"
              onClick={() => setIsAddStepOpen(false)}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-white/60 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Dropdown Chọn Capability (Vô hiệu hóa capability available=false) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-900 dark:text-slate-200 block">
                Chọn Cỗ Máy / Capability <span className="text-rose-500 font-bold">*</span>:
              </label>
              <div className="relative">
                <select
                  value={selectedCapId}
                  onChange={(e) => {
                    setSelectedCapId(e.target.value);
                    const cap = capabilitiesMap[e.target.value];
                    if (cap) setCustomStepName(cap.name);
                  }}
                  className="w-full h-11 px-3.5 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border-2 border-indigo-400 dark:border-indigo-600 rounded-xl shadow-xs outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
                >
                  <option value="" className="text-slate-400 bg-white dark:bg-slate-900 font-semibold">
                    -- Nhấp Để Chọn Capability --
                  </option>

                  {Object.entries(capabilitiesByDomain).map(([domain, caps]) => (
                    <optgroup
                      key={domain}
                      label={`📁 ${domain}`}
                      className="font-black text-indigo-800 dark:text-indigo-300 bg-slate-100 dark:bg-slate-800 py-1"
                    >
                      {caps.map((c) => (
                        <option
                          key={c.id}
                          value={c.id}
                          disabled={c.available === false}
                          className={`py-1.5 text-xs font-bold ${c.available === false
                            ? 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 italic'
                            : 'text-slate-900 dark:text-white bg-white dark:bg-slate-900'
                            }`}
                        >
                          {c.name} {c.available === false ? '(Tạm khóa - Chưa có bot handler)' : `(${c.id})`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            {/* Ô Nhập Tên Hiển Thị Tùy Chỉnh */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-900 dark:text-slate-200 block">
                Tên Hiển Thị Của Bước (Label):
              </label>
              <input
                type="text"
                value={customStepName}
                onChange={(e) => setCustomStepName(e.target.value)}
                placeholder="Nhập tên bước gợi nhớ..."
                className="w-full h-11 px-3.5 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border-2 border-indigo-400 dark:border-indigo-600 rounded-xl shadow-xs outline-none focus:ring-2 focus:ring-indigo-500/30 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-indigo-200/80 dark:border-indigo-800">
            <button
              type="button"
              onClick={() => setIsAddStepOpen(false)}
              className="h-10 px-4 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!selectedCapId || capabilitiesMap[selectedCapId]?.available === false}
              onClick={handleAddStep}
              className="h-10 px-5 text-xs font-black rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Xác Nhận Thêm Vào Luồng</span>
            </button>
          </div>
        </div>
      )}

      {/* Danh Sách Các Step Cards */}
      <div className="space-y-2.5">
        {steps.length === 0 ? (
          <div className="p-10 text-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
            <Layers className="w-8 h-8 text-slate-400 mx-auto stroke-1" />
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
              Chưa có bước nào trong quy trình.
            </p>
            <p className="text-[11px] text-slate-400">
              Nhấp nút <strong>"Thêm Bước Vào Luồng"</strong> ở trên hoặc bấm <strong>"AI Đánh giá lại ý định"</strong>.
            </p>
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

              {idx < steps.length - 1 && (
                <div className="flex items-center justify-center py-0.5">
                  <div className="w-0.5 h-3.5 bg-indigo-200 dark:bg-indigo-900/60 rounded-full" />
                </div>
              )}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
};