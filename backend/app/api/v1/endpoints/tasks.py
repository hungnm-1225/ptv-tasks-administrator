# backend/app/api/v1/endpoints/tasks.py
import time
import uuid
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

def format_task_tag(task_id: Optional[str]) -> str:
    """Tạo tag định danh chuẩn [Task #12345678]"""
    if not task_id:
        return "[Task #UNKNOWN]"
    clean_id = str(task_id).replace("-", "")
    return f"[Task #{clean_id[:8]}]"

# =============================================================================
# ⚡ IN-MEMORY CACHE CHO TASKS (TỐC ĐỘ 1MS)
# =============================================================================
class TasksMemoryCache:
    def __init__(self, default_ttl: int = 60):
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
        """Xóa sạch cache khi có duyệt / tạo / cập nhật task."""
        self._cache.clear()

tasks_cache = TasksMemoryCache(default_ttl=60)


class ApproveTaskRequest(BaseModel):
    approval_status: str = "approved"
    edited_payload: Optional[Dict[str, Any]] = None


# =============================================================================
# HÀM CHẠY WORKER THẬT NGẦM DƯỚI NỀN (CRASH GUARD BỌC THÉP)
# =============================================================================
async def run_approved_task_worker(task_id: str, bot_type: str, payload: dict, ticket_id: Optional[str]):
    """Thực thi Worker thật, gắn nhãn [Task #ID], ghi log GMT+7 và chống treo task 100%."""
    supabase = get_supabase_client()
    time_str = get_vn_time_str()
    tag = format_task_tag(task_id)
    
    log_trail = f"[{time_str}] [APPROVAL] [{bot_type}] {tag}: Approved by Admin. Dispatching worker for execution...\n"
    
    try:
        # 1. Cập nhật task sang 'running' ngay lập tức
        supabase.table("bot_automation_tasks").update({
            "execution_status": "running",
            "execution_logs": log_trail,
            "executed_at": get_vn_iso()
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
                        log_trail += f"[{get_vn_time_str()}] [INFO] [workspace_rpa] {tag}: Đã phân giải phả hệ thành công cho trường '{school_ident}'.\n"
                    else:
                        log_trail += f"[{get_vn_time_str()}] [WARNING] [workspace_rpa] {tag}: Không tìm thấy phả hệ trường '{school_ident}', dùng credentials trong payload.\n"
                except Exception as lineage_err:
                    log_trail += f"[{get_vn_time_str()}] [WARNING] [workspace_rpa] {tag}: Lỗi đọc phả hệ ({lineage_err}), tiếp tục với payload gốc.\n"

            if not payload.get("admin_credentials"):
                admin_pass = getattr(settings, "KEYCLOAK_ADMIN_PASS", None) or getattr(settings, "TEST_ADMIN_PASS", None)
                payload["admin_credentials"] = {
                    "username": getattr(settings, "TEST_ADMIN_USER", "salesadmin@dtt.vn"),
                    "password": admin_pass or ""
                }

        # 3. KÍCH HOẠT WORKER THỰC THI THẬT (KÈM TASK_ID ĐỂ TRUY VẾT)
        execution_result = await execute_approved_bot_task(bot_type, payload, task_id=task_id)
        end_time_str = get_vn_time_str()
        
        if execution_result is None:
            execution_result = {"status": "failed", "error": f"Worker '{bot_type}' kết thúc mà không trả về dữ liệu."}

        status_res = execution_result.get("status")
        res_checkpoint = execution_result.get("checkpoint") or payload.get("checkpoint") or {}
        current_step = execution_result.get("current_step") or payload.get("current_step")

        # 🟢 TRƯỜNG HỢP 1: TÁC VỤ CẦN CHỜ XỬ LÝ NGẦM (WAITING_POLL)
        if status_res in ["waiting_poll", "submitted"]:
            wait_msg = execution_result.get("message") or "Đã nộp batch, đang xếp hàng chờ kiểm tra tiến độ..."
            log_trail += f"[{end_time_str}] [INFO] [{bot_type}] {tag}: {wait_msg}\n"

            merged_payload = {**(payload or {}), **execution_result, "checkpoint": res_checkpoint}

            supabase.table("bot_automation_tasks").update({
                "execution_status": "waiting_poll",
                "current_step": current_step or "waiting_poll",
                "payload_data": merged_payload,
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

        # 🟢 TRƯỜNG HỢP 2: TÁC VỤ HOÀN TẤT THÀNH CÔNG (SUCCESS)
        elif status_res in ["success", "simulated", "completed"] or (execution_result.get("success_count", 0) > 0 and not execution_result.get("failed_count")):
            success_msg = execution_result.get("message") or execution_result.get("issue_url") or "Thực thi tác vụ thành công!"
            log_trail += f"[{end_time_str}] [SUCCESS] [{bot_type}] {tag}: {success_msg}\n"
            
            if "execution_logs" in execution_result:
                log_trail += f"\n{execution_result['execution_logs']}\n"
            elif "logs" in execution_result:
                log_trail += f"\n--- TIẾN TRÌNH THỰC THI ---\n{execution_result['logs']}\n"

            merged_payload = {**(payload or {}), **execution_result, "checkpoint": res_checkpoint}

            supabase.table("bot_automation_tasks").update({
                "execution_status": "success",
                "current_step": "completed",
                "last_error_step": None,
                "payload_data": merged_payload,
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

            # Tự động đóng Ticket nếu có liên kết
            if ticket_id:
                try:
                    supabase.table("inbox_tickets").update({
                        "status": "completed",
                        "updated_at": get_vn_iso()
                    }).eq("id", ticket_id).execute()
                except Exception as t_err:
                    logger.warning(f"Không thể đóng ticket #{ticket_id}: {t_err}")

        # 🟡 TRƯỜNG HỢP 3: HOÀN THÀNH MỘT PHẦN (PARTIAL_SUCCESS)
        elif status_res == "partial_success":
            part_msg = execution_result.get("error") or execution_result.get("message") or "Tác vụ hoàn thành một phần."
            log_trail += f"[{end_time_str}] [WARNING] [{bot_type}] {tag} [PARTIAL SUCCESS]: {part_msg}\n"
            if "logs" in execution_result:
                log_trail += f"\n{execution_result['logs']}\n"

            merged_payload = {**(payload or {}), **execution_result, "checkpoint": res_checkpoint}

            supabase.table("bot_automation_tasks").update({
                "execution_status": "partial_success",
                "current_step": current_step,
                "last_error_step": current_step,
                "payload_data": merged_payload,
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

        # 🔴 TRƯỜNG HỢP 4: THẤT BẠI CÓ KIỂM SOÁT (LƯU CHECKPOINT ĐỂ RESUME)
        else:
            err_msg = execution_result.get("error") or execution_result.get("message") or "Thất bại không rõ nguyên nhân."
            log_trail += f"[{end_time_str}] [ERROR] [{bot_type}] {tag}: {err_msg}\n"
            
            if "execution_logs" in execution_result:
                log_trail += f"\n{execution_result['execution_logs']}\n"
            elif "logs" in execution_result:
                log_trail += f"\n{execution_result['logs']}\n"

            # 🎯 BẢO LƯU CHECKPOINT VÀO PAYLOAD ĐỂ LẦN RETRY SAU CHỈ CẦN RESUME
            merged_payload = {**(payload or {}), **execution_result, "checkpoint": res_checkpoint}

            supabase.table("bot_automation_tasks").update({
                "execution_status": "failed",
                "current_step": current_step,
                "last_error_step": current_step,
                "payload_data": merged_payload,
                "execution_logs": log_trail,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()

        tasks_cache.invalidate()

    except Exception as e:
        # 🛡️ BẪY LỖI SẬP TIẾN TRÌNH NGOẠI LỆ (CHỐNG TREO TASK)
        end_time_str = get_vn_time_str()
        full_trace = traceback.format_exc()
        err_log = f"{log_trail}[{end_time_str}] [CRITICAL ERROR] [{bot_type}] {tag}: {str(e)}\n\n[TRACEBACK]:\n{full_trace}"
        logger.error(f"❌ [CRASH GUARD] Lỗi sập Task {tag}: {e}\n{full_trace}")
        
        try:
            supabase.table("bot_automation_tasks").update({
                "execution_status": "failed",
                "execution_logs": err_log,
                "executed_at": get_vn_iso()
            }).eq("id", task_id).execute()
        except Exception as db_err:
            logger.critical(f"❌ Không thể ghi log thất bại cho task {tag}: {db_err}")
            
        tasks_cache.invalidate()


# =============================================================================
# REST API ENDPOINTS
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
    """Tạo task mới. Tạo sẵn Task UUID để gắn tag định danh ngay từ dòng log đầu tiên."""
    ticket_id = payload.get("ticket_id")
    bot_type = payload.get("bot_type", "keycloak_api")
    payload_data = payload.get("payload_data", {"action": "auto_triage", "ticket_id": ticket_id})
    
    run_immediately = payload.get("run_immediately", False) or payload.get("approval_status") == "approved"
    
    # 🟢 TẠO TRƯỚC UUID ĐỂ GẮN VÀO LOG NGAY LẬP TỨC
    task_id = str(uuid.uuid4())
    tag = format_task_tag(task_id)
    payload_data["task_id"] = task_id

    try:
        supabase = get_supabase_client()
        time_str = get_vn_time_str()
        now_iso = get_vn_iso()
        
        initial_approval = "approved" if run_immediately else "pending"
        initial_log = (
            f"[{time_str}] [INFO] [{bot_type}] {tag}: Direct dispatch from Studio by Admin. Queuing worker for execution..."
            if run_immediately else
            f"[{time_str}] [INFO] [{bot_type}] {tag}: Task created by Admin. Standing by for approval in Queue."
        )
        
        res = supabase.table("bot_automation_tasks").insert({
            "id": task_id,
            "ticket_id": ticket_id,
            "bot_type": bot_type,
            "payload_data": payload_data,
            "approval_status": initial_approval,
            "execution_status": "queued",
            "execution_logs": initial_log,
            "created_at": now_iso,
            "executed_at": now_iso if run_immediately else None
        }).execute()
        
        task_data = res.data[0] if res.data else {"id": task_id}
        tasks_cache.invalidate()

        if run_immediately:
            background_tasks.add_task(run_approved_task_worker, task_id, bot_type, payload_data, ticket_id)
            logger.info(f"⚡ [Direct Dispatch] Đã khởi chạy Worker ngầm cho {tag} ({bot_type})")
        
        return {
            "status": "success", 
            "data": task_data, 
            "dispatched_immediately": run_immediately,
            "message": f"Đã khởi chạy Worker cho {tag}!" if run_immediately else f"Đã đưa {tag} vào hàng đợi."
        }
    except Exception as e:
        logger.error(f"❌ Lỗi tạo bot task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{task_id}/approve")
async def approve_task(task_id: str, req: ApproveTaskRequest, background_tasks: BackgroundTasks):
    supabase = get_supabase_client()
    time_str = get_vn_time_str()
    now_iso = get_vn_iso()
    tag = format_task_tag(task_id)
    
    task_res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tương ứng!")

    task = task_res.data[0]
    ticket = task.get("inbox_tickets") or {}
    bot_type = task.get("bot_type")
    payload = req.edited_payload if req.edited_payload is not None else (task.get("payload_data") or {})
    payload["task_id"] = task_id
    ticket_id = ticket.get("id") or task.get("ticket_id")

    supabase.table("bot_automation_tasks").update({
        "payload_data": payload,
        "approval_status": "approved",
        "execution_status": "queued",
        "execution_logs": f"[{time_str}] [INFO] [{bot_type}] {tag}: Task approved by Admin. Queuing worker for execution...",
        "executed_at": now_iso
    }).eq("id", task_id).execute()

    tasks_cache.invalidate()
    background_tasks.add_task(run_approved_task_worker, task_id, bot_type, payload, ticket_id)

    logger.info(f"✅ Đã phê duyệt và khởi chạy Worker cho {tag} ({bot_type})")
    return {"status": "success", "message": f"Đã phê duyệt thành công tác vụ {tag}. Worker đang thực thi ngầm!"}


@router.put("/{task_id}/retry")
async def retry_task(task_id: str, background_tasks: BackgroundTasks):
    """API Chạy lại (Retry) tác vụ bị lỗi - Nhận diện Checkpoint để Resume, chống chạy lại từ đầu."""
    supabase = get_supabase_client()
    time_str = get_vn_time_str()
    now_iso = get_vn_iso()
    tag = format_task_tag(task_id)
    
    task_res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tương ứng để chạy lại!")

    task = task_res.data[0]
    bot_type = task.get("bot_type")
    payload = task.get("payload_data") or {}
    payload["task_id"] = task_id
    ticket_id = task.get("ticket_id")
    
    checkpoint = payload.get("checkpoint", {})
    last_step = task.get("current_step") or task.get("last_error_step")
    retry_count = (task.get("retry_count") or 0) + 1

    resume_msg = f"Tiếp tục thực thi từ checkpoint bước: [{last_step}]" if checkpoint and last_step else "Khởi chạy lại từ đầu"
    retry_log = f"[{time_str}] [INFO] [{bot_type}] {tag}: Manual retry #{retry_count} triggered by Admin. {resume_msg}...\n"

    supabase.table("bot_automation_tasks").update({
        "approval_status": "approved",
        "execution_status": "queued",
        "retry_count": retry_count,
        "execution_logs": retry_log,
        "executed_at": now_iso
    }).eq("id", task_id).execute()

    tasks_cache.invalidate()
    background_tasks.add_task(run_approved_task_worker, task_id, bot_type, payload, ticket_id)

    logger.info(f"🔄 Đã kích hoạt chạy lại Worker cho {tag} ({bot_type}) - Retry #{retry_count} ({resume_msg})")
    return {"status": "success", "message": f"Đã kích hoạt chạy lại tác vụ {tag} (Lần #{retry_count})! {resume_msg}."}


@router.put("/{task_id}/reject")
async def reject_task(task_id: str):
    """Từ chối tác vụ không thực thi."""
    supabase = get_supabase_client()
    now_iso = get_vn_iso()
    tag = format_task_tag(task_id)
    try:
        supabase.table("bot_automation_tasks").update({
            "approval_status": "rejected",
            "execution_status": "dismissed",
            "executed_at": now_iso
        }).eq("id", task_id).execute()
        
        tasks_cache.invalidate()
        return {"status": "success", "message": f"Đã từ chối tác vụ {tag}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))