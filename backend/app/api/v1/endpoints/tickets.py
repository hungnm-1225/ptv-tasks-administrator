# backend/app/api/v1/endpoints/tickets.py
import time
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from app.core.supabase import get_supabase_client
from app.core.gemini import process_ticket_with_ai

router = APIRouter()

# =============================================================================
# ⚡ IN-MEMORY CACHE CHO INBOX TICKETS (TỐC ĐỘ 1MS)
# =============================================================================
class TicketsMemoryCache:
    def __init__(self, default_ttl: int = 60):  # Lưu RAM 60 giây
        self._cache: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            data, expire_at = self._cache[key]
            if time.time() < expire_at:
                return data
            del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        expire_at = time.time() + (ttl if ttl is not None else 60)
        self._cache[key] = (value, expire_at)

    def invalidate(self):
        """Xóa sạch cache khi có tác vụ cập nhật / hoàn thành / bỏ qua."""
        self._cache.clear()

tickets_cache = TicketsMemoryCache(default_ttl=60)


@router.get("")
@router.get("/")
async def list_tickets(
    status: Optional[str] = Query("all"),
    category: Optional[str] = Query("all"),
    source: Optional[str] = Query("all"),
    sort: str = Query("desc", regex="^(desc|asc)$")
):
    """Lấy danh sách tickets từ Supabase hỗ trợ lọc đa tầng (Có RAM Cache 1ms)."""
    cache_key = f"tickets_{status}_{category}_{source}_{sort}"
    cached = tickets_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    try:
        query = supabase.table("inbox_tickets").select("*")

        # 1. Lọc theo trạng thái (Status)
        if status and status != "all":
            query = query.eq("status", status)
        elif status == "all":
            query = query.neq("status", "dismissed")

        # 2. Lọc theo danh mục (Category)
        if category and category != "all":
            query = query.eq("category", category)

        # 3. Lọc theo nguồn (Source)
        if source and source != "all":
            query = query.eq("source", source)

        # 4. Sắp xếp thời gian
        query = query.order("created_at", desc=(sort == "desc"))

        res = query.limit(300).execute()
        data = res.data or []
        tickets_cache.set(cache_key, data, ttl=60)
        return data
    except Exception as e:
        print(f"❌ Lỗi tải tickets: {e}")
        return []


@router.put("/{ticket_id}/complete")
async def complete_ticket(ticket_id: str):
    """Đánh dấu hoàn thành thủ công một ticket."""
    supabase = get_supabase_client()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        res = supabase.table("inbox_tickets").update({
            "status": "completed",
            "updated_at": now_iso
        }).eq("id", ticket_id).execute()
        
        tickets_cache.invalidate()
        return {"status": "success", "message": f"Đã đánh dấu hoàn thành ticket #{ticket_id[:8]}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{ticket_id}/dismiss")
async def dismiss_ticket(ticket_id: str):
    """Đưa ticket vào mục Đã Bỏ Qua (dismissed)."""
    supabase = get_supabase_client()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        supabase.table("inbox_tickets").update({
            "status": "dismissed",
            "updated_at": now_iso
        }).eq("id", ticket_id).execute()

        # Đánh dấu đã đọc trên Gmail nếu nguồn là Gmail
        ticket_res = supabase.table("inbox_tickets").select("source, source_id").eq("id", ticket_id).execute()
        if ticket_res.data and ticket_res.data[0].get("source") == "gmail":
            msg_id = ticket_res.data[0].get("source_id")
            try:
                from app.services.gmail_service import mark_email_as_read
                mark_email_as_read(msg_id)
            except Exception:
                pass

        tickets_cache.invalidate()
        return {"status": "success", "message": "Đã chuyển ticket vào mục Đã Bỏ Qua."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{ticket_id}/restore")
async def restore_ticket(ticket_id: str):
    """Khôi phục ticket về trạng thái PENDING."""
    supabase = get_supabase_client()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        supabase.table("inbox_tickets").update({
            "status": "pending",
            "updated_at": now_iso
        }).eq("id", ticket_id).execute()
        
        tickets_cache.invalidate()
        return {"status": "success", "message": "Đã khôi phục ticket về Hòm Thư."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{ticket_id}/category")
async def update_ticket_category(ticket_id: str, payload: Dict[str, Any]):
    """Cập nhật nhanh phân loại category của ticket."""
    supabase = get_supabase_client()
    new_cat = payload.get("category", "other")
    try:
        supabase.table("inbox_tickets").update({"category": new_cat}).eq("id", ticket_id).execute()
        tickets_cache.invalidate()
        return {"status": "success", "category": new_cat}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{ticket_id}/triage")
async def force_ai_triage(ticket_id: str):
    """Kích hoạt Gemini AI phân tích lại ticket."""
    try:
        await process_ticket_with_ai(ticket_id)
        tickets_cache.invalidate()
        return {"status": "success", "message": "Đã kích hoạt AI phân tích lại ticket."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))