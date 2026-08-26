# backend/app/api/v1/endpoints/board.py
import time
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from app.core.supabase import get_supabase_client

router = APIRouter()

# =============================================================================
# ⚡ IN-MEMORY CACHE CHO WORKBOARD (TỐC ĐỘ 1MS TỪ RAM)
# =============================================================================
class BoardMemoryCache:
    def __init__(self, default_ttl: int = 300):  # Lưu RAM 5 phút
        self._cache: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            data, expire_at = self._cache[key]
            if time.time() < expire_at:
                return data
            del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        expire_at = time.time() + (ttl if ttl is not None else 300)
        self._cache[key] = (value, expire_at)

    def invalidate(self, prefix: str = ""):
        """Xóa cache khi có thao tác thêm / sửa / xóa / kéo thẻ."""
        if not prefix:
            self._cache.clear()
        else:
            keys_to_del = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._cache[k]

board_cache = BoardMemoryCache(default_ttl=300)


class SubtaskItem(BaseModel):
    id: str
    title: str
    completed: bool = False

class BoardCreateSchema(BaseModel):
    title: str
    description: Optional[str] = ""
    background_url: Optional[str] = None
    overlay_color: Optional[str] = "#000000"
    overlay_opacity: Optional[float] = 0.35
    column_opacity: Optional[float] = 0.75
    card_opacity: Optional[float] = 0.85

class BoardUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    background_url: Optional[str] = None
    overlay_color: Optional[str] = None
    overlay_opacity: Optional[float] = None
    column_opacity: Optional[float] = None
    card_opacity: Optional[float] = None
    categories: Optional[List[str]] = None
    priorities: Optional[List[Dict[str, Any]]] = None

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
    priority: Optional[str] = "low"      # 🟢 Mặc định Thấp
    category: Optional[str] = "Khác"     # 🟢 Mặc định Khác
    color: Optional[str] = "#8b5cf6"
    assigned_name: Optional[str] = "Hùng Nguyễn Mạnh"
    assigned_email: Optional[str] = "hung.nguyenmanh@dtt.vn"
    due_date: Optional[str] = None
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
# 1. BOARDS & THÙNG RÁC (CÓ RAM CACHE)
# ===================================================================
@router.get("/boards")
async def list_boards() -> List[Dict[str, Any]]:
    """Lấy danh sách các Board hoạt động (Đọc siêu tốc từ RAM Cache)."""
    cache_key = "boards_active"
    cached = board_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    res = supabase.table("work_boards").select("*").eq("is_deleted", False).order("created_at", desc=False).execute()
    data = res.data or []
    board_cache.set(cache_key, data, ttl=300)
    return data

@router.get("/boards/trash")
async def list_trash_boards() -> List[Dict[str, Any]]:
    """Lấy danh sách Board nằm trong Thùng Rác."""
    cache_key = "boards_trash"
    cached = board_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    res = supabase.table("work_boards").select("*").eq("is_deleted", True).order("deleted_at", desc=True).execute()
    data = res.data or []
    board_cache.set(cache_key, data, ttl=300)
    return data

@router.post("/boards")
async def create_board(payload: BoardCreateSchema):
    supabase = get_supabase_client()
    res = supabase.table("work_boards").insert(payload.model_dump()).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Không thể tạo bảng mới.")
    
    board = res.data[0]
    board_id = board["id"]

    default_cols = [
        {"board_id": board_id, "title": "Tiếp Nhận", "color": "#64748b", "column_type": "backlog", "order_index": 0},
        {"board_id": board_id, "title": "Cần Làm", "color": "#38bdf8", "column_type": "todo", "order_index": 1},
        {"board_id": board_id, "title": "Đang Làm", "color": "#8b5cf6", "column_type": "in_progress", "order_index": 2},
        {"board_id": board_id, "title": "Chờ Duyệt", "color": "#fbbf24", "column_type": "review", "order_index": 3},
        {"board_id": board_id, "title": "Hoàn Thành", "color": "#10b981", "column_type": "done", "order_index": 4},
        {"board_id": board_id, "title": "Hủy Bỏ", "color": "#f43f5e", "column_type": "abort", "order_index": 5},
    ]
    supabase.table("work_board_columns").insert(default_cols).execute()
    board_cache.invalidate()
    return {"status": "success", "data": board}

