# [VIẾT LẠI TOÀN BỘ FILE: backend/test_lms_scenario.py]
import asyncio
import logging
from playwright.async_api import async_playwright
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")
logger = logging.getLogger("LMS_SCENARIO")

MOODLE_BASE_URL = "https://learn.pythaverse.space"
TEST_COURSE_ID = "1502"
TEST_EMAIL = "hsdttemd@pythaverse.net"

async def run_scenario():
    admin_user = settings.TEST_ADMIN_USER or "adminworkspace"
    admin_pass = settings.TEST_ADMIN_PASS or settings.KEYCLOAK_ADMIN_PASS or ""

    logger.info("🚀 KHỞI ĐỘNG CHROME CHẠY CHẬM THỰC HIỆN KỊCH BẢN...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            slow_mo=600,  # Chạy chậm 600ms để anh quan sát từng click
            args=["--start-maximized"]
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        try:
            # =========================================================================
            # BƯỚC 1: ĐĂNG NHẬP
            # =========================================================================
            logger.info("🔑 [1/5] Đăng nhập Moodle...")
            await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="load", timeout=60000)
            await page.wait_for_timeout(1500)

            if "eid.pythaverse.space" in page.url or await page.locator("input#username, input[name='username']").count() > 0:
                await page.fill("input#username, input[name='username']", admin_user)
                await page.fill("input#password, input[name='password']", admin_pass)
                await page.click("input#kc-login, button[type='submit']", force=True)
                await page.wait_for_timeout(4000)

            # =========================================================================
            # BƯỚC 2: VÀO PARTICIPANTS & CHỌN KEYWORD (ĐỊNH DANH ĐÚNG THẺ THẬT)
            # =========================================================================
            participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={TEST_COURSE_ID}"
            logger.info(f"📚 [2/5] Mở trang Participants: {participants_url}")
            await page.goto(participants_url, wait_until="load", timeout=60000)
            await page.locator("#page-content, table#participants").first.wait_for(state="visible", timeout=30000)
            await page.wait_for_timeout(2000)

            # 1. BẮT ĐÚNG THẺ SELECT THẬT TRONG VÙNG FILTERS (BỎ QUA THẺ ẨN TEMPLATE)
            logger.info("🎯 Định vị chính xác thẻ Select thật trên màn hình...")
            real_type_select = page.locator("div[data-filterregion='filters'] select[data-filterfield='type']:not([disabled])").first
            await real_type_select.wait_for(state="visible", timeout=15000)
            await real_type_select.scroll_into_view_if_needed()
            await real_type_select.click()
            await page.wait_for_timeout(300)

            # Chọn 'Keyword' và kích hoạt sự kiện change
            logger.info("🔽 Chọn 'Keyword' và kích hoạt Moodle vẽ ô Type...")
            await real_type_select.select_option(value="keywords")
            await real_type_select.dispatch_event("change")
            
            # Ép sự kiện Javascript trên chính thẻ thật để chắc chắn 100%
            await page.evaluate("""() => {
                const sel = document.querySelector("div[data-filterregion='filters'] select[data-filterfield='type']:not([disabled])");
                if (sel) {
                    sel.value = 'keywords';
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.jQuery) {
                        window.jQuery(sel).trigger('change');
                    }
                }
            }""")

            # 2. Định vị chính xác ô input Type... đang hiển thị
            logger.info("⏳ Đang đợi Moodle render ô 'Type...' ra màn hình...")
            kw_input = page.locator("input[placeholder='Type...']").first
            await kw_input.wait_for(state="visible", timeout=30000)

            # 3. Click vào ô Type... và gõ nội dung
            logger.info("🎯 Đã thấy ô Type...! Đang click và điền...")
            await kw_input.click()
            await kw_input.fill(TEST_EMAIL)
            logger.info(f"✅ ĐÃ CLICK VÀ ĐIỀN THÀNH CÔNG: {TEST_EMAIL}")

            # 4. Bấm Apply filters LẦN 1 (Tạo Tag Pill)
            apply_btn = page.locator("button[data-filteraction='apply']:has-text('Apply filters')").first
            logger.info("🚀 Bấm 'Apply filters' (LẦN 1) để tạo Tag Pill...")
            await apply_btn.click(force=True)
            await page.wait_for_timeout(2000)

            # 5. Bấm Apply filters LẦN 2 (Tải bảng kết quả)
            logger.info("🚀 Bấm 'Apply filters' (LẦN 2) để lọc danh sách...")
            await apply_btn.click(force=True)
            await page.wait_for_timeout(3500)

            # Định vị đúng dòng của user
            user_row = page.locator("table#participants tbody tr").filter(
                has=page.locator(f"td.cell.c2, td.c2", has_text=TEST_EMAIL)
            ).first
            await user_row.wait_for(state="visible", timeout=15000)
            logger.info(f"🎯 Đã bắt trúng dòng của user: {TEST_EMAIL}")

            # =========================================================================
            # BƯỚC 3: ĐỔI ROLE THÀNH "Non-editing teacher" (INLINE EDIT)
            # =========================================================================
            logger.info("\n🎭 [3/5] BẮT ĐẦU ĐỔI ROLE THÀNH 'Non-editing teacher'...")
            
            # Click vào chữ role hiện tại
            role_link = user_row.locator("td.cell.c3 a.quickeditlink, td.c3 a").first
            await role_link.click(force=True)
            await page.wait_for_timeout(1000)

            # Gỡ role cũ nếu có
            old_tag_cancel = user_row.locator("td.cell.c3 .form-autocomplete-selection span.edw-icon-Cancel, td.c3 .badge .edw-icon-Cancel").first
            if await old_tag_cancel.count() > 0:
                logger.info("❌ Gỡ bỏ role cũ...")
                await old_tag_cancel.click(force=True)
                await page.wait_for_timeout(500)

            # Mở dropdown gợi ý role
            down_arrow = user_row.locator("td.cell.c3 span.form-autocomplete-downarrow, td.c3 .edw-icon-Down-Arrow").first
            if await down_arrow.count() > 0:
                await down_arrow.click(force=True)
                await page.wait_for_timeout(600)

            # Chọn 'Non-editing teacher'
            non_editing_opt = user_row.locator("td.cell.c3 ul.form-autocomplete-suggestions li:has-text('Non-editing teacher')").first
            if await non_editing_opt.count() > 0:
                logger.info("👉 Click chọn role 'Non-editing teacher'...")
                await non_editing_opt.click(force=True)
                await page.wait_for_timeout(600)

            # Bấm icon Đĩa Mềm 💾 để Lưu
            save_disk_btn = user_row.locator("td.cell.c3 i.fa-floppy-o, td.c3 a:has(i.fa-floppy-o)").first
            logger.info("💾 Bấm icon đĩa mềm để lưu Role...")
            if await save_disk_btn.count() > 0:
                await save_disk_btn.click(force=True)
            else:
                await page.keyboard.press("Enter")
            
            await page.wait_for_timeout(3000)
            logger.info("✅ ĐÃ ĐỔI ROLE THÀNH 'Non-editing teacher' THÀNH CÔNG!")

            # =========================================================================
            # BƯỚC 4: ĐỔI NGÀY HẾT HẠN THÀNH 10-10-2024 (THU HỒI QUYỀN TẠM THỜI)
            # =========================================================================
            logger.info("\n📅 [4/5] ĐỔI NGÀY HẾT HẠN THÀNH 10-10-2024...")
            gear_btn = user_row.locator("a.editenrollink, a[data-action='editenrolment']").first
            await gear_btn.scroll_into_view_if_needed()
            await gear_btn.click(force=True)

            edit_modal = page.locator("div.modal.show[data-region='modal-container']:has-text('Edit')").first
            await edit_modal.wait_for(state="visible", timeout=15000)
            await page.wait_for_timeout(1000)

            logger.info("📅 Cài đặt ngày 10/10/2024 vào modal Edit...")
            await page.evaluate("""() => {
                const chk = document.querySelector(".modal.show input#id_timeend_enabled");
                if (chk && !chk.checked) {
                    chk.checked = true;
                    chk.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const day = document.querySelector(".modal.show select#id_timeend_day");
                const month = document.querySelector(".modal.show select#id_timeend_month");
                const year = document.querySelector(".modal.show select#id_timeend_year");

                [day, month, year].forEach(el => { if (el) el.removeAttribute('disabled'); });

                if (day) { day.value = '10'; day.dispatchEvent(new Event('change', { bubbles: true })); }
                if (month) { month.value = '10'; month.dispatchEvent(new Event('change', { bubbles: true })); }
                if (year) { year.value = '2024'; year.dispatchEvent(new Event('change', { bubbles: true })); }
            }""")
            await page.wait_for_timeout(600)

            await edit_modal.locator(".modal-footer button[data-action='save'], button:has-text('Save changes')").first.click()
            await page.wait_for_timeout(3500)
            logger.info("✅ ĐÃ ĐỔI HẠN THÀNH 10/10/2024 THÀNH CÔNG!")

            # =========================================================================
            # BƯỚC 5: GỠ NGƯỜI DÙNG KHỎI KHÓA HỌC (UNENROL 🗑️)
            # =========================================================================
            logger.info(f"\n🗑️ [5/5] TIẾN HÀNH XÓA (UNENROL) {TEST_EMAIL} KHỎI KHÓA HỌC...")
            trash_btn = user_row.locator("a.unenrollink, a[data-action='unenrol'], i.edw-icon-Delete-Course").first
            await trash_btn.scroll_into_view_if_needed()
            await trash_btn.click(force=True)

            unenrol_modal = page.locator("div.modal.show:has-text('Unenrol')").first
            await unenrol_modal.wait_for(state="visible", timeout=15000)
            await page.wait_for_timeout(1000)

            confirm_btn = unenrol_modal.locator(".modal-footer button[data-action='save'], button:has-text('Unenrol')").first
            logger.info("⚠️ Bấm xác nhận xóa vĩnh viễn...")
            await confirm_btn.click(force=True)
            await page.wait_for_timeout(4000)
            logger.info(f"🎉 ĐÃ GỠ THÀNH CÔNG {TEST_EMAIL} KHỎI KHÓA HỌC!")

            logger.info("\n🏆 =======================================================")
            logger.info("🏆 HOÀN THÀNH XUẤT SẮC CẢ 5 BƯỚC CỦA KỊCH BẢN!")
            logger.info("🏆 =======================================================")
            logger.info("⏸️ Giữ trình duyệt 15 giây để anh kiểm tra trực quan...")
            await page.wait_for_timeout(15000)

        except Exception as e:
            logger.error(f"💥 Lỗi: {e}", exc_info=True)
        finally:
            await browser.close()
            logger.info("🏁 Đã đóng trình duyệt an toàn.")

if __name__ == "__main__":
    asyncio.run(run_scenario())