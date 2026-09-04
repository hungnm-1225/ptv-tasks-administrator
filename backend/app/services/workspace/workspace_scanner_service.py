# backend/app/services/workspace/workspace_scanner_service.py
import logging
import asyncio
import gc
from typing import Dict, Any, List
from playwright.async_api import async_playwright

from app.core.supabase import get_supabase_client
from app.services.workspace_lineage_service import decrypt_password
from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot

logger = logging.getLogger(__name__)


def _batch_upsert(table_name: str, records: List[Dict[str, Any]], on_conflict: str, chunk_size: int = 50):
    """Helper ghi dữ liệu lên Supabase theo từng Batch 50 bản ghi để tối ưu tốc độ x10 lần."""
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
    1. DST Contracts (Distributor -> Sales Admin)
    2. PRT Contracts (Partner -> Distributor)
    3. School Orders (School -> Partner) + Bóc tách chi tiết khóa học cho đơn Pending.
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

    async def scan_and_cache_all_distributors(self) -> Dict[str, Any]:
        """
        Khởi chạy 1 phiên Chromium trong Làn nền (lane='cron'), cào siêu tốc 5 Distributor
        rồi NHẢ SLOT NGAY LẬP TỨC trước khi lưu vào Supabase.
        """
        distributors = await self.get_all_distributor_credentials()
        if not distributors:
            return {"status": "error", "message": "Không tìm thấy tài khoản Distributor nào trong két sắt."}

        contracts_to_save: List[Dict[str, Any]] = []
        orders_to_save: List[Dict[str, Any]] = []

        # 👉 CHẠY TRONG LÀN NỀN (lane="cron") - KHÔNG ĐƯỢC TRANH LÀN VIP CỦA ADMIN
        async with acquire_playwright_slot("Scan and Cache All Distributors", timeout=120.0, lane="cron"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    for dist in distributors:
                        dist_code = dist.get("distributor_code", "N/A")
                        dist_name = dist.get("distributor_name", "Unknown")
                        logger.info(f"🚀 Bắt đầu quét dữ liệu: [{dist_name}] ({dist_code})")

                        # 1. Đăng nhập Distributor
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

                        # 1. CÀO DST CONTRACTS
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
                            for c in dst_list:
                                contract_code = c.get("order_code")
                                if not contract_code:
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

                                contracts_to_save.append({
                                    "contract_code": contract_code,
                                    "contract_type": "DST",
                                    "sender_name": dist_name,
                                    "receiver_name": "Sales Admin",
                                    "distributor_code": str(dist_code),
                                    "status": str(c.get("status", "Pending")).capitalize(),
                                    "contract_date": str(c.get("order_date") or c.get("created_at", "")).split("T")[0],
                                    "courses_data": courses_data,
                                    "raw_payload": c,
                                    "last_synced_at": "now()"
                                })
                        except Exception as e_dst:
                            logger.error(f"❌ Lỗi DST Contracts của {dist_name}: {e_dst}")

                        # 2. CÀO PRT CONTRACTS
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
                            for p_item in prt_list:
                                contract_code = p_item.get("order_code")
                                if not contract_code:
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

                                raw_status = str(p_item.get("status", "pending"))
                                formatted_status = "Pending" if "pending" in raw_status.lower() else raw_status.capitalize()

                                contracts_to_save.append({
                                    "contract_code": contract_code,
                                    "contract_type": "PRT",
                                    "sender_name": p_item.get("partner_name") or "Partner",
                                    "receiver_name": dist_name,
                                    "distributor_code": str(dist_code),
                                    "status": formatted_status,
                                    "contract_date": str(p_item.get("order_date") or p_item.get("created_at", "")).split("T")[0],
                                    "courses_data": courses_data,
                                    "raw_payload": p_item,
                                    "last_synced_at": "now()"
                                })
                        except Exception as e_prt:
                            logger.error(f"❌ Lỗi PRT Contracts của {dist_name}: {e_prt}")

                        # 3. CÀO SCHOOL ORDERS
                        try:
                            sch_api_url = "https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/orders_management/getListOrder.php"
                            sch_res = await page.evaluate(f"""async () => {{
                                try {{
                                    const r = await fetch('{sch_api_url}');
                                    return await r.json();
                                }} catch(e) {{
                                    return {{ code: 500, error: e.toString() }};
                                }}
                            }}""")

                            sch_list = sch_res.get("data", []) if isinstance(sch_res, dict) else []
                            for sch in sch_list:
                                if sch.get("type_show") == "contest" and not sch.get("school_name"):
                                    continue

                                numeric_order_id = sch.get("id") or sch.get("order_id")
                                order_code = sch.get("school_order_id") or sch.get("partner_order_id") or f"SCH-{numeric_order_id}"
                                status_name = sch.get("status_name") or "Awaiting Partner"
                                
                                courses_data = []
                                if ("awaiting" in status_name.lower() or "pending" in status_name.lower()) and numeric_order_id:
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
                                    except Exception:
                                        pass

                                orders_to_save.append({
                                    "order_code": order_code,
                                    "school_name": sch.get("school_name") or sch.get("school_user_name") or "Unknown School",
                                    "school_code": str(sch.get("school_id") or sch.get("buyer") or ""),
                                    "partner_name": sch.get("partner_name") or "Partner",
                                    "distributor_name": dist_name,
                                    "distributor_code": str(dist_code),
                                    "status": status_name,
                                    "order_date": str(sch.get("created_at", "")).split(" ")[0],
                                    "courses_data": courses_data,
                                    "raw_payload": sch,
                                    "last_synced_at": "now()"
                                })
                        except Exception as e_sch:
                            logger.error(f"❌ Lỗi School Orders của {dist_name}: {e_sch}")

                        await context.clear_cookies()

                except Exception as e:
                    logger.error(f"❌ Lỗi trong phiên quét Playwright: {e}")
                finally:
                    # ĐÓNG TRÌNH DUYỆT NGAY TẠI ĐÂY ĐỂ GIẢI PHÓNG SLOT VÀ RAM!
                    await browser.close()
                    gc.collect()

        # =========================================================================
        # 🚀 GHI SUPABASE NGOÀI KHỐI PLAYWRIGHT (BẬT CHẾ ĐỘ BATCH UPSERT SIÊU TỐC)
        # =========================================================================
        logger.info(f"💾 Bắt đầu lưu {len(contracts_to_save)} Contracts & {len(orders_to_save)} Orders vào Supabase theo batch...")
        _batch_upsert("workspace_contracts_cache", contracts_to_save, on_conflict="contract_code")
        _batch_upsert("workspace_orders_cache", orders_to_save, on_conflict="order_code")

        logger.info(f"🏆 ĐỒNG BỘ 5 DISTRIBUTORS HOÀN TẤT! Đã lưu an toàn ngoài Playwright slot.")
        return {
            "status": "success",
            "orders_synced": len(orders_to_save),
            "contracts_synced": len(contracts_to_save)
        }


workspace_scanner_service = WorkspaceScannerService()