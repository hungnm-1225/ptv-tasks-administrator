# backend/app/api/v1/endpoints/tasks.py
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client

router = APIRouter()

@router.get("/", response_model=List[Dict[str, Any]])
async def list_tasks(approval_status: Optional[str] = None):
    """Lấy danh sách bot_automation_tasks THẬT từ Supabase"""
    try:
        supabase = get_supabase_client()
        query = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").order("created_at", desc=True)
        
        if approval_status and approval_status != "all":
            query = query.eq("approval_status", approval_status)
            
        res = query.execute()
        return res.data or []
    except Exception as e:
        print(f"❌ Lỗi khi đọc bot_automation_tasks: {e}")
        return []

@router.post("/", response_model=Dict[str, Any])
async def create_task(payload: Dict[str, Any]):
    """Tạo tác vụ phê duyệt bot mới"""
    ticket_id = payload.get("ticket_id")
    bot_type = payload.get("bot_type", "keycloak_api")
    
    try:
        supabase = get_supabase_client()
        res = supabase.table("bot_automation_tasks").insert({
            "ticket_id": ticket_id,
            "bot_type": bot_type,
            "payload_data": payload.get("payload_data", {"action": "auto_triage", "ticket_id": ticket_id}),
            "approval_status": "pending",
            "execution_status": "queued"
        }).execute()
        return {"status": "success", "data": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{task_id}/approve")
async def approve_task(task_id: str):
    """Phê duyệt và thực thi tác vụ"""
    try:
        supabase = get_supabase_client()
        # 1. Lấy thông tin task & ticket
        task_res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
        if not task_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy task!")

        task = task_res.data[0]
        ticket = task.get("inbox_tickets") or {}
        payload = task.get("payload_data") or {}

        # 2. Đồng bộ ngược nếu là Google Form
        if ticket.get("source") == "google_form":
            from app.services.google_sheet_service import GoogleSheetManager
            row_index = ticket.get("metadata", {}).get("row_index")
            if row_index:
                manager = GoogleSheetManager()
                manager.update_feedback_row("Form_Responses", row_index, payload.get("category", "other"), "To Implement")

        # 3. Đổi trạng thái trong Supabase
        supabase.table("bot_automation_tasks").update({"approval_status": "approved", "execution_status": "success"}).eq("id", task_id).execute()
        if ticket.get("id"):
            supabase.table("inbox_tickets").update({"status": "completed"}).eq("id", ticket["id"]).execute()

        return {"status": "success", "message": f"Đã phê duyệt thành công tác vụ {task_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))