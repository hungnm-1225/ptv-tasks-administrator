# backend/app/api/v1/endpoints/bots.py
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List
from datetime import datetime, timezone
from app.core.supabase import get_supabase_client
from app.workers.bot_executor import execute_approved_bot_task

router = APIRouter()

def is_valid_uuid(val: str) -> bool:
    """Kiểm tra xem chuỗi có phải là UUID hợp lệ không."""
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


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
    """Lấy danh sách log thực thi thật từ database."""
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
            time_str = (t.get("executed_at") or t.get("created_at") or datetime.now(timezone.utc).isoformat())[:19].replace("T", " ")
            
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
                        logs_output.append({
                            "timestamp": time_str,
                            "level": level,
                            "worker": b_type,
                            "message": line.strip(),
                            "raw_line": f"[{time_str}] [{level}] [{b_type}]: {line.strip()}"
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
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
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
                
        return {
            "status": "worker_restarted",
            "worker": worker_key,
            "message": f"Worker [{worker_key}] đã được kích hoạt chu kỳ kiểm tra mới thành công!",
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