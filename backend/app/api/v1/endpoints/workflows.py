# backend/app/api/v1/endpoints/workflows.py
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, BackgroundTasks, Body

from app.core.supabase import get_supabase_client
from app.services.workflow_planner import workflow_planner_service
from app.services.workflow_executor import workflow_executor_service
from app.models.workflow import (
    WorkflowDraftUpdate,
    WorkflowApprovalRequest,
    WorkflowValidationResult,
    WorkflowStepDraft
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/capabilities")
async def get_capabilities():
    """Lấy danh mục Capabilities hợp lệ của hệ thống phục vụ Autocomplete và Editor."""
    return {
        "status": "success",
        "capabilities": list(workflow_planner_service.capabilities_map.values()),
        "archetypes": workflow_planner_service.workflow_rules
    }


@router.get("/ticket/{ticket_id}")
async def get_workflow_for_ticket(ticket_id: str):
    """Lấy Workflow Draft mới nhất của một ticket. Nếu chưa có, tự động lập kế hoạch."""
    supabase = get_supabase_client()
    try:
        res = supabase.table("automation_workflows")\
            .select("*")\
            .eq("ticket_id", ticket_id)\
            .order("version", desc=True)\
            .limit(1)\
            .execute()

        if res.data and len(res.data) > 0:
            return res.data[0]

        # Chưa có workflow -> Kích hoạt Planner tự động
        logger.info(f"✨ Chưa có workflow cho ticket #{ticket_id[:8]}, đang tự động lập plan...")
        new_wf = workflow_planner_service.plan_workflow_for_ticket(ticket_id)
        if not new_wf:
            raise HTTPException(status_code=404, detail="Không thể tạo workflow cho ticket này.")
        return new_wf
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi lấy workflow cho ticket #{ticket_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plan")
async def plan_ticket_workflow(payload: Dict[str, Any] = Body(...)):
    """Chủ động kích hoạt AI lập lại kế hoạch Workflow cho một ticket."""
    ticket_id = payload.get("ticket_id")
    if not ticket_id:
        raise HTTPException(status_code=400, detail="Thiếu ticket_id.")

    wf = workflow_planner_service.plan_workflow_for_ticket(ticket_id)
    if not wf:
        raise HTTPException(status_code=500, detail="Không thể lập kế hoạch cho ticket.")
    return {"status": "success", "workflow": wf}


@router.get("/{workflow_id}")
async def get_workflow_by_id(workflow_id: str):
    """Lấy chi tiết một Workflow theo ID."""
    supabase = get_supabase_client()
    res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy workflow.")
    return res.data[0]


@router.put("/{workflow_id}")
async def update_workflow_draft(workflow_id: str, payload: WorkflowDraftUpdate):
    """
    Quản trị viên tinh chỉnh Workflow Draft:
    - Sắp xếp thứ tự, thêm/xóa bước, cập nhật inputs/school/course.
    - Tự động ghi audit log vào automation_workflow_history.
    """
    supabase = get_supabase_client()
    res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy workflow để cập nhật.")

    old_wf = res.data[0]
    if old_wf.get("status") in ["running", "success"]:
        raise HTTPException(status_code=400, detail="Không thể chỉnh sửa workflow đang chạy hoặc đã thành công.")

    update_fields: Dict[str, Any] = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    if payload.title is not None:
        update_fields["title"] = payload.title
    if payload.goal is not None:
        update_fields["goal"] = payload.goal
    if payload.status is not None:
        update_fields["status"] = payload.status
    if payload.steps is not None:
        steps_dicts = [s.model_dump() for s in payload.steps]
        update_fields["steps"] = steps_dicts

        # Kiểm tra validation ngay sau khi sửa steps
        val_res = workflow_planner_service.validate_workflow_graph(payload.steps)
        if val_res.is_valid:
            update_fields["status"] = "ready"
        else:
            update_fields["status"] = "needs_review"

    up_res = supabase.table("automation_workflows").update(update_fields).eq("id", workflow_id).execute()
    new_record = up_res.data[0] if up_res.data else old_wf

    # Ghi Audit Log
    try:
        supabase.table("automation_workflow_history").insert({
            "workflow_id": workflow_id,
            "field_changed": "steps_edited",
            "old_val": {"steps_count": len(old_wf.get("steps") or [])},
            "new_val": {"steps_count": len(new_record.get("steps") or [])},
            "changed_by": payload.updated_by or "admin"
        }).execute()
    except Exception:
        pass

    return new_record


@router.post("/{workflow_id}/validate")
async def validate_workflow(workflow_id: str):
    """Kiểm tra toàn diện tính toàn vẹn (DAG & Inputs) của Workflow."""
    supabase = get_supabase_client()
    res = supabase.table("automation_workflows").select("steps").eq("id", workflow_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy workflow.")

    raw_steps = res.data[0].get("steps") or []
    step_objs = [WorkflowStepDraft(**s) for s in raw_steps]
    return workflow_planner_service.validate_workflow_graph(step_objs)


@router.post("/{workflow_id}/approve_and_run")
async def approve_and_run_workflow(
    workflow_id: str, 
    background_tasks: BackgroundTasks,
    payload: WorkflowApprovalRequest = Body(...)
):
    """
    Xác nhận & Khởi chạy Workflow:
    - Khóa đóng băng version và đánh dấu approved.
    - Đưa vào BackgroundTasks để WorkflowExecutor điều phối từng bước.
    """
    supabase = get_supabase_client()
    res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy workflow.")

    wf = res.data[0]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Cập nhật trạng thái sang approved
    update_data: Dict[str, Any] = {
        "status": "approved",
        "approved_by": payload.approved_by,
        "approved_at": now_iso,
        "updated_at": now_iso
    }
    if payload.frozen_steps:
        update_data["steps"] = [s.model_dump() for s in payload.frozen_steps]

    supabase.table("automation_workflows").update(update_data).eq("id", workflow_id).execute()
    logger.info(f"🔒 [WORKFLOW APPROVED] Quản trị viên '{payload.approved_by}' đã phê duyệt Workflow #{workflow_id[:8]}!")

    if payload.run_immediately:
        background_tasks.add_task(workflow_executor_service.execute_approved_workflow, workflow_id)
        return {
            "status": "success", 
            "message": "🚀 Workflow đã được phê duyệt và đang bắt đầu thực thi ngầm!",
            "workflow_id": workflow_id
        }

    return {"status": "success", "message": "Đã phê duyệt Workflow thành công!", "workflow_id": workflow_id}


@router.post("/{workflow_id}/steps/{step_id}/retry")
async def retry_step(
    workflow_id: str, 
    step_id: str,
    background_tasks: BackgroundTasks
):
    """Retry một bước bị lỗi và tự động kích hoạt lại các bước hạ nguồn."""
    background_tasks.add_task(workflow_executor_service.retry_workflow_step, workflow_id, step_id)
    return {"status": "success", "message": f"Đã lên lịch retry bước '{step_id}' chạy ngầm!"}


@router.post("/{workflow_id}/cancel")
async def cancel_workflow(workflow_id: str):
    """Hủy thực thi workflow."""
    supabase = get_supabase_client()
    supabase.table("automation_workflows").update({
        "status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", workflow_id).execute()
    return {"status": "success", "message": f"Đã hủy workflow #{workflow_id[:8]}."}
