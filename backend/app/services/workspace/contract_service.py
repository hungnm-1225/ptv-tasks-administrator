# backend/app/services/workspace/contract_service.py
import re
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
                await page.wait_for_selector("h4:has-text('Create Contract/PO'), text=Create Contract/PO", timeout=15000)

                # Chọn Contract Type
                type_select = page.locator(".MuiGrid-item:has(label:has-text('Contract Type')) .MuiSelect-select, .MuiGrid-item:has(label:has-text('Contract Type')) div[role='combobox']").first
                await type_select.wait_for(state="visible", timeout=10000)
                await type_select.click()
                await page.wait_for_timeout(500)

                license_type_opt = page.locator("ul[role='listbox'] li[data-value='License'], ul[role='listbox'] li:has-text('License')").first
                await license_type_opt.wait_for(state="visible", timeout=5000)
                await license_type_opt.click()
                await page.wait_for_timeout(1000)

                notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub")
                notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[name='notes']").first
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
                            await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()

                    await page.wait_for_timeout(500)

                    lic_qty = str(c.get("licenses", 50))
                    lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                    await lic_input.fill(lic_qty)

                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()

                # Bọc thép chờ redirect về danh sách
                try:
                    await page.wait_for_url("**/contract-po**", timeout=20000)
                except Exception:
                    pass

                await page.wait_for_selector(".MuiDataGrid-root, .MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id") if await first_row.count() > 0 else ""
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
                await page.wait_for_selector(".MuiDataGrid-root, .MuiDataGrid-row", timeout=25000)
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

                view_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')").first
                if await view_item.count() > 0 and await view_item.is_visible():
                    await view_item.click()

                await page.wait_for_selector("div[role='dialog']", timeout=15000)

                # Chọn Pool Category License nếu có dropdown pool
                pool_selects = page.locator("div[role='dialog'] .MuiSelect-select, div[role='dialog'] div[role='combobox']")
                pool_cnt = await pool_selects.count()
                for p_idx in range(pool_cnt):
                    p_curr = pool_selects.nth(p_idx)
                    try:
                        await p_curr.click()
                        await page.wait_for_timeout(400)
                        opts = page.locator("ul[role='listbox'] li:not([data-value=''])")
                        if await opts.count() > 0:
                            await opts.first.click()
                        await page.wait_for_timeout(500)
                    except Exception:
                        pass

                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order'), div[role='dialog'] button:has-text('Approve')")

                if await approve_btn.count() > 0 and await approve_btn.is_visible():
                    logger.info("✨ Kho đủ License! Bấm nút Approve Contract...")
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
                notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[name='notes']").first
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
                            await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()

                    await page.wait_for_timeout(500)

                    lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                    await lic_input.fill(str(c.get("licenses", 100)))

                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()

                try:
                    await page.wait_for_url("**/contract-po**", timeout=20000)
                except Exception:
                    pass

                await page.wait_for_selector(".MuiDataGrid-root, .MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id") if await first_row.count() > 0 else ""
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
                await page.wait_for_selector(".MuiDataGrid-root, .MuiDataGrid-row", timeout=25000)
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