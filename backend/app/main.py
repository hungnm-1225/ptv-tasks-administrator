# backend/app/main.py
import gc
import os
import pytz
import logging
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Import Services
from app.services.gmail_service import poll_unread_gmails
from app.services.osticket_service import poll_open_ostickets
from app.services.google_sheet_service import poll_form_feedbacks
from app.services.site_monitor_service import poll_site_uptime_cron
from app.services.workspace_playwright_service import workspace_playwright_service
from app.services.cof_excel_service import COFExcelService
from app.core.supabase import get_supabase_client
from app.services.workspace.workspace_scanner_service import workspace_scanner_service

# Import API Router
from app.api.v1.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

async def safe_job_wrapper(job_func, job_name: str):
    """Bọc các hàm quét để bẫy lỗi, không làm sập ứng dụng và tự dọn dẹp RAM."""
    try:
        logger.info(f"🔄 [Cron Job Started] {job_name}")
        await job_func()
    except Exception as e:
        logger.error(f"❌ [Cron Job Error] {job_name}: {str(e)}")
    finally:
        gc.collect()

async def poll_workspace_long_tasks():
    """Quét Supabase mỗi 5 phút để check các đợt tạo tài khoản đang chờ kiểm tra."""
    supabase = get_supabase_client()
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()

    res = supabase.table("bot_automation_tasks")\
        .select("*, inbox_tickets(*)")\
        .eq("bot_type", "workspace_rpa")\
        .eq("execution_status", "waiting_poll")\
        .lte("payload_data->>next_check_at", now_iso)\
        .execute()

    for task in (res.data or []):
        task_id = task["id"]
        payload = task.get("payload_data", {})
        request_id = payload.get("request_id")
        school_creds = payload.get("school_credentials", {})
        download_dir = "/tmp/ptv_results"

        now_vn = datetime.now(pytz.timezone('Asia/Ho_Chi_Minh')).strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"🔍 [{now_vn}] Đang kiểm tra tiến độ Request #{request_id} cho Task #{task_id[:8]}...")

        check_res = await workspace_playwright_service.check_and_export_batch_result(
            credentials=school_creds,
            request_id=request_id,
            download_dir=download_dir
        )

        status = check_res.get("status")

        if status == "completed":
            downloaded_file = check_res["result_file_path"]
            cof_input_path = payload.get("cof_file_path")
            output_cof_path = f"/tmp/ptv_results/COMPLETED_{os.path.basename(cof_input_path or 'result.xlsx')}"

            if cof_input_path and os.path.exists(cof_input_path):
                COFExcelService.write_results_back_to_cof(
                    original_cof_path=cof_input_path,
                    result_excel_path=downloaded_file,
                    students_all=payload.get("students_all", []),
                    students_to_create=payload.get("students_to_create", []),
                    teachers_all=payload.get("teachers_all", []),
                    teachers_to_create=payload.get("teachers_to_create", []),
                    output_cof_path=output_cof_path
                )

            new_log = f"\n[{now_vn}] [SUCCESS] [workspace_rpa]: Hoàn thành tạo tài khoản (Request #{request_id}). Đã đồng bộ kết quả vào COF."

            supabase.table("bot_automation_tasks").update({
                "execution_status": "success",
                "execution_logs": (task.get("execution_logs") or "") + new_log,
                "executed_at": now_iso
            }).eq("id", task_id).execute()

            if task.get("ticket_id"):
                supabase.table("inbox_tickets").update({"status": "completed"}).eq("id", task["ticket_id"]).execute()

        elif status == "still_processing":
            next_5m = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
            payload["next_check_at"] = next_5m
            new_log = f"\n[{now_vn}] [INFO] [workspace_rpa]: Request #{request_id} vẫn đang xử lý ({check_res.get('current_status')}). Sẽ kiểm tra lại sau 5 phút."
            
            supabase.table("bot_automation_tasks").update({
                "payload_data": payload,
                "execution_logs": (task.get("execution_logs") or "") + new_log
            }).eq("id", task_id).execute()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🔥 Đang kích hoạt APScheduler 24/7...")
    
    # 1. Quét Gmail mỗi 5 phút
    scheduler.add_job(safe_job_wrapper, 'interval', minutes=5, args=[poll_unread_gmails, "Quét Gmail"], id='gmail_cron')
    
    # 2. Quét OS Ticket mỗi 5 phút
    scheduler.add_job(safe_job_wrapper, 'interval', minutes=5, args=[poll_open_ostickets, "Quét OS Ticket"], id='osticket_cron')
    
    # 3. Quét Form Feedback mỗi 5 phút
    scheduler.add_job(safe_job_wrapper, 'interval', minutes=5, args=[poll_form_feedbacks, "Quét Form Feedback"], id='sheet_cron')

    # 4. Quét Live Uptime & Auth Matrix định kỳ mỗi 30 phút (Đã sửa chuẩn cú pháp)
    scheduler.add_job(safe_job_wrapper, 'interval', minutes=30, args=[poll_site_uptime_cron, "Quét Site Uptime & Auth Matrix"], id='site_uptime_cron', replace_existing=True)

    # 5. Quét Task Workspace Long-Running mỗi 5 phút
    scheduler.add_job(safe_job_wrapper, 'interval', minutes=5, args=[poll_workspace_long_tasks, "Quét Task Workspace Long-Running"], id='workspace_long_tasks_cron')
    
    # 6. Quét Workspace Distributor để update cache mỗi 45 phút
    scheduler.add_job(
        safe_job_wrapper,
        "interval",
        minutes=45,
        args=[
            workspace_scanner_service.scan_and_cache_all_distributors, 
            "workspace_distributor_scanner_cron"
        ],
        id="distributor_cache_scanner_cron"
    )

    scheduler.start()
    yield
    
    logger.info("🛑 Tắt APScheduler...")
    scheduler.shutdown()

app = FastAPI(
    title="Pythaverse Central Admin API",
    version="1.0.0",
    lifespan=lifespan
)

origins = [
    "https://ptv-tasks-administrator.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.api_route("/api/v1/health", methods=["GET", "HEAD"])
async def health_check():
    return {
        "status": "online",
        "scheduler_running": scheduler.running,
        "active_jobs": len(scheduler.get_jobs())
    }