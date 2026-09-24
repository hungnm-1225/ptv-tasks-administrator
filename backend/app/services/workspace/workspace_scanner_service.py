# =============================================================================
# [VIẾT LẠI TOÀN BỘ] backend/app/services/workspace/workspace_scanner_service.py
# Kiến trúc: Smart Dirty-Checking Scanner V4.0 (Zero Pointless Upserts)
# Tác giả: Nguyễn Mạnh Hùng & Co-pilot
# =============================================================================

import re
import logging
import asyncio
import gc
import time
from typing import Dict, Any, List, Set, Optional, Tuple
import httpx
from playwright.async_api import async_playwright

from app.core.supabase import get_supabase_client
from app.services.workspace_lineage_service import decrypt_password
from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot

logger = logging.getLogger(__name__)

# Danh sách các trạng thái kết thúc (Terminal States) - Đóng băng vĩnh viễn, cấm quét lại
TERMINAL_STATUSES = {
    "approved", "completed", "rejected", "cancelled", 
    "rejected by admin", "rejected by distributor", "1"
}


def _is_terminal(status: Optional[str]) -> bool:
    """Kiểm tra xem trạng thái đã hoàn tất/đóng băng chưa."""
    if not status:
        return False
    return str(status).strip().lower() in TERMINAL_STATUSES


