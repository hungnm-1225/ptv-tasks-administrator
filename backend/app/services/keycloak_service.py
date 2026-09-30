# backend/app/services/keycloak_service.py
import logging
import re
import gc
import time
import asyncio
import httpx
from email.utils import parseaddr
from typing import List, Dict, Any, Optional, Tuple
from playwright.async_api import async_playwright

from app.core.config import settings
from app.core.playwright_manager import acquire_playwright_slot, LOW_RAM_CHROMIUM_ARGS, setup_low_ram_routes

logger = logging.getLogger(__name__)

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
}

# Khóa kiểm soát tải song song tối đa 10 request cùng lúc vào Keycloak
KEYCLOAK_SEMAPHORE = asyncio.Semaphore(10)


def clean_email_identifier(raw: Any) -> str:
    """
    Bóc tách email hoặc username sạch từ chuỗi thô hoặc Dictionary.
    Hỗ trợ cả format chuỗi lẫn dict {'email': '...'} từ Workflow DAG.
    """
    if not raw:
        return ""
    if isinstance(raw, dict):
        raw = raw.get("email") or raw.get("username") or raw.get("identifier") or ""
    if not isinstance(raw, str):
        return ""

    raw = raw.strip()
    _, parsed_email = parseaddr(raw)
    if parsed_email and "@" in parsed_email:
        return parsed_email.strip().lower()
    
    match = re.search(r'[\w\.\+-]+@[\w\.-]+\.\w+', raw)
    if match:
        return match.group(0).strip().lower()
    
    return raw.replace('"', '').replace("'", "").strip().lower()


