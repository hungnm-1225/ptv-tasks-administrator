# backend/app/api/v1/endpoints/tickets.py
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException
from app.core.supabase import get_supabase_client
from app.models.ticket import TicketCreate
from app.workers.ticket_processor import process_incoming_ticket

router = APIRouter()

@router.post("/", response_model=Dict[str, Any])
async def create_ticket(ticket: TicketCreate):
    """Tiếp nhận ticket mới từ webhook"""
    res = await process_incoming_ticket(ticket.dict())
    return {"status": "success", "data": res}

@router.get("/", response_model=List[Dict[str, Any]])
async def list_tickets(status: Optional[str] = None, category: Optional[str] = None):
    """Lấy danh sách inbox_tickets THẬT từ Supabase (Lọc theo status & category)"""
    try:
        supabase = get_supabase_client()
        # Lấy tất cả tickets, sắp xếp mới nhất lên đầu
        query = supabase.table("inbox_tickets").select("*").order("created_at", desc=True)
        
        if status and status != "all":
            query = query.eq("status", status)
            
        if category and category != "all":
            query = query.eq("category", category)
            
        res = query.execute()
        return res.data or []
        
    except Exception as e:
        print(f"❌ Lỗi khi đọc inbox_tickets từ Supabase: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{ticket_id}/dismiss")
async def dismiss_ticket(ticket_id: str):
    """Đánh dấu BỎ QUA ticket + Đồng bộ Đã Đọc trên Gmail"""
    supabase = get_supabase_client()
    res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket")
        
    ticket = res.data[0]
    
    # 1. Đổi trạng thái trong Supabase -> 'dismissed'
    supabase.table("inbox_tickets").update({"status": "dismissed"}).eq("id", ticket_id).execute()
    
    # 2. Nếu nguồn là Gmail -> Đánh dấu ĐÃ ĐỌC trên Gmail cá nhân của Anh
    if ticket.get("source") == "gmail" and ticket.get("source_id"):
        from app.services.gmail_service import mark_email_as_read
        mark_email_as_read(ticket["source_id"])
        
    return {"status": "success", "message": "Đã bỏ qua ticket và đồng bộ Gmail"}

@router.put("/{ticket_id}/restore")
async def restore_ticket(ticket_id: str):
    """KHÔI PHỤC ticket đã bỏ qua quay lại Hòm Thư"""
    supabase = get_supabase_client()
    supabase.table("inbox_tickets").update({"status": "pending"}).eq("id", ticket_id).execute()
    return {"status": "success", "message": "Đã khôi phục ticket"}