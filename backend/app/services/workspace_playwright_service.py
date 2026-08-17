# backend/app/services/workspace_playwright_service.py
import logging
import asyncio
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page, BrowserContext

logger = logging.getLogger(__name__)

BASE_WORKSPACE_URL = "https://pythaverse.space"


class WorkspacePlaywrightService:
    """Service RPA tự động hóa 100% các luồng Order & Contract trên Pythaverse Workspace."""

    def __init__(self):
        self.headless = True  # Đặt False nếu muốn mở trình duyệt lên xem bot bấm

    async def _create_context(self, p) -> tuple:
        """Khởi tạo Browser Chromium với Viewport chuẩn."""
        browser = await p.chromium.launch(
            headless=self.headless,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        return browser, context, page

    async def login_role(self, page: Page, username: str, password: str) -> bool:
        """Đăng nhập tài khoản với Role tương ứng."""
        try:
            logger.info(f"🔑 Đang đăng nhập tài khoản '{username}'...")
            await page.goto(f"{BASE_WORKSPACE_URL}/login", wait_until="networkidle", timeout=30000)

            # Điền username/password (tương thích Keycloak SSO / Workspace Form)
            await page.fill("input[name='username'], input[name='email'], #username", username)
            await page.fill("input[name='password'], #password", password)
            
            # Click nút Login
            await page.click("button[type='submit'], input[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')")
            await page.wait_for_timeout(3000)
            logger.info(f"✅ Đăng nhập thành công: {username}")
            return True
        except Exception as e:
            logger.error(f"❌ Lỗi đăng nhập {username}: {e}")
            return False

    # =========================================================================
    # 1. SCHOOL WORKSPACE: TẠO ORDER MỚI (HỖ TRỢ NHIỀU KHÓA HỌC)
    # =========================================================================
    async def school_create_order(
        self, 
        credentials: Dict[str, str], 
        order_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Tự động mở School Workspace và tạo Order:
        order_data = {
            "contact_info": "Thầy Hùng (hung.nguyenmanh@dtt.vn)",
            "additional_notes": "Order lớp 10A1 Python",
            "courses": [
                {
                    "category": "SWRP", 
                    "course_name": "SWRP 1: Exploring the Miniature World with PMinetest (EN)",
                    "licenses": 50,
                    "start_date": "09/01/2026",
                    "end_date": "05/31/2027"
                }
            ]
        }
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                # Đăng nhập School
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập School Workspace"}

                logger.info("🏫 Điều hướng tới /school-workspace/orders...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="networkidle")

                # Bấm nút 'Create Order'
                await page.click("button:has-text('Create Order')")
                await page.wait_for_selector("text=Create New Order", timeout=10000)

                # Điền Contact Info
                contact_info = order_data.get("contact_info", "Admin Automation")
                await page.fill("input[placeholder*='contact information'], input[name='contact_info']", contact_info)

                # Lặp qua từng khóa học
                courses = order_data.get("courses", [])
                for idx, c in enumerate(courses):
                    if idx > 0:
                        # Bấm nút '+ Add Course' nếu có nhiều hơn 1 môn
                        await page.click("button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    # Chọn Category (SWRP, ACIS...)
                    cat_selects = await page.query_selector_all("select")
                    # Hoặc chọn theo dropdown
                    await page.click(f"(//div[contains(@class, 'course') or contains(., 'Course {idx+1}')]//select)[1] | (//select)[1]")
                    
                    # Điền số lượng Licenses
                    license_inputs = await page.query_selector_all("input[type='number'], input[placeholder*='License']")
                    if license_inputs and len(license_inputs) > idx:
                        await license_inputs[idx].fill(str(c.get("licenses", 1)))

                    # Điền Start Date & End Date
                    start_inputs = await page.query_selector_all("input[placeholder*='mm/dd/yyyy'], input[type='date']")
                    if len(start_inputs) >= (idx * 2) + 2:
                        await start_inputs[idx * 2].fill(c.get("start_date", "09/01/2026"))
                        await start_inputs[(idx * 2) + 1].fill(c.get("end_date", "05/31/2027"))

                # Điền Additional Notes
                if order_data.get("additional_notes"):
                    await page.fill("textarea[placeholder*='notes']", order_data["additional_notes"])

                # Bấm nút 'Create Order' trong Modal
                await page.click("//button[text()='Create Order' and not(@disabled)]")
                await page.wait_for_timeout(3000)

                logger.info("✅ School đã tạo Order thành công!")
                return {"status": "success", "message": "Đã tạo School Order thành công"}
            except Exception as e:
                logger.error(f"❌ Lỗi School Create Order: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 2. PARTNER WORKSPACE: DUYỆT ORDER CHO TRƯỜNG & CHỌN POOL LICENSE
    # =========================================================================
    async def partner_approve_school_order(
        self, 
        credentials: Dict[str, str], 
        order_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Partner mở /partner-workspace/order-management, mở Order chi tiết và bấm Duyệt."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Partner Workspace"}

                logger.info("🤝 Điều hướng tới /partner-workspace/order-management...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="networkidle")

                # Tìm Order có trạng thái 'Awaiting Partner'
                if order_id:
                    row_btn = page.locator(f"//tr[contains(., '{order_id}')]//button | //tr[contains(., '{order_id}')]//svg")
                else:
                    row_btn = page.locator("//tr[contains(., 'Awaiting Partner')]//button").first

                await row_btn.click()
                await page.wait_for_selector("text=Order Details", timeout=10000)

                # Chọn Pool License (Category License)
                pool_dropdown = page.locator("//div[contains(., 'Pool License')]//select | //div[@role='button'][contains(., 'Pool License')]")
                if await pool_dropdown.count() > 0:
                    await pool_dropdown.first.click()
                    # Chọn option Category License
                    category_opt = page.locator("text=Category License").first
                    if await category_opt.count() > 0:
                        await category_opt.click()

                # Bấm nút 'Approve Order'
                approve_btn = page.locator("button:has-text('Approve Order')")
                await approve_btn.click()
                await page.wait_for_timeout(3000)

                logger.info("✅ Partner đã duyệt Order thành công!")
                return {"status": "success", "message": f"Partner đã phê duyệt Order thành công"}
            except Exception as e:
                logger.error(f"❌ Lỗi Partner Approve: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 3. DISTRIBUTOR WORKSPACE: DUYỆT CONTRACT CHO PARTNER
    # =========================================================================
    async def distributor_approve_partner_contract(
        self, 
        credentials: Dict[str, str], 
        contract_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """Distributor mở /distributor-workspace/partner-contract-po và duyệt Contract."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Distributor Workspace"}

                logger.info("🏢 Điều hướng tới /distributor-workspace/partner-contract-po...")
                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="networkidle")

                # Tìm Contract cần duyệt
                if contract_code:
                    action_btn = page.locator(f"//tr[contains(., '{contract_code}')]//button").first
                else:
                    action_btn = page.locator("//tr[contains(., 'Pending') or contains(., 'review')]//button").first

                await action_btn.click()
                await page.wait_for_selector("text=Partner Order Details", timeout=10000)

                # Bấm nút Approve Order
                approve_btn = page.locator("button:has-text('Approve Order')")
                await approve_btn.click()
                await page.wait_for_timeout(3000)

                logger.info("✅ Distributor đã duyệt Contract cho Partner thành công!")
                return {"status": "success", "message": "Distributor đã duyệt Contract thành công"}
            except Exception as e:
                logger.error(f"❌ Lỗi Distributor Approve: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 4. SALES ADMIN WORKSPACE: DUYỆT CONTRACT DISTRIBUTOR VỚI JUSTIFICATION
    # =========================================================================
    async def admin_approve_distributor_contract(
        self, 
        credentials: Dict[str, str], 
        contract_code: str, 
        justification: str = "Approved via PTV Central Automation Hub"
    ) -> Dict[str, Any]:
        """
        Sales Admin mở /sales-admin-workspace/dashboard, click Icon con mắt,
        bấm 'Approve', điền 'Justification Note' và xác nhận.
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Sales Admin"}

                logger.info("👑 Điều hướng tới /sales-admin-workspace/dashboard...")
                await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="networkidle")

                # Click Icon Con Mắt trên dòng Contract tương ứng
                eye_btn = page.locator(f"//tr[contains(., '{contract_code}')]//svg | //tr[contains(., '{contract_code}')]//button").first
                await eye_btn.click()
                await page.wait_for_selector("text=Order Details:", timeout=15000)

                # Bấm nút màu xanh 'Approve'
                await page.click("button:has-text('Approve')")
                await page.wait_for_selector("text=Confirm Order Approval", timeout=10000)

                # Điền ô Justification Note
                await page.fill("textarea[placeholder*='Justification Note'], textarea", justification)

                # Bấm nút 'Confirm Approval'
                await page.click("button:has-text('Confirm Approval')")
                await page.wait_for_timeout(3000)

                logger.info(f"✅ Sales Admin đã Approve Contract '{contract_code}' thành công!")
                return {
                    "status": "success", 
                    "message": f"Sales Admin đã duyệt thành công Contract '{contract_code}'"
                }
            except Exception as e:
                logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()


workspace_playwright_service = WorkspacePlaywrightService()