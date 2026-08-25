# backend/app/services/workspace/order_service.py
import re
import logging
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL, normalize_date_iso

logger = logging.getLogger(__name__)


class WorkspaceOrderService(WorkspaceBaseService):
    """Xử lý các nghiệp vụ liên quan đến School Order & Phê duyệt của Partner."""

    async def _fill_partner_create_contract_form(
        self,
        page: Page,
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Hàm nội bộ: Partner điền form tạo PRT Contract gửi Distributor trong cùng 1 phiên."""
        logger.info("📝 Partner mở: /partner-workspace/contract-po/create...")
        await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
        await page.wait_for_selector("h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", timeout=15000)
        await page.wait_for_timeout(1000)

        # 1. Chọn Contract Type = 'License'
        logger.info("📋 Bước 1: Partner chọn Contract Type = 'License'...")
        type_item = page.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Contract Type")).first
        type_select = type_item.locator("[role='combobox'], .MuiSelect-select").first
        await type_select.wait_for(state="visible", timeout=10000)
        await type_select.click()
        await page.wait_for_timeout(400)

        license_opt = page.locator("li[role='option']:has-text('License')").first
        await license_opt.wait_for(state="visible", timeout=8000)
        await license_opt.click()
        await page.wait_for_timeout(1000)

        # 2. Điền Contract Notes
        notes = contract_data.get("notes") or contract_data.get("additional_notes") or "Auto-requested by PTV Automation Hub to topup School Order"
        notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[id*=':r']").first
        if await notes_input.count() > 0:
            await notes_input.fill(str(notes))

        # 3. Điền danh sách môn học
        courses = contract_data.get("courses", [])
        if not courses:
            courses = [{"category": "SWRP", "course_name": None, "licenses": 50}]

        for idx, c in enumerate(courses):
            if idx > 0:
                logger.info(f"➕ Bấm 'Add Course' thêm môn #{idx + 1}...")
                add_btn = page.locator("button:has-text('Add Course')").first
                await add_btn.click()
                await page.wait_for_timeout(1000)

            course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

            # A. Chọn License Category
            cat_val = c.get("category") or "SWRP"
            logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{cat_val}'...")
            cat_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License Category")).first
            cat_select = cat_item.locator("[role='combobox'], .MuiSelect-select").first
            await cat_select.click()
            await page.wait_for_timeout(400)

            cat_opt = page.locator(f"li[role='option']:has-text('{cat_val}')").first
            if await cat_opt.count() > 0:
                await cat_opt.click()
            else:
                await page.locator("li[role='option']").first.click()

            await page.wait_for_timeout(1500)

            # B. Chọn Course
            course_name_val = c.get("course_name")
            logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
            course_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text=re.compile(r"^Course"))).first
            course_select = course_item.locator("[role='combobox'], .MuiSelect-select").first
            await course_select.wait_for(state="visible", timeout=10000)
            await course_select.click()
            await page.wait_for_timeout(600)

            target_opt = None
            if course_name_val:
                target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first

            if target_opt and await target_opt.count() > 0:
                await target_opt.click()
            else:
                valid_opts = page.locator("li[role='option']:not(:has-text('Select Course'))")
                if await valid_opts.count() > 0:
                    await valid_opts.first.click()
                else:
                    await page.locator("li[role='option']").first.click()

            await page.wait_for_timeout(500)

            # C. Điền số lượng Licenses
            lic_qty = str(c.get("licenses", 50))
            lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
            lic_input = lic_item.locator("input[type='number']").first
            await lic_input.click()
            await page.keyboard.press("Control+A")
            await page.keyboard.type(lic_qty)
            await page.wait_for_timeout(300)

        # 4. Bấm Create Contract/PO
        logger.info("🚀 Partner bấm 'Create Contract/PO'...")
        submit_btn = page.locator("button:has-text('Create Contract/PO')").last
        await submit_btn.click()

        try:
            await page.wait_for_url("**/partner-workspace/contract-po", timeout=20000)
        except Exception:
            await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po", wait_until="domcontentloaded", timeout=20000)

        await page.wait_for_timeout(2500)

        first_row = page.locator(".MuiDataGrid-row").first
        contract_num_id = await first_row.get_attribute("data-id") if await first_row.count() > 0 else ""
        code_elem = first_row.locator("[data-field='order_code'] a, [data-field='contract_code'] a, [data-field='order_code'], a").first
        contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

        if not contract_full_code and contract_num_id:
            contract_full_code = f"PRT-{contract_num_id}"

        logger.info(f"🎉 PARTNER TẠO PRT CONTRACT THÀNH CÔNG: [{contract_full_code}]")
        return {
            "status": "success",
            "contract_id": contract_num_id,
            "contract_code": contract_full_code,
            "message": f"Partner đã tạo PRT Contract {contract_full_code} gửi Distributor thành công"
        }

    async def school_create_order(
        self, 
        credentials: Dict[str, str], 
        order_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Trường học đăng nhập tạo mới School Order."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🏫 Mở trang danh sách Order: /school-workspace/orders...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="networkidle", timeout=45000)
                await page.wait_for_timeout(1500)

                create_order_btn = page.locator("button:has-text('Create Order')").first
                await create_order_btn.wait_for(state="visible", timeout=15000)
                await create_order_btn.click()

                await page.wait_for_selector("div[role='dialog']", timeout=15000)
                await page.wait_for_timeout(1000)

                # 1. Điền Contact Information
                contact_info = order_data.get("contact_info", "Admin Automation Hub (operation@pythaverse.space)")
                contact_input = page.locator("div[role='dialog'] input[placeholder*='contact'], div[role='dialog'] input[type='text']").first
                if await contact_input.count() > 0:
                    await contact_input.fill(contact_info)

                courses = order_data.get("courses", [])
                if not courses:
                    courses = [{
                        "category": order_data.get("category", "SWRP"),
                        "course_name": order_data.get("course_name"),
                        "licenses": order_data.get("licenses", 50),
                        "start_date": order_data.get("start_date", "2026-09-01"),
                        "end_date": order_data.get("end_date", "2027-05-31")
                    }]

                for idx, c in enumerate(courses):
                    if idx > 0:
                        logger.info(f"➕ Bấm 'Add Course' thêm môn #{idx + 1}...")
                        await page.click("div[role='dialog'] button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    # Bắt đúng container của khóa học thứ idx
                    course_card = page.locator("div[role='dialog'] .MuiGrid-container").nth(idx)

                    # A. Chọn License Category (Cột 1)
                    category_val = c.get("category", "SWRP")
                    logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{category_val}'...")
                    cat_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License Category")).first
                    cat_select = cat_item.locator("[role='combobox'], .MuiSelect-select").first
                    await cat_select.click()
                    await page.wait_for_timeout(400)

                    cat_option = page.locator(f"li[role='option']:has-text('{category_val}')").first
                    if await cat_option.count() > 0:
                        await cat_option.click()
                    else:
                        await page.locator("li[role='option']").first.click()

                    # Chờ nạp Course
                    await page.wait_for_timeout(1500)

                    # B. Chọn Course (Cột 2)
                    course_name_val = c.get("course_name")
                    logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
                    course_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text=re.compile(r"^Course"))).first
                    course_select = course_item.locator("[role='combobox'], .MuiSelect-select").first
                    await course_select.click()
                    await page.wait_for_timeout(600)
                    
                    if course_name_val:
                        target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click()
                    else:
                        await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click()
                    
                    await page.wait_for_timeout(500)

                    # C. Điền License(s) (Cột 3 - Khóa chính xác vào nhãn 'License(s)')
                    licenses_count = str(c.get("licenses", 50))
                    logger.info(f"🔢 Môn #{idx + 1}: Điền License(s) = {licenses_count}...")
                    lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
                    lic_input = lic_item.locator("input[type='number']").first
                    await lic_input.click()
                    await page.keyboard.press("Control+A")
                    await page.keyboard.type(licenses_count)
                    await page.wait_for_timeout(300)

                    # D. Điền Start Date & End Date (Chuẩn ISO YYYY-MM-DD cho input type='date')
                    start_date_val = normalize_date_iso(c.get("start_date")) or "2026-09-01"
                    end_date_val = normalize_date_iso(c.get("end_date")) or "2027-05-31"
                    
                    start_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Start Date")).first
                    if await start_item.count() > 0:
                        start_input = start_item.locator("input").first
                        await start_input.fill(start_date_val)

                    end_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="End Date")).first
                    if await end_item.count() > 0:
                        end_input = end_item.locator("input").first
                        await end_input.fill(end_date_val)

                # 4. Điền Additional Notes (nếu có)
                if order_data.get("additional_notes"):
                    notes_textarea = page.locator("div[role='dialog'] textarea").first
                    if await notes_textarea.count() > 0:
                        await notes_textarea.fill(order_data["additional_notes"])

                # 5. Bấm Create Order trong Dialog
                logger.info("🚀 Đang bấm 'Create Order' trong Dialog...")
                submit_dialog_btn = page.locator("div[role='dialog'] button:has-text('Create Order')").last
                await submit_dialog_btn.click()

                await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=20000)
                await page.wait_for_timeout(2500)

                # Lấy mã Order vừa sinh ở dòng đầu tiên
                first_row = page.locator(".MuiDataGrid-row").first
                order_num_id = await first_row.get_attribute("data-id") if await first_row.count() > 0 else ""
                order_code_elem = first_row.locator("[data-field='school_order_id'] a, [data-field='school_order_id'], .MuiDataGrid-cell").first
                order_full_code = (await order_code_elem.inner_text()).strip() if await order_code_elem.count() > 0 else (order_num_id or "")

                if not order_full_code and order_num_id:
                    order_full_code = f"SCH-{order_num_id}"

                logger.info(f"🎉 TẠO ORDER THÀNH CÔNG: [{order_full_code}]")
                return {
                    "status": "success",
                    "order_id": order_num_id,
                    "order_code": order_full_code,
                    "school_name": credentials.get("username"),
                    "message": f"School Order {order_full_code} đã được khởi tạo thành công"
                }

            except Exception as e:
                logger.error(f"❌ Lỗi School Create Order: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    async def partner_approve_school_order(
        self, 
        credentials: Dict[str, str], 
        order_identifier: Optional[str] = None,
        auto_create_prt_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Partner duyệt School Order. TÍCH HỢP 1-SESSION: Nếu thiếu License, tạo ngay PRT Contract trong cùng 1 phiên!"""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🤝 Partner mở /partner-workspace/order-management...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="networkidle", timeout=45000)
                await page.wait_for_timeout(2000)

                target_row = None
                if order_identifier:
                    logger.info(f"🔍 Partner tìm dòng Order: [{order_identifier}]...")
                    target_row = page.locator(f".MuiDataGrid-row:has-text('{order_identifier}')").first

                    if await target_row.count() == 0:
                        search_input = page.locator("input[placeholder*='Search'], .MuiTextField-root input, input[type='text']").first
                        if await search_input.count() > 0:
                            await search_input.fill(order_identifier)
                            await page.wait_for_timeout(2000)
                            target_row = page.locator(f".MuiDataGrid-row:has-text('{order_identifier}')").first

                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has-text('Awaiting Partner')").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Order ({order_identifier}) ở trạng thái 'Awaiting Partner'"}

                # Mở chi tiết đơn hàng
                logger.info(f"🔍 Bấm xem chi tiết Order [{order_identifier or 'Awaiting'}]...")
                action_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, [data-field=' '] button, button:has(.lucide-menu), button:has(.lucide-info)").first
                await action_btn.click(timeout=15000)
                
                view_menu_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')").first
                if await view_menu_item.count() > 0 and await view_menu_item.is_visible():
                    await view_menu_item.click()

                await page.wait_for_selector("div[role='dialog']", timeout=15000)
                await page.wait_for_timeout(1000)

                # Chọn Pool License nếu có dropdowns
                pool_dropdowns = page.locator("div[role='dialog'] .MuiSelect-select, div[role='dialog'] div[role='combobox']")
                pool_count = await pool_dropdowns.count()
                for i in range(pool_count):
                    try:
                        current_dd = pool_dropdowns.nth(i)
                        await current_dd.click()
                        await page.wait_for_timeout(400)
                        opts = page.locator("li[role='option']")
                        best_opt = opts.locator(":has-text('Category License'), :has-text('Available')").first
                        if await best_opt.count() > 0:
                            await best_opt.click()
                        elif await opts.count() > 0:
                            await opts.first.click()
                        await page.wait_for_timeout(500)
                    except Exception:
                        pass

                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order'), div[role='dialog'] button:has-text('Approve')").first
                can_approve = (await approve_btn.count() > 0) and (await approve_btn.is_visible())

                if can_approve:
                    logger.info("🎉 Kho Partner ĐỦ License! Đang bấm 'Approve Order'...")
                    await approve_btn.click()
                    await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                    await page.wait_for_timeout(2000)
                    
                    return {
                        "status": "success",
                        "order_identifier": order_identifier,
                        "message": f"Partner đã duyệt thành công School Order: {order_identifier}"
                    }
                else:
                    logger.warning("⚠️ Kho Partner KHÔNG ĐỦ License để duyệt Order!")

                    # 🟢 TỐI ƯU 1-SESSION: CHUYỂN THẲNG SANG TẠO PRT CONTRACT GỬI DISTRIBUTOR
                    if auto_create_prt_if_short:
                        logger.info(f"⚡ [1-SESSION PARTNER] Chuyển trang tạo PRT Contract ngay trên phiên hiện tại...")
                        close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                        if await close_btn.count() > 0:
                            await close_btn.click()
                            await page.wait_for_timeout(500)

                        prt_contract_res = await self._fill_partner_create_contract_form(
                            page=page,
                            contract_data={
                                "notes": f"Auto-topup to approve School Order {order_identifier}",
                                "courses": courses_needed or [{"category": "SWRP", "course_name": None, "licenses": 50}]
                            }
                        )

                        if prt_contract_res.get("status") == "success":
                            prt_code = prt_contract_res.get("contract_code")
                            logger.info(f"✅ [1-SESSION] Partner đã tạo xong PRT Contract [{prt_code}] gửi Distributor!")
                            return {
                                "status": "insufficient_pool_created_prt",
                                "order_identifier": order_identifier,
                                "prt_contract_code": prt_code,
                                "message": f"Kho Partner thiếu License, đã trực tiếp tạo PRT Contract [{prt_code}] gửi Distributor."
                            }
                        else:
                            return prt_contract_res

                    close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                    if await close_btn.count() > 0:
                        await close_btn.click()

                    return {
                        "status": "insufficient_pool",
                        "order_identifier": order_identifier,
                        "message": "Kho Partner không đủ License, cần tạo Contract xin Distributor cấp bù."
                    }

            except Exception as e:
                logger.error(f"❌ Lỗi Partner Approve Order: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()