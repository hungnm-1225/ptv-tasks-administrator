# backend/app/api/v1/endpoints/monitor.py
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from app.services.site_monitor_service import (
    SiteMonitorService,
    get_uptime_history,
    get_incident_log,
)

router = APIRouter()


class SiteUpdateRequest(BaseModel):
    enabled: Optional[bool] = None
    show_live_alert: Optional[bool] = None
    name: Optional[str] = None
    url: Optional[str] = None


# ─── GET /monitor/sites ────────────────────────────────────────────────────────
@router.get("/sites")
async def get_monitored_sites():
    """Lấy danh sách tất cả website cùng thống kê tổng quan."""
    sites = SiteMonitorService.get_all_sites()
    summary = SiteMonitorService.get_summary_stats()
    return {"summary": summary, "sites": sites}


# ─── PUT /monitor/sites/{site_id} ─────────────────────────────────────────────
@router.put("/sites/{site_id}")
async def update_site_config(site_id: str, payload: SiteUpdateRequest):
    """Cập nhật cấu hình Bật/Tắt kiểm tra hoặc Ẩn/Hiện thông báo cho 1 website."""
    updated = SiteMonitorService.update_site(site_id, payload.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy website cần cập nhật")
    return {"status": "success", "site": updated}


# ─── POST /monitor/check-now ──────────────────────────────────────────────────
@router.post("/check-now")
async def trigger_check_now():
    """Kích hoạt kiểm tra Live ngay lập tức cho toàn bộ website đã bật."""
    results = await SiteMonitorService.check_all_sites()
    summary = SiteMonitorService.get_summary_stats()
    return {
        "status": "success",
        "message": f"Đã kiểm tra xong {len(results)} website",
        "summary": summary,
        "sites": results,
    }


# ─── POST /monitor/sites/{site_id}/check ──────────────────────────────────────
@router.post("/sites/{site_id}/check")
async def check_single_site_now(site_id: str):
    """Kiểm tra riêng 1 website cụ thể ngay lập tức."""
    sites = SiteMonitorService.get_all_sites()
    target = next((s for s in sites if s["id"] == site_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy website")
    result = await SiteMonitorService.check_single_site(target)
    return {"status": "success", "site": result}


# ─── GET /monitor/sites/{site_id}/history ─────────────────────────────────────
@router.get("/sites/{site_id}/history")
async def get_site_history(
    site_id: str,
    days: int = Query(default=45, ge=1, le=90, description="Số ngày lấy lịch sử (1-90)"),
):
    """
    Lấy uptime history theo ngày cho 1 website.
    Mỗi phần tử: { date, status, incidents, downtime_s }
    Dùng để render các ô uptime bars giống UptimeRobot.
    """
    sites = SiteMonitorService.get_all_sites()
    exists = any(s["id"] == site_id for s in sites)
    if not exists:
        raise HTTPException(status_code=404, detail="Không tìm thấy website")

    history = get_uptime_history(site_id, days=days)
    return {
        "site_id": site_id,
        "days": days,
        "history": history,
    }


# ─── GET /monitor/incidents ────────────────────────────────────────────────────
@router.get("/incidents")
async def get_all_incidents(
    limit: int = Query(default=50, ge=1, le=200, description="Số lượng incident tối đa"),
):
    """Lấy danh sách các sự cố DOWN gần nhất từ toàn bộ website (từ Supabase)."""
    incidents = get_incident_log(limit=limit)
    return {
        "total": len(incidents),
        "incidents": incidents,
    }
