# backend/app/api/v1/endpoints/courses.py
import time
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, model_validator
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()

# =============================================================================
# ⚡ IN-MEMORY CACHE ENGINE (TỐC ĐỘ 1MS - KHÔNG CẦN REDIS/THƯ VIỆN NGOÀI)
# =============================================================================
class SimpleMemoryCache:
    def __init__(self, default_ttl: int = 600):  # Mặc định lưu RAM 10 phút
        self._cache: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            data, expire_at = self._cache[key]
            if time.time() < expire_at:
                return data
            del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        expire_at = time.time() + (ttl if ttl is not None else 600)
        self._cache[key] = (value, expire_at)

    def invalidate(self, prefix: str = ""):
        """Xóa cache khi có thao tác Thêm / Sửa / Xóa."""
        if not prefix:
            self._cache.clear()
        else:
            keys_to_del = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._cache[k]

course_cache = SimpleMemoryCache(default_ttl=600)


class CourseSchema(BaseModel):
    course_id: int
    category: str
    course_name: str
    sku: Optional[str] = None
    lms_url: Optional[str] = None

    @model_validator(mode="after")
    def auto_fill_lms_url(self):
        if not self.lms_url or not self.lms_url.strip():
            self.lms_url = f"https://learn.pythaverse.space/course/view.php?id={self.course_id}"
        return self


class CourseUpdateSchema(BaseModel):
    course_id: Optional[int] = None
    category: Optional[str] = None
    course_name: Optional[str] = None
    sku: Optional[str] = None
    lms_url: Optional[str] = None


class BulkCoursesPayload(BaseModel):
    courses: List[CourseSchema]


class RenameCategoryPayload(BaseModel):
    old_category: str
    new_category: str


def get_table_name(course_type: str) -> str:
    """Xác định bảng Supabase theo loại: 'lms' hoặc 'workspace'."""
    clean_type = (course_type or "").strip().lower()
    return "lms_courses" if clean_type == "lms" else "workspace_courses"


# -------------------------------------------------------------------
# 1. LẤY DANH SÁCH KHÓA HỌC (Có In-Memory Cache)
# -------------------------------------------------------------------
@router.get("/{course_type}")
async def list_courses(
    course_type: str,
    category: Optional[str] = None,
    search: Optional[str] = None
) -> List[Dict[str, Any]]:
    table = get_table_name(course_type)
    cache_key = f"all_courses_{table}"
    
    # ⚡ Đọc từ RAM nếu có
    cached_data = course_cache.get(cache_key)
    if cached_data is None:
        supabase = get_supabase_client()
        try:
            res = supabase.table(table).select("*").range(0, 4999).order("category", desc=False).order("course_id", desc=False).execute()
            cached_data = res.data or []
            course_cache.set(cache_key, cached_data, ttl=600)
        except Exception as e:
            logger.error(f"❌ Lỗi lấy danh sách khóa học {table}: {e}")
            return []

    data = cached_data

    # Lọc danh mục trong RAM
    if category and category.strip() != "" and category.lower() not in ["all", "tất cả"]:
        cat_clean = category.strip().lower()
        data = [c for c in data if str(c.get("category", "")).strip().lower() == cat_clean]

    # Tìm kiếm từ khóa trong RAM
    if search:
        s_lower = search.strip().lower()
        data = [
            c for c in data 
            if s_lower in str(c.get("course_id", "")).lower() 
            or s_lower in str(c.get("course_name", "") or "").lower()
            or s_lower in str(c.get("sku", "") or "").lower()
            or s_lower in str(c.get("category", "") or "").lower()
        ]
        
    return data


# -------------------------------------------------------------------
# 2. LẤY DANH SÁCH TẤT CẢ CATEGORIES DUY NHẤT (Có In-Memory Cache)
# -------------------------------------------------------------------
@router.get("/{course_type}/categories")
async def get_categories(course_type: str) -> List[str]:
    table = get_table_name(course_type)
    cache_key = f"categories_{table}"
    
    cached_cats = course_cache.get(cache_key)
    if cached_cats is not None:
        return cached_cats

    supabase = get_supabase_client()
    try:
        res = supabase.table(table).select("category").range(0, 4999).execute()
        raw_data = res.data or []
        
        categories_set = set()
        for row in raw_data:
            cat = row.get("category")
            if cat and str(cat).strip():
                categories_set.add(str(cat).strip())
                
        cats = sorted(list(categories_set))
        course_cache.set(cache_key, cats, ttl=600)
        return cats
    except Exception as e:
        logger.error(f"❌ Lỗi lấy categories từ {table}: {e}")
        return []


# -------------------------------------------------------------------
# 3. TẠO KHÓA HỌC MỚI (Tự động xóa cache)
# -------------------------------------------------------------------
@router.post("/{course_type}")
async def create_course(course_type: str, payload: CourseSchema):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    dup = supabase.table(table).select("id").eq("course_id", payload.course_id).execute()
    if dup.data:
        raise HTTPException(status_code=400, detail=f"Course ID #{payload.course_id} đã tồn tại trong {table}!")
        
    res = supabase.table(table).insert(payload.model_dump()).execute()
    
    # 🧹 Xóa cache để nạp lại dữ liệu mới
    course_cache.invalidate(f"all_courses_{table}")
    course_cache.invalidate(f"categories_{table}")
    return {"status": "success", "data": res.data[0] if res.data else None}


