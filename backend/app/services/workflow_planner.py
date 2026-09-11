# backend/app/services/workflow_planner.py
import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.models.intent import (
    IntentAssessment,
    VerifiedIntentAssessment,
    ExtractedIntent,
    EvidenceSpan
)
from app.models.workflow import (
    WorkflowStepDraft,
    WorkflowValidationResult,
    WorkflowEntityCandidate
)

logger = logging.getLogger(__name__)

BRAIN_DIR = os.path.join(os.path.dirname(__file__), "../brain")


class WorkflowPlannerService:
    """
    Bộ lập kế hoạch Workflow tất định điều khiển bởi Chính sách (Registry-Driven Policy Engine):
    - PHA D (PROVENANCE): Truy vết đầy đủ: Event ➔ Workflow ➔ Proposal ➔ Assessment ➔ Revision.
      Đọc dữ liệu trực tiếp từ bảng 'ticket_ai_assessments', liên kết intent_assessment_id.
    - PHA E (POLICY REGISTRY): Triệt tiêu hoàn toàn code hardcode 'if intent_type == ...'.
      Toàn bộ pipeline, required_inputs và data binding đều đọc động từ 'intent_policy.json'.
    - ZERO-MOCKUP INVARIANT: Không sinh dữ liệu giả định, thiếu input bắt buộc trả needs_information.
    - FAIL-CLOSED: Capability phải có cả available=True VÀ supported_by_handler=True.
    """

    def __init__(self):
        self.capabilities_map: Dict[str, Any] = {}
        self.policy_registry: Dict[str, Any] = {}
        self.policy_version: str = "v1.1.0"
        self.workflow_rules: List[Dict[str, Any]] = []
        self._load_registries()

    def _load_registries(self):
        """Nạp các file tri thức định nghĩa từ Brain."""
        try:
            cap_file = os.path.join(BRAIN_DIR, "capabilities.json")
            if os.path.exists(cap_file):
                with open(cap_file, "r", encoding="utf-8") as f:
                    cap_data = json.load(f)
                    for c in cap_data.get("capabilities", []):
                        self.capabilities_map[c["id"]] = c

            policy_file = os.path.join(BRAIN_DIR, "intent_policy.json")
            if os.path.exists(policy_file):
                with open(policy_file, "r", encoding="utf-8") as f:
                    p_data = json.load(f)
                    self.policy_version = p_data.get("policy_version", "v1.1.0")
                    self.policy_registry = p_data.get("intents", {})

            wf_file = os.path.join(BRAIN_DIR, "workflow_rules.json")
            if os.path.exists(wf_file):
                with open(wf_file, "r", encoding="utf-8") as f:
                    self.workflow_rules = json.load(f).get("workflow_archetypes", [])

            logger.info(
                f"🧠 [REGISTRY ENGINE] Đã nạp thành công {len(self.capabilities_map)} capabilities, "
                f"{len(self.policy_registry)} intent policies (Version: {self.policy_version})!"
            )
        except Exception as e:
            logger.error(f"❌ Lỗi nạp registries cho WorkflowPlanner: {e}")

    def is_capability_executable(self, capability_id: str) -> bool:
        """
        Kiểm tra tính khả thi thực thi của capability (Fail-Closed):
        Bắt buộc available=True VÀ supported_by_handler=True.
        """
        cap = self.capabilities_map.get(capability_id)
        if not cap:
            return False
        return (cap.get("available") is True) and (cap.get("supported_by_handler") is True)

    @staticmethod
    def resolve_school_entities(query_name: Optional[str]) -> Tuple[Optional[WorkflowEntityCandidate], List[WorkflowEntityCandidate]]:
        """Tìm kiếm và phân giải thực thể trường học trong workspace_organizations."""
        if not query_name or str(query_name).strip() in ["", "None", "null", "undefined"]:
            return None, []

        q_clean = str(query_name).strip()
        supabase = get_supabase_client()
        try:
            res = supabase.table("workspace_organizations")\
                .select("id, name, code, role_type, parent_id, country")\
                .eq("role_type", "school")\
                .ilike("name", f"%{q_clean}%")\
                .limit(5)\
                .execute()

            schools = res.data or []
            if not schools:
                words = q_clean.split()
                if words:
                    short_q = words[0]
                    res = supabase.table("workspace_organizations")\
                        .select("id, name, code, role_type, parent_id, country")\
                        .eq("role_type", "school")\
                        .or_(f"code.ilike.%{short_q}%,name.ilike.%{short_q}%")\
                        .limit(5)\
                        .execute()
                    schools = res.data or []

            candidates: List[WorkflowEntityCandidate] = []
            for s in schools:
                s_name = s.get("name", "")
                if s_name.lower() == q_clean.lower() or (s.get("code") and s.get("code").lower() == q_clean.lower()):
                    conf = 0.98
                elif q_clean.lower() in s_name.lower():
                    conf = 0.88
                else:
                    conf = 0.65

                candidates.append(
                    WorkflowEntityCandidate(
                        id=s.get("id"),
                        name=s_name,
                        code=s.get("code"),
                        confidence=conf,
                        metadata={
                            "parent_id": s.get("parent_id"),
                            "country": s.get("country")
                        }
                    )
                )

            candidates.sort(key=lambda x: x.confidence, reverse=True)
            best_match = candidates[0] if candidates and candidates[0].confidence >= 0.80 else None
            return best_match, candidates
        except Exception as e:
            logger.warning(f"Lỗi phân giải trường học '{query_name}': {e}")
            return None, []

    def _resolve_context_value(self, expression: str, context: Dict[str, Any]) -> Any:
        """Phân giải biểu thức mapping từ context vận hành."""
        if expression.startswith("{{") and expression.endswith("}}"):
            return expression  # Giữ nguyên template binding cho hạ nguồn

        parts = expression.split(".")
        current = context
        for p in parts:
            if isinstance(current, dict):
                current = current.get(p)
            elif hasattr(current, p):
                current = getattr(current, p)
            else:
                return None
        return current

    def build_workflow_proposal(
        self,
        assessment: IntentAssessment,
        resolved_school: Optional[WorkflowEntityCandidate],
        candidates: List[WorkflowEntityCandidate],
        attachment_url: Optional[str]
    ) -> Tuple[str, List[WorkflowStepDraft], List[Dict[str, str]], List[str]]:
        """
        PHA E: REGISTRY-DRIVEN POLICY ENGINE (Hoàn toàn không hardcode intent).
        Đọc trực tiếp từ intent_policy.json để kiểm tra required_inputs và sinh capability pipeline.
        """
        steps: List[WorkflowStepDraft] = []
        missing_requirements: List[Dict[str, str]] = list(assessment.missing_requirements)
        warnings: List[str] = list(assessment.warnings)
        step_counter = 1
        account_batch_poll_step_id: Optional[str] = None
        has_manual_confirmation_requirement = False

        if assessment.outcome == "no_action":
            return "no_action", [], [], ["Không có hành vi tự động hóa nào được yêu cầu."]

        entities = assessment.entities or {}
        raw_users = entities.get("users", [])
        if not isinstance(raw_users, list):
            raw_users = []

        student_emails = [u.get("email") for u in raw_users if isinstance(u, dict) and u.get("email")]
        has_teacher = any(isinstance(u, dict) and u.get("role") == "teacher" for u in raw_users)

        # Ngữ cảnh vận hành dùng để resolve data mapping
        operation_context: Dict[str, Any] = {
            "resolved_school": resolved_school,
            "entities": entities,
            "context": {
                "school_name": resolved_school.name if resolved_school else entities.get("school_name"),
                "school_id": resolved_school.id if resolved_school else None,
                "attachment_url": attachment_url,
                "total_count": len(raw_users),
                "student_emails": student_emails,
                "collaborators": student_emails,
                "role": "teacher" if has_teacher else "student",
                "target_role": entities.get("git_role"),
                "target_email": (
                    student_emails[0] if student_emails else entities.get("target_email")
                )
            }
        }

        # Duyệt qua từng intent đã kiểm chứng và đối soát với Registry
        for extracted_intent in assessment.intents:
            intent_type = extracted_intent.type
            policy = self.policy_registry.get(intent_type)

            if not policy:
                warnings.append(f"Ý định '{intent_type}' chưa được định nghĩa trong intent_policy.json.")
                continue

            if policy.get("requires_manual_confirmation") is True:
                has_manual_confirmation_requirement = True

            min_ev = policy.get("min_evidence_quotes", 1)
            if len(extracted_intent.evidence) < min_ev:
                missing_requirements.append({
                    "field": "evidence",
                    "intent": intent_type,
                    "message": f"Ý định '{intent_type}' chưa đủ bằng chứng trích dẫn nguyên văn từ nội dung yêu cầu."
                })
                continue

            # 1. KIỂM TRA REQUIRED INPUTS ĐƯỢC ĐỊNH NGHĨA TRONG POLICY
            required_inputs = policy.get("required_inputs", [])
            intent_missing = False

            for req in required_inputs:
                if req == "school_name" and not operation_context["context"]["school_name"]:
                    missing_requirements.append({
                        "field": "school_name",
                        "intent": intent_type,
                        "message": "Thiếu tên trường học để định danh tài khoản."
                    })
                    intent_missing = True

                elif req == "users_or_file" and (operation_context["context"]["total_count"] == 0 and not attachment_url):
                    missing_requirements.append({
                        "field": "users_or_file",
                        "intent": intent_type,
                        "message": "Thiếu danh sách người dùng hoặc file COF/Excel đính kèm."
                    })
                    intent_missing = True

                elif req == "courses" and not entities.get("courses"):
                    missing_requirements.append({
                        "field": "courses",
                        "intent": intent_type,
                        "message": "Thiếu danh sách khóa học Moodle PLearn cần ghi danh."
                    })
                    intent_missing = True

                elif req == "student_emails" and (not account_batch_poll_step_id and not student_emails):
                    missing_requirements.append({
                        "field": "student_emails",
                        "intent": intent_type,
                        "message": "Thiếu email học viên/giáo viên để ghi danh."
                    })
                    intent_missing = True

                elif req == "repositories" and not entities.get("repositories"):
                    missing_requirements.append({
                        "field": "repositories",
                        "intent": intent_type,
                        "message": "Thiếu tên Repository Git cần cấp quyền."
                    })
                    intent_missing = True

                elif req == "collaborators" and (not account_batch_poll_step_id and not student_emails):
                    missing_requirements.append({
                        "field": "collaborators",
                        "intent": intent_type,
                        "message": "Thiếu email cộng tác viên Git."
                    })
                    intent_missing = True

                elif req == "git_role" and not entities.get("git_role"):
                    missing_requirements.append({
                        "field": "git_role",
                        "intent": intent_type,
                        "message": "Thiếu vai trò Git (ADMIN, DEVELOPER, GUEST). Nghiêm cấm dùng role mặc định."
                    })
                    intent_missing = True

                elif req == "target_email" and not operation_context["context"]["target_email"]:
                    missing_requirements.append({
                        "field": "target_email",
                        "intent": intent_type,
                        "message": "Thiếu email người dùng thực hiện tác vụ định danh."
                    })
                    intent_missing = True

            if intent_missing:
                continue

            # 2. XÂY DỰNG CAPABILITY PIPELINE TẤT ĐỊNH TỪ REGISTRY
            pipeline = policy.get("capability_pipeline", [])
            intent_step_id_map: Dict[str, str] = {}

            for step_cfg in pipeline:
                cap_id = step_cfg.get("capability_id")

                if not self.is_capability_executable(cap_id):
                    warnings.append(f"Capability '{cap_id}' trong pipeline của intent '{intent_type}' đang tạm khóa hoặc chưa có bot handler.")
                    continue

                curr_step_id = f"step_{step_counter:02d}"
                step_counter += 1

                # Phân giải inputs_mapping từ policy
                step_inputs: Dict[str, Any] = {}
                for in_key, in_expr in step_cfg.get("inputs_mapping", {}).items():
                    if in_expr == "operator_manual_input":
                        step_inputs[in_key] = None
                        step_inputs["require_manual_password"] = True
                    elif "{{ step_01." in str(in_expr):
                        # Thay thế tham chiếu bước tạo tài khoản trước đó
                        first_step_id = intent_step_id_map.get("step_01", "step_01")
                        step_inputs[in_key] = str(in_expr).replace("step_01", first_step_id)
                    elif in_expr in ["context.student_emails", "context.collaborators"]:
                        if account_batch_poll_step_id:
                            step_inputs[in_key] = f"{{{{ {account_batch_poll_step_id}.created_accounts }}}}"
                        else:
                            step_inputs[in_key] = student_emails
                    elif in_expr == "context.repo_url":
                        repos = entities.get("repositories", [])
                        repo_name = repos[0] if repos else "unknown"
                        step_inputs[in_key] = f"https://git.pythaverse.space/ptvswrp/{repo_name}"
                    else:
                        val = self._resolve_context_value(in_expr, operation_context)
                        step_inputs[in_key] = val

                # Phân giải dependencies
                resolved_deps: List[str] = []
                for dep in step_cfg.get("depends_on", []):
                    if dep == "create_accounts_batch_poll_if_exists":
                        if account_batch_poll_step_id:
                            resolved_deps.append(account_batch_poll_step_id)
                    elif dep in intent_step_id_map:
                        resolved_deps.append(intent_step_id_map[dep])
                    elif dep in [s.step_id for s in steps]:
                        resolved_deps.append(dep)

                # Đánh dấu step kiểm tra batch poll để các step sau kế thừa
                if cap_id == "workspace.poll_account_batch":
                    account_batch_poll_step_id = curr_step_id

                intent_step_id_map[step_cfg.get("step_id", f"step_{len(intent_step_id_map)+1:02d}")] = curr_step_id

                step_name = step_cfg.get("name", cap_id)
                if resolved_school and cap_id == "workspace.bulk_account_creation":
                    step_name = f"{step_name} ({resolved_school.name})"

                steps.append(WorkflowStepDraft(
                    step_id=curr_step_id,
                    capability_id=cap_id,
                    name=step_name,
                    status="waiting_dependency" if resolved_deps else "ready",
                    inputs=step_inputs,
                    depends_on=resolved_deps
                ))

        # 3. KẾT LUẬN TRẠNG THÁI CUỐI CÙNG
        if missing_requirements:
            status = "needs_information"
        elif has_manual_confirmation_requirement or warnings:
            status = "needs_review"
        elif len(steps) > 0:
            status = "ready"
        else:
            status = "no_action"

        return status, steps, missing_requirements, warnings

    async def plan_workflow_for_ticket(
        self, 
        ticket_id: str,
        revision_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        PHA D: NỐI ĐẦY ĐỦ PROVENANCE CHAIN.
        - Đọc đánh giá sự thật trực tiếp từ bảng 'ticket_ai_assessments' (assessment_kind='fact_extraction').
        - Liên kết chặt chẽ: ticket_revision_id và intent_assessment_id.
        - Supersede toàn bộ proposal cũ chưa approved.
        """
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            logger.warning(f"Không tìm thấy ticket #{ticket_id} để lập plan!")
            return None

        ticket = res.data[0]

        # 1. Xác định chính xác revision_id
        target_revision_id = revision_id
        if not target_revision_id:
            rev_res = supabase.table("inbox_ticket_revisions")\
                .select("id")\
                .eq("ticket_id", ticket_id)\
                .order("revision_no", desc=True)\
                .limit(1)\
                .execute()
            if rev_res.data:
                target_revision_id = rev_res.data[0]["id"]

        # Nếu chưa có revision nào, kích hoạt tiền xử lý
        if not target_revision_id:
            from app.workers.ticket_processor import process_incoming_ticket
            proc_res = await process_incoming_ticket(ticket)
            target_revision_id = proc_res.get("revision_id")

        if not target_revision_id:
            logger.error(f"❌ Không thể phân giải revision cho ticket #{ticket_id}")
            return None

        # 2. Đọc trực tiếp từ ticket_ai_assessments (Không lượm từ metadata.ai_analysis)
        assess_res = supabase.table("ticket_ai_assessments")\
            .select("*")\
            .eq("ticket_revision_id", target_revision_id)\
            .eq("assessment_kind", "fact_extraction")\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()

        assessment_record = assess_res.data[0] if assess_res.data else None

        # Nếu chưa có assessment trong CSDL, chạy quy trình phân tích
        if not assessment_record:
            from app.workers.ticket_processor import process_ticket_revision
            proc_res = await process_ticket_revision(target_revision_id)
            assess_res = supabase.table("ticket_ai_assessments")\
                .select("*")\
                .eq("ticket_revision_id", target_revision_id)\
                .eq("assessment_kind", "fact_extraction")\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
            assessment_record = assess_res.data[0] if assess_res.data else None

        if not assessment_record:
            logger.error(f"❌ Không tìm thấy bản ghi Fact Extraction cho revision #{target_revision_id[:8]}")
            return None

        assessment_id = assessment_record["id"]
        structured_fact = assessment_record.get("structured_result") or {}

        # 3. Dựng đối tượng VerifiedIntentAssessment
        structured_intents: List[ExtractedIntent] = []
        for op in structured_fact.get("intents", []):
            if isinstance(op, dict):
                ev_list = [
                    EvidenceSpan(**e) if isinstance(e, dict) else EvidenceSpan(quote=str(e))
                    for e in op.get("evidence", [])
                ]
                structured_intents.append(
                    ExtractedIntent(
                        type=op.get("type", "unknown"),
                        confidence=float(op.get("confidence", 0.8)),
                        evidence=ev_list,
                        required_entities=op.get("required_entities", [])
                    )
                )

        assessment = IntentAssessment(
            outcome=structured_fact.get("outcome", "needs_information"),
            model_name=assessment_record.get("model_name"),
            prompt_version=assessment_record.get("prompt_version", "v1.1.0"),
            intents=structured_intents,
            entities=structured_fact.get("entities", {}),
            missing_requirements=structured_fact.get("missing_requirements", []),
            warnings=structured_fact.get("warnings", []),
            raw_evidence_quotes=structured_fact.get("raw_evidence_quotes", [])
        )

        # 4. Phân giải thực thể trường học (Entity Resolution)
        meta = ticket.get("metadata") or {}
        excel_summary = meta.get("excel_summary") or {}
        attachments = ticket.get("attachments") or []
        attachment_url = attachments[0].get("url") if attachments else None

        detected_school_str = (
            assessment.entities.get("school_name") or
            meta.get("school_name") or
            excel_summary.get("school_name")
        )
        best_school, candidates = self.resolve_school_entities(detected_school_str)

        # 5. Thực thi Deterministic Planning Core
        status, steps, missing_reqs, plan_warnings = self.build_workflow_proposal(
            assessment=assessment,
            resolved_school=best_school,
            candidates=candidates,
            attachment_url=attachment_url
        )

        # 6. Kiểm định Đồ thị DAG
        val_result = self.validate_workflow_graph(steps)
        all_warnings = list(set(plan_warnings + val_result.warnings))
        if not val_result.is_valid:
            status = "invalid"

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary"),
            "reason_summary_vi": f"Registry Policy Engine đã sinh {len(steps)} bước thực thi từ chính sách {self.policy_version}.",
            "overall_confidence": 0.95 if status in ["ready", "needs_review"] else 0.60,
            "workflow_outcome": "NO_ACTION" if status == "no_action" else "NEEDS_INFORMATION" if status == "needs_information" else "ACTIONABLE",
            "missing_requirements": missing_reqs,
            "detected_school": best_school.model_dump() if best_school else None,
            "school_candidates": [c.model_dump() for c in candidates],
            "detected_courses": assessment.entities.get("courses", []),
            "detected_actions": [s.capability_id for s in steps],
            "warnings": all_warnings + val_result.errors,
            "evidence_quotes": assessment.raw_evidence_quotes,
            "provenance": {
                "ticket_revision_id": target_revision_id,
                "intent_assessment_id": assessment_id,
                "policy_version": self.policy_version
            }
        }

        # 7. LƯU PROVENANCE VÀO BẢNG workflow_proposals (KÈM ĐÁNH DẤU SUPERSEDED)
        self._save_workflow_proposal(
            ticket_id=ticket_id,
            revision_id=target_revision_id,
            assessment_id=assessment_id,
            status=status,
            evidence=assessment.raw_evidence_quotes,
            missing_requirements=missing_reqs,
            entity_resolution={
                "detected_school": best_school.model_dump() if best_school else None,
                "candidates_count": len(candidates)
            },
            plan=[s.model_dump() for s in steps]
        )

        # 8. Lưu bản ghi draft cho giao diện hiện hành
        title = f"Workflow #{ticket_id[:8]}" if status != "needs_information" else f"Cần bổ sung thông tin #{ticket_id[:8]}"
        return self._save_workflow_draft(
            ticket_id=ticket_id,
            title=title,
            goal=ticket.get("subject"),
            status=status,
            ai_analysis=ai_analysis_dict,
            steps=[s.model_dump() for s in steps]
        )

    def validate_workflow_graph(self, steps: List[WorkflowStepDraft]) -> WorkflowValidationResult:
        """Kiểm định chặt chẽ Đồ thị DAG & tính khả dụng của capabilities."""
        errors: List[str] = []
        warnings: List[str] = []
        step_ids = {s.step_id for s in steps}

        adj: Dict[str, List[str]] = {s.step_id: [] for s in steps}
        for s in steps:
            for dep in s.depends_on:
                if dep not in step_ids:
                    errors.append(f"Bước '{s.name}' ({s.step_id}) phụ thuộc vào bước '{dep}' không tồn tại trong luồng.")
                else:
                    adj[dep].append(s.step_id)

            cap_def = self.capabilities_map.get(s.capability_id)
            if not cap_def:
                errors.append(f"Capability '{s.capability_id}' không tồn tại trong capabilities.json.")
            else:
                if cap_def.get("available") is not True or cap_def.get("supported_by_handler") is not True:
                    errors.append(
                        f"Capability '{s.capability_id}' ({s.name}) hiện không khả dụng để thực thi "
                        f"(available={cap_def.get('available')}, supported_by_handler={cap_def.get('supported_by_handler')})."
                    )

                if cap_def.get("risk_level") == "high_mutation":
                    warnings.append(f"Bước '{s.name}' có mức rủi ro cao (high_mutation). Bắt buộc xác nhận phê duyệt.")

        visited: Dict[str, int] = {s.step_id: 0 for s in steps}

        def dfs(node: str, path: List[str]):
            visited[node] = 1
            path.append(node)
            for neighbor in adj.get(node, []):
                if visited[neighbor] == 1:
                    cycle_path = " -> ".join(path + [neighbor])
                    errors.append(f"Phát hiện chu trình phụ thuộc (Circular Dependency): {cycle_path}")
                    return
                elif visited[neighbor] == 0:
                    dfs(neighbor, path)
            visited[node] = 2
            path.pop()

        for s in steps:
            if visited[s.step_id] == 0:
                dfs(s.step_id, [])

        is_valid = len(errors) == 0
        status = "ready" if is_valid and len(warnings) == 0 else "needs_review" if is_valid else "invalid"

        return WorkflowValidationResult(
            is_valid=is_valid,
            status=status,
            errors=errors,
            warnings=warnings,
            stats={
                "total_steps": len(steps),
                "ready_steps": sum(1 for s in steps if not s.depends_on),
                "dependent_steps": sum(1 for s in steps if s.depends_on)
            }
        )

    def _save_workflow_proposal(
        self,
        ticket_id: str,
        revision_id: str,
        assessment_id: str,
        status: str,
        evidence: List[str],
        missing_requirements: List[Dict[str, str]],
        entity_resolution: Dict[str, Any],
        plan: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        PHA D: Lưu bản đề xuất vào bảng workflow_proposals với đầy đủ Provenance Chain.
        Tự động supersede các bản đề xuất cũ chưa duyệt.
        """
        supabase = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            # 1. Truy vấn version tiếp theo
            existing = supabase.table("workflow_proposals")\
                .select("id, version, status")\
                .eq("ticket_id", ticket_id)\
                .order("version", desc=True)\
                .limit(1)\
                .execute()

            new_version = (existing.data[0]["version"] + 1) if existing.data else 1
            old_proposal_id = existing.data[0]["id"] if existing.data else None

            # 2. Tạo proposal mới
            insert_data = {
                "ticket_id": ticket_id,
                "ticket_revision_id": revision_id,
                "intent_assessment_id": assessment_id,
                "version": new_version,
                "status": "ready_for_review" if status in ["ready", "needs_review"] else status,
                "evidence": evidence,
                "missing_requirements": missing_requirements,
                "entity_resolution": entity_resolution,
                "plan": plan,
                "policy_version": self.policy_version,
                "created_at": now_iso,
                "updated_at": now_iso
            }
            res = supabase.table("workflow_proposals").insert(insert_data).execute()
            created_proposal = res.data[0] if res.data else None

            # 3. Đánh dấu superseded cho proposal cũ (nếu chưa được approved)
            if created_proposal and old_proposal_id:
                old_status = existing.data[0].get("status")
                if old_status not in ["approved", "executed"]:
                    try:
                        supabase.table("workflow_proposals").update({
                            "status": "superseded",
                            "superseded_by": created_proposal["id"],
                            "updated_at": now_iso
                        }).eq("id", old_proposal_id).execute()
                    except Exception as sup_err:
                        logger.warning(f"Lỗi cập nhật superseded_by: {sup_err}")

            logger.info(f"📜 [PROVENANCE CHAIN] Đã lưu Proposal v{new_version} (assessment: {assessment_id[:8]}) cho ticket #{ticket_id[:8]}!")
            return created_proposal
        except Exception as e:
            logger.warning(f"⚠️ Lỗi lưu workflow_proposals: {e}")
            return None

    def _save_workflow_draft(
        self,
        ticket_id: str,
        title: str,
        goal: str,
        status: str,
        ai_analysis: Dict[str, Any],
        steps: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Lưu phiên bản vào automation_workflows (Tương thích UI hiện hành)."""
        supabase = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()

        existing = supabase.table("automation_workflows")\
            .select("id, version, status")\
            .eq("ticket_id", ticket_id)\
            .order("version", desc=True)\
            .limit(1)\
            .execute()

        new_version = 1
        if existing.data:
            old_wf = existing.data[0]
            new_version = (old_wf.get("version") or 1) + 1
            if old_wf.get("status") in ["draft", "needs_review", "ready", "no_action", "needs_information"]:
                supabase.table("automation_workflows").update({
                    "status": "archived",
                    "updated_at": now_iso
                }).eq("id", old_wf["id"]).execute()

        insert_payload = {
            "ticket_id": ticket_id,
            "title": title,
            "goal": goal,
            "status": status,
            "version": new_version,
            "ai_analysis": ai_analysis,
            "steps": steps,
            "created_at": now_iso,
            "updated_at": now_iso
        }

        res = supabase.table("automation_workflows").insert(insert_payload).execute()
        wf_record = res.data[0] if res.data else insert_payload

        logger.info(f"💾 Đã lưu Workflow Draft #{wf_record.get('id', 'N/A')[:8]} (v{new_version}, status='{status}') cho ticket #{ticket_id[:8]}!")
        return wf_record


workflow_planner_service = WorkflowPlannerService()