# backend/app/api/v1/endpoints/tickets.py
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client
from app.models.ticket import TicketCreate
from app.workers.ticket_processor import process_incoming_ticket
from app.core.gemini import process_ticket_with_ai

router = APIRouter()

@router.post("/", response_model=Dict[str, Any])
async def create_ticket(ticket: TicketCreate):
    res = await process_incoming_ticket(ticket.dict())
    return {"status": "success", "data": res}

@router.get("/", response_model=List[Dict[str, Any]])
async def list_tickets(status: Optional[str] = None, category: Optional[str] = None):
    try:
        supabase = get_supabase_client()
        query = supabase.table("inbox_tickets").select("*").order("created_at", desc=True)
        
        if status and status != "all":
            query = query.eq("status", status)
        elif not status:
            query = query.neq("status", "dismissed") # Mặc định không hiện ticket đã bỏ qua
            
        if category and category != "all":
            query = query.eq("category", category)
            
        res = query.execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{ticket_id}/dismiss")
async def dismiss_ticket(ticket_id: str):
    """FIX LỖI 404: Đánh dấu BỎ QUA ticket + Đồng bộ Đã Đọc trên Gmail"""
    try:
        supabase = get_supabase_client()
        # Tìm theo UUID hoặc source_id
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            res = supabase.table("inbox_tickets").select("*").eq("source_id", ticket_id).execute()
            
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
            
        ticket = res.data[0]
        real_id = ticket["id"]
        
        # 1. Cập nhật Supabase status -> 'dismissed'
        supabase.table("inbox_tickets").update({"status": "dismissed"}).eq("id", real_id).execute()
        
        # 2. Đồng bộ đánh dấu ĐÃ ĐỌC trên Gmail
        if ticket.get("source") == "gmail" and ticket.get("source_id"):
            try:
                from app.services.gmail_service import mark_email_as_read
                mark_email_as_read(ticket["source_id"])
            except Exception as e:
                print(f"⚠️ Warning mark_as_read: {e}")
                
        return {"status": "success", "message": f"Đã bỏ qua ticket {ticket_id}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{ticket_id}/restore")
async def restore_ticket(ticket_id: str):
    """KHÔI PHỤC ticket đã bỏ qua"""
    try:
        supabase = get_supabase_client()
        supabase.table("inbox_tickets").update({"status": "pending"}).eq("id", ticket_id).execute()
        return {"status": "success", "message": f"Đã khôi phục ticket {ticket_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{ticket_id}/triage")
async def force_ai_triage(ticket_id: str):
    """ÉP GEMINI AI TÓM TẮT LẠI CHO TICKET CỤ THỂ"""
    try:
        await process_ticket_with_ai(ticket_id)
        return {"status": "success", "message": "Đã ép AI tóm tắt xong!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))