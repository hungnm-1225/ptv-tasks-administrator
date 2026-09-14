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
    Bộ lập kế hoạch Workflow tất định bám sát kiến trúc Automation Studio:
    - Nếu có ghi danh LMS: Tự động gom Git Sync vào trong bước LMS, KHÔNG SINH bước Git riêng lẻ!
    - Chỉ sinh bước Git độc lập khi yêu cầu CHỈ xin quyền Git (không có khóa học).
    - Phân biệt COF (workspace_courses) vs Freeform (lms_courses).
    - Không bịa đặt dữ liệu, tra cứu chính xác từ danh mục Course Management.
    """

    def __init__(self):
        self.capabilities_map: Dict[str, Any] = {}
        self.policy_registry: Dict[str, Any] = {}
        self.policy_version: str = "v1.2.0"
        self.workflow_rules: List[Dict[str, Any]] = []
        self._load_registries()

    def _load_registries(self):
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
            logger.warning(f"Lỗi phân giải trường học: {e}")
            return None, []

    @staticmethod
    def resolve_course_from_db(course_query: str, is_cof: bool = False, is_teacher: bool = True) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Tra cứu khóa học từ Course Management:
        - is_cof = True  -> Tra cứu bảng 'workspace_courses'
        - is_cof = False -> Tra cứu bảng 'lms_courses' (kèm Git Repos cấu hình sẵn)
        """
        if not course_query:
            return None, None, None

        supabase = get_supabase_client()
        clean_q = re.sub(r"\s+", " ", course_query.strip())
        num_match = re.search(r"\d+", clean_q)
        num_part = num_match.group(0) if num_match else ""

        try:
            target_table = "workspace_courses" if is_cof else "lms_courses"
            query = supabase.table(target_table).select("*")
            if num_part:
                query = query.or_(f"name.ilike.%SWRP {num_part}%,name.ilike.%SWRP%{num_part}%,name.ilike.%{clean_q}%")
            else:
                query = query.ilike("name", f"%{clean_q}%")

            res = query.limit(3).execute()
            courses = res.data or []
            if not courses:
                return clean_q, None, None

            best = courses[0]
            course_name = best.get("name") or clean_q
            course_code = best.get("code") or ""
            git_repos = best.get("git_repos") or []

            # Trích xuất Repo tương ứng
            resolved_repo = None
            if isinstance(git_repos, list) and git_repos:
                for r in git_repos:
                    if isinstance(r, dict):
                        r_name = r.get("name", "") or r.get("repo_name", "")
                        r_target = str(r.get("target", "") or r.get("role", "")).lower()
                        if is_teacher and ("teacher" in r_target or "gv" in r_name.lower()):
                            resolved_repo = r.get("url") or f"https://git.pythaverse.space/pythaverse/{r_name}"
                            break
                        elif not is_teacher and ("all" in r_target or "hs" in r_name.lower()):
                            resolved_repo = r.get("url") or f"https://git.pythaverse.space/pythaverse/{r_name}"
                            break

                if not resolved_repo and git_repos:
                    first = git_repos[0]
                    resolved_repo = first.get("url") if isinstance(first, dict) else str(first)

            return course_name, course_code, resolved_repo
        except Exception as e:
            logger.warning(f"Lỗi tra cứu course DB: {e}")
            return clean_q, None, None

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

        # Kiểm tra xem có intent Ghi danh khóa học không
        has_course_enroll = any(i.type == "course_access" for i in assessment.intents if i.is_valid)
        is_cof_ticket = bool(attachment_url and ("cof" in str(attachment_url).lower() or ".xls" in str(attachment_url).lower()))

        detected_courses = entities.get("courses", [])
        primary_course = detected_courses[0] if detected_courses else ""

        # Tra cứu thông tin khóa học thật và Git Repo từ Database
        real_course_name, real_course_code, real_git_repo = self.resolve_course_from_db(
            course_query=primary_course,
            is_cof=is_cof_ticket,
            is_teacher=has_teacher
        )

        final_courses = [real_course_name] if real_course_name else []
        final_git_role = entities.get("git_role") or "GUEST"

        active_school_name = resolved_school.name if resolved_school else entities.get("school_name")
        active_school_id = resolved_school.id if resolved_school else None

        operation_context: Dict[str, Any] = {
            "resolved_school": resolved_school,
            "entities": {
                **entities,
                "courses": final_courses,
                "git_role": final_git_role,
                "repository_url": real_git_repo
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
                "repo_url": real_git_repo,
                "sync_git_repo": True, # BẬT MẶC ĐỊNH ĐỒNG BỘ GIT TRONG LMS ENROLL
                "git_repo_target": real_git_repo,
                "target_email": user_emails[0] if user_emails else entities.get("target_email")
            }
        }

        for extracted_intent in assessment.intents:
            if not extracted_intent.is_valid:
                continue

            intent_type = extracted_intent.type

            # 🛑 QUY TẮC VÀNG: NẾU ĐÃ CÓ BƯỚC COURSE_ACCESS THÌ KHAI TỬ LUÔN BƯỚC REPOSITORY_ACCESS RIÊNG BIỆT!
            # Vì LMS Enroll đã tự động đảm nhiệm cả luồng đồng bộ Git Repo trong cùng phiên!
            if intent_type == "repository_access" and has_course_enroll:
                logger.info("ℹ️ Bỏ qua bước Git riêng biệt vì luồng Ghi danh LMS đã bao gồm tự động đồng bộ Git Repo.")
                continue

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
                    elif in_key == "courses":
                        step_inputs[in_key] = final_courses
                    elif in_key == "student_emails":
                        if account_batch_poll_step_id:
                            step_inputs[in_key] = f"{{{{ {account_batch_poll_step_id}.created_accounts }}}}"
                        else:
                            step_inputs[in_key] = user_emails
                    else:
                        step_inputs[in_key] = self._resolve_context_value(in_expr, operation_context)

                # Nếu là bước LMS Enroll, tự động đính kèm cờ đồng bộ Git Repo
                if cap_id == "lms.direct_enroll":
                    step_inputs["sync_git_repo"] = True
                    if real_git_repo:
                        step_inputs["attached_git_repo"] = real_git_repo

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