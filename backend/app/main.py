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
import inspect

# Import Core & Services
from app.core.playwright_manager import acquire_playwright_slot, force_kill_zombie_chromium, CronSlotYieldException
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
VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

def get_now_vn_str() -> str:
    return datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")

async def safe_job_wrapper(job_func, job_name: str):
    """Bọc an toàn cho cron: bẫy ngoại lệ, chống crash app và thu hồi RAM."""
    try:
        logger.info(f"🔄 [Cron Job Started] {job_name}")
        if inspect.iscoroutinefunction(job_func):
            await job_func()
        else:
            job_func()
        logger.info(f"✔️ [Cron Job Finished] {job_name}")
    except CronSlotYieldException as ye:
        logger.info(f"ℹ️ [Cron Job Yielded] {job_name}: {ye}")
    except Exception as e:
        logger.error(f"❌ [Cron Job Error] {job_name}: {str(e)}")
    finally:
        gc.collect()

async def poll_workspace_long_tasks():
    """Quét Supabase kiểm tra các batch tạo tài khoản đang waiting_poll."""
    supabase = get_supabase_client()
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()

    # Query kiểm tra task cần check
    res = supabase.table("bot_automation_tasks")\
        .select("*, inbox_tickets(*)")\
        .eq("bot_type", "workspace_rpa")\
        .eq("execution_status", "waiting_poll")\
        .lte("payload_data->>next_check_at", now_iso)\
        .order("created_at", desc=False)\
        .limit(1)\
        .execute()

    tasks_to_process = res.data or []
    if not tasks_to_process:
        return

    task = tasks_to_process[0]
    task_id = task["id"]
    task_tag = f"[Task #{str(task_id).replace('-', '')[:8]}]"
    payload = task.get("payload_data", {})
    request_id = payload.get("request_id")
    school_creds = payload.get("school_credentials", {})

    now_vn = get_now_vn_str()

    # 🛑 DIỆT TẬN GỐC BUG 'Request #None':
    if not request_id or str(request_id).strip() in ["None", "null", ""]:
        err_log = (
            f"\n[{now_vn}] [ERROR] [workspace_rpa] {task_tag}: "
            f"Không tìm thấy Request ID hợp lệ để kiểm tra kết quả batch. Đánh dấu thất bại để tránh lặp vô tận."
        )
        logger.error(f"❌ {task_tag} Thiếu Request ID hợp lệ trong waiting_poll task!")
        supabase.table("bot_automation_tasks").update({
            "execution_status": "failed",
            "last_error_step": "waiting_poll_missing_request_id",
            "execution_logs": (task.get("execution_logs") or "") + err_log
        }).eq("id", task_id).execute()
        return

    # Gọi hàm check_and_export_batch_result (bên trong hàm này đã tự quản lý acquire_playwright_slot trên lane='cron')
    download_dir = "/tmp/ptv_results"
    os.makedirs(download_dir, exist_ok=True)
    logger.info(f"🔍 [{now_vn}] {task_tag} Bắt đầu kiểm tra tiến độ Request #{request_id}...")

    try:
        check_res = await workspace_playwright_service.check_and_export_batch_result(
            credentials=school_creds,
            request_id=request_id,
            download_dir=download_dir
        )
    except CronSlotYieldException:
        logger.info(f"ℹ️ {task_tag} Nhường slot Playwright ở chu kỳ này, sẽ kiểm tra lại ở chu kỳ tiếp theo.")
        return
    except Exception as check_err:
        logger.error(f"Lỗi khi kiểm tra kết quả batch Playwright: {check_err}")
        check_res = {"status": "error", "error": str(check_err)}

        status = check_res.get("status")

        if status == "completed":
            downloaded_file = check_res.get("result_file_path")
            cof_input_path = payload.get("cof_file_path")
            final_file_to_upload = downloaded_file

            if cof_input_path and os.path.exists(cof_input_path) and downloaded_file and os.path.exists(downloaded_file):
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
                f"\n[{now_vn}] [SUCCESS] [workspace_rpa] {task_tag}: Hoàn thành tạo tài khoản (Request #{request_id})!\n"
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
                "executed_at": datetime.now(VN_TZ).isoformat()
            }).eq("id", task_id).execute()

            if task.get("ticket_id"):
                supabase.table("inbox_tickets").update({"status": "completed"}).eq("id", task["ticket_id"]).execute()

        elif status == "still_processing":
            # Nếu chưa xong, chờ thêm 5 phút cho đợt quét tiếp theo
            next_check = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
            payload["next_check_at"] = next_check
            current_sys_status = check_res.get('current_status', 'Processing')
            new_log = f"\n[{now_vn}] [INFO] [workspace_rpa] {task_tag}: Request #{request_id} vẫn đang xử lý ({current_sys_status}). Sẽ kiểm tra lại sau 5 phút."
            
            supabase.table("bot_automation_tasks").update({
                "payload_data": payload,
                "execution_logs": (task.get("execution_logs") or "") + new_log
            }).eq("id", task_id).execute()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🔥 Đang kích hoạt APScheduler (Lịch trình giãn cách chống nghẽn Render 512MB RAM)...")
    
    # Dọn dẹp process rác trước khi khởi động
    force_kill_zombie_chromium()
    gc.collect()

    base_start = datetime.now(timezone.utc)
    
    # 1. Quét Gmail mỗi 10 phút (HTTP API thuần, chạy sau 15s)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=10, 
        args=[poll_unread_gmails, "Quét Gmail"], 
        id='gmail_cron',
        next_run_time=base_start + timedelta(seconds=15),
        misfire_grace_time=180,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )
    
    # 2. Quét Form Feedback mỗi 15 phút (HTTP API thuần, chạy sau 90s)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=15, 
        args=[poll_form_feedbacks, "Quét Form Feedback"], 
        id='sheet_cron',
        next_run_time=base_start + timedelta(seconds=90),
        misfire_grace_time=180,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )

    # 3. Quét Task Workspace Long-Running mỗi 10 phút (Playwright - Giãn cách ở giây thứ 180)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=10, 
        args=[poll_workspace_long_tasks, "Quét Task Workspace Long-Running"], 
        id='workspace_long_tasks_cron',
        next_run_time=base_start + timedelta(seconds=180),
        misfire_grace_time=180,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )

    # 4. Quét OS Ticket mỗi 15 phút (Playwright - Giãn sang giây thứ 420 để không trùng slot)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=15, 
        args=[poll_open_ostickets, "Quét OS Ticket"], 
        id='osticket_cron',
        next_run_time=base_start + timedelta(seconds=420),
        misfire_grace_time=180,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )

    # 5. Quét Live Uptime định kỳ mỗi 60 phút (HTTP API - Chạy sau 20 phút / 1200s)
    scheduler.add_job(
        safe_job_wrapper, 
        'interval', 
        minutes=60, 
        args=[poll_site_uptime_cron, "Quét Site Uptime & Auth Matrix"], 
        id='site_uptime_cron',
        next_run_time=base_start + timedelta(seconds=1200),
        misfire_grace_time=300,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )
    
    # 6. Quét Workspace Distributor Cache mỗi 60 phút (Playwright - Chạy sau 40 phút / 2400s)
    scheduler.add_job(
        safe_job_wrapper,
        "interval",
        minutes=60,
        args=[
            workspace_scanner_service.scan_and_cache_all_distributors, 
            "workspace_distributor_scanner_cron"
        ],
        id="distributor_cache_scanner_cron",
        next_run_time=base_start + timedelta(seconds=2400),
        misfire_grace_time=300,
        max_instances=1,
        coalesce=True,
        replace_existing=True
    )

    scheduler.start()
    yield
    
    logger.info("🛑 Tắt APScheduler...")
    scheduler.shutdown()
    force_kill_zombie_chromium()
    gc.collect()


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