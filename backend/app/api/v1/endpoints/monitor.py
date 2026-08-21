# backend/app/api/v1/endpoints/monitor.py
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Optional, Dict, Any, List
from app.services.site_monitor_service import SiteMonitorService, get_uptime_history, get_incident_log, get_supabase

router = APIRouter()

# ── TAB 1: Public Sites ──────────────────────────────────────────────────────
@router.get("/sites")
async def get_monitored_sites():
    sites = SiteMonitorService.get_all_sites()
    summary = SiteMonitorService.get_summary_stats()
    return {"summary": summary, "sites": sites}

@router.post("/check-now")
async def check_all_now():
    sites = await SiteMonitorService.check_all_sites()
    summary = SiteMonitorService.get_summary_stats()
    return {"summary": summary, "sites": sites}

@router.post("/sites/{site_id}/check")
async def check_single_site(site_id: str):
    site = next((s for s in SiteMonitorService.get_all_sites() if s["id"] == site_id), None)
    if not site:
        raise HTTPException(status_code=404, detail="Không tìm thấy site")
    res = await SiteMonitorService.check_single_site(site)
    return {"site": res}

@router.get("/sites/{site_id}/history")
async def get_site_history(site_id: str, days: int = 45):
    return {"history": get_uptime_history(site_id, days)}

@router.get("/incidents")
async def get_incidents(limit: int = 50):
    return {"incidents": get_incident_log(limit)}

# ── TAB 2: Authenticated Matrix ──────────────────────────────────────────────
@router.get("/auth-matrix")
async def get_auth_matrix():
    db = get_supabase()
    if not db:
        return {"credentials": []}
    resp = db.table("site_monitor_credentials").select("id, site_id, role_label, username, expected_path, last_status, last_latency_ms, last_checked_at, details").eq("is_active", True).execute()
    data = resp.data or []
    # Map sang cấu trúc status cho UI
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
    return {"credentials": mapped}

@router.post("/auth-matrix/check-now")
async def check_auth_matrix_now():
    results = await SiteMonitorService.get_and_check_auth_matrix()
    return {"results": results}

# ── TAB 3: CI/CD Deploys & Logs ──────────────────────────────────────────────
@router.get("/deployments/vercel")
async def get_vercel_deploys(limit: int = 5):
    deploys = await SiteMonitorService.get_vercel_deployments(limit)
    return {"deployments": deploys}

@router.get("/deployments/render")
async def get_render_deploys(limit: int = 5):
    deploys = await SiteMonitorService.get_render_deployments(limit)
    return {"deployments": deploys}

@router.get("/deployments/{provider}/{deploy_id}/logs")
async def get_deploy_logs(provider: str, deploy_id: str):
    if provider == "vercel":
        logs = await SiteMonitorService.get_vercel_logs(deploy_id)
    elif provider == "render":
        logs = await SiteMonitorService.get_render_logs(deploy_id)
    else:
        raise HTTPException(status_code=400, detail="Provider không hỗ trợ")
    return {"logs": logs}