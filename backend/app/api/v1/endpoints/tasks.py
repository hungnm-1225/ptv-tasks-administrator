# backend/app/api/v1/endpoints/tasks.py
import time
import logging
import traceback
from typing import Optional, Dict, Any, List
from datetime import datetime
import pytz
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.core.supabase import get_supabase_client
from app.core.config import settings
from app.workers.bot_executor import execute_approved_bot_task
from app.services.workspace_lineage_service import workspace_lineage_service

logger = logging.getLogger(__name__)
router = APIRouter()

# Chuẩn hóa Múi giờ Việt Nam (GMT+7)
VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

def get_vn_time_str() -> str:
    return datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")

def get_vn_iso() -> str:
    return datetime.now(VN_TZ).isoformat()

# =============================================================================
# ⚡ IN-MEMORY CACHE CHO TASKS (TỐC ĐỘ 1MS)
# =============================================================================
class TasksMemoryCache:
    def __init__(self, default_ttl: int = 60):  # Lưu RAM 60 giây
        self._cache: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            data, expire_at = self._cache[key]
            if time.time() < expire_at:
                return data
            del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        expire_at = time.time() + (ttl if ttl is not None else 60)
        self._cache[key] = (value, expire_at)

    def invalidate(self):
        """Xóa sạch cache khi có duyệt / tạo / reject task."""
        self._cache.clear()

tasks_cache = TasksMemoryCache(default_ttl=60)


class ApproveTaskRequest(BaseModel):
    approval_status: str = "approved"
    edited_payload: Optional[Dict[str, Any]] = None


