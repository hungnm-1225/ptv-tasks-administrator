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
    Bộ điều phối thực thi tác vụ & quy trình tập trung (Safety Coordinator):
    - PHA G: Atomic Lease Claiming với Optimistic Concurrency Control (OCC) chống Race Condition.
    - Cưỡng chế Fail-Closed: Chặn đứng 100% tranh chấp khi Admin click đúp hoặc Cron chạy trùng.
    - Heartbeat nghiêm ngặt: Ném ngoại lệ dừng khẩn cấp worker nếu bị cướp quyền sở hữu lease.
    - Release có điều kiện: Chỉ giải phóng lease và update status khi lease_token khớp tuyệt đối.
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
        """Chiếm quyền thực thi tác vụ Bot đơn lẻ (Atomic Task Lease Claim với OCC)."""
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()

        res = supabase.table("bot_automation_tasks").select("*, inbox_tickets(*)").eq("id", task_id).execute()
        if not res.data:
            return False, f"Không tìm thấy tác vụ #{task_id}", None

        task = res.data[0]
        exec_status = task.get("execution_status")
        payload = task.get("payload_data") or {}
        lease_info = payload.get("execution_lease") or {}

        # 1. Kiểm tra nếu task đang chạy và lease còn hạn
        if exec_status == "running" and lease_info.get("is_active") is True:
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

        # 2. Tạo Lease Token mới
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

        # 3. Conditional Update chống race condition
        up_query = supabase.table("bot_automation_tasks").update({
            "execution_status": "running",
            "payload_data": payload,
            "executed_at": now_iso
        }).eq("id", task_id)

        # Nếu task có updated_at hoặc executed_at cũ, dùng làm chốt kiểm soát OCC
        if task.get("executed_at"):
            up_query = up_query.eq("executed_at", task["executed_at"])

        up_res = up_query.execute()
        if not up_res.data:
            msg = "Xung đột tranh chấp Task: Một tiến trình khác vừa chiếm lease thành công."
            logger.warning(f"🛑 [TASK OCC REJECTED] #{task_id[:8]}: {msg}")
            return False, msg, None

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
        """Cập nhật nhịp tim và gia hạn Lease cho Bot Task (Fail-Closed)."""
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()
        expires_at = now + timedelta(seconds=extend_seconds)

        res = supabase.table("bot_automation_tasks").select("payload_data").eq("id", task_id).execute()
        if not res.data:
            return False

        payload = res.data[0].get("payload_data") or {}
        lease_info = payload.get("execution_lease") or {}

        if lease_info.get("token") != lease_token or lease_info.get("is_active") is not True:
            logger.warning(f"⚠️ Mất quyền sở hữu task #{task_id[:8]}: Token không khớp hoặc lease đã inactive.")
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
        """Giải phóng Lease cho Bot Task (Chỉ giải phóng khi token khớp)."""
        supabase = get_supabase_client()
        now_iso = cls._get_now_utc().isoformat()

        # Kiểm tra token hiện hành trên DB
        res = supabase.table("bot_automation_tasks").select("payload_data").eq("id", task_id).execute()
        if res.data:
            curr_payload = res.data[0].get("payload_data") or {}
            curr_lease = curr_payload.get("execution_lease") or {}
            if curr_lease.get("token") and curr_lease.get("token") != lease_token:
                logger.warning(f"⚠️ [TASK RELEASE SKIPPED] Token #{lease_token[:8]} không khớp token hiện tại của task #{task_id[:8]}.")
                return False

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
    # 2. WORKFLOW-LEVEL LEASE (BẢNG automation_workflows - PHA G MỚI)
    # =========================================================================

    @classmethod
    async def claim_workflow_lease(
        cls,
        workflow_id: str,
        operator: str = "system",
        lease_duration_seconds: int = DEFAULT_LEASE_DURATION_SECONDS
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        PHA G: Chiếm quyền thực thi Workflow DAG với Optimistic Concurrency Control (OCC).
        - Ngăn chặn triệt để click đúp trên UI hoặc tranh chấp giữa Cronjob và Admin.
        - Điều kiện bắt buộc: Workflow chưa running hoặc lease cũ đã hết hạn.
        """
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()

        res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            return False, f"Không tìm thấy workflow #{workflow_id}", None

        wf = res.data[0]
        current_status = wf.get("status")
        expected_updated_at = wf.get("updated_at")
        ai_analysis = wf.get("ai_analysis") or {}
        lease_info = ai_analysis.get("execution_lease") or {}

        # 1. Kiểm tra nếu workflow đang 'running' và lease vẫn còn hiệu lực
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

        # 2. Cấp phát Lease Token mới
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

        # 3. Conditional Update bằng OCC dựa trên updated_at
        update_query = supabase.table("automation_workflows").update({
            "status": "running",
            "ai_analysis": ai_analysis,
            "updated_at": now_iso
        }).eq("id", workflow_id)

        if expected_updated_at:
            update_query = update_query.eq("updated_at", expected_updated_at)

        up_res = update_query.execute()

        # Nếu res.data rỗng ➔ Đã có tiến trình khác chen ngang cập nhật trước!
        if not up_res.data:
            msg = "Xung đột tranh chấp Workflow Lease: Tiến trình khác vừa kích hoạt workflow trước tích tắc."
            logger.warning(f"🛑 [WORKFLOW OCC REJECTED] #{workflow_id[:8]}: {msg}")
            return False, msg, None

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
        """
        Gia hạn nhịp tim cho Workflow đang thực thi tác vụ dài.
        FAIL-CLOSED: Nếu mất quyền sở hữu lease, ném RuntimeError để dừng khẩn cấp!
        """
        supabase = get_supabase_client()
        now = cls._get_now_utc()
        now_iso = now.isoformat()
        expires_at = now + timedelta(seconds=extend_seconds)

        res = supabase.table("automation_workflows").select("ai_analysis, status").eq("id", workflow_id).execute()
        if not res.data:
            raise RuntimeError(f"Workflow #{workflow_id[:8]} không tồn tại khi gia hạn heartbeat.")

        wf = res.data[0]
        ai_analysis = wf.get("ai_analysis") or {}
        lease_info = ai_analysis.get("execution_lease") or {}

        # Nếu token không khớp hoặc lease đã bị tắt ➔ BỊ CƯỚP QUYỀN HOẶC TIMEOUT
        if lease_info.get("token") != lease_token or lease_info.get("is_active") is not True:
            err_msg = (
                f"Mất quyền sở hữu Workflow Lease #{lease_token[:8]} tại Workflow #{workflow_id[:8]}! "
                f"Lease hiện hành trên CSDL là: #{str(lease_info.get('token'))[:8]} (is_active={lease_info.get('is_active')})."
            )
            logger.error(f"❌ [HEARTBEAT LEASE LOST] {err_msg}")
            raise RuntimeError(err_msg)

        lease_info["heartbeat_at"] = now_iso
        lease_info["expires_at"] = expires_at.isoformat()
        ai_analysis["execution_lease"] = lease_info

        supabase.table("automation_workflows").update({
            "ai_analysis": ai_analysis,
            "updated_at": now_iso
        }).eq("id", workflow_id).execute()
        return True

    @classmethod
    async def release_workflow_lease(
        cls,
        workflow_id: str,
        lease_token: str,
        final_status: Optional[str] = None
    ) -> bool:
        """
        Giải phóng Lease khi Workflow kết thúc.
        CHỈ giải phóng và cập nhật status KHI VÀ CHỈ KHI lease_token khớp chính xác!
        """
        supabase = get_supabase_client()
        now_iso = cls._get_now_utc().isoformat()

        res = supabase.table("automation_workflows").select("ai_analysis, status").eq("id", workflow_id).execute()
        if not res.data:
            return False

        wf = res.data[0]
        ai_analysis = wf.get("ai_analysis") or {}
        lease_info = ai_analysis.get("execution_lease") or {}

        # KHÓA BẢO VỆ: Nếu token không khớp, tuyệt đối không được giải phóng hay ghi đè status!
        if lease_info.get("token") != lease_token:
            logger.warning(
                f"⚠️ [LEASE RELEASE SKIPPED] Bỏ qua release cho Workflow #{workflow_id[:8]} "
                f"vì token #{lease_token[:8]} không khớp token hiện tại #{str(lease_info.get('token'))[:8]}."
            )
            return False

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
            logger.info(f"🏁 [WORKFLOW LEASE RELEASED] Workflow #{workflow_id[:8]} đã giải phóng lease #{lease_token[:8]} an toàn (status='{final_status}').")
            return True
        except Exception as e:
            logger.error(f"❌ Lỗi giải phóng workflow lease: {e}")
            return False


task_coordinator = TaskCoordinator()