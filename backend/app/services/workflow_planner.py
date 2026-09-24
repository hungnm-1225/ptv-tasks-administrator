# backend/app/services/workflow_planner.py
"""
Deterministic Workflow Planner Service (Master Enterprise v7.2 - AI-Grounded & Pure DAG Orchestrator)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Kiến trúc chuẩn mực:
- Khai tử 100% các hàm regex bắt số mò mẫm (\d{3,6}) hoặc dải môn chắp vá.
- Lập kế hoạch 100% dựa trên Tri thức & Bóc tách có cấu trúc của AI (AI-First Triage).
- Phân định rạch ròi phân hệ: Yêu cầu Repository thì chỉ tạo bước Git, không đẻ bước LMS.
- Tự động gán quyền Git mặc định là GUEST khi người dùng không chỉ định.
- Bảo tồn toàn vẹn các bước dự thảo (Non-Destructive DAG v7.2).
"""

import os
import json
import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.services.evidence_verifier import load_verified_assessment
from app.core.supabase import get_supabase_client
from app.models.intent import IntentAssessment
from app.models.workflow import WorkflowStepDraft, WorkflowValidationResult, WorkflowEntityCandidate

logger = logging.getLogger(__name__)
BRAIN_DIR = os.path.join(os.path.dirname(__file__), "../brain")


class WorkflowPlannerService:
    def __init__(self):
        self.capabilities: List[Dict[str, Any]] = []
        self.capabilities_map: Dict[str, Any] = {}
        self.workflow_rules: Dict[str, Any] = {}
        self.policy_registry: Dict[str, Any] = {}
        self.policy_version: str = "v1.7.2"
        self._load_registries()

    def _load_registries(self):
        try:
            # 1. Nạp capabilities.json
            cap_file = os.path.join(BRAIN_DIR, "capabilities.json")
            if os.path.exists(cap_file):
                with open(cap_file, "r", encoding="utf-8") as f:
                    cap_data = json.load(f)
                    self.capabilities = cap_data.get("capabilities", [])
                    for c in self.capabilities:
                        self.capabilities_map[c["id"]] = c

            # 2. Nạp workflow_rules.json
            rules_file = os.path.join(BRAIN_DIR, "workflow_rules.json")
            if os.path.exists(rules_file):
                with open(rules_file, "r", encoding="utf-8") as f:
                    self.workflow_rules = json.load(f)
            else:
                self.workflow_rules = {}

            # 3. Nạp intent_policy.json
            policy_file = os.path.join(BRAIN_DIR, "intent_policy.json")
            if os.path.exists(policy_file):
                with open(policy_file, "r", encoding="utf-8") as f:
                    p_data = json.load(f)
                    self.policy_version = p_data.get("policy_version", "v1.7.2")
                    self.policy_registry = p_data.get("intents", {})
        except Exception as e:
            logger.error(f"❌ Lỗi nạp registries cho WorkflowPlanner: {e}")

    @staticmethod
    def resolve_school_entities(query_name: Optional[str]) -> Tuple[Optional[WorkflowEntityCandidate], List[WorkflowEntityCandidate]]:
        """Tra cứu trường học mục tiêu trong CSDL theo tên."""
        if not query_name or str(query_name).strip() in ["", "None", "null", "undefined"]:
            return None, []

        clean_name = re.sub(r"(?i)^(school\s*name\s*:|tên\s*trường\s*:|trường\s*:|school\s*:)\s*", "", str(query_name)).strip(" '\",.:")
        if len(clean_name) < 4 or clean_name.lower() in ["none", "test", "testing", "school", "academy"]:
            return None, []

        supabase = get_supabase_client()
        try:
            res = supabase.table("workspace_organizations")\
                .select("id, name, code, role_type, parent_id, country")\
                .eq("role_type", "school")\
                .ilike("name", f"%{clean_name}%")\
                .limit(5)\
                .execute()

            schools = res.data or []
            candidates: List[WorkflowEntityCandidate] = []
            for s in schools:
                s_name = s.get("name", "")
                conf = 0.99 if s_name.lower() == clean_name.lower() else 0.85
                candidates.append(
                    WorkflowEntityCandidate(
                        id=s.get("id"),
                        name=s_name,
                        code=s.get("code"),
                        confidence=conf,
                        metadata=s
                    )
                )

            candidates.sort(key=lambda x: x.confidence, reverse=True)
            best_match = candidates[0] if candidates and candidates[0].confidence >= 0.70 else None
            return best_match, candidates
        except Exception as e:
            logger.warning(f"Lỗi phân giải trường học: {e}")
            return None, []

    @staticmethod
    def resolve_course_and_repos_from_db(course_query: str) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[int]]:
        """
        Tra cứu khóa học trong CSDL Supabase để lấy:
        - Tên chuẩn (canonical_name)
        - Mã SKU
        - Git Repo URL liên kết (nếu có cấu hình trong CSDL)
        - Course ID
        """
        if not course_query:
            return None, None, None, None

        clean_q = str(course_query).strip()
        # Loại trừ các chuỗi chỉ có số (tránh nhầm ID vé, năm)
        if clean_q.isdigit():
            return None, None, None, None

        supabase = get_supabase_client()
        try:
            # 1. Tìm kiếm theo tên môn trong lms_courses
            res = supabase.table("lms_courses").select("*").ilike("course_name", f"%{clean_q}%").limit(1).execute()
            if not res.data:
                # 2. Thử tìm kiếm theo mã viết tắt
                tokens = clean_q.split()
                if len(tokens) >= 2:
                    patt = f"%{tokens[0]}%{tokens[1]}%"
                    res = supabase.table("lms_courses").select("*").ilike("course_name", patt).limit(1).execute()

            if res.data:
                best = res.data[0]
                resolved_repo = None
                git_repos = best.get("git_repos") or []
                if isinstance(git_repos, list) and git_repos:
                    for r in git_repos:
                        if isinstance(r, dict) and r.get("url"):
                            resolved_repo = r.get("url")
                            break
                        elif isinstance(r, str) and r.startswith("http"):
                            resolved_repo = r
                            break
                elif best.get("git_repo_url"):
                    resolved_repo = best.get("git_repo_url")

                return best.get("course_name"), best.get("sku") or "", resolved_repo, best.get("course_id")
        except Exception as e:
            logger.warning(f"Lỗi tra cứu course '{clean_q}': {e}")

        return clean_q, "", None, None

    def build_workflow_proposal(
        self,
        assessment: IntentAssessment,
        resolved_school: Optional[WorkflowEntityCandidate],
        candidates: List[WorkflowEntityCandidate],
        attachment_url: Optional[str] = None,
        ai_summary: Optional[str] = None,
        sender_email: Optional[str] = None
    ) -> Tuple[str, List[WorkflowStepDraft], List[Dict[str, str]], List[str]]:
        """
        Dựng kế hoạch Workflow dựa 100% trên Tri Thức & Bóc Tách của AI.
        Tuyệt đối không dùng regex phỏng đoán.
        """
        steps: List[WorkflowStepDraft] = []
        missing_requirements: List[Dict[str, str]] = []
        warnings: List[str] = list(assessment.warnings)
        step_counter = 1

        entities = assessment.entities if isinstance(assessment.entities, dict) else {}

        # 🎯 1. DANH SÁCH NGƯỜI DÙNG & TÀI KHOẢN (TỪ AI BÓC TÁCH)
        users_list = entities.get("users") or []
        user_emails: List[str] = []
        
        for u in users_list:
            if isinstance(u, dict) and u.get("email"):
                user_emails.append(u["email"].strip())
            elif isinstance(u, str) and "@" in u:
                user_emails.append(u.strip())

        if not user_emails and entities.get("identifiers"):
            user_emails = [str(i).strip() for i in entities.get("identifiers", []) if "@" in str(i) or len(str(i)) > 3]

        if not user_emails and entities.get("target_email"):
            user_emails = [entities["target_email"].strip()]

        # 🎯 2. VAI TRÒ GIT (MẶC ĐỊNH LÀ GUEST THEO NGUYÊN TẮC AN TOÀN CỦA ANH)
        git_role = str(entities.get("git_role") or "GUEST").upper().strip()
        if git_role not in ["ADMIN", "DEVELOPER", "GUEST"]:
            git_role = "GUEST"

        # 🎯 3. DANH MỤC KHÓA HỌC & REPOSITORIES (AI ĐÃ MỞ RỘNG DẢI MÔN SẠCH SẼ)
        ai_courses = entities.get("courses") or []
        canonical_courses: List[Dict[str, Any]] = []
        collected_repos: List[str] = list(entities.get("repositories") or [])

        for c_query in ai_courses:
            c_name, c_sku, c_repo, c_id = self.resolve_course_and_repos_from_db(str(c_query))
            if c_name:
                canonical_courses.append({
                    "course_name": c_name,
                    "course_id": c_id,
                    "git_repo": c_repo
                })
                # Tự động gộp repo tìm thấy từ CSDL vào danh sách repos
                if c_repo and c_repo not in collected_repos:
                    collected_repos.append(c_repo)

        # 🎯 4. XÁC ĐỊNH CHÍNH XÁC CÁC INTENT ĐƯỢC PHÉP CHẠY
        # Lấy trực tiếp intent do AI xác định và đối chiếu Policy Registry
        active_intent_types = [i.type for i in assessment.intents if i.type in self.policy_registry]

        if not active_intent_types:
            return "no_action", [], [], ["AI không phát hiện ý định tự động hóa cụ thể nào cần thực thi."]

        # 🎯 5. DỰNG CÁC BƯỚC THỰC THI (NON-DESTRUCTIVE DAG)
        for itype in active_intent_types:
            policy = self.policy_registry.get(itype, {})
            pipeline = policy.get("capability_pipeline", [])

            for step_cfg in pipeline:
                cap_id = step_cfg.get("capability_id")
                curr_step_id = f"step_{step_counter:02d}"
                step_counter += 1

                step_inputs: Dict[str, Any] = {}
                step_name = step_cfg.get("name", cap_id)

                # =============================================================
                # BỘ RÁP INPUTS CHUẨN XÁC CHO MỌI CAPABILITY CỦA HỆ THỐNG
                # =============================================================
                # 1. CẤP QUYỀN HOẶC GỠ QUYỀN GIT
                if cap_id in ["git.add_collaborators", "git.remove_collaborators"]:
                    step_inputs = {
                        "collaborators": user_emails,
                        "repositories": collected_repos,
                        "repo_urls": collected_repos,
                        "git_role": git_role,
                        "target_role": git_role,
                        "git_action": "remove" if cap_id == "git.remove_collaborators" else "add"
                    }
                    action_vi = "Cấp quyền" if cap_id == "git.add_collaborators" else "Gỡ quyền"
                    if collected_repos:
                        step_name = f"{action_vi} Git ({len(collected_repos)} Repos) vai trò {git_role}"
                    else:
                        missing_requirements.append({
                            "field": "repositories",
                            "message": f"Yêu cầu {action_vi} Git cần cung cấp link hoặc tên Repository."
                        })

                # 2. GHI DANH LMS MOODLE
                elif cap_id == "lms.direct_enroll":
                    c_names = [c["course_name"] for c in canonical_courses]
                    c_ids = [c["course_id"] for c in canonical_courses if c.get("course_id")]
                    is_teacher = any(isinstance(u, dict) and u.get("role") == "teacher" for u in users_list) or ("giáo viên" in str(ai_summary or "").lower())
                    step_inputs = {
                        "courses": c_names,
                        "course_id": c_ids[0] if c_ids else None,
                        "student_emails": user_emails,
                        "role": "teacher" if is_teacher else "student"
                    }
                    if c_names:
                        step_name = f"Ghi danh Moodle ({', '.join(c_names[:3])})"
                    else:
                        missing_requirements.append({"field": "courses", "message": "Thiếu thông tin khóa học LMS."})

                # 3. HỦY GHI DANH (GỠ HỌC VIÊN) KHỎI LMS MOODLE
                elif cap_id == "lms.unenrol_users":
                    c_names = [c["course_name"] for c in canonical_courses]
                    step_inputs = {
                        "courses": c_names,
                        "user_emails": user_emails,
                        "action": "unenrol_users"
                    }
                    step_name = f"Hủy ghi danh Moodle ({', '.join(c_names[:3]) if c_names else 'Khóa học'})"
                    if not c_names:
                        missing_requirements.append({"field": "courses", "message": "Yêu cầu gỡ môn cần nêu rõ tên môn học."})

                # 4. CẬP NHẬT HỒ SƠ & ĐỔI TRƯỜNG HỌC USER
                elif cap_id == "workspace.update_user_profile":
                    step_inputs = {
                        "school_name": resolved_school.name if resolved_school else None,
                        "school_id": resolved_school.id if resolved_school else None,
                        "partner_id": resolved_school.metadata.get("parent_id") if resolved_school and resolved_school.metadata else None,
                        "user_identifiers": user_emails,
                        "action": "update_user_profile"
                    }
                    step_name = f"Đổi trường sang [{resolved_school.name}]" if resolved_school else "Cập nhật hồ sơ & Đổi trường học"
                    if not resolved_school:
                        missing_requirements.append({"field": "school_name", "message": "Cần chọn Trường học mới cần chuyển tới."})

                # 5. TẠO TÀI KHOẢN MỚI TRƯỜNG HỌC
                elif cap_id == "workspace.bulk_account_creation":
                    step_inputs = {
                        "school_name": resolved_school.name if resolved_school else None,
                        "school_id": resolved_school.id if resolved_school else None,
                        "users": users_list,
                        "action": "bulk_create_accounts"
                    }
                    if not resolved_school:
                        missing_requirements.append({"field": "school_name", "message": "Cần chọn Trường học mục tiêu để tạo tài khoản."})

                # 6. KIỂM TRA BATCH TÀI KHOẢN (POLL)
                elif cap_id == "workspace.poll_account_batch":
                    step_inputs = {
                        "request_id": "{{ step_01.account_batch_request_id }}",
                        "action": "poll_account_batch"
                    }

                # 7. ĐẶT LẠI MẬT KHẨU KEYCLOAK
                elif cap_id == "keycloak.reset_password":
                    step_inputs = {
                        "identifiers": user_emails,
                        "target_email": user_emails[0] if user_emails else None,
                        "action": "reset_password"
                    }
                    if not user_emails:
                        missing_requirements.append({"field": "target_email", "message": "Thiếu email/username cần đặt lại mật khẩu."})

                # 8. KHÓA / MỞ KHÓA TÀI KHOẢN KEYCLOAK
                elif cap_id == "keycloak.update_user_status":
                    status_action = entities.get("user_status_action", "disable")
                    step_inputs = {
                        "identifiers": user_emails,
                        "status_action": status_action,
                        "action": "toggle_user_status"
                    }
                    action_label = "Khóa (Disable)" if status_action == "disable" else "Mở khóa (Enable)"
                    step_name = f"{action_label} {len(user_emails)} tài khoản Keycloak"
                    if not user_emails:
                        missing_requirements.append({"field": "identifiers", "message": "Thiếu danh sách tài khoản cần thay đổi trạng thái."})

                # 9. PHÊ DUYỆT ĐƠN HÀNG HOẶC HỢP ĐỒNG WORKSPACE
                elif cap_id in ["workspace.approve_order", "workspace.approve_contract"]:
                    is_order = cap_id == "workspace.approve_order"
                    target_code = entities.get("order_code") if is_order else entities.get("contract_code")
                    step_inputs = {
                        "order_id": target_code if is_order else None,
                        "contract_id": target_code if not is_order else None,
                        "school_name": resolved_school.name if resolved_school else None,
                        "action": "approve_school_order" if is_order else "approve_contract"
                    }
                    step_name = f"Duyệt đơn hàng #{target_code}" if is_order else f"Duyệt hợp đồng #{target_code}"
                    if not target_code:
                        missing_requirements.append({"field": "order_code" if is_order else "contract_code", "message": "Thiếu mã đơn hàng hoặc hợp đồng cần duyệt."})

                steps.append(WorkflowStepDraft(
                    step_id=curr_step_id,
                    capability_id=cap_id,
                    name=step_name,
                    status="ready",
                    inputs=step_inputs,
                    depends_on=[]
                ))

        # 🎯 6. ĐÁNH GIÁ TRẠNG THÁI CUỐI CÙNG (NON-DESTRUCTIVE: BẢO TỒN STEPS TRÊN UI)
        if missing_requirements:
            status = "needs_information"
        elif steps:
            status = "ready"
        else:
            status = "no_action"

        return status, steps, missing_requirements, warnings

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

        # Lấy bản đánh giá Fact Extraction của AI
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
        
        # Nhận diện trường học từ thực thể AI
        detected_school_name = assessment.entities.get("school_name") if isinstance(assessment.entities, dict) else None
        best_school, candidates = self.resolve_school_entities(detected_school_name)

        status, steps, missing_reqs, plan_warnings = self.build_workflow_proposal(
            assessment=assessment,
            resolved_school=best_school,
            candidates=candidates,
            attachment_url=None,
            ai_summary=ticket.get("ai_summary") or "",
            sender_email=ticket.get("sender_email")
        )

        created_proposal = self._save_workflow_proposal(
            ticket_id=ticket_id,
            revision_id=target_revision_id,
            assessment_id=assessment_record["id"],
            status=status,
            evidence=assessment.raw_evidence_quotes,
            missing_requirements=missing_reqs,
            entity_resolution={
                "detected_school": best_school.model_dump() if best_school else None,
                "school_required": any(s.capability_id.startswith("workspace.") for s in steps)
            },
            plan=[s.model_dump() for s in steps]
        )

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary"),
            "reason_summary_vi": f"Đã tự động lập kế hoạch {len(steps)} bước thực thi dựa trên phân tích yêu cầu.",
            "overall_confidence": 0.95 if status == "ready" else 0.85,
            "workflow_outcome": "ACTIONABLE" if status == "ready" else "NEEDS_INFORMATION",
            "missing_requirements": missing_reqs,
            "detected_courses": [s.name for s in steps],
            "evidence_quotes": assessment.raw_evidence_quotes,
            "entities": assessment.entities
        }

        title = f"Workflow #{ticket_id[:8]}"
        if any("git" in s.capability_id for s in steps):
            title = f"Quyền Git Repository #{ticket_id[:8]}"
        elif any("lms" in s.capability_id for s in steps):
            title = f"Ghi danh LMS #{ticket_id[:8]}"
        elif any("workspace" in s.capability_id for s in steps):
            title = f"Tài khoản Trường học #{ticket_id[:8]}"

        return self._save_workflow_draft(
            ticket_id=ticket_id,
            proposal_id=created_proposal["id"],
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
            "status": "ready_for_review" if status == "ready" else status,
            "evidence": evidence,
            "missing_requirements": missing_requirements,
            "entity_resolution": entity_resolution,
            "plan": plan,
            "policy_version": self.policy_version,
            "created_at": now_iso,
            "updated_at": now_iso
        }
        res = supabase.table("workflow_proposals").insert(insert_data).execute()
        created = res.data[0]
        if old_proposal_id and existing.data[0].get("status") not in ["approved", "executed"]:
            try:
                supabase.table("workflow_proposals").update({"status": "superseded", "superseded_by": created["id"], "updated_at": now_iso}).eq("id", old_proposal_id).execute()
            except Exception:
                pass
        return created

    def _save_workflow_draft(self, ticket_id, proposal_id, title, goal, status, ai_analysis, steps):
        supabase = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        existing = supabase.table("automation_workflows").select("id, version").eq("ticket_id", ticket_id).order("version", desc=True).limit(1).execute()
        new_version = (existing.data[0].get("version") or 1) + 1 if existing.data else 1

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

    def validate_workflow_graph(self, steps: List[Any]) -> WorkflowValidationResult:
        errors: List[str] = []
        warnings: List[str] = []
        step_objs = [WorkflowStepDraft(**s) if isinstance(s, dict) else s for s in steps]
        step_ids = {s.step_id for s in step_objs}

        for s in step_objs:
            for dep in s.depends_on:
                if dep not in step_ids:
                    errors.append(f"Bước '{s.name}' phụ thuộc bước '{dep}' không tồn tại.")

        is_valid = len(errors) == 0
        return WorkflowValidationResult(
            is_valid=is_valid,
            status="ready" if is_valid else "invalid",
            errors=errors,
            warnings=warnings,
            stats={"total_steps": len(step_objs), "ready_steps": len(step_objs), "dependent_steps": 0}
        )


workflow_planner_service = WorkflowPlannerService()