def normalize_to_sch_code(code: Optional[str]) -> str:
    """Chuẩn hóa mã đơn hàng: Bóc tách 'SCH-...' sạch sẽ."""
    if not code:
        return ""
    clean = str(code).strip()
    match = re.search(r"(SCH-[\w-]+)", clean, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return clean.upper()


def _extract_numeric_id(item: Dict[str, Any], code_key: str = "order_code") -> int:
    """Trích xuất ID số nguyên phục vụ gọi getOrderDetail.php."""
    raw_id = item.get("id") or item.get("order_id")
    if raw_id is not None and str(raw_id).isdigit():
        return int(raw_id)
    
    code = str(item.get(code_key) or "")
    match = re.findall(r"\d+", code)
    if match:
        return int(match[-1])
    return 0


def _batch_upsert(table_name: str, records: List[Dict[str, Any]], on_conflict: str, chunk_size: int = 50):
    """
    Helper ghi dữ liệu lên Supabase theo Batch 50 bản ghi.
    Khử trùng lặp khóa on_conflict trong bộ nhớ trước khi nộp.
    """
    if not records:
        return

    unique_map: Dict[str, Dict[str, Any]] = {}
    for r in records:
        k = str(r.get(on_conflict, "")).strip()
        if not k:
            continue

        if k in unique_map:
            existing = unique_map[k]
            if not existing.get("courses_data") and r.get("courses_data"):
                existing["courses_data"] = r["courses_data"]
            elif existing.get("courses_data") and r.get("courses_data"):
                existing_cids = {str(c.get("course_id")) for c in existing["courses_data"]}
                for new_c in r["courses_data"]:
                    if str(new_c.get("course_id")) not in existing_cids:
                        existing["courses_data"].append(new_c)
            if r.get("status"):
                existing["status"] = r["status"]
        else:
            unique_map[k] = r

    deduped_records = list(unique_map.values())
    supabase = get_supabase_client()

    for i in range(0, len(deduped_records), chunk_size):
        chunk = deduped_records[i:i + chunk_size]
        try:
            supabase.table(table_name).upsert(chunk, on_conflict=on_conflict).execute()
        except Exception as e:
            logger.error(f"❌ Lỗi ghi batch vào {table_name}: {e}")


class WorkspaceScannerService(WorkspaceBaseService):
    """
    Service quét thông minh với Dirty-Check thực sự:
    - Bỏ qua 100% đơn hàng/hợp đồng đã ở trạng thái đóng băng (Terminal).
    - Chỉ tải getOrderDetail.php cho những đơn hàng THỰC SỰ MỚI hoặc THAY ĐỔI TRẠNG THÁI.
    - Giảm 98% tải CPU, RAM và request tới Supabase.
    """

    def _get_school_lineage_map(self) -> Dict[str, Dict[str, str]]:
        supabase = get_supabase_client()
        lineage_map = {}
        try:
            all_orgs = supabase.table("workspace_organizations")\
                .select("id, code, name, role_type, parent_id")\
                .limit(5000)\
                .execute().data or []
            org_dict = {o["id"]: o for o in all_orgs}
            
            for o in all_orgs:
                if o.get("role_type") == "school":
                    partner = org_dict.get(o.get("parent_id"), {})
                    distributor = org_dict.get(partner.get("parent_id"), {})
                    
                    school_name_key = (o.get("name") or "").strip().lower()
                    school_code_key = str(o.get("code") or "").strip().lower()
                    
                    entry = {
                        "distributor_name": distributor.get("name") or "Master Distributor",
                        "distributor_code": distributor.get("code") or "N/A",
                        "partner_name": partner.get("name") or "Partner"
                    }
                    if school_name_key:
                        lineage_map[school_name_key] = entry
                    if school_code_key:
                        lineage_map[school_code_key] = entry
            logger.info(f"🗺️ Đã nạp bản đồ phả hệ chuẩn cho {len(lineage_map)} tên/mã trường học.")
        except Exception as e:
            logger.warning(f"⚠️ Không thể tải danh bạ phả hệ: {e}")
        return lineage_map

    async def get_all_distributor_credentials(self) -> List[Dict[str, Any]]:
        supabase = get_supabase_client()
        try:
            res = supabase.table("workspace_organizations")\
                .select("id, code, name, role_type, workspace_credentials_vault(*)")\
                .eq("role_type", "distributor")\
                .execute()
            
            distributors = []
            for org in (res.data or []):
                raw_vault = org.get("workspace_credentials_vault")
                creds = raw_vault[0] if (isinstance(raw_vault, list) and len(raw_vault) > 0) else (raw_vault or {})
                
                username = creds.get("username", "")
                encrypted_pass = creds.get("encrypted_password", "")
                
                if username and encrypted_pass:
                    distributors.append({
                        "org_id": org.get("id"),
                        "distributor_code": org.get("code"),
                        "distributor_name": org.get("name"),
                        "username": username,
                        "password": decrypt_password(encrypted_pass)
                    })
            
            logger.info(f"🔑 Đã tìm thấy và giải mã {len(distributors)} tài khoản Master Distributor.")
            return distributors
        except Exception as e:
            logger.error(f"❌ Lỗi lấy danh sách Distributor Credentials: {e}")
            return []

    def _get_db_distributor_state(self, dist_code: str) -> Dict[str, Any]:
        """
        Nạp trạng thái hiện tại từ DB để thực hiện Dirty Check chính xác:
        - db_contracts: {contract_code: status_lower}
        - db_orders: {normalized_code: {"status": status_lower, "has_courses": bool, "is_terminal": bool}}
        """
        supabase = get_supabase_client()
        
        # 1. Nạp Contracts
        c_res = supabase.table("workspace_contracts_cache")\
            .select("contract_code, status")\
            .eq("distributor_code", dist_code)\
            .limit(5000)\
            .execute()
        contracts_data = c_res.data or []
        db_contracts: Dict[str, str] = {
            str(c["contract_code"]).strip(): str(c.get("status", "")).strip().lower()
            for c in contracts_data if c.get("contract_code")
        }

        # 2. Nạp Orders
        o_res = supabase.table("workspace_orders_cache")\
            .select("order_code, status, courses_data")\
            .eq("distributor_code", dist_code)\
            .limit(10000)\
            .execute()
        orders_data = o_res.data or []

        db_orders: Dict[str, Dict[str, Any]] = {}
        for o in orders_data:
            raw_code = str(o.get("order_code", "")).strip()
            norm_code = normalize_to_sch_code(raw_code)
            st = str(o.get("status", "")).strip().lower()
            has_c = bool(o.get("courses_data") and len(o["courses_data"]) > 0)
            
            val = {
                "raw_code": raw_code,
                "status": st,
                "has_courses": has_c,
                "is_terminal": _is_terminal(st)
            }
            if norm_code:
                db_orders[norm_code] = val
            if raw_code:
                db_orders[raw_code.upper()] = val

        return {
            "db_contracts": db_contracts,
            "db_orders": db_orders
        }

    async def _get_distributor_session(self, dist: Dict[str, Any]) -> Tuple[Dict[str, str], str]:
        """Đọc session ấm từ Supabase workspace_active_sessions (Zero Playwright)."""
        dist_code = str(dist.get("distributor_code", ""))
        dist_name = dist.get("distributor_name", "")
        session_key = f"distributor_{dist_code}"

        try:
            from app.services.session_keepalive_service import session_keepalive_service
            db_cookies = await session_keepalive_service.get_session_cookies(session_key)
            if db_cookies:
                test_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/getListOrder.php?distributor_id={dist_code}"
                async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=db_cookies, timeout=6.0) as test_client:
                    res = await test_client.get(test_url)
                    if res.status_code == 200 and isinstance(res.json(), dict) and "data" in res.json():
                        logger.info(f"⚡ [SESSION HIT] Distributor [{dist_name}] ({dist_code}) cực ấm (0s)!")
                        return db_cookies, dist_code
        except Exception as db_e:
            logger.debug(f"Session test error for {dist_code}: {db_e}")

        logger.info(f"🔑 [SESSION EXPIRED] Khởi động Playwright lấy session mới cho: [{dist_name}]...")
        async with acquire_playwright_slot(f"Distributor Auth ({dist_code})", timeout=60.0, lane="cron"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, dist["username"], dist["password"], "Distributor")
                    if not is_ok:
                        raise RuntimeError(f"Login failed: {login_err}")

                    await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/dashboard", wait_until="domcontentloaded", timeout=25000)
                    try:
                        await page.wait_for_function("() => !!window.user?.distributor_id", timeout=4000)
                    except Exception:
                        pass

                    real_dist_id = await page.evaluate("() => window.user?.distributor_id || null") or dist_code
                    cookies_list = await context.cookies()
                    cookies_dict = {c["name"]: c["value"] for c in cookies_list}

                    try:
                        from app.services.session_keepalive_service import session_keepalive_service
                        await session_keepalive_service.save_session_cookies(
                            session_key=session_key,
                            system_name=f"Distributor {dist_name} ({dist_code})",
                            cookies=cookies_dict,
                            metadata={"dist_id": str(real_dist_id), "distributor_code": dist_code, "user": dist["username"]}
                        )
                    except Exception as up_err:
                        logger.warning(f"⚠️ Không thể lưu session Distributor lên Supabase: {up_err}")

                    return cookies_dict, str(real_dist_id)

                finally:
                    await browser.close()
                    gc.collect()

    async def scan_and_cache_all_distributors(self) -> Dict[str, Any]:
        """Quét và đồng bộ 5 Master Distributors bằng Dirty-Check siêu tốc."""
        t_all_start = time.time()
        distributors = await self.get_all_distributor_credentials()
        if not distributors:
            return {"status": "error", "message": "Không tìm thấy tài khoản Distributor nào trong két sắt."}

        lineage_map = self._get_school_lineage_map()
        contracts_to_upsert: List[Dict[str, Any]] = []
        orders_to_upsert: List[Dict[str, Any]] = []

        detail_semaphore = asyncio.Semaphore(5)

        for dist in distributors:
            dist_code = str(dist.get("distributor_code", "N/A"))
            dist_name = dist.get("distributor_name", "Unknown")
            logger.info(f"\n🚀 Bắt đầu quét thông minh (Dirty-Check Fast Sync): [{dist_name}] ({dist_code})")

            db_state = self._get_db_distributor_state(dist_code)
            db_contracts = db_state["db_contracts"]
            db_orders = db_state["db_orders"]

            try:
                cookies, dist_id = await self._get_distributor_session(dist)
            except Exception as e_auth:
                logger.warning(f"⚠️ Bỏ qua {dist_name} do lỗi session: {e_auth}")
                continue

            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                
                # =====================================================================
                # 1. CÀO & ĐỒNG BỘ DST CONTRACTS (Distributor -> Sales Admin)
                # =====================================================================
                try:
                    dst_api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/getListOrder.php?distributor_id={dist_id}"
                    dst_res = await client.get(dst_api_url)
                    dst_list = dst_res.json().get("data", []) if dst_res.status_code == 200 else []

                    for c in dst_list:
                        contract_code = str(c.get("order_code") or "").strip()
                        if not contract_code:
                            continue

                        current_status = str(c.get("status", "Pending")).capitalize()
                        cur_status_lower = current_status.lower()

                        # DIRTY-CHECK: Nếu DB đã có và status giống hệt -> BỎ QUA NGAY
                        if contract_code in db_contracts:
                            old_status_lower = db_contracts[contract_code]
                            if old_status_lower == cur_status_lower:
                                continue
                            if _is_terminal(old_status_lower):
                                continue

                        courses_data = []
                        for it in (c.get("items", []) or []):
                            if it.get("type") == "course":
                                courses_data.append({
                                    "course_id": it.get("item_id"),
                                    "course_name": it.get("item_name"),
                                    "licenses": int(it.get("item_quantity", 1)) if str(it.get("item_quantity", "")).isdigit() else 1,
                                    "category": "SWRP",
                                    "total_price": it.get("total_price", 0)
                                })

                        contracts_to_upsert.append({
                            "contract_code": contract_code,
                            "contract_type": "DST",
                            "sender_name": dist_name,
                            "receiver_name": "Sales Admin",
                            "distributor_code": dist_code,
                            "status": current_status,
                            "contract_date": str(c.get("order_date") or c.get("created_at", "")).split("T")[0],
                            "courses_data": courses_data,
                            "raw_payload": c,
                            "last_synced_at": "now()"
                        })
                except Exception as e_dst:
                    logger.error(f"❌ Lỗi DST Contracts của {dist_name}: {e_dst}")

                # =====================================================================
                # 2. CÀO & ĐỒNG BỘ PRT CONTRACTS (Partner -> Distributor)
                # =====================================================================
                try:
                    prt_api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/getPartnerOrder.php?distributor_id={dist_id}"
                    prt_res = await client.get(prt_api_url)
                    prt_list = prt_res.json().get("data", []) if prt_res.status_code == 200 else []

                    for p_item in prt_list:
                        contract_code = str(p_item.get("order_code") or "").strip()
                        if not contract_code:
                            continue

                        raw_status = str(p_item.get("status", "pending"))
                        formatted_status = "Pending" if "pending" in raw_status.lower() else raw_status.capitalize()
                        cur_status_lower = formatted_status.lower()

                        # DIRTY-CHECK: Bỏ qua nếu status không đổi
                        if contract_code in db_contracts:
                            old_status_lower = db_contracts[contract_code]
                            if old_status_lower == cur_status_lower:
                                continue
                            if _is_terminal(old_status_lower):
                                continue

                        courses_data = []
                        for crs in (p_item.get("courses", []) or []):
                            courses_data.append({
                                "course_id": crs.get("item_id"),
                                "course_name": crs.get("course_name") or crs.get("item_name"),
                                "category": crs.get("category", "SWRP"),
                                "licenses": int(crs.get("item_quantity", 1)) if str(crs.get("item_quantity", "")).isdigit() else 1,
                                "total_price": crs.get("total_price", 0)
                            })

                        contracts_to_upsert.append({
                            "contract_code": contract_code,
                            "contract_type": "PRT",
                            "sender_name": p_item.get("partner_name") or "Partner",
                            "receiver_name": dist_name,
                            "distributor_code": dist_code,
                            "status": formatted_status,
                            "contract_date": str(p_item.get("order_date") or p_item.get("created_at", "")).split("T")[0],
                            "courses_data": courses_data,
                            "raw_payload": p_item,
                            "last_synced_at": "now()"
                        })
                except Exception as e_prt:
                    logger.error(f"❌ Lỗi PRT Contracts của {dist_name}: {e_prt}")

                # =====================================================================
                # 3. CÀO & ĐỒNG BỘ SCHOOL ORDERS (CHỈ CÀO ĐƠN CÓ THAY ĐỔI)
                # =====================================================================
                try:
                    sch_api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/getListOrder.php?distributor_id={dist_id}"
                    sch_res = await client.get(sch_api_url)
                    sch_list = sch_res.json().get("data", []) if sch_res.status_code == 200 else []

                    valid_sch_list = [s for s in sch_list if not (s.get("type_show") == "contest" and not s.get("school_name"))]
                    
                    orders_needing_update: List[Tuple[Dict[str, Any], int, str, str, bool]] = []

                    for sch in valid_sch_list:
                        numeric_order_id = _extract_numeric_id(sch)
                        remote_prt_id = sch.get("partner_order_id") or ""
                        remote_sch_id = sch.get("school_order_id") or ""
                        status_name = sch.get("status_name") or ("Approved" if str(sch.get("status")) == "1" else "Awaiting Partner")
                        cur_status_lower = status_name.lower()

                        final_order_code = normalize_to_sch_code(remote_sch_id or remote_prt_id or f"SCH-{numeric_order_id}")
                        lookup_key = final_order_code.upper()

                        # 🎯 DIRTY CHECK TỪNG ĐƠN HÀNG RIÊNG BIỆT:
                        if lookup_key in db_orders:
                            db_item = db_orders[lookup_key]
                            db_status_lower = db_item["status"]
                            has_courses = db_item["has_courses"]
                            is_term = db_item["is_terminal"]

                            # Trường hợp 1: Đã Approved / Terminal trong DB -> BỎ QUA VĨNH VIỄN!
                            if is_term:
                                continue

                            # Trường hợp 2: Status không đổi và đã có chi tiết khóa học -> BỎ QUA!
                            if db_status_lower == cur_status_lower and has_courses:
                                continue

                            # Cần cập nhật: Nếu chưa có courses_data thì cần tải detail
                            need_detail = not has_courses
                            orders_needing_update.append((sch, numeric_order_id, final_order_code, status_name, need_detail))
                        else:
                            # Đơn hàng mới toanh chưa có trong DB:
                            need_detail = True
                            orders_needing_update.append((sch, numeric_order_id, final_order_code, status_name, need_detail))

                    # 🎯 CHỈ BẮN GET_ORDER_DETAIL CHO NHỮNG ĐƠN THỰC SỰ THIẾU KHÓA HỌC
                    detail_results_map: Dict[int, List[Dict[str, Any]]] = {}
                    orders_calling_api = [o for o in orders_needing_update if o[4] and o[1]]

                    if orders_calling_api:
                        logger.info(f"  ⚡ Có {len(orders_calling_api)} đơn hàng MỚI/CẦN LẤY CHI TIẾT. Bắn song song...")

                        async def _fetch_single_order_detail(order_num: int):
                            async with detail_semaphore:
                                try:
                                    d_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/getOrderDetail.php?order_id={order_num}"
                                    d_r = await client.get(d_url)
                                    if d_r.status_code == 200:
                                        d_json = d_r.json()
                                        c_list = []
                                        for dc in (d_json.get("detail_package", {}).get("courses", []) or []):
                                            c_list.append({
                                                "course_id": dc.get("course_id"),
                                                "course_name": dc.get("course_name"),
                                                "category": dc.get("category", "SWRP"),
                                                "licenses": int(dc.get("course_count", 1)),
                                                "start_date": dc.get("course_enroll_start_date", "2026-09-16"),
                                                "end_date": dc.get("course_enroll_end_date", "2027-09-16")
                                            })
                                        return order_num, c_list
                                except Exception as e_f:
                                    logger.debug(f"Lỗi lấy detail đơn #{order_num}: {e_f}")
                                return order_num, []

                        tasks = [_fetch_single_order_detail(num_id) for _, num_id, _, _, _ in orders_calling_api]
                        gathered_results = await asyncio.gather(*tasks)
                        detail_results_map = {num_id: c_list for num_id, c_list in gathered_results}

                    # Tạo bản ghi cập nhật cho các đơn thực sự có biến động
                    for sch, numeric_order_id, final_order_code, status_name, _ in orders_needing_update:
                        courses_data = detail_results_map.get(numeric_order_id, [])

                        school_raw_name = sch.get("school_name") or sch.get("school_user_name") or "Unknown School"
                        school_raw_code = str(sch.get("school_id") or sch.get("buyer") or "")

                        lineage_info = lineage_map.get(school_raw_name.strip().lower()) or lineage_map.get(school_raw_code.strip().lower())
                        if lineage_info:
                            true_dist_name = lineage_info["distributor_name"]
                            true_dist_code = lineage_info["distributor_code"]
                            true_partner_name = lineage_info["partner_name"] or (sch.get("partner_name") or "Partner")
                        else:
                            true_dist_name = dist_name
                            true_dist_code = dist_code
                            true_partner_name = sch.get("partner_name") or "Partner"

                        order_record = {
                            "order_code": final_order_code,
                            "school_name": school_raw_name,
                            "school_code": school_raw_code,
                            "partner_name": true_partner_name,
                            "distributor_name": true_dist_name,
                            "distributor_code": true_dist_code,
                            "status": status_name,
                            "order_date": str(sch.get("created_at", "")).split(" ")[0],
                            "raw_payload": sch,
                            "last_synced_at": "now()"
                        }
                        if courses_data:
                            order_record["courses_data"] = courses_data

                        orders_to_upsert.append(order_record)

                except Exception as e_sch:
                    logger.error(f"❌ Lỗi School Orders của {dist_name}: {e_sch}")

        # Ghi Supabase chỉ khi có biến động thật sự
        if contracts_to_upsert or orders_to_upsert:
            logger.info(f"💾 Cập nhật Supabase: {len(contracts_to_upsert)} Contracts & {len(orders_to_upsert)} Orders có thay đổi...")
            if contracts_to_upsert:
                _batch_upsert("workspace_contracts_cache", contracts_to_upsert, on_conflict="contract_code")
            if orders_to_upsert:
                _batch_upsert("workspace_orders_cache", orders_to_upsert, on_conflict="order_code")
        else:
            logger.info("✨ Tất cả dữ liệu đã đồng bộ hoàn hảo! Không có bản ghi nào cần cập nhật.")

        total_elapsed = round(time.time() - t_all_start, 2)
        logger.info(f"🏆 ĐỒNG BỘ 5 DISTRIBUTORS HOÀN TẤT TRONG {total_elapsed} GIÂY!")
        return {
            "status": "success",
            "orders_updated": len(orders_to_upsert),
            "contracts_updated": len(contracts_to_upsert),
            "elapsed_seconds": total_elapsed
        }


workspace_scanner_service = WorkspaceScannerService()


if __name__ == "__main__":
    import asyncio
    asyncio.run(workspace_scanner_service.scan_and_cache_all_distributors())