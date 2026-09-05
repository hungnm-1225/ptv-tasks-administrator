# backend/app/api/v1/endpoints/bots.py
import gc
import re
import time
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional, Tuple
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

# =============================================================================
# ⚡ IN-MEMORY CACHE CHO BOT STATUS & LOGS (TỐC ĐỘ 1MS)
# =============================================================================
class BotsMemoryCache:
    def __init__(self, default_ttl: int = 15):  # Lưu RAM 15 giây
        self._cache: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            data, expire_at = self._cache[key]
            if time.time() < expire_at:
                return data
            del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        expire_at = time.time() + (ttl if ttl is not None else 15)
        self._cache[key] = (value, expire_at)

    def invalidate(self):
        """Xóa sạch cache khi có trigger sync hoặc retry."""
        self._cache.clear()

bots_cache = BotsMemoryCache(default_ttl=15)

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

def parse_log_line_with_timestamp(line: str, fallback_time_str: str) -> Tuple[str, str, str]:
    """
    Bóc tách chính xác: (Thời gian thực tế GMT+7, Mức độ Log, Nội dung Log sạch).
    Bảo toàn timestamp gốc của từng dòng thay vì bị đè bởi executed_at.
    """
    raw = line.strip()
    actual_time = fallback_time_str
    level = "INFO"

    # 1. Trích xuất Timestamp gốc ở đầu dòng nếu có (ví dụ: [2026-09-05 14:16:31] hoặc [2026-09-05T14:16:31Z])
    ts_match = re.match(r"^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]\s*", raw)
    if ts_match:
        actual_time = format_vn_time(ts_match.group(1))
        raw = raw[ts_match.end():].strip()

    # 2. Trích xuất Level (INFO/SUCCESS/ERROR/APPROVAL/WARNING/RETRY/DEBUG)
    lvl_match = re.match(r"^\[(INFO|SUCCESS|ERROR|APPROVAL|WARNING|RETRY|DEBUG)\]\s*", raw, flags=re.IGNORECASE)
    if lvl_match:
        found_lvl = lvl_match.group(1).upper()
        level = "SUCCESS" if found_lvl in ["SUCCESS", "APPROVAL"] else ("ERROR" if found_lvl in ["ERROR", "FAILED"] else found_lvl)
        raw = raw[lvl_match.end():].strip()
    else:
        if "success" in raw.lower() or "thành công" in raw.lower():
            level = "SUCCESS"
        elif "error" in raw.lower() or "fail" in raw.lower() or "lỗi" in raw.lower():
            level = "ERROR"
        elif "warning" in raw.lower() or "cảnh báo" in raw.lower():
            level = "WARNING"

    # 3. Loại bỏ prefix tag thừa nếu có (ví dụ: [git_collaborator] hoặc [Task #...]:)
    raw = re.sub(r"^\[[\w\d_-]+\]:\s*", "", raw)

    return actual_time, level, raw.strip()


@router.get("/status")
async def get_bot_workers_status() -> Dict[str, Any]:
    """Kiểm tra trạng thái Real-time chi tiết kèm số lượng task lỗi của từng Worker (Có RAM Cache)."""
    cache_key = "bot_workers_status"
    cached = bots_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    
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
            elif b_type in ["lms_playwright", "lms_git_provisioning", "git_collaborator", "git_playwright"]:
                worker_stats["lms_git_worker"]["failed_count"] += 1
            elif b_type == "github_issue_creator":
                worker_stats["github_dispatcher"]["failed_count"] += 1
            elif b_type in ["google_doc_comment", "feedback_doc_triage"]:
                worker_stats["feedback_sheet_worker"]["failed_count"] += 1

        for k, v in worker_stats.items():
            if v["failed_count"] > 0:
                v["status"] = "degraded"

        bots_cache.set(cache_key, worker_stats, ttl=15)
    except Exception as e:
        print(f"Error checking detailed worker status: {e}")
        
    return worker_stats


@router.get("/logs")
async def get_bot_terminal_logs() -> List[Dict[str, Any]]:
    """Lấy danh sách log thực thi với dòng thời gian chính xác từng bước (Có RAM Cache)."""
    cache_key = "bot_terminal_logs"
    cached = bots_cache.get(cache_key)
    if cached is not None:
        return cached

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
            
            # Thời điểm tạo task (Approval / Queue) LUÔN lấy created_at
            created_time_str = format_vn_time(t.get("created_at"))
            # Thời điểm hoàn tất (nếu có)
            executed_time_str = format_vn_time(t.get("executed_at") or t.get("created_at"))
            
            # 1. Dòng khởi tạo trạng thái: BẮT BUỘC dùng thời điểm tạo (created_at)
            logs_output.append({
                "timestamp": created_time_str,
                "level": "INFO",
                "worker": b_type,
                "message": f"Task #{t_id_short} queued with status '{t.get('approval_status')}'",
                "raw_line": f"[{created_time_str}] [INFO] [{b_type}]: Task #{t_id_short} queued with status '{t.get('approval_status')}'"
            })
            
            # 2. Các dòng log thực thi chi tiết bên trong: Bóc tách timestamp riêng của từng dòng
            if t.get("execution_logs"):
                for line in t["execution_logs"].split("\n"):
                    if line.strip():
                        line_time, line_level, clean_msg = parse_log_line_with_timestamp(line, fallback_time_str=executed_time_str)
                        logs_output.append({
                            "timestamp": line_time,
                            "level": line_level,
                            "worker": b_type,
                            "message": clean_msg,
                            "raw_line": f"[{line_time}] [{line_level}] [{b_type}]: {clean_msg}"
                        })
            elif e_status == "success":
                logs_output.append({
                    "timestamp": executed_time_str,
                    "level": "SUCCESS",
                    "worker": b_type,
                    "message": f"Task #{t_id_short} executed successfully.",
                    "raw_line": f"[{executed_time_str}] [SUCCESS] [{b_type}]: Task #{t_id_short} executed successfully."
                })
            elif e_status == "failed":
                logs_output.append({
                    "timestamp": executed_time_str,
                    "level": "ERROR",
                    "worker": b_type,
                    "message": f"Task #{t_id_short} execution failed.",
                    "raw_line": f"[{executed_time_str}] [ERROR] [{b_type}]: Task #{t_id_short} execution failed."
                })
        
        bots_cache.set(cache_key, logs_output, ttl=10)
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
    """⚡ ÉP QUÉT NGAY LẬP TỨC CHO CÁC LUỒNG INGESTION."""
    now_str = format_vn_time(None)
    bots_cache.invalidate()
    
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
    """🧹 CHỦ ĐỘNG DỌN DẸP BỘ NHỚ RAM (GARBAGE COLLECTION)."""
    gc.collect()
    bots_cache.invalidate()
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
    bots_cache.invalidate()

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
            if worker_key == "gmail_sync_worker":
                background_tasks.add_task(poll_unread_gmails)
            elif worker_key == "osticket_sync_worker":
                background_tasks.add_task(poll_open_ostickets)
            return {
                "status": "worker_triggered",
                "message": f"Đã kích hoạt luồng [{worker_key}] thành công!",
                "timestamp": now_str
            }

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