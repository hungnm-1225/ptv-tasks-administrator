# backend/app/main.py
import gc
import os
import pytz
import logging
import asyncio
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
    """
    Quét Supabase kiểm tra các batch tạo tài khoản đang waiting_poll.
    Fail-closed toàn diện: Xử lý triệt để lỗi Request #None và tự động Resume Workflow hạ nguồn.
    """
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
    workflow_id = payload.get("workflow_id")
    workflow_step_id = payload.get("workflow_step_id")

    now_vn = get_now_vn_str()

    # 🛑 1. DIỆT TẬN GỐC BUG 'Request #None' (FAIL-CLOSED TOÀN DIỆN)
    if not request_id or str(request_id).strip() in ["None", "null", ""]:
        err_msg = "Không tìm thấy Request ID hợp lệ để kiểm tra kết quả batch (Request #None)."
        err_log = f"\n[{now_vn}] [ERROR] [workspace_rpa] {task_tag}: {err_msg} Đánh dấu thất bại để tránh lặp vô tận."
        logger.error(f"❌ {task_tag} {err_msg}")

        supabase.table("bot_automation_tasks").update({
            "execution_status": "failed",
            "last_error_step": "waiting_poll_missing_request_id",
            "execution_logs": (task.get("execution_logs") or "") + err_log
        }).eq("id", task_id).execute()

        if workflow_id:
            wf_res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
            proposal_id = None
            if wf_res.data:
                wf_record = wf_res.data[0]
                proposal_id = wf_record.get("proposal_id") # << PHA E: LẤY PROPOSAL_ID
                wf_steps = wf_record.get("steps") or []
                for s in wf_steps:
                    if s.get("step_id") == workflow_step_id or s.get("capability_id") == "workspace.poll_account_batch":
                        s["status"] = "failed"
                        s["error_message"] = err_msg

                supabase.table("automation_workflows").update({
                    "steps": wf_steps,
                    "status": "failed",
                    "updated_at": now_iso
                }).eq("id", workflow_id).execute()

            # Ghi Audit Event: FAILED (ĐÓNG DẤU PROPOSAL_ID)
            try:
                supabase.table("workflow_execution_events").insert({
                    "proposal_id": proposal_id, # << PHA E
                    "workflow_id": workflow_id,
                    "step_id": workflow_step_id or "poll_account_batch",
                    "event_type": "failed",
                    "error": err_msg,
                    "actor": "cron_workspace_long_tasks",
                    "created_at": now_iso
                }).execute()
            except Exception as ev_err:
                logger.warning(f"Lỗi ghi execution event missing_request_id: {ev_err}")
        return

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

    # 🟢 2. BATCH HOÀN TẤT THÀNH CÔNG (COMPLETED)
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
        check_res["result_file_url"] = result_url

        supabase.table("bot_automation_tasks").update({
            "execution_status": "success",
            "current_step": "completed",
            "last_error_step": None,
            "payload_data": payload,
            "execution_logs": (task.get("execution_logs") or "") + new_log,
            "executed_at": datetime.now(VN_TZ).isoformat()
        }).eq("id", task_id).execute()

        # 🎯 RESUME WORKFLOW HẠ NGUỒN NẾU TASK NẰM TRONG MỘT WORKFLOW
        if workflow_id:
            logger.info(f"🔄 {task_tag} Task thuộc Workflow #{workflow_id[:8]}, tiến hành resume các bước tiếp theo...")
            wf_res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
            if wf_res.data:
                wf_record = wf_res.data[0]
                proposal_id = wf_record.get("proposal_id") # << PHA E: LẤY PROPOSAL_ID
                wf_steps = wf_record.get("steps") or []
                for s in wf_steps:
                    if s.get("step_id") == workflow_step_id or s.get("capability_id") == "workspace.poll_account_batch":
                        s["status"] = "success"
                        s["outputs"] = check_res
                        s["completed_at"] = now_iso

                supabase.table("automation_workflows").update({
                    "steps": wf_steps,
                    "status": "running",
                    "updated_at": now_iso
                }).eq("id", workflow_id).execute()

                # Ghi Audit Event: SUCCEEDED (ĐÓNG DẤU PROPOSAL_ID)
                try:
                    supabase.table("workflow_execution_events").insert({
                        "proposal_id": proposal_id, # << PHA E
                        "workflow_id": workflow_id,
                        "step_id": workflow_step_id or "poll_account_batch",
                        "event_type": "succeeded",
                        "outputs": check_res,
                        "actor": "cron_workspace_long_tasks",
                        "created_at": now_iso
                    }).execute()
                except Exception as ev_err:
                    logger.warning(f"Lỗi ghi audit event poll success: {ev_err}")

                from app.services.workflow_executor import workflow_executor_service
                asyncio.create_task(workflow_executor_service.execute_approved_workflow(workflow_id))
        else:
            # Nếu là task độc lập không qua workflow, mới đánh dấu completed ticket
            if task.get("ticket_id"):
                supabase.table("inbox_tickets").update({"status": "completed"}).eq("id", task["ticket_id"]).execute()

    # ⏳ 3. BATCH VẪN ĐANG XỬ LÝ (STILL PROCESSING)
    elif status == "still_processing":
        next_check = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        payload["next_check_at"] = next_check
        current_sys_status = check_res.get('current_status', 'Processing')
        new_log = f"\n[{now_vn}] [INFO] [workspace_rpa] {task_tag}: Request #{request_id} vẫn đang xử lý ({current_sys_status}). Sẽ kiểm tra lại sau 5 phút."
        
        supabase.table("bot_automation_tasks").update({
            "payload_data": payload,
            "execution_logs": (task.get("execution_logs") or "") + new_log
        }).eq("id", task_id).execute()

    # 🔴 4. BATCH THẤT BẠI HOẶC LỖI HỆ THỐNG (FAILED / ERROR)
    elif status in ["failed", "error"]:
        err_msg = check_res.get("error") or "Lỗi kiểm tra tiến độ batch tài khoản trên School Workspace."
        new_log = f"\n[{now_vn}] [ERROR] [workspace_rpa] {task_tag}: Batch Request #{request_id} thất bại: {err_msg}"
        logger.error(f"❌ {task_tag} {err_msg}")

        supabase.table("bot_automation_tasks").update({
            "execution_status": "failed",
            "last_error_step": "batch_processing_failed",
            "execution_logs": (task.get("execution_logs") or "") + new_log
        }).eq("id", task_id).execute()

        if workflow_id:
            wf_res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
            proposal_id = None
            if wf_res.data:
                wf_record = wf_res.data[0]
                proposal_id = wf_record.get("proposal_id") # << PHA E: LẤY PROPOSAL_ID
                wf_steps = wf_record.get("steps") or []
                for s in wf_steps:
                    if s.get("step_id") == workflow_step_id or s.get("capability_id") == "workspace.poll_account_batch":
                        s["status"] = "failed"
                        s["error_message"] = err_msg

                supabase.table("automation_workflows").update({
                    "steps": wf_steps,
                    "status": "failed",
                    "updated_at": now_iso
                }).eq("id", workflow_id).execute()

            # Ghi Audit Event: FAILED (ĐÓNG DẤU PROPOSAL_ID)
            try:
                supabase.table("workflow_execution_events").insert({
                    "proposal_id": proposal_id, # << PHA E
                    "workflow_id": workflow_id,
                    "step_id": workflow_step_id or "poll_account_batch",
                    "event_type": "failed",
                    "error": err_msg,
                    "actor": "cron_workspace_long_tasks",
                    "created_at": now_iso
                }).execute()
            except Exception as ev_err:
                logger.warning(f"Lỗi ghi audit event poll failed: {ev_err}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🔥 Đang kích hoạt APScheduler (Lập lịch so le bảo vệ Render 512MB RAM)...")
    
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