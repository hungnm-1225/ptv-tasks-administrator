# backend/app/core/playwright_manager.py
import os
import re
import gc
import time
import logging
import asyncio
import heapq
import subprocess
import contextvars
from typing import Optional, Any, List, Tuple
from contextlib import asynccontextmanager
from playwright.async_api import Route, Page, BrowserContext

logger = logging.getLogger(__name__)

# =============================================================================
# 🚦 PRIORITY-AWARE ASYNC LOCK (CHỐNG HEAD-OF-LINE BLOCKING CHO RENDER 512MB)
# =============================================================================
PRIORITY_VIP_ADMIN = 0       # Thao tác trực tiếp của Admin từ giao diện Web
PRIORITY_WORKFLOW = 1        # Luồng thực thi DAG Kahn tự động
PRIORITY_BACKGROUND = 2      # Cronjobs ngầm, Session Seeder, Cache Scanner

class AsyncPriorityLock:
    """
    Lock bất đồng bộ có phân cấp ưu tiên bằng Priority Queue (Min-Heap).
    - Cam kết: Chỉ duy nhất 1 tác vụ giữ lock tại một thời điểm (Bảo vệ 512MB RAM).
    - VIP Admin luôn được nhảy cóc lên đầu hàng đợi, không bao giờ bị nghẽn sau Cronjob.
    """
    def __init__(self):
        self._locked = False
        self._waiters: List[Tuple[int, float, int, asyncio.Future]] = []
        self._counter = 0

    @property
    def is_locked(self) -> bool:
        return self._locked

    @property
    def has_vip_waiting(self) -> bool:
        """Kiểm tra xem có yêu cầu VIP nào đang xếp hàng đợi hay không."""
        return any(w[0] == PRIORITY_VIP_ADMIN for w in self._waiters if not w[3].cancelled())

    async def acquire(self, priority: int = PRIORITY_BACKGROUND) -> bool:
        if not self._locked:
            self._locked = True
            return True

        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self._counter += 1
        # Lưu trữ: (Độ ưu tiên [0 nhỏ nhất = ưu tiên cao nhất], thời điểm tạo, counter chống so sánh future, future)
        entry = (priority, time.time(), self._counter, fut)
        heapq.heappush(self._waiters, entry)

        try:
            await fut
            return True
        except asyncio.CancelledError:
            # Thu hồi sạch nếu task bị cancel hoặc timeout
            self._waiters = [w for w in self._waiters if w[3] is not fut]
            heapq.heapify(self._waiters)
            raise

    def release(self):
        if not self._locked:
            raise RuntimeError("Cố gắng giải phóng một Lock chưa từng được acquire!")

        # Đánh thức waiter có độ ưu tiên cao nhất còn sống
        while self._waiters:
            priority, _, _, fut = heapq.heappop(self._waiters)
            if not fut.cancelled():
                fut.set_result(True)
                return

        self._locked = False


# Khởi tạo Global Priority Lock độc quyền cho toàn hệ thống
GLOBAL_PLAYWRIGHT_LOCK = AsyncPriorityLock()

class CronSlotYieldException(Exception):
    """Exception nội bộ báo hiệu Cron chủ động nhường slot an toàn."""
    pass


def force_kill_zombie_chromium():
    """
    Tiêu diệt mọi tiến trình Chromium mồ côi (Zombie) còn sót lại trong container Render
    để thu hồi bộ nhớ RAM ngay lập tức.
    """
    try:
        subprocess.run(["pkill", "-9", "-f", "chromium"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["pkill", "-9", "-f", "chrome"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


_PLAYWRIGHT_SLOT_HOLDER: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "_playwright_slot_holder", default=None
)


@asynccontextmanager
async def acquire_playwright_slot(
    task_name: str = "Playwright Task", 
    timeout: float = 18.0,
    lane: str = "admin"  # 'admin' (VIP) hoặc 'cron' (Nền)
):
    """
    Async Context Manager quản lý cấp phát slot thực thi Playwright:
    - lane='admin': Gán PRIORITY_VIP_ADMIN (0), nhảy cóc lên đầu hàng đợi. Timeout mặc định 18s (an toàn dưới 30s của Frontend).
    - lane='cron': Gán PRIORITY_BACKGROUND (2), nhường slot êm dịu nếu hết 45s mà không có slot.
    - An toàn Re-entrancy tuyệt đối qua ContextVar.
    - DỌN DẸP NGUYÊN TỬ: Diệt zombie và thu hồi RAM XONG MỚI release lock, triệt tiêu race condition.
    """
    is_admin = (lane.lower() == "admin")
    priority = PRIORITY_VIP_ADMIN if is_admin else PRIORITY_BACKGROUND
    lane_tag = "👑 [VIP ADMIN LANE]" if is_admin else "⚙️ [BACKGROUND CRON LANE]"
    
    # Timeout an toàn: Admin chờ tối đa 18s (dưới ngưỡng 30s của UI), Cron chờ tối đa 45s
    actual_timeout = min(timeout, 20.0) if is_admin else min(timeout, 45.0)

    # 1. KIỂM TRA RE-ENTRANCY (Nếu coroutine hiện tại đã giữ slot, cho phép đi qua ngay)
    current_holder = _PLAYWRIGHT_SLOT_HOLDER.get()
    if current_holder is not None:
        logger.info(f"🔁 [RE-ENTRANT SLOT] '{task_name}' kế thừa slot Playwright từ '{current_holder}'")
        yield
        return

    logger.info(f"⏳ {lane_tag} Đang xin slot (Priority={priority}) cho: '{task_name}'...")
    acquired = False
    token = None

    try:
        try:
            await asyncio.wait_for(GLOBAL_PLAYWRIGHT_LOCK.acquire(priority=priority), timeout=actual_timeout)
            acquired = True
            token = _PLAYWRIGHT_SLOT_HOLDER.set(task_name)
            logger.info(f"🟢 {lane_tag} Đã nhận slot! Bắt đầu thực thi: '{task_name}'")
        except asyncio.TimeoutError:
            if is_admin:
                logger.error(f"❌ {lane_tag} Quá thời gian chờ slot ({actual_timeout}s) cho: '{task_name}'")
                raise TimeoutError(f"Máy chủ đang bận xử lý phiên làm việc khác. Vui lòng thử lại sau vài giây ({actual_timeout}s).")
            else:
                logger.warning(f"⚠️ {lane_tag} Slot đang bận quá {actual_timeout}s. Nhường slot cho '{task_name}' để bảo toàn RAM Render.")
                raise CronSlotYieldException(f"Cron task '{task_name}' nhường slot do hệ thống đang bận.")

        yield

    finally:
        if acquired:
            if token is not None:
                _PLAYWRIGHT_SLOT_HOLDER.reset(token)

            # 🛡️ BẢO VỆ NGUYÊN TỬ: Tiêu diệt Zombie Chromium và thu hồi RAM TRƯỚC KHI thả Lock!
            try:
                force_kill_zombie_chromium()
            except Exception:
                pass
            gc.collect()

            # Thả Lock sau cùng để task tiếp theo an tâm khởi động Chromium mới
            GLOBAL_PLAYWRIGHT_LOCK.release()
            logger.info(f"⚪ {lane_tag} Đã dọn dẹp và giải phóng slot thực thi của: '{task_name}'")


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
    start_time = time.time()
    while (time.time() - start_time) * 1000 < timeout:
        res = await check_fn()
        if res:
            return res
        await asyncio.sleep(poll_interval)
    return None

_HEAVY_OPERATION_LOCK = asyncio.Lock()
_IS_HEAVY_OPERATION_RUNNING: bool = False
_HEAVY_OPERATION_NAME: str = ""

def is_heavy_operation_running() -> tuple[bool, str]:
    return _IS_HEAVY_OPERATION_RUNNING, _HEAVY_OPERATION_NAME

class heavy_operation_guard:
    def __init__(self, operation_name: str):
        self.operation_name = operation_name

    async def __aenter__(self):
        global _IS_HEAVY_OPERATION_RUNNING, _HEAVY_OPERATION_NAME
        async with _HEAVY_OPERATION_LOCK:
            _IS_HEAVY_OPERATION_RUNNING = True
            _HEAVY_OPERATION_NAME = self.operation_name
            logger.info(f"🚨 [CIRCUIT BREAKER] BẬT CỜ ƯU TIÊN: '{self.operation_name}'. Toàn bộ Cronjob ngầm sẽ tạm hoãn!")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        global _IS_HEAVY_OPERATION_RUNNING, _HEAVY_OPERATION_NAME
        async with _HEAVY_OPERATION_LOCK:
            _IS_HEAVY_OPERATION_RUNNING = False
            _HEAVY_OPERATION_NAME = ""
            logger.info(f"🟢 [CIRCUIT BREAKER] HẠ CỜ ƯU TIÊN: '{self.operation_name}'. Hệ thống trở lại trạng thái bình thường.")