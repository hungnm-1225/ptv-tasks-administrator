# backend/app/api/v1/endpoints/board.py
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
from app.core.supabase import get_supabase_client

router = APIRouter()

# ----------------- SCHEMAS -----------------
class SubtaskItem(BaseModel):
    id: str
    title: str
    completed: bool = False

class BoardCreateSchema(BaseModel):
    title: str
    description: Optional[str] = ""
    background_url: Optional[str] = None
    background_color: Optional[str] = "#0f172a"

class BoardUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    background_url: Optional[str] = None
    background_color: Optional[str] = None

class ColumnCreateSchema(BaseModel):
    title: str
    color: Optional[str] = "#8b5cf6"
    column_type: Optional[str] = "custom"
    order_index: Optional[int] = 0

class ColumnUpdateSchema(BaseModel):
    title: Optional[str] = None
    color: Optional[str] = None
    column_type: Optional[str] = None
    order_index: Optional[int] = None

class BoardCardCreateSchema(BaseModel):
    board_id: str
    column_id: str
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "normal"
    category: Optional[str] = "other"
    color: Optional[str] = "#8b5cf6"
    assigned_name: Optional[str] = "Hùng Nguyễn Mạnh"
    assigned_email: Optional[str] = "hung.nguyenmanh@dtt.vn"
    due_date: Optional[str] = None  # ISO format YYYY-MM-DDTHH:MM:SS
    subtasks: Optional[List[SubtaskItem]] = []

class BoardCardUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    column_id: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    color: Optional[str] = None
    assigned_name: Optional[str] = None
    assigned_email: Optional[str] = None
    due_date: Optional[str] = None
    subtasks: Optional[List[SubtaskItem]] = None
    order_index: Optional[int] = None

class MoveCardSchema(BaseModel):
    column_id: str
    order_index: Optional[int] = 0


# ===================================================================
# 1. CRUD BOARDS (QUẢN LÝ NHIỀU BẢNG)
# ===================================================================
@router.get("/boards")
async def list_boards() -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    res = supabase.table("work_boards").select("*").order("created_at", desc=False).execute()
    return res.data or []

@router.post("/boards")
async def create_board(payload: BoardCreateSchema):
    supabase = get_supabase_client()
    res = supabase.table("work_boards").insert(payload.model_dump()).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Không thể tạo bảng mới.")
    
    board = res.data[0]
    board_id = board["id"]

    # Tự động tạo sẵn 6 cột chuẩn
    default_cols = [
        {"board_id": board_id, "title": "Backlog / Tiếp Nhận", "color": "#64748b", "column_type": "backlog", "order_index": 0},
        {"board_id": board_id, "title": "To Do / Cần Làm", "color": "#38bdf8", "column_type": "todo", "order_index": 1},
        {"board_id": board_id, "title": "In Progress / Đang Làm", "color": "#8b5cf6", "column_type": "in_progress", "order_index": 2},
        {"board_id": board_id, "title": "Review / Chờ Duyệt", "color": "#fbbf24", "column_type": "review", "order_index": 3},
        {"board_id": board_id, "title": "Done / Hoàn Thành", "color": "#10b981", "column_type": "done", "order_index": 4},
        {"board_id": board_id, "title": "Abort / Hủy Bỏ", "color": "#f43f5e", "column_type": "abort", "order_index": 5},
    ]
    supabase.table("work_board_columns").insert(default_cols).execute()

    return {"status": "success", "data": board}

@router.put("/boards/{board_id}")
async def update_board(board_id: str, payload: BoardUpdateSchema):
    supabase = get_supabase_client()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = supabase.table("work_boards").update(update_data).eq("id", board_id).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.delete("/boards/{board_id}")
async def delete_board(board_id: str):
    supabase = get_supabase_client()
    supabase.table("work_boards").delete().eq("id", board_id).execute()
    return {"status": "success", "message": "Đã xóa board thành công."}


# ===================================================================
# 2. CRUD COLUMNS (QUẢN LÝ CỘT CỦA BOARD)
# ===================================================================
@router.get("/boards/{board_id}/columns")
async def list_columns(board_id: str) -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    res = supabase.table("work_board_columns").select("*").eq("board_id", board_id).order("order_index", desc=False).execute()
    return res.data or []

@router.post("/boards/{board_id}/columns")
async def create_column(board_id: str, payload: ColumnCreateSchema):
    supabase = get_supabase_client()
    data = payload.model_dump()
    data["board_id"] = board_id
    res = supabase.table("work_board_columns").insert(data).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.put("/columns/{column_id}")
async def update_column(column_id: str, payload: ColumnUpdateSchema):
    supabase = get_supabase_client()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    res = supabase.table("work_board_columns").update(update_data).eq("id", column_id).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.delete("/columns/{column_id}")
async def delete_column(column_id: str):
    supabase = get_supabase_client()
    supabase.table("work_board_columns").delete().eq("id", column_id).execute()
    return {"status": "success", "message": "Đã xóa cột thành công."}


# ===================================================================
# 3. CRUD CARDS (QUẢN LÝ THẺ & THỜI GIAN CHI TIẾT)
# ===================================================================
@router.get("/boards/{board_id}/cards")
async def list_board_cards(board_id: str) -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    res = supabase.table("work_board_cards").select("*").eq("board_id", board_id).order("order_index", desc=False).order("created_at", desc=True).execute()
    return res.data or []

@router.post("/cards")
async def create_card(payload: BoardCardCreateSchema):
    supabase = get_supabase_client()
    data = payload.model_dump()
    if data.get("subtasks"):
        data["subtasks"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in data["subtasks"]]
        
    res = supabase.table("work_board_cards").insert(data).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.put("/cards/{card_id}")
async def update_card(card_id: str, payload: BoardCardUpdateSchema):
    supabase = get_supabase_client()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "subtasks" in update_data and update_data["subtasks"] is not None:
        update_data["subtasks"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in update_data["subtasks"]]
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = supabase.table("work_board_cards").update(update_data).eq("id", card_id).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.put("/cards/{card_id}/move")
async def move_card(card_id: str, payload: MoveCardSchema):
    supabase = get_supabase_client()
    update_data = {
        "column_id": payload.column_id,
        "order_index": payload.order_index or 0,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    res = supabase.table("work_board_cards").update(update_data).eq("id", card_id).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.delete("/cards/{card_id}")
async def delete_card(card_id: str):
    supabase = get_supabase_client()
    supabase.table("work_board_cards").delete().eq("id", card_id).execute()
    return {"status": "success", "message": "Đã xóa thẻ thành công."}