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
from app.services.keycloak_service import keycloak_service

logger = logging.getLogger(__name__)


class GitPlaywrightService:
    """
    Playwright Worker tự động hóa trên Pythaverse Git (GitBucket - git.pythaverse.space):
    - Sàng lọc qua Keycloak Gateway: Loại bỏ 100% ai chưa có tài khoản eID Keycloak.
    - Đăng nhập SSO qua Pythaverse eID DUY NHẤT 1 LẦN TRONG PHIÊN.
    - Thêm thành viên vào NHIỀU REPOSITORIES CÙNG LÚC (Single-Session Multi-Repo).
    - Xuất báo cáo kiểm định danh sách cụ thể từng con người (Added, Existing, Not Logged In, Not Found Keycloak).
    """

    def __init__(self):
        self.base_url = (getattr(settings, "GIT_SERVER_URL", None) or "https://git.pythaverse.space").rstrip("/")

    def _determine_headless(self, override_headless: Optional[bool] = None) -> bool:
        if override_headless is not None:
            return override_headless
        if os.getenv("GIT_HEADED", "").lower() in ["1", "true", "yes"]:
            return False
        if getattr(settings, "ENV", "development") == "production":
            return True
        return os.getenv("PLAYWRIGHT_HEADLESS", "true").lower() in ["1", "true", "yes"]

    def _clean_repo_url(self, raw_url: str) -> str:
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

    async def _normalize_and_filter_users_via_keycloak(self, payload: Dict[str, Any]) -> tuple[Dict[str, Any], List[str]]:
        """
        BƯỚC SÀNG LỌC TUYỆT ĐỐI:
        1. Gửi toàn bộ email/username sang Keycloak Gateway.
        2. CHỈ GIỮ LẠI những người ĐÃ CÓ TÀI KHOẢN trên Keycloak (đổi sang USERNAME).
        3. LOẠI BỎ NGAY LẬP TỨC những người KHÔNG TỒN TẠI trên Keycloak.
        """
        all_raw_users = []

        if payload.get("repos_plan") and isinstance(payload.get("repos_plan"), list):
            for item in payload["repos_plan"]:
                all_raw_users.extend(self._sanitize_users(item.get("users", [])))
        else:
            all_raw_users.extend(
                self._sanitize_users(payload.get("users", payload.get("collaborators", payload.get("emails", []))))
            )

        all_raw_users = list(dict.fromkeys(all_raw_users))
        if not all_raw_users:
            return payload, []

        norm_result = await keycloak_service.resolve_identifiers_to_usernames(all_raw_users)
        mapping = norm_result.get("mapping", {})
        not_found = norm_result.get("not_found_in_keycloak", [])

        # Cập nhật danh sách: CHỈ GIỮ LẠI AI CÓ TRONG MAPPING
        if payload.get("repos_plan") and isinstance(payload.get("repos_plan"), list):
            for item in payload["repos_plan"]:
                orig_users = self._sanitize_users(item.get("users", []))
                valid_resolved = [mapping[u] for u in orig_users if u in mapping]
                item["users"] = list(dict.fromkeys(valid_resolved))
        else:
            orig_users = self._sanitize_users(payload.get("users", payload.get("collaborators", payload.get("emails", []))))
            valid_resolved = [mapping[u] for u in orig_users if u in mapping]
            clean_usernames = list(dict.fromkeys(valid_resolved))
            payload["users"] = clean_usernames
            if "collaborators" in payload:
                payload["collaborators"] = clean_usernames
            if "emails" in payload:
                payload["emails"] = clean_usernames

        return payload, not_found

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

            if "signin" not in page.url and await page.locator("a[href*='/signout'], img.avatar-mini").count() > 0:
                logger.info(f"✅ Đã có phiên đăng nhập sẵn! (URL: {page.url})")
                return True

            oidc_submit_btn = page.locator("form[action*='/signin/oidc'] input[type='submit'], input[value*='Sign in with Pythaverse eID'], a:has-text('Pythaverse eID')").first
            if await oidc_submit_btn.count() > 0:
                logger.info("👉 Bấm nút 'Sign in with Pythaverse eID'...")
                try:
                    async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                        await oidc_submit_btn.click()
                except Exception:
                    pass

            await page.wait_for_load_state("domcontentloaded")

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
        """Thực thi thêm danh sách USERNAME vào 1 Repo trong cùng 1 Browser Page."""
        settings_url = self._clean_repo_url(raw_repo_url)
        logger.info(f"📂 Đang truy cập Collaborators: {settings_url} | Role: [{target_role}] | Usernames: {len(users)}")

        repo_res: Dict[str, Any] = {
            "repo_url": raw_repo_url,
            "settings_url": settings_url,
            "target_role": target_role,
            "added": [],
            "already_exists": [],
            "not_logged_in_git": [],
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

            for idx, username_item in enumerate(users, 1):
                logger.info(f"  [{idx}/{len(users)}] 🔍 Đang gán USERNAME: '{username_item}'...")

                # 1. Kiểm tra xem đã có sẵn trong repo chưa
                existing_card = page.locator("#collaborator-list li").filter(has_text=username_item).first
                if await existing_card.count() > 0:
                    logger.info(f"  ℹ️ '{username_item}' đã có trong danh sách.")
                    target_label = existing_card.locator(f"label:has(input[value='{target_role}'])").first
                    if await target_label.count() > 0 and not ("active" in (await target_label.get_attribute("class") or "")):
                        await target_label.click(force=True)
                        new_changes_count += 1
                    repo_res["already_exists"].append(username_item)
                    continue

                # 2. Điền username chính xác
                await user_input.click(force=True)
                await user_input.fill("")
                await user_input.fill(username_item)

                dropdown_item = page.locator("ul.typeahead.dropdown-menu li a").first
                try:
                    await dropdown_item.wait_for(state="visible", timeout=1200)
                    await dropdown_item.click(force=True)
                except Exception:
                    await user_input.press("Enter")

                await page.wait_for_timeout(200)
                await add_btn.click(force=True)
                await page.wait_for_timeout(400)

                # 3. Bắt lỗi từ GitBucket
                err_msg = (await error_span.inner_text()).strip() if await error_span.count() > 0 else ""

                if err_msg:
                    if "already" in err_msg.lower():
                        repo_res["already_exists"].append(username_item)
                    elif "not exist" in err_msg.lower() or "not found" in err_msg.lower():
                        logger.warning(f"  ⚠️ '{username_item}' có tài khoản Keycloak nhưng CHƯA TỪNG ĐĂNG NHẬP Git: {err_msg}")
                        repo_res["not_logged_in_git"].append(username_item)
                    else:
                        logger.warning(f"  ⚠️ Lỗi khi thêm '{username_item}': {err_msg}")
                        repo_res["errors"].append({"user": username_item, "error": err_msg})

                    await user_input.fill("")
                    continue

                # 4. Gán Role chính xác cho thẻ mới
                last_li = page.locator("#collaborator-list li").last
                if await last_li.count() > 0:
                    role_btn = last_li.locator(f"label:has(input[value='{target_role}'])").first
                    if await role_btn.count() > 0:
                        await role_btn.click(force=True)
                    new_changes_count += 1
                    repo_res["added"].append(username_item)
                    logger.info(f"  ✅ Đã thêm '{username_item}' vào {raw_repo_url} với Role [{target_role}]!")
                else:
                    repo_res["added"].append(username_item)
                    new_changes_count += 1

                await user_input.fill("")

            # 5. Lưu thay đổi
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

    async def _internal_add_collaborators(
        self,
        payload: Dict[str, Any],
        not_found_in_keycloak: List[str],
        is_headless: bool
    ) -> Dict[str, Any]:
        """Bộ điều phối chính: Thực thi thêm Collaborator và xuất báo cáo minh bạch 100%."""
        repos_plan: List[Dict[str, Any]] = []

        if payload.get("repos_plan") and isinstance(payload.get("repos_plan"), list):
            for item in payload["repos_plan"]:
                r_url = item.get("repo_url", "").strip()
                r_users = self._sanitize_users(item.get("users", []))
                r_role = (item.get("role") or "GUEST").upper()
                if r_url and r_users:
                    repos_plan.append({"repo_url": r_url, "users": r_users, "role": r_role})

        elif payload.get("repo_urls") and isinstance(payload.get("repo_urls"), list):
            shared_users = self._sanitize_users(payload.get("users", []))
            shared_role = (payload.get("role") or "GUEST").upper()
            for u in payload["repo_urls"]:
                if str(u).strip():
                    repos_plan.append({"repo_url": str(u).strip(), "users": shared_users, "role": shared_role})

        elif payload.get("repo_url"):
            shared_users = self._sanitize_users(payload.get("users", []))
            shared_role = (payload.get("role") or "GUEST").upper()
            repos_plan.append({"repo_url": payload["repo_url"].strip(), "users": shared_users, "role": shared_role})

        # Nếu toàn bộ user đều không tồn tại trên Keycloak
        if not repos_plan:
            report_lines = [
                "❌ [THẤT BẠI] KHÔNG CÓ NGƯỜI DÙNG HỢP LỆ ĐỂ THÊM VÀO GIT:",
                f"• Không tìm thấy tài khoản Keycloak cho: {', '.join(not_found_in_keycloak)}"
            ]
            report_msg = "\n".join(report_lines)
            return {
                "status": "failed",
                "error": "Tất cả tài khoản đầu vào đều không tồn tại trên Keycloak.",
                "message": report_msg,
                "execution_logs": report_msg,
                "breakdown": {
                    "added": [],
                    "already_exists": [],
                    "not_logged_in_git": [],
                    "not_found_in_keycloak": not_found_in_keycloak,
                    "errors": []
                }
            }

        logger.info(f"🚀 BẮT ĐẦU GÁN COLLABORATOR CHO {len(repos_plan)} REPOS (Headless: {is_headless})")

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

                # 🔑 ĐĂNG NHẬP 1 LẦN DUY NHẤT
                if not await self._login_git_oidc(page):
                    return {"status": "failed", "error": "Không thể đăng nhập Pythaverse Git qua Pythaverse eID SSO."}

                # 🔁 DUYỆT TỪNG REPOSITORY
                for r_idx, plan in enumerate(repos_plan, 1):
                    logger.info(f"\n👉 XỬ LÝ REPO [{r_idx}/{len(repos_plan)}]: {plan['repo_url']}")
                    res = await self._process_single_repo(
                        page=page,
                        raw_repo_url=plan["repo_url"],
                        users=plan["users"],
                        target_role=plan["role"]
                    )
                    all_results.append(res)
                    await page.wait_for_timeout(400)

                # =========================================================
                # 📊 XÂY DỰNG BÁO CÁO MINH BẠCH TỪNG CON NGƯỜI (TRANSPARENT AUDIT)
                # =========================================================
                all_added = list(dict.fromkeys([u for r in all_results for u in r.get("added", [])]))
                all_already = list(dict.fromkeys([u for r in all_results for u in r.get("already_exists", [])]))
                all_not_logged_in = list(dict.fromkeys([u for r in all_results for u in r.get("not_logged_in_git", [])]))
                all_errors = [e for r in all_results for e in r.get("errors", [])]

                report_lines = [
                    f"📊 BÁO CÁO PHÂN BỔ GIT COLLABORATORS ({len(repos_plan)} REPO):",
                    "--------------------------------------------------"
                ]

                if all_added:
                    report_lines.append(f"✅ ĐÃ THÊM MỚI THÀNH CÔNG ({len(all_added)} người):")
                    report_lines.append(f"   • {', '.join(all_added)}")

                if all_already:
                    report_lines.append(f"ℹ️ ĐÃ CÓ SẴN TRONG REPO ({len(all_already)} người):")
                    report_lines.append(f"   • {', '.join(all_already)}")

                if all_not_logged_in:
                    report_lines.append(f"⚠️ BỎ QUA - CHƯA LOGIN GIT LẦN NÀO ({len(all_not_logged_in)} người):")
                    report_lines.append(f"   • {', '.join(all_not_logged_in)}")
                    report_lines.append("   (Tài khoản có trên Keycloak nhưng chưa từng login git.pythaverse.space)")

                if not_found_in_keycloak:
                    report_lines.append(f"❌ LOẠI BỎ - KHÔNG TỒN TẠI TRÊN KEYCLOAK ({len(not_found_in_keycloak)} người):")
                    report_lines.append(f"   • {', '.join(not_found_in_keycloak)}")
                    report_lines.append("   (Không tìm thấy trên eID Keycloak, cần kiểm tra lại email/username)")

                if all_errors:
                    report_lines.append(f"⛔ LỖI PHÁT SINH ({len(all_errors)} lỗi):")
                    for err_item in all_errors:
                        report_lines.append(f"   • {err_item.get('user')}: {err_item.get('error')}")

                summary_line = (
                    f"Tổng kết: {len(all_added)} Thành công | {len(all_already)} Đã có sẵn | "
                    f"{len(all_not_logged_in)} Chưa login Git | {len(not_found_in_keycloak)} Không có Keycloak"
                )
                report_lines.append(summary_line)

                report_text = "\n".join(report_lines)
                overall_status = "success" if all_added or all_already else "failed"

                # 💡 CHỈ TRẢ 1 DÒNG TÓM TẮT TRONG 'message' ĐỂ KHÔNG BỊ NHÂN ĐÔI VỚI 'execution_logs'
                short_summary_msg = (
                    f"Hoàn tất {len(repos_plan)} Repos: {len(all_added)} Thành công, "
                    f"{len(all_already)} Đã có, {len(all_not_logged_in)} Chưa login Git, "
                    f"{len(not_found_in_keycloak)} Không có Keycloak."
                )

                return {
                    "status": overall_status,
                    "message": short_summary_msg,       # 1 dòng tóm tắt ngắn gọn
                    "execution_logs": report_text,      # Báo cáo chi tiết từng người (chỉ in 1 lần)
                    "breakdown": {
                        "added": all_added,
                        "already_exists": all_already,
                        "not_logged_in_git": all_not_logged_in,
                        "not_found_in_keycloak": not_found_in_keycloak,
                        "errors": all_errors
                    },
                    "details": all_results
                }

            except Exception as e:
                logger.error(f"❌ Lỗi ngoại lệ trong chuỗi Git Multi-Repo: {e}", exc_info=True)
                return {"status": "failed", "error": str(e), "message": f"Lỗi ngoại lệ: {e}", "details": all_results}
            finally:
                if context:
                    await context.close()
                if browser:
                    await browser.close()
                gc.collect()

    async def add_collaborators_pipeline(self, payload: Dict[str, Any], headless: Optional[bool] = None) -> Dict[str, Any]:
        """Cổng tiếp nhận chính: Sàng lọc Keycloak ➔ Chiếm slot VIP ➔ Thực thi & Báo cáo."""
        # 1. BƯỚC SÀNG LỌC NGOÀI SEMAPHORE: Chỉ giữ lại người dùng có thật trên Keycloak
        normalized_payload, not_found_in_keycloak = await self._normalize_and_filter_users_via_keycloak(payload)

        is_headless = self._determine_headless(headless)
        repo_count = len(normalized_payload.get("repos_plan") or normalized_payload.get("repo_urls") or [1])
        timeout_seconds = max(180.0, float(repo_count * 60.0))

        # 2. Chiếm slot Semaphore chạy Chromium
        async with acquire_playwright_slot("Git Add Collaborators", timeout=timeout_seconds, lane="admin"):
            try:
                return await asyncio.wait_for(
                    self._internal_add_collaborators(
                        payload=normalized_payload,
                        not_found_in_keycloak=not_found_in_keycloak,
                        is_headless=is_headless
                    ),
                    timeout=timeout_seconds
                )
            except asyncio.TimeoutError:
                logger.error(f"❌ Quá thời gian thực thi (Timeout {timeout_seconds}s) khi thao tác Git Multi-Repo.")
                return {"status": "failed", "error": f"Tác vụ Git bị Timeout (vượt quá {timeout_seconds}s)."}


git_playwright_service = GitPlaywrightService()