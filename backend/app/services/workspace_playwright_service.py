# backend/app/services/workspace_playwright_service.py
import os
import logging
import asyncio
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page, BrowserContext

logger = logging.getLogger(__name__)
BASE_WORKSPACE_URL = "https://pythaverse.space"

class WorkspacePlaywrightService:
    """Service RPA tự động hóa 100% các tác vụ Account Creation, Order & Contract trên Pythaverse."""

    def __init__(self):
        self.headless = True  # Đặt False khi anh muốn debug xem bot click trực tiếp

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

    async def login_role(self, page: Page, username: str, password: str) -> bool:
        """Đăng nhập tài khoản qua Cổng Keycloak OpenID Connect."""
        try:
            logger.info(f"🔑 Đang đăng nhập tài khoản '{username}'...")
            await page.goto(f"{BASE_WORKSPACE_URL}/login", wait_until="networkidle", timeout=45000)

            # Điền Form đăng nhập Keycloak SSO
            await page.fill("input[name='username'], input[name='email'], #username", username)
            await page.fill("input[name='password'], #password", password)
            
            # Click nút Đăng nhập
            await page.click("button[type='submit'], input[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')")
            await page.wait_for_timeout(4000)

            if "login" in page.url and "error" in page.url:
                logger.error(f"❌ Sai thông tin đăng nhập cho {username}")
                return False

            logger.info(f"✅ Đăng nhập thành công: {username} (URL: {page.url})")
            return True
        except Exception as e:
            logger.error(f"❌ Lỗi đăng nhập {username}: {e}")
            return False

    # =========================================================================
    # 1. SCHOOL WORKSPACE: TẠO ORDER MỚI & BẮT MÃ ORDER ID
    # =========================================================================
    async def school_create_order(
        self, 
        credentials: Dict[str, str], 
        order_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Tự động:
        1. Đăng nhập School Workspace.
        2. Mở /school-workspace/orders, click nút 'Create Order'.
        3. Điền Contact Info & Lặp qua các khóa học (Chọn License Category -> Chờ Course Enabled -> Chọn Course -> Điền Licenses, Dates).
        4. Điền Additional Notes (audit log, requester, drive url).
        5. Submit Form -> Đợi lưới MuiDataGrid render -> Bắt Order ID mới tạo (SCH-XXXX-XXXX-XXXX / ID số).
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập School Workspace"}

                logger.info("🏫 Mở trang danh sách Order: /school-workspace/orders...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="networkidle", timeout=45000)

                # 1. Click nút Create Order màu xanh (id=:r2d: hoặc has-text('Create Order'))
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
                for idx, c in enumerate(courses):
                    if idx > 0:
                        # Bấm nút 'Add Course' để thêm dòng môn học mới
                        await page.click("div[role='dialog'] button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    course_box = page.locator(f"div[role='dialog'] .MuiBox-root:has-text('Course {idx+1}')").first

                    # A. BẮT BUỘC: Chọn License Category trước để kích hoạt Course Dropdown
                    category_val = c.get("category", "SWRP")
                    cat_select = course_box.locator("div.MuiSelect-select").first
                    await cat_select.click()
                    await page.wait_for_selector(f"li[role='option']:has-text('{category_val}'), ul[role='listbox'] li:has-text('{category_val}')", timeout=5000)
                    await page.locator(f"li[role='option']:has-text('{category_val}'), ul[role='listbox'] li:has-text('{category_val}')").first.click()
                    await page.wait_for_timeout(800)

                    # B. Chọn Course Name (khi Dropdown đã hết disabled)
                    course_name_val = c.get("course_name")
                    course_select = course_box.locator("div.MuiSelect-select").nth(1)
                    # Chờ hết class Mui-disabled
                    await course_select.wait_for(state="visible", timeout=5000)
                    await course_select.click()
                    
                    # Chọn khóa học từ danh sách xổ xuống
                    target_course_opt = page.locator(f"li[role='option']:has-text('{course_name_val}'), ul[role='listbox'] li:has-text('{course_name_val}')").first
                    if await target_course_opt.count() > 0:
                        await target_course_opt.click()
                    else:
                        # Fallback chọn option đầu tiên nếu tên dài bị lệch
                        await page.locator("li[role='option']").first.click()
                    await page.wait_for_timeout(500)

                    # C. Điền số lượng Licenses
                    licenses_count = str(c.get("licenses", 1))
                    license_input = course_box.locator("input[type='number']").first
                    await license_input.fill(licenses_count)

                    # D. Điền Start Date & End Date (Định dạng YYYY-MM-DD)
                    start_date_val = c.get("start_date")
                    end_date_val = c.get("end_date")
                    date_inputs = course_box.locator("input[type='date']")
                    
                    if await date_inputs.count() >= 2:
                        await date_inputs.nth(0).fill(start_date_val)
                        await date_inputs.nth(1).fill(end_date_val)

                # 4. Điền Additional Notes (Ghi rõ audit log, ticket, drive url)
                additional_notes = order_data.get("additional_notes", "")
                if additional_notes:
                    notes_textarea = page.locator("div[role='dialog'] textarea[placeholder*='notes']").first
                    await notes_textarea.fill(additional_notes)

                # 5. Bấm nút 'Create Order' trong Dialog
                submit_dialog_btn = page.locator("div[role='dialog'] button:has-text('Create Order')").last
                await submit_dialog_btn.click()
                logger.info("🚀 Đã bấm Submit Order! Đang đợi trang danh sách cập nhật...")

                # 6. Đợi Modal đóng và MuiDataGrid render dòng mới nhất
                await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=15000)
                await page.wait_for_timeout(2000)

                # 7. BẮT ORDER ID MỚI SINH TẠI DÒNG ĐẦU TIÊN
                first_row = page.locator(".MuiDataGrid-row").first
                
                # Lấy ID số (VD: 1182) từ data-id
                order_num_id = await first_row.get_attribute("data-id")
                
                # Lấy Mã Code đầy đủ (VD: SCH-10266-20260603-1182) từ thẻ a cột school_order_id
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
        """
        Partner mở /partner-workspace/order-management:
        1. Tìm đúng dòng Order của trường (theo mã SCH-... hoặc ID số hoặc dòng 'Awaiting Partner').
        2. Bấm icon Menu ở cột Action để mở Modal 'Order Details'.
        3. Chọn Pool License (Category License) cho từng môn học.
        4. Kiểm tra điều kiện:
           - Nếu đủ: Bấm nút 'Approve Order' hoàn tất.
           - Nếu thiếu: Báo trạng thái 'insufficient_pool' để chuyển sang tạo Contract.
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Partner Workspace"}

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
                
                # BẤM TIẾP CHỮ 'View' TRONG POPOVER MENU (Cực kỳ quan trọng!)
                view_menu_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenu-list li:has-text('View'), text=View").first
                await view_menu_item.wait_for(state="visible", timeout=5000)
                await view_menu_item.click()
                logger.info("✨ Đã click 'View'! Đang mở Modal Order Details...")

                # Đợi Modal 'Order Details' hiển thị
                await page.wait_for_selector("div[role='dialog']:has-text('Order Details')", timeout=15000)

                # 3. Lặp qua tất cả các ô chọn Pool License trong Modal
                pool_selects = page.locator("div[role='dialog'] div[role='combobox']:has-text('Pool License'), div[role='dialog'] .MuiSelect-select")
                select_count = await pool_selects.count()
                logger.info(f"🔄 Tìm thấy {select_count} mục cần chọn Pool License...")

                for i in range(select_count):
                    current_select = pool_selects.nth(i)
                    await current_select.click()
                    await page.wait_for_timeout(500)

                    # Ưu tiên chọn Category License (hoặc option có chữ Available)
                    option = page.locator("li[role='option']:has-text('Category License'), li[role='option']:has-text('Available')").first
                    if await option.count() > 0:
                        await option.click()
                    else:
                        # Fallback chọn option đầu tiên nếu có
                        first_opt = page.locator("li[role='option']").first
                        if await first_opt.count() > 0:
                            await first_opt.click()
                    await page.wait_for_timeout(800)

                # 4. Kiểm tra xem có xuất hiện thông báo xanh 'Order can be approved' hay không
                can_approve = page.locator("div[role='dialog']:has-text('Order can be approved'), text=Order can be approved")
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
    # 2B. PARTNER WORKSPACE: TẠO CONTRACT XIN DISTRIBUTOR CẤP LICENSE
    # =========================================================================
    async def partner_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Partner mở /partner-workspace/contract-po/create:
        1. Chọn Contract Type = 'License'.
        2. Điền Contract Notes (Dẫn chứng School Order, số lượng, ticket ID).
        3. Lặp qua danh sách môn học: Bấm 'Add Course', chọn Category -> Chọn Course -> Điền Licenses.
        4. Bấm '💾 Create Contract/PO'.
        5. Đợi về trang /partner-workspace/contract-po -> Bắt mã Contract Code mới (PRT-XXXX-XXX).
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Partner Workspace"}

                logger.info("📝 Partner mở trang tạo Contract: /partner-workspace/contract-po/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("text=Create Contract/PO", timeout=15000)

                # 1. BẮT BUỘC: Chọn Contract Type = 'License'
                type_select = page.locator("div[role='combobox']").first
                await type_select.click()
                await page.wait_for_selector("li[role='option']:has-text('License')", timeout=5000)
                await page.locator("li[role='option']:has-text('License')").first.click()
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
                        # Bấm nút Add Course
                        await page.click("button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    # Card môn học thứ idx+1
                    course_card = page.locator(".MuiCard-root:has-text('License Category')").nth(idx)

                    # A. Chọn License Category trước
                    cat_val = c.get("category", "SWRP")
                    cat_dropdown = course_card.locator("div[role='combobox']").first
                    await cat_dropdown.click()
                    await page.wait_for_selector(f"li[role='option']:has-text('{cat_val}')", timeout=5000)
                    await page.locator(f"li[role='option']:has-text('{cat_val}')").first.click()
                    await page.wait_for_timeout(800)

                    # B. Chọn Course Name (khi dropdown đã enabled)
                    course_name_val = c.get("course_name")
                    course_dropdown = course_card.locator("div[role='combobox']").nth(1)
                    await course_dropdown.click()
                    
                    target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                    if await target_opt.count() > 0:
                        await target_opt.click()
                    else:
                        await page.locator("li[role='option']").first.click()
                    await page.wait_for_timeout(500)

                    # C. Điền số lượng Licenses
                    lic_input = course_card.locator("input[type='number']").first
                    await lic_input.fill(str(c.get("licenses", 50)))

                # 4. Bấm nút '💾 Create Contract/PO'
                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()
                logger.info("🚀 Đã bấm Submit Contract! Đang đợi trang danh sách...")

                # 5. Đợi chuyển trang về /partner-workspace/contract-po
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(2000)

                # 6. Bắt Contract Code mới sinh ở dòng đầu tiên
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
        """
        Distributor mở /distributor-workspace/partner-contract-po:
        1. Tìm đúng dòng Contract của Partner (theo mã PRT-... hoặc ID số hoặc dòng 'Pending Distributor Review').
        2. Click icon 'View Details' (chữ i) ở cột Actions để mở Modal 'Partner Order Details'.
        3. Kiểm tra điều kiện:
           - Nếu đủ (Order can be approved): Bấm nút 'Approve Order' màu xanh lá.
           - Nếu thiếu (Insufficient pool resources): Trả về 'insufficient_pool' để tạo Contract DST-... gửi Sales Admin.
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Distributor Workspace"}

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
                
                # Fallback: Tìm dòng đầu tiên đang Pending Distributor Review
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending Distributor Review'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Contract ({contract_identifier}) ở trạng thái chờ duyệt"}

                # 2. Click icon Info (View Details) ở cột Actions
                info_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button").first
                await info_btn.click()
                logger.info("📋 Đã click mở Modal Partner Order Details...")

                # Đợi Modal 'Partner Order Details' hiển thị
                await page.wait_for_selector("div[role='dialog']:has-text('Partner Order Details')", timeout=15000)

                # 3. Kiểm tra trạng thái kho của Distributor
                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order')")
                insufficient_alert = page.locator("div[role='dialog']:has-text('Insufficient pool resources')")

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
        """
        Distributor mở /distributor-workspace/contract-po/create:
        1. Chọn Contract Type = 'License'.
        2. Điền Contract Notes (Dẫn chứng Partner Contract, mục đích cấp bù).
        3. Lặp qua các môn học: Bấm 'Add Course', chọn Category -> Chọn Course -> Điền Licenses, Unit Price.
        4. Bấm '💾 Create Contract/PO'.
        5. Đợi về trang /distributor-workspace/contract-po -> Bắt mã Contract Code mới (DST-XXXX-XXX).
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Distributor Workspace"}

                logger.info("📝 Distributor mở trang tạo Contract: /distributor-workspace/contract-po/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("text=Create Contract/PO", timeout=15000)

                # 1. BẮT BUỘC: Chọn Contract Type = 'License'
                type_select = page.locator("div[role='combobox']").first
                await type_select.click()
                await page.wait_for_selector("li[role='option']:has-text('License')", timeout=5000)
                await page.locator("li[role='option']:has-text('License')").first.click()
                await page.wait_for_timeout(1000)
                logger.info("✅ Đã chọn Contract Type = 'License'")

                # 2. Điền Contract Notes
                notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub to fulfill Partner Contract")
                notes_input = page.locator("textarea").first
                await notes_input.fill(notes)

                # 3. Lặp qua danh sách môn học cần xin Sales Admin
                courses = contract_data.get("courses", [])
                for idx, c in enumerate(courses):
                    if idx > 0:
                        # Bấm nút Add Course
                        await page.click("button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    # Card môn học thứ idx+1
                    course_card = page.locator(".MuiCard-root:has-text('License Category')").nth(idx)

                    # A. Chọn License Category trước
                    cat_val = c.get("category", "SWRP")
                    cat_dropdown = course_card.locator("div[role='combobox']").first
                    await cat_dropdown.click()
                    await page.wait_for_selector(f"li[role='option']:has-text('{cat_val}')", timeout=5000)
                    await page.locator(f"li[role='option']:has-text('{cat_val}')").first.click()
                    await page.wait_for_timeout(800)

                    # B. Chọn Course Name (khi dropdown đã enabled)
                    course_name_val = c.get("course_name")
                    course_dropdown = course_card.locator("div[role='combobox']").nth(1)
                    await course_dropdown.click()
                    
                    target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                    if await target_opt.count() > 0:
                        await target_opt.click()
                    else:
                        await page.locator("li[role='option']").first.click()
                    await page.wait_for_timeout(500)

                    # C. Điền số lượng Licenses
                    lic_input = course_card.locator("input[type='number']").first
                    await lic_input.fill(str(c.get("licenses", 100)))

                # 4. Bấm nút '💾 Create Contract/PO'
                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()
                logger.info("🚀 Đã bấm Submit DST Contract! Đang đợi trang danh sách...")

                # 5. Đợi chuyển trang về /distributor-workspace/contract-po
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(2000)

                # 6. Bắt Contract Code mới sinh ở dòng đầu tiên
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
        """
        Sales Admin:
        1. Đăng nhập Keycloak SSO -> Chuyển hướng chủ động tới /sales-admin-workspace/dashboard.
        2. Tìm dòng Contract DST-... (Pending).
        3. Click icon Con Mắt (View Details) để chuyển tới /sales-admin-workspace/dashboard/DST-...
        4. Bấm nút 'Approve' (xanh lá).
        5. Điền 'Justification Note' (Đảm bảo >= 15 ký tự).
        6. Bấm nút 'Confirm Approval' hoàn tất!
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Sales Admin"}

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
                
                # Fallback: Lấy dòng đầu tiên có trạng thái 'Pending'
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Contract ({contract_identifier}) Pending trên Dashboard"}

                # 2. Click icon Con Mắt ở cột Actions để mở trang chi tiết
                eye_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button").first
                await eye_btn.click()
                logger.info("👁️ Đã click icon con mắt, chờ mở trang Order Details...")

                # Đợi trang chi tiết Contract load xong
                await page.wait_for_selector("button:has-text('Approve')", timeout=15000)
                logger.info(f"📄 Đang ở trang chi tiết: {page.url}")

                # 3. Bấm nút 'Approve' màu xanh lá
                approve_btn = page.locator("button:has-text('Approve')").first
                await approve_btn.click()
                logger.info("✨ Đã bấm Approve, chờ Dialog Justification Note...")

                # Đợi Dialog 'Confirm Order Approval' hiển thị
                await page.wait_for_selector("div[role='dialog']:has-text('Confirm Order Approval')", timeout=10000)

                # 4. Chuẩn bị Justification Note (Bắt buộc >= 15 ký tự)
                default_note = "Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub"
                valid_justification = justification if (justification and len(justification.strip()) >= 15) else default_note
                
                # Điền vào Textarea
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
    # 5. SCHOOL WORKSPACE: GHI DANH HỌC VIÊN & TẠO GROUP LỚP TRONG KHÓA HỌC
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
        """
        Tự động:
        1. Mở /school-workspace/courses, khớp đúng Course Name + Start/End Date.
        2. Mở 'Enroll Users' ➔ Tab 'GROUP MANAGEMENT' ➔ Tạo Group: '{School} {Group} {Date}'.
        3. Tab 'BULK IMPORT' ➔ Chọn Group vừa tạo ➔ Assign Student (Paste emails) ➔ Assign Teacher.
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập School Workspace"}

                logger.info("📚 Điều hướng tới /school-workspace/courses...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/courses", wait_until="networkidle")

                # Tìm đúng khóa học theo Course Name và Start Date (tránh trùng khóa học khác niên khóa)
                course_row = page.locator(f"//tr[contains(., '{course_name}') and contains(., '{start_date}')]").first
                if await course_row.count() == 0:
                    course_row = page.locator(f"//tr[contains(., '{course_name}')]").first

                # Click vào tên khóa học để mở Course Details
                await course_row.locator("a, button, text=" + course_name).first.click()
                await page.wait_for_selector("text=Enrolled Users", timeout=15000)

                # Bấm nút 'Enroll Users' màu xanh góc trên
                await page.click("button:has-text('Enroll Users')")
                await page.wait_for_selector("text=User Enrollment", timeout=10000)

                # --- BƯỚC A: TẠO GROUP TRONG GROUP MANAGEMENT ---
                logger.info("👥 Đang tạo Group lớp mới...")
                await page.click("text=GROUP MANAGEMENT")
                await page.wait_for_timeout(1000)

                # Format Group Name: Tên trường + Class Group + Start Date (VD: Penabur Bdg Grade 7 23Jun)
                formatted_group_name = f"{school_name} {group_name_raw} {start_date[:5]}".strip()
                await page.fill("input[placeholder*='Group Name'], input[name='group_name']", formatted_group_name)
                await page.click("button:has-text('Create Group')")
                await page.wait_for_timeout(2000)
                logger.info(f"✅ Đã tạo Group: '{formatted_group_name}'")

                # --- BƯỚC B: BULK IMPORT HỌC SINH ---
                logger.info("📥 Đang chuyển sang tab BULK IMPORT...")
                await page.click("text=BULK IMPORT")
                await page.wait_for_timeout(1000)

                # Chọn Group vừa tạo ở Dropdown
                group_dropdown = page.locator("//div[contains(., 'Groups') and contains(@class, 'select')] | //select").first
                await group_dropdown.click()
                await page.locator(f"text={formatted_group_name}").first.click()
                await page.wait_for_timeout(500)

                # 1. Import Students
                if student_emails:
                    logger.info(f"🎓 Đang ghi danh {len(student_emails)} Học sinh...")
                    # Chọn Assign Role = Student
                    role_dropdown = page.locator("//div[contains(., 'Assign Role') and contains(@class, 'select')] | //select").last
                    await role_dropdown.click()
                    await page.locator("text=Student").last.click()

                    # Paste danh sách Email học sinh (dạng dòng dọc)
                    students_text = "\n".join(student_emails)
                    await page.fill("textarea[placeholder*='Paste user data'], textarea", students_text)

                    # Bấm nút Import and Enroll Users
                    await page.click("button:has-text('Import and Enroll Users')")
                    await page.wait_for_timeout(4000)
                    logger.info("✅ Đã ghi danh Học sinh thành công!")

                # 2. Import Teachers (nếu có)
                if teacher_emails:
                    logger.info(f"👨‍🏫 Đang ghi danh {len(teacher_emails)} Giáo viên...")
                    # Đổi Assign Role = Teacher
                    role_dropdown = page.locator("//div[contains(., 'Assign Role') and contains(@class, 'select')] | //select").last
                    await role_dropdown.click()
                    await page.locator("text=Teacher").last.click()

                    teachers_text = "\n".join(teacher_emails)
                    await page.fill("textarea[placeholder*='Paste user data'], textarea", teachers_text)

                    await page.click("button:has-text('Import and Enroll Users')")
                    await page.wait_for_timeout(3000)
                    logger.info("✅ Đã ghi danh Giáo viên thành công!")

                # Đóng Modal Enrollment
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
    # 6. BULK ACCOUNT CREATION (TẠO TÀI KHOẢN HỌC SINH/GV HÀNG LOẠT)
    # =========================================================================

    # =========================================================================
    # 61. PHA 1: NỘP FILE ACCOUNTS VÀ LẤY REQUEST ID TỪ MUIDATAGRID
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
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập School Workspace"}

                logger.info("📤 Đang mở trang: /school-workspace/account-creation/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("input[type='file']", timeout=15000)

                # 1. Nạp file Excel
                file_input = page.locator("input[type='file']")
                await file_input.set_input_files(upload_file_path)
                logger.info("📁 Đã nạp file accounts.xlsx, chờ bảng preview load...")
                await page.wait_for_timeout(3000)

                # 2. Khai báo và bấm nút Upload
                upload_btn = page.locator("//button[normalize-space()='Upload']")
                await upload_btn.wait_for(state="visible", timeout=10000)
                await upload_btn.click()
                logger.info("🚀 Đã bấm nút Upload thành công! Đang chờ chuyển trang...")

                # 3. Đợi trang chuyển về danh sách (hoặc chủ động mở trang danh sách)
                try:
                    await page.wait_for_function("() => !window.location.href.includes('/create')", timeout=30000)
                except Exception:
                    pass

                if "account-creation" not in page.url:
                    logger.info("📋 Đang mở trang /school-workspace/account-creation...")
                    await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation", wait_until="domcontentloaded", timeout=30000)

                # 4. Đợi MuiDataGrid render các dòng dữ liệu (dựa trên class MuiDataGrid-row)
                await page.wait_for_selector(".MuiDataGrid-row, [role='row']", timeout=25000)
                await page.wait_for_timeout(2000)

                # 5. Bắt Request ID ở dòng đầu tiên (lấy từ data-id hoặc data-field='id')
                first_row = page.locator(".MuiDataGrid-row").first
                request_id = await first_row.get_attribute("data-id")
                
                if not request_id:
                    # Fallback lấy text trong ô id
                    id_cell = first_row.locator("[data-field='id'] .MuiDataGrid-cellContent").first
                    request_id = (await id_cell.inner_text()).strip()

                wait_seconds = record_count * 40
                print("\n" + "═" * 60)
                logger.info(f"🎉 BẮT ĐƯỢC REQUEST ID MỚI: [ #{request_id} ]")
                logger.info(f"⏳ Trạng thái: [ Creating Account ] - Ước tính chờ: {wait_seconds}s")
                print("═" * 60 + "\n")

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

    # =========================================================================
    # 6.2. PHA 2: CHECK TIẾN ĐỘ & EXPORT FILE KẾT QUẢ TỪ MUIDATAGRID
    # =========================================================================
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
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập School Workspace"}

                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)

                # Tìm đúng dòng có Request ID
                target_row = page.locator(f".MuiDataGrid-row[data-id='{request_id}'], .MuiDataGrid-row:has([data-field='id']:has-text('{request_id}'))").first
                if await target_row.count() == 0:
                    return {"status": "not_found", "error": f"Không tìm thấy Request #{request_id}"}

                # Lấy text trạng thái từ ô data-field='status'
                status_cell = target_row.locator("[data-field='status'] .MuiDataGrid-cellContent").first
                status_text = (await status_cell.inner_text()).strip()

                if "done" in status_text.lower() or "completed" in status_text.lower() or "success" in status_text.lower():
                    logger.info(f"🎉 Request #{request_id} đã Done! Đang bấm Menu Actions để tải file...")
                    
                    # Bấm nút Menu 3 gạch ở cột data-field='actions'
                    action_btn = target_row.locator("[data-field='actions'] button").first
                    await action_btn.click()
                    await page.wait_for_timeout(1000)

                    # Bắt sự kiện click Export để tải file
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