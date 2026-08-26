# [VIẾT MỚI: backend/test_lms_filter_and_edit.py]
import asyncio
import logging
from datetime import datetime
from playwright.async_api import async_playwright
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")
logger = logging.getLogger("FILTER_EDIT_DEBUG")

MOODLE_BASE_URL = "https://learn.pythaverse.space"
TEST_COURSE_ID = "1502"
TEST_EMAIL = "hsdttemd@pythaverse.net"
TEST_NEW_END_DATE = "2027-12-31"  # Gia hạn đến 31/12/2027

def parse_date(date_str: str):
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return {"day": str(dt.day), "month": str(dt.month), "year": str(dt.year)}

async def test_filter_and_edit():
    admin_user = settings.TEST_ADMIN_USER or "adminworkspace"
    admin_pass = settings.TEST_ADMIN_PASS or settings.KEYCLOAK_ADMIN_PASS or ""
    date_info = parse_date(TEST_NEW_END_DATE)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            slow_mo=400,
            args=["--start-maximized"]
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        try:
            # 1. ĐĂNG NHẬP
            logger.info("🔑 Đang đăng nhập Moodle...")
            await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="load", timeout=60000)
            await page.wait_for_timeout(1500)

            if "eid.pythaverse.space" in page.url or await page.locator("input#username, input[name='username']").count() > 0:
                await page.fill("input#username, input[name='username']", admin_user)
                await page.fill("input#password, input[name='password']", admin_pass)
                await page.click("input#kc-login, button[type='submit']", force=True)
                await page.wait_for_timeout(4000)

            # 2. VÀO TRANG PARTICIPANTS
            participants_url = f"{MOODLE_BASE_URL}/user/index.php?id={TEST_COURSE_ID}"
            logger.info(f"📚 Truy cập trang Participants: {participants_url}")
            await page.goto(participants_url, wait_until="load", timeout=60000)
            await page.locator("#page-content, table#participants").first.wait_for(state="visible", timeout=30000)
            await page.wait_for_timeout(2000)

            # =========================================================================
            # 3. LỌC KEYWORD CHUẨN 2 NHỊP (CHỐNG TRƯỢT FILTER)
            # =========================================================================
            logger.info(f"🔍 BẮT ĐẦU LỌC TÌM EMAIL: {TEST_EMAIL}...")
            
            # A. Reset bộ lọc cũ nếu có
            reset_btn = page.locator("button[data-filteraction='reset']:has-text('Clear filters')").first
            if await reset_btn.count() > 0 and await reset_btn.is_visible():
                logger.info("🧹 Bấm Clear filters cũ...")
                await reset_btn.click(force=True)
                await page.wait_for_timeout(1000)

            # B. Đảm bảo chọn filter type là Keyword
            type_select = page.locator("select[data-filterfield='type']").first
            if await type_select.count() > 0 and await type_select.is_enabled():
                await type_select.select_option(value="keywords")
                await page.wait_for_timeout(500)

            # C. Nhịp 1: Gõ email vào ô Type... và bấm Enter để sinh Tag Pill
            kw_input = page.locator("div[data-filterregion='value'] input[placeholder='Type...'], div[data-filter-type='keywords'] input").first
            await kw_input.wait_for(state="visible", timeout=10000)
            await kw_input.click()
            await kw_input.fill(TEST_EMAIL)
            logger.info(f"⌨️ [Nhịp 1] Đã gõ '{TEST_EMAIL}', nhấn Enter để tạo Tag...")
            await kw_input.press("Enter")
            
            # Đợi thẻ Tag xuất hiện trong khung selection
            tag_badge = page.locator("div[data-filterregion='value'] .form-autocomplete-selection span.badge, div[data-filterregion='value'] .form-autocomplete-selection [data-value]").first
            await tag_badge.wait_for(state="visible", timeout=6000)
            logger.info("🏷️ Tag Pill email đã được tạo thành công!")
            await page.wait_for_timeout(500)

            # D. Nhịp 2: Bấm Apply filters để server Moodle tải danh sách
            apply_btn = page.locator("button[data-filteraction='apply']:has-text('Apply filters')").first
            logger.info("🚀 [Nhịp 2] Bấm nút 'Apply filters'...")
            await apply_btn.click(force=True)
            
            # Đợi bảng participants nạp lại dữ liệu (chờ 3.5s cho an toàn mạng lag)
            logger.info("⏳ Chờ Moodle nạp lại bảng kết quả...")
            await page.wait_for_timeout(3500)

            # =========================================================================
            # 4. SO KHỚP CHÍNH XÁC CỘT EMAIL (td.cell.c2) - TUYỆT ĐỐI KHÔNG BỊ NHẦM
            # =========================================================================
            logger.info(f"🎯 Đang tìm đúng dòng có td.c2 khớp chính xác 100%: '{TEST_EMAIL}'...")
            
            # Định vị dòng chứa đúng td.c2 là email cần tìm
            user_row = page.locator("table#participants tbody tr").filter(
                has=page.locator(f"td.cell.c2, td.c2", has_text=TEST_EMAIL)
            ).first

            row_count = await user_row.count()
            if row_count == 0:
                logger.error(f"❌ KHÔNG TÌM THẤY dòng nào có email khớp 100% với: {TEST_EMAIL}")
                return

            email_cell_text = (await user_row.locator("td.cell.c2, td.c2").inner_text()).strip()
            logger.info(f"✅ ĐÃ BẮT TRÚNG DÒNG CỦA USER: {email_cell_text}")

            # =========================================================================
            # 5. CLICK BÁNH RĂNG ⚙️ & CHỜ MODAL EDIT NẠP XONG QUA AJAX
            # =========================================================================
            gear_btn = user_row.locator("a.editenrollink, a[data-action='editenrolment']").first
            await gear_btn.scroll_into_view_if_needed()
            logger.info("⚙️ Bấm vào icon Bánh Răng để mở modal chỉnh sửa...")
            await gear_btn.click(force=True)

            # Đợi modal Edit enrolment bật lên
            edit_modal = page.locator("div.modal.show:has-text('Edit'), div.modal.show[data-region='modal-container']").first
            await edit_modal.wait_for(state="visible", timeout=15000)
            await page.wait_for_timeout(1500) # Đợi AJAX load xong toàn bộ form
            logger.info("🎉 Modal Edit enrolment đã mở hoàn tất!")

            # =========================================================================
            # 6. THIẾT LẬP NGÀY MỚI (31/12/2027) & LƯU
            # =========================================================================
            logger.info(f"📅 Cài đặt hạn mới: {date_info['day']}/{date_info['month']}/{date_info['year']}...")
            await page.evaluate(f"""() => {{
                // Đảm bảo checkbox Enable được tích
                const chk = document.querySelector(".modal.show input#id_timeend_enabled, .modal.show input[name='timeend[enabled]']");
                if (chk && !chk.checked) {{
                    chk.checked = true;
                    chk.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}

                // Gỡ disabled và gán ngày/tháng/năm
                const day = document.querySelector(".modal.show select#id_timeend_day");
                const month = document.querySelector(".modal.show select#id_timeend_month");
                const year = document.querySelector(".modal.show select#id_timeend_year");

                [day, month, year].forEach(el => {{ if (el) el.removeAttribute('disabled'); }});

                if (day) {{ day.value = '{date_info["day"]}'; day.dispatchEvent(new Event('change', {{ bubbles: true }})); }}
                if (month) {{ day.value = '{date_info["month"]}'; month.dispatchEvent(new Event('change', {{ bubbles: true }})); }}
                if (year) {{ year.value = '{date_info["year"]}'; year.dispatchEvent(new Event('change', {{ bubbles: true }})); }}
            }}""")
            await page.wait_for_timeout(600)

            # Bấm Save changes
            logger.info("💾 Bấm 'Save changes'...")
            save_btn = edit_modal.locator(".modal-footer button[data-action='save'], button:has-text('Save changes')").first
            await save_btn.click()
            await page.wait_for_timeout(4000)
            logger.info(f"🎉 GIA HẠN THÀNH CÔNG CHO: {TEST_EMAIL} ĐẾN {TEST_NEW_END_DATE}!")

            # =========================================================================
            # 7. KIỂM TRA LẠI THÔNG TIN ENROLMENT DETAILS
            # =========================================================================
            info_icon = user_row.locator("a[data-action='showdetails'], i.edw-icon-Info").first
            if await info_icon.count() > 0:
                await info_icon.click(force=True)
                await page.wait_for_timeout(2000)
                details_modal = page.locator("div.modal.show:has-text('Enrolment details')").first
                if await details_modal.count() > 0:
                    details_text = await details_modal.inner_text()
                    logger.info(f"\n📋 THÔNG TIN SAU KHI GIA HẠN:\n{details_text}")

            logger.info("⏸️ Dừng 15 giây để anh quan sát kết quả...")
            await page.wait_for_timeout(15000)

        except Exception as e:
            logger.error(f"💥 Lỗi: {e}", exc_info=True)
        finally:
            await browser.close()
            logger.info("🏁 Đã đóng trình duyệt an toàn.")

if __name__ == "__main__":
    asyncio.run(test_filter_and_edit())