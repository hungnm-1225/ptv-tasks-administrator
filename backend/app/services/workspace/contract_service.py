# backend/app/services/workspace/contract_service.py
import logging
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL

logger = logging.getLogger(__name__)


class WorkspaceContractService(WorkspaceBaseService):
    """Xử lý các nghiệp vụ tạo và phê duyệt Contract giữa Partner - Distributor - Sales Admin."""

    async def partner_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📝 Partner mở: /partner-workspace/contract-po/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("h4:has-text('Create Contract/PO')", timeout=15000)

                type_select = page.locator(".MuiGrid-item:has(label:has-text('Contract Type')) .MuiSelect-select, .MuiGrid-item:has(label:has-text('Contract Type')) div[role='combobox']").first
                await type_select.wait_for(state="visible", timeout=10000)
                await type_select.click()
                await page.wait_for_timeout(500)

                license_type_opt = page.locator("ul[role='listbox'] li[data-value='License'], ul[role='listbox'] li:has-text('License')").first
                await license_type_opt.wait_for(state="visible", timeout=5000)
                await license_type_opt.click()
                await page.wait_for_timeout(1000)

                notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub")
                notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea").first
                if await notes_input.count() > 0:
                    await notes_input.fill(notes)

                courses = contract_data.get("courses", [])
                if not courses:
                    courses = [{"category": "SWRP", "course_name": None, "licenses": 50}]

                for idx, c in enumerate(courses):
                    if idx > 0:
                        add_btn = page.locator("button:has-text('Add Course')").first
                        await add_btn.click()
                        await page.wait_for_timeout(1000)

                    course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

                    cat_val = c.get("category", "SWRP")
                    cat_select = course_card.locator("div:has(label:has-text('License Category')) .MuiSelect-select, div:has(label:has-text('License Category')) div[role='combobox']").first
                    await cat_select.click()
                    await page.wait_for_timeout(500)

                    cat_opt = page.locator(f"ul[role='listbox'] li[data-value='{cat_val}'], ul[role='listbox'] li:has-text('{cat_val}')").first
                    if await cat_opt.count() > 0:
                        await cat_opt.click()
                    else:
                        await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()

                    await page.wait_for_timeout(1000)

                    course_name_val = c.get("course_name")
                    course_select = course_card.locator("div:has(label:has-text('Course')) .MuiSelect-select, div:has(label:has-text('Course')) div[role='combobox']").first
                    await course_select.click()
                    await page.wait_for_timeout(500)

                    if course_name_val:
                        target_opt = page.locator(f"ul[role='listbox'] li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("ul[role='listbox'] li").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li").first.click()

                    await page.wait_for_timeout(500)

                    lic_qty = str(c.get("licenses", 50))
                    lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                    await lic_input.fill(lic_qty)

                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()

                await page.wait_for_selector(".MuiDataGrid-row", timeout=30000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id")
                code_elem = first_row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

                logger.info(f"🎉 TẠO CONTRACT PRT THÀNH CÔNG: [{contract_full_code}]")
                return {
                    "status": "success",
                    "contract_id": contract_num_id,
                    "contract_code": contract_full_code,
                    "message": f"Partner đã tạo Contract {contract_full_code} thành công"
                }

            except Exception as e:
                logger.error(f"❌ Lỗi Partner Create Contract: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    async def distributor_approve_partner_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🏢 Distributor mở: /distributor-workspace/partner-contract-po...")
                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(1000)

                target_row = None
                if contract_identifier:
                    target_row = page.locator(
                        f".MuiDataGrid-row[data-id='{contract_identifier}'], "
                        f".MuiDataGrid-row:has([data-field='order_code']:has-text('{contract_identifier}'))"
                    ).first
                
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Contract ({contract_identifier}) chờ duyệt"}

                info_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, [data-field=' '] button, button:has(.lucide-menu)").first
                await info_btn.click()
                await page.wait_for_timeout(500)

                view_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')")
                if await view_item.count() > 0 and await view_item.is_visible():
                    await view_item.click()

                await page.wait_for_selector("div[role='dialog']", timeout=15000)

                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order'), div[role='dialog'] button:has-text('Approve')")

                if await approve_btn.count() > 0 and await approve_btn.is_visible():
                    logger.info("✨ Kho đủ License! Bấm nút Approve Order...")
                    await approve_btn.click()
                    await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                    await page.wait_for_timeout(2000)
                    
                    return {
                        "status": "success",
                        "contract_identifier": contract_identifier,
                        "message": "Distributor đã duyệt Partner Contract thành công"
                    }
                else:
                    close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                    if await close_btn.count() > 0:
                        await close_btn.click()

                    return {
                        "status": "insufficient_pool",
                        "contract_identifier": contract_identifier,
                        "message": "Kho Distributor không đủ License, cần tạo Contract xin Sales Admin cấp thêm."
                    }

            except Exception as e:
                logger.error(f"❌ Lỗi Distributor Approve Partner Contract: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    async def distributor_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📝 Distributor mở: /distributor-workspace/contract-po/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("h4:has-text('Create Contract/PO'), text=Create Contract/PO", timeout=15000)

                type_select = page.locator(".MuiGrid-item:has(label:has-text('Contract Type')) .MuiSelect-select, .MuiGrid-item:has(label:has-text('Contract Type')) div[role='combobox']").first
                await type_select.click()
                await page.wait_for_timeout(500)

                license_opt = page.locator("ul[role='listbox'] li[data-value='License'], ul[role='listbox'] li:has-text('License')").first
                await license_opt.click()
                await page.wait_for_timeout(1000)

                notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub")
                notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea").first
                if await notes_input.count() > 0:
                    await notes_input.fill(notes)

                courses = contract_data.get("courses", [])
                if not courses:
                    courses = [{"category": "SWRP", "course_name": None, "licenses": 100}]

                for idx, c in enumerate(courses):
                    if idx > 0:
                        await page.click("button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

                    cat_val = c.get("category", "SWRP")
                    cat_dropdown = course_card.locator("div:has(label:has-text('License Category')) .MuiSelect-select, div:has(label:has-text('License Category')) div[role='combobox']").first
                    await cat_dropdown.click()
                    await page.wait_for_timeout(500)

                    cat_opt = page.locator(f"ul[role='listbox'] li[data-value='{cat_val}'], ul[role='listbox'] li:has-text('{cat_val}')").first
                    if await cat_opt.count() > 0:
                        await cat_opt.click()
                    else:
                        await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()

                    await page.wait_for_timeout(1000)

                    course_name_val = c.get("course_name")
                    course_dropdown = course_card.locator("div:has(label:has-text('Course')) .MuiSelect-select, div:has(label:has-text('Course')) div[role='combobox']").first
                    await course_dropdown.click()
                    await page.wait_for_timeout(500)

                    if course_name_val:
                        target_opt = page.locator(f"ul[role='listbox'] li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("ul[role='listbox'] li").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li").first.click()

                    await page.wait_for_timeout(500)

                    lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                    await lic_input.fill(str(c.get("licenses", 100)))

                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()

                await page.wait_for_selector(".MuiDataGrid-row", timeout=30000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id")
                code_elem = first_row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

                logger.info(f"🎉 TẠO DST CONTRACT THÀNH CÔNG: [{contract_full_code}]")
                return {
                    "status": "success",
                    "contract_id": contract_num_id,
                    "contract_code": contract_full_code,
                    "message": f"Distributor đã tạo Contract {contract_full_code} gửi Sales Admin thành công"
                }

            except Exception as e:
                logger.error(f"❌ Lỗi Distributor Create Contract: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("👑 Mở: /sales-admin-workspace/dashboard...")
                await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(1000)

                target_row = None
                if contract_identifier:
                    target_row = page.locator(
                        f".MuiDataGrid-row[data-id='{contract_identifier}'], "
                        f".MuiDataGrid-row:has([data-field='order_code']:has-text('{contract_identifier}'))"
                    ).first
                
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Contract ({contract_identifier}) Pending trên Dashboard"}

                eye_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, [data-field=' '] button").first
                await eye_btn.click()

                await page.wait_for_selector("button:has-text('Approve')", timeout=15000)

                approve_btn = page.locator("button:has-text('Approve')").first
                await approve_btn.click()

                await page.wait_for_selector("div[role='dialog']:has-text('Confirm Order Approval'), div[role='dialog']", timeout=10000)

                default_note = "Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub"
                valid_justification = justification if (justification and len(justification.strip()) >= 15) else default_note
                
                textarea = page.locator("div[role='dialog'] textarea").first
                await textarea.fill(valid_justification)
                await page.wait_for_timeout(800)

                confirm_btn = page.locator("div[role='dialog'] button:has-text('Confirm Approval'), div[role='dialog'] button:has-text('Confirm')").first
                await confirm_btn.click()
                await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                await page.wait_for_timeout(2000)

                logger.info(f"🎉 Sales Admin đã duyệt DST Contract {contract_identifier or ''} thành công!")
                return {
                    "status": "success",
                    "contract_identifier": contract_identifier,
                    "justification": valid_justification,
                    "message": "Sales Admin đã phê duyệt DST Contract thành công"
                }

            except Exception as e:
                logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    async def fetch_partner_contracts(self, credentials: Dict[str, str], filter_pending: bool = False) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "contracts": []}

                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root", timeout=25000)
                await page.wait_for_timeout(1000)

                row_selector = ".MuiDataGrid-row:has([data-field='status']:has-text('Pending Distributor Review'))" if filter_pending else ".MuiDataGrid-row"
                rows = page.locator(row_selector)
                count = await rows.count()
                contracts = []

                for i in range(count):
                    row = rows.nth(i)
                    code_elem = row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                    type_elem = row.locator("[data-field='order_type'] .MuiChip-label, [data-field='order_type']").first
                    date_elem = row.locator("[data-field='order_date']").first
                    status_elem = row.locator("[data-field='status'] .MuiChip-label, [data-field='status']").first
                    amount_elem = row.locator("[data-field='total_amount'] .MuiBox-root, [data-field='total_amount']").first
                    data_id = await row.get_attribute("data-id")

                    contract_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (data_id or "")
                    contract_type = (await type_elem.inner_text()).strip() if await type_elem.count() > 0 else "License"
                    order_date = (await date_elem.inner_text()).strip() if await date_elem.count() > 0 else ""
                    status_text = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else ""
                    total_amount = (await amount_elem.inner_text()).strip() if await amount_elem.count() > 0 else "$0.00"

                    if contract_code:
                        contracts.append({
                            "data_id": data_id,
                            "contract_code": contract_code,
                            "contract_type": contract_type,
                            "order_date": order_date,
                            "status": status_text,
                            "total_amount": total_amount
                        })

                return {"status": "success", "contracts": contracts, "total": len(contracts)}

            except Exception as e:
                logger.error(f"❌ Lỗi quét Partner Contracts: {e}")
                return {"status": "failed", "error": str(e), "contracts": []}
            finally:
                await browser.close()

    async def fetch_distributor_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "contracts": []}

                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root", timeout=25000)
                await page.wait_for_timeout(1000)

                rows = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))")
                count = await rows.count()
                pending_list = []

                for i in range(count):
                    row = rows.nth(i)
                    code_elem = row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                    status_elem = row.locator("[data-field='status']").first
                    date_elem = row.locator("[data-field='order_date'], [data-field='created_at']").first
                    data_id = await row.get_attribute("data-id")
                    
                    code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (data_id or "")
                    status = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else "Pending"
                    date = (await date_elem.inner_text()).strip() if await date_elem.count() > 0 else ""

                    if code:
                        pending_list.append({
                            "data_id": data_id,
                            "contract_code": code,
                            "status": status,
                            "date": date
                        })

                return {"status": "success", "contracts": pending_list, "total": len(pending_list)}

            except Exception as e:
                logger.error(f"❌ Lỗi quét Distributor Pending Contracts: {e}")
                return {"status": "failed", "error": str(e), "contracts": []}
            finally:
                await browser.close()

    async def fetch_sales_admin_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "contracts": []}

                await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root", timeout=25000)
                await page.wait_for_timeout(1000)

                rows = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))")
                count = await rows.count()
                pending_list = []

                for i in range(count):
                    row = rows.nth(i)
                    code_elem = row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                    status_elem = row.locator("[data-field='status']").first
                    data_id = await row.get_attribute("data-id")
                    
                    code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (data_id or "")
                    status = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else "Pending"

                    if code:
                        pending_list.append({
                            "data_id": data_id,
                            "contract_code": code,
                            "status": status
                        })

                return {"status": "success", "contracts": pending_list, "total": len(pending_list)}

            except Exception as e:
                logger.error(f"❌ Lỗi quét Sales Admin Pending Contracts: {e}")
                return {"status": "failed", "error": str(e), "contracts": []}
            finally:
                await browser.close()