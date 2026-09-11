# backend/app/services/workflow_planner.py
import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.core.gemini import process_ticket_with_ai
from app.models.intent import IntentAssessment
from app.models.workflow import (
    WorkflowStepDraft,
    WorkflowValidationResult,
    WorkflowEntityCandidate
)

logger = logging.getLogger(__name__)

BRAIN_DIR = os.path.join(os.path.dirname(__file__), "../brain")


class WorkflowPlannerService:
    """
    Bộ lập kế hoạch Workflow tất định (Deterministic Safety-Critical Planning Engine):
    - KHÔNG GỌI GEMINI: Nhận IntentAssessment độc lập đã được chứng thực từ Pha 2.
    - Deterministic Mapping: Chỉ ánh xạ qua intent_policy.json và capabilities.json.
    - Fail-closed: Chặn đứng capability available=false hoặc thiếu bằng chứng / required inputs.
    - Lưu trữ Provenance vào bảng mới 'workflow_proposals' và duy trì bảng 'automation_workflows'.
    """

    def __init__(self):
        self.capabilities_map: Dict[str, Any] = {}
        self.policy_registry: Dict[str, Any] = {}
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
                    self.policy_registry = json.load(f).get("intents", {})

            wf_file = os.path.join(BRAIN_DIR, "workflow_rules.json")
            if os.path.exists(wf_file):
                with open(wf_file, "r", encoding="utf-8") as f:
                    self.workflow_rules = json.load(f).get("workflow_archetypes", [])

            logger.info(
                f"🧠 [PLANNER V3] Đã nạp thành công {len(self.capabilities_map)} capabilities, "
                f"{len(self.policy_registry)} intent policies!"
            )
        except Exception as e:
            logger.error(f"❌ Lỗi nạp registries cho WorkflowPlanner: {e}")

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

    def build_workflow_proposal(
        self,
        assessment: IntentAssessment,
        resolved_school: Optional[WorkflowEntityCandidate],
        candidates: List[WorkflowEntityCandidate],
        attachment_url: Optional[str]
    ) -> Tuple[str, List[WorkflowStepDraft], List[Dict[str, str]], List[str]]:
        """
        DETERMINISTIC PLANNING CORE:
        Nhận IntentAssessment đã kiểm chứng, đối chiếu intent_policy.json để sinh các bước hợp lệ.
        Trả về (status, steps, missing_requirements, warnings).
        """
        steps: List[WorkflowStepDraft] = []
        missing_requirements: List[Dict[str, str]] = list(assessment.missing_requirements)
        warnings: List[str] = list(assessment.warnings)
        step_counter = 1
        account_step_id = None

        if assessment.outcome == "no_action":
            return "no_action", [], [], ["Không có hành vi tự động hóa nào được yêu cầu."]

        entities = assessment.entities or {}
        target_school_name = resolved_school.name if resolved_school else entities.get("school_name", "")
        target_school_id = resolved_school.id if resolved_school else None

        for extracted_intent in assessment.intents:
            intent_type = extracted_intent.type
            policy = self.policy_registry.get(intent_type)

            # 1. Kiểm tra Intent có nằm trong Policy không
            if not policy:
                warnings.append(f"Ý định '{intent_type}' chưa được định nghĩa trong intent_policy.json.")
                continue

            # 2. Kiểm tra bằng chứng (Evidence Invariant)
            min_ev = policy.get("min_evidence_quotes", 1)
            if len(extracted_intent.evidence) < min_ev:
                missing_requirements.append({
                    "field": "evidence",
                    "intent": intent_type,
                    "message": f"Ý định '{intent_type}' chưa đủ bằng chứng trích dẫn nguyên văn từ nội dung yêu cầu."
                })
                continue

            # =================================================================
            # A. POLICY: CREATE_ACCOUNTS
            # =================================================================
            if intent_type == "create_accounts":
                users_list = entities.get("users", [])
                total_c = len(users_list) if isinstance(users_list, list) else 0

                if not target_school_name:
                    missing_requirements.append({
                        "field": "school_name",
                        "intent": "create_accounts",
                        "message": "Thiếu tên trường học để định danh tài khoản."
                    })
                if total_c == 0 and not attachment_url:
                    missing_requirements.append({
                        "field": "users_or_file",
                        "intent": "create_accounts",
                        "message": "Thiếu danh sách người dùng hoặc file COF/Excel đính kèm."
                    })

                if target_school_name and (total_c > 0 or attachment_url):
                    # Bước 1: Nộp batch
                    s1_id = f"step_{step_counter:02d}"
                    steps.append(WorkflowStepDraft(
                        step_id=s1_id,
                        capability_id="workspace.bulk_account_creation",
                        name=f"Nộp batch tạo tài khoản School Workspace ({target_school_name})",
                        status="ready",
                        inputs={
                            "school_identifier": target_school_name,
                            "school_id": target_school_id,
                            "attachment_url": attachment_url,
                            "total_count": total_c
                        },
                        depends_on=[]
                    ))
                    step_counter += 1

                    # Bước 2: Polling kết quả
                    s2_id = f"step_{step_counter:02d}"
                    steps.append(WorkflowStepDraft(
                        step_id=s2_id,
                        capability_id="workspace.poll_account_batch",
                        name="Kiểm tra tiến độ & Lấy kết quả tài khoản",
                        status="waiting_dependency",
                        inputs={
                            "school_identifier": target_school_name,
                            "request_id": f"{{{{ {s1_id}.account_batch_request_id }}}}"
                        },
                        depends_on=[s1_id]
                    ))
                    account_step_id = s2_id
                    step_counter += 1

            # =================================================================
            # B. POLICY: COURSE_ACCESS
            # =================================================================
            elif intent_type == "course_access":
                courses = entities.get("courses", [])
                if not courses:
                    missing_requirements.append({
                        "field": "courses",
                        "intent": "course_access",
                        "message": "Thiếu danh sách khóa học Moodle PLearn cần ghi danh."
                    })

                raw_users = entities.get("users", [])
                emails = [u.get("email") for u in raw_users if isinstance(u, dict) and u.get("email")]

                if not account_step_id and not emails:
                    missing_requirements.append({
                        "field": "student_emails",
                        "intent": "course_access",
                        "message": "Thiếu email học viên/giáo viên để ghi danh."
                    })

                if courses and (account_step_id or emails):
                    s_lms_id = f"step_{step_counter:02d}"
                    lms_deps = [account_step_id] if account_step_id else []
                    has_teacher = any(isinstance(u, dict) and u.get("role") == "teacher" for u in raw_users)

                    steps.append(WorkflowStepDraft(
                        step_id=s_lms_id,
                        capability_id="lms.direct_enroll",
                        name=f"Ghi danh khóa học Moodle PLearn ({', '.join(str(c) for c in courses)})",
                        status="waiting_dependency" if lms_deps else "ready",
                        inputs={
                            "courses": courses,
                            "student_emails": f"{{{{ {account_step_id}.created_accounts }}}}" if account_step_id else emails,
                            "role": "teacher" if has_teacher else "student"
                        },
                        depends_on=lms_deps
                    ))
                    step_counter += 1

            # =================================================================
            # C. POLICY: REPOSITORY_ACCESS
            # =================================================================
            elif intent_type == "repository_access":
                repos = entities.get("repositories", [])
                if not repos:
                    missing_requirements.append({
                        "field": "repositories",
                        "intent": "repository_access",
                        "message": "Thiếu tên Repository Git cần cấp quyền."
                    })

                raw_users = entities.get("users", [])
                emails = [u.get("email") for u in raw_users if isinstance(u, dict) and u.get("email")]

                if not account_step_id and not emails:
                    missing_requirements.append({
                        "field": "collaborators",
                        "intent": "repository_access",
                        "message": "Thiếu email cộng tác viên Git."
                    })

                target_git_role = entities.get("git_role") or policy.get("default_role", "GUEST")
                if not entities.get("git_role"):
                    warnings.append(f"Vai trò Git chưa chỉ định rõ, áp dụng mặc định tối thiểu: {target_git_role}.")

                if repos and (account_step_id or emails):
                    for r_name in repos:
                        s_git_id = f"step_{step_counter:02d}"
                        git_deps = [account_step_id] if account_step_id else []
                        steps.append(WorkflowStepDraft(
                            step_id=s_git_id,
                            capability_id="git.add_collaborators",
                            name=f"Cấp quyền cộng tác Git ({r_name})",
                            status="waiting_dependency" if git_deps else "ready",
                            inputs={
                                "repo_url": f"https://git.pythaverse.space/ptvswrp/{r_name}",
                                "collaborators": f"{{{{ {account_step_id}.created_accounts }}}}" if account_step_id else emails,
                                "target_role": target_git_role
                            },
                            depends_on=git_deps
                        ))
                        step_counter += 1

            # =================================================================
            # D. POLICY: RESET_PASSWORD
            # =================================================================
            elif intent_type == "reset_password":
                raw_users = entities.get("users", [])
                emails = [u.get("email") for u in raw_users if isinstance(u, dict) and u.get("email")]
                target_email = emails[0] if emails else entities.get("target_email")

                if not target_email:
                    missing_requirements.append({
                        "field": "target_email",
                        "intent": "reset_password",
                        "message": "Thiếu email người dùng cần cấp lại mật khẩu."
                    })
                else:
                    s_res_id = f"step_{step_counter:02d}"
                    steps.append(WorkflowStepDraft(
                        step_id=s_res_id,
                        capability_id="keycloak.reset_password",
                        name=f"Cấp lại mật khẩu Keycloak ({target_email})",
                        status="ready",
                        inputs={
                            "target_email": target_email,
                            "require_manual_password": True,
                            "temporary_password": None
                        },
                        depends_on=[]
                    ))
                    warnings.append(f"Thao tác đặt lại mật khẩu cho '{target_email}' yêu cầu Quản trị viên nhập mật khẩu lúc duyệt.")
                    step_counter += 1

            # =================================================================
            # E. POLICY: VERIFY_EMAIL
            # =================================================================
            elif intent_type == "verify_email":
                raw_users = entities.get("users", [])
                emails = [u.get("email") for u in raw_users if isinstance(u, dict) and u.get("email")]
                target_email = emails[0] if emails else entities.get("target_email")

                if not target_email:
                    missing_requirements.append({
                        "field": "target_email",
                        "intent": "verify_email",
                        "message": "Thiếu email người dùng cần kích hoạt xác thực."
                    })
                else:
                    s_ver_id = f"step_{step_counter:02d}"
                    steps.append(WorkflowStepDraft(
                        step_id=s_ver_id,
                        capability_id="keycloak.verify_email",
                        name=f"Xác thực email người dùng ({target_email})",
                        status="ready",
                        inputs={"target_email": target_email},
                        depends_on=[]
                    ))
                    step_counter += 1

        # Quyết định trạng thái
        if missing_requirements:
            status = "needs_information"
        elif any(s.capability_id == "keycloak.reset_password" for s in steps) or warnings:
            status = "needs_review"
        elif len(steps) > 0:
            status = "ready"
        else:
            status = "no_action"

        return status, steps, missing_requirements, warnings

    def plan_workflow_for_ticket(self, ticket_id: str) -> Optional[Dict[str, Any]]:
        """Lập kế hoạch Workflow tất định từ Fact Assessment của Ticket."""
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            logger.warning(f"Không tìm thấy ticket #{ticket_id} để lập plan!")
            return None

        ticket = res.data[0]
        meta = ticket.get("metadata") or {}
        ai_data = meta.get("ai_analysis")

        # 1. Nếu ticket chưa có ai_analysis, gọi engine Pha 2 phân tích
        if not ai_data or "workflow_outcome" not in ai_data:
            logger.info(f"✨ Kích hoạt tiền xử lý AI Pha 2 cho ticket #{ticket_id[:8]}...")
            ai_data = process_ticket_with_ai(ticket_id)
            if not ai_data:
                ai_data = {}

        # 2. Chuyển đổi dữ liệu sang IntentAssessment
        from app.models.intent import ExtractedIntent, EvidenceSpan
        structured_intents = []
        for op in ai_data.get("requested_operations", []):
            structured_intents.append(
                ExtractedIntent(
                    type=op.get("intent", "unknown"),
                    confidence=float(op.get("confidence", 0.8)),
                    evidence=[EvidenceSpan(quote=q) for q in ai_data.get("evidence_quotes", [])]
                )
            )

        outcome_raw = str(ai_data.get("workflow_outcome", "needs_information")).lower()
        if outcome_raw not in ["no_action", "needs_information", "candidate_action"]:
            outcome_raw = "candidate_action" if ai_data.get("requested_operations") else "no_action"

        assessment = IntentAssessment(
            outcome=outcome_raw,
            model_name=ai_data.get("model_used"),
            intents=structured_intents,
            entities=ai_data.get("entities", {}),
            missing_requirements=ai_data.get("missing_requirements", []),
            warnings=ai_data.get("warnings", []),
            raw_evidence_quotes=ai_data.get("evidence_quotes", [])
        )

        # 3. Phân giải thực thể trường học (Entity Resolution)
        excel_summary = meta.get("excel_summary") or {}
        attachments = ticket.get("attachments") or []
        attachment_url = attachments[0].get("url") if attachments else None

        detected_school_str = (
            assessment.entities.get("school_name") or
            meta.get("school_name") or
            excel_summary.get("school_name")
        )
        best_school, candidates = self.resolve_school_entities(detected_school_str)

        # 4. Thực thi Core Deterministic Planning
        status, steps, missing_reqs, plan_warnings = self.build_workflow_proposal(
            assessment=assessment,
            resolved_school=best_school,
            candidates=candidates,
            attachment_url=attachment_url
        )

        # 5. Kiểm định Đồ thị DAG
        val_result = self.validate_workflow_graph(steps)
        all_warnings = list(set(plan_warnings + val_result.warnings))

        if not val_result.is_valid:
            status = "invalid"

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary"),
            "reason_summary_vi": f"Ghép tất định {len(steps)} bước thực thi chuẩn hóa từ chính sách nghiệp vụ.",
            "overall_confidence": 0.95 if status in ["ready", "needs_review"] else 0.60,
            "workflow_outcome": "NO_ACTION" if status == "no_action" else "NEEDS_INFORMATION" if status == "needs_information" else "ACTIONABLE",
            "missing_requirements": missing_reqs,
            "detected_school": best_school.model_dump() if best_school else None,
            "school_candidates": [c.model_dump() for c in candidates],
            "detected_courses": assessment.entities.get("courses", []),
            "detected_actions": [s.capability_id for s in steps],
            "warnings": all_warnings + val_result.errors,
            "evidence_quotes": assessment.raw_evidence_quotes
        }

        title = f"Workflow #{ticket_id[:8]}" if status != "needs_information" else f"Cần bổ sung thông tin #{ticket_id[:8]}"

        # 6. Lưu song song vào workflow_proposals (mới) và automation_workflows (legacy)
        proposal_record = self._save_workflow_proposal(
            ticket_id=ticket_id,
            status=status,
            evidence=assessment.raw_evidence_quotes,
            missing_requirements=missing_reqs,
            plan=[s.model_dump() for s in steps]
        )

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
                if cap_def.get("available") is False:
                    errors.append(f"Capability '{s.capability_id}' ({s.name}) hiện đang bị khóa hoặc chưa có bot handler.")

                if cap_def.get("risk_level") == "high_mutation":
                    warnings.append(f"Bước '{s.name}' có mức rủi ro cao (high_mutation). Cần xác nhận của quản trị viên.")

        # Phát hiện chu trình (DFS)
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
        status: str,
        evidence: List[str],
        missing_requirements: List[Dict[str, str]],
        plan: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """Lưu bản đề xuất vào bảng workflow_proposals (CSDL mới)."""
        supabase = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            # Lấy revision mới nhất
            rev_res = supabase.table("inbox_ticket_revisions")\
                .select("id")\
                .eq("ticket_id", ticket_id)\
                .order("revision_no", desc=True)\
                .limit(1)\
                .execute()

            revision_id = rev_res.data[0]["id"] if rev_res.data else None
            if not revision_id:
                return None

            existing = supabase.table("workflow_proposals")\
                .select("id, version")\
                .eq("ticket_id", ticket_id)\
                .order("version", desc=True)\
                .limit(1)\
                .execute()

            new_version = (existing.data[0]["version"] + 1) if existing.data else 1

            insert_data = {
                "ticket_id": ticket_id,
                "ticket_revision_id": revision_id,
                "version": new_version,
                "status": "ready_for_review" if status in ["ready", "needs_review"] else status,
                "evidence": evidence,
                "missing_requirements": missing_requirements,
                "plan": plan,
                "policy_version": "v1.0.0",
                "created_at": now_iso,
                "updated_at": now_iso
            }
            res = supabase.table("workflow_proposals").insert(insert_data).execute()
            logger.info(f"📜 Đã lưu Workflow Proposal (v{new_version}) vào workflow_proposals cho ticket #{ticket_id[:8]}!")
            return res.data[0] if res.data else None
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