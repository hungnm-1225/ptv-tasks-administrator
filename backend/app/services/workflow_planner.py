# backend/app/services/workflow_planner.py
"""
Deterministic Workflow Planner Service (Master Enterprise Edition v6.0 - School Decoupling & Thread Precision)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Phi tập trung hóa Trường học: Hoàn toàn không ép buộc School đối với Git, Keycloak, và LMS Độc Lập (FUNiX).
- Khai tử lỗi tự động gán fallback 'update_user_profile' và trường rác '000 SCHOOL FOR TESTING PURPOSE'.
- Nhận diện Course ID số trực tiếp (Course 1445) phục vụ ghi danh LMS tức thì.
- Phân tích luồng thread thông minh: Nếu kỹ sư đã xử lý xong và không có yêu cầu mới -> Trả về no_action hợp lệ.
"""
import os
import json
import re
import logging
import tempfile
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import httpx

from app.services.evidence_verifier import load_verified_assessment
from app.core.supabase import get_supabase_client
from app.models.intent import IntentAssessment, TypedEntities
from app.models.workflow import WorkflowStepDraft, WorkflowValidationResult, WorkflowEntityCandidate
from app.services.excel.cof_service import COFService
from app.services.email_thread_service import thread_service

logger = logging.getLogger(__name__)
BRAIN_DIR = os.path.join(os.path.dirname(__file__), "../brain")


async def download_temp_attachment(url: str) -> Optional[str]:
    if not url or not isinstance(url, str) or not url.startswith("http"):
        return None
    try:
        suffix = ".xlsx" if "xls" in url.lower() else ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    tmp.write(res.content)
                    return tmp.name
    except Exception as e:
        logger.warning(f"Lỗi tải attachment file tạm: {e}")
    return None


class WorkflowPlannerService:
    def __init__(self):
        self.capabilities_map: Dict[str, Any] = {}
        self.policy_registry: Dict[str, Any] = {}
        self.policy_version: str = "v1.6.0"
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
                    self.policy_version = p_data.get("policy_version", "v1.6.0")
                    self.policy_registry = p_data.get("intents", {})
        except Exception as e:
            logger.error(f"❌ Lỗi nạp registries cho WorkflowPlanner: {e}")

    @staticmethod
    def resolve_school_entities(query_name: Optional[str]) -> Tuple[Optional[WorkflowEntityCandidate], List[WorkflowEntityCandidate]]:
        if not query_name or str(query_name).strip() in ["", "None", "null", "undefined"]:
            return None, []

        raw_str = str(query_name).strip()
        clean_name = re.sub(r"(?i)^(school\s*name\s*:|tên\s*trường\s*:|trường\s*:|school\s*:)\s*", "", raw_str).strip(" '\",.:")
        
        # 🛑 CHẶN DỮ LIỆU RÁC HOẶC TỪ KHÓA QUÁ NGẮN
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

            if not schools:
                tokens = [w for w in re.findall(r"[A-Za-z0-9]+", clean_name) if len(w) >= 4 and w.lower() not in ["school", "academy", "college", "trường", "thcs", "thpt"]]
                if tokens:
                    fuzzy_pattern = "%" + "%".join(tokens) + "%"
                    res_fuzzy = supabase.table("workspace_organizations")\
                        .select("id, name, code, role_type, parent_id, country")\
                        .eq("role_type", "school")\
                        .ilike("name", fuzzy_pattern)\
                        .limit(5)\
                        .execute()
                    schools = res_fuzzy.data or []

            candidates: List[WorkflowEntityCandidate] = []
            for s in schools:
                s_name = s.get("name", "")
                conf = 0.99 if s_name.lower() == clean_name.lower() else 0.85
                
                partner_uuid = s.get("parent_id")
                partner_name, partner_code = None, None
                if partner_uuid:
                    try:
                        p_res = supabase.table("workspace_organizations").select("id, name, code").eq("id", partner_uuid).limit(1).execute()
                        if p_res.data:
                            partner_name = p_res.data[0].get("name")
                            partner_code = p_res.data[0].get("code")
                    except Exception:
                        pass

                candidates.append(
                    WorkflowEntityCandidate(
                        id=s.get("id"),
                        name=s_name,
                        code=s.get("code"),
                        confidence=conf,
                        metadata={
                            "parent_id": partner_uuid,
                            "country": s.get("country"),
                            "school_code": s.get("code"),
                            "partner_id": partner_code or partner_uuid,
                            "partner_name": partner_name,
                            "partner_code": partner_code
                        }
                    )
                )

            candidates.sort(key=lambda x: x.confidence, reverse=True)
            best_match = candidates[0] if candidates and candidates[0].confidence >= 0.70 else None
            return best_match, candidates
        except Exception as e:
            logger.warning(f"Lỗi phân giải trường học: {e}")
            return None, []

    @staticmethod
    def resolve_course_from_db(
        course_query: str, 
        is_cof: bool = False, 
        is_teacher: bool = False,
        country_hint: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[int]]:
        if not course_query:
            return None, None, None, None

        clean_q = str(course_query).strip()

        # 🎯 NHẬN DIỆN TRỰC TIẾP MÃ SỐ COURSE ID (VD: Course 1445 của FUNiX)
        cid_match = re.search(r"\b(?:id=|course[_\s]*)?(\d{3,6})\b", clean_q, re.IGNORECASE)
        explicit_cid = int(cid_match.group(1)) if cid_match else None

        supabase = get_supabase_client()
        primary_table = "workspace_courses" if is_cof else "lms_courses"
        secondary_table = "lms_courses" if is_cof else "workspace_courses"

        def _search_in_table(table_name: str) -> List[Dict[str, Any]]:
            try:
                if explicit_cid:
                    res_id = supabase.table(table_name).select("*").eq("course_id", explicit_cid).limit(1).execute()
                    if res_id.data:
                        return res_id.data

                res = supabase.table(table_name).select("*").ilike("course_name", f"%{clean_q}%").limit(5).execute()
                return res.data or []
            except Exception:
                return []

        courses = _search_in_table(primary_table) or _search_in_table(secondary_table)
        
        # Nếu là khóa học đối tác ngoài (như FUNiX) không có trong DB nhưng có Course ID số -> Vẫn bảo toàn để chạy!
        if not courses:
            return clean_q, "", None, explicit_cid

        best = courses[0]
        canonical_name = best.get("course_name") or clean_q
        course_code = best.get("sku") or ""
        course_id_int = best.get("course_id") or explicit_cid

        return canonical_name, course_code, None, course_id_int

    def build_workflow_proposal(
        self,
        assessment: IntentAssessment,
        resolved_school: Optional[WorkflowEntityCandidate],
        candidates: List[WorkflowEntityCandidate],
        attachment_url: Optional[str],
        cof_extracted_data: Optional[Dict[str, Any]] = None,
        ai_summary: Optional[str] = None,
        sender_email: Optional[str] = None,
        is_previous_request_fulfilled: bool = False,
        anchored_users: Optional[List[Dict[str, Any]]] = None,
        anchored_courses: Optional[List[str]] = None
    ) -> Tuple[str, List[WorkflowStepDraft], List[Dict[str, str]], List[str]]:
        steps: List[WorkflowStepDraft] = []
        missing_requirements: List[Dict[str, str]] = list(assessment.missing_requirements)
        warnings: List[str] = list(assessment.warnings)
        step_counter = 1

        # 🛑 NẾU KỸ SƯ DTT ĐÃ HOÀN TẤT VÀ KHÔNG CÓ TIN NHẮN MỚI CỦA KHÁCH -> NO_ACTION!
        if is_previous_request_fulfilled and not assessment.intents:
            return "no_action", [], [], ["Yêu cầu đã được kỹ sư hỗ trợ hoàn thành trước đó. Không có yêu cầu mới phát sinh."]

        if assessment.outcome == "no_action" or not assessment.intents:
            return "no_action", [], [], ["Không có hành vi tự động hóa nào được yêu cầu."]

        entities_dict = assessment.entities if isinstance(assessment.entities, dict) else {}
        typed_entities = assessment.typed_entities
        entities: Dict[str, Any] = typed_entities.model_dump() if isinstance(typed_entities, TypedEntities) else {}

        raw_users = anchored_users or entities_dict.get("users", []) or entities.get("users", [])
        user_emails = [u.get("email") for u in raw_users if isinstance(u, dict) and u.get("email")]

        active_school_name = resolved_school.name if resolved_school else None
        active_school_id = resolved_school.id if resolved_school else None

        # Lọc các Intent hợp lệ
        valid_intents = [i for i in assessment.intents if i.is_valid]
        planned_intent_types: List[str] = []

        for vi in valid_intents:
            if vi.type not in planned_intent_types:
                planned_intent_types.append(vi.type)

        # 🛑 TUYỆT ĐỐI KHÔNG DEFAULT SANG update_user_profile NẾU RỖNG!
        if not planned_intent_types:
            return "no_action", [], [], ["Tất cả các tác vụ trước đó đã hoàn tất hoặc không có ý định mới."]

        # Phân giải danh mục khóa học
        canonical_courses: List[Dict[str, Any]] = []
        raw_courses = anchored_courses or entities_dict.get("courses", []) or entities.get("courses", [])
        for c_raw in raw_courses:
            c_name, c_code, _, c_id = self.resolve_course_from_db(course_query=str(c_raw))
            if c_name:
                canonical_courses.append({
                    "course_name": c_name,
                    "course_id": c_id,
                    "course_code": c_code
                })

        operation_context: Dict[str, Any] = {
            "resolved_school": resolved_school,
            "entities": {
                **entities,
                "courses": [c["course_name"] for c in canonical_courses],
                "course_ids": [c["course_id"] for c in canonical_courses if c["course_id"]]
            },
            "context": {
                "school_name": active_school_name,
                "school_id": active_school_id,
                "user_emails": user_emails,
                "collaborators": user_emails,
                "courses": [c["course_name"] for c in canonical_courses],
                "repo_url": entities.get("repository_url") or (entities.get("repositories", [None])[0] if entities.get("repositories") else None),
                "target_role": entities.get("git_role") or "GUEST",
                "target_email": user_emails[0] if user_emails else entities.get("target_email")
            }
        }

        # 🎯 DUYỆT TỪNG Ý ĐỊNH VÀ SINH BƯỚC THỰC THI CHUẨN XÁC
        for intent_type in planned_intent_types:
            policy = self.policy_registry.get(intent_type)
            if not policy:
                continue

            # 🛡️ KIỂM TRA INPUT BẮT BUỘC (PHÂN BIỆT RẠCH RÒI SCHOOL HAY GLOBAL)
            is_school_required = "school_name" in policy.get("required_inputs", [])
            
            if is_school_required and not active_school_name:
                missing_requirements.append({
                    "field": "school_name",
                    "message": f"Ý định '{policy.get('name')}' bắt buộc phải xác định Trường học."
                })

            if "courses" in policy.get("required_inputs", []) and not canonical_courses:
                missing_requirements.append({
                    "field": "courses",
                    "message": "Yêu cầu cần xác định khóa học cụ thể hoặc Course ID."
                })

            if "git_role" in policy.get("required_inputs", []) and not entities.get("git_role"):
                missing_requirements.append({
                    "field": "git_role",
                    "message": "Yêu cầu cấp quyền Git cần chỉ định rõ vai trò (GUEST, DEVELOPER, ADMIN)."
                })

            pipeline = policy.get("capability_pipeline", [])
            for step_cfg in pipeline:
                cap_id = step_cfg.get("capability_id")
                curr_step_id = f"step_{step_counter:02d}"; step_counter += 1

                step_inputs: Dict[str, Any] = {}
                for in_key, in_expr in step_cfg.get("inputs_mapping", {}).items():
                    if in_key == "courses":
                        step_inputs[in_key] = [c["course_name"] for c in canonical_courses]
                    elif in_key == "course_id":
                        c_ids = [c["course_id"] for c in canonical_courses if c["course_id"]]
                        step_inputs[in_key] = c_ids[0] if c_ids else None
                    elif in_key in ["student_emails", "user_identifiers", "user_emails", "collaborators"]:
                        step_inputs[in_key] = user_emails
                    elif in_key == "school_name":
                        step_inputs[in_key] = active_school_name
                    elif in_key == "school_id":
                        step_inputs[in_key] = active_school_id
                    elif in_key == "partner_id" and resolved_school:
                        step_inputs[in_key] = resolved_school.metadata.get("partner_id")
                    else:
                        step_inputs[in_key] = operation_context["context"].get(in_key)

                step_name = step_cfg.get("name", cap_id)
                if cap_id == "lms.direct_enroll" and canonical_courses:
                    c_display = ", ".join([c["course_name"] for c in canonical_courses])
                    step_name = f"Ghi danh Moodle ({c_display})"

                steps.append(WorkflowStepDraft(
                    step_id=curr_step_id,
                    capability_id=cap_id,
                    name=step_name,
                    status="ready",
                    inputs=step_inputs,
                    depends_on=[]
                ))

        if missing_requirements:
            status = "needs_information"
            steps = []
        elif warnings:
            status = "needs_review"
        elif steps:
            status = "ready"
        else:
            status = "no_action"

        return status, steps, missing_requirements, warnings

    def validate_workflow_graph(self, steps: List[WorkflowStepDraft]) -> WorkflowValidationResult:
        errors: List[str] = []
        warnings: List[str] = []
        return WorkflowValidationResult(
            is_valid=len(errors) == 0,
            status="ready" if len(errors) == 0 else "invalid",
            errors=errors,
            warnings=warnings,
            stats={"total_steps": len(steps), "ready_steps": len(steps), "dependent_steps": 0}
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

        # 🎯 1. NỐI DÂY VỚI THREAD SERVICE V4.0 (ĐÃ KHỬ TRIMMED CONTENT)
        raw_email_text = ticket.get("raw_content") or ""
        sender_email = ticket.get("sender_email")
        thread_res = thread_service.parse_thread(raw_email_text, sender_email)

        # 🎯 2. BỐC TÁCH USERS VÀ COURSES TỪ LƯỢT YÊU CẦU CỦA KHÁCH
        actionable_text = thread_res.latest_user_message
        anchored_users = []
        user_matches = re.findall(r"([A-Z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,})", actionable_text, re.IGNORECASE)
        seen_emails = set()
        sender_clean = str(sender_email or "").strip().lower()

        for em in user_matches:
            em_clean = em.strip().lower()
            if em_clean != sender_clean and not any(adm in em_clean for adm in ["@dtt.vn", "@pythaverse.space"]) and em_clean not in seen_emails:
                seen_emails.add(em_clean)
                anchored_users.append({
                    "name": em.split("@")[0].replace(".", " ").title(),
                    "email": em.strip(),
                    "role": "student"
                })

        # Bốc tách Course ID số (VD: Course ID 1445 từ link FUNiX)
        anchored_courses = []
        course_matches = re.findall(r"(?:course[_\s]*id\s*:?\s*|course/view\.php\?id=)(\d{3,6})", actionable_text, re.IGNORECASE)
        for cid in course_matches:
            if cid not in anchored_courses:
                anchored_courses.append(cid)

        # 🎯 3. PHÂN GIẢI TRƯỜNG HỌC (CHỈ KHI THỰC SỰ CÓ TÊN TRƯỜNG TRONG TEXT)
        raw_school_match = re.search(r"(?:School\s*Name|Tên\s*trường|Trường)\s*:\s*([^\n\r\t]+)", actionable_text, re.IGNORECASE)
        school_from_raw = raw_school_match.group(1).strip(" '\",.:") if raw_school_match else None

        best_school, candidates = self.resolve_school_entities(school_from_raw)

        # Xác định xem tác vụ này có cần trường học hay không
        is_school_bound = any(i.type in ["create_accounts", "update_user_profile"] for i in assessment.intents if i.is_valid)

        status, steps, missing_reqs, plan_warnings = self.build_workflow_proposal(
            assessment=assessment,
            resolved_school=best_school,
            candidates=candidates,
            attachment_url=None,
            cof_extracted_data=None,
            ai_summary=ticket.get("ai_summary") or "",
            sender_email=ticket.get("sender_email"),
            is_previous_request_fulfilled=thread_res.accounts_already_created,
            anchored_users=anchored_users,
            anchored_courses=anchored_courses
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
                "school_required": is_school_bound,
                "candidates_count": len(candidates)
            },
            plan=[s.model_dump() for s in steps]
        )
        proposal_id = created_proposal["id"]

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary"),
            "reason_summary_vi": f"Registry Policy Engine đã sinh {len(steps)} bước thực thi chuẩn xác duy nhất cần làm hiện tại.",
            "overall_confidence": 0.95 if status in ["ready", "needs_review"] else 0.85,
            "workflow_outcome": "ACTIONABLE" if status in ["ready", "needs_review"] else ("NO_ACTION" if status == "no_action" else "NEEDS_INFORMATION"),
            "missing_requirements": missing_reqs,
            "detected_school": best_school.model_dump() if best_school else None,
            "school_required": is_school_bound,
            "school_candidates": [c.model_dump() for c in candidates],
            "detected_courses": anchored_courses,
            "detected_actions": [s.capability_id for s in steps],
            "warnings": plan_warnings,
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