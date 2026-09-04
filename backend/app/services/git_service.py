# backend/app/services/git_service.py
import logging
import asyncio
import gc
import re
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page, Browser, Locator, Error as PlaywrightError

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
    - Tự động chuyển đổi vai trò (ADMIN, DEVELOPER, GUEST - mặc định GUEST).
    - Bắt ngoại lệ và xử lý các trường hợp user chưa kích hoạt SSO JIT provisioning.
    """

    def __init__(self):
        self.headless = True
        self.base_url = (getattr(settings, "GIT_SERVER_URL", None) or "https://git.pythaverse.space").rstrip("/")

    def _clean_repo_url(self, raw_url: str) -> str:
        """Chuẩn hóa URL của Repo thành link cài đặt Collaborators trực tiếp."""
        if not raw_url:
            return ""
        clean = raw_url.strip().rstrip("/")
        # Nếu người dùng đã truyền sẵn /settings/collaborators
        if clean.endswith("/settings/collaborators"):
            return clean
        if clean.endswith("/settings"):
            return f"{clean}/collaborators"
        # Mặc định nối thêm /settings/collaborators vào link repo gốc
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
            clean = item.strip()
            if clean and clean not in cleaned:
                cleaned.append(clean)
        return cleaned

    async def _login_git_oidc(self, page: Page) -> bool:
        """Đăng nhập Pythaverse Git qua Pythaverse eID Keycloak."""
        try:
            admin_user = getattr(settings, "GIT_ADMIN_USER", None)
            admin_pass = getattr(settings, "GIT_ADMIN_PASS", None)

            if not admin_pass:
                logger.error("❌ Không tìm thấy mật khẩu quản trị Git/Keycloak trong biến môi trường!")
                return False

            logger.info("🔑 Đang mở cổng đăng nhập Pythaverse Git...")
            await page.goto(f"{self.base_url}/signin", wait_until="domcontentloaded", timeout=40000)

            # Kiểm tra nếu đã có session đăng nhập trước đó
            if "signin" not in page.url and await page.locator("a[href*='/signout'], img.avatar-mini").count() > 0:
                logger.info(f"✅ Đã có phiên đăng nhập Pythaverse Git hợp lệ! (URL: {page.url})")
                return True

            # 1. Bấm nút "Sign in with Pythaverse eID" từ form OIDC (TUYỆT ĐỐI NÉ NÚT TRÊN HEADER)
            oidc_submit_btn = page.locator("form[action*='/signin/oidc'] input[type='submit'], input[value*='Sign in with Pythaverse eID']").first
            if await oidc_submit_btn.count() > 0:
                logger.info("👉 Bấm nút 'Sign in with Pythaverse eID'...")
                try:
                    async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                        await oidc_submit_btn.click()
                except Exception:
                    pass
            else:
                logger.warning("⚠️ Không tìm thấy nút OIDC form, kiểm tra URL hiện tại...")

            await page.wait_for_load_state("domcontentloaded")

            # 2. Xử lý Form đăng nhập Keycloak nếu xuất hiện
            username_input = page.locator("input#username, input[name='username'], #username").first
            if await username_input.count() > 0 and await username_input.is_visible():
                logger.info(f"🔐 Điền thông tin quản trị Git trên Keycloak: {admin_user}")
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
            user_avatar = page.locator("a.dropdown-toggle[title*='Signed is as'], img.avatar-mini, a[href='/signout']").first
            try:
                await user_avatar.wait_for(state="visible", timeout=15000)
                logger.info("✅ Đăng nhập Pythaverse Git thành công!")
                return True
            except Exception:
                if "signin" not in page.url and "realms" not in page.url:
                    logger.info(f"✅ Đăng nhập Pythaverse Git thành công (Bypass URL: {page.url})!")
                    return True

            logger.error(f"❌ Không thể xác nhận đăng nhập Git. URL hiện tại: {page.url}")
            return False

        except Exception as e:
            logger.error(f"❌ Lỗi ngoại lệ khi đăng nhập Git OIDC: {e}")
            return False

    async def _internal_add_collaborators(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Thực thi thêm danh sách người dùng vào Collaborators của Git Repo."""
        raw_repo_url = payload.get("repo_url", "").strip()
        if not raw_repo_url:
            return {"status": "failed", "error": "Thiếu thông tin đường dẫn Repository (repo_url)."}

        settings_url = self._clean_repo_url(raw_repo_url)
        target_role = (payload.get("role") or "GUEST").upper()
        if target_role not in ["ADMIN", "DEVELOPER", "GUEST"]:
            target_role = "GUEST"

        users = self._sanitize_users(payload.get("users", payload.get("usernames", payload.get("emails", []))))
        if not users:
            return {"status": "failed", "error": "Danh sách người dùng cần thêm vào repo rỗng."}

        logger.info(f"🚀 BẮT ĐẦU THÊM {len(users)} NGƯỜI DÙNG VÀO REPO: {settings_url} | Vai trò mục tiêu: [{target_role}]")

        results = {
            "repo_url": raw_repo_url,
            "target_role": target_role,
            "added": [],
            "already_exists": [],
            "skipped": [],
            "errors": []
        }

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
                # 1. Đăng nhập Git
                if not await self._login_git_oidc(page):
                    return {"status": "failed", "error": "Không thể đăng nhập vào Pythaverse Git qua Pythaverse eID SSO."}

                # 2. Truy cập thẳng trang Collaborators
                logger.info(f"📂 Đang truy cập trang quản lý Collaborators: {settings_url}")
                response = await page.goto(settings_url, wait_until="domcontentloaded", timeout=45000)
                if response and response.status == 404:
                    return {"status": "failed", "error": f"Không tìm thấy Repository hoặc bạn không có quyền quản trị: {settings_url}"}

                await wait_for_dom_and_spinners(page, "input#userName-collaborator, #collaborator-list, input[value='Apply changes']", min_pacing_ms=300)

                user_input = page.locator("input#userName-collaborator").first
                add_btn = page.locator("input#addCollaborator").first
                error_span = page.locator("span#error-collaborator").first

                if await user_input.count() == 0 or await add_btn.count() == 0:
                    return {"status": "failed", "error": "Không tìm thấy form Collaborators trên trang repo. Vui lòng kiểm tra quyền Admin của tài khoản!"}

                new_additions_count = 0

                # 3. Lặp qua từng tài khoản cần thêm
                for user_item in users:
                    user_clean = user_item.strip()
                    logger.info(f"🔍 Đang xử lý thêm: '{user_clean}'...")

                    # Kiểm tra xem user đã có trong danh sách trên giao diện chưa
                    existing_user = page.locator(f"#collaborator-list li").filter(has_text=user_clean).first
                    if await existing_user.count() > 0:
                        logger.info(f"ℹ️ Tài khoản '{user_clean}' đã tồn tại trong danh sách Collaborators. Đang cập nhật Role sang [{target_role}]...")
                        # Thử kích hoạt role mong muốn nếu khác
                        target_label = existing_user.locator(f".btn-group.role label:has(input[value='{target_role}'])").first
                        if await target_label.count() > 0:
                            await target_label.click(force=True)
                            new_additions_count += 1
                        results["already_exists"].append(user_clean)
                        continue

                    # Nhập vào ô tìm kiếm typeahead
                    await user_input.click(force=True)
                    await user_input.fill("")
                    await user_input.press_sequentially(user_clean, delay=40)

                    # Chờ Typeahead dropdown xuất hiện
                    typeahead_item = page.locator("ul.typeahead.dropdown-menu li a").first
                    try:
                        await typeahead_item.wait_for(state="visible", timeout=3500)
                        await typeahead_item.click(force=True)
                    except Exception:
                        # Thử dùng phím Enter nếu typeahead không hiện dropdown
                        await user_input.press("Enter")

                    await page.wait_for_timeout(200)

                    # Bấm nút Add
                    await add_btn.click(force=True)
                    await page.wait_for_timeout(600)

                    # Kiểm tra lỗi (ví dụ: User does not exist / User has been already added)
                    err_text = (await error_span.inner_text()).strip() if await error_span.count() > 0 else ""

                    if err_text:
                        logger.warning(f"⚠️ Không thể thêm '{user_clean}': {err_text}")
                        if "already" in err_text.lower():
                            results["already_exists"].append(user_clean)
                        else:
                            results["skipped"].append({"user": user_clean, "reason": err_text})
                        continue

                    # Nếu thành công, user sẽ xuất hiện ở dòng cuối cùng của #collaborator-list
                    last_li = page.locator("#collaborator-list li").last
                    if await last_li.count() > 0:
                        # Đổi role từ mặc định ADMIN sang target_role (mặc định GUEST)
                        role_label = last_li.locator(f".btn-group.role label:has(input[value='{target_role}'])").first
                        if await role_label.count() > 0:
                            await role_label.click(force=True)
                            logger.info(f"✅ Đã thêm '{user_clean}' và gán vai trò [{target_role}] thành công!")
                        else:
                            logger.info(f"✅ Đã thêm '{user_clean}' thành công!")

                        results["added"].append(user_clean)
                        new_additions_count += 1
                    else:
                        results["skipped"].append({"user": user_clean, "reason": "Không thấy bản ghi hiển thị sau khi Add"})

                # 4. Lưu lại toàn bộ thay đổi bằng nút "Apply changes"
                if new_additions_count > 0:
                    logger.info("💾 Đang bấm 'Apply changes' để lưu cấu hình Collaborators...")
                    apply_btn = page.locator("input[type='submit'][value='Apply changes']").first
                    if await apply_btn.count() > 0:
                        try:
                            async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                                await apply_btn.click()
                        except Exception:
                            await apply_btn.click(force=True)
                        logger.info("🎉 Đã lưu danh sách Collaborators vào Git thành công!")
                    else:
                        logger.warning("⚠️ Không tìm thấy nút 'Apply changes'!")
                else:
                    logger.info("ℹ️ Không có thay đổi mới nào cần lưu.")

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
                logger.error(f"❌ Lỗi ngoại lệ trong quá trình thêm Git Collaborators: {e}")
                return {"status": "failed", "error": str(e), "details": results}
            finally:
                await browser.close()
                gc.collect()

    async def add_collaborators_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Bọc Khóa Slot Concurrency Toàn Cục & Timeout an toàn cho thao tác Git."""
        timeout_seconds = 180.0
        async with acquire_playwright_slot("Git Add Collaborators", timeout=timeout_seconds):
            try:
                return await asyncio.wait_for(self._internal_add_collaborators(payload), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                logger.error(f"❌ Quá thời gian thực thi (Timeout {timeout_seconds}s) khi thao tác với Pythaverse Git.")
                return {"status": "failed", "error": f"Tác vụ Git bị Timeout (vượt quá {timeout_seconds}s)."}


git_playwright_service = GitPlaywrightService()