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
    Service quét định kỳ toàn bộ Orders & Contracts của 5 Master Distributors 
    và lưu Cache trực tiếp vào Supabase.
    """

    async def get_all_distributor_credentials(self) -> List[Dict[str, Any]]:
        """Lấy danh sách 5 tài khoản Distributor từ bảng workspace_organizations & vault."""
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
            
            logger.info(f"🔑 Đã tìm thấy và giải mã {len(distributors)} tài khoản Distributor.")
            return distributors
        except Exception as e:
            logger.error(f"❌ Lỗi lấy danh sách Distributor Credentials: {e}")
            return []

    async def scan_and_cache_all_distributors(self) -> Dict[str, Any]:
        """Quét tuần tự 5 Distributor trong 1 phiên Playwright duy nhất để tiết kiệm RAM."""
        distributors = await self.get_all_distributor_credentials()
        if not distributors:
            return {"status": "error", "message": "Không có tài khoản Distributor nào để quét."}

        supabase = get_supabase_client()
        total_orders_synced = 0
        total_contracts_synced = 0

        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                for dist in distributors:
                    dist_code = dist.get("distributor_code", "N/A")
                    dist_name = dist.get("distributor_name", "Unknown")
                    logger.info(f"🚀 Bắt đầu quét dữ liệu cho Distributor: [{dist_name}] ({dist_code})...")

                    # 1. Đăng nhập Distributor
                    is_ok, login_err = await self.login_role(page, dist["username"], dist["password"], "Distributor")
                    if not is_ok:
                        logger.warning(f"⚠️ Không thể đăng nhập Distributor {dist_name}: {login_err}")
                        continue

                    # =========================================================
                    # 2. CÀO DST CONTRACTS (Gửi lên Sales Admin)
                    # =========================================================
                    try:
                        logger.info(f"📄 [{dist_name}] Đang cào DST Contracts: /distributor-workspace/contract-po...")
                        await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po", wait_until="networkidle", timeout=35000)
                        await page.wait_for_selector(".MuiDataGrid-root", timeout=15000)
                        await page.wait_for_timeout(1000)

                        rows = page.locator(".MuiDataGrid-row")
                        count = await rows.count()

                        for i in range(count):
                            row = rows.nth(i)
                            code_elem = row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                            status_elem = row.locator("[data-field='status'] .MuiChip-label, [data-field='status']").first
                            date_elem = row.locator("[data-field='order_date'], [data-field='created_at']").first

                            contract_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else ""
                            status_text = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else "Pending"
                            contract_date = (await date_elem.inner_text()).strip() if await date_elem.count() > 0 else ""

                            if contract_code:
                                supabase.table("workspace_contracts_cache").upsert({
                                    "contract_code": contract_code,
                                    "contract_type": "DST",
                                    "sender_name": dist_name,
                                    "receiver_name": "Sales Admin",
                                    "distributor_code": dist_code,
                                    "status": status_text,
                                    "contract_date": contract_date,
                                    "last_synced_at": "now()"
                                }, on_conflict="contract_code").execute()
                                total_contracts_synced += 1

                    except Exception as e_dst:
                        logger.warning(f"⚠️ Lỗi cào DST Contracts của {dist_name}: {e_dst}")

                    # =========================================================
                    # 3. CÀO PRT CONTRACTS (Partner gửi tới Distributor)
                    # =========================================================
                    try:
                        logger.info(f"📝 [{dist_name}] Đang cào PRT Contracts: /distributor-workspace/partner-contract-po...")
                        await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="networkidle", timeout=35000)
                        await page.wait_for_selector(".MuiDataGrid-root", timeout=15000)
                        await page.wait_for_timeout(1000)

                        rows = page.locator(".MuiDataGrid-row")
                        count = await rows.count()

                        for i in range(count):
                            row = rows.nth(i)
                            code_elem = row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                            partner_elem = row.locator("[data-field='partner_name'], [data-field='sender_name']").first
                            status_elem = row.locator("[data-field='status'] .MuiChip-label, [data-field='status']").first
                            date_elem = row.locator("[data-field='order_date'], [data-field='created_at']").first

                            contract_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else ""
                            sender_name = (await partner_elem.inner_text()).strip() if await partner_elem.count() > 0 else "Partner"
                            status_text = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else "Pending"
                            contract_date = (await date_elem.inner_text()).strip() if await date_elem.count() > 0 else ""

                            if contract_code:
                                supabase.table("workspace_contracts_cache").upsert({
                                    "contract_code": contract_code,
                                    "contract_type": "PRT",
                                    "sender_name": sender_name,
                                    "receiver_name": dist_name,
                                    "distributor_code": dist_code,
                                    "status": status_text,
                                    "contract_date": contract_date,
                                    "last_synced_at": "now()"
                                }, on_conflict="contract_code").execute()
                                total_contracts_synced += 1

                    except Exception as e_prt:
                        logger.warning(f"⚠️ Lỗi cào PRT Contracts của {dist_name}: {e_prt}")

                    # =========================================================
                    # 4. CÀO SCHOOL ORDERS (Đơn hàng trường học thuộc tuyến)
                    # =========================================================
                    try:
                        logger.info(f"🏫 [{dist_name}] Đang cào School Orders: /distributor-workspace/school-order...")
                        await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/school-order", wait_until="networkidle", timeout=35000)
                        
                        if await page.locator(".MuiDataGrid-root").count() > 0:
                            await page.wait_for_selector(".MuiDataGrid-root", timeout=10000)
                            rows = page.locator(".MuiDataGrid-row")
                            count = await rows.count()

                            for i in range(count):
                                row = rows.nth(i)
                                order_elem = row.locator("[data-field='school_order_id'] span, [data-field='school_order_id']").first
                                school_elem = row.locator("[data-field='school_name']").first
                                partner_elem = row.locator("[data-field='partner_name']").first
                                status_elem = row.locator("[data-field='status_name'], [data-field='status']").first
                                date_elem = row.locator("[data-field='created_at']").first

                                order_code = (await order_elem.inner_text()).strip() if await order_elem.count() > 0 else ""
                                school_name = (await school_elem.inner_text()).strip() if await school_elem.count() > 0 else "Unknown School"
                                partner_name = (await partner_elem.inner_text()).strip() if await partner_elem.count() > 0 else ""
                                status_text = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else "Awaiting Partner"
                                order_date = (await date_elem.inner_text()).strip() if await date_elem.count() > 0 else ""

                                if order_code:
                                    supabase.table("workspace_orders_cache").upsert({
                                        "order_code": order_code,
                                        "school_name": school_name,
                                        "partner_name": partner_name,
                                        "distributor_name": dist_name,
                                        "distributor_code": dist_code,
                                        "status": status_text,
                                        "order_date": order_date,
                                        "last_synced_at": "now()"
                                    }, on_conflict="order_code").execute()
                                    total_orders_synced += 1

                    except Exception as e_ord:
                        logger.warning(f"⚠️ Không cào được School Orders tại route này của {dist_name}: {e_ord}")

                    # Đăng xuất dọn dẹp session trước khi sang Distributor kế tiếp
                    await self._logout(page)
                    await page.wait_for_timeout(1000)

                logger.info(f"🎉 HOÀN TẤT ĐỒNG BỘ 5 DISTRIBUTORS! (Đã sync: {total_orders_synced} Orders, {total_contracts_synced} Contracts)")
                return {
                    "status": "success",
                    "orders_synced": total_orders_synced,
                    "contracts_synced": total_contracts_synced
                }

            except Exception as e:
                logger.error(f"❌ Lỗi quét tổng Distributor Scanner: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()
                gc.collect()


workspace_scanner_service = WorkspaceScannerService()