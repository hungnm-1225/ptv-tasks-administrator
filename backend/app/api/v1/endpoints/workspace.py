# backend/app/api/v1/endpoints/workspace.py
import re
from fastapi import APIRouter, Query, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.core.supabase import get_supabase_client
from app.core.config import settings
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.workspace_playwright_service import workspace_playwright_service
from app.services.workspace.workspace_scanner_service import workspace_scanner_service

router = APIRouter()


class ExtractCOFRequest(BaseModel):
    cof_text: str


# =============================================================================
# 1. PHẢ HỆ VÀ DANH MỤC KHÓA HỌC
# =============================================================================
@router.get("/hierarchy-schools")
async def get_hierarchy_schools(search: str = Query("", description="Tìm kiếm tên trường hoặc mã trường")):
    """Lấy danh sách 480 trường học kèm chuỗi liên thông Partner và Distributor."""
    supabase = get_supabase_client()
    try:
        query = supabase.table("workspace_organizations")\
            .select("id, code, name, role_type, parent_id")\
            .eq("role_type", "school")\
            .order("name", desc=False)
            
        if search:
            query = query.ilike("name", f"%{search}%")
            
        schools_res = query.limit(500).execute()
        schools = schools_res.data or []
        
        all_orgs = supabase.table("workspace_organizations").select("id, code, name, role_type, parent_id").execute()
        org_map = {o["id"]: o for o in (all_orgs.data or [])}
        
        results = []
        for s in schools:
            partner_id = s.get("parent_id")
            partner = org_map.get(partner_id, {})
            dist_id = partner.get("parent_id")
            distributor = org_map.get(dist_id, {})
            
            results.append({
                "school_id": s["id"],
                "school_code": s["code"],
                "school_name": s["name"],
                "partner_name": partner.get("name", "Direct Partner"),
                "partner_code": partner.get("code", "N/A"),
                "distributor_name": distributor.get("name", "Master Distributor"),
                "distributor_code": distributor.get("code", "N/A"),
                "full_lineage": f"{distributor.get('name', 'Distributor')} ➔ {partner.get('name', 'Partner')} ➔ {s['name']}"
            })
            
        return results
    except Exception as e:
        print(f"❌ Lỗi lấy danh sách phả hệ: {e}")
        return []


@router.get("/categories")
async def get_course_categories():
    """Lấy danh sách các Category duy nhất từ database workspace_courses."""
    supabase = get_supabase_client()
    try:
        res = supabase.table("workspace_courses").select("category").execute()
        categories = sorted(list(set(item["category"] for item in (res.data or []) if item.get("category"))))
        if categories:
            return categories
    except Exception as e:
        print(f"⚠️ Lỗi đọc categories: {e}")
    return ["SWRP", "IR", "ASP", "Other"]


@router.get("/courses")
async def get_workspace_courses(category: Optional[str] = Query(None)):
    """Lấy danh mục khóa học từ bảng workspace_courses trên database, hỗ trợ lọc theo Category."""
    supabase = get_supabase_client()
    try:
        query = supabase.table("workspace_courses").select("*").order("course_id")
        if category and category != "all":
            query = query.eq("category", category)
        res = query.execute()
        return res.data or []
    except Exception as e:
        print(f"❌ Lỗi query khóa học: {e}")
        return []


