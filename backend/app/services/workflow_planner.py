# backend/app/services/workflow_planner.py
"""
Deterministic Workflow Planner Service (Master Enterprise v7.3 - Course-Repo Auto-Binding & Strict School Scoping)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Cải tiến đột phá:
- Khai tử hoàn toàn regex quét số rác (\d{3,6}).
- Cơ chế Repo bám dính Khóa học: Tự động đào sâu vào cột git_repos JSONB của bảng lms_courses, nhặt đúng link repo cho Giáo viên/Học sinh.
- Phân định rạch ròi phạm vi trường học: Chỉ yêu cầu chọn trường khi đụng vào School Workspace. Tác vụ Git/Keycloak/Moodle hoàn toàn KHÔNG CẦN TRƯỜNG.
- Tự động mở rộng dải môn học tự nhiên (VD: SWRP 5 to 10 -> SWRP 5, 6, 7, 8, 9, 10).
- Mặc định vai trò Git là GUEST an toàn.
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


def expand_course_range_text(raw_text: str) -> List[str]:
    """
    Mở rộng dải môn học tự nhiên tổng quát:
    - Bắt: 'SWRP từ 5 đến 10', 'SWRP 5 to 10', 'SWRP from 5 to 10', 'SWRP 5-10'
    - Bắt: 'SWRP 5, 6, 7, 8, 9, 10'
    """
    if not raw_text:
        return []

    courses = []
    # 1. Bắt dải có chữ "từ / from" hoặc nối "đến / to / -"
    range_match = re.search(
        r"\b([A-Za-z]+)\s*(?:từ|from)?\s*(\d+)\s*(?:to|đến|\-|->)\s*(\d+)\b", 
        raw_text, 
        re.IGNORECASE
    )
    if range_match:
        prefix = range_match.group(1).upper()
        start_idx = int(range_match.group(2))
        end_idx = int(range_match.group(3))
        if start_idx < end_idx and (end_idx - start_idx) <= 15:
            for num in range(start_idx, end_idx + 1):
                courses.append(f"{prefix} {num}")

    # 2. Bắt danh sách liệt kê phẩy: SWRP 5, 6, 7, 8, 9, 10
    if not courses:
        list_match = re.search(r"\b([A-Za-z]+)\s*(\d+)(?:\s*,\s*(\d+))*(?:\s*(?:,|and|và)\s*(\d+))\b", raw_text, re.IGNORECASE)
        if list_match:
            prefix = list_match.group(1).upper()
            nums = re.findall(r"\b\d+\b", list_match.group(0))
            for n in nums:
                if len(n) <= 2:
                    courses.append(f"{prefix} {n}")

    return list(dict.fromkeys(courses))


class WorkflowPlannerService:
    def __init__(self):
        self.capabilities: List[Dict[str, Any]] = []
        self.capabilities_map: Dict[str, Any] = {}
        self.workflow_rules: Dict[str, Any] = {}
        self.policy_registry: Dict[str, Any] = {}
        self.policy_version: str = "v1.7.3"
        self._load_registries()

    def _load_registries(self):
        try:
            cap_file = os.path.join(BRAIN_DIR, "capabilities.json")
            if os.path.exists(cap_file):
                with open(cap_file, "r", encoding="utf-8") as f:
                    cap_data = json.load(f)
                    self.capabilities = cap_data.get("capabilities", [])
                    for c in self.capabilities:
                        self.capabilities_map[c["id"]] = c

            rules_file = os.path.join(BRAIN_DIR, "workflow_rules.json")
            if os.path.exists(rules_file):
                with open(rules_file, "r", encoding="utf-8") as f:
                    self.workflow_rules = json.load(f)
            else:
                self.workflow_rules = {}

            policy_file = os.path.join(BRAIN_DIR, "intent_policy.json")
            if os.path.exists(policy_file):
                with open(policy_file, "r", encoding="utf-8") as f:
                    p_data = json.load(f)
                    self.policy_version = p_data.get("policy_version", "v1.7.3")
                    self.policy_registry = p_data.get("intents", {})
        except Exception as e:
            logger.error(f"❌ Lỗi nạp registries cho WorkflowPlanner: {e}")

    @staticmethod
    def resolve_school_entities(query_name: Optional[str]) -> Tuple[Optional[WorkflowEntityCandidate], List[WorkflowEntityCandidate]]:
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
    def resolve_course_and_repos_from_db(course_query: str, is_teacher: bool = False) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[int]]:
        """
        Tra cứu khóa học trong CSDL lms_courses:
        - So khớp token thông minh (tránh nhầm số vé).
        - Trích xuất link Git Repo bám dính theo vai trò: Ưu tiên repo Giáo viên nếu is_teacher=True.
        """
        if not course_query:
            return None, None, None, None

        clean_q = str(course_query).strip()
        if clean_q.isdigit():
            return None, None, None, None

        supabase = get_supabase_client()
        try:
            # Tách tiền tố và số lớp (VD: SWRP 9 -> prefix=SWRP, num=9)
            swrp_m = re.search(r"([A-Za-z]+)[\s_\-]*(\d+)", clean_q)
            courses = []
            if swrp_m:
                pfx, num = swrp_m.group(1), swrp_m.group(2)
                res = supabase.table("lms_courses").select("id, course_name, sku, git_repos, git_repo_url, course_id")\
                    .ilike("course_name", f"%{pfx}%{num}%").limit(5).execute()
                courses = res.data or []
            else:
                res = supabase.table("lms_courses").select("id, course_name, sku, git_repos, git_repo_url, course_id")\
                    .ilike("course_name", f"%{clean_q}%").limit(5).execute()
                courses = res.data or []

            if courses:
                # Tìm khóa học khớp chính xác số khối lớp nhất
                best = courses[0]
                if swrp_m:
                    num_target = swrp_m.group(2)
                    for c in courses:
                        # Kiểm tra xem tên có đúng chứa số đó không (VD: SWRP 9: chứ không phải 19)
                        if re.search(rf"\b{num_target}\b", c.get("course_name", "")):
                            best = c
                            break

                resolved_repo = None
                git_repos = best.get("git_repos") or []

                if isinstance(git_repos, list) and git_repos:
                    # 🎯 CHIẾN THUẬT NHẶT REPO THEO VAI TRÒ GIÁO VIÊN / HỌC SINH
                    if is_teacher:
                        # 1. Tìm repo dành riêng cho Giáo viên
                        for r in git_repos:
                            if isinstance(r, dict):
                                target_str = str(r.get("target") or "").lower()
                                if any(k in target_str for k in ["teacher", "giáo viên", "gv"]):
                                    resolved_repo = r.get("url")
                                    break
                    
                    # 2. Nếu không tìm thấy hoặc là học sinh: Lấy repo dùng chung cho cả GV & HS
                    if not resolved_repo:
                        for r in git_repos:
                            if isinstance(r, dict) and r.get("url"):
                                resolved_repo = r.get("url")
                                break
                            elif isinstance(r, str) and r.startswith("http"):
                                resolved_repo = r
                                break

                # Fallback cột git_repo_url đơn lẻ nếu có
                if not resolved_repo and best.get("git_repo_url"):
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
    ) -> Tuple[str, List[WorkflowStepDraft], List[Dict[str, str]], List[str], bool]:
        steps: List[WorkflowStepDraft] = []
        missing_requirements: List[Dict[str, str]] = []
        warnings: List[str] = list(assessment.warnings)
        step_counter = 1

        entities = assessment.entities if isinstance(assessment.entities, dict) else {}

        # 🎯 1. BÓC TÁCH NGƯỜI DÙNG & VAI TRÒ
        users_list = entities.get("users") or []
        user_emails: List[str] = []
        is_teacher = False

        for u in users_list:
            if isinstance(u, dict):
                em = u.get("email")
                if em:
                    user_emails.append(em.strip())
                if u.get("role") == "teacher":
                    is_teacher = True
            elif isinstance(u, str) and "@" in u:
                user_emails.append(u.strip())

        if not user_emails and entities.get("identifiers"):
            user_emails = [str(i).strip() for i in entities.get("identifiers", []) if "@" in str(i) or len(str(i)) > 3]

        if not user_emails and entities.get("target_email"):
            user_emails = [entities["target_email"].strip()]

        if not is_teacher and any(k in str(ai_summary or "").lower() for k in ["giáo viên", "teacher"]):
            is_teacher = True

        # 🎯 2. VAI TRÒ GIT MẶC ĐỊNH LÀ GUEST THEO LỆNH ANH
        git_role = str(entities.get("git_role") or "GUEST").upper().strip()
        if git_role not in ["ADMIN", "DEVELOPER", "GUEST"]:
            git_role = "GUEST"

        # 🎯 3. BÓC TÁCH & MỞ RỘNG MÔN HỌC + TỰ ĐỘNG ĐÀO SÂU NHẶT GIT REPOS TỪ CSDL
        ai_courses = entities.get("courses") or []
        raw_repos_or_shorthands = entities.get("repositories") or []

        # Tự động mở rộng dải môn từ văn bản tóm tắt nếu có (VD: SWRP 5 to 10)
        summary_text = str(ai_summary or "")
        combined_text = f"{summary_text} {' '.join(str(c) for c in ai_courses)} {' '.join(str(r) for r in raw_repos_or_shorthands)}"
        expanded_courses = expand_course_range_text(combined_text)

        courses_to_query = list(dict.fromkeys(expanded_courses if expanded_courses else ai_courses))
        
        # Nếu ai_courses rỗng nhưng trong repositories có tên môn (không phải URL http)
        for r_item in raw_repos_or_shorthands:
            r_str = str(r_item).strip()
            if not r_str.startswith("http") and not r_str.isdigit() and r_str not in courses_to_query:
                courses_to_query.append(r_str)

        canonical_courses: List[Dict[str, Any]] = []
        collected_repos: List[str] = []

        # Giữ lại các link Git Repo trực tiếp nếu người dùng đã cung cấp
        for r_item in raw_repos_or_shorthands:
            r_str = str(r_item).strip()
            if r_str.startswith("http://") or r_str.startswith("https://"):
                collected_repos.append(r_str)

        # Tra cứu CSDL lms_courses để bốc link Git Repos tương ứng theo Role Giáo viên
        for c_query in courses_to_query:
            c_name, c_sku, c_repo, c_id = self.resolve_course_and_repos_from_db(str(c_query), is_teacher=is_teacher)
            if c_name:
                canonical_courses.append({
                    "course_name": c_name,
                    "course_id": c_id,
                    "git_repo": c_repo
                })
                if c_repo and c_repo not in collected_repos:
                    collected_repos.append(c_repo)

        # 🎯 4. XÁC ĐỊNH CHÍNH XÁC INTENTS ĐƯỢC PHÉP CHẠY
        active_intent_types = [i.type for i in assessment.intents if i.type in self.policy_registry]

        # Bảo vệ ngữ nghĩa: Nếu người dùng chỉ yêu cầu kho lưu trữ Git mà không xin vào lớp LMS
        if any(i.type == "repository_access" for i in assessment.intents):
            if not any(k in summary_text.lower() for k in ["ghi danh", "enrol", "học sinh vào lớp"]):
                active_intent_types = [t for t in active_intent_types if t != "course_access"]

        if not active_intent_types:
            return "no_action", [], [], ["AI không phát hiện ý định tự động hóa cụ thể nào cần thực thi."], False

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

                # --- 1. NHÓM TÁC VỤ GIT PYTHAVERSE ---
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
                            "message": f"Không tìm thấy link Repository trong CSDL cho các môn yêu cầu. Vui lòng cung cấp link Git repo."
                        })

                # --- 2. NHÓM GHI DANH LMS MOODLE ---
                elif cap_id == "lms.direct_enroll":
                    c_names = [c["course_name"] for c in canonical_courses]
                    c_ids = [c["course_id"] for c in canonical_courses if c.get("course_id")]
                    step_inputs = {
                        "courses": c_names,
                        "course_id": c_ids[0] if c_ids else None,
                        "student_emails": user_emails,
                        "role": "teacher" if is_teacher else "student"
                    }
                    if c_names:
                        step_name = f"Ghi danh Moodle ({', '.join(c_names[:3])})"
                    else:
                        missing_requirements.append({"field": "courses", "message": "Yêu cầu ghi danh thiếu thông tin khóa học."})

                # --- 3. NHÓM HỦY GHI DANH (GỠ MÔN) LMS ---
                elif cap_id == "lms.unenrol_users":
                    c_names = [c["course_name"] for c in canonical_courses]
                    step_inputs = {
                        "courses": c_names,
                        "target_emails": user_emails,
                        "action": "unenrol_users"
                    }
                    step_name = f"Hủy ghi danh Moodle ({', '.join(c_names[:3]) if c_names else 'Khóa học'})"
                    if not c_names:
                        missing_requirements.append({"field": "courses", "message": "Yêu cầu gỡ môn cần nêu rõ tên môn học."})

                # --- 4. NHÓM WORKSPACE: ĐỔI TRƯỜNG & HỒ SƠ ---
                elif cap_id == "workspace.update_user_profile":
                    step_inputs = {
                        "school_name": resolved_school.name if resolved_school else None,
                        "school_id": resolved_school.id if resolved_school else None,
                        "partner_id": resolved_school.metadata.get("parent_id") if resolved_school and resolved_school.metadata else None,
                        "user_identifiers": user_emails,
                        "action": "update_user_profile"
                    }
                    if resolved_school:
                        step_name = f"Đổi trường sang [{resolved_school.name}]"
                    else:
                        step_name = "Cập nhật hồ sơ người dùng (Giữ nguyên trường cũ)"

                # --- 5. NHÓM WORKSPACE: TẠO TÀI KHOẢN HÀNG LOẠT ---
                elif cap_id == "workspace.bulk_account_creation":
                    step_inputs = {
                        "school_name": resolved_school.name if resolved_school else None,
                        "school_id": resolved_school.id if resolved_school else None,
                        "users": users_list,
                        "action": "bulk_create_accounts"
                    }
                    if not resolved_school:
                        missing_requirements.append({"field": "school_name", "message": "Cần chọn Trường học mục tiêu để tạo tài khoản."})

                # --- 6. NHÓM KEYCLOAK: RESET MẬT KHẨU ---
                elif cap_id == "keycloak.reset_password":
                    step_inputs = {
                        "identifiers": user_emails,
                        "target_email": user_emails[0] if user_emails else None,
                        "action": "reset_password"
                    }
                    if not user_emails:
                        missing_requirements.append({"field": "target_email", "message": "Thiếu email/username cần đặt lại mật khẩu."})

                # --- 7. NHÓM KEYCLOAK: KHÓA / MỞ KHÓA TÀI KHOẢN ---
                elif cap_id == "keycloak.enable_account":
                    status_action = entities.get("user_status_action", "disable")
                    is_enabled = status_action in ["enable", "unlock", "activate"]
                    step_inputs = {
                        "target_email": user_emails[0] if user_emails else None,
                        "identifiers": user_emails,
                        "enabled": is_enabled,
                        "action": "set_user_status"
                    }
                    action_label = "Mở khóa (Enable)" if is_enabled else "Khóa (Disable)"
                    step_name = f"{action_label} {len(user_emails)} tài khoản Keycloak"
                    if not user_emails:
                        missing_requirements.append({"field": "target_email", "message": "Thiếu danh sách tài khoản cần thay đổi trạng thái."})

                # --- 8. NHÓM WORKSPACE: DUYỆT ĐƠN HÀNG & HỢP ĐỒNG ---
                elif cap_id in ["workspace.partner_approve_order", "workspace.distributor_approve_contract"]:
                    is_order = cap_id == "workspace.partner_approve_order"
                    target_code = entities.get("order_code") if is_order else entities.get("contract_code")
                    step_inputs = {
                        "order_code": target_code if is_order else None,
                        "contract_code": target_code if not is_order else None,
                        "school_name": resolved_school.name if resolved_school else None,
                        "action": "approve_school_order_standalone" if is_order else "approve_partner_contract_standalone"
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

        # 🎯 6. ĐÁNH GIÁ XEM CÓ BẮT BUỘC PHẢI CHỌN TRƯỜNG HAY KHÔNG (STRICT SCOPE)
        # Chỉ các tác vụ đụng vào Workspace Organization mới cần trường!
        workspace_school_capabilities = [
            "workspace.bulk_account_creation",
            "workspace.school_create_order",
            "workspace.partner_approve_order",
            "workspace.partner_create_contract",
            "workspace.school_enroll_users"
        ]
        is_school_required = any(s.capability_id in workspace_school_capabilities for s in steps)

        if missing_requirements:
            status = "needs_information"
        elif steps:
            status = "ready"
        else:
            status = "no_action"

        return status, steps, missing_requirements, warnings, is_school_required

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

        detected_school_name = assessment.entities.get("school_name") if isinstance(assessment.entities, dict) else None
        best_school, candidates = self.resolve_school_entities(detected_school_name)

        status, steps, missing_reqs, plan_warnings, is_school_required = self.build_workflow_proposal(
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
                "school_required": is_school_required
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
            "entities": assessment.entities,
            "school_required": is_school_required,  # 🎯 TRUYỀN RÕ RÀNG ĐỂ FRONTEND KHÔNG HIỆN CẢNH BÁO VÀNG OAN
            "detected_school": best_school.model_dump() if best_school else None
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