@router.put("/boards/{board_id}")
async def update_board(board_id: str, payload: BoardUpdateSchema):
    supabase = get_supabase_client()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = supabase.table("work_boards").update(update_data).eq("id", board_id).execute()
    board_cache.invalidate()
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.delete("/boards/{board_id}")
async def soft_delete_board(board_id: str):
    supabase = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    supabase.table("work_boards").update({"is_deleted": True, "deleted_at": now_iso}).eq("id", board_id).execute()
    board_cache.invalidate()
    return {"status": "success", "message": "Đã chuyển bảng vào Thùng rác."}

@router.put("/boards/{board_id}/restore")
async def restore_board(board_id: str):
    supabase = get_supabase_client()
    supabase.table("work_boards").update({"is_deleted": False, "deleted_at": None}).eq("id", board_id).execute()
    board_cache.invalidate()
    return {"status": "success", "message": "Đã khôi phục bảng thành công."}

@router.delete("/boards/{board_id}/permanent")
async def permanent_delete_board(board_id: str):
    supabase = get_supabase_client()
    supabase.table("work_boards").delete().eq("id", board_id).execute()
    board_cache.invalidate()
    return {"status": "success", "message": "Đã xóa vĩnh viễn bảng."}


# ===================================================================
# 2. COLUMNS & CARDS CRUD (CÓ RAM CACHE)
# ===================================================================
@router.get("/boards/{board_id}/columns")
async def list_columns(board_id: str) -> List[Dict[str, Any]]:
    cache_key = f"columns_{board_id}"
    cached = board_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    res = supabase.table("work_board_columns").select("*").eq("board_id", board_id).order("order_index", desc=False).execute()
    data = res.data or []
    board_cache.set(cache_key, data, ttl=300)
    return data

@router.post("/boards/{board_id}/columns")
async def create_column(board_id: str, payload: ColumnCreateSchema):
    supabase = get_supabase_client()
    data = payload.model_dump()
    data["board_id"] = board_id
    res = supabase.table("work_board_columns").insert(data).execute()
    board_cache.invalidate(f"columns_{board_id}")
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.put("/columns/{column_id}")
async def update_column(column_id: str, payload: ColumnUpdateSchema):
    supabase = get_supabase_client()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    res = supabase.table("work_board_columns").update(update_data).eq("id", column_id).execute()
    board_cache.invalidate("columns_")
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.delete("/columns/{column_id}")
async def delete_column(column_id: str):
    supabase = get_supabase_client()
    supabase.table("work_board_columns").delete().eq("id", column_id).execute()
    board_cache.invalidate("columns_")
    return {"status": "success", "message": "Đã xóa cột thành công."}

@router.get("/boards/{board_id}/cards")
async def list_board_cards(board_id: str) -> List[Dict[str, Any]]:
    cache_key = f"cards_{board_id}"
    cached = board_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    try:
        res = supabase.table("work_board_cards").select("*").eq("board_id", board_id).order("order_index", desc=False).execute()
        data = res.data or []
        board_cache.set(cache_key, data, ttl=300)
        return data
    except Exception as e:
        print(f"Error fetching cards: {e}")
        return []

@router.post("/cards")
async def create_card(payload: BoardCardCreateSchema):
    supabase = get_supabase_client()
    data = payload.model_dump()
    if data.get("subtasks"):
        data["subtasks"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in data["subtasks"]]
    res = supabase.table("work_board_cards").insert(data).execute()
    board_cache.invalidate(f"cards_{payload.board_id}")
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.put("/cards/{card_id}")
async def update_card(card_id: str, payload: BoardCardUpdateSchema):
    supabase = get_supabase_client()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "subtasks" in update_data and update_data["subtasks"] is not None:
        update_data["subtasks"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in update_data["subtasks"]]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = supabase.table("work_board_cards").update(update_data).eq("id", card_id).execute()
    board_cache.invalidate("cards_")
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
    board_cache.invalidate("cards_")
    return {"status": "success", "data": res.data[0] if res.data else None}

@router.delete("/cards/{card_id}")
async def delete_card(card_id: str):
    supabase = get_supabase_client()
    supabase.table("work_board_cards").delete().eq("id", card_id).execute()
    board_cache.invalidate("cards_")
    return {"status": "success", "message": "Đã xóa thẻ."}