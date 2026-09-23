# backend/app/services/session_keepalive_service.py
"""
Pythaverse Central Admin - Unified Session Keep-Alive & Full 7-Subsystem Auto-Seeder
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI (Master Enterprise Edition)
Chuyên trách:
- Gieo mầm tuần tự (1 Chromium slot duy nhất - bảo vệ 512MB RAM):
  1. Sales Admin Workspace
  2. Workspace Admin Portal
  3. osTicket Support
  4. Pythaverse GitBucket
  5. PLearn Moodle LMS
  6. Keycloak Admin Console
  7. Distributor Workspace (Vì Người Việt #2 / Malaysia)
- Ghi đè (UPSERT) trọn bộ 7 records vào bảng workspace_active_sessions trên Supabase.
- Giữ ấm định kỳ 15 phút bằng HTTPX Async thuần (< 1s, Zero Playwright).
"""
import os
import gc
import re
import time
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
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
    # 🔑 2. CỖ MÁY GIEO MẦM TUẦN TỰ TRỌN BỘ 7 PHÂN HỆ (1 CHROMIUM/LẦN)
    # =========================================================================

    async def _seed_workspace_admins(self) -> bool:
        """Gieo mầm đồng thời cho cả Sales Admin và Workspace Admin."""
        raw_user = os.getenv("TEST_ADMIN_USER", "")
        raw_pass = os.getenv("TEST_ADMIN_PASS", "")
        user = sanitize_val(raw_user)
        pwd = sanitize_val(raw_pass)

        if not user or not pwd:
            try:
                from app.api.v1.endpoints.workspace import get_clean_fernet_cipher
                vault_res = self.supabase.table("workspace_credentials_vault")\
                    .select("username, encrypted_password")\
                    .or_("username.eq.adminworkspace,account_role.eq.admin,account_role.eq.sales_admin")\
                    .limit(1)\
                    .execute()

                if vault_res.data:
                    v_row = vault_res.data[0]
                    user = v_row.get("username") or "adminworkspace"
                    enc_pass = v_row.get("encrypted_password") or ""
                    cipher = get_clean_fernet_cipher()
                    pwd = cipher.decrypt(enc_pass.encode()).decode() if (cipher and enc_pass.startswith("gAAAAA")) else enc_pass
            except Exception as v_err:
                logger.warning(f"⚠️ Không thể giải mã Vault cho Workspace Admin: {v_err}")

        if not user or not pwd:
            return False

        logger.info(f"🌱 [Seeder 1/6] Đang mở Playwright bốc Session Admin Workspace ({user})...")
        async with acquire_playwright_slot("Seed Workspace Admin", timeout=45, lane="admin"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 800}, user_agent=BROWSER_HEADERS["User-Agent"])
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    await page.goto("https://pythaverse.space/login", wait_until="domcontentloaded", timeout=25000)
                    user_sel = "#username, #user_login, input[name='log']"
                    pass_sel = "#password, #user_pass, input[name='pwd']"
                    btn_sel = "button[type='submit'], input[type='submit'], #wp-submit"

                    if await page.locator(user_sel).count() > 0:
                        await page.fill(user_sel, user)
                        await page.fill(pass_sel, pwd)
                        await page.click(btn_sel)
                        await page.wait_for_url(lambda u: "login" not in u, timeout=15000)

                    cookies = {c["name"]: c["value"] for c in await context.cookies()}
                    if cookies:
                        # Ghi đồng thời cả 2 bản ghi Sales Admin & Workspace Admin
                        await self.save_session_cookies("sales_admin", "Sales Admin Workspace", cookies, {"user": user})
                        await self.save_session_cookies("admin_workspace", "Admin Workspace Portal", cookies, {"user": user})
                        return True
                except Exception as e:
                    logger.error(f"❌ Lỗi gieo mầm Workspace Admin: {e}")
                finally:
                    await browser.close()
                    gc.collect()
        return False

    async def _seed_osticket(self) -> bool:
        """Gieo mầm session osTicket Support."""
        user = sanitize_val(os.getenv("OSTICKET_ADMIN_USER", ""))
        pwd = sanitize_val(os.getenv("OSTICKET_ADMIN_PASS", ""))
        if not user or not pwd:
            return False

        logger.info("🌱 [Seeder 2/6] Đang mở Playwright bốc Session osTicket...")
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
        """Gieo mầm session Pythaverse Git."""
        user = sanitize_val(os.getenv("GIT_ADMIN_USER", ""))
        pwd = sanitize_val(os.getenv("GIT_ADMIN_PASS", ""))
        if not user or not pwd:
            return False

        logger.info(f"🌱 [Seeder 3/6] Đang mở Playwright bốc Session Pythaverse Git ({user})...")
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
        """Gieo mầm session PLearn LMS bằng chính cỗ máy chuẩn của playwright_service.py."""
        try:
            from app.services.playwright_service import playwright_lms_service

            if not os.getenv("TEST_ADMIN_PASS"):
                try:
                    from app.api.v1.endpoints.workspace import get_clean_fernet_cipher
                    vault_res = self.supabase.table("workspace_credentials_vault")\
                        .select("username, encrypted_password")\
                        .or_("username.eq.adminworkspace,account_role.eq.admin,account_role.eq.sales_admin")\
                        .limit(1)\
                        .execute()

                    if vault_res.data:
                        v_row = vault_res.data[0]
                        user_name = v_row.get("username") or "adminworkspace"
                        enc_pass = v_row.get("encrypted_password") or ""
                        cipher = get_clean_fernet_cipher()
                        pwd = cipher.decrypt(enc_pass.encode()).decode() if (cipher and enc_pass.startswith("gAAAAA")) else enc_pass

                        os.environ["TEST_ADMIN_USER"] = user_name
                        os.environ["TEST_ADMIN_PASS"] = pwd
                        logger.info(f"🔓 [Vault] Đã nạp tài khoản '{user_name}' cho cỗ máy Moodle LMS!")
                except Exception as v_err:
                    logger.warning(f"⚠️ Lỗi đọc Vault cho LMS: {v_err}")

            logger.info("🌱 [Seeder LMS] Kích hoạt cỗ máy chuẩn _steal_moodle_session của anh...")
            cookies_dict, sesskey = await playwright_lms_service._steal_moodle_session()

            if cookies_dict and "MoodleSession" in cookies_dict:
                await self.save_session_cookies(
                    session_key="plearn_lms",
                    system_name="PLearn Moodle LMS",
                    cookies=cookies_dict,
                    metadata={"sesskey": sesskey, "user": os.getenv("TEST_ADMIN_USER", "adminworkspace")}
                )
                logger.info("✨ [Seeder LMS] Đã bốc thành công MoodleSession và lưu lên Supabase!")
                return True
            else:
                logger.warning("⚠️ Cỗ máy LMS không lấy được MoodleSession hoặc sesskey.")
        except Exception as e:
            logger.error(f"❌ Lỗi gieo mầm LMS qua playwright_service: {e}", exc_info=True)
        return False

    async def _seed_keycloak(self) -> bool:
        """Gieo mầm session Keycloak Admin Console Web UI (KEYCLOAK_SESSION 10 tiếng)."""
        user = sanitize_val(os.getenv("KEYCLOAK_ADMIN_USER", ""))
        pwd = sanitize_val(os.getenv("KEYCLOAK_ADMIN_PASS", ""))
        if not user or not pwd:
            return False

        logger.info(f"🌱 [Seeder 5/6] Đang mở Playwright bốc Session Keycloak Admin Console ({user})...")
        async with acquire_playwright_slot("Seed Keycloak Admin", timeout=45, lane="admin"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 800}, user_agent=BROWSER_HEADERS["User-Agent"])
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    await page.goto("https://eid.pythaverse.space/auth/admin/master/console/", wait_until="domcontentloaded", timeout=25000)
                    if await page.locator("#username").count() > 0:
                        await page.fill("#username", user)
                        await page.fill("#password", pwd)
                        await page.click("#kc-login, input[type='submit']")
                        await page.wait_for_url(lambda u: "console" in u and "login" not in u, timeout=18000)

                    cookies = {c["name"]: c["value"] for c in await context.cookies()}
                    if cookies:
                        await self.save_session_cookies("keycloak_admin", "Keycloak Admin Console", cookies, {"user": user})
                        return True
                except Exception as e:
                    logger.error(f"❌ Lỗi gieo mầm Keycloak: {e}")
                finally:
                    await browser.close()
                    gc.collect()
        return False

    async def _seed_all_distributors(self) -> int:
        """Tự động duyệt và gieo mầm tuần tự cho TẤT CẢ các Master Distributor có trong CSDL."""
        try:
            from app.services.workspace.workspace_scanner_service import workspace_scanner_service
            from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL

            # 🎯 LẤY DANH SÁCH ĐỘNG TOÀN BỘ DISTRIBUTORS TỪ CSDL (5 MASTER DISTRIBUTORS)
            distributors = await workspace_scanner_service.get_all_distributor_credentials()
            if not distributors:
                logger.warning("⚠️ Không tìm thấy tài khoản Distributor nào trong CSDL.")
                return 0

            seeded_count = 0
            for dist in distributors:
                d_code = str(dist.get("distributor_code") or dist.get("org_id") or "N/A")
                d_name = dist.get("distributor_name", "Distributor")
                session_key = f"distributor_{d_code}"

                # Nếu Distributor này đã có Session trong DB -> Bỏ qua, nhường slot cho con khác!
                if await self.get_session_cookies(session_key):
                    continue

                user = dist.get("username", "")
                pwd = dist.get("password", "")

                if not user or not pwd:
                    continue

                logger.info(f"🌱 [Seeder Distributor] Đang bốc Session cho [{d_name}] ({d_code})...")
                async with acquire_playwright_slot(f"Seed Distributor ({d_code})", timeout=45, lane="admin"):
                    async with async_playwright() as p:
                        browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                        context = await browser.new_context(viewport={"width": 1280, "height": 800}, user_agent=BROWSER_HEADERS["User-Agent"])
                        await setup_low_ram_routes(context)
                        page = await context.new_page()

                        try:
                            base_svc = WorkspaceBaseService()
                            is_ok, login_err = await base_svc.login_role(page, user, pwd, "Distributor")
                            if not is_ok:
                                logger.error(f"❌ Login thất bại cho {d_name}: {login_err}")
                                continue

                            await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/dashboard", wait_until="domcontentloaded", timeout=25000)
                            try:
                                await page.wait_for_function("() => !!window.user?.distributor_id", timeout=4000)
                            except Exception:
                                pass

                            real_dist_id = await page.evaluate("() => window.user?.distributor_id || null") or d_code
                            cookies = {c["name"]: c["value"] for c in await context.cookies()}

                            if cookies:
                                await self.save_session_cookies(
                                    session_key=session_key,
                                    system_name=f"Distributor {d_name} ({d_code})",
                                    cookies=cookies,
                                    metadata={"dist_id": str(real_dist_id), "distributor_code": d_code, "user": user}
                                )
                                logger.info(f"✨ [Seeder] Đã lưu session Distributor [{d_name}] ({d_code}) lên Supabase!")
                                seeded_count += 1
                        except Exception as e:
                            logger.error(f"❌ Lỗi gieo mầm Distributor {d_name}: {e}")
                        finally:
                            await browser.close()
                            gc.collect()

            return seeded_count
        except Exception as ex:
            logger.error(f"❌ Lỗi quy trình gieo mầm Distributors: {ex}")
            return 0

    async def seed_all_empty_sessions(self):
        """Tự động kiểm tra và gieo mầm tuần tự cho TẤT CẢ các phân hệ còn thiếu."""
        logger.info("🔍 [Auto-Seeder] Đang rà soát và gieo mầm cho toàn bộ 7 phân hệ...")

        # 1 & 2. Sales Admin & Workspace Admin
        if not await self.get_session_cookies("admin_workspace") or not await self.get_session_cookies("sales_admin"):
            await self._seed_workspace_admins()

        # 3. osTicket
        if not await self.get_session_cookies("osticket"):
            await self._seed_osticket()

        # 4. Git
        if not await self.get_session_cookies("pythaverse_git"):
            await self._seed_git()

        # 5. LMS Moodle
        if not await self.get_session_cookies("plearn_lms"):
            await self._seed_lms()

        # 6. Keycloak Admin
        if not await self.get_session_cookies("keycloak_admin"):
            await self._seed_keycloak()

        # 7. Distributor
        await self._seed_all_distributors()

    # =========================================================================
    # ⚡ 3. BỘ HÀM PING GIỮ ẤM SONG SONG (HTTPX ASYNC)
    # =========================================================================

    async def _ping_admin_workspace(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        cookies = await self.get_session_cookies("admin_workspace") or await self.get_session_cookies("sales_admin")
        if not cookies:
            return {"system": "Admin Workspace", "status": "NO_SESSION"}
        start = time.perf_counter()
        try:
            res = await client.get("https://pythaverse.space/wp-content/plugins/admin-workspace-v5/pages/phub_admin/action/getAdmin.php", cookies=cookies)
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
        try:
            res = await client.head("https://learn.pythaverse.space/?redirect=0", cookies=cookies)
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
        try:
            res = await client.get("https://git.pythaverse.space/repo?search=&page=1", cookies=cookies)
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
        try:
            res = await client.get("https://pythaverse.space/wp-json/sales-admin-workspace/v1/users/available-roles", cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200 and "code" not in res.text[:20]
            return {"system": "Sales Admin", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": "Sales Admin", "status": "ERROR", "error": str(e)}

    async def _ping_keycloak(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        cookies = await self.get_session_cookies("keycloak_admin")
        start = time.perf_counter()
        try:
            res = await client.get("https://eid.pythaverse.space/auth/admin/realms/idp/users?briefRepresentation=true&first=0&max=1", cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200
            return {"system": "Keycloak Admin", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": "Keycloak Admin", "status": "ERROR", "error": str(e)}

    async def _ping_single_distributor(self, client: httpx.AsyncClient, dist: Dict[str, Any]) -> Dict[str, Any]:
        """Ping giữ ấm cho từng Master Distributor cụ thể."""
        d_code = str(dist.get("distributor_code") or dist.get("org_id") or "N/A")
        d_name = dist.get("distributor_name", "Distributor")
        session_key = f"distributor_{d_code}"

        cookies = await self.get_session_cookies(session_key)
        if not cookies:
            return {"system": f"Distributor {d_name}", "status": "NO_SESSION"}

        start = time.perf_counter()
        # Đọc dist_id thực tế từ metadata hoặc dùng dist_code
        url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/user/getNotificationsData.php?topic=distributor_{d_code}"
        try:
            res = await client.get(url, cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200 and "login" not in str(res.url)
            return {"system": f"Distributor {d_name}", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": f"Distributor {d_name}", "status": "ERROR", "error": str(e)}

    async def _ping_osticket(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        cookies = await self.get_session_cookies("osticket")
        if not cookies:
            return {"system": "osTicket", "status": "NO_SESSION"}
        start = time.perf_counter()
        try:
            res = await client.head("https://support.pythaverse.space/scp/", cookies=cookies)
            dur = int((time.perf_counter() - start) * 1000)
            is_valid = res.status_code == 200 and "login.php" not in str(res.headers.get("location", ""))
            return {"system": "osTicket", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}
        except Exception as e:
            return {"system": "osTicket", "status": "ERROR", "error": str(e)}

    # =========================================================================
    # 🚀 4. ĐIỀU PHỐI ĐỒNG LOẠT (CHẠY ĐỊNH KỲ 15 PHÚT)
    # =========================================================================
    async def keep_alive_all_sessions(self) -> List[Dict[str, Any]]:
        # 1. TỰ ĐỘNG BỐC MẦM CHO NHỮNG CON CÒN THIẾU
        await self.seed_all_empty_sessions()

        # 2. BẮN SONG SONG GIỮ ẤM CÁC CON ĐÃ CÓ COOKIE (< 1 GIÂY)
        start_all = time.perf_counter()
        async with httpx.AsyncClient(headers=BROWSER_HEADERS, timeout=12.0, follow_redirects=True, verify=False) as client:
            tasks = [
                self._ping_admin_workspace(client),
                self._ping_lms_admin(client),
                self._ping_git(client),
                self._ping_sales_admin(client),
                self._ping_keycloak(client),
                self._ping_osticket(client)
            ]
            
            # Bắt riêng danh sách Master Distributors
            try:
                from app.services.workspace.workspace_scanner_service import workspace_scanner_service
                all_dists = await workspace_scanner_service.get_all_distributor_credentials()
                for d in all_dists:
                    tasks.append(self._ping_single_distributor(client, d))
            except Exception as d_err:
                logger.warning(f"Không thể nạp danh sách distributor để ping: {d_err}")

            results = await asyncio.gather(*tasks, return_exceptions=True)

        summary = []
        expired_systems = []
        for r in results:
            if isinstance(r, dict):
                summary.append(r)
                sys_name = r.get("system", "")
                st = r.get("status")
                logger.info(f"   🟢 {sys_name}: {st} ({r.get('latency_ms', 0)}ms)")
                if st in ["EXPIRED", "NO_SESSION"]:
                    expired_systems.append(sys_name)

        # 🎯 3. AUTO-HEALING: NẾU PHÁT HIỆN CON NÀO HẾT HẠN THÌ TỰ ĐỘNG BỐC MỚI NGAY DƯỚI NỀN!
        if expired_systems:
            logger.warning(f"⚠️ Phát hiện {len(expired_systems)} phân hệ hết hạn: {expired_systems}. Đang tự động gieo mầm lại dưới nền...")
            if any("Git" in s for s in expired_systems):
                await self._seed_git()
            if any("LMS" in s for s in expired_systems):
                await self._seed_lms()
            if any("Workspace" in s or "Sales Admin" in s for s in expired_systems):
                await self._seed_workspace_admins()
            if any("osTicket" in s for s in expired_systems):
                await self._seed_osticket()
            if any("Distributor" in s for s in expired_systems):
                await self._seed_all_distributors()

        total_dur = time.perf_counter() - start_all
        logger.info(f"✨ [KeepAlive] Đã hoàn tất giữ ấm & bảo trì toàn bộ 7 phân hệ trong {total_dur:.2f}s!")
        return summary

    # =========================================================================
    # 🔥 5. NGHI THỨC TÁI SINH TOÀN BỘ SESSION (ĐỘC QUYỀN - ZERO INTERRUPTION)
    # =========================================================================
    async def force_reseed_all_sessions(self) -> Dict[str, Any]:
        """
        Nghi thức Tái sinh Toàn bộ Session (Full System Session Rebirth):
        - Khóa độc quyền qua heavy_operation_guard (chặn 100% cronjobs và Playwright khác).
        - Xóa sạch RAM Cache _MEMORY_SESSIONS.
        - Quét Supabase, xóa trắng cookies của tất cả session_key hiện tại để thanh tẩy.
        - Gieo mầm tuần tự từ đầu cho toàn bộ 7 phân hệ (1 Chromium/lần, bảo vệ 512MB RAM).
        - Ping kiểm tra giữ ấm đồng loạt và trả về báo cáo.
        """
        from app.core.playwright_manager import heavy_operation_guard

        logger.info("🔥 [REBIRTH] BẮT ĐẦU NGHI THỨC TÁI SINH TOÀN BỘ SESSION HỆ THỐNG!")
        t0 = time.perf_counter()

        async with heavy_operation_guard("Tái sinh Session Toàn Hệ Thống"):
            # 1. Xóa sạch RAM Cache
            global _MEMORY_SESSIONS
            _MEMORY_SESSIONS.clear()
            logger.info("🧹 [REBIRTH 1/4] Đã xóa sạch _MEMORY_SESSIONS trong RAM.")

            # 2. Quét danh sách session_key hiện có trên Supabase & Xóa trắng cookie
            existing_keys = []
            try:
                res = self.supabase.table("workspace_active_sessions")\
                    .select("session_key")\
                    .execute()
                if res.data:
                    existing_keys = [r["session_key"] for r in res.data]
                    now_iso = datetime.now(timezone.utc).isoformat()
                    # Đánh dấu trạng thái đang tái sinh và xóa trắng cookies cũ
                    self.supabase.table("workspace_active_sessions")\
                        .update({
                            "cookies": {},
                            "is_active": False,
                            "last_ping_status": "REBIRTHING",
                            "updated_at": now_iso
                        })\
                        .in_("session_key", existing_keys)\
                        .execute()
                    logger.info(f"🧹 [REBIRTH 2/4] Đã xóa trắng cookies của {len(existing_keys)} keys trên Supabase.")
            except Exception as wipe_err:
                logger.warning(f"⚠️ Lỗi xóa cookies trên Supabase: {wipe_err}")

            # 3. Gieo mầm tuần tự từng phân hệ (Chỉ 1 Chromium/lần -> đóng ngay)
            logger.info("🌱 [REBIRTH 3/4] Bắt đầu gieo mầm tuần tự từng phân hệ...")
            
            # 3.1. Sales Admin & Workspace Admin
            logger.info("👉 [1/6] Tái sinh Workspace Admins...")
            await self._seed_workspace_admins()
            gc.collect()

            # 3.2. osTicket
            logger.info("👉 [2/6] Tái sinh osTicket...")
            await self._seed_osticket()
            gc.collect()

            # 3.3. GitBucket
            logger.info("👉 [3/6] Tái sinh Pythaverse Git...")
            await self._seed_git()
            gc.collect()

            # 3.4. LMS Moodle
            logger.info("👉 [4/6] Tái sinh PLearn LMS...")
            await self._seed_lms()
            gc.collect()

            # 3.5. Keycloak Admin Console
            logger.info("👉 [5/6] Tái sinh Keycloak Console...")
            await self._seed_keycloak()
            gc.collect()

            # 3.6. Tất cả Master Distributors
            logger.info("👉 [6/6] Tái sinh Master Distributors...")
            await self._seed_all_distributors()
            gc.collect()

            # 4. Kích hoạt ping giữ ấm và kiểm tra lại toàn bộ (< 1s)
            logger.info("⚡ [REBIRTH 4/4] Bắn ping HTTPX kiểm định toàn bộ...")
            ping_summary = await self.keep_alive_all_sessions()
            
            elapsed = round(time.perf_counter() - t0, 2)
            logger.info(f"🎉 [REBIRTH HOÀN TẤT] Tái sinh toàn bộ session thành công trong {elapsed}s!")

            return {
                "status": "success",
                "elapsed_seconds": elapsed,
                "reseeded_keys": existing_keys,
                "ping_summary": ping_summary,
                "message": f"Đã tái sinh thành công {len(existing_keys)} Sessions trong {elapsed}s!"
            }

session_keepalive_service = UnifiedSessionKeepAliveService()

async def run_session_keepalive_cron():
    await session_keepalive_service.keep_alive_all_sessions()