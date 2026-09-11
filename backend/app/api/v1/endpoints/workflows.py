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


def _is_empty_or_placeholder(value: Any) -> bool:
    """Kiểm tra giá trị có bị rỗng, null hoặc chứa placeholder giả lập hay không."""
    if value is None:
        return True
    if isinstance(value, str):
        val_clean = value.strip().lower()
        if val_clean in ["", "none", "null", "undefined"]:
            return True
    if isinstance(value, (list, dict)) and len(value) == 0:
        return True
    return False


def _is_valid_template_binding(value: Any) -> bool:
    """Kiểm tra giá trị có phải là cú pháp data binding hợp lệ {{ step_xx.property }}."""
    if isinstance(value, str):
        val = value.strip()
        return val.startswith("{{") and val.endswith("}}")
    return False


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
        new_wf = await workflow_planner_service.plan_workflow_for_ticket(ticket_id)
        if not new_wf:
            raise HTTPException(status_code=404, detail="Không thể tạo workflow cho ticket này.")
        return new_wf
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Lỗi lấy workflow cho ticket #{ticket_id}: {err_msg}", exc_info=True)
        if "PGRST205" in err_msg or "automation_workflows" in err_msg:
            raise HTTPException(
                status_code=503,
                detail="Bảng CSDL 'automation_workflows' chưa được khởi tạo trên Supabase."
            )
        raise HTTPException(status_code=500, detail=err_msg)


@router.post("/plan")
async def plan_ticket_workflow(payload: Dict[str, Any] = Body(...)):
    """Chủ động kích hoạt AI lập lại kế hoạch Workflow cho một ticket."""
    ticket_id = payload.get("ticket_id")
    if not ticket_id:
        raise HTTPException(status_code=400, detail="Thiếu ticket_id.")

    try:
        wf = await workflow_planner_service.plan_workflow_for_ticket(ticket_id)
        if not wf:
            raise HTTPException(status_code=500, detail="Không thể lập kế hoạch cho ticket.")
        return {"status": "success", "workflow": wf}
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Lỗi lập plan cho ticket #{ticket_id}: {err_msg}", exc_info=True)
        raise HTTPException(status_code=500, detail=err_msg)


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
    """Quản trị viên tinh chỉnh Workflow Draft."""
    supabase = get_supabase_client()
    res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy workflow để cập nhật.")

    old_wf = res.data[0]
    if old_wf.get("status") in ["running", "success", "succeeded"]:
        raise HTTPException(status_code=400, detail="Không thể chỉnh sửa workflow đang chạy hoặc đã thành công.")

    updater = str(payload.updated_by).strip() if payload.updated_by else ""
    if not updater or not updater.endswith("@dtt.vn"):
        raise HTTPException(
            status_code=400, 
            detail="Bắt buộc phải cung cấp danh tính người thực hiện cập nhật hợp lệ có đuôi '@dtt.vn' (updated_by)."
        )

    update_fields: Dict[str, Any] = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    if payload.title is not None:
        update_fields["title"] = payload.title
    if payload.goal is not None:
        update_fields["goal"] = payload.goal
    if payload.status is not None:
        update_fields["status"] = payload.status
    if payload.ai_analysis is not None:
        update_fields["ai_analysis"] = payload.ai_analysis
    if payload.steps is not None:
        steps_dicts = [s.model_dump() for s in payload.steps]
        update_fields["steps"] = steps_dicts

        val_res = workflow_planner_service.validate_workflow_graph(payload.steps)
        if not val_res.is_valid:
            update_fields["status"] = "invalid"
        elif val_res.warnings:
            update_fields["status"] = "needs_review"
        else:
            update_fields["status"] = "ready"

    up_res = supabase.table("automation_workflows").update(update_fields).eq("id", workflow_id).execute()
    new_record = up_res.data[0] if up_res.data else old_wf

    try:
        supabase.table("automation_workflow_history").insert({
            "workflow_id": workflow_id,
            "field_changed": "steps_edited",
            "old_val": {"steps_count": len(old_wf.get("steps") or [])},
            "new_val": {"steps_count": len(new_record.get("steps") or [])},
            "changed_by": updater
        }).execute()
    except Exception as log_err:
        logger.warning(f"Lỗi ghi audit log update_workflow_draft: {log_err}")

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
    Xác nhận & Khởi chạy Workflow (Safety-Critical Approval Gate):
    - Chặn hoàn toàn: no_action, needs_information, invalid, workflow rỗng.
    - Bắt buộc người duyệt có email @dtt.vn.
    - Fail-Closed: Bắt buộc capability có available=True và supported_by_handler=True.
    - Kiểm tra nghiêm ngặt input: school, courses, repo_url, git_role, temp_passwords.
    """
    supabase = get_supabase_client()
    res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy workflow.")

    wf = res.data[0]
    current_status = wf.get("status")

    if current_status == "no_action":
        raise HTTPException(
            status_code=400,
            detail="Không thể phê duyệt: Workflow được phân loại là 'no_action'."
        )
    if current_status == "needs_information":
        raise HTTPException(
            status_code=400,
            detail="Không thể phê duyệt: Workflow chưa đủ thông tin bắt buộc ('needs_information'). Vui lòng bổ sung đầy đủ dữ kiện."
        )
    if current_status == "invalid":
        raise HTTPException(
            status_code=400,
            detail="Không thể phê duyệt: Cấu trúc workflow không hợp lệ (lỗi chu trình hoặc capability không khả dụng)."
        )
    if current_status in ["running", "succeeded", "success", "approved"]:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể phê duyệt lại workflow đang ở trạng thái '{current_status}'."
        )
    if current_status == "cancelled":
        raise HTTPException(
            status_code=400,
            detail="Không thể phê duyệt: Workflow đã bị hủy bỏ."
        )

    # 1. Kiểm tra danh tính người phê duyệt hợp lệ (@dtt.vn)
    approver = str(payload.approved_by).strip() if payload.approved_by else ""
    if not approver or not approver.endswith("@dtt.vn") or approver.lower().startswith(("admin@", "unknown@", "test@")):
        raise HTTPException(
            status_code=400,
            detail="Bắt buộc phải cung cấp danh tính người phê duyệt hợp lệ thuộc tổ chức (@dtt.vn)."
        )

    # 2. Thu thập và kiểm tra danh sách bước
    if payload.frozen_steps:
        step_objs = payload.frozen_steps
    else:
        raw_steps = wf.get("steps") or []
        step_objs = [WorkflowStepDraft(**s) for s in raw_steps]

    if not step_objs or len(step_objs) == 0:
        raise HTTPException(
            status_code=400,
            detail="Không thể phê duyệt workflow rỗng (0 bước thực thi)."
        )

    # 3. Server-side Validation toàn bộ Đồ thị DAG
    val_result = workflow_planner_service.validate_workflow_graph(step_objs)
    if not val_result.is_valid:
        raise HTTPException(
            status_code=422,
            detail=f"Server-side Validation thất bại: {'; '.join(val_result.errors)}"
        )

    # 4. Kiểm tra chi tiết từng bước & từng capability
    for s in step_objs:
        cap_id = s.capability_id

        # Kiểm tra capability có tồn tại và executable (available=True & supported_by_handler=True)
        if not workflow_planner_service.is_capability_executable(cap_id):
            raise HTTPException(
                status_code=422,
                detail=f"Bước '{s.name}' yêu cầu capability '{cap_id}' hiện không khả dụng để thực thi "
                       f"(yêu cầu đồng thời available=True và supported_by_handler=True)."
            )

        inputs = s.inputs or {}

        # Kiểm tra contract input từng loại action
        if cap_id in ["workspace.resolve_school", "workspace.bulk_account_creation"]:
            school = inputs.get("school_identifier") or inputs.get("school_name")
            if _is_empty_or_placeholder(school):
                raise HTTPException(
                    status_code=422,
                    detail=f"Bước '{s.name}': Thiếu tên trường học bắt buộc."
                )

        if cap_id == "lms.direct_enroll":
            courses = inputs.get("courses")
            if _is_empty_or_placeholder(courses):
                raise HTTPException(
                    status_code=422,
                    detail=f"Bước '{s.name}': Thiếu danh sách khóa học Moodle (courses)."
                )

        if cap_id == "git.add_collaborators":
            repo_url = inputs.get("repo_url")
            target_role = inputs.get("target_role")
            if _is_empty_or_placeholder(repo_url):
                raise HTTPException(
                    status_code=422,
                    detail=f"Bước '{s.name}': Thiếu URL repository Git (repo_url)."
                )
            if _is_empty_or_placeholder(target_role):
                raise HTTPException(
                    status_code=422,
                    detail=f"Bước '{s.name}': Thiếu vai trò Git (target_role). Nghiêm cấm dùng role mặc định."
                )

        if cap_id == "keycloak.reset_password":
            target_email = inputs.get("target_email")
            if _is_empty_or_placeholder(target_email) or "@" not in str(target_email):
                raise HTTPException(
                    status_code=422,
                    detail=f"Bước '{s.name}': Email người dùng không hợp lệ."
                )
            temp_pass = inputs.get("temporary_password")
            if _is_empty_or_placeholder(temp_pass) and not _is_valid_template_binding(temp_pass):
                raise HTTPException(
                    status_code=422,
                    detail=f"Bước '{s.name}': Quản trị viên bắt buộc phải nhập mật khẩu tạm thời cụ thể trước khi phê duyệt."
                )

    now_iso = datetime.now(timezone.utc).isoformat()
    frozen_steps_dicts = [s.model_dump() for s in step_objs]

    # 5. Đóng băng plan và chuyển trạng thái approved
    update_data: Dict[str, Any] = {
        "status": "approved",
        "approved_by": approver,
        "approved_at": now_iso,
        "updated_at": now_iso,
        "steps": frozen_steps_dicts
    }

    supabase.table("automation_workflows").update(update_data).eq("id", workflow_id).execute()
    logger.info(f"🔒 [WORKFLOW APPROVED] Quản trị viên '{approver}' đã phê duyệt an toàn Workflow #{workflow_id[:8]}!")

    try:
        supabase.table("automation_workflow_history").insert({
            "workflow_id": workflow_id,
            "field_changed": "status",
            "old_val": {"status": current_status},
            "new_val": {"status": "approved", "steps_count": len(frozen_steps_dicts)},
            "changed_by": approver
        }).execute()
    except Exception as log_err:
        logger.warning(f"Lỗi ghi audit log approve: {log_err}")

    # 6. Khởi chạy ngầm nếu có yêu cầu run_immediately
    if payload.run_immediately:
        background_tasks.add_task(workflow_executor_service.execute_approved_workflow, workflow_id)
        return {
            "status": "success", 
            "message": "🚀 Workflow đã vượt qua toàn bộ chốt kiểm định an toàn và đang thực thi ngầm!",
            "workflow_id": workflow_id
        }

    return {
        "status": "success", 
        "message": "Đã phê duyệt và đóng băng Workflow thành công!", 
        "workflow_id": workflow_id
    }


@router.post("/{workflow_id}/steps/{step_id}/retry")
async def retry_step(
    workflow_id: str, 
    step_id: str,
    background_tasks: BackgroundTasks
):
    """Retry một bước bị lỗi."""
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