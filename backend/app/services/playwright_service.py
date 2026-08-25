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
    - Đăng nhập Keycloak OpenID Connect SSO an toàn chống crash navigation.
    - Chặn tải media/ảnh/fonts dư thừa để tối ưu bộ nhớ RAM trên máy chủ 512MB.
    - Đảm bảo Clean State (tải lại trang Participants) ở đầu mỗi vòng lặp Role.
    - Bắt chuẩn xác Selector từ DOM HTML thật của Moodle 4.x RemUI.
    - Tự động Ghi danh MỚI hoặc Gia hạn (Extend access ⚙️) với ngày kết thúc chính xác.
    - Tạo Group và phân nhóm học sinh theo lớp.
    """

    def _sanitize_emails(self, email_list: Any) -> List[str]:
        """Làm sạch và lọc trùng danh sách email."""
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
        """Chuyển chuỗi DD-MM-YYYY hoặc YYYY-MM-DD sang dict ngày tháng năm cho Moodle select box."""
        try:
            if "-" in date_str:
                parts = date_str.split("-")
                if len(parts[0]) == 4:  # YYYY-MM-DD
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                else:  # DD-MM-YYYY
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
            "year": str(dt.year),
            "hour": "23",
            "minute": "59"
        }

    async def _login_moodle_sso(self, page: Page) -> bool:
        """Đăng nhập Moodle qua Keycloak SSO, bọc thép chống Execution context destroyed."""
        try:
            admin_user = settings.TEST_ADMIN_USER or "adminworkspace"
            admin_pass = settings.TEST_ADMIN_PASS or settings.KEYCLOAK_ADMIN_PASS or ""

            logger.info("🔑 Đang mở cổng đăng nhập Moodle PLearn...")
            await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="domcontentloaded", timeout=40000)
            await page.wait_for_timeout(1000)

            # Nếu bị redirect sang Keycloak EID (eid.pythaverse.space)
            if "eid.pythaverse.space" in page.url or await page.locator("input#username, input[name='username']").count() > 0:
                logger.info("🔐 Đang điền thông tin đăng nhập trên Pythaverse EID Keycloak...")
                await page.fill("input#username", admin_user)
                await page.fill("input#password", admin_pass)

                # Bấm submit và CHỜ redirect hoàn tất về learn.pythaverse.space
                async with page.expect_navigation(timeout=40000, wait_until="networkidle"):
                    await page.click("input#kc-login, button[type='submit']", force=True)

            # Đợi trang đích ổn định
            await page.wait_for_load_state("networkidle", timeout=30000)
            await page.wait_for_timeout(1500)

            # Kiểm tra đăng nhập thành công
            if await page.locator(".usermenu, a[title='User menu'], .userinitials").count() > 0 or "login" not in page.url:
                logger.info("✅ Đăng nhập Moodle LMS PLearn thành công!")
                return True

            logger.error(f"❌ Không thể đăng nhập. URL hiện tại: {page.url}")
            return False
        except Exception as e:
            logger.error(f"❌ Lỗi Exception khi đăng nhập Moodle SSO: {e}")
            return False

    async def _set_moodle_datetime_selectors(self, container: Locator, date_info: Dict[str, str]):
        """Helper kích hoạt checkbox Enable và chọn ngày/tháng/năm chính xác trong form Moodle."""
        try:
            # 1. Kích hoạt Checkbox Enable cho Enrolment ends
            enable_chk = container.locator("input#id_timeend_enabled, input[name='timeend[enabled]']").first
            if await enable_chk.count() > 0:
                if not await enable_chk.is_checked():
                    await enable_chk.check(force=True)
                    await asyncio.sleep(0.3)

            # 2. Điền Select Day, Month, Year
            day_sel = container.locator("select#id_timeend_day, select[name='timeend[day]']").first
            if await day_sel.count() > 0:
                await day_sel.select_option(date_info["day"])

            month_sel = container.locator("select#id_timeend_month, select[name='timeend[month]']").first
            if await month_sel.count() > 0:
                await month_sel.select_option(date_info["month"])

            year_sel = container.locator("select#id_timeend_year, select[name='timeend[year]']").first
            if await year_sel.count() > 0:
                await year_sel.select_option(date_info["year"])

            hour_sel = container.locator("select#id_timeend_hour, select[name='timeend[hour]']").first
            if await hour_sel.count() > 0:
                await hour_sel.select_option(date_info["hour"])

            min_sel = container.locator("select#id_timeend_minute, select[name='timeend[minute]']").first
            if await min_sel.count() > 0:
                await min_sel.select_option(date_info["minute"])

            logger.info(f"📅 Đã đặt ngày hết hạn: {date_info['day']}/{date_info['month']}/{date_info['year']}")
        except Exception as e:
            logger.warning(f"⚠️ Lỗi khi chọn ngày tháng Moodle: {e}")

    async def _open_enrol_modal_safely(self, page: Page) -> Optional[Locator]:
        """Kích hoạt mở Modal Enrol Users bọc thép an toàn theo DOM Edwiser RemUI."""
        try:
            # Đợi nút Enrol users xuất hiện
            enrol_btn = page.locator(".enrolusersbutton input[value='Enrol users'], #enrolusersbutton-1 input").first
            await enrol_btn.wait_for(state="visible", timeout=12000)
            await enrol_btn.click(force=True)
            await page.wait_for_timeout(1000)

            # Bắt modal container
            modal = page.locator("div.modal.show[data-region='modal-container'], div.modal.show:has-text('Enrol users')").first
            if await modal.count() > 0 and await modal.is_visible():
                logger.info("✨ Đã mở thành công Enrol users modal!")
                return modal

            # Fallback trigger qua JS event nếu Modal chưa bung
            logger.info("🔄 Trigger mở Modal qua JavaScript Event...")
            await page.evaluate("""() => {
                const btn = document.querySelector(".enrolusersbutton input[value='Enrol users'], #enrolusersbutton-1 input");
                if (btn) btn.click();
            }""")
            await page.wait_for_timeout(1500)

            modal = page.locator("div.modal.show[data-region='modal-container']").first
            if await modal.count() > 0 and await modal.is_visible():
                logger.info("✨ Đã mở thành công Enrol users modal (JS Fallback)!")
                return modal

            return None
        except Exception as e:
            logger.warning(f"⚠️ Lỗi khi mở Enrol users modal: {e}")
            return None

    async def _close_modal_safely(self, page: Page, modal: Locator):
        """Đóng modal và dọn dẹp sạch sẽ backdrop để không làm ô nhiễm DOM."""
        try:
            cancel_btn = modal.locator("button[data-action='cancel'], button[data-action='hide'], .modal-header button.close").first
            if await cancel_btn.count() > 0:
                await cancel_btn.click(force=True)
            else:
                await page.keyboard.press("Escape")
            await page.wait_for_timeout(600)

            # Force remove backdrop nếu còn sót lại
            await page.evaluate("""() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(b => b.remove());
                document.body.classList.remove('modal-open');
            }""")
        except Exception as e:
            logger.info(f"Lưu ý khi đóng modal: {e}")

    async def enroll_users_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Luồng nghiệp vụ xử lý chính:
        1. Duyệt từng nhóm Role: Non-editing teacher (7), Manager (1), Student (9).
        2. Mỗi nhóm Role tải lại trang Participants sạch sẽ (Clean State).
        3. Mở Modal 'Enrol users' -> Gõ email vào Autocomplete -> Chọn `li[role='option']`.
        4. Với các user không tìm thấy -> Lọc bằng thanh Keyword Filter của Moodle -> Bấm ⚙️ Gia Hạn.
        5. Nếu có group_name -> Mở trang Groups -> Tạo group và Add tất cả user thành công vào group.
        """
        course_id = str(payload.get("course_id", "")).strip()
        course_name = payload.get("course_name", f"Course #{course_id}")
        end_date_str = payload.get("end_date", "")
        group_name = payload.get("group_name", "").strip()

        date_info = self._parse_date_components(end_date_str) if end_date_str else None

        # Thu thập danh sách email
        students = self._sanitize_emails(payload.get("student_emails", payload.get("students", [])))
        teachers = self._sanitize_emails(payload.get("teacher_emails", payload.get("non_editing_teachers", [])))
        managers = self._sanitize_emails(payload.get("manager_emails", payload.get("managers", [])))

        # Nếu có truyền bulk_emails rời
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
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"]
            )
            context = await browser.new_context(viewport={"width": 1440, "height": 900})
            page = await context.new_page()

            # 🚀 Chặn tải ảnh / fonts dư thừa để tiết kiệm RAM và tăng tốc 3x
            await page.route("**/*.{png,jpg,jpeg,gif,webp,ico,woff,woff2,ttf,otf}", lambda route: route.abort())

            try:
                # 1. Đăng nhập Moodle SSO
                if not await self._login_moodle_sso(page):
                    return {"status": "failed", "error": "Không thể đăng nhập vào hệ thống Moodle PLearn."}

                participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"

                role_configs = [
                    ("Non-editing teacher", "7", teachers),
                    ("Manager", "1", managers),
                    ("Student", "9", students),
                ]

                # 2. Duyệt từng nhóm Vai Trò
                for role_label, role_value, emails in role_configs:
                    if not emails:
                        continue

                    logger.info(f"👥 ==========================================================")
                    logger.info(f"👥 Đang xử lý nhóm [{role_label}] ({len(emails)} emails)...")
                    logger.info(f"👥 ==========================================================")

                    # 🌟 BƯỚC QUAN TRỌNG: Luôn Clean State tải lại trang danh sách trước mỗi Role
                    logger.info(f"📚 Truy cập trang quản lý học viên: {participants_url}")
                    await page.goto(participants_url, wait_until="domcontentloaded", timeout=40000)
                    await page.wait_for_timeout(1500)

                    emails_need_extend = []

                    # ==============================================================
                    # BƯỚC A: THỬ GHI DANH HÀNG LOẠT TRONG MODAL ENROL USERS
                    # ==============================================================
                    modal = await self._open_enrol_modal_safely(page)
                    if modal:
                        # 1. Chọn Role trong Modal
                        role_select = modal.locator("select#id_roletoassign").first
                        if await role_select.count() > 0:
                            await role_select.select_option(value=role_value)
                            await page.wait_for_timeout(200)

                        # 2. Bung "Show more..." để đặt ngày hết hạn nếu có
                        try:
                            more_btn = modal.locator("a.moreless-toggler").first
                            if await more_btn.count() > 0 and (await more_btn.get_attribute("aria-expanded")) != "true":
                                await more_btn.click(force=True)
                                await page.wait_for_timeout(300)
                        except Exception as e_sm:
                            logger.debug(f"Show more toggler: {e_sm}")

                        if date_info:
                            await self._set_moodle_datetime_selectors(modal, date_info)

                        new_selected_count = 0
                        search_user_input = modal.locator("#fitem_id_userlist input[placeholder='Search'], #fitem_id_userlist input[role='combobox']").first

                        for email in emails:
                            logger.info(f"🔍 Tìm kiếm tài khoản trong modal: {email}")
                            if await search_user_input.count() > 0:
                                await search_user_input.click(force=True)
                                await search_user_input.fill("")
                                await search_user_input.type(email, delay=35)
                                await page.wait_for_timeout(1200)

                                # 👉 Chọn trực tiếp thẻ li[role='option'] trong dropdown
                                selected_ok = False
                                suggestion_items = modal.locator("ul.form-autocomplete-suggestions li[role='option']")
                                count_sug = await suggestion_items.count()

                                for i in range(count_sug):
                                    item = suggestion_items.nth(i)
                                    item_text = (await item.inner_text()).lower()
                                    if email.lower() in item_text:
                                        await item.click(force=True)
                                        selected_ok = True
                                        break

                                # Nếu không match chuỗi cụ thể nhưng chỉ có đúng 1 gợi ý và không phải "No suggestions"
                                if not selected_ok and count_sug == 1:
                                    first_text = (await suggestion_items.first.inner_text()).lower()
                                    if "no suggestions" not in first_text:
                                        await suggestion_items.first.click(force=True)
                                        selected_ok = True

                                if selected_ok:
                                    await page.wait_for_timeout(400)
                                    new_selected_count += 1
                                    results["enrolled_new"].append({"email": email, "role": role_label})
                                    logger.info(f"➕ Đã chọn để ghi danh MỚI: {email} ({role_label})")
                                else:
                                    logger.info(f"ℹ️ Không có trong gợi ý Mới -> Kiểm tra ngoài bảng Participants để CẬP NHẬT NGÀY: {email}")
                                    emails_need_extend.append(email)

                        # Nếu có ít nhất 1 user mới được chọn -> Bấm Submit Enrol
                        if new_selected_count > 0:
                            save_btn = modal.locator(".modal-footer button[data-action='save']").first
                            await save_btn.click(force=True)
                            await page.wait_for_load_state("networkidle", timeout=25000)
                            await page.wait_for_timeout(2000)
                            logger.info(f"✅ Đã submit ghi danh {new_selected_count} tài khoản mới thành công!")
                        else:
                            # Đóng modal an toàn và dọn backdrop
                            await self._close_modal_safely(page, modal)
                    else:
                        emails_need_extend = emails

                    # ==============================================================
                    # BƯỚC B: GIA HẠN (EXTEND ACCESS CHO CÁC USER ĐÃ CÓ SẴN TRONG KHÓA)
                    # ==============================================================
                    if emails_need_extend:
                        logger.info(f"🔍 Bắt đầu kiểm tra {len(emails_need_extend)} tài khoản để Gia Hạn (Từng email một)...")

                        for email in emails_need_extend:
                            user_extended = False

                            # 1. Reset filters trước khi tìm
                            reset_btn = page.locator("button[data-filteraction='reset']:has-text('Clear filters')").first
                            if await reset_btn.count() > 0 and await reset_btn.is_visible():
                                await reset_btn.click(force=True)
                                await page.wait_for_timeout(800)

                            # 2. Chọn Filter Type là 'keywords'
                            type_select = page.locator("select[data-filterfield='type']").first
                            if await type_select.count() > 0 and await type_select.is_enabled():
                                await type_select.select_option(value="keywords")
                                await page.wait_for_timeout(400)

                            # 3. Gõ email vào ô Keyword Input & Enter
                            keyword_input = page.locator("div[data-filter-type='keywords'] input[placeholder='Type...'], div[data-filterregion='value'] input").first
                            if await keyword_input.count() > 0:
                                await keyword_input.click(force=True)
                                await keyword_input.fill("")
                                await keyword_input.type(email, delay=25)
                                await page.keyboard.press("Enter")
                                await page.wait_for_timeout(400)

                            # 4. Bấm Apply filters
                            apply_btn = page.locator("button[data-filteraction='apply']:has-text('Apply filters')").first
                            if await apply_btn.count() > 0:
                                await apply_btn.click(force=True)
                                await page.wait_for_load_state("networkidle", timeout=15000)
                                await page.wait_for_timeout(1200)

                            # 5. Khớp dòng user trong bảng theo Email (cột td.c2)
                            user_row = page.locator(f"table#participants tbody tr:has(td.c2:text-is('{email}'))").first
                            if await user_row.count() == 0:
                                user_row = page.locator(f"table#participants tbody tr:has(td.c2:has-text('{email}'))").first

                            if await user_row.count() > 0:
                                # Bấm nút bánh răng Edit Enrolment ⚙️
                                edit_gear = user_row.locator("a.editenrollink[data-action='editenrolment']").first
                                if await edit_gear.count() > 0:
                                    await edit_gear.click(force=True)
                                    
                                    # Đợi modal Edit enrolment bung lên
                                    edit_modal = page.locator("div.modal.show[data-region='modal-container']").first
                                    await edit_modal.wait_for(state="visible", timeout=8000)
                                    await page.wait_for_timeout(500)

                                    # Đổi Status -> Active (0)
                                    status_select = edit_modal.locator("select#id_status").first
                                    if await status_select.count() > 0:
                                        await status_select.select_option(value="0")

                                    # Cập nhật hạn
                                    if date_info:
                                        await self._set_moodle_datetime_selectors(edit_modal, date_info)

                                    # Bấm Save changes
                                    save_edit_btn = edit_modal.locator(".modal-footer button[data-action='save']").first
                                    await save_edit_btn.click(force=True)
                                    await page.wait_for_load_state("networkidle", timeout=15000)
                                    await page.wait_for_timeout(1000)

                                    logger.info(f"🔄 ĐÃ GIA HẠN THÀNH CÔNG cho tài khoản: {email} ({role_label}) đến ngày {end_date_str}")
                                    results["extended_access"].append({
                                        "email": email,
                                        "role": role_label,
                                        "valid_until": end_date_str
                                    })
                                    user_extended = True

                            if not user_extended:
                                logger.warning(f"⚠️ KHÔNG TÌM THẤY tài khoản trên hệ thống: {email}")
                                results["not_found"].append({
                                    "email": email,
                                    "role_intended": role_label,
                                    "reason": "Tài khoản chưa tồn tại trên Keycloak/Moodle hoặc chưa từng tham gia khóa học."
                                })

                # ==============================================================
                # BƯỚC 4: QUẢN LÝ GROUP & THÊM THÀNH VIÊN VÀO LỚP
                # ==============================================================
                valid_emails = [x["email"] for x in results["enrolled_new"]] + [x["email"] for x in results["extended_access"]]

                if group_name and valid_emails:
                    logger.info(f"🏷️ Bắt đầu tiến trình tạo Group & phân nhóm: [{group_name}]...")
                    groups_url = f"{MOODLE_BASE_URL}/group/index.php?id={course_id}"
                    await page.goto(groups_url, wait_until="domcontentloaded", timeout=35000)
                    await page.wait_for_timeout(1000)

                    # Kiểm tra xem Group đã có chưa
                    group_option = page.locator(f"select#groups option:has-text('{group_name}')").first
                    if await group_option.count() == 0:
                        logger.info(f"➕ Tạo Group mới: [{group_name}]...")
                        create_group_btn = page.locator("input#showcreateorphangroupform, input[value='Create group']").first
                        await create_group_btn.click(force=True)
                        await page.wait_for_load_state("domcontentloaded")

                        await page.fill("input#id_name", group_name)
                        await page.click("input#id_submitbutton, input[value='Save changes']", force=True)
                        await page.wait_for_load_state("domcontentloaded")
                        await page.wait_for_timeout(1000)

                    # Chọn Group vừa tạo/có sẵn
                    group_option = page.locator(f"select#groups option:has-text('{group_name}')").first
                    if await group_option.count() > 0:
                        await group_option.click(force=True)
                        await page.wait_for_timeout(400)

                        # Bấm nút Add/remove users
                        add_members_btn = page.locator("input#showaddmembersform, input[value='Add/remove users']").first
                        if await add_members_btn.count() > 0 and await add_members_btn.is_enabled():
                            await add_members_btn.click(force=True)
                            await page.wait_for_load_state("domcontentloaded")
                            await page.wait_for_timeout(800)

                            # Thêm từng user vào group
                            for u_email in valid_emails:
                                search_potential = page.locator("input#addselect_searchtext").first
                                if await search_potential.count() > 0:
                                    await search_potential.fill(u_email)
                                    await page.wait_for_timeout(1000)

                                    potential_opt = page.locator(f"select#addselect option:has-text('{u_email}')").first
                                    if await potential_opt.count() > 0:
                                        await potential_opt.click(force=True)
                                        await page.wait_for_timeout(300)

                                        add_btn = page.locator("input#add, input[value*='Add']").first
                                        if await add_btn.count() > 0 and await add_btn.is_enabled():
                                            await add_btn.click(force=True)
                                            await page.wait_for_load_state("domcontentloaded")
                                            await page.wait_for_timeout(600)
                                            results["group_members_added"].append(u_email)
                                            logger.info(f"✅ Đã thêm vào Group [{group_name}]: {u_email}")

                            # Bấm Back to groups
                            back_btn = page.locator("input[name='cancel'][value='Back to groups']").first
                            if await back_btn.count() > 0:
                                await back_btn.click(force=True)
                                await page.wait_for_load_state("domcontentloaded")

                            results["group_created"] = group_name

                # Tổng kết kết quả
                success_count = len(results["enrolled_new"]) + len(results["extended_access"])
                status = "success" if success_count > 0 else "failed"

                return {
                    "status": status,
                    "course_id": course_id,
                    "course_name": course_name,
                    "message": f"Đã xử lý {success_count}/{total_requested} tài khoản (Mới: {len(results['enrolled_new'])}, Gia hạn: {len(results['extended_access'])}, Lỗi: {len(results['not_found'])}).",
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


playwright_lms_service = PlaywrightLMSService()