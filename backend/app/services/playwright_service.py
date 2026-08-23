# backend/app/services/playwright_service.py
import logging
import asyncio
from typing import Dict, Any, List
from datetime import datetime
from playwright.async_api import async_playwright, Page, Browser

from app.core.config import settings

logger = logging.getLogger(__name__)

MOODLE_BASE_URL = "https://learn.pythaverse.space"

class PlaywrightLMSService:
    """
    Headless browser worker using Playwright for direct Moodle LMS (learn.pythaverse.space)
    automation: Direct Enrollment, Extension of Access & Group Management.
    """

    def _sanitize_emails(self, email_list: Any) -> List[str]:
        """Làm sạch, loại bỏ khoảng trắng và lọc trùng email."""
        if not email_list:
            return []
        if isinstance(email_list, str):
            raw_items = email_list.replace(",", "\n").replace(";", "\n").split("\n")
        elif isinstance(email_list, list):
            raw_items = [str(x) for x in email_list]
        else:
            return []

        cleaned = []
        for item in raw_items:
            clean = item.strip().lower()
            if clean and "@" in clean and clean not in cleaned:
                cleaned.append(clean)
        return cleaned

    def _parse_date_to_moodle(self, date_str: str) -> Dict[str, str]:
        """
        Chuyển chuỗi ngày dạng DD-MM-YYYY hoặc YYYY-MM-DD sang dict ngày tháng năm cho Moodle select box.
        """
        try:
            if "-" in date_str:
                parts = date_str.split("-")
                if len(parts[0]) == 4: # YYYY-MM-DD
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                else: # DD-MM-YYYY
                    dt = datetime.strptime(date_str, "%d-%m-%Y")
            elif "/" in date_str:
                dt = datetime.strptime(date_str, "%d/%m/%Y")
            else:
                dt = datetime.now()
        except Exception:
            dt = datetime.now()

        return {
            "day": str(dt.day),
            "month": str(dt.month),
            "year": str(dt.year)
        }

    async def _login_moodle_admin(self, page: Page) -> bool:
        """Đăng nhập Moodle qua Keycloak SSO hoặc Form Login."""
        try:
            admin_user = settings.TEST_ADMIN_USER or "admin"
            admin_pass = settings.TEST_ADMIN_PASS or settings.KEYCLOAK_ADMIN_PASS or ""

            logger.info("🔑 Đang đăng nhập vào Moodle LMS PLearn...")
            await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="networkidle", timeout=30000)

            # Nếu có nút đăng nhập SSO OpenID Connect / Keycloak
            sso_btn = page.locator("a:has-text('OpenID Connect'), a:has-text('Keycloak'), a:has-text('Pythaverse SSO')")
            if await sso_btn.count() > 0:
                await sso_btn.first.click()
                await page.wait_for_load_state("networkidle")

            # Nếu gặp form đăng nhập (Direct hoặc Keycloak)
            if await page.locator("input[name='username'], input#username").count() > 0:
                await page.fill("input[name='username'], input#username", admin_user)
                await page.fill("input[name='password'], input#password", admin_pass)
                await page.click("button[type='submit'], input[type='submit'], #loginbtn")
                await page.wait_for_load_state("networkidle", timeout=20000)

            # Kiểm tra đăng nhập thành công
            if "login" not in page.url or await page.locator(".userpicture, .usermenu").count() > 0:
                logger.info("✅ Đăng nhập Moodle LMS thành công!")
                return True

            logger.error(f"❌ Đăng nhập Moodle thất bại. URL hiện tại: {page.url}")
            return False
        except Exception as e:
            logger.error(f"❌ Lỗi Exception khi đăng nhập Moodle: {e}")
            return False

    async def enroll_users_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Nghiệp vụ cốt lõi: Ghi danh & Gia hạn học viên trực tiếp trên Moodle LMS.
        Hỗ trợ 3 role: student, non_editing_teacher, manager.
        """
        course_id = payload.get("course_id")
        course_name = payload.get("course_name", f"Course #{course_id}")
        start_date_str = payload.get("start_date", "")
        end_date_str = payload.get("end_date", "")
        group_name = payload.get("group_name", "").strip()

        # Danh sách người dùng theo vai trò
        students = self._sanitize_emails(payload.get("student_emails", []))
        teachers = self._sanitize_emails(payload.get("teacher_emails", []))
        managers = self._sanitize_emails(payload.get("manager_emails", []))

        # Nếu truyền cùng 1 vai trò (same_role mode)
        if payload.get("single_role") and payload.get("bulk_emails"):
            role_type = payload.get("single_role")
            bulk_list = self._sanitize_emails(payload.get("bulk_emails", []))
            if role_type == "student":
                students = bulk_list
            elif role_type == "non_editing_teacher":
                teachers = bulk_list
            elif role_type == "manager":
                managers = bulk_list

        total_users = len(students) + len(teachers) + len(managers)
        if total_users == 0:
            return {"status": "failed", "error": "Không có email nào được cung cấp để ghi danh."}

        results = {
            "enrolled_new": [],
            "extended_access": [],
            "not_found": [],
            "group_assigned": None,
            "logs": []
        }

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"]
            )
            context = await browser.new_context(viewport={"width": 1440, "height": 900})
            page = await context.new_page()

            try:
                # 1. Đăng nhập
                is_logged_in = await self._login_moodle_admin(page)
                if not is_logged_in:
                    return {"status": "failed", "error": "Không thể đăng nhập tài khoản Quản trị viên Moodle LMS."}

                # 2. Mở trang Participants của khóa học
                participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"
                logger.info(f"📚 Truy cập danh sách học viên: {participants_url}")
                await page.goto(participants_url, wait_until="networkidle", timeout=30000)

                role_tasks = [
                    ("Student", "Học viên", students),
                    ("Non-editing teacher", "Trợ giảng", teachers),
                    ("Manager", "Quản lý", managers),
                ]

                # Map text hiển thị Role trên giao diện Moodle
                role_label_map = {
                    "Student": ["Student", "Học viên"],
                    "Non-editing teacher": ["Non-editing teacher", "Giáo viên không có quyền chỉnh sửa", "Trợ giảng"],
                    "Manager": ["Manager", "Quản lý"]
                }

                # 3. Duyệt xử lý từng nhóm vai trò
                for role_moodle_name, role_vn, emails in role_tasks:
                    if not emails:
                        continue

                    logger.info(f"👥 Đang xử lý nhóm [{role_vn}] ({len(emails)} tài khoản)...")

                    for email in emails:
                        # 3.1. Thử Enroll Mới qua nút Enrol users
                        enrol_btn = page.locator("input[value='Enrol users'], button:has-text('Enrol users'), button:has-text('Ghi danh người dùng')").first
                        if await enrol_btn.count() > 0:
                            await enrol_btn.click()
                            await page.wait_for_selector(".moodle-dialogue-base, .modal-dialog", timeout=8000)
                            await page.wait_for_timeout(500)

                            # Chọn Role trong Modal
                            role_select = page.locator("select[name='roletoassign'], select#id_roletoassign")
                            if await role_select.count() > 0:
                                options = await role_select.locator("option").all_inner_texts()
                                for opt in options:
                                    if any(alias.lower() in opt.lower() for alias in role_label_map[role_moodle_name]):
                                        await role_select.select_option(label=opt)
                                        break

                            # Thiết lập thời hạn truy cập nếu có
                            if end_date_str:
                                duration_chk = page.locator("input[name='duration'], input#id_duration")
                                if await duration_chk.count() > 0 and not await duration_chk.is_checked():
                                    await duration_chk.check()

                            # Tìm kiếm user trong ô search modal
                            user_search_input = page.locator("input.form-autocomplete-input, input[placeholder*='Search'], input[placeholder*='Tìm kiếm']").first
                            await user_search_input.fill(email)
                            await page.wait_for_timeout(1500)

                            # Xem có dropdown item không
                            matched_option = page.locator(f"ul.form-autocomplete-suggestions li:has-text('{email}')").first
                            if await matched_option.count() > 0:
                                await matched_option.click()
                                await page.wait_for_timeout(500)

                                # Bấm Enrol users hoàn tất
                                submit_enrol = page.locator(".modal-footer button.btn-primary, input[value='Enrol selected users and cohorts']").first
                                await submit_enrol.click()
                                await page.wait_for_load_state("networkidle")
                                await page.wait_for_timeout(1000)

                                logger.info(f"✅ Ghi danh MỚI thành công: {email} -> {role_vn}")
                                results["enrolled_new"].append({"email": email, "role": role_vn})
                                continue
                            else:
                                # Không thấy trong popup enroll -> Có thể đã tham gia rồi hoặc tài khoản không tồn tại
                                cancel_btn = page.locator(".modal-footer button:has-text('Cancel'), button.close, button[data-action='cancel']").first
                                if await cancel_btn.count() > 0:
                                    await cancel_btn.click()
                                    await page.wait_for_timeout(500)

                        # 3.2. Không Enrol mới được -> Tìm trên bảng Participants để Gia Hạn (Extend Access)
                        logger.info(f"🔍 Kiểm tra xem {email} đã có trong khóa để Gia Hạn...")
                        
                        # Filter tìm user trong trang Participants
                        search_table = page.locator("input#id_searchinput, input[name='search']").first
                        if await search_table.count() > 0:
                            await search_table.fill(email)
                            await page.keyboard.press("Enter")
                            await page.wait_for_load_state("networkidle")
                            await page.wait_for_timeout(1500)

                        user_row = page.locator(f"tr:has-text('{email}')").first
                        if await user_row.count() > 0:
                            # Tìm thấy -> Bấm icon bánh răng ⚙️ (Edit enrollment)
                            edit_gear = user_row.locator("a[data-action='editenrolment'], a[title*='Edit'], i.fa-cog").first
                            if await edit_gear.count() > 0:
                                await edit_gear.click()
                                await page.wait_for_selector(".modal-dialog, .moodle-dialogue-base", timeout=8000)
                                await page.wait_for_timeout(500)

                                # Sửa trạng thái Active
                                status_select = page.locator("select[name='status'], select#id_status")
                                if await status_select.count() > 0:
                                    await status_select.select_option(value="0") # 0 = Active

                                # Cập nhật ngày kết thúc
                                if end_date_str:
                                    end_enable_chk = page.locator("input[name='timeend[enabled]'], input#id_timeend_enabled")
                                    if await end_enable_chk.count() > 0 and not await end_enable_chk.is_checked():
                                        await end_enable_chk.check()

                                    date_obj = self._parse_date_to_moodle(end_date_str)
                                    day_sel = page.locator("select[name='timeend[day]']")
                                    month_sel = page.locator("select[name='timeend[month]']")
                                    year_sel = page.locator("select[name='timeend[year]']")

                                    if await day_sel.count() > 0: await day_sel.select_option(date_obj["day"])
                                    if await month_sel.count() > 0: await month_sel.select_option(date_obj["month"])
                                    if await year_sel.count() > 0: await year_sel.select_option(date_obj["year"])

                                # Bấm Save changes
                                save_edit = page.locator(".modal-footer button.btn-primary, input[value='Save changes']").first
                                await save_edit.click()
                                await page.wait_for_load_state("networkidle")
                                await page.wait_for_timeout(1000)

                                logger.info(f"🔄 ĐÃ GIA HẠN THÀNH CÔNG thời gian truy cập cho: {email}")
                                results["extended_access"].append({"email": email, "role": role_vn, "valid_until": end_date_str})
                                continue

                        # 3.3. Hoàn toàn không tìm thấy
                        logger.warning(f"⚠️ KHÔNG TÌM THẤY tài khoản trên hệ thống: {email}")
                        results["not_found"].append({"email": email, "reason": "Tài khoản chưa tồn tại trên Keycloak/Moodle"})

                # 4. Tạo Group & Add Members (Nếu có yêu cầu)
                valid_all_emails = [x["email"] for x in results["enrolled_new"]] + [x["email"] for x in results["extended_access"]]
                if group_name and valid_all_emails:
                    logger.info(f"🏷️ Đang tiến hành tạo Group & gom nhóm [{group_name}]...")
                    groups_url = f"{MOODLE_BASE_URL}/group/index.php?id={course_id}"
                    await page.goto(groups_url, wait_until="networkidle", timeout=30000)

                    # Kiểm tra xem Group đã có chưa
                    group_option = page.locator(f"select#groups option:has-text('{group_name}')")
                    if await group_option.count() == 0:
                        # Bấm nút Create group
                        await page.click("input[name='creategroup'], button:has-text('Create group')")
                        await page.wait_for_load_state("networkidle")
                        await page.fill("input#id_name, input[name='name']", group_name)
                        await page.click("input#id_submitbutton, input[value='Save changes']")
                        await page.wait_for_load_state("networkidle")

                    # Chọn Group & Add users
                    await page.select_option("select#groups", label=group_name)
                    await page.wait_for_timeout(500)
                    
                    add_users_btn = page.locator("input[name='showaddmembersform'], input[value='Add/remove users']").first
                    if await add_users_btn.count() > 0:
                        await add_users_btn.click()
                        await page.wait_for_load_state("networkidle")

                        for u_email in valid_all_emails:
                            search_user_group = page.locator("input#addselect_searchtext").first
                            if await search_user_group.count() > 0:
                                await search_user_group.fill(u_email)
                                await page.wait_for_timeout(800)

                            potential_user = page.locator(f"select#addselect option:has-text('{u_email}')").first
                            if await potential_user.count() > 0:
                                await potential_user.click()
                                await page.click("input#add, input[value='Add']")
                                await page.wait_for_timeout(500)

                        # Quay lại danh sách group
                        await page.click("input[name='cancel'], input[value='Back to groups']")
                        results["group_assigned"] = group_name

                return {
                    "status": "success",
                    "course_id": course_id,
                    "course_name": course_name,
                    "summary": {
                        "total_requested": total_users,
                        "enrolled_new_count": len(results["enrolled_new"]),
                        "extended_access_count": len(results["extended_access"]),
                        "not_found_count": len(results["not_found"])
                    },
                    "details": results
                }

            except Exception as e:
                logger.error(f"❌ Lỗi ngoại lệ trong quá trình LMS Enrollment: {e}")
                return {"status": "failed", "error": str(e), "details": results}
            finally:
                await browser.close()


playwright_lms_service = PlaywrightLMSService()