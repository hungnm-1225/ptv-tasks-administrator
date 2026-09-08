# backend/app/services/workspace/workspace_scanner_service.py
import re
import logging
import asyncio
import gc
from typing import Dict, Any, List, Set, Optional
from playwright.async_api import async_playwright

from app.core.supabase import get_supabase_client
from app.services.workspace_lineage_service import decrypt_password
from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot

logger = logging.getLogger(__name__)

# Danh sách các trạng thái kết thúc (Terminal States) - Đóng băng, không bao giờ thay đổi
TERMINAL_STATUSES = {"approved", "completed", "rejected", "cancelled", "rejected by admin", "rejected by distributor"}


def _is_terminal(status: Optional[str]) -> bool:
    """Kiểm tra xem trạng thái đã đóng băng chưa."""
    if not status:
        return False
    return status.strip().lower() in TERMINAL_STATUSES


def _extract_numeric_id(item: Dict[str, Any], code_key: str = "order_code") -> int:
    """Trích xuất ID số nguyên để so sánh chính xác."""
    raw_id = item.get("id") or item.get("order_id")
    if raw_id is not None and str(raw_id).isdigit():
        return int(raw_id)
    
    code = str(item.get(code_key) or "")
    match = re.findall(r"\d+", code)
    if match:
        return int(match[-1])
    return 0


def _get_latest_item_from_list(items: List[Dict[str, Any]], code_key: str = "order_code") -> Optional[Dict[str, Any]]:
    """Tìm bản ghi mới nhất thực sự trong mảng API."""
    if not items:
        return None
    return max(items, key=lambda x: _extract_numeric_id(x, code_key))


def _find_matching_db_order_code(
    remote_sch_code: str, 
    remote_prt_code: str, 
    numeric_id: int, 
    all_db_order_codes: Set[str]
) -> Optional[str]:
    """
    So sánh gần đúng (Fuzzy Match) đơn hàng giữa API và Database:
    Khắc phục việc Distributor hiển thị 'PRT-48-SCH-10459-...' còn School lưu 'SCH-10459-...'.
    """
    # 1. Khớp chính xác trước
    if remote_prt_code and remote_prt_code in all_db_order_codes:
        return remote_prt_code
    if remote_sch_code and remote_sch_code in all_db_order_codes:
        return remote_sch_code

    # 2. Khớp gần đúng (Chứa chuỗi core SCH-...)
    if remote_sch_code:
        for db_code in all_db_order_codes:
            if remote_sch_code in db_code or db_code in remote_sch_code:
                return db_code

    # 3. Khớp theo số ID đuôi (-1383)
    if numeric_id > 0:
        suffix = f"-{numeric_id}"
        for db_code in all_db_order_codes:
            if db_code.endswith(suffix):
                return db_code

    return None


def _batch_upsert(table_name: str, records: List[Dict[str, Any]], on_conflict: str, chunk_size: int = 50):
    """Helper ghi dữ liệu lên Supabase theo từng Batch 50 bản ghi."""
    if not records:
        return
    supabase = get_supabase_client()
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i + chunk_size]
        try:
            supabase.table(table_name).upsert(chunk, on_conflict=on_conflict).execute()
        except Exception as e:
            logger.error(f"❌ Lỗi ghi batch vào {table_name}: {e}")


