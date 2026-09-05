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
    - Quản lý thêm danh sách thành viên vào Repository Collaborators (/settings/collaborators).
    - Tự động gán vai trò: ADMIN, DEVELOPER, GUEST (mặc định GUEST).
    - Hỗ trợ nhập liệu linh hoạt qua Email hoặc Username (nhận diện qua GitBucket Typeahead).
    - Phân loại chính xác tài khoản đã tồn tại vs tài khoản chưa kích hoạt JIT SSO.
    - Tối ưu hóa bộ nhớ nghiêm ngặt cho máy chủ Render 512MB RAM.
    """

    def __init__(self):
        self.base_url = (getattr(settings, "GIT_SERVER_URL", None) or "https://git.pythaverse.space").rstrip("/")

    def _determine_headless(self, override_headless: Optional[bool] = None) -> bool:
        """Xác định chế độ chạy ẩn danh (Headless) dựa theo tham số hoặc môi trường."""
        if override_headless is not None:
            return override_headless
        if os.getenv("GIT_HEADED", "").lower() in ["1", "true", "yes"]:
            return False
        if getattr(settings, "ENV", "development") == "production":
            return True
        return os.getenv("PLAYWRIGHT_HEADLESS", "true").lower() in ["1", "true", "yes"]

    def _clean_repo_url(self, raw_url: str) -> str:
        """Chuẩn hóa URL: Cắt bỏ đuôi .git và điều hướng thẳng vào /settings/collaborators."""
        if not raw_url:
            return ""
        clean = raw_url.strip().rstrip("/")
        if clean.endswith(".git"):
            clean = clean[:-4].rstrip("/")

        if clean.endswith("/settings/collaborators"):
            return clean
        if clean.endswith("/settings"):
            return f"{clean}/collaborators"
        return f"{clean}/settings/collaborators"

    def _sanitize_users(self, user_list: Any) -> List[str]:
        """Làm sạch danh sách username hoặc email (tách theo dòng, dấu phẩy, khoảng trắng)."""
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
                logger.error("❌ Không tìm thấy mật khẩu GIT_ADMIN_PASS trong file cấu hình .env!")
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
                logger.warning("⚠️ Không thấy nút OIDC, tiếp tục kiểm tra trang chuyển hướng...")

            await page.wait_for_load_state("domcontentloaded")

            # 2. Điền form đăng nhập Keycloak SSO nếu xuất hiện
            username_input = page.locator("input#username, input[name='username'], #username").first
            if await username_input.count() > 0 and await username_input.is_visible():
                logger.info(f"🔐 Đang điền tài khoản quản trị Git trên Keycloak: {admin_user}")
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

            logger.error(f"❌ Đăng nhập Git thất bại! Kẹt lại tại URL: {page.url}")
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

        logger.info(f"🚀 BẮT ĐẦU BULK THÊM {len(users)} THÀNH VIÊN VÀO REPO: {settings_url} | Role: [{target_role}] | Headless: {is_headless}")

        results: Dict[str, Any] = {
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
                    launch_kwargs["slow_mo"] = 250

                browser = await p.chromium.launch(**launch_kwargs)
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                )

                # Chặn tải ảnh & font rác khi chạy headless trên Render để tiết kiệm tối đa RAM
                if is_headless:
                    await setup_low_ram_routes(context)

                page = await context.new_page()
                page.set_default_timeout(35000)

                # 1. Đăng nhập Git
                if not await self._login_git_oidc(page):
                    return {"status": "failed", "error": "Không thể đăng nhập Pythaverse Git qua Pythaverse eID SSO."}

                # 2. Truy cập thẳng trang cài đặt Collaborators
                logger.info(f"📂 Đang truy cập trang quản lý Collaborators: {settings_url}")
                response = await page.goto(settings_url, wait_until="domcontentloaded", timeout=45000)
                if response and response.status in [403, 404]:
                    return {
                        "status": "failed",
                        "error": f"Không tìm thấy Repository hoặc bạn không có quyền Quản trị (Status {response.status}): {settings_url}"
                    }

                await wait_for_dom_and_spinners(page, "input#userName-collaborator, #collaborator-list, input[value='Apply changes']", min_pacing_ms=300)

                user_input = page.locator("input#userName-collaborator").first
                add_btn = page.locator("input#addCollaborator").first
                error_span = page.locator("span#error-collaborator").first

                if await user_input.count() == 0 or await add_btn.count() == 0:
                    return {
                        "status": "failed",
                        "error": "Không tìm thấy form Collaborators. Vui lòng kiểm tra quyền Owner/Admin của tài khoản trên Repo!"
                    }

                new_changes_count = 0

                # 3. Lặp qua từng người dùng trong danh sách
                for idx, user_raw in enumerate(users, 1):
                    user_item = user_raw.strip()
                    logger.info(f"[{idx}/{len(users)}] 🔍 Đang xử lý: '{user_item}'...")

                    # Kiểm tra sơ bộ xem username này đã có trên danh sách hiển thị chưa
                    existing_card = page.locator("#collaborator-list li").filter(has_text=user_item).first
                    if await existing_card.count() > 0:
                        logger.info(f"ℹ️ '{user_item}' đã có trong danh sách Collaborators. Cập nhật Role sang [{target_role}]...")
                        target_label = existing_card.locator(f"label:has(input[value='{target_role}'])").first
                        if await target_label.count() > 0 and not ("active" in (await target_label.get_attribute("class") or "")):
                            await target_label.click(force=True)
                            new_changes_count += 1
                        results["already_exists"].append(user_item)
                        continue

                    # Bước A: Dọn sạch ô input trước khi nhập
                    await user_input.click(force=True)
                    await user_input.fill("")
                    await user_input.press_sequentially(user_item, delay=35)

                    # Bước B: Chờ gợi ý từ Typeahead Dropdown và click chọn
                    dropdown_item = page.locator("ul.typeahead.dropdown-menu li a").first
                    try:
                        await dropdown_item.wait_for(state="visible", timeout=2500)
                        await dropdown_item.click(force=True)
                    except Exception:
                        await user_input.press("Enter")

                    await page.wait_for_timeout(250)

                    # Bước C: Bấm nút Add
                    await add_btn.click(force=True)
                    await page.wait_for_timeout(600)

                    # Bước D: Kiểm tra thông báo lỗi từ GitBucket (nếu có)
                    err_msg = (await error_span.inner_text()).strip() if await error_span.count() > 0 else ""

                    if err_msg:
                        # TH1: Người dùng đã được thêm từ trước (email ánh xạ tới username đã có)
                        if "already" in err_msg.lower():
                            logger.info(f"ℹ️ GitBucket thông báo '{user_item}' đã tồn tại trong repo: {err_msg}")
                            results["already_exists"].append(user_item)
                        # TH2: Tài khoản chưa bao giờ đăng nhập OIDC vào Git
                        elif "not exist" in err_msg.lower() or "not found" in err_msg.lower():
                            logger.warning(f"⚠️ '{user_item}' chưa kích hoạt SSO trên Git: {err_msg}")
                            results["skipped"].append({
                                "user": user_item,
                                "reason": f"{err_msg} (Tài khoản chưa từng đăng nhập SSO vào git.pythaverse.space)"
                            })
                        else:
                            logger.warning(f"⚠️ Lỗi khác khi thêm '{user_item}': {err_msg}")
                            results["errors"].append({"user": user_item, "error": err_msg})

                        await user_input.fill("")
                        continue

                    # Bước E: Thêm thành công! Thẻ mới luôn nằm ở CUỐI CÙNG (.last) trước khi Apply changes
                    last_li = page.locator("#collaborator-list li").last
                    if await last_li.count() > 0:
                        role_btn = last_li.locator(f"label:has(input[value='{target_role}'])").first
                        if await role_btn.count() > 0:
                            await role_btn.click(force=True)
                        new_changes_count += 1
                        results["added"].append(user_item)
                        logger.info(f"✅ Đã thêm '{user_item}' và gán vai trò [{target_role}] thành công!")
                    else:
                        results["added"].append(user_item)
                        new_changes_count += 1

                    await user_input.fill("")

                # 4. Bấm "Apply changes" để lưu toàn bộ thay đổi vào Repo
                if new_changes_count > 0:
                    logger.info("💾 Đang bấm 'Apply changes' để lưu toàn bộ danh sách vào Repo...")
                    apply_btn = page.locator("input[type='submit'][value='Apply changes'], button:has-text('Apply changes')").first
                    if await apply_btn.count() > 0:
                        try:
                            async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                                await apply_btn.click()
                        except Exception:
                            await apply_btn.click(force=True)
                        logger.info("🎉 TẤT CẢ THAY ĐỔI ĐÃ ĐƯỢC LƯU VÀO REPO THÀNH CÔNG!")
                    else:
                        logger.warning("⚠️ Không tìm thấy nút 'Apply changes' trên trang!")
                else:
                    logger.info("ℹ️ Không có thay đổi nào mới cần lưu.")

                # Tổng kết trạng thái toàn bộ tiến trình
                total_req = len(users)
                success_len = len(results["added"]) + len(results["already_exists"])
                overall_status = "success" if success_len == total_req else ("partial_success" if success_len > 0 else "failed")

                return {
                    "status": overall_status,
                    "message": f"Hoàn thành: Thêm mới {len(results['added'])}, Đã có sẵn {len(results['already_exists'])}, Bỏ qua {len(results['skipped'])}.",
                    "details": results
                }

            except Exception as e:
                logger.error(f"❌ Lỗi ngoại lệ trong quá trình thêm Git Collaborators: {e}", exc_info=True)
                return {"status": "failed", "error": str(e), "details": results}
            finally:
                if context:
                    await context.close()
                if browser:
                    await browser.close()
                gc.collect()

    async def add_collaborators_pipeline(self, payload: Dict[str, Any], headless: Optional[bool] = None) -> Dict[str, Any]:
        """
        Cổng tiếp nhận chính: Chạy trên Làn VIP (lane='admin') với Timeout bảo vệ an toàn.
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