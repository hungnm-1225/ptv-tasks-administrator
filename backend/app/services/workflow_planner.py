# backend/app/services/workflow_planner.py
import os
import json
import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.services.evidence_verifier import load_verified_assessment
from app.core.supabase import get_supabase_client
from app.models.intent import (
    IntentAssessment,
    TypedEntities,
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
    - Tra cứu dữ liệu thật từ bảng lms_courses & workspace_courses, triệt tiêu 100% việc bịa đặt URL!
    - Tự động bắt cặp Git Repo tương ứng theo vai trò (Teacher/All).
    - Tên trường dữ liệu rõ ràng, chuẩn hóa theo ngữ cảnh giáo viên/học sinh.
    """

    def __init__(self):
        self.capabilities_map: Dict[str, Any] = {}
        self.policy_registry: Dict[str, Any] = {}
        self.policy_version: str = "v1.2.0"
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
                    self.policy_version = p_data.get("policy_version", "v1.2.0")
                    self.policy_registry = p_data.get("intents", {})

            wf_file = os.path.join(BRAIN_DIR, "workflow_rules.json")
            if os.path.exists(wf_file):
                with open(wf_file, "r", encoding="utf-8") as f:
                    self.workflow_rules = json.load(f).get("workflow_archetypes", [])

            logger.info(
                f"🧠 [REGISTRY ENGINE] Đã nạp {len(self.capabilities_map)} capabilities, "
                f"{len(self.policy_registry)} policies (v{self.policy_version})!"
            )
        except Exception as e:
            logger.error(f"❌ Lỗi nạp registries cho WorkflowPlanner: {e}")

    def is_capability_executable(self, capability_id: str) -> bool:
        cap = self.capabilities_map.get(capability_id)
        if not cap:
            return False
        return (cap.get("available") is True) and (cap.get("supported_by_handler") is True)

    @staticmethod
    def resolve_school_entities(query_name: Optional[str]) -> Tuple[Optional[WorkflowEntityCandidate], List[WorkflowEntityCandidate]]:
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
            candidates: List[WorkflowEntityCandidate] = []
            for s in schools:
                s_name = s.get("name", "")
                conf = 0.98 if s_name.lower() == q_clean.lower() else 0.88 if q_clean.lower() in s_name.lower() else 0.65
                candidates.append(
                    WorkflowEntityCandidate(
                        id=s.get("id"),
                        name=s_name,
                        code=s.get("code"),
                        confidence=conf,
                        metadata={"parent_id": s.get("parent_id"), "country": s.get("country")}
                    )
                )

            candidates.sort(key=lambda x: x.confidence, reverse=True)
            best_match = candidates[0] if candidates and candidates[0].confidence >= 0.80 else None
            return best_match, candidates
        except Exception as e:
            logger.warning(f"Lỗi phân giải trường học '{query_name}': {e}")
            return None, []

    @staticmethod
    def resolve_course_and_git_repo(course_query: str, is_teacher: bool = True) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
        """
        Tra cứu THỰC TẾ trong bảng lms_courses:
        - Tìm khóa học chuẩn theo tên (SWRP 11, SWRP 8...)
        - Trích xuất đúng Git Repo tương ứng từ cột git_repos (Ưu tiên repo Giáo viên)
        - TUYỆT ĐỐI KHÔNG TỰ BỊA URL NẾU DATABASE CHƯA CÓ!
        """
        if not course_query:
            return None, None, None

        supabase = get_supabase_client()
        # Tách số hiệu môn học (Ví dụ 'SWRP 11' -> tìm cả 'SWRP 11' hoặc 'SWRP%11')
        clean_q = re.sub(r"\s+", " ", course_query.strip())
        num_match = re.search(r"\d+", clean_q)
        num_part = num_match.group(0) if num_match else ""

        try:
            # 1. Tìm khóa học trong lms_courses
            query = supabase.table("lms_courses").select("id, name, code, lms_url, git_repos")
            if num_part:
                query = query.or_(f"name.ilike.%SWRP {num_part}%,name.ilike.%SWRP%{num_part}%,name.ilike.%{clean_q}%")
            else:
                query = query.ilike("name", f"%{clean_q}%")
            
            res = query.limit(3).execute()
            courses = res.data or []

            if not courses:
                return None, None, None

            best_course = courses[0]
            matched_name = best_course.get("name")
            git_repos = best_course.get("git_repos") or []

            # 2. Phân giải Repo thật từ cấu hình git_repos trong DB
            resolved_repo_url = None
            resolved_repo_name = None

            if isinstance(git_repos, list) and git_repos:
                # Nếu là giáo viên, ưu tiên tìm repo có nhãn Teacher / GV
                target_tag = "teacher" if is_teacher else "all"
                
                for r in git_repos:
                    if isinstance(r, dict):
                        r_name = r.get("name", "") or r.get("repo_name", "")
                        r_url = r.get("url", "") or r.get("repo_url", "")
                        r_target = str(r.get("target", "") or r.get("role", "")).lower()

                        if is_teacher and ("teacher" in r_target or "gv" in r_name.lower() or "teacher" in r_name.lower()):
                            resolved_repo_url = r_url or f"https://git.pythaverse.space/pythaverse/{r_name}"
                            resolved_repo_name = r_name
                            break
                        elif not is_teacher and ("all" in r_target or "all" in r_name.lower() or "hs" in r_name.lower()):
                            resolved_repo_url = r_url or f"https://git.pythaverse.space/pythaverse/{r_name}"
                            resolved_repo_name = r_name
                            break

                # Fallback: Lấy repo đầu tiên nếu không khớp tag chính xác
                if not resolved_repo_url and git_repos:
                    first_r = git_repos[0]
                    if isinstance(first_r, dict):
                        r_name = first_r.get("name") or first_r.get("repo_name")
                        resolved_repo_url = first_r.get("url") or (f"https://git.pythaverse.space/pythaverse/{r_name}" if r_name else None)
                        resolved_repo_name = r_name
                    elif isinstance(first_r, str):
                        resolved_repo_name = first_r
                        resolved_repo_url = first_r if first_r.startswith("http") else f"https://git.pythaverse.space/pythaverse/{first_r}"

            return best_course, matched_name, resolved_repo_url

        except Exception as e:
            logger.warning(f"Lỗi tra cứu lms_courses cho '{course_query}': {e}")
            return None, None, None

    def _resolve_context_value(self, expression: str, context: Dict[str, Any]) -> Any:
        if str(expression).startswith("{{") and str(expression).endswith("}}"):
            return expression
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
        steps: List[WorkflowStepDraft] = []
        missing_requirements: List[Dict[str, str]] = list(assessment.missing_requirements)
        warnings: List[str] = list(assessment.warnings)
        step_counter = 1
        account_batch_poll_step_id: Optional[str] = None

        if assessment.outcome == "no_action":
            return "no_action", [], [], ["Không có hành vi tự động hóa nào được yêu cầu."]

        typed_entities = assessment.typed_entities
        entities: Dict[str, Any] = typed_entities.model_dump() if isinstance(typed_entities, TypedEntities) else {}

        raw_users = entities.get("users", [])
        if not isinstance(raw_users, list):
            raw_users = []

        user_emails = [u.get("email") for u in raw_users if isinstance(u, dict) and u.get("email")]
        has_teacher = any(isinstance(u, dict) and u.get("role") == "teacher" for u in raw_users)

        detected_courses = entities.get("courses", [])
        primary_course_query = detected_courses[0] if detected_courses else ""

        # 🔍 TRA CỨU KHÓA HỌC & GIT REPO THẬT TỪ CƠ SỞ DỮ LIỆU
        course_record, matched_course_name, real_git_repo_url = self.resolve_course_and_git_repo(
            course_query=primary_course_query,
            is_teacher=has_teacher
        )

        final_course_display = [matched_course_name] if matched_course_name else detected_courses
        final_git_role = entities.get("git_role") or "GUEST"

        # Nếu không tìm thấy Git Repo trong DB, BÁO CẢNH BÁO thay vì tự bịa URL!
        if not real_git_repo_url and any(i.type == "repository_access" for i in assessment.intents if i.is_valid):
            warnings.append(
                f"Khóa học '{primary_course_query}' chưa được liên kết Git Repo trong Course Management. Quản trị viên cần nhập Repo URL thủ công."
            )

        active_school_name = resolved_school.name if resolved_school else entities.get("school_name")
        active_school_id = resolved_school.id if resolved_school else None

        operation_context: Dict[str, Any] = {
            "resolved_school": resolved_school,
            "entities": {
                **entities,
                "courses": final_course_display,
                "git_role": final_git_role,
                "repository_url": real_git_repo_url
            },
            "context": {
                "school_name": active_school_name,
                "school_id": active_school_id,
                "attachment_url": attachment_url,
                "total_count": len(raw_users),
                "users": raw_users,
                "user_emails": user_emails,
                "collaborators": user_emails,
                "role": "teacher" if has_teacher else "student",
                "target_role": final_git_role,
                "repo_url": real_git_repo_url,
                "target_email": user_emails[0] if user_emails else entities.get("target_email")
            }
        }

        for extracted_intent in assessment.intents:
            if not extracted_intent.is_valid:
                continue

            intent_type = extracted_intent.type
            policy = self.policy_registry.get(intent_type)
            if not policy:
                continue

            pipeline = policy.get("capability_pipeline", [])
            intent_step_id_map: Dict[str, str] = {}

            for step_cfg in pipeline:
                cap_id = step_cfg.get("capability_id")
                if not self.is_capability_executable(cap_id):
                    continue

                curr_step_id = f"step_{step_counter:02d}"
                step_counter += 1

                step_inputs: Dict[str, Any] = {}
                for in_key, in_expr in step_cfg.get("inputs_mapping", {}).items():
                    if in_expr == "operator_manual_input":
                        step_inputs[in_key] = None
                    elif "{{ step_01." in str(in_expr):
                        first_step_id = intent_step_id_map.get("step_01", "step_01")
                        step_inputs[in_key] = str(in_expr).replace("step_01", first_step_id)
                    elif in_expr in ["context.student_emails", "context.collaborators", "context.user_emails"]:
                        if account_batch_poll_step_id:
                            step_inputs[in_key] = f"{{{{ {account_batch_poll_step_id}.created_accounts }}}}"
                        else:
                            step_inputs[in_key] = user_emails
                    elif in_key == "repo_url" or in_expr == "context.repo_url":
                        step_inputs[in_key] = real_git_repo_url
                    elif in_key == "courses" or in_expr == "entities.courses":
                        step_inputs[in_key] = final_course_display
                    else:
                        step_inputs[in_key] = self._resolve_context_value(in_expr, operation_context)

                resolved_deps: List[str] = []
                for dep in step_cfg.get("depends_on", []):
                    if dep == "create_accounts_batch_poll_if_exists":
                        if account_batch_poll_step_id:
                            resolved_deps.append(account_batch_poll_step_id)
                    elif dep in intent_step_id_map:
                        resolved_deps.append(intent_step_id_map[dep])
                    elif dep in [s.step_id for s in steps]:
                        resolved_deps.append(dep)

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

        status = "needs_information" if missing_requirements else "needs_review" if warnings else "ready" if steps else "no_action"
        return status, steps, missing_requirements, warnings

    def validate_workflow_graph(self, steps: List[WorkflowStepDraft]) -> WorkflowValidationResult:
        errors: List[str] = []
        warnings: List[str] = []
        step_ids = {s.step_id for s in steps}

        adj: Dict[str, List[str]] = {s.step_id: [] for s in steps}
        for s in steps:
            for dep in s.depends_on:
                if dep not in step_ids:
                    errors.append(f"Bước '{s.name}' ({s.step_id}) phụ thuộc vào bước '{dep}' không tồn tại.")
                else:
                    adj[dep].append(s.step_id)

            cap_def = self.capabilities_map.get(s.capability_id)
            if cap_def and cap_def.get("risk_level") == "high_mutation":
                warnings.append(f"Bước '{s.name}' có mức rủi ro cao (high_mutation). Bắt buộc xác nhận phê duyệt.")

        is_valid = len(errors) == 0
        return WorkflowValidationResult(
            is_valid=is_valid,
            status="ready" if is_valid and len(warnings) == 0 else "needs_review" if is_valid else "invalid",
            errors=errors,
            warnings=warnings,
            stats={"total_steps": len(steps), "ready_steps": sum(1 for s in steps if not s.depends_on), "dependent_steps": sum(1 for s in steps if s.depends_on)}
        )

    async def plan_workflow_for_ticket(self, ticket_id: str, revision_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            return None
        ticket = res.data[0]

        target_revision_id = revision_id
        if not target_revision_id:
            rev_res = supabase.table("inbox_ticket_revisions").select("id").eq("ticket_id", ticket_id).order("revision_no", desc=True).limit(1).execute()
            if rev_res.data:
                target_revision_id = rev_res.data[0]["id"]

        if not target_revision_id:
            return None

        assess_res = supabase.table("ticket_ai_assessments")\
            .select("*")\
            .eq("ticket_revision_id", target_revision_id)\
            .eq("assessment_kind", "fact_extraction")\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()

        assessment_record = assess_res.data[0] if assess_res.data else None
        if not assessment_record:
            return None

        assessment = load_verified_assessment(assessment_record=assessment_record, expected_revision_id=target_revision_id)

        revision_res = supabase.table("inbox_ticket_revisions").select("attachments").eq("id", target_revision_id).limit(1).execute()
        revision = revision_res.data[0] if revision_res.data else {}
        attachments = revision.get("attachments") or []
        attachment_url = attachments[0].get("url") if attachments else None

        typed_entities = assessment.typed_entities or TypedEntities()
        detected_school_str = typed_entities.school_name or ticket.get("school_name")
        best_school, candidates = self.resolve_school_entities(detected_school_str)

        status, steps, missing_reqs, plan_warnings = self.build_workflow_proposal(
            assessment=assessment,
            resolved_school=best_school,
            candidates=candidates,
            attachment_url=attachment_url
        )

        val_result = self.validate_workflow_graph(steps)
        all_warnings = list(set(plan_warnings + val_result.warnings))

        created_proposal = self._save_workflow_proposal(
            ticket_id=ticket_id,
            revision_id=target_revision_id,
            assessment_id=assessment_record["id"],
            status=status,
            evidence=assessment.raw_evidence_quotes,
            missing_requirements=missing_reqs,
            entity_resolution={"detected_school": best_school.model_dump() if best_school else None, "candidates_count": len(candidates)},
            plan=[s.model_dump() for s in steps]
        )
        proposal_id = created_proposal["id"]

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary"),
            "reason_summary_vi": f"Registry Policy Engine đã sinh {len(steps)} bước thực thi từ chính sách {self.policy_version}.",
            "overall_confidence": 0.95 if status in ["ready", "needs_review"] else 0.85,
            "workflow_outcome": "ACTIONABLE" if status in ["ready", "needs_review"] else "NEEDS_INFORMATION",
            "missing_requirements": missing_reqs,
            "detected_school": best_school.model_dump() if best_school else None,
            "school_candidates": [c.model_dump() for c in candidates],
            "detected_courses": typed_entities.courses,
            "detected_actions": [s.capability_id for s in steps],
            "warnings": all_warnings + val_result.errors,
            "evidence_quotes": assessment.raw_evidence_quotes,
            "provenance": {
                "ticket_revision_id": target_revision_id,
                "intent_assessment_id": assessment_record["id"],
                "proposal_id": proposal_id,
                "policy_version": self.policy_version
            }
        }

        title = f"Workflow #{ticket_id[:8]}" if status != "needs_information" else f"Cần bổ sung thông tin #{ticket_id[:8]}"
        return self._save_workflow_draft(
            ticket_id=ticket_id,
            proposal_id=proposal_id,
            title=title,
            goal=ticket.get("subject"),
            status=status,
            ai_analysis=ai_analysis_dict,
            steps=[s.model_dump() for s in steps]
        )

    def _save_workflow_proposal(self, ticket_id, revision_id, assessment_id, status, evidence, missing_requirements, entity_resolution, plan):
        supabase = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        existing = supabase.table("workflow_proposals").select("id, version, status").eq("ticket_id", ticket_id).order("version", desc=True).limit(1).execute()
        new_version = (existing.data[0]["version"] + 1) if existing.data else 1
        old_proposal_id = existing.data[0]["id"] if existing.data else None

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
        created_proposal = res.data[0]

        if old_proposal_id and existing.data[0].get("status") not in ["approved", "executed"]:
            try:
                supabase.table("workflow_proposals").update({"status": "superseded", "superseded_by": created_proposal["id"], "updated_at": now_iso}).eq("id", old_proposal_id).execute()
            except Exception:
                pass
        return created_proposal

    def _save_workflow_draft(self, ticket_id, proposal_id, title, goal, status, ai_analysis, steps):
        supabase = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        existing = supabase.table("automation_workflows").select("id, version, status").eq("ticket_id", ticket_id).order("version", desc=True).limit(1).execute()
        new_version = (existing.data[0].get("version") or 1) + 1 if existing.data else 1
        if existing.data and existing.data[0].get("status") in ["draft", "needs_review", "ready", "no_action", "needs_information"]:
            supabase.table("automation_workflows").update({"status": "archived", "updated_at": now_iso}).eq("id", existing.data[0]["id"]).execute()

        insert_payload = {
            "ticket_id": ticket_id,
            "proposal_id": proposal_id,
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
        return res.data[0]

workflow_planner_service = WorkflowPlannerService()