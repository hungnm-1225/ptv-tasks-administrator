# backend/app/api/v1/endpoints/monitor.py
import time
from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any, List
from app.services.site_monitor_service import (
    SiteMonitorService,
    get_uptime_history,
    get_hourly_uptime_history,
    get_incident_log,
    get_supabase
)

router = APIRouter()

# =============================================================================
# ⚡ IN-MEMORY CACHE CHO SITE MONITOR (TỐC ĐỘ 1MS)
# =============================================================================
class MonitorMemoryCache:
    def __init__(self, default_ttl: int = 30):  # Lưu RAM 30 giây
        self._cache: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            data, expire_at = self._cache[key]
            if time.time() < expire_at:
                return data
            del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        expire_at = time.time() + (ttl if ttl is not None else 30)
        self._cache[key] = (value, expire_at)

    def invalidate(self):
        """Xóa sạch cache khi bấm nút check-now."""
        self._cache.clear()

monitor_cache = MonitorMemoryCache(default_ttl=30)


# ── TAB 1: Public Sites ──────────────────────────────────────────────────────
@router.get("/sites")
async def get_monitored_sites():
    """Lấy trạng thái 10 Sites (Có RAM Cache 30s)."""
    cache_key = "public_sites_status"
    cached = monitor_cache.get(cache_key)
    if cached is not None:
        return cached

    sites = SiteMonitorService.get_all_sites()
    summary = SiteMonitorService.get_summary_stats()
    res_data = {"summary": summary, "sites": sites}
    monitor_cache.set(cache_key, res_data, ttl=30)
    return res_data

@router.post("/check-now")
async def check_all_now():
    monitor_cache.invalidate()
    sites = await SiteMonitorService.check_all_sites()
    summary = SiteMonitorService.get_summary_stats()
    return {"summary": summary, "sites": sites}

@router.post("/sites/{site_id}/check")
async def check_single_site(site_id: str):
    monitor_cache.invalidate()
    site = next((s for s in SiteMonitorService.get_all_sites() if s["id"] == site_id), None)
    if not site:
        raise HTTPException(status_code=404, detail="Không tìm thấy site")
    res = await SiteMonitorService.check_single_site(site)
    return {"site": res}

@router.get("/sites/{site_id}/history")
async def get_site_history(site_id: str, days: int = 45):
    cache_key = f"history_{site_id}_{days}"
    cached = monitor_cache.get(cache_key)
    if cached is not None:
        return {"history": cached}

    hist = get_uptime_history(site_id, days)
    monitor_cache.set(cache_key, hist, ttl=60)
    return {"history": hist}

@router.get("/sites/{site_id}/hourly")
async def get_site_hourly_history(site_id: str, hours: int = 24):
    cache_key = f"hourly_{site_id}_{hours}"
    cached = monitor_cache.get(cache_key)
    if cached is not None:
        return {"history": cached}

    hourly = get_hourly_uptime_history(site_id, hours)
    monitor_cache.set(cache_key, hourly, ttl=60)
    return {"history": hourly}

@router.get("/incidents")
async def get_incidents(limit: int = 50):
    cache_key = f"incidents_{limit}"
    cached = monitor_cache.get(cache_key)
    if cached is not None:
        return {"incidents": cached}

    inc = get_incident_log(limit)
    monitor_cache.set(cache_key, inc, ttl=30)
    return {"incidents": inc}

# ── TAB 2: Authenticated Matrix ──────────────────────────────────────────────
@router.get("/auth-matrix")
async def get_auth_matrix():
    """Lấy ma trận xác thực 16 tài khoản (Có RAM Cache)."""
    cache_key = "auth_matrix_list"
    cached = monitor_cache.get(cache_key)
    if cached is not None:
        return {"credentials": cached}

    db = get_supabase()
    if not db:
        return {"credentials": []}
    resp = db.table("site_monitor_credentials").select("id, site_id, role_label, username, expected_path, last_status, last_latency_ms, last_checked_at, details").eq("is_active", True).execute()
    data = resp.data or []
    mapped = [{
        "id": d.get("id"),
        "site_id": d.get("site_id"),
        "role_label": d.get("role_label"),
        "username": d.get("username"),
        "expected_path": d.get("expected_path"),
        "status": d.get("last_status", "UNKNOWN"),
        "latency_ms": d.get("last_latency_ms", 0),
        "last_checked_at": d.get("last_checked_at"),
        "details": d.get("details", "")
    } for d in data]
    
    monitor_cache.set(cache_key, mapped, ttl=60)
    return {"credentials": mapped}

@router.post("/auth-matrix/check-now")
async def check_auth_matrix_now():
    monitor_cache.invalidate()
    results = await SiteMonitorService.get_and_check_auth_matrix()
    return {"results": results}

# ── TAB 3: CI/CD Deploys & Logs ──────────────────────────────────────────────
@router.get("/deployments/vercel")
async def get_vercel_deploys(limit: int = 5):
    cache_key = f"vercel_deploys_{limit}"
    cached = monitor_cache.get(cache_key)
    if cached is not None:
        return {"deployments": cached}

    deploys = await SiteMonitorService.get_vercel_deployments(limit)
    monitor_cache.set(cache_key, deploys, ttl=30)
    return {"deployments": deploys}

@router.get("/deployments/render")
async def get_render_deploys(limit: int = 5):
    cache_key = f"render_deploys_{limit}"
    cached = monitor_cache.get(cache_key)
    if cached is not None:
        return {"deployments": cached}

    deploys = await SiteMonitorService.get_render_deployments(limit)
    monitor_cache.set(cache_key, deploys, ttl=30)
    return {"deployments": deploys}

@router.get("/deployments/{provider}/{deploy_id}/logs")
async def get_deploy_logs(provider: str, deploy_id: str):
    cache_key = f"deploy_logs_{provider}_{deploy_id}"
    cached = monitor_cache.get(cache_key)
    if cached is not None:
        return {"logs": cached}

    if provider == "vercel":
        logs = await SiteMonitorService.get_vercel_logs(deploy_id)
    elif provider == "render":
        logs = await SiteMonitorService.get_render_logs(deploy_id)
    else:
        raise HTTPException(status_code=400, detail="Provider không hỗ trợ")
        
    monitor_cache.set(cache_key, logs, ttl=120)
    return {"logs": logs}