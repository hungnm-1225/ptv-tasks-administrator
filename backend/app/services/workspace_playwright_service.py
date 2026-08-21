# backend/app/services/workspace_playwright_service.py
import os
import logging
import asyncio
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page, BrowserContext

from app.core.config import settings

logger = logging.getLogger(__name__)
BASE_WORKSPACE_URL = "https://pythaverse.space"


class WorkspacePlaywrightService:
    """Service RPA tự động hóa 100% các tác vụ Account Creation, Order & Contract trên Pythaverse."""

    def __init__(self):
        self.headless = True  # Đặt False khi anh muốn debug xem bot click trực tiếp trên máy local

    async def _create_context(self, p) -> tuple:
        """Khởi tạo Browser Chromium với Viewport và cấu hình chuẩn."""
        browser = await p.chromium.launch(
            headless=self.headless,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        return browser, context, page

    async def login_role(self, page: Page, username: str, password: str, role_title: str = "Tài khoản") -> tuple[bool, str]:
        """
        Đăng nhập Keycloak SSO với cơ chế chẩn đoán lỗi chi tiết:
        Trả về: (is_success: bool, error_message: str)
        """
        if not username or not password:
            err = f"❌ [{role_title}] Thiếu thông tin username/mật khẩu trong Két Sắt Credentials Vault!"
            logger.error(err)
            return False, err

        try:
            logger.info(f"🔑 [{role_title}] Đang đăng nhập tài khoản '{username}'...")
            
            # Gửi request mở trang Login kèm bắt lỗi mạng/sập server
            response = await page.goto(f"{BASE_WORKSPACE_URL}/login", wait_until="networkidle", timeout=35000)
            
            if response and response.status >= 500:
                err = f"🔥 [{role_title}] Máy chủ Pythaverse bị sập hoặc bảo trì! (Mã lỗi HTTP: {response.status})"
                logger.error(err)
                return False, err

            # 1. Điền Form đăng nhập Keycloak SSO
            await page.fill("input[name='username'], input[name='email'], #username", username)
            await page.fill("input[name='password'], #password", password)
            
            # 2. Click nút Đăng nhập
            await page.click("button[type='submit'], input[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')")
            await page.wait_for_timeout(3500)

            # 3. Bóc tách lỗi hiển thị trên giao diện Keycloak (nếu có)
            kc_error_locator = page.locator(".alert-error, #input-error, span.kc-feedback-text, .alert.alert-warning, p.instruction")
            if await kc_error_locator.count() > 0 and await kc_error_locator.first.is_visible():
                raw_error_text = (await kc_error_locator.first.inner_text()).strip()
                err = f"❌ [{role_title} - '{username}'] Đăng nhập thất bại: '{raw_error_text}' (Sai mật khẩu hoặc tài khoản chưa kích hoạt)"
                logger.error(err)
                return False, err

            # 4. Kiểm tra xem URL sau đăng nhập có còn bị kẹt ở trang login không
            if "login" in page.url or "authenticate" in page.url:
                err = f"⚠️ [{role_title} - '{username}'] Không thể chuyển trang sau đăng nhập (Bị kẹt tại: {page.url})"
                logger.warning(err)
                return False, err

            logger.info(f"✅ [{role_title}] Đăng nhập thành công: {username} (URL: {page.url})")
            return True, "Đăng nhập thành công"

        except Exception as e:
            err_str = str(e)
            if "Timeout" in err_str:
                err = f"⏳ [{role_title} - '{username}'] Quá thời gian chờ phản hồi (Timeout khi kết nối tới Cổng SSO)!"
            elif "ERR_CONNECTION" in err_str or "ECONNREFUSED" in err_str:
                err = f"🔌 [{role_title}] Mất kết nối tới máy chủ Pythaverse (Connection Refused)!"
            else:
                err = f"💥 [{role_title} - '{username}'] Lỗi bất thường khi đăng nhập: {err_str[:150]}"
            
            logger.error(err)
            return False, err

    # =========================================================================
    # 1. SCHOOL WORKSPACE: TẠO ORDER MỚI & BẮT MÃ ORDER ID
    # =========================================================================
    async def school_create_order(
        self, 
        credentials: Dict[str, str], 
        order_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Tự động mở School Workspace và điền Form Create New Order chuẩn chỉ 100%."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🏫 Mở trang danh sách Order: /school-workspace/orders...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="networkidle", timeout=45000)

                # 1. Click nút Create Order màu xanh
                create_order_btn = page.locator("button:has-text('Create Order')").first
                await create_order_btn.wait_for(state="visible", timeout=15000)
                await create_order_btn.click()

                # Đợi Dialog 'Create New Order' xuất hiện
                await page.wait_for_selector("div[role='dialog']:has-text('Create New Order')", timeout=15000)
                logger.info("📋 Đã mở Modal Create New Order thành công!")

                # 2. Điền Contact Information
                contact_info = order_data.get("contact_info", "Admin Automation Hub (operation@pythaverse.space)")
                contact_input = page.locator("div[role='dialog'] input[placeholder*='contact information']").first
                await contact_input.fill(contact_info)

                # 3. Lặp qua danh sách khóa học trong Order
                courses = order_data.get("courses", [])
                if not courses:
                    courses = [{
                        "category": order_data.get("category", "SWRP"),
                        "course_name": order_data.get("course_name"),
                        "licenses": order_data.get("licenses", 1),
                        "start_date": order_data.get("start_date"),
                        "end_date": order_data.get("end_date")
                    }]

                for idx, c in enumerate(courses):
                    if idx > 0:
                        await page.click("div[role='dialog'] button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    # A. BẤM TRỰC TIẾP VÀO Ô SELECT CỦA 'License Category' (Ghim chính xác)
                    cat_select = page.locator(f"(//div[@role='dialog']//div[contains(@class, 'MuiFormControl-root')][.//label[contains(., 'License Category')]]//div[@role='combobox'])[{idx+1}]")
                    await cat_select.wait_for(state="visible", timeout=10000)
                    await cat_select.click()
                    await page.wait_for_timeout(500)

                    # Chọn Option Category (VD: SWRP, ASP, IR...)
                    category_val = c.get("category", "SWRP")
                    cat_option = page.locator(f"ul[role='listbox'] li[role='option']:has-text('{category_val}'), .MuiPopover-root li:has-text('{category_val}')").first
                    await cat_option.wait_for(state="visible", timeout=5000)
                    await cat_option.click()
                    logger.info(f"✅ [Course {idx+1}] Đã chọn License Category: '{category_val}'")
                    await page.wait_for_timeout(1200)

                    # B. CHỌN COURSE NAME
                    course_select = page.locator(f"(//div[@role='dialog']//div[contains(@class, 'MuiFormControl-root')][.//label[contains(., 'Course') and not(contains(., 'Category'))]]//div[@role='combobox'])[{idx+1}]")
                    await course_select.wait_for(state="visible", timeout=10000)
                    await course_select.click()
                    await page.wait_for_timeout(500)
                    
                    course_name_val = c.get("course_name")
                    if course_name_val:
                        target_opt = page.locator(f"ul[role='listbox'] li[role='option']:has-text('{course_name_val}'), .MuiPopover-root li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("ul[role='listbox'] li[role='option']").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li[role='option']").first.click()
                    
                    logger.info(f"✅ [Course {idx+1}] Đã chọn Course Name!")
                    await page.wait_for_timeout(500)

                    # C. ĐIỀN SỐ LƯỢNG LICENSES
                    licenses_count = str(c.get("licenses", 1))
                    lic_input = page.locator(f"(//div[@role='dialog']//div[contains(@class, 'MuiFormControl-root')][.//label[contains(., 'License')]]//input[@type='number'])[{idx+1}]")
                    await lic_input.fill(licenses_count)

                    # D. ĐIỀN START DATE & END DATE
                    start_date_val = c.get("start_date")
                    end_date_val = c.get("end_date")
                    
                    start_input = page.locator(f"(//div[@role='dialog']//div[contains(@class, 'MuiFormControl-root')][.//label[contains(., 'Start Date')]]//input)[{idx+1}]")
                    end_input = page.locator(f"(//div[@role='dialog']//div[contains(@class, 'MuiFormControl-root')][.//label[contains(., 'End Date')]]//input)[{idx+1}]")
                    
                    if start_date_val:
                        await start_input.fill(start_date_val)
                    if end_date_val:
                        await end_input.fill(end_date_val)

                # 4. Điền Additional Notes
                additional_notes = order_data.get("additional_notes", "")
                if additional_notes:
                    notes_textarea = page.locator("div[role='dialog'] textarea[placeholder*='notes'], div[role='dialog'] textarea").first
                    await notes_textarea.fill(additional_notes)

                # 5. Bấm nút 'Create Order' hoàn tất trong Dialog
                submit_dialog_btn = page.locator("div[role='dialog'] button:has-text('Create Order')").last
                await submit_dialog_btn.click()
                logger.info("🚀 Đã bấm Submit Order! Đang đợi trang danh sách cập nhật...")

                # 6. Đợi Modal đóng và DataGrid render dòng mới nhất
                await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=20000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=20000)
                await page.wait_for_timeout(2000)

                # 7. BẮT ORDER ID MỚI SINH TẠI DÒNG ĐẦU TIÊN
                first_row = page.locator(".MuiDataGrid-row").first
                order_num_id = await first_row.get_attribute("data-id")
                
                order_code_elem = first_row.locator("[data-field='school_order_id'] a, [data-field='school_order_id']").first
                order_full_code = (await order_code_elem.inner_text()).strip() if await order_code_elem.count() > 0 else order_num_id

                logger.info(f"🎉 TẠO ORDER THÀNH CÔNG! Mã Order: [{order_full_code}] | ID: [{order_num_id}]")

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

    # =========================================================================
    # 2. PARTNER WORKSPACE: DUYỆT ORDER VÀ CHỌN POOL LICENSE
    # =========================================================================
    async def partner_approve_school_order(
        self, 
        credentials: Dict[str, str], 
        order_identifier: Optional[str] = None
    ) -> Dict[str, Any]:
        """Partner mở /partner-workspace/order-management, chọn Pool License và duyệt Order."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🤝 Partner đang mở /partner-workspace/order-management...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)

                # 1. Tìm dòng Order mục tiêu
                target_row = None
                if order_identifier:
                    target_row = page.locator(
                        f".MuiDataGrid-row[data-id='{order_identifier}'], "
                        f".MuiDataGrid-row:has([data-field='school_order_id']:has-text('{order_identifier}'))"
                    ).first
                
                # Fallback: Lấy dòng đầu tiên có trạng thái 'Awaiting Partner'
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status_name']:has-text('Awaiting Partner'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Order phù hợp ({order_identifier}) ở trạng thái 'Awaiting Partner'"}

                # 2. Click nút Action (icon Menu 3 gạch) để mở Popover Menu
                action_btn = target_row.locator("[data-field=' '] button, button:has(.lucide-menu)").first
                await action_btn.click()
                logger.info("📋 Đã bấm icon 3 gạch, chờ Popover Menu hiện...")
                
                # BẮT BUỘC: Bấm tiếp chữ 'View' trong Popover Menu
                view_menu_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenu-list li:has-text('View'), text=View").first
                await view_menu_item.wait_for(state="visible", timeout=5000)
                await view_menu_item.click()
                logger.info("✨ Đã click 'View'! Đang mở Modal Order Details...")

                # Đợi Modal 'Order Details' hiển thị
                await page.wait_for_selector("div[role='dialog']:has-text('Order Details')", timeout=15000)

                # 3. Ghim đúng các ô chọn 'Pool License' theo nhãn label
                pool_selects = page.locator("//div[@role='dialog']//div[contains(@class, 'MuiFormControl-root')][.//label[contains(., 'Pool License')]]//div[@role='combobox']")
                select_count = await pool_selects.count()
                
                # Fallback nếu modal hiển thị cấu trúc khác
                if select_count == 0:
                    pool_selects = page.locator("div[role='dialog'] div[role='combobox']:has-text('Pool License'), div[role='dialog'] .MuiSelect-select")
                    select_count = await pool_selects.count()

                logger.info(f"🔄 Tìm thấy {select_count} mục cần chọn Pool License...")

                for i in range(select_count):
                    current_select = pool_selects.nth(i)
                    await current_select.click()
                    await page.wait_for_timeout(500)

                    # Ưu tiên chọn Category License
                    option = page.locator("ul[role='listbox'] li[role='option']:has-text('Category License'), .MuiPopover-root li:has-text('Category License'), li:has-text('Available')").first
                    if await option.count() > 0:
                        await option.click()
                    else:
                        first_opt = page.locator("ul[role='listbox'] li[role='option'], .MuiPopover-root li").first
                        if await first_opt.count() > 0:
                            await first_opt.click()
                    await page.wait_for_timeout(800)

                # 4. Kiểm tra điều kiện đủ License
                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order')")

                if await approve_btn.count() > 0 and await approve_btn.is_visible():
                    logger.info("✨ Kho đủ License! Bấm nút 'Approve Order'...")
                    await approve_btn.click()
                    await page.wait_for_timeout(3000)
                    
                    logger.info("🎉 Partner đã duyệt School Order thành công!")
                    return {
                        "status": "success",
                        "order_identifier": order_identifier,
                        "message": "Partner đã duyệt School Order thành công"
                    }
                else:
                    logger.warning("⚠️ Kho Partner không đủ License để duyệt trực tiếp!")
                    return {
                        "status": "insufficient_pool",
                        "order_identifier": order_identifier,
                        "message": "Kho Partner không đủ License, cần tạo Contract xin Distributor cấp thêm."
                    }

            except Exception as e:
                logger.error(f"❌ Lỗi Partner Approve Order: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 2B. PARTNER WORKSPACE: TẠO CONTRACT XIN DISTRIBUTOR CẤP LICENSE (PRT-...)
    # =========================================================================
    async def partner_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Partner mở /partner-workspace/contract-po/create và tạo Contract PRT-..."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📝 Partner mở trang tạo Contract: /partner-workspace/contract-po/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("text=Create Contract/PO", timeout=15000)

                # 1. BẮT BUỘC: Ghim chọn Contract Type = 'License'
                type_select = page.locator("//div[contains(@class, 'MuiFormControl-root')][.//label[contains(., 'Contract Type')]]//div[@role='combobox']").first
                await type_select.wait_for(state="visible", timeout=10000)
                await type_select.click()
                await page.wait_for_selector("ul[role='listbox'] li[role='option']:has-text('License'), .MuiPopover-root li:has-text('License')", timeout=5000)
                await page.locator("ul[role='listbox'] li[role='option']:has-text('License'), .MuiPopover-root li:has-text('License')").first.click()
                await page.wait_for_timeout(1000)
                logger.info("✅ Đã chọn Contract Type = 'License'")

                # 2. Điền Contract Notes
                notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub to fulfill School Order")
                notes_input = page.locator("textarea").first
                await notes_input.fill(notes)

                # 3. Lặp qua các khóa học cần xin thêm License
                courses = contract_data.get("courses", [])
                for idx, c in enumerate(courses):
                    if idx > 0:
                        await page.click("button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    # A. Ghim License Category
                    cat_select = page.locator(f"(//div[contains(@class, 'MuiCard-root')][.//label[contains(., 'License Category')]]//div[@role='combobox'])[{idx+1}]")
                    await cat_select.wait_for(state="visible", timeout=10000)
                    await cat_select.click()
                    
                    cat_val = c.get("category", "SWRP")
                    cat_opt = page.locator(f"ul[role='listbox'] li[role='option']:has-text('{cat_val}'), .MuiPopover-root li:has-text('{cat_val}')").first
                    await cat_opt.wait_for(state="visible", timeout=5000)
                    await cat_opt.click()
                    await page.wait_for_timeout(1200)

                    # B. Ghim Course Name
                    course_select = page.locator(f"(//div[contains(@class, 'MuiCard-root')][.//label[contains(., 'Course') and not(contains(., 'Category'))]]//div[@role='combobox'])[{idx+1}]")
                    await course_select.wait_for(state="visible", timeout=10000)
                    await course_select.click()
                    
                    course_name_val = c.get("course_name")
                    if course_name_val:
                        target_opt = page.locator(f"ul[role='listbox'] li[role='option']:has-text('{course_name_val}'), .MuiPopover-root li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("ul[role='listbox'] li[role='option']").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li[role='option']").first.click()
                    await page.wait_for_timeout(500)

                    # C. Điền số lượng Licenses
                    lic_input = page.locator(f"(//div[contains(@class, 'MuiCard-root')][.//label[contains(., 'License')]]//input[@type='number'])[{idx+1}]")
                    await lic_input.fill(str(c.get("licenses", 50)))

                # 4. Bấm nút '💾 Create Contract/PO'
                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()

                # 5. Đợi về trang danh sách và bắt Contract Code
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id")
                
                code_elem = first_row.locator("[data-field='order_code']").first
                contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else contract_num_id

                logger.info(f"🎉 TẠO CONTRACT THÀNH CÔNG! Mã: [{contract_full_code}] | ID: [{contract_num_id}]")

                return {
                    "status": "success",
                    "contract_id": contract_num_id,
                    "contract_code": contract_full_code,
                    "message": f"Partner đã tạo Contract {contract_full_code} gửi Distributor thành công"
                }

            except Exception as e:
                logger.error(f"❌ Lỗi Partner Create Contract: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 3A. DISTRIBUTOR WORKSPACE: DUYỆT CONTRACT CỦA PARTNER (PRT-...)
    # =========================================================================
    async def distributor_approve_partner_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None
    ) -> Dict[str, Any]:
        """Distributor mở /distributor-workspace/partner-contract-po và duyệt Contract của Partner."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🏢 Distributor đang mở /distributor-workspace/partner-contract-po...")
                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)

                # 1. Tìm đúng dòng Contract PRT-... của Partner
                target_row = None
                if contract_identifier:
                    target_row = page.locator(
                        f".MuiDataGrid-row[data-id='{contract_identifier}'], "
                        f".MuiDataGrid-row:has([data-field='order_code']:has-text('{contract_identifier}'))"
                    ).first
                
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending Distributor Review'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Contract ({contract_identifier}) ở trạng thái chờ duyệt"}

                # 2. Click icon Info (View Details) ở cột Actions
                info_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button").first
                await info_btn.click()

                # Đợi Modal 'Partner Order Details' hiển thị
                await page.wait_for_selector("div[role='dialog']:has-text('Partner Order Details')", timeout=15000)

                # 3. Kiểm tra nút Approve xanh lá
                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order')")

                if await approve_btn.count() > 0 and await approve_btn.is_visible():
                    logger.info("✨ Kho Distributor đủ License! Bấm nút 'Approve Order'...")
                    await approve_btn.click()
                    await page.wait_for_timeout(3000)
                    
                    logger.info(f"🎉 Distributor đã duyệt Partner Contract {contract_identifier} thành công!")
                    return {
                        "status": "success",
                        "contract_identifier": contract_identifier,
                        "message": "Distributor đã duyệt Partner Contract thành công"
                    }
                else:
                    logger.warning("⚠️ Kho Distributor không đủ License! Cần tạo Contract DST-... xin Sales Admin.")
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

    # =========================================================================
    # 3B. DISTRIBUTOR WORKSPACE: TẠO CONTRACT XIN SALES ADMIN CẤP LICENSE (DST-...)
    # =========================================================================
    async def distributor_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Distributor mở /distributor-workspace/contract-po/create và tạo Contract DST-..."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📝 Distributor mở trang tạo Contract: /distributor-workspace/contract-po/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("text=Create Contract/PO", timeout=15000)

                # 1. BẮT BUỘC: Ghim chọn Contract Type = 'License'
                type_select = page.locator("//div[contains(@class, 'MuiFormControl-root')][.//label[contains(., 'Contract Type')]]//div[@role='combobox']").first
                await type_select.wait_for(state="visible", timeout=10000)
                await type_select.click()
                await page.wait_for_selector("ul[role='listbox'] li[role='option']:has-text('License'), .MuiPopover-root li:has-text('License')", timeout=5000)
                await page.locator("ul[role='listbox'] li[role='option']:has-text('License'), .MuiPopover-root li:has-text('License')").first.click()
                await page.wait_for_timeout(1000)

                # 2. Điền Contract Notes
                notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub to fulfill Partner Contract")
                notes_input = page.locator("textarea").first
                await notes_input.fill(notes)

                # 3. Lặp qua danh sách môn học
                courses = contract_data.get("courses", [])
                for idx, c in enumerate(courses):
                    if idx > 0:
                        await page.click("button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    # A. Ghim License Category
                    cat_select = page.locator(f"(//div[contains(@class, 'MuiCard-root')][.//label[contains(., 'License Category')]]//div[@role='combobox'])[{idx+1}]")
                    await cat_select.wait_for(state="visible", timeout=10000)
                    await cat_select.click()
                    
                    cat_val = c.get("category", "SWRP")
                    cat_opt = page.locator(f"ul[role='listbox'] li[role='option']:has-text('{cat_val}'), .MuiPopover-root li:has-text('{cat_val}')").first
                    await cat_opt.wait_for(state="visible", timeout=5000)
                    await cat_opt.click()
                    await page.wait_for_timeout(1200)

                    # B. Ghim Course Name
                    course_select = page.locator(f"(//div[contains(@class, 'MuiCard-root')][.//label[contains(., 'Course') and not(contains(., 'Category'))]]//div[@role='combobox'])[{idx+1}]")
                    await course_select.wait_for(state="visible", timeout=10000)
                    await course_select.click()
                    
                    course_name_val = c.get("course_name")
                    if course_name_val:
                        target_opt = page.locator(f"ul[role='listbox'] li[role='option']:has-text('{course_name_val}'), .MuiPopover-root li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("ul[role='listbox'] li[role='option']").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li[role='option']").first.click()
                    await page.wait_for_timeout(500)

                    # C. Điền số lượng Licenses
                    lic_input = page.locator(f"(//div[contains(@class, 'MuiCard-root')][.//label[contains(., 'License')]]//input[@type='number'])[{idx+1}]")
                    await lic_input.fill(str(c.get("licenses", 100)))

                # 4. Bấm nút '💾 Create Contract/PO'
                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()

                # 5. Đợi về trang danh sách và bắt Contract Code
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id")
                
                code_elem = first_row.locator("[data-field='order_code']").first
                contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else contract_num_id

                logger.info(f"🎉 TẠO DST CONTRACT THÀNH CÔNG! Mã: [{contract_full_code}] | ID: [{contract_num_id}]")

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

    # =========================================================================
    # 4. SALES ADMIN WORKSPACE: DUYỆT CONTRACT TỐI CAO (DST-...)
    # =========================================================================
    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sales Admin duyệt Contract DST-... và điền Justification Note."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("👑 Đang chuyển hướng Sales Admin tới /sales-admin-workspace/dashboard...")
                await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)

                # 1. Tìm dòng Contract DST-... mục tiêu
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

                # 2. Click icon Con Mắt ở cột Actions để mở trang chi tiết
                eye_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, button:has(svg[data-testid='VisibilityIcon'])").first
                await eye_btn.click()

                # Đợi trang chi tiết Contract load xong
                await page.wait_for_selector("button:has-text('Approve')", timeout=15000)

                # 3. Bấm nút 'Approve' màu xanh lá
                approve_btn = page.locator("button:has-text('Approve')").first
                await approve_btn.click()

                # Đợi Dialog 'Confirm Order Approval' hiển thị
                await page.wait_for_selector("div[role='dialog']:has-text('Confirm Order Approval')", timeout=10000)

                # 4. Chuẩn bị Justification Note (Bắt buộc >= 15 ký tự)
                default_note = "Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub"
                valid_justification = justification if (justification and len(justification.strip()) >= 15) else default_note
                
                textarea = page.locator("div[role='dialog'] textarea").first
                await textarea.fill(valid_justification)
                await page.wait_for_timeout(800)

                # 5. Bấm nút 'Confirm Approval'
                confirm_btn = page.locator("div[role='dialog'] button:has-text('Confirm Approval')").first
                await confirm_btn.click()
                await page.wait_for_timeout(3000)

                logger.info(f"🎉 Sales Admin đã phê duyệt Contract {contract_identifier or ''} thành công!")
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

    # =========================================================================
    # 5. MASTER ORCHESTRATOR: TỰ ĐỘNG HÓA TOÀN TRÌNH PHẢ HỆ 4 CẤP
    # =========================================================================
    async def execute_full_license_hierarchy_chain(
        self,
        school_identifier: str,
        order_details: Dict[str, Any],
        sales_admin_creds: Dict[str, str],
        cof_file_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Luồng tự động hóa trọn gói 4 cấp:
        1. Giải mã phả hệ (School -> Partner -> Distributor -> Sales Admin).
        2. Google Drive: Upload file COF vào thư mục chuẩn phân tầng.
        3. Step 1: School tạo Order (SCH-...).
        4. Step 2: Partner duyệt Order.
           - Nếu thiếu: 
             a) Partner tạo Contract PRT-... gửi Distributor.
             b) Distributor duyệt PRT-... (nếu Distributor thiếu -> tạo DST-... gửi Sales Admin -> Sales Admin duyệt DST-... -> Distributor duyệt PRT-...).
             c) Partner quay lại duyệt School Order (SCH-...).
        """
        from app.services.workspace_lineage_service import workspace_lineage_service
        from app.services.google_drive_service import google_drive_service
        
        logs = []
        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 BẮT ĐẦU QUY TRÌNH PHÂN PHỐI LICENSE 4 CẤP CHO TRƯỜNG: '{school_identifier}'")

        # 1. Truy vết phả hệ
        lineage = workspace_lineage_service.resolve_by_school(school_identifier)
        if not lineage:
            err = f"Không tìm thấy phả hệ của trường '{school_identifier}' trong cơ sở dữ liệu!"
            log_step(f"❌ {err}")
            return {"status": "failed", "error": err, "logs": "\n".join(logs)}

        school_creds = lineage["school"]
        partner_creds = lineage["partner"]
        distributor_creds = lineage["distributor"]
        country_info = lineage.get("country", {})

        # 2. Upload file COF lên Google Drive đúng cây thư mục (nếu có file)
        drive_link = ""
        if cof_file_path and os.path.exists(cof_file_path):
            try:
                root_id = getattr(settings, "COF_ROOT_FOLDER_ID", "1SEh4I9yJRM8JNi_SC9CltpkyDYeG-I--")
                folder_id = google_drive_service.ensure_school_cof_folder(
                    root_folder_id=root_id,
                    country=country_info.get("folder", "4. Vietnam"),
                    distributor_name=distributor_creds["name"],
                    partner_name=partner_creds["name"],
                    school_name=school_creds["name"]
                )
                upload_res = google_drive_service.upload_file_to_school_folder(cof_file_path, folder_id)
                drive_link = upload_res.get("web_view_link", "")
                log_step(f"📁 Đã lưu trữ file COF lên Google Drive: {drive_link}")
            except Exception as e:
                log_step(f"⚠️ Lỗi phụ Google Drive (bỏ qua để tiếp tục RPA): {e}")

        if drive_link:
            notes = order_details.get("additional_notes", "")
            order_details["additional_notes"] = f"{notes}\nCOF Drive: {drive_link}".strip()

        # 3. BƯỚC 1: School tạo Order
        log_step(f"🏫 [CẤP 1 - SCHOOL] Đang tạo Order cho trường '{school_creds.get('name')}'...")
        school_res = await self.school_create_order(school_creds, order_details)
        if school_res.get("status") != "success":
            err_detail = school_res.get("error", "Lỗi tạo Order tại School")
            log_step(f"❌ [LỖI CẤP 1 - SCHOOL]: {err_detail}")
            return {"status": "failed", "step": "school_create_order", "error": err_detail, "logs": "\n".join(logs)}

        order_code = school_res.get("order_code")
        log_step(f"✅ [CẤP 1] School đã tạo Order thành công: [{order_code}]")

        # 4. BƯỚC 2: Partner duyệt Order
        log_step(f"🤝 [CẤP 2 - PARTNER] Đang đăng nhập đối tác '{partner_creds.get('name')}' để duyệt Order [{order_code}]...")
        partner_res = await self.partner_approve_school_order(partner_creds, order_code)

        if partner_res.get("status") == "failed":
            err_detail = partner_res.get("error", "Lỗi duyệt Order tại Partner")
            log_step(f"❌ [LỖI CẤP 2 - PARTNER]: {err_detail}")
            return {"status": "failed", "step": "partner_approve_school_order", "error": err_detail, "logs": "\n".join(logs)}

        # 5. XỬ LÝ NHÁNH THIẾU LICENSE
        if partner_res.get("status") == "insufficient_pool":
            log_step("⚠️ [CẤP 2] Kho Partner thiếu License! Đang kích hoạt luồng xin cấp bù...")

            # A. Partner tạo Contract PRT-... gửi lên Distributor
            log_step(f"📝 [CẤP 2] Partner đang gửi Contract PRT-... lên Distributor '{distributor_creds.get('name')}'...")
            prt_contract = await self.partner_create_contract(partner_creds, {
                "notes": f"Fulfill School Order {order_code}",
                "courses": order_details.get("courses", [])
            })
            if prt_contract.get("status") != "success":
                err_detail = prt_contract.get("error")
                log_step(f"❌ [LỖI CẤP 2 - PARTNER TẠO CONTRACT]: {err_detail}")
                return {"status": "failed", "step": "partner_create_contract", "error": err_detail, "logs": "\n".join(logs)}
            
            prt_code = prt_contract.get("contract_code")
            log_step(f"✅ [CẤP 2] Đã tạo Contract Partner: [{prt_code}]")

            # B. Distributor duyệt Contract PRT-...
            log_step(f"🏢 [CẤP 3 - DISTRIBUTOR] Đang đăng nhập Tổng Đại Lý '{distributor_creds.get('name')}' để duyệt [{prt_code}]...")
            dist_res = await self.distributor_approve_partner_contract(distributor_creds, prt_code)

            if dist_res.get("status") == "failed":
                err_detail = dist_res.get("error")
                log_step(f"❌ [LỖI CẤP 3 - DISTRIBUTOR DUYỆT]: {err_detail}")
                return {"status": "failed", "step": "distributor_approve_partner_contract", "error": err_detail, "logs": "\n".join(logs)}

            # Nếu Distributor cũng thiếu License -> Distributor xin Sales Admin
            if dist_res.get("status") == "insufficient_pool":
                log_step("⚠️ [CẤP 3] Kho Distributor cũng thiếu License! Đang gửi Contract DST-... lên Sales Admin...")
                
                dst_contract = await self.distributor_create_contract(distributor_creds, {
                    "notes": f"Fulfill Partner Contract {prt_code} for School {order_code}",
                    "courses": order_details.get("courses", [])
                })
                if dst_contract.get("status") != "success":
                    err_detail = dst_contract.get("error")
                    log_step(f"❌ [LỖI CẤP 3 - DISTRIBUTOR TẠO DST CONTRACT]: {err_detail}")
                    return {"status": "failed", "step": "distributor_create_contract", "error": err_detail, "logs": "\n".join(logs)}

                dst_code = dst_contract.get("contract_code")
                log_step(f"✅ [CẤP 3] Đã tạo Contract DST: [{dst_code}]")

                # Sales Admin duyệt Contract DST-...
                log_step(f"👑 [CẤP 4 - SALES ADMIN] Đang đăng nhập Sales Admin để duyệt DST Contract [{dst_code}]...")
                admin_res = await self.admin_approve_distributor_contract(sales_admin_creds, dst_code)
                if admin_res.get("status") != "success":
                    err_detail = admin_res.get("error")
                    log_step(f"❌ [LỖI CẤP 4 - SALES ADMIN DUYỆT]: {err_detail}")
                    return {"status": "failed", "step": "admin_approve_distributor_contract", "error": err_detail, "logs": "\n".join(logs)}
                log_step(f"🎉 [CẤP 4] Sales Admin đã Approve thành công Contract [{dst_code}]!")

                # Distributor duyệt lại PRT-... của Partner
                log_step(f"🏢 [CẤP 3] Distributor quay lại duyệt Contract [{prt_code}]...")
                await self.distributor_approve_partner_contract(distributor_creds, prt_code)

            # C. Partner quay lại duyệt School Order lần cuối
            log_step(f"🤝 [CẤP 2] Partner quay lại duyệt School Order [{order_code}] lần cuối...")
            final_partner_res = await self.partner_approve_school_order(partner_creds, order_code)
            if final_partner_res.get("status") != "success":
                err_detail = final_partner_res.get("error")
                log_step(f"❌ [LỖI DUYỆT LẦN CUỐI TẠI PARTNER]: {err_detail}")
                return {"status": "failed", "step": "final_partner_approve", "error": err_detail, "logs": "\n".join(logs)}

        log_step(f"🏁 HOÀN TẤT TOÀN BỘ QUY TRÌNH PHÂN PHỐI LICENSE CHO ORDER: [{order_code}]!")
        return {
            "status": "success",
            "order_code": order_code,
            "drive_link": drive_link,
            "logs": "\n".join(logs)
        }

    # =========================================================================
    # 6. SCHOOL WORKSPACE: GHI DANH HỌC VIÊN & TẠO GROUP LỚP TRONG KHÓA HỌC
    # =========================================================================
    async def school_enroll_users_and_groups(
        self,
        credentials: Dict[str, str],
        course_name: str,
        start_date: str,
        end_date: str,
        school_name: str,
        group_name_raw: str,
        student_emails: List[str],
        teacher_emails: List[str] = []
    ) -> Dict[str, Any]:
        """Tự động tạo Group và Ghi danh học sinh/giáo viên vào khóa học."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📚 Điều hướng tới /school-workspace/courses...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/courses", wait_until="networkidle")

                course_row = page.locator(f"//tr[contains(., '{course_name}') and contains(., '{start_date}')]").first
                if await course_row.count() == 0:
                    course_row = page.locator(f"//tr[contains(., '{course_name}')]").first

                await course_row.locator("a, button, text=" + course_name).first.click()
                await page.wait_for_selector("text=Enrolled Users", timeout=15000)

                await page.click("button:has-text('Enroll Users')")
                await page.wait_for_selector("text=User Enrollment", timeout=10000)

                # Tạo Group
                await page.click("text=GROUP MANAGEMENT")
                await page.wait_for_timeout(1000)

                formatted_group_name = f"{school_name} {group_name_raw} {start_date[:5]}".strip()
                await page.fill("input[placeholder*='Group Name'], input[name='group_name']", formatted_group_name)
                await page.click("button:has-text('Create Group')")
                await page.wait_for_timeout(2000)

                # Bulk Import
                await page.click("text=BULK IMPORT")
                await page.wait_for_timeout(1000)

                group_dropdown = page.locator("//div[contains(., 'Groups') and contains(@class, 'select')] | //select").first
                await group_dropdown.click()
                await page.locator(f"text={formatted_group_name}").first.click()
                await page.wait_for_timeout(500)

                # Students
                if student_emails:
                    role_dropdown = page.locator("//div[contains(., 'Assign Role') and contains(@class, 'select')] | //select").last
                    await role_dropdown.click()
                    await page.locator("text=Student").last.click()

                    students_text = "\n".join(student_emails)
                    await page.fill("textarea[placeholder*='Paste user data'], textarea", students_text)
                    await page.click("button:has-text('Import and Enroll Users')")
                    await page.wait_for_timeout(4000)

                # Teachers
                if teacher_emails:
                    role_dropdown = page.locator("//div[contains(., 'Assign Role') and contains(@class, 'select')] | //select").last
                    await role_dropdown.click()
                    await page.locator("text=Teacher").last.click()

                    teachers_text = "\n".join(teacher_emails)
                    await page.fill("textarea[placeholder*='Paste user data'], textarea", teachers_text)
                    await page.click("button:has-text('Import and Enroll Users')")
                    await page.wait_for_timeout(3000)

                await page.click("button:has-text('Close')")
                await page.wait_for_timeout(1000)

                return {
                    "status": "success",
                    "group_name": formatted_group_name,
                    "enrolled_students": len(student_emails),
                    "enrolled_teachers": len(teacher_emails)
                }

            except Exception as e:
                logger.error(f"❌ Lỗi School Enroll Users: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 7. BULK ACCOUNT CREATION (TẠO TÀI KHOẢN HỌC SINH/GV HÀNG LOẠT)
    # =========================================================================
    async def submit_account_creation_batch(
        self,
        credentials: Dict[str, str],
        upload_file_path: str,
        record_count: int
    ) -> Dict[str, Any]:
        """Upload file lên School Workspace, lấy Request ID từ MuiDataGrid và tắt browser."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📤 Đang mở trang: /school-workspace/account-creation/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("input[type='file']", timeout=15000)

                file_input = page.locator("input[type='file']")
                await file_input.set_input_files(upload_file_path)
                logger.info("📁 Đã nạp file accounts.xlsx, chờ bảng preview load...")
                await page.wait_for_timeout(3000)

                upload_btn = page.locator("//button[normalize-space()='Upload']")
                await upload_btn.wait_for(state="visible", timeout=10000)
                await upload_btn.click()
                logger.info("🚀 Đã bấm nút Upload thành công! Đang chờ chuyển trang...")

                try:
                    await page.wait_for_function("() => !window.location.href.includes('/create')", timeout=30000)
                except Exception:
                    pass

                if "account-creation" not in page.url:
                    await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation", wait_until="domcontentloaded", timeout=30000)

                await page.wait_for_selector(".MuiDataGrid-row, [role='row']", timeout=25000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                request_id = await first_row.get_attribute("data-id")
                
                if not request_id:
                    id_cell = first_row.locator("[data-field='id'] .MuiDataGrid-cellContent").first
                    request_id = (await id_cell.inner_text()).strip()

                wait_seconds = record_count * 40
                logger.info(f"🎉 BẮT ĐƯỢC REQUEST ID MỚI: [ #{request_id} ]")

                return {
                    "status": "submitted",
                    "request_id": request_id,
                    "record_count": record_count,
                    "estimated_wait_seconds": wait_seconds
                }

            except Exception as e:
                logger.error(f"❌ Lỗi submit batch: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    async def check_and_export_batch_result(
        self,
        credentials: Dict[str, str],
        request_id: str,
        download_dir: str
    ) -> Dict[str, Any]:
        """Vào bảng MuiDataGrid kiểm tra Request ID. Nếu Done thì bấm icon menu và click Export."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)

                target_row = page.locator(f".MuiDataGrid-row[data-id='{request_id}'], .MuiDataGrid-row:has([data-field='id']:has-text('{request_id}'))").first
                if await target_row.count() == 0:
                    return {"status": "not_found", "error": f"Không tìm thấy Request #{request_id}"}

                status_cell = target_row.locator("[data-field='status'] .MuiDataGrid-cellContent").first
                status_text = (await status_cell.inner_text()).strip()

                if "done" in status_text.lower() or "completed" in status_text.lower() or "success" in status_text.lower():
                    logger.info(f"🎉 Request #{request_id} đã Done! Đang bấm Menu Actions để tải file...")
                    
                    action_btn = target_row.locator("[data-field='actions'] button").first
                    await action_btn.click()
                    await page.wait_for_timeout(1000)

                    async with page.expect_download() as download_info:
                        export_item = page.locator("text=Export, li:has-text('Export')").first
                        await export_item.click()

                    download = await download_info.value
                    download_file_path = os.path.join(download_dir, f"RESULT_{request_id}_{download.suggested_filename}")
                    await download.save_as(download_file_path)

                    return {
                        "status": "completed",
                        "request_id": request_id,
                        "result_file_path": download_file_path
                    }
                else:
                    return {
                        "status": "still_processing",
                        "current_status": status_text,
                        "request_id": request_id
                    }

            except Exception as e:
                logger.error(f"❌ Lỗi khi kiểm tra Request #{request_id}: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()


workspace_playwright_service = WorkspacePlaywrightService()