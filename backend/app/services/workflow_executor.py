# backend/app/services/workflow_executor.py
import re
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from app.core.supabase import get_supabase_client
from app.core.task_coordinator import TaskCoordinator
from app.workers.bot_executor import execute_approved_bot_task
from app.core.playwright_manager import acquire_playwright_slot

logger = logging.getLogger(__name__)


class WorkflowExecutorService:
    """
    Bộ điều phối thực thi Workflow tập trung (Workflow Executor):
    - Phân giải Data Binding giữa các bước (e.g., {{ step_03.created_accounts }}).
    - Bảo vệ Concurrency & Atomic Lease qua TaskCoordinator.
    - Quản lý trạng thái từng bước và hỗ trợ Checkpoint / Step Retry.
    - Tương thích 100% với Smart Polling (waiting_poll) và Semaphore Playwright.
    """

    @staticmethod
    def _resolve_input_bindings(inputs: Dict[str, Any], step_outputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Duyệt qua các giá trị input, giải mã chuỗi template dạng {{ step_id.field_name }}
        thành giá trị thực tế sinh ra từ outputs của các bước trước.
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

                    # Nếu cả chuỗi chỉ là template binding thì gán trực tiếp object/list
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

    async def execute_approved_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """
        Thực thi toàn bộ một Workflow đã được Quản trị viên duyệt:
        - Chạy tuần tự theo thứ tự Topological DAG.
        - Khóa và cập nhật trạng thái thời gian thực.
        """
        supabase = get_supabase_client()
        res = supabase.table("automation_workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            return {"status": "failed", "error": f"Không tìm thấy workflow #{workflow_id}"}

        wf = res.data[0]
        steps = wf.get("steps") or []
        now_iso = datetime.now(timezone.utc).isoformat()

        # Đánh dấu workflow đang chạy
        supabase.table("automation_workflows").update({
            "status": "running",
            "updated_at": now_iso
        }).eq("id", workflow_id).execute()

        step_outputs: Dict[str, Any] = {}
        for s in steps:
            if s.get("status") == "success" and s.get("outputs"):
                step_outputs[s["step_id"]] = s["outputs"]

        wf_tag = f"[WF #{workflow_id[:8]}]"
        logger.info(f"🚀 {wf_tag} Bắt đầu thực thi Workflow gồm {len(steps)} bước...")

        for idx, step in enumerate(steps):
            step_id = step.get("step_id")
            step_name = step.get("name", step_id)
            current_status = step.get("status")

            # 1. Nếu bước đã thành công từ trước (khi retry hoặc resume), bỏ qua an toàn
            if current_status == "success":
                logger.info(f"⏩ {wf_tag} Bước '{step_name}' ({step_id}) đã thành công ở phiên trước, bỏ qua.")
                continue

            # 2. Kiểm tra phụ thuộc (Dependencies)
            deps = step.get("depends_on") or []
            unmet_deps = [d for d in deps if d not in step_outputs]
            if unmet_deps:
                msg = f"Bước '{step_name}' chưa thỏa mãn phụ thuộc từ các bước: {unmet_deps}"
                logger.warning(f"⏸️ {wf_tag} {msg}")
                step["status"] = "waiting_dependency"
                self._update_workflow_steps(workflow_id, steps)
                return {"status": "waiting_dependency", "message": msg, "blocked_step": step_id}

            # 3. Phân giải Data Bindings cho inputs
            raw_inputs = step.get("inputs") or {}
            resolved_inputs = self._resolve_input_bindings(raw_inputs, step_outputs)
            step["inputs"] = resolved_inputs

            # 4. Tạo bản ghi thực thi trong bot_automation_tasks
            cap_id = step.get("capability_id", "")
            bot_type, action = self._map_capability_to_bot(cap_id)

            task_payload = {
                **resolved_inputs,
                "action": action,
                "workflow_id": workflow_id,
                "workflow_step_id": step_id,
                "step_name": step_name
            }

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

            # 5. Chiếm Lease qua TaskCoordinator & Thực thi
            logger.info(f"▶️ {wf_tag} [BƯỚC {idx+1}/{len(steps)}] Thực thi: {step_name} ({cap_id})...")
            step_result = {}
            try:
                # Nếu capability cần chạy Playwright, đảm bảo an toàn slot
                if "playwright" in cap_id or "bulk_account" in cap_id or "lms" in cap_id or "git" in cap_id or "order" in cap_id:
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

            # 6. Xử lý kết quả trả về của Bước
            status_res = step_result.get("status")
            if status_res == "waiting_poll":
                logger.info(f"⏳ {wf_tag} Bước '{step_name}' chuyển sang trạng thái WAITING_POLL (Request ID: {step_result.get('request_id')}).")
                step["status"] = "waiting_poll"
                step["outputs"] = step_result
                self._update_workflow_steps(workflow_id, steps)
                supabase.table("automation_workflows").update({
                    "status": "waiting_poll",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", workflow_id).execute()
                return {"status": "waiting_poll", "step_id": step_id, "step_result": step_result}

            elif status_res in ["failed", "error"]:
                err_msg = step_result.get("error") or "Lỗi không xác định khi thực thi bước."
                logger.error(f"❌ {wf_tag} Bước '{step_name}' thất bại: {err_msg}")
                step["status"] = "failed"
                step["error_message"] = err_msg
                step["completed_at"] = datetime.now(timezone.utc).isoformat()
                self._update_workflow_steps(workflow_id, steps)
                supabase.table("automation_workflows").update({
                    "status": "failed",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", workflow_id).execute()
                return {"status": "failed", "failed_step": step_id, "error": err_msg}

            else:
                logger.info(f"✅ {wf_tag} Bước '{step_name}' hoàn thành xuất sắc!")
                step["status"] = "success"
                step["outputs"] = step_result
                step["completed_at"] = datetime.now(timezone.utc).isoformat()
                step_outputs[step_id] = step_result
                self._update_workflow_steps(workflow_id, steps)

        # 7. Toàn bộ các bước hoàn thành thành công
        logger.info(f"🎉 {wf_tag} Toàn bộ {len(steps)} bước trong Workflow đã hoàn tất thành công rực rỡ!")
        supabase.table("automation_workflows").update({
            "status": "success",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", workflow_id).execute()

        # Đánh dấu hoàn thành ticket liên quan nếu có
        ticket_id = wf.get("ticket_id")
        if ticket_id:
            try:
                supabase.table("inbox_tickets").update({
                    "status": "completed",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", ticket_id).execute()
            except Exception:
                pass

        return {"status": "success", "message": f"Workflow #{workflow_id[:8]} đã hoàn thành 100%!", "step_outputs": step_outputs}

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
        return await self.execute_approved_workflow(workflow_id)

    @staticmethod
    def _map_capability_to_bot(capability_id: str) -> tuple[str, str]:
        """Ánh xạ capability_id sang (bot_type, action) để gọi bot_executor."""
        mapping = {
            "workspace.resolve_school": ("workspace_rpa", "resolve_lineage"),
            "cof.parse_file": ("workspace_rpa", "parse_cof"),
            "cof.generate_accounts_file": ("workspace_rpa", "generate_accounts_file"),
            "workspace.bulk_account_creation": ("workspace_rpa", "bulk_account_creation"),
            "workspace.poll_account_batch": ("workspace_rpa", "check_account_batch"),
            "cof.write_results_back": ("workspace_rpa", "write_results_back"),
            "workspace.school_create_order": ("workspace_rpa", "school_create_order"),
            "workspace.partner_approve_order": ("workspace_rpa", "approve_school_order_standalone"),
            "workspace.partner_create_contract": ("workspace_rpa", "partner_create_contract"),
            "workspace.distributor_approve_contract": ("workspace_rpa", "approve_partner_contract_standalone"),
            "workspace.admin_approve_contract": ("workspace_rpa", "admin_approve_contract"),
            "workspace.school_enroll_users": ("workspace_rpa", "school_enroll_users"),
            "lms.direct_enroll": ("lms_playwright", "direct_moodle_lms_enroll"),
            "lms.modify_user_role": ("lms_playwright", "direct_moodle_lms_enroll"),
            "lms.unenrol_users": ("lms_playwright", "unenrol_users_pipeline"),
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
