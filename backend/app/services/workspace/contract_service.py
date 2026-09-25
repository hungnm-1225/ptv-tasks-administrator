# =============================================================================
# [VIẾT LẠI TOÀN BỘ] backend/app/services/workspace/contract_service.py
# Sửa lỗi: Cấp bù vừa đủ (xóa bỏ * 2), loại bỏ tiền giả lập, sửa endpoint Sales Admin chống 302
# Tác giả: Nguyễn Mạnh Hùng & Co-pilot
# =============================================================================

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
    """Xử lý các nghiệp vụ tạo và phê duyệt Contract giữa Partner - Distributor - Sales Admin."""

    async def _steal_role_session(self, username: str, password: str, role_title: str) -> Tuple[Dict[str, str], Dict[str, Any]]:
        return await get_or_steal_role_session(self, username, password, role_title)

    @staticmethod
    def _to_multipart(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        return {k: (None, str(v) if v is not None else "") for k, v in data_dict.items()}

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
    # 📝 1. PARTNER TẠO PRT CONTRACT
    # =========================================================================
    async def partner_create_contract(self, credentials: Dict[str, str], contract_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Partner")
            partner_id = identity.get("partner_id")

            courses = contract_data.get("courses", [])
            safe_amount = str(contract_data.get("total_amount", 0)).strip()

            payload = {
                "partner_id": str(partner_id),
                "order_type": "License",
                "order_notes": contract_data.get("notes", "Requested by PTV Automation Hub"),
                "status": "pending_distributor_review",
                "total_amount": safe_amount
            }

            summary_parts = []
            for idx, c in enumerate(courses):
                c_id = str(c.get("course_id", 1344))
                c_name = c.get("course_name", f"Khóa #{c_id}")
                c_lic = str(c.get("licenses", 1))
                c_cat = c.get("category", "SWRP")

                payload[f"courses[{idx}][course_id]"] = c_id
                payload[f"courses[{idx}][course_name]"] = c_name
                payload[f"courses[{idx}][student_count]"] = c_lic
                payload[f"courses[{idx}][category]"] = c_cat
                payload[f"courses[{idx}][unit_price]"] = "0"
                payload[f"courses[{idx}][total_amount]"] = "0"
                summary_parts.append(f"#{c_id} ({c_lic} SL)")

            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/createOrderSale.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    data = res.json().get("data", {})
                    prt_code = data.get("order_code")
                    prt_id = str(data.get("id"))
                    await self._record_created_contract_db(prt_code, "PRT", "Awaiting Distributor", partner_name=credentials.get("username"), courses=courses)
                    
                    clean_msg = f"Tạo PRT: {prt_code} | {len(courses)} Khóa [{', '.join(summary_parts)}]"
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
    # 🏢 2. DISTRIBUTOR DUYỆT PRT CONTRACT (CẤP BÙ VỪA ĐỦ, KHÔNG NHÂN 2)
    # =========================================================================
    async def distributor_approve_partner_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        auto_create_dst_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None,
        note: Optional[str] = None,
        origin_order_code: Optional[str] = None,
        school_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Distributor duyệt PRT Contract qua Direct API (Tạo DST bù cho tất cả các môn thiếu)."""
        try:
            # 🛑 CHỐT CHẶN: KIỂM TRA MÃ HỢP ĐỒNG HỢP LỆ TRƯỚC KHI BẮN API
            if not contract_identifier or str(contract_identifier).strip().lower() in ("none", "null", ""):
                return {
                    "status": "failed", 
                    "error": "Mã hợp đồng PRT không hợp lệ (Bị rỗng hoặc mang giá trị None)"
                }

            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Distributor")
            
            raw_did = identity.get("distributor_id") or identity.get("id") or "36"
            dist_id = str(raw_did).strip() if str(raw_did).strip().isdigit() else "36"

            clean_num_match = re.search(r"\d+$", str(contract_identifier))
            if not clean_num_match:
                return {
                    "status": "failed", 
                    "error": f"Không trích xuất được ID số nguyên từ mã PRT '{contract_identifier}'"
                }
            prt_num_id = clean_num_match.group(0)

            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                payload = {
                    "order_id": str(prt_num_id),
                    "status": "approved",
                    "distributor_id": str(dist_id),
                    "username": credentials.get("username", "testdistributor"),
                    "license_type": "license",
                    "note": note or "Approved by PTV Automation Hub Fast Engine"
                }
                url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/updateStatusPartnerOrder.php"
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    res_json = res.json()
                    msg = str(res_json.get("message", "")).lower()

                    if "success" in msg or (res_json.get("code") == 200 and "insufficient" not in msg):
                        await self._sync_contract_status_db(contract_identifier, "PRT", "Approved")
                        clean_msg = f"Duyệt PRT: {contract_identifier}"
                        logger.info(f"✅ [Distributor Contract] {clean_msg}")
                        return {
                            "status": "success",
                            "contract_identifier": contract_identifier,
                            "message": clean_msg
                        }

                    # THIẾU LICENSE ➔ TẠO DST CONTRACT VỪA ĐỦ
                    if auto_create_dst_if_short:
                        courses_to_topup = courses_needed or []
                        origin_part = f" ➔ GỐC ORDER: {origin_order_code}" if origin_order_code else ""
                        school_part = f" | TRƯỜNG: {school_name}" if school_name else ""
                        sys_dst_notes = f"[CẤP BÙ CHO PRT: {contract_identifier}{origin_part}{school_part}] Yêu cầu cấp bù hạn ngạch"

                        safe_amount = str(total_amount if total_amount is not None else "0").strip()

                        dst_payload = {
                            "distributor_id": str(dist_id),
                            "order_type": "License",
                            "order_notes": sys_dst_notes,
                            "total_amount": safe_amount
                        }

                        topup_summary = []
                        # 🎯 CẤP VỪA ĐỦ ĐÚNG SỐ LƯỢNG THIẾU (KHÔNG NHÂN 2, KHÔNG FAKE $10)
                        for idx, c in enumerate(courses_to_topup):
                            cid = str(c.get("course_id", 1344))
                            cname = c.get("course_name", f"Khóa #{cid}")
                            qty_topup = int(c.get("licenses") or c.get("quantity") or 1)

                            dst_payload[f"courses[{idx}][course_id]"] = cid
                            dst_payload[f"courses[{idx}][course_name]"] = cname
                            dst_payload[f"courses[{idx}][student_count]"] = str(qty_topup)
                            dst_payload[f"courses[{idx}][category]"] = "SWRP"
                            dst_payload[f"courses[{idx}][unit_price]"] = "0"
                            dst_payload[f"courses[{idx}][total_amount]"] = "0"
                            topup_summary.append(f"#{cid} ({qty_topup} SL)")

                        dst_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/createOrder.php"
                        dst_res = await client.post(dst_url, files=self._to_multipart(dst_payload))
                        if dst_res.status_code == 200:
                            dst_data = dst_res.json().get("data", {})
                            dst_code = dst_data.get("order_code") or dst_data.get("contract_code")
                            if not dst_code and dst_data.get("id"):
                                dst_code = f"DST-{dst_data.get('id')}"

                            if not dst_code:
                                return {"status": "failed", "error": "API createOrder thành công nhưng không trả về DST code"}

                            await self._record_created_contract_db(dst_code, "DST", "Awaiting Sales Admin", courses=courses_to_topup)
                            clean_msg = f"Thiếu License PRT {contract_identifier} ➔ Tạo DST: {dst_code} [{', '.join(topup_summary)}]"
                            logger.warning(f"⚠️ [Distributor Contract] {clean_msg}")
                            return {
                                "status": "insufficient_pool_created_dst",
                                "contract_identifier": contract_identifier,
                                "dst_contract_code": dst_code,
                                "origin_order_code": origin_order_code,
                                "school_name": school_name,
                                "message": clean_msg
                            }

                return {"status": "failed", "error": f"Distributor duyệt PRT thất bại: {res.text}"}

        except Exception as e:
            logger.error(f"❌ Lỗi Distributor Duyệt Partner Contract: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 📦 3. DISTRIBUTOR TẠO DST CONTRACT GỬI SALES ADMIN
    # =========================================================================
    async def distributor_create_contract(self, credentials: Dict[str, str], contract_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Distributor")
            dist_id = identity.get("distributor_id") or "36"

            courses = contract_data.get("courses", [])
            safe_amount = str(contract_data.get("total_amount", 0)).strip()

            payload = {
                "distributor_id": str(dist_id),
                "order_type": "License",
                "order_notes": contract_data.get("notes", "Requested by PTV Automation Hub"),
                "total_amount": safe_amount
            }

            summary_parts = []
            for idx, c in enumerate(courses):
                c_id = str(c.get("course_id"))
                c_name = c.get("course_name", f"Khóa #{c_id}")
                c_lic = str(c.get("licenses", 1))
                c_cat = c.get("category", "")

                payload[f"courses[{idx}][course_id]"] = c_id
                payload[f"courses[{idx}][course_name]"] = c_name
                payload[f"courses[{idx}][student_count]"] = c_lic
                payload[f"courses[{idx}][category]"] = c_cat
                payload[f"courses[{idx}][unit_price]"] = "0"
                payload[f"courses[{idx}][total_amount]"] = "0"
                summary_parts.append(f"#{c_id} ({c_lic} SL)")

            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/createOrder.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    data = res.json().get("data", {})
                    dst_code = data.get("order_code") or f"DST-{data.get('id')}"
                    dst_id_num = str(data.get("id"))
                    await self._record_created_contract_db(dst_code, "DST", "Awaiting Sales Admin", courses=courses)
                    
                    clean_msg = f"Tạo DST: {dst_code} | {len(courses)} Khóa [{', '.join(summary_parts)}]"
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
    # 👑 4. SALES ADMIN DUYỆT DST CONTRACT (FAIL-CLOSED + CHỐNG REDIRECT 302)
    # =========================================================================
    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sales Admin duyệt DST Contract an toàn tuyệt đối, chống lỗi 302."""
        try:
            # 🎯 1. KIỂM ĐỊNH BẢO MẬT: BẮT BUỘC PHẢI CÓ MÃ CONTRACT THỰC TẾ
            clean_contract_code = str(contract_identifier or "").strip()
            if not clean_contract_code or clean_contract_code.lower() in ("none", "null", ""):
                return {
                    "status": "failed", 
                    "error": "Thiếu mã hợp đồng DST (contract_identifier) để Sales Admin duyệt"
                }

            fallback_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"")
            fallback_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")

            admin_user = credentials.get("username") or fallback_user
            admin_pass = credentials.get("password") or fallback_pass

            cookies, _ = await self._steal_role_session(admin_user, admin_pass, "Sales Admin")

            payload = {
                "order_code": clean_contract_code,
                "status": "approved",
                "username": admin_user,
                "note": justification or "Auto-approved by PTV Automation Hub",
                "license_type": "license"
            }

            # 🎯 2. ĐÍNH KÈM DẤU GẠCH CHÉO / VÀ BẬT FOLLOW_REDIRECTS CHỐNG LỖI 302
            canonical_url = f"{BASE_WORKSPACE_URL}/wp-json/sales-admin-workspace/v1/orders/update-status/"
            
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0, follow_redirects=True) as client:
                res = await client.post(canonical_url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    try:
                        res_data = res.json()
                        if res_data.get("status") == "success" or res_data.get("code") in (200, 201):
                            await self._sync_contract_status_db(clean_contract_code, "DST", "Approved")
                            clean_msg = f"Duyệt DST: {clean_contract_code}"
                            logger.info(f"✅ [Sales Admin] {clean_msg}")
                            return {
                                "status": "success",
                                "contract_identifier": clean_contract_code,
                                "justification": justification or "Auto-approved by Automation Hub",
                                "message": clean_msg
                            }
                    except Exception:
                        pass

                # Nếu thất bại, ghi nhận chi tiết để debug
                return {
                    "status": "failed", 
                    "error": f"API Sales Admin Duyệt thất bại (HTTP {res.status_code}): {res.text[:300]}"
                }

        except Exception as e:
            logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
            return {"status": "failed", "error": str(e)}