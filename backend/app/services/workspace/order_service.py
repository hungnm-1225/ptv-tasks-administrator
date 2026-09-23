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
    """Kiểm tra session sạch sẽ, không gọi admin-ajax để tránh log 400."""
    return bool(cookies and len(cookies) > 0)

def clear_role_session_cache(role_title: str, username: str = ""):
    """Xóa session tạm của School hoặc Partner trong RAM sau khi hoàn tất tác vụ."""
    clean_role = role_title.strip().lower()
    clean_user = username.strip().lower()
    if clean_user:
        _WORKSPACE_SESSION_CACHE.pop((clean_role, clean_user), None)
        logger.info(f"🧹 [Session Cache] Đã dọn sạch RAM session tạm của [{role_title}: {username}]")
    else:
        keys_to_remove = [k for k in _WORKSPACE_SESSION_CACHE.keys() if k[0] == clean_role]
        for k in keys_to_remove:
            _WORKSPACE_SESSION_CACHE.pop(k, None)
        logger.info(f"🧹 [Session Cache] Đã dọn sạch toàn bộ RAM session của Role [{role_title}]")

async def get_or_steal_role_session(
    service_instance: WorkspaceBaseService,
    username: str,
    password: str,
    role_title: str
) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """
    Hàm bốc session Workspace thông minh:
    1. School & Partner: Lưu tạm trong RAM, không lưu DB, dọn dẹp khi xong.
    2. Sales Admin & Distributor: Đọc trực tiếp từ kho Supabase qua KeepAlive (Zero Playwright!).
    3. Fallback: Chỉ mở Playwright khi session trên Supabase hoặc RAM chưa có/hết hạn.
    """
    now = time.time()
    clean_role = role_title.strip().lower()
    clean_user = username.strip().lower()
    cache_key = (clean_role, clean_user)

    # -------------------------------------------------------------------------
    # ⚡ 1. KIỂM TRA RAM CACHE LOCAL (0ms)
    # -------------------------------------------------------------------------
    cached = _WORKSPACE_SESSION_CACHE.get(cache_key)
    if cached and (now - cached.get("cached_at", 0) < WORKSPACE_SESSION_TTL):
        cookies = cached.get("cookies", {})
        identity = cached.get("identity", {})
        if await _is_session_valid(cookies, role_title):
            logger.info(f"⚡ [Workspace Cache] Tái sử dụng Session [{role_title}] cho '{username}' từ RAM (0ms)!")
            return cookies, identity
        else:
            _WORKSPACE_SESSION_CACHE.pop(cache_key, None)

    # -------------------------------------------------------------------------
    # 💾 2. ĐỐI VỚI SALES ADMIN & DISTRIBUTOR: ĐỌC TỪ KHO SUPABASE KEEPALIVE
    # -------------------------------------------------------------------------
    if clean_role in ("sales admin", "sales_admin", "distributor"):
        try:
            from app.services.session_keepalive_service import session_keepalive_service

            # A. Luồng Sales Admin (Bốc session sales_admin hoặc admin_workspace)
            if clean_role in ("sales admin", "sales_admin"):
                db_cookies = await session_keepalive_service.get_session_cookies("sales_admin") or \
                             await session_keepalive_service.get_session_cookies("admin_workspace")
                if db_cookies and await _is_session_valid(db_cookies, role_title):
                    identity = {"username": username, "user_id": "1"}
                    _WORKSPACE_SESSION_CACHE[cache_key] = {
                        "cookies": db_cookies,
                        "identity": identity,
                        "cached_at": time.time()
                    }
                    logger.info(f"✨ [KeepAlive DB] Tái sử dụng Session Sales Admin từ Supabase cho '{username}' (Zero Playwright - 1ms)!")
                    return db_cookies, identity

            # B. Luồng Master Distributor (Dò tìm distributor_2, distributor_36, distributor_42... từ Supabase)
            elif clean_role == "distributor":
                from app.core.supabase import get_supabase_client
                supabase = get_supabase_client()
                dist_res = supabase.table("workspace_active_sessions")\
                    .select("session_key, cookies, metadata")\
                    .ilike("session_key", "distributor_%")\
                    .eq("is_active", True)\
                    .execute()

                if dist_res.data:
                    matched_row = None
                    # So khớp username hoặc distributor_code với metadata trong DB
                    for row in dist_res.data:
                        meta = row.get("metadata") or {}
                        row_user = str(meta.get("user") or "").strip().lower()
                        row_code = str(meta.get("distributor_code") or "").strip().lower()
                        if clean_user in (row_user, row_code) or clean_user in row.get("session_key", "").lower():
                            matched_row = row
                            break

                    # Fallback nếu truyền tên chung chung như "distributor" hoặc "testdistributor"
                    if not matched_row:
                        matched_row = dist_res.data[0]

                    if matched_row and matched_row.get("cookies"):
                        db_cookies = matched_row["cookies"]
                        if await _is_session_valid(db_cookies, role_title):
                            meta = matched_row.get("metadata") or {}
                            real_dist_id = meta.get("dist_id") or meta.get("distributor_code") or "36"
                            identity = {
                                "distributor_id": str(real_dist_id),
                                "username": username or meta.get("user", "distributor")
                            }
                            _WORKSPACE_SESSION_CACHE[cache_key] = {
                                "cookies": db_cookies,
                                "identity": identity,
                                "cached_at": time.time()
                            }
                            logger.info(f"✨ [KeepAlive DB] Tái sử dụng Session Distributor [{matched_row.get('session_key')}] từ Supabase (Zero Playwright - 1ms)!")
                            return db_cookies, identity

        except Exception as db_err:
            logger.warning(f"⚠️ Không thể đọc session [{role_title}] từ Supabase: {db_err}")

    # -------------------------------------------------------------------------
    # 🔑 3. FALLBACK: CHỈ MỞ PLAYWRIGHT KHI CHƯA CÓ HOẶC SESSION HẾT HẠN
    # -------------------------------------------------------------------------
    async with _get_role_lock(role_title, username):
        now = time.time()
        cached = _WORKSPACE_SESSION_CACHE.get(cache_key)
        if cached and (now - cached.get("cached_at", 0) < WORKSPACE_SESSION_TTL):
            return cached.get("cookies", {}), cached.get("identity", {})

        logger.info(f"🔑 [Playwright Auth] Đang mở Chromium đăng nhập cho [{role_title}: {username}]...")
        async with acquire_playwright_slot(f"Workspace Auth [{role_title} - {username}]", timeout=60.0, lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await service_instance._create_context(p)
                try:
                    is_ok, login_err = await service_instance.login_role(page, username, password, role_title)
                    if not is_ok:
                        raise RuntimeError(f"Đăng nhập [{role_title}] thất bại: {login_err}")

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

                    # Lưu vào RAM Cache
                    _WORKSPACE_SESSION_CACHE[cache_key] = {
                        "cookies": cookies_dict,
                        "identity": wp_identity,
                        "cached_at": time.time()
                    }
                    logger.info(f"✨ [Workspace Cache] Đã lưu Session mới cho [{role_title}: {username}] vào RAM.")

                    # NẾU LÀ SALES ADMIN: LƯU NGƯỢC LẠI SUPABASE ĐỂ GIỮ ẤM
                    if clean_role in ("sales admin", "sales_admin"):
                        try:
                            from app.services.session_keepalive_service import session_keepalive_service
                            await session_keepalive_service.save_session_cookies(
                                session_key="sales_admin",
                                system_name="Sales Admin Workspace",
                                cookies=cookies_dict,
                                metadata={"admin_user": username, "identity": wp_identity}
                            )
                        except Exception as e:
                            logger.warning(f"⚠️ Không thể lưu Sales Admin session lên DB: {e}")

                    return cookies_dict, wp_identity

                finally:
                    await browser.close()
                    gc.collect()


class WorkspaceOrderService(WorkspaceBaseService):
    """
    Xử lý các nghiệp vụ School Order & Partner Approve.
    HỖ TRỢ ĐA KHÓA HỌC (MULTI-COURSE ENGINE) 100% TOÀN TRÌNH.
    """

    async def _steal_role_session(self, username: str, password: str, role_title: str) -> Tuple[Dict[str, str], Dict[str, Any]]:
        return await get_or_steal_role_session(self, username, password, role_title)

    @staticmethod
    def _to_multipart(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        return {k: (None, str(v) if v is not None else "") for k, v in data_dict.items()}

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
                "updated_at": now_utc,
                "last_synced_at": now_utc
            }).ilike("order_code", f"%{clean_code}%").execute()
            self._invalidate_workspace_ram_cache("orders")
            logger.info(f"💾 [DB SYNC] Order [{clean_code}] ➔ Status: '{new_status}'")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi cập nhật Order: {e}")

    async def _record_created_order_db(self, order_code: str, school_name: str, order_data: Dict[str, Any]):
        if not order_code:
            return
        try:
            from app.core.supabase import get_supabase_client
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            supabase = get_supabase_client()
            record = {
                "order_code": order_code,
                "school_name": school_name,
                "partner_name": order_data.get("partner_name", "Partner"),
                "distributor_code": order_data.get("distributor_code", "N/A"),
                "order_date": now_utc,
                "status": "Awaiting Partner",
                "courses_data": order_data.get("courses", []),
                "raw_payload": order_data,
                "last_synced_at": now_utc,
                "updated_at": now_utc
            }
            supabase.table("workspace_orders_cache").upsert(record, on_conflict="order_code").execute()
            self._invalidate_workspace_ram_cache("orders")
            logger.info(f"💾 [DB SYNC] Lưu Order [{order_code}] ➔ Awaiting Partner")
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
                "sender_name": kwargs.get("partner_name") or kwargs.get("sender_name", "Partner"),
                "status": status,
                "courses_data": kwargs.get("courses", []),
                "raw_payload": kwargs,
                "last_synced_at": now_utc,
                "updated_at": now_utc
            }
            supabase.table("workspace_contracts_cache").upsert(record, on_conflict="contract_code").execute()
            self._invalidate_workspace_ram_cache("contracts")
            logger.info(f"💾 [DB SYNC] Lưu Contract [{contract_code}] ({contract_type}) ➔ Status: '{status}'")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi ghi nhận Contract: {e}")

    # =========================================================================
    # 🏫 1. SCHOOL TẠO ORDER (HỖ TRỢ ĐA KHÓA HỌC MULTI-COURSE)
    # =========================================================================
    async def school_create_order(self, credentials: Dict[str, str], order_data: Dict[str, Any]) -> Dict[str, Any]:
        """School tạo Order với đầy đủ tất cả các khóa học có trong danh sách."""
        try:
            cookies, identity = await self._steal_role_session(
                credentials.get("username", ""), 
                credentials.get("password", ""), 
                "School"
            )
            school_id = identity.get("school_id") or "10266"

            courses = order_data.get("courses", [])
            if not courses:
                courses = [{
                    "category": order_data.get("category", "SWRP"),
                    "course_id": order_data.get("course_id", 1),
                    "licenses": order_data.get("licenses", 50),
                    "start_date": order_data.get("start_date", "2026-09-16"),
                    "end_date": order_data.get("end_date", "2027-09-16")
                }]

            # 🎯 LẤY CHUẨN XÁC DỮ LIỆU ANH NHẬP TỪ GIAO DIỆN
            contact_val = str(order_data.get("contact_info") or "Admin Automation Hub (hungnm@dtt.vn)").strip()
            notes_val = str(order_data.get("additional_notes") or order_data.get("notes") or "Order auto-generated by PTV Automation Hub").strip()

            payload = {
                "school_id": str(school_id),
                "contactInfoId": contact_val,
                "notes": notes_val,
                "type": "course"
            }

            # 🎯 ĐÓNG GÓI TOÀN BỘ CÁC MÔN HỌC (MULTI-COURSE LOOP)
            summary_parts = []
            for idx, c in enumerate(courses):
                cat_val = c.get("category", "SWRP")
                cid_val = str(c.get("course_id", 1))
                lic_qty = str(c.get("licenses", 50))
                s_date = normalize_date_iso(c.get("start_date", "2026-09-16"))
                e_date = normalize_date_iso(c.get("end_date", "2027-09-16"))

                payload[f"courses[{idx}][courseId]"] = cid_val
                payload[f"courses[{idx}][studentCount]"] = lic_qty
                payload[f"courses[{idx}][startDate]"] = s_date
                payload[f"courses[{idx}][endDate]"] = e_date
                payload[f"courses[{idx}][licenseCategory]"] = cat_val
                summary_parts.append(f"#{cid_val} ({lic_qty} SL)")

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
                        clean_summary = f"Order: {o_code} | {len(courses)} Khóa [{', '.join(summary_parts)}]"
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
    # 🤝 2. PARTNER DUYỆT SCHOOL ORDER (ĐA KHÓA HỌC MULTI-COURSE ALLOCATION)
    # =========================================================================
    async def partner_approve_school_order(
        self, 
        credentials: Dict[str, str], 
        order_identifier: Optional[str] = None,
        auto_create_prt_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None,
        note: Optional[str] = None
    ) -> Dict[str, Any]:
        """Partner duyệt School Order cấp đủ 100% tất cả các môn trong đơn hàng."""
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
                # 1. Lấy chi tiết toàn bộ các môn trong đơn
                detail_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/orders_management/getOrderDetail.php?order_id={num_order_id}"
                d_res = await client.get(detail_url)
                detail_data = d_res.json() if d_res.status_code == 200 else {}
                courses_req = detail_data.get("detail_package", {}).get("courses", [])

                if not courses_req and courses_needed:
                    courses_req = [
                        {"course_id": c.get("course_id"), "course_count": c.get("licenses", 5), "course_name": c.get("course_name", "")}
                        for c in courses_needed
                    ]

                if not courses_req:
                    return {"status": "failed", "error": f"Không tìm thấy chi tiết môn học của Order #{num_order_id}"}

                # 2. Quét kho License Pool của Partner
                pool_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/getPartnerPoolLicense.php?partner_id={partner_id}"
                p_res = await client.get(pool_url)
                pool_courses = p_res.json().get("data", {}).get("pool_courses", []) if p_res.status_code == 200 else []

                # Bản sao số dư kho để trừ dần (Virtual Pool Balance)
                pool_balance = {str(p.get("id")): int(p.get("item_quantity", 0)) for p in pool_courses}

                allocated_courses = []
                short_courses = []

                # 🎯 3. DUYỆT TỪNG MÔN TRONG ĐƠN ĐỂ TÌM POOL KHỚP
                for req in courses_req:
                    cid = str(req.get("course_id", ""))
                    c_name = req.get("course_name", f"Khóa #{cid}")
                    qty = int(req.get("course_count", 0))

                    matched_pool = None
                    # Bước A: Tìm pool có đúng course_id và đủ số lượng
                    for p in pool_courses:
                        pid = str(p.get("id"))
                        p_cid = str(p.get("course_id", ""))
                        if p_cid == cid and pool_balance.get(pid, 0) >= qty:
                            matched_pool = p
                            break

                    # Bước B: Fallback tìm pool bất kỳ còn đủ số lượng (nếu là pool dùng chung)
                    if not matched_pool:
                        for p in pool_courses:
                            pid = str(p.get("id"))
                            if pool_balance.get(pid, 0) >= qty:
                                matched_pool = p
                                break

                    if matched_pool:
                        pid = str(matched_pool.get("id"))
                        pool_balance[pid] -= qty  # Trừ số dư ảo
                        allocated_courses.append({
                            "course_id": cid,
                            "course_name": c_name,
                            "quantity": qty,
                            "pool_id": pid
                        })
                    else:
                        short_courses.append({
                            "course_id": cid,
                            "course_name": c_name,
                            "quantity": qty
                        })

                # 🟢 NẾU TẤT CẢ CÁC MÔN ĐỀU ĐỦ LICENSE ➔ DUYỆT ĐƠN 100%
                if not short_courses and len(allocated_courses) == len(courses_req):
                    approve_payload = {
                        "order_id": str(num_order_id),
                        "status": "1",
                        "partner_id": str(partner_id),
                        "username": credentials.get("username", "partnerdtte"),
                        "order_code": order_identifier or f"SCH-{num_order_id}",
                        "license_type": "course",
                        "note": note or "Approved by PTV Automation Hub Fast Engine"
                    }

                    details_str_list = []
                    for idx, c in enumerate(allocated_courses):
                        approve_payload[f"courses[{idx}][course_id]"] = str(c["course_id"])
                        approve_payload[f"courses[{idx}][quantity]"] = str(c["quantity"])
                        approve_payload[f"courses[{idx}][pool_id]"] = str(c["pool_id"])
                        details_str_list.append(f"#{c['course_id']} (SL: {c['quantity']}, Pool #{c['pool_id']})")

                    ap_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/orders_management/updateStatusOrder.php"
                    res = await client.post(ap_url, files=self._to_multipart(approve_payload))
                    
                    if res.status_code in (200, 201):
                        await self._sync_order_status_db(order_identifier, "Approved", credentials.get("username"))
                        clean_msg = f"Duyệt Order: {order_identifier} ({len(allocated_courses)} khóa) | {' + '.join(details_str_list)}"
                        logger.info(f"✅ [Partner Order] {clean_msg}")
                        return {
                            "status": "success",
                            "order_identifier": order_identifier,
                            "message": clean_msg
                        }

                # 🔴 NẾU CÓ BẤT KỲ MÔN NÀO THIẾU ➔ TỰ ĐỘNG TẠO PRT CONTRACT GỒM TẤT CẢ CÁC MÔN THIẾU
                short_desc = ", ".join([f"#{c['course_id']} (cần {c['quantity']})" for c in short_courses])
                logger.warning(f"⚠️ Kho Partner thiếu License cho Order [{order_identifier}]: {short_desc}")

                if auto_create_prt_if_short:
                    # 🎯 HỆ THỐNG TỰ ĐỘNG TẠO GHI CHÚ PHẢ HỆ (LINEAGE PROVENANCE)
                    resolved_school_name = credentials.get("school_name") or order_identifier
                    sys_topup_notes = f"[CẤP BÙ CHO ORDER: {order_identifier} | TRƯỜNG: {resolved_school_name}] Thiếu: {short_desc}"

                    topup_payload = {
                        "partner_id": str(partner_id),
                        "order_type": "License",
                        "order_notes": sys_topup_notes,  # 🎯 Hệ thống tự đặt
                        "status": "pending_distributor_review",
                        "total_amount": "100"
                    }

                    for idx, sc in enumerate(short_courses):
                        qty_topup = sc["quantity"] * 2 if sc["quantity"] < 50 else sc["quantity"]
                        topup_payload[f"courses[{idx}][course_id]"] = str(sc["course_id"])
                        topup_payload[f"courses[{idx}][course_name]"] = str(sc["course_name"])
                        topup_payload[f"courses[{idx}][student_count]"] = str(qty_topup)
                        topup_payload[f"courses[{idx}][category]"] = "SWRP"
                        topup_payload[f"courses[{idx}][unit_price]"] = "10"
                        topup_payload[f"courses[{idx}][total_amount]"] = str(qty_topup * 10)

                    prt_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/createOrderSale.php"
                    prt_res = await client.post(prt_url, files=self._to_multipart(topup_payload))
                    
                    if prt_res.status_code == 200:
                        prt_data = prt_res.json().get("data", {})
                        prt_code = prt_data.get("order_code")
                        await self._record_created_contract_db(
                            prt_code, "PRT", "Awaiting Distributor", 
                            partner_name=credentials.get("username"),
                            courses=short_courses
                        )
                        clean_msg = f"Thiếu License Order {order_identifier} ({short_desc}) ➔ Tạo PRT: {prt_code}"
                        logger.warning(f"⚠️ [Partner Order] {clean_msg}")
                        return {
                            "status": "insufficient_pool_created_prt",
                            "order_identifier": order_identifier,
                            "prt_contract_code": prt_code,
                            "school_name": resolved_school_name,
                            "origin_notes": sys_topup_notes,
                            "message": clean_msg
                        }

                return {
                    "status": "insufficient_pool",
                    "order_identifier": order_identifier,
                    "message": f"Thiếu License Order {order_identifier}: {short_desc}"
                }

        except Exception as e:
            logger.error(f"❌ Lỗi Partner Approve Order: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 🔍 3. FETCH CHI TIẾT ĐƠN HÀNG (TRÍCH XUẤT 100% CÁC KHÓA HỌC)
    # =========================================================================
    async def fetch_school_order_detailed_courses(self, credentials: Dict[str, str], order_identifier: str) -> Dict[str, Any]:
        """Trích xuất danh sách tất cả môn học trong Order."""
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
    # 🔍 CÁC HÀM TRUY VẤN DỮ LIỆU CŨ
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