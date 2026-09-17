# backend/app/services/workspace/user_service.py
import logging
import asyncio
from typing import Dict, Any, Optional, List
import httpx
from playwright.async_api import async_playwright
from app.core.playwright_manager import (
    acquire_playwright_slot,
    LOW_RAM_CHROMIUM_ARGS,
    setup_low_ram_routes,
    force_kill_zombie_chromium
)
from app.services.workspace.base import WorkspaceBaseService

logger = logging.getLogger(__name__)

class WorkspaceUserService(WorkspaceBaseService):
    """
    Dịch vụ Hybrid RPA-API cập nhật thông tin User trên Admin Workspace:
    - Playwright Auth Gateway: Đăng nhập Sales Admin bốc Cookies trong 3s rồi đóng Chromium.
    - Pure HTTPX Engine: Dò User ID -> Lấy chi tiết -> Bắn Multipart Update (~200ms).
    """

    BASE_URL = "https://pythaverse.space/wp-content/plugins/admin-workspace-v5/pages/user_list/action"

    @classmethod
    async def _steal_admin_session(cls, admin_user: str, admin_pass: str) -> Dict[str, str]:
        """Bốc Cookie Admin qua Playwright 3s và giải phóng RAM tức thì."""
        async with acquire_playwright_slot("steal_admin_session_user", timeout=60, lane="admin"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1280, "height": 720})
                await setup_low_ram_routes(context)
                page = await context.new_page()
                try:
                    await page.goto("https://pythaverse.space/admin-workspace/login", wait_until="domcontentloaded", timeout=25000)
                    await cls.login_role(page, admin_user, admin_pass, role_title="Admin")
                    
                    cookies_list = await context.cookies()
                    cookies = {c["name"]: c["value"] for c in cookies_list}
                    logger.info("🔑 [WorkspaceUser] Bốc Cookie Admin thành công!")
                    return cookies
                finally:
                    await context.close()
                    await browser.close()
                    force_kill_zombie_chromium()

    @classmethod
    async def get_user_detail_by_identifier(
        cls, 
        admin_user: str, 
        admin_pass: str, 
        identifier: str
    ) -> Dict[str, Any]:
        """
        1. Tìm user_id qua getDataUser.php
        2. Lấy toàn bộ detailUser.php để chuẩn bị dữ liệu cho form edit
        """
        cookies = await cls._steal_admin_session(admin_user, admin_pass)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://pythaverse.space/admin-workspace/users",
        }

        # Lưu ý: Tìm kiếm WordPress có thể mất 15-30s do chưa index, timeout để 45s
        async with httpx.AsyncClient(timeout=45.0, verify=False) as client:
            # Bước 1: Dò tìm user_id
            search_url = f"{cls.BASE_URL}/getDataUser.php"
            params = {"page": 1, "per_page": 10, "search": identifier}
            logger.info(f"🔍 [WorkspaceUser] Đang tìm kiếm user: {identifier}...")
            
            resp_search = await client.get(search_url, params=params, cookies=cookies, headers=headers)
            if resp_search.status_code != 200:
                raise RuntimeError(f"Lỗi tìm kiếm user: HTTP {resp_search.status_code}")

            search_data = resp_search.json()
            users_list = search_data.get("data", [])
            if not users_list:
                return {"success": False, "message": f"Không tìm thấy người dùng với email/username: {identifier}"}

            user_summary = users_list[0]
            user_id = str(user_summary.get("user_id"))

            # Bước 2: Lấy chi tiết thông qua detailUser.php (Param user_email chính là user_id!)
            detail_url = f"{cls.BASE_URL}/detailUser.php"
            resp_detail = await client.get(detail_url, params={"user_email": user_id}, cookies=cookies, headers=headers)
            if resp_detail.status_code != 200:
                raise RuntimeError(f"Lỗi lấy chi tiết user {user_id}: HTTP {resp_detail.status_code}")

            detail_data = resp_detail.json()
            
            return {
                "success": True,
                "user_id": user_id,
                "user_login": user_summary.get("user_login"),
                "summary": user_summary,
                "detail": detail_data
            }

    @classmethod
    async def update_user_info(
        cls,
        admin_user: str,
        admin_pass: str,
        user_id: str,
        form_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Bắn request multipart/form-data cập nhật thông tin qua updateUser.php
        """
        cookies = await cls._steal_admin_session(admin_user, admin_pass)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": f"https://pythaverse.space/admin-workspace/users/{user_id}",
        }

        # Ép sang dạng multipart/form-data chuẩn xác như trình duyệt gửi
        multipart_payload = {
            "inputFirstname": (None, str(form_data.get("first_name", ""))),
            "inputLastname": (None, str(form_data.get("last_name", ""))),
            "user_login": (None, str(form_data.get("user_login", ""))),
            "inputEmail": (None, str(form_data.get("email", ""))),
            "inputDay": (None, str(form_data.get("day", "1"))),
            "inputMonth": (None, str(form_data.get("month", "1"))),
            "inputYear": (None, str(form_data.get("year", ""))),
            "inputCountries": (None, str(form_data.get("country_id", ""))),
            "inputCity": (None, str(form_data.get("city_id", ""))),
            "inputSchool": (None, str(form_data.get("school_id", ""))),
            "inputPartner": (None, str(form_data.get("partner_id", ""))),
            "idUserMDTeacher": (None, str(form_data.get("id_user_md", ""))),
            "user_role": (None, str(form_data.get("user_role", ""))),
        }

        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            update_url = f"{cls.BASE_URL}/updateUser.php"
            resp = await client.post(update_url, files=multipart_payload, cookies=cookies, headers=headers)
            
            if resp.status_code == 200:
                res_json = resp.json()
                logger.info(f"🎉 [WorkspaceUser] Cập nhật thành công user {user_id}: {res_json}")
                return res_json
            else:
                logger.error(f"❌ [WorkspaceUser] Lỗi update: HTTP {resp.status_code} - {resp.text}")
                return {"success": False, "message": resp.text, "http_code": resp.status_code}