# =============================================================================
# 2. CACHED ENDPOINTS: ĐỌC DỮ LIỆU TỪ SUPABASE CACHE (TỐC ĐỘ 50ms - KHÔNG TỐN RAM)
# =============================================================================
@router.get("/cached-pending-orders")
async def get_cached_pending_orders(
    school_name: Optional[str] = Query(None),
    distributor_code: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Lấy danh sách School Orders từ bảng workspace_orders_cache."""
    supabase = get_supabase_client()
    try:
        query = supabase.table("workspace_orders_cache").select("*").order("order_date", desc=True)
        
        # Chỉ lọc nếu school_name không phải là trường test mặc định
        if school_name and "000 SCHOOL" not in school_name.upper():
            query = query.ilike("school_name", f"%{school_name.strip()}%")
            
        if distributor_code:
            query = query.eq("distributor_code", distributor_code)
            
        res = query.limit(5000).execute()
        return {
            "status": "success",
            "orders": res.data or [],
            "total": len(res.data or []),
            "source": "supabase_cache"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc Cache Orders: {e}")


@router.get("/cached-pending-contracts")
async def get_cached_pending_contracts(
    contract_type: Optional[str] = Query("PRT", description="'PRT' hoặc 'DST'"),
    distributor_code: Optional[str] = Query(None)
):
    """Lấy danh sách Contracts đang chờ duyệt từ bảng workspace_contracts_cache."""
    supabase = get_supabase_client()
    try:
        query = supabase.table("workspace_contracts_cache")\
            .select("*")\
            .eq("contract_type", contract_type.upper())\
            .order("created_at", desc=True)
            
        if distributor_code:
            query = query.eq("distributor_code", distributor_code)
            
        res = query.limit(5000).execute()
        return {
            "status": "success",
            "contracts": res.data or [],
            "total": len(res.data or []),
            "source": "supabase_cache"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc Cache Contracts: {e}")


@router.post("/sync-cache-now")
async def trigger_distributor_cache_sync(background_tasks: BackgroundTasks):
    """Kích hoạt tác vụ quét lại 5 Distributor chạy ngầm ngay lập tức."""
    background_tasks.add_task(workspace_scanner_service.scan_and_cache_all_distributors)
    return {
        "status": "queued",
        "message": "Đã kích hoạt quét và cập nhật Cache 5 Distributor trong nền an toàn!"
    }


# =============================================================================
# 3. LIVE SCRAPERS (BACKUP CHO TRƯỜNG HỢP CẦN CÀO TRỰC TIẾP)
# =============================================================================
@router.get("/pending-school-orders")
async def get_pending_school_orders(
    partner_code: Optional[str] = Query(None),
    school_identifier: Optional[str] = Query(None)
):
    identifier = school_identifier or partner_code or "000 SCHOOL FOR TESTING PURPOSE"
    lineage = workspace_lineage_service.resolve_by_school(identifier)
    
    if not lineage or not lineage.get("partner", {}).get("username"):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tài khoản Partner của '{identifier}'.")
    
    partner_creds = lineage["partner"]
    result = await workspace_playwright_service.fetch_partner_pending_school_orders(partner_creds)
    return result


@router.get("/pending-partner-contracts")
async def get_pending_partner_contracts(
    distributor_code: Optional[str] = Query(None)
):
    identifier = distributor_code or "000 SCHOOL FOR TESTING PURPOSE"
    lineage = workspace_lineage_service.resolve_by_school(identifier)
    
    if not lineage or not lineage.get("distributor", {}).get("username"):
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản Distributor.")
        
    dist_creds = lineage["distributor"]
    result = await workspace_playwright_service.fetch_distributor_pending_contracts(dist_creds)
    return result


@router.get("/pending-distributor-contracts")
async def get_pending_distributor_contracts():
    admin_creds = {
        "username": getattr(settings, "TEST_ADMIN_USER", "salesadmin@dtt.vn"),
        "password": getattr(settings, "TEST_ADMIN_PASS", "Pythaverse@2026")
    }
    result = await workspace_playwright_service.fetch_sales_admin_pending_contracts(admin_creds)
    return result


@router.get("/school-order-details")
async def get_school_order_details(
    order_code: str = Query(..., description="Mã Order của trường (VD: 'SCH-10266-20260821-1347')"),
    school_identifier: Optional[str] = Query(None)
):
    identifier = school_identifier or "000 SCHOOL FOR TESTING PURPOSE"
    lineage = workspace_lineage_service.resolve_by_school(identifier)
    
    if not lineage or not lineage.get("partner", {}).get("username"):
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản Partner.")
        
    partner_creds = lineage["partner"]
    result = await workspace_playwright_service.fetch_school_order_detailed_courses(partner_creds, order_code)
    return result


# =============================================================================
# 4. BÓC TÁCH COF TEXT
# =============================================================================
@router.post("/extract-cof")
async def extract_cof_content(req: ExtractCOFRequest):
    supabase = get_supabase_client()
    text = req.cof_text
    
    school_match = re.search(r"School Name:\s*\(\*\)[,:\s]*\"?([^,\n\r]+)", text, re.IGNORECASE)
    school_name = school_match.group(1).strip() if school_match else "San Beda College Alabang"

    student_match = re.search(r"Total No\. Student:\s*\(\*\)[,:\s]*(\d+)", text, re.IGNORECASE)
    total_students = int(student_match.group(1)) if student_match else 50

    db_courses_res = supabase.table("workspace_courses").select("*").execute()
    db_courses_map = {c["course_id"]: c for c in (db_courses_res.data or [])}

    extracted_courses = []
    lines = text.split("\n")
    
    for line in lines:
        if "learn.pythaverse.space/course/view.php?id=" in line:
            id_match = re.search(r"id=(\d+)", line)
            if id_match:
                course_id = int(id_match.group(1))
                parts = [p.strip().replace('"', '') for p in line.split(",")]
                
                dates = re.findall(r"\b\d{2}[-/]\d{2}[-/]\d{4}\b", line)
                numbers = [int(p) for p in parts if p.isdigit() and int(p) > 0 and int(p) != course_id]
                
                if dates or numbers:
                    start_date = dates[0] if len(dates) >= 1 else "22-06-2026"
                    end_date = dates[1] if len(dates) >= 2 else "30-05-2027"
                    licenses = numbers[-1] if numbers else total_students
                    
                    db_course = db_courses_map.get(course_id)
                    if db_course:
                        category = db_course.get("category", "SWRP")
                        course_name = db_course.get("course_name")
                        lms_url = db_course.get("lms_url")
                    else:
                        category = parts[6].upper() if len(parts) > 6 and parts[6] else "SWRP"
                        course_name = parts[3] if len(parts) > 3 and parts[3] else f"Course #{course_id}"
                        lms_url = f"https://learn.pythaverse.space/course/view.php?id={course_id}"

                    extracted_courses.append({
                        "category": category,
                        "course_id": course_id,
                        "course_name": course_name,
                        "lms_url": lms_url,
                        "licenses": licenses,
                        "start_date": start_date,
                        "end_date": end_date
                    })

    return {
        "school_name": school_name,
        "total_students": total_students,
        "courses": extracted_courses
    }