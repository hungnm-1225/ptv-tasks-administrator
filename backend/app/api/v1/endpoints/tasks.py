# backend/app/api/v1/endpoints/tasks.py
import logging
import os
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import pytz
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.supabase import get_supabase_client
from app.workers.bot_executor import execute_approved_bot_task
from app.services.cof_excel_service import COFExcelService

logger = logging.getLogger(__name__)
router = APIRouter()

class ApproveTaskRequest(BaseModel):
    approval_status: str = "approved"
    edited_payload: Optional[Dict[str, Any]] = None

@router.get("/", response_model=List[Dict[str, Any]])
async def list_tasks(approval_status: Optional[str] = None):
    """Lấy danh sách bot_automation_tasks từ Supabase kèm thông tin Ticket gốc."""
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

@router.put("/{task_id}/approve")
async def approve_task(task_id: str, req: ApproveTaskRequest):
    """Phê duyệt tác vụ: Kích hoạt nộp file hoặc chạy worker tương ứng."""
    supabase = get_supabase_client()
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    now_vn = datetime.now(pytz.timezone('Asia/Ho_Chi_Minh')).strftime("%Y-%m-%d %H:%M:%S")
    
    task_res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tương ứng!")

    task = task_res.data[0]
    ticket = task.get("inbox_tickets") or {}
    bot_type = task.get("bot_type")
    payload = req.edited_payload if req.edited_payload is not None else (task.get("payload_data") or {})

    logs_trail = task.get("execution_logs") or ""
    logs_trail += f"\n[{now_vn}] [APPROVAL] Approved by Admin. Executing '{bot_type}'..."

    try:
        # A. XỬ LÝ WORKSPACE RPA - BULK ACCOUNT CREATION
        if bot_type == "workspace_rpa" and payload.get("action") == "bulk_account_creation":
            # 1. Gọi Pha 1 nộp file lên School Workspace
            exec_res = await execute_approved_bot_task(bot_type, payload)
            
            if exec_res.get("status") == "submitted":
                request_id = exec_res["request_id"]
                est_wait = exec_res["estimated_wait_seconds"]
                next_check_at = (now_utc + timedelta(seconds=est_wait)).isoformat()

                payload["request_id"] = request_id
                payload["next_check_at"] = next_check_at

                logs_trail += f"\n[{now_vn}] [INFO] [workspace_rpa]: Đã nộp file tạo tài khoản (Request #{request_id}). Hẹn kiểm tra lần đầu sau {est_wait//60} phút."

                supabase.table("bot_automation_tasks").update({
                    "payload_data": payload,
                    "approval_status": "approved",
                    "execution_status": "waiting_poll",
                    "execution_logs": logs_trail
                }).eq("id", task_id).execute()

                return {
                    "status": "success",
                    "message": f"Đã nộp thành công Request #{request_id}. Hệ thống sẽ tự động theo dõi ngầm!",
                    "request_id": request_id
                }
            else:
                logs_trail += f"\n[{now_vn}] [ERROR] [workspace_rpa]: {exec_res.get('error')}"
                supabase.table("bot_automation_tasks").update({
                    "approval_status": "approved",
                    "execution_status": "failed",
                    "execution_logs": logs_trail
                }).eq("id", task_id).execute()
                raise HTTPException(status_code=500, detail=exec_res.get("error"))

        # B. CÁC BOT KHÁC (Keycloak, GitHub, Order, Enroll...)
        else:
            exec_res = await execute_approved_bot_task(bot_type, payload)
            is_success = exec_res.get("status") in ["success", "simulated", "completed"]
            exec_status = "success" if is_success else "failed"

            logs_trail += f"\n[{now_vn}] [{exec_status.upper()}] [{bot_type}]: {exec_res.get('message') or exec_res.get('error')}"

            supabase.table("bot_automation_tasks").update({
                "payload_data": payload,
                "approval_status": "approved",
                "execution_status": exec_status,
                "execution_logs": logs_trail,
                "executed_at": now_iso
            }).eq("id", task_id).execute()

            if is_success and ticket.get("id"):
                supabase.table("inbox_tickets").update({"status": "completed"}).eq("id", ticket["id"]).execute()

            return {
                "status": "success",
                "message": f"Đã thực thi thành công tác vụ #{task_id[:8]}",
                "execution_result": exec_res
            }

    except Exception as e:
        logger.error(f"❌ Lỗi thực thi tác vụ {task_id}: {e}")
        logs_trail += f"\n[{now_vn}] [ERROR] Execution failed: {str(e)}"
        supabase.table("bot_automation_tasks").update({
            "approval_status": "approved",
            "execution_status": "failed",
            "execution_logs": logs_trail
        }).eq("id", task_id).execute()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{task_id}/reject")
async def reject_task(task_id: str):
    """Từ chối tác vụ."""
    supabase = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    now_vn = datetime.now(pytz.timezone('Asia/Ho_Chi_Minh')).strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        task_res = supabase.table("bot_automation_tasks").select("execution_logs").eq("id", task_id).execute()
        old_logs = (task_res.data[0].get("execution_logs") or "") if task_res.data else ""
        new_logs = old_logs + f"\n[{now_vn}] [REJECTED] Task rejected by Admin."

        supabase.table("bot_automation_tasks").update({
            "approval_status": "rejected",
            "execution_status": "failed",
            "execution_logs": new_logs,
            "executed_at": now_iso
        }).eq("id", task_id).execute()

        return {"status": "success", "message": f"Đã từ chối tác vụ #{task_id[:8]}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))