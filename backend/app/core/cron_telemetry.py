# backend/app/core/cron_telemetry.py
"""
Pythaverse Central Admin - In-Memory & Supabase-Backed Cronjob Telemetry Registry
Quản lý trạng thái Real-time, thời điểm chạy gần nhất & kế tiếp của các Cronjobs (Persisted).
"""
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta
import pytz
import logging

logger = logging.getLogger(__name__)
VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

CRON_TELEMETRY: Dict[str, Dict[str, Any]] = {
    "gmail_cron": {
        "job_name": "Gmail Workspace Ingestion",
        "sync_type": "gmail",
        "status": "idle",
        "last_run_at": None,
        "next_run_at": None,
        "duration_seconds": None,
        "last_message": "Chưa có lượt chạy",
        "total_runs": 0,
        "failed_count": 0,
    },
    "osticket_cron": {
        "job_name": "OS Ticket Support Scraper",
        "sync_type": "osticket",
        "status": "idle",
        "last_run_at": None,
        "next_run_at": None,
        "duration_seconds": None,
        "last_message": "Chưa có lượt chạy",
        "total_runs": 0,
        "failed_count": 0,
    },
    "sheet_cron": {
        "job_name": "Google Form Feedback Sync",
        "sync_type": "sheet",
        "status": "idle",
        "last_run_at": None,
        "next_run_at": None,
        "duration_seconds": None,
        "last_message": "Chưa có lượt chạy",
        "total_runs": 0,
        "failed_count": 0,
    },
    "distributor_cache_scanner_cron": {
        "job_name": "Distributors Cache Scanner",
        "sync_type": "distributor_cache",
        "status": "idle",
        "last_run_at": None,
        "next_run_at": None,
        "duration_seconds": None,
        "last_message": "Chưa có lượt chạy",
        "total_runs": 0,
        "failed_count": 0,
    },
    "workspace_long_tasks_cron": {
        "job_name": "Task Workspace Long-Running",
        "sync_type": "workspace_tasks",
        "status": "idle",
        "last_run_at": None,
        "next_run_at": None,
        "duration_seconds": None,
        "last_message": "Chưa có lượt chạy",
        "total_runs": 0,
        "failed_count": 0,
    },
    "site_uptime_cron": {
        "job_name": "Site Uptime & Auth Matrix",
        "sync_type": "site_uptime",
        "status": "idle",
        "last_run_at": None,
        "next_run_at": None,
        "duration_seconds": None,
        "last_message": "Chưa có lượt chạy",
        "total_runs": 0,
        "failed_count": 0,
    },
}

def get_vn_now_str() -> str:
    return datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")

def format_dt_to_vn_str(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = pytz.utc.localize(dt)
    return dt.astimezone(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")

def load_telemetry_from_db():
    """Khởi động: Kéo toàn bộ lịch sử chạy đêm qua từ Supabase nạp vào RAM (10ms)."""
    try:
        from app.core.supabase import get_supabase_client
        db = get_supabase_client()
        res = db.table("cron_telemetry_state").select("*").execute()
        for row in res.data or []:
            c_id = row.get("cron_id")
            if c_id in CRON_TELEMETRY:
                CRON_TELEMETRY[c_id].update({
                    "status": row.get("status", "idle"),
                    "last_run_at": row.get("last_run_at"),
                    "next_run_at": row.get("next_run_at"),
                    "duration_seconds": row.get("duration_seconds"),
                    "last_message": row.get("last_message"),
                    "total_runs": row.get("total_runs", 0),
                    "failed_count": row.get("failed_count", 0),
                })
        logger.info(f"💾 [Telemetry] Đã khôi phục thành công trạng thái {len(res.data or [])} cronjobs từ Supabase!")
    except Exception as e:
        logger.warning(f"⚠️ [Telemetry] Không thể nạp trạng thái cron từ Supabase: {e}")

# Tự động nạp từ DB ngay khi module được import
load_telemetry_from_db()

def mark_cron_running(cron_id: str, next_run_dt: Optional[datetime] = None):
    if cron_id in CRON_TELEMETRY:
        item = CRON_TELEMETRY[cron_id]
        item["status"] = "running"
        item["last_run_at"] = get_vn_now_str()
        if next_run_dt:
            item["next_run_at"] = format_dt_to_vn_str(next_run_dt)

def mark_cron_finished(
    cron_id: str, 
    status: str, 
    duration: float, 
    message: str, 
    next_run_dt: Optional[datetime] = None
):
    if cron_id in CRON_TELEMETRY:
        item = CRON_TELEMETRY[cron_id]
        item["status"] = status
        item["duration_seconds"] = round(duration, 2)
        item["last_message"] = message
        item["total_runs"] += 1
        if status == "error":
            item["failed_count"] += 1
        if next_run_dt:
            item["next_run_at"] = format_dt_to_vn_str(next_run_dt)

        # 🎯 PERSIST NGAY VÀO SUPABASE (CHỐNG MẤT DỮ LIỆU KHI RENDER NGỦ ĐÔNG)
        try:
            from app.core.supabase import get_supabase_client
            db = get_supabase_client()
            db.table("cron_telemetry_state").upsert({
                "cron_id": cron_id,
                "job_name": item["job_name"],
                "sync_type": item["sync_type"],
                "status": status,
                "last_run_at": item["last_run_at"],
                "next_run_at": item["next_run_at"],
                "duration_seconds": item["duration_seconds"],
                "last_message": message,
                "total_runs": item["total_runs"],
                "failed_count": item["failed_count"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).execute()
        except Exception as up_err:
            logger.warning(f"⚠️ [Telemetry] Không thể lưu cron status vào Supabase: {up_err}")

def get_all_cron_telemetry() -> Dict[str, Dict[str, Any]]:
    return CRON_TELEMETRY