class KeycloakService:
    """
    Dịch vụ quản trị tập trung Keycloak IDP (eid.pythaverse.space):
    - Tầng 1: Direct REST API 300ms với In-Memory Token Caching + Double-Checked Lock.
    - Cơ chế tự chữa lành: Tự hủy cache token khi gặp lỗi 401/403.
    - Sàng lọc danh tính song song: asyncio.gather + KEYCLOAK_SEMAPHORE(10).
    - Tầng 2: Playwright RPA Console Fallback khi REST API gặp sự cố.
    """

    def __init__(self):
        self.raw_server_url = settings.KEYCLOAK_SERVER_URL.rstrip('/')
        self.target_realm = settings.KEYCLOAK_REALM or 'idp'
        self.admin_user = settings.KEYCLOAK_ADMIN_USER
        self.admin_pass = settings.KEYCLOAK_ADMIN_PASS
        self.client_id = settings.KEYCLOAK_CLIENT_ID or 'admin-cli'
        
        # ⚡ BỘ ĐỆM TOKEN IN-MEMORY VỚI DOUBLE-CHECKED LOCK
        self._cached_token: Optional[str] = None
        self._token_expires_at: float = 0.0
        self._token_lock: Optional[asyncio.Lock] = None

    def _get_lock(self) -> asyncio.Lock:
        """Khởi tạo Lock lười (Lazy Initialization) để gắn chặt với Event Loop hiện tại."""
        if self._token_lock is None:
            self._token_lock = asyncio.Lock()
        return self._token_lock

    def invalidate_token_cache(self) -> None:
        """Hủy bỏ token cache ngay lập tức khi phát hiện token hết hạn hoặc bị từ chối (401/403)."""
        self._cached_token = None
        self._token_expires_at = 0.0
        logger.warning("🔄 [Keycloak Cache] Đã thu hồi cache token (phát hiện 401/403 hoặc yêu cầu làm mới).")

    # =========================================================================
    # ⚡ TẦNG 1: DIRECT REST API VỚI TOKEN CACHING & DOUBLE-CHECKED LOCKING
    # =========================================================================
    async def _get_admin_token(self, client: httpx.AsyncClient, force_refresh: bool = False) -> Optional[str]:
        """Lấy Admin Token trực tiếp qua HTTPX (Có đệm RAM, Double-Checked Lock chống Stampede)."""
        now = time.time()
        # 1. Kiểm tra nhanh không cần Lock
        if not force_refresh and self._cached_token and now < self._token_expires_at:
            return self._cached_token

        # 2. Xếp hàng Lock để chỉ DUY NHẤT 1 luồng được xin token mới
        async with self._get_lock():
            now = time.time()
            # Double-check: kiểm tra lại xem luồng đi trước đã vừa lấy token xong chưa
            if not force_refresh and self._cached_token and now < self._token_expires_at:
                return self._cached_token

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
                    if res.status_code == 200:
                        data = res.json()
                        token = data.get("access_token")
                        expires_in = int(data.get("expires_in", 60))
                        if token:
                            self._cached_token = token
                            # Trừ hao 15 giây an toàn chống lệch xung nhịp (Clock Drift)
                            self._token_expires_at = now + max(expires_in - 15, 10)
                            logger.info("✨ [Keycloak Cache] Đã gia hạn Admin Token mới thành công (RAM đệm an toàn).")
                            return token
                except Exception as e:
                    logger.debug(f"Thử token tại {token_url} thất bại: {e}")

            return None

    # =========================================================================
    # 🔍 BỘ CHUẨN HÓA & SÀNG LỌC DANH TÍNH CHẶT CHẼ (ZERO-ASSUMPTION)
    # =========================================================================
    async def resolve_identifiers_to_usernames(self, raw_identifiers: List[Any]) -> Dict[str, Any]:
        """
        SÀNG LỌC TUYỆT ĐỐI QUA KEYCLOAK IDP (PARALLEL HTTPX + PARAMS AN TOÀN):
        - Bắt buộc kiểm tra tài khoản CÓ TỒN TẠI trên Keycloak hay không.
        - Tìm thấy ➔ Trích xuất CANONICAL USERNAME chính xác.
        - KHÔNG tìm thấy ➔ Bỏ vào danh sách 'not_found_in_keycloak' và LOẠI BỎ NGAY, không đoán mò!
        """
        cleaned_inputs = []
        for raw in raw_identifiers:
            c = clean_email_identifier(raw)
            if c and c not in cleaned_inputs:
                cleaned_inputs.append(c)

        if not cleaned_inputs:
            return {
                "valid_usernames": [],
                "mapping": {},
                "not_found_in_keycloak": [],
                "details": "Danh sách đầu vào rỗng."
            }

        logger.info(f"🔄 [Keycloak Gateway] Bắt đầu thẩm định {len(cleaned_inputs)} tài khoản...")

        async with httpx.AsyncClient(verify=False, headers=BROWSER_HEADERS, timeout=15.0) as client:
            token = await self._get_admin_token(client)
            if not token:
                logger.error("❌ Không lấy được Keycloak Token để thẩm định danh tính!")
                return {
                    "valid_usernames": [],
                    "mapping": {},
                    "not_found_in_keycloak": cleaned_inputs,
                    "details": "Lỗi kết nối máy chủ Keycloak."
                }

            auth_headers = {
                **BROWSER_HEADERS,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            base_api = f"{self.raw_server_url}/auth/admin/realms/{self.target_realm}"

            async def _check_user_exists(ident: str):
                async with KEYCLOAK_SEMAPHORE:
                    try:
                        users = []
                        # 1. Tìm theo Email chính xác (Dùng params an toàn chống lỗi dấu +)
                        if "@" in ident:
                            resp = await client.get(f"{base_api}/users", params={"email": ident, "exact": "true"}, headers=auth_headers)
                            if resp.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif resp.status_code == 200 and isinstance(resp.json(), list) and resp.json():
                                users = resp.json()

                        # 2. Tìm theo Username chính xác
                        if not users:
                            resp = await client.get(f"{base_api}/users", params={"username": ident, "exact": "true"}, headers=auth_headers)
                            if resp.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif resp.status_code == 200 and isinstance(resp.json(), list) and resp.json():
                                users = resp.json()

                        # 3. Tìm kiếm mở rộng nếu chưa thấy
                        if not users:
                            resp = await client.get(f"{base_api}/users", params={"search": ident}, headers=auth_headers)
                            if resp.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif resp.status_code == 200 and isinstance(resp.json(), list):
                                for u in resp.json():
                                    if (u.get("username") or "").lower() == ident or (u.get("email") or "").lower() == ident:
                                        users = [u]
                                        break

                        if users and users[0].get("username"):
                            canonical_username = users[0]["username"].strip()
                            return ident, canonical_username, True

                        return ident, None, False

                    except Exception as ex:
                        logger.error(f"Lỗi khi tra cứu Keycloak cho '{ident}': {ex}")
                        return ident, None, False

            tasks = [_check_user_exists(i) for i in cleaned_inputs]
            results = await asyncio.gather(*tasks)

            valid_usernames: List[str] = []
            mapping: Dict[str, str] = {}
            not_found_in_keycloak: List[str] = []

            for original, resolved_username, exists in results:
                if exists and resolved_username:
                    valid_usernames.append(resolved_username)
                    mapping[original] = resolved_username
                else:
                    not_found_in_keycloak.append(original)

            logger.info(
                f"🛡️ [Keycloak Gateway] Kết quả: "
                f"{len(valid_usernames)} HỢP LỆ, {len(not_found_in_keycloak)} KHÔNG TỒN TẠI"
            )

            return {
                "valid_usernames": list(dict.fromkeys(valid_usernames)),
                "mapping": mapping,
                "not_found_in_keycloak": not_found_in_keycloak,
                "details": f"Đã xác thực thành công {len(valid_usernames)}/{len(cleaned_inputs)} tài khoản trên Keycloak."
            }

    # =========================================================================
    # ⚡ THỰC THI CẬP NHẬT TÀI KHOẢN (SONG SONG HÓA TOÀN TRÌNH REST API)
    # =========================================================================
    async def execute_via_rest_api(
        self,
        identifiers: List[Any],
        desired_enabled: Optional[bool],
        desired_email_verified: Optional[bool],
        should_reset_pass: bool,
        password_option: str,
        custom_password: Optional[str],
        temporary: bool
    ) -> Optional[Dict[str, Any]]:
        """Thực thi cập nhật tài khoản hàng loạt song song (Bọc Semaphore, siêu tốc ~1s)."""
        cleaned_ids = [clean_email_identifier(i) for i in identifiers if clean_email_identifier(i)]
        cleaned_ids = list(dict.fromkeys(cleaned_ids))
        if not cleaned_ids:
            return {"total": 0, "success_count": 0, "failed_count": 0, "details": []}

        async with httpx.AsyncClient(verify=False, headers=BROWSER_HEADERS, timeout=20.0) as client:
            token = await self._get_admin_token(client)
            if not token:
                logger.warning("Không lấy được Token qua REST API. Chuyển sang Playwright RPA...")
                return None

            auth_headers = {
                **BROWSER_HEADERS,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            base_api = f"{self.raw_server_url}/auth/admin/realms/{self.target_realm}"

            async def _process_single_user(clean_id: str) -> Dict[str, Any]:
                async with KEYCLOAK_SEMAPHORE:
                    try:
                        users = []
                        if "@" in clean_id:
                            search_res = await client.get(f"{base_api}/users", params={"email": clean_id, "exact": "true"}, headers=auth_headers)
                            if search_res.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif search_res.status_code == 200 and isinstance(search_res.json(), list):
                                users = search_res.json()

                        if not users:
                            search_res = await client.get(f"{base_api}/users", params={"username": clean_id, "exact": "true"}, headers=auth_headers)
                            if search_res.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif search_res.status_code == 200 and isinstance(search_res.json(), list):
                                users = search_res.json()

                        if not users:
                            return {"identifier": clean_id, "status": "failed", "message": "Không tìm thấy User trên Keycloak"}

                        user_id = users[0]["id"]
                        user_email = (users[0].get("email") or clean_id).strip().lower()
                        logs = []

                        # Cập nhật Enabled / EmailVerified
                        user_payload = {}
                        if desired_enabled is not None:
                            user_payload["enabled"] = desired_enabled
                            logs.append(f"Set enabled={desired_enabled}")

                        if desired_email_verified is not None:
                            user_payload["emailVerified"] = desired_email_verified
                            logs.append(f"Set emailVerified={desired_email_verified}")

                        if user_payload:
                            put_res = await client.put(f"{base_api}/users/{user_id}", json=user_payload, headers=auth_headers)
                            if put_res.status_code in (401, 403):
                                self.invalidate_token_cache()
                                raise Exception("Lỗi xác thực Token (401/403), đã xóa cache.")
                            if put_res.status_code not in (200, 204):
                                raise Exception(f"Lỗi cập nhật user ({put_res.status_code}): {put_res.text}")

                        # Đặt lại Mật khẩu
                        if should_reset_pass:
                            if custom_password:
                                pass_val = custom_password
                            elif password_option == "email_lowercase":
                                pass_val = user_email
                            elif password_option == "default_secure":
                                pass_val = "Pythaverse@2026"
                            else:
                                pass_val = user_email

                            pass_res = await client.put(
                                f"{base_api}/users/{user_id}/reset-password",
                                json={"type": "password", "value": pass_val, "temporary": temporary},
                                headers=auth_headers
                            )
                            if pass_res.status_code in (401, 403):
                                self.invalidate_token_cache()
                                raise Exception("Lỗi xác thực Token khi đổi pass (401/403).")
                            if pass_res.status_code not in (200, 204):
                                raise Exception(f"Lỗi reset password ({pass_res.status_code}): {pass_res.text}")

                            logs.append(f"Reset pass ({pass_val}) [Temporary={temporary}]")

                        if not logs:
                            logs.append("Không có thay đổi nào được thực hiện")

                        return {"identifier": clean_id, "status": "success", "logs": " | ".join(logs)}

                    except Exception as ex:
                        return {"identifier": clean_id, "status": "failed", "message": str(ex)}

            tasks = [_process_single_user(cid) for cid in cleaned_ids]
            results = await asyncio.gather(*tasks)

            success_count = sum(1 for r in results if r.get("status") == "success")
            failed_count = len(results) - success_count

            return {
                "total": len(cleaned_ids),
                "success_count": success_count,
                "failed_count": failed_count,
                "details": results
            }

    # =========================================================================
    # 🎭 TẦNG 2: PLAYWRIGHT RPA BOT (Fallback khi REST API gặp trục trặc)
    # =========================================================================
    async def execute_via_playwright_rpa(
        self,
        identifiers: List[Any],
        desired_enabled: Optional[bool],
        desired_email_verified: Optional[bool],
        should_reset_pass: bool,
        password_option: str,
        custom_password: Optional[str],
        temporary: bool
    ) -> Dict[str, Any]:
        """Chạy Chromium thật để xử lý trên giao diện Keycloak Admin Console."""
        logger.info("🚀 Kích hoạt Playwright Keycloak RPA Fallback...")
        results = []
        success_count = 0
        failed_count = 0

        async with acquire_playwright_slot("Keycloak Playwright RPA Fallback"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(viewport={"width": 1440, "height": 900}, user_agent=BROWSER_HEADERS["User-Agent"])
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    console_url = f"{self.raw_server_url}/auth/admin/master/console/#/realms/{self.target_realm}/users"
                    await page.goto(console_url, wait_until="domcontentloaded", timeout=30000)

                    if await page.locator("input#username").count() > 0:
                        await page.fill("input#username", self.admin_user)
                        await page.fill("input#password", self.admin_pass)
                        await page.click("input#kc-login")
                        await page.wait_for_load_state("domcontentloaded")

                    for raw_id in identifiers:
                        clean_id = clean_email_identifier(raw_id)
                        if not clean_id:
                            continue

                        logs = []
                        try:
                            await page.goto(console_url, wait_until="domcontentloaded")
                            await page.wait_for_selector('input[data-ng-model="query.search"]', timeout=15000)

                            search_box = page.locator('input[data-ng-model="query.search"]')
                            await search_box.fill(clean_id)
                            await page.keyboard.press("Enter")
                            await page.wait_for_timeout(1200)

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

                            await target_row.locator("td.kc-action-cell:has-text('Edit')").click()
                            await page.wait_for_selector('ul.nav-tabs', timeout=10000)

                            need_save_details = False
                            if desired_enabled is not None:
                                enabled_chk = page.locator("input#userEnabled")
                                if await enabled_chk.is_checked() != desired_enabled:
                                    await page.locator("label[for='userEnabled']").click()
                                    need_save_details = True
                                logs.append(f"Set enabled={desired_enabled}")

                            if desired_email_verified is not None:
                                verify_chk = page.locator("input#emailVerified")
                                if await verify_chk.count() > 0 and await verify_chk.is_checked() != desired_email_verified:
                                    await page.locator("label[for='emailVerified']").click()
                                    need_save_details = True
                                logs.append(f"Set emailVerified={desired_email_verified}")

                            if need_save_details:
                                await page.click("button[kc-save]")
                                await page.wait_for_timeout(800)

                            if should_reset_pass:
                                if custom_password:
                                    pass_val = custom_password
                                elif password_option == "email_lowercase":
                                    pass_val = clean_id
                                elif password_option == "default_secure":
                                    pass_val = "Pythaverse@2026"
                                else:
                                    pass_val = clean_id

                                await page.click('ul.nav-tabs a:has-text("Credentials")')
                                await page.wait_for_selector("input#newPas", timeout=10000)

                                await page.fill("input#newPas", pass_val)
                                await page.fill("input#confirmPas", pass_val)

                                temp_chk = page.locator("input#temporaryPassword")
                                if await temp_chk.is_checked() != temporary:
                                    await page.locator("label[for='temporaryPassword']").click()

                                await page.click('button[data-ng-click="resetPassword(true)"]')
                                await page.wait_for_timeout(1200)
                                logs.append(f"Reset pass ({pass_val}) [Temporary={temporary}]")

                            success_count += 1
                            results.append({"identifier": clean_id, "status": "success", "logs": " | ".join(logs)})
                        except Exception as err:
                            failed_count += 1
                            results.append({"identifier": clean_id, "status": "failed", "message": str(err)})

                finally:
                    await browser.close()
                    gc.collect()

        return {
            "total": len(identifiers),
            "success_count": success_count,
            "failed_count": failed_count,
            "details": results
        }

    # =========================================================================
    # 🎯 ROUTER ĐIỀU PHỐI CHÍNH
    # =========================================================================
    async def execute_account_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Router điều phối hành động: Tự động trích xuất danh sách và gọi tầng REST API."""
        raw_list = payload.get("identifiers") or payload.get("emails") or payload.get("users") or []
        if isinstance(raw_list, (str, dict)):
            raw_list = [raw_list]

        if not raw_list:
            single = payload.get("identifier") or payload.get("target_email") or payload.get("email") or payload.get("username")
            if single:
                raw_list = [single]

        if not raw_list:
            return {"status": "failed", "message": "Không tìm thấy email/username trong payload"}

        actions_list: List[str] = []
        raw_actions = payload.get("actions")
        if isinstance(raw_actions, list):
            actions_list.extend(raw_actions)

        single_action = payload.get("action") or payload.get("action_type")
        if single_action:
            actions_list.append(single_action)

        desired_enabled: Optional[bool] = None
        # 1. Đọc trực tiếp cờ boolean từ payload
        if payload.get("enabled") is not None:
            desired_enabled = bool(payload["enabled"])
        # 2. Đọc theo status_action hoặc action
        elif payload.get("status_action") in ["disable", "lock", "deactivate"] or "disable_account" in actions_list or "disable_user" in actions_list:
            desired_enabled = False
        elif payload.get("status_action") in ["enable", "unlock", "activate"] or "enable_account" in actions_list or "enable_user" in actions_list:
            desired_enabled = True
        elif payload.get("target_status") == "disabled":
            desired_enabled = False
        elif payload.get("target_status") == "enabled":
            desired_enabled = True

        desired_email_verified: Optional[bool] = None
        if "mark_email_verified" in actions_list or "bulk_verify" in actions_list or "bulk_both" in actions_list:
            desired_email_verified = True
        elif "mark_email_unverified" in actions_list:
            desired_email_verified = False

        should_reset_pass = False
        if any(a in ["reset_password", "bulk_reset_pass", "bulk_both"] for a in actions_list):
            should_reset_pass = True

        password_option = payload.get("password_option") or "custom"
        custom_pass = (
            payload.get("temporary_password")
            or payload.get("new_password")
            or payload.get("temp_pass")
            or payload.get("custom_password")
        )
        temporary = payload.get("force_change_on_first_login", payload.get("temporary", False))

        res = await self.execute_via_rest_api(
            identifiers=raw_list,
            desired_enabled=desired_enabled,
            desired_email_verified=desired_email_verified,
            should_reset_pass=should_reset_pass,
            password_option=password_option,
            custom_password=custom_pass,
            temporary=temporary
        )

        if res is None:
            res = await self.execute_via_playwright_rpa(
                identifiers=raw_list,
                desired_enabled=desired_enabled,
                desired_email_verified=desired_email_verified,
                should_reset_pass=should_reset_pass,
                password_option=password_option,
                custom_password=custom_pass,
                temporary=temporary
            )

        success_count = res.get("success_count", 0)
        total = res.get("total", len(raw_list))
        details = res.get("details", [])

        log_lines = []
        if success_count > 0:
            log_lines.append(f"[SUCCESS] Đã xử lý thành công {success_count}/{total} tài khoản Keycloak:")
            for d in details:
                if d.get("status") == "success":
                    log_lines.append(f"  ✓ {d['identifier']}: {d.get('logs', 'OK')}")
                else:
                    log_lines.append(f"  ✗ {d['identifier']}: {d.get('message', 'Thất bại')}")
            res["status"] = "success"
        else:
            log_lines.append(f"[ERROR] Thất bại toàn bộ {total} tài khoản:")
            for d in details:
                log_lines.append(f"  ✗ {d['identifier']}: {d.get('message')}")
            res["status"] = "failed"

        res["execution_logs"] = "\n".join(log_lines)
        return res

    # =========================================================================
    # 🔍 HÀM TRA CỨU CHI TIẾT TÀI KHOẢN (CHO AUTOMATION STUDIO)
    # =========================================================================
    async def lookup_user_details(self, identifiers: List[Any]) -> List[Dict[str, Any]]:
        """Tra cứu chi tiết tài khoản song song kèm bảo vệ tham số dấu +."""
        cleaned_inputs = [clean_email_identifier(i) for i in identifiers if clean_email_identifier(i)]
        cleaned_inputs = list(dict.fromkeys(cleaned_inputs))
        if not cleaned_inputs:
            return []

        async with httpx.AsyncClient(verify=False, headers=BROWSER_HEADERS, timeout=15.0) as client:
            token = await self._get_admin_token(client)
            if not token:
                return [{"identifier": i, "exists": False, "error": "Không lấy được Keycloak Token"} for i in cleaned_inputs]

            auth_headers = {
                **BROWSER_HEADERS,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            base_api = f"{self.raw_server_url}/auth/admin/realms/{self.target_realm}"

            async def _get_details(ident: str):
                async with KEYCLOAK_SEMAPHORE:
                    try:
                        users = []
                        if "@" in ident:
                            resp = await client.get(f"{base_api}/users", params={"email": ident, "exact": "true"}, headers=auth_headers)
                            if resp.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif resp.status_code == 200 and isinstance(resp.json(), list) and resp.json():
                                users = resp.json()

                        if not users:
                            resp = await client.get(f"{base_api}/users", params={"username": ident, "exact": "true"}, headers=auth_headers)
                            if resp.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif resp.status_code == 200 and isinstance(resp.json(), list) and resp.json():
                                users = resp.json()

                        if not users and "@" in ident:
                            resp = await client.get(f"{base_api}/users", params={"search": ident}, headers=auth_headers)
                            if resp.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif resp.status_code == 200 and isinstance(resp.json(), list):
                                for u in resp.json():
                                    if (u.get("email") or "").lower() == ident or (u.get("username") or "").lower() == ident:
                                        users = [u]
                                        break

                        if users:
                            u = users[0]
                            return {
                                "identifier": ident,
                                "exists": True,
                                "id": u.get("id"),
                                "username": u.get("username"),
                                "firstName": u.get("firstName") or "",
                                "lastName": u.get("lastName") or "",
                                "email": u.get("email") or "",
                                "enabled": u.get("enabled", False),
                                "emailVerified": u.get("emailVerified", False),
                                "createdTimestamp": u.get("createdTimestamp")
                            }

                        return {"identifier": ident, "exists": False, "error": "Không tìm thấy trên eID Keycloak"}
                    except Exception as ex:
                        return {"identifier": ident, "exists": False, "error": str(ex)}

            tasks = [_get_details(i) for i in cleaned_inputs]
            return await asyncio.gather(*tasks)

    # =========================================================================
    # 🔑 BÙ REAL USERNAME & RESET MẬT KHẨU VỀ EMAIL CHO TÀI KHOẢN ĐÃ TỒN TẠI
    # =========================================================================
    async def sync_existing_users_passwords(self, emails: List[Any]) -> Dict[str, Dict[str, Any]]:
        """Tra cứu Real Username và Reset mật khẩu về Email song song siêu tốc (~200ms)."""
        cleaned_emails = [clean_email_identifier(e) for e in emails if clean_email_identifier(e) and "@" in clean_email_identifier(e)]
        cleaned_emails = list(dict.fromkeys(cleaned_emails))
        if not cleaned_emails:
            return {}

        logger.info(f"🔄 [Keycloak Sync] Bắt đầu đồng bộ & reset mật khẩu cho {len(cleaned_emails)} tài khoản đã tồn tại...")

        async with httpx.AsyncClient(verify=False, headers=BROWSER_HEADERS, timeout=15.0) as client:
            token = await self._get_admin_token(client)
            if not token:
                logger.error("❌ Không lấy được Keycloak Token để đồng bộ tài khoản cũ!")
                return {}

            auth_headers = {
                **BROWSER_HEADERS,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            base_api = f"{self.raw_server_url}/auth/admin/realms/{self.target_realm}"

            async def _sync_single(email: str):
                async with KEYCLOAK_SEMAPHORE:
                    try:
                        resp = await client.get(f"{base_api}/users", params={"email": email, "exact": "true"}, headers=auth_headers)
                        if resp.status_code in (401, 403):
                            self.invalidate_token_cache()
                            users = []
                        else:
                            users = resp.json() if resp.status_code == 200 and isinstance(resp.json(), list) else []

                        if not users:
                            resp = await client.get(f"{base_api}/users", params={"search": email}, headers=auth_headers)
                            if resp.status_code in (401, 403):
                                self.invalidate_token_cache()
                            elif resp.status_code == 200 and isinstance(resp.json(), list):
                                for u in resp.json():
                                    if (u.get("email") or "").lower() == email:
                                        users = [u]
                                        break

                        if not users:
                            logger.warning(f"⚠️ [Keycloak Sync] Không tìm thấy tài khoản cho email: {email}")
                            return email, None

                        user_data = users[0]
                        user_id = user_data.get("id")
                        real_username = (user_data.get("username") or "").strip()

                        # Reset mật khẩu về Email
                        pass_payload = {
                            "type": "password",
                            "value": email.lower(),
                            "temporary": False
                        }
                        put_res = await client.put(
                            f"{base_api}/users/{user_id}/reset-password",
                            json=pass_payload,
                            headers=auth_headers
                        )
                        if put_res.status_code in (401, 403):
                            self.invalidate_token_cache()

                        if put_res.status_code in (200, 204):
                            logger.info(f"✅ [Keycloak Sync] Đã reset pass về email cho {email} (Real Username: {real_username})")
                            return email, {
                                "username": real_username,
                                "password": email.lower(),
                                "user_id": user_id,
                                "status": "success"
                            }
                        else:
                            return email, {
                                "username": real_username,
                                "password": email.lower(),
                                "status": "reset_failed"
                            }

                    except Exception as ex:
                        logger.error(f"❌ [Keycloak Sync] Ngoại lệ khi xử lý {email}: {ex}")
                        return email, None

            tasks = [_sync_single(e) for e in cleaned_emails]
            results = await asyncio.gather(*tasks)

            synced_map: Dict[str, Dict[str, Any]] = {}
            for email, data in results:
                if data:
                    synced_map[email] = data

            return synced_map


keycloak_service = KeycloakService()