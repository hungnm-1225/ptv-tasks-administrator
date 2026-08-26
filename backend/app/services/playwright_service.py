# backend/app/services/playwright_service.py
import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from playwright.async_api import async_playwright, Page, Browser, Locator

from app.core.config import settings

logger = logging.getLogger(__name__)

MOODLE_BASE_URL = "https://learn.pythaverse.space"


class PlaywrightLMSService:
    """
    Playwright Worker tự động hóa 100% trên Moodle PLearn Edwiser RemUI (learn.pythaverse.space):
    - Đăng nhập Keycloak OpenID Connect SSO bọc thép.
    - Chống mạng lag, chống Layout Shift và chống kết quả ma (Ghost response).
    - Tự động Ghi danh MỚI kèm ngày hết hạn Enrolment ends.
    - Smart Fallback: Tự động chuyển sang Gia hạn (Update date) nếu User đã có trong khóa.
    - Đổi Role trực tiếp (Inline Role Modifier ✏️).
    - Xóa người dùng khỏi khóa học (Unenrol User 🗑️).
    - Tạo Group & Phân nhóm lớp tự động.
    """

    def __init__(self):
        self.headless = True

    def _sanitize_emails(self, email_list: Any) -> List[str]:
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

    def _parse_date_components(self, date_str: str) -> Dict[str, str]:
        try:
            if "-" in date_str:
                parts = date_str.split("-")
                if len(parts[0]) == 4:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                else:
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

    async def _login_moodle_sso(self, page: Page) -> bool:
        try:
            admin_user = settings.TEST_ADMIN_USER or "adminworkspace"
            admin_pass = settings.TEST_ADMIN_PASS or settings.KEYCLOAK_ADMIN_PASS or ""

            logger.info("🔑 Đang mở cổng đăng nhập Moodle PLearn...")
            response = await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="load", timeout=60000)
            await page.wait_for_timeout(2000)

            if response and response.status >= 500:
                logger.error(f"🔥 Máy chủ Moodle phản hồi mã lỗi HTTP {response.status}")
                return False

            if "eid.pythaverse.space" in page.url or await page.locator("input#username, input[name='username']").count() > 0:
                logger.info(f"🔐 Điền thông tin Keycloak: {admin_user}")
                await page.fill("input#username, input[name='username'], #username", admin_user)
                await page.fill("input#password, input[name='password'], #password", admin_pass)
                await page.click("input#kc-login, button[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')", force=True)
                await page.wait_for_timeout(4000)

            kc_error = page.locator(".alert-error, #input-error, span.kc-feedback-text")
            if await kc_error.count() > 0 and await kc_error.first.is_visible():
                err_text = (await kc_error.first.inner_text()).strip()
                logger.error(f"❌ Đăng nhập Keycloak thất bại: '{err_text}'")
                return False

            if await page.locator(".usermenu, a[title='User menu'], .userinitials, .site-name").count() > 0 or "login" not in page.url:
                logger.info("✅ Đăng nhập Moodle LMS PLearn thành công!")
                return True

            logger.error(f"❌ Không thể chuyển trang sau đăng nhập. URL: {page.url}")
            return False
        except Exception as e:
            logger.error(f"❌ Lỗi Exception khi đăng nhập Moodle SSO: {e}")
            return False

    async def _close_modal_safely(self, page: Page, modal: Locator):
        try:
            cancel_btn = modal.locator("button[data-action='cancel'], button[data-action='hide'], .modal-header button.close").first
            if await cancel_btn.count() > 0:
                await cancel_btn.click(force=True)
            else:
                await page.keyboard.press("Escape")
            await page.wait_for_timeout(600)

            await page.evaluate("""() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(b => b.remove());
                document.body.classList.remove('modal-open');
            }""")
        except Exception as e:
            logger.debug(f"Đóng modal: {e}")

    async def enroll_users_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Luồng Ghi Danh kết hợp Smart Fallback (Enrol New -> Extend Date -> Add Group)."""
        course_id = str(payload.get("course_id", "")).strip()
        course_name = payload.get("course_name", f"Course #{course_id}")
        end_date_str = payload.get("end_date", "")
        group_name = payload.get("group_name", "").strip()

        date_info = self._parse_date_components(end_date_str) if end_date_str else None

        students = self._sanitize_emails(payload.get("student_emails", payload.get("students", [])))
        teachers = self._sanitize_emails(payload.get("teacher_emails", payload.get("non_editing_teachers", [])))
        managers = self._sanitize_emails(payload.get("manager_emails", payload.get("managers", [])))

        if payload.get("bulk_emails"):
            role_type = payload.get("single_role", "student")
            bulk_list = self._sanitize_emails(payload.get("bulk_emails"))
            if role_type == "student" and not students:
                students = bulk_list
            elif role_type == "non_editing_teacher" and not teachers:
                teachers = bulk_list
            elif role_type == "manager" and not managers:
                managers = bulk_list

        total_requested = len(students) + len(teachers) + len(managers)
        logger.info(f"📋 Tổng số emails cần xử lý: {total_requested} (Học viên: {len(students)}, Trợ giảng: {len(teachers)}, Quản lý: {len(managers)})")

        if total_requested == 0:
            return {"status": "failed", "error": "Không có email nào được cung cấp để thực hiện ghi danh."}

        results = {
            "enrolled_new": [],
            "extended_access": [],
            "not_found": [],
            "group_created": None,
            "group_members_added": []
        }

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(
                headless=self.headless,
                slow_mo=200 if not self.headless else 0,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"]
            )
            context = await browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            await page.route("**/*.{png,jpg,jpeg,gif,webp,ico}", lambda route: route.abort())

            try:
                if not await self._login_moodle_sso(page):
                    return {"status": "failed", "error": "Không thể đăng nhập vào hệ thống Moodle PLearn."}

                participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"
                role_configs = [
                    ("Non-editing teacher", "7", teachers),
                    ("Manager", "1", managers),
                    ("Student", "9", students),
                ]

                all_valid_emails = []

                for role_label, role_value, emails in role_configs:
                    if not emails:
                        continue

                    logger.info(f"👥 ==========================================================")
                    logger.info(f"👥 Đang xử lý nhóm [{role_label}] ({len(emails)} emails)...")
                    logger.info(f"👥 ==========================================================")

                    await page.goto(participants_url, wait_until="load", timeout=60000)
                    page_content = page.locator("#page-content, #region-main, table#participants").first
                    await page_content.wait_for(state="visible", timeout=30000)
                    await page.wait_for_timeout(1500)

                    emails_need_fallback = []

                    # ----------------------------------------------------------
                    # BƯỚC 1: ENROL MỚI TRONG MODAL
                    # ----------------------------------------------------------
                    enrol_btn = page.locator("form[id^='enrolusersbutton'] input[type='submit'], input[value='Enrol users']").first
                    if await enrol_btn.count() > 0:
                        await enrol_btn.wait_for(state="visible", timeout=20000)
                        await enrol_btn.scroll_into_view_if_needed()
                        await enrol_btn.click()

                        modal = page.locator("div.modal.show[data-region='modal-container'], div.modal.show:has-text('Enrol users')").first
                        await modal.wait_for(state="visible", timeout=15000)
                        await page.wait_for_timeout(1000)

                        # Chọn Role
                        role_select = modal.locator("select#id_roletoassign").first
                        if await role_select.count() > 0:
                            await role_select.select_option(value=role_value)
                            await page.wait_for_timeout(300)

                        # Bung Show more & Cài ngày
                        if date_info:
                            show_more_link = modal.locator("a.moreless-toggler, a:has-text('Show more')").first
                            if await show_more_link.count() > 0:
                                await show_more_link.scroll_into_view_if_needed()
                                await show_more_link.click()
                                await page.wait_for_timeout(800)

                            enable_chk = modal.locator("input#id_timeend_enabled, label[data-fieldtype='checkbox']:has(#id_timeend_enabled)").first
                            if await enable_chk.count() > 0:
                                await enable_chk.scroll_into_view_if_needed()
                                await enable_chk.click()
                                await page.wait_for_timeout(500)

                            day_sel = modal.locator("select#id_timeend_day").first
                            if await day_sel.count() > 0:
                                try:
                                    await page.wait_for_function("!document.getElementById('id_timeend_day').disabled", timeout=5000)
                                except Exception:
                                    pass
                                await modal.locator("select#id_timeend_day").first.select_option(date_info["day"])
                                await modal.locator("select#id_timeend_month").first.select_option(date_info["month"])
                                await modal.locator("select#id_timeend_year").first.select_option(date_info["year"])

                        new_selected_count = 0
                        search_container = modal.locator("#fitem_id_userlist, div[data-fieldtype='autocomplete']").first
                        search_user_input = modal.locator("#fitem_id_userlist input.form-autocomplete-input, #fitem_id_userlist input[placeholder='Search'], div.form-autocomplete-selection + input").first
                        suggestions_list = modal.locator("ul.form-autocomplete-suggestions")

                        for email in emails:
                            clean_email = email.strip().lower()
                            logger.info(f"🔍 Tìm kiếm tài khoản: {clean_email}")
                            
                            if await search_user_input.count() > 0:
                                await search_user_input.scroll_into_view_if_needed()
                                await search_user_input.click()
                                await search_user_input.fill(clean_email)

                                target_option = suggestions_list.locator("li[role='option']").filter(has_text=clean_email).first
                                selected_ok = False

                                try:
                                    await target_option.wait_for(state="visible", timeout=12000)
                                    await target_option.click()

                                    await page.wait_for_timeout(400)
                                    spinner = search_container.locator(".loading-icon, i.fa-spin, i.fa-circle-notch")
                                    if await spinner.count() > 0:
                                        try:
                                            await spinner.first.wait_for(state="hidden", timeout=5000)
                                        except Exception:
                                            pass

                                    selected_ok = True
                                    new_selected_count += 1
                                    all_valid_emails.append(clean_email)
                                    results["enrolled_new"].append({"email": clean_email, "role": role_label, "valid_until": end_date_str})
                                    logger.info(f"➕ Đã chọn để ghi danh MỚI: {clean_email} ({role_label})")

                                except Exception:
                                    logger.info(f"ℹ️ Không có trong gợi ý Mới -> Sẽ kích hoạt SMART FALLBACK kiểm tra ngoài bảng: {clean_email}")
                                    emails_need_fallback.append(clean_email)

                                await page.wait_for_timeout(300)

                        if new_selected_count > 0:
                            save_btn = modal.locator(".modal-footer button[data-action='save'], button:has-text('Enrol selected users and cohorts')").first
                            await save_btn.click()
                            await page.wait_for_timeout(4000)
                            logger.info(f"✅ Đã submit ghi danh {new_selected_count} tài khoản mới thành công!")
                        else:
                            await self._close_modal_safely(page, modal)
                    else:
                        emails_need_fallback = emails

                    # ----------------------------------------------------------
                    # BƯỚC 2: SMART FALLBACK (TÌM TRONG BẢNG ĐỂ GIA HẠN NGÀY)
                    # ----------------------------------------------------------
                    if emails_need_fallback:
                        logger.info(f"🔄 BẮT ĐẦU SMART FALLBACK KIỂM TRA {len(emails_need_fallback)} TÀI KHOẢN TRONG BẢNG...")

                        for email in emails_need_fallback:
                            user_extended = False

                            reset_btn = page.locator("button[data-filteraction='reset']:has-text('Clear filters')").first
                            if await reset_btn.count() > 0 and await reset_btn.is_visible():
                                await reset_btn.click(force=True)
                                await page.wait_for_timeout(1000)

                            type_select = page.locator("select[data-filterfield='type']").first
                            if await type_select.count() > 0 and await type_select.is_enabled():
                                await type_select.select_option(value="keywords")
                                await page.wait_for_timeout(400)

                            keyword_input = page.locator("div[data-filter-type='keywords'] input, div[data-filterregion='value'] input").first
                            if await keyword_input.count() > 0:
                                await keyword_input.click(force=True)
                                await keyword_input.fill(email)
                                await page.keyboard.press("Enter")
                                await page.wait_for_timeout(400)

                            apply_btn = page.locator("button[data-filteraction='apply']:has-text('Apply filters')").first
                            if await apply_btn.count() > 0:
                                await apply_btn.click(force=True)
                                await page.wait_for_timeout(2500)

                            user_row = page.locator(f"table#participants tbody tr:has-text('{email}')").first

                            if await user_row.count() > 0:
                                edit_gear = user_row.locator("a.editenrollink, a[data-action='editenrolment'], i.fa-cog, i.fa-pen").first
                                if await edit_gear.count() > 0:
                                    await edit_gear.click(force=True)
                                    
                                    edit_modal = page.locator("div.modal.show[data-region='modal-container']").first
                                    await edit_modal.wait_for(state="visible", timeout=8000)

                                    if await edit_modal.count() > 0:
                                        status_select = edit_modal.locator("select#id_status").first
                                        if await status_select.count() > 0:
                                            await status_select.select_option(value="0")

                                        if date_info:
                                            await page.evaluate(f"""() => {{
                                                const chk = document.querySelector(".modal.show input#id_timeend_enabled, .modal.show input[name='timeend[enabled]']");
                                                if (chk && !chk.checked) {{
                                                    chk.checked = true;
                                                    chk.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                                }}
                                                const day = document.querySelector(".modal.show select#id_timeend_day");
                                                const month = document.querySelector(".modal.show select#id_timeend_month");
                                                const year = document.querySelector(".modal.show select#id_timeend_year");

                                                [day, month, year].forEach(el => {{ if (el) el.removeAttribute('disabled'); }});

                                                if (day) {{ day.value = '{date_info["day"]}'; day.dispatchEvent(new Event('change', {{ bubbles: true }})); }}
                                                if (month) {{ month.value = '{date_info["month"]}'; month.dispatchEvent(new Event('change', {{ bubbles: true }})); }}
                                                if (year) {{ year.value = '{date_info["year"]}'; year.dispatchEvent(new Event('change', {{ bubbles: true }})); }}
                                            }}""")
                                            await page.wait_for_timeout(400)

                                        save_edit_btn = edit_modal.locator(".modal-footer button[data-action='save'], button:has-text('Save changes')").first
                                        await save_edit_btn.click(force=True)
                                        await page.wait_for_timeout(2500)

                                        logger.info(f"🔄 SMART FALLBACK THÀNH CÔNG: Đã gia hạn cho {email} ({role_label}) đến ngày {end_date_str}")
                                        all_valid_emails.append(email)
                                        results["extended_access"].append({
                                            "email": email,
                                            "role": role_label,
                                            "valid_until": end_date_str
                                        })
                                        user_extended = True

                            # NẾU CẢ MODAL VÀ TRANG PARTICIPANTS ĐỀU KHÔNG CÓ -> BÁO LỖI CHÍNH XÁC
                            if not user_extended:
                                logger.warning(f"❌ SMART FALLBACK THẤT BẠI: Hoàn toàn không tìm thấy tài khoản trên hệ thống: {email}")
                                results["not_found"].append({
                                    "email": email,
                                    "role_intended": role_label,
                                    "reason": "Tài khoản không có trong danh sách gợi ý Mới và không tồn tại trong bảng học viên của khóa."
                                })

                # ----------------------------------------------------------
                # BƯỚC 3: TẠO GROUP & PHÂN NHÓM
                # ----------------------------------------------------------
                if group_name and all_valid_emails:
                    logger.info(f"🏷️ Bắt đầu tiến trình tạo Group & phân nhóm: [{group_name}]...")
                    groups_url = f"{MOODLE_BASE_URL}/group/index.php?id={course_id}"
                    await page.goto(groups_url, wait_until="load", timeout=45000)
                    await page.wait_for_timeout(2000)

                    group_option = page.locator(f"select#groups option:has-text('{group_name}')").first
                    if await group_option.count() == 0:
                        logger.info(f"➕ Tạo Group mới: [{group_name}]...")
                        create_group_btn = page.locator("input#showcreateorphangroupform, input[value='Create group']").first
                        if await create_group_btn.count() > 0:
                            await create_group_btn.click(force=True)
                            await page.wait_for_timeout(1200)

                            await page.fill("input#id_name", group_name)
                            await page.click("input#id_submitbutton, input[value='Save changes']", force=True)
                            await page.wait_for_timeout(2000)

                    group_option = page.locator(f"select#groups option:has-text('{group_name}')").first
                    if await group_option.count() > 0:
                        await group_option.click(force=True)
                        await page.wait_for_timeout(500)

                        add_members_btn = page.locator("input#showaddmembersform, input[value='Add/remove users']").first
                        if await add_members_btn.count() > 0 and await add_members_btn.is_enabled():
                            await add_members_btn.click(force=True)
                            await page.wait_for_timeout(2000)

                            for u_email in all_valid_emails:
                                search_potential = page.locator("input#addselect_searchtext").first
                                if await search_potential.count() > 0:
                                    await search_potential.click(force=True)
                                    await search_potential.fill(u_email)
                                    await page.wait_for_timeout(1200)

                                    potential_opt = page.locator(f"select#addselect option").filter(has_text=u_email).first
                                    if await potential_opt.count() > 0:
                                        await potential_opt.click(force=True)
                                        await page.wait_for_timeout(300)

                                        add_btn = page.locator("input#add, input[name='add'], input[value*='Add']").first
                                        if await add_btn.count() > 0:
                                            await add_btn.click(force=True)
                                            await page.wait_for_timeout(1500)
                                            results["group_members_added"].append(u_email)
                                            logger.info(f"✅ Đã thêm vào Group [{group_name}]: {u_email}")

                            back_btn = page.locator("input[name='cancel'][value='Back to groups']").first
                            if await back_btn.count() > 0:
                                await back_btn.click(force=True)
                                await page.wait_for_timeout(1000)

                            results["group_created"] = group_name

                success_count = len(results["enrolled_new"]) + len(results["extended_access"])
                status = "success" if success_count > 0 else "failed"

                return {
                    "status": status,
                    "course_id": course_id,
                    "course_name": course_name,
                    "message": f"Đã xử lý {success_count}/{total_requested} tài khoản (Mới: {len(results['enrolled_new'])}, Gia hạn/Fallback: {len(results['extended_access'])}, Lỗi: {len(results['not_found'])}).",
                    "summary": {
                        "total_requested": total_requested,
                        "enrolled_new_count": len(results["enrolled_new"]),
                        "extended_access_count": len(results["extended_access"]),
                        "not_found_count": len(results["not_found"]),
                        "group_members_count": len(results["group_members_added"])
                    },
                    "details": results
                }

            except Exception as e:
                logger.error(f"❌ Lỗi ngoại lệ trong quá trình LMS Enrollment: {e}")
                return {"status": "failed", "error": str(e), "details": results}
            finally:
                await browser.close()

    async def modify_user_role(self, course_id: str, email: str, new_role_label: str, mode: str = "replace") -> Dict[str, Any]:
        """Hàm độc lập đổi hoặc gán thêm Role cho 1 User trên Moodle."""
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=self.headless, args=["--no-sandbox", "--disable-gpu", "--single-process"])
            page = await browser.new_page()
            try:
                if not await self._login_moodle_sso(page):
                    return {"status": "failed", "error": "Đăng nhập thất bại"}

                participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"
                await page.goto(participants_url, wait_until="load", timeout=60000)
                await page.wait_for_timeout(1500)

                # Lọc user
                kw_input = page.locator("div[data-filter-type='keywords'] input, div[data-filterregion='value'] input").first
                if await kw_input.count() > 0:
                    await kw_input.fill(email)
                    await page.keyboard.press("Enter")
                    await page.locator("button[data-filteraction='apply']").first.click(force=True)
                    await page.wait_for_timeout(2500)

                user_row = page.locator(f"table#participants tbody tr:has-text('{email}')").first
                if await user_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy user {email} trong khóa học."}

                # Bấm bút chì sửa role
                pencil_btn = user_row.locator("a[data-action='editroles'], i.fa-pen, i.fa-pencil").first
                await pencil_btn.click(force=True)
                await page.wait_for_timeout(1000)

                # Nếu mode là 'replace' thì xóa các role cũ
                if mode == "replace":
                    old_tags = user_row.locator(".inplaceeditable span.badge [data-action='remove']")
                    count_old = await old_tags.count()
                    for _ in range(count_old):
                        await old_tags.nth(0).click(force=True)
                        await page.wait_for_timeout(300)

                # Chọn role mới
                role_dropdown = user_row.locator("select.custom-select, select[name='roles']").first
                if await role_dropdown.count() > 0:
                    await role_dropdown.select_option(label=new_role_label)
                    await page.wait_for_timeout(500)

                # Lưu
                save_btn = user_row.locator("a[data-action='saveroles'], i.fa-floppy-disk, i.fa-save").first
                if await save_btn.count() > 0:
                    await save_btn.click(force=True)
                else:
                    await page.keyboard.press("Enter")

                await page.wait_for_timeout(2000)
                return {"status": "success", "message": f"Đã cập nhật role thành [{new_role_label}] cho {email}"}
            finally:
                await browser.close()

    async def unenrol_users_pipeline(self, course_id: str, emails: List[str]) -> Dict[str, Any]:
        """Hàm độc lập xóa danh sách User khỏi khóa học (Unenrol 🗑️)."""
        clean_emails = self._sanitize_emails(emails)
        if not clean_emails:
            return {"status": "failed", "error": "Danh sách email rỗng."}

        results = {"unenrolled": [], "not_found": []}

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=self.headless, args=["--no-sandbox", "--disable-gpu", "--single-process"])
            page = await browser.new_page()
            try:
                if not await self._login_moodle_sso(page):
                    return {"status": "failed", "error": "Đăng nhập thất bại"}

                participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"
                await page.goto(participants_url, wait_until="load", timeout=60000)
                await page.wait_for_timeout(1500)

                for email in clean_emails:
                    # Reset filter và tìm email
                    reset_btn = page.locator("button[data-filteraction='reset']:has-text('Clear filters')").first
                    if await reset_btn.count() > 0 and await reset_btn.is_visible():
                        await reset_btn.click(force=True)
                        await page.wait_for_timeout(600)

                    kw_input = page.locator("div[data-filter-type='keywords'] input, div[data-filterregion='value'] input").first
                    if await kw_input.count() > 0:
                        await kw_input.fill(email)
                        await page.keyboard.press("Enter")
                        await page.locator("button[data-filteraction='apply']").first.click(force=True)
                        await page.wait_for_timeout(2500)

                    user_row = page.locator(f"table#participants tbody tr:has-text('{email}')").first
                    if await user_row.count() > 0:
                        trash_btn = user_row.locator("a.unenrollink, a[data-action='unenrol'], i.fa-trash, i.fa-trash-can").first
                        if await trash_btn.count() > 0:
                            await trash_btn.click(force=True)
                            
                            modal = page.locator("div.modal.show:has-text('Unenrol'), div.modal.show[data-region='modal-container']").first
                            await modal.wait_for(state="visible", timeout=8000)

                            confirm_btn = modal.locator(".modal-footer button.btn-primary, button:has-text('Unenrol')").first
                            await confirm_btn.click(force=True)
                            await page.wait_for_timeout(3000)
                            results["unenrolled"].append(email)
                            logger.info(f"🗑️ Đã xóa user khỏi khóa: {email}")
                    else:
                        results["not_found"].append(email)

                return {
                    "status": "success" if results["unenrolled"] else "failed",
                    "message": f"Đã xóa {len(results['unenrolled'])}/{len(clean_emails)} tài khoản.",
                    "details": results
                }
            finally:
                await browser.close()


playwright_lms_service = PlaywrightLMSService()