# backend/app/core/playwright_manager.py
import re
import gc
import logging
import asyncio
from typing import Optional
from contextlib import asynccontextmanager
from playwright.async_api import Route, Page, BrowserContext

logger = logging.getLogger(__name__)

# =============================================================================
# 🔒 GLOBAL CONCURRENCY SEMAPHORE (KHÓA 1 PHIÊN DUY NHẤT TRÊN RENDER 512MB RAM)
# =============================================================================
# Đảm bảo tại một thời điểm chỉ có DUY NHẤT 1 phiên Chromium chạy trong toàn bộ hệ thống
PLAYWRIGHT_CONCURRENCY_SEMAPHORE = asyncio.Semaphore(1)


@asynccontextmanager
async def acquire_playwright_slot(task_name: str = "Playwright Task", timeout: float = 300.0):
    """
    Async Context Manager quản lý việc cấp phát slot thực thi Playwright:
    - Nếu có tác vụ khác đang chạy, tác vụ mới sẽ xếp hàng đợi an toàn thay vì
      khởi chạy đồng thời làm tràn trần 512MB RAM trên Render.
    - Tự động gọi gc.collect() khi nhả slot.
    """
    logger.info(f"⏳ [Playwright Concurrency] Đang xin slot thực thi cho: '{task_name}'...")
    try:
        acquired = False
        try:
            await asyncio.wait_for(PLAYWRIGHT_CONCURRENCY_SEMAPHORE.acquire(), timeout=timeout)
            acquired = True
            logger.info(f"🟢 [Playwright Concurrency] Đã nhận slot thực thi cho: '{task_name}'")
            yield
        except asyncio.TimeoutError:
            logger.error(f"❌ [Playwright Concurrency] Quá thời gian chờ slot ({timeout}s) cho: '{task_name}'")
            raise TimeoutError(f"Hệ thống đang bận xử lý tác vụ khác. Hết thời gian chờ slot ({timeout}s).")
    finally:
        if acquired:
            PLAYWRIGHT_CONCURRENCY_SEMAPHORE.release()
            logger.info(f"⚪ [Playwright Concurrency] Đã giải phóng slot thực thi của: '{task_name}'")
        gc.collect()


# =============================================================================
# 🚀 BỘ CỜ CHROMIUM TỐI ƯU HÓA BỘ NHỚ RAM TUYỆT ĐỐI CHO LINUX CONTAINER
# =============================================================================
# Đã loại bỏ --single-process (gây deadlock/crash) và khóa trần V8 Heap ở 128MB
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
# Danh sách các domain và extension không cần thiết cho DOM & API automation
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
        # Nếu route đã bị đóng hoặc hủy kết nối, bỏ qua an toàn
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
    """
    Chờ DOM ổn định và các spinner nạp dữ liệu từ API biến mất:
    - Chờ các loader của MUI / WordPress / Moodle: .MuiCircularProgress-root,
      .MuiSkeleton-root, .MuiDataGrid-loadingOverlay, .loading-icon, i.fa-spin
    - Chờ target_selector (nếu có) xuất hiện
    - Thêm micro-pacing để React/MUI/Vue/jQuery state binding hoàn tất
    """
    try:
        # 1. Chờ các spinner loading biến mất (nếu đang hiển thị)
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

        # 2. Chờ target selector xuất hiện
        if target_selector:
            await page.wait_for_selector(target_selector, state="visible", timeout=timeout)

        # 3. Thêm khoảng nghỉ nhỏ để React Virtual DOM render xong
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
    """
    Chờ phản hồi đăng nhập thông minh theo State Race:
    - Thoát ngay khi URL đổi sang trang chủ/dashboard hoặc xuất hiện menu người dùng.
    - Thoát ngay khi xuất hiện thông báo lỗi của Keycloak/Moodle (.alert-error, #input-error...).
    - Tuyệt đối không dùng hard-coded sleep 2.5s-3s.
    """
    import time
    start_time = time.time()
    err_loc = page.locator(".alert-error, #input-error, span.kc-feedback-text, .alert.alert-warning, p.instruction")
    auth_loc = page.locator(".MuiDrawer-root, [data-testid='user-menu'], .usermenu, .userinitials, a[href*='logout'], button:has-text('Logout'), button:has-text('Đăng xuất')")

    while (time.time() - start_time) * 1000 < timeout:
        # 1. Kiểm tra lỗi trước
        if await err_loc.count() > 0 and await err_loc.first.is_visible():
            err_text = (await err_loc.first.inner_text()).strip()
            err = f"❌ [{role_title} - '{username}'] Đăng nhập thất bại: '{err_text}'"
            logger.error(err)
            return False, err

        # 2. Kiểm tra điều kiện thành công
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
    """
    Chờ danh sách options trong Material-UI Dropdown hoặc Listbox nạp xong từ API:
    - Thay thế hoàn toàn cho wait_for_timeout(1800) sau khi chọn Category.
    - Chờ spinner trong menu ẩn và số lượng li[role='option'] >= min_options.
    """
    import time
    start_time = time.time()
    options_loc = page.locator("li[role='option'], ul[role='listbox'] li")
    spinner_loc = page.locator(".MuiCircularProgress-root, .MuiSkeleton-root")

    while (time.time() - start_time) * 1000 < timeout:
        # Nếu đang có spinner nạp dữ liệu, tiếp tục chờ
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
    """
    Polling kiểm tra trạng thái linh hoạt theo hàm check_fn bất đồng bộ:
    - Trả về kết quả ngay khi check_fn() trả về giá trị True-like.
    - Tránh việc ngủ cứng 12s-15s trên Render.
    """
    import time
    start_time = time.time()
    while (time.time() - start_time) * 1000 < timeout:
        res = await check_fn()
        if res:
            return res
        await asyncio.sleep(poll_interval)
    return None

