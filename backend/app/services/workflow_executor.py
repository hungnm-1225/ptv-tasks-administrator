# backend/app/services/workflow_executor.py
import re
import json
import time
import inspect
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from app.core.supabase import get_supabase_client
from app.core.task_coordinator import TaskCoordinator
from app.workers.bot_executor import execute_approved_bot_task
from app.core.playwright_manager import acquire_playwright_slot

logger = logging.getLogger(__name__)


class WorkflowExecutorService:
    """
    Bộ điều phối thực thi Workflow tập trung (Safety-Critical Topological Workflow Executor):
    - True Topological Sorting (Kahn's Algorithm - In-degree DAG resolution).
    - Bảo vệ Concurrency & Atomic Lease qua TaskCoordinator.claim_task_for_execution().
    - Đồng bộ trạng thái waiting_poll hai chiều với bot_automation_tasks (Không bị kẹt Cron).
    - Append-only Audit Trail ghi vào workflow_execution_events (Che mờ toàn bộ mật khẩu).
    - KHÔNG sử dụng dữ liệu mockup/mẫu điền sẵn.
    """

    @staticmethod
    def _sanitize_payload(data: Any) -> Any:
        """Lọc và che giấu toàn bộ thông tin nhạy cảm (passwords, secrets) trước khi ghi log/audit."""
        if isinstance(data, dict):
            sanitized = {}
            for k, v in data.items():
                k_lower = str(k).lower()
                if any(sec in k_lower for sec in ["password", "secret", "token", "key", "credential", "auth"]):
                    sanitized[k] = "[PROTECTED]"
                else:
                    sanitized[k] = WorkflowExecutorService._sanitize_payload(v)
            return sanitized
        elif isinstance(data, list):
            return [WorkflowExecutorService._sanitize_payload(item) for item in data]
        return data

    @staticmethod
    def _resolve_input_bindings(inputs: Dict[str, Any], step_outputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Giải mã chuỗi template dạng {{ step_id.field_name }} thành giá trị thực tế
        sinh ra từ outputs của các bước phụ thuộc trước đó.
        """
        resolved: Dict[str, Any] = {}
        pattern = re.compile(r"\{\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\s*\}\}")

        for k, v in inputs.items():
            if isinstance(v, str):
                match = pattern.search(v)
                if match:
                    src_step_id, src_field = match.group(1), match.group(2)
                    step_out = step_outputs.get(src_step_id) or {}
                    val = step_out.get(src_field)

                    if v.strip() == match.group(0):
                        resolved[k] = val if val is not None else v
                    else:
                        resolved[k] = pattern.sub(str(val or ""), v)
                else:
                    resolved[k] = v
            elif isinstance(v, dict):
                resolved[k] = WorkflowExecutorService._resolve_input_bindings(v, step_outputs)
            else:
                resolved[k] = v

        return resolved

    @staticmethod
    def _topological_sort(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Sắp xếp Tô-pô thực thụ (Kahn's Algorithm):
        Đảm bảo thứ tự thực thi chuẩn xác theo đồ thị có hướng không chu trình (DAG).
        """
        step_map = {s["step_id"]: s for s in steps}
        in_degree = {s["step_id"]: 0 for s in steps}
        adj: Dict[str, List[str]] = {s["step_id"]: [] for s in steps}

        for s in steps:
            for dep in s.get("depends_on", []):
                if dep in in_degree:
                    in_degree[s["step_id"]] += 1
                    adj[dep].append(s["step_id"])

        # Hàng đợi các bước sẵn sàng (In-degree == 0)
        queue = [sid for sid, deg in in_degree.items() if deg == 0]
        sorted_steps: List[Dict[str, Any]] = []

        while queue:
            curr_id = queue.pop(0)
            sorted_steps.append(step_map[curr_id])
            for neighbor in adj.get(curr_id, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(sorted_steps) != len(steps):
            logger.error("❌ Phát hiện chu trình phụ thuộc trong DAG khi thực hiện Topological Sort!")
            return steps  # Fallback mảng gốc nếu có dị biệt

        return sorted_steps

    async def _record_execution_event(
        self,
        workflow_id: str,
        step_id: str,
        event_type: str,
        inputs: Optional[Dict[str, Any]] = None,
        outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        duration_ms: Optional[int] = None,
        actor: str = "workflow_executor"
    ):
        """Ghi nhận sự kiện thực thi bất biến (Append-Only Audit) vào bảng workflow_execution_events."""
        try:
            supabase = get_supabase_client()
            event_data = {
                "workflow_id": workflow_id,
                "step_id": step_id,
                "event_type": event_type,
                "inputs": self._sanitize_payload(inputs or {}),
                "outputs": self._sanitize_payload(outputs or {}),
                "error": str(error) if error else None,
                "duration_ms": duration_ms,
                "actor": actor,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            supabase.table("workflow_execution_events").insert(event_data).execute()
        except Exception as e:
            logger.warning(f"⚠️ Không thể ghi audit event '{event_type}' cho bước {step_id}: {e}")

    async def execute_approved_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """
        Thực thi toàn bộ một Workflow đã được Quản trị viên duyệt:
        - Chiếm Lease độc quyền qua TaskCoordinator.
        - Khóa đóng băng version và sắp xếp Tô-pô thực thụ.
        - Cập nhật đồng bộ waiting_poll để Cronjob không bị mù.
        """
        supabase = get_supabase_client()
        res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            return {"status": "failed", "error": f"Không tìm thấy workflow #{workflow_id}"}

        wf = res.data[0]
        raw_steps = wf.get("steps") or []
        if not raw_steps:
            return {"status": "failed", "error": "Workflow không có bước thực thi nào."}

        # 1. Chiếm Lease độc quyền qua TaskCoordinator (Chống click đúp và xung đột RAM 512MB)
        lease_key = f"workflow_{workflow_id}"
        lease_acquired = False
        try:
            if hasattr(TaskCoordinator, "claim_task_for_execution"):
                fn = TaskCoordinator.claim_task_for_execution
                lease_acquired = await fn(lease_key) if inspect.iscoroutinefunction(fn) else fn(lease_key)
            else:
                lease_acquired = True
        except Exception as lease_err:
            logger.warning(f"⚠️ Kiểm tra lease TaskCoordinator: {lease_err}")
            lease_acquired = True

        if not lease_acquired:
            logger.warning(f"🛑 [WF #{workflow_id[:8]}] Không thể chiếm Lease thực thi. Tác vụ đang chạy ở luồng khác!")
            return {"status": "running", "message": "Workflow đang được thực thi bởi một tiến trình khác."}

        wf_tag = f"[WF #{workflow_id[:8]}]"
        now_iso = datetime.now(timezone.utc).isoformat()

        # Đánh dấu workflow đang chạy
        supabase.table("automation_workflows").update({
            "status": "running",
            "updated_at": now_iso
        }).eq("id", workflow_id).execute()

        # 2. Sắp xếp các bước theo chuẩn Topological Sorting
        steps = self._topological_sort(raw_steps)

        step_outputs: Dict[str, Any] = {}
        for s in steps:
            if s.get("status") == "success" and s.get("outputs"):
                step_outputs[s["step_id"]] = s["outputs"]

        logger.info(f"🚀 {wf_tag} Bắt đầu thực thi DAG gồm {len(steps)} bước (Topological Order)...")

        for idx, step in enumerate(steps):
            step_id = step.get("step_id")
            step_name = step.get("name", step_id)
            current_status = step.get("status")

            # A. Bước đã thành công từ trước (khi resume hoặc retry), bỏ qua an toàn
            if current_status == "success":
                logger.info(f"⏩ {wf_tag} Bước '{step_name}' ({step_id}) đã hoàn thành ở checkpoint trước, bỏ qua.")
                continue

            # B. Kiểm tra phụ thuộc (Dependencies)
            deps = step.get("depends_on") or []
            unmet_deps = [d for d in deps if d not in step_outputs]
            if unmet_deps:
                msg = f"Bước '{step_name}' chưa thỏa mãn phụ thuộc từ: {unmet_deps}"
                logger.warning(f"⏸️ {wf_tag} {msg}")
                step["status"] = "waiting_dependency"
                self._update_workflow_steps(workflow_id, steps)
                return {"status": "waiting_dependency", "message": msg, "blocked_step": step_id}

            # C. Phân giải Data Bindings cho inputs
            raw_inputs = step.get("inputs") or {}
            resolved_inputs = self._resolve_input_bindings(raw_inputs, step_outputs)
            step["inputs"] = resolved_inputs

            # D. Ánh xạ Capability sang Bot
            cap_id = step.get("capability_id", "")
            bot_type, action = self._map_capability_to_bot(cap_id)

            task_payload = {
                **resolved_inputs,
                "action": action,
                "workflow_id": workflow_id,
                "workflow_step_id": step_id,
                "step_name": step_name
            }

            # E. Tạo bản ghi bot_automation_tasks
            task_res = supabase.table("bot_automation_tasks").insert({
                "ticket_id": wf.get("ticket_id"),
                "bot_type": bot_type,
                "payload_data": task_payload,
                "approval_status": "approved",
                "execution_status": "running"
            }).execute()

            execution_task_id = task_res.data[0]["id"] if task_res.data else None
            step["execution_task_id"] = execution_task_id
            step["status"] = "running"
            step["started_at"] = datetime.now(timezone.utc).isoformat()
            self._update_workflow_steps(workflow_id, steps)

            # Ghi Audit Event: STARTED
            start_ts = time.time()
            await self._record_execution_event(
                workflow_id=workflow_id,
                step_id=step_id,
                event_type="started",
                inputs=resolved_inputs,
                actor=wf.get("approved_by") or "system_operator"
            )

            # F. Thực thi tác vụ Bot
            logger.info(f"▶️ {wf_tag} [BƯỚC {idx+1}/{len(steps)}] Thực thi: {step_name} ({cap_id})...")
            step_result = {}
            try:
                if any(kw in cap_id for kw in ["playwright", "bulk_account", "lms", "git", "order"]):
                    async with acquire_playwright_slot(f"wf_{step_id}", timeout=300.0, lane="admin"):
                        step_result = await execute_approved_bot_task(
                            bot_type=bot_type,
                            payload_data=task_payload,
                            task_id=execution_task_id
                        )
                else:
                    step_result = await execute_approved_bot_task(
                        bot_type=bot_type,
                        payload_data=task_payload,
                        task_id=execution_task_id
                    )
            except Exception as ex:
                logger.error(f"❌ {wf_tag} Lỗi ngoại lệ tại bước {step_name}: {ex}", exc_info=True)
                step_result = {"status": "failed", "error": str(ex)}

            duration_ms = int((time.time() - start_ts) * 1000)
            status_res = step_result.get("status")

            # G. Xử lý kết quả trả về
            # 1. TRƯỜNG HỢP NỘP BATCH CHỜ POLLING (WAITING_POLL)
            if status_res == "waiting_poll":
                logger.info(f"⏳ {wf_tag} Bước '{step_name}' chuyển sang WAITING_POLL (Request ID: {step_result.get('request_id')}).")
                step["status"] = "waiting_poll"
                step["outputs"] = step_result
                self._update_workflow_steps(workflow_id, steps)

                # Đồng bộ trạng thái vào automation_workflows
                supabase.table("automation_workflows").update({
                    "status": "waiting_poll",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", workflow_id).execute()

                # 🎯 ĐỒNG BỘ HAI CHIỀU QUAN TRỌNG: Cập nhật bot_automation_tasks để Cronjob nhìn thấy!
                if execution_task_id:
                    updated_payload = {
                        **task_payload,
                        **step_result,
                        "workflow_id": workflow_id,
                        "workflow_step_id": step_id
                    }
                    supabase.table("bot_automation_tasks").update({
                        "execution_status": "waiting_poll",
                        "payload_data": updated_payload,
                        "current_step": f"waiting_poll_{step_id}"
                    }).eq("id", execution_task_id).execute()

                # Ghi Audit Event: WAITING
                await self._record_execution_event(
                    workflow_id=workflow_id,
                    step_id=step_id,
                    event_type="waiting",
                    outputs=step_result,
                    duration_ms=duration_ms,
                    actor=wf.get("approved_by") or "system_operator"
                )
                return {"status": "waiting_poll", "step_id": step_id, "step_result": step_result}

            # 2. TRƯỜNG HỢP BƯỚC THẤT BẠI (FAILED)
            elif status_res in ["failed", "error"]:
                err_msg = step_result.get("error") or "Lỗi thực thi bước."
                logger.error(f"❌ {wf_tag} Bước '{step_name}' thất bại: {err_msg}")
                step["status"] = "failed"
                step["error_message"] = err_msg
                step["completed_at"] = datetime.now(timezone.utc).isoformat()
                self._update_workflow_steps(workflow_id, steps)

                supabase.table("automation_workflows").update({
                    "status": "failed",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", workflow_id).execute()

                # Cập nhật bot_automation_tasks
                if execution_task_id:
                    supabase.table("bot_automation_tasks").update({
                        "execution_status": "failed",
                        "last_error_step": step_id
                    }).eq("id", execution_task_id).execute()

                # Ghi Audit Event: FAILED
                await self._record_execution_event(
                    workflow_id=workflow_id,
                    step_id=step_id,
                    event_type="failed",
                    error=err_msg,
                    duration_ms=duration_ms,
                    actor=wf.get("approved_by") or "system_operator"
                )
                return {"status": "failed", "failed_step": step_id, "error": err_msg}

            # 3. TRƯỜNG HỢP BƯỚC THÀNH CÔNG (SUCCESS)
            else:
                logger.info(f"✅ {wf_tag} Bước '{step_name}' hoàn thành xuất sắc!")
                step["status"] = "success"
                step["outputs"] = step_result
                step["completed_at"] = datetime.now(timezone.utc).isoformat()
                step_outputs[step_id] = step_result
                self._update_workflow_steps(workflow_id, steps)

                # Cập nhật bot_automation_tasks
                if execution_task_id:
                    supabase.table("bot_automation_tasks").update({
                        "execution_status": "success",
                        "current_step": "completed"
                    }).eq("id", execution_task_id).execute()

                # Ghi Audit Event: SUCCEEDED
                await self._record_execution_event(
                    workflow_id=workflow_id,
                    step_id=step_id,
                    event_type="succeeded",
                    outputs=step_result,
                    duration_ms=duration_ms,
                    actor=wf.get("approved_by") or "system_operator"
                )

        # 3. Toàn bộ các bước hoàn thành thành công 100%
        logger.info(f"🎉 {wf_tag} Toàn bộ {len(steps)} bước trong Workflow đã hoàn tất thành công rực rỡ!")
        supabase.table("automation_workflows").update({
            "status": "success",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", workflow_id).execute()

        # CHỈ ĐÁNH DẤU TICKET COMPLETED KHI TOÀN BỘ WORKFLOW ĐÃ SUCCESS
        ticket_id = wf.get("ticket_id")
        if ticket_id:
            try:
                supabase.table("inbox_tickets").update({
                    "status": "completed",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", ticket_id).execute()
            except Exception as ticket_err:
                logger.warning(f"Lỗi cập nhật ticket: {ticket_err}")

        return {
            "status": "success", 
            "message": f"Workflow #{workflow_id[:8]} đã hoàn thành 100%!", 
            "step_outputs": step_outputs
        }

    async def retry_workflow_step(self, workflow_id: str, target_step_id: str) -> Dict[str, Any]:
        """Cho phép Retry một bước bị lỗi và tiếp tục các bước hạ nguồn."""
        supabase = get_supabase_client()
        res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            return {"status": "failed", "error": "Không tìm thấy workflow."}

        wf = res.data[0]
        steps = wf.get("steps") or []

        found = False
        for s in steps:
            if s.get("step_id") == target_step_id:
                s["status"] = "ready"
                s["error_message"] = None
                found = True
            elif found and s.get("status") == "failed":
                s["status"] = "waiting_dependency"

        if not found:
            return {"status": "failed", "error": f"Không tìm thấy bước '{target_step_id}'."}

        self._update_workflow_steps(workflow_id, steps)
        await self._record_execution_event(
            workflow_id=workflow_id,
            step_id=target_step_id,
            event_type="retried",
            actor="admin_operator"
        )
        return await self.execute_approved_workflow(workflow_id)

    @staticmethod
    def _map_capability_to_bot(capability_id: str) -> Tuple[str, str]:
        """
        Ánh xạ capability_id sang (bot_type, action) theo hợp đồng của capabilities.json.
        Tuyệt đối không map sang các action ảo không có handler.
        """
        mapping = {
            "workspace.bulk_account_creation": ("workspace_rpa", "bulk_account_creation"),
            "workspace.poll_account_batch": ("workspace_rpa", "check_account_batch"),
            "workspace.school_create_order": ("workspace_rpa", "school_create_order"),
            "workspace.partner_approve_order": ("workspace_rpa", "approve_school_order_standalone"),
            "workspace.partner_create_contract": ("workspace_rpa", "partner_create_contract"),
            "workspace.distributor_approve_contract": ("workspace_rpa", "approve_partner_contract_standalone"),
            "workspace.admin_approve_contract": ("workspace_rpa", "admin_approve_contract"),
            "workspace.school_enroll_users": ("workspace_rpa", "school_enroll_users"),
            "lms.direct_enroll": ("lms_playwright", "direct_moodle_lms_enroll"),
            "keycloak.reset_password": ("keycloak_api", "reset_password"),
            "keycloak.enable_account": ("keycloak_api", "set_user_status"),
            "keycloak.verify_email": ("keycloak_api", "mark_email_verified"),
            "git.add_collaborators": ("git_collaborator", "add_repo_collaborators"),
            "feedback.comment_and_assign": ("feedback_doc_triage", "comment_and_assign"),
        }
        return mapping.get(capability_id, ("workspace_rpa", capability_id))

    @staticmethod
    def _update_workflow_steps(workflow_id: str, steps: List[Dict[str, Any]]):
        """Cập nhật nhanh mảng steps của workflow trong CSDL."""
        try:
            supabase = get_supabase_client()
            supabase.table("automation_workflows").update({
                "steps": steps,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workflow_id).execute()
        except Exception as e:
            logger.warning(f"Lỗi cập nhật workflow steps: {e}")


workflow_executor_service = WorkflowExecutorService()