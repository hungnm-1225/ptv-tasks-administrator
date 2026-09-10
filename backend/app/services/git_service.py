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
    - Đăng nhập SSO qua Pythaverse eID (Keycloak OpenID Connect) DUY NHẤT 1 LẦN TRONG SUỐT PHIÊN.
    - Hỗ trợ thêm nhiều thành viên vào NHIỀU REPOSITORIES CÙNG LÚC (Single-Session Multi-Repo).
    - Tự động gán vai trò: ADMIN, DEVELOPER, GUEST (mặc định GUEST).
    - Tự động nhận diện JIT Provisioning (bỏ qua an toàn các tài khoản chưa kích hoạt SSO).
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
        """Đăng nhập Pythaverse Git qua cổng Keycloak SSO OIDC (Chỉ chạy 1 lần)."""
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

    async def _process_single_repo(
        self, 
        page: Page, 
        raw_repo_url: str, 
        users: List[str], 
        target_role: str
    ) -> Dict[str, Any]:
        """Thực thi thêm danh sách thành viên vào 1 Repo trong cùng 1 Browser Page."""
        settings_url = self._clean_repo_url(raw_repo_url)
        logger.info(f"📂 Đang truy cập trang quản lý Collaborators: {settings_url} | Role: [{target_role}] | Users: {len(users)}")

        repo_res: Dict[str, Any] = {
            "repo_url": raw_repo_url,
            "settings_url": settings_url,
            "target_role": target_role,
            "added": [],
            "already_exists": [],
            "skipped": [],
            "errors": []
        }

        try:
            response = await page.goto(settings_url, wait_until="domcontentloaded", timeout=45000)
            if response and response.status in [403, 404]:
                err_msg = f"Không tìm thấy Repo hoặc thiếu quyền Quản trị (Status {response.status}): {settings_url}"
                logger.error(f"❌ {err_msg}")
                repo_res["errors"].append({"user": "*", "error": err_msg})
                repo_res["status"] = "failed"
                return repo_res

            await wait_for_dom_and_spinners(
                page, 
                "input#userName-collaborator, #collaborator-list, input[value='Apply changes']", 
                min_pacing_ms=300
            )

            user_input = page.locator("input#userName-collaborator").first
            add_btn = page.locator("input#addCollaborator").first
            error_span = page.locator("span#error-collaborator").first

            if await user_input.count() == 0 or await add_btn.count() == 0:
                err_msg = f"Không tìm thấy form Collaborators tại {settings_url}. Kiểm tra quyền Owner/Admin!"
                logger.error(f"❌ {err_msg}")
                repo_res["errors"].append({"user": "*", "error": err_msg})
                repo_res["status"] = "failed"
                return repo_res

            new_changes_count = 0

            for idx, user_item in enumerate(users, 1):
                logger.info(f"  [{idx}/{len(users)}] 🔍 Đang xử lý: '{user_item}'...")

                # Kiểm tra xem user này đã có sẵn trong danh sách hiển thị chưa
                existing_card = page.locator("#collaborator-list li").filter(has_text=user_item).first
                if await existing_card.count() > 0:
                    logger.info(f"  ℹ️ '{user_item}' đã có trong danh sách. Kiểm tra Role [{target_role}]...")
                    target_label = existing_card.locator(f"label:has(input[value='{target_role}'])").first
                    if await target_label.count() > 0 and not ("active" in (await target_label.get_attribute("class") or "")):
                        await target_label.click(force=True)
                        new_changes_count += 1
                    repo_res["already_exists"].append(user_item)
                    continue

                # Nhập username / email
                await user_input.click(force=True)
                await user_input.fill("")
                await user_input.press_sequentially(user_item, delay=35)

                # Chờ gợi ý từ Dropdown Typeahead
                dropdown_item = page.locator("ul.typeahead.dropdown-menu li a").first
                try:
                    await dropdown_item.wait_for(state="visible", timeout=2200)
                    await dropdown_item.click(force=True)
                except Exception:
                    await user_input.press("Enter")

                await page.wait_for_timeout(250)
                await add_btn.click(force=True)
                await page.wait_for_timeout(500)

                # Kiểm tra phản hồi lỗi từ GitBucket
                err_msg = (await error_span.inner_text()).strip() if await error_span.count() > 0 else ""

                if err_msg:
                    if "already" in err_msg.lower():
                        repo_res["already_exists"].append(user_item)
                    elif "not exist" in err_msg.lower() or "not found" in err_msg.lower():
                        logger.warning(f"  ⚠️ '{user_item}' chưa kích hoạt SSO trên Git: {err_msg}")
                        repo_res["skipped"].append({
                            "user": user_item,
                            "reason": f"{err_msg} (Chưa từng đăng nhập SSO vào git.pythaverse.space)"
                        })
                    else:
                        logger.warning(f"  ⚠️ Lỗi khi thêm '{user_item}': {err_msg}")
                        repo_res["errors"].append({"user": user_item, "error": err_msg})

                    await user_input.fill("")
                    continue

                # Thẻ mới luôn nằm ở CUỐI CÙNG (.last)
                last_li = page.locator("#collaborator-list li").last
                if await last_li.count() > 0:
                    role_btn = last_li.locator(f"label:has(input[value='{target_role}'])").first
                    if await role_btn.count() > 0:
                        await role_btn.click(force=True)
                    new_changes_count += 1
                    repo_res["added"].append(user_item)
                    logger.info(f"  ✅ Đã thêm '{user_item}' vào {raw_repo_url} với Role [{target_role}]!")
                else:
                    repo_res["added"].append(user_item)
                    new_changes_count += 1

                await user_input.fill("")

            # Bấm Apply changes để lưu cho repo này
            if new_changes_count > 0:
                logger.info(f"💾 Đang lưu thay đổi cho Repo: {raw_repo_url}...")
                apply_btn = page.locator("input[type='submit'][value='Apply changes'], button:has-text('Apply changes')").first
                if await apply_btn.count() > 0:
                    try:
                        async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                            await apply_btn.click()
                    except Exception:
                        await apply_btn.click(force=True)
                    logger.info(f"🎉 ĐÃ LƯU THAY ĐỔI THÀNH CÔNG CHO REPO: {raw_repo_url}!")

            total_users = len(users)
            success_cnt = len(repo_res["added"]) + len(repo_res["already_exists"])
            repo_res["status"] = "success" if success_cnt == total_users else ("partial_success" if success_cnt > 0 else "failed")
            return repo_res

        except Exception as repo_err:
            logger.error(f"❌ Lỗi khi thao tác trên Repo {raw_repo_url}: {repo_err}")
            repo_res["status"] = "failed"
            repo_res["errors"].append({"user": "*", "error": str(repo_err)})
            return repo_res

    async def _internal_add_collaborators(self, payload: Dict[str, Any], is_headless: bool) -> Dict[str, Any]:
        """
        Bộ điều phối đa nhiệm: Nhận 1 repo hoặc NHIỀU REPOS, chỉ đăng nhập 1 lần duy nhất!
        Hỗ trợ:
        1. `repos_plan`: List[{"repo_url": str, "role": str, "users": List[str]}]
        2. `repo_urls` + `users` + `role`: List repos dùng chung danh sách users & role
        3. `repo_url` + `users` + `role`: 1 repo truyền thống
        """
        repos_plan: List[Dict[str, Any]] = []

        # TH1: Kế hoạch phân bổ chi tiết (từ LMS Auto-Sync hoặc Studio Multi-Plan)
        if payload.get("repos_plan") and isinstance(payload.get("repos_plan"), list):
            for item in payload["repos_plan"]:
                r_url = item.get("repo_url", "").strip()
                r_users = self._sanitize_users(item.get("users", []))
                r_role = (item.get("role") or "GUEST").upper()
                if r_url and r_users:
                    repos_plan.append({"repo_url": r_url, "users": r_users, "role": r_role})

        # TH2: Multi-Repos dùng chung users & role
        elif payload.get("repo_urls") and isinstance(payload.get("repo_urls"), list):
            shared_users = self._sanitize_users(payload.get("users", payload.get("collaborators", payload.get("emails", []))))
            shared_role = (payload.get("role") or "GUEST").upper()
            for u in payload["repo_urls"]:
                if str(u).strip():
                    repos_plan.append({"repo_url": str(u).strip(), "users": shared_users, "role": shared_role})

        # TH3: Đơn lẻ 1 repo (tương thích ngược)
        elif payload.get("repo_url"):
            shared_users = self._sanitize_users(payload.get("users", payload.get("collaborators", payload.get("emails", []))))
            shared_role = (payload.get("role") or "GUEST").upper()
            repos_plan.append({"repo_url": payload["repo_url"].strip(), "users": shared_users, "role": shared_role})

        if not repos_plan:
            return {"status": "failed", "error": "Không có Repository hoặc người dùng hợp lệ để thực thi."}

        logger.info(f"🚀 BẮT ĐẦU CHUỖI GÁN COLLABORATOR CHO {len(repos_plan)} REPOS TRONG 1 PHIÊN DUY NHẤT (Headless: {is_headless})")

        browser: Optional[Browser] = None
        context: Optional[BrowserContext] = None
        all_results: List[Dict[str, Any]] = []

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

                if is_headless:
                    await setup_low_ram_routes(context)

                page = await context.new_page()
                page.set_default_timeout(35000)

                # 🔑 ĐĂNG NHẬP ĐÚNG 1 LẦN CHO TẤT CẢ REPOS
                if not await self._login_git_oidc(page):
                    return {"status": "failed", "error": "Không thể đăng nhập Pythaverse Git qua Pythaverse eID SSO."}

                # 🔁 DUYỆT TỪNG REPOSITORY
                for r_idx, plan in enumerate(repos_plan, 1):
                    logger.info(f"\n========================================================")
                    logger.info(f"👉 XỬ LÝ REPO [{r_idx}/{len(repos_plan)}]: {plan['repo_url']}")
                    logger.info(f"========================================================")
                    res = await self._process_single_repo(
                        page=page,
                        raw_repo_url=plan["repo_url"],
                        users=plan["users"],
                        target_role=plan["role"]
                    )
                    all_results.append(res)
                    await page.wait_for_timeout(600)

                # Tổng kết tổng hợp
                total_repos = len(all_results)
                successful_repos = sum(1 for r in all_results if r.get("status") in ["success", "partial_success"])
                overall_status = "success" if successful_repos == total_repos else ("partial_success" if successful_repos > 0 else "failed")

                total_added = sum(len(r.get("added", [])) for r in all_results)
                total_already = sum(len(r.get("already_exists", [])) for r in all_results)
                total_skipped = sum(len(r.get("skipped", [])) for r in all_results)

                return {
                    "status": overall_status,
                    "message": f"Hoàn tất xử lý {total_repos} Repos. Đã thêm: {total_added} lượt, Đã có sẵn: {total_already} lượt, Bỏ qua (chưa SSO): {total_skipped}.",
                    "details": all_results
                }

            except Exception as e:
                logger.error(f"❌ Lỗi ngoại lệ trong chuỗi Git Multi-Repo: {e}", exc_info=True)
                return {"status": "failed", "error": str(e), "details": all_results}
            finally:
                if context:
                    await context.close()
                if browser:
                    await browser.close()
                gc.collect()

    async def add_collaborators_pipeline(self, payload: Dict[str, Any], headless: Optional[bool] = None) -> Dict[str, Any]:
        """Cổng tiếp nhận chính: Chạy trên Làn VIP (lane='admin') với Dynamic Timeout."""
        is_headless = self._determine_headless(headless)
        
        # Tính timeout động dựa trên số lượng repo (tối thiểu 180s, mỗi repo thêm 60s)
        repo_count = len(payload.get("repos_plan") or payload.get("repo_urls") or [1])
        timeout_seconds = max(180.0, float(repo_count * 60.0))

        async with acquire_playwright_slot("Git Add Collaborators", timeout=timeout_seconds, lane="admin"):
            try:
                return await asyncio.wait_for(
                    self._internal_add_collaborators(payload, is_headless=is_headless),
                    timeout=timeout_seconds
                )
            except asyncio.TimeoutError:
                logger.error(f"❌ Quá thời gian thực thi (Timeout {timeout_seconds}s) khi thao tác Git Multi-Repo.")
                return {"status": "failed", "error": f"Tác vụ Git bị Timeout (vượt quá {timeout_seconds}s)."}


git_playwright_service = GitPlaywrightService()