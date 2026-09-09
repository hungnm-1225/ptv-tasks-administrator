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
    Bộ điều phối thực thi tác vụ tập trung (Single Coordinator):
    - Quản lý Task Claiming, Execution Lease và Heartbeat.
    - Ngăn chặn 100% việc thực thi trùng lặp (Duplicate Execution) giữa Admin Dispatch, Retry và Cron.
    - Hỗ trợ tự động thu hồi (Recovery) các tác vụ bị treo (Stale tasks).
    """

    @staticmethod
    def _get_now_utc() -> datetime:
        return datetime.now(timezone.utc)

    @classmethod
    async def claim_task_for_execution(
        cls,
        task_id: str,
        bot_type: str,
        lease_duration_seconds: int = DEFAULT_LEASE_DURATION_SECONDS
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Chiếm quyền thực thi tác vụ (Atomic Lease Claim).
        Trả về: (is_claimed: bool, lease_token_or_reason: str, task_record: Optional[dict])
        """
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()

        # 1. Truy vấn thông tin task hiện tại từ DB
        res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
        if not res.data:
            return False, f"Không tìm thấy tác vụ #{task_id}", None

        task = res.data[0]
        exec_status = task.get("execution_status")
        payload = task.get("payload_data") or {}
        lease_info = payload.get("execution_lease")

        # 2. Kiểm tra nếu task đang 'running'
        if exec_status == "running" and lease_info:
            expires_at_str = lease_info.get("expires_at")
            if expires_at_str:
                try:
                    expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                    # Nếu lease vẫn còn hiệu lực -> TỪ CHỐI THỰC THI TRÙNG LẶP
                    if now < expires_at:
                        holder_token = lease_info.get("token", "UNKNOWN")[:8]
                        msg = f"Tác vụ đang được thực thi bởi worker khác (Lease #{holder_token}, hết hạn lúc {expires_at_str})."
                        logger.warning(f"🛑 [CONCURRENCY SHIELD] Từ chối chạy trùng task #{task_id[:8]}: {msg}")
                        return False, msg, task
                except Exception as parse_err:
                    logger.debug(f"Lỗi parse expires_at: {parse_err}")

        # 3. Cấp phát Lease mới cho Worker hiện tại
        lease_token = str(uuid.uuid4())
        expires_at = now + timedelta(seconds=lease_duration_seconds)
        
        new_lease = {
            "token": lease_token,
            "bot_type": bot_type,
            "claimed_at": now_iso,
            "expires_at": expires_at.isoformat(),
            "heartbeat_at": now_iso
        }
        payload["execution_lease"] = new_lease

        # Cập nhật DB
        update_res = supabase.table("bot_automation_tasks").update({
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
        """Cập nhật nhịp tim (Heartbeat) và gia hạn Lease cho các tác vụ chạy dài."""
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()
        expires_at = now + timedelta(seconds=extend_seconds)

        res = supabase.table("bot_automation_tasks").select("payload_data").eq("id", task_id).execute()
        if not res.data:
            return False

        payload = res.data[0].get("payload_data") or {}
        lease_info = payload.get("execution_lease") or {}

        # Chỉ gia hạn nếu đúng lease token sở hữu
        if lease_info.get("token") != lease_token:
            logger.warning(f"⚠️ Không thể cập nhật heartbeat cho task #{task_id[:8]}: Sai lease token.")
            return False

        lease_info["heartbeat_at"] = now_iso
        lease_info["expires_at"] = expires_at.isoformat()
        payload["execution_lease"] = lease_info

        supabase.table("bot_automation_tasks").update({
            "payload_data": payload
        }).eq("id", task_id).execute()

        logger.debug(f"💓 [HEARTBEAT] Đã gia hạn lease #{lease_token[:8]} cho task #{task_id[:8]} đến {expires_at.isoformat()}")
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
        """Giải phóng Lease và cập nhật trạng thái kết thúc tác vụ."""
        supabase = get_supabase_client()
        now_iso = cls._get_now_utc().isoformat()

        # Đánh dấu lease đã kết thúc
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


task_coordinator = TaskCoordinator()
