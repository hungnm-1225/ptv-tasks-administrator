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
            logger.warning(f"⚠️ Cannot invalidate ws_cache: {e}")

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
            logger.warning(f"⚠️ [DB SYNC] Error updating Contract: {e}")

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
            logger.info(f"💾 [DB SYNC] Saved Contract [{contract_code}] ({contract_type}) ➔ Status: '{status}'")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Error recording Contract: {e}")

    # =========================================================================
    # 📝 1. PARTNER TẠO PRT CONTRACT (LINEAGE & CONTACT INFO ENGLISH)
    # =========================================================================
    async def partner_create_contract(self, credentials: Dict[str, str], contract_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Partner")
            partner_id = identity.get("partner_id")

            courses = contract_data.get("courses", [])
            safe_amount = str(contract_data.get("total_amount", 0)).strip()

            # 🎯 BẢO TOÀN CONTACT INFO & ĐỊNH HÌNH ADDITIONAL NOTE KÈM LINEAGE TRACKING
            contact_val = str(contract_data.get("contact_info") or contract_data.get("contactInfoId") or "Admin Automation Hub (hungnm@dtt.vn)").strip()
            user_additional = str(contract_data.get("additional_notes") or contract_data.get("notes") or "").strip()
            
            origin_order = contract_data.get("origin_order_code")
            school_name = contract_data.get("school_name")

            if origin_order:
                school_suffix = f" | School: {school_name}" if school_name else ""
                lineage_tag = f"[Created to approve School Order: {origin_order}{school_suffix}]"
                full_notes = f"{lineage_tag} {user_additional}".strip()
            else:
                full_notes = user_additional or "Requested by PTV Automation Hub"

            payload = {
                "partner_id": str(partner_id),
                "order_type": "License",
                "order_notes": full_notes,
                "notes": full_notes,
                "contactInfoId": contact_val,
                "contact_info": contact_val,
                "status": "pending_distributor_review",
                "total_amount": safe_amount
            }

            summary_parts = []
            for idx, c in enumerate(courses):
                c_id = str(c.get("course_id", "")).strip()
                if not c_id:
                    raise RuntimeError("Thiếu course_id trong danh sách môn học!")
                c_name = c.get("course_name", f"Course #{c_id}")
                c_lic = str(c.get("licenses", 1))
                c_cat = c.get("category", "SWRP")

                payload[f"courses[{idx}][course_id]"] = c_id
                payload[f"courses[{idx}][course_name]"] = c_name
                payload[f"courses[{idx}][student_count]"] = c_lic
                payload[f"courses[{idx}][category]"] = c_cat
                payload[f"courses[{idx}][unit_price]"] = "0"
                payload[f"courses[{idx}][total_amount]"] = "0"
                summary_parts.append(f"#{c_id} ({c_lic} Qty)")

            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/createOrderSale.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    data = res.json().get("data", {})
                    prt_code = data.get("order_code")
                    prt_id = str(data.get("id"))
                    await self._record_created_contract_db(
                        prt_code, "PRT", "Awaiting Distributor", 
                        partner_name=credentials.get("username"), 
                        courses=courses,
                        contact_info=contact_val,
                        additional_notes=full_notes
                    )
                    
                    clean_msg = f"Created PRT: {prt_code} | {len(courses)} Courses [{', '.join(summary_parts)}]"
                    logger.info(f"✅ [Partner Contract] {clean_msg}")
                    return {
                        "status": "success",
                        "contract_id": prt_id,
                        "contract_code": prt_code,
                        "contact_info": contact_val,
                        "additional_notes": full_notes,
                        "message": clean_msg
                    }
                return {"status": "failed", "error": f"API Create PRT failed: {res.text}"}
        except Exception as e:
            logger.error(f"❌ Error in Partner Create Contract: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 🏢 2. DISTRIBUTOR DUYỆT PRT CONTRACT (ĐỐI SOÁT KHO 2 CHIỀU & ZERO-MOCK)
    # =========================================================================
    async def distributor_approve_partner_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        auto_create_dst_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None,
        note: Optional[str] = None,
        contact_info: Optional[str] = None,
        additional_notes: Optional[str] = None,
        origin_order_code: Optional[str] = None,
        school_name: Optional[str] = None,
        total_amount: Optional[str] = "0"
    ) -> Dict[str, Any]:
        """Distributor duyệt PRT Contract: Đối soát kho qua getDistributorPoolLicense trước khi duyệt."""
        try:
            clean_contract_code = str(contract_identifier or "").strip()
            if not clean_contract_code or clean_contract_code.lower() in ("none", "null", ""):
                return {"status": "failed", "error": "Thiếu mã hợp đồng PRT (contract_identifier)"}

            dist_user = str(credentials.get("username") or "").strip()
            dist_pass = str(credentials.get("password") or "").strip()

            if not dist_user:
                return {"status": "failed", "error": "Thiếu thông tin đăng nhập Distributor (username rỗng)"}

            cookies, identity = await self._steal_role_session(dist_user, dist_pass, "Distributor")

            # 🎯 1. XÁC ĐỊNH DISTRIBUTOR_ID CHUẨN XÁC TỪ SESSION HOẶC VAULT
            dist_id = None
            raw_did = identity.get("distributor_id") or identity.get("id") or identity.get("user_id")
            if raw_did and str(raw_did).strip().isdigit():
                dist_id = str(raw_did).strip()

            if not dist_id:
                try:
                    from app.core.supabase import get_supabase_client
                    supabase = get_supabase_client()
                    v_res = supabase.table("workspace_credentials_vault") \
                        .select("org_id") \
                        .ilike("username", dist_user) \
                        .execute()
                    
                    if v_res.data:
                        org_id = v_res.data[0].get("org_id")
                        org_res = supabase.table("workspace_organizations") \
                            .select("code, partner_id") \
                            .eq("id", org_id) \
                            .execute()
                        if org_res.data:
                            num_m = re.search(r"\d+", str(org_res.data[0].get("code", "")))
                            if num_m:
                                dist_id = num_m.group(0)
                except Exception as db_err:
                    logger.warning(f"⚠️ Tra cứu Distributor ID từ Supabase thất bại: {db_err}")

            if not dist_id or not dist_id.isdigit():
                err_msg = f"KHÔNG THỂ XÁC ĐỊNH DISTRIBUTOR ID CHO TÀI KHOẢN '{dist_user}'. DỪNG THỰC THI!"
                logger.error(f"❌ [Distributor Fatal] {err_msg}")
                return {"status": "failed", "error": err_msg}

            wp_username = str(identity.get("username") or dist_user).strip()
            if "@" in wp_username:
                wp_username = wp_username.split("@")[0]

            logger.info(f"🏢 [Distributor Contract] Đã xác định Distributor ID thực tế: [{dist_id}] cho user '{wp_username}'")

            contact_val = str(contact_info or "Admin Automation Hub (hungnm@dtt.vn)").strip()
            approve_note = note or additional_notes or ""

            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                # 🎯 2. LẤY CHI TIẾT CONTRACT CỦA PARTNER (getOrderDetail.php?order_code=...)
                order_detail_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/getOrderDetail.php?order_code={clean_contract_code}"
                detail_res = await client.get(order_detail_url)
                
                contract_courses = []
                prt_num_id = None

                if detail_res.status_code == 200:
                    try:
                        c_data = detail_res.json().get("data", {})
                        prt_num_id = str(c_data.get("id") or "")
                        contract_courses = c_data.get("courses", [])
                    except Exception:
                        pass

                # Fallback trích xuất ID số nguyên từ mã PRT nếu detail không trả về id
                if not prt_num_id or not prt_num_id.isdigit():
                    num_match = re.search(r"\d+$", clean_contract_code)
                    if num_match:
                        prt_num_id = num_match.group(0)

                if not prt_num_id:
                    return {"status": "failed", "error": f"Không thể xác định integer ID cho contract '{clean_contract_code}'"}

                # Nếu getOrderDetail chưa có courses thì dùng courses_needed truyền vào
                if not contract_courses and courses_needed:
                    contract_courses = [
                        {
                            "item_id": c.get("course_id") or c.get("item_id"),
                            "item_name": c.get("course_name") or c.get("item_name", ""),
                            "item_quantity": c.get("licenses") or c.get("quantity") or c.get("item_quantity", 1),
                            "category": c.get("category", "SWRP")
                        }
                        for c in courses_needed
                    ]

                if not contract_courses:
                    err_msg = f"Không tìm thấy danh sách môn học của PRT Contract '{clean_contract_code}'"
                    logger.error(f"❌ [Distributor Contract] {err_msg}")
                    return {"status": "failed", "error": err_msg}

                # 🎯 3. LẤY DANH SÁCH LICENSE TRONG KHO CỦA DISTRIBUTOR (getDistributorPoolLicense.php)
                pool_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/getDistributorPoolLicense.php?distributor_id={dist_id}"
                p_res = await client.get(pool_url)
                pool_courses = p_res.json().get("data", {}).get("pool_courses", []) if p_res.status_code == 200 else []

                # Tính tổng số lượng khả dụng theo từng item_id (Course ID) trong kho
                pool_stock: Dict[str, int] = {}
                for pc in pool_courses:
                    p_cid = str(pc.get("item_id", "")).strip()
                    p_qty = int(pc.get("item_quantity", 0))
                    pool_stock[p_cid] = pool_stock.get(p_cid, 0) + p_qty

                # 🎯 4. SO KHỚP CHÍNH XÁC THEO item_id VÀ item_quantity
                short_courses = []
                approved_summary = []

                for req in contract_courses:
                    cid = str(req.get("item_id") or req.get("course_id", "")).strip()
                    cname = str(req.get("item_name") or req.get("course_name", f"Course #{cid}")).strip()
                    qty_needed = int(req.get("item_quantity") or req.get("licenses") or req.get("quantity") or 1)
                    ccat = str(req.get("category_license") or req.get("category") or "SWRP").strip()

                    current_stock = pool_stock.get(cid, 0)
                    if current_stock >= qty_needed:
                        pool_stock[cid] -= qty_needed
                        approved_summary.append(f"#{cid} (Needs: {qty_needed}, Stock: {current_stock})")
                    else:
                        shortage = qty_needed - current_stock
                        short_courses.append({
                            "course_id": cid,
                            "course_name": cname,
                            "licenses": shortage,
                            "quantity": shortage,
                            "category": ccat
                        })

                # 🟢 5. NẾU ĐỦ 100% LICENSE TRONG KHO ➔ DUYỆT ĐƠN QUA updateStatusPartnerOrder.php
                if not short_courses:
                    logger.info(f"📦 [Distributor Stock Check] Kho đủ License cho PRT {clean_contract_code}: {', '.join(approved_summary)}")

                    payload = {
                        "order_id": str(prt_num_id),
                        "status": "approved",
                        "distributor_id": str(dist_id),
                        "username": wp_username,
                        "license_type": "license",
                        "note": approve_note
                    }

                    url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/updateStatusPartnerOrder.php"
                    res = await client.post(url, files=self._to_multipart(payload))

                    if res.status_code == 200:
                        try:
                            res_json = res.json()
                        except Exception:
                            res_json = {}

                        res_code = res_json.get("code")
                        msg = str(res_json.get("message", "")).lower()

                        if res_code in (200, 201) or "success" in msg:
                            await self._sync_contract_status_db(clean_contract_code, "PRT", "Approved")
                            clean_msg = f"Approved PRT: {clean_contract_code} (Licenses deducted from pool)"
                            logger.info(f"✅ [Distributor Contract] {clean_msg}")
                            return {
                                "status": "success",
                                "contract_identifier": clean_contract_code,
                                "message": clean_msg
                            }
                        else:
                            err_msg = res_json.get("message") or res.text
                            logger.error(f"❌ [Distributor Approve PRT Reject] PHP từ chối với code {res_code}: {err_msg}")
                            return {
                                "status": "failed",
                                "error": f"Distributor approve PRT thất bại (code {res_code}): {err_msg}"
                            }
                    else:
                        err_msg = f"Distributor approve PRT lỗi HTTP {res.status_code}: {res.text}"
                        logger.error(f"❌ {err_msg}")
                        return {"status": "failed", "error": err_msg}

                # 🔴 6. NẾU KHO THIẾU THẬT SỰ ➔ MỚI TẠO ĐƠN BÙ DST GỬI SALES ADMIN
                short_desc = ", ".join([f"#{c['course_id']} (needs {c['licenses']})" for c in short_courses])
                logger.warning(f"⚠️ Kho Distributor thiếu môn cho PRT [{clean_contract_code}]: {short_desc}")

                if auto_create_dst_if_short:
                    origin_part = f" | Origin Order: {origin_order_code}" if origin_order_code else ""
                    school_part = f" | School: {school_name}" if school_name else ""
                    
                    user_custom_note = (additional_notes or note or "").strip()
                    lineage_tag = f"[Auto Top-up for Partner Contract: {clean_contract_code}{origin_part}{school_part}]"
                    sys_dst_notes = f"{lineage_tag} {user_custom_note}".strip() if user_custom_note else f"{lineage_tag} Quota top-up requested"

                    safe_amount = str(total_amount or "0").strip()

                    dst_payload = {
                        "distributor_id": str(dist_id),
                        "order_type": "License",
                        "order_notes": sys_dst_notes,
                        "notes": sys_dst_notes,
                        "contactInfoId": contact_val,
                        "contact_info": contact_val,
                        "total_amount": safe_amount
                    }

                    topup_summary = []
                    for idx, sc in enumerate(short_courses):
                        cid = str(sc["course_id"])
                        cname = str(sc["course_name"])
                        qty_topup = int(sc["licenses"])
                        ccat = str(sc.get("category") or "SWRP")

                        dst_payload[f"courses[{idx}][course_id]"] = cid
                        dst_payload[f"courses[{idx}][course_name]"] = cname
                        dst_payload[f"courses[{idx}][student_count]"] = str(qty_topup)
                        dst_payload[f"courses[{idx}][category]"] = ccat
                        dst_payload[f"courses[{idx}][unit_price]"] = "0"
                        dst_payload[f"courses[{idx}][total_amount]"] = "0"
                        topup_summary.append(f"#{cid} ({qty_topup} Qty)")

                    dst_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/createOrder.php"
                    dst_res = await client.post(dst_url, files=self._to_multipart(dst_payload))

                    if dst_res.status_code == 200:
                        dst_data = dst_res.json().get("data", {})
                        dst_code = dst_data.get("order_code") or dst_data.get("contract_code")
                        if not dst_code and dst_data.get("id"):
                            dst_code = f"DST-{dst_data.get('id')}"

                        if not dst_code:
                            return {"status": "failed", "error": "API createOrder thành công nhưng không trả về mã DST"}

                        await self._record_created_contract_db(
                            dst_code, "DST", "Awaiting Sales Admin", 
                            courses=short_courses,
                            contact_info=contact_val,
                            additional_notes=sys_dst_notes
                        )
                        clean_msg = f"Kho Distributor thiếu License cho PRT {clean_contract_code} ➔ Đã tạo DST bù: {dst_code} [{', '.join(topup_summary)}]"
                        logger.warning(f"⚠️ [Distributor Contract] {clean_msg}")
                        return {
                            "status": "insufficient_pool_created_dst",
                            "contract_identifier": clean_contract_code,
                            "dst_contract_code": dst_code,
                            "origin_order_code": origin_order_code,
                            "school_name": school_name,
                            "contact_info": contact_val,
                            "additional_notes": sys_dst_notes,
                            "message": clean_msg
                        }
                    else:
                        err_msg = f"API createOrder thất bại (HTTP {dst_res.status_code}): {dst_res.text}"
                        logger.error(f"❌ {err_msg}")
                        return {"status": "failed", "error": err_msg}

                return {
                    "status": "insufficient_pool",
                    "contract_identifier": clean_contract_code,
                    "message": f"Kho Distributor không đủ License cho PRT {clean_contract_code}: {short_desc}"
                }

        except Exception as e:
            logger.error(f"❌ Lỗi trong Distributor Approve Partner Contract: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 📦 3. DISTRIBUTOR TẠO DST CONTRACT GỬI SALES ADMIN
    # =========================================================================
    async def distributor_create_contract(self, credentials: Dict[str, str], contract_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            cookies, identity = await self._steal_role_session(credentials.get("username", ""), credentials.get("password", ""), "Distributor")
            dist_id = str(identity.get("distributor_id") or identity.get("id") or "").strip()
            if not dist_id or not dist_id.isdigit():
                raise RuntimeError(f"Không thể xác định distributor_id thực tế cho user '{credentials.get('username')}'")

            courses = contract_data.get("courses", [])
            safe_amount = str(contract_data.get("total_amount", 0)).strip()

            contact_val = str(contract_data.get("contact_info") or contract_data.get("contactInfoId") or "Admin Automation Hub (hungnm@dtt.vn)").strip()
            user_additional = str(contract_data.get("additional_notes") or contract_data.get("notes") or "").strip()
            
            origin_prt = contract_data.get("origin_prt_code") or contract_data.get("contract_identifier")
            origin_order = contract_data.get("origin_order_code")
            school_name = contract_data.get("school_name")

            if origin_prt or origin_order:
                prt_part = f"Partner Contract: {origin_prt}" if origin_prt else ""
                order_part = f"School Order: {origin_order}" if origin_order else ""
                school_part = f"School: {school_name}" if school_name else ""
                inner_tag = " | ".join([p for p in (prt_part, order_part, school_part) if p])
                lineage_tag = f"[Created to approve {inner_tag}]"
                full_notes = f"{lineage_tag} {user_additional}".strip()
            else:
                full_notes = user_additional or "Requested by PTV Automation Hub"

            payload = {
                "distributor_id": str(dist_id),
                "order_type": "License",
                "order_notes": full_notes,
                "notes": full_notes,
                "contactInfoId": contact_val,
                "contact_info": contact_val,
                "total_amount": safe_amount
            }

            summary_parts = []
            for idx, c in enumerate(courses):
                c_id = str(c.get("course_id"))
                c_name = c.get("course_name", f"Course #{c_id}")
                c_lic = str(c.get("licenses", 1))
                c_cat = c.get("category", "")

                payload[f"courses[{idx}][course_id]"] = c_id
                payload[f"courses[{idx}][course_name]"] = c_name
                payload[f"courses[{idx}][student_count]"] = c_lic
                payload[f"courses[{idx}][category]"] = c_cat
                payload[f"courses[{idx}][unit_price]"] = "0"
                payload[f"courses[{idx}][total_amount]"] = "0"
                summary_parts.append(f"#{c_id} ({c_lic} Qty)")

            url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/createOrder.php"
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                res = await client.post(url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    data = res.json().get("data", {})
                    dst_code = data.get("order_code") or f"DST-{data.get('id')}"
                    dst_id_num = str(data.get("id"))
                    await self._record_created_contract_db(
                        dst_code, "DST", "Awaiting Sales Admin", 
                        courses=courses,
                        contact_info=contact_val,
                        additional_notes=full_notes
                    )
                    
                    clean_msg = f"Created DST: {dst_code} | {len(courses)} Courses [{', '.join(summary_parts)}]"
                    logger.info(f"✅ [Distributor Contract] {clean_msg}")
                    return {
                        "status": "success",
                        "contract_id": dst_id_num,
                        "contract_code": dst_code,
                        "contact_info": contact_val,
                        "additional_notes": full_notes,
                        "message": clean_msg
                    }
                return {"status": "failed", "error": f"API Create DST failed: {res.text}"}
        except Exception as e:
            logger.error(f"❌ Error in Distributor Create Contract: {e}")
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # 👑 4. SALES ADMIN DUYỆT DST CONTRACT (STANDALONE VS FALLBACK CHUẨN XÁC)
    # =========================================================================
    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None,
        is_fallback: bool = False,
        origin_prt_code: Optional[str] = None,
        origin_order_code: Optional[str] = None,
        school_name: Optional[str] = None,
        contact_info: Optional[str] = None,
        additional_notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sales Admin duyệt DST Contract: Phân biệt duyệt Standalone vs Fallback Cascade."""
        try:
            clean_contract_code = str(contract_identifier or "").strip()
            if not clean_contract_code or clean_contract_code.lower() in ("none", "null", ""):
                return {
                    "status": "failed", 
                    "error": "Missing DST contract identifier (contract_identifier) for Sales Admin approval"
                }

            fallback_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"")
            fallback_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")

            admin_user = credentials.get("username") or fallback_user
            admin_pass = credentials.get("password") or fallback_pass

            cookies, _ = await self._steal_role_session(admin_user, admin_pass, "Sales Admin")

            # 🎯 XÂY DỰNG FINAL NOTE TIẾNG ANH:
            # 1. Nếu là Luồng Fallback (Cascade bù License từ School/Partner lên):
            if is_fallback or origin_prt_code or origin_order_code:
                lineage_items = []
                if origin_prt_code:
                    lineage_items.append(f"Partner Contract: {origin_prt_code}")
                if origin_order_code:
                    lineage_items.append(f"School Order: {origin_order_code}")
                if school_name:
                    lineage_items.append(f"School: {school_name}")

                tag_content = " | ".join(lineage_items) if lineage_items else f"DST: {clean_contract_code}"
                lineage_tag = f"[Approved to fulfill {tag_content}]"

                contact_part = f"Contact: {contact_info}" if contact_info else ""
                custom_note = justification or additional_notes or "Auto-approved for license quota top-up"
                note_part = f"Note: {custom_note}"

                final_note = f"{lineage_tag} " + " | ".join([p for p in (contact_part, note_part) if p])
            else:
                # 2. Nếu là Duyệt độc lập (Standalone): Nhận 100% Justification do Admin tự gõ
                final_note = (justification or "").strip() or "Approved by Sales Admin"

            payload = {
                "order_code": clean_contract_code,
                "status": "approved",
                "username": admin_user,
                "note": final_note,
                "license_type": "license"
            }

            canonical_url = f"{BASE_WORKSPACE_URL}/wp-json/sales-admin-workspace/v1/orders/update-status/"
            
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0, follow_redirects=True) as client:
                res = await client.post(canonical_url, files=self._to_multipart(payload))

                if res.status_code == 200:
                    try:
                        res_data = res.json()
                        if res_data.get("status") == "success" or res_data.get("code") in (200, 201):
                            await self._sync_contract_status_db(clean_contract_code, "DST", "Approved")
                            clean_msg = f"Approved DST: {clean_contract_code}"
                            logger.info(f"✅ [Sales Admin] {clean_msg}")
                            return {
                                "status": "success",
                                "contract_identifier": clean_contract_code,
                                "justification": final_note,
                                "message": clean_msg
                            }
                    except Exception:
                        pass

                return {
                    "status": "failed", 
                    "error": f"API Sales Admin Approval failed (HTTP {res.status_code}): {res.text[:300]}"
                }

        except Exception as e:
            logger.error(f"❌ Error in Sales Admin Approve: {e}")
            return {"status": "failed", "error": str(e)}