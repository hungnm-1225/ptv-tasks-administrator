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
async def list_tickets(
    status: Optional[str] = None, 
    category: Optional[str] = None,
    sort: Optional[str] = "desc", # "desc": Mới nhất, "asc": Cũ nhất
    days: Optional[int] = None
):
    try:
        supabase = get_supabase_client()
        query = supabase.table("inbox_tickets").select("*")
        
        # Sắp xếp theo ngày tạo
        query = query.order("created_at", desc=(sort == "desc"))
        
        if status and status != "all":
            query = query.eq("status", status)
        elif not status:
            query = query.neq("status", "dismissed")
            
        if category and category != "all":
            query = query.eq("category", category)
            
        res = query.execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{ticket_id}/dismiss")
async def dismiss_ticket(ticket_id: str):
    """FIX LỖI 404 BỎ QUA TICKET"""
    try:
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            res = supabase.table("inbox_tickets").select("*").eq("source_id", ticket_id).execute()
            
        if not res.data:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy ticket #{ticket_id}")
            
        ticket = res.data[0]
        real_id = ticket["id"]
        
        # Đổi status -> 'dismissed'
        supabase.table("inbox_tickets").update({"status": "dismissed"}).eq("id", real_id).execute()
        
        # Đánh dấu đã đọc trên Gmail
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
    """KHÔI PHỤC TICKET"""
    try:
        supabase = get_supabase_client()
        supabase.table("inbox_tickets").update({"status": "pending"}).eq("id", ticket_id).execute()
        return {"status": "success", "message": f"Đã khôi phục ticket {ticket_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{ticket_id}/triage")
async def force_ai_triage(ticket_id: str):
    """FIX LỖI 404 ÉP AI TÓM TẮT TICKET CỤ THỂ"""
    try:
        await process_ticket_with_ai(ticket_id)
        return {"status": "success", "message": f"Đã tóm tắt AI xong cho ticket {ticket_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-triage")
async def batch_ai_triage():
    """TÓM TẮT AI HÀNG LOẠT CHO TẤT CẢ TICKET CŨ TRONG SUPABASE"""
    try:
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("id").is_("ai_summary", "null").execute()
        tickets = res.data or []
        
        count = 0
        for t in tickets:
            await process_ticket_with_ai(t["id"])
            count += 1
            
        return {"status": "success", "message": f"Đã chạy tóm tắt Gemini AI cho {count} ticket cũ!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{ticket_id}/category")
async def update_ticket_category(ticket_id: str, payload: Dict[str, Any]):
    """Cho phép Admin đổi Category/Tag trực tiếp trên Web Card"""
    new_category = payload.get("category", "other")
    supabase = get_supabase_client()
    supabase.table("inbox_tickets").update({"category": new_category}).eq("id", ticket_id).execute()
    return {"status": "success", "category": new_category}