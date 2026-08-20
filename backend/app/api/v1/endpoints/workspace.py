# backend/app/api/v1/endpoints/workspace.py
from fastapi import APIRouter, Query
from typing import List, Dict, Any
from app.core.supabase import get_supabase_client

router = APIRouter()

# Danh mục Khóa học Mặc định của Pythaverse kèm LMS ID
DEFAULT_COURSES = [
    {"course_code": "SWRP_01", "course_name": "SWRP 1: Exploring the Miniature World with PMinetest (EN)", "lms_id": 102, "category": "SWRP"},
    {"course_code": "SWRP_02", "course_name": "SWRP 2: Coding Adventures in 3D Worlds", "lms_id": 105, "category": "SWRP"},
    {"course_code": "SWRP_04", "course_name": "SWRP 4: Investigating Tech Frontiers: LEANBOT & Digital Twins", "lms_id": 110, "category": "SWRP"},
    {"course_code": "ACIS_01", "course_name": "ACIS I: Applied Connected Intelligence - Sensor Networks & Robotics", "lms_id": 201, "category": "ACIS"},
    {"course_code": "AIROC_PY", "course_name": "AIROC: Python Robotics & Automation Programming", "lms_id": 305, "category": "AIROC"},
    {"course_code": "PLEAT_01", "course_name": "PLearn: STEM & AI Starter Curriculum", "lms_id": 401, "category": "PLEARN"}
]

@router.get("/hierarchy-schools")
async def get_hierarchy_schools(search: str = Query("", description="Tìm kiếm tên trường hoặc mã trường")):
    """Lấy danh sách trường học kèm chuỗi liên thông Partner và Distributor."""
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
        
        # Lấy danh sách Partner & Distributor để map tên
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


@router.get("/courses")
async def get_workspace_courses():
    """Lấy danh mục khóa học Pythaverse kèm đường dẫn trực tiếp trên LMS Moodle."""
    supabase = get_supabase_client()
    try:
        db_courses = supabase.table("workspace_courses").select("*").execute()
        if db_courses.data and len(db_courses.data) > 0:
            courses = []
            for c in db_courses.data:
                cid = c.get("id")
                courses.append({
                    "course_code": c.get("course_code"),
                    "course_name": c.get("course_name"),
                    "lms_id": c.get("default_duration_days", 100),
                    "lms_url": f"http://learn.pythaverse.space/course/view.php?id={c.get('default_duration_days', 100)}"
                })
            return courses
    except Exception:
        pass
        
    # Trả về danh sách mặc định có sẵn LMS URL chuẩn
    return [
        {
            **c,
            "lms_url": f"http://learn.pythaverse.space/course/view.php?id={c['lms_id']}"
        }
        for c in DEFAULT_COURSES
    ]