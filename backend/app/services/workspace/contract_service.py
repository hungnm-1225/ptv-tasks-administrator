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
                await page.wait_for_selector("h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", timeout=15000)

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
                
                # Bắt buộc chờ ít nhất 1 dòng dữ liệu thực tế xuất hiện trên bảng
                await page.wait_for_selector(".MuiDataGrid-row", timeout=30000)
                await page.wait_for_timeout(1500)

                target_row = None

                # 1. Tìm dòng Hợp đồng theo mã
                if contract_identifier:
                    logger.info(f"🔍 Đang tìm dòng Hợp đồng: [{contract_identifier}]...")
                    target_row = page.locator(f".MuiDataGrid-row:has-text('{contract_identifier}')").first

                    # Nếu chưa thấy ngay ở trang hiện tại -> Dùng ô Search để lọc
                    if await target_row.count() == 0:
                        logger.info(f"🔍 Đang gõ [{contract_identifier}] vào ô Search để lọc...")
                        search_input = page.locator(".MuiTextField-root:has(label:has-text('Search')) input, input[type='text']").first
                        if await search_input.count() > 0:
                            await search_input.fill(contract_identifier)
                            await page.wait_for_timeout(2000)
                            target_row = page.locator(f".MuiDataGrid-row:has-text('{contract_identifier}')").first

                # 2. Nếu không truyền mã -> Lấy dòng Pending đầu tiên
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has-text('Pending')").first

                # 3. Chờ dòng mục tiêu sẵn sàng click
                try:
                    await target_row.wait_for(state="visible", timeout=10000)
                except Exception:
                    pass

                if not target_row or await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Contract ({contract_identifier}) ở trạng thái Pending trên bảng"}

                # 4. Click nút View Details (icon info) trên dòng tìm được
                logger.info(f"🔍 Đang bấm nút 'View Details' cho Contract [{contract_identifier or 'Pending'}]...")
                info_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, button:has(.lucide-info)").first
                await info_btn.wait_for(state="visible", timeout=8000)
                await info_btn.click()

                # 5. Chờ Modal Dialog 'Partner Order Details' mở ra
                await page.wait_for_selector("div[role='dialog']", timeout=15000)
                await page.wait_for_timeout(1000)

                # 6. Kiểm tra điều kiện kho License: Có nút 'Approve Order' hay không
                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order')").first
                can_approve = (await approve_btn.count() > 0) and (await approve_btn.is_visible())

                if can_approve:
                    logger.info(f"🎉 Kho Distributor ĐỦ License! Đang bấm 'Approve Order' cho Contract [{contract_identifier}]...")
                    await approve_btn.click()
                    await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                    await page.wait_for_timeout(2000)
                    
                    return {
                        "status": "success",
                        "contract_identifier": contract_identifier,
                        "message": f"Distributor đã phê duyệt thành công Partner Contract [{contract_identifier}]!"
                    }
                else:
                    logger.warning(f"⚠️ Kho Distributor KHÔNG ĐỦ License (Insufficient pool resources)!")
                    logger.info(f"➡️ Chuẩn bị chuyển sang trang tạo Contract: {BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create")
                    
                    # Đóng Modal Dialog hiện tại lại
                    close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                    if await close_btn.count() > 0:
                        await close_btn.click()
                        await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=10000)

                    return {
                        "status": "insufficient_pool",
                        "contract_identifier": contract_identifier,
                        "message": f"Kho Distributor không đủ License cho Contract [{contract_identifier}]. Hệ thống sẽ tự động chuyển sang trang /distributor-workspace/contract-po/create để xin Sales Admin cấp bù."
                    }

            except Exception as e:
                logger.error(f"❌ Lỗi Distributor Duyệt Partner Contract: {e}")
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
                await page.wait_for_selector("h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", timeout=15000)
                await page.wait_for_timeout(1000)

                # =============================================================
                # 1. CHỌN CONTRACT TYPE: LICENSE
                # =============================================================
                logger.info("📋 Bước 1: Chọn Contract Type = 'License'...")
                type_select = page.locator(".MuiGrid-item:has(label:has-text('Contract Type')) .MuiSelect-select, div:has(label:has-text('Contract Type')) div[role='combobox']").first
                await type_select.wait_for(state="visible", timeout=10000)
                await type_select.click()
                await page.wait_for_timeout(600)

                license_opt = page.locator("ul[role='listbox'] li:has-text('License'), .MuiMenu-list li:has-text('License')").first
                await license_opt.wait_for(state="visible", timeout=5000)
                await license_opt.click()
                await page.wait_for_timeout(1000)

                # =============================================================
                # 2. ĐIỀN CONTRACT NOTES
                # =============================================================
                notes = contract_data.get("notes") or contract_data.get("additional_notes") or "Auto-requested by PTV Automation Hub"
                notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[id*=':r']").first
                if await notes_input.count() > 0:
                    await notes_input.fill(str(notes))

                # =============================================================
                # 3. ĐIỀN DANH SÁCH MÔN HỌC (COURSES)
                # =============================================================
                courses = contract_data.get("courses", [])
                if not courses:
                    courses = [{
                        "category": contract_data.get("category", "SWRP"),
                        "course_name": contract_data.get("course_name"),
                        "licenses": contract_data.get("licenses", 100),
                        "unit_price": contract_data.get("unit_price", 0)
                    }]

                for idx, c in enumerate(courses):
                    if idx > 0:
                        logger.info(f"➕ Bấm 'Add Course' thêm môn #{idx + 1}...")
                        add_btn = page.locator("button:has-text('Add Course')").first
                        await add_btn.click()
                        await page.wait_for_timeout(1000)

                    # Định vị Card của môn học thứ idx
                    course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

                    # A. Chọn License Category
                    cat_val = c.get("category") or "SWRP"
                    logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{cat_val}'...")
                    cat_select = course_card.locator("div:has(label:has-text('License Category')) .MuiSelect-select, div:has(label:has-text('License Category')) div[role='combobox']").first
                    await cat_select.click()
                    await page.wait_for_timeout(500)

                    cat_opt = page.locator(f"ul[role='listbox'] li:has-text('{cat_val}'), .MuiMenu-list li:has-text('{cat_val}')").first
                    if await cat_opt.count() > 0:
                        await cat_opt.click()
                    else:
                        await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()

                    # 🟢 CHỜ API TẢI DANH SÁCH MÔN HỌC CHO CATEGORY NÀY
                    await page.wait_for_timeout(1500)

                    # B. Chọn Course
                    course_name_val = c.get("course_name")
                    logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
                    course_select = course_card.locator("div:has(label:has-text('Course')) .MuiSelect-select, div:has(label:has-text('Course')) div[role='combobox']").first
                    await course_select.wait_for(state="visible", timeout=10000)
                    await course_select.click()
                    await page.wait_for_timeout(600)

                    # Nếu có ô Search trong menu xổ xuống thì gõ tìm kiếm
                    search_box = page.locator(".MuiMenu-paper input[placeholder*='Search'], ul[role='listbox'] input").first
                    if await search_box.count() > 0 and course_name_val:
                        await search_box.fill(course_name_val)
                        await page.wait_for_timeout(500)

                    if course_name_val:
                        target_opt = page.locator(f"ul[role='listbox'] li:has-text('{course_name_val}'), .MuiMenu-list li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()

                    await page.wait_for_timeout(500)

                    # C. Điền số lượng Licenses
                    lic_qty = str(c.get("licenses", 100))
                    lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[id*=':r']").first
                    await lic_input.fill(lic_qty)

                    # D. Điền Unit Price (nếu có)
                    unit_price_val = str(c.get("unit_price", 0))
                    price_input = course_card.locator("div:has(label:has-text('Unit Price')) input[type='number']").first
                    if await price_input.count() > 0:
                        await price_input.fill(unit_price_val)

                # =============================================================
                # 4. ĐÍNH KÈM TÀI LIỆU (NẾU CÓ ATTACHMENT)
                # =============================================================
                doc_path = contract_data.get("document_path") or contract_data.get("upload_file_path")
                if doc_path and os.path.exists(doc_path):
                    logger.info(f"📎 Đang đính kèm tài liệu: {doc_path}...")
                    file_input = page.locator("input#upload-documents, input[type='file']").first
                    if await file_input.count() > 0:
                        await file_input.set_input_files(doc_path)
                        await page.wait_for_timeout(1000)

                # =============================================================
                # 5. NỘP HỢP ĐỒNG (CREATE CONTRACT/PO)
                # =============================================================
                logger.info("🚀 Đang bấm nút 'Create Contract/PO'...")
                submit_btn = page.locator("button:has-text('Create Contract/PO'), button:has-text('💾 Create Contract/PO')").last
                await submit_btn.click()

                # Chờ chuyển hướng về trang danh sách hợp đồng
                try:
                    await page.wait_for_url("**/contract-po**", timeout=25000)
                except Exception:
                    pass

                await page.wait_for_selector(".MuiDataGrid-row", timeout=30000)
                await page.wait_for_timeout(2000)

                # Lấy mã DST Contract vừa tạo ở dòng đầu tiên
                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id") if await first_row.count() > 0 else ""
                code_elem = first_row.locator("[data-field='order_code'], [data-field='contract_code'], .MuiDataGrid-cell").first
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