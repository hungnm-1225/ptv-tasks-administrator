# backend/app/api/v1/endpoints/bots.py
import gc
import re
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from app.core.supabase import get_supabase_client
from app.workers.bot_executor import execute_approved_bot_task

# Import các hàm nghiệp vụ Ingestion để ép quét trực tiếp
from app.services.gmail_service import poll_unread_gmails
from app.services.osticket_service import poll_open_ostickets
from app.services.google_sheet_service import poll_form_feedbacks
from app.services.site_monitor_service import poll_site_uptime_cron
from app.services.workspace.workspace_scanner_service import workspace_scanner_service

router = APIRouter()

# Định nghĩa múi giờ Việt Nam chuẩn GMT+7
VN_TZ = timezone(timedelta(hours=7))

def format_vn_time(val: Any) -> str:
    """Chuyển đổi mọi định dạng thời gian sang chuỗi giờ Việt Nam chuẩn (GMT+7)."""
    if not val:
        return datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(val, str):
        clean_str = val.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(clean_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return str(val)[:19].replace("T", " ")
    elif isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        return val.astimezone(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")
    return str(val)

def is_valid_uuid(val: str) -> bool:
    """Kiểm tra xem chuỗi có phải là UUID hợp lệ không."""
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False

def clean_log_message(msg: str) -> str:
    """Bóc tách bỏ timestamp và prefix tag trùng lặp đã bị lồng trong nội dung log."""
    cleaned = msg.strip()
    cleaned = re.sub(r"^\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]\s*", "", cleaned)
    cleaned = re.sub(r"^\[(INFO|ERROR|SUCCESS|APPROVAL|WARNING|RETRY|DEBUG)\]\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\[[\w\d_-]+\]:\s*", "", cleaned)
    return cleaned.strip()


@router.get("/status")
async def get_bot_workers_status() -> Dict[str, Any]:
    """Kiểm tra trạng thái Real-time chi tiết kèm số lượng task lỗi của từng Worker."""
    supabase = get_supabase_client()
    
    # Khởi tạo trạng thái mặc định
    worker_stats = {
        "gmail_sync_worker": {"status": "active", "failed_count": 0, "last_status": "idle"},
        "osticket_sync_worker": {"status": "active", "failed_count": 0, "last_status": "idle"},
        "feedback_sheet_worker": {"status": "active", "failed_count": 0, "last_status": "idle"},
        "distributor_cache_worker": {"status": "active", "failed_count": 0, "last_status": "idle"},
        "workspace_license_worker": {"status": "active", "failed_count": 0, "last_status": "idle"},
        "keycloak_api_worker": {"status": "active", "failed_count": 0, "last_status": "idle"},
        "lms_git_worker": {"status": "active", "failed_count": 0, "last_status": "idle"},
        "github_dispatcher": {"status": "active", "failed_count": 0, "last_status": "idle"},
    }
    
    try:
        # 1. Đếm số task đang bị 'failed' cho từng loại bot trong 24h qua
        failed_res = supabase.table("bot_automation_tasks")\
            .select("bot_type")\
            .eq("execution_status", "failed")\
            .execute()
            
        for row in (failed_res.data or []):
            b_type = row.get("bot_type")
            if b_type == "workspace_rpa":
                worker_stats["workspace_license_worker"]["failed_count"] += 1
            elif b_type == "keycloak_api":
                worker_stats["keycloak_api_worker"]["failed_count"] += 1
            elif b_type in ["lms_playwright", "lms_git_provisioning"]:
                worker_stats["lms_git_worker"]["failed_count"] += 1
            elif b_type == "github_issue_creator":
                worker_stats["github_dispatcher"]["failed_count"] += 1
            elif b_type in ["google_doc_comment", "feedback_doc_triage"]:
                worker_stats["feedback_sheet_worker"]["failed_count"] += 1

        # 2. Cập nhật trạng thái Degraded nếu có task lỗi
        for k, v in worker_stats.items():
            if v["failed_count"] > 0:
                v["status"] = "degraded"

    except Exception as e:
        print(f"Error checking detailed worker status: {e}")
        
    return worker_stats


@router.get("/logs")
async def get_bot_terminal_logs() -> List[Dict[str, Any]]:
    """Lấy danh sách log thực thi từ database với múi giờ Việt Nam."""
    supabase = get_supabase_client()
    logs_output = []
    
    try:
        tasks_res = supabase.table("bot_automation_tasks")\
            .select("id, bot_type, approval_status, execution_status, execution_logs, created_at, executed_at")\
            .order("created_at", desc=True)\
            .limit(30)\
            .execute()
            
        tasks = tasks_res.data or []
        
        for t in reversed(tasks):
            t_id_short = str(t.get("id"))[:8]
            b_type = t.get("bot_type") or "Worker"
            e_status = t.get("execution_status") or "queued"
            
            raw_time = t.get("executed_at") or t.get("created_at")
            time_str = format_vn_time(raw_time)
            
            logs_output.append({
                "timestamp": time_str,
                "level": "INFO",
                "worker": b_type,
                "message": f"Task #{t_id_short} queued with status '{t.get('approval_status')}'",
                "raw_line": f"[{time_str}] [INFO] [{b_type}]: Task #{t_id_short} queued with status '{t.get('approval_status')}'"
            })
            
            if t.get("execution_logs"):
                for line in t["execution_logs"].split("\n"):
                    if line.strip():
                        level = "SUCCESS" if "success" in line.lower() else "ERROR" if "error" in line.lower() or "fail" in line.lower() else "INFO"
                        cleaned_msg = clean_log_message(line)
                        if not cleaned_msg:
                            cleaned_msg = line.strip()

                        logs_output.append({
                            "timestamp": time_str,
                            "level": level,
                            "worker": b_type,
                            "message": cleaned_msg,
                            "raw_line": f"[{time_str}] [{level}] [{b_type}]: {cleaned_msg}"
                        })
            elif e_status == "success":
                logs_output.append({
                    "timestamp": time_str,
                    "level": "SUCCESS",
                    "worker": b_type,
                    "message": f"Task #{t_id_short} executed successfully.",
                    "raw_line": f"[{time_str}] [SUCCESS] [{b_type}]: Task #{t_id_short} executed successfully."
                })
            elif e_status == "failed":
                logs_output.append({
                    "timestamp": time_str,
                    "level": "ERROR",
                    "worker": b_type,
                    "message": f"Task #{t_id_short} execution failed.",
                    "raw_line": f"[{time_str}] [ERROR] [{b_type}]: Task #{t_id_short} execution failed."
                })
                
    except Exception as e:
        now_str = format_vn_time(None)
        logs_output.append({
            "timestamp": now_str,
            "level": "ERROR",
            "worker": "System",
            "message": f"Failed to fetch execution logs: {str(e)}",
            "raw_line": f"[{now_str}] [ERROR] [System]: {str(e)}"
        })

    return logs_output


@router.post("/force-sync/{sync_type}")
async def force_sync_pipeline(sync_type: str, background_tasks: BackgroundTasks):
    """⚡ ÉP QUÉT NGAY LẬP TỨC CHO CÁC LUỒNG INGESTION MÀ KHÔNG CẦN ĐỢI 5 PHÚT."""
    now_str = format_vn_time(None)
    
    if sync_type == "gmail":
        background_tasks.add_task(poll_unread_gmails)
        msg = "Đã kích hoạt quét Gmail @dtt.vn tức thì thành công!"
    elif sync_type == "osticket":
        background_tasks.add_task(poll_open_ostickets)
        msg = "Đã kích hoạt cào vé OS Ticket Support tức thì thành công!"
    elif sync_type == "sheet":
        background_tasks.add_task(poll_form_feedbacks)
        msg = "Đã kích hoạt quét Google Sheet Feedback tức thì thành công!"
    elif sync_type == "distributor_cache":
        background_tasks.add_task(workspace_scanner_service.scan_and_cache_all_distributors)
        msg = "Đã kích hoạt quét và cập nhật Cache 5 Nhà phân phối thành công!"
    elif sync_type == "site_uptime":
        background_tasks.add_task(poll_site_uptime_cron)
        msg = "Đã kích hoạt kiểm tra Uptime 10 Site thành công!"
    else:
        raise HTTPException(status_code=400, detail=f"Không hỗ trợ luồng đồng bộ: {sync_type}")

    return {
        "status": "success",
        "sync_type": sync_type,
        "message": f"[{now_str}] {msg}",
        "timestamp": now_str
    }


@router.post("/purge-memory")
async def purge_system_memory():
    """🧹 CHỦ ĐỘNG DỌN DẸP BỘ NHỚ RAM (GARBAGE COLLECTION) TRÊN RENDER 512MB RAM."""
    gc.collect()
    now_str = format_vn_time(None)
    return {
        "status": "success",
        "message": f"[{now_str}] Đã kích hoạt giải phóng bộ nhớ đệm RAM thành công!",
        "timestamp": now_str
    }


@router.post("/{task_id}/retry")
async def retry_bot_task(task_id: str, background_tasks: BackgroundTasks):
    """Kích hoạt chạy lại cho một Task cụ thể hoặc thử lại tất cả task lỗi của Worker."""
    supabase = get_supabase_client()
    now_str = format_vn_time(None)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Nếu task_id là Worker Key -> Thử lại toàn bộ các task đang bị FAILED của Worker đó
    if not is_valid_uuid(task_id):
        worker_key = task_id
        bot_type_map = {
            "workspace_license_worker": "workspace_rpa",
            "keycloak_api_worker": "keycloak_api",
            "lms_git_worker": "lms_playwright",
            "github_dispatcher": "github_issue_creator",
            "feedback_sheet_worker": "feedback_doc_triage"
        }
        
        target_bot_type = bot_type_map.get(worker_key)
        if not target_bot_type:
            # Fallback nếu là Ingestion
            if worker_key == "gmail_sync_worker":
                background_tasks.add_task(poll_unread_gmails)
            elif worker_key == "osticket_sync_worker":
                background_tasks.add_task(poll_open_ostickets)
            return {
                "status": "worker_triggered",
                "message": f"Đã kích hoạt luồng [{worker_key}] thành công!",
                "timestamp": now_str
            }

        # Tìm các task failed của bot_type này
        failed_tasks = supabase.table("bot_automation_tasks")\
            .select("*")\
            .eq("bot_type", target_bot_type)\
            .eq("execution_status", "failed")\
            .limit(5)\
            .execute()

        count = len(failed_tasks.data or [])
        if count == 0:
            return {
                "status": "no_failed_tasks",
                "message": f"Worker [{worker_key}] không có task nào bị lỗi cần chạy lại!",
                "timestamp": now_str
            }

        for t in (failed_tasks.data or []):
            supabase.table("bot_automation_tasks").update({
                "execution_status": "queued",
                "approval_status": "approved",
                "execution_logs": f"[{now_iso}] [RETRY] Auto-retry all triggered by Admin\n" + (t.get("execution_logs") or "")
            }).eq("id", t["id"]).execute()

            background_tasks.add_task(
                execute_approved_bot_task,
                bot_type=t.get("bot_type"),
                payload_data=t.get("payload_data") or {}
            )

        return {
            "status": "batch_retry_queued",
            "requeued_count": count,
            "message": f"Đã đưa {count} tác vụ lỗi của [{worker_key}] vào hàng đợi chạy lại!",
            "timestamp": now_str
        }

    # Nếu task_id là UUID cụ thể
    try:
        task_res = supabase.table("bot_automation_tasks").select("*").eq("id", task_id).execute()
        if not task_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy task tương ứng trong database.")
        
        task = task_res.data[0]
        
        supabase.table("bot_automation_tasks").update({
            "execution_status": "queued",
            "approval_status": "approved",
            "execution_logs": f"[{now_iso}] [RETRY] Manual retry triggered by Admin\n" + (task.get("execution_logs") or "")
        }).eq("id", task_id).execute()

        background_tasks.add_task(
            execute_approved_bot_task,
            bot_type=task.get("bot_type"),
            payload_data=task.get("payload_data") or {}
        )

        return {
            "status": "retry_queued",
            "task_id": task_id,
            "message": f"Tác vụ #{task_id[:8]} đã được đưa vào hàng đợi thực thi lại.",
            "timestamp": now_str
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi retry task: {str(e)}")