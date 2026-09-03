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
    """Quét Supabase mỗi 1 phút để check các đợt tạo tài khoản đã đến hạn kiểm tra."""
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
        os.makedirs(download_dir, exist_ok=True)

        now_vn = datetime.now(pytz.timezone('Asia/Ho_Chi_Minh')).strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"🔍 [{now_vn}] [#{task_id[:8]}] Đến hạn kiểm tra tiến độ Request #{request_id}...")

        check_res = await workspace_playwright_service.check_and_export_batch_result(
            credentials=school_creds,
            request_id=request_id,
            download_dir=download_dir
        )

        status = check_res.get("status")

        if status == "completed":
            downloaded_file = check_res["result_file_path"]
            cof_input_path = payload.get("cof_file_path")
            final_file_to_upload = downloaded_file

            if cof_input_path and os.path.exists(cof_input_path):
                output_cof_path = f"/tmp/ptv_results/COMPLETED_{os.path.basename(cof_input_path)}"
                try:
                    COFExcelService.write_results_back_to_cof(
                        original_cof_path=cof_input_path,
                        result_excel_path=downloaded_file,
                        students_all=payload.get("students_all", []),
                        students_to_create=payload.get("students_to_create", []),
                        teachers_all=payload.get("teachers_all", []),
                        teachers_to_create=payload.get("teachers_to_create", []),
                        output_cof_path=output_cof_path
                    )
                    final_file_to_upload = output_cof_path
                except Exception as cof_err:
                    logger.error(f"Lỗi ghi ngược COF: {cof_err}")

            storage_path = f"results/RESULT_{request_id}_{os.path.basename(final_file_to_upload)}"
            try:
                with open(final_file_to_upload, "rb") as f_up:
                    supabase.storage.from_("ticket-attachments").upload(
                        storage_path, f_up, file_options={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "upsert": "true"}
                    )
                result_url = supabase.storage.from_("ticket-attachments").get_public_url(storage_path)
            except Exception as up_err:
                logger.error(f"Lỗi tải kết quả lên Storage: {up_err}")
                result_url = "N/A"

            student_c = payload.get("student_count", 0)
            teacher_c = payload.get("teacher_count", 0)
            total_c = payload.get("total_count", 0)

            new_log = (
                f"\n[{now_vn}] [SUCCESS] [workspace_rpa] [#{task_id[:8]}]: Hoàn thành tạo tài khoản (Request #{request_id})!\n"
                f"📊 Thống kê: {total_c} tài khoản (Học sinh: {student_c}, Giáo viên: {teacher_c})\n"
                f"📥 Link tải file kết quả: {result_url}"
            )

            payload["result_file_url"] = result_url

            supabase.table("bot_automation_tasks").update({
                "execution_status": "success",
                "current_step": "completed",
                "last_error_step": None,
                "payload_data": payload,
                "execution_logs": (task.get("execution_logs") or "") + new_log,
                "executed_at": datetime.now(pytz.timezone('Asia/Ho_Chi_Minh')).isoformat()
            }).eq("id", task_id).execute()

            if task.get("ticket_id"):
                supabase.table("inbox_tickets").update({"status": "completed"}).eq("id", task["ticket_id"]).execute()

        elif status == "still_processing":
            next_60s = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()
            payload["next_check_at"] = next_60s
            new_log = f"\n[{now_vn}] [INFO] [workspace_rpa] [#{task_id[:8]}]: Request #{request_id} vẫn đang xử lý ({check_res.get('current_status')}). Sẽ kiểm tra lại sau 60s."
            
            supabase.table("bot_automation_tasks").update({
                "payload_data": payload,
                "execution_logs": (task.get("execution_logs") or "") + new_log
            }).eq("id", task_id).execute()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🔥 Đang kích hoạt APScheduler 24/7 (Chế độ So Le & Chống Tràn RAM)...")
    
    # Mốc thời gian xuất phát lệch pha
    base_start = datetime.now(timezone.utc)
    
    # 1. Quét Gmail mỗi 5 phút (Khởi chạy sau 5s)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=5, 
        args=[poll_unread_gmails, "Quét Gmail"], 
        id='gmail_cron',
        next_run_time=base_start + timedelta(seconds=5),
        misfire_grace_time=120,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )
    
    # 2. Quét OS Ticket mỗi 5 phút (Khởi chạy sau 65s - Lệch 1 phút)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=5, 
        args=[poll_open_ostickets, "Quét OS Ticket"], 
        id='osticket_cron',
        next_run_time=base_start + timedelta(seconds=65),
        misfire_grace_time=120,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )
    
    # 3. Quét Form Feedback mỗi 5 phút (Khởi chạy sau 125s - Lệch 2 phút)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=5, 
        args=[poll_form_feedbacks, "Quét Form Feedback"], 
        id='sheet_cron',
        next_run_time=base_start + timedelta(seconds=125),
        misfire_grace_time=120,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )

    # 4. Quét Task Workspace Long-Running mỗi 3 phút (Khởi chạy sau 185s - Lệch 3 phút)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=3, 
        args=[poll_workspace_long_tasks, "Quét Task Workspace Long-Running"], 
        id='workspace_long_tasks_cron',
        next_run_time=base_start + timedelta(seconds=185),
        misfire_grace_time=120,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )

    # 5. Quét Live Uptime & Auth Matrix định kỳ mỗi 30 phút (Khởi chạy sau 245s - Lệch 4 phút)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=30, 
        args=[poll_site_uptime_cron, "Quét Site Uptime & Auth Matrix"], 
        id='site_uptime_cron',
        next_run_time=base_start + timedelta(seconds=245),
        misfire_grace_time=120,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )
    
    # 6. Quét Workspace Distributor để update cache mỗi 45 phút (Khởi chạy sau 305s - Lệch 5 phút)
    scheduler.add_job(
        safe_job_wrapper,
        "interval",
        minutes=45,
        args=[
            workspace_scanner_service.scan_and_cache_all_distributors, 
            "workspace_distributor_scanner_cron"
        ],
        id="distributor_cache_scanner_cron",
        next_run_time=base_start + timedelta(seconds=305),
        misfire_grace_time=120,
        max_instances=1,
        coalesce=True,
        replace_existing=True
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

# 🟢 Cấu hình chuẩn duy nhất cho CORSMiddleware
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