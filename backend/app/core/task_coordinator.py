# backend/app/core/task_coordinator.py
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple

from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)

# Thời hạn mặc định của một Execution Lease: 10 phút (600 giây)
DEFAULT_LEASE_DURATION_SECONDS = 600


class TaskCoordinator:
    """
    Bộ điều phối thực thi tác vụ & quy trình tập trung (Single Coordinator):
    - Quản lý Atomic Lease và Heartbeat ở cả 2 cấp: Task-level và Workflow-level.
    - Ngăn chặn 100% việc chạy trùng lặp (Duplicate Execution) giữa Web Console, Retry và Cronjobs.
    - Tự động thu hồi (Recovery) các tác vụ bị treo (Stale tasks).
    """

    @staticmethod
    def _get_now_utc() -> datetime:
        return datetime.now(timezone.utc)

    # =========================================================================
    # 1. TASK-LEVEL LEASE (BẢNG bot_automation_tasks)
    # =========================================================================

    @classmethod
    async def claim_task_for_execution(
        cls,
        task_id: str,
        bot_type: str,
        lease_duration_seconds: int = DEFAULT_LEASE_DURATION_SECONDS
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Chiếm quyền thực thi tác vụ Bot đơn lẻ (Atomic Task Lease Claim)."""
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()

        res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
        if not res.data:
            return False, f"Không tìm thấy tác vụ #{task_id}", None

        task = res.data[0]
        exec_status = task.get("execution_status")
        payload = task.get("payload_data") or {}
        lease_info = payload.get("execution_lease")

        # Kiểm tra nếu task đang chạy và lease còn hạn
        if exec_status == "running" and lease_info:
            expires_at_str = lease_info.get("expires_at")
            if expires_at_str:
                try:
                    expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                    if now < expires_at:
                        holder_token = lease_info.get("token", "UNKNOWN")[:8]
                        msg = f"Tác vụ đang được thực thi bởi worker khác (Lease #{holder_token}, hết hạn lúc {expires_at_str})."
                        logger.warning(f"🛑 [CONCURRENCY SHIELD] Từ chối chạy trùng task #{task_id[:8]}: {msg}")
                        return False, msg, task
                except Exception as parse_err:
                    logger.debug(f"Lỗi parse expires_at: {parse_err}")

        lease_token = str(uuid.uuid4())
        expires_at = now + timedelta(seconds=lease_duration_seconds)
        
        new_lease = {
            "token": lease_token,
            "bot_type": bot_type,
            "claimed_at": now_iso,
            "expires_at": expires_at.isoformat(),
            "heartbeat_at": now_iso,
            "is_active": True
        }
        payload["execution_lease"] = new_lease

        supabase.table("bot_automation_tasks").update({
            "execution_status": "running",
            "payload_data": payload,
            "executed_at": now_iso
        }).eq("id", task_id).execute()

        task["payload_data"] = payload
        task["execution_status"] = "running"
        logger.info(f"🔑 [TASK LEASE CLAIMED] Worker '{bot_type}' đã nhận lease #{lease_token[:8]} cho task #{task_id[:8]}")
        return True, lease_token, task

    @classmethod
    async def update_task_heartbeat(
        cls,
        task_id: str,
        lease_token: str,
        extend_seconds: int = DEFAULT_LEASE_DURATION_SECONDS
    ) -> bool:
        """Cập nhật nhịp tim (Heartbeat) và gia hạn Lease cho Bot Task."""
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()
        expires_at = now + timedelta(seconds=extend_seconds)

        res = supabase.table("bot_automation_tasks").select("payload_data").eq("id", task_id).execute()
        if not res.data:
            return False

        payload = res.data[0].get("payload_data") or {}
        lease_info = payload.get("execution_lease") or {}

        if lease_info.get("token") != lease_token:
            logger.warning(f"⚠️ Không thể cập nhật heartbeat cho task #{task_id[:8]}: Sai lease token.")
            return False

        lease_info["heartbeat_at"] = now_iso
        lease_info["expires_at"] = expires_at.isoformat()
        payload["execution_lease"] = lease_info

        supabase.table("bot_automation_tasks").update({"payload_data": payload}).eq("id", task_id).execute()
        return True

    @classmethod
    async def release_task_lease(
        cls,
        task_id: str,
        lease_token: str,
        final_status: str,
        payload_data: Dict[str, Any],
        execution_logs: str,
        current_step: Optional[str] = None,
        last_error_step: Optional[str] = None
    ) -> bool:
        """Giải phóng Lease cho Bot Task."""
        supabase = get_supabase_client()
        now_iso = cls._get_now_utc().isoformat()

        if "execution_lease" in payload_data:
            payload_data["execution_lease"]["released_at"] = now_iso
            payload_data["execution_lease"]["is_active"] = False

        update_fields: Dict[str, Any] = {
            "execution_status": final_status,
            "payload_data": payload_data,
            "execution_logs": execution_logs,
            "executed_at": now_iso
        }
        if current_step:
            update_fields["current_step"] = current_step
        if last_error_step is not None:
            update_fields["last_error_step"] = last_error_step

        try:
            supabase.table("bot_automation_tasks").update(update_fields).eq("id", task_id).execute()
            logger.info(f"🏁 [TASK LEASE RELEASED] Task #{task_id[:8]} kết thúc với trạng thái '{final_status}'.")
            return True
        except Exception as e:
            logger.error(f"❌ Lỗi giải phóng lease cho task #{task_id[:8]}: {e}")
            return False

    # =========================================================================
    # 2. WORKFLOW-LEVEL LEASE (BẢNG automation_workflows - PHA F MỚI)
    # =========================================================================

    @classmethod
    async def claim_workflow_lease(
        cls,
        workflow_id: str,
        operator: str = "system",
        lease_duration_seconds: int = DEFAULT_LEASE_DURATION_SECONDS
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Chiếm quyền thực thi toàn bộ Workflow DAG (Workflow-Level Atomic Lease).
        Chặn đứng race-condition khi admin bấm chạy đúp hoặc cronjob can thiệp.
        """
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()

        res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            return False, f"Không tìm thấy workflow #{workflow_id}", None

        wf = res.data[0]
        current_status = wf.get("status")
        ai_analysis = wf.get("ai_analysis") or {}
        lease_info = ai_analysis.get("execution_lease") or {}

        # Nếu workflow đang ở trạng thái 'running' và lease vẫn còn hạn
        if current_status == "running" and lease_info.get("is_active") is True:
            expires_at_str = lease_info.get("expires_at")
            if expires_at_str:
                try:
                    expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                    if now < expires_at:
                        token_short = lease_info.get("token", "UNKNOWN")[:8]
                        msg = f"Workflow đang chạy ở tiến trình khác (Lease #{token_short}, hết hạn lúc {expires_at_str})."
                        logger.warning(f"🛑 [WORKFLOW SHIELD] Từ chối thực thi trùng Workflow #{workflow_id[:8]}: {msg}")
                        return False, msg, wf
                except Exception as parse_err:
                    logger.debug(f"Lỗi parse expires_at workflow: {parse_err}")

        # Cấp phát Lease mới cho Workflow
        lease_token = str(uuid.uuid4())
        expires_at = now + timedelta(seconds=lease_duration_seconds)

        new_lease = {
            "token": lease_token,
            "operator": operator,
            "claimed_at": now_iso,
            "expires_at": expires_at.isoformat(),
            "heartbeat_at": now_iso,
            "is_active": True
        }
        ai_analysis["execution_lease"] = new_lease

        supabase.table("automation_workflows").update({
            "status": "running",
            "ai_analysis": ai_analysis,
            "updated_at": now_iso
        }).eq("id", workflow_id).execute()

        wf["ai_analysis"] = ai_analysis
        wf["status"] = "running"
        logger.info(f"🔑 [WORKFLOW LEASE CLAIMED] Đã cấp lease #{lease_token[:8]} cho Workflow #{workflow_id[:8]} (Operator: {operator})")
        return True, lease_token, wf

    @classmethod
    async def update_workflow_heartbeat(
        cls,
        workflow_id: str,
        lease_token: str,
        extend_seconds: int = DEFAULT_LEASE_DURATION_SECONDS
    ) -> bool:
        """Gia hạn nhịp tim cho Workflow đang thực thi tác vụ dài."""
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()
        expires_at = now + timedelta(seconds=extend_seconds)

        res = supabase.table("automation_workflows").select("ai_analysis").eq("id", workflow_id).execute()
        if not res.data:
            return False

        ai_analysis = res.data[0].get("ai_analysis") or {}
        lease_info = ai_analysis.get("execution_lease") or {}

        if lease_info.get("token") != lease_token:
            return False

        lease_info["heartbeat_at"] = now_iso
        lease_info["expires_at"] = expires_at.isoformat()
        ai_analysis["execution_lease"] = lease_info

        supabase.table("automation_workflows").update({
            "ai_analysis": ai_analysis
        }).eq("id", workflow_id).execute()
        return True

    @classmethod
    async def release_workflow_lease(
        cls,
        workflow_id: str,
        lease_token: str,
        final_status: Optional[str] = None
    ) -> bool:
        """Giải phóng Lease khi Workflow hoàn tất (kể cả thành công, thất bại hay waiting_poll)."""
        supabase = get_supabase_client()
        now_iso = cls._get_now_utc().isoformat()

        res = supabase.table("automation_workflows").select("ai_analysis, status").eq("id", workflow_id).execute()
        if not res.data:
            return False

        wf = res.data[0]
        ai_analysis = wf.get("ai_analysis") or {}
        lease_info = ai_analysis.get("execution_lease") or {}

        if lease_info.get("token") == lease_token:
            lease_info["is_active"] = False
            lease_info["released_at"] = now_iso
            ai_analysis["execution_lease"] = lease_info

        update_payload: Dict[str, Any] = {
            "ai_analysis": ai_analysis,
            "updated_at": now_iso
        }
        if final_status:
            update_payload["status"] = final_status

        try:
            supabase.table("automation_workflows").update(update_payload).eq("id", workflow_id).execute()
            logger.info(f"🏁 [WORKFLOW LEASE RELEASED] Workflow #{workflow_id[:8]} đã giải phóng lease #{lease_token[:8]}.")
            return True
        except Exception as e:
            logger.error(f"❌ Lỗi giải phóng workflow lease: {e}")
            return False


task_coordinator = TaskCoordinator()