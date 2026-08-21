# backend/app/services/site_monitor_service.py
import os
import re
import html
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
# SUPABASE & FERNET CIPHER INITIALIZER
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
    """Bóc tách action URL từ form #kc-form-login của Keycloak HTML"""
    # 1. Tìm action của form id kc-form-login
    m = re.search(r'<form[^>]*id=["\']kc-form-login["\'][^>]*action=["\']([^"\']+)["\']', html_content, re.IGNORECASE)
    if m:
        return html.unescape(m.group(1))
    
    # 2. Fallback: tìm bất kỳ form action nào có chứa login-actions/authenticate
    m2 = re.search(r'action=["\'](https?://[^"\']*/login-actions/authenticate[^"\']*)["\']', html_content, re.IGNORECASE)
    if m2:
        return html.unescape(m2.group(1))
    return None

# ---------------------------------------------------------------------------
# CẤU HÌNH CÁC WEBSITE THEO DÕI
# ---------------------------------------------------------------------------
DEFAULT_MONITORED_SITES = [
    {"id": "pythaverse_main",  "name": "Pythaverse Main Portal",    "url": "https://pythaverse.space/",                   "auth_entry": "https://pythaverse.space/student-workspace/",                "category": "core",      "enabled": True,  "show_live_alert": True},
    {"id": "ide",              "name": "Pythaverse IDE",            "url": "https://ide.pythaverse.space/#/",              "auth_entry": "https://ide.pythaverse.space/#/",                             "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "avatar",           "name": "Avatar 3D Generator",       "url": "https://avatar.pythaverse.space/",             "auth_entry": "https://avatar.pythaverse.space/",                            "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "note",             "name": "Jupyter Hub Note",          "url": "https://note.pythaverse.space/",               "auth_entry": "https://note.pythaverse.space/hub/oauth_login?next=%2Fhub%2F","category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "git",              "name": "Pythaverse Git Repos",      "url": "https://git.pythaverse.space/dashboard/repos", "auth_entry": "https://git.pythaverse.space/signin/oidc",                  "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "contest",          "name": "Contest & Competitions",    "url": "https://contest.pythaverse.space/contest",     "auth_entry": "https://contest.pythaverse.space/profile",                    "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "digitaltwin",      "name": "Digital Twin Simulation",   "url": "https://digitaltwin.pythaverse.space/",        "auth_entry": "https://digitaltwin.pythaverse.space/",                       "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "learn",            "name": "LMS Learn Portal",          "url": "https://learn.pythaverse.space/my/",           "auth_entry": "https://learn.pythaverse.space/my/",                          "category": "satellite", "enabled": True,  "show_live_alert": True},
    {"id": "learn_s",          "name": "LMS Learn Staging",         "url": "https://learn-s.pythaverse.space/my/",         "auth_entry": "https://learn-s.pythaverse.space/my/",                        "category": "satellite", "enabled": True,  "show_live_alert": False},
    {"id": "iot",              "name": "IoT Pythaverse Hub",        "url": "https://iot.pythaverse.space/",                "auth_entry": "https://iot.pythaverse.space/",                               "category": "satellite", "enabled": True,  "show_live_alert": True},
]

def _make_initial_state(site: dict) -> dict:
    return {
        **site,
        "last_status":      "UP",
        "http_code":         200,
        "response_time_ms":  0,
        "last_checked_at":   None,
        "details":          "Chưa kiểm tra lần nào",
        "uptime_pct_24h":   100.0,
        "uptime_pct_7d":    100.0,
        "uptime_pct_30d":   100.0,
        "total_incidents":   0,
        "is_down_since":    None,
    }

_sites_cache: list[dict] = [_make_initial_state(s) for s in DEFAULT_MONITORED_SITES]

# ---------------------------------------------------------------------------
# DOWNTIME PERSISTENCE — Supabase
# ---------------------------------------------------------------------------
def _persist_downtime_start(site: dict, http_code: int, error_msg: str):
    if site.get("is_down_since"):
        return
    db = get_supabase()
    if not db:
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
    except Exception as e:
        logger.error(f"Lỗi ghi downtime start: {e}")

def _persist_downtime_end(site: dict):
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
    except Exception as e:
        logger.error(f"Lỗi ghi downtime end: {e}")
        site["is_down_since"] = None

def get_uptime_history(site_id: str, days: int = 45) -> list[dict]:
    db = get_supabase()
    result = []
    today = now_vn().date()
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
                        pct = entry["downtime_s"] / 86400
                        if pct > 0.30:
                            entry["status"] = "DOWN"
                        elif entry["downtime_s"] > 600 or entry["incidents"] > 0:
                            entry["status"] = "DEGRADED"
                        break
            except Exception:
                continue
    except Exception as e:
        logger.error(f"Lỗi lấy uptime history: {e}")
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

def compute_uptime_pct(history: list[dict]) -> float:
    if not history:
        return 100.0
    total_s = len(history) * 86400
    down_s = sum(h.get("downtime_s", 0) for h in history)
    if total_s == 0:
        return 100.0
    return round(max(0.0, (total_s - down_s) / total_s * 100), 3)

# ---------------------------------------------------------------------------
# CORE MONITORING SERVICE (Tab 1, Tab 2 & Tab 3)
# ---------------------------------------------------------------------------
class SiteMonitorService:

    # ================= TAB 1: PUBLIC SHADOW PING =================
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
                    site["details"] = f"Mã phản hồi: {response.status_code}"

        except httpx.TimeoutException:
            site["response_time_ms"] = 15000
            site["http_code"] = 504
            site["last_checked_at"] = now_vn_str()
            new_status = "DOWN"
            site["details"] = "Quá thời gian phản hồi (Timeout > 15s)"

        except Exception as e:
            site["http_code"] = 0
            site["last_checked_at"] = now_vn_str()
            new_status = "DOWN"
            site["details"] = f"Lỗi kết nối: {str(e)[:80]}"

        if new_status == "DOWN" and prev_status != "DOWN":
            _persist_downtime_start(site, site.get("http_code", 0), site.get("details", ""))
        elif new_status in ("UP", "WARNING") and prev_status == "DOWN":
            _persist_downtime_end(site)

        site["last_status"] = new_status
        return site

    @classmethod
    async def check_all_sites(cls) -> list:
        logger.info("🔍 Quét kiểm tra tình trạng Live Public của tất cả website...")
        tasks = [cls.check_single_site(site) for site in _sites_cache]
        results = await asyncio.gather(*tasks)
        for site in results:
            try:
                h45 = get_uptime_history(site["id"], days=45)
                site["uptime_pct_30d"] = compute_uptime_pct(h45[-30:])
                site["uptime_pct_7d"]  = compute_uptime_pct(h45[-7:])
                site["uptime_pct_24h"] = compute_uptime_pct(h45[-1:])
                site["total_incidents"] = sum(d["incidents"] for d in h45)
            except Exception:
                pass
        return results

    # ================= TAB 2: AUTHENTICATED SYNTHETIC CHECKS (OIDC BROWSER EMULATION) =================
    @staticmethod
    async def execute_role_auth_check(cred: dict) -> dict:
        """
        Mô phỏng quy trình đăng nhập OpenID Connect thực thụ qua Keycloak Form HTML.
        cred: { id, site_id, role_label, username, encrypted_password, expected_path }
        """
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
        auth_entry_url = site_obj.get("auth_entry") if site_obj else "https://pythaverse.space/student-workspace/"
        base_url = site_obj.get("url", "https://pythaverse.space").rstrip("/") if site_obj else "https://pythaverse.space"

        start_time = time.time()

        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        headers = {"User-Agent": user_agent}

        try:
            # Dùng AsyncClient có CookieJar tự lưu trữ cookies theo từng session
            async with httpx.AsyncClient(verify=False, timeout=20.0, follow_redirects=True, headers=headers) as client:
                
                # BƯỚC 1: Truy cập URL kích hoạt để Keycloak tạo session và cấp form login
                init_resp = await client.get(auth_entry_url)
                
                # BƯỚC 2: Bóc tách action URL từ form Keycloak HTML
                action_url = extract_keycloak_form_action(init_resp.text)
                
                if not action_url:
                    # Nếu đã vào thẳng trang đích mà không qua login
                    if "eid.pythaverse.space" not in str(init_resp.url):
                        result["status"] = "PASS"
                        result["latency_ms"] = int((time.time() - start_time) * 1000)
                        result["details"] = f"- HTTP {init_resp.status_code}"
                        return result
                    else:
                        action_url = str(init_resp.url)

                # BƯỚC 3: Điền Form #kc-form-login và Submit lên Keycloak
                login_payload = {
                    "username": username,
                    "password": password,
                    "credentialId": "",
                    "login": "Login"
                }
                
                post_headers = {
                    "Referer": str(init_resp.url),
                    "Content-Type": "application/x-www-form-urlencoded"
                }

                login_resp = await client.post(action_url, data=login_payload, headers=post_headers)

                # BƯỚC 4: Phân tích kết quả sau Submit
                final_url = str(login_resp.url)
                
                # Nếu vẫn bị giữ lại ở trang Keycloak authenticate và có báo lỗi
                if "login-actions/authenticate" in final_url and ("Invalid username or password" in login_resp.text or "alert-error" in login_resp.text or "kc-feedback-text" in login_resp.text):
                    result["latency_ms"] = int((time.time() - start_time) * 1000)
                    result["status"] = "FAIL"
                    result["details"] = "Sai tên đăng nhập hoặc mật khẩu Keycloak"
                    return result

                result["token_acquired"] = True

                # BƯỚC 5: Kiểm tra Target Route (Đặc biệt xử lý Sales Admin URL riêng)
                target_check_url = expected_path if expected_path.startswith("http") else f"{base_url}{expected_path}"
                
                # Nếu trang đích chưa khớp với URL hiện tại, gửi GET tiếp để xác nhận quyền
                if expected_path != "/" and expected_path not in final_url:
                    route_resp = await client.get(target_check_url)
                    check_status = route_resp.status_code
                    check_url = str(route_resp.url)
                else:
                    check_status = login_resp.status_code
                    check_url = final_url

                total_latency = int((time.time() - start_time) * 1000)
                result["latency_ms"] = total_latency

                if check_status in (200, 201, 301, 302, 307, 308) and "eid.pythaverse.space" not in check_url:
                    result["status"] = "PASS"
                    result["route_accessible"] = True
                    result["details"] = f"SSO OK & Đã vào {role_label} ({total_latency}ms)"
                elif check_status in (401, 403):
                    result["status"] = "WARNING"
                    result["details"] = f"SSO OK nhưng Route từ chối quyền (HTTP {check_status})"
                else:
                    result["status"] = "FAIL"
                    result["details"] = f"Lỗi truy cập Route: HTTP {check_status}"

        except httpx.TimeoutException:
            result["latency_ms"] = 20000
            result["status"] = "FAIL"
            result["details"] = "Quá thời gian kết nối (Timeout > 20s)"
        except Exception as e:
            result["status"] = "FAIL"
            result["details"] = f"Lỗi: {str(e)[:80]}"

        # Cập nhật kết quả vào Supabase
        db = get_supabase()
        if db and cred.get("id"):
            try:
                db.table("site_monitor_credentials").update({
                    "last_status": result["status"],
                    "last_latency_ms": result["latency_ms"],
                    "last_checked_at": now_vn().isoformat(),
                    "details": result["details"]
                }).eq("id", cred["id"]).execute()
            except Exception as e:
                logger.error(f"Lỗi cập nhật Supabase: {e}")

        return result

    @classmethod
    async def get_and_check_auth_matrix(cls) -> List[Dict[str, Any]]:
        db = get_supabase()
        if not db:
            return []
        try:
            resp = db.table("site_monitor_credentials").select("*").eq("is_active", True).execute()
            creds = resp.data or []
            if not creds:
                return []
            tasks = [cls.execute_role_auth_check(c) for c in creds]
            return await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"Lỗi kiểm tra Auth Matrix: {e}")
            return []

    # ================= TAB 3: VERCEL & RENDER CI/CD LOGS =================
    @classmethod
    async def _get_deploy_config(cls, provider: str) -> tuple[str, str]:
        """
        Lấy (token, target_id) cho provider ('vercel' hoặc 'render').
        Ưu tiên đọc từ Supabase site_deploy_configs, nếu không có thì đọc từ os.getenv().
        """
        db = get_supabase()
        if db:
            try:
                resp = db.table("site_deploy_configs")\
                    .select("target_id, encrypted_api_token")\
                    .eq("provider", provider)\
                    .eq("is_active", True)\
                    .execute()
                if resp.data and len(resp.data) > 0:
                    target_id = resp.data[0].get("target_id", "")
                    enc_token = resp.data[0].get("encrypted_api_token", "")
                    token = decrypt_secret(enc_token)
                    if token and target_id:
                        return token, target_id
            except Exception as e:
                logger.warning(f"Không thể đọc site_deploy_configs từ Supabase: {e}")

        # Fallback từ .env nếu bảng Supabase chưa có
        if provider == "vercel":
            return os.getenv("VERCEL_ACCESS_TOKEN", ""), os.getenv("VERCEL_PROJECT_ID", "")
        elif provider == "render":
            return os.getenv("RENDER_API_KEY", ""), os.getenv("RENDER_SERVICE_ID", "")
        return "", ""

    @classmethod
    async def get_vercel_deployments(cls, limit: int = 5) -> List[Dict[str, Any]]:
        token, project_id = await cls._get_deploy_config("vercel")
        if not token:
            return []

        url = f"https://api.vercel.com/v6/deployments?limit={limit}"
        if project_id:
            url += f"&projectId={project_id}"

        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    deployments = resp.json().get("deployments", [])
                    return [{
                        "id": d.get("uid"),
                        "name": d.get("name", "ptv-tasks-administrator"),
                        "url": d.get("url"),
                        "state": d.get("state") or d.get("readyState", "READY"),
                        "created_at": d.get("created"),
                        "commit_msg": d.get("meta", {}).get("githubCommitMessage", "Deploy commit"),
                        "commit_author": d.get("meta", {}).get("githubCommitAuthorName", "Developer"),
                        "provider": "vercel"
                    } for d in deployments]
                else:
                    logger.error(f"Vercel API trả về lỗi: HTTP {resp.status_code} - {resp.text}")
        except Exception as e:
            logger.error(f"Lỗi gọi Vercel API: {e}")
        return []

    @classmethod
    async def get_vercel_logs(cls, deployment_id: str) -> str:
        token, _ = await cls._get_deploy_config("vercel")
        if not token:
            return "Chưa cấu hình Vercel Access Token trong Supabase hoặc .env"

        url = f"https://api.vercel.com/v2/deployments/{deployment_id}/events"
        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    events = resp.json()
                    lines = []
                    for e in events:
                        text = e.get("text") or (e.get("payload", {}).get("text") if isinstance(e.get("payload"), dict) else None)
                        if text:
                            lines.append(text)
                    return "\n".join(lines) if lines else "Không có event log chi tiết."
                return f"Lỗi tải logs từ Vercel: HTTP {resp.status_code}\n{resp.text}"
        except Exception as e:
            return f"Lỗi ngoại lệ khi lấy logs Vercel: {e}"

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
                        "name": "ptv-tasks-backend",
                        "status": d.get("deploy", {}).get("status") or d.get("status", "live"),
                        "created_at": d.get("deploy", {}).get("createdAt") or d.get("createdAt"),
                        "commit_msg": d.get("deploy", {}).get("commit", {}).get("message") or "Triggered Deploy",
                        "commit_author": "Deploy Bot",
                        "provider": "render"
                    } for d in deploys]
                else:
                    logger.error(f"Render API trả về lỗi: HTTP {resp.status_code} - {resp.text}")
        except Exception as e:
            logger.error(f"Lỗi gọi Render API: {e}")
        return []

    @classmethod
    async def get_render_logs(cls, deploy_id: str) -> str:
        api_key, service_id = await cls._get_deploy_config("render")
        if not api_key or not service_id:
            return "Chưa cấu hình Render API Key hoặc Service ID trong Supabase hoặc .env"

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
                return f"Lỗi tải Render logs: HTTP {resp.status_code}\n{resp.text}"
        except Exception as e:
            return f"Lỗi ngoại lệ khi lấy Render logs: {e}"


# ---------------------------------------------------------------------------
# CRON JOB LẬP LỊCH TỰ ĐỘNG
# ---------------------------------------------------------------------------
async def poll_site_uptime_cron():
    await SiteMonitorService.check_all_sites()
    await SiteMonitorService.get_and_check_auth_matrix()