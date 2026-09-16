# backend/app/services/workspace/contract_service.py
import re
import os
import gc
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import httpx
from playwright.async_api import async_playwright

from app.core.config import settings
from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners

logger = logging.getLogger(__name__)


class WorkspaceContractService(WorkspaceBaseService):
    """
    Xử lý các nghiệp vụ tạo và phê duyệt Contract giữa Partner - Distributor - Sales Admin.
    ĐỘNG CƠ HYBRID V3.6: Playwright bốc Session (3-5s) -> Đóng Chromium -> HTTPX Direct API (200ms).
    """

    # =========================================================================
    # 🛠️ HELPER NỘI BỘ: BỐC SESSION PLAYWRIGHT KÈM ĐIỀU HƯỚNG SALES ADMIN
    # =========================================================================
    async def _steal_role_session(self, username: str, password: str, role_title: str) -> Tuple[Dict[str, str], Dict[str, Any]]:
        """Đăng nhập Playwright, chuyển hướng đặc trị cho Sales Admin, rút Cookie và đóng ngay."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, username, password, role_title)
                if not is_ok:
                    raise RuntimeError(f"Đăng nhập [{role_title}] thất bại: {login_err}")

                # 🎯 ĐẶC TRỊ CHUYỂN HƯỚNG SALES ADMIN DASHBOARD
                if role_title.lower() in ("sales admin", "sales_admin"):
                    logger.info("👑 Đã đăng nhập Sales Admin! Chủ động chuyển hướng sang /sales-admin-workspace/dashboard...")
                    try:
                        await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="domcontentloaded", timeout=35000)
                    except Exception:
                        pass
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-virtualScrollerContent, .MuiDataGrid-row", min_pacing_ms=400)

                wp_identity = await page.evaluate("""() => {
                    const u = window.user || {};
                    let localUser = {};
                    try { localUser = JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) {}
                    return {
                        distributor_id: u.distributor_id || localUser.distributor_id || null,
                        partner_id: u.partner_id || localUser.partner_id || null,
                        user_id: u.id || localUser.id || null,
                        username: u.username || localUser.username || ''
                    };
                }""")

                cookies = await context.cookies()
                cookies_dict = {c["name"]: c["value"] for c in cookies}
                return cookies_dict, wp_identity
            finally:
                await browser.close()
                gc.collect()

    @staticmethod
    def _to_multipart(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        return {k: (None, str(v) if v is not None else "") for k, v in data_dict.items()}

    # =========================================================================
    # 💾 ĐỒNG BỘ CSDL SUPABASE & CACHE
    # =========================================================================
    def _invalidate_workspace_ram_cache(self, cache_type: str = "all"):
        try:
            from app.api.v1.endpoints.workspace import ws_cache
            if cache_type in ("all", "contracts"):
                ws_cache.invalidate("all_cached_pending_contracts_PRT")
                ws_cache.invalidate("all_cached_pending_contracts_DST")
        except Exception as e:
            logger.warning(f"⚠️ Không thể invalidate ws_cache: {e}")

    async def _sync_contract_status_db(self, contract_identifier: str, contract_type: str = "PRT", new_status: str = "Approved"):
        if not contract_identifier:
            return
        try:
            from app.core.supabase import get_supabase_client
            clean_code = str(contract_identifier).strip()
            core_match = re.search(r"(\d{6,8}-\d+)", clean_code)
            pattern = f"%{core_match.group(1)}%" if core_match else f"%{clean_code}%"
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            
            supabase = get_supabase_client()
            update_res = supabase.table("workspace_contracts_cache").update({
                "status": new_status,
                "synced_at": now_utc
            }).ilike("contract_code", pattern).execute()

            if not update_res.data:
                supabase.table("workspace_contracts_cache").insert({
                    "contract_code": clean_code,
                    "contract_type": contract_type.upper(),
                    "status": new_status,
                    "total_licenses": 50,
                    "synced_at": now_utc,
                    "raw_data": {"auto_synced": True}
                }).execute()

            self._invalidate_workspace_ram_cache("contracts")
            logger.info(f"💾 [DB SYNC] Đã cập nhật {contract_type} Contract [{clean_code}] -> Status: '{new_status}'")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi cập nhật Contract: {e}")

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
                "total_licenses": 100,
                "synced_at": now_utc,
                "raw_data": kwargs
            }
            supabase.table("workspace_contracts_cache").upsert(record, on_conflict="contract_code").execute()
            self._invalidate_workspace_ram_cache("contracts")
            logger.info(f"💾 [DB SYNC] Ghi nhận Contract phát sinh [{contract_code}] ({contract_type}) -> Status: '{status}'")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi ghi nhận Contract: {e}")

    # =========================================================================
    # 📝 1. PARTNER TẠO PRT CONTRACT (DIRECT API)
    # =========================================================================
    async def partner_create_contract(self, credentials: Dict[str, str], contract_data: Dict[str, Any]) -> Dict[str, Any]:
        """Partner tạo PRT Contract siêu tốc qua Direct API createOrderSale.php."""
        async with acquire_playwright_slot("Partner Create Contract", lane="admin"):
            try:
                cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Partner")
                partner_id = identity.get("partner_id") or "60"

                courses = contract_data.get("courses", [])
                c_first = courses[0] if courses else {}

                payload = {
                    "partner_id": str(partner_id),
                    "order_type": "License",
                    "order_notes": contract_data.get("notes", "Auto-requested by PTV Automation Hub"),
                    "status": "pending_distributor_review",
                    "total_amount": "100",
                    "courses[0][course_id]": str(c_first.get("course_id", 1344)),
                    "courses[0][course_name]": c_first.get("course_name", "SWRP 1: STREAM Explorers (EN)"),
                    "courses[0][student_count]": str(c_first.get("licenses", 50)),
                    "courses[0][category]": c_first.get("category", "SWRP"),
                    "courses[0][unit_price]": "10",
                    "courses[0][total_amount]": "100"
                }

                url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/createOrderSale.php"
                async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                    t0 = asyncio.get_event_loop().time()
                    res = await client.post(url, files=self._to_multipart(payload))
                    elapsed = round((asyncio.get_event_loop().time() - t0) * 1000, 1)

                    if res.status_code == 200:
                        data = res.json().get("data", {})
                        prt_code = data.get("order_code")
                        prt_id = str(data.get("id"))
                        await self._record_created_contract_db(prt_code, "PRT", "Awaiting Distributor", partner_name=credentials.get("username"))
                        logger.info(f"🎉 TẠO PRT CONTRACT [{prt_code}] THÀNH CÔNG TRONG {elapsed}ms!")
                        return {
                            "status": "success",
                            "contract_id": prt_id,
                            "contract_code": prt_code,
                            "message": f"Partner đã tạo Contract {prt_code} thành công"
                        }
                    return {"status": "failed", "error": f"API Create PRT thất bại: {res.text}"}
            except Exception as e:
                logger.error(f"❌ Lỗi Partner Create Contract: {e}")
                return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 🏢 2. DISTRIBUTOR DUYỆT PARTNER CONTRACT (DIRECT API)
    # =========================================================================
    async def distributor_approve_partner_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        auto_create_dst_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Distributor duyệt PRT Contract qua Direct API updateStatusPartnerOrder.php."""
        async with acquire_playwright_slot("Distributor Approve Partner Contract", lane="admin"):
            try:
                cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                dist_id = identity.get("distributor_id") or "36"

                clean_num_match = re.search(r"\d+$", str(contract_identifier))
                prt_num_id = clean_num_match.group(0) if clean_num_match else str(contract_identifier)

                async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                    # Bắn lệnh phê duyệt
                    payload = {
                        "order_id": str(prt_num_id),
                        "status": "approved",
                        "distributor_id": str(dist_id),
                        "username": credentials.get("username", "testdistributor"),
                        "license_type": "license",
                        "note": "Approved by PTV Automation Hub Fast Engine"
                    }
                    url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/updateStatusPartnerOrder.php"
                    t0 = asyncio.get_event_loop().time()
                    res = await client.post(url, files=self._to_multipart(payload))
                    elapsed = round((asyncio.get_event_loop().time() - t0) * 1000, 1)

                    if res.status_code == 200:
                        res_json = res.json()
                        msg = str(res_json.get("message", "")).lower()

                        # Đủ License và Duyệt thành công
                        if "success" in msg or res_json.get("code") == 200 and "insufficient" not in msg:
                            await self._sync_contract_status_db(contract_identifier, "PRT", "Approved")
                            logger.info(f"🎉 DISTRIBUTOR DUYỆT PRT [{contract_identifier}] THÀNH CÔNG TRONG {elapsed}ms!")
                            return {
                                "status": "success",
                                "contract_identifier": contract_identifier,
                                "message": f"Distributor đã phê duyệt thành công Partner Contract [{contract_identifier}]!"
                            }

                        # Thiếu License trong Pool Distributor -> Tự động tạo DST Contract gửi Sales Admin
                        logger.warning(f"⚠️ Kho Distributor thiếu License khi duyệt [{contract_identifier}]: {res_json.get('message')}")
                        if auto_create_dst_if_short:
                            dst_payload = {
                                "distributor_id": str(dist_id),
                                "order_type": "License",
                                "order_notes": f"Auto-topup for PRT Contract {contract_identifier}",
                                "total_amount": "100",
                                "courses[0][course_id]": "1344",
                                "courses[0][course_name]": "SWRP 1: STREAM Explorers (EN)",
                                "courses[0][student_count]": "100",
                                "courses[0][category]": "SWRP",
                                "courses[0][unit_price]": "10",
                                "courses[0][total_amount]": "100"
                            }
                            dst_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/createOrder.php"
                            dst_res = await client.post(dst_url, files=self._to_multipart(dst_payload))
                            if dst_res.status_code == 200:
                                dst_data = dst_res.json().get("data", {})
                                dst_code = dst_data.get("order_code")
                                await self._record_created_contract_db(dst_code, "DST", "Awaiting Sales Admin")
                                return {
                                    "status": "insufficient_pool_created_dst",
                                    "contract_identifier": contract_identifier,
                                    "dst_contract_code": dst_code,
                                    "message": f"Kho thiếu License, đã trực tiếp tạo DST Contract [{dst_code}] gửi Sales Admin."
                                }

                    return {"status": "failed", "error": f"Distributor duyệt PRT thất bại: {res.text}"}

            except Exception as e:
                logger.error(f"❌ Lỗi Distributor Duyệt Partner Contract: {e}")
                return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 📦 3. DISTRIBUTOR TẠO DST CONTRACT GỬI SALES ADMIN (DIRECT API)
    # =========================================================================
    async def distributor_create_contract(self, credentials: Dict[str, str], contract_data: Dict[str, Any]) -> Dict[str, Any]:
        """Distributor tạo DST Contract siêu tốc qua Direct API createOrder.php."""
        async with acquire_playwright_slot("Distributor Create Contract", lane="admin"):
            try:
                cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                dist_id = identity.get("distributor_id") or "36"

                courses = contract_data.get("courses", [])
                c_first = courses[0] if courses else {}

                payload = {
                    "distributor_id": str(dist_id),
                    "order_type": "License",
                    "order_notes": contract_data.get("notes", "Auto-requested by PTV Automation Hub"),
                    "total_amount": "100",
                    "courses[0][course_id]": str(c_first.get("course_id", 1344)),
                    "courses[0][course_name]": c_first.get("course_name", "SWRP 1: STREAM Explorers (EN)"),
                    "courses[0][student_count]": str(c_first.get("licenses", 100)),
                    "courses[0][category]": c_first.get("category", "SWRP"),
                    "courses[0][unit_price]": "10",
                    "courses[0][total_amount]": "100"
                }

                url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/createOrder.php"
                async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                    t0 = asyncio.get_event_loop().time()
                    res = await client.post(url, files=self._to_multipart(payload))
                    elapsed = round((asyncio.get_event_loop().time() - t0) * 1000, 1)

                    if res.status_code == 200:
                        data = res.json().get("data", {})
                        dst_code = data.get("order_code")
                        dst_id_num = str(data.get("id"))
                        await self._record_created_contract_db(dst_code, "DST", "Awaiting Sales Admin")
                        logger.info(f"🎉 TẠO DST CONTRACT [{dst_code}] THÀNH CÔNG TRONG {elapsed}ms!")
                        return {
                            "status": "success",
                            "contract_id": dst_id_num,
                            "contract_code": dst_code,
                            "message": f"Distributor đã tạo Contract {dst_code} gửi Sales Admin thành công"
                        }
                    return {"status": "failed", "error": f"API Create DST thất bại: {res.text}"}
            except Exception as e:
                logger.error(f"❌ Lỗi Distributor Create Contract: {e}")
                return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 👑 4. SALES ADMIN DUYỆT DST CONTRACT (DIRECT WP-JSON REST API)
    # =========================================================================
    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sales Admin phê duyệt tối cao DST Contract qua REST API update-status."""
        async with acquire_playwright_slot("Sales Admin Approve DST Contract", lane="admin"):
            try:
                fallback_user = str(getattr(settings, "TEST_ADMIN_USER", "adminworkspace")).strip().strip("'\"")
                fallback_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")

                admin_user = credentials.get("username") or fallback_user
                admin_pass = credentials.get("password") or fallback_pass

                cookies, _ = await self._steal_role_session(admin_user, admin_pass, "Sales Admin")

                payload = {
                    "order_code": str(contract_identifier).strip(),
                    "status": "approved",
                    "username": admin_user,
                    "note": justification or "Automation Flow - Processed by Automation Hub Fast Engine",
                    "license_type": "license"
                }

                url = f"{BASE_WORKSPACE_URL}/wp-json/sales-admin-workspace/v1/orders/update-status"
                async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                    t0 = asyncio.get_event_loop().time()
                    res = await client.post(url, files=self._to_multipart(payload))
                    elapsed = round((asyncio.get_event_loop().time() - t0) * 1000, 1)

                    if res.status_code == 200 and res.json().get("status") == "success":
                        await self._sync_contract_status_db(contract_identifier, "DST", "Approved")
                        logger.info(f"🎉 SALES ADMIN DUYỆT DST [{contract_identifier}] THÀNH CÔNG TRONG {elapsed}ms!")
                        return {
                            "status": "success",
                            "contract_identifier": contract_identifier,
                            "justification": justification or "Auto-approved by Automation Hub",
                            "message": "Sales Admin đã phê duyệt DST Contract thành công"
                        }

                    return {"status": "failed", "error": f"API Sales Admin Duyệt thất bại: {res.text}"}

            except Exception as e:
                logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
                return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 🔍 CÁC HÀM TRUY VẤN DỮ LIỆU CŨ (GIỮ TƯƠNG THÍCH NGƯỢC 100%)
    # =========================================================================
    async def fetch_partner_pending_school_orders(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Truy vấn danh sách School Orders của Partner."""
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
        """Truy vấn danh sách PRT Contracts của Distributor."""
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
        """Truy vấn danh sách DST Contracts của Sales Admin."""
        try:
            cookies, _ = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/getListOrder.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=20.0) as client:
                res = await client.get(url)
                contracts = res.json().get("data", []) if res.status_code == 200 else []
                return {"status": "success", "total": len(contracts), "contracts": contracts}
        except Exception as e:
            return {"status": "failed", "error": str(e), "contracts": []}