# backend/app/services/workflow_executor.py
import re
import json
import time
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Set

from app.core.supabase import get_supabase_client
from app.core.task_coordinator import TaskCoordinator
from app.workers.bot_executor import execute_approved_bot_task
from app.core.playwright_manager import acquire_playwright_slot

logger = logging.getLogger(__name__)


class WorkflowExecutorService:
    """
    Bộ điều phối thực thi Workflow tập trung (Safety-Critical Topological Workflow Executor):
    - PHA B & E: Bắt buộc đọc từ Frozen Proposal làm Single Source of Truth.
    - Truy vết đầy đủ: Mọi Execution Event bắt buộc đóng dấu proposal_id bất biến.
    - Quản lý Atomic Lease cấp Workflow thông qua TaskCoordinator.claim_workflow_lease().
    - Bọc toàn bộ quá trình chạy trong try ... finally để đảm bảo 100% giải phóng Lease.
    - True Topological Sorting (Kahn's Algorithm): ném lỗi và dừng ngay khi phát hiện chu trình (Cycle).
    - Khắc phục triệt để lỗi Request #None tại bước waiting_poll.
    - Reset thông minh toàn bộ downstream dependencies khi retry một bước.
    """

    @staticmethod
    def _sanitize_payload(data: Any) -> Any:
        """Lọc và che giấu toàn bộ thông tin nhạy cảm trước khi ghi log/audit."""
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
        """Giải mã chuỗi template dạng {{ step_id.field_name }} thành giá trị thực tế."""
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
        """Sắp xếp Tô-pô thực thụ (Kahn's Algorithm). Ném ValueError nếu phát hiện chu trình."""
        step_map = {s["step_id"]: s for s in steps}
        in_degree = {s["step_id"]: 0 for s in steps}
        adj: Dict[str, List[str]] = {s["step_id"]: [] for s in steps}

        for s in steps:
            for dep in s.get("depends_on", []):
                if dep in in_degree:
                    in_degree[s["step_id"]] += 1
                    adj[dep].append(s["step_id"])

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
            cycle_steps = [sid for sid, deg in in_degree.items() if deg > 0]
            err_msg = f"Phát hiện chu trình phụ thuộc (Circular Dependency) trong DAG tại các bước: {cycle_steps}!"
            logger.error(f"❌ {err_msg}")
            raise ValueError(err_msg)

        return sorted_steps

    async def _record_execution_event(
        self,
        proposal_id: Optional[str],
        workflow_id: str,
        step_id: str,
        event_type: str,
        inputs: Optional[Dict[str, Any]] = None,
        outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        duration_ms: Optional[int] = None,
        actor: str = "workflow_executor"
    ):
        """
        PHA B & E: Ghi nhận sự kiện thực thi bất biến vào bảng workflow_execution_events.
        BẮT BUỘC lưu proposal_id để truy vết trọn vẹn chuỗi Provenance.
        """
        try:
            supabase = get_supabase_client()
            event_data = {
                "proposal_id": proposal_id,
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
        THỰC THI WORKFLOW ĐÃ DUYỆT (SAFETY-CRITICAL EXECUTION):
        - Bắt buộc kiểm tra proposal_id và xác thực Proposal đã 'approved'.
        - Lấy 'frozen_plan' từ proposal làm chân lý tối cao.
        - Chiếm Workflow Lease thực thụ (Fail-closed nếu bị tranh chấp).
        - Toàn bộ hàm nằm trong try ... finally để luôn giải phóng Lease.
        - Xử lý waiting_poll an toàn: Chặn đứng lỗi Request #None.
        """
        supabase = get_supabase_client()
        res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            return {"status": "failed", "error": f"Không tìm thấy workflow #{workflow_id}"}

        wf = res.data[0]
        operator_name = wf.get("approved_by") or "system_operator"

        # 1. KIỂM TRA PROVENANCE & TẢI FROZEN PROPOSAL (FAIL-CLOSED)
        proposal_id = wf.get("proposal_id")
        if not proposal_id:
            err_msg = f"Workflow #{workflow_id[:8]} thiếu proposal_id. Từ chối thực thi để bảo toàn Provenance."
            logger.error(f"❌ {err_msg}")
            return {"status": "failed", "error": err_msg}

        prop_res = supabase.table("workflow_proposals").select("*").eq("id", proposal_id).execute()
        if not prop_res.data:
            err_msg = f"Không tìm thấy proposal #{proposal_id} tương ứng với workflow #{workflow_id[:8]}."
            logger.error(f"❌ {err_msg}")
            return {"status": "failed", "error": err_msg}

        proposal = prop_res.data[0]
        if proposal.get("status") != "approved":
            err_msg = f"Proposal #{proposal_id[:8]} chưa ở trạng thái 'approved' (hiện tại: '{proposal.get('status')}')."
            logger.error(f"❌ {err_msg}")
            return {"status": "failed", "error": err_msg}

        # Nguồn chân lý tối cao của các bước là frozen_plan đã được đóng băng
        frozen_plan = proposal.get("frozen_plan") or []
        if not frozen_plan:
            err_msg = f"Proposal #{proposal_id[:8]} không có frozen_plan hợp lệ."
            logger.error(f"❌ {err_msg}")
            return {"status": "failed", "error": err_msg}

        # The proposal is the execution contract.  Runtime state is merged
        # from the workflow only for fields that cannot change the action.
        raw_steps = self._hydrate_frozen_plan(frozen_plan, wf.get("steps") or [])

        # 2. CHIẾM WORKFLOW-LEVEL LEASE (CHỐNG RACE-CONDITION THỰC SỰ)
        is_claimed, lease_token, _ = await TaskCoordinator.claim_workflow_lease(
            workflow_id=workflow_id,
            operator=operator_name
        )
        if not is_claimed:
            logger.warning(f"🛑 [WORKFLOW BLOCKED] {lease_token}")
            return {"status": "running", "message": lease_token}

        wf_tag = f"[WF #{workflow_id[:8]} | PROP #{proposal_id[:8]}]"
        final_workflow_status = "failed"

        try:
            # 3. Sắp xếp các bước theo Topological Sorting
            try:
                steps = self._topological_sort(raw_steps)
            except ValueError as cycle_err:
                err_str = str(cycle_err)
                final_workflow_status = "failed"
                await self._record_execution_event(
                    proposal_id=proposal_id,
                    workflow_id=workflow_id,
                    step_id="dag_sort",
                    event_type="failed",
                    error=err_str,
                    actor=operator_name
                )
                return {"status": "failed", "error": err_str}

            step_outputs: Dict[str, Any] = {}
            for s in steps:
                if s.get("status") == "success" and s.get("outputs"):
                    step_outputs[s["step_id"]] = s["outputs"]

            logger.info(f"🚀 {wf_tag} Bắt đầu thực thi DAG gồm {len(steps)} bước (Lease #{lease_token[:8]})...")

            for idx, step in enumerate(steps):
                step_id = step.get("step_id")
                step_name = step.get("name", step_id)
                current_status = step.get("status")

                # Gia hạn heartbeat định kỳ
                await TaskCoordinator.update_workflow_heartbeat(workflow_id, lease_token)

                # A. Bước đã thành công từ trước (Checkpoint resume), bỏ qua an toàn
                if current_status == "success":
                    logger.info(f"⏩ {wf_tag} Bước '{step_name}' ({step_id}) đã thành công ở checkpoint trước, bỏ qua.")
                    continue

                # B. Kiểm tra phụ thuộc (Dependencies)
                deps = step.get("depends_on") or []
                unmet_deps = [d for d in deps if d not in step_outputs]
                if unmet_deps:
                    msg = f"Bước '{step_name}' chưa thỏa mãn phụ thuộc từ: {unmet_deps}"
                    logger.warning(f"⏸️ {wf_tag} {msg}")
                    step["status"] = "waiting_dependency"
                    self._update_workflow_steps(workflow_id, steps)
                    final_workflow_status = "waiting_dependency"
                    return {"status": "waiting_dependency", "message": msg, "blocked_step": step_id}

                # C. Phân giải Data Bindings
                raw_inputs = step.get("inputs") or {}
                resolved_inputs = self._resolve_input_bindings(raw_inputs, step_outputs)
                step["inputs"] = resolved_inputs

                # D. Ánh xạ Capability sang Bot (FAIL-CLOSED)
                cap_id = step.get("capability_id", "")
                try:
                    bot_type, action = self._map_capability_to_bot(cap_id)
                except ValueError as map_err:
                    err_str = str(map_err)
                    logger.error(f"❌ {wf_tag} {err_str}")
                    step["status"] = "failed"
                    step["error_message"] = err_str
                    self._update_workflow_steps(workflow_id, steps)
                    final_workflow_status = "failed"
                    await self._record_execution_event(
                        proposal_id=proposal_id,
                        workflow_id=workflow_id,
                        step_id=step_id,
                        event_type="failed",
                        error=err_str,
                        actor=operator_name
                    )
                    return {"status": "failed", "failed_step": step_id, "error": err_str}

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

                # Ghi Audit Event: STARTED (Gắn proposal_id)
                start_ts = time.time()
                await self._record_execution_event(
                    proposal_id=proposal_id,
                    workflow_id=workflow_id,
                    step_id=step_id,
                    event_type="started",
                    inputs=resolved_inputs,
                    actor=operator_name
                )

                # F. Thực thi Bot với Semaphore bảo vệ RAM Render 512MB
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
                # 1. TRƯỜNG HỢP WAITING_POLL (DIỆT TẬN GỐC LỖI REQUEST #NONE)
                if status_res == "waiting_poll":
                    req_id = step_result.get("request_id")
                    if not req_id or str(req_id).strip() in ["", "None", "null", "undefined"]:
                        err_msg = f"Bước '{step_name}' trả về waiting_poll nhưng thiếu request_id hợp lệ!"
                        logger.error(f"❌ {wf_tag} {err_msg}")
                        step["status"] = "failed"
                        step["error_message"] = err_msg
                        self._update_workflow_steps(workflow_id, steps)
                        final_workflow_status = "failed"

                        if execution_task_id:
                            supabase.table("bot_automation_tasks").update({
                                "execution_status": "failed",
                                "last_error_step": step_id
                            }).eq("id", execution_task_id).execute()

                        await self._record_execution_event(
                            proposal_id=proposal_id,
                            workflow_id=workflow_id,
                            step_id=step_id,
                            event_type="failed",
                            error=err_msg,
                            duration_ms=duration_ms,
                            actor=operator_name
                        )
                        return {"status": "failed", "failed_step": step_id, "error": err_msg}

                    logger.info(f"⏳ {wf_tag} Bước '{step_name}' chuyển sang WAITING_POLL an toàn (Request ID: {req_id}).")
                    step["status"] = "waiting_poll"
                    step["outputs"] = step_result
                    self._update_workflow_steps(workflow_id, steps)

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

                    await self._record_execution_event(
                        proposal_id=proposal_id,
                        workflow_id=workflow_id,
                        step_id=step_id,
                        event_type="waiting",
                        outputs=step_result,
                        duration_ms=duration_ms,
                        actor=operator_name
                    )
                    final_workflow_status = "waiting_poll"
                    return {"status": "waiting_poll", "step_id": step_id, "step_result": step_result}

                # 2. TRƯỜNG HỢP BƯỚC THẤT BẠI (FAILED)
                elif status_res in ["failed", "error"]:
                    err_msg = step_result.get("error") or "Lỗi thực thi bước."
                    logger.error(f"❌ {wf_tag} Bước '{step_name}' thất bại: {err_msg}")
                    step["status"] = "failed"
                    step["error_message"] = err_msg
                    step["completed_at"] = datetime.now(timezone.utc).isoformat()
                    self._update_workflow_steps(workflow_id, steps)

                    if execution_task_id:
                        supabase.table("bot_automation_tasks").update({
                            "execution_status": "failed",
                            "last_error_step": step_id
                        }).eq("id", execution_task_id).execute()

                    await self._record_execution_event(
                        proposal_id=proposal_id,
                        workflow_id=workflow_id,
                        step_id=step_id,
                        event_type="failed",
                        error=err_msg,
                        duration_ms=duration_ms,
                        actor=operator_name
                    )
                    final_workflow_status = "failed"
                    return {"status": "failed", "failed_step": step_id, "error": err_msg}

                # 3. TRƯỜNG HỢP BƯỚC THÀNH CÔNG (SUCCESS)
                else:
                    logger.info(f"✅ {wf_tag} Bước '{step_name}' hoàn thành xuất sắc!")
                    step["status"] = "success"
                    step["outputs"] = step_result
                    step["completed_at"] = datetime.now(timezone.utc).isoformat()
                    step_outputs[step_id] = step_result
                    self._update_workflow_steps(workflow_id, steps)

                    if execution_task_id:
                        supabase.table("bot_automation_tasks").update({
                            "execution_status": "success",
                            "current_step": "completed"
                        }).eq("id", execution_task_id).execute()

                    await self._record_execution_event(
                        proposal_id=proposal_id,
                        workflow_id=workflow_id,
                        step_id=step_id,
                        event_type="succeeded",
                        outputs=step_result,
                        duration_ms=duration_ms,
                        actor=operator_name
                    )

            # Toàn bộ DAG thành công 100%
            logger.info(f"🎉 {wf_tag} Toàn bộ {len(steps)} bước đã hoàn tất thành công rực rỡ!")
            final_workflow_status = "success"

            ticket_id = wf.get("ticket_id")
            if ticket_id:
                try:
                    supabase.table("inbox_tickets").update({
                        "status": "completed",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }).eq("id", ticket_id).execute()
                except Exception as ticket_err:
                    logger.warning(f"Lỗi cập nhật ticket completed: {ticket_err}")

            return {
                "status": "success", 
                "message": f"Workflow #{workflow_id[:8]} đã hoàn thành 100%!", 
                "step_outputs": step_outputs
            }

        finally:
            # 🎯 BẢO VỆ TUYỆT ĐỐI: LUÔN GIẢI PHÓNG LEASE TRONG KHỐI FINALLY!
            await TaskCoordinator.release_workflow_lease(
                workflow_id=workflow_id,
                lease_token=lease_token,
                final_status=final_workflow_status
            )

    async def retry_workflow_step(self, workflow_id: str, target_step_id: str) -> Dict[str, Any]:
        """
        PHA G: RETRY THÔNG MINH
        - Reset target_step_id về 'ready'.
        - Tìm và reset TOÀN BỘ các bước hạ nguồn phụ thuộc (downstream dependents) về 'waiting_dependency'.
        - Tuyệt đối không chạy lại các bước thành công độc lập thượng nguồn (upstream).
        - Ghi nhận event 'retried' có proposal_id.
        """
        supabase = get_supabase_client()
        res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            return {"status": "failed", "error": "Không tìm thấy workflow."}

        wf = res.data[0]
        proposal_id = wf.get("proposal_id")
        if not proposal_id:
            return {"status": "failed", "error": "Workflow thiếu proposal provenance."}
        proposal_res = supabase.table("workflow_proposals").select("status, frozen_plan").eq("id", proposal_id).execute()
        if not proposal_res.data or proposal_res.data[0].get("status") != "approved":
            return {"status": "failed", "error": "Proposal chưa được phê duyệt hoặc không tồn tại."}
        steps = self._hydrate_frozen_plan(
            proposal_res.data[0].get("frozen_plan") or [],
            wf.get("steps") or [],
        )

        step_ids = {s.get("step_id") for s in steps}
        if target_step_id not in step_ids:
            return {"status": "failed", "error": f"Không tìm thấy bước '{target_step_id}'."}

        # Thuật toán duyệt BFS tìm toàn bộ downstream steps phụ thuộc vào target_step_id
        downstream: Set[str] = set()
        queue = [target_step_id]
        while queue:
            curr = queue.pop(0)
            for s in steps:
                sid = s.get("step_id")
                if curr in (s.get("depends_on") or []) and sid not in downstream:
                    downstream.add(sid)
                    queue.append(sid)

        # Cập nhật trạng thái các bước
        for s in steps:
            sid = s.get("step_id")
            if sid == target_step_id:
                s["status"] = "ready"
                s["error_message"] = None
                s["execution_task_id"] = None
            elif sid in downstream:
                s["status"] = "waiting_dependency"
                s["error_message"] = None
                s["execution_task_id"] = None

        self._update_workflow_steps(workflow_id, steps)

        await self._record_execution_event(
            proposal_id=proposal_id,
            workflow_id=workflow_id,
            step_id=target_step_id,
            event_type="retried",
            actor=wf.get("approved_by") or "admin_operator"
        )
        return await self.execute_approved_workflow(workflow_id)

    @staticmethod
    def _map_capability_to_bot(capability_id: str) -> Tuple[str, str]:
        """Ánh xạ capability sang bot handler thực tế (Fail-Closed)."""
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
        if capability_id not in mapping:
            raise ValueError(f"Capability '{capability_id}' không có bot handler ánh xạ hợp lệ trong hệ thống (Fail-Closed)!")
        return mapping[capability_id]

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

    @staticmethod
    def _hydrate_frozen_plan(
        frozen_plan: List[Dict[str, Any]], runtime_steps: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Merge checkpoint fields into the immutable approved instruction set.

        A draft/runtime row must never be able to replace a capability, target
        input, or dependency after approval.  It may only preserve execution
        progress so polling/resume does not repeat an already successful step.
        """
        runtime_by_id = {
            step.get("step_id"): step
            for step in runtime_steps
            if isinstance(step, dict) and step.get("step_id")
        }
        mutable_fields = {
            "status", "execution_task_id", "outputs", "error_message",
            "started_at", "completed_at",
        }
        hydrated: List[Dict[str, Any]] = []
        for frozen in frozen_plan:
            if not isinstance(frozen, dict) or not frozen.get("step_id"):
                continue
            merged = dict(frozen)
            runtime = runtime_by_id.get(frozen["step_id"], {})
            for field in mutable_fields:
                if field in runtime:
                    merged[field] = runtime[field]
            hydrated.append(merged)
        return hydrated


workflow_executor_service = WorkflowExecutorService()
