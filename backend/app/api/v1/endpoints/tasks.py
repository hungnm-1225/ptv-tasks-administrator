# backend/app/api/v1/endpoints/tasks.py
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import pytz
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.core.supabase import get_supabase_client
from app.core.config import settings
from app.workers.bot_executor import execute_approved_bot_task
from app.services.workspace_lineage_service import workspace_lineage_service

logger = logging.getLogger(__name__)
router = APIRouter()

# Chuẩn hóa Múi giờ Việt Nam (GMT+7)
VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

def get_vn_time_str() -> str:
    """Trả về chuỗi thời gian định dạng YYYY-MM-DD HH:MM:SS theo giờ Việt Nam."""
    return datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")

def get_vn_iso() -> str:
    """Trả về chuỗi thời gian ISO theo giờ Việt Nam."""
    return datetime.now(VN_TZ).isoformat()

class ApproveTaskRequest(BaseModel):
    approval_status: str = "approved"
    edited_payload: Optional[Dict[str, Any]] = None


# =============================================================================
# HÀM CHẠY WORKER THẬT NGẦM DƯỚI NỀN (BACKGROUND WORKER)
# =============================================================================
async def run_approved_task_worker(task_id: str, bot_type: str, payload: dict, ticket_id: Optional[str]):
    """Thực thi Worker thật, ghi log GMT+7 và cập nhật trạng thái vào Supabase."""
    supabase = get_supabase_client()
    time_str = get_vn_time_str()
    
    # 1. Bổ sung thông tin Credentials phả hệ nếu là Workspace RPA
    if bot_type == "workspace_rpa":
        action = payload.get("action", "")
        if action in ["school_create_order", "partner_approve_order", "full_lineage_pipeline", "bulk_account_creation"]:
            school_ident = payload.get("school_name") or payload.get("school_id")
            if school_ident:
                lineage = workspace_lineage_service.resolve_by_school(school_ident)
                if lineage:
                    payload["school_credentials"] = lineage["school"]
                    payload["partner_credentials"] = lineage["partner"]
                    payload["distributor_credentials"] = lineage["distributor"]
                    payload["admin_credentials"] = {
                        "username": settings.TEST_ADMIN_USER,
                        "password": settings.TEST_ADMIN_PASS
                    }
                    payload["country_info"] = lineage.get("country", {})

    # 2. Cập nhật task sang 'running'
    log_trail = f"[{time_str}] [APPROVAL] Approved by Admin. Dispatching worker '{bot_type}'...\n"
    supabase.table("bot_automation_tasks").update({
        "execution_status": "running",
        "execution_logs": log_trail
    }).eq("id", task_id).execute()

    # 3. KÍCH HOẠT WORKER THỰC THI THẬT (ASYNC CHUẨN)
    try:
        execution_result = await execute_approved_bot_task(bot_type, payload)
        end_time_str = get_vn_time_str()
        
        # Nhận diện thành công linh hoạt (status success hoặc success_count > 0)
        is_success = (
            execution_result.get("status") in ["success", "simulated", "submitted", "completed"] 
            or execution_result.get("success_count", 0) > 0
        )
        
        if is_success:
            success_msg = execution_result.get("message") or execution_result.get("issue_url") or "Thực thi tác vụ thành công!"
            log_trail += f"[{end_time_str}] [SUCCESS] [{bot_type}]: {success_msg}\n"
            
            # Ghi log chi tiết từng tài khoản (nếu Keycloak hoặc Bot trả về)
            if "execution_logs" in execution_result:
                log_trail += f"\n{execution_result['execution_logs']}\n"
            elif "logs" in execution_result:
                log_trail += f"\n--- CHI TIẾT TIẾN TRÌNH ---\n{execution_result['logs']}\n"

            supabase.table("bot_automation_tasks").update({
                "execution_status": "success",
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

            # Cập nhật ticket gốc sang 'completed'
            if ticket_id:
                supabase.table("inbox_tickets").update({
                    "status": "completed",
                    "updated_at": get_vn_iso()
                }).eq("id", ticket_id).execute()
        else:
            err_msg = execution_result.get("error") or execution_result.get("message") or "Lỗi không xác định trong quá trình thực thi."
            log_trail += f"[{end_time_str}] [ERROR] [{bot_type}]: {err_msg}\n"
            
            if "execution_logs" in execution_result:
                log_trail += f"\n{execution_result['execution_logs']}\n"

            supabase.table("bot_automation_tasks").update({
                "execution_status": "failed",
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

    except Exception as e:
        end_time_str = get_vn_time_str()
        err_log = f"{log_trail}[{end_time_str}] [CRITICAL ERROR] [{bot_type}]: {str(e)}\n"
        logger.error(f"❌ Lỗi thực thi Task #{task_id}: {e}")
        supabase.table("bot_automation_tasks").update({
            "execution_status": "failed",
            "execution_logs": err_log,
            "executed_at": get_vn_iso()
        }).eq("id", task_id).execute()


# =============================================================================
# REST API ENDPOINTS
# =============================================================================

@router.get("", response_model=List[Dict[str, Any]])
@router.get("/", response_model=List[Dict[str, Any]])
async def list_tasks(approval_status: Optional[str] = None):
    """Lấy danh sách bot_automation_tasks THẬT từ Supabase kèm thông tin Ticket gốc."""
    try:
        supabase = get_supabase_client()
        query = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").order("created_at", desc=True)
        
        if approval_status and approval_status != "all":
            query = query.eq("approval_status", approval_status)
            
        res = query.execute()
        return res.data or []
    except Exception as e:
        logger.error(f"❌ Lỗi khi đọc bot_automation_tasks: {e}")
        return []


@router.post("", response_model=Dict[str, Any])
@router.post("/", response_model=Dict[str, Any])
async def create_task(payload: Dict[str, Any]):
    """Tạo tác vụ phê duyệt bot mới từ Unified Inbox (Ghi nhận giờ VN GMT+7)."""
    ticket_id = payload.get("ticket_id")
    bot_type = payload.get("bot_type", "keycloak_api")
    payload_data = payload.get("payload_data", {"action": "auto_triage", "ticket_id": ticket_id})
    
    try:
        supabase = get_supabase_client()
        time_str = get_vn_time_str()
        now_iso = get_vn_iso()
        
        res = supabase.table("bot_automation_tasks").insert({
            "ticket_id": ticket_id,
            "bot_type": bot_type,
            "payload_data": payload_data,
            "approval_status": "pending",
            "execution_status": "queued",
            "execution_logs": f"[{time_str}] [INFO] Task queued by Admin. Standing by for approval.",
            "created_at": now_iso
        }).execute()
        
        return {"status": "success", "data": res.data[0] if res.data else {}}
    except Exception as e:
        logger.error(f"❌ Lỗi tạo bot task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{task_id}/approve")
async def approve_task(task_id: str, req: ApproveTaskRequest, background_tasks: BackgroundTasks):
    """Phê duyệt và đẩy vào Background Task để chạy Worker THẬT (Playwright/Keycloak/GitHub)."""
    supabase = get_supabase_client()
    time_str = get_vn_time_str()
    now_iso = get_vn_iso()
    
    task_res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tương ứng!")

    task = task_res.data[0]
    ticket = task.get("inbox_tickets") or {}
    bot_type = task.get("bot_type")
    payload = req.edited_payload if req.edited_payload is not None else (task.get("payload_data") or {})
    ticket_id = ticket.get("id") or task.get("ticket_id")

    # 1. Cập nhật ngay trạng thái duyệt trong Database
    supabase.table("bot_automation_tasks").update({
        "payload_data": payload,
        "approval_status": "approved",
        "execution_status": "queued",
        "execution_logs": f"[{time_str}] [INFO] [{bot_type}]: Task approved by Admin. Queuing real worker for execution...",
        "executed_at": now_iso
    }).eq("id", task_id).execute()

    # 2. Đẩy Worker thật vào Background Task chạy ngầm
    background_tasks.add_task(run_approved_task_worker, task_id, bot_type, payload, ticket_id)

    logger.info(f"✅ Đã phê duyệt và điều phối Worker thật cho Task #{task_id[:8]} ({bot_type})")
    return {"status": "success", "message": f"Đã phê duyệt thành công tác vụ #{task_id[:8]}. Worker đang chạy ngầm dưới nền!"}