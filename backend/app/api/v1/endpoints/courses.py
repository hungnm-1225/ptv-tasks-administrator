# backend/app/api/v1/endpoints/courses.py
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from app.core.supabase import get_supabase_client

router = APIRouter()

class CourseSchema(BaseModel):
    course_id: int
    category: str
    course_name: str
    sku: Optional[str] = None
    lms_url: str

class CourseUpdateSchema(BaseModel):
    course_id: Optional[int] = None
    category: Optional[str] = None
    course_name: Optional[str] = None
    sku: Optional[str] = None
    lms_url: Optional[str] = None


def get_table_name(course_type: str) -> str:
    """Xác định bảng Supabase theo loại: 'lms' hoặc 'workspace'."""
    return "lms_courses" if course_type == "lms" else "workspace_courses"


# -------------------------------------------------------------------
# 1. LẤY DANH SÁCH KHÓA HỌC (Có Search & Filter Category)
# -------------------------------------------------------------------
@router.get("/{course_type}")
async def list_courses(
    course_type: str,
    category: Optional[str] = None,
    search: Optional[str] = None
) -> List[Dict[str, Any]]:
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    query = supabase.table(table).select("*").order("category", desc=False).order("course_id", desc=False)
    
    if category and category != "all":
        query = query.eq("category", category)
        
    res = query.execute()
    data = res.data or []
    
    if search:
        s_lower = search.strip().lower()
        data = [
            c for c in data 
            if s_lower in str(c.get("course_id", "")).lower() 
            or s_lower in str(c.get("course_name", "")).lower()
            or s_lower in str(c.get("sku", "") or "").lower()
            or s_lower in str(c.get("category", "")).lower()
        ]
        
    return data


# -------------------------------------------------------------------
# 2. LẤY DANH SÁCH TẤT CẢ CATEGORIES DUY NHẤT
# -------------------------------------------------------------------
@router.get("/{course_type}/categories")
async def get_categories(course_type: str) -> List[str]:
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    res = supabase.table(table).select("category").execute()
    
    cats = sorted(list({row["category"] for row in (res.data or []) if row.get("category")}))
    return cats


# -------------------------------------------------------------------
# 3. TẠO KHÓA HỌC MỚI
# -------------------------------------------------------------------
@router.post("/{course_type}")
async def create_course(course_type: str, payload: CourseSchema):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    # Kiểm tra trùng Course ID
    dup = supabase.table(table).select("id").eq("course_id", payload.course_id).execute()
    if dup.data:
        raise HTTPException(status_code=400, detail=f"Course ID #{payload.course_id} đã tồn tại trong {table}!")
        
    res = supabase.table(table).insert(payload.model_dump()).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}


# -------------------------------------------------------------------
# 4. CẬP NHẬT KHÓA HỌC
# -------------------------------------------------------------------
@router.put("/{course_type}/{course_db_id}")
async def update_course(course_type: str, course_db_id: str, payload: CourseUpdateSchema):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật.")
        
    res = supabase.table(table).update(update_data).eq("id", course_db_id).execute()
    return {"status": "success", "data": res.data[0] if res.data else None}


# -------------------------------------------------------------------
# 5. XÓA KHÓA HỌC
# -------------------------------------------------------------------
@router.delete("/{course_type}/{course_db_id}")
async def delete_course(course_type: str, course_db_id: str):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    res = supabase.table(table).delete().eq("id", course_db_id).execute()
    return {"status": "success", "message": "Đã xóa khóa học thành công."}