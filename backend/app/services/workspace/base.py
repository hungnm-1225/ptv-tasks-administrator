# backend/app/services/workspace/base.py
import re
import logging
from datetime import datetime
from typing import Optional
from playwright.async_api import async_playwright, Page, BrowserContext

from app.core.config import settings

logger = logging.getLogger(__name__)
BASE_WORKSPACE_URL = "https://pythaverse.space"


def normalize_date_iso(date_str: Optional[str]) -> Optional[str]:
    """Tự động chuẩn hóa mọi định dạng ngày về YYYY-MM-DD."""
    if not date_str:
        return None
    date_str = str(date_str).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return date_str
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d.%m.%Y"):
        try:
            dt = datetime.strptime(date_str.split("T")[0], fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    parts = re.split(r"[-/\.]", date_str)
    if len(parts) == 3:
        if len(parts[0]) == 4:
            return f"{parts[0]:0>4}-{int(parts[1]):02d}-{int(parts[2]):02d}"
        elif len(parts[2]) == 4:
            return f"{parts[2]:0>4}-{int(parts[1]):02d}-{int(parts[0]):02d}"
    return date_str


class WorkspaceBaseService:
    """Class nền tảng quản lý phiên Chromium và đăng nhập SSO."""

    def __init__(self):
        self.headless = True

    async def _create_context(self, p) -> tuple:
        browser = await p.chromium.launch(
            headless=self.headless,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-zygote",
                "--single-process"
            ]
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        return browser, context, page

    async def login_role(self, page: Page, username: str, password: str, role_title: str = "Tài khoản") -> tuple[bool, str]:
        if not username or not password:
            err = f"❌ [{role_title}] Thiếu thông tin username/mật khẩu trong Két Sắt Vault!"
            logger.error(err)
            return False, err

        try:
            logger.info(f"🔑 [{role_title}] Đang đăng nhập tài khoản '{username}'...")
            # 🚀 TỐI ƯU: Đổi sang domcontentloaded và chờ input username xuất hiện
            response = await page.goto(f"{BASE_WORKSPACE_URL}/login", wait_until="domcontentloaded", timeout=25000)
            
            if response and response.status >= 500:
                err = f"🔥 [{role_title}] Máy chủ Pythaverse bị sập hoặc bảo trì! (Mã HTTP: {response.status})"
                logger.error(err)
                return False, err

            await page.wait_for_selector("input[name='username'], input[name='email'], #username", timeout=15000)
            await page.fill("input[name='username'], input[name='email'], #username", username)
            await page.fill("input[name='password'], #password", password)
            await page.click("button[type='submit'], input[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')")
            await page.wait_for_timeout(2500)

            kc_error_locator = page.locator(".alert-error, #input-error, span.kc-feedback-text, .alert.alert-warning, p.instruction")
            if await kc_error_locator.count() > 0 and await kc_error_locator.first.is_visible():
                raw_error_text = (await kc_error_locator.first.inner_text()).strip()
                err = f"❌ [{role_title} - '{username}'] Đăng nhập thất bại: '{raw_error_text}'"
                logger.error(err)
                return False, err

            if "login" in page.url or "authenticate" in page.url:
                err = f"⚠️ [{role_title} - '{username}'] Không thể chuyển trang sau đăng nhập (URL: {page.url})"
                logger.warning(err)
                return False, err

            logger.info(f"✅ [{role_title}] Đăng nhập thành công: {username}")
            return True, "Đăng nhập thành công"

        except Exception as e:
            err_str = str(e)
            if "Timeout" in err_str:
                err = f"⏳ [{role_title} - '{username}'] Quá thời gian chờ phản hồi (Timeout)!"
            elif "ERR_CONNECTION" in err_str or "ECONNREFUSED" in err_str:
                err = f"🔌 [{role_title}] Mất kết nối tới máy chủ Pythaverse!"
            else:
                err = f"💥 [{role_title} - '{username}'] Lỗi đăng nhập: {err_str[:150]}"
            logger.error(err)
            return False, err