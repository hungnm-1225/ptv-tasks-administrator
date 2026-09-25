# backend/app/api/v1/endpoints/workspace.py

"""
Pythaverse Central Admin - Workspace Management & Hierarchy Endpoints
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI (Master Enterprise Edition)
"""
import os
import re
import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
from fastapi import APIRouter, Query, HTTPException, BackgroundTasks
from cryptography.fernet import Fernet

from app.core.supabase import get_supabase_client
from app.services.workspace.user_service import WorkspaceUserService
from app.core.config import settings, get_utc_iso
from app.core.cache_policy import BoundedMemoryCache, CacheTier
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.workspace.orchestrator_service import workspace_orchestrator_service
from app.services.workspace.workspace_scanner_service import workspace_scanner_service
from app.services.keycloak_service import keycloak_service
from app.services.excel.cof_service import COFService
from app.services.session_keepalive_service import session_keepalive_service

router = APIRouter()
logger = logging.getLogger(__name__)

# ⚡ IN-MEMORY CACHE CHO PHẢ HỆ VÀ KHÓA HỌC WORKSPACE (TIER A CATALOG - 1ms)
ws_cache = BoundedMemoryCache(tier=CacheTier.TIER_A_CATALOG, max_entries=50, default_ttl=900)


def get_clean_fernet_cipher() -> Optional[Fernet]:
    """Khử sạch dấu ngoặc kép trên Render để khởi tạo Fernet 32-byte chuẩn xác."""
    raw_key = os.getenv("VAULT_SECRET_KEY", "")
    if not raw_key:
        return None
    cleaned_key = str(raw_key).strip().strip('"').strip("'")
    try:
        return Fernet(cleaned_key.encode() if isinstance(cleaned_key, str) else cleaned_key)
    except Exception as e:
        logger.error(f"❌ [Vault] Lỗi khởi tạo Fernet cipher: {e}")
        return None


def sanitize_env_credential(val: Optional[str]) -> str:
    """Khử sạch dấu ngoặc kép hoặc ngoặc đơn bọc ngoài do Render env sinh ra."""
    if not val:
        return ""
    cleaned = str(val).strip()
    if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
        cleaned = cleaned[1:-1]
    return cleaned.strip()


class UserSearchRequest(BaseModel):
    identifier: str


class ExtractCOFRequest(BaseModel):
    cof_text: Optional[str] = None
    file_path: Optional[str] = None


class OrgUpdateRequest(BaseModel):
    name: str
    code: Optional[str] = None
    parent_id: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    drive_folder_url: Optional[str] = None

class OrgCreateRequest(BaseModel):
    name: str
    code: Optional[str] = None
    role_type: str = "school"  # 'distributor' | 'partner' | 'school'
    parent_id: Optional[str] = None
    country: Optional[str] = "Vietnam"
    country_code: Optional[str] = None
    drive_folder_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

