import logging
import re
import httpx
from email.utils import parseaddr
from typing import List, Dict, Any, Optional
from playwright.async_api import async_playwright
from app.core.config import settings

logger = logging.getLogger(__name__)

# Giả lập Header Browser thật để vượt qua Nginx/WAF Anti-Bot
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
}

def clean_email_identifier(raw: Any) -> str:
    """Bóc tách email sạch từ chuỗi 'Họ Tên <email@dtt.vn>'"""
    if not raw or not isinstance(raw, str):
        return ""
    _, parsed_email = parseaddr(raw)
    if parsed_email and "@" in parsed_email:
        return parsed_email.strip().lower()
    match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', raw)
    if match:
        return match.group(0).strip().lower()
    return raw.replace('"', '').replace("'", "").strip().lower()


class KeycloakService:
    def __init__(self):
        self.raw_server_url = settings.KEYCLOAK_SERVER_URL.rstrip('/')
        self.target_realm = settings.KEYCLOAK_REALM or 'idp'
        self.admin_user = settings.KEYCLOAK_ADMIN_USER
        self.admin_pass = settings.KEYCLOAK_ADMIN_PASS
        self.client_id = settings.KEYCLOAK_CLIENT_ID or 'admin-cli'

    # =========================================================================
    # ⚡ TẦNG 1: DIRECT REST API VỚI BROWSER HEADERS (VƯỢT WAF)
    # =========================================================================
    async def _get_admin_token(self, client: httpx.AsyncClient) -> Optional[str]:
        """Lấy Admin Token trực tiếp qua HTTPX kèm Browser User-Agent"""
        # Thử 2 endpoint: có /auth và không có /auth
        urls_to_try = [
            f"{self.raw_server_url}/auth/realms/master/protocol/openid-connect/token",
            f"{self.raw_server_url}/realms/master/protocol/openid-connect/token"
        ]
        
        for token_url in urls_to_try:
            try:
                res = await client.post(
                    token_url,
                    data={
                        "client_id": self.client_id,
                        "username": self.admin_user,
                        "password": self.admin_pass,
                        "grant_type": "password"
                    },
                    headers=BROWSER_HEADERS,
                    timeout=10.0
                )
                if res.status_code == 200 and "access_token" in res.json():
                    return res.json()["access_token"]
            except Exception as e:
                logger.debug(f"Thử token tại {token_url} thất bại: {e}")
        return None

    async def execute_via_rest_api(
        self,
        identifiers: List[str],
        action_type: str,
        target_status: Optional[str],
        password_option: str,
        custom_password: Optional[str],
        temporary: bool
    ) -> Optional[Dict[str, Any]]:
        """Thực thi qua REST API với Browser Headers"""
        async with httpx.AsyncClient(verify=False, headers=BROWSER_HEADERS) as client:
            token = await self._get_admin_token(client)
            if not token:
                logger.warning("Không lấy được Token qua REST API (Bị Nginx chặn). Chuyển sang Playwright RPA...")
                return None  # Kích hoạt Fallback sang Tầng 2

            auth_headers = {
                **BROWSER_HEADERS,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }

            base_api = f"{self.raw_server_url}/auth/admin/realms/{self.target_realm}"
            results = []
            success_count = 0
            failed_count = 0

            desired_enabled = None
            if target_status == "enabled":
                desired_enabled = True
            elif target_status == "disabled":
                desired_enabled = False

            for raw_id in identifiers:
                clean_id = clean_email_identifier(raw_id)
                if not clean_id:
                    continue

                # 1. Tìm User
                search_res = await client.get(f"{base_api}/users?email={clean_id}&exact=true", headers=auth_headers)
                users = search_res.json() if search_res.status_code == 200 and isinstance(search_res.json(), list) else []
                
                if not users:
                    # Fallback tìm username
                    search_res = await client.get(f"{base_api}/users?username={clean_id}&exact=true", headers=auth_headers)
                    users = search_res.json() if search_res.status_code == 200 and isinstance(search_res.json(), list) else []

                if not users:
                    failed_count += 1
                    results.append({"identifier": clean_id, "status": "failed", "message": "Không tìm thấy User trên Keycloak"})
                    continue

                user_id = users[0]["id"]
                user_email = (users[0].get("email") or clean_id).strip().lower()
                logs = []

                try:
                    # 2. Cập nhật Status
                    user_payload = {}
                    if desired_enabled is not None:
                        user_payload["enabled"] = desired_enabled
                        logs.append(f"Set enabled={desired_enabled}")

                    if action_type in ["bulk_verify", "bulk_both"]:
                        user_payload["emailVerified"] = True
                        logs.append("Set emailVerified=True")

                    if user_payload:
                        await client.put(f"{base_api}/users/{user_id}", json=user_payload, headers=auth_headers)

                    # 3. Đổi Mật Khẩu
                    if action_type in ["bulk_reset_pass", "bulk_both", "reset_password"]:
                        if password_option == "email_lowercase":
                            pass_val = user_email
                        elif password_option == "default_secure":
                            pass_val = "Pythaverse@2026"
                        else:
                            pass_val = custom_password or user_email

                        await client.put(
                            f"{base_api}/users/{user_id}/reset-password",
                            json={"type": "password", "value": pass_val, "temporary": temporary},
                            headers=auth_headers
                        )
                        logs.append(f"Reset pass ({password_option}) - Temporary={temporary}")

                    success_count += 1
                    results.append({"identifier": clean_id, "status": "success", "logs": " | ".join(logs)})
                except Exception as ex:
                    failed_count += 1
                    results.append({"identifier": clean_id, "status": "failed", "message": str(ex)})

            return {
                "total": len(identifiers),
                "success_count": success_count,
                "failed_count": failed_count,
                "details": results
            }

    # =========================================================================
    # 🎭 TẦNG 2: PLAYWRIGHT RPA BOT CHÍNH HIỆU (Bypass 100% Mọi WAF/Nginx)
    # =========================================================================
    async def execute_via_playwright_rpa(
        self,
        identifiers: List[str],
        action_type: str,
        target_status: Optional[str],
        password_option: str,
        custom_password: Optional[str],
        temporary: bool
    ) -> Dict[str, Any]:
        """Chạy Chromium thật để đăng nhập và xử lý trực tiếp trên giao diện Keycloak"""
        logger.info("🚀 Kích hoạt Playwright Keycloak RPA Engine...")
        results = []
        success_count = 0
        failed_count = 0

        desired_enabled = None
        if target_status == "enabled":
            desired_enabled = True
        elif target_status == "disabled":
            desired_enabled = False

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]
            )
            context = await browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent=BROWSER_HEADERS["User-Agent"]
            )
            page = await context.new_page()

            try:
                # 1. Đăng nhập Keycloak
                console_url = f"{self.raw_server_url}/auth/admin/master/console/#/realms/{self.target_realm}/users"
                await page.goto(console_url, wait_until="networkidle", timeout=30000)

                if await page.locator("input#username").count() > 0:
                    await page.fill("input#username", self.admin_user)
                    await page.fill("input#password", self.admin_pass)
                    await page.click("input#kc-login")
                    await page.wait_for_load_state("networkidle")

                for raw_id in identifiers:
                    clean_id = clean_email_identifier(raw_id)
                    if not clean_id:
                        continue

                    logs = []
                    try:
                        # 2. Về trang Users & Tìm kiếm
                        await page.goto(console_url, wait_until="networkidle")
                        await page.wait_for_selector('input[data-ng-model="query.search"]', timeout=15000)

                        search_box = page.locator('input[data-ng-model="query.search"]')
                        await search_box.fill(clean_id)
                        await page.keyboard.press("Enter")
                        await page.wait_for_timeout(1500)

                        # 3. Khớp chính xác hàng User
                        rows = page.locator('table#user-table tbody tr[ng-repeat="user in users"]')
                        count = await rows.count()
                        target_row = None

                        for i in range(count):
                            row = rows.nth(i)
                            email_txt = await row.locator("td.clip").nth(1).inner_text()
                            uname_txt = await row.locator("td.clip").nth(0).inner_text()
                            if email_txt.strip().lower() == clean_id or uname_txt.strip().lower() == clean_id:
                                target_row = row
                                break

                        if not target_row:
                            failed_count += 1
                            results.append({"identifier": clean_id, "status": "failed", "message": "Không tìm thấy User trên bảng UI"})
                            continue

                        # Click Edit
                        await target_row.locator("td.kc-action-cell:has-text('Edit')").click()
                        await page.wait_for_selector('ul.nav-tabs', timeout=10000)

                        # 4. Sửa Status tại Tab Details
                        if desired_enabled is not None:
                            enabled_chk = page.locator("input#userEnabled")
                            if await enabled_chk.is_checked() != desired_enabled:
                                await page.locator("label[for='userEnabled']").click()
                                await page.click("button[kc-save]")
                                await page.wait_for_timeout(1000)
                            logs.append(f"Set enabled={desired_enabled}")

                        # 5. Đổi Mật Khẩu tại Tab Credentials
                        if action_type in ["bulk_reset_pass", "bulk_both", "reset_password"]:
                            if password_option == "email_lowercase":
                                pass_val = clean_id
                            elif password_option == "default_secure":
                                pass_val = "Pythaverse@2026"
                            else:
                                pass_val = custom_password or clean_id

                            await page.click('ul.nav-tabs a:has-text("Credentials")')
                            await page.wait_for_selector("input#newPas", timeout=10000)

                            await page.fill("input#newPas", pass_val)
                            await page.fill("input#confirmPas", pass_val)

                            temp_chk = page.locator("input#temporaryPassword")
                            if await temp_chk.is_checked() != temporary:
                                await page.locator("label[for='temporaryPassword']").click()

                            await page.click('button[data-ng-click="resetPassword(true)"]')
                            await page.wait_for_timeout(1500)
                            logs.append(f"Reset pass ({password_option}) - Temporary={temporary}")

                        success_count += 1
                        results.append({"identifier": clean_id, "status": "success", "logs": " | ".join(logs)})
                    except Exception as err:
                        failed_count += 1
                        results.append({"identifier": clean_id, "status": "failed", "message": str(err)})

            finally:
                await context.close()
                await browser.close()

        return {
            "total": len(identifiers),
            "success_count": success_count,
            "failed_count": failed_count,
            "details": results
        }

    # =========================================================================
    # 🎯 ROUTER ĐIỀU PHỐI CHÍNH
    # =========================================================================
    async def execute_account_action_async(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Trích xuất danh sách identifiers
        raw_list = payload.get("identifiers") or payload.get("emails") or payload.get("users") or []
        if isinstance(raw_list, str):
            raw_list = [raw_list]

        if not raw_list:
            single = payload.get("identifier") or payload.get("target_email") or payload.get("email") or payload.get("username")
            if single:
                raw_list = [single]

        if not raw_list:
            return {"status": "failed", "message": "Không tìm thấy email/username trong payload"}

        action = payload.get("action") or payload.get("action_type") or "bulk_both"
        target_status = payload.get("target_status")
        if not target_status:
            if action == "enable_user":
                target_status = "enabled"
            elif action == "disable_user":
                target_status = "disabled"

        password_option = payload.get("password_option") or "email_lowercase"
        custom_pass = payload.get("new_password") or payload.get("temp_pass")
        temporary = payload.get("temporary", False)

        # 1. Thử qua REST API với Browser Headers trước
        res = await self.execute_via_rest_api(
            identifiers=raw_list,
            action_type=action,
            target_status=target_status,
            password_option=password_option,
            custom_password=custom_pass,
            temporary=temporary
        )

        # 2. Nếu REST API bị WAF chặn HTML bảo trì, kích hoạt ngay Playwright RPA
        if res is None:
            res = await self.execute_via_playwright_rpa(
                identifiers=raw_list,
                action_type=action,
                target_status=target_status,
                password_option=password_option,
                custom_password=custom_pass,
                temporary=temporary
            )

        return res

    def execute_account_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Wrapper đồng bộ để tương thích với luồng cũ"""
        import asyncio
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(self.execute_account_action_async(payload))


keycloak_service = KeycloakService()