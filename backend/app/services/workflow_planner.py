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

import html
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
        Cỗ máy tra cứu khóa học 3 tầng siêu bền vững:
        1. Bắt Course ID số nguyên từ URL Moodle (id=1437) hoặc chuỗi (ID 1437) -> 100% trúng đích!
        2. Tự động lột sạch rác: (Primary), (Secondary), [VN], &amp; -> So khớp mượt mà như Ảnh 2 & 3.
        3. Tự động bắt mã viết tắt: SWRP 1, SWRP 3, SWRP 5.
        4. Tự bốc đúng Git Repo từ cột git_repos JSONB cho Giáo viên / Học sinh.
        """
        if not course_query:
            return None, None, None, None

        clean_q = str(course_query).strip()
        supabase = get_supabase_client()

        # =========================================================================
        # 🎯 TẦNG 1: BẮT THẲNG COURSE ID SỐ (VUA CHÍNH XÁC - TỐC ĐỘ 1MS)
        # =========================================================================
        course_id_target = None
        # Bắt id trong link: view.php?id=1437 hoặc id=1441
        id_url_match = re.search(r"[?&]id=(\d+)", clean_q)
        if id_url_match:
            course_id_target = int(id_url_match.group(1))
        elif clean_q.isdigit():
            course_id_target = int(clean_q)
        else:
            # Bắt ID đứng cạnh chữ ID: ID 1437, ID: 1437, #1437
            id_inline_match = re.search(r"\b(?:id|course)[\s:#]*(\d+)\b", clean_q, re.IGNORECASE)
            if id_inline_match:
                course_id_target = int(id_inline_match.group(1))

        if course_id_target:
            try:
                res_id = supabase.table("lms_courses")\
                    .select("id, course_id, course_name, git_repos")\
                    .eq("course_id", course_id_target)\
                    .limit(1)\
                    .execute()
                if res_id.data:
                    c_match = res_id.data[0]
                    c_name_clean = str(c_match.get("course_name") or "").replace("&amp;", "&").strip()
                    
                    resolved_repo = None
                    git_repos = c_match.get("git_repos") or []
                    if isinstance(git_repos, list) and git_repos:
                        for r in git_repos:
                            if isinstance(r, dict):
                                r_url = r.get("repo_url") or r.get("url")
                                r_target = str(r.get("target") or "").lower()
                                if is_teacher and any(k in r_target for k in ["gv", "teacher", "teacher_only"]):
                                    resolved_repo = r_url
                                    break
                                elif not resolved_repo:
                                    resolved_repo = r_url
                            elif isinstance(r, str) and r.startswith("http"):
                                resolved_repo = r
                                break

                    logger.info(f"🎯 [Course Resolver - Tầng 1] Trúng Course ID #{course_id_target} -> [{c_name_clean}]")
                    return c_name_clean, "", resolved_repo, c_match.get("course_id")
            except Exception as id_err:
                logger.warning(f"Lỗi tra cứu course theo ID {course_id_target}: {id_err}")

        # =========================================================================
        # 🎯 TẦNG 2: LỘT SẠCH RÁC NGỮ NGHĨA (PRIMARY, SECONDARY, &AMP;) - GIẢI QUYẾT ẢNH 1
        # =========================================================================
        # Cắt sạch các hậu tố râu ria làm hỏng tìm kiếm
        clean_name = re.sub(r"\s*[\(\[](?:Primary|Secondary|HighSchool|VN|Cả GV & HS|GV|HS)[\)\]]", "", clean_q, flags=re.IGNORECASE).strip()
        clean_name = clean_name.replace("&amp;", "&").strip()
        # Loại bỏ các từ thừa như 'course', 'courses', 'khóa học'
        clean_name = re.sub(r"(?i)\b(?:courses?|khóa\s*học)\b", "", clean_name).strip(" :-,")

        # =========================================================================
        # 🎯 TẦNG 3: BẮT MÃ MÔN VIẾT TẮT (SWRP 1, SWRP 3, SWRP 5, IR 4...)
        # =========================================================================
        code_match = re.search(r"\b([A-Za-z]+)\s*[-_]?\s*(\d+)\b", clean_name)
        try:
            matched_rows = []
            if code_match:
                prefix, num = code_match.group(1).upper(), code_match.group(2)
                # Tìm theo mẫu SWRP 1: hoặc SWRP 1
                res_code = supabase.table("lms_courses")\
                    .select("id, course_id, course_name, git_repos")\
                    .ilike("course_name", f"%{prefix} {num}%")\
                    .limit(5)\
                    .execute()
                matched_rows = res_code.data or []

            # Nếu không tìm thấy theo mã, tìm kiếm theo tên đã làm sạch
            if not matched_rows and len(clean_name) >= 4:
                # Lấy 3 từ khóa chính để so khớp (VD: Synapse City Robotics)
                search_keywords = clean_name.split()[:3]
                search_pattern = "%".join(search_keywords)
                res_text = supabase.table("lms_courses")\
                    .select("id, course_id, course_name, git_repos")\
                    .ilike("course_name", f"%{search_pattern}%")\
                    .limit(5)\
                    .execute()
                matched_rows = res_text.data or []

            if matched_rows:
                best = matched_rows[0]
                best_name = str(best.get("course_name") or "").replace("&amp;", "&").strip()
                resolved_repo = None
                git_repos = best.get("git_repos") or []
                if isinstance(git_repos, list) and git_repos:
                    for r in git_repos:
                        if isinstance(r, dict):
                            r_url = r.get("repo_url") or r.get("url")
                            r_target = str(r.get("target") or "").lower()
                            if is_teacher and any(k in r_target for k in ["teacher", "teacher_only", "gv"]):
                                resolved_repo = r_url
                                break
                            elif not resolved_repo:
                                resolved_repo = r_url
                        elif isinstance(r, str) and r.startswith("http"):
                            resolved_repo = r
                            break

                logger.info(f"🎯 [Course Resolver - Tầng 2/3] Khớp '{clean_q}' -> [{best_name}] (ID: {best.get('course_id')})")
                return best_name, "", resolved_repo, best.get("course_id")

        except Exception as e:
            logger.warning(f"Lỗi tra cứu course theo text '{clean_q}': {e}")

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

        # 🎯 1. BÓC TÁCH ENTITIES & AUTO-HYDRATE TYPEDENTITIES ĐẦU TIÊN
        from app.models.intent import TypedEntities
        entities: Dict[str, Any] = {}
        if assessment.typed_entities:
            entities = assessment.typed_entities.model_dump(exclude_none=True)
            if assessment.entities and isinstance(assessment.entities, dict):
                for k, v in assessment.entities.items():
                    if k not in entities and v is not None:
                        entities[k] = v
        elif assessment.entities and isinstance(assessment.entities, dict):
            entities = assessment.entities
            try:
                assessment.typed_entities = TypedEntities(
                    school_name=entities.get("school_name"),
                    courses=entities.get("courses") or [],
                    repositories=entities.get("repositories") or [],
                    users=entities.get("users") or [],
                    identifiers=entities.get("identifiers") or [],
                    git_role=entities.get("git_role") or "GUEST",
                    order_code=entities.get("order_code"),
                    contract_code=entities.get("contract_code")
                )
            except Exception as hyd_err:
                logger.warning(f"⚠️ Không thể auto-hydrate TypedEntities: {hyd_err}")

        # 🎯 2. KHAI BÁO NGAY USERS_LIST & USER_EMAILS ĐỂ TRÁNH LỖI UNBOUNDLOCALERROR!
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

        # 🛑 THANH LỌC NGƯỜI GỬI (PURGE SENDER)
        clean_sender = str(sender_email or "").strip().lower()
        if clean_sender:
            self_action_keywords = ["cho tôi", "tài khoản của tôi", "giúp tôi", "my account", "for me", "myself"]
            is_self_action = any(k in str(ai_summary or "").lower() for k in self_action_keywords)
            if not is_self_action:
                purged_users = [em for em in user_emails if em.lower() != clean_sender]
                logger.info(f"🛡️ [Sender Guard] Đã lọc người gửi [{clean_sender}], còn lại: {purged_users}")
                user_emails = purged_users

        if not is_teacher and any(k in str(ai_summary or "").lower() for k in ["giáo viên", "teacher"]):
            is_teacher = True

        # 🎯 3. KIỂM TRA BẰNG CHỨNG (LÚC NÀY USERS_LIST ĐÃ CÓ NÊN AN TOÀN TUYỆT ĐỐI!)
        for it in assessment.intents:
            if it.type in self.policy_registry:
                # Nếu là create_accounts mà đã bóc tách được tài khoản từ file thì coi như có bằng chứng
                if it.type == "create_accounts" and len(users_list) > 0:
                    continue
                if not it.evidence:
                    missing_requirements.append({
                        "field": "evidence",
                        "message": f"Ý định '{it.type}' không có bằng chứng trích dẫn xác thực."
                    })

        # 🎯 4. VAI TRÒ GIT MẶC ĐỊNH
        git_role = str(entities.get("git_role") or "GUEST").upper().strip()
        if git_role not in ["ADMIN", "DEVELOPER", "GUEST"]:
            git_role = "GUEST"

        # 🎯 5. BÓC TÁCH MÔN HỌC & TRA CỨU CSDL
        ai_courses = entities.get("courses") or []
        raw_repos_or_shorthands = entities.get("repositories") or []

        summary_text = str(ai_summary or "")
        combined_text = f"{summary_text} {' '.join(str(c) for c in ai_courses)} {' '.join(str(r) for r in raw_repos_or_shorthands)}"
        expanded_courses = expand_course_range_text(combined_text)
        courses_to_query = list(dict.fromkeys(expanded_courses if expanded_courses else ai_courses))

        for r_item in raw_repos_or_shorthands:
            r_str = str(r_item).strip()
            if not r_str.startswith("http") and not r_str.isdigit() and r_str not in courses_to_query:
                courses_to_query.append(r_str)

        canonical_courses: List[Dict[str, Any]] = []
        collected_repos: List[str] = []

        # Chỉ nhận link Git thật (loại bỏ link Moodle learn.pythaverse.space)
        for r_item in raw_repos_or_shorthands:
            r_str = str(r_item).strip()
            if (r_str.startswith("http://") or r_str.startswith("https://")):
                if ("git." in r_str or "github.com" in r_str) and "learn.pythaverse.space" not in r_str:
                    if r_str not in collected_repos:
                        collected_repos.append(r_str)

        for c_query in courses_to_query:
            c_name, c_sku, c_repo, c_id = self.resolve_course_and_repos_from_db(str(c_query), is_teacher=is_teacher)
            if c_name:
                canonical_courses.append({
                    "course_name": c_name,
                    "course_id": c_id,
                    "git_repo": c_repo
                })
                if c_repo and c_repo not in collected_repos and "learn.pythaverse.space" not in c_repo:
                    collected_repos.append(c_repo)
        # 🎯 4. XÁC ĐỊNH CHÍNH XÁC INTENTS ĐƯỢC PHÉP CHẠY
        active_intent_types = [i.type for i in assessment.intents if i.type in self.policy_registry]

        # Bảo vệ ngữ nghĩa: Nếu người dùng chỉ yêu cầu kho lưu trữ Git mà không xin vào lớp LMS
        has_explicit_course_intent = any(i.type == "course_access" and i.evidence for i in assessment.intents)
        if any(i.type == "repository_access" for i in assessment.intents) and not has_explicit_course_intent:
            if not any(k in summary_text.lower() for k in ["ghi danh", "enrol", "học sinh vào lớp", "học môn", "course"]):
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
                        missing_field = "repository_url" if raw_repos_or_shorthands else "repositories"
                        missing_requirements.append({
                            "field": missing_field,
                            "message": f"Không tìm thấy link Repository URL hợp lệ cho các môn yêu cầu. Vui lòng cung cấp link Git repo bắt đầu bằng http:// hoặc https://."
                        })

                # --- 2. NHÓM GHI DANH LMS MOODLE ---
                elif cap_id == "lms.direct_enroll":
                    c_names = [c["course_name"] for c in canonical_courses]
                    c_ids = [c["course_id"] for c in canonical_courses if c.get("course_id")]

                    # Phân tách rạch ròi danh sách học sinh vs giáo viên
                    student_emails = [u["email"] for u in users_list if isinstance(u, dict) and u.get("role") == "student" and u.get("email")]
                    teacher_emails = [u["email"] for u in users_list if isinstance(u, dict) and u.get("role") == "teacher" and u.get("email")]

                    if not student_emails and not teacher_emails:
                        if is_teacher:
                            teacher_emails = user_emails
                        else:
                            student_emails = user_emails

                    # Phân bổ khóa học: Học sinh vào môn Explorer/Primary, Giáo viên vào đủ các môn
                    student_courses = [c for c in c_names if any(k in c.lower() for k in ["primary", "explorer", "synapse"])]
                    if not student_courses and c_names:
                        student_courses = [c_names[0]]

                    if not c_names:
                        missing_requirements.append({"field": "courses", "message": "Yêu cầu ghi danh thiếu thông tin khóa học."})
                        continue

                    if not student_emails and not teacher_emails:
                        missing_requirements.append({
                            "field": "teacher_accounts",
                            "message": "Chưa bóc tách được danh sách email giáo viên hoặc học sinh từ file đính kèm để ghi danh."
                        })
                        continue

                    # 🎯 ĐÓNG GÓI CHI TIẾT TỪNG MÔN KÈM GIT REPO ĐỂ FRONTEND KHÔNG BỊ BÁO LỖI VÀNG
                    courses_detailed = []
                    for c in canonical_courses:
                        courses_detailed.append({
                            "course_name": c["course_name"],
                            "course_id": c.get("course_id"),
                            "git_repo": c.get("git_repo"),
                            "has_git_repo": bool(c.get("git_repo"))
                        })

                    step_inputs = {
                        "courses": c_names,
                        "courses_detailed": courses_detailed, # 🎯 TRUYỀN CHI TIẾT REPO ĐỂ UI HIỆN BADGE TÍM!
                        "course_id": c_ids[0] if c_ids else None,
                        "course_ids": c_ids,
                        "student_emails": student_emails,
                        "teacher_emails": teacher_emails,
                        "student_courses": student_courses,
                        "teacher_courses": c_names,
                        "role": "teacher" if is_teacher else "student",
                        "git_repos": collected_repos,
                        "auto_sync_git": True
                    }
                    
                    step_name = f"Ghi danh Moodle ({len(c_names)} khóa cho {len(student_emails)} HS & {len(teacher_emails)} GV)"

                    steps.append(WorkflowStepDraft(
                        step_id=curr_step_id,
                        capability_id=cap_id,
                        name=step_name,
                        status="ready",
                        inputs=step_inputs,
                        depends_on=[]
                    ))
                    continue

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

                # Chỉ append bước thực thi nếu không bị thiếu thông tin cốt lõi
                has_critical_missing = False
                if cap_id in ["git.add_collaborators", "git.remove_collaborators"] and not collected_repos:
                    has_critical_missing = True
                elif cap_id in ["lms.direct_enroll", "lms.unenrol_users"] and not c_names:
                    has_critical_missing = True
                elif cap_id == "keycloak.reset_password" and not user_emails:
                    has_critical_missing = True
                elif cap_id in ["workspace.partner_approve_order", "workspace.distributor_approve_contract"] and not target_code:
                    has_critical_missing = True

                # Nếu bản thân intent không có bằng chứng, không sinh bước thực thi
                parent_intent = next((it for it in assessment.intents if it.type == itype), None)
                if parent_intent and not parent_intent.evidence:
                    # 🎯 NGOẠI LỆ AN TOÀN:
                    # 1. create_accounts: Cho chạy nếu đã bóc tách được user từ file
                    # 2. course_access: Cho chạy nếu đã tìm thấy khóa học hợp lệ từ CSDL
                    if itype == "create_accounts" and len(users_list) > 0:
                        has_critical_missing = False
                    elif itype == "course_access" and len(canonical_courses) > 0:
                        has_critical_missing = False
                    else:
                        has_critical_missing = True

                if not has_critical_missing:
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

        detected_course_names: List[str] = []
        for s in steps:
            if s.inputs and isinstance(s.inputs.get("courses"), list):
                for c in s.inputs["courses"]:
                    if c and str(c) not in detected_course_names:
                        detected_course_names.append(str(c))

        if not detected_course_names and assessment.entities:
            raw_c = assessment.entities.get("courses") or []
            detected_course_names = [str(c) for c in raw_c if c]

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary"),
            "reason_summary_vi": f"Đã tự động lập kế hoạch {len(steps)} bước thực thi dựa trên phân tích yêu cầu.",
            "overall_confidence": 0.95 if status == "ready" else 0.85,
            "workflow_outcome": "ACTIONABLE" if status == "ready" else "NEEDS_INFORMATION",
            "missing_requirements": missing_reqs,
            "detected_courses": detected_course_names,
            "planned_steps": [s.name for s in steps],
            "evidence_quotes": assessment.raw_evidence_quotes,
            "entities": assessment.entities,
            "school_required": is_school_required,
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
            # 1. Kiểm tra bước phụ thuộc có tồn tại không
            for dep in s.depends_on:
                if dep not in step_ids:
                    errors.append(f"Bước '{s.name}' phụ thuộc bước '{dep}' không tồn tại.")

            # 2. Kiểm định Fail-Closed Capability: Kiểm tra tính khả dụng của capability
            if s.capability_id in self.capabilities_map:
                cap = self.capabilities_map[s.capability_id]
                if not cap.get("supported_by_handler", True) or not cap.get("available", True):
                    errors.append(f"Bước '{s.name}' chứa capability '{s.capability_id}' không khả dụng để thực thi.")
            elif self.capabilities_map:
                errors.append(f"Bước '{s.name}' chứa capability '{s.capability_id}' không khả dụng để thực thi.")

        # 3. Phát hiện chu trình vòng kín trong đồ thị DAG (DFS Cycle Detection)
        adj: Dict[str, List[str]] = {s.step_id: list(s.depends_on) for s in step_objs}
        visited: Dict[str, int] = {}  # 0: unvisited, 1: visiting, 2: visited

        def dfs(node: str, path: List[str]):
            visited[node] = 1
            path.append(node)
            for neighbor in adj.get(node, []):
                if neighbor in visited and visited[neighbor] == 1:
                    cycle_nodes = " -> ".join(path + [neighbor])
                    errors.append(f"Phát hiện chu trình vòng kín (Circular Dependency): {cycle_nodes}")
                    return
                if neighbor not in visited or visited[neighbor] == 0:
                    dfs(neighbor, path)
            visited[node] = 2
            path.pop()

        for s in step_objs:
            if visited.get(s.step_id, 0) == 0:
                dfs(s.step_id, [])

        is_valid = len(errors) == 0
        return WorkflowValidationResult(
            is_valid=is_valid,
            status="ready" if is_valid else "invalid",
            errors=errors,
            warnings=warnings,
            stats={"total_steps": len(step_objs), "ready_steps": len(step_objs) if is_valid else 0, "dependent_steps": sum(1 for s in step_objs if s.depends_on)}
        )


workflow_planner_service = WorkflowPlannerService()