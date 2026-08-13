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