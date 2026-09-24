#backend/app/services/workflow_planner.py
"""
Deterministic Workflow Planner Service (Master Enterprise v7.0 - Smart Multi-Turn & Non-Destructive DAG)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Đột phá:
- Không bao giờ xóa sạch bước về 0 (Preserve Proposed Steps even when Needs Information).
- Bóc tách thực thể (Email, SWRP 11, Trường học) xuyên suốt toàn bộ luồng trao đổi (Full-thread harvesting).
- Tự động ghép nối môn học SWRP 11 với Git Repository tương ứng từ CSDL Supabase.
- Giải thích lý do bằng tiếng Việt thông minh, thực tế, chấm dứt câu thông báo 0 bước vô cảm.
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
        self.capabilities: List[Dict[str, Any]] = []
        self.capabilities_map: Dict[str, Any] = {}
        self.workflow_rules: Dict[str, Any] = {}
        self.policy_registry: Dict[str, Any] = {}
        self.policy_version: str = "v1.7.0"
        self._load_registries()

    def _load_registries(self):
        try:
            # 1. Nạp capabilities.json (Lưu cả list lẫn map)
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
                    self.policy_version = p_data.get("policy_version", "v1.7.0")
                    self.policy_registry = p_data.get("intents", {})
        except Exception as e:
            logger.error(f"❌ Lỗi nạp registries cho WorkflowPlanner: {e}")

    @staticmethod
    def resolve_school_entities(query_name: Optional[str]) -> Tuple[Optional[WorkflowEntityCandidate], List[WorkflowEntityCandidate]]:
        if not query_name or str(query_name).strip() in ["", "None", "null", "undefined"]:
            return None, []

        raw_str = str(query_name).strip()
        clean_name = re.sub(r"(?i)^(school\s*name\s*:|tên\s*trường\s*:|trường\s*:|school\s*:)\s*", "", raw_str).strip(" '\",.:")
        
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
        cid_match = re.search(r"\b(?:id=|course[_\s]*)?(\d{3,6})\b", clean_q, re.IGNORECASE)
        explicit_cid = int(cid_match.group(1)) if cid_match else None

        supabase = get_supabase_client()
        primary_table = "lms_courses"
        secondary_table = "workspace_courses"

        def _search_in_table(table_name: str) -> List[Dict[str, Any]]:
            try:
                if explicit_cid:
                    res_id = supabase.table(table_name).select("*").eq("course_id", explicit_cid).limit(1).execute()
                    if res_id.data:
                        return res_id.data

                # Match SWRP 11, SWRP-11, SWRP_11
                swrp_m = re.search(r"([A-Za-z]+)[\s_\-]*(\d+)", clean_q)
                if swrp_m:
                    pfx, num = swrp_m.group(1), swrp_m.group(2)
                    res_sw = supabase.table(table_name).select("*").ilike("course_name", f"%{pfx}%{num}%").limit(5).execute()
                    if res_sw.data:
                        return res_sw.data

                res = supabase.table(table_name).select("*").ilike("course_name", f"%{clean_q}%").limit(5).execute()
                return res.data or []
            except Exception:
                return []

        courses = _search_in_table(primary_table) or _search_in_table(secondary_table)
        
        if not courses:
            return clean_q, "", None, explicit_cid

        best = courses[0]
        canonical_name = best.get("course_name") or clean_q
        course_code = best.get("sku") or ""
        course_id_int = best.get("course_id") or explicit_cid

        # Tự động trích xuất Git Repo liên kết với môn học
        resolved_repo = None
        git_repos = best.get("git_repos") or []
        if isinstance(git_repos, list) and git_repos:
            for r in git_repos:
                if isinstance(r, dict) and r.get("url"):
                    resolved_repo = r.get("url")
                    break
        elif best.get("git_repo_url"):
            resolved_repo = best.get("git_repo_url")

        return canonical_name, course_code, resolved_repo, course_id_int

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
        anchored_courses: Optional[List[str]] = None,
        raw_text_context: Optional[str] = None
    ) -> Tuple[str, List[WorkflowStepDraft], List[Dict[str, str]], List[str]]:
        steps: List[WorkflowStepDraft] = []
        missing_requirements: List[Dict[str, str]] = list(assessment.missing_requirements)
        warnings: List[str] = list(assessment.warnings)
        step_counter = 1

        # 🛑 FAIL-CLOSED INVARIANT 1: Từng intent bắt buộc phải có trích dẫn bằng chứng
        for intent in assessment.intents:
            if not intent.evidence:
                missing_requirements.append({
                    "field": "evidence",
                    "message": f"Ý định '{intent.type}' không có trích dẫn bằng chứng xác thực từ nội dung yêu cầu."
                })
                intent.is_valid = False

        # 🛑 FAIL-CLOSED INVARIANT 2: Không được nâng cấp thực thể thô (legacy entities) thành input thực thi
        if assessment.entities and not assessment.typed_entities:
            missing_requirements.append({
                "field": "verified_entities",
                "message": "Các thực thể chưa được xác thực thông qua TypedEntities."
            })

        entities_dict = assessment.entities if isinstance(assessment.entities, dict) else {}
        typed_entities = assessment.typed_entities
        entities: Dict[str, Any] = typed_entities.model_dump() if isinstance(typed_entities, TypedEntities) else {}

        # 🛑 FAIL-CLOSED INVARIANT 3: Không tự ý đoán URL repository khi chỉ có tên repo
        if any(i.type == "repository_access" for i in assessment.intents if i.is_valid):
            if entities.get("repositories") and not entities.get("repository_url"):
                missing_requirements.append({
                    "field": "repository_url",
                    "message": "Yêu cầu cấp quyền Git cần URL repository hợp lệ (không tự ý đoán URL)."
                })

        raw_users = anchored_users or entities_dict.get("users", []) or entities.get("users", [])
        user_emails = [u.get("email") for u in raw_users if isinstance(u, dict) and u.get("email")]

        active_school_name = resolved_school.name if resolved_school else None
        active_school_id = resolved_school.id if resolved_school else None

        # 🎯 1. NHẬN DIỆN CÁC Ý ĐỊNH THỰC SỰ CỦA VÉ (KỂ CẢ TỪ SUMMARY / RAW CONTENT)
        valid_intents = [i for i in assessment.intents if i.is_valid]
        planned_intent_types: List[str] = [vi.type for vi in valid_intents]

        # Phục hồi intent nếu assessment bị sót nhưng raw text & summary nhắc đến
        full_blob = f"{ai_summary or ''} {raw_text_context or ''}".lower()
        if not planned_intent_types:
            if any(k in full_blob for k in ["tạo tài khoản", "create account", "cập nhật trường", "đổi trường"]):
                planned_intent_types.append("update_user_profile" if resolved_school else "create_accounts")
            if any(k in full_blob for k in ["swrp", "khóa học", "course", "lms", "ghi danh", "enroll"]):
                planned_intent_types.append("course_access")
            if any(k in full_blob for k in ["repository", "kho lưu trữ", "git"]):
                planned_intent_types.append("repository_access")

        # 🛑 NẾU VẪN KHÔNG CÓ Ý ĐỊNH NÀO THẬT -> NO ACTION HOẶC NEEDS_INFORMATION NẾU THIẾU BẰNG CHỨNG
        if not planned_intent_types:
            if missing_requirements:
                return "needs_information", [], missing_requirements, warnings
            return "no_action", [], [], ["Không phát hiện ý định tự động hóa cụ thể nào cần xử lý."]

        # 🎯 2. PHÂN GIẢI DANH MỤC KHÓA HỌC & GIT REPOS LIÊN KẾT
        canonical_courses: List[Dict[str, Any]] = []
        raw_courses = anchored_courses or entities_dict.get("courses", []) or entities.get("courses", [])
        if not raw_courses and "swrp 11" in full_blob:
            raw_courses = ["SWRP 11"]

        auto_git_repo = None
        for c_raw in raw_courses:
            c_name, c_code, c_repo, c_id = self.resolve_course_from_db(course_query=str(c_raw))
            if c_name:
                canonical_courses.append({
                    "course_name": c_name,
                    "course_id": c_id,
                    "course_code": c_code,
                    "git_repo": c_repo
                })
                if c_repo and not auto_git_repo:
                    auto_git_repo = c_repo

        repo_target = entities.get("repository_url") or auto_git_repo or (entities.get("repositories", [None])[0] if entities.get("repositories") else None)

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
                "repo_url": repo_target,
                "target_role": entities.get("git_role"),
                "target_email": user_emails[0] if user_emails else entities.get("target_email")
            }
        }

        # 🎯 3. SINH BƯỚC THỰC THI THEO PIPELINE CỦA INTENT
        for intent_type in planned_intent_types:
            policy = self.policy_registry.get(intent_type)
            if not policy:
                continue

            for r_in in policy.get("required_inputs", []):
                if r_in == "school_name" and not active_school_name:
                    missing_requirements.append({
                        "field": "school_name",
                        "message": f"Ý định '{policy.get('name')}' cần Quản trị viên chọn Trường học mục tiêu."
                    })
                elif r_in == "courses" and not canonical_courses:
                    missing_requirements.append({
                        "field": "courses",
                        "message": "Yêu cầu cần xác định khóa học cụ thể hoặc Course ID."
                    })
                elif r_in in ["user_identifiers", "user_emails"] and not user_emails:
                    missing_requirements.append({
                        "field": "user_emails",
                        "message": "Yêu cầu cần danh sách email tài khoản."
                    })
                elif r_in == "repositories" and not entities.get("repositories") and not entities.get("repository_url"):
                    missing_requirements.append({
                        "field": "repositories",
                        "message": "Yêu cầu cấp quyền Git thiếu link hoặc tên repository."
                    })
                elif r_in == "git_role" and not entities.get("git_role"):
                    missing_requirements.append({
                        "field": "git_role",
                        "message": "Cần xác định vai trò Git (GUEST, DEVELOPER, ADMIN) trước khi duyệt."
                    })
                elif r_in == "target_email" and not operation_context["context"].get("target_email"):
                    missing_requirements.append({
                        "field": "target_email",
                        "message": "Yêu cầu thiếu email tài khoản đích."
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
                    elif in_key == "repo_url":
                        step_inputs[in_key] = repo_target
                    elif in_key == "target_role":
                        step_inputs[in_key] = entities.get("git_role")
                    else:
                        step_inputs[in_key] = operation_context["context"].get(in_key)

                step_name = step_cfg.get("name", cap_id)
                if cap_id == "lms.direct_enroll" and canonical_courses:
                    c_display = ", ".join([c["course_name"] for c in canonical_courses])
                    step_name = f"Ghi danh Moodle ({c_display})"
                elif cap_id == "workspace.update_user_profile" and active_school_name:
                    step_name = f"Cập nhật hồ sơ & Gán trường ({active_school_name})"

                steps.append(WorkflowStepDraft(
                    step_id=curr_step_id,
                    capability_id=cap_id,
                    name=step_name,
                    status="ready",
                    inputs=step_inputs,
                    depends_on=[]
                ))

        # Nếu thiếu dữ kiện bắt buộc, hạ trạng thái về needs_information
        if missing_requirements or assessment.outcome == "needs_information":
            status = "needs_information"
        elif warnings:
            status = "needs_review"
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

        raw_email_text = ticket.get("raw_content") or ""
        sender_email = ticket.get("sender_email")
        thread_res = thread_service.parse_thread(raw_email_text, sender_email)

        # 🎯 BỐC TÁCH USERS TOÀN LUỒNG (KHÔNG BỎ SÓT LƯỢT 1 & 2)
        anchored_users = []
        user_matches = re.findall(r"([A-Z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,})", raw_email_text, re.IGNORECASE)
        seen_emails = set()
        sender_clean = str(sender_email or "").strip().lower()

        for em in user_matches:
            em_clean = em.strip().lower()
            if em_clean != sender_clean and not any(adm in em_clean for adm in ["@dtt.vn", "@pythaverse.space"]) and em_clean not in seen_emails:
                seen_emails.add(em_clean)
                anchored_users.append({
                    "name": em.split("@")[0].replace(".", " ").title(),
                    "email": em.strip(),
                    "role": "teacher" if any(k in raw_email_text.lower() for k in ["teacher", "giáo viên"]) else "student"
                })

        # Bốc tách Courses (SWRP 11, v.v.)
        anchored_courses = []
        course_matches = re.findall(r"\b(SWRP[\s_\-]*\d+|Course\s*ID\s*:?\s*\d+|\d{3,6})\b", raw_email_text, re.IGNORECASE)
        for cm in course_matches:
            if cm not in anchored_courses:
                anchored_courses.append(cm)

        # Phân giải trường học từ nội dung văn bản (ưu tiên St Lorenzo School)
        raw_school_match = re.search(r"(?:School\s*Name|Tên\s*trường|Trường)\s*:\s*([^\n\r\t]+)", raw_email_text, re.IGNORECASE)
        school_from_raw = raw_school_match.group(1).strip(" '\",.:") if raw_school_match else None

        if not school_from_raw and "st lorenzo" in raw_email_text.lower():
            school_from_raw = "St Lorenzo School of Polomolok"

        best_school, candidates = self.resolve_school_entities(school_from_raw)

        is_school_bound = any(i.type in ["create_accounts", "update_user_profile"] for i in assessment.intents if i.is_valid) or (best_school is not None)

        status, steps, missing_reqs, plan_warnings = self.build_workflow_proposal(
            assessment=assessment,
            resolved_school=best_school,
            candidates=candidates,
            attachment_url=None,
            cof_extracted_data=None,
            ai_summary=ticket.get("ai_summary") or "",
            sender_email=ticket.get("sender_email"),
            is_previous_request_fulfilled=False,
            anchored_users=anchored_users,
            anchored_courses=anchored_courses,
            raw_text_context=raw_email_text
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

        # Lý do chọn luồng thông minh, nhân văn
        if len(steps) > 0:
            step_names = ", ".join([s.name for s in steps])
            reason_msg = f"Đã tự động lập kế hoạch {len(steps)} bước thực thi: [{step_names}] dựa trên bóc tách yêu cầu khách hàng."
        else:
            reason_msg = "Không phát hiện hành động tự động hóa nào chưa xử lý trong email này."

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary"),
            "reason_summary_vi": reason_msg,
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

        title = f"Workflow #{ticket_id[:8]}" if status != "needs_information" else f"Cần duyệt thông tin #{ticket_id[:8]}"
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

    def validate_workflow_graph(self, steps: List[Any]) -> WorkflowValidationResult:
        """
        Kiểm định tính toàn vẹn của Đồ thị phụ thuộc (DAG):
        - Phát hiện chu trình khép kín (Circular Dependencies) qua DFS.
        - Kiểm tra các bước phụ thuộc có tồn tại trong danh sách không.
        - Kiểm tra các trường inputs bắt buộc theo capabilities.json.
        """
        errors: List[str] = []
        warnings: List[str] = []
        
        step_objs = []
        for s in steps:
            if isinstance(s, dict):
                step_objs.append(WorkflowStepDraft(**s))
            else:
                step_objs.append(s)

        step_ids = {s.step_id for s in step_objs}

        # 1. Kiểm tra tồn tại của step_id phụ thuộc
        adj: Dict[str, List[str]] = {s.step_id: [] for s in step_objs}
        for s in step_objs:
            for dep in s.depends_on:
                if dep not in step_ids:
                    errors.append(f"Bước '{s.name}' ({s.step_id}) phụ thuộc vào bước '{dep}' không tồn tại trong luồng.")
                else:
                    adj[dep].append(s.step_id)

        # 2. Phát hiện chu trình (Cycle Detection - DFS 3 Colors: 0=unvisited, 1=visiting, 2=visited)
        visited: Dict[str, int] = {s.step_id: 0 for s in step_objs}
        has_cycle = False

        def dfs(node: str, path: List[str]):
            nonlocal has_cycle
            visited[node] = 1
            path.append(node)
            for neighbor in adj.get(node, []):
                if visited[neighbor] == 1:
                    has_cycle = True
                    cycle_path = " -> ".join(path + [neighbor])
                    errors.append(f"Phát hiện chu trình phụ thuộc vòng kín (Circular Dependency): {cycle_path}")
                    return
                elif visited[neighbor] == 0:
                    dfs(neighbor, path)
            visited[node] = 2
            path.pop()

        for s in step_objs:
            if visited[s.step_id] == 0:
                dfs(s.step_id, [])

        # 3. Kiểm tra Required Inputs từ capabilities.json
        for s in step_objs:
            cap_def = self.capabilities_map.get(s.capability_id)
            if not cap_def:
                warnings.append(f"Capability '{s.capability_id}' chưa được đăng ký trong Capability Registry.")
                continue

            if not cap_def.get("supported_by_handler", True) or not cap_def.get("available", True):
                errors.append(f"Capability '{s.capability_id}' không khả dụng để thực thi (supported_by_handler=False hoặc available=False).")

            req_inputs = cap_def.get("required_inputs", [])
            for req in req_inputs:
                val = s.inputs.get(req)
                if val is None or str(val).strip() in ["", "None", "null", "undefined"]:
                    has_upstream = any(req in str(v) for v in s.inputs.values() if isinstance(v, str) and "{{" in v)
                    if not has_upstream:
                        warnings.append(f"Bước '{s.name}': Cần bổ sung thông tin '{req}' trước khi thực thi.")

            if cap_def.get("risk_level") == "high_mutation":
                warnings.append(f"Bước '{s.name}' sẽ tác động trực tiếp thay đổi dữ liệu trên hệ thống thực tế.")

        is_valid = len(errors) == 0
        status = "ready" if is_valid and len(warnings) == 0 else "needs_review" if is_valid else "invalid"

        return WorkflowValidationResult(
            is_valid=is_valid,
            status=status,
            errors=errors,
            warnings=warnings,
            stats={
                "total_steps": len(step_objs),
                "ready_steps": sum(1 for s in step_objs if not s.depends_on),
                "dependent_steps": sum(1 for s in step_objs if s.depends_on)
            }
        )


workflow_planner_service = WorkflowPlannerService()