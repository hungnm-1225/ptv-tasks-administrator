# backend/app/models/workflow.py
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime


class WorkflowStepDraft(BaseModel):
    step_id: str = Field(..., description="Mã định danh bước duy nhất (e.g., 'step_01')")
    capability_id: str = Field(..., description="Mã capability tương ứng trong capabilities.json")
    name: str = Field(..., description="Tên bước hiển thị trực quan")
    description: Optional[str] = Field(None, description="Mô tả mục đích của bước")
    status: str = Field(
        default="ready", 
        description="Trạng thái: ready | waiting_dependency | running | waiting_poll | success | failed | skipped"
    )
    inputs: Dict[str, Any] = Field(default_factory=dict, description="Các tham số đầu vào của bước")
    depends_on: List[str] = Field(default_factory=list, description="Danh sách step_id phụ thuộc")
    execution_task_id: Optional[str] = Field(None, description="ID của bot_automation_tasks khi bước này được thực thi")
    outputs: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Kết quả sinh ra sau khi hoàn thành")
    error_message: Optional[str] = Field(None, description="Thông điệp lỗi nếu bước thất bại")
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class WorkflowEntityCandidate(BaseModel):
    id: Optional[str] = None
    name: str
    code: Optional[str] = None
    confidence: float
    metadata: Optional[Dict[str, Any]] = None


class WorkflowAIAnalysis(BaseModel):
    summary: str = Field(..., description="Tóm tắt mục đích AI đã phân tích")
    reason_summary_vi: Optional[str] = Field(None, description="Giải thích lý do lập ra workflow này")
    overall_confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    confidence_breakdown: Dict[str, float] = Field(default_factory=dict)
    detected_school: Optional[WorkflowEntityCandidate] = None
    detected_courses: List[Dict[str, Any]] = Field(default_factory=list)
    detected_actions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class WorkflowDraftCreate(BaseModel):
    ticket_id: str
    title: str
    goal: Optional[str] = None
    ai_analysis: Optional[WorkflowAIAnalysis] = None
    steps: List[WorkflowStepDraft] = Field(default_factory=list)


class WorkflowDraftUpdate(BaseModel):
    title: Optional[str] = None
    goal: Optional[str] = None
    steps: Optional[List[WorkflowStepDraft]] = None
    status: Optional[str] = None
    updated_by: Optional[str] = None


class WorkflowValidationResult(BaseModel):
    is_valid: bool
    status: str = Field(..., description="ready | needs_review | invalid")
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)


class WorkflowApprovalRequest(BaseModel):
    approved_by: str = Field(default="hung.nguyenmanh@dtt.vn")
    run_immediately: bool = Field(default=True)
    frozen_steps: Optional[List[WorkflowStepDraft]] = None



class WorkflowResponse(BaseModel):
    id: str
    ticket_id: Optional[str] = None
    title: str
    goal: Optional[str] = None
    status: str
    version: int = 1
    ai_analysis: Optional[Dict[str, Any]] = None
    steps: List[WorkflowStepDraft] = Field(default_factory=list)
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
