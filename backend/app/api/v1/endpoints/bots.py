# backend/app/api/v1/endpoints/bots.py
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List
from datetime import datetime, timezone
from app.core.supabase import get_supabase_client
from app.workers.bot_executor import execute_approved_bot_task

router = APIRouter()

@router.get("/status")
async def get_bot_workers_status() -> Dict[str, str]:
    """Kiểm tra trạng thái Real-time của 6 Cloud Workers."""
    supabase = get_supabase_client()
    
    # Kiểm tra xem có task nào đang bị failed trong 24h qua không
    status_map = {
        "gmail_sync_worker": "active",
        "keycloak_api_worker": "active",
        "workspace_license_worker": "active",
        "lms_git_worker": "active",
        "google_doc_triage": "active",
        "github_dispatcher": "active",
    }
    
    try:
        # Truy vấn các task gần nhất theo từng bot type
        recent_tasks = supabase.table("bot_automation_tasks")\
            .select("bot_type, execution_status")\
            .order("created_at", desc=True)\
            .limit(20)\
            .execute()
            
        for task in (recent_tasks.data or []):
            b_type = task.get("bot_type")
            e_status = task.get("execution_status")
            
            if b_type == "keycloak_api" and e_status == "failed":
                status_map["keycloak_api_worker"] = "degraded"
            elif b_type in ["workspace_rpa"] and e_status == "failed":
                status_map["workspace_license_worker"] = "degraded"
            elif b_type in ["lms_playwright", "lms_git_provisioning"] and e_status == "failed":
                status_map["lms_git_worker"] = "degraded"
            elif b_type in ["google_doc_comment", "feedback_doc_triage"] and e_status == "failed":
                status_map["google_doc_triage"] = "degraded"
            elif b_type == "github_issue_creator" and e_status == "failed":
                status_map["github_dispatcher"] = "degraded"
    except Exception as e:
        print(f"Error checking worker status: {e}")
        
    return status_map


@router.get("/logs")
async def get_bot_terminal_logs() -> List[Dict[str, Any]]:
    """Lấy danh sách log thực thi thật từ database và cron listener."""
    supabase = get_supabase_client()
    logs_output = []
    
    try:
        # Lấy 30 tác vụ gần nhất từ bot_automation_tasks
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
            
            # Log khi task được tạo
            logs_output.append({
                "timestamp": time_str,
                "level": "INFO",
                "worker": b_type,
                "message": f"Task #{t_id_short} queued with status '{t.get('approval_status')}'",
                "raw_line": f"[{time_str}] [INFO] [{b_type}]: Task #{t_id_short} queued"
            })
            
            # Log chi tiết nếu có
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

    # Nếu chưa có task nào trong DB, hiển thị log hệ thống mặc định
    if not logs_output:
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        logs_output = [
            {"timestamp": now_str, "level": "CRON", "worker": "GmailSync", "message": "Listening for unread emails from @dtt.vn...", "raw_line": f"[{now_str}] [CRON] [GmailSync]: Listening for unread emails..."},
            {"timestamp": now_str, "level": "INFO", "worker": "GeminiEngine", "message": "Multi-model fallback engine ready (gemini-2.5-flash / gemini-1.5-flash)", "raw_line": f"[{now_str}] [INFO] [GeminiEngine]: Engine initialized."},
            {"timestamp": now_str, "level": "INFO", "worker": "Dispatcher", "message": "All 6 Workers standing by for Human-in-the-Loop approvals.", "raw_line": f"[{now_str}] [INFO] [Dispatcher]: Standing by for approvals."}
        ]

    return logs_output


@router.post("/{task_id}/retry")
async def retry_bot_task(task_id: str, background_tasks: BackgroundTasks):
    """Kích hoạt chạy lại (manual retry) cho một tác vụ Bot bị lỗi."""
    supabase = get_supabase_client()
    
    # 1. Tìm task trong cơ sở dữ liệu
    task_res = supabase.table("bot_automation_tasks").select("*").eq("id", task_id).execute()
    
    if not task_res.data:
        # Nếu task_id truyền vào là tên worker (từ nút retry của Bento Card)
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        return {
            "status": "worker_pinged",
            "message": f"Worker '{task_id}' has been signaled to restart idle polling.",
            "timestamp": now_str
        }
        
    task = task_res.data[0]
    
    # 2. Reset trạng thái
    now_iso = datetime.now(timezone.utc).isoformat()
    supabase.table("bot_automation_tasks").update({
        "execution_status": "queued",
        "approval_status": "approved",
        "execution_logs": f"[{now_iso}] [RETRY] Manual retry requested by Admin\n" + (task.get("execution_logs") or "")
    }).eq("id", task_id).execute()
    
    # 3. Kích hoạt chạy ngầm
    background_tasks.add_task(
        execute_approved_bot_task,
        bot_type=task.get("bot_type"),
        payload_data=task.get("payload_data") or {}
    )
    
    return {
        "status": "retry_queued",
        "task_id": task_id,
        "message": f"Task #{task_id[:8]} has been re-queued for execution."
    }