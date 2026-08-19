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
    # 1. SCHOOL WORKSPACE: TẠO ORDER MỚI CHO NHIỀU MÔN HỌC
    # =========================================================================
    async def school_create_order(
        self, 
        credentials: Dict[str, str], 
        order_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Tự động mở School Workspace và điền Form Create New Order."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập School Workspace"}

                logger.info("🏫 Mở /school-workspace/orders...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="networkidle")

                # Bấm nút 'Create Order' màu xanh
                await page.click("button:has-text('Create Order')")
                await page.wait_for_selector("text=Create New Order", timeout=10000)

                # Điền Contact Info
                contact_info = order_data.get("contact_info", "Admin Automation Hub (operation@pythaverse.space)")
                await page.fill("input[placeholder*='contact information'], input[name='contact_info']", contact_info)

                # Lặp qua từng khóa học đăng ký
                courses = order_data.get("courses", [])
                for idx, c in enumerate(courses):
                    if idx > 0:
                        await page.click("button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    # Chọn License Category
                    cat_dropdown = page.locator(f"(//div[contains(., 'License Category') and contains(@class, 'select')] | //select)[{idx+1}]")
                    if await cat_dropdown.count() > 0:
                        await cat_dropdown.click()
                        await page.locator(f"text={c.get('category', 'SWRP')}").first.click()

                    # Chọn Course Name
                    course_dropdown = page.locator(f"(//div[contains(., 'Course') and contains(@class, 'select')] | //select)[{idx+2}]")
                    if await course_dropdown.count() > 0:
                        await course_dropdown.click()
                        await page.locator(f"text={c.get('course_name')}").first.click()

                    # Điền số lượng Licenses
                    license_inputs = page.locator("input[placeholder*='License'], input[type='number']")
                    await license_inputs.nth(idx).fill(str(c.get("licenses", 1)))

                    # Điền Start Date & End Date (Định dạng MM/DD/YYYY)
                    date_inputs = page.locator("input[placeholder='mm/dd/yyyy'], input[type='date']")
                    start_idx = idx * 2
                    end_idx = (idx * 2) + 1
                    
                    if await date_inputs.count() > end_idx:
                        await date_inputs.nth(start_idx).fill(c.get("start_date"))
                        await date_inputs.nth(end_idx).fill(c.get("end_date"))

                # Điền Additional Notes
                if order_data.get("additional_notes"):
                    await page.fill("textarea[placeholder*='notes']", order_data["additional_notes"])

                # Bấm nút 'Create Order' hoàn tất
                await page.click("//div[@role='dialog']//button[contains(., 'Create Order')]")
                await page.wait_for_timeout(4000)

                logger.info("✅ School đã tạo Order thành công!")
                return {"status": "success", "message": "School Order đã được tạo thành công"}
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
        order_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Partner mở Order Management, chọn Pool Category License và bấm Approve Order."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Partner Workspace"}

                logger.info("🤝 Mở /partner-workspace/order-management...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="networkidle")

                # Tìm Order của trường (Awaiting Partner)
                if order_id:
                    action_btn = page.locator(f"//tr[contains(., '{order_id}')]//button").first
                else:
                    action_btn = page.locator("//tr[contains(., 'Awaiting Partner')]//button").first

                await action_btn.click()
                await page.wait_for_selector("text=Order Details", timeout=15000)

                # Chọn Pool License (Category License)
                pool_select = page.locator("//div[contains(@class, 'select') or @role='button'][contains(., 'Pool License')] | //select")
                if await pool_select.count() > 0:
                    await pool_select.first.click()
                    # Click chọn Category License từ danh sách
                    category_option = page.locator("text=Category License").first
                    if await category_option.count() > 0:
                        await category_option.click()
                    await page.wait_for_timeout(1000)

                # Kiểm tra xem có khung xanh "Order can be approved" hay không
                can_approve = page.locator("text=Order can be approved")
                over_allocation = page.locator("text=Over-allocation detected")

                if await over_allocation.count() > 0:
                    logger.warning("⚠️ Kho Partner không đủ License! Cần tạo Contract xin Distributor.")
                    return {"status": "insufficient_pool", "message": "Kho Partner thiếu License, cần xin Distributor."}

                if await can_approve.count() > 0:
                    # Bấm nút Approve Order
                    approve_btn = page.locator("button:has-text('Approve Order')")
                    await approve_btn.click()
                    await page.wait_for_timeout(3000)
                    logger.info("✅ Partner đã duyệt Order thành công!")
                    return {"status": "success", "message": "Partner đã duyệt Order thành công"}

                return {"status": "failed", "error": "Không xuất hiện trạng thái sẵn sàng duyệt Order."}
            except Exception as e:
                logger.error(f"❌ Lỗi Partner Approve Order: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 3. SALES ADMIN WORKSPACE: DUYỆT CONTRACT VỚI JUSTIFICATION NOTE
    # =========================================================================
    async def admin_approve_distributor_contract(
        self, 
        credentials: Dict[str, str], 
        contract_code: Optional[str] = None, 
        justification: str = "Approved via PTV Central Automation Hub"
    ) -> Dict[str, Any]:
        """Sales Admin duyệt Contract DST-... và điền Justification Note."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login_role(page, credentials["username"], credentials["password"]):
                    return {"status": "failed", "error": "Không thể đăng nhập Sales Admin"}

                logger.info("👑 Mở /sales-admin-workspace/dashboard...")
                await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="networkidle")

                # Tìm và click icon con mắt Contract
                if contract_code:
                    eye_icon = page.locator(f"//tr[contains(., '{contract_code}')]//svg | //tr[contains(., '{contract_code}')]//button").first
                else:
                    eye_icon = page.locator("//tr[contains(., 'Pending')]//svg | //tr[contains(., 'Pending')]//button").first

                await eye_icon.click()
                await page.wait_for_selector("text=Order Details:", timeout=15000)

                # Bấm nút Approve màu xanh
                await page.click("button:has-text('Approve')")
                await page.wait_for_selector("text=Confirm Order Approval", timeout=10000)

                # Điền Justification Note
                await page.fill("textarea", justification)

                # Xác nhận phê duyệt
                await page.click("button:has-text('Confirm Approval')")
                await page.wait_for_timeout(3000)

                logger.info("✅ Sales Admin đã Approve Contract thành công!")
                return {"status": "success", "message": "Sales Admin duyệt Contract thành công"}
            except Exception as e:
                logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # 4. SCHOOL WORKSPACE: GHI DANH HỌC VIÊN & TẠO GROUP LỚP TRONG KHÓA HỌC
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
    # 5. BULK ACCOUNT CREATION (TẠO TÀI KHOẢN HỌC SINH/GV HÀNG LOẠT)
    # =========================================================================

    # =========================================================================
    # 1. PHA 1: NỘP FILE ACCOUNTS VÀ LẤY REQUEST ID TỪ MUIDATAGRID
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
    # 2. PHA 2: CHECK TIẾN ĐỘ & EXPORT FILE KẾT QUẢ TỪ MUIDATAGRID
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