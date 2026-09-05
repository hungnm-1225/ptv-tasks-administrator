# backend/app/services/workspace/order_service.py
import re
import json
import logging
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page, Response

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL, normalize_date_iso
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners, smart_wait_for_options_loaded

logger = logging.getLogger(__name__)


class WorkspaceOrderService(WorkspaceBaseService):
    """Xử lý các nghiệp vụ liên quan đến School Order & Phê duyệt của Partner bằng cơ chế Event-Driven API."""

    async def _fill_partner_create_contract_form(
        self,
        page: Page,
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Hàm nội bộ: Partner điền form tạo PRT Contract gửi Distributor trong cùng 1 phiên (Bắt API Event)."""
        logger.info("📝 Partner mở: /partner-workspace/contract-po/create...")
        
        try:
            async with page.expect_response(
                lambda r: "getListCourseConfig.php" in r.url and r.status == 200,
                timeout=20000
            ):
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", wait_until="domcontentloaded", timeout=45000)
        except Exception:
            logger.info("ℹ️ getListCourseConfig.php đã nạp hoặc DOM sẵn sàng.")

        await wait_for_dom_and_spinners(page, "h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", min_pacing_ms=300)

        # 1. Chọn Contract Type = 'License'
        logger.info("📋 Bước 1: Partner chọn Contract Type = 'License'...")
        type_item = page.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Contract Type")).first
        type_select = type_item.locator("[role='combobox'], .MuiSelect-select").first
        await type_select.wait_for(state="visible", timeout=10000)
        await type_select.click(force=True)

        license_opt = page.locator("li[role='option']:has-text('License')").first
        await license_opt.wait_for(state="visible", timeout=8000)
        await license_opt.click(force=True)

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
                await add_btn.click(force=True)
                await wait_for_dom_and_spinners(page, f".MuiCard-root:has(label:has-text('License Category')) >> nth={idx}", min_pacing_ms=200)

            course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

            # A. Chọn License Category
            cat_val = c.get("category") or "SWRP"
            logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{cat_val}'...")
            cat_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License Category")).first
            cat_select = cat_item.locator("[role='combobox'], .MuiSelect-select").first
            await cat_select.click(force=True)

            cat_opt = page.locator(f"li[role='option']:has-text('{cat_val}')").first
            if await cat_opt.count() > 0:
                await cat_opt.click(force=True)
            else:
                await page.locator("li[role='option']").first.click(force=True)

            # B. Chọn Course
            course_name_val = c.get("course_name")
            logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
            course_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text=re.compile(r"^Course"))).first
            course_select = course_item.locator("[role='combobox'], .MuiSelect-select").first
            await course_select.wait_for(state="visible", timeout=10000)
            await course_select.click(force=True)
            
            await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)

            target_opt = None
            if course_name_val:
                target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first

            if target_opt and await target_opt.count() > 0:
                await target_opt.click(force=True)
            else:
                valid_opts = page.locator("li[role='option']:not(:has-text('Select Course'))")
                if await valid_opts.count() > 0:
                    await valid_opts.first.click(force=True)
                else:
                    await page.locator("li[role='option']").first.click(force=True)

            # C. Điền số lượng Licenses
            lic_qty = str(c.get("licenses", 50))
            lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
            lic_input = lic_item.locator("input[type='number']").first
            await lic_input.click(force=True)
            await page.keyboard.press("Control+A")
            await page.keyboard.type(lic_qty)

        # 4. Bấm Create Contract/PO & BẮT TRỰC TIẾP API createOrderSale.php
        logger.info("🚀 Partner bấm 'Create Contract/PO' và theo dõi API createOrderSale.php...")
        submit_btn = page.locator("button:has-text('Create Contract/PO')").last
        
        contract_num_id = ""
        contract_full_code = ""

        try:
            async with page.expect_response(
                lambda r: "createOrderSale.php" in r.url and r.request.method == "POST",
                timeout=25000
            ) as response_info:
                await submit_btn.click(force=True)

            res = await response_info.value
            if res.status in (200, 201):
                try:
                    res_json = await res.json()
                    logger.info(f"📥 API createOrderSale.php phản hồi: {res_json}")
                    data_obj = res_json.get("data") if isinstance(res_json.get("data"), dict) else res_json
                    contract_num_id = str(data_obj.get("order_id") or data_obj.get("id") or "")
                    contract_full_code = str(data_obj.get("order_code") or data_obj.get("order_sale_id_format") or "")
                except Exception as e:
                    logger.warning(f"⚠️ Không parse được JSON từ createOrderSale: {e}")
        except Exception as e:
            logger.warning(f"⚠️ Không bắt kịp API createOrderSale.php ({e}), chuyển sang cào DataGrid DOM...")

        # Fallback cào từ DOM
        if not contract_full_code:
            try:
                await page.wait_for_url("**/partner-workspace/contract-po", timeout=15000)
            except Exception:
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po", wait_until="domcontentloaded", timeout=15000)

            await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=500)
            first_row = page.locator(".MuiDataGrid-row").first
            if await first_row.count() > 0:
                contract_num_id = await first_row.get_attribute("data-id") or ""
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
        """Trường học đăng nhập tạo mới School Order (Quan sát API getCourseConfig & schoolCreateOrder)."""
        async with acquire_playwright_slot("School Create Order"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("🏫 Mở trang danh sách Order: /school-workspace/orders...")
                    try:
                        async with page.expect_response(
                            lambda r: "getListOrder.php" in r.url and r.status == 200,
                            timeout=25000
                        ):
                            await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="domcontentloaded", timeout=45000)
                    except Exception:
                        await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="domcontentloaded", timeout=45000)

                    await wait_for_dom_and_spinners(page, "button:has-text('Create Order')", min_pacing_ms=300)

                    create_order_btn = page.locator("button:has-text('Create Order')").first
                    await create_order_btn.wait_for(state="visible", timeout=15000)
                    await create_order_btn.click(force=True)

                    await page.wait_for_selector("div[role='dialog']", state="visible", timeout=15000)

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
                            await page.click("div[role='dialog'] button:has-text('Add Course')", force=True)
                            await wait_for_dom_and_spinners(page, f"div[role='dialog'] .MuiGrid-container >> nth={idx}", min_pacing_ms=200)

                        course_card = page.locator("div[role='dialog'] .MuiGrid-container").nth(idx)

                        # A. Chọn License Category
                        category_val = c.get("category", "SWRP")
                        logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{category_val}' và chờ API getCourseConfig.php...")
                        cat_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License Category")).first
                        cat_select = cat_item.locator("[role='combobox'], .MuiSelect-select").first
                        await cat_select.click(force=True)

                        cat_option = page.locator(f"li[role='option']:has-text('{category_val}')").first
                        
                        try:
                            async with page.expect_response(
                                lambda r: "getCourseConfig.php" in r.url and r.status == 200,
                                timeout=12000
                            ):
                                if await cat_option.count() > 0:
                                    await cat_option.click(force=True)
                                else:
                                    await page.locator("li[role='option']").first.click(force=True)
                        except Exception:
                            if await cat_option.count() > 0:
                                await cat_option.click(force=True)

                        # B. Chọn Course
                        course_name_val = c.get("course_name")
                        logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
                        course_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text=re.compile(r"^Course"))).first
                        course_select = course_item.locator("[role='combobox'], .MuiSelect-select").first
                        await course_select.wait_for(state="visible", timeout=10000)
                        await course_select.click(force=True)
                        
                        await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)
                        
                        if course_name_val:
                            target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                            if await target_opt.count() > 0:
                                await target_opt.click(force=True)
                            else:
                                await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)
                        else:
                            await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)

                        # C. Điền License(s)
                        licenses_count = str(c.get("licenses", 50))
                        logger.info(f"🔢 Môn #{idx + 1}: Điền License(s) = {licenses_count}...")
                        lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
                        lic_input = lic_item.locator("input[type='number']").first
                        await lic_input.click(force=True)
                        await page.keyboard.press("Control+A")
                        await page.keyboard.type(licenses_count)

                        # D. Điền Start Date & End Date
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

                    # 4. Điền Additional Notes
                    if order_data.get("additional_notes"):
                        notes_textarea = page.locator("div[role='dialog'] textarea").first
                        if await notes_textarea.count() > 0:
                            await notes_textarea.fill(order_data["additional_notes"])

                    # 5. Bấm Create Order & BẮT TRỰC TIẾP API schoolCreateOrder.php
                    logger.info("🚀 Đang bấm 'Create Order' và quan sát API schoolCreateOrder.php...")
                    submit_dialog_btn = page.locator("div[role='dialog'] button:has-text('Create Order')").last
                    
                    order_num_id = ""
                    order_full_code = ""

                    try:
                        async with page.expect_response(
                            lambda r: "schoolCreateOrder.php" in r.url and r.request.method == "POST",
                            timeout=25000
                        ) as response_info:
                            await submit_dialog_btn.click(force=True)

                        res = await response_info.value
                        if res.status in (200, 201):
                            try:
                                res_json = await res.json()
                                logger.info(f"📥 API schoolCreateOrder.php phản hồi: {res_json}")
                                
                                data_obj = res_json.get("data") if isinstance(res_json.get("data"), dict) else res_json
                                order_num_id = str(data_obj.get("id") or data_obj.get("order_id") or "")
                                order_full_code = str(
                                    data_obj.get("school_order_id_format") or 
                                    data_obj.get("order_code") or 
                                    data_obj.get("partner_order_id_format") or ""
                                )
                            except Exception as e:
                                logger.warning(f"⚠️ Không parse được JSON từ schoolCreateOrder: {e}")
                    except Exception as e:
                        logger.warning(f"⚠️ Không bắt kịp API schoolCreateOrder.php ({e}), chuyển sang cào DataGrid DOM...")

                    # Fallback cào từ DOM
                    if not order_full_code:
                        await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                        await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=500)

                        first_row = page.locator(".MuiDataGrid-row").first
                        if await first_row.count() > 0:
                            order_num_id = await first_row.get_attribute("data-id") or ""
                            order_code_elem = first_row.locator("[data-field='school_order_id'] span, [data-field='school_order_id'], .MuiDataGrid-cell").first
                            order_full_code = (await order_code_elem.inner_text()).strip() if await order_code_elem.count() > 0 else (order_num_id or "")

                    if not order_full_code and order_num_id:
                        order_full_code = f"SCH-{order_num_id}"

                    logger.info(f"🎉 TẠO ORDER THÀNH CÔNG: [{order_full_code}] (ID: {order_num_id})")
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
        """Partner duyệt School Order (Khép góc Search, đối soát License Available >= Needed & Approve)."""
        async with acquire_playwright_slot("Partner Approve School Order"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("🤝 Partner mở /partner-workspace/order-management...")
                    try:
                        async with page.expect_response(
                            lambda r: "getListOrder.php" in r.url and r.status == 200,
                            timeout=25000
                        ):
                            await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="domcontentloaded", timeout=45000)
                    except Exception:
                        await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="domcontentloaded", timeout=45000)

                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=500)

                    # 🎯 CHIẾN THUẬT KHÉP GÓC: Gõ order_identifier vào ô Search để cô lập 1 dòng duy nhất!
                    search_code = str(order_identifier or "").strip()
                    if search_code:
                        logger.info(f"🎯 [KHÉP GÓC] Gõ mã đơn [{search_code}] vào ô Search...")
                        search_input = page.locator("input[placeholder*='Search'], .MuiTextField-root input, input[type='text']").first
                        if await search_input.count() > 0:
                            await search_input.click(force=True)
                            await page.keyboard.press("Control+A")
                            await page.keyboard.type(search_code)
                            await page.wait_for_timeout(600)

                    target_row = page.locator(".MuiDataGrid-row").first
                    if search_code:
                        matched_row = page.locator(f".MuiDataGrid-row:has-text('{search_code}')").first
                        if await matched_row.count() > 0:
                            target_row = matched_row

                    if await target_row.count() == 0:
                        return {"status": "failed", "error": f"Không tìm thấy Order [{search_code}] trên danh sách Partner!"}

                    # Bấm nút Action menu (button chứa icon lucide-menu)
                    logger.info(f"🔍 Bấm mở menu Action của Order [{search_code}]...")
                    action_btn = target_row.locator("button:has(.lucide-menu), [data-field=' '] button, .MuiButton-containedPrimary").first
                    await action_btn.scroll_into_view_if_needed()
                    await action_btn.click(force=True)

                    # Bấm mục "View" trong Popover Menu bung ra
                    view_menu_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')").last
                    await view_menu_item.wait_for(state="visible", timeout=8000)
                    
                    try:
                        async with page.expect_response(
                            lambda r: "getOrderDetail.php" in r.url and r.status == 200,
                            timeout=15000
                        ):
                            await view_menu_item.click(force=True)
                    except Exception:
                        await view_menu_item.click(force=True)

                    # Chờ Dialog "Order Details" hiển thị hoàn chỉnh
                    await page.wait_for_selector("div[role='dialog']:has-text('Order Details')", state="visible", timeout=15000)
                    await page.wait_for_timeout(800)

                    # 🔄 BƯỚC THẨM ĐỊNH LICENSE: Cuộn xuống phần Pool License Selection
                    logger.info("🧐 Kiểm tra và phân bổ Pool License trong Dialog...")
                    dialog = page.locator("div[role='dialog']:has-text('Order Details')").first
                    
                    # Tìm khối Pool License Selection bên trong dialog
                    pool_card = dialog.locator("div:has(h6:has-text('Pool License Selection')), div.MuiBox-root:has(label:has-text('Pool License'))").first
                    if await pool_card.count() > 0:
                        await pool_card.scroll_into_view_if_needed()

                    # Quét tất cả các môn cần chọn Pool License (khối chứa "licenses needed")
                    course_rows = dialog.locator("div:has-text('licenses needed')").filter(has=page.locator("[role='combobox'], .MuiSelect-select"))
                    row_count = await course_rows.count()
                    
                    # Nếu không tìm thấy theo bộ lọc trên, fallback quét các khối chứa label Pool License
                    if row_count == 0:
                        course_rows = dialog.locator("div.MuiBox-root:has(label:has-text('Pool License'))")
                        row_count = await course_rows.count()

                    logger.info(f"📊 Tìm thấy {row_count} môn học cần chọn Pool License.")
                    all_courses_satisfied = True

                    if row_count > 0:
                        for i in range(row_count):
                            c_row = course_rows.nth(i)
                            row_text = await c_row.inner_text()
                            
                            # Trích xuất số license cần: ví dụ "(10 licenses needed)"
                            needed_qty = 1
                            match_needed = re.search(r"(\d+)\s+licenses?\s+needed", row_text, re.IGNORECASE)
                            if match_needed:
                                needed_qty = int(match_needed.group(1))
                            logger.info(f"📚 Môn #{i+1}: Yêu cầu {needed_qty} licenses.")

                            dropdown = c_row.locator("[role='combobox'], .MuiSelect-select").first
                            await dropdown.scroll_into_view_if_needed()
                            await dropdown.click(force=True)
                            await page.wait_for_timeout(400)

                            # Quét các options trong menu bung ra
                            options = page.locator("li[role='option']")
                            opt_count = await options.count()
                            
                            best_opt = None
                            for o_idx in range(opt_count):
                                opt = options.nth(o_idx)
                                opt_text = await opt.inner_text()
                                
                                # Tìm chuỗi "Available: X"
                                avail_match = re.search(r"Available:\s*(\d+)", opt_text, re.IGNORECASE)
                                if avail_match:
                                    avail_num = int(avail_match.group(1))
                                    logger.info(f"   🔎 Option #{o_idx+1}: '{opt_text.strip()}' -> Có: {avail_num} / Cần: {needed_qty}")
                                    
                                    # CHỈ CHỌN KHI AVAILABLE >= NEEDED_QTY
                                    if avail_num >= needed_qty:
                                        best_opt = opt
                                        logger.info(f"   🎯 ĐỦ ĐIỀU KIỆN! Chọn option: '{opt_text.strip()}'")
                                        break

                            if best_opt:
                                await best_opt.click(force=True)
                                await page.wait_for_timeout(400)
                            else:
                                logger.warning(f"❌ Môn #{i+1}: Không có option nào có Available >= {needed_qty}! Kho Partner thiếu hụt.")
                                all_courses_satisfied = False
                                await page.keyboard.press("Escape")
                                await page.wait_for_timeout(200)
                                break  # Thiếu ít nhất 1 môn là toàn đơn không duyệt được

                    # Kiểm tra sự xuất hiện của nút Approve Order
                    approve_btn = dialog.locator("button:has-text('Approve Order')").first
                    try:
                        await approve_btn.wait_for(state="visible", timeout=3000)
                    except Exception:
                        pass

                    can_approve = (await approve_btn.count() > 0) and (await approve_btn.is_visible())

                    if can_approve and all_courses_satisfied:
                        logger.info("🎉 Kho Partner ĐỦ License! Đang bấm 'Approve Order'...")
                        
                        try:
                            async with page.expect_response(
                                lambda r: "updateStatusOrder.php" in r.url and r.request.method == "POST",
                                timeout=20000
                            ) as res_info:
                                await approve_btn.click(force=True)

                            res = await res_info.value
                            logger.info(f"📥 API updateStatusOrder.php status code: {res.status}")
                        except Exception as e:
                            logger.warning(f"⚠️ Không bắt kịp updateStatusOrder.php ({e}), bấm trực tiếp...")
                            await approve_btn.click(force=True)
                            await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                        
                        return {
                            "status": "success",
                            "order_identifier": order_identifier,
                            "message": f"Partner đã duyệt thành công School Order: {order_identifier}"
                        }
                    else:
                        logger.warning("⚠️ Kho Partner KHÔNG ĐỦ License để duyệt Order (Nút Approve Order không xuất hiện)!")

                        # 🟢 1-SESSION PARTNER: CHUYỂN THẲNG SANG TẠO PRT CONTRACT GỬI DISTRIBUTOR
                        if auto_create_prt_if_short:
                            logger.info(f"⚡ [1-SESSION PARTNER] Thiếu License! Đóng popup và chuyển sang tạo PRT Contract...")
                            close_btn = dialog.locator("button:has-text('Close')").first
                            if await close_btn.count() > 0:
                                await close_btn.click(force=True)
                                await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=5000)

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

                        close_btn = dialog.locator("button:has-text('Close')").first
                        if await close_btn.count() > 0:
                            await close_btn.click(force=True)

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

    async def fetch_school_order_detailed_courses(
        self,
        credentials: Dict[str, str],
        order_identifier: str
    ) -> Dict[str, Any]:
        """Trích xuất chi tiết môn học của Order (qua Direct API trong session hoặc Cache)."""
        async with acquire_playwright_slot("Fetch School Order Details"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "courses": []}

                    clean_order_num = re.sub(r"[^\d]", "", str(order_identifier))
                    detail_url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/orders_management/getOrderDetail.php?order_id={clean_order_num}"
                    
                    detail_res = await page.evaluate(f"""async () => {{
                        try {{
                            const r = await fetch('{detail_url}');
                            return await r.json();
                        }} catch(e) {{
                            return null;
                        }}
                    }}""")

                    courses = []
                    if detail_res and "detail_package" in detail_res:
                        detail_courses = detail_res.get("detail_package", {}).get("courses", []) or []
                        for dc in detail_courses:
                            courses.append({
                                "course_id": dc.get("course_id"),
                                "course_name": dc.get("course_name"),
                                "category": dc.get("category", "SWRP"),
                                "licenses": int(dc.get("course_count", 1)),
                                "start_date": dc.get("course_enroll_start_date", "2026-09-01"),
                                "end_date": dc.get("course_enroll_end_date", "2027-05-31")
                            })

                    return {
                        "status": "success",
                        "order_identifier": order_identifier,
                        "courses": courses
                    }
                except Exception as e:
                    logger.error(f"❌ Lỗi fetch school order details: {e}")
                    return {"status": "failed", "error": str(e), "courses": []}
                finally:
                    await browser.close()