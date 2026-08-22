# backend/app/api/v1/endpoints/board.py
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
from app.core.supabase import get_supabase_client

router = APIRouter()

class SubtaskItem(BaseModel):
    id: str
    title: str
    completed: bool = False

class BoardCardCreateSchema(BaseModel):
    title: str
    description: Optional[str] = ""
    column_status: Optional[str] = "todo"
    priority: Optional[str] = "normal"
    category: Optional[str] = "other"
    assigned_name: Optional[str] = "Hùng Nguyễn Mạnh"
    assigned_email: Optional[str] = "hung.nguyenmanh@dtt.vn"
    due_date: Optional[str] = None
    source: Optional[str] = "manual"
    source_id: Optional[str] = None
    ticket_id: Optional[str] = None
    subtasks: Optional[List[SubtaskItem]] = []

class BoardCardUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    column_status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assigned_name: Optional[str] = None
    assigned_email: Optional[str] = None
    due_date: Optional[str] = None
    subtasks: Optional[List[SubtaskItem]] = None
    order_index: Optional[int] = None

class MoveCardSchema(BaseModel):
    column_status: str
    order_index: Optional[int] = 0


# 1. LẤY TOÀN BỘ CARDS TRÊN BOARD
@router.get("/cards")
async def get_board_cards(
    search: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None
) -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    query = supabase.table("work_board_cards").select("*").order("order_index", desc=False).order("created_at", desc=True)
    
    if category and category != "all":
        query = query.eq("category", category)
    if priority and priority != "all":
        query = query.eq("priority", priority)
        
    res = query.execute()
    data = res.data or []
    
    if search:
        s = search.strip().lower()
        data = [
            c for c in data 
            if s in (c.get("title") or "").lower() 
            or s in (c.get("description") or "").lower()
            or s in (c.get("assigned_name") or "").lower()
        ]
        
    return data


# 2. TẠO CARD MỚI
@router.post("/cards")
async def create_board_card(payload: BoardCardCreateSchema):
    supabase = get_supabase_client()
    record = payload.model_dump()
    if record.get("subtasks"):
        record["subtasks"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in record["subtasks"]]
        
    res = supabase.table("work_board_cards").insert(record).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Không thể tạo card trên bảng.")
    return {"status": "success", "data": res.data[0]}


# 3. CẬP NHẬT CHI TIẾT CARD
@router.put("/cards/{card_id}")
async def update_board_card(card_id: str, payload: BoardCardUpdateSchema):
    supabase = get_supabase_client()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    
    if "subtasks" in update_data and update_data["subtasks"] is not None:
        update_data["subtasks"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in update_data["subtasks"]]
        
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = supabase.table("work_board_cards").update(update_data).eq("id", card_id).execute()
    
    return {"status": "success", "data": res.data[0] if res.data else None}


# 4. KÉO THẢ DI CHUYỂN CARD (DRAG & DROP)
@router.put("/cards/{card_id}/move")
async def move_board_card(card_id: str, payload: MoveCardSchema):
    supabase = get_supabase_client()
    update_data = {
        "column_status": payload.column_status,
        "order_index": payload.order_index or 0,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    res = supabase.table("work_board_cards").update(update_data).eq("id", card_id).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}


# 5. XÓA CARD
@router.delete("/cards/{card_id}")
async def delete_board_card(card_id: str):
    supabase = get_supabase_client()
    supabase.table("work_board_cards").delete().eq("id", card_id).execute()
    return {"status": "success", "message": "Đã xóa card thành công."}