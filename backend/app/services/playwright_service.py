# backend/app/services/playwright_service.py
import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from playwright.async_api import async_playwright, Page, Browser

from app.core.config import settings

logger = logging.getLogger(__name__)

MOODLE_BASE_URL = "https://learn.pythaverse.space"


class PlaywrightLMSService:
    """
    Playwright Worker tự động hóa 100% trên Moodle PLearn (learn.pythaverse.space):
    - Đăng nhập Keycloak OpenID Connect SSO.
    - Ghi danh tài khoản mới (Enrol users) theo Role (Student, Non-editing teacher, Manager).
    - Gia hạn ngày truy cập (Extend access via Edit enrolment) nếu tài khoản đã tồn tại.
    - Báo lỗi rõ ràng nếu tài khoản không tồn tại.
    - Quản lý Group: Tự động tạo Group và Add học viên vào nhóm.
    """

    def _sanitize_emails(self, email_list: Any) -> List[str]:
        """Làm sạch và lọc trùng email."""
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
        """Đăng nhập Moodle qua Keycloak SSO theo đúng form HTML thực tế."""
        try:
            admin_user = settings.TEST_ADMIN_USER or "adminworkspace"
            admin_pass = settings.TEST_ADMIN_PASS or settings.KEYCLOAK_ADMIN_PASS or ""

            logger.info("🔑 Đang mở cổng đăng nhập Moodle PLearn...")
            await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="networkidle", timeout=40000)

            # Nếu bị redirect sang Keycloak EID (eid.pythaverse.space)
            if "eid.pythaverse.space" in page.url or await page.locator("input#username, input[name='username']").count() > 0:
                logger.info("🔐 Đang điền thông tin đăng nhập trên Pythaverse EID Keycloak...")
                await page.fill("input#username", admin_user)
                await page.fill("input#password", admin_pass)
                await page.click("input#kc-login, button[type='submit']", force=True)
                await page.wait_for_load_state("networkidle", timeout=40000)

            # Kiểm tra đăng nhập thành công
            if await page.locator(".usermenu, a[title='User menu'], .userinitials").count() > 0 or "login" not in page.url:
                logger.info("✅ Đăng nhập Moodle LMS PLearn thành công!")
                return True

            logger.error(f"❌ Không thể đăng nhập. URL hiện tại: {page.url}")
            return False
        except Exception as e:
            logger.error(f"❌ Lỗi Exception khi đăng nhập Moodle SSO: {e}")
            return False

    async def _set_moodle_datetime_selectors(self, modal_locator, date_info: Dict[str, str]):
        """Helper điền các dropdown ngày tháng năm trong modal Moodle."""
        try:
            enable_chk = modal_locator.locator("input#id_timeend_enabled, input[name='timeend[enabled]']").first
            if await enable_chk.count() > 0 and not await enable_chk.is_checked():
                await enable_chk.check(force=True)
                await asyncio.sleep(0.3)

            day_sel = modal_locator.locator("select#id_timeend_day, select[name='timeend[day]']").first
            if await day_sel.count() > 0:
                await day_sel.select_option(date_info["day"])

            month_sel = modal_locator.locator("select#id_timeend_month, select[name='timeend[month]']").first
            if await month_sel.count() > 0:
                await month_sel.select_option(date_info["month"])

            year_sel = modal_locator.locator("select#id_timeend_year, select[name='timeend[year]']").first
            if await year_sel.count() > 0:
                await year_sel.select_option(date_info["year"])

            hour_sel = modal_locator.locator("select#id_timeend_hour, select[name='timeend[hour]']").first
            if await hour_sel.count() > 0:
                await hour_sel.select_option(date_info["hour"])

            min_sel = modal_locator.locator("select#id_timeend_minute, select[name='timeend[minute]']").first
            if await min_sel.count() > 0:
                await min_sel.select_option(date_info["minute"])
        except Exception as e:
            logger.warning(f"⚠️ Lỗi khi chọn ngày tháng: {e}")

    async def _open_enrol_modal_safely(self, page: Page):
        """Kích hoạt mở Modal Enrol Users bọc thép an toàn tuyệt đối và trả về locator của modal."""
        try:
            await page.wait_for_selector(".enrolusersbutton, input[value='Enrol users']", timeout=15000)
            await page.wait_for_timeout(800)

            # Bấm nút Enrol users (dùng force=True để không bị intercept)
            enrol_btn = page.locator(".enrolusersbutton input[value='Enrol users'], input[value='Enrol users']").first
            if await enrol_btn.count() > 0:
                await enrol_btn.click(force=True)

            for _ in range(3):
                modal = page.locator(".modal.show, div[role='dialog']:has-text('Enrolment options'), .modal-dialog").first
                if await modal.count() > 0 and await modal.is_visible():
                    logger.info("✨ Đã mở thành công Enrol users modal!")
                    await page.wait_for_timeout(600)
                    return modal

                # Trigger qua JS
                logger.info("🔄 Trigger mở Modal qua JavaScript...")
                await page.evaluate("""() => {
                    const btn = document.querySelector(".enrolusersbutton input[value='Enrol users'], #enrolusersbutton-1 input");
                    if (btn) btn.click();
                }""")
                await page.wait_for_timeout(1200)

            modal = page.locator(".modal.show, div[role='dialog'], .modal-dialog").first
            if await modal.count() > 0:
                return modal
            return None
        except Exception as e:
            logger.warning(f"⚠️ Lỗi khi mở Enrol users modal: {e}")
            return None

    async def enroll_users_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Luồng nghiệp vụ xử lý chính:
        1. Duyệt từng nhóm Role: Manager (1), Non-editing teacher (7), Student (9).
        2. Mở Modal 'Enrol users' -> Tìm kiếm & chọn hàng loạt User qua Autocomplete Moodle.
        3. Với các user không tìm thấy trong Modal -> Lọc ngoài bảng Participants bằng Keyword Filter để Gia hạn (Extend).
        4. Báo cáo rõ ràng tài khoản nào thành công, tài khoản nào không tồn tại.
        5. Nếu có group_name -> Mở trang Groups -> Tạo group và Add tất cả user thành công vào group.
        """
        course_id = str(payload.get("course_id", "")).strip()
        course_name = payload.get("course_name", f"Course #{course_id}")
        end_date_str = payload.get("end_date", "")
        group_name = payload.get("group_name", "").strip()

        date_info = self._parse_date_components(end_date_str) if end_date_str else None

        # 🟢 Thu thập danh sách email an toàn từ payload
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

            try:
                # 1. Đăng nhập Moodle
                if not await self._login_moodle_sso(page):
                    return {"status": "failed", "error": "Không thể đăng nhập vào hệ thống Moodle PLearn."}

                # 2. Mở trang Participants của khóa học
                participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"
                logger.info(f"📚 Truy cập trang quản lý học viên: {participants_url}")
                await page.goto(participants_url, wait_until="networkidle", timeout=40000)

                role_configs = [
                    ("Non-editing teacher", "7", teachers),
                    ("Manager", "1", managers),
                    ("Student", "9", students),
                ]

                # 3. Duyệt từng nhóm Vai Trò
                for role_label, role_value, emails in role_configs:
                    if not emails:
                        continue

                    logger.info(f"👥 Đang xử lý nhóm [{role_label}] ({len(emails)} emails)...")
                    emails_need_extend = []

                    # ==============================================================
                    # BƯỚC 3.1: THỬ GHI DANH HÀNG LOẠT TRONG MODAL ENROL USERS
                    # ==============================================================
                    modal = await self._open_enrol_modal_safely(page)
                    if modal:
                        # Chọn Role trong Modal
                        role_select = modal.locator("select#id_roletoassign").first
                        if await role_select.count() > 0:
                            await role_select.select_option(value=role_value)
                            await page.wait_for_timeout(300)

                        # 👉 BUNG SHOW MORE BẰNG JS & FORCE ĐỂ KHÔNG BỊ INTERCEPT
                        try:
                            await page.evaluate("""() => {
                                const btn = document.querySelector(".modal.show a.moreless-toggler, div[role='dialog'] a.moreless-toggler");
                                if (btn && btn.getAttribute("aria-expanded") !== "true") {
                                    btn.click();
                                }
                            }""")
                            await page.wait_for_timeout(400)
                        except Exception as e_sm:
                            logger.info(f"Show more toggler info: {e_sm}")

                        if date_info:
                            await self._set_moodle_datetime_selectors(modal, date_info)

                        new_selected_count = 0
                        search_user_input = modal.locator("#fitem_id_userlist input[placeholder*='Search'], #fitem_id_userlist input[role='combobox']").first

                        for email in emails:
                            if await search_user_input.count() > 0:
                                await search_user_input.click(force=True)
                                await search_user_input.fill("")
                                await search_user_input.type(email, delay=40)
                                await page.wait_for_timeout(1800)

                                # Tìm dropdown gợi ý (Moodle render họ tên + email)
                                suggestion_item = page.locator(f"ul.form-autocomplete-suggestions li[role='option']:has-text('{email}')").first
                                
                                if await suggestion_item.count() > 0 and await suggestion_item.is_visible():
                                    await suggestion_item.click(force=True)
                                    await page.wait_for_timeout(600)
                                    new_selected_count += 1
                                    results["enrolled_new"].append({"email": email, "role": role_label})
                                    logger.info(f"➕ Đã chọn để ghi danh MỚI: {email} ({role_label})")
                                else:
                                    # Thử bấm phím ArrowDown -> Enter để chọn gợi ý active
                                    await page.keyboard.press("ArrowDown")
                                    await page.wait_for_timeout(200)
                                    await page.keyboard.press("Enter")
                                    await page.wait_for_timeout(400)

                                    # Kiểm tra xem có được thêm vào tag selection chưa
                                    selected_badge = modal.locator(f"#fitem_id_userlist .form-autocomplete-selection span[role='option']:has-text('{email}')").first
                                    if await selected_badge.count() > 0:
                                        new_selected_count += 1
                                        results["enrolled_new"].append({"email": email, "role": role_label})
                                        logger.info(f"➕ Đã chọn để ghi danh MỚI (qua Enter): {email} ({role_label})")
                                    else:
                                        logger.info(f"ℹ️ Không có trong gợi ý Enrol mới, chuyển sang kiểm tra Gia hạn: {email}")
                                        emails_need_extend.append(email)

                        # Nếu có ít nhất 1 user mới được chọn -> Bấm Submit Enrol
                        if new_selected_count > 0:
                            save_btn = modal.locator(".modal-footer button[data-action='save'], button:has-text('Enrol selected users')").first
                            await save_btn.click(force=True)
                            await page.wait_for_load_state("networkidle")
                            await page.wait_for_timeout(2000)
                            logger.info(f"✅ Đã submit ghi danh {new_selected_count} tài khoản mới thành công!")
                        else:
                            # Đóng modal an toàn
                            cancel_modal_btn = modal.locator(".modal-footer button[data-action='cancel'], button.close").first
                            if await cancel_modal_btn.count() > 0:
                                await cancel_modal_btn.click(force=True)
                                await page.wait_for_timeout(500)
                    else:
                        emails_need_extend = emails

                    # ==============================================================
                    # BƯỚC 3.2: GIA HẠN (EXTEND ACCESS CHO CÁC USER ĐÃ CÓ SẴN)
                    # ==============================================================
                    if emails_need_extend:
                        logger.info(f"🔍 Bắt đầu kiểm tra {len(emails_need_extend)} tài khoản để Gia Hạn...")

                        for email in emails_need_extend:
                            user_extended = False

                            # Chọn filter type 'keywords'
                            filter_type_select = page.locator("select[id^='core_user-local-participantsfilter-filterrow-filtertype-']").first
                            if await filter_type_select.count() > 0 and await filter_type_select.is_enabled():
                                await filter_type_select.select_option(value="keywords")
                                await page.wait_for_timeout(400)

                            # Nhập email vào ô Keyword Filter
                            keyword_input = page.locator("[data-filter-type='keywords'] input[placeholder='Type...'], [data-filter-type='keywords'] input[id^='form_autocomplete_input-']").first
                            if await keyword_input.count() > 0:
                                await keyword_input.fill(email)
                                await page.keyboard.press("Enter")
                                await page.wait_for_timeout(400)

                            # Bấm Apply filters 2 LẦN
                            apply_filter_btn = page.locator("button[data-filteraction='apply']").first
                            if await apply_filter_btn.count() > 0:
                                await apply_filter_btn.click(force=True)
                                await page.wait_for_timeout(700)
                                await apply_filter_btn.click(force=True)
                                await page.wait_for_load_state("networkidle")
                                await page.wait_for_timeout(1500)

                            # Khớp chính xác dòng user theo email ở cột C2
                            user_row = page.locator(f"table#participants tbody tr:has(td.c2:text-is('{email}'))").first
                            if await user_row.count() == 0:
                                user_row = page.locator(f"table#participants tbody tr:has(td.c2:has-text('{email}'))").first

                            if await user_row.count() > 0:
                                edit_gear = user_row.locator("a.editenrollink[data-action='editenrolment']").first
                                if await edit_gear.count() > 0:
                                    await edit_gear.click(force=True)
                                    await page.wait_for_selector(".modal.show, .modal-dialog", timeout=8000)
                                    await page.wait_for_timeout(500)

                                    edit_modal = page.locator(".modal.show, .modal-dialog").first

                                    # Đổi Status Active (0)
                                    status_select = edit_modal.locator("select#id_status").first
                                    if await status_select.count() > 0:
                                        await status_select.select_option(value="0")

                                    # Cập nhật hạn
                                    if date_info:
                                        await self._set_moodle_datetime_selectors(edit_modal, date_info)

                                    # Save changes
                                    save_edit_btn = edit_modal.locator(".modal-footer button[data-action='save'], button:has-text('Save changes')").first
                                    await save_edit_btn.click(force=True)
                                    await page.wait_for_load_state("networkidle")
                                    await page.wait_for_timeout(1000)

                                    logger.info(f"🔄 ĐÃ GIA HẠN THÀNH CÔNG cho tài khoản: {email} ({role_label})")
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

                # ==========================================
                # BƯỚC 4: QUẢN LÝ GROUP & THÊM THÀNH VIÊN
                # ==========================================
                valid_emails = [x["email"] for x in results["enrolled_new"]] + [x["email"] for x in results["extended_access"]]

                if group_name and valid_emails:
                    logger.info(f"🏷️ Bắt đầu tiến trình tạo Group & phân nhóm: [{group_name}]...")
                    groups_url = f"{MOODLE_BASE_URL}/group/index.php?id={course_id}"
                    await page.goto(groups_url, wait_until="networkidle", timeout=35000)

                    # Kiểm tra xem Group đã có chưa
                    group_option = page.locator(f"select#groups option:has-text('{group_name}')").first
                    if await group_option.count() == 0:
                        logger.info(f"➕ Tạo Group mới: [{group_name}]...")
                        create_group_btn = page.locator("input#showcreateorphangroupform, input[value='Create group']").first
                        await create_group_btn.click(force=True)
                        await page.wait_for_load_state("networkidle")

                        await page.fill("input#id_name", group_name)
                        await page.click("input#id_submitbutton, input[value='Save changes']", force=True)
                        await page.wait_for_load_state("networkidle")
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
                            await page.wait_for_load_state("networkidle")
                            await page.wait_for_timeout(800)

                            # Thêm từng user vào group
                            for u_email in valid_emails:
                                search_potential = page.locator("input#addselect_searchtext").first
                                if await search_potential.count() > 0:
                                    await search_potential.fill(u_email)
                                    await page.wait_for_timeout(1200)

                                    potential_opt = page.locator(f"select#addselect option:has-text('{u_email}')").first
                                    if await potential_opt.count() > 0:
                                        await potential_opt.click(force=True)
                                        await page.wait_for_timeout(300)

                                        add_btn = page.locator("input#add, input[value*='Add']").first
                                        if await add_btn.count() > 0 and await add_btn.is_enabled():
                                            await add_btn.click(force=True)
                                            await page.wait_for_load_state("networkidle")
                                            await page.wait_for_timeout(600)
                                            results["group_members_added"].append(u_email)
                                            logger.info(f"✅ Đã thêm vào Group [{group_name}]: {u_email}")

                            # Bấm Back to groups
                            back_btn = page.locator("input[name='cancel'][value='Back to groups']").first
                            if await back_btn.count() > 0:
                                await back_btn.click(force=True)
                                await page.wait_for_load_state("networkidle")

                            results["group_created"] = group_name

                # Tổng kết kết quả trả về
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