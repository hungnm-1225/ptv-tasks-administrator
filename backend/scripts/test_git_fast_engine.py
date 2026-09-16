# backend/test_git_fast_engine.py
"""
=====================================================================
🚀 MASTER PYTHAVERSE GIT FAST ENGINE TEST SUITE (DIRECT API HYBRID)
=====================================================================
Kịch bản kiểm thử tối ưu hóa chức năng thêm Collaborator vào GitBucket:
1. Playwright SSO Keycloak bốc Cookie GitBucket trong 3-4s -> Đóng ngay Chromium.
2. Kiểm tra tồn tại người dùng qua API /_user/existence (nhận diện JIT chưa login trong 20ms).
3. Đọc danh sách Collaborators hiện tại của Repo qua GET /settings/collaborators.
4. Bắn 1 request POST lưu toàn bộ danh sách Collaborators mới trong 200ms!
=====================================================================
"""

import os
import sys
import re
import time
import logging
import asyncio
import gc
from typing import Dict, Any, List, Optional, Tuple
import httpx
from playwright.async_api import async_playwright, Browser
from pathlib import Path
from dotenv import load_dotenv

# Ép nạp đúng file backend/.env dù anh đang đứng ở bất kỳ đâu
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
else:
    load_dotenv()

# Nạp settings từ backend core
from app.core.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("GIT_FAST_TEST")

BASE_GIT_URL = (os.getenv("GIT_SERVER_URL") or getattr(settings, "GIT_SERVER_URL", "") or "https://git.pythaverse.space").rstrip("/")
ADMIN_USER = os.getenv("GIT_ADMIN_USER") or getattr(settings, "GIT_ADMIN_USER", "") or "ptvadmin"
ADMIN_PASS = str(os.getenv("GIT_ADMIN_PASS") or getattr(settings, "GIT_ADMIN_PASS", "")).strip().strip("'\"")

# =====================================================================
# 🎯 DỮ LIỆU KIỂM THỬ THỰC TẾ CỦA ANH
# =====================================================================
TEST_REPO_URL = "https://git.pythaverse.space/ptvswrp/SWRP11_Teacher"
TEST_ROLE = "GUEST"  # GUEST / DEVELOPER / ADMIN

# Danh sách test gồm cả người đã login và người chưa login:
TEST_USERS = [
    "hsdttemd",
    "gvdttemd",
    "htdttemd"
]


def clean_repo_settings_url(raw_url: str) -> str:
    """Chuẩn hóa link repo trỏ thẳng vào /settings/collaborators."""
    clean = raw_url.strip().rstrip("/")
    if clean.endswith(".git"):
        clean = clean[:-4].rstrip("/")
    if clean.endswith("/settings/collaborators"):
        return clean
    if clean.endswith("/settings"):
        return f"{clean}/collaborators"
    return f"{clean}/settings/collaborators"


class GitFastTester:
    def __init__(self):
        self.cookies_dict: Dict[str, str] = {}

    # =================================================================
    # 🔑 BỐC SESSION PLAYWRIGHT (CHỈ 3-4S RỒI ĐÓNG TRÌNH DUYỆT)
    # =================================================================
    async def steal_git_session(self) -> bool:
        logger.info("\n" + "=" * 60)
        logger.info(f"🔑 BỐC SESSION OIDC GITBUKCET CHO ADMIN: [{ADMIN_USER}]...")
        logger.info("=" * 60)
        t0 = time.time()

        if not ADMIN_PASS:
            logger.error("❌ Thiếu GIT_ADMIN_PASS trong file .env!")
            return False

        LOW_RAM_ARGS = [
            "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
            "--disable-gpu", "--no-first-run", "--no-zygote", "--single-process",
            "--disable-extensions", "--js-flags=--max-old-space-size=128"
        ]

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(headless=True, args=LOW_RAM_ARGS)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"
            )
            # Chặn media, ảnh để tăng tốc độ tải trang
            await context.route("**/*.{png,jpg,jpeg,webp,svg,gif,woff,woff2,mp4}", lambda r: r.abort())
            page = await context.new_page()

            try:
                await page.goto(f"{BASE_GIT_URL}/signin", wait_until="domcontentloaded", timeout=30000)

                # Bấm nút Sign in with Pythaverse eID
                oidc_btn = page.locator("form[action*='/signin/oidc'] input[type='submit'], input[value*='Sign in with Pythaverse eID'], a:has-text('Pythaverse eID')").first
                if await oidc_btn.count() > 0:
                    try:
                        async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                            await oidc_btn.click()
                    except Exception:
                        pass

                # Điền form Keycloak
                kc_user = page.locator("input#username").first
                if await kc_user.count() > 0 and await kc_user.is_visible():
                    await kc_user.fill(ADMIN_USER)
                    await page.fill("input#password", ADMIN_PASS)
                    login_btn = page.locator("input#kc-login, button[type='submit']").first
                    try:
                        async with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                            await login_btn.click()
                    except Exception:
                        pass

                # Chờ avatar xác nhận đã vào GitBucket
                await page.wait_for_selector("a.dropdown-toggle[title*='Signed'], img.avatar-mini, a[href*='/signout']", timeout=20000)

                cookies = await context.cookies()
                self.cookies_dict = {c["name"]: c["value"] for c in cookies}

                elapsed = round(time.time() - t0, 2)
                logger.info(f"🎉 Bốc Session GitBucket thành công trong {elapsed}s!")
                logger.info(f"   👉 Cookies: {list(self.cookies_dict.keys())}")
                return True

            except Exception as e:
                logger.error(f"❌ Lỗi khi bốc Session Git: {e}")
                return False
            finally:
                logger.info("🧹 [RAM Zero] Đóng Chromium, giải phóng 100% bộ nhớ!")
                await browser.close()
                gc.collect()

    # =================================================================
    # 🔍 KIỂM TRA SỰ TỒN TẠI (JIT CHECK) QUA /_user/existence (20ms)
    # =================================================================
    async def check_user_git_existence(self, client: httpx.AsyncClient, username: str) -> bool:
        """Kiểm tra xem người dùng đã từng đăng nhập GitBucket để kích hoạt JIT chưa."""
        try:
            res = await client.post(
                f"{BASE_GIT_URL}/_user/existence",
                data={"userName": username},
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            # Nếu user đã tồn tại trong DB GitBucket -> trả về text 'user'
            return res.status_code == 200 and res.text.strip().lower() == "user"
        except Exception:
            return False

    # =================================================================
    # 🚀 THÊM COLLABORATORS HÀNG LOẠT VÀO REPO QUA DIRECT API (~300ms)
    # =================================================================
    async def add_collaborators_direct_api(
        self,
        client: httpx.AsyncClient,
        repo_url: str,
        target_users: List[str],
        role: str = "GUEST"
    ) -> Dict[str, Any]:
        settings_url = clean_repo_settings_url(repo_url)
        logger.info("\n" + "-" * 60)
        logger.info(f"🚀 THỰC THI THÊM COLLABORATORS CHO REPO: {settings_url}")
        t0 = time.time()

        # 1. Đọc danh sách Collaborators hiện tại từ trang settings
        get_res = await client.get(settings_url)
        if get_res.status_code != 200:
            logger.error(f"❌ Không thể truy cập Repo settings (Status: {get_res.status_code})")
            return {"status": "failed", "error": f"HTTP {get_res.status_code}"}

        html_text = get_res.text
        # Trích xuất chuỗi collaborators hiện tại từ thẻ hidden input
        collab_match = re.search(r'name=["\']collaborators["\']\s+value=["\']([^"\']*)["\']', html_text)
        current_collab_str = collab_match.group(1) if collab_match else ""

        # Phân tích chuỗi hiện tại thành dict: {username: role}
        # Ví dụ: "admin:ADMIN,user1:GUEST," -> {"admin": "ADMIN", "user1": "GUEST"}
        current_collaborators: Dict[str, str] = {}
        if current_collab_str:
            for item in current_collab_str.split(","):
                item = item.strip()
                if ":" in item:
                    u, r = item.split(":", 1)
                    current_collaborators[u.strip()] = r.strip()

        logger.info(f"📋 Repo hiện có sẵn {len(current_collaborators)} Collaborators.")

        # 2. Kiểm tra JIT song song cho danh sách user cần thêm
        existence_tasks = [self.check_user_git_existence(client, u) for u in target_users]
        existence_results = await asyncio.gather(*existence_tasks)

        added_users = []
        already_exists_users = []
        not_logged_in_users = []

        new_changes = False

        for u, exists_on_git in zip(target_users, existence_results):
            u_clean = u.strip()
            # Nếu chưa từng login Git
            if not exists_on_git:
                logger.warning(f"⚠️ '{u_clean}' CHƯA TỪNG LOGIN Git (Chưa có bản ghi JIT) ➔ Bỏ qua!")
                not_logged_in_users.append(u_clean)
                continue

            # Nếu đã có trong danh sách
            if u_clean in current_collaborators:
                # Nếu role khác thì cập nhật lại role
                if current_collaborators[u_clean] != role:
                    current_collaborators[u_clean] = role
                    new_changes = True
                    logger.info(f"ℹ️ '{u_clean}' đã có trong Repo ➔ Cập nhật Role sang [{role}]")
                else:
                    logger.info(f"ℹ️ '{u_clean}' đã có sẵn với Role [{role}].")
                already_exists_users.append(u_clean)
            else:
                # Thêm mới
                current_collaborators[u_clean] = role
                added_users.append(u_clean)
                new_changes = True
                logger.info(f"✨ Thêm mới: '{u_clean}' ➔ Role [{role}]")

        # 3. Nếu có thay đổi -> Bắn 1 request POST lưu toàn bộ
        if new_changes:
            logger.info("💾 Đang bắn request Apply Changes lưu toàn bộ vào Git...")
            
            # Xây dựng chuỗi collaborators mới: "u1:R1,u2:R2,...,"
            new_collab_str = ",".join([f"{u}:{r}" for u, r in current_collaborators.items()]) + ","

            # Dựng form-data y hệt gói tin DevTools anh vừa bắt
            form_payload = {
                "userName-collaborator": "",
                "userName-group": "",
                "collaborators": new_collab_str
            }
            # Thêm các trường <username>=<ROLE> cho những người mới
            for u in added_users:
                form_payload[u] = role

            post_res = await client.post(
                settings_url,
                data=form_payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            elapsed = round((time.time() - t0) * 1000, 1)

            if post_res.status_code in [200, 302, 303]:
                logger.info(f"🎉 LƯU TOÀN BỘ COLLABORATORS THÀNH CÔNG TRONG {elapsed}ms!")
            else:
                logger.error(f"❌ Lưu thất bại ({post_res.status_code}): {post_res.text}")
        else:
            elapsed = round((time.time() - t0) * 1000, 1)
            logger.info(f"ℹ️ Không có thay đổi nào cần lưu (Xử lý xong trong {elapsed}ms).")

        return {
            "status": "success",
            "repo_url": repo_url,
            "added": added_users,
            "already_exists": already_exists_users,
            "not_logged_in_git": not_logged_in_users,
            "elapsed_ms": elapsed
        }

    # =================================================================
    # 🏁 MAIN RUNNER
    # =================================================================
    async def run_test(self):
        total_start = time.time()

        # 1. Bốc session
        if not await self.steal_git_session():
            return

        # 2. Thực thi qua HTTPX
        async with httpx.AsyncClient(
            base_url=BASE_GIT_URL,
            cookies=self.cookies_dict,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"},
            timeout=25.0,
            follow_redirects=True
        ) as client:
            result = await self.add_collaborators_direct_api(
                client=client,
                repo_url=TEST_REPO_URL,
                target_users=TEST_USERS,
                role=TEST_ROLE
            )

        total_elapsed = round(time.time() - total_start, 2)
        print("\n" + "=" * 60)
        print("📊 TỔNG KẾT KIỂM THỬ GIT FAST ENGINE:")
        print(f"⏱️ Tổng thời gian: {total_elapsed} Giây")
        print(f"✅ Thêm mới thành công ({len(result['added'])}): {result['added']}")
        print(f"ℹ️ Đã có sẵn ({len(result['already_exists'])}): {result['already_exists']}")
        print(f"⚠️ Chưa từng login Git ({len(result['not_logged_in_git'])}): {result['not_logged_in_git']}")
        print("=" * 60 + "\n")


if __name__ == "__main__":
    tester = GitFastTester()
    asyncio.run(tester.run_test())