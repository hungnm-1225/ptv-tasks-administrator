# backend/scripts/test_git_collaborator.py
"""
Script kiểm thử độc lập chức năng BULK Thêm Collaborator vào Pythaverse Git.
Chạy trực tiếp trên máy Local với trình duyệt hiển thị (Headed Mode).
"""

import sys
import os
import asyncio
import logging

# Thêm thư mục backend vào sys.path để import được core/config
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from playwright.async_api import async_playwright
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("GitBulkTest")

# ==============================================================================
# CẤU HÌNH KIỂM THỬ BULK CỦA ANH TẠI ĐÂY:
# ==============================================================================
TEST_REPO_URL = "https://git.pythaverse.space/ptvswrp/SWRP11_Teacher"  # Link repo thực tế của anh
TEST_ROLE = "GUEST"  # ADMIN / DEVELOPER / GUEST

# Danh sách bulk gồm cả username và email anh vừa đưa em:
TEST_USERS = [
    "hsdttemd",
    "gvdttemd@pythaverse.net",
    "htdttemd"
]
# ==============================================================================


def clean_repo_url(raw_url: str) -> str:
    """Loại bỏ .git và trỏ thẳng vào /settings/collaborators."""
    clean = raw_url.strip().rstrip("/")
    if clean.endswith(".git"):
        clean = clean[:-4].rstrip("/")
    if clean.endswith("/settings/collaborators"):
        return clean
    if clean.endswith("/settings"):
        return f"{clean}/collaborators"
    return f"{clean}/settings/collaborators"


async def run_visual_bulk_test():
    base_url = (getattr(settings, "GIT_SERVER_URL", None) or "https://git.pythaverse.space").rstrip("/")
    admin_user = getattr(settings, "GIT_ADMIN_USER", None) or "ptvadmin"
    admin_pass = getattr(settings, "GIT_ADMIN_PASS", None)

    if not admin_pass:
        logger.error("❌ Chưa cấu hình GIT_ADMIN_PASS trong file .env!")
        return

    settings_url = clean_repo_url(TEST_REPO_URL)
    logger.info("=" * 70)
    logger.info(f"🎯 BẮT ĐẦU BULK TEST TRÊN REPO: {settings_url}")
    logger.info(f"👥 Tổng số tài khoản cần xử lý: {len(TEST_USERS)} | Vai trò mục tiêu: [{TEST_ROLE}]")
    logger.info("=" * 70)

    summary = {
        "added": [],
        "already_exists": [],
        "not_found_sso": [],
        "errors": []
    }

    async with async_playwright() as p:
        # Khởi chạy Chromium có giao diện, tốc độ vừa phải 250ms để anh nhìn rõ
        browser = await p.chromium.launch(headless=False, slow_mo=250)
        context = await browser.new_context(viewport={"width": 1280, "height": 850})
        page = await context.new_page()

        try:
            # 1. ĐĂNG NHẬP PYTHAVERSE GIT QUA SSO OIDC
            logger.info("🔑 Đang mở trang đăng nhập Git...")
            await page.goto(f"{base_url}/signin", wait_until="domcontentloaded", timeout=40000)

            # Kiểm tra session cũ
            if "signin" not in page.url and await page.locator("a[href*='/signout']").count() > 0:
                logger.info("✅ Đã có sẵn phiên đăng nhập!")
            else:
                oidc_btn = page.locator("form[action*='/signin/oidc'] input[type='submit'], input[value*='Sign in with Pythaverse eID']").first
                if await oidc_btn.count() > 0:
                    logger.info("👉 Bấm nút 'Sign in with Pythaverse eID'...")
                    try:
                        async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                            await oidc_btn.click()
                    except Exception:
                        pass

                # Điền thông tin vào Keycloak SSO
                kc_user = page.locator("input#username").first
                if await kc_user.count() > 0 and await kc_user.is_visible():
                    logger.info(f"🔐 Đang điền tài khoản quản trị: {admin_user}")
                    await kc_user.fill(admin_user)
                    await page.fill("input#password", admin_pass)

                    login_btn = page.locator("input#kc-login, button[type='submit']").first
                    try:
                        async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                            await login_btn.click()
                    except Exception:
                        pass

            await page.wait_for_selector("a.dropdown-toggle[title*='Signed'], img.avatar-mini, a[href*='/signout']", timeout=20000)
            logger.info("🎉 Đăng nhập Pythaverse Git thành công!")

            # 2. ĐIỀU HƯỚNG TỚI TRANG CÀI ĐẶT COLLABORATORS
            logger.info(f"📂 Điều hướng đến: {settings_url}")
            await page.goto(settings_url, wait_until="domcontentloaded", timeout=40000)
            await page.wait_for_selector("input#userName-collaborator, #collaborator-list", timeout=15000)

            user_input = page.locator("input#userName-collaborator").first
            add_btn = page.locator("input#addCollaborator").first
            error_span = page.locator("span#error-collaborator").first

            new_changes_count = 0

            # 3. VÒNG LẶP BULK XỬ LÝ TỪNG NGƯỜI DÙNG
            for idx, user_raw in enumerate(TEST_USERS, 1):
                user_item = user_raw.strip()
                logger.info(f"\n[{idx}/{len(TEST_USERS)}] 🔍 Đang xử lý: '{user_item}'...")

                # Kiểm tra sơ bộ xem username này đã có trên danh sách chưa
                existing = page.locator("#collaborator-list li").filter(has_text=user_item).first
                if await existing.count() > 0:
                    logger.info(f"ℹ️ '{user_item}' đã có trong danh sách Collaborators. Cập nhật Role sang [{TEST_ROLE}]...")
                    role_lbl = existing.locator(f"label:has(input[value='{TEST_ROLE}'])").first
                    if await role_lbl.count() > 0:
                        await role_lbl.click(force=True)
                        new_changes_count += 1
                    summary["already_exists"].append(user_item)
                    continue

                # Bước A: Dọn sạch ô input trước khi gõ
                await user_input.click(force=True)
                await user_input.fill("")
                await user_input.press_sequentially(user_item, delay=35)

                # Bước B: Chờ gợi ý từ Typeahead Dropdown và click chọn
                dropdown_item = page.locator("ul.typeahead.dropdown-menu li a").first
                try:
                    await dropdown_item.wait_for(state="visible", timeout=2500)
                    dropdown_text = (await dropdown_item.inner_text()).strip()
                    logger.info(f"✨ Bắt được gợi ý Typeahead: '{dropdown_text}' ➔ Click chọn!")
                    await dropdown_item.click(force=True)
                except Exception:
                    logger.info("ℹ️ Không bật popup Typeahead, nhấn Enter để xác nhận...")
                    await user_input.press("Enter")

                await page.wait_for_timeout(250)

                # Bước C: Bấm nút Add
                logger.info("➕ Bấm nút Add...")
                await add_btn.click(force=True)
                await page.wait_for_timeout(600)

                # Bước D: Kiểm tra thông báo lỗi từ GitBucket (nếu có)
                err_msg = (await error_span.inner_text()).strip() if await error_span.count() > 0 else ""

                if err_msg:
                    # Trường hợp 1: Người này đã được add rồi (do email trỏ về username đã có sẵn)
                    if "already" in err_msg.lower():
                        logger.info(f"ℹ️ GitBucket thông báo '{user_item}' đã tồn tại trong repo: {err_msg}")
                        summary["already_exists"].append(user_item)
                    # Trường hợp 2: Người này chưa bao giờ login OIDC vào Git
                    elif "not exist" in err_msg.lower() or "not found" in err_msg.lower():
                        logger.warning(f"⚠️ '{user_item}' chưa kích hoạt SSO trên Git: {err_msg}")
                        summary["not_found_sso"].append(user_item)
                    else:
                        logger.warning(f"⚠️ Lỗi khác khi thêm '{user_item}': {err_msg}")
                        summary["errors"].append({"user": user_item, "error": err_msg})

                    # Dọn sạch ô input để chuẩn bị cho người tiếp theo
                    await user_input.fill("")
                    continue

                # Bước E: Thêm thành công! Thẻ mới luôn nằm ở CUỐI CÙNG (.last)
                last_li = page.locator("#collaborator-list li").last
                if await last_li.count() > 0:
                    logger.info(f"🎯 Gán vai trò [{TEST_ROLE}] cho tài khoản mới thêm...")
                    role_btn = last_li.locator(f"label:has(input[value='{TEST_ROLE}'])").first
                    if await role_btn.count() > 0:
                        await role_btn.click(force=True)
                    new_changes_count += 1
                    summary["added"].append(user_item)
                    logger.info(f"✅ Đã thêm '{user_item}' thành công!")
                else:
                    summary["added"].append(user_item)
                    new_changes_count += 1

                # Dọn sạch ô input
                await user_input.fill("")

            # 4. BẤM APPLY CHANGES ĐỂ LƯU TẤT CẢ VÀO REPO
            if new_changes_count > 0:
                logger.info("\n💾 Đang bấm 'Apply changes' để lưu toàn bộ danh sách vào Repo...")
                apply_btn = page.locator("input[type='submit'][value='Apply changes']").first
                if await apply_btn.count() > 0:
                    async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                        await apply_btn.click()
                    logger.info("🎉 TẤT CẢ THAY ĐỔI ĐÃ ĐƯỢC LƯU VÀO REPO THÀNH CÔNG!")
            else:
                logger.info("\nℹ️ Không có thay đổi nào mới cần lưu.")

            # In bảng tổng kết trực quan
            print("\n" + "=" * 60)
            print("📊 BẢNG TỔNG KẾT KẾT QUẢ BULK ADD COLLABORATORS:")
            print(f"✅ Thêm mới thành công ({len(summary['added'])}): {summary['added']}")
            print(f"ℹ️ Đã tồn tại từ trước ({len(summary['already_exists'])}): {summary['already_exists']}")
            print(f"⚠️ Chưa kích hoạt SSO Git ({len(summary['not_found_sso'])}): {summary['not_found_sso']}")
            if summary['errors']:
                print(f"❌ Lỗi ({len(summary['errors'])}): {summary['errors']}")
            print("=" * 60)

            # Chờ 5 giây cho anh quan sát thành quả
            logger.info("⏳ Chờ 5 giây trước khi đóng trình duyệt...")
            await page.wait_for_timeout(5000)

        except Exception as e:
            logger.error(f"❌ Lỗi ngoại lệ trong quá trình bulk test: {e}", exc_info=True)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(run_visual_bulk_test())