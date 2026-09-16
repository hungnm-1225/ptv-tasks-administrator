# backend/app/api/v1/endpoints/workspace.py
import re
import time
from fastapi import APIRouter, Query, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.core.supabase import get_supabase_client
from app.core.config import settings
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.workspace_playwright_service import workspace_playwright_service
from app.services.workspace.workspace_scanner_service import workspace_scanner_service
from app.services.keycloak_service import keycloak_service
from cryptography.fernet import Fernet
from app.core.config import get_utc_iso

router = APIRouter()

# =============================================================================
# ⚡ IN-MEMORY CACHE CHO PHẢ HỆ 480 TRƯỜNG & KHÓA HỌC WORKSPACE
# =============================================================================
# ⚡ IN-MEMORY CACHE CHO PHẢ HỆ 480 TRƯỜNG & KHÓA HỌC WORKSPACE (TIER A CATALOG)
# =============================================================================
from app.core.cache_policy import BoundedMemoryCache, CacheTier

ws_cache = BoundedMemoryCache(tier=CacheTier.TIER_A_CATALOG, max_entries=50, default_ttl=900)



class ExtractCOFRequest(BaseModel):
    cof_text: str


# =============================================================================
# 1. PHẢ HỆ VÀ DANH MỤC KHÓA HỌC (TỐC ĐỘ 1MS TỪ RAM)
# =============================================================================
@router.get("/hierarchy-schools")
async def get_hierarchy_schools(search: str = Query("", description="Tìm kiếm tên trường hoặc mã trường")):
    """Lấy danh sách 480 trường học kèm phả hệ (Đọc siêu tốc từ In-Memory Cache)."""
    cache_key = "all_hierarchy_schools"
    all_schools = ws_cache.get(cache_key)

    # Nếu chưa có trong RAM -> Nạp từ Supabase và dựng phả hệ
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
            print(f"❌ Lỗi lấy danh sách phả hệ: {e}")
            return []

    # Tìm kiếm từ khóa ngay trong RAM (0.1ms)
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
        print(f"⚠️ Lỗi đọc categories: {e}")
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
        print(f"❌ Lỗi query khóa học: {e}")
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
            ws_cache.set(cache_key, cached_orders, ttl=300) # Lưu RAM 5 phút
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi đọc Cache Orders: {e}")

    orders = cached_orders
    # Lọc nhanh trong RAM
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
            ws_cache.set(cache_key, cached_contracts, ttl=300) # Lưu RAM 5 phút
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
    # Xóa cache RAM để client query lại sẽ lấy dữ liệu mới nhất
    ws_cache.invalidate("all_cached_pending_orders")
    ws_cache.invalidate("all_cached_pending_contracts_PRT")
    ws_cache.invalidate("all_cached_pending_contracts_DST")


@router.post("/sync-cache-now")
async def trigger_distributor_cache_sync(background_tasks: BackgroundTasks):
    """Kích hoạt tác vụ quét lại 5 Distributor chạy ngầm an toàn tuyệt đối."""
    background_tasks.add_task(_run_sync_and_invalidate)
    return {
        "status": "queued",
        "message": "Đã kích hoạt quét thông minh (Smart Delta Sync) 5 Distributor trong nền an toàn!"
    }


# =============================================================================
# 3. LIVE SCRAPERS
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

    # Lấy cache khóa học thay vì query lại DB
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
@router.post("/keycloak-lookup")
async def lookup_keycloak_users(payload: Dict[str, Any]):
    """Endpoint tra cứu thông tin chi tiết tài khoản Keycloak cho Automation Studio."""
    raw_list = payload.get("identifiers") or payload.get("emails") or []
    if isinstance(raw_list, str):
        raw_list = [raw_list]
    results = await keycloak_service.lookup_user_details(raw_list)
    return {"users": results}

# =============================================================================
# 5. QUẢN TRỊ PHẢ HỆ 3 TẦNG & CẬP NHẬT KÉT SẮT FERNET
# =============================================================================

class UpdateOrganizationPayload(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    parent_id: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None  # Mật khẩu mới dạng text trần (Backend sẽ tự mã hóa Fernet)


@router.get("/hierarchy-manage")
async def get_hierarchy_management_data():
    """
    Lấy toàn bộ cây phả hệ 3 cấp (Distributors, Partners, Schools) 
    kèm trạng thái Két Sắt Fernet phục vụ giao diện Quản trị Phả hệ.
    """
    supabase = get_supabase_client()
    try:
        # 1. Truy vấn toàn bộ tổ chức
        orgs_res = supabase.table("workspace_organizations")\
            .select("id, code, name, role_type, parent_id, country")\
            .order("role_type")\
            .order("name")\
            .execute()
        all_orgs = orgs_res.data or []
        
        # 2. Truy vấn danh bạ Két sắt Vault để đối soát username & trạng thái mật khẩu
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
            
            # Phân giải Distributor gốc (Nếu là School -> lấy parent của Partner; Nếu là Partner -> lấy parent của chính nó)
            dist_id = parent.get("parent_id") if o.get("role_type") == "school" else (parent_id if o.get("role_type") == "partner" else None)
            distributor = org_map.get(dist_id, {}) if dist_id else (parent if o.get("role_type") == "partner" else None)
            
            v_info = vault_map.get(o["id"], {})
            
            enriched_orgs.append({
                "id": o["id"],
                "code": o.get("code") or "N/A",
                "name": o.get("name") or "Chưa đặt tên",
                "role_type": o.get("role_type") or "school",
                "parent_id": parent_id,
                "parent_name": parent.get("name") or "Trực tiếp (Không qua đối tác)",
                "parent_code": parent.get("code") or "N/A",
                "distributor_id": dist_id,
                "distributor_name": distributor.get("name") if distributor else "N/A",
                "country": o.get("country") or "Vietnam",
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
    """
    Cập nhật thông tin tổ chức, gán lại đối tác cha (Re-assign Parent) 
    và mã hóa mật khẩu đối xứng Fernet lưu vào Két sắt.
    """
    supabase = get_supabase_client()
    
    # 1. Kiểm tra tổ chức có tồn tại không
    check_res = supabase.table("workspace_organizations").select("*").eq("id", org_id).execute()
    if not check_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tổ chức yêu cầu.")
        
    current_org = check_res.data[0]
    
    # Chống gán cha là chính mình
    if payload.parent_id and payload.parent_id == org_id:
        raise HTTPException(status_code=400, detail="Một đơn vị không thể tự làm cấp cha của chính mình!")
        
    # 2. Cập nhật thông tin workspace_organizations
    update_org_data: Dict[str, Any] = {}
    if payload.name is not None:
        update_org_data["name"] = payload.name.strip()
    if payload.code is not None:
        update_org_data["code"] = payload.code.strip()
    if payload.parent_id is not None:
        update_org_data["parent_id"] = payload.parent_id if payload.parent_id != "" else None

    if update_org_data:
        supabase.table("workspace_organizations").update(update_org_data).eq("id", org_id).execute()

    # 3. Cập nhật Két Sắt Fernet (workspace_credentials_vault) nếu có thông tin tài khoản/mật khẩu
    vault_updated = False
    if payload.username is not None or payload.password:
        vault_check = supabase.table("workspace_credentials_vault").select("id, encrypted_password").eq("org_id", org_id).execute()
        vault_record = vault_check.data[0] if vault_check.data else None
        
        encrypted_pass = None
        if payload.password and payload.password.strip():
            # Mã hóa đối xứng Fernet bằng VAULT_SECRET_KEY
            try:
                fernet_key = settings.VAULT_SECRET_KEY.encode() if isinstance(settings.VAULT_SECRET_KEY, str) else settings.VAULT_SECRET_KEY
                f = Fernet(fernet_key)
                encrypted_pass = f.encrypt(payload.password.strip().encode()).decode()
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Lỗi mã hóa mật khẩu Fernet: {e}")

        now_iso = get_utc_iso()
        if vault_record:
            # Đã có record -> Update
            vault_payload: Dict[str, Any] = {"updated_at": now_iso}
            if payload.username is not None:
                vault_payload["username"] = payload.username.strip()
            if encrypted_pass:
                vault_payload["encrypted_password"] = encrypted_pass
                
            supabase.table("workspace_credentials_vault").update(vault_payload).eq("id", vault_record["id"]).execute()
            vault_updated = True
        else:
            # Chưa có record -> Tạo mới vào Két Sắt
            new_vault = {
                "org_id": org_id,
                "username": (payload.username or "").strip(),
                "encrypted_password": encrypted_pass or "",
                "updated_at": now_iso
            }
            supabase.table("workspace_credentials_vault").insert(new_vault).execute()
            vault_updated = True

    # 4. Xóa sạch RAM Cache để toàn hệ thống đồng bộ phả hệ mới ngay lập tức
    ws_cache.invalidate("all_hierarchy_schools")

    return {
        "status": "success",
        "message": f"Đã cập nhật thành công phả hệ của '{payload.name or current_org['name']}'!",
        "vault_updated": vault_updated
    }