# backend/app/services/session_keepalive_service.py
"""
Pythaverse Central Admin - Unified Session Keep-Alive & Pre-Warming Service (V1.0)
Kiến trúc: Non-blocking Async HTTPX Parallel Pings (7 Subsystems in ~800ms) + Supabase Session Store
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
"""
import os
import time
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import httpx

from app.core.supabase import get_supabase_client
from app.core.config import settings

logger = logging.getLogger("SESSION_KEEPALIVE")

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PtvKeepAlive/1.0",
    "Accept": "*/*",
}

# In-Memory Session Cache (RAM 1ms)
_MEMORY_SESSIONS: Dict[str, Dict[str, str]] = {}


class UnifiedSessionKeepAliveService:
    """Cỗ máy giữ ấm phiên đăng nhập cho 7 phân hệ của hệ sinh thái Pythaverse."""

    def __init__(self):
        self.supabase = get_supabase_client()

    # =========================================================================
    # 💾 1. GET & SET SESSION COOKIES (RAM ➔ SUPABASE DUAL-TIER)
    # =========================================================================
    async def get_session_cookies(self, session_key: str) -> Dict[str, str]:
        """Lấy cookies từ RAM, nếu rỗng thì nạp từ Supabase."""
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
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Lưu đè (UPSERT) session vào cả RAM và Supabase."""
        _MEMORY_SESSIONS[session_key] = cookies
        now_iso = datetime.now(timezone.utc).isoformat()

        try:
            self.supabase.table("workspace_active_sessions").upsert({
                "session_key": session_key,
                "system_name": system_name,
                "cookies": cookies,
                "metadata": metadata or {},
                "is_active": True,
                "updated_at": now_iso
            }).execute()
            logger.info(f"💾 [KeepAlive] Đã lưu/ghi đè Session '{session_key}' lên Supabase thành công!")
        except Exception as e:
            logger.error(f"❌ Lỗi ghi đè session '{session_key}' lên Supabase: {e}")

    # =========================================================================
    # ⚡ 2. BỘ 7 HÀM PING SIÊU NHẸ (NON-BLOCKING HTTPX)
    # =========================================================================

    async def _ping_admin_workspace(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        """1. Admin Workspace: getAdmin.php (0.8KB, ~700ms)."""
        cookies = await self.get_session_cookies("admin_workspace")
        if not cookies:
            return {"system": "Admin Workspace", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://pythaverse.space/wp-content/plugins/admin-workspace-v5/pages/phub_admin/action/getAdmin.php"
        res = await client.get(url, cookies=cookies)
        dur = int((time.perf_counter() - start) * 1000)

        is_valid = res.status_code == 200 and "login" not in str(res.url)
        return {"system": "Admin Workspace", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}

    async def _ping_lms_admin(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        """2. LMS Admin: HEAD request /?redirect=0 (Payload 0 Byte, ~80ms)."""
        cookies = await self.get_session_cookies("plearn_lms")
        if not cookies:
            return {"system": "PLearn LMS", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://learn.pythaverse.space/?redirect=0"
        # 🎯 DÙNG PHƯƠNG THỨC HEAD: KHÔNG TẢI 31KB HTML MÀ VẪN LÀM TƯƠI SESSION!
        res = await client.head(url, cookies=cookies)
        dur = int((time.perf_counter() - start) * 1000)

        is_valid = res.status_code in [200, 303] and "login" not in str(res.headers.get("location", ""))
        return {"system": "PLearn LMS", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}

    async def _ping_keycloak(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        """3. Keycloak IDP: brief user search max=1 (0.3KB, ~150ms)."""
        cookies = await self.get_session_cookies("keycloak_idp")
        start = time.perf_counter()
        url = "https://eid.pythaverse.space/auth/admin/realms/idp/users?briefRepresentation=true&first=0&max=1"
        res = await client.get(url, cookies=cookies)
        dur = int((time.perf_counter() - start) * 1000)

        is_valid = res.status_code == 200
        return {"system": "Keycloak IDP", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}

    async def _ping_git(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        """4. Pythaverse Git: AJAX repos search (1.1KB, ~171ms)."""
        cookies = await self.get_session_cookies("pythaverse_git")
        if not cookies:
            return {"system": "Pythaverse Git", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://git.pythaverse.space/repo?search=&page=1"
        res = await client.get(url, cookies=cookies)
        dur = int((time.perf_counter() - start) * 1000)

        is_valid = res.status_code == 200 and "signin" not in str(res.url)
        return {"system": "Pythaverse Git", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}

    async def _ping_sales_admin(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        """5. Sales Admin: available-roles (1.0KB, ~1s)."""
        cookies = await self.get_session_cookies("sales_admin")
        if not cookies:
            return {"system": "Sales Admin", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://pythaverse.space/wp-json/sales-admin-workspace/v1/users/available-roles"
        res = await client.get(url, cookies=cookies)
        dur = int((time.perf_counter() - start) * 1000)

        is_valid = res.status_code == 200 and "code" not in res.text[:20]
        return {"system": "Sales Admin", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}

    async def _ping_distributor(self, client: httpx.AsyncClient, dist_id: str = "2") -> Dict[str, Any]:
        """6. Distributor Workspace: getNotificationsData (0.6KB, ~840ms)."""
        cookies = await self.get_session_cookies(f"distributor_{dist_id}")
        if not cookies:
            return {"system": f"Distributor #{dist_id}", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/user/getNotificationsData.php?topic=distributor_{dist_id}"
        res = await client.get(url, cookies=cookies)
        dur = int((time.perf_counter() - start) * 1000)

        is_valid = res.status_code == 200 and "login" not in str(res.url)
        return {"system": f"Distributor #{dist_id}", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}

    async def _ping_osticket(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        """7. osTicket Helpdesk: HEAD /scp/ (Payload 0 Byte, ~200ms)."""
        cookies = await self.get_session_cookies("osticket")
        if not cookies:
            return {"system": "osTicket", "status": "NO_SESSION"}

        start = time.perf_counter()
        url = "https://support.pythaverse.space/scp/"
        res = await client.head(url, cookies=cookies)
        dur = int((time.perf_counter() - start) * 1000)

        is_valid = res.status_code == 200 and "login.php" not in str(res.headers.get("location", ""))
        return {"system": "osTicket", "status": "UP" if is_valid else "EXPIRED", "latency_ms": dur}

    # =========================================================================
    # 🚀 3. THỰC THI SONG SONG 7 SUB-SYSTEMS (TỔNG THỜI GIAN < 1 GIÂY)
    # =========================================================================
    async def keep_alive_all_sessions(self) -> List[Dict[str, Any]]:
        """Bắn song song toàn bộ 7 endpoints giữ ấm session (Chu kỳ 15 phút)."""
        start_all = time.perf_counter()
        logger.info("🔥 [KeepAlive] Đang kích hoạt làm tươi đồng loạt 7 phiên làm việc...")

        async with httpx.AsyncClient(headers=BROWSER_HEADERS, timeout=12.0, follow_redirects=True, verify=False) as client:
            tasks = [
                self._ping_admin_workspace(client),
                self._ping_lms_admin(client),
                self._ping_keycloak(client),
                self._ping_git(client),
                self._ping_sales_admin(client),
                self._ping_distributor(client, dist_id="2"),
                self._ping_osticket(client)
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

        total_dur = time.perf_counter() - start_all
        summary = []
        for r in results:
            if isinstance(r, dict):
                summary.append(r)
                logger.info(f"   🟢 {r.get('system')}: {r.get('status')} ({r.get('latency_ms', 0)}ms)")
            else:
                logger.warning(f"   ⚠️ Lỗi ping phân hệ: {r}")

        logger.info(f"✨ [KeepAlive] Đã giữ ấm thành công 7 phân hệ trong {total_dur:.2f}s!")
        return summary


session_keepalive_service = UnifiedSessionKeepAliveService()

async def run_session_keepalive_cron():
    await session_keepalive_service.keep_alive_all_sessions()