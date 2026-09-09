# backend/app/core/playwright_manager.py
import os
import re
import gc
import time
import logging
import asyncio
import subprocess
from typing import Optional, Any
from contextlib import asynccontextmanager
from playwright.async_api import Route, Page, BrowserContext

logger = logging.getLogger(__name__)

# =============================================================================
# 🔒 GLOBAL SINGLE-INSTANCE CONCURRENCY ARCHITECTURE (RENDER 512MB SAFEGUARD)
# =============================================================================
# Khóa trần 1 Chromium duy nhất trên toàn hệ thống
GLOBAL_PLAYWRIGHT_SEMAPHORE = asyncio.Semaphore(1)


class CronSlotYieldException(Exception):
    """Exception nội bộ báo hiệu Cron chủ động nhường slot an toàn."""
    pass


def force_kill_zombie_chromium():
    """
    Tiêu diệt mọi tiến trình Chromium mồ côi (Zombie) còn sót lại trong container Render
    để thu hồi bộ nhớ RAM ngay lập tức.
    """
    try:
        # Lệnh pkill trên môi trường Linux Docker Render
        subprocess.run(["pkill", "-9", "-f", "chromium"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["pkill", "-9", "-f", "chrome"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


import contextvars

_PLAYWRIGHT_SLOT_HOLDER: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "_playwright_slot_holder", default=None
)


@asynccontextmanager
async def acquire_playwright_slot(
    task_name: str = "Playwright Task", 
    timeout: float = 300.0,
    lane: str = "admin"  # 'admin' (VIP) hoặc 'cron' (Nền)
):
    """
    Async Context Manager quản lý việc cấp phát slot thực thi Playwright:
    - Sử dụng 1 Global Lock duy nhất để bảo vệ trần 512MB RAM của Render.
    - Hỗ trợ Re-entrancy an toàn qua ContextVar: chống deadlock khi hàm cha và con đều gọi acquire slot.
    - lane='admin': Ưu tiên tối đa cho Quản trị viên duyệt tác vụ hoặc dispatch từ Studio (Timeout 300s).
    - lane='cron': Tác vụ cào dữ liệu định kỳ (osTicket, Long-Task, Scanner).
      Nếu slot đang bận, tự động ném CronSlotYieldException nhường slot êm dịu, KHÔNG làm văng lỗi đỏ ASGI.
    """
    is_admin = (lane.lower() == "admin")
    lane_tag = "👑 [VIP ADMIN LANE]" if is_admin else "⚙️ [BACKGROUND CRON LANE]"
    actual_timeout = timeout if is_admin else min(timeout, 45.0)

    # 1. KIỂM TRA RE-ENTRANCY (Nếu coroutine hiện tại đã giữ slot, cho phép đi qua ngay)
    current_holder = _PLAYWRIGHT_SLOT_HOLDER.get()
    if current_holder is not None:
        logger.info(f"🔁 [RE-ENTRANT SLOT] '{task_name}' kế thừa slot Playwright từ '{current_holder}'")
        yield
        return

    logger.info(f"⏳ {lane_tag} Đang xin slot thực thi Playwright cho: '{task_name}'...")
    acquired = False
    token = None

    try:
        try:
            await asyncio.wait_for(GLOBAL_PLAYWRIGHT_SEMAPHORE.acquire(), timeout=actual_timeout)
            acquired = True
            token = _PLAYWRIGHT_SLOT_HOLDER.set(task_name)
            logger.info(f"🟢 {lane_tag} Đã nhận slot! Bắt đầu thực thi: '{task_name}'")
        except asyncio.TimeoutError:
            if is_admin:
                logger.error(f"❌ {lane_tag} Quá thời gian chờ slot ({actual_timeout}s) cho: '{task_name}'")
                raise TimeoutError(f"Hệ thống đang bận xử lý tác vụ khác. Hết thời gian chờ ({actual_timeout}s).")
            else:
                logger.warning(f"⚠️ {lane_tag} Slot đang bận quá {actual_timeout}s. Nhường slot cho '{task_name}' để bảo toàn RAM Render.")
                raise CronSlotYieldException(f"Cron task '{task_name}' nhường slot do hệ thống đang bận.")

        yield

    finally:
        if acquired:
            if token is not None:
                _PLAYWRIGHT_SLOT_HOLDER.reset(token)
            GLOBAL_PLAYWRIGHT_SEMAPHORE.release()
            logger.info(f"⚪ {lane_tag} Đã giải phóng slot thực thi của: '{task_name}'")
            
            # Thu hồi triệt để Native RAM và tiêu diệt Zombie Chromium còn sót lại
            try:
                force_kill_zombie_chromium()
            except Exception:
                pass
            gc.collect()


# =============================================================================
# 🚀 BỘ CỜ CHROMIUM TỐI ƯU HÓA BỘ NHỚ RAM TUYỆT ĐỐI CHO LINUX CONTAINER
# =============================================================================
LOW_RAM_CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--mute-audio",
    "--no-first-run",
    "--no-zygote",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
    "--disable-ipc-flooding-protection",
    "--js-flags=--max-old-space-size=128",  # Khóa trần V8 Heap ở mức 128MB
]


# =============================================================================
# 🛡️ NETWORK ROUTE INTERCEPTOR (CHẶN MEDIA, FONT, TRACKERS ĐỂ TIẾT KIỆM RAM)
# =============================================================================
BLOCKED_RESOURCE_TYPES = {"image", "media", "font"}

BLOCKED_URL_PATTERNS = [
    r"google-analytics\.com",
    r"googletagmanager\.com",
    r"facebook\.net",
    r"connect\.facebook\.net",
    r"hotjar\.com",
    r"clarity\.ms",
    r"stats\.wp\.com",
    r"doubleclick\.net",
    r"\.woff2?($|\?)",
    r"\.ttf($|\?)",
    r"\.eot($|\?)",
    r"\.otf($|\?)",
    r"\.png($|\?)",
    r"\.jpe?g($|\?)",
    r"\.gif($|\?)",
    r"\.webp($|\?)",
    r"\.mp4($|\?)",
    r"\.mp3($|\?)",
    r"\.webm($|\?)",
    r"\.avi($|\?)",
    r"favicon\.ico",
]

_BLOCKED_REGEX = re.compile("|".join(BLOCKED_URL_PATTERNS), re.IGNORECASE)


async def handle_low_ram_route_abort(route: Route):
    """Xử lý chặn tài nguyên nặng / tracking ngầm."""
    try:
        req = route.request
        res_type = req.resource_type
        url = req.url

        if res_type in BLOCKED_RESOURCE_TYPES or _BLOCKED_REGEX.search(url):
            await route.abort()
        else:
            await route.continue_()
    except Exception:
        pass


async def setup_low_ram_routes(target: Page | BrowserContext):
    """Gắn bộ lọc chặn tài nguyên vào Page hoặc BrowserContext."""
    try:
        await target.route("**/*", handle_low_ram_route_abort)
    except Exception as e:
        logger.debug(f"Không thể gắn route interceptor: {e}")


# =============================================================================
# ⏱️ SMART DOM & API STABILIZATION HELPERS
# =============================================================================
async def wait_for_dom_and_spinners(
    page: Page, 
    target_selector: Optional[str] = None, 
    min_pacing_ms: int = 400, 
    timeout: int = 25000
):
    """Chờ DOM ổn định và các spinner biến mất."""
    try:
        spinner_loc = page.locator(
            ".MuiCircularProgress-root, .MuiSkeleton-root, .MuiDataGrid-loadingOverlay, "
            ".loading-icon, i.fa-spin, i.fa-circle-notch, .spinner-border"
        )
        spinner_count = await spinner_loc.count()
        if spinner_count > 0 and await spinner_loc.first.is_visible():
            try:
                await spinner_loc.first.wait_for(state="hidden", timeout=8000)
            except Exception:
                pass

        if target_selector:
            await page.wait_for_selector(target_selector, state="visible", timeout=timeout)

        if min_pacing_ms > 0:
            await page.wait_for_timeout(min_pacing_ms)
    except Exception as e:
        logger.debug(f"wait_for_dom_and_spinners notice: {e}")


async def smart_wait_login_or_error(
    page: Page,
    timeout: float = 20000,
    role_title: str = "Tài khoản",
    username: str = ""
) -> tuple[bool, str]:
    """Chờ phản hồi đăng nhập thông minh theo State Race."""
    start_time = time.time()
    err_loc = page.locator(".alert-error, #input-error, span.kc-feedback-text, .alert.alert-warning, p.instruction")
    auth_loc = page.locator(".MuiDrawer-root, [data-testid='user-menu'], .usermenu, .userinitials, a[href*='logout'], button:has-text('Logout'), button:has-text('Đăng xuất')")

    while (time.time() - start_time) * 1000 < timeout:
        if await err_loc.count() > 0 and await err_loc.first.is_visible():
            err_text = (await err_loc.first.inner_text()).strip()
            err = f"❌ [{role_title} - '{username}'] Đăng nhập thất bại: '{err_text}'"
            logger.error(err)
            return False, err

        curr_url = page.url.lower()
        if "login" not in curr_url and "authenticate" not in curr_url and "realms" not in curr_url:
            logger.info(f"✅ [{role_title} - '{username}'] Đăng nhập thành công! URL đích: {page.url}")
            return True, ""

        if await auth_loc.count() > 0 and await auth_loc.first.is_visible():
            logger.info(f"✅ [{role_title} - '{username}'] Đăng nhập thành công (Authenticated element confirmed)!")
            return True, ""

        await asyncio.sleep(0.3)

    err = f"⚠️ [{role_title} - '{username}'] Hết thời gian chờ phản hồi đăng nhập ({timeout/1000}s). URL hiện tại: {page.url}"
    logger.error(err)
    return False, err


async def smart_wait_for_options_loaded(
    page: Page,
    parent_locator = None,
    min_options: int = 1,
    timeout: float = 10000
) -> bool:
    """Chờ danh sách options dropdown nạp xong từ API."""
    start_time = time.time()
    options_loc = page.locator("li[role='option'], ul[role='listbox'] li")
    spinner_loc = page.locator(".MuiCircularProgress-root, .MuiSkeleton-root")

    while (time.time() - start_time) * 1000 < timeout:
        if await spinner_loc.count() > 0 and await spinner_loc.first.is_visible():
            await asyncio.sleep(0.2)
            continue

        count = await options_loc.count()
        if count >= min_options:
            return True

        await asyncio.sleep(0.2)

    return False


async def smart_poll_condition(
    check_fn,
    timeout: float = 15000,
    poll_interval: float = 1.0
) -> Any:
    """Polling kiểm tra trạng thái linh hoạt theo hàm check_fn bất đồng bộ."""
    start_time = time.time()
    while (time.time() - start_time) * 1000 < timeout:
        res = await check_fn()
        if res:
            return res
        await asyncio.sleep(poll_interval)
    return None