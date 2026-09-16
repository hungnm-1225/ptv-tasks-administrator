# backend/app/services/git_service.py
import logging
import asyncio
import gc
import re
import os
import time
from typing import Dict, Any, List, Optional, Tuple
import httpx
from playwright.async_api import async_playwright, Browser, BrowserContext

from app.core.config import settings
from app.core.playwright_manager import (
    acquire_playwright_slot,
    LOW_RAM_CHROMIUM_ARGS,
    setup_low_ram_routes
)
from app.services.keycloak_service import keycloak_service

logger = logging.getLogger(__name__)


def clean_repo_settings_url(raw_url: str) -> str:
    """Chuẩn hóa đường dẫn repository trỏ thẳng vào /settings/collaborators."""
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


class GitPlaywrightService:
    """
    Dịch vụ quản trị Pythaverse Git (GitBucket - git.pythaverse.space):
    ĐỘNG CƠ HYBRID V3.6:
    - Sàng lọc qua Keycloak Gateway: Loại bỏ 100% tài khoản chưa có trên Keycloak.
    - Playwright bốc Session OIDC duy nhất 1 lần (3-5s) -> Đóng Chromium giải phóng RAM.
    - HTTPX Async Engine: Thêm/Gỡ Collaborator đa Role (GUEST/DEVELOPER/ADMIN) trên NHIỀU REPO (~300ms/repo).
    - Xuất báo cáo kiểm định minh bạch từng con người (Added, Existing, Removed, Not Logged In, Not Found Keycloak).
    """

    def __init__(self):
        self.base_url = (getattr(settings, "GIT_SERVER_URL", None) or "https://git.pythaverse.space").rstrip("/")
        self.admin_user = getattr(settings, "GIT_ADMIN_USER", None) or "ptvadmin"
        self.admin_pass = str(getattr(settings, "GIT_ADMIN_PASS", "")).strip().strip("'\"")

    def _determine_headless(self, override_headless: Optional[bool] = None) -> bool:
        if override_headless is not None:
            return override_headless
        if os.getenv("GIT_HEADED", "").lower() in ["1", "true", "yes"]:
            return False
        return True

    def _sanitize_users(self, user_list: Any) -> List[str]:
        if not user_list:
            return []
        if isinstance(user_list, str):
            raw_items = re.split(r"[\n,;\s]+", user_list)
        elif isinstance(user_list, list):
            raw_items = [str(x.get("email") or x.get("username") if isinstance(x, dict) else x) for x in user_list]
        else:
            return []

        cleaned = []
        for item in raw_items:
            clean = item.strip().lower()
            if clean and clean not in cleaned:
                cleaned.append(clean)
        return cleaned

    # =========================================================================
    # 🔍 1. SÀNG LỌC QUA KEYCLOAK GATEWAY
    # =========================================================================
    async def _normalize_and_filter_users_via_keycloak(self, payload: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
        """Chỉ giữ lại những người ĐÃ CÓ TÀI KHOẢN trên Keycloak (đổi sang Canonical Username)."""
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

    # =========================================================================
    # 🔑 2. BỐC SESSION OIDC QUA PLAYWRIGHT (CHỈ 3-5S RỒI ĐÓNG TRÌNH DUYỆT)
    # =========================================================================
    async def _steal_git_session(self, is_headless: bool = True) -> Optional[Dict[str, str]]:
        """Đăng nhập Keycloak SSO vào GitBucket đúng 1 lần, lấy Cookie rồi đóng ngay."""
        logger.info(f"🔑 [Session Stealer] Đăng nhập Git qua Keycloak OIDC cho: [{self.admin_user}]...")
        t0 = time.time()

        if not self.admin_pass:
            logger.error("❌ Không tìm thấy GIT_ADMIN_PASS trong file .env!")
            return None

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(headless=is_headless, args=LOW_RAM_CHROMIUM_ARGS)
            context: BrowserContext = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"
            )
            if is_headless:
                await setup_low_ram_routes(context)
            page = await context.new_page()

            try:
                await page.goto(f"{self.base_url}/signin", wait_until="domcontentloaded", timeout=35000)

                if "signin" not in page.url and await page.locator("a[href*='/signout'], img.avatar-mini").count() > 0:
                    logger.info("✅ Đã có sẵn phiên đăng nhập!")
                else:
                    oidc_btn = page.locator("form[action*='/signin/oidc'] input[type='submit'], input[value*='Sign in with Pythaverse eID'], a:has-text('Pythaverse eID')").first
                    if await oidc_btn.count() > 0:
                        try:
                            async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                                await oidc_btn.click()
                        except Exception:
                            pass

                    kc_user = page.locator("input#username").first
                    if await kc_user.count() > 0 and await kc_user.is_visible():
                        await kc_user.fill(self.admin_user)
                        await page.fill("input#password", self.admin_pass)
                        login_btn = page.locator("input#kc-login, button[type='submit']").first
                        try:
                            async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                                await login_btn.click()
                        except Exception:
                            pass

                    await page.wait_for_selector("a.dropdown-toggle[title*='Signed'], img.avatar-mini, a[href*='/signout']", timeout=20000)

                cookies = await context.cookies()
                cookies_dict = {c["name"]: c["value"] for c in cookies}
                elapsed = round(time.time() - t0, 2)
                logger.info(f"✨ [RAM Zero] Bốc Session Git thành công trong {elapsed}s!")
                return cookies_dict

            except Exception as e:
                logger.error(f"❌ Lỗi bốc Session Git: {e}")
                return None
            finally:
                await browser.close()
                gc.collect()

    # =========================================================================
    # 🔍 3. KIỂM TRA TỒN TẠI JIT TRÊN GITBUCKET (20ms)
    # =========================================================================
    async def _check_user_existence(self, client: httpx.AsyncClient, username: str) -> bool:
        """Kiểm tra xem user đã từng đăng nhập Git để sinh JIT record chưa."""
        try:
            res = await client.post(
                f"{self.base_url}/_user/existence",
                data={"userName": username},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=5.0
            )
            return res.status_code == 200 and res.text.strip().lower() == "user"
        except Exception:
            return False

    # =========================================================================
    # ⚡ 4. THỰC THI TRÊN 1 REPO (DIRECT HTTPX: THÊM / CẬP NHẬT ROLE / GỠ BỎ)
    # =========================================================================
    async def _process_single_repo_httpx(
        self,
        client: httpx.AsyncClient,
        raw_repo_url: str,
        users: List[str],
        target_role: str = "GUEST",
        action: str = "add"
    ) -> Dict[str, Any]:
        """Thực thi thêm hoặc gỡ Collaborator trên 1 Repo thuần Direct HTTPX (~300ms)."""
        settings_url = clean_repo_settings_url(raw_repo_url)
        role = target_role.upper()
        if role not in ["ADMIN", "DEVELOPER", "GUEST"]:
            role = "GUEST"

        is_remove_action = action in ["remove", "remove_collaborator", "remove_repo_collaborators", "delete"]
        action_title = "GỠ BỎ" if is_remove_action else f"GÁN ROLE [{role}]"

        logger.info(f"📂 Đang xử lý: {settings_url} | Hành động: {action_title} | Users: {len(users)}")
        t0 = time.time()

        repo_res: Dict[str, Any] = {
            "repo_url": raw_repo_url,
            "settings_url": settings_url,
            "target_role": role,
            "action": "remove" if is_remove_action else "add",
            "added": [],
            "already_exists": [],
            "removed": [],
            "not_logged_in_git": [],
            "errors": []
        }

        try:
            # 1. Đọc danh sách Collaborators hiện tại từ trang settings
            get_res = await client.get(settings_url)
            if get_res.status_code != 200:
                err_msg = f"Không tìm thấy Repo hoặc thiếu quyền Quản trị (Status {get_res.status_code}): {settings_url}"
                logger.error(f"❌ {err_msg}")
                repo_res["errors"].append({"user": "*", "error": err_msg})
                repo_res["status"] = "failed"
                return repo_res

            # Trích xuất chuỗi collaborators cũ từ thẻ hidden input
            collab_match = re.search(r'name=["\']collaborators["\']\s+value=["\']([^"\']*)["\']', get_res.text)
            current_collab_str = collab_match.group(1) if collab_match else ""

            current_collaborators: Dict[str, str] = {}
            if current_collab_str:
                for item in current_collab_str.split(","):
                    item = item.strip()
                    if ":" in item:
                        u, r = item.split(":", 1)
                        current_collaborators[u.strip()] = r.strip()

            new_changes = False

            # =================================================================
            # TRƯỜNG HỢP A: GỠ BỎ COLLABORATORS (REMOVE)
            # =================================================================
            if is_remove_action:
                for u in users:
                    u_clean = u.strip()
                    if u_clean in current_collaborators:
                        del current_collaborators[u_clean]
                        repo_res["removed"].append(u_clean)
                        new_changes = True
                        logger.info(f"  🗑️ Đã gỡ bỏ '{u_clean}' khỏi repo.")
                    else:
                        logger.info(f"  ℹ️ '{u_clean}' vốn không có trong repo.")
                        repo_res["already_exists"].append(u_clean)

            # =================================================================
            # TRƯỜNG HỢP B: THÊM MỚI HOẶC CẬP NHẬT ROLE (ADD / UPDATE)
            # =================================================================
            else:
                # Kiểm tra tồn tại JIT song song cho danh sách user
                existence_tasks = [self._check_user_existence(client, u) for u in users]
                existence_results = await asyncio.gather(*existence_tasks)

                for u, exists_on_git in zip(users, existence_results):
                    u_clean = u.strip()

                    # Nếu chưa từng login Git
                    if not exists_on_git:
                        logger.warning(f"  ⚠️ '{u_clean}' CHƯA TỪNG LOGIN Git (Chưa có JIT) ➔ Bỏ qua!")
                        repo_res["not_logged_in_git"].append(u_clean)
                        continue

                    # Nếu đã có trong danh sách
                    if u_clean in current_collaborators:
                        if current_collaborators[u_clean] != role:
                            current_collaborators[u_clean] = role
                            new_changes = True
                            logger.info(f"  ℹ️ '{u_clean}' đã có sẵn ➔ Cập nhật Role sang [{role}]")
                        else:
                            logger.info(f"  ℹ️ '{u_clean}' đã có sẵn với Role [{role}].")
                        repo_res["already_exists"].append(u_clean)
                    else:
                        current_collaborators[u_clean] = role
                        repo_res["added"].append(u_clean)
                        new_changes = True
                        logger.info(f"  ✨ Thêm mới: '{u_clean}' ➔ Role [{role}]")

            # 2. Bắn 1 request POST lưu toàn bộ nếu có thay đổi
            if new_changes:
                new_collab_str = ",".join([f"{u}:{r}" for u, r in current_collaborators.items()]) + ("," if current_collaborators else "")
                form_payload = {
                    "userName-collaborator": "",
                    "userName-group": "",
                    "collaborators": new_collab_str
                }
                # Bổ sung các param radio role cho từng collaborator
                for u, r in current_collaborators.items():
                    form_payload[u] = r

                post_res = await client.post(
                    settings_url,
                    data=form_payload,
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                elapsed = round((time.time() - t0) * 1000, 1)

                if post_res.status_code in [200, 302, 303]:
                    logger.info(f"🎉 LƯU THAY ĐỔI REPO THÀNH CÔNG TRONG {elapsed}ms!")
                else:
                    logger.error(f"❌ Lưu thất bại ({post_res.status_code}): {post_res.text}")
            else:
                elapsed = round((time.time() - t0) * 1000, 1)
                logger.info(f"ℹ️ Không có thay đổi nào cần lưu ({elapsed}ms).")

            total_users = len(users)
            success_cnt = len(repo_res["added"]) + len(repo_res["already_exists"]) + len(repo_res["removed"])
            repo_res["status"] = "success" if success_cnt == total_users else ("partial_success" if success_cnt > 0 else "failed")
            return repo_res

        except Exception as e:
            logger.error(f"❌ Lỗi khi xử lý Repo {raw_repo_url}: {e}")
            repo_res["status"] = "failed"
            repo_res["errors"].append({"user": "*", "error": str(e)})
            return repo_res

    # =========================================================================
    # 🚀 5. ĐIỀU PHỐI MULTI-REPO PIPELINE CHÍNH THỨC
    # =========================================================================
    async def _internal_add_collaborators(
        self,
        payload: Dict[str, Any],
        not_found_in_keycloak: List[str],
        is_headless: bool
    ) -> Dict[str, Any]:
        """Điều phối thêm/gỡ thành viên cho danh sách Repositories."""
        repos_plan: List[Dict[str, Any]] = []
        global_action = payload.get("action") or "add"

        # Chuẩn hóa cấu trúc kế hoạch Repos
        if payload.get("repos_plan") and isinstance(payload.get("repos_plan"), list):
            for item in payload["repos_plan"]:
                r_url = item.get("repo_url", "").strip()
                r_users = self._sanitize_users(item.get("users", []))
                r_role = (item.get("role") or payload.get("role") or "GUEST").upper()
                r_act = item.get("action") or global_action
                if r_url and r_users:
                    repos_plan.append({"repo_url": r_url, "users": r_users, "role": r_role, "action": r_act})

        elif payload.get("repo_urls") and isinstance(payload.get("repo_urls"), list):
            shared_users = self._sanitize_users(payload.get("users", []))
            shared_role = (payload.get("role") or "GUEST").upper()
            for u in payload["repo_urls"]:
                if str(u).strip():
                    repos_plan.append({"repo_url": str(u).strip(), "users": shared_users, "role": shared_role, "action": global_action})

        elif payload.get("repo_url"):
            shared_users = self._sanitize_users(payload.get("users", []))
            shared_role = (payload.get("role") or "GUEST").upper()
            repos_plan.append({"repo_url": payload["repo_url"].strip(), "users": shared_users, "role": shared_role, "action": global_action})

        if not repos_plan:
            report_lines = [
                "❌ [THẤT BẠI] KHÔNG CÓ NGƯỜI DÙNG HỢP LỆ ĐỂ THAO TÁC TRÊN GIT:",
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
                    "removed": [],
                    "not_logged_in_git": [],
                    "not_found_in_keycloak": not_found_in_keycloak,
                    "errors": []
                }
            }

        logger.info(f"🚀 BẮT ĐẦU THAO TÁC TRÊN {len(repos_plan)} REPOS QUA DIRECT API...")
        all_results: List[Dict[str, Any]] = []

        # 1. Bốc session OIDC duy nhất 1 lần (3-5s)
        cookies = await self._steal_git_session(is_headless=is_headless)
        if not cookies:
            return {"status": "failed", "error": "Không thể đăng nhập Pythaverse Git qua Pythaverse eID SSO."}

        # 2. Chạy toàn bộ các Repos qua HTTPX thuần túy
        async with httpx.AsyncClient(
            base_url=self.base_url,
            cookies=cookies,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"},
            timeout=25.0,
            follow_redirects=True
        ) as client:
            for r_idx, plan in enumerate(repos_plan, 1):
                logger.info(f"\n👉 XỬ LÝ REPO [{r_idx}/{len(repos_plan)}]: {plan['repo_url']} (Role: {plan['role']})")
                res = await self._process_single_repo_httpx(
                    client=client,
                    raw_repo_url=plan["repo_url"],
                    users=plan["users"],
                    target_role=plan["role"],
                    action=plan["action"]
                )
                all_results.append(res)

        # 3. Tổng hợp báo cáo minh bạch từng con người (khớp 100% định dạng UI cũ)
        all_added = list(dict.fromkeys([u for r in all_results for u in r.get("added", [])]))
        all_already = list(dict.fromkeys([u for r in all_results for u in r.get("already_exists", [])]))
        all_removed = list(dict.fromkeys([u for r in all_results for u in r.get("removed", [])]))
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

        if all_removed:
            report_lines.append(f"🗑️ ĐÃ GỠ BỎ THÀNH CÔNG ({len(all_removed)} người):")
            report_lines.append(f"   • {', '.join(all_removed)}")

        if all_not_logged_in:
            report_lines.append(f"⚠️ BỎ QUA - CHƯA LOGIN GIT LẦN NÀO ({len(all_not_logged_in)} người):")
            report_lines.append(f"   • {', '.join(all_not_logged_in)}")
            report_lines.append("   (Tài khoản có trên Keycloak nhưng chưa từng login git.pythaverse.space)")

        if not_found_in_keycloak:
            report_lines.append(f"❌ LOẠI BỎ - KHÔNG TỒN TẠI TRÊN KEYCLOAK ({len(not_found_in_keycloak)} người):")
            report_lines.append(f"   • {', '.join(not_found_in_keycloak)}")

        if all_errors:
            report_lines.append(f"⛔ LỖI PHÁT SINH ({len(all_errors)} lỗi):")
            for err_item in all_errors:
                report_lines.append(f"   • {err_item.get('user')}: {err_item.get('error')}")

        summary_line = (
            f"Tổng kết: {len(all_added)} Thêm mới | {len(all_already)} Đã có sẵn | {len(all_removed)} Đã gỡ | "
            f"{len(all_not_logged_in)} Chưa login Git | {len(not_found_in_keycloak)} Không có Keycloak"
        )
        report_lines.append(summary_line)

        overall_status = "success" if all_added or all_already or all_removed else "failed"
        short_summary_msg = (
            f"Hoàn tất {len(repos_plan)} Repos: {len(all_added)} Thêm, {len(all_already)} Đã có, "
            f"{len(all_removed)} Đã gỡ, {len(all_not_logged_in)} Chưa login Git."
        )

        return {
            "status": overall_status,
            "message": short_summary_msg,
            "execution_logs": "\n".join(report_lines),
            "breakdown": {
                "added": all_added,
                "already_exists": all_already,
                "removed": all_removed,
                "not_logged_in_git": all_not_logged_in,
                "not_found_in_keycloak": not_found_in_keycloak,
                "errors": all_errors
            },
            "details": all_results
        }

    # =========================================================================
    # 🏁 CỔNG TIẾP NHẬN NGOÀI CÙNG (GIỮ NGUYÊN 100% INTERFACE VỚI BOT EXECUTOR)
    # =========================================================================
    async def add_collaborators_pipeline(self, payload: Dict[str, Any], headless: Optional[bool] = None) -> Dict[str, Any]:
        """Cổng tiếp nhận chính: Sàng lọc Keycloak ➔ Chiếm slot VIP ➔ Thực thi siêu tốc."""
        normalized_payload, not_found_in_keycloak = await self._normalize_and_filter_users_via_keycloak(payload)

        is_headless = self._determine_headless(headless)
        repo_count = len(normalized_payload.get("repos_plan") or normalized_payload.get("repo_urls") or [1])
        timeout_seconds = max(120.0, float(repo_count * 20.0))

        # Chiếm Semaphore chạy Playwright bốc session
        async with acquire_playwright_slot("Git Collaborators Pipeline", timeout=timeout_seconds, lane="admin"):
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
                return {"status": "failed", "error": f"Tác vụ Git bị Timeout ({timeout_seconds}s)."}


git_playwright_service = GitPlaywrightService()