# =============================================================================
# HÀM CHẠY WORKER THẬT NGẦM DƯỚI NỀN (BỌC THÉP TOÀN DIỆN)
# =============================================================================
async def run_approved_task_worker(task_id: str, bot_type: str, payload: dict, ticket_id: Optional[str]):
    """Thực thi Worker thật, ghi log GMT+7 và bắt 100% lỗi vào Supabase Terminal."""
    supabase = get_supabase_client()
    time_str = get_vn_time_str()
    log_trail = f"[{time_str}] [APPROVAL] Approved by Admin. Dispatching worker '{bot_type}'...\n"
    
    try:
        # 1. Cập nhật task sang 'running' ngay lập tức
        supabase.table("bot_automation_tasks").update({
            "execution_status": "running",
            "execution_logs": log_trail
        }).eq("id", task_id).execute()
        tasks_cache.invalidate()

        # 2. Bổ sung thông tin Credentials phả hệ nếu là Workspace RPA
        if bot_type == "workspace_rpa":
            school_ident = payload.get("school_name") or payload.get("school_id")
            if school_ident:
                try:
                    lineage = workspace_lineage_service.resolve_by_school(school_ident)
                    if lineage:
                        payload["school_credentials"] = lineage.get("school", {})
                        payload["partner_credentials"] = lineage.get("partner", {})
                        payload["distributor_credentials"] = lineage.get("distributor", {})
                        payload["country_info"] = lineage.get("country", {})
                    else:
                        log_trail += f"[{get_vn_time_str()}] [WARNING] [Lineage]: Không tìm thấy phả hệ trường '{school_ident}', dùng credentials mặc định trong payload.\n"
                except Exception as lineage_err:
                    log_trail += f"[{get_vn_time_str()}] [WARNING] [Lineage]: Lỗi đọc phả hệ ({lineage_err}), tiếp tục chạy với payload gốc.\n"

            if not payload.get("admin_credentials"):
                payload["admin_credentials"] = {
                    "username": settings.TEST_ADMIN_USER,
                    "password": settings.TEST_ADMIN_PASS
                }

        # 3. KÍCH HOẠT WORKER THỰC THI THẬT
        execution_result = await execute_approved_bot_task(bot_type, payload)
        end_time_str = get_vn_time_str()
        
        if execution_result is None:
            execution_result = {"status": "failed", "error": f"Worker '{bot_type}' kết thúc mà không trả về dữ liệu."}

        status_res = execution_result.get("status")

        # 🟢 TRƯỜNG HỢP 1: TÁC VỤ CẦN CHỜ XỬ LÝ NGẦM (WAITING_POLL)
        if status_res in ["waiting_poll", "submitted"]:
            wait_msg = execution_result.get("message") or "Đã nộp batch, đang xếp hàng chờ xử lý ngầm..."
            log_trail += f"[{end_time_str}] [INFO] [{bot_type}]: {wait_msg}\n"

            merged_payload = {**(payload or {}), **execution_result}

            supabase.table("bot_automation_tasks").update({
                "execution_status": "waiting_poll",
                "payload_data": merged_payload,
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

        # 🟢 TRƯỜNG HỢP 2: TÁC VỤ HOÀN TẤT THỰC SỰ (SUCCESS)
        elif status_res in ["success", "simulated", "completed"] or execution_result.get("success_count", 0) > 0:
            success_msg = execution_result.get("message") or execution_result.get("issue_url") or "Thực thi tác vụ thành công!"
            log_trail += f"[{end_time_str}] [SUCCESS] [{bot_type}]: {success_msg}\n"
            
            if "execution_logs" in execution_result:
                log_trail += f"\n{execution_result['execution_logs']}\n"
            elif "logs" in execution_result:
                log_trail += f"\n--- CHI TIẾT TIẾN TRÌNH RPA ---\n{execution_result['logs']}\n"

            merged_payload = {**(payload or {}), **execution_result}

            supabase.table("bot_automation_tasks").update({
                "execution_status": "success",
                "payload_data": merged_payload,
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

            if ticket_id:
                supabase.table("inbox_tickets").update({
                    "status": "completed",
                    "updated_at": get_vn_iso()
                }).eq("id", ticket_id).execute()

        # 🔴 TRƯỜNG HỢP 3: THẤT BẠI
        else:
            err_msg = execution_result.get("error") or execution_result.get("message") or "Thất bại không rõ nguyên nhân."
            log_trail += f"[{end_time_str}] [ERROR] [{bot_type}]: {err_msg}\n"
            
            if "execution_logs" in execution_result:
                log_trail += f"\n{execution_result['execution_logs']}\n"
            elif "logs" in execution_result:
                log_trail += f"\n{execution_result['logs']}\n"

            supabase.table("bot_automation_tasks").update({
                "execution_status": "failed",
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

        tasks_cache.invalidate()

    except Exception as e:
        end_time_str = get_vn_time_str()
        full_trace = traceback.format_exc()
        err_log = f"{log_trail}[{end_time_str}] [CRITICAL ERROR] [{bot_type}]: {str(e)}\n\n[TRACEBACK]:\n{full_trace}"
        logger.error(f"❌ Lỗi thực thi Task #{task_id}: {e}\n{full_trace}")
        supabase.table("bot_automation_tasks").update({
            "execution_status": "failed",
            "execution_logs": err_log,
            "executed_at": get_vn_iso()
        }).eq("id", task_id).execute()
        tasks_cache.invalidate()


# =============================================================================
# REST API ENDPOINTS (CÓ RAM CACHE 1MS)
# =============================================================================

@router.get("", response_model=List[Dict[str, Any]])
@router.get("/", response_model=List[Dict[str, Any]])
async def list_tasks(approval_status: Optional[str] = None):
    """Lấy danh sách tasks (Đọc siêu tốc 1ms từ RAM Cache)."""
    cache_key = f"tasks_{approval_status or 'all'}"
    cached = tasks_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        supabase = get_supabase_client()
        query = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").order("created_at", desc=True)
        
        if approval_status and approval_status != "all":
            query = query.eq("approval_status", approval_status)
            
        res = query.execute()
        data = res.data or []
        tasks_cache.set(cache_key, data, ttl=60)
        return data
    except Exception as e:
        logger.error(f"❌ Lỗi khi đọc bot_automation_tasks: {e}")
        return []


@router.post("", response_model=Dict[str, Any])
@router.post("/", response_model=Dict[str, Any])
async def create_task(payload: Dict[str, Any], background_tasks: BackgroundTasks):
    """Tạo task mới. Hỗ trợ cờ run_immediately để chạy Worker ngầm ngay từ Automation Studio."""
    ticket_id = payload.get("ticket_id")
    bot_type = payload.get("bot_type", "keycloak_api")
    payload_data = payload.get("payload_data", {"action": "auto_triage", "ticket_id": ticket_id})
    
    run_immediately = payload.get("run_immediately", False) or payload.get("approval_status") == "approved"
    
    try:
        supabase = get_supabase_client()
        time_str = get_vn_time_str()
        now_iso = get_vn_iso()
        
        initial_approval = "approved" if run_immediately else "pending"
        initial_log = (
            f"[{time_str}] [INFO] [{bot_type}]: Direct dispatch from Studio by Admin. Queuing real worker for execution..."
            if run_immediately else
            f"[{time_str}] [INFO] Task queued by Admin. Standing by for approval."
        )
        
        res = supabase.table("bot_automation_tasks").insert({
            "ticket_id": ticket_id,
            "bot_type": bot_type,
            "payload_data": payload_data,
            "approval_status": initial_approval,
            "execution_status": "queued",
            "execution_logs": initial_log,
            "created_at": now_iso,
            "executed_at": now_iso if run_immediately else None
        }).execute()
        
        task_data = res.data[0] if res.data else {}
        task_id = task_data.get("id")
        
        tasks_cache.invalidate()

        if run_immediately and task_id:
            background_tasks.add_task(run_approved_task_worker, str(task_id), bot_type, payload_data, ticket_id)
            logger.info(f"⚡ [Direct Dispatch] Đã khởi chạy Worker ngầm ngay cho Task #{str(task_id)[:8]} ({bot_type})")
        
        return {
            "status": "success", 
            "data": task_data, 
            "dispatched_immediately": run_immediately,
            "message": "Đã khởi chạy Worker thành công!" if run_immediately else "Đã đưa vào hàng đợi."
        }
    except Exception as e:
        logger.error(f"❌ Lỗi tạo bot task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{task_id}/approve")
async def approve_task(task_id: str, req: ApproveTaskRequest, background_tasks: BackgroundTasks):
    supabase = get_supabase_client()
    time_str = get_vn_time_str()
    now_iso = get_vn_iso()
    
    task_res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tương ứng!")

    task = task_res.data[0]
    ticket = task.get("inbox_tickets") or {}
    bot_type = task.get("bot_type")
    payload = req.edited_payload if req.edited_payload is not None else (task.get("payload_data") or {})
    ticket_id = ticket.get("id") or task.get("ticket_id")

    supabase.table("bot_automation_tasks").update({
        "payload_data": payload,
        "approval_status": "approved",
        "execution_status": "queued",
        "execution_logs": f"[{time_str}] [INFO] [{bot_type}]: Task approved by Admin. Queuing real worker for execution...",
        "executed_at": now_iso
    }).eq("id", task_id).execute()

    tasks_cache.invalidate()
    background_tasks.add_task(run_approved_task_worker, task_id, bot_type, payload, ticket_id)

    logger.info(f"✅ Đã phê duyệt và điều phối Worker thật cho Task #{task_id[:8]} ({bot_type})")
    return {"status": "success", "message": f"Đã phê duyệt thành công tác vụ #{task_id[:8]}. Worker đang chạy ngầm dưới nền!"}


@router.put("/{task_id}/reject")
async def reject_task(task_id: str):
    """Từ chối tác vụ không thực thi."""
    supabase = get_supabase_client()
    now_iso = get_vn_iso()
    try:
        supabase.table("bot_automation_tasks").update({
            "approval_status": "rejected",
            "execution_status": "dismissed",
            "executed_at": now_iso
        }).eq("id", task_id).execute()
        
        tasks_cache.invalidate()
        return {"status": "success", "message": f"Đã từ chối tác vụ #{task_id[:8]}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))