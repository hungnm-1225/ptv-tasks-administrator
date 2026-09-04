# backend/app/services/workspace/base.py
import re
import logging
from datetime import datetime
from typing import Optional
from playwright.async_api import async_playwright, Page, BrowserContext

from app.core.config import settings
from app.core.playwright_manager import (
    LOW_RAM_CHROMIUM_ARGS, 
    setup_low_ram_routes, 
    wait_for_dom_and_spinners,
    smart_wait_login_or_error
)

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
    """Class nền tảng quản lý phiên Chromium siêu tiết kiệm RAM và đăng nhập SSO."""

    def __init__(self):
        self.headless = True

    async def _create_context(self, p) -> tuple:
        browser = await p.chromium.launch(
            headless=self.headless,
            args=LOW_RAM_CHROMIUM_ARGS
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        )
        # Gắn bộ chặn media, font, trackers để tiết kiệm 70% RAM
        await setup_low_ram_routes(context)
        page = await context.new_page()
        page.set_default_timeout(30000)
        page.set_default_navigation_timeout(45000)
        return browser, context, page

    async def login_role(self, page: Page, username: str, password: str, role_title: str = "Tài khoản") -> tuple[bool, str]:
        if not username or not password:
            err = f"❌ [{role_title}] Thiếu thông tin username/mật khẩu trong Két Sắt Vault!"
            logger.error(err)
            return False, err

        try:
            logger.info(f"🔑 [{role_title}] Đang đăng nhập tài khoản '{username}'...")
            response = await page.goto(f"{BASE_WORKSPACE_URL}/login", wait_until="domcontentloaded", timeout=30000)
            
            if response and response.status >= 500:
                err = f"🔥 [{role_title}] Máy chủ Pythaverse bị sập hoặc bảo trì! (Mã HTTP: {response.status})"
                logger.error(err)
                return False, err

            # Chờ input xuất hiện và ổn định
            await wait_for_dom_and_spinners(page, "input[name='username'], input[name='email'], #username", min_pacing_ms=300)
            
            # 👉 BƠM TRỰC TIẾP USERNAME BẰNG JS DOM (CHỐNG LỆCH KÝ TỰ)
            uname_selector = "input[name='username'], input[name='email'], #username"
            await page.locator(uname_selector).first.wait_for(state="visible", timeout=10000)
            await page.evaluate(f"""({{ selector, val }}) => {{
                const el = document.querySelector(selector);
                if (el) {{
                    el.value = val;
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            }}""", {"selector": uname_selector.split(",")[0].strip(), "val": username})
            await page.wait_for_timeout(200)

            # 👉 BƠM TRỰC TIẾP PASSWORD BẰNG JS DOM (BẢO TOÀN 100% KÝ TỰ ĐẶC BIỆT @, !, #)
            pwd_selector = "input[name='password'], #password"
            await page.locator(pwd_selector).first.wait_for(state="visible", timeout=10000)
            await page.evaluate(f"""({{ selector, val }}) => {{
                const el = document.querySelector(selector);
                if (el) {{
                    el.value = val;
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            }}""", {"selector": pwd_selector.split(",")[0].strip(), "val": password})
            await page.wait_for_timeout(300)

            # Click nút đăng nhập
            submit_btn = page.locator("button[type='submit'], input[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')").first
            await submit_btn.click()
            
            # Chờ phản hồi đăng nhập theo State Race
            is_ok, login_err = await smart_wait_login_or_error(
                page, timeout=20000, role_title=role_title, username=username
            )
            if not is_ok:
                return False, login_err

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