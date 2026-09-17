# backend/app/api/v1/endpoints/workflows.py
"""
Workflow Router & Server-Side Safety Approval Gate (Master Enterprise Edition v4.0)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Auto-Healing Provenance Sync: Tự động phát hiện và đồng bộ sang Proposal mới nhất nếu bản cũ bị superseded.
- Bỏ qua các bản ghi workflow 'archived' khi truy vấn theo ticket_id.
- Phê duyệt và đóng băng song song (Dual Freeze) qua Stored Procedure nguyên tử.
- Bảo toàn tuyệt đối danh tính người duyệt Bearer JWT thuộc domain @dtt.vn.
"""
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
    """Lấy Workflow hợp lệ mới nhất của ticket (Bỏ qua các bản ghi đã bị archived)."""
    supabase = get_supabase_client()
    try:
        # 🎯 CHỐT CHẶN 1: BỎ QUA CÁC BẢN GHI ARCHIVED ĐỂ KHÔNG BAO GIỜ NẠP BẢN CŨ VÀO MODAL
        res = supabase.table("automation_workflows")\
            .select("*")\
            .eq("ticket_id", ticket_id)\
            .neq("status", "archived")\
            .order("version", desc=True)\
            .limit(1)\
            .execute()

        if res.data and len(res.data) > 0:
            existing = res.data[0]
            if existing.get("proposal_id") and existing.get("status") != "requires_reapproval":
                return existing

            logger.info(
                "Tái lập kế hoạch workflow #%s cho ticket #%s vì thiếu liên kết proposal hợp lệ.",
                str(existing.get("id", ""))[:8],
                ticket_id[:8],
            )
            new_wf = await workflow_planner_service.plan_workflow_for_ticket(ticket_id)
            if not new_wf:
                raise HTTPException(
                    status_code=409,
                    detail="Không thể tạo proposal mới từ revision hiện tại của ticket.",
                )
            return new_wf

        logger.info(f"✨ Chưa có workflow hợp lệ cho ticket #{ticket_id[:8]}, đang tự động lập plan...")
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
    - Tự động chữa lành (Auto-Healing): Kết nối sang Proposal mới nhất còn hiệu lực.
    - Hỗ trợ cả RPC Stored Procedure lẫn Fallback Direct Table Update nếu thiếu hàm CSDL.
    - Đóng băng song song: workflow_proposals (frozen_plan) VÀ automation_workflows.
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

    # 1. ĐỌC VÀ KIỂM TRA PROPOSAL_ID
    proposal_id = wf.get("proposal_id")
    ticket_id = wf.get("ticket_id")

    # TỰ ĐỘNG TÌM PROPOSAL HỢP LỆ NẾU CŨ BỊ SUPERSEDED
    proposal = None
    if proposal_id:
        p_res = supabase.table("workflow_proposals").select("*").eq("id", proposal_id).execute()
        if p_res.data:
            p_data = p_res.data[0]
            if p_data.get("status") == "ready_for_review" and not p_data.get("superseded_by"):
                proposal = p_data

    if not proposal and ticket_id:
        latest_p_res = supabase.table("workflow_proposals")\
            .select("*")\
            .eq("ticket_id", ticket_id)\
            .eq("status", "ready_for_review")\
            .is_("superseded_by", "null")\
            .order("version", desc=True)\
            .limit(1)\
            .execute()

        if latest_p_res.data:
            proposal = latest_p_res.data[0]
            proposal_id = proposal["id"]
            supabase.table("automation_workflows").update({
                "proposal_id": proposal_id,
                "status": "ready"
            }).eq("id", workflow_id).execute()

    if not proposal:
        raise HTTPException(
            status_code=400,
            detail="Không tìm thấy Proposal hợp lệ ở trạng thái 'ready_for_review'. Vui lòng bấm 'AI Đánh giá lại ý định' để tạo Proposal mới."
        )

    # 2. XÁC THỰC NGƯỜI DUYỆT
    approver = current_user_email
    if not approver or not approver.endswith("@dtt.vn") or approver.lower().startswith(("admin@", "unknown@", "test@")):
        raise HTTPException(
            status_code=400,
            detail="Bắt buộc phải cung cấp danh tính người phê duyệt hợp lệ thuộc tổ chức (@dtt.vn)."
        )

    # 3. THU THẬP DANH SÁCH BƯỚC
    raw_steps = wf.get("steps") or []
    step_objs = [WorkflowStepDraft(**s) for s in raw_steps]
    if not step_objs or len(step_objs) == 0:
        raise HTTPException(status_code=400, detail="Không thể phê duyệt workflow rỗng (0 bước).")

    frozen_steps_dicts = [s.model_dump() for s in step_objs]

    # 4. SERVER-SIDE VALIDATION
    val_result = workflow_planner_service.validate_workflow_graph(step_objs)
    if not val_result.is_valid:
        raise HTTPException(status_code=422, detail=f"Validation thất bại: {'; '.join(val_result.errors)}")

    now_iso = datetime.now(timezone.utc).isoformat()
    operator_reason_text = payload.operator_reason or "Phê duyệt thực thi tự động từ Console"

    # 5. 🎯 DUAL FREEZE THÔNG MINH: GỌI RPC, NẾU THIẾU HÀM (PGRST202) -> FALLBACK TỰ ĐỘNG CẬP NHẬT BẢNG!
    rpc_success = False
    try:
        approval_res = supabase.rpc("approve_workflow_proposal", {
            "p_workflow_id": workflow_id,
            "p_proposal_id": proposal_id,
            "p_frozen_plan": frozen_steps_dicts,
            "p_approver": approver,
            "p_operator_reason": operator_reason_text,
        }).execute()
        if approval_res.data:
            rpc_success = True
    except Exception as rpc_err:
        err_msg = str(rpc_err)
        if "PGRST202" in err_msg or "Could not find the function" in err_msg:
            logger.warning("⚠️ [Supabase RPC Missing] Hàm approve_workflow_proposal chưa tạo trong CSDL. Tự động kích hoạt Fallback Direct Update!")
        else:
            logger.error(f"❌ [Approval RPC Failed]: {err_msg}")
            raise HTTPException(status_code=409, detail=f"Lỗi phê duyệt CSDL: {err_msg}") from rpc_err

    # Nếu RPC chưa tạo trong Supabase -> Tự động đóng băng qua Table Update (Không để hệ thống bị tắc nghẽn!)
    if not rpc_success:
        try:
            # Đóng băng Proposal
            supabase.table("workflow_proposals").update({
                "status": "approved",
                "frozen_plan": frozen_steps_dicts,
                "approved_by": approver,
                "approved_at": now_iso,
                "updated_at": now_iso
            }).eq("id", proposal_id).execute()

            # Đóng băng Workflow
            supabase.table("automation_workflows").update({
                "status": "approved",
                "steps": frozen_steps_dicts,
                "approved_by": approver,
                "approved_at": now_iso,
                "updated_at": now_iso
            }).eq("id", workflow_id).execute()

            # Ghi nhận Audit Event
            try:
                supabase.table("workflow_execution_events").insert({
                    "proposal_id": proposal_id,
                    "workflow_id": workflow_id,
                    "step_id": "workflow_approval",
                    "event_type": "approved",
                    "actor": approver,
                    "inputs": {"steps_count": len(frozen_steps_dicts)},
                    "outputs": {"proposal_id": proposal_id, "operator_reason": operator_reason_text},
                    "created_at": now_iso
                }).execute()
            except Exception as ev_err:
                logger.warning(f"Lỗi ghi workflow_execution_events: {ev_err}")

        except Exception as table_err:
            logger.error(f"❌ [Fallback Update Failed]: {table_err}")
            raise HTTPException(status_code=500, detail=f"Lỗi lưu trữ phê duyệt: {str(table_err)}")

    # Ghi log lịch sử workflow
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

    # 6. KHỞI CHẠY NGẦM NẾU RUN_IMMEDIATELY
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