# -------------------------------------------------------------------
# 4. CẬP NHẬT KHÓA HỌC (Tự động xóa cache)
# -------------------------------------------------------------------
@router.put("/{course_type}/{course_db_id}")
async def update_course(course_type: str, course_db_id: str, payload: CourseUpdateSchema):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật.")
        
    res = supabase.table(table).update(update_data).eq("id", course_db_id).execute()
    
    # 🧹 Xóa cache
    course_cache.invalidate(f"all_courses_{table}")
    course_cache.invalidate(f"categories_{table}")
    return {"status": "success", "data": res.data[0] if res.data else None}


# -------------------------------------------------------------------
# 5. XÓA KHÓA HỌC (Tự động xóa cache)
# -------------------------------------------------------------------
@router.delete("/{course_type}/{course_db_id}")
async def delete_course(course_type: str, course_db_id: str):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    res = supabase.table(table).delete().eq("id", course_db_id).execute()
    
    # 🧹 Xóa cache
    course_cache.invalidate(f"all_courses_{table}")
    course_cache.invalidate(f"categories_{table}")
    return {"status": "success", "message": "Đã xóa khóa học thành công."}


# -------------------------------------------------------------------
# 6. NHẬP NHANH / BULK UPSERT (Tự động xóa cache)
# -------------------------------------------------------------------
@router.post("/{course_type}/bulk-upsert")
async def bulk_upsert_courses(course_type: str, payload: BulkCoursesPayload):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    if not payload.courses:
        raise HTTPException(status_code=400, detail="Danh sách khóa học rỗng.")
        
    unique_records_map = {}
    for c in payload.courses:
        data = c.model_dump()
        if not data.get("lms_url") or not str(data.get("lms_url")).strip():
            data["lms_url"] = f"https://learn.pythaverse.space/course/view.php?id={c.course_id}"
        unique_records_map[c.course_id] = data

    records = list(unique_records_map.values())

    try:
        batch_size = 50
        for i in range(0, len(records), batch_size):
            chunk = records[i:i + batch_size]
            supabase.table(table).upsert(chunk, on_conflict="course_id").execute()
            
        # 🧹 Xóa cache
        course_cache.invalidate(f"all_courses_{table}")
        course_cache.invalidate(f"categories_{table}")
        return {
            "status": "success",
            "total_processed": len(records),
            "message": f"Đã đồng bộ thành công {len(records)} khóa học vào {table}!"
        }
    except Exception as ex:
        logger.error(f"Lỗi Bulk Upsert {table}: {ex}")
        raise HTTPException(status_code=500, detail=f"Lỗi cơ sở dữ liệu Supabase: {str(ex)}")


# -------------------------------------------------------------------
# 7. ĐỔI TÊN DANH MỤC (Tự động xóa cache)
# -------------------------------------------------------------------
@router.put("/{course_type}/categories/rename")
async def rename_category(course_type: str, payload: RenameCategoryPayload):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    
    old_cat = payload.old_category.strip()
    new_cat = payload.new_category.strip()
    
    if not old_cat or not new_cat:
        raise HTTPException(status_code=400, detail="Tên danh mục không được để trống.")
        
    res = supabase.table(table)\
        .update({"category": new_cat})\
        .eq("category", old_cat)\
        .execute()
        
    # 🧹 Xóa cache
    course_cache.invalidate(f"all_courses_{table}")
    course_cache.invalidate(f"categories_{table}")
    return {
        "status": "success",
        "message": f"Đã đổi tên danh mục từ '{old_cat}' sang '{new_cat}' cho các khóa học liên quan."
    }


# -------------------------------------------------------------------
# 8. XÓA / GỘP DANH MỤC (Tự động xóa cache)
# -------------------------------------------------------------------
@router.delete("/{course_type}/categories/{category_name}")
async def delete_category(
    course_type: str, 
    category_name: str,
    target_category: Optional[str] = Query(None, description="Nếu truyền, sẽ gộp khóa học sang category này thay vì xóa")
):
    table = get_table_name(course_type)
    supabase = get_supabase_client()
    cat_clean = category_name.strip()
    
    if target_category and target_category.strip() != cat_clean:
        target_clean = target_category.strip()
        res = supabase.table(table)\
            .update({"category": target_clean})\
            .eq("category", cat_clean)\
            .execute()
        msg = f"Đã gộp tất cả khóa học từ '{cat_clean}' sang '{target_clean}'."
    else:
        res = supabase.table(table)\
            .delete()\
            .eq("category", cat_clean)\
            .execute()
        msg = f"Đã xóa toàn bộ các khóa học thuộc danh mục '{cat_clean}'."

    # 🧹 Xóa cache
    course_cache.invalidate(f"all_courses_{table}")
    course_cache.invalidate(f"categories_{table}")
    return {"status": "success", "message": msg}