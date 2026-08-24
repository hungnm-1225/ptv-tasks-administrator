# backend/app/api/v1/endpoints/bots.py
import re
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta
from app.core.supabase import get_supabase_client
from app.workers.bot_executor import execute_approved_bot_task

router = APIRouter()

# Định nghĩa múi giờ Việt Nam chuẩn GMT+7
VN_TZ = timezone(timedelta(hours=7))

def format_vn_time(val: Any) -> str:
    """Chuyển đổi mọi định dạng thời gian (UTC ISO, datetime) sang chuỗi giờ Việt Nam chuẩn (GMT+7)."""
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
    # Xóa timestamp đầu dòng dạng: [2026-08-24 11:42:34] hoặc [2026-08-24T11:42:34...]
    cleaned = re.sub(r"^\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]\s*", "", cleaned)
    # Xóa các tag phụ lặp lại như [INFO], [ERROR], [SUCCESS], [worker_name]:
    cleaned = re.sub(r"^\[(INFO|ERROR|SUCCESS|APPROVAL|WARNING|RETRY|DEBUG)\]\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\[[\w\d_-]+\]:\s*", "", cleaned)
    return cleaned.strip()


@router.get("/status")
async def get_bot_workers_status() -> Dict[str, str]:
    """Kiểm tra trạng thái Real-time dựa trên TASK MỚI NHẤT của từng Worker."""
    supabase = get_supabase_client()
    
    status_map = {
        "gmail_sync_worker": "active",
        "keycloak_api_worker": "active",
        "workspace_license_worker": "active",
        "lms_git_worker": "active",
        "google_doc_triage": "active",
        "github_dispatcher": "active",
    }
    
    try:
        # Lấy 30 task gần nhất để tìm task mới nhất cho từng worker
        recent_tasks = supabase.table("bot_automation_tasks")\
            .select("bot_type, execution_status, created_at")\
            .order("created_at", desc=True)\
            .limit(30)\
            .execute()
            
        checked_types = set()
        
        for task in (recent_tasks.data or []):
            b_type = task.get("bot_type")
            e_status = task.get("execution_status")
            
            # Chỉ xét trạng thái của lần chạy GẦN ĐÂY NHẤT của mỗi loại Worker
            if b_type not in checked_types:
                checked_types.add(b_type)
                
                if b_type == "keycloak_api":
                    status_map["keycloak_api_worker"] = "degraded" if e_status == "failed" else "active"
                elif b_type in ["workspace_rpa"]:
                    status_map["workspace_license_worker"] = "degraded" if e_status == "failed" else "active"
                elif b_type in ["lms_playwright", "lms_git_provisioning"]:
                    status_map["lms_git_worker"] = "degraded" if e_status == "failed" else "active"
                elif b_type in ["google_doc_comment", "feedback_doc_triage"]:
                    status_map["google_doc_triage"] = "degraded" if e_status == "failed" else "active"
                elif b_type == "github_issue_creator":
                    status_map["github_dispatcher"] = "degraded" if e_status == "failed" else "active"
                    
    except Exception as e:
        print(f"Error checking worker status: {e}")
        
    return status_map


@router.get("/logs")
async def get_bot_terminal_logs() -> List[Dict[str, Any]]:
    """Lấy danh sách log thực thi thật từ database với múi giờ Việt Nam và không trùng timestamp."""
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
            
            # 🟢 Chuẩn hóa mốc thời gian sang giờ Việt Nam (GMT+7)
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
                        # 🟢 Làm sạch nội dung log để không bị lặp lại giờ và tags
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


@router.post("/{task_id}/retry")
async def retry_bot_task(task_id: str, background_tasks: BackgroundTasks):
    """Kích hoạt chạy lại cho một Task hoặc Restart Worker."""
    supabase = get_supabase_client()
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    if not is_valid_uuid(task_id):
        worker_key = task_id
        if worker_key == "gmail_sync_worker":
            try:
                from app.services.gmail_service import poll_unread_gmails
                background_tasks.add_task(poll_unread_gmails)
            except ImportError:
                pass
        elif worker_key == "google_doc_triage":
            try:
                from app.services.google_sheet_service import poll_form_feedbacks
                background_tasks.add_task(poll_form_feedbacks)
            except ImportError:
                pass
        # 🟢 Bổ sung xử lý khi bấm Restart GitHub Dispatcher
        elif worker_key in ["github_dispatcher", "github_issue_creator"]:
            # Reset task lỗi cũ để worker trở lại trạng thái ACTIVE xanh ngay
            try:
                supabase.table("bot_automation_tasks")\
                    .update({"execution_status": "dismissed"})\
                    .eq("bot_type", "github_issue_creator")\
                    .eq("execution_status", "failed")\
                    .execute()
            except Exception as e:
                print(f"Error resetting github worker failed tasks: {e}")

        return {
            "status": "worker_restarted",
            "worker": worker_key,
            "message": f"Worker [{worker_key}] đã được kiểm tra và kích hoạt lại thành công!",
            "timestamp": now_str
        }

    try:
        task_res = supabase.table("bot_automation_tasks").select("*").eq("id", task_id).execute()
        if not task_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy task tương ứng trong database.")
        
        task = task_res.data[0]
        now_iso = datetime.now(timezone.utc).isoformat()
        
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