# backend/app/services/playwright_service.py
import logging
import asyncio
import gc
from typing import Dict, Any, List, Optional
from datetime import datetime
from playwright.async_api import async_playwright, Page, Browser, Locator, Error as PlaywrightError

from app.core.config import settings
from app.core.playwright_manager import (
    acquire_playwright_slot,
    LOW_RAM_CHROMIUM_ARGS,
    setup_low_ram_routes,
    wait_for_dom_and_spinners
)

logger = logging.getLogger(__name__)

MOODLE_BASE_URL = "https://learn.pythaverse.space"


class PlaywrightLMSService:
    """
    Playwright Worker tự động hóa 100% trên Moodle PLearn Edwiser RemUI (learn.pythaverse.space):
    - Đăng nhập Keycloak OpenID Connect SSO an toàn 1 lần duy nhất cho toàn bộ chuỗi khóa học.
    - Hỗ trợ Ghi danh Hàng Loạt Nhiều Khóa Học (Batch Multi-Course) trong cùng 1 phiên làm việc.
    - Tự động bung 'Show more...', cài đặt cả Starting from (Start date) và Enrolment ends (End date).
    - Smart Fallback 2 nhịp chuẩn: Lọc Tag Pill -> Apply Filter -> Đổi Mono-Role ✏️ -> Gia hạn ngày ⚙️.
    - Triệt tiêu lỗi Element is outside of viewport.
    - Xóa người dùng khỏi khóa học (Unenrol 🗑️).
    - Tạo Group & Phân nhóm lớp tự động từng khóa.
    """

    def __init__(self):
        self.headless = True

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
        """Chuyển chuỗi ngày sang dict day/month/year."""
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
        """Đăng nhập Moodle qua Keycloak SSO kháng lỗi Navigation Destroyed."""
        try:
            admin_user = getattr(settings, "TEST_ADMIN_USER", None)
            admin_pass = getattr(settings, "TEST_ADMIN_PASS", None)

            if not admin_pass:
                logger.error("❌ Không tìm thấy mật khẩu quản trị Keycloak trong biến môi trường!")
                return False

            logger.info("🔑 Đang mở cổng đăng nhập Moodle PLearn...")
            response = await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="domcontentloaded", timeout=45000)

            if response and response.status >= 500:
                logger.error(f"🔥 Máy chủ Moodle phản hồi mã lỗi HTTP {response.status}")
                return False

            await page.wait_for_load_state("domcontentloaded")

            username_input = page.locator("input#username, input[name='username'], #username").first
            try:
                if await username_input.count() > 0 and await username_input.is_visible():
                    logger.info(f"🔐 Điền thông tin Keycloak: {admin_user}")
                    await username_input.fill(admin_user)
                    await page.fill("input#password, input[name='password'], #password", admin_pass)
                    
                    login_btn = page.locator("input#kc-login, button[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')").first
                    try:
                        async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                            await login_btn.click()
                    except Exception:
                        pass
            except PlaywrightError as pe:
                logger.debug(f"ℹ️ Bỏ qua form đăng nhập (có thể đã có session): {pe}")

            try:
                await page.wait_for_load_state("domcontentloaded", timeout=15000)
            except Exception:
                pass

            # Chờ xác nhận đã vào trong Moodle
            user_menu = page.locator(".usermenu, a[title='User menu'], .userinitials, .site-name, a[href*='/login/logout.php']").first
            try:
                await user_menu.wait_for(state="visible", timeout=20000)
                logger.info("✅ Đăng nhập Moodle LMS PLearn thành công!")
                return True
            except Exception:
                if "login" not in page.url:
                    logger.info(f"✅ Đăng nhập Moodle LMS PLearn thành công (URL bypass: {page.url})!")
                    return True

            logger.error(f"❌ Không thể xác nhận phiên đăng nhập Moodle. URL hiện tại: {page.url}")
            return False
        except Exception as e:
            logger.error(f"❌ Lỗi Exception khi đăng nhập Moodle SSO: {e}")
            return False

    async def _close_modal_safely(self, page: Page, modal: Locator):
        """Đóng modal và dọn dẹp sạch sẽ backdrop chống Layout Freeze."""
        try:
            cancel_btn = modal.locator("button[data-action='cancel'], button[data-action='hide'], .modal-header button.close").first
            if await cancel_btn.count() > 0 and await cancel_btn.is_visible():
                await cancel_btn.click(force=True)
            else:
                await page.keyboard.press("Escape")
            
            try:
                await modal.wait_for(state="hidden", timeout=3000)
            except Exception:
                pass

            await page.evaluate("""() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(b => b.remove());
                document.body.classList.remove('modal-open');
            }""")
        except Exception as e:
            logger.debug(f"Đóng modal safely: {e}")

    async def _apply_keyword_filter(self, page: Page, email: str) -> None:
        """
        Thao tác chuẩn hóa bộ lọc Keyword 2 nhịp (Chuẩn hóa theo file test):
        - Nhịp 1: Chọn Keywords -> Gõ email vào ô Type... -> Nhấn Enter sinh Tag Pill.
        - Nhịp 2: Bấm Apply filters -> Chờ AJAX Moodle nạp lại bảng.
        - Triệt tiêu hoàn toàn lỗi 'Element is outside of the viewport'.
        """
        try:
            # 1. Reset filter cũ nếu có
            reset_btn = page.locator("button[data-filteraction='reset']:has-text('Clear filters')").first
            if await reset_btn.count() > 0 and await reset_btn.is_visible():
                await reset_btn.click(force=True)
                try:
                    await page.locator("div.loading-icon, .overlay-icon").wait_for(state="hidden", timeout=3000)
                except Exception:
                    pass

            # 2. Đảm bảo chọn filter type là Keyword
            type_select = page.locator("select[data-filterfield='type']").first
            if await type_select.count() > 0 and await type_select.is_enabled():
                await type_select.select_option(value="keywords")
            
            # Ép Moodle JS kích hoạt render trường value
            await page.evaluate("""() => {
                const sel = document.querySelector("select[data-filterfield='type']");
                if (sel) {
                    sel.value = 'keywords';
                    if (window.jQuery) {
                        window.jQuery(sel).trigger('change');
                    } else {
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }""")

            # 3. Nhịp 1: Chờ ô Type... xuất hiện thực tế, scroll vào view và gõ email + Enter
            kw_input = page.locator("div[data-filterregion='value'] input[placeholder='Type...'], div[data-filter-type='keywords'] input, div[data-filterregion='value'] input").first
            await kw_input.wait_for(state="visible", timeout=10000)
            await kw_input.scroll_into_view_if_needed()
            await kw_input.click(force=True)
            await kw_input.fill("")
            await kw_input.fill(email)
            await kw_input.press("Enter")

            # Chờ Tag Pill xuất hiện trong khung selection
            tag_badge = page.locator("div[data-filterregion='value'] .form-autocomplete-selection span.badge, div[data-filterregion='value'] span.badge").filter(has_text=email).first
            try:
                await tag_badge.wait_for(state="visible", timeout=5000)
            except Exception:
                pass

            # 4. Nhịp 2: Bấm Apply filters và bắt Response AJAX cập nhật bảng
            apply_btn = page.locator("button[data-filteraction='apply']:has-text('Apply filters'), button[data-filteraction='apply']").first
            if await apply_btn.count() > 0:
                await apply_btn.scroll_into_view_if_needed()
                try:
                    async with page.expect_response(
                        lambda r: "service.php" in r.url and r.status == 200,
                        timeout=12000
                    ):
                        await apply_btn.click(force=True)
                except Exception:
                    await apply_btn.click(force=True)

            # Chờ bảng nạp xong
            try:
                await page.locator("div.loading-icon, .MuiCircularProgress-root, .overlay-icon").wait_for(state="hidden", timeout=6000)
            except Exception:
                pass

        except Exception as e:
            logger.warning(f"⚠️ Cảnh báo áp dụng bộ lọc Keyword: {e}. Tiếp tục quét bảng...")

    async def _update_user_role_in_table(self, page: Page, user_row: Locator, target_role_label: str) -> bool:
        """Cập nhật vai trò (Mono-Role) trực tiếp ở cột Roles (td.cell.c3) bằng icon bút chì ✏️."""
        try:
            role_cell = user_row.locator("td.cell.c3, td.c3").first
            current_role_text = (await role_cell.inner_text()).strip()
            
            # Nếu role đã khớp thì không cần chỉnh sửa
            if target_role_label.lower() in current_role_text.lower():
                return True

            logger.info(f"✏️ Phát hiện Role khác biệt (Hiện tại: '{current_role_text}' ➔ Muốn đổi sang: '{target_role_label}'). Đang cập nhật...")
            
            pencil_btn = role_cell.locator("a.quickeditlink, a[data-inplaceeditablelink='1']").first
            if await pencil_btn.count() == 0:
                return False

            await pencil_btn.scroll_into_view_if_needed()
            await pencil_btn.click(force=True)

            down_arrow = role_cell.locator("span.form-autocomplete-downarrow, .edw-icon-Down-Arrow").first
            try:
                await down_arrow.wait_for(state="visible", timeout=4000)
            except Exception:
                pass

            # Xóa các role cũ (Mono-role replacement)
            while True:
                old_cancel = role_cell.locator(".form-autocomplete-selection span.badge span.edw-icon-Cancel, .badge .edw-icon-Cancel")
                if await old_cancel.count() > 0:
                    await old_cancel.first.click(force=True)
                    await asyncio.sleep(0.2)
                else:
                    break

            if await down_arrow.count() > 0:
                await down_arrow.click(force=True)

            new_opt = role_cell.locator("ul.form-autocomplete-suggestions li").filter(has_text=target_role_label).first
            await new_opt.wait_for(state="visible", timeout=4000)
            await new_opt.click(force=True)

            # Bấm nút lưu (icon đĩa mềm)
            save_disk = role_cell.locator("i.fa-floppy-o, a:has(i.fa-floppy-o)").first
            if await save_disk.count() > 0 and await save_disk.is_visible():
                try:
                    async with page.expect_response(lambda r: "service.php" in r.url and r.status == 200, timeout=8000):
                        await save_disk.click(force=True)
                except Exception:
                    await save_disk.click(force=True)
            else:
                await page.keyboard.press("Enter")

            logger.info(f"✅ Đã đổi Role thành công sang [{target_role_label}]!")
            return True
        except Exception as e:
            logger.warning(f"⚠️ Không thể cập nhật Role qua quickedit: {e}")
            return False

    async def _internal_enroll_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Thực thi nghiệp vụ ghi danh hỗ trợ 1 hoặc NHIỀU KHÓA HỌC trong 1 phiên duy nhất."""
        raw_courses = payload.get("courses", [])
        if not raw_courses and payload.get("course_id"):
            raw_courses = [{
                "course_id": payload.get("course_id"),
                "course_name": payload.get("course_name", f"Course #{payload.get('course_id')}"),
                "start_date": payload.get("start_date", ""),
                "end_date": payload.get("end_date", ""),
                "group_name": payload.get("group_name", "")
            }]

        if not raw_courses:
            return {"status": "failed", "error": "Không có thông tin khóa học nào để ghi danh."}

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
        logger.info(f"📋 BẮT ĐẦU CHUỖI GHI DANH {len(raw_courses)} KHÓA HỌC | Tổng emails: {total_requested} (Học viên: {len(students)}, Trợ giảng: {len(teachers)}, Quản lý: {len(managers)})")

        if total_requested == 0:
            return {"status": "failed", "error": "Không có email nào được cung cấp để thực hiện ghi danh."}

        batch_course_results = []

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(
                headless=self.headless,
                args=LOW_RAM_CHROMIUM_ARGS
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            )
            await setup_low_ram_routes(context)
            page = await context.new_page()
            page.set_default_timeout(35000)

            try:
                # 🔑 ĐĂNG NHẬP 1 LẦN DUY NHẤT CHO TOÀN BỘ CÁC KHÓA
                if not await self._login_moodle_sso(page):
                    return {"status": "failed", "error": "Không thể đăng nhập vào hệ thống Moodle PLearn."}

                # VÒNG LẶP DUYỆT TỪNG KHÓA HỌC
                for c_idx, c_info in enumerate(raw_courses):
                    course_id = str(c_info.get("course_id", "")).strip()
                    course_name = c_info.get("course_name", f"Course #{course_id}")
                    end_date_str = c_info.get("end_date", payload.get("end_date", ""))
                    start_date_option = str(c_info.get("start_date_type", c_info.get("start_date", payload.get("start_date", "4")))).strip()
                    group_name = c_info.get("group_name", "").strip()

                    date_info = self._parse_date_components(end_date_str) if end_date_str else None

                    logger.info(f"\n=======================================================")
                    logger.info(f"📚 [{c_idx + 1}/{len(raw_courses)}] ĐANG XỬ LÝ KHÓA: {course_name} (ID: {course_id})")
                    logger.info(f"=======================================================")

                    course_results = {
                        "course_id": course_id,
                        "course_name": course_name,
                        "enrolled_new": [],
                        "extended_access": [],
                        "not_found": [],
                        "group_created": None,
                        "group_members_added": []
                    }

                    participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"
                    role_configs = [
                        ("Non-editing teacher", "7", teachers),
                        ("Manager", "1", managers),
                        ("Student", "9", students),
                    ]

                    all_valid_emails_for_group = []

                    for role_label, role_value, emails in role_configs:
                        if not emails:
                            continue

                        logger.info(f"👥 Đang xử lý nhóm [{role_label}] ({len(emails)} emails)...")

                        await page.goto(participants_url, wait_until="domcontentloaded", timeout=45000)
                        await wait_for_dom_and_spinners(page, "#page-content, #region-main, table#participants", min_pacing_ms=300)

                        new_enrolled_emails_in_group = []

                        # ------------------------------------------------------
                        # BƯỚC 1: ENROL MỚI TRONG MODAL
                        # ------------------------------------------------------
                        enrol_btn = page.locator("form[id^='enrolusersbutton'] input[type='submit'], input[value='Enrol users'], button:has-text('Enrol users')").first
                        if await enrol_btn.count() > 0:
                            await enrol_btn.wait_for(state="visible", timeout=15000)
                            await enrol_btn.scroll_into_view_if_needed()
                            await enrol_btn.click()

                            modal = page.locator("div.modal.show[data-region='modal-container'], div.modal.show:has-text('Enrol users')").first
                            await modal.wait_for(state="visible", timeout=15000)

                            # 1. Chọn Role
                            try:
                                await page.evaluate(f"""() => {{
                                    const sel = document.querySelector(".modal.show select#id_roletoassign, select#id_roletoassign");
                                    if (sel) {{
                                        sel.value = '{role_value}';
                                        sel.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                    }}
                                }}""")
                            except Exception:
                                role_select = modal.locator("select#id_roletoassign").first
                                if await role_select.count() > 0:
                                    await role_select.select_option(value=role_value, force=True)

                            # 2. Bung Show more & Cài ngày
                            if start_date_option not in ["2", "3", "4"]:
                                start_date_option = "4"

                            if date_info or start_date_option != "4":
                                show_more_link = modal.locator("a.moreless-toggler").first
                                if await show_more_link.count() > 0:
                                    is_expanded = await show_more_link.get_attribute("aria-expanded")
                                    if is_expanded != "true":
                                        await show_more_link.scroll_into_view_if_needed()
                                        await show_more_link.click(force=True)
                                        try:
                                            await modal.locator("#form-advanced-div").wait_for(state="visible", timeout=4000)
                                        except Exception:
                                            pass

                                try:
                                    await page.evaluate(f"""() => {{
                                        const startSel = document.querySelector(".modal.show select#id_startdate, select#id_startdate");
                                        if (startSel) {{
                                            startSel.value = '{start_date_option}';
                                            startSel.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                        }}
                                    }}""")
                                    logger.info(f"⏱️ Đã chọn Starting from (Option: {start_date_option})")
                                except Exception as e:
                                    logger.debug(f"Không set được startdate: {e}")

                            if date_info:
                                logger.info(f"📅 Cài đặt Enrolment ends: {end_date_str}")
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

                            # 3. Đợi ô Search của RequireJS
                            search_user_input = modal.locator(
                                "#fitem_id_userlist input[placeholder='Search'], #fitem_id_userlist input[role='combobox'], #fitem_id_userlist input.form-control"
                            ).first
                            try:
                                await search_user_input.wait_for(state="visible", timeout=12000)
                            except Exception as e:
                                logger.warning(f"⚠️ Ô tìm kiếm modal chưa sẵn sàng: {e}")

                            new_selected_count = 0
                            suggestions_list = modal.locator("ul.form-autocomplete-suggestions")

                            for email in emails:
                                clean_email = email.strip().lower()
                                logger.info(f"🔍 Tìm kiếm tài khoản trong modal: {clean_email}")
                                
                                try:
                                    if await search_user_input.count() > 0 and await search_user_input.is_visible():
                                        await search_user_input.scroll_into_view_if_needed()
                                        await search_user_input.click(force=True)
                                        await search_user_input.fill("")
                                        await search_user_input.press_sequentially(clean_email, delay=30)

                                        target_option = suggestions_list.locator("li[role='option']").filter(has_text=clean_email).first
                                        await target_option.wait_for(state="visible", timeout=4000)
                                        await target_option.click(force=True)

                                        new_selected_count += 1
                                        new_enrolled_emails_in_group.append(clean_email)
                                        all_valid_emails_for_group.append(clean_email)
                                        course_results["enrolled_new"].append({"email": clean_email, "role": role_label, "valid_until": end_date_str})
                                        logger.info(f"➕ Đã chọn để ghi danh MỚI: {clean_email} ({role_label})")
                                    else:
                                        logger.info(f"ℹ️ Không thấy ô tìm kiếm -> Chuyển Fallback: {clean_email}")
                                except Exception:
                                    logger.info(f"ℹ️ Không có trong gợi ý Mới -> Sẽ kiểm tra Fallback ngoài bảng: {clean_email}")

                            if new_selected_count > 0:
                                save_btn = modal.locator(".modal-footer button[data-action='save'], button:has-text('Enrol selected users and cohorts')").first
                                try:
                                    async with page.expect_response(lambda r: "service.php" in r.url and r.status == 200, timeout=15000):
                                        await save_btn.click(force=True)
                                except Exception:
                                    await save_btn.click(force=True)
                                
                                try:
                                    await modal.wait_for(state="hidden", timeout=15000)
                                except Exception:
                                    await self._close_modal_safely(page, modal)
                                logger.info(f"✅ Đã submit ghi danh {new_selected_count} tài khoản mới thành công!")
                            else:
                                await self._close_modal_safely(page, modal)

                        # ------------------------------------------------------
                        # BƯỚC 2: SMART FALLBACK (GIA HẠN + ĐỔI ROLE NẾU KHÁC BIỆT ✏️)
                        # ------------------------------------------------------
                        emails_need_fallback = [e for e in emails if e not in new_enrolled_emails_in_group]

                        if emails_need_fallback:
                            logger.info(f"🔄 BẮT ĐẦU SMART FALLBACK CHO {len(emails_need_fallback)} TÀI KHOẢN TRONG BẢNG...")

                            for email in emails_need_fallback:
                                user_extended = False
                                
                                # Áp dụng bộ lọc Keyword 2 nhịp (đã loại bỏ Outside Viewport)
                                await self._apply_keyword_filter(page, email)

                                user_row = page.locator("table#participants tbody tr").filter(
                                    has=page.locator("td.cell.c2, td.c2", has_text=email)
                                ).first

                                if await user_row.count() > 0:
                                    # 1. Kiểm tra và đổi Role bằng icon bút chì nếu Role hiện tại khác với Role mong muốn
                                    await self._update_user_role_in_table(page, user_row, role_label)

                                    # 2. Bấm icon bánh răng để gia hạn ngày
                                    edit_gear = user_row.locator("a.editenrollink, a[data-action='editenrolment']").first
                                    if await edit_gear.count() > 0:
                                        await edit_gear.scroll_into_view_if_needed()
                                        await edit_gear.click(force=True)
                                        
                                        edit_modal = page.locator("div.modal.show[data-region='modal-container'], div.modal.show:has-text('Edit')").first
                                        await edit_modal.wait_for(state="visible", timeout=10000)

                                        try:
                                            await page.evaluate("""() => {
                                                const st = document.querySelector(".modal.show select#id_status");
                                                if (st) {
                                                    st.value = "0";
                                                    st.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                                }
                                            }""")
                                        except Exception:
                                            status_select = edit_modal.locator("select#id_status").first
                                            if await status_select.count() > 0:
                                                await status_select.select_option(value="0", force=True)

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

                                        save_edit_btn = edit_modal.locator(".modal-footer button[data-action='save'], button:has-text('Save changes')").first
                                        try:
                                            async with page.expect_response(lambda r: "service.php" in r.url and r.status == 200, timeout=10000):
                                                await save_edit_btn.click(force=True)
                                        except Exception:
                                            await save_edit_btn.click(force=True)
                                        
                                        try:
                                            await edit_modal.wait_for(state="hidden", timeout=8000)
                                        except Exception:
                                            await self._close_modal_safely(page, edit_modal)

                                        logger.info(f"🔄 SMART FALLBACK THÀNH CÔNG: Đã gia hạn & đồng bộ Role cho {email} ({role_label}) đến ngày {end_date_str}")
                                        all_valid_emails_for_group.append(email)
                                        course_results["extended_access"].append({
                                            "email": email,
                                            "role": role_label,
                                            "valid_until": end_date_str
                                        })
                                        user_extended = True

                                if not user_extended:
                                    logger.warning(f"❌ SMART FALLBACK THẤT BẠI: Không tìm thấy tài khoản trong bảng: {email}")
                                    course_results["not_found"].append({
                                        "email": email,
                                        "role_intended": role_label,
                                        "reason": "Tài khoản không có trong gợi ý Mới và không tồn tại trong bảng học viên của khóa học."
                                    })

                        # ------------------------------------------------------
                        # BƯỚC 3: TẠO GROUP & PHÂN NHÓM (CHO KHÓA HỌC HIỆN TẠI)
                        # ------------------------------------------------------
                        if group_name and all_valid_emails_for_group:
                            logger.info(f"🏷️ Bắt đầu tiến trình tạo Group & phân nhóm: [{group_name}] cho khóa {course_id}...")
                            groups_url = f"{MOODLE_BASE_URL}/group/index.php?id={course_id}"
                            await page.goto(groups_url, wait_until="domcontentloaded", timeout=45000)
                            await wait_for_dom_and_spinners(page, "select#groups, #page-content", min_pacing_ms=300)

                            group_option = page.locator(f"select#groups option:has-text('{group_name}')").first
                            if await group_option.count() == 0:
                                logger.info(f"➕ Tạo Group mới: [{group_name}]...")
                                create_group_btn = page.locator("input#showcreateorphangroupform, input[value='Create group']").first
                                if await create_group_btn.count() > 0:
                                    await create_group_btn.click(force=True)
                                    name_input = page.locator("input#id_name").first
                                    await name_input.wait_for(state="visible", timeout=10000)
                                    await name_input.fill(group_name)
                                    await page.click("input#id_submitbutton, input[value='Save changes']", force=True)
                                    await wait_for_dom_and_spinners(page, "select#groups", min_pacing_ms=300)

                            group_option = page.locator(f"select#groups option:has-text('{group_name}')").first
                            if await group_option.count() > 0:
                                await group_option.click(force=True)

                                add_members_btn = page.locator("input#showaddmembersform, input[value='Add/remove users']").first
                                if await add_members_btn.count() > 0 and await add_members_btn.is_enabled():
                                    await add_members_btn.click(force=True)
                                    search_potential = page.locator("input#addselect_searchtext").first
                                    await search_potential.wait_for(state="visible", timeout=15000)

                                    for u_email in all_valid_emails_for_group:
                                        await search_potential.click(force=True)
                                        await search_potential.fill(u_email)
                                        try:
                                            await page.locator("select#addselect").wait_for(state="visible", timeout=3000)
                                        except Exception:
                                            pass

                                        potential_opt = page.locator("select#addselect option").filter(has_text=u_email).first
                                        if await potential_opt.count() > 0:
                                            await potential_opt.click(force=True)
                                            add_btn = page.locator("input#add, input[name='add'], input[value*='Add']").first
                                            if await add_btn.count() > 0:
                                                await add_btn.click(force=True)
                                                course_results["group_members_added"].append(u_email)
                                                logger.info(f"✅ Đã thêm vào Group [{group_name}]: {u_email}")

                                    back_btn = page.locator("input[name='cancel'][value='Back to groups']").first
                                    if await back_btn.count() > 0:
                                        await back_btn.click(force=True)
                                        await wait_for_dom_and_spinners(page, "select#groups", min_pacing_ms=300)

                                    course_results["group_created"] = group_name

                    batch_course_results.append(course_results)

                # Tổng kết kết quả toàn bộ chuỗi khóa học
                total_courses_count = len(batch_course_results)
                all_enrolled_count = sum(len(c["enrolled_new"]) for c in batch_course_results)
                all_extended_count = sum(len(c["extended_access"]) for c in batch_course_results)
                all_failed_count = sum(len(c["not_found"]) for c in batch_course_results)

                overall_status = "success" if all_failed_count == 0 else ("partial_success" if (all_enrolled_count + all_extended_count) > 0 else "failed")

                return {
                    "status": overall_status,
                    "courses_count": total_courses_count,
                    "message": f"Hoàn thành xử lý {total_courses_count} khóa học cho {total_requested} người dùng (Mới: {all_enrolled_count}, Gia hạn & Đổi Role: {all_extended_count}, Thất bại: {all_failed_count}).",
                    "summary": {
                        "total_courses": total_courses_count,
                        "total_requested_per_course": total_requested,
                        "all_enrolled_count": all_enrolled_count,
                        "all_extended_count": all_extended_count,
                        "all_failed_count": all_failed_count
                    },
                    "details": batch_course_results
                }

            except Exception as e:
                logger.error(f"❌ Lỗi ngoại lệ trong quá trình LMS Enrollment: {e}")
                return {"status": "failed", "error": str(e), "details": batch_course_results}
            finally:
                await browser.close()
                gc.collect()

    async def enroll_users_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Bọc Khóa Slot Concurrency Toàn Cục & Timeout an toàn (tăng trần 360s cho chuỗi nhiều khóa)."""
        courses_count = len(payload.get("courses", []))
        timeout_seconds = max(360.0, courses_count * 120.0) if courses_count > 1 else 240.0
        async with acquire_playwright_slot("Moodle LMS Enroll Pipeline", timeout=timeout_seconds):
            try:
                return await asyncio.wait_for(self._internal_enroll_pipeline(payload), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                logger.error(f"❌ Quá thời gian thực thi (Timeout {timeout_seconds}s) cho tác vụ ghi danh Moodle LMS.")
                return {"status": "failed", "error": f"Tác vụ ghi danh bị Timeout (vượt quá {timeout_seconds}s)."}

    async def modify_user_role(self, course_id: str, email: str, new_role_label: str, mode: str = "mono") -> Dict[str, Any]:
        """Đổi Mono-Role độc lập."""
        async with acquire_playwright_slot(f"Moodle Modify User Role ({email})"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=self.headless, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 800})
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    if not await self._login_moodle_sso(page):
                        return {"status": "failed", "error": "Đăng nhập thất bại"}

                    participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"
                    await page.goto(participants_url, wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, "#page-content, table#participants", min_pacing_ms=300)

                    await self._apply_keyword_filter(page, email)

                    user_row = page.locator("table#participants tbody tr").filter(
                        has=page.locator("td.cell.c2, td.c2", has_text=email)
                    ).first

                    if await user_row.count() == 0:
                        return {"status": "failed", "error": f"Không tìm thấy user {email} trong khóa học."}

                    res = await self._update_user_role_in_table(page, user_row, new_role_label)
                    return {"status": "success" if res else "failed", "message": f"Cập nhật role [{new_role_label}] cho {email}"}
                finally:
                    await browser.close()
                    gc.collect()

    async def unenrol_users_pipeline(self, course_id: str, emails: List[str]) -> Dict[str, Any]:
        """Xóa danh sách User khỏi khóa học (Unenrol 🗑️)."""
        async with acquire_playwright_slot(f"Moodle Unenrol Users ({len(emails)} emails)"):
            clean_emails = self._sanitize_emails(emails)
            if not clean_emails:
                return {"status": "failed", "error": "Danh sách email rỗng."}

            results = {"unenrolled": [], "not_found": []}

            async with async_playwright() as p:
                browser: Browser = await p.chromium.launch(headless=self.headless, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 800})
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    if not await self._login_moodle_sso(page):
                        return {"status": "failed", "error": "Đăng nhập thất bại"}

                    participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={course_id}"
                    await page.goto(participants_url, wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, "#page-content, table#participants", min_pacing_ms=300)

                    for email in clean_emails:
                        await self._apply_keyword_filter(page, email)

                        user_row = page.locator("table#participants tbody tr").filter(
                            has=page.locator("td.cell.c2, td.c2", has_text=email)
                        ).first

                        if await user_row.count() > 0:
                            trash_btn = user_row.locator("a.unenrollink, a[data-action='unenrol'], i.edw-icon-Delete-Course").first
                            if await trash_btn.count() > 0:
                                await trash_btn.click(force=True)
                                
                                modal = page.locator("div.modal.show:has-text('Unenrol')").first
                                await modal.wait_for(state="visible", timeout=10000)

                                confirm_btn = modal.locator(".modal-footer button[data-action='save'], button:has-text('Unenrol')").first
                                try:
                                    async with page.expect_response(lambda r: "service.php" in r.url and r.status == 200, timeout=10000):
                                        await confirm_btn.click(force=True)
                                except Exception:
                                    await confirm_btn.click(force=True)
                                
                                try:
                                    await modal.wait_for(state="hidden", timeout=8000)
                                except Exception:
                                    pass
                                    
                                results["unenrolled"].append(email)
                                logger.info(f"🗑️ Đã xóa user khỏi khóa: {email}")
                        else:
                            results["not_found"].append(email)

                    total = len(clean_emails)
                    success_len = len(results["unenrolled"])
                    status = "success" if success_len == total else ("partial_success" if success_len > 0 else "failed")

                    return {
                        "status": status,
                        "message": f"Đã xóa {success_len}/{total} tài khoản.",
                        "details": results
                    }
                finally:
                    await browser.close()
                    gc.collect()


playwright_lms_service = PlaywrightLMSService()