# backend/app/services/workspace/workspace_scanner_service.py
import logging
import asyncio
import gc
from typing import Dict, Any, List
from playwright.async_api import async_playwright

from app.core.supabase import get_supabase_client
from app.services.workspace_lineage_service import decrypt_password
from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL

logger = logging.getLogger(__name__)


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
        """Khởi chạy 1 phiên Chromium duy nhất, quét tuần tự 5 Distributor qua Direct API."""
        distributors = await self.get_all_distributor_credentials()
        if not distributors:
            return {"status": "error", "message": "Không tìm thấy tài khoản Distributor nào trong két sắt."}

        supabase = get_supabase_client()
        total_orders_synced = 0
        total_contracts_synced = 0

        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                for dist in distributors:
                    dist_code = dist.get("distributor_code", "N/A")
                    dist_name = dist.get("distributor_name", "Unknown")
                    logger.info(f"\n=======================================================")
                    logger.info(f"🚀 BẮT ĐẦU ĐỒNG BỘ CHO DISTRIBUTOR: [{dist_name}] ({dist_code})")
                    logger.info(f"=======================================================")

                    # 1. Đăng nhập Distributor qua Keycloak SSO
                    is_ok, login_err = await self.login_role(page, dist["username"], dist["password"], "Distributor")
                    if not is_ok:
                        logger.warning(f"⚠️ Không thể đăng nhập Distributor {dist_name}: {login_err}")
                        continue

                    # Mở trang dashboard để nạp session & lấy distributor_id
                    await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/dashboard", wait_until="domcontentloaded", timeout=45000)
                    await page.wait_for_timeout(1500)

                    # Lấy distributor_id từ biến toàn cục window.user
                    dist_id = await page.evaluate("() => window.user?.distributor_id || null")
                    if not dist_id:
                        logger.warning(f"⚠️ Không tìm thấy window.user.distributor_id của {dist_name}, thử dùng fallback...")
                        dist_id = dist_code

                    logger.info(f"🎯 Đã xác thực Session Distributor ID: [{dist_id}]")

                    # =========================================================================
                    # 1. CÀO DST CONTRACTS (Gửi lên Sales Admin)
                    # =========================================================================
                    try:
                        dst_api_url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/order_sale/getListOrder.php?distributor_id={dist_id}"
                        logger.info(f"📡 [1/3] Gọi API DST Contracts: {dst_api_url}")
                        
                        dst_res = await page.evaluate(f"""async () => {{
                            try {{
                                const r = await fetch('{dst_api_url}');
                                return await r.json();
                            }} catch(e) {{
                                return {{ code: 500, error: e.toString() }};
                            }}
                        }}""")

                        dst_list = dst_res.get("data", []) if isinstance(dst_res, dict) else []
                        logger.info(f"✅ Thu thập được {len(dst_list)} DST Contracts.")

                        for c in dst_list:
                            contract_code = c.get("order_code")
                            if not contract_code:
                                continue

                            # Bóc tách môn học trong mảng items
                            raw_items = c.get("items", []) or []
                            courses_data = []
                            for it in raw_items:
                                if it.get("type") == "course":
                                    courses_data.append({
                                        "course_id": it.get("item_id"),
                                        "course_name": it.get("item_name"),
                                        "licenses": int(it.get("item_quantity", 1)) if str(it.get("item_quantity", "")).isdigit() else 1,
                                        "category": "SWRP",
                                        "total_price": it.get("total_price", 0)
                                    })

                            supabase.table("workspace_contracts_cache").upsert({
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
                            }, on_conflict="contract_code").execute()
                            total_contracts_synced += 1

                    except Exception as e_dst:
                        logger.error(f"❌ Lỗi xử lý DST Contracts của {dist_name}: {e_dst}")

                    # =========================================================================
                    # 2. CÀO PRT CONTRACTS (Partner gửi lên Distributor)
                    # =========================================================================
                    try:
                        prt_api_url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/orders_management/getPartnerOrder.php?distributor_id={dist_id}"
                        logger.info(f"📡 [2/3] Gọi API PRT Contracts: {prt_api_url}")
                        
                        prt_res = await page.evaluate(f"""async () => {{
                            try {{
                                const r = await fetch('{prt_api_url}');
                                return await r.json();
                            }} catch(e) {{
                                return {{ code: 500, error: e.toString() }};
                            }}
                        }}""")

                        prt_list = prt_res.get("data", []) if isinstance(prt_res, dict) else []
                        logger.info(f"✅ Thu thập được {len(prt_list)} PRT Contracts.")

                        for p_item in prt_list:
                            contract_code = p_item.get("order_code")
                            if not contract_code:
                                continue

                            # Bóc tách môn học trong mảng courses
                            raw_courses = p_item.get("courses", []) or []
                            courses_data = []
                            for crs in raw_courses:
                                courses_data.append({
                                    "course_id": crs.get("item_id"),
                                    "course_name": crs.get("course_name") or crs.get("item_name"),
                                    "category": crs.get("category", "SWRP"),
                                    "licenses": int(crs.get("item_quantity", 1)) if str(crs.get("item_quantity", "")).isdigit() else 1,
                                    "total_price": crs.get("total_price", 0)
                                })

                            raw_status = str(p_item.get("status", "pending"))
                            formatted_status = "Pending" if "pending" in raw_status.lower() else raw_status.capitalize()

                            supabase.table("workspace_contracts_cache").upsert({
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
                            }, on_conflict="contract_code").execute()
                            total_contracts_synced += 1

                    except Exception as e_prt:
                        logger.error(f"❌ Lỗi xử lý PRT Contracts của {dist_name}: {e_prt}")

                    # =========================================================================
                    # 3. CÀO SCHOOL ORDERS (School gửi lên Partner) & TỰ ĐỌC CHI TIẾT
                    # =========================================================================
                    try:
                        sch_api_url = "https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/orders_management/getListOrder.php"
                        logger.info(f"📡 [3/3] Gọi API School Orders: {sch_api_url}")
                        
                        sch_res = await page.evaluate(f"""async () => {{
                            try {{
                                const r = await fetch('{sch_api_url}');
                                return await r.json();
                            }} catch(e) {{
                                return {{ code: 500, error: e.toString() }};
                            }}
                        }}""")

                        sch_list = sch_res.get("data", []) if isinstance(sch_res, dict) else []
                        logger.info(f"✅ Thu thập được {len(sch_list)} School Orders (Toàn bộ 100% không cần phân trang).")

                        for sch in sch_list:
                            # Bỏ qua các mục contest cá nhân không phải của trường
                            if sch.get("type_show") == "contest" and not sch.get("school_name"):
                                continue

                            numeric_order_id = sch.get("id") or sch.get("order_id")
                            order_code = sch.get("school_order_id") or sch.get("partner_order_id") or f"SCH-{numeric_order_id}"
                            status_name = sch.get("status_name") or "Awaiting Partner"
                            
                            courses_data = []

                            # 👉 NẾU ĐƠN HÀNG ĐANG CHỜ DUYỆT -> TỰ ĐỘNG GỌI getOrderDetail.php LẤY CHI TIẾT
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
                                        detail_courses = detail_res.get("detail_package", {}).get("courses", []) or []
                                        for dc in detail_courses:
                                            courses_data.append({
                                                "course_id": dc.get("course_id"),
                                                "course_name": dc.get("course_name"),
                                                "category": dc.get("category", "SWRP"),
                                                "licenses": int(dc.get("course_count", 1)),
                                                "start_date": dc.get("course_enroll_start_date", "2026-09-01"),
                                                "end_date": dc.get("course_enroll_end_date", "2027-05-31")
                                            })
                                except Exception as e_detail:
                                    logger.warning(f"⚠️ Không đọc được detail Order {numeric_order_id}: {e_detail}")

                            supabase.table("workspace_orders_cache").upsert({
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
                            }, on_conflict="order_code").execute()
                            total_orders_synced += 1

                    except Exception as e_sch:
                        logger.error(f"❌ Lỗi xử lý School Orders của {dist_name}: {e_sch}")

                    # Đăng xuất an toàn trước khi quét Distributor tiếp theo
                    await self._logout(page)
                    await page.wait_for_timeout(1000)

                logger.info(f"\n🎉 ========================================================")
                logger.info(f"🏆 ĐỒNG BỘ 5 DISTRIBUTORS HOÀN TẤT XUẤT SẮC!")
                logger.info(f"📊 Tổng kết: Đã lưu {total_contracts_synced} Hợp đồng & {total_orders_synced} Đơn hàng vào Supabase Cache.")
                logger.info(f"========================================================\n")

                return {
                    "status": "success",
                    "orders_synced": total_orders_synced,
                    "contracts_synced": total_contracts_synced
                }

            except Exception as e:
                logger.error(f"❌ Lỗi toàn cục trong quá trình Scanner: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()
                gc.collect()


workspace_scanner_service = WorkspaceScannerService()