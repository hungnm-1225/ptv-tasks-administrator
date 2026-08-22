# backend/app/services/site_monitor_service.py
import os
import re
import html
import time
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse
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

def extract_keycloak_form_action(html_content: str) -> Optional[str]:
    m = re.search(r'<form[^>]*id=["\']kc-form-login["\'][^>]*action=["\']([^"\']+)["\']', html_content, re.IGNORECASE)
    if m:
        return html.unescape(m.group(1))
    m2 = re.search(r'action=["\'](https?://[^"\']*/login-actions/authenticate[^"\']*)["\']', html_content, re.IGNORECASE)
    if m2:
        return html.unescape(m2.group(1))
    return None

def handle_any_auto_form_post(html_text: str) -> tuple[Optional[str], Dict[str, str]]:
    for form_m in re.finditer(r'<form[^>]*action=["\']([^"\']+)["\'][^>]*>(.*?)</form>', html_text, re.DOTALL | re.IGNORECASE):
        action = html.unescape(form_m.group(1))
        content = form_m.group(2)
        if "/login-actions/" not in action:
            inputs = {}
            for inp_m in re.finditer(r'<input[^>]*name=["\']([^"\']+)["\'][^>]*value=["\']([^"\']*)["\']', content, re.IGNORECASE):
                inputs[inp_m.group(1)] = html.unescape(inp_m.group(2))
            for inp_m2 in re.finditer(r'<input[^>]*value=["\']([^"\']*)["\'][^>]*name=["\']([^"\']+)["\']', content, re.IGNORECASE):
                if inp_m2.group(2) not in inputs:
                    inputs[inp_m2.group(2)] = html.unescape(inp_m2.group(1))
            return action, inputs
    return None, {}

