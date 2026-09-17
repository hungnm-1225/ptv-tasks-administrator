# backend/app/services/site_monitor_service.py
import os
import time
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import pytz
import httpx
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)
VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

def now_vn() -> datetime:
    return datetime.now(VN_TZ)

def format_vn(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S %d/%m/%Y")

def now_vn_str() -> str:
    return format_vn(now_vn())

# ---------------------------------------------------------------------------
# SUPABASE & FERNET INITIALIZER
# ---------------------------------------------------------------------------
_supabase_client = None

def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        try:
            from supabase import create_client
            url = os.getenv("SUPABASE_URL", "")
            key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")
            if url and key:
                _supabase_client = create_client(url, key)
        except Exception as e:
            logger.warning(f"Không thể khởi tạo Supabase client: {e}")
    return _supabase_client

def get_fernet_cipher() -> Optional[Fernet]:
    vault_key = os.getenv("VAULT_SECRET_KEY", "")
    if not vault_key:
        return None
    try:
        return Fernet(vault_key.encode() if isinstance(vault_key, str) else vault_key)
    except Exception as e:
        logger.error(f"Lỗi khởi tạo Fernet cipher: {e}")
        return None

def decrypt_secret(encrypted_text: str) -> str:
    cipher = get_fernet_cipher()
    if not cipher or not encrypted_text:
        return ""
    try:
        return cipher.decrypt(encrypted_text.encode()).decode("utf-8")
    except Exception as e:
        logger.error(f"Lỗi giải mã Fernet: {e}")
        return ""

# ---------------------------------------------------------------------------
# CẤU HÌNH CÁC WEBSITE THEO DÕI (10 SITES CHUẨN)
# ---------------------------------------------------------------------------
DEFAULT_MONITORED_SITES = [
    {"id": "pythaverse_main",  "name": "Pythaverse Main Portal",    "url": "https://pythaverse.space",              "category": "core",      "enabled": True},
    {"id": "ide",              "name": "Pythaverse IDE",            "url": "https://ide.pythaverse.space/#/",       "category": "satellite", "enabled": True},
    {"id": "avatar",           "name": "Avatar 3D Generator",       "url": "https://avatar.pythaverse.space/",       "category": "satellite", "enabled": True},
    {"id": "note",             "name": "Jupyter Hub Note",          "url": "https://note.pythaverse.space/",        "category": "satellite", "enabled": True},
    {"id": "git",              "name": "Pythaverse Git Repos",      "url": "https://git.pythaverse.space/",         "category": "satellite", "enabled": True},
    {"id": "contest",          "name": "Contest & Competitions",    "url": "https://contest.pythaverse.space/events","category": "satellite", "enabled": True},
    {"id": "digitaltwin",      "name": "Digital Twin Simulation",   "url": "https://digitaltwin.pythaverse.space/", "category": "satellite", "enabled": True},
    {"id": "learn",            "name": "LMS Learn Portal",          "url": "https://learn.pythaverse.space/my/",    "category": "satellite", "enabled": True},
    {"id": "learn_s",          "name": "LMS Learn Staging",         "url": "https://learn-s.pythaverse.space/my/",  "category": "satellite", "enabled": True},
    {"id": "iot",              "name": "IoT Pythaverse Hub",        "url": "https://iot.pythaverse.space/",         "category": "satellite", "enabled": True},
]

def _make_initial_state(site: dict) -> dict:
    return {
        **site,
        "last_status":      "UP",
        "http_code":         200,
        "response_time_ms":  0,
        "last_checked_at":   None,
        "details":          "Đang chờ kiểm tra định kỳ",
        "uptime_pct_24h":   100.0,
        "uptime_pct_30d":   100.0,
        "total_incidents":   0,
        "is_down_since":    None,
    }

_sites_cache: list[dict] = [_make_initial_state(s) for s in DEFAULT_MONITORED_SITES]

# ===========================================================================
# [CẬP NHẬT THÊM / PATCH 1] LƯU TRỮ METRIC PING THỰC TẾ (ZERO MOCKUP)
# ===========================================================================
_site_latency_buffer: Dict[str, List[Dict[str, Any]]] = {}

def record_ping_metric(site_id: str, latency_ms: int, http_code: int, status: str):
    """Chỉ lưu latency_ms dương đối với các lần ping thành công, ghi đệm RAM và Supabase."""
    now_dt = now_vn()
    clean_latency = latency_ms if status == "UP" and 0 < latency_ms < 15000 else 0

    metric_entry = {
        "site_id": site_id,
        "latency_ms": clean_latency,
        "http_code": http_code,
        "status": status,
        "checked_at": now_dt.isoformat(),
        "hour_key": now_dt.strftime("%Y-%m-%d %H"),
    }
    
    # 1. Lưu vào Ring Buffer RAM (tối đa 500 bản ghi/site phục vụ đọc tức thì 1ms)
    if site_id not in _site_latency_buffer:
        _site_latency_buffer[site_id] = []
    _site_latency_buffer[site_id].append(metric_entry)
    if len(_site_latency_buffer[site_id]) > 500:
        _site_latency_buffer[site_id].pop(0)

    # 2. Ghi trực tiếp vào Supabase table site_ping_metrics
    db = get_supabase()
    if db:
        try:
            db.table("site_ping_metrics").insert({
                "site_id": site_id,
                "latency_ms": clean_latency,
                "http_code": http_code,
                "status": status,
                "checked_at": now_dt.isoformat()
            }).execute()
        except Exception as e:
            # Ghi nhận log cảnh báo nếu có lỗi RLS hoặc lỗi schema
            logger.warning(f"⚠️ [PingMetric] Không thể ghi nhận vào Supabase: {e}")


def record_downtime_event(site_id: str, site_name: str, http_code: int, error_msg: str):
    """Mở sự cố gián đoạn trên Supabase khi phát hiện site sập."""
    db = get_supabase()
    if not db:
        return
    try:
        # Kiểm tra xem có sự cố đang diễn ra hay không
        resp = db.table("site_downtime_events").select("id").eq("site_id", site_id).eq("is_ongoing", True).limit(1).execute()
        if not resp.data:
            db.table("site_downtime_events").insert({
                "site_id": site_id,
                "site_name": site_name,
                "started_at": now_vn().isoformat(),
                "http_code": http_code,
                "error_msg": error_msg,
                "is_ongoing": True,
            }).execute()
            logger.warning(f"🚨 Đã ghi nhận sự cố mới cho site {site_name} (Code: {http_code})")
    except Exception as e:
        logger.error(f"Lỗi ghi nhận sự cố vào DB: {e}")

def resolve_downtime_event(site_id: str):
    """Đóng sự cố gián đoạn trên Supabase khi site đã hoạt động trở lại."""
    db = get_supabase()
    if not db:
        return
    try:
        resp = db.table("site_downtime_events").select("id, started_at").eq("site_id", site_id).eq("is_ongoing", True).execute()
        for event in resp.data or []:
            started = datetime.fromisoformat(event["started_at"]).astimezone(VN_TZ)
            duration_s = int((now_vn() - started).total_seconds())
            db.table("site_downtime_events").update({
                "ended_at": now_vn().isoformat(),
                "duration_s": duration_s,
                "is_ongoing": False
            }).eq("id", event["id"]).execute()
            logger.info(f"✅ Đã khôi phục sự cố cho site {site_id} (Downtime: {duration_s}s)")
    except Exception as e:
        logger.error(f"Lỗi đóng sự cố trên DB: {e}")

# ---------------------------------------------------------------------------
# LỊCH SỬ UPTIME & INCIDENT LOGS
# ---------------------------------------------------------------------------
def get_hourly_uptime_history(site_id: str, hours: int = 24) -> list[dict]:
    """
    Trả về 24 blocks (mỗi block là 1 giờ) mang số Ping thật và đối soát Downtime thật.
    Đã sửa triệt để lỗi hiển thị 'Chưa có mẫu đo' và đường biểu đồ phẳng lì giả tạo!
    """
    result = []
    now = now_vn()
    db = get_supabase()
    since_dt = now - timedelta(hours=hours)
    since_iso = since_dt.isoformat()

    # 1. Khởi tạo danh sách 24 khung giờ
    hour_map: Dict[str, dict] = {}
    for i in range(hours - 1, -1, -1):
        target_time = now - timedelta(hours=i)
        hour_key = target_time.strftime("%Y-%m-%d %H")
        entry = {
            "hour": target_time.strftime("%H:00"),
            "full_time": hour_key,
            "status": "UP",
            "latency_ms": None,
            "http_code": 200,
            "incident_duration": None,
            "has_data": False
        }
        hour_map[hour_key] = entry
        result.append(entry)

    metrics_by_hour: Dict[str, List[int]] = {}

    # 2. Đọc từ RAM buffer trước (cực nhanh và luôn có dữ liệu mới nhất)
    for m in _site_latency_buffer.get(site_id, []):
        hk = m.get("hour_key")
        if hk in hour_map and m.get("latency_ms", 0) > 0:
            metrics_by_hour.setdefault(hk, []).append(m["latency_ms"])

    # 3. Đọc dữ liệu lịch sử từ Supabase
    if db:
        try:
            resp = db.table("site_ping_metrics").select("latency_ms, checked_at, http_code")\
                .eq("site_id", site_id).gte("checked_at", since_iso).execute()
            for row in resp.data or []:
                row_dt = datetime.fromisoformat(row["checked_at"]).astimezone(VN_TZ)
                hk = row_dt.strftime("%Y-%m-%d %H")
                if hk in hour_map and row.get("latency_ms", 0) > 0:
                    metrics_by_hour.setdefault(hk, []).append(row["latency_ms"])
        except Exception as e:
            logger.warning(f"Lỗi đọc Supabase site_ping_metrics cho {site_id}: {e}")

    # 4. Tính toán độ trễ trung bình cho các giờ CÓ MẪU ĐO THẬT
    for hk, lat_list in metrics_by_hour.items():
        valid_pings = [l for l in lat_list if 0 < l < 15000]
        if valid_pings and hk in hour_map:
            avg_lat = int(sum(valid_pings) / len(valid_pings))
            hour_map[hk]["latency_ms"] = avg_lat
            hour_map[hk]["has_data"] = True

    # 5. Đối soát bảng sự cố Downtime Events (Đoạn nào sập đánh dấu DOWN chuẩn xác)
    if db:
        try:
            resp = db.table("site_downtime_events").select("started_at, ended_at, duration_s, is_ongoing, http_code, error_msg")\
                .eq("site_id", site_id).gte("started_at", since_iso).execute()
            for event in resp.data or []:
                event_start = datetime.fromisoformat(event["started_at"]).astimezone(VN_TZ)
                event_end = datetime.fromisoformat(event["ended_at"]).astimezone(VN_TZ) if event.get("ended_at") else now
                
                start_str = event_start.strftime("%Hh%M")
                end_str = event_end.strftime("%Hh%M") if event.get("ended_at") else "nay"
                dur_str = f"{start_str} - {end_str}"

                for entry in result:
                    entry_dt = datetime.strptime(entry["full_time"], "%Y-%m-%d %H").replace(tzinfo=VN_TZ)
                    if entry_dt <= event_end and (entry_dt + timedelta(hours=1)) >= event_start:
                        entry["status"] = "DOWN"
                        entry["latency_ms"] = 0
                        entry["http_code"] = event.get("http_code") or 500
                        entry["incident_duration"] = dur_str
                        entry["has_data"] = True
        except Exception as e:
            logger.error(f"Lỗi đối soát downtime events: {e}")

    # 6. ĐẢM BẢO KHUNG GIỜ HIỆN TẠI LUÔN CÓ MẪU ĐO TỪ CACHE
    current_hk = now.strftime("%Y-%m-%d %H")
    site_obj = next((s for s in _sites_cache if s["id"] == site_id), None)
    if site_obj and current_hk in hour_map:
        # Nhưng nếu cron vừa ping nhát đầu tiên mà chưa kịp vào DB, lấy ngay giá trị mới nhất làm gốc:
        if not hour_map[current_hk]["has_data"] and site_obj.get("response_time_ms", 0) > 0:
            hour_map[current_hk]["latency_ms"] = site_obj["response_time_ms"]
            hour_map[current_hk]["status"] = site_obj.get("last_status", "UP")
            hour_map[current_hk]["has_data"] = True

    return result


def get_incident_log(limit: int = 20) -> list[dict]:
    db = get_supabase()
    if not db:
        return []
    try:
        resp = db.table("site_downtime_events").select("*").order("started_at", desc=True).limit(limit).execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Lỗi lấy incident log: {e}")
        return []

# ---------------------------------------------------------------------------
# CORE MONITOR SERVICE (HTTP PING CHÍNH XÁC - ZERO MOCKUP)
# ---------------------------------------------------------------------------
class SiteMonitorService:

    @staticmethod
    def get_all_sites() -> list:
        return _sites_cache

    @staticmethod
    async def check_single_site(site: dict) -> dict:
        if not site.get("enabled", True):
            site["last_status"] = "PAUSED"
            site["details"] = "Đã tạm dừng theo cấu hình"
            return site

        url = site["url"]
        site_id = site["id"]
        site_name = site["name"]
        start = time.time()

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PtvMonitor/3.2"
        }

        try:
            # Dùng HEAD request để đo đúng network ping, không tốn băng thông tải HTML
            async with httpx.AsyncClient(verify=False, timeout=8.0, follow_redirects=True, headers=headers) as client:
                try:
                    response = await client.head(url)
                    if response.status_code in (405, 501): # Nếu site chặn HEAD thì fallback sang GET
                        response = await client.get(url)
                except Exception:
                    response = await client.get(url)

                latency = int((time.time() - start) * 1000)
                site["response_time_ms"] = latency
                site["http_code"] = response.status_code
                site["last_checked_at"] = now_vn_str()

                if response.status_code in (200, 201, 301, 302, 307, 308):
                    site["last_status"] = "UP"
                    site["details"] = "Phản hồi ổn định"
                    resolve_downtime_event(site_id)
                elif response.status_code in (401, 403):
                    site["last_status"] = "UP"
                    site["details"] = f"Yêu cầu xác thực SSO (HTTP {response.status_code})"
                    resolve_downtime_event(site_id)
                elif response.status_code >= 500:
                    site["last_status"] = "DOWN"
                    site["details"] = f"Lỗi máy chủ (HTTP {response.status_code})"
                    record_downtime_event(site_id, site_name, response.status_code, site["details"])
                else:
                    site["last_status"] = "WARNING"
                    site["details"] = f"Mã HTTP bất thường: {response.status_code}"

                # Ghi nhận metric: nếu status UP thì ghi latency thật, DOWN thì ghi 0
                record_ping_metric(site_id, latency if site["last_status"] == "UP" else 0, response.status_code, site["last_status"])

        except httpx.ConnectError:
            site["http_code"] = 0
            site["response_time_ms"] = 0
            site["last_checked_at"] = now_vn_str()
            site["last_status"] = "DOWN"
            site["details"] = "Từ chối kết nối (Connection Refused)"
            record_downtime_event(site_id, site_name, 0, site["details"])
            record_ping_metric(site_id, 0, 0, "DOWN")

        except httpx.TimeoutException:
            site["http_code"] = 0
            site["response_time_ms"] = 0
            site["last_checked_at"] = now_vn_str()
            site["last_status"] = "DOWN"
            site["details"] = "Kết nối quá hạn (Timeout > 8s)"
            record_downtime_event(site_id, site_name, 0, site["details"])
            record_ping_metric(site_id, 0, 0, "DOWN")

        except Exception as e:
            site["http_code"] = 0
            site["response_time_ms"] = 0
            site["last_checked_at"] = now_vn_str()
            site["last_status"] = "DOWN"
            site["details"] = f"Lỗi mạng: {str(e)[:60]}"
            record_downtime_event(site_id, site_name, 0, site["details"])
            record_ping_metric(site_id, 0, 0, "DOWN")

        return site

    @classmethod
    async def check_all_sites(cls) -> list:
        tasks = [cls.check_single_site(site) for site in _sites_cache]
        return await asyncio.gather(*tasks)

    # ================= CI/CD DEPLOY MONITOR (VERCEL & RENDER) =================
    @classmethod
    async def _get_deploy_config(cls, provider: str) -> tuple[str, str]:
        if provider == "vercel":
            token = os.getenv("VERCEL_ACCESS_TOKEN", "")
            prj_id = os.getenv("VERCEL_PROJECT_ID", "")
            if token and prj_id:
                return token, prj_id
        elif provider == "render":
            api_key = os.getenv("RENDER_API_KEY", "")
            srv_id = os.getenv("RENDER_SERVICE_ID", "")
            if api_key and srv_id:
                return api_key, srv_id

        db = get_supabase()
        if db:
            try:
                resp = db.table("site_deploy_configs").select("target_id, encrypted_api_token").eq("provider", provider).eq("is_active", True).execute()
                if resp.data:
                    return decrypt_secret(resp.data[0].get("encrypted_api_token", "")), resp.data[0].get("target_id", "")
            except Exception:
                pass
        return "", ""

    @classmethod
    async def get_vercel_deployments(cls, limit: int = 10) -> List[Dict[str, Any]]:
        token, project_id = await cls._get_deploy_config("vercel")
        if not token:
            return []
        url = f"https://api.vercel.com/v6/deployments?limit={limit}" + (f"&projectId={project_id}" if project_id else "")
        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    deployments = resp.json().get("deployments", [])
                    return [{
                        "id": d.get("uid"),
                        "name": d.get("name", "Frontend SPA"),
                        "url": d.get("url"),
                        "state": d.get("state") or d.get("readyState", "READY"),
                        "created_at": d.get("created"),
                        "commit_msg": d.get("meta", {}).get("githubCommitMessage", "Deploy commit"),
                        "commit_author": d.get("meta", {}).get("githubCommitAuthorName", "Developer"),
                        "provider": "vercel"
                    } for d in deployments]
        except Exception as e:
            logger.error(f"Lỗi lấy Vercel deploys: {e}")
        return []

    @classmethod
    async def get_render_deployments(cls, limit: int = 10) -> List[Dict[str, Any]]:
        api_key, service_id = await cls._get_deploy_config("render")
        if not api_key or not service_id:
            return []
        url = f"https://api.render.com/v1/services/{service_id}/deploys?limit={limit}"
        headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    deploys = resp.json()
                    return [{
                        "id": d.get("deploy", {}).get("id") or d.get("id"),
                        "name": "Backend FastAPI Docker",
                        "status": d.get("deploy", {}).get("status") or d.get("status", "live"),
                        "created_at": d.get("deploy", {}).get("createdAt") or d.get("createdAt"),
                        "commit_msg": d.get("deploy", {}).get("commit", {}).get("message") or "Deploy commit",
                        "commit_author": "Deploy Bot",
                        "provider": "render"
                    } for d in deploys]
        except Exception as e:
            logger.error(f"Lỗi lấy Render deploys: {e}")
        return []

    @classmethod
    async def get_render_logs(cls, deploy_id: str) -> str:
        api_key, service_id = await cls._get_deploy_config("render")
        if not api_key or not service_id:
            return "Chưa cấu hình RENDER_API_KEY hoặc RENDER_SERVICE_ID"
        url = f"https://api.render.com/v1/services/{service_id}/deploys/{deploy_id}/logs"
        headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    logs_data = resp.json()
                    if isinstance(logs_data, list):
                        return "\n".join([f"[{l.get('timestamp', '')}] {l.get('message', '')}" for l in logs_data])
                    return str(logs_data)
                return f"Lỗi tải Render logs: HTTP {resp.status_code}"
        except Exception as e:
            return f"Lỗi ngoại lệ: {e}"

    @classmethod
    async def get_vercel_logs(cls, deployment_id: str) -> str:
        token, _ = await cls._get_deploy_config("vercel")
        if not token:
            return "Chưa cấu hình VERCEL_ACCESS_TOKEN"
        url = f"https://api.vercel.com/v2/deployments/{deployment_id}/events"
        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    events = resp.json()
                    lines = [e.get("text", "") for e in events if "text" in e]
                    return "\n".join(lines) if lines else "Không có event log."
                return f"Lỗi tải logs: HTTP {resp.status_code}"
        except Exception as e:
            return f"Lỗi: {e}"

    @classmethod
    def get_summary_stats(cls) -> dict:
        enabled = [s for s in _sites_cache if s.get("enabled", True)]
        up_count = sum(1 for s in enabled if s.get("last_status") == "UP")
        down_count = sum(1 for s in enabled if s.get("last_status") == "DOWN")
        warning_count = sum(1 for s in enabled if s.get("last_status") == "WARNING")
        paused_count = sum(1 for s in _sites_cache if not s.get("enabled", True))
        valid_latencies = [s["response_time_ms"] for s in enabled if s.get("response_time_ms", 0) > 0 and s.get("last_status") == "UP"]
        avg_latency = int(sum(valid_latencies) / len(valid_latencies)) if valid_latencies else 0
        return {
            "total_sites": len(_sites_cache),
            "enabled_sites": len(enabled),
            "up_count": up_count,
            "down_count": down_count,
            "warning_count": warning_count,
            "paused_count": paused_count,
            "avg_latency_ms": avg_latency,
            "last_checked_at": now_vn_str(),
        }

# ---------------------------------------------------------------------------
# CRON JOB LẬP LỊCH TỰ ĐỘNG (ĐÃ BỎ TAB 2 RA KHỎI CRON)
# ---------------------------------------------------------------------------
async def poll_site_uptime_cron():
    """Chỉ ping HTTP nhanh 10 trang web, không chạy RPA phân quyền để bảo toàn RAM."""
    await SiteMonitorService.check_all_sites()