# =============================================================================
# 1. PHẢ HỆ VÀ DANH MỤC KHÓA HỌC (ĐÃ NÂNG LÊN 2500 TRƯỜNG - CHỐNG CẮT MẤT VNV SCHOOL)
# =============================================================================
@router.get("/hierarchy-schools")
async def get_hierarchy_schools(
    search: str = Query("", description="Tìm kiếm tên trường hoặc mã trường"),
    force_refresh: bool = Query(False, description="Xóa cache để tải dữ liệu mới nhất")
):
    """Lấy danh sách toàn bộ trường học kèm phả hệ 3 cấp (Không bị giới hạn 500)."""
    cache_key = "all_hierarchy_schools"

    if force_refresh:
        ws_cache.invalidate(cache_key)

    all_schools = ws_cache.get(cache_key)

    if all_schools is None:
        supabase = get_supabase_client()
        try:
            schools_res = supabase.table("workspace_organizations")\
                .select("id, code, name, role_type, parent_id")\
                .eq("role_type", "school")\
                .order("name", desc=False)\
                .limit(2500)\
                .execute()
            schools = schools_res.data or []

            all_orgs = supabase.table("workspace_organizations")\
                .select("id, code, name, role_type, parent_id")\
                .limit(3000)\
                .execute()
            org_map = {o["id"]: o for o in (all_orgs.data or [])}

            results = []
            for s in schools:
                partner_id = s.get("parent_id")
                partner = org_map.get(partner_id, {})
                dist_id = partner.get("parent_id")
                distributor = org_map.get(dist_id, {})

                results.append({
                    "school_id": s["id"],
                    "school_code": s.get("code") or "N/A",
                    "school_name": s["name"],
                    "partner_name": partner.get("name", "Direct Partner"),
                    "partner_code": partner.get("code", "N/A"),
                    "distributor_name": distributor.get("name", "Master Distributor"),
                    "distributor_code": distributor.get("code", "N/A"),
                    "full_lineage": f"{distributor.get('name', 'Distributor')} ➔ {partner.get('name', 'Partner')} ➔ {s['name']}"
                })

            all_schools = results
            ws_cache.set(cache_key, all_schools, ttl=900)
            logger.info(f"✨ [Hierarchy] Đã nạp thành công {len(all_schools)} trường học vào RAM Cache!")
        except Exception as e:
            logger.error(f"❌ Lỗi lấy danh sách phả hệ: {e}")
            return []

    if search:
        s_lower = search.strip().lower()
        return [
            s for s in all_schools
            if s_lower in s["school_name"].lower()
            or s_lower in str(s["school_code"]).lower()
            or s_lower in str(s["partner_name"]).lower()
            or s_lower in str(s["distributor_name"]).lower()
        ]

    return all_schools


@router.get("/categories")
async def get_course_categories():
    cache_key = "workspace_categories"
    cached = ws_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    try:
        res = supabase.table("workspace_courses").select("category").execute()
        categories = sorted(list(set(item["category"] for item in (res.data or []) if item.get("category"))))
        if categories:
            ws_cache.set(cache_key, categories, ttl=900)
            return categories
    except Exception as e:
        logger.warning(f"⚠️ Lỗi đọc categories: {e}")
    return ["SWRP", "IR", "ASP", "Other"]


@router.get("/courses")
async def get_workspace_courses(category: Optional[str] = Query(None)):
    cache_key = f"workspace_courses_{category or 'all'}"
    cached = ws_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    try:
        query = supabase.table("workspace_courses").select("*").order("course_id")
        if category and category != "all":
            query = query.eq("category", category)
        res = query.execute()
        data = res.data or []
        ws_cache.set(cache_key, data, ttl=600)
        return data
    except Exception as e:
        logger.error(f"❌ Lỗi query khóa học: {e}")
        return []


# =============================================================================
# 2. CACHED ENDPOINTS: ĐỌC DỮ LIỆU TỪ SUPABASE CACHE
# =============================================================================
@router.get("/cached-pending-orders")
async def get_cached_pending_orders(
    school_name: Optional[str] = Query(None),
    distributor_code: Optional[str] = Query(None)
):
    cache_key = "all_cached_pending_orders"
    cached_orders = ws_cache.get(cache_key)

    if cached_orders is None:
        supabase = get_supabase_client()
        try:
            query = supabase.table("workspace_orders_cache").select("*").order("order_date", desc=True)
            res = query.limit(5000).execute()
            cached_orders = res.data or []
            ws_cache.set(cache_key, cached_orders, ttl=300)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi đọc Cache Orders: {e}")

    orders = cached_orders
    if school_name and "000 SCHOOL" not in school_name.upper():
        s_clean = school_name.strip().lower()
        orders = [o for o in orders if s_clean in (o.get("school_name") or "").lower()]

    if distributor_code:
        orders = [o for o in orders if o.get("distributor_code") == distributor_code]

    return {
        "status": "success",
        "orders": orders,
        "total": len(orders),
        "source": "ram_memory_cache"
    }


@router.get("/cached-pending-contracts")
async def get_cached_pending_contracts(
    contract_type: Optional[str] = Query("PRT", description="'PRT' hoặc 'DST'"),
    distributor_code: Optional[str] = Query(None)
):
    c_type = (contract_type or "PRT").upper()
    cache_key = f"all_cached_pending_contracts_{c_type}"
    cached_contracts = ws_cache.get(cache_key)

    if cached_contracts is None:
        supabase = get_supabase_client()
        try:
            query = supabase.table("workspace_contracts_cache")\
                .select("*")\
                .eq("contract_type", c_type)\
                .order("created_at", desc=True)
            res = query.limit(5000).execute()
            cached_contracts = res.data or []
            ws_cache.set(cache_key, cached_contracts, ttl=300)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi đọc Cache Contracts: {e}")

    contracts = cached_contracts
    if distributor_code:
        contracts = [c for c in contracts if c.get("distributor_code") == distributor_code]

    return {
        "status": "success",
        "contracts": contracts,
        "total": len(contracts),
        "source": "ram_memory_cache"
    }


async def _run_sync_and_invalidate():
    await workspace_scanner_service.scan_and_cache_all_distributors()
    ws_cache.invalidate("all_cached_pending_orders")
    ws_cache.invalidate("all_cached_pending_contracts_PRT")
    ws_cache.invalidate("all_cached_pending_contracts_DST")


@router.post("/sync-cache-now")
async def trigger_distributor_cache_sync(background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_sync_and_invalidate)
    return {
        "status": "queued",
        "message": "Đã kích hoạt quét thông minh (Smart Fast Sync) 5 Distributor trong nền an toàn!"
    }


@router.get("/school-order-details")
async def get_school_order_details(
    order_code: str = Query(..., description="Mã Order của trường"),
    school_identifier: Optional[str] = Query(None)
):
    identifier = school_identifier or "000 SCHOOL FOR TESTING PURPOSE"
    lineage = workspace_lineage_service.resolve_by_school(identifier)

    if not lineage or not lineage.get("partner", {}).get("username"):
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản Partner.")

    partner_creds = lineage["partner"]
    result = await workspace_orchestrator_service.fetch_school_order_detailed_courses(partner_creds, order_code)
    return result


# =============================================================================
# 3. BÓC TÁCH FILE COF VÀ KEYCLOAK LOOKUP
# =============================================================================
@router.post("/extract-cof")
async def extract_cof_content(req: ExtractCOFRequest):
    if req.file_path and os.path.exists(req.file_path):
        try:
            return COFService.parse_cof_file(req.file_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Lỗi đọc file COF: {e}")

    text = req.cof_text or ""
    supabase = get_supabase_client()

    school_match = re.search(r"School Name:\s*\(\*\)[,:\s]*\"?([^,\n\r]+)", text, re.IGNORECASE)
    school_name = school_match.group(1).strip() if school_match else "Pythaverse School"

    student_match = re.search(r"Total No\. Student:\s*\(\*\)[,:\s]*(\d+)", text, re.IGNORECASE)
    total_students = int(student_match.group(1)) if student_match else 50

    cached_courses = ws_cache.get("workspace_courses_all")
    if not cached_courses:
        db_courses_res = supabase.table("workspace_courses").select("*").execute()
        cached_courses = db_courses_res.data or []
        ws_cache.set("workspace_courses_all", cached_courses, ttl=600)

    db_courses_map = {c["course_id"]: c for c in cached_courses}
    extracted_courses = []

    for line in text.split("\n"):
        if "learn.pythaverse.space/course/view.php?id=" in line:
            id_match = re.search(r"id=(\d+)", line)
            if id_match:
                course_id = int(id_match.group(1))
                parts = [p.strip().replace('"', '') for p in line.split(",")]
                dates = re.findall(r"\b\d{2}[-/]\d{2}[-/]\d{4}\b", line)
                numbers = [int(p) for p in parts if p.isdigit() and int(p) > 0 and int(p) != course_id]

                if dates or numbers:
                    start_date = dates[0] if len(dates) >= 1 else "2026-09-16"
                    end_date = dates[1] if len(dates) >= 2 else "2027-09-16"
                    licenses = numbers[-1] if numbers else total_students

                    db_course = db_courses_map.get(course_id)
                    category = db_course.get("category", "SWRP") if db_course else "SWRP"
                    course_name = db_course.get("course_name") if db_course else f"Course #{course_id}"
                    lms_url = db_course.get("lms_url") if db_course else f"https://learn.pythaverse.space/course/view.php?id={course_id}"

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


@router.post("/keycloak-lookup")
async def lookup_keycloak_users(payload: Dict[str, Any]):
    raw_list = payload.get("identifiers") or payload.get("emails") or []
    if isinstance(raw_list, str):
        raw_list = [raw_list]
    results = await keycloak_service.lookup_user_details(raw_list)
    return {"users": results}


# =============================================================================
# 4. TRA CỨU & BÓC TÁCH CHI TIẾT USER (ĐÃ SỬA THÔNG BÁO LỖI MINH BẠCH)
# =============================================================================
@router.post("/users/search-and-detail")
async def get_user_search_and_detail(payload: UserSearchRequest):
    """
    Dò tìm user_id và đọc chi tiết người dùng từ Workspace.
    Khử sạch dấu ngoặc kép của Render cho mật khẩu chứa ký tự đặc biệt @#!
    """
    raw_user = os.getenv("TEST_ADMIN_USER")
    raw_pass = os.getenv("TEST_ADMIN_PASS")

    admin_user = sanitize_env_credential(raw_user)
    admin_pass = sanitize_env_credential(raw_pass)

    if not admin_user or not admin_pass:
        return {
            "success": False,
            "message": "Chưa cấu hình biến môi trường TEST_ADMIN_USER hoặc TEST_ADMIN_PASS trên Render!"
        }

    try:
        data = await WorkspaceUserService.get_user_detail_by_identifier(
            admin_user=admin_user,
            admin_pass=admin_pass,
            identifier=payload.identifier.strip()
        )
        return data
    except Exception as e:
        logger.error(f"❌ [UserDetailAPI] Lỗi tra cứu người dùng '{payload.identifier}': {e}", exc_info=True)
        # 🎯 CHỐNG MESSAGE RỖNG: Luôn trả về thông báo lỗi dễ hiểu cho người dùng
        err_msg = str(e).strip() or "Hệ thống đang bận đồng bộ phiên đăng nhập Admin, vui lòng thử lại sau vài giây!"
        return {
            "success": False,
            "message": f"Không thể tra cứu hồ sơ: {err_msg}"
        }


# =============================================================================
# 5. QUẢN TRỊ PHẢ HỆ 3 TẦNG & KÉT SẮT FERNET VAULT
# =============================================================================
@router.get("/hierarchy-manage")
async def get_hierarchy_manage():
    db = get_supabase_client()
    try:
        orgs_res = db.table("workspace_organizations").select(
            "id, name, code, role_type, parent_id, country, country_code, drive_folder_url, drive_folder_id, created_at"
        ).order("name").limit(3000).execute()
        all_orgs = orgs_res.data or []

        vault_res = db.table("workspace_credentials_vault").select("org_id, username, encrypted_password, updated_at").execute()
        vault_map = {v["org_id"]: v for v in (vault_res.data or []) if v.get("org_id")}

        org_dict = {o["id"]: o for o in all_orgs}
        result_orgs = []

        for org in all_orgs:
            o_id = org["id"]
            role = org.get("role_type")
            parent_id = org.get("parent_id")

            parent = org_dict.get(parent_id) if parent_id else None
            distributor = None

            if role == "distributor":
                distributor = org
            elif role == "partner":
                distributor = parent
            elif role == "school":
                if parent:
                    distributor = org_dict.get(parent.get("parent_id"))

            resolved_country = (
                org.get("country") or
                (parent.get("country") if parent else None) or
                (distributor.get("country") if distributor else None) or
                "Vietnam"
            )

            resolved_drive_url = (
                org.get("drive_folder_url") or
                (distributor.get("drive_folder_url") if distributor else None) or
                ""
            )

            v_info = vault_map.get(o_id)
            has_vault = bool(v_info and v_info.get("encrypted_password"))
            username = v_info.get("username") if v_info else ""

            result_orgs.append({
                "id": o_id,
                "code": org.get("code") or "N/A",
                "name": org.get("name") or "",
                "role_type": role,
                "parent_id": parent_id,
                "parent_name": parent.get("name") if parent else ("Đơn vị Master" if role == "distributor" else "Trực tiếp"),
                "parent_code": parent.get("code") if parent else "",
                "distributor_id": distributor.get("id") if distributor else None,
                "distributor_name": distributor.get("name") if distributor else ("Chính nó" if role == "distributor" else "N/A"),
                "country": resolved_country,
                "country_code": org.get("country_code") or "",
                "drive_folder_url": resolved_drive_url,
                "drive_folder_id": org.get("drive_folder_id") or "",
                "username": username,
                "has_vault_pass": has_vault,
                "vault_updated_at": v_info.get("updated_at") if v_info else None
            })

        distributors = [{"id": o["id"], "name": o["name"], "code": o.get("code", "")} for o in all_orgs if o.get("role_type") == "distributor"]
        partners = [{"id": o["id"], "name": o["name"], "code": o.get("code", ""), "parent_id": o.get("parent_id")} for o in all_orgs if o.get("role_type") == "partner"]

        return {
            "status": "success",
            "total": len(result_orgs),
            "organizations": result_orgs,
            "distributors": distributors,
            "partners": partners
        }
    except Exception as e:
        logger.error(f"Lỗi lấy dữ liệu hierarchy-manage: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/organizations/{org_id}/vault-password")
async def get_org_vault_password(org_id: str):
    db = get_supabase_client()
    try:
        resp = db.table("workspace_credentials_vault").select("encrypted_password, username").eq("org_id", org_id).execute()

        if not resp.data or not resp.data[0].get("encrypted_password"):
            org_res = db.table("workspace_organizations").select("username").eq("id", org_id).execute()
            if org_res.data and org_res.data[0].get("username"):
                u_name = org_res.data[0]["username"]
                resp = db.table("workspace_credentials_vault").select("encrypted_password").eq("username", u_name).execute()

        if not resp.data or not resp.data[0].get("encrypted_password"):
            return {"password": ""}

        enc_pass = resp.data[0]["encrypted_password"]

        if not enc_pass.startswith("gAAAAA"):
            return {"password": enc_pass}

        cipher = get_clean_fernet_cipher()
        if not cipher:
            return {"password": enc_pass}

        decrypted = cipher.decrypt(enc_pass.encode()).decode("utf-8")
        return {"password": decrypted}
    except Exception as e:
        logger.error(f"❌ [Vault] Lỗi giải mã mật khẩu két sắt cho org {org_id}: {e}")
        return {"password": ""}


@router.get("/countries")
async def get_workspace_countries():
    db = get_supabase_client()
    try:
        resp = db.table("workspace_countries").select("*").eq("is_active", True).order("name").execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Lỗi đọc danh mục countries: {e}")
        return [
            {"code": "VN", "name": "Vietnam", "flag_emoji": "🇻🇳"},
            {"code": "MY", "name": "Malaysia", "flag_emoji": "🇲🇾"},
            {"code": "ID", "name": "Indonesia", "flag_emoji": "🇮🇩"},
            {"code": "PH", "name": "Philippines", "flag_emoji": "🇵🇭"},
        ]



@router.delete("/organizations/{org_id}")
async def delete_organization(org_id: str):
    """Xóa bỏ một đơn vị khỏi hệ thống (Bảo vệ: Chặn xóa nếu còn đơn vị cấp con)."""
    supabase = get_supabase_client()
    try:
        check_res = supabase.table("workspace_organizations").select("id, name, role_type").eq("id", org_id).execute()
        if not check_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn vị yêu cầu.")
        org = check_res.data[0]

        # Chặn xoá nếu đang có trường/đối tác con trực thuộc
        children = supabase.table("workspace_organizations").select("id").eq("parent_id", org_id).limit(1).execute()
        if children.data:
            raise HTTPException(status_code=400, detail="Không thể xóa đơn vị này vì đang có các đơn vị trực thuộc cấp dưới!")

        # Xóa vault credentials liên kết trước
        supabase.table("workspace_credentials_vault").delete().eq("org_id", org_id).execute()

        # Xóa organization
        supabase.table("workspace_organizations").delete().eq("id", org_id).execute()

        # Invalidate cache
        ws_cache.invalidate("all_hierarchy_schools")

        return {
            "status": "success",
            "message": f"Đã xóa thành công đơn vị '{org['name']}'!"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Lỗi xóa organization {org_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ: {str(e)}")

# =============================================================================
# KIỂM TRA TRÙNG MÃ ID / CODE REALTIME & QUẢN TRỊ PHẢ HỆ CHẶT CHẼ
# =============================================================================
@router.get("/organizations/check-code")
async def check_organization_code(
    code: str = Query(..., description="Mã định danh cần kiểm tra"),
    exclude_id: Optional[str] = Query(None, description="ID bản ghi bỏ qua khi kiểm tra lúc edit")
):
    """Kiểm tra xem mã định danh (Code/ID) đã tồn tại trong hệ thống hay chưa."""
    clean_code = code.strip()
    if not clean_code:
        return {"exists": False}

    supabase = get_supabase_client()
    try:
        query = supabase.table("workspace_organizations")\
            .select("id, name, code, role_type")\
            .ilike("code", clean_code)
        
        if exclude_id and exclude_id.strip():
            query = query.neq("id", exclude_id.strip())
            
        res = query.limit(1).execute()
        if res.data:
            matched = res.data[0]
            role_vi = {
                "distributor": "Nhà Phân Phối",
                "partner": "Đối Tác",
                "school": "Trường Học"
            }.get(matched.get("role_type", ""), matched.get("role_type", ""))
            return {
                "exists": True,
                "conflict_with": {
                    "id": matched["id"],
                    "name": matched["name"],
                    "code": matched.get("code"),
                    "role_type": role_vi
                },
                "message": f"Mã '{clean_code}' đã được sử dụng bởi {role_vi}: '{matched['name']}'!"
            }
        return {"exists": False}
    except Exception as e:
        logger.error(f"❌ Lỗi kiểm tra trùng mã code '{clean_code}': {e}")
        return {"exists": False}


@router.post("/organizations")
async def create_organization(payload: OrgCreateRequest):
    """
    Khởi tạo Đơn vị mới thủ công trong Database bên mình.
    CƯỠNG CHẾ RÀNG BUỘC PHẢ HỆ 3 TẦNG:
    - School BẮT BUỘC thuộc 1 Partner.
    - Partner BẮT BUỘC thuộc 1 Distributor.
    - Distributor là cấp cao nhất (parent_id = NULL).
    """
    supabase = get_supabase_client()
    try:
        name_clean = payload.name.strip()
        if not name_clean:
            raise HTTPException(status_code=400, detail="Tên đơn vị/tổ chức không được để trống!")

        role_type = (payload.role_type or "school").strip().lower()
        if role_type not in ["distributor", "partner", "school"]:
            raise HTTPException(status_code=400, detail="Cấp bậc thực thể không hợp lệ.")

        # 1. KIỂM TRA DUPLICATE CODE CHỐNG TRÙNG LẶP TUYỆT ĐỐI
        clean_code = payload.code.strip() if payload.code and payload.code.strip() else None
        if clean_code:
            dup_check = supabase.table("workspace_organizations")\
                .select("id, name, role_type")\
                .ilike("code", clean_code)\
                .execute()
            if dup_check.data:
                exist_item = dup_check.data[0]
                raise HTTPException(
                    status_code=400, 
                    detail=f"Mã định danh (ID/Code) '{clean_code}' đã tồn tại ở {exist_item.get('role_type').upper()}: '{exist_item.get('name')}'!"
                )

        # 2. RÀNG BUỘC PHẢ HỆ CHẶT CHẼ THEO CẤP BẬC
        clean_parent_id = payload.parent_id.strip() if payload.parent_id and payload.parent_id.strip() else None

        if role_type == "distributor":
            # Distributor là đỉnh Master, không có parent_id
            clean_parent_id = None

        elif role_type == "partner":
            # Partner BẮT BUỘC phải có Distributor làm cha
            if not clean_parent_id:
                raise HTTPException(status_code=400, detail="Đối Tác (Partner) bắt buộc phải trực thuộc một Nhà Phân Phối (Distributor)!")
            parent_check = supabase.table("workspace_organizations").select("id, name, role_type").eq("id", clean_parent_id).execute()
            if not parent_check.data:
                raise HTTPException(status_code=400, detail="Nhà Phân Phối được chọn không tồn tại trong hệ thống!")
            if parent_check.data[0].get("role_type") != "distributor":
                raise HTTPException(status_code=400, detail="Cấp trên của Đối Tác bắt buộc phải là một Nhà Phân Phối (Distributor)!")

        elif role_type == "school":
            # School BẮT BUỘC phải có Partner làm cha
            if not clean_parent_id:
                raise HTTPException(status_code=400, detail="Trường Học (School) bắt buộc phải trực thuộc một Đối Tác (Partner)!")
            parent_check = supabase.table("workspace_organizations").select("id, name, role_type").eq("id", clean_parent_id).execute()
            if not parent_check.data:
                raise HTTPException(status_code=400, detail="Đối Tác được chọn không tồn tại trong hệ thống!")
            if parent_check.data[0].get("role_type") != "partner":
                raise HTTPException(status_code=400, detail="Cấp trên của Trường Học bắt buộc phải là một Đối Tác (Partner)!")

        # 3. Bóc tách Google Drive Folder ID
        drive_id = None
        if payload.drive_folder_url:
            clean_url = payload.drive_folder_url.strip()
            match = re.search(r'folders/([a-zA-Z0-9-_]+)', clean_url)
            drive_id = match.group(1) if match else clean_url

        # 4. Chuẩn hóa Quốc gia
        country = payload.country.strip() if (payload.country and payload.country != "Unknown") else "Vietnam"
        country_code = payload.country_code
        if not country_code and country:
            c_map = {"Vietnam": "VN", "Malaysia": "MY", "Indonesia": "ID", "Philippines": "PH"}
            country_code = c_map.get(country, "VN")

        now_iso = get_utc_iso()

        # 5. Insert vào bảng workspace_organizations
        new_org_data = {
            "name": name_clean,
            "code": clean_code,
            "role_type": role_type,
            "parent_id": clean_parent_id,
            "country": country,
            "country_code": country_code,
            "drive_folder_url": payload.drive_folder_url.strip() if payload.drive_folder_url else None,
            "drive_folder_id": drive_id,
            "created_at": now_iso
        }

        insert_res = supabase.table("workspace_organizations").insert(new_org_data).execute()
        if not insert_res.data:
            raise HTTPException(status_code=500, detail="Không thể tạo bản ghi tổ chức trong CSDL.")

        created_org = insert_res.data[0]
        org_id = created_org["id"]

        # 6. Mã hóa Fernet và lưu vào Vault nếu có tài khoản
        vault_created = False
        if (payload.username and payload.username.strip()) or (payload.password and payload.password.strip()):
            encrypted_pass = ""
            if payload.password and payload.password.strip():
                cipher = get_clean_fernet_cipher()
                if cipher:
                    encrypted_pass = cipher.encrypt(payload.password.strip().encode()).decode()
                else:
                    encrypted_pass = payload.password.strip()

            new_vault = {
                "org_id": org_id,
                "account_role": role_type,
                "username": (payload.username or "").strip(),
                "encrypted_password": encrypted_pass,
                "is_active": True,
                "updated_at": now_iso
            }
            supabase.table("workspace_credentials_vault").insert(new_vault).execute()
            vault_created = True

        # 7. Xóa sạch RAM Cache để phản ánh ngay lập tức
        ws_cache.invalidate("all_hierarchy_schools")

        logger.info(f"✨ [Hierarchy] Đã tạo mới {role_type.upper()}: {name_clean} (ID: {org_id})")
        return {
            "status": "success",
            "message": f"Đã khởi tạo thành công {role_type} '{name_clean}'!",
            "data": created_org,
            "vault_created": vault_created
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Lỗi tạo mới organization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ: {str(e)}")


@router.put("/organizations/{org_id}")
async def update_organization_and_vault(org_id: str, payload: OrgUpdateRequest):
    """Cập nhật thông tin thực thể, thẩm định phả hệ và bảo vệ Fernet Vault."""
    supabase = get_supabase_client()
    try:
        check_res = supabase.table("workspace_organizations").select("*").eq("id", org_id).execute()
        if not check_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy tổ chức yêu cầu.")

        current_org = check_res.data[0]
        role_type = current_org.get("role_type", "school")

        # 1. Chống tự làm cha của chính mình
        if payload.parent_id and payload.parent_id == org_id:
            raise HTTPException(status_code=400, detail="Một đơn vị không thể tự làm cấp cha của chính mình!")

        # 2. Kiểm tra trùng mã ID/Code với đơn vị khác
        clean_code = payload.code.strip() if payload.code and payload.code.strip() else None
        if clean_code:
            dup_check = supabase.table("workspace_organizations")\
                .select("id, name, role_type")\
                .ilike("code", clean_code)\
                .neq("id", org_id)\
                .execute()
            if dup_check.data:
                exist_item = dup_check.data[0]
                raise HTTPException(
                    status_code=400,
                    detail=f"Mã định danh (ID/Code) '{clean_code}' đang thuộc về {exist_item.get('role_type').upper()}: '{exist_item.get('name')}'!"
                )

        # 3. Ràng buộc phả hệ khi update
        clean_parent_id = payload.parent_id.strip() if payload.parent_id and payload.parent_id.strip() else None
        if role_type == "distributor":
            clean_parent_id = None
        elif role_type == "partner":
            if not clean_parent_id:
                raise HTTPException(status_code=400, detail="Đối Tác bắt buộc phải trực thuộc một Nhà Phân Phối (Distributor)!")
        elif role_type == "school":
            if not clean_parent_id:
                raise HTTPException(status_code=400, detail="Trường Học bắt buộc phải trực thuộc một Đối Tác (Partner)!")

        drive_id = None
        if payload.drive_folder_url:
            clean_url = payload.drive_folder_url.strip()
            match = re.search(r'folders/([a-zA-Z0-9-_]+)', clean_url)
            drive_id = match.group(1) if match else clean_url

        country_code = payload.country_code
        if payload.country and not country_code:
            c_map = {"Vietnam": "VN", "Malaysia": "MY", "Indonesia": "ID", "Philippines": "PH"}
            country_code = c_map.get(payload.country, "")

        update_org_data: Dict[str, Any] = {
            "name": payload.name.strip(),
            "code": clean_code,
            "parent_id": clean_parent_id,
            "country": payload.country.strip() if (payload.country and payload.country != "Unknown") else "Vietnam",
            "country_code": country_code,
            "drive_folder_url": payload.drive_folder_url.strip() if payload.drive_folder_url else None,
            "drive_folder_id": drive_id,
        }

        supabase.table("workspace_organizations").update(update_org_data).eq("id", org_id).execute()

        vault_updated = False
        if payload.username is not None or payload.password:
            vault_check = supabase.table("workspace_credentials_vault").select("id").eq("org_id", org_id).execute()
            vault_record = vault_check.data[0] if vault_check.data else None

            encrypted_pass = None
            if payload.password and payload.password.strip():
                cipher = get_clean_fernet_cipher()
                if cipher:
                    encrypted_pass = cipher.encrypt(payload.password.strip().encode()).decode()
                else:
                    encrypted_pass = payload.password.strip()

            now_iso = get_utc_iso()
            if vault_record:
                vault_payload: Dict[str, Any] = {"updated_at": now_iso}
                if payload.username is not None:
                    vault_payload["username"] = payload.username.strip()
                if encrypted_pass:
                    vault_payload["encrypted_password"] = encrypted_pass

                supabase.table("workspace_credentials_vault").update(vault_payload).eq("id", vault_record["id"]).execute()
                vault_updated = True
            else:
                new_vault = {
                    "org_id": org_id,
                    "account_role": current_org.get("role_type", "school"),
                    "username": (payload.username or "").strip(),
                    "encrypted_password": encrypted_pass or "",
                    "is_active": True,
                    "updated_at": now_iso
                }
                supabase.table("workspace_credentials_vault").insert(new_vault).execute()
                vault_updated = True

        ws_cache.invalidate("all_hierarchy_schools")
        return {
            "status": "success",
            "message": f"Đã cập nhật thành công phả hệ và cấu hình của '{payload.name or current_org['name']}'!",
            "vault_updated": vault_updated
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Lỗi cập nhật organization {org_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ: {str(e)}")

@router.post("/prewarm-all-sessions")
async def trigger_prewarm_all_sessions(background_tasks: BackgroundTasks):
    """⚡ ÉP GIEO MẦM & LÀM TƯƠI TOÀN BỘ 7 PHÂN HỆ VÀO BẢNG SUPABASE NGAY LẬP TỨC."""
    background_tasks.add_task(session_keepalive_service.keep_alive_all_sessions)
    return {
        "status": "queued",
        "message": "Đang kích hoạt gieo mầm và nạp toàn bộ Session vào Supabase trong nền!"
    }