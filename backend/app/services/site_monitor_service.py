# backend/app/services/site_monitor_service.py
import os
import json
import time
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional
import pytz
import httpx

logger = logging.getLogger(__name__)

VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

# ---------------------------------------------------------------------------
# SECURE CREDENTIALS LOADER
# Tuyệt đối KHÔNG hardcode mật khẩu thực trong code. Public repo!
# Cấu hình biến môi trường ACCOUNTS_PROD_JSON trong .env hoặc Render.com secrets.
# ---------------------------------------------------------------------------
def load_prod_accounts():
    raw_env = os.getenv("ACCOUNTS_PROD_JSON")
    if raw_env:
        try:
            return json.loads(raw_env)
        except Exception as e:
            logger.error(f"Lỗi parse ACCOUNTS_PROD_JSON: {e}")
    return [
        {"role": "Admin",       "username": os.getenv("TEST_ADMIN_USER", ""),   "password": os.getenv("TEST_ADMIN_PASS", ""),   "expected": "/admin-workspace"},
        {"role": "Distributor", "username": os.getenv("TEST_DIST_USER", ""),    "password": os.getenv("TEST_DIST_PASS", ""),    "expected": "/distributor-workspace"},
        {"role": "Partner",     "username": os.getenv("TEST_PARTNER_USER", ""), "password": os.getenv("TEST_PARTNER_PASS", ""), "expected": "/partner-workspace"},
        {"role": "School",      "username": os.getenv("TEST_SCHOOL_USER", ""),  "password": os.getenv("TEST_SCHOOL_PASS", ""),  "expected": "/school-workspace"},
        {"role": "Teacher",     "username": os.getenv("TEST_TEACHER_USER", ""), "password": os.getenv("TEST_TEACHER_PASS", ""), "expected": "/teacher-workspace"},
        {"role": "Student",     "username": os.getenv("TEST_STUDENT_USER", ""), "password": os.getenv("TEST_STUDENT_PASS", ""), "expected": "/student-workspace"},
    ]

# ---------------------------------------------------------------------------
# SUPABASE CLIENT (lazy init để tránh lỗi khi env chưa có)
# ---------------------------------------------------------------------------
_supabase_client = None

def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        try:
            from supabase import create_client
            url = os.getenv("SUPABASE_URL", "")
            key = os.getenv("SUPABASE_KEY", "")
            if url and key:
                _supabase_client = create_client(url, key)
        except Exception as e:
            logger.warning(f"Không thể khởi tạo Supabase client: {e}")
    return _supabase_client

# ---------------------------------------------------------------------------
# SITE CONFIG: Các website cần giám sát
# ---------------------------------------------------------------------------
DEFAULT_MONITORED_SITES = [
    {"id": "pythaverse_main",  "name": "Pythaverse Main Portal",    "url": "https://pythaverse.space/",                   "category": "core",      "enabled": True,  "show_live_alert": True,  "check_login": True},
    {"id": "ide",              "name": "Pythaverse IDE",            "url": "https://ide.pythaverse.space/#/",              "category": "satellite", "enabled": True,  "show_live_alert": True,  "check_login": False},
    {"id": "avatar",           "name": "Avatar 3D Generator",       "url": "https://avatar.pythaverse.space/",             "category": "satellite", "enabled": True,  "show_live_alert": True,  "check_login": False},
    {"id": "note",             "name": "Jupyter Hub Note",          "url": "https://note.pythaverse.space/",               "category": "satellite", "enabled": True,  "show_live_alert": True,  "check_login": False},
    {"id": "git",              "name": "Pythaverse Git Repos",      "url": "https://git.pythaverse.space/dashboard/repos", "category": "satellite", "enabled": True,  "show_live_alert": True,  "check_login": False},
    {"id": "contest",          "name": "Contest & Competitions",    "url": "https://contest.pythaverse.space/contest",     "category": "satellite", "enabled": True,  "show_live_alert": True,  "check_login": False},
    {"id": "digitaltwin",      "name": "Digital Twin Simulation",   "url": "https://digitaltwin.pythaverse.space/",        "category": "satellite", "enabled": True,  "show_live_alert": True,  "check_login": False},
    {"id": "learn",            "name": "LMS Learn Portal",          "url": "https://learn.pythaverse.space/my/",           "category": "satellite", "enabled": True,  "show_live_alert": True,  "check_login": False},
    {"id": "learn_s",          "name": "LMS Learn Staging",         "url": "https://learn-s.pythaverse.space/my/",         "category": "satellite", "enabled": True,  "show_live_alert": False, "check_login": False},
    {"id": "iot",              "name": "IoT Pythaverse Hub",        "url": "https://iot.pythaverse.space/",                "category": "satellite", "enabled": True,  "show_live_alert": True,  "check_login": False},
]

def _make_initial_state(site: dict) -> dict:
    return {
        **site,
        "last_status":    "UP",
        "http_code":       200,
        "response_time_ms": 0,
        "last_checked_at": None,
        "login_status":   "SKIP",
        "details":        "Chưa kiểm tra lần nào",
        "uptime_pct_24h": 100.0,
        "uptime_pct_7d":  100.0,
        "uptime_pct_30d": 100.0,
        "total_incidents": 0,
        "is_down_since":  None,   # ISO string nếu đang DOWN, None nếu không
    }

# In-memory cache
_sites_cache: list[dict] = [_make_initial_state(s) for s in DEFAULT_MONITORED_SITES]


# ---------------------------------------------------------------------------
# HELPER: Thời gian VN
# ---------------------------------------------------------------------------
def now_vn() -> datetime:
    return datetime.now(VN_TZ)

def format_vn(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S %d/%m/%Y")

def now_vn_str() -> str:
    return format_vn(now_vn())


# ---------------------------------------------------------------------------
# DOWNTIME PERSISTENCE — Supabase
# ---------------------------------------------------------------------------
def _persist_downtime_start(site: dict, http_code: int, error_msg: str):
    """Ghi bắt đầu sự cố DOWN vào Supabase. Chỉ ghi nếu chưa có ongoing."""
    if site.get("is_down_since"):
        return  # Đã đang ghi ongoing rồi, không tạo record mới
    db = get_supabase()
    if not db:
        logger.debug("Supabase không khả dụng — bỏ qua persist downtime start")
        return
    try:
        db.table("site_downtime_events").insert({
            "site_id":    site["id"],
            "site_name":  site["name"],
            "started_at": now_vn().isoformat(),
            "http_code":  http_code,
            "error_msg":  error_msg[:500] if error_msg else None,
            "is_ongoing": True,
        }).execute()
        site["is_down_since"] = now_vn().isoformat()
        logger.warning(f"🚨 Downtime START ghi vào Supabase: {site['name']}")
    except Exception as e:
        logger.error(f"Lỗi ghi downtime start Supabase: {e}")


def _persist_downtime_end(site: dict):
    """Đóng sự cố DOWN — cập nhật ended_at và duration_s."""
    if not site.get("is_down_since"):
        return
    db = get_supabase()
    if not db:
        site["is_down_since"] = None
        return
    try:
        started = datetime.fromisoformat(site["is_down_since"])
        ended = now_vn()
        duration_s = int((ended - started).total_seconds())
        db.table("site_downtime_events").update({
            "ended_at":   ended.isoformat(),
            "duration_s": duration_s,
            "is_ongoing": False,
        }).eq("site_id", site["id"]).eq("is_ongoing", True).execute()
        site["is_down_since"] = None
        logger.info(f"✅ Downtime END ghi vào Supabase: {site['name']} — kéo dài {duration_s}s")
    except Exception as e:
        logger.error(f"Lỗi ghi downtime end Supabase: {e}")
        site["is_down_since"] = None


def get_uptime_history(site_id: str, days: int = 45) -> list[dict]:
    """
    Trả về list các ngày (days ngày gần nhất).
    Mỗi phần tử: { date, status: 'UP'|'DOWN'|'DEGRADED', incidents, downtime_s }
    Dùng để render uptime bars giống UptimeRobot.
    """
    db = get_supabase()
    result = []
    today = now_vn().date()

    # Tạo khung ngày trước
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        result.append({
            "date":        day.isoformat(),
            "status":      "UP",
            "incidents":   0,
            "downtime_s":  0,
        })

    if not db:
        return result

    try:
        since = (today - timedelta(days=days)).isoformat()
        resp = db.table("site_downtime_events")\
            .select("started_at, ended_at, duration_s, is_ongoing")\
            .eq("site_id", site_id)\
            .gte("started_at", since)\
            .execute()

        events = resp.data or []
        for event in events:
            try:
                started = datetime.fromisoformat(event["started_at"])
                day_key = started.astimezone(VN_TZ).date().isoformat()
                for entry in result:
                    if entry["date"] == day_key:
                        entry["incidents"] += 1
                        ds = event.get("duration_s") or 0
                        entry["downtime_s"] += ds
                        # Nếu downtime > 10 phút trong ngày → DEGRADED; nếu chiếm > 30% ngày → DOWN
                        pct = entry["downtime_s"] / 86400
                        if pct > 0.30:
                            entry["status"] = "DOWN"
                        elif entry["downtime_s"] > 600 or entry["incidents"] > 0:
                            entry["status"] = "DEGRADED"
                        break
            except Exception:
                continue
    except Exception as e:
        logger.error(f"Lỗi lấy uptime history từ Supabase: {e}")

    return result


def get_incident_log(limit: int = 50) -> list[dict]:
    """Lấy danh sách các sự cố gần nhất từ Supabase (toàn bộ sites)."""
    db = get_supabase()
    if not db:
        return []
    try:
        resp = db.table("site_downtime_events")\
            .select("*")\
            .order("started_at", desc=True)\
            .limit(limit)\
            .execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Lỗi lấy incident log: {e}")
        return []


def compute_uptime_pct(history: list[dict]) -> float:
    """Tính % uptime từ history list."""
    if not history:
        return 100.0
    total_s = len(history) * 86400
    down_s = sum(h.get("downtime_s", 0) for h in history)
    if total_s == 0:
        return 100.0
    return round(max(0.0, (total_s - down_s) / total_s * 100), 3)


# ---------------------------------------------------------------------------
# LOGIN CHECK — Keycloak SSO
# ---------------------------------------------------------------------------
async def check_login_status_keycloak(site_id: str) -> str:
    """
    Kiểm tra SSO login thông qua Keycloak token endpoint.
    Chỉ chạy cho site có check_login=True.
    Trả về: 'PASS' | 'FAIL' | 'SKIP' | 'NO_CREDS'
    """
    keycloak_url = os.getenv("KEYCLOAK_URL", "")
    realm = os.getenv("KEYCLOAK_REALM", "Pythaverse")
    client_id = os.getenv("KEYCLOAK_CLIENT_ID", "pythaverse-main")
    test_user = os.getenv("TEST_ADMIN_USER", "")
    test_pass = os.getenv("TEST_ADMIN_PASS", "")

    if not all([keycloak_url, test_user, test_pass]):
        return "NO_CREDS"

    token_url = f"{keycloak_url}/realms/{realm}/protocol/openid-connect/token"
    payload = {
        "grant_type":  "password",
        "client_id":   client_id,
        "username":    test_user,
        "password":    test_pass,
    }
    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            resp = await client.post(token_url, data=payload)
            if resp.status_code == 200 and "access_token" in resp.json():
                return "PASS"
            else:
                return "FAIL"
    except Exception as e:
        logger.warning(f"Login check lỗi ({site_id}): {e}")
        return "FAIL"


# ---------------------------------------------------------------------------
# CORE: Check single site
# ---------------------------------------------------------------------------
class SiteMonitorService:

    @staticmethod
    def get_all_sites() -> list:
        return _sites_cache

    @staticmethod
    def update_site(site_id: str, updates: dict) -> Optional[dict]:
        for s in _sites_cache:
            if s["id"] == site_id:
                for field in ("enabled", "show_live_alert", "name", "url"):
                    if field in updates and updates[field] is not None:
                        s[field] = updates[field]
                return s
        return None

    @staticmethod
    async def check_single_site(site: dict) -> dict:
        """Kiểm tra 1 site: HTTP + optional login check + downtime tracking."""
        if not site.get("enabled", True):
            site["last_status"] = "PAUSED"
            site["details"] = "Đã tạm dừng kiểm tra theo cấu hình"
            return site

        url = site["url"]
        start = time.time()
        prev_status = site.get("last_status", "UP")

        try:
            async with httpx.AsyncClient(verify=False, timeout=15.0, follow_redirects=True) as client:
                response = await client.get(url)
                latency = int((time.time() - start) * 1000)
                site["response_time_ms"] = latency
                site["http_code"] = response.status_code
                site["last_checked_at"] = now_vn_str()

                if response.status_code in (200, 201, 301, 302, 307, 308):
                    new_status = "UP"
                    site["details"] = f"Phản hồi tốt ({latency}ms) — HTTP {response.status_code}"
                elif response.status_code in (401, 403):
                    new_status = "UP"
                    site["details"] = f"Yêu cầu xác thực SSO ({response.status_code}) — Server hoạt động"
                elif response.status_code >= 500:
                    new_status = "DOWN"
                    site["details"] = f"Server Error: HTTP {response.status_code}"
                else:
                    new_status = "WARNING"
                    site["details"] = f"Mã phản hồi bất thường: {response.status_code}"

        except httpx.TimeoutException:
            latency = 15000
            site["response_time_ms"] = latency
            site["http_code"] = 504
            site["last_checked_at"] = now_vn_str()
            new_status = "DOWN"
            site["details"] = "Quá thời gian phản hồi (Timeout > 15s)"

        except Exception as e:
            site["http_code"] = 0
            site["last_checked_at"] = now_vn_str()
            new_status = "DOWN"
            site["details"] = f"Lỗi kết nối: {str(e)[:80]}"

        # --- Login check (optional, chỉ cho site cần) ---
        if new_status == "UP" and site.get("check_login"):
            login_result = await check_login_status_keycloak(site["id"])
            site["login_status"] = login_result
            if login_result == "FAIL":
                new_status = "WARNING"
                site["details"] += " | ⚠️ SSO Login FAIL"
            elif login_result == "PASS":
                site["details"] += " | ✓ SSO Login OK"
        elif new_status == "UP":
            site["login_status"] = "SKIP"
        else:
            site["login_status"] = "FAILED"

        # --- Downtime tracking: persist state transitions ---
        if new_status == "DOWN" and prev_status != "DOWN":
            _persist_downtime_start(site, site.get("http_code", 0), site.get("details", ""))
        elif new_status in ("UP", "WARNING") and prev_status == "DOWN":
            _persist_downtime_end(site)

        site["last_status"] = new_status
        return site

    @classmethod
    async def check_all_sites(cls) -> list:
        logger.info("🔍 Bắt đầu quét kiểm tra tình trạng Live của tất cả website...")
        tasks = [cls.check_single_site(site) for site in _sites_cache]
        results = await asyncio.gather(*tasks)
        # Cập nhật uptime % từ Supabase history sau khi check xong
        for site in results:
            try:
                h45 = get_uptime_history(site["id"], days=45)
                h7  = h45[-7:]
                h1  = h45[-1:]
                site["uptime_pct_30d"] = compute_uptime_pct(h45[-30:])
                site["uptime_pct_7d"]  = compute_uptime_pct(h7)
                site["uptime_pct_24h"] = compute_uptime_pct(h1)
                site["total_incidents"] = sum(d["incidents"] for d in h45)
            except Exception:
                pass
        logger.info(f"✅ Hoàn tất kiểm tra {len(results)} website.")
        return results

    @classmethod
    def get_summary_stats(cls) -> dict:
        enabled = [s for s in _sites_cache if s.get("enabled", True)]
        up_count      = sum(1 for s in enabled if s.get("last_status") == "UP")
        down_count    = sum(1 for s in enabled if s.get("last_status") == "DOWN")
        warning_count = sum(1 for s in enabled if s.get("last_status") == "WARNING")
        paused_count  = sum(1 for s in _sites_cache if not s.get("enabled", True))
        valid_latencies = [
            s["response_time_ms"] for s in enabled
            if s.get("response_time_ms", 0) > 0 and s.get("last_status") == "UP"
        ]
        avg_latency = int(sum(valid_latencies) / len(valid_latencies)) if valid_latencies else 0
        return {
            "total_sites":    len(_sites_cache),
            "enabled_sites":  len(enabled),
            "up_count":       up_count,
            "down_count":     down_count,
            "warning_count":  warning_count,
            "paused_count":   paused_count,
            "avg_latency_ms": avg_latency,
            "last_checked_at": now_vn_str(),
        }


async def poll_site_uptime_cron():
    """Hàm chạy định kỳ 1h/lần bởi APScheduler trong main.py"""
    await SiteMonitorService.check_all_sites()
