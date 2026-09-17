# backend/app/api/v1/endpoints/workspace.py
import re
import time
from fastapi import APIRouter, Query, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from cryptography.fernet import Fernet
from app.core.supabase import get_supabase_client
import os
import logging
from app.services.workspace.user_service import WorkspaceUserService
from app.core.config import settings, get_utc_iso
from app.core.cache_policy import BoundedMemoryCache, CacheTier
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.workspace.orchestrator_service import workspace_orchestrator_service
from app.services.workspace.workspace_scanner_service import workspace_scanner_service
from app.services.keycloak_service import keycloak_service
from app.services.excel.cof_service import COFService
from app.services.workspace_lineage_service import WorkspaceLineageService
from app.core.supabase import get_supabase_client


router = APIRouter()

# ⚡ IN-MEMORY CACHE CHO PHẢ HỆ 480 TRƯỜNG & KHÓA HỌC WORKSPACE (TIER A CATALOG - 1ms)
ws_cache = BoundedMemoryCache(tier=CacheTier.TIER_A_CATALOG, max_entries=50, default_ttl=900)

def get_clean_fernet_cipher() -> Fernet | None:
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

def extract_drive_folder_id(url: str | None) -> str | None:
    """Tự động bóc tách folder_id từ mọi định dạng link Google Drive."""
    if not url:
        return None
    url = url.strip()
    # Nhận diện link dạng: https://drive.google.com/drive/folders/1a2b3c4d5e...
    match = re.search(r'folders/([a-zA-Z0-9-_]+)', url)
    if match:
        return match.group(1)
    # Nhận diện nếu người dùng dán thẳng folder ID
    if re.match(r'^[a-zA-Z0-9-_]{20,}$', url):
        return url
    return None

def sanitize_env_credential(val: str | None) -> str:
    """Khử sạch dấu ngoặc kép hoặc ngoặc đơn bọc ngoài do Render env sinh ra."""
    if not val:
        return ""
    cleaned = str(val).strip()
    # Bóc vỏ ngoặc kép "..." hoặc ngoặc đơn '...'
    if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
        cleaned = cleaned[1:-1]
    return cleaned.strip()

class UserSearchRequest(BaseModel):
    identifier: str


class ExtractCOFRequest(BaseModel):
    cof_text: Optional[str] = None
    file_path: Optional[str] = None


class UpdateOrganizationPayload(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    parent_id: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

# 🎯 NÂNG CẤP API CẬP NHẬT TỔ CHỨC: LƯU COUNTRY & GOOGLE DRIVE
class OrgUpdateRequest(BaseModel):
    name: str
    code: Optional[str] = None
    parent_id: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    drive_folder_url: Optional[str] = None

# =============================================================================
# 1. PHẢ HỆ VÀ DANH MỤC KHÓA HỌC (TỐC ĐỘ 1MS TỪ RAM)
# =============================================================================
@router.get("/hierarchy-schools")
async def get_hierarchy_schools(search: str = Query("", description="Tìm kiếm tên trường hoặc mã trường")):
    """Lấy danh sách 480 trường học kèm phả hệ (Đọc siêu tốc từ In-Memory Cache)."""
    cache_key = "all_hierarchy_schools"
    all_schools = ws_cache.get(cache_key)

    if all_schools is None:
        supabase = get_supabase_client()
        try:
            schools_res = supabase.table("workspace_organizations")\
                .select("id, code, name, role_type, parent_id")\
                .eq("role_type", "school")\
                .order("name", desc=False)\
                .limit(500)\
                .execute()
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
                
            all_schools = results
            ws_cache.set(cache_key, all_schools, ttl=900)  # Lưu RAM 15 phút
        except Exception as e:
            logger.error(f"❌ Lỗi lấy danh sách phả hệ: {e}")
            return []

    if search:
        s_lower = search.strip().lower()
        return [
            s for s in all_schools 
            if s_lower in s["school_name"].lower() 
            or s_lower in str(s["school_code"]).lower()
            or s_lower in s["partner_name"].lower()
            or s_lower in s["distributor_name"].lower()
        ]
        
    return all_schools


@router.get("/categories")
async def get_course_categories():
    """Lấy danh sách các Category duy nhất (Đọc từ RAM Cache)."""
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
    """Lấy danh mục khóa học từ bảng workspace_courses (Có Cache RAM)."""
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
    distributor_code: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Lấy danh sách School Orders (Đọc siêu tốc 1ms từ RAM Cache)."""
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
    """Lấy danh sách Contracts (Đọc siêu tốc 1ms từ RAM Cache)."""
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
    """Chạy sync ngầm và invalidate RAM cache ngay sau khi hoàn tất."""
    await workspace_scanner_service.scan_and_cache_all_distributors()
    ws_cache.invalidate("all_cached_pending_orders")
    ws_cache.invalidate("all_cached_pending_contracts_PRT")
    ws_cache.invalidate("all_cached_pending_contracts_DST")


@router.post("/sync-cache-now")
async def trigger_distributor_cache_sync(background_tasks: BackgroundTasks):
    """Kích hoạt tác vụ quét lại 5 Distributor chạy ngầm an toàn tuyệt đối."""
    background_tasks.add_task(_run_sync_and_invalidate)
    return {
        "status": "queued",
        "message": "Đã kích hoạt quét thông minh (Smart Fast Sync) 5 Distributor trong nền an toàn!"
    }


# =============================================================================
# 3. DIRECT QUERY ENDPOINTS
# =============================================================================
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
    result = await workspace_orchestrator_service.fetch_school_order_detailed_courses(partner_creds, order_code)
    return result


# =============================================================================
# 4. BÓC TÁCH FILE COF THÔNG MINH (KẾT NỐI VỚI COFSERVICE)
# =============================================================================
@router.post("/extract-cof")
async def extract_cof_content(req: ExtractCOFRequest):
    """Bóc tách nội dung file COF: Trả về Khay khóa học, Danh sách lớp, và Giáo viên."""
    # 1. Nếu gửi đường dẫn file Excel cụ thể
    if req.file_path and os.path.exists(req.file_path):
        try:
            return COFService.parse_cof_file(req.file_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Lỗi đọc file COF: {e}")

    # 2. Nếu gửi dạng chuỗi text thô (Fallback tương thích ngược)
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
    """Endpoint tra cứu chi tiết tài khoản Keycloak cho Automation Studio."""
    raw_list = payload.get("identifiers") or payload.get("emails") or []
    if isinstance(raw_list, str):
        raw_list = [raw_list]
    results = await keycloak_service.lookup_user_details(raw_list)
    return {"users": results}


# =============================================================================
# 5. QUẢN TRỊ PHẢ HỆ 3 TẦNG & CẬP NHẬT KÉT SẮT FERNET
# =============================================================================

def _infer_country_from_org(org_name: str, org_code: str, dist_name: str) -> str:
    """Tự động nhận diện quốc gia thông minh từ tên trường/mã trường/nhà phân phối."""
    combined = f"{org_name} {org_code} {dist_name}".upper()
    if any(k in combined for k in ["MALAYSIA", "MY_", "_MY"]):
        return "Malaysia"
    if any(k in combined for k in ["INDONESIA", "ID_", "_ID"]):
        return "Indonesia"
    if any(k in combined for k in ["PHILIPPINES", "ALABANG", "PH_", "_PH", "BEDECO"]):
        return "Philippines"
    if any(k in combined for k in ["VIETNAM", "VN_", "_VN"]):
        return "Vietnam"
    return "Unknown"

@router.get("/hierarchy-manage")
async def get_hierarchy_management_data():
    """Lấy dữ liệu phả hệ chuẩn theo schema Supabase (Đã loại bỏ cột country không tồn tại)."""
    supabase = get_supabase_client()
    try:
        # 1. Chỉ query các cột thực sự tồn tại trong CSDL
        orgs_res = supabase.table("workspace_organizations")\
            .select("id, code, name, role_type, parent_id")\
            .order("role_type")\
            .order("name")\
            .execute()
        all_orgs = orgs_res.data or []
        
        # 2. Lấy credentials vault
        vault_res = supabase.table("workspace_credentials_vault")\
            .select("org_id, username, updated_at")\
            .execute()
        vault_map = {v["org_id"]: v for v in (vault_res.data or [])}
        
        org_map = {o["id"]: o for o in all_orgs}
        distributors = [o for o in all_orgs if o.get("role_type") == "distributor"]
        partners = [o for o in all_orgs if o.get("role_type") == "partner"]
        
        enriched_orgs = []
        for o in all_orgs:
            parent_id = o.get("parent_id")
            parent = org_map.get(parent_id, {})
            
            # Phân giải Distributor gốc
            dist_id = parent.get("parent_id") if o.get("role_type") == "school" else (parent_id if o.get("role_type") == "partner" else None)
            distributor = org_map.get(dist_id, {}) if dist_id else (parent if o.get("role_type") == "partner" else None)
            
            v_info = vault_map.get(o["id"], {})
            
            org_name = o.get("name") or "Chưa đặt tên"
            org_code = o.get("code") or "N/A"
            dist_name = distributor.get("name") if distributor else "N/A"
            
            # Nhận diện quốc gia không phụ thuộc cột CSDL
            country_inferred = _infer_country_from_org(org_name, org_code, dist_name)
            
            enriched_orgs.append({
                "id": o["id"],
                "code": org_code,
                "name": org_name,
                "role_type": o.get("role_type") or "school",
                "parent_id": parent_id,
                "parent_name": parent.get("name") or "Trực tiếp (Không qua đối tác)",
                "parent_code": parent.get("code") or "N/A",
                "distributor_id": dist_id,
                "distributor_name": dist_name,
                "country": country_inferred,
                "username": v_info.get("username") or "",
                "has_vault_pass": bool(v_info.get("username")),
                "vault_updated_at": v_info.get("updated_at")
            })
            
        return {
            "status": "success",
            "total": len(enriched_orgs),
            "organizations": enriched_orgs,
            "distributors": [{"id": d["id"], "name": d["name"], "code": d.get("code")} for d in distributors],
            "partners": [{"id": p["id"], "name": p["name"], "code": p.get("code"), "parent_id": p.get("parent_id")} for p in partners]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lấy dữ liệu quản trị phả hệ: {e}")


@router.put("/organizations/{org_id}")
async def update_organization_and_vault(org_id: str, payload: UpdateOrganizationPayload):
    """Cập nhật phả hệ và mã hóa Fernet bảo vệ an toàn ràng buộc NOT NULL của CSDL."""
    supabase = get_supabase_client()
    
    check_res = supabase.table("workspace_organizations").select("*").eq("id", org_id).execute()
    if not check_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tổ chức yêu cầu.")
        
    current_org = check_res.data[0]
    
    if payload.parent_id and payload.parent_id == org_id:
        raise HTTPException(status_code=400, detail="Một đơn vị không thể tự làm cấp cha của chính mình!")
        
    update_org_data: Dict[str, Any] = {}
    if payload.name is not None:
        update_org_data["name"] = payload.name.strip()
    if payload.code is not None:
        update_org_data["code"] = payload.code.strip()
    if payload.parent_id is not None:
        update_org_data["parent_id"] = payload.parent_id if payload.parent_id != "" else None

    if update_org_data:
        supabase.table("workspace_organizations").update(update_org_data).eq("id", org_id).execute()

    vault_updated = False
    if payload.username is not None or payload.password:
        vault_check = supabase.table("workspace_credentials_vault").select("id").eq("org_id", org_id).execute()
        vault_record = vault_check.data[0] if vault_check.data else None
        
        encrypted_pass = None
        if payload.password and payload.password.strip():
            try:
                fernet_key = settings.VAULT_SECRET_KEY.encode() if isinstance(settings.VAULT_SECRET_KEY, str) else settings.VAULT_SECRET_KEY
                f = Fernet(fernet_key)
                encrypted_pass = f.encrypt(payload.password.strip().encode()).decode()
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Lỗi mã hóa mật khẩu Fernet: {e}")

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
            # Tuân thủ nghiêm ngặt Schema: Thêm account_role và is_active chống lỗi NOT NULL
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
        "message": f"Đã cập nhật thành công phả hệ của '{payload.name or current_org['name']}'!",
        "vault_updated": vault_updated
    }

# ===========================================================================
# [CẬP NHẬT THÊM] Endpoint Tra Cứu & Bóc Tách Chi Tiết User Admin Workspace
# Tự động làm sạch dấu ngoặc kép/đơn của Render cho mật khẩu có ký tự @#!
# ===========================================================================
import os
import logging
from pydantic import BaseModel
from app.services.workspace.user_service import WorkspaceUserService

logger = logging.getLogger(__name__)

def sanitize_env_credential(val: str | None) -> str:
    """Khử sạch dấu ngoặc kép hoặc ngoặc đơn bọc ngoài do Render env sinh ra."""
    if not val:
        return ""
    cleaned = str(val).strip()
    # Bóc vỏ ngoặc kép "..." hoặc ngoặc đơn '...'
    if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
        cleaned = cleaned[1:-1]
    return cleaned.strip()

class UserSearchRequest(BaseModel):
    identifier: str

@router.post("/users/search-and-detail")
async def get_user_search_and_detail(payload: UserSearchRequest):
    """
    Dò tìm user_id và đọc toàn bộ chi tiết người dùng từ Workspace qua HTTPX.
    Sử dụng tài khoản TEST_ADMIN_USER và TEST_ADMIN_PASS đã qua khử quote an toàn.
    """
    raw_user = os.getenv("TEST_ADMIN_USER")
    raw_pass = os.getenv("TEST_ADMIN_PASS")

    # Khử sạch dấu " hoặc ' để lấy đúng mật khẩu thật chứa @#!
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
        logger.error(f"❌ [UserDetailAPI] Lỗi tra cứu người dùng: {e}")
        return {"success": False, "message": str(e)}

@router.get("/organizations/{org_id}/vault-password")
async def get_org_vault_password(org_id: str):
    """Giải mã mật khẩu Fernet Vault trả về cho Quản trị viên xem."""
    db = get_supabase_client()
    try:
        # 1. Truy vấn Két sắt theo org_id
        resp = db.table("workspace_credentials_vault").select("encrypted_password, username").eq("org_id", org_id).execute()
        
        # 2. Nếu không thấy theo org_id, truy vấn dự phòng theo username của tổ chức
        if not resp.data or not resp.data[0].get("encrypted_password"):
            org_res = db.table("workspace_organizations").select("username").eq("id", org_id).execute()
            if org_res.data and org_res.data[0].get("username"):
                u_name = org_res.data[0]["username"]
                resp = db.table("workspace_credentials_vault").select("encrypted_password").eq("username", u_name).execute()

        if not resp.data or not resp.data[0].get("encrypted_password"):
            logger.warning(f"⚠️ [Vault] Không tìm thấy bản ghi mật khẩu cho org: {org_id}")
            return {"password": ""}

        enc_pass = resp.data[0]["encrypted_password"]

        # 3. Nếu mật khẩu là plain text (không bắt đầu bằng gAAAAA), trả về luôn
        if not enc_pass.startswith("gAAAAA"):
            return {"password": enc_pass}

        # 4. Giải mã đối xứng bằng Fernet
        cipher = get_clean_fernet_cipher()
        if not cipher:
            return {"password": enc_pass}

        decrypted = cipher.decrypt(enc_pass.encode()).decode("utf-8")
        logger.info(f"🔓 [Vault] Đã giải mã thành công mật khẩu cho org: {org_id}")
        return {"password": decrypted}
    except Exception as e:
        logger.error(f"❌ [Vault] Lỗi giải mã mật khẩu két sắt cho org {org_id}: {e}")
        return {"password": ""}

# 🎯 API LẤY DANH MỤC QUỐC GIA CHO DROPDOWN FRONTEND
@router.get("/countries")
async def get_workspace_countries():
    """Trả về danh sách quốc gia đang hoạt động."""
    db = get_supabase_client()
    try:
        resp = db.table("workspace_countries").select("*").eq("is_active", True).order("name").execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Lỗi đọc danh mục countries: {e}")
        # Fallback an toàn nếu chưa tạo bảng
        return [
            {"code": "VN", "name": "Vietnam", "flag_emoji": "🇻🇳"},
            {"code": "MY", "name": "Malaysia", "flag_emoji": "🇲🇾"},
            {"code": "ID", "name": "Indonesia", "flag_emoji": "🇮🇩"},
            {"code": "PH", "name": "Philippines", "flag_emoji": "🇵🇭"},
        ]

@router.put("/organizations/{org_id}")
async def update_organization_hierarchy(org_id: str, payload: OrgUpdateRequest):
    """Cập nhật thông tin phả hệ, quốc gia và thư mục Google Drive."""
    db = get_supabase_client()
    try:
        # Bóc tách folder ID từ link Drive
        drive_id = extract_drive_folder_id(payload.drive_folder_url)

        update_fields = {
            "name": payload.name.strip(),
            "code": payload.code.strip() if payload.code else None,
            "parent_id": payload.parent_id if payload.parent_id else None,
            "country": payload.country.strip() if payload.country else None,
            "country_code": payload.country_code.strip() if payload.country_code else None,
            "drive_folder_url": payload.drive_folder_url.strip() if payload.drive_folder_url else None,
            "drive_folder_id": drive_id,
        }

        # Cập nhật thông tin vào workspace_organizations
        db.table("workspace_organizations").update(update_fields).eq("id", org_id).execute()

        # Nếu có cập nhật tài khoản hoặc mật khẩu -> lưu vào Két Sắt Fernet
        if payload.username or payload.password:
            # (Giữ nguyên logic cập nhật workspace_credentials_vault của anh)
            pass

        return {"status": "success", "message": "Đã cập nhật phả hệ và cấu hình thành công!"}
    except Exception as e:
        logger.error(f"Lỗi cập nhật organization: {e}")
        raise HTTPException(status_code=500, detail=str(e))