class WorkspaceScannerService(WorkspaceBaseService):
    """
    Service quét tự động và đồng bộ siêu tốc dữ liệu của 5 Master Distributors:
    Áp dụng thuật toán Smart Delta Sync & Fuzzy Match:
    - Nhận diện đúng Distributor ID trên cả 3 API.
    - So sánh gần đúng Order Code giữa Distributor (PRT-...-SCH-...) và School (SCH-...).
    - Bỏ qua các bản ghi đã ở Terminal State (Approved/Completed/Rejected).
    - Chỉ update Status cho các đơn đang Pending/Awaiting nếu có thay đổi.
    """

    async def get_all_distributor_credentials(self) -> List[Dict[str, Any]]:
        """Lấy danh sách 5 tài khoản Distributor từ Supabase & giải mã Fernet."""
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

    def _get_db_distributor_state(self, dist_code: str):
        """Đọc nhanh toàn bộ mã code hiện có và danh sách Pending trong DB để đối chiếu 0.1ms."""
        supabase = get_supabase_client()
        
        # 1. Đọc Contracts
        c_res = supabase.table("workspace_contracts_cache")\
            .select("contract_code, contract_type, status")\
            .eq("distributor_code", dist_code)\
            .execute()
        contracts_data = c_res.data or []

        all_known_contract_codes: Set[str] = {c["contract_code"] for c in contracts_data if c.get("contract_code")}
        pending_contracts_map: Dict[str, str] = {
            c["contract_code"]: c.get("status", "") 
            for c in contracts_data 
            if not _is_terminal(c.get("status"))
        }

        # 2. Đọc Orders
        o_res = supabase.table("workspace_orders_cache")\
            .select("order_code, status, courses_data")\
            .eq("distributor_code", dist_code)\
            .execute()
        orders_data = o_res.data or []

        all_known_order_codes: Set[str] = {o["order_code"] for o in orders_data if o.get("order_code")}
        pending_orders_map: Dict[str, Dict[str, Any]] = {
            o["order_code"]: {
                "status": o.get("status", ""),
                "has_courses": bool(o.get("courses_data") and len(o["courses_data"]) > 0)
            }
            for o in orders_data
            if not _is_terminal(o.get("status"))
        }

        return {
            "all_known_contract_codes": all_known_contract_codes,
            "pending_contracts_map": pending_contracts_map,
            "all_known_order_codes": all_known_order_codes,
            "pending_orders_map": pending_orders_map,
        }

    async def scan_and_cache_all_distributors(self) -> Dict[str, Any]:
        """Khởi chạy phiên quét Chromium Làn nền (lane='cron') với Smart Delta Sync chuẩn xác."""
        distributors = await self.get_all_distributor_credentials()
        if not distributors:
            return {"status": "error", "message": "Không tìm thấy tài khoản Distributor nào trong két sắt."}

        contracts_to_upsert: List[Dict[str, Any]] = []
        orders_to_upsert: List[Dict[str, Any]] = []

        try:
            async with acquire_playwright_slot("Scan and Cache All Distributors", timeout=120.0, lane="cron"):
                async with async_playwright() as p:
                    browser, context, page = await self._create_context(p)
                    try:
                        for dist in distributors:
                            dist_code = str(dist.get("distributor_code", "N/A"))
                            dist_name = dist.get("distributor_name", "Unknown")
                            logger.info(f"🚀 Bắt đầu quét thông minh (Smart Delta Sync): [{dist_name}] ({dist_code})")

                            # Lấy snapshot hiện tại từ Supabase
                            db_state = self._get_db_distributor_state(dist_code)

                            is_ok, login_err = await self.login_role(page, dist["username"], dist["password"], "Distributor")
                            if not is_ok:
                                logger.warning(f"⚠️ Không thể đăng nhập Distributor {dist_name}: {login_err}")
                                continue

                            await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/dashboard", wait_until="domcontentloaded", timeout=30000)
                            try:
                                await page.wait_for_function("() => !!window.user?.distributor_id", timeout=5000)
                            except Exception:
                                pass

                            dist_id = await page.evaluate("() => window.user?.distributor_id || null") or dist_code

                            # =========================================================================
                            # 1. CÀO & ĐỒNG BỘ DST CONTRACTS (Distributor -> Sales Admin)
                            # =========================================================================
                            try:
                                dst_api_url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/order_sale/getListOrder.php?distributor_id={dist_id}"
                                dst_res = await page.evaluate(f"""async () => {{
                                    try {{
                                        const r = await fetch('{dst_api_url}');
                                        return await r.json();
                                    }} catch(e) {{
                                        return {{ code: 500, error: e.toString() }};
                                    }}
                                }}""")

                                dst_list = dst_res.get("data", []) if isinstance(dst_res, dict) else []
                                if dst_list:
                                    latest_dst_item = _get_latest_item_from_list(dst_list, code_key="order_code")
                                    latest_dst_code = latest_dst_item.get("order_code") if latest_dst_item else None
                                    
                                    is_latest_in_db = latest_dst_code in db_state["all_known_contract_codes"]
                                    logger.info(f"  👉 DST Contracts: Remote Newest='{latest_dst_code}' (ID:{latest_dst_item.get('id')}) | In DB: {is_latest_in_db} -> {'TRÙNG KHỚP (Chỉ check pending)' if is_latest_in_db else 'CÓ MỚI'}")

                                    for c in dst_list:
                                        contract_code = c.get("order_code")
                                        if not contract_code:
                                            continue

                                        current_status = str(c.get("status", "Pending")).capitalize()
                                        is_known = contract_code in db_state["all_known_contract_codes"]
                                        is_pending_in_db = contract_code in db_state["pending_contracts_map"]

                                        if is_latest_in_db and is_known and not is_pending_in_db:
                                            continue

                                        if is_pending_in_db:
                                            old_status = db_state["pending_contracts_map"][contract_code]
                                            if old_status and old_status.lower() == current_status.lower():
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

                            # =========================================================================
                            # 2. CÀO & ĐỒNG BỘ PRT CONTRACTS (Partner -> Distributor)
                            # =========================================================================
                            try:
                                prt_api_url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/orders_management/getPartnerOrder.php?distributor_id={dist_id}"
                                prt_res = await page.evaluate(f"""async () => {{
                                    try {{
                                        const r = await fetch('{prt_api_url}');
                                        return await r.json();
                                    }} catch(e) {{
                                        return {{ code: 500, error: e.toString() }};
                                    }}
                                }}""")

                                prt_list = prt_res.get("data", []) if isinstance(prt_res, dict) else []
                                if prt_list:
                                    latest_prt_item = _get_latest_item_from_list(prt_list, code_key="order_code")
                                    latest_prt_code = latest_prt_item.get("order_code") if latest_prt_item else None

                                    is_latest_prt_in_db = latest_prt_code in db_state["all_known_contract_codes"]
                                    logger.info(f"  👉 PRT Contracts: Remote Newest='{latest_prt_code}' (ID:{latest_prt_item.get('id')}) | In DB: {is_latest_prt_in_db} -> {'TRÙNG KHỚP (Chỉ check pending)' if is_latest_prt_in_db else 'CÓ MỚI'}")

                                    for p_item in prt_list:
                                        contract_code = p_item.get("order_code")
                                        if not contract_code:
                                            continue

                                        raw_status = str(p_item.get("status", "pending"))
                                        formatted_status = "Pending" if "pending" in raw_status.lower() else raw_status.capitalize()
                                        is_known = contract_code in db_state["all_known_contract_codes"]
                                        is_pending_in_db = contract_code in db_state["pending_contracts_map"]

                                        if is_latest_prt_in_db and is_known and not is_pending_in_db:
                                            continue

                                        if is_pending_in_db:
                                            old_status = db_state["pending_contracts_map"][contract_code]
                                            if old_status and old_status.lower() == formatted_status.lower():
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

                            # =========================================================================
                            # 3. CÀO & ĐỒNG BỘ SCHOOL ORDERS (School -> Partner) - ĐÃ FIX URL & FUZZY MATCH
                            # =========================================================================
                            try:
                                # 👉 CHÍNH XÁC: Phải truyền distributor_id={dist_id} để chỉ lấy đơn của Distributor này!
                                sch_api_url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/orders_management/getListOrder.php?distributor_id={dist_id}"
                                sch_res = await page.evaluate(f"""async () => {{
                                    try {{
                                        const r = await fetch('{sch_api_url}');
                                        return await r.json();
                                    }} catch(e) {{
                                        return {{ code: 500, error: e.toString() }};
                                    }}
                                }}""")

                                sch_list = sch_res.get("data", []) if isinstance(sch_res, dict) else []
                                if sch_list:
                                    valid_sch_list = [s for s in sch_list if not (s.get("type_show") == "contest" and not s.get("school_name"))]
                                    latest_sch_item = _get_latest_item_from_list(valid_sch_list, code_key="id")
                                    
                                    latest_num_id = _extract_numeric_id(latest_sch_item) if latest_sch_item else 0
                                    latest_remote_sch = latest_sch_item.get("school_order_id") or "" if latest_sch_item else ""
                                    latest_remote_prt = latest_sch_item.get("partner_order_id") or "" if latest_sch_item else ""

                                    # 👉 SO SÁNH GẦN ĐÚNG BẢN GHI MỚI NHẤT
                                    matched_db_latest = _find_matching_db_order_code(
                                        latest_remote_sch, 
                                        latest_remote_prt, 
                                        latest_num_id, 
                                        db_state["all_known_order_codes"]
                                    )
                                    is_latest_order_in_db = bool(matched_db_latest)
                                    
                                    logger.info(
                                        f"  👉 School Orders: Remote Newest='{latest_remote_prt or latest_remote_sch}' (ID:{latest_num_id}) "
                                        f"| Matched in DB: '{matched_db_latest}' -> {'TRÙNG KHỚP (Chỉ check pending)' if is_latest_order_in_db else 'CÓ MỚI'}"
                                    )

                                    for sch in valid_sch_list:
                                        numeric_order_id = _extract_numeric_id(sch)
                                        remote_prt_id = sch.get("partner_order_id") or ""
                                        remote_sch_id = sch.get("school_order_id") or ""
                                        status_name = sch.get("status_name") or ("Approved" if str(sch.get("status")) == "1" else "Awaiting Partner")

                                        # Tìm mã tương ứng đang lưu trong Supabase DB
                                        matched_db_code = _find_matching_db_order_code(
                                            remote_sch_id, 
                                            remote_prt_id, 
                                            numeric_order_id, 
                                            db_state["all_known_order_codes"]
                                        )

                                        is_known = bool(matched_db_code)
                                        # Khóa chính để upsert: nếu DB đã có mã nào thì giữ nguyên mã đó!
                                        final_order_code = matched_db_code or remote_prt_id or remote_sch_id or f"SCH-{numeric_order_id}"

                                        is_pending_in_db = (final_order_code in db_state["pending_orders_map"])

                                        # Nếu bản ghi mới nhất đã có trong DB và order này đã có trong DB không pending -> BỎ QUA NGAY
                                        if is_latest_order_in_db and is_known and not is_pending_in_db:
                                            continue

                                        # Kiểm tra xem có cần fetch detail không
                                        need_detail_fetch = False
                                        if is_pending_in_db:
                                            pending_info = db_state["pending_orders_map"][final_order_code]
                                            old_status = pending_info["status"]
                                            has_courses = pending_info["has_courses"]

                                            # Status không đổi và đã có chi tiết môn học -> Bỏ qua!
                                            if old_status and old_status.lower() == status_name.lower() and has_courses:
                                                continue
                                            
                                            # Đang pending mà thiếu courses_data -> Fetch bù
                                            if not has_courses and ("awaiting" in status_name.lower() or "pending" in status_name.lower()):
                                                need_detail_fetch = True
                                        
                                        # Nếu là Order mới tinh chưa từng có trong DB
                                        if not is_known and ("awaiting" in status_name.lower() or "pending" in status_name.lower()):
                                            need_detail_fetch = True

                                        # Chỉ gọi API chi tiết khi thực sự cần thiết
                                        courses_data = []
                                        if need_detail_fetch and numeric_order_id:
                                            try:
                                                detail_url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/orders_management/getOrderDetail.php?order_id={numeric_order_id}"
                                                detail_res = await page.evaluate(f"""async () => {{
                                                    try {{
                                                        const r = await fetch('{detail_url}');
                                                        return await r.json();
                                                    }} catch(e) {{
                                                        return null;
                                                    }}
                                                }}""")

                                                if detail_res and "detail_package" in detail_res:
                                                    for dc in (detail_res.get("detail_package", {}).get("courses", []) or []):
                                                        courses_data.append({
                                                            "course_id": dc.get("course_id"),
                                                            "course_name": dc.get("course_name"),
                                                            "category": dc.get("category", "SWRP"),
                                                            "licenses": int(dc.get("course_count", 1)),
                                                            "start_date": dc.get("course_enroll_start_date", "2026-09-01"),
                                                            "end_date": dc.get("course_enroll_end_date", "2027-05-31")
                                                        })
                                            except Exception as e_dt:
                                                logger.debug(f"Không thể lấy detail order {numeric_order_id}: {e_dt}")

                                        order_record = {
                                            "order_code": final_order_code,
                                            "school_name": sch.get("school_name") or sch.get("school_user_name") or "Unknown School",
                                            "school_code": str(sch.get("school_id") or sch.get("buyer") or ""),
                                            "partner_name": sch.get("partner_name") or "Partner",
                                            "distributor_name": dist_name,
                                            "distributor_code": dist_code,
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

                            await context.clear_cookies()

                    except Exception as e:
                        logger.error(f"❌ Lỗi trong phiên quét Playwright: {e}")
                    finally:
                        await browser.close()
                        gc.collect()

        except Exception as e_slot:
            logger.warning(f"⚠️ Quá trình xin slot Playwright kết thúc: {e_slot}")

        # Ghi Supabase chỉ khi có bản ghi thay đổi
        if contracts_to_upsert or orders_to_upsert:
            logger.info(f"💾 Cập nhật Supabase: {len(contracts_to_upsert)} Contracts & {len(orders_to_upsert)} Orders có thay đổi...")
            _batch_upsert("workspace_contracts_cache", contracts_to_upsert, on_conflict="contract_code")
            _batch_upsert("workspace_orders_cache", orders_to_upsert, on_conflict="order_code")
        else:
            logger.info("✨ Tất cả dữ liệu đã đồng bộ hoàn hảo! Không có bản ghi nào cần cập nhật.")

        logger.info(f"🏆 ĐỒNG BỘ 5 DISTRIBUTORS HOÀN TẤT!")
        return {
            "status": "success",
            "orders_updated": len(orders_to_upsert),
            "contracts_updated": len(contracts_to_upsert)
        }


workspace_scanner_service = WorkspaceScannerService()