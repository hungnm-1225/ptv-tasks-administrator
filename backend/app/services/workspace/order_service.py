# backend/app/services/workspace/order_service.py
import re
import gc
import json
import time
import asyncio
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import httpx
from playwright.async_api import async_playwright

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL, normalize_date_iso
from app.core.playwright_manager import acquire_playwright_slot, LOW_RAM_CHROMIUM_ARGS, setup_low_ram_routes

logger = logging.getLogger(__name__)

# =============================================================================
# ⚡ BỘ NHỚ ĐỆM SESSION MULTI-ROLE DÙNG CHUNG CHO TOÀN BỘ WORKSPACE (RAM < 20KB)
# Cấu trúc: { (role_title_clean, username_clean): { "cookies": dict, "identity": dict, "cached_at": float } }
# =============================================================================
_WORKSPACE_SESSION_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}
_WORKSPACE_LOCKS: Dict[Tuple[str, str], asyncio.Lock] = {}
WORKSPACE_SESSION_TTL = 7200  # 2 giờ


def _get_role_lock(role_title: str, username: str) -> asyncio.Lock:
    key = (role_title.strip().lower(), username.strip().lower())
    if key not in _WORKSPACE_LOCKS:
        _WORKSPACE_LOCKS[key] = asyncio.Lock()
    return _WORKSPACE_LOCKS[key]


async def _is_session_valid(cookies: Dict[str, str], role_title: str) -> bool:
    """Kiểm tra siêu tốc (30ms) xem session của Role còn hiệu lực không."""
    try:
        test_url = f"{BASE_WORKSPACE_URL}/wp-admin/admin-ajax.php"
        async with httpx.AsyncClient(cookies=cookies, timeout=4.0, follow_redirects=False) as client:
            res = await client.get(test_url)
            return res.status_code in (200, 400) and "login" not in str(res.url)
    except Exception:
        return False


async def get_or_steal_role_session(
    service_instance: WorkspaceBaseService,
    username: str,
    password: str,
    role_title: str
) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """
    Hàm bốc session dùng chung đa phân hệ (School/Partner/Distributor/Sales Admin):
    - Có Cache RAM 2h (0ms launch, bỏ qua Playwright).
    - Chỉ chiếm Playwright Semaphore đúng 3s khi cache hết hạn rồi nhả ngay!
    """
    now = time.time()
    clean_role = role_title.strip().lower()
    clean_user = username.strip().lower()
    cache_key = (clean_role, clean_user)

    # 1. Kiểm tra cache còn hạn không
    cached = _WORKSPACE_SESSION_CACHE.get(cache_key)
    if cached and (now - cached.get("cached_at", 0) < WORKSPACE_SESSION_TTL):
        cookies = cached.get("cookies", {})
        identity = cached.get("identity", {})
        if await _is_session_valid(cookies, role_title):
            logger.info(f"⚡ [Workspace Cache] Tái sử dụng Session [{role_title}] cho '{username}' (0ms)!")
            return cookies, identity
        else:
            logger.warning(f"⚠️ [Workspace Cache] Session [{role_title}] của '{username}' hết hạn, chuẩn bị gia hạn...")
            _WORKSPACE_SESSION_CACHE.pop(cache_key, None)

    # 2. Xếp hàng Lock riêng của (role, user)
    async with _get_role_lock(role_title, username):
        now = time.time()
        cached = _WORKSPACE_SESSION_CACHE.get(cache_key)
        if cached and (now - cached.get("cached_at", 0) < WORKSPACE_SESSION_TTL):
            return cached.get("cookies", {}), cached.get("identity", {})

        # 🎯 CHỈ CHIẾM PLAYWRIGHT SEMAPHORE ĐÚNG 3S LÚC NÀY
        async with acquire_playwright_slot(f"Workspace Auth [{role_title} - {username}]", timeout=60.0, lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await service_instance._create_context(p)
                try:
                    is_ok, login_err = await service_instance.login_role(page, username, password, role_title)
                    if not is_ok:
                        raise RuntimeError(f"Đăng nhập [{role_title}] thất bại: {login_err}")

                    # Chuyển hướng đặc trị cho Sales Admin Dashboard
                    if clean_role in ("sales admin", "sales_admin"):
                        try:
                            await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="domcontentloaded", timeout=30000)
                        except Exception:
                            pass

                    wp_identity = await page.evaluate("""() => {
                        const u = window.user || {};
                        let localUser = {};
                        try { localUser = JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) {}
                        return {
                            school_id: u.school_id || localUser.school_id || null,
                            partner_id: u.partner_id || localUser.partner_id || null,
                            distributor_id: u.distributor_id || localUser.distributor_id || null,
                            user_id: u.id || localUser.id || null,
                            username: u.username || localUser.username || ''
                        };
                    }""")

                    cookies = await context.cookies()
                    cookies_dict = {c["name"]: c["value"] for c in cookies}

                    _WORKSPACE_SESSION_CACHE[cache_key] = {
                        "cookies": cookies_dict,
                        "identity": wp_identity,
                        "cached_at": time.time()
                    }
                    logger.info(f"✨ [Workspace Cache] Đã lưu Session mới cho [{role_title}: {username}] vào RAM.")
                    return cookies_dict, wp_identity

                finally:
                    await browser.close()
                    gc.collect()


class WorkspaceOrderService(WorkspaceBaseService):
    """
    Xử lý các nghiệp vụ School Order & Partner Approve.
    ĐỘNG CƠ HYBRID V3.6: Session Cache 2h -> Direct HTTPX API (~150ms).
    """

    async def _steal_role_session(self, username: str, password: str, role_title: str) -> Tuple[Dict[str, str], Dict[str, Any]]:
        """Ủy quyền sang hàm bốc session tập trung có Cache RAM 2h."""
        return await get_or_steal_role_session(self, username, password, role_title)

    @staticmethod
    def _to_multipart(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        return {k: (None, str(v) if v is not None else "") for k, v in data_dict.items()}

    # =========================================================================
    # 💾 ĐỒNG BỘ CSDL SUPABASE & CACHE
    # =========================================================================
    def _invalidate_workspace_ram_cache(self, cache_type: str = "all"):
        try:
            from app.api.v1.endpoints.workspace import ws_cache
            if cache_type in ("all", "orders"):
                ws_cache.invalidate("all_cached_pending_orders")
            if cache_type in ("all", "contracts"):
                ws_cache.invalidate("all_cached_pending_contracts_PRT")
                ws_cache.invalidate("all_cached_pending_contracts_DST")
        except Exception as e:
            logger.warning(f"⚠️ Không thể invalidate ws_cache: {e}")

    async def _sync_order_status_db(self, order_identifier: str, new_status: str = "Approved", partner_name: Optional[str] = None):
        if not order_identifier:
            return
        try:
            from app.core.supabase import get_supabase_client
            clean_code = str(order_identifier).strip()
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            supabase = get_supabase_client()
            supabase.table("workspace_orders_cache").update({
                "status": new_status,
                "synced_at": now_utc
            }).ilike("order_id", f"%{clean_code}%").execute()
            self._invalidate_workspace_ram_cache("orders")
            logger.info(f"💾 [DB SYNC] Order [{clean_code}] ➔ Status: '{new_status}'")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi cập nhật Order: {e}")

    async def _record_created_order_db(self, order_id: str, school_name: str, order_data: Dict[str, Any]):
        if not order_id:
            return
        try:
            from app.core.supabase import get_supabase_client
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            supabase = get_supabase_client()
            courses = order_data.get("courses", [])
            total_lic = sum(int(c.get("licenses", 0)) for c in courses) if courses else int(order_data.get("licenses", 50))
            
            record = {
                "order_id": order_id,
                "school_name": school_name,
                "partner_name": order_data.get("partner_name", "Partner"),
                "distributor_code": order_data.get("distributor_code", "N/A"),
                "order_date": now_utc,
                "total_licenses": total_lic,
                "status": "Awaiting Partner",
                "synced_at": now_utc,
                "raw_data": order_data
            }
            supabase.table("workspace_orders_cache").upsert(record, on_conflict="order_id").execute()
            self._invalidate_workspace_ram_cache("orders")
            logger.info(f"💾 [DB SYNC] Lưu Order [{order_id}] ➔ Awaiting Partner")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi ghi nhận Order mới: {e}")

    async def _record_created_contract_db(self, contract_code: str, contract_type: str, status: str, **kwargs):
        if not contract_code:
            return
        try:
            from app.core.supabase import get_supabase_client
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            supabase = get_supabase_client()
            record = {
                "contract_code": contract_code,
                "contract_type": contract_type.upper(),
                "status": status,
                "total_licenses": 50,
                "partner_name": kwargs.get("partner_name", "Partner"),
                "synced_at": now_utc,
                "raw_data": kwargs
            }
            supabase.table("workspace_contracts_cache").upsert(record, on_conflict="contract_code").execute()
            self._invalidate_workspace_ram_cache("contracts")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi ghi nhận Contract: {e}")

    # =========================================================================
    # 🏫 1. SCHOOL TẠO ORDER (DIRECT API - ĐÃ TỐI ƯU LOG)
    # =========================================================================
    async def school_create_order(self, credentials: Dict[str, str], order_data: Dict[str, Any]) -> Dict[str, Any]:
        """School tạo Order qua Direct API schoolCreateOrder.php (Không giữ Semaphore)."""
        try:
            cookies, identity = await self._steal_role_session(
                credentials.get("username", ""), 
                credentials.get("password", ""), 
                "School"
            )
            school_id = identity.get("school_id") or "10266"

            courses = order_data.get("courses", [])
            c_first = courses[0] if courses else {}
            cat_val = c_first.get("category", order_data.get("category", "SWRP"))
            course_id_val = str(c_first.get("course_id", order_data.get("course_id", 1)))
            lic_qty = str(c_first.get("licenses", order_data.get("licenses", 50)))
            s_date = normalize_date_iso(c_first.get("start_date", order_data.get("start_date", "2026-09-16")))
            e_date = normalize_date_iso(c_first.get("end_date", order_data.get("end_date", "2027-09-16")))

            payload = {
                "school_id": str(school_id),
                "courses[0][courseId]": course_id_val,
                "courses[0][studentCount]": lic_qty,
                "courses[0][startDate]": s_date,
                "courses[0][endDate]": e_date,
                "courses[0][licenseCategory]": cat_val,
                "contactInfoId": order_data.get("contact_info", "Admin Automation Hub (hungnm@dtt.vn)"),
                "notes": order_data.get("additional_notes", "Order auto-generated by PTV Automation Hub"),
                "type": "course"
            }

            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/orders_management/schoolCreateOrder.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code in (200, 201):
                    res_json = res.json()
                    if res_json.get("code") in (200, 201):
                        o_info = res_json.get("data", {}).get("order", {})
                        o_id = str(o_info.get("id"))
                        o_code = o_info.get("school_order_id_format") or f"SCH-{o_id}"
                        
                        await self._record_created_order_db(o_code, credentials.get("username", "School"), order_data)
                        
                        # 📝 Log ngắn gọn, cô đọng đầy đủ thông tin cốt lõi
                        clean_summary = f"Order: {o_code} | {cat_val} #{course_id_val} | SL: {lic_qty} | Hạn: {s_date} -> {e_date}"
                        logger.info(f"✅ [School Order] {clean_summary}")
                        return {
                            "status": "success",
                            "order_id": o_id,
                            "order_code": o_code,
                            "school_name": credentials.get("username"),
                            "message": clean_summary
                        }
                
                return {"status": "failed", "error": f"API Create Order thất bại: {res.text}"}

        except Exception as e:
            logger.error(f"❌ Lỗi School Create Order: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 🤝 2. PARTNER DUYỆT SCHOOL ORDER (DIRECT API - ĐÃ TỐI ƯU LOG)
    # =========================================================================
    async def partner_approve_school_order(
        self, 
        credentials: Dict[str, str], 
        order_identifier: Optional[str] = None,
        auto_create_prt_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Partner duyệt School Order qua Direct API updateStatusOrder.php (Không giữ Semaphore)."""
        try:
            cookies, identity = await self._steal_role_session(
                credentials.get("username", ""), 
                credentials.get("password", ""), 
                "Partner"
            )
            partner_id = identity.get("partner_id") or "60"

            clean_num_match = re.search(r"\d+$", str(order_identifier))
            num_order_id = clean_num_match.group(0) if clean_num_match else str(order_identifier)

            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                # 1. Lấy chi tiết đơn
                detail_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/orders_management/getOrderDetail.php?order_id={num_order_id}"
                d_res = await client.get(detail_url)
                detail_data = d_res.json() if d_res.status_code == 200 else {}
                courses_req = detail_data.get("detail_package", {}).get("courses", [])

                target_course_id = 780
                qty_needed = 5
                if courses_req:
                    target_course_id = courses_req[0].get("course_id", 780)
                    qty_needed = int(courses_req[0].get("course_count", 5))

                # 2. Quét kho License Pool của Partner
                pool_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/getPartnerPoolLicense.php?partner_id={partner_id}"
                p_res = await client.get(pool_url)
                pool_courses = p_res.json().get("data", {}).get("pool_courses", []) if p_res.status_code == 200 else []

                # 3. So khớp Pool ID khả dụng
                matched_pool_id = None
                for p in pool_courses:
                    if int(p.get("item_quantity", 0)) >= qty_needed:
                        matched_pool_id = p.get("id")
                        break

                # ĐỦ LICENSE -> DUYỆT ĐƠN
                if matched_pool_id:
                    approve_payload = {
                        "order_id": str(num_order_id),
                        "status": "1",
                        "partner_id": str(partner_id),
                        "courses[0][course_id]": str(target_course_id),
                        "courses[0][quantity]": str(qty_needed),
                        "courses[0][pool_id]": str(matched_pool_id),
                        "username": credentials.get("username", "partnerdtte"),
                        "order_code": order_identifier or f"SCH-{num_order_id}",
                        "license_type": "course"
                    }
                    ap_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/orders_management/updateStatusOrder.php"
                    res = await client.post(ap_url, files=self._to_multipart(approve_payload))
                    
                    if res.status_code in (200, 201):
                        await self._sync_order_status_db(order_identifier, "Approved", credentials.get("username"))
                        clean_msg = f"Duyệt Order: {order_identifier} | Khóa #{target_course_id} (SL: {qty_needed}) | Pool #{matched_pool_id}"
                        logger.info(f"✅ [Partner Order] {clean_msg}")
                        return {
                            "status": "success",
                            "order_identifier": order_identifier,
                            "message": clean_msg
                        }

                # THIẾU LICENSE -> TẠO PRT CONTRACT GỬI DISTRIBUTOR CẤP BÙ
                if auto_create_prt_if_short:
                    topup_payload = {
                        "partner_id": str(partner_id),
                        "order_type": "License",
                        "order_notes": f"Auto-topup for School Order {order_identifier}",
                        "status": "pending_distributor_review",
                        "total_amount": "100",
                        "courses[0][course_id]": "1344",
                        "courses[0][course_name]": "SWRP 1: STREAM Explorers (EN)",
                        "courses[0][student_count]": str(qty_needed * 2 if qty_needed < 50 else qty_needed),
                        "courses[0][category]": "SWRP",
                        "courses[0][unit_price]": "10",
                        "courses[0][total_amount]": "100"
                    }
                    prt_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/createOrderSale.php"
                    prt_res = await client.post(prt_url, files=self._to_multipart(topup_payload))
                    
                    if prt_res.status_code == 200:
                        prt_data = prt_res.json().get("data", {})
                        prt_code = prt_data.get("order_code")
                        await self._record_created_contract_db(prt_code, "PRT", "Awaiting Distributor", partner_name=credentials.get("username"))
                        clean_msg = f"Thiếu License Order {order_identifier} (cần {qty_needed}) ➔ Tạo PRT: {prt_code}"
                        logger.warning(f"⚠️ [Partner Order] {clean_msg}")
                        return {
                            "status": "insufficient_pool_created_prt",
                            "order_identifier": order_identifier,
                            "prt_contract_code": prt_code,
                            "message": clean_msg
                        }

                return {
                    "status": "insufficient_pool",
                    "order_identifier": order_identifier,
                    "message": f"Thiếu License Order {order_identifier} (cần {qty_needed})"
                }

        except Exception as e:
            logger.error(f"❌ Lỗi Partner Approve Order: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 🔍 3. FETCH CHI TIẾT ĐƠN HÀNG
    # =========================================================================
    async def fetch_school_order_detailed_courses(self, credentials: Dict[str, str], order_identifier: str) -> Dict[str, Any]:
        """Trích xuất chi tiết môn học qua Direct API getOrderDetail.php."""
        clean_num_match = re.search(r"\d+$", str(order_identifier))
        num_order_id = clean_num_match.group(0) if clean_num_match else str(order_identifier)
        detail_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/getOrderDetail.php?order_id={num_order_id}"

        try:
            cookies, _ = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Partner")
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=20.0) as client:
                res = await client.get(detail_url)
                courses = []
                if res.status_code == 200:
                    detail_res = res.json()
                    for dc in (detail_res.get("detail_package", {}).get("courses", []) or []):
                        courses.append({
                            "course_id": dc.get("course_id"),
                            "course_name": dc.get("course_name"),
                            "category": dc.get("category", "SWRP"),
                            "licenses": int(dc.get("course_count", 1)),
                            "start_date": dc.get("course_enroll_start_date", "2026-09-16"),
                            "end_date": dc.get("course_enroll_end_date", "2027-09-16")
                        })
                return {"status": "success", "order_identifier": order_identifier, "courses": courses}
        except Exception as e:
            return {"status": "failed", "error": str(e), "courses": []}

    # =========================================================================
    # 🔍 CÁC HÀM TRUY VẤN DỮ LIỆU CŨ (GIỮ TƯƠNG THÍCH NGƯỢC)
    # =========================================================================
    async def fetch_partner_pending_school_orders(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Partner")
            p_id = identity.get("partner_id") or "60"
            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/orders_management/getListOrder.php?partner_id={p_id}"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=20.0) as client:
                res = await client.get(url)
                orders = res.json().get("data", []) if res.status_code == 200 else []
                return {"status": "success", "total": len(orders), "orders": orders}
        except Exception as e:
            return {"status": "failed", "error": str(e), "orders": []}

    async def fetch_distributor_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Distributor")
            d_id = identity.get("distributor_id") or "36"
            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/getPartnerOrder.php?distributor_id={d_id}"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=20.0) as client:
                res = await client.get(url)
                contracts = res.json().get("data", []) if res.status_code == 200 else []
                return {"status": "success", "total": len(contracts), "contracts": contracts}
        except Exception as e:
            return {"status": "failed", "error": str(e), "contracts": []}

    async def fetch_sales_admin_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        try:
            cookies, _ = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/getListOrder.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=20.0) as client:
                res = await client.get(url)
                contracts = res.json().get("data", []) if res.status_code == 200 else []
                return {"status": "success", "total": len(contracts), "contracts": contracts}
        except Exception as e:
            return {"status": "failed", "error": str(e), "contracts": []}