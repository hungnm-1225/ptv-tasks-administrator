# backend/app/services/git_service.py
import logging
import asyncio
import gc
import re
import os
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page, Browser, BrowserContext

from app.core.config import settings
from app.core.playwright_manager import (
    acquire_playwright_slot,
    LOW_RAM_CHROMIUM_ARGS,
    setup_low_ram_routes,
    wait_for_dom_and_spinners
)

logger = logging.getLogger(__name__)


class GitPlaywrightService:
    """
    Playwright Worker tự động hóa trên Pythaverse Git (GitBucket - git.pythaverse.space):
    - Đăng nhập SSO qua Pythaverse eID (Keycloak OpenID Connect).
    - Quản lý thêm thành viên vào Repository Collaborators (/settings/collaborators).
    - Tự động gán vai trò: ADMIN, DEVELOPER, GUEST (mặc định GUEST).
    - Set role ngay trên dòng cuối (.last) trước khi bấm Apply changes.
    - Chạy trên Làn VIP (lane='admin') và tối ưu RAM nghiêm ngặt cho Render 512MB.
    """

    def __init__(self):
        self.base_url = (getattr(settings, "GIT_SERVER_URL", None) or "https://git.pythaverse.space").rstrip("/")

    def _determine_headless(self, override_headless: Optional[bool] = None) -> bool:
        """Xác định chế độ chạy ẩn danh (Headless)."""
        if override_headless is not None:
            return override_headless
        if os.getenv("GIT_HEADED", "").lower() in ["1", "true", "yes"]:
            return False
        if getattr(settings, "ENV", "development") == "production":
            return True
        return os.getenv("PLAYWRIGHT_HEADLESS", "true").lower() in ["1", "true", "yes"]

    def _clean_repo_url(self, raw_url: str) -> str:
        """Chuẩn hóa URL của Repo: loại bỏ đuôi .git và trỏ thẳng vào /settings/collaborators."""
        if not raw_url:
            return ""
        clean = raw_url.strip().rstrip("/")
        # Triệt tiêu hoàn toàn đuôi .git nếu người dùng paste link clone git
        if clean.endswith(".git"):
            clean = clean[:-4].rstrip("/")

        if clean.endswith("/settings/collaborators"):
            return clean
        if clean.endswith("/settings"):
            return f"{clean}/collaborators"
        return f"{clean}/settings/collaborators"

    def _sanitize_users(self, user_list: Any) -> List[str]:
        """Làm sạch danh sách username hoặc email."""
        if not user_list:
            return []
        if isinstance(user_list, str):
            raw_items = re.split(r"[\n,;\s]+", user_list)
        elif isinstance(user_list, list):
            raw_items = [str(x) for x in user_list]
        else:
            return []

        cleaned = []
        for item in raw_items:
            clean = item.strip().lower()
            if clean and clean not in cleaned:
                cleaned.append(clean)
        return cleaned

    async def _login_git_oidc(self, page: Page) -> bool:
        """Đăng nhập Pythaverse Git qua cổng Keycloak SSO OIDC."""
        try:
            admin_user = getattr(settings, "GIT_ADMIN_USER", None) or "ptvadmin"
            admin_pass = getattr(settings, "GIT_ADMIN_PASS", None)

            if not admin_pass:
                logger.error("❌ Không tìm thấy mật khẩu GIT_ADMIN_PASS trong biến môi trường .env!")
                return False

            logger.info("🔑 Đang mở cổng đăng nhập Pythaverse Git...")
            await page.goto(f"{self.base_url}/signin", wait_until="domcontentloaded", timeout=40000)

            # Kiểm tra nếu phiên đăng nhập cũ vẫn còn hiệu lực
            if "signin" not in page.url and await page.locator("a[href*='/signout'], img.avatar-mini").count() > 0:
                logger.info(f"✅ Đã có phiên đăng nhập Pythaverse Git sẵn có! (URL: {page.url})")
                return True

            # 1. Bấm nút "Sign in with Pythaverse eID" từ form OIDC
            oidc_submit_btn = page.locator("form[action*='/signin/oidc'] input[type='submit'], input[value*='Sign in with Pythaverse eID'], a:has-text('Pythaverse eID')").first
            if await oidc_submit_btn.count() > 0:
                logger.info("👉 Bấm nút 'Sign in with Pythaverse eID'...")
                try:
                    async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                        await oidc_submit_btn.click()
                except Exception:
                    pass
            else:
                logger.warning("⚠️ Không thấy nút OIDC, tiếp tục kiểm tra trang...")

            await page.wait_for_load_state("domcontentloaded")

            # 2. Điền form đăng nhập Keycloak SSO nếu xuất hiện
            username_input = page.locator("input#username, input[name='username'], #username").first
            if await username_input.count() > 0 and await username_input.is_visible():
                logger.info(f"🔐 Điền tài khoản quản trị Git trên Keycloak: {admin_user}")
                await username_input.fill(admin_user)
                await page.fill("input#password, input[name='password'], #password", admin_pass)

                login_btn = page.locator("input#kc-login, button[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')").first
                try:
                    async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                        await login_btn.click()
                except Exception:
                    pass

            await page.wait_for_load_state("domcontentloaded")

            # 3. Xác nhận đã vào trong GitBucket
            user_avatar = page.locator("a.dropdown-toggle[title*='Signed'], img.avatar-mini, a[href*='/signout']").first
            try:
                await user_avatar.wait_for(state="visible", timeout=15000)
                logger.info("✅ Đăng nhập Pythaverse Git thành công!")
                return True
            except Exception:
                if "signin" not in page.url and "realms" not in page.url:
                    logger.info(f"✅ Đăng nhập Pythaverse Git thành công (URL: {page.url})!")
                    return True

            logger.error(f"❌ Đăng nhập Git thất bại! Đang dừng tại: {page.url}")
            return False

        except Exception as e:
            logger.error(f"❌ Lỗi ngoại lệ khi đăng nhập Git OIDC: {e}")
            return False

    async def _internal_add_collaborators(self, payload: Dict[str, Any], is_headless: bool) -> Dict[str, Any]:
        """Thực thi thêm danh sách người dùng vào Collaborators của Git Repo."""
        raw_repo_url = payload.get("repo_url", "").strip()
        if not raw_repo_url:
            return {"status": "failed", "error": "Thiếu thông tin đường dẫn Repository (repo_url)."}

        settings_url = self._clean_repo_url(raw_repo_url)
        target_role = (payload.get("role") or "GUEST").upper()
        if target_role not in ["ADMIN", "DEVELOPER", "GUEST"]:
            target_role = "GUEST"

        users = self._sanitize_users(payload.get("users", payload.get("collaborators", payload.get("emails", []))))
        if not users:
            return {"status": "failed", "error": "Danh sách người dùng cần thêm vào repo rỗng."}

        logger.info(f"🚀 BẮT ĐẦU THÊM {len(users)} THÀNH VIÊN VÀO REPO: {settings_url} | Role: [{target_role}] | Headless: {is_headless}")

        results = {
            "repo_url": raw_repo_url,
            "settings_url": settings_url,
            "target_role": target_role,
            "added": [],
            "already_exists": [],
            "skipped": [],
            "errors": []
        }

        browser: Optional[Browser] = None
        context: Optional[BrowserContext] = None

        async with async_playwright() as p:
            try:
                launch_kwargs: Dict[str, Any] = {
                    "headless": is_headless,
                    "args": LOW_RAM_CHROMIUM_ARGS
                }
                if not is_headless:
                    launch_kwargs["slow_mo"] = 300  # Pacing nhẹ trên local để quan sát

                browser = await p.chromium.launch(**launch_kwargs)
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                )

                # Chặn ảnh/font rác khi chạy Headless trên Render
                if is_headless:
                    await setup_low_ram_routes(context)

                page = await context.new_page()
                page.set_default_timeout(35000)

                # 1. Đăng nhập Git qua SSO
                if not await self._login_git_oidc(page):
                    return {"status": "failed", "error": "Không thể đăng nhập Pythaverse Git qua Pythaverse eID SSO."}

                # 2. Mở trực tiếp trang Collaborators
                logger.info(f"📂 Đang truy cập trang quản lý Collaborators: {settings_url}")
                response = await page.goto(settings_url, wait_until="domcontentloaded", timeout=45000)
                if response and response.status in [403, 404]:
                    return {
                        "status": "failed",
                        "error": f"Không tìm thấy Repository hoặc bạn không có quyền Quản trị (HTTP {response.status}): {settings_url}"
                    }

                await wait_for_dom_and_spinners(page, "input#userName-collaborator, #collaborator-list, input[value='Apply changes']", min_pacing_ms=300)

                user_input = page.locator("input#userName-collaborator").first
                add_btn = page.locator("input#addCollaborator").first
                error_span = page.locator("span#error-collaborator").first

                if await user_input.count() == 0 or await add_btn.count() == 0:
                    return {
                        "status": "failed",
                        "error": "Không tìm thấy form Collaborators trên trang repo. Hãy kiểm tra quyền Owner/Admin!"
                    }

                new_changes_count = 0

                # 3. Duyệt qua từng tài khoản trong danh sách
                for raw_user in users:
                    user_query = raw_user.strip()
                    logger.info(f"🔍 Đang kiểm tra & thêm: '{user_query}'...")

                    # Kiểm tra xem tài khoản này đã có mặt trên bảng chưa (khớp theo username hoặc email)
                    existing_card = page.locator("#collaborator-list li").filter(has_text=user_query).first
                    if await existing_card.count() > 0:
                        logger.info(f"ℹ️ '{user_query}' đã có trong Collaborators. Kiểm tra vai trò [{target_role}]...")
                        target_label = existing_card.locator(f"label:has(input[value='{target_role}'])").first
                        if await target_label.count() > 0 and not ("active" in (await target_label.get_attribute("class") or "")):
                            await target_label.click(force=True)
                            new_changes_count += 1
                        results["already_exists"].append(user_query)
                        continue

                    # Điền vào ô input tìm kiếm (hỗ trợ cả username hoặc email)
                    await user_input.click(force=True)
                    await user_input.fill("")
                    await user_input.press_sequentially(user_query, delay=40)

                    # Chờ Typeahead Dropdown gợi ý
                    typeahead_item = page.locator("ul.typeahead.dropdown-menu li a").first
                    try:
                        await typeahead_item.wait_for(state="visible", timeout=3000)
                        await typeahead_item.click(force=True)
                        await page.wait_for_timeout(200)
                    except Exception:
                        # Nếu không có dropdown, thử bấm Enter xác nhận
                        await user_input.press("Enter")

                    await page.wait_for_timeout(250)

                    # Bấm nút Add
                    await add_btn.click(force=True)
                    await page.wait_for_timeout(600)

                    # Bắt lỗi nếu tài khoản chưa từng đăng nhập SSO (JIT provisioning chưa kích hoạt)
                    err_text = (await error_span.inner_text()).strip() if await error_span.count() > 0 else ""
                    if err_text:
                        logger.warning(f"⚠️ GitBucket báo lỗi khi thêm '{user_query}': {err_text}")
                        if "already" in err_text.lower():
                            results["already_exists"].append(user_query)
                        else:
                            results["skipped"].append({
                                "user": user_query,
                                "reason": f"{err_text} (Tài khoản chưa từng đăng nhập SSO vào git.pythaverse.space)"
                            })
                        continue

                    # Bắt chính xác thẻ mới thêm ở cuối cùng danh sách (.last) như anh đã quan sát!
                    new_item = page.locator("#collaborator-list li").last
                    if await new_item.count() > 0:
                        # Click chọn đúng vai trò trên thẻ mới thêm trước khi Apply changes
                        role_label = new_item.locator(f"label:has(input[value='{target_role}'])").first
                        if await role_label.count() > 0:
                            await role_label.click(force=True)
                            logger.info(f"✅ Đã thêm '{user_query}' và chọn vai trò [{target_role}] ở cuối bảng!")
                        else:
                            logger.info(f"✅ Đã thêm '{user_query}' vào bảng!")

                        results["added"].append(user_query)
                        new_changes_count += 1
                    else:
                        results["skipped"].append({"user": user_query, "reason": "Không thấy bản ghi xuất hiện sau khi Add"})

                # 4. Bấm "Apply changes" để lưu và trigger GitBucket sắp xếp Alphabet
                if new_changes_count > 0:
                    logger.info("💾 Đang bấm 'Apply changes' để lưu toàn bộ cấu hình vào Git...")
                    apply_btn = page.locator("input[type='submit'][value='Apply changes'], button:has-text('Apply changes')").first
                    if await apply_btn.count() > 0:
                        try:
                            async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                                await apply_btn.click()
                        except Exception:
                            await apply_btn.click(force=True)
                        logger.info("🎉 Đã lưu danh sách Collaborators vào Repository thành công!")
                    else:
                        logger.warning("⚠️ Không tìm thấy nút 'Apply changes' trên trang!")
                else:
                    logger.info("ℹ️ Không có thay đổi nào cần lưu.")

                # Đánh giá trạng thái chung
                total_req = len(users)
                success_len = len(results["added"]) + len(results["already_exists"])
                overall_status = "success" if success_len == total_req else ("partial_success" if success_len > 0 else "failed")

                return {
                    "status": overall_status,
                    "message": f"Hoàn thành: Thêm mới {len(results['added'])}, Đã có sẵn {len(results['already_exists'])}, Bỏ qua {len(results['skipped'])}.",
                    "details": results
                }

            except Exception as e:
                logger.error(f"❌ Lỗi ngoại lệ khi xử lý Git Collaborators: {e}", exc_info=True)
                return {"status": "failed", "error": str(e), "details": results}
            finally:
                if context:
                    await context.close()
                if browser:
                    await browser.close()
                gc.collect()

    async def add_collaborators_pipeline(self, payload: Dict[str, Any], headless: Optional[bool] = None) -> Dict[str, Any]:
        """
        Cổng tiếp nhận chính: Chạy trên Làn VIP (lane='admin') với Timeout 180s bảo vệ an toàn.
        """
        is_headless = self._determine_headless(headless)
        timeout_seconds = 180.0

        async with acquire_playwright_slot("Git Add Collaborators", timeout=timeout_seconds, lane="admin"):
            try:
                return await asyncio.wait_for(
                    self._internal_add_collaborators(payload, is_headless=is_headless),
                    timeout=timeout_seconds
                )
            except asyncio.TimeoutError:
                logger.error(f"❌ Quá thời gian thực thi (Timeout {timeout_seconds}s) khi thao tác với Pythaverse Git.")
                return {"status": "failed", "error": f"Tác vụ Git bị Timeout (vượt quá {timeout_seconds}s)."}


git_playwright_service = GitPlaywrightService()