# ---------------------------------------------------------------------------
# CẤU HÌNH CÁC WEBSITE THEO DÕI
# ---------------------------------------------------------------------------
DEFAULT_MONITORED_SITES = [
    {"id": "pythaverse_main",  "name": "Pythaverse Main Portal",    "url": "https://pythaverse.space",                   "auth_entry": "https://pythaverse.space/student-workspace/",                "category": "core",      "enabled": True,  "show_live_alert": True},
    {"id": "ide",              "name": "Pythaverse IDE",            "url": "https://ide.pythaverse.space",              "auth_entry": "https://ide.pythaverse.space/#/",                             "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "avatar",           "name": "Avatar 3D Generator",       "url": "https://avatar.pythaverse.space",           "auth_entry": "https://avatar.pythaverse.space/",                            "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "note",             "name": "Jupyter Hub Note",          "url": "https://note.pythaverse.space",             "auth_entry": "https://note.pythaverse.space/hub/oauth_login?next=%2Fhub%2F","category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "git",              "name": "Pythaverse Git Repos",      "url": "https://git.pythaverse.space",              "auth_entry": "https://git.pythaverse.space/signin/oidc",                  "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "contest",          "name": "Contest & Competitions",    "url": "https://contest.pythaverse.space",          "auth_entry": "https://contest.pythaverse.space/events",                    "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "digitaltwin",      "name": "Digital Twin Simulation",   "url": "https://digitaltwin.pythaverse.space",      "auth_entry": "https://digitaltwin.pythaverse.space/",                       "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "learn",            "name": "LMS Learn Portal",          "url": "https://learn.pythaverse.space",            "auth_entry": "https://learn.pythaverse.space/my/",                          "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "learn_s",          "name": "LMS Learn Staging",         "url": "https://learn-s.pythaverse.space",          "auth_entry": "https://learn-s.pythaverse.space/my/",                        "category": "satellite", "enabled": True,  "show_live_alert": False},
    {"id": "iot",              "name": "IoT Pythaverse Hub",        "url": "https://iot.pythaverse.space",              "auth_entry": "https://iot.pythaverse.space/",                               "category": "satellite", "enabled": True,  "show_live_alert": True},
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
        "uptime_pct_7d":    100.0,
        "uptime_pct_30d":   100.0,
        "total_incidents":   0,
        "is_down_since":    None,
    }

_sites_cache: list[dict] = [_make_initial_state(s) for s in DEFAULT_MONITORED_SITES]

# ---------------------------------------------------------------------------
# UPTIME HISTORY (CẢ 45 VÀ 24 GIỜ)
# ---------------------------------------------------------------------------
def get_uptime_history(site_id: str, days: int = 45) -> list[dict]:
    """Trả về lịch sử theo ngày (phục vụ tương thích 24h)"""
    result = []
    today = now_vn().date()
    db = get_supabase()
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        result.append({"date": day.isoformat(), "status": "UP", "incidents": 0, "downtime_s": 0})
    if not db:
        return result
    try:
        since = (today - timedelta(days=days)).isoformat()
        resp = db.table("site_downtime_events").select("started_at, ended_at, duration_s, is_ongoing").eq("site_id", site_id).gte("started_at", since).execute()
        for event in resp.data or []:
            started = datetime.fromisoformat(event["started_at"]).astimezone(VN_TZ).date().isoformat()
            for entry in result:
                if entry["date"] == started:
                    entry["incidents"] += 1
                    entry["status"] = "DOWN"
    except Exception as e:
        logger.error(f"Lỗi get_uptime_history: {e}")
    return result

def get_hourly_uptime_history(site_id: str, hours: int = 24) -> list[dict]:
    """Trả về 24 blocks (mỗi block là 1 giờ gần nhất)"""
    result = []
    now = now_vn()
    db = get_supabase()
    for i in range(hours - 1, -1, -1):
        target_time = now - timedelta(hours=i)
        result.append({"hour": target_time.strftime("%H:00 %d/%m"), "status": "UP", "incidents": 0, "latency_ms": 180})
    if not db:
        return result
    try:
        since = (now - timedelta(hours=hours)).isoformat()
        resp = db.table("site_downtime_events").select("started_at, ended_at, duration_s, is_ongoing").eq("site_id", site_id).gte("started_at", since).execute()
        for event in resp.data or []:
            target_hour = datetime.fromisoformat(event["started_at"]).astimezone(VN_TZ).strftime("%H:00 %d/%m")
            for entry in result:
                if entry["hour"] == target_hour:
                    entry["status"] = "DOWN"
                    entry["incidents"] += 1
    except Exception as e:
        logger.error(f"Lỗi get_hourly_uptime_history: {e}")
    return result

def get_incident_log(limit: int = 50) -> list[dict]:
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
# CORE MONITOR SERVICE
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
        start = time.time()
        try:
            async with httpx.AsyncClient(verify=False, timeout=15.0, follow_redirects=True) as client:
                response = await client.get(url)
                latency = int((time.time() - start) * 1000)
                site["response_time_ms"] = latency
                site["http_code"] = response.status_code
                site["last_checked_at"] = now_vn_str()

                if response.status_code in (200, 201, 301, 302, 307, 308):
                    site["last_status"] = "UP"
                    site["details"] = f"Phản hồi tốt ({latency}ms) — HTTP {response.status_code}"
                elif response.status_code in (401, 403):
                    site["last_status"] = "UP"
                    site["details"] = f"Yêu cầu SSO ({response.status_code}) — Server hoạt động"
                elif response.status_code >= 500:
                    site["last_status"] = "DOWN"
                    site["details"] = f"Server Error: HTTP {response.status_code}"
                else:
                    site["last_status"] = "WARNING"
                    site["details"] = f"Mã phản hồi: {response.status_code}"
        except Exception as e:
            site["http_code"] = 0
            site["last_checked_at"] = now_vn_str()
            site["last_status"] = "DOWN"
            site["details"] = f"Lỗi kết nối: {str(e)[:80]}"
        return site

    @classmethod
    async def check_all_sites(cls) -> list:
        tasks = [cls.check_single_site(site) for site in _sites_cache]
        return await asyncio.gather(*tasks)

    # ================= TAB 2: AUTHENTICATED SYNTHETIC CHECKS =================
    @staticmethod
    async def execute_role_auth_check(cred: dict) -> dict:
        password = decrypt_secret(cred.get("encrypted_password", ""))
        username = cred.get("username", "")
        role_label = cred.get("role_label", "")
        expected_path = cred.get("expected_path") or cred.get("target_route") or "/"
        site_id = cred.get("site_id", "")

        result = {
            "id": cred.get("id"),
            "site_id": site_id,
            "role_label": role_label,
            "username": username,
            "expected_path": expected_path,
            "status": "FAIL",
            "latency_ms": 0,
            "last_checked_at": now_vn_str(),
            "details": "",
            "token_acquired": False,
            "route_accessible": False
        }

        if not username or not password:
            result["details"] = "Thiếu username hoặc mật khẩu giải mã"
            return result

        site_obj = next((s for s in DEFAULT_MONITORED_SITES if s["id"] == site_id), None)
        raw_url = site_obj.get("url", "https://pythaverse.space") if site_obj else "https://pythaverse.space"
        parsed = urlparse(raw_url)
        root_origin = f"{parsed.scheme}://{parsed.netloc}"
        auth_entry_url = site_obj.get("auth_entry") if site_obj else f"{root_origin}/student-workspace/"

        start_time = time.time()
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"}

        try:
            async with httpx.AsyncClient(verify=False, timeout=25.0, follow_redirects=True, headers=headers) as client:
                init_resp = await client.get(auth_entry_url)

                if "eid.pythaverse.space" not in str(init_resp.url):
                    if 200 <= init_resp.status_code < 400:
                        result["status"] = "PASS"
                        result["route_accessible"] = True
                        result["latency_ms"] = int((time.time() - start_time) * 1000)
                        result["details"] = f"Phiên hoạt động sẵn sàng — HTTP {init_resp.status_code}"
                        SiteMonitorService._save_cred_result_to_db(cred.get("id"), result)
                        return result

                action_url = extract_keycloak_form_action(init_resp.text) or str(init_resp.url)

                login_payload = {"username": username, "password": password, "credentialId": "", "login": "Login"}
                post_headers = {"Referer": str(init_resp.url), "Content-Type": "application/x-www-form-urlencoded"}
                login_resp = await client.post(action_url, data=login_payload, headers=post_headers)

                # Chuyển tiếp Form Post OIDC (Moodle LMS & Digital Twin)
                post_action, post_inputs = handle_any_auto_form_post(login_resp.text)
                if post_action and post_inputs:
                    login_resp = await client.post(post_action, data=post_inputs)

                final_url = str(login_resp.url)

                if "eid.pythaverse.space" in final_url or "kc-form-login" in login_resp.text:
                    result["latency_ms"] = int((time.time() - start_time) * 1000)
                    result["status"] = "FAIL"
                    result["details"] = "Keycloak từ chối đăng nhập (Sai pass / Chưa kích hoạt)"
                    SiteMonitorService._save_cred_result_to_db(cred.get("id"), result)
                    return result

                result["token_acquired"] = True

                if expected_path.startswith("http"):
                    target_check_url = expected_path
                else:
                    target_check_url = f"{root_origin}/{expected_path.lstrip('/')}"

                if expected_path not in ("/", "") and target_check_url.rstrip("/") != final_url.rstrip("/"):
                    route_resp = await client.get(target_check_url)
                    check_status = route_resp.status_code
                    check_url = str(route_resp.url)
                else:
                    check_status = login_resp.status_code
                    check_url = final_url

                total_latency = int((time.time() - start_time) * 1000)
                result["latency_ms"] = total_latency

                if (200 <= check_status < 400) and "eid.pythaverse.space" not in check_url:
                    result["status"] = "PASS"
                    result["route_accessible"] = True
                    result["details"] = f"SSO OK & Đã vào {role_label} ({total_latency}ms)"
                elif check_status in (401, 403):
                    result["status"] = "WARNING"
                    result["details"] = f"SSO OK nhưng Route từ chối quyền (HTTP {check_status})"
                else:
                    result["status"] = "FAIL"
                    result["details"] = f"Lỗi truy cập Route: HTTP {check_status}"

        except Exception as e:
            result["status"] = "FAIL"
            result["details"] = f"Lỗi: {str(e)[:80]}"

        SiteMonitorService._save_cred_result_to_db(cred.get("id"), result)
        return result

    @staticmethod
    def _save_cred_result_to_db(cred_id: Optional[str], result: dict):
        if not cred_id:
            return
        db = get_supabase()
        if db:
            try:
                db.table("site_monitor_credentials").update({
                    "last_status": result["status"],
                    "last_latency_ms": result["latency_ms"],
                    "last_checked_at": now_vn().isoformat(),
                    "details": result["details"]
                }).eq("id", cred_id).execute()
            except Exception as e:
                logger.error(f"Lỗi lưu Supabase: {e}")

    @classmethod
    async def get_and_check_auth_matrix(cls) -> List[Dict[str, Any]]:
        db = get_supabase()
        if not db:
            return []
        try:
            resp = db.table("site_monitor_credentials").select("*").eq("is_active", True).execute()
            creds = resp.data or []
            tasks = [cls.execute_role_auth_check(c) for c in creds]
            return await asyncio.gather(*tasks)
        except Exception:
            return []

    # ================= TAB 3: CI/CD DEPLOY MONITOR =================
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
    async def get_vercel_deployments(cls, limit: int = 5) -> List[Dict[str, Any]]:
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
        except Exception:
            pass
        return []

    @classmethod
    async def get_render_deployments(cls, limit: int = 5) -> List[Dict[str, Any]]:
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
                        "commit_msg": d.get("deploy", {}).get("commit", {}).get("message") or "Deploy update",
                        "commit_author": "Deploy Bot",
                        "provider": "render"
                    } for d in deploys]
        except Exception:
            pass
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
# CRON JOB LẬP LỊCH TỰ ĐỘNG
# ---------------------------------------------------------------------------
async def poll_site_uptime_cron():
    await SiteMonitorService.check_all_sites()
    await SiteMonitorService.get_and_check_auth_matrix()