# backend/app/services/git_service.py
import logging
import asyncio
import gc
import re
import os
import time
from typing import Dict, Any, List, Optional, Tuple, Set
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


def extract_short_repo_name(raw_url: str) -> str:
    """Rút gọn URL dài thành định dạng ngắn gọn owner/repo (Ví dụ: pythaverse/stem-robotics-gr7)."""
    if not raw_url:
        return ""
    clean = raw_url.strip().rstrip("/")
    if clean.endswith(".git"):
        clean = clean[:-4]
    clean = re.sub(r"/settings(/collaborators)?$", "", clean)
    parts = clean.split("/")
    if len(parts) >= 2:
        return f"{parts[-2]}/{parts[-1]}"
    return clean


class GitPlaywrightService:
    """
    Dịch vụ quản trị Pythaverse Git (GitBucket - git.pythaverse.space):
    ĐỘNG CƠ HYBRID V3.6 + GLOBAL JIT DEDUP + CONCURRENCY SEMAPHORE:
    - Sàng lọc qua Keycloak Gateway: Lọc sạch tài khoản không tồn tại trên Keycloak.
    - Global JIT Deduplication: Check JIT 1 lượt cho toàn bộ người dùng duy nhất, loại ngay ai chưa login.
    - Session Cache In-Memory (TTL 2h): Bypass Playwright 0ms launch khi session còn sống.
    - Multi-Repo Parallel Execution: asyncio.Semaphore(3) xử lý 3 repo cùng lúc, chống SQLite lock.
    - Hỗ trợ toàn diện 2 Pipelines: add_collaborators_pipeline & remove_collaborators_pipeline.
    """

    def __init__(self):
        self.base_url = (getattr(settings, "GIT_SERVER_URL", None) or "https://git.pythaverse.space").rstrip("/")
        self.admin_user = getattr(settings, "GIT_ADMIN_USER", None) or "ptvadmin"
        self.admin_pass = str(getattr(settings, "GIT_ADMIN_PASS", "")).strip().strip("'\"")

        # 🚀 BỘ NHỚ ĐỆM IN-MEMORY SESSION CACHE (< 500 Bytes RAM)
        self._cached_cookies: Optional[Dict[str, str]] = None
        self._cached_at: float = 0.0
        self._cache_ttl_seconds: int = 7200  # Lưu phiên trong 2 giờ

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
    # ⚡ 2. QUẢN TRỊ BỘ NHỚ ĐỆM SESSION CACHE & AUTH GATEWAY
    # =========================================================================
    async def _is_session_valid(self, cookies: Dict[str, str]) -> bool:
        """Kiểm tra siêu tốc (20ms) xem Session Cookie còn sống hay không qua trang Dashboard."""
        try:
            async with httpx.AsyncClient(timeout=4.0, follow_redirects=False) as client:
                res = await client.get(f"{self.base_url}/dashboard/repos", cookies=cookies)
                return res.status_code == 200
        except Exception:
            return False

    async def _steal_git_session(self, is_headless: bool = True) -> Optional[Dict[str, str]]:
        """Đăng nhập Keycloak SSO vào GitBucket qua Chromium Low-RAM đúng 1 lần, lấy Cookie rồi đóng ngay."""
        logger.info(f"🔑 [Session Stealer] Mở Playwright đăng nhập Git qua SSO Keycloak cho: [{self.admin_user}]...")
        t0 = time.time()

        if not self.admin_pass:
            logger.error("❌ Không tìm thấy GIT_ADMIN_PASS trong file cấu hình!")
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
                    logger.info("✅ Đã có sẵn phiên đăng nhập trên trình duyệt!")
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

    async def _get_or_steal_session(self, is_headless: bool) -> Optional[Dict[str, str]]:
        """Lấy session từ Cache; chỉ mở Chromium khi chưa có hoặc phiên bị hết hạn."""
        if self._cached_cookies and (time.time() - self._cached_at < self._cache_ttl_seconds):
            if await self._is_session_valid(self._cached_cookies):
                logger.info("⚡ [Session Cache] Tái sử dụng Git Admin Session (0ms - Bỏ qua Playwright)!")
                return self._cached_cookies
            else:
                logger.warning("⚠️ [Session Cache] Session Git cũ đã hết hạn, chuẩn bị gia hạn mới...")
                self._cached_cookies = None

        async with acquire_playwright_slot("Git Session Stealer", timeout=60.0, lane="admin"):
            cookies = await self._steal_git_session(is_headless=is_headless)
            if cookies:
                self._cached_cookies = cookies
                self._cached_at = time.time()
            return cookies

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
    # ⚡ 4. THỰC THI TRÊN 1 REPO (THUẦN DIRECT HTTPX - KHÔNG CHECK LẠI JIT)
    # =========================================================================
    async def _process_single_repo_httpx(
        self,
        client: httpx.AsyncClient,
        raw_repo_url: str,
        valid_users: List[str],
        target_role: str = "GUEST",
        action: str = "add"
    ) -> Dict[str, Any]:
        """Thực thi thêm, đổi role hoặc gỡ Collaborator trên 1 Repo (Khớp 100% chuẩn Network DevTools)."""
        settings_url = clean_repo_settings_url(raw_repo_url)
        role = target_role.upper()
        if role not in ["ADMIN", "DEVELOPER", "GUEST"]:
            role = "GUEST"

        is_remove_action = action in ["remove", "remove_collaborator", "remove_collaborators", "remove_repo_collaborators", "delete"]
        action_title = "GỠ BỎ" if is_remove_action else f"GÁN ROLE [{role}]"

        logger.info(f"📂 Đang xử lý: {settings_url} | Hành động: {action_title} | Users: {valid_users}")
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
            get_res = await client.get(settings_url)

            # 🚨 CHỐT CHẶN 1: PHÁT HIỆN BỊ REDIRECT DO MẤT QUYỀN HOẶC HẾT HẠN PHIÊN
            final_url = str(get_res.url)
            if get_res.status_code != 200 or not final_url.endswith("/settings/collaborators"):
                err_msg = f"MẤT QUYỀN TRUY CẬP: Bị chuyển hướng sang '{final_url}'. Session hết hạn hoặc bot thiếu quyền Admin!"
                logger.error(f"🛑 {err_msg} tại {settings_url}")
                self._cached_cookies = None  # Xóa cache cookie ngay lập tức
                repo_res["errors"].append({"user": "*", "error": err_msg})
                repo_res["status"] = "failed"
                return repo_res

            # =================================================================
            # 🎯 BÓC TÁCH COLLABORATORS TỪ DANH SÁCH <ul id="collaborator-list">
            # =================================================================
            current_collaborators: Dict[str, str] = {}

            # VECTƠ 1: Bóc tách trực tiếp từ các nút Radio đang Active
            # Ví dụ: <label class="btn btn-default btn-mini active"><input type="radio" value="GUEST" name="hsdttemd">
            active_labels = re.findall(
                r'<label[^>]*class=["\'][^"\']*\bactive\b[^"\']*["\'][^>]*>(.*?)</label>',
                get_res.text,
                re.DOTALL | re.IGNORECASE
            )
            for lbl in active_labels:
                val_m = re.search(r'value=["\'](ADMIN|DEVELOPER|GUEST)["\']', lbl, re.IGNORECASE)
                name_m = re.search(r'name=["\']([a-zA-Z0-9_\.\-]+)["\']', lbl, re.IGNORECASE)
                if val_m and name_m:
                    uname = name_m.group(1).strip()
                    urole = val_m.group(1).upper().strip()
                    current_collaborators[uname] = urole

            # VECTƠ 2 (Lưới hứng an toàn): Quét các user có nút (remove) bên cạnh
            # Ví dụ: <a target="_blank" href="/hsdttemd">hsdttemd</a><a href="#" class="remove pull-right">(remove)</a>
            remove_user_matches = re.findall(
                r'<a[^>]+href=["\']/([a-zA-Z0-9_\.\-]+)["\'][^>]*>.*?</a>\s*<a[^>]+class=["\'][^"\']*remove[^"\']*["\']',
                get_res.text,
                re.DOTALL | re.IGNORECASE
            )
            for u in remove_user_matches:
                u_clean = u.strip()
                if u_clean not in current_collaborators:
                    current_collaborators[u_clean] = "GUEST"

            logger.info(f"🔍 [DOM Parser] Đã quét thấy {len(current_collaborators)} thành viên: {list(current_collaborators.keys())}")

            # 🛡️ BẢO VỆ TÀI KHOẢN ADMIN BOT VĨNH VIỄN
            if self.admin_user and self.admin_user not in current_collaborators:
                current_collaborators[self.admin_user] = "ADMIN"

            new_changes = False
            active_params_to_send: Dict[str, str] = {}

            if is_remove_action:
                # 🗑️ KỊCH BẢN GỠ BỎ: Xóa khỏi danh sách, không gửi param riêng
                for u in valid_users:
                    u_clean = u.strip()
                    if u_clean.lower() == self.admin_user.lower():
                        continue  # Cấm gỡ chính mình
                    if u_clean in current_collaborators:
                        del current_collaborators[u_clean]
                        repo_res["removed"].append(u_clean)
                        new_changes = True
                    else:
                        repo_res["already_exists"].append(u_clean)
            else:
                # ➕ KỊCH BẢN THÊM MỚI HOẶC CẬP NHẬT ROLE
                for u in valid_users:
                    u_clean = u.strip()
                    if u_clean in current_collaborators:
                        if current_collaborators[u_clean] != role:
                            # 🔄 ĐỔI ROLE
                            current_collaborators[u_clean] = role
                            repo_res["added"].append(u_clean)
                            active_params_to_send[u_clean] = role
                            new_changes = True
                        else:
                            repo_res["already_exists"].append(u_clean)
                    else:
                        # ✨ THÊM MỚI
                        current_collaborators[u_clean] = role
                        repo_res["added"].append(u_clean)
                        active_params_to_send[u_clean] = role
                        new_changes = True

            if new_changes:
                # 🎯 CHUẨN HÓA PAYLOAD ĐÚNG THEO BẢN NETWORK DEVTOOLS
                # Chuỗi collaborators bắt buộc có dấu phẩy ở cuối: user1:ROLE,user2:ROLE,
                new_collab_str = ",".join([f"{u}:{r}" for u, r in current_collaborators.items()]) + ("," if current_collaborators else "")
                
                form_payload: Dict[str, str] = {
                    "userName-collaborator": "",
                    "userName-group": "",
                    "collaborators": new_collab_str
                }
                # Gắn kèm tham số role riêng cho user được cập nhật (ví dụ: hsdttemd=DEVELOPER)
                form_payload.update(active_params_to_send)

                post_res = await client.post(
                    settings_url,
                    data=form_payload,
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )

                elapsed = round((time.time() - t0) * 1000, 1)
                final_post_url = str(post_res.url)

                # 🚨 KIỂM TRA PHẢN HỒI:
                # Chuẩn GitBucket: Thành công sẽ trả về 302 chuyển hướng lại chính '/settings/collaborators'
                if "dashboard/repos" in final_post_url or post_res.status_code >= 400:
                    err_msg = f"LƯU THẤT BẠI: Bị máy chủ từ chối và văng về '{final_post_url}'!"
                    logger.error(f"❌ {err_msg}")
                    self._cached_cookies = None
                    repo_res["errors"].append({"user": "*", "error": err_msg})
                    repo_res["status"] = "failed"
                    return repo_res

                logger.info(f"🎉 Lưu thành công ({elapsed}ms)! Danh sách hiện tại: {len(current_collaborators)} người.")
            else:
                elapsed = round((time.time() - t0) * 1000, 1)
                logger.info(f"ℹ️ Không có thay đổi nào cần lưu ({elapsed}ms).")

            total_users = len(valid_users)
            success_cnt = len(repo_res["added"]) + len(repo_res["already_exists"]) + len(repo_res["removed"])
            repo_res["status"] = "success" if success_cnt == total_users else ("partial_success" if success_cnt > 0 else "failed")
            return repo_res

        except Exception as e:
            logger.error(f"❌ Lỗi khi xử lý Repo {raw_repo_url}: {e}")
            self._cached_cookies = None
            repo_res["status"] = "failed"
            repo_res["errors"].append({"user": "*", "error": str(e)})
            return repo_res


    # =========================================================================
    # 🚀 5. ĐIỀU PHỐI MULTI-REPO PIPELINE CHÍNH THỨC VỚI JIT DEDUP & SEMAPHORE
    # =========================================================================
    async def _internal_process_collaborators(
        self,
        payload: Dict[str, Any],
        raw_user_role_map: Dict[str, str],
        not_found_in_keycloak: List[str],
        is_headless: bool,
        action: str = "add"
    ) -> Dict[str, Any]:
        """Bộ điều phối cốt lõi: Dedup JIT đầu vào ➔ Chạy 3 Repos song song ➔ Báo cáo tinh gọn."""
        repos_plan: List[Dict[str, Any]] = []
        is_remove_flow = action in ["remove", "remove_collaborator", "remove_collaborators", "remove_repo_collaborators", "delete"]

        if payload.get("repos_plan") and isinstance(payload.get("repos_plan"), list):
            for item in payload["repos_plan"]:
                r_url = item.get("repo_url", "").strip()
                r_users = self._sanitize_users(item.get("users", []))
                r_role = (item.get("role") or payload.get("role") or "GUEST").upper()
                r_act = item.get("action") or action
                if r_url and r_users:
                    repos_plan.append({"repo_url": r_url, "users": r_users, "role": r_role, "action": r_act})

        elif payload.get("repo_urls") and isinstance(payload.get("repo_urls"), list):
            shared_users = self._sanitize_users(payload.get("users", []))
            shared_role = (payload.get("role") or "GUEST").upper()
            for u in payload["repo_urls"]:
                if str(u).strip():
                    repos_plan.append({"repo_url": str(u).strip(), "users": shared_users, "role": shared_role, "action": action})

        elif payload.get("repo_url"):
            shared_users = self._sanitize_users(payload.get("users", []))
            shared_role = (payload.get("role") or "GUEST").upper()
            repos_plan.append({"repo_url": payload["repo_url"].strip(), "users": shared_users, "role": shared_role, "action": action})

        if not repos_plan:
            err_line = f"Không tồn tại ❌: {', '.join(not_found_in_keycloak)}" if not_found_in_keycloak else "Không có người dùng hợp lệ."
            return {
                "status": "failed",
                "error": "Tất cả tài khoản đầu vào đều không tồn tại trên hệ thống.",
                "message": f"Thao tác thất bại. {err_line}",
                "execution_logs": f"❌ LỖI ĐIỀU PHỐI GIT COLLABORATORS\n{err_line}",
                "breakdown": {
                    "added": [], "already_exists": [], "removed": [],
                    "not_logged_in_git": [], "not_found_in_keycloak": not_found_in_keycloak, "errors": []
                }
            }

        # 1. Lấy Session OIDC (Ưu tiên Cache, chỉ bật Playwright khi hết hạn)
        cookies = await self._get_or_steal_session(is_headless=is_headless)
        if not cookies:
            return {"status": "failed", "error": "Không thể đăng nhập Pythaverse Git qua Pythaverse eID SSO."}

        # Khởi tạo HTTPX Client dùng chung session
        async with httpx.AsyncClient(
            base_url=self.base_url,
            cookies=cookies,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"},
            timeout=25.0,
            follow_redirects=True
        ) as client:

            all_not_logged_in: List[str] = []

            # =================================================================
            # 🎯 2. GLOBAL JIT DEDUPLICATION (Chỉ áp dụng khi THÊM mới)
            # =================================================================
            if not is_remove_flow:
                # Gom toàn bộ user của tất cả các repo thành 1 tập hợp duy nhất
                unique_users: Set[str] = set()
                for p in repos_plan:
                    unique_users.update(p["users"])

                logger.info(f"🔍 [JIT Dedup] Kiểm tra JIT song song cho {len(unique_users)} người dùng duy nhất...")
                unique_users_list = list(unique_users)
                jit_tasks = [self._check_user_existence(client, u) for u in unique_users_list]
                jit_results = await asyncio.gather(*jit_tasks)

                # Bảng tra cứu JIT trong RAM
                jit_lookup: Dict[str, bool] = dict(zip(unique_users_list, jit_results))

                # Lọc ra danh sách chưa login PGit toàn cục
                all_not_logged_in = [u for u, exists in jit_lookup.items() if not exists]

                # Tinh lọc lại repos_plan: CHỈ GIỮ LẠI USER ĐÃ JIT THÀNH CÔNG!
                # (Loại bỏ luôn từ đầu để Repo con không tốn công xử lý)
                for p in repos_plan:
                    p["users"] = [u for u in p["users"] if jit_lookup.get(u, False)]
            else:
                logger.info("ℹ️ [Remove Flow] Bỏ qua kiểm tra JIT vì chỉ thực hiện gỡ bỏ Collaborator.")

            # =================================================================
            # ⚡ 3. THỰC THI REPOS SONG SONG CÓ KIỂM SOÁT (Semaphore 3)
            # =================================================================
            repo_semaphore = asyncio.Semaphore(3)  # Tối đa 3 Repos cùng lúc chống SQLite Lock
            logger.info(f"🚀 [Concurrency] Bắt đầu thực thi {len(repos_plan)} Repos với Semaphore(3)...")

            async def _run_single_repo(plan: Dict[str, Any]) -> Dict[str, Any]:
                async with repo_semaphore:
                    return await self._process_single_repo_httpx(
                        client=client,
                        raw_repo_url=plan["repo_url"],
                        valid_users=plan["users"],
                        target_role=plan["role"],
                        action=plan["action"]
                    )

            all_results = await asyncio.gather(*[_run_single_repo(p) for p in repos_plan])

        # 4. Gom danh sách thống kê
        all_added = list(dict.fromkeys([u for r in all_results for u in r.get("added", [])]))
        all_already = list(dict.fromkeys([u for r in all_results for u in r.get("already_exists", [])]))
        all_removed = list(dict.fromkeys([u for r in all_results for u in r.get("removed", [])]))
        all_errors = [e for r in all_results for e in r.get("errors", [])]

        # =====================================================================
        # 📝 TẠO BÁO CÁO LOG TINH GỌN THEO YÊU CẦU CỦA QUẢN TRỊ VIÊN
        # =====================================================================
        action_headline = "GỠ BỎ" if is_remove_flow else "ĐIỀU PHỐI"
        report_lines: List[str] = [
            f"🎯 HOÀN TẤT {action_headline} GIT COLLABORATORS ({len(repos_plan)} REPOS)"
        ]

        if is_remove_flow:
            # Luồng gỡ: Hiện danh sách người cần gỡ
            all_target_remove = list(dict.fromkeys([u for p in repos_plan for u in p.get("users", [])]))
            if all_target_remove:
                report_lines.append(f"Gỡ bỏ: {', '.join(all_target_remove)}")
        else:
            # Luồng thêm: Hiện nhóm Role (Chỉ hiện Role có người)
            role_labels = [("ADMIN", "Admin"), ("DEVELOPER", "Developer"), ("GUEST", "Guest")]
            for role_key, role_title in role_labels:
                matched_users = [u for u, r in raw_user_role_map.items() if r.upper() == role_key]
                if matched_users:
                    report_lines.append(f"{role_title}: {', '.join(matched_users)}")

        # Tóm tắt từng Repo 1 dòng
        for r in all_results:
            short_name = extract_short_repo_name(r.get("repo_url", ""))
            if is_remove_flow:
                rem_cnt = len(r.get("removed", []))
                alr_cnt = len(r.get("already_exists", []))
                report_lines.append(f"📁 REPO: {short_name} [Đã gỡ ({rem_cnt}) | Không tìm thấy ({alr_cnt})]")
            else:
                add_cnt = len(r.get("added", []))
                alr_cnt = len(r.get("already_exists", []))
                report_lines.append(f"📁 REPO: {short_name} [Thêm mới ({add_cnt}) | Có sẵn ({alr_cnt})]")

        # Báo lỗi có chọn lọc (Chỉ hiện khi có lỗi)
        if all_not_logged_in:
            report_lines.append(f"Chưa login PGit ⚠️: {', '.join(all_not_logged_in)}")

        if not_found_in_keycloak:
            report_lines.append(f"Không tồn tại ❌: {', '.join(not_found_in_keycloak)}")

        if all_errors:
            for err_item in all_errors:
                report_lines.append(f"Lỗi repo ⛔: {err_item.get('error')}")

        overall_status = "success" if (all_added or all_already or all_removed) else "failed"
        short_summary_msg = f"Hoàn tất {len(repos_plan)} Repos: {len(all_added)} Thêm, {len(all_removed)} Gỡ, {len(all_already)} Có sẵn."

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
    # 🏁 6. CỔNG TIẾP NHẬN: THÊM CỘNG TÁC VIÊN (ADD COLLABORATORS)
    # =========================================================================
    async def add_collaborators_pipeline(self, payload: Dict[str, Any], headless: Optional[bool] = None) -> Dict[str, Any]:
        """Cổng tiếp nhận Thêm quyền: Sàng lọc Keycloak ➔ JIT Dedup ➔ Direct API song song."""
        raw_user_role_map: Dict[str, str] = {}
        global_role = (payload.get("role") or "GUEST").upper()

        if payload.get("repos_plan") and isinstance(payload.get("repos_plan"), list):
            for item in payload["repos_plan"]:
                r_role = (item.get("role") or global_role).upper()
                for u in self._sanitize_users(item.get("users", [])):
                    raw_user_role_map[u] = r_role
        else:
            all_u = self._sanitize_users(payload.get("users", payload.get("collaborators", payload.get("emails", []))))
            for u in all_u:
                raw_user_role_map[u] = global_role

        normalized_payload, not_found_in_keycloak = await self._normalize_and_filter_users_via_keycloak(payload)

        is_headless = self._determine_headless(headless)
        repo_count = len(normalized_payload.get("repos_plan") or normalized_payload.get("repo_urls") or [1])
        timeout_seconds = max(60.0, float(repo_count * 15.0))

        try:
            return await asyncio.wait_for(
                self._internal_process_collaborators(
                    payload=normalized_payload,
                    raw_user_role_map=raw_user_role_map,
                    not_found_in_keycloak=not_found_in_keycloak,
                    is_headless=is_headless,
                    action="add"
                ),
                timeout=timeout_seconds
            )
        except asyncio.TimeoutError:
            logger.error(f"❌ Quá thời gian thực thi (Timeout {timeout_seconds}s) khi thêm Git Collaborators.")
            return {"status": "failed", "error": f"Tác vụ Git bị Timeout ({timeout_seconds}s)."}

    # =========================================================================
    # 🏁 7. CỔNG TIẾP NHẬN: GỠ CỘNG TÁC VIÊN (REMOVE COLLABORATORS)
    # =========================================================================
    async def remove_collaborators_pipeline(self, payload: Dict[str, Any], headless: Optional[bool] = None) -> Dict[str, Any]:
        """Cổng tiếp nhận Gỡ quyền: Sàng lọc Keycloak ➔ Bỏ qua JIT ➔ Direct API song song."""
        raw_user_role_map: Dict[str, str] = {}
        if payload.get("repos_plan") and isinstance(payload.get("repos_plan"), list):
            for item in payload["repos_plan"]:
                for u in self._sanitize_users(item.get("users", [])):
                    raw_user_role_map[u] = "REMOVE"
        else:
            all_u = self._sanitize_users(payload.get("users", payload.get("collaborators", payload.get("emails", []))))
            for u in all_u:
                raw_user_role_map[u] = "REMOVE"

        normalized_payload, not_found_in_keycloak = await self._normalize_and_filter_users_via_keycloak(payload)

        is_headless = self._determine_headless(headless)
        repo_count = len(normalized_payload.get("repos_plan") or normalized_payload.get("repo_urls") or [1])
        timeout_seconds = max(60.0, float(repo_count * 15.0))

        try:
            return await asyncio.wait_for(
                self._internal_process_collaborators(
                    payload=normalized_payload,
                    raw_user_role_map=raw_user_role_map,
                    not_found_in_keycloak=not_found_in_keycloak,
                    is_headless=is_headless,
                    action="remove"
                ),
                timeout=timeout_seconds
            )
        except asyncio.TimeoutError:
            logger.error(f"❌ Quá thời gian thực thi (Timeout {timeout_seconds}s) khi gỡ Git Collaborators.")
            return {"status": "failed", "error": f"Tác vụ Git bị Timeout ({timeout_seconds}s)."}


git_playwright_service = GitPlaywrightService()