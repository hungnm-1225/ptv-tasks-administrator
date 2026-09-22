# backend/app/services/session_keepalive_service.py
"""
Pythaverse Central Admin - Unified Session Keep-Alive & Auto-Seeding Engine (Master Enterprise v2.0)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Tự động phát hiện bảng rỗng và kích hoạt Playwright gieo mầm tuần tự (Sequential Seeding) cho TOÀN BỘ phân hệ.
- Bảo vệ trần 512MB RAM Render: Chỉ chạy duy nhất 1 Chromium tại 1 thời điểm, đóng ngay sau 3s và thu hồi RAM.
- Ghi đè (UPSERT) trọn bộ Cookies vào bảng workspace_active_sessions trên Supabase.
- Giữ ấm song song 7 phân hệ mỗi 15 phút bằng HTTPX Async thuần (< 1s, Zero Playwright).
"""
import os
import gc
import re
import time
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
import httpx
from playwright.async_api import async_playwright

from app.core.supabase import get_supabase_client
from app.core.config import settings
from app.core.playwright_manager import acquire_playwright_slot, LOW_RAM_CHROMIUM_ARGS, setup_low_ram_routes

logger = logging.getLogger("SESSION_KEEPALIVE")

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PtvKeepAlive/2.0",
    "Accept": "*/*",
}

_MEMORY_SESSIONS: Dict[str, Dict[str, str]] = {}


def sanitize_val(val: Optional[str]) -> str:
    if not val:
        return ""
    cleaned = str(val).strip()
    if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
        cleaned = cleaned[1:-1]
    return cleaned.strip()


class UnifiedSessionKeepAliveService:
    def __init__(self):
        self.supabase = get_supabase_client()

    # =========================================================================
    # 💾 1. GET & SET SESSION COOKIES (RAM ➔ SUPABASE DUAL-TIER)
    # =========================================================================
    async def get_session_cookies(self, session_key: str) -> Dict[str, str]:
        if session_key in _MEMORY_SESSIONS and _MEMORY_SESSIONS[session_key]:
            return _MEMORY_SESSIONS[session_key]

        try:
            res = self.supabase.table("workspace_active_sessions")\
                .select("cookies")\
                .eq("session_key", session_key)\
                .eq("is_active", True)\
                .limit(1)\
                .execute()

            if res.data and res.data[0].get("cookies"):
                cookies = res.data[0]["cookies"]
                _MEMORY_SESSIONS[session_key] = cookies
                return cookies
        except Exception as e:
            logger.warning(f"⚠️ Không thể đọc session '{session_key}' từ Supabase: {e}")

        return {}

    async def save_session_cookies(
        self, 
        session_key: str, 
        system_name: str, 
        cookies: Dict[str, str], 
        metadata: Optional[Dict[str, Any]] = None,
        last_status: str = "UP",
        latency_ms: int = 0
    ):
        _MEMORY_SESSIONS[session_key] = cookies
        now_iso = datetime.now(timezone.utc).isoformat()

        try:
            self.supabase.table("workspace_active_sessions").upsert({
                "session_key": session_key,
                "system_name": system_name,
                "cookies": cookies,
                "metadata": metadata or {},
                "is_active": True,
                "last_ping_status": last_status,
                "last_ping_latency_ms": latency_ms,
                "last_checked_at": now_iso,
                "updated_at": now_iso
            }).execute()
            logger.info(f"💾 [KeepAlive] Đã lưu/ghi đè Session '{session_key}' ({system_name}) lên Supabase!")
        except Exception as e:
            logger.error(f"❌ Lỗi ghi đè session '{session_key}' lên Supabase: {e}")

    # =========================================================================
    # 🔑 2. CỖ MÁY GIEO MẦM TUẦN TỰ (PLAYWRIGHT SEEDERS - CHỈ CHẠY 1 CHROMIUM/LẦN)
    # =========================================================================

    async def _seed_sales_admin(self) -> bool:
        """Gieo mầm session Sales Admin / Admin Workspace."""
        raw_user = os.getenv("TEST_ADMIN_USER", "")
        raw_pass = os.getenv("TEST_ADMIN_PASS", "")
        user = sanitize_val(raw_user)
        pwd = sanitize_val(raw_pass)

        if not user or not pwd:
            logger.warning("⚠️ Chưa cấu hình TEST_ADMIN_USER / PASS để gieo mầm Sales Admin.")
            return False

        logger.info("🌱 [Seeder 1/4] Đang mở Playwright bốc Session Sales Admin...")
        async with acquire_playwright_slot("Seed Sales Admin", timeout=45, lane="admin"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 800}, user_agent=BROWSER_HEADERS["User-Agent"])
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    await page.goto("https://pythaverse.space/login", wait_until="domcontentloaded", timeout=25000)
                    if await page.locator("#username").count() > 0:
                        await page.evaluate(f"""() => {{
                            document.querySelector('#username').value = '{user}';
                            document.querySelector('#username').dispatchEvent(new Event('input', {{ bubbles: true }}));
                            document.querySelector('#password').value = '{pwd}';
                            document.querySelector('#password').dispatchEvent(new Event('input', {{ bubbles: true }}));
                        }}""")
                        await page.click("button[type='submit']")
                        await page.wait_for_url(lambda u: "login" not in u, timeout=15000)

                    cookies = {c["name"]: c["value"] for c in await context.cookies()}
                    if cookies:
                        await self.save_session_cookies("sales_admin", "Sales Admin Workspace", cookies, {"user": user})
                        await self.save_session_cookies("admin_workspace", "Admin Workspace", cookies, {"user": user})
                        return True
                except Exception as e:
                    logger.error(f"❌ Lỗi gieo mầm Sales Admin: {e}")
                finally:
                    await browser.close()
                    gc.collect()
        return False

    async def _seed_osticket(self) -> bool:
        """Gieo mầm session osTicket Support."""
        raw_user = os.getenv("OSTICKET_ADMIN_USER", "")
        raw_pass = os.getenv("OSTICKET_ADMIN_PASS", "")
        user = sanitize_val(raw_user)
        pwd = sanitize_val(raw_pass)

        if not user or not pwd:
            logger.warning("⚠️ Chưa cấu hình OSTICKET_ADMIN_USER / PASS.")
            return False

        logger.info("🌱 [Seeder 2/4] Đang mở Playwright bốc Session osTicket...")
        async with acquire_playwright_slot("Seed osTicket", timeout=45, lane="admin"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 800}, user_agent=BROWSER_HEADERS["User-Agent"])
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    await page.goto("https://support.pythaverse.space/scp/login.php", wait_until="domcontentloaded", timeout=25000)
                    if await page.locator("input[name='userid'], #name").count() > 0:
                        await page.fill("input[name='userid'], #name", user)
                        await page.fill("input[name='passwd'], #pass", pwd)
                        await page.click("input[type='submit'], button[type='submit']")
                        await page.wait_for_url(lambda u: "login.php" not in u, timeout=15000)

                    cookies = {c["name"]: c["value"] for c in await context.cookies()}
                    if cookies:
                        await self.save_session_cookies("osticket", "osTicket Support Helpdesk", cookies, {"user": user})
                        return True
                except Exception as e:
                    logger.error(f"❌ Lỗi gieo mầm osTicket: {e}")
                finally:
                    await browser.close()
                    gc.collect()
        return False

    async def _seed_git(self) -> bool:
        """Gieo mầm session Pythaverse Git (qua Keycloak SSO)."""
        raw_user = os.getenv("GIT_ADMIN_USER", "") or os.getenv("KEYCLOAK_ADMIN_USER", "")
        raw_pass = os.getenv("GIT_ADMIN_PASS", "") or os.getenv("KEYCLOAK_ADMIN_PASS", "")
        user = sanitize_val(raw_user)
        pwd = sanitize_val(raw_pass)

        if not user or not pwd:
            logger.warning("⚠️ Chưa cấu hình GIT_ADMIN_USER / PASS.")
            return False

        logger.info("🌱 [Seeder 3/4] Đang mở Playwright bốc Session Pythaverse Git...")
        async with acquire_playwright_slot("Seed Git", timeout=45, lane="admin"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 800}, user_agent=BROWSER_HEADERS["User-Agent"])
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    await page.goto("https://git.pythaverse.space/signin", wait_until="domcontentloaded", timeout=25000)
                    if "eid.pythaverse.space" in page.url or await page.locator("#username").count() > 0:
                        await page.fill("#username", user)
                        await page.fill("#password", pwd)
                        await page.click("#kc-login, input[type='submit']")
                        await page.wait_for_url(lambda u: "git.pythaverse.space" in u and "signin" not in u, timeout=15000)

                    cookies = {c["name"]: c["value"] for c in await context.cookies()}
                    if cookies:
                        await self.save_session_cookies("pythaverse_git", "Pythaverse GitBucket Repos", cookies, {"user": user})
                        return True
                except Exception as e:
                    logger.error(f"❌ Lỗi gieo mầm Git: {e}")
                finally:
                    await browser.close()
                    gc.collect()
        return False

    async def _seed_lms(self) -> bool:
        """Gieo mầm session PLearn LMS Moodle."""
        raw_user = os.getenv("KEYCLOAK_ADMIN_USER", "")
        raw_pass = os.getenv("KEYCLOAK_ADMIN_PASS", "")
        user = sanitize_val(raw_user)
        pwd = sanitize_val(raw_pass)

        if not user or not pwd:
            logger.warning("⚠️ Chưa cấu hình tài khoản LMS Moodle.")
            return False

        logger.info("🌱 [Seeder 4/4] Đang mở Playwright bốc Session PLearn LMS...")
        async with acquire_playwright_slot("Seed LMS", timeout=45, lane="admin"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 800}, user_agent=BROWSER_HEADERS["User-Agent"])
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    await page.goto("https://learn.pythaverse.space/login/index.php", wait_until="domcontentloaded", timeout=25000)
                    if await page.locator("a[href*='auth/oidc'], a.btn-login").count() > 0:
                        await page.click("a[href*='auth/oidc'], a.btn-login")
                    
                    if "eid.pythaverse.space" in page.url or await page.locator("#username").count() > 0:
                        await page.fill("#username", user)
                        await page.fill("#password", pwd)
                        await page.click("#kc-login, input[type='submit']")
                        await page.wait_for_url(lambda u: "learn.pythaverse.space" in u and "login" not in u, timeout=15000)

                    cookies = {c["name"]: c["value"] for c in await context.cookies()}
                    if cookies:
                        await self.save_session_cookies("plearn_lms", "PLearn Moodle LMS", cookies, {"user": user})
                        return True
                except Exception as e:
                    logger.error(f"❌ Lỗi gieo mầm LMS: {e}")
                finally:
                    await browser.close()
                    gc.collect()
        return False

    async def seed_all_empty_sessions(self):
        """Kiểm tra toàn bộ hệ thống: Phân hệ nào rỗng hoặc chết thì tự động mở Playwright gieo mầm tuần tự."""
        logger.info("🔍 [Auto-Seeder] Đang kiểm tra trạng thái Session của toàn bộ hệ sinh thái...")
        
        # 1. Sales Admin
        if not await self.get_session_cookies("sales_admin"):
            await self._seed_sales_admin()

        # 2. osTicket
        if not await self.get_session_cookies("osticket"):
            await self._seed_osticket()

        # 3. Git
        if not await self.get_session_cookies("pythaverse_git"):
            await self._seed_git()

        # 4. LMS Moodle
        if not await self.get_session_cookies("plearn_lms"):
            await self._seed_lms()

    # =========================================================================
    # ⚡ 3. BỘ 7 HÀM PING GIỮ ẤM SIÊU NHẸ (HTTPX ASYNC)
    # =========================================================================

    async def _ping_admin_workspace(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        cookies = await self.get_session_cookies("admin_workspace")
        if not cookies:
            return {"system": "Admin Workspace", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://pythaverse.space/wp-content/plugins/admin-workspace-v5/pages/phub_admin/action/getAdmin.php"
        try:
            res = await client.get(url, cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200 and "login" not in str(res.url)
            return {"system": "Admin Workspace", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": "Admin Workspace", "status": "ERROR", "error": str(e)}

    async def _ping_lms_admin(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        cookies = await self.get_session_cookies("plearn_lms")
        if not cookies:
            return {"system": "PLearn LMS", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://learn.pythaverse.space/?redirect=0"
        try:
            res = await client.head(url, cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code in [200, 303] and "login" not in str(res.headers.get("location", ""))
            return {"system": "PLearn LMS", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": "PLearn LMS", "status": "ERROR", "error": str(e)}

    async def _ping_git(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        cookies = await self.get_session_cookies("pythaverse_git")
        if not cookies:
            return {"system": "Pythaverse Git", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://git.pythaverse.space/repo?search=&page=1"
        try:
            res = await client.get(url, cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200 and "signin" not in str(res.url)
            return {"system": "Pythaverse Git", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": "Pythaverse Git", "status": "ERROR", "error": str(e)}

    async def _ping_sales_admin(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        cookies = await self.get_session_cookies("sales_admin")
        if not cookies:
            return {"system": "Sales Admin", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://pythaverse.space/wp-json/sales-admin-workspace/v1/users/available-roles"
        try:
            res = await client.get(url, cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200 and "code" not in res.text[:20]
            return {"system": "Sales Admin", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": "Sales Admin", "status": "ERROR", "error": str(e)}

    async def _ping_distributor(self, client: httpx.AsyncClient, dist_id: str = "2") -> Dict[str, Any]:
        cookies = await self.get_session_cookies("admin_workspace") or await self.get_session_cookies("sales_admin")
        if not cookies:
            return {"system": f"Distributor #{dist_id}", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/user/getNotificationsData.php?topic=distributor_{dist_id}"
        try:
            res = await client.get(url, cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200 and "login" not in str(res.url)
            return {"system": f"Distributor #{dist_id}", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": f"Distributor #{dist_id}", "status": "ERROR", "error": str(e)}

    async def _ping_osticket(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        cookies = await self.get_session_cookies("osticket")
        if not cookies:
            return {"system": "osTicket", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://support.pythaverse.space/scp/"
        try:
            res = await client.head(url, cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200 and "login.php" not in str(res.headers.get("location", ""))
            return {"system": "osTicket", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": "osTicket", "status": "ERROR", "error": str(e)}

    # =========================================================================
    # 🚀 4. PIPELINE ĐIỀU PHỐI ĐỒNG LOẠT (CHẠY MỖI 15 PHÚT)
    # =========================================================================
    async def keep_alive_all_sessions(self) -> List[Dict[str, Any]]:
        # 1. BƯỚC QUAN TRỌNG NHẤT: NẾU THẤY RỖNG THÌ TỰ ĐỘNG GIEO MẦM NGAY!
        await self.seed_all_empty_sessions()

        # 2. BẮN SONG SONG GIỮ ẤM CÁC PHÂN HỆ ĐÃ CÓ COOKIE (< 1 GIÂY)
        start_all = time.perf_counter()
        async with httpx.AsyncClient(headers=BROWSER_HEADERS, timeout=12.0, follow_redirects=True, verify=False) as client:
            tasks = [
                self._ping_admin_workspace(client),
                self._ping_lms_admin(client),
                self._ping_git(client),
                self._ping_sales_admin(client),
                self._ping_distributor(client, dist_id="2"),
                self._ping_osticket(client)
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        summary = []
        for r in results:
            if isinstance(r, dict):
                summary.append(r)
                logger.info(f"   🟢 {r.get('system')}: {r.get('status')} ({r.get('latency_ms', 0)}ms)")

        total_dur = time.perf_counter() - start_all
        logger.info(f"✨ [KeepAlive] Đã hoàn tất giữ ấm toàn bộ hệ sinh thái trong {total_dur:.2f}s!")
        return summary


session_keepalive_service = UnifiedSessionKeepAliveService()

async def run_session_keepalive_cron():
    await session_keepalive_service.keep_alive_all_sessions()