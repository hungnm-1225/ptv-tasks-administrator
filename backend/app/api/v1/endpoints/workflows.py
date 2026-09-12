# backend/app/api/v1/endpoints/workflows.py
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, BackgroundTasks, Body, Depends
from app.core.security import get_current_user_email
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
async def get_workflow_for_ticket(
    ticket_id: str,
    current_user_email: str = Depends(get_current_user_email),
):
    """Return a provenance-linked draft or replace a legacy draft safely."""
    supabase = get_supabase_client()
    try:
        res = supabase.table("automation_workflows")\
            .select("*")\
            .eq("ticket_id", ticket_id)\
            .order("version", desc=True)\
            .limit(1)\
            .execute()

        if res.data and len(res.data) > 0:
            existing = res.data[0]
            if existing.get("proposal_id") and existing.get("status") != "requires_reapproval":
                return existing

            # A workflow generated before provenance enforcement cannot be
            # approved safely.  Do not send it back to the UI where approval
            # will inevitably fail; create a revision-bound replacement.
            logger.info(
                "Re-planning legacy workflow #%s for ticket #%s because proposal provenance is absent.",
                str(existing.get("id", ""))[:8],
                ticket_id[:8],
            )
            new_wf = await workflow_planner_service.plan_workflow_for_ticket(ticket_id)
            if not new_wf:
                raise HTTPException(
                    status_code=409,
                    detail="Workflow cũ không có provenance và chưa thể tạo proposal mới từ revision hiện tại.",
                )
            return new_wf

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
async def plan_ticket_workflow(
    payload: Dict[str, Any] = Body(...),
    current_user_email: str = Depends(get_current_user_email),
):
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
async def update_workflow_draft(
    workflow_id: str, 
    payload: WorkflowDraftUpdate,
    current_user_email: str = Depends(get_current_user_email)
):
    """Quản trị viên tinh chỉnh Workflow Draft (Xác thực danh tính từ Bearer JWT)."""
    supabase = get_supabase_client()
    res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy workflow để cập nhật.")

    old_wf = res.data[0]
    if old_wf.get("status") in ["running", "success", "succeeded", "approved"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Không thể chỉnh sửa workflow đã ở trạng thái '{old_wf.get('status')}'. Workflow đã được đóng băng an toàn."
        )
    updater = current_user_email

    now_iso = datetime.now(timezone.utc).isoformat()
    update_fields: Dict[str, Any] = {
        "updated_at": now_iso
    }

    if payload.title is not None:
        update_fields["title"] = payload.title
    if payload.goal is not None:
        update_fields["goal"] = payload.goal
    if payload.status is not None:
        update_fields["status"] = payload.status
    if payload.ai_analysis is not None:
        ai_data = dict(payload.ai_analysis)
        if payload.operator_reason:
            ai_data["operator_reason"] = payload.operator_reason
        update_fields["ai_analysis"] = ai_data
    elif payload.operator_reason:
        ai_data = dict(old_wf.get("ai_analysis") or {})
        ai_data["operator_reason"] = payload.operator_reason
        update_fields["ai_analysis"] = ai_data

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
            "new_val": {
                "steps_count": len(new_record.get("steps") or []),
                "operator_reason": payload.operator_reason
            },
            "changed_by": updater
        }).execute()
    except Exception as log_err:
        logger.warning(f"Lỗi ghi audit log update_workflow_draft: {log_err}")

    return new_record


@router.post("/{workflow_id}/approve_and_run")
async def approve_and_run_workflow(
    workflow_id: str, 
    background_tasks: BackgroundTasks,
    payload: WorkflowApprovalRequest = Body(...),
    current_user_email: str = Depends(get_current_user_email)
):
    """
    PHA B: XÁC NHẬN & ĐÓNG BĂNG PROPOSAL (JWT AUTHENTICATED)
    - Kiểm tra workflow.proposal_id. Thiếu ➔ Từ chối approval ngay lập tức.
    - Đọc proposal: Kiểm tra status ready_for_review, chưa superseded, revision & assessment tồn tại.
    - Kiểm tra khớp plan hoặc bắt buộc có operator_reason.
    - Server-side validate toàn bộ frozen steps.
    - Đóng băng song song: workflow_proposals (frozen_plan) VÀ automation_workflows.
    - Ghi audit event 'approved' vào workflow_execution_events.
    """
    supabase = get_supabase_client()
    res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy workflow.")

    wf = res.data[0]
    current_status = wf.get("status")

    if current_status in ["running", "succeeded", "success", "approved"]:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể phê duyệt lại workflow đang ở trạng thái '{current_status}'."
        )
    if current_status in ["no_action", "needs_information", "invalid", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể phê duyệt: Workflow đang ở trạng thái không hợp lệ ('{current_status}')."
        )

    # 1. ĐỌC VÀ KIỂM TRA PROPOSAL_ID (FAIL-CLOSED)
    proposal_id = wf.get("proposal_id")
    if not proposal_id:
        raise HTTPException(
            status_code=400,
            detail="Không thể phê duyệt: Workflow thiếu liên kết 'proposal_id' (Provenance Chain bị đứt). "
                   "Vui lòng bấm Re-plan để tạo Proposal mới trước khi duyệt."
        )

    prop_res = supabase.table("workflow_proposals").select("*").eq("id", proposal_id).execute()
    if not prop_res.data:
        raise HTTPException(
            status_code=404,
            detail=f"Không tìm thấy proposal #{proposal_id} trong cơ sở dữ liệu."
        )

    proposal = prop_res.data[0]
    prop_status = proposal.get("status")

    # 2. KIỂM TRA TÍNH TOÀN VẸN CỦA PROPOSAL
    if prop_status == "superseded" or proposal.get("superseded_by"):
        raise HTTPException(
            status_code=400,
            detail=f"Không thể phê duyệt: Proposal #{proposal_id[:8]} đã bị thay thế (superseded). "
                   f"Vui lòng tải lại trang để làm việc với Proposal mới nhất."
        )
    if prop_status != "ready_for_review":
        raise HTTPException(
            status_code=400,
            detail=f"Proposal đang ở trạng thái '{prop_status}', chỉ có thể phê duyệt khi ở trạng thái 'ready_for_review'."
        )
    if not proposal.get("ticket_revision_id"):
        raise HTTPException(
            status_code=400,
            detail="Proposal bị lỗi: Thiếu ticket_revision_id tham chiếu."
        )

    # 3. KIỂM TRA NGƯỜI DUYỆT HỢP LỆ (@dtt.vn)
    approver = current_user_email
    logger.info(f"🔑 [AUTH VALIDATED] Người phê duyệt đã được xác thực qua JWT: {approver}")
    if not approver or not approver.endswith("@dtt.vn") or approver.lower().startswith(("admin@", "unknown@", "test@")):
        raise HTTPException(
            status_code=400,
            detail="Bắt buộc phải cung cấp danh tính người phê duyệt hợp lệ thuộc tổ chức (@dtt.vn)."
        )

    # 4. THU THẬP VÀ KIỂM TRA DANH SÁCH BƯỚC
    # The browser never supplies executable steps at approval time.  Any
    # operator edit must first pass the authenticated draft-update endpoint.
    raw_steps = wf.get("steps") or []
    step_objs = [WorkflowStepDraft(**s) for s in raw_steps]

    if not step_objs or len(step_objs) == 0:
        raise HTTPException(
            status_code=400,
            detail="Không thể phê duyệt workflow rỗng (0 bước thực thi)."
        )

    frozen_steps_dicts = [s.model_dump() for s in step_objs]

    # 5. ĐỐI SOÁT BƯỚC VỚI PLAN GỐC CỦA PROPOSAL
    proposal_plan = proposal.get("plan") or []
    steps_differ = False
    if len(proposal_plan) != len(frozen_steps_dicts):
        steps_differ = True
    else:
        for orig_s, cur_s in zip(proposal_plan, frozen_steps_dicts):
            if orig_s.get("step_id") != cur_s.get("step_id") or orig_s.get("capability_id") != cur_s.get("capability_id"):
                steps_differ = True
                break

    if steps_differ:
        op_reason = (
            payload.operator_reason or 
            (wf.get("ai_analysis") or {}).get("operator_reason")
        )
        if not op_reason or len(str(op_reason).strip()) < 5:
            raise HTTPException(
                status_code=400,
                detail="Các bước thực thi đã có sự can thiệp chỉnh sửa so với Proposal gốc do AI đề xuất. "
                       "Bắt buộc phải cung cấp 'operator_reason' (lý do can thiệp tối thiểu 5 ký tự) để phê duyệt."
            )

    # 6. SERVER-SIDE VALIDATION ĐỒ THỊ DAG
    val_result = workflow_planner_service.validate_workflow_graph(step_objs)
    if not val_result.is_valid:
        raise HTTPException(
            status_code=422,
            detail=f"Server-side Validation thất bại: {'; '.join(val_result.errors)}"
        )

    # 7. KIỂM TRA CHI TIẾT TỪNG CAPABILITY & INPUT RÀNG BUỘC
    for s in step_objs:
        cap_id = s.capability_id
        if not workflow_planner_service.is_capability_executable(cap_id):
            raise HTTPException(
                status_code=422,
                detail=f"Bước '{s.name}' yêu cầu capability '{cap_id}' hiện không khả dụng để thực thi "
                       f"(yêu cầu available=True và supported_by_handler=True)."
            )

        inputs = s.inputs or {}
        if cap_id in ["workspace.resolve_school", "workspace.bulk_account_creation"]:
            school = inputs.get("school_identifier") or inputs.get("school_name")
            if _is_empty_or_placeholder(school):
                raise HTTPException(status_code=422, detail=f"Bước '{s.name}': Thiếu tên trường học bắt buộc.")

        if cap_id == "lms.direct_enroll":
            courses = inputs.get("courses")
            if _is_empty_or_placeholder(courses):
                raise HTTPException(status_code=422, detail=f"Bước '{s.name}': Thiếu danh sách khóa học Moodle (courses).")

        if cap_id == "git.add_collaborators":
            repo_url = inputs.get("repo_url")
            target_role = inputs.get("target_role")
            if _is_empty_or_placeholder(repo_url):
                raise HTTPException(status_code=422, detail=f"Bước '{s.name}': Thiếu URL repository Git (repo_url).")
            if _is_empty_or_placeholder(target_role):
                raise HTTPException(status_code=422, detail=f"Bước '{s.name}': Thiếu vai trò Git (target_role). Nghiêm cấm dùng role mặc định.")

        if cap_id == "keycloak.reset_password":
            target_email = inputs.get("target_email")
            if _is_empty_or_placeholder(target_email) or "@" not in str(target_email):
                raise HTTPException(status_code=422, detail=f"Bước '{s.name}': Email người dùng không hợp lệ.")
            temp_pass = inputs.get("temporary_password")
            if _is_empty_or_placeholder(temp_pass) and not _is_valid_template_binding(temp_pass):
                raise HTTPException(
                    status_code=422,
                    detail=f"Bước '{s.name}': Quản trị viên bắt buộc phải nhập mật khẩu tạm thời cụ thể trước khi phê duyệt."
                )

    now_iso = datetime.now(timezone.utc).isoformat()

    # 8. Freeze proposal, workflow, and audit event in one database
    # transaction.  Separate PostgREST updates can leave an approved orphan.
    try:
        approval_res = supabase.rpc("approve_workflow_proposal", {
            "p_workflow_id": workflow_id,
            "p_proposal_id": proposal_id,
            "p_frozen_plan": frozen_steps_dicts,
            "p_approver": approver,
            "p_operator_reason": payload.operator_reason,
        }).execute()
        if not approval_res.data:
            raise RuntimeError("Approval transaction returned no row")
    except Exception as approval_err:
        logger.error("Atomic workflow approval failed: %s", approval_err)
        raise HTTPException(status_code=409, detail="Không thể phê duyệt do workflow/proposal vừa thay đổi; hãy tải lại.") from approval_err

    # Ghi log lịch sử workflow cũ để backward compatible
    try:
        supabase.table("automation_workflow_history").insert({
            "workflow_id": workflow_id,
            "field_changed": "status",
            "old_val": {"status": current_status},
            "new_val": {"status": "approved", "proposal_id": proposal_id, "steps_count": len(frozen_steps_dicts)},
            "changed_by": approver
        }).execute()
    except Exception as log_err:
        logger.warning(f"Lỗi ghi audit log approve: {log_err}")

    logger.info(f"🔒 [FROZEN PROPOSAL] Đã đóng băng an toàn Proposal #{proposal_id[:8]} và Workflow #{workflow_id[:8]} bởi '{approver}'!")

    # 9. KHỞI CHẠY NGẦM NẾU RUN_IMMEDIATELY
    if payload.run_immediately:
        background_tasks.add_task(workflow_executor_service.execute_approved_workflow, workflow_id)
        return {
            "status": "success", 
            "message": "🚀 Proposal đã được đóng băng và Workflow đang thực thi ngầm an toàn!",
            "workflow_id": workflow_id,
            "proposal_id": proposal_id
        }

    return {
        "status": "success", 
        "message": "Đã phê duyệt và đóng băng Proposal & Workflow thành công!", 
        "workflow_id": workflow_id,
        "proposal_id": proposal_id
    }


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


@router.post("/{workflow_id}/steps/{step_id}/retry")
async def retry_step(
    workflow_id: str, 
    step_id: str,
    background_tasks: BackgroundTasks,
    current_user_email: str = Depends(get_current_user_email),
):
    """Retry một bước bị lỗi."""
    background_tasks.add_task(workflow_executor_service.retry_workflow_step, workflow_id, step_id)
    return {"status": "success", "message": f"Đã lên lịch retry bước '{step_id}' chạy ngầm!"}


@router.post("/{workflow_id}/cancel")
async def cancel_workflow(
    workflow_id: str,
    current_user_email: str = Depends(get_current_user_email),
):
    """Hủy thực thi workflow."""
    supabase = get_supabase_client()
    supabase.table("automation_workflows").update({
        "status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", workflow_id).execute()
    return {"status": "success", "message": f"Đã hủy workflow #{workflow_id[:8]}."}
