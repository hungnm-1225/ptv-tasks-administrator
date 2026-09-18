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

from app.core.config import settings
from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.services.workspace.order_service import get_or_steal_role_session

logger = logging.getLogger(__name__)


class WorkspaceContractService(WorkspaceBaseService):
    """
    Xử lý các nghiệp vụ tạo và phê duyệt Contract giữa Partner - Distributor - Sales Admin.
    ĐỘNG CƠ HYBRID V3.6: Tái sử dụng RAM Session Cache từ order_service ➔ Direct HTTPX (~150ms).
    """

    async def _steal_role_session(self, username: str, password: str, role_title: str) -> Tuple[Dict[str, str], Dict[str, Any]]:
        """Dùng chung Session Cache 2h với Order Service."""
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
            # 🎯 ĐÃ KHỚP SCHEMA: contract_code, sender_name, raw_payload
            update_res = supabase.table("workspace_contracts_cache").update({
                "status": new_status,
                "updated_at": now_utc,
                "last_synced_at": now_utc
            }).ilike("contract_code", pattern).execute()

            if not update_res.data:
                supabase.table("workspace_contracts_cache").insert({
                    "contract_code": clean_code,
                    "contract_type": contract_type.upper(),
                    "sender_name": "Partner",
                    "status": new_status,
                    "raw_payload": {"auto_synced": True},
                    "last_synced_at": now_utc,
                    "updated_at": now_utc
                }).execute()

            self._invalidate_workspace_ram_cache("contracts")
            logger.info(f"💾 [DB SYNC] {contract_type} Contract [{clean_code}] ➔ Status: '{new_status}'")
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
    # 📝 1. PARTNER TẠO PRT CONTRACT (DIRECT API - ĐÃ TỐI ƯU LOG)
    # =========================================================================
    async def partner_create_contract(self, credentials: Dict[str, str], contract_data: Dict[str, Any]) -> Dict[str, Any]:
        """Partner tạo PRT Contract qua Direct API createOrderSale.php (Không giữ Semaphore)."""
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Partner")
            partner_id = identity.get("partner_id") or "60"

            courses = contract_data.get("courses", [])
            c_first = courses[0] if courses else {}
            c_id = str(c_first.get("course_id", 1344))
            c_name = c_first.get("course_name", "SWRP 1: STREAM Explorers (EN)")
            c_lic = str(c_first.get("licenses", 50))
            c_cat = c_first.get("category", "SWRP")

            payload = {
                "partner_id": str(partner_id),
                "order_type": "License",
                "order_notes": contract_data.get("notes", "Auto-requested by PTV Automation Hub"),
                "status": "pending_distributor_review",
                "total_amount": "100",
                "courses[0][course_id]": c_id,
                "courses[0][course_name]": c_name,
                "courses[0][student_count]": c_lic,
                "courses[0][category]": c_cat,
                "courses[0][unit_price]": "10",
                "courses[0][total_amount]": "100"
            }

            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/createOrderSale.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    data = res.json().get("data", {})
                    prt_code = data.get("order_code")
                    prt_id = str(data.get("id"))
                    await self._record_created_contract_db(prt_code, "PRT", "Awaiting Distributor", partner_name=credentials.get("username"))
                    
                    clean_msg = f"Tạo PRT: {prt_code} | Khóa #{c_id} (SL: {c_lic})"
                    logger.info(f"✅ [Partner Contract] {clean_msg}")
                    return {
                        "status": "success",
                        "contract_id": prt_id,
                        "contract_code": prt_code,
                        "message": clean_msg
                    }
                return {"status": "failed", "error": f"API Create PRT thất bại: {res.text}"}
        except Exception as e:
            logger.error(f"❌ Lỗi Partner Create Contract: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 🏢 2. DISTRIBUTOR DUYỆT PARTNER CONTRACT (DIRECT API - ĐÃ TỐI ƯU LOG)
    # =========================================================================
    async def distributor_approve_partner_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        auto_create_dst_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Distributor duyệt PRT Contract qua Direct API updateStatusPartnerOrder.php."""
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Distributor")
            dist_id = identity.get("distributor_id") or "36"

            clean_num_match = re.search(r"\d+$", str(contract_identifier))
            prt_num_id = clean_num_match.group(0) if clean_num_match else str(contract_identifier)

            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                payload = {
                    "order_id": str(prt_num_id),
                    "status": "approved",
                    "distributor_id": str(dist_id),
                    "username": credentials.get("username", "testdistributor"),
                    "license_type": "license",
                    "note": "Approved by PTV Automation Hub Fast Engine"
                }
                url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/updateStatusPartnerOrder.php"
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    res_json = res.json()
                    msg = str(res_json.get("message", "")).lower()

                    # ĐỦ LICENSE VÀ DUYỆT THÀNH CÔNG
                    if "success" in msg or res_json.get("code") == 200 and "insufficient" not in msg:
                        await self._sync_contract_status_db(contract_identifier, "PRT", "Approved")
                        clean_msg = f"Duyệt PRT: {contract_identifier}"
                        logger.info(f"✅ [Distributor Contract] {clean_msg}")
                        return {
                            "status": "success",
                            "contract_identifier": contract_identifier,
                            "message": clean_msg
                        }

                    # THIẾU LICENSE ➔ TẠO DST CONTRACT GỬI SALES ADMIN
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
                            clean_msg = f"Thiếu License PRT {contract_identifier} ➔ Tạo DST: {dst_code}"
                            logger.warning(f"⚠️ [Distributor Contract] {clean_msg}")
                            return {
                                "status": "insufficient_pool_created_dst",
                                "contract_identifier": contract_identifier,
                                "dst_contract_code": dst_code,
                                "message": clean_msg
                            }

                return {"status": "failed", "error": f"Distributor duyệt PRT thất bại: {res.text}"}

        except Exception as e:
            logger.error(f"❌ Lỗi Distributor Duyệt Partner Contract: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 📦 3. DISTRIBUTOR TẠO DST CONTRACT GỬI SALES ADMIN (DIRECT API)
    # =========================================================================
    async def distributor_create_contract(self, credentials: Dict[str, str], contract_data: Dict[str, Any]) -> Dict[str, Any]:
        """Distributor tạo DST Contract qua Direct API createOrder.php (Không giữ Semaphore)."""
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Distributor")
            dist_id = identity.get("distributor_id") or "36"

            courses = contract_data.get("courses", [])
            c_first = courses[0] if courses else {}
            c_id = str(c_first.get("course_id", 1344))
            c_name = c_first.get("course_name", "SWRP 1: STREAM Explorers (EN)")
            c_lic = str(c_first.get("licenses", 100))
            c_cat = c_first.get("category", "SWRP")

            payload = {
                "distributor_id": str(dist_id),
                "order_type": "License",
                "order_notes": contract_data.get("notes", "Auto-requested by PTV Automation Hub"),
                "total_amount": "100",
                "courses[0][course_id]": c_id,
                "courses[0][course_name]": c_name,
                "courses[0][student_count]": c_lic,
                "courses[0][category]": c_cat,
                "courses[0][unit_price]": "10",
                "courses[0][total_amount]": "100"
            }

            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/createOrder.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    data = res.json().get("data", {})
                    dst_code = data.get("order_code")
                    dst_id_num = str(data.get("id"))
                    await self._record_created_contract_db(dst_code, "DST", "Awaiting Sales Admin")
                    
                    clean_msg = f"Tạo DST: {dst_code} | Khóa #{c_id} (SL: {c_lic})"
                    logger.info(f"✅ [Distributor Contract] {clean_msg}")
                    return {
                        "status": "success",
                        "contract_id": dst_id_num,
                        "contract_code": dst_code,
                        "message": clean_msg
                    }
                return {"status": "failed", "error": f"API Create DST thất bại: {res.text}"}
        except Exception as e:
            logger.error(f"❌ Lỗi Distributor Create Contract: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 👑 4. SALES ADMIN DUYỆT DST CONTRACT (DIRECT REST API - ĐÃ TỐI ƯU LOG)
    # =========================================================================
    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sales Admin phê duyệt DST Contract qua REST API update-status."""
        try:
            fallback_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"")
            fallback_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")

            admin_user = credentials.get("username") or fallback_user
            admin_pass = credentials.get("password") or fallback_pass

            cookies, _ = await self._steal_role_session(admin_user, admin_pass, "Sales Admin")

            payload = {
                "order_code": str(contract_identifier).strip(),
                "status": "approved",
                "username": admin_user,
                "note": justification or "Auto-approved by PTV Automation Hub",
                "license_type": "license"
            }

            url = f"{BASE_WORKSPACE_URL}/wp-json/sales-admin-workspace/v1/orders/update-status"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200 and res.json().get("status") == "success":
                    await self._sync_contract_status_db(contract_identifier, "DST", "Approved")
                    clean_msg = f"Duyệt DST: {contract_identifier}"
                    logger.info(f"✅ [Sales Admin] {clean_msg}")
                    return {
                        "status": "success",
                        "contract_identifier": contract_identifier,
                        "justification": justification or "Auto-approved by Automation Hub",
                        "message": clean_msg
                    }

                return {"status": "failed", "error": f"API Sales Admin Duyệt thất bại: {res.text}"}

        except Exception as e:
            logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
            return {"status": "failed", "error": str(e)}