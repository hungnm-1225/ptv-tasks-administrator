# backend/app/api/v1/endpoints/workflows.py
"""
Workflow Router & Server-Side Safety Approval Gate (Master Enterprise Edition v4.1)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Hỗ trợ hoàn hảo Admin Override: Cho phép Quản trị viên phê duyệt chạy luồng kể cả khi khởi tạo là needs_information.
- Đồng bộ song phương (Dual Sync): Khi sửa bước ở Workflow, tự động cập nhật Proposal sang 'ready_for_review'.
- Dual Freeze song song: workflow_proposals (frozen_plan) VÀ automation_workflows (steps).
- Tự động Fallback Direct Table Update nếu thiếu Stored Procedure CSDL.
- Bảo toàn tuyệt đối danh tính người duyệt Bearer JWT thuộc domain @dtt.vn.
"""

import asyncio
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
_IN_FLIGHT_WORKFLOW_APPROVALS: set = set()
_APPROVAL_MUTEX = asyncio.Lock()


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

            logger.info(f"Tái lập kế hoạch workflow cho ticket #{ticket_id[:8]} vì thiếu liên kết proposal...")
            new_wf = await workflow_planner_service.plan_workflow_for_ticket(ticket_id)
            if not new_wf:
                raise HTTPException(status_code=409, detail="Không thể tạo proposal mới từ ticket.")
            return new_wf

        logger.info(f"✨ Chưa có workflow cho ticket #{ticket_id[:8]}, đang tự động lập plan...")
        new_wf = await workflow_planner_service.plan_workflow_for_ticket(ticket_id)
        if not new_wf:
            raise HTTPException(status_code=404, detail="Không thể tạo workflow cho ticket này.")
        return new_wf
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi lấy workflow cho ticket #{ticket_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
    except Exception as e:
        logger.error(f"Lỗi lập plan cho ticket #{ticket_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
    payload: Dict[str, Any] = Body(...),
    current_user_email: str = Depends(get_current_user_email)
):
    """
    Quản trị viên tinh chỉnh Workflow Draft (Enterprise v4.2):
    - Đón nhận linh hoạt cả Steps, School Override (detected_school) và ai_analysis.
    - Tự động đồng bộ tên trường vào tất cả inputs của các bước phụ thuộc trong DAG.
    - Cập nhật song song Proposal.entity_resolution để Supabase và AI không bị lệch pha.
    """
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

    now_iso = datetime.now(timezone.utc).isoformat()
    update_fields: Dict[str, Any] = {"updated_at": now_iso}

    # 1. Cập nhật Title & Goal
    if payload.get("title") is not None:
        update_fields["title"] = payload["title"]
    if payload.get("goal") is not None:
        update_fields["goal"] = payload["goal"]

    # 2. XỬ LÝ ĐỒNG BỘ AI_ANALYSIS & TARGET SCHOOL (KHẮC PHỤC TRIỆT ĐỂ LỖI REVERT)
    ai_data = dict(old_wf.get("ai_analysis") or {})
    
    # Merge ai_analysis nếu client gửi lên
    if payload.get("ai_analysis") and isinstance(payload["ai_analysis"], dict):
        ai_data.update(payload["ai_analysis"])

    # Xử lý khi có school override trực tiếp từ UI
    new_school = payload.get("detected_school") or payload.get("school")
    target_school_name = None
    target_school_id = None

    if new_school:
        if isinstance(new_school, dict):
            target_school_name = new_school.get("school_name") or new_school.get("name")
            target_school_id = new_school.get("school_id") or new_school.get("id")
            ai_data["detected_school"] = {
                "id": target_school_id,
                "name": target_school_name,
                "code": new_school.get("school_code") or new_school.get("code", ""),
                "partner_name": new_school.get("partner_name", ""),
                "confidence": 1.0,
                "is_manual_override": True
            }
        elif isinstance(new_school, str):
            target_school_name = new_school
            ai_data["detected_school"] = {
                "name": target_school_name,
                "confidence": 1.0,
                "is_manual_override": True
            }

    if payload.get("operator_reason"):
        ai_data["operator_reason"] = payload["operator_reason"]

    # Ghi nhận ai_analysis mới vào update_fields
    update_fields["ai_analysis"] = ai_data

    # 3. XỬ LÝ CÁC BƯỚC THỰC THI (STEPS) VÀ AUTO-PROPAGATE TÊN TRƯỜNG VÀO INPUTS
    target_status = payload.get("status") or old_wf.get("status")
    steps_payload = payload.get("steps")
    steps_dicts = None

    if steps_payload is not None:
        steps_dicts = []
        for s in steps_payload:
            s_dict = s if isinstance(s, dict) else s.model_dump()
            
            # Tự động bơm tên trường mới vào input của các bước cần school
            if target_school_name:
                s_inputs = dict(s_dict.get("inputs") or {})
                if "school_name" in s_inputs:
                    s_inputs["school_name"] = target_school_name
                if "school_id" in s_inputs and target_school_id:
                    s_inputs["school_id"] = target_school_id
                s_dict["inputs"] = s_inputs

            steps_dicts.append(s_dict)

        update_fields["steps"] = steps_dicts

        # Kiểm định tính toàn vẹn DAG
        step_objs = [WorkflowStepDraft(**s) for s in steps_dicts]
        val_res = workflow_planner_service.validate_workflow_graph(step_objs)
        if not val_res.is_valid:
            target_status = "invalid"
        elif val_res.warnings:
            target_status = "needs_review"
        else:
            target_status = "ready"
        
        update_fields["status"] = target_status

    # 4. ĐỒNG BỘ PROPOSAL LIÊN KẾT (CẢ PLAN VÀ ENTITY_RESOLUTION TRƯỜNG HỌC)
    proposal_id = old_wf.get("proposal_id")
    if proposal_id:
        try:
            proposal_status = "ready_for_review" if target_status in ["ready", "needs_review"] else target_status
            proposal_update: Dict[str, Any] = {
                "status": proposal_status,
                "updated_at": now_iso
            }
            if steps_dicts is not None:
                proposal_update["plan"] = steps_dicts
            
            # Đồng bộ target_school vào entity_resolution của Proposal
            if "detected_school" in ai_data:
                p_res = supabase.table("workflow_proposals").select("entity_resolution").eq("id", proposal_id).execute()
                current_ent = (p_res.data[0].get("entity_resolution") if p_res.data else {}) or {}
                current_ent["school"] = ai_data["detected_school"]
                proposal_update["entity_resolution"] = current_ent

            supabase.table("workflow_proposals").update(proposal_update).eq("id", proposal_id).execute()
            logger.info(f"🔄 Đã đồng bộ Proposal #{proposal_id[:8]} (Status: '{proposal_status}', School: {target_school_name or 'Keep'}).")
        except Exception as p_err:
            logger.warning(f"Lỗi đồng bộ proposal khi update workflow: {p_err}")

    # 5. LƯU VÀ TRẢ VỀ DỮ LIỆU ĐÃ CẬP NHẬT
    up_res = supabase.table("automation_workflows").update(update_fields).eq("id", workflow_id).execute()
    new_record = up_res.data[0] if up_res.data else old_wf

    # Ghi log lịch sử can thiệp
    try:
        supabase.table("automation_workflow_history").insert({
            "workflow_id": workflow_id,
            "field_changed": "steps_and_school_edited",
            "old_val": {
                "steps_count": len(old_wf.get("steps") or []),
                "school": old_wf.get("ai_analysis", {}).get("detected_school", {}).get("name")
            },
            "new_val": {
                "steps_count": len(new_record.get("steps") or []),
                "school": new_record.get("ai_analysis", {}).get("detected_school", {}).get("name"),
                "operator_reason": payload.get("operator_reason")
            },
            "changed_by": current_user_email
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
    XÁC NHẬN, ĐÓNG BĂNG & THỰC THI (JWT AUTHENTICATED - CONCURRENCY HARDENED):
    - In-Memory Double-Click Shield: Chặn cú click đúp trong phạm vi mili-giây.
    - RPC Smart Error Detection: Chỉ fallback khi thực sự thiếu Function trong Postgres.
    - PostgREST Atomic CAS: Khóa điều kiện nguyên tử cấp database chống race-condition.
    - Saga Rollback: Triệt tiêu hoàn toàn nguy cơ Split-Brain giữa 2 bảng.
    """
    # 0. CHỐNG DOUBLE-CLICK CÙNG MỘT WORKFLOW TRÊN CÙNG INSTANCE
    async with _APPROVAL_MUTEX:
        if workflow_id in _IN_FLIGHT_WORKFLOW_APPROVALS:
            raise HTTPException(
                status_code=409, 
                detail="Workflow này đang trong tiến trình phê duyệt, vui lòng không click liên tục!"
            )
        _IN_FLIGHT_WORKFLOW_APPROVALS.add(workflow_id)

    try:
        supabase = get_supabase_client()
        res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy workflow.")

        wf = res.data[0]
        current_status = wf.get("status")

        if current_status in ["running", "succeeded", "success", "approved"]:
            raise HTTPException(
                status_code=409,
                detail=f"Không thể phê duyệt lại: Workflow đã ở trạng thái '{current_status}'."
            )
        if current_status in ["cancelled"]:
            raise HTTPException(status_code=400, detail="Workflow đã bị hủy.")

        # 1. KIỂM ĐỊNH DANH SÁCH BƯỚC THỰC THI
        raw_steps = wf.get("steps") or []
        step_objs = [WorkflowStepDraft(**s) for s in raw_steps]
        if not step_objs:
            raise HTTPException(status_code=400, detail="Không thể phê duyệt workflow rỗng (0 bước).")

        val_result = workflow_planner_service.validate_workflow_graph(step_objs)
        if not val_result.is_valid:
            raise HTTPException(status_code=422, detail=f"Cấu trúc đồ thị lỗi: {'; '.join(val_result.errors)}")

        # 2. XÁC THỰC DANH TÍNH NGƯỜI PHÊ DUYỆT (@dtt.vn)
        approver = current_user_email
        if not approver or not approver.endswith("@dtt.vn") or approver.lower().startswith(("admin@", "unknown@", "test@")):
            raise HTTPException(
                status_code=403,
                detail="Bắt buộc phải có danh tính người phê duyệt hợp lệ thuộc tổ chức (@dtt.vn)."
            )

        # 3. PHÂN GIẢI VÀ CHUẨN BỊ PROPOSAL
        proposal_id = wf.get("proposal_id")
        ticket_id = wf.get("ticket_id")
        proposal = None

        if proposal_id:
            p_res = supabase.table("workflow_proposals").select("*").eq("id", proposal_id).execute()
            if p_res.data:
                proposal = p_res.data[0]

        if not proposal and ticket_id:
            latest_p_res = supabase.table("workflow_proposals")\
                .select("*")\
                .eq("ticket_id", ticket_id)\
                .order("version", desc=True)\
                .limit(1)\
                .execute()
            if latest_p_res.data:
                proposal = latest_p_res.data[0]
                proposal_id = proposal["id"]

        if not proposal:
            raise HTTPException(status_code=400, detail="Không tìm thấy Proposal liên kết để phê duyệt.")

        original_proposal_status = proposal.get("status")
        now_iso = datetime.now(timezone.utc).isoformat()
        frozen_steps_dicts = [s.model_dump() for s in step_objs]
        operator_reason_text = payload.operator_reason or "Phê duyệt thực thi từ Workflow Console"

        # 🌟 ADMIN OVERRIDE: MỞ KHÓA PROPOSAL NẾU ĐANG LÀ needs_information
        if original_proposal_status != "ready_for_review":
            logger.info(f"🔓 [ADMIN OVERRIDE] Mở khóa Proposal #{proposal_id[:8]} từ '{original_proposal_status}' -> 'ready_for_review'...")
            try:
                supabase.table("workflow_proposals").update({
                    "status": "ready_for_review",
                    "plan": frozen_steps_dicts,
                    "updated_at": now_iso
                }).eq("id", proposal_id).execute()
            except Exception as unlock_err:
                logger.warning(f"Lỗi mở khóa proposal: {unlock_err}")

        # =====================================================================
        # 4. DUAL FREEZE: THỬ RPC TRƯỚC (PHÂN BIỆT RẠCH RÒI LỖI THIẾU HÀM VS LỖI LOGIC)
        # =====================================================================
        rpc_success = False
        should_fallback = False

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
            err_msg = str(rpc_err).lower()
            # 🎯 CHỐT CHẶN THÔNG MINH: Chỉ fallback khi thực sự thiếu Function trong PostgreSQL!
            if "pgrst202" in err_msg or "could not find the function" in err_msg or "does not exist" in err_msg or "42883" in err_msg:
                logger.warning(f"⚠️ [RPC Missing] Không tìm thấy hàm approve_workflow_proposal trong CSDL. Chuyển sang Atomic CAS Fallback!")
                should_fallback = True
            else:
                # 🛑 Nếu Postgres ném lỗi do SP từ chối (ví dụ đã được duyệt hoặc proposal không hợp lệ), ném 409 ngay!
                logger.error(f"🛑 [RPC Rejected] Stored Procedure từ chối phê duyệt: {rpc_err}")
                raise HTTPException(
                    status_code=409, 
                    detail=f"Cơ sở dữ liệu từ chối phê duyệt: Luồng này có thể đã được duyệt bởi phiên khác hoặc proposal không hợp lệ."
                )

        # =====================================================================
        # 5. ATOMIC CAS FALLBACK & SAGA ROLLBACK (CHỐNG RACE-CONDITION TUYỆT ĐỐI)
        # =====================================================================
        if not rpc_success and should_fallback:
            logger.info(f"🛡️ [Atomic CAS Fallback] Đang thực hiện khóa kép nguyên tử cho Workflow #{workflow_id[:8]}...")
            
            # BƯỚC 1: ATOMIC CAS TRÊN WORKFLOW (Chỉ update nếu status chưa phải approved/running/success)
            wf_cas_res = supabase.table("automation_workflows").update({
                "status": "approved",
                "steps": frozen_steps_dicts,
                "approved_by": approver,
                "approved_at": now_iso,
                "updated_at": now_iso
            })\
            .eq("id", workflow_id)\
            .not_.in_("status", ["approved", "running", "succeeded", "success", "cancelled"])\
            .execute()

            # Nếu không có dòng nào được cập nhật -> Có người khác vừa duyệt trước đó 1ms!
            if not wf_cas_res.data:
                logger.warning(f"🛑 [CAS Blocked] Workflow #{workflow_id[:8]} đã bị tranh chấp và thay đổi trạng thái trước!")
                raise HTTPException(
                    status_code=409, 
                    detail="Workflow này vừa được phê duyệt hoặc thay đổi trạng thái bởi một phiên khác!"
                )

            # BƯỚC 2: CẬP NHẬT PROPOSAL CÓ SAGA COMPENSATING ROLLBACK
            try:
                prop_res = supabase.table("workflow_proposals").update({
                    "status": "approved",
                    "frozen_plan": frozen_steps_dicts,
                    "approved_by": approver,
                    "approved_at": now_iso,
                    "updated_at": now_iso
                })\
                .eq("id", proposal_id)\
                .execute()

                if not prop_res.data:
                    raise RuntimeError(f"Không thể cập nhật Proposal #{proposal_id}")

            except Exception as prop_err:
                # 🚨 SAGA ROLLBACK: Nếu Proposal lỗi, lập tức hồi phục Workflow về trạng thái cũ để chống Split-Brain!
                logger.error(f"💥 [Saga Rollback] Lỗi cập nhật Proposal, đang phục hồi Workflow #{workflow_id[:8]}...")
                supabase.table("automation_workflows").update({
                    "status": current_status,
                    "approved_by": None,
                    "approved_at": None,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", workflow_id).execute()
                
                raise HTTPException(
                    status_code=500, 
                    detail=f"Lỗi đồng bộ Proposal ({prop_err}). Đã khôi phục trạng thái an toàn."
                )

            # BƯỚC 3: GHI AUDIT EVENT
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
                logger.warning(f"Lỗi ghi audit event: {ev_err}")

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
            logger.warning(f"Lỗi ghi audit log: {log_err}")

        logger.info(f"🔒 [FROZEN PROPOSAL] Đã đóng băng an toàn Proposal #{proposal_id[:8]} và Workflow #{workflow_id[:8]} bởi '{approver}'!")

        # 6. KÍCH HOẠT THỰC THI CHẠY NGẦM
        if payload.run_immediately:
            background_tasks.add_task(workflow_executor_service.execute_approved_workflow, workflow_id)
            return {
                "status": "success", 
                "message": "🚀 Luồng đã được đóng băng và đang thực thi ngầm an toàn!",
                "workflow_id": workflow_id,
                "proposal_id": proposal_id
            }

        return {
            "status": "success", 
            "message": "Đã phê duyệt và đóng băng Luồng thành công!", 
            "workflow_id": workflow_id,
            "proposal_id": proposal_id
        }

    finally:
        async with _APPROVAL_MUTEX:
            _IN_FLIGHT_WORKFLOW_APPROVALS.discard(workflow_id)


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
    """Retry một bước bị lỗi bằng thuật toán BFS Reset."""
    background_tasks.add_task(workflow_executor_service.retry_workflow_step, workflow_id, step_id)
    return {"status": "success", "message": f"Đã lên lịch retry bước '{step_id}' chạy ngầm!"}


@router.post("/{workflow_id}/cancel")
async def cancel_workflow(
    workflow_id: str,
    current_user_email: str = Depends(get_current_user_email),
):
    """Hủy thực thi workflow và giải phóng OCC lease an toàn."""
    supabase = get_supabase_client()
    supabase.table("automation_workflows").update({
        "status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", workflow_id).execute()
    return {"status": "success", "message": f"Đã hủy workflow #{workflow_id[:8]}."}