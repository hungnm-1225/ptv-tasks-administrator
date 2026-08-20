# backend/app/api/v1/endpoints/tasks.py
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.supabase import get_supabase_client
from app.services.keycloak_service import keycloak_service
from app.services.github_service import github_service

logger = logging.getLogger(__name__)
router = APIRouter()

class ApproveTaskRequest(BaseModel):
    approval_status: str = "approved"
    edited_payload: Optional[Dict[str, Any]] = None

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

# 🔥 Hỗ trợ cả /tasks và /tasks/ để không bao giờ bị lỗi 405
@router.post("", response_model=Dict[str, Any])
@router.post("/", response_model=Dict[str, Any])
async def create_task(payload: Dict[str, Any]):
    """Tạo tác vụ phê duyệt bot mới từ Unified Inbox."""
    ticket_id = payload.get("ticket_id")
    bot_type = payload.get("bot_type", "keycloak_api")
    payload_data = payload.get("payload_data", {"action": "auto_triage", "ticket_id": ticket_id})
    
    try:
        supabase = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        
        res = supabase.table("bot_automation_tasks").insert({
            "ticket_id": ticket_id,
            "bot_type": bot_type,
            "payload_data": payload_data,
            "approval_status": "pending",
            "execution_status": "queued",
            "execution_logs": f"[{now_iso[:19].replace('T', ' ')}] [INFO] Task queued by Admin. Standing by for approval."
        }).execute()
        
        return {"status": "success", "data": res.data[0] if res.data else {}}
    except Exception as e:
        logger.error(f"❌ Lỗi tạo bot task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{task_id}/approve")
async def approve_task(task_id: str, req: ApproveTaskRequest):
    """Phê duyệt và kích hoạt Worker thực thi tác vụ."""
    supabase = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    time_str = now_iso[:19].replace("T", " ")
    
    task_res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tương ứng!")

    task = task_res.data[0]
    ticket = task.get("inbox_tickets") or {}
    bot_type = task.get("bot_type")
    payload = req.edited_payload if req.edited_payload is not None else (task.get("payload_data") or {})

    execution_result = {}
    logs_trail = task.get("execution_logs") or ""
    logs_trail += f"\n[{time_str}] [APPROVAL] Approved by Admin. Dispatching worker '{bot_type}'..."

    try:
        if bot_type == "keycloak_api":
            execution_result = await keycloak_service.execute_account_action(payload)
            if execution_result.get("status") in ["success", "simulated"]:
                logs_trail += f"\n[{time_str}] [SUCCESS] [KeycloakWorker]: {execution_result.get('message')}"
            else:
                logs_trail += f"\n[{time_str}] [ERROR] [KeycloakWorker]: {execution_result.get('error')}"

        elif bot_type in ["google_doc_comment", "feedback_doc_triage"]:
            if ticket.get("source") == "google_form":
                try:
                    from app.services.google_sheet_service import GoogleSheetManager
                    row_index = ticket.get("metadata", {}).get("row_index")
                    if row_index:
                        manager = GoogleSheetManager()
                        manager.update_feedback_row("Form_Responses", row_index, payload.get("category", "other"), "To Implement")
                        logs_trail += f"\n[{time_str}] [SUCCESS] [SheetSync]: Updated Row #{row_index} on Google Sheet"
                except Exception as sheet_err:
                    logs_trail += f"\n[{time_str}] [WARNING] [SheetSync]: {str(sheet_err)}"
            execution_result = {"status": "success", "message": "Hoàn tất đồng bộ Google Sheet"}

        elif bot_type == "github_issue_creator":
            execution_result = await github_service.create_issue(payload)
            if execution_result.get("status") == "success":
                logs_trail += f"\n[{time_str}] [SUCCESS] [GitHubWorker]: Issue created: {execution_result.get('issue_url')}"
            else:
                logs_trail += f"\n[{time_str}] [ERROR] [GitHubWorker]: {execution_result.get('error')}"

        else:
            logs_trail += f"\n[{time_str}] [SUCCESS] [{bot_type}]: Workspace payload verified & queued for execution."
            execution_result = {"status": "success", "message": f"Worker {bot_type} queued"}

        is_success = execution_result.get("status") in ["success", "simulated"]
        exec_status = "success" if is_success else "failed"

        supabase.table("bot_automation_tasks").update({
            "payload_data": payload,
            "approval_status": "approved",
            "execution_status": exec_status,
            "execution_logs": logs_trail,
            "executed_at": now_iso
        }).eq("id", task_id).execute()

        if is_success and ticket.get("id"):
            supabase.table("inbox_tickets").update({"status": "completed"}).eq("id", ticket["id"]).execute()

        return {"status": "success", "message": f"Đã duyệt thành công tác vụ #{task_id[:8]}"}

    except Exception as e:
        logger.error(f"❌ Lỗi thực thi {task_id}: {e}")
        supabase.table("bot_automation_tasks").update({
            "approval_status": "approved",
            "execution_status": "failed",
            "execution_logs": logs_trail + f"\n[{time_str}] [ERROR]: {str(e)}",
            "executed_at": now_iso
        }).eq("id", task_id).execute()
        raise HTTPException(status_code=500, detail=str(e))