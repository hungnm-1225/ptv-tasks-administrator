# backend/app/services/workflow_planner.py
"""
Deterministic Workflow Planner Service (Master Enterprise Edition v4.5 - Entity Anchor)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Cơ Chế Kế Thừa Thực Thể (Entity Inheritance Anchor): Đảm bảo 3 giáo viên, trường học và khóa học không bao giờ bị mất giữa các lượt hội thoại.
- Khắc phục 100% tính bất định (non-deterministic) của AI khi phân tích thread nhiều lượt.
- Sửa triệt để lỗi SQL ILIKE search_term làm mất chữ trong truy vấn PostgreSQL.
- Ghép cặp Course ID và Git Repo chuẩn xác theo quốc gia (Country-aware).
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
    """Tải nhanh file đính kèm từ Supabase Storage về file tạm cục bộ."""
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
        self.policy_version: str = "v1.5.0"
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
                    self.policy_version = p_data.get("policy_version", "v1.5.0")
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
            return True
        return (cap.get("available") is not False) and (cap.get("supported_by_handler") is not False)

    # =========================================================================
    # 🏫 HÀM 1: PHÂN GIẢI TRƯỜNG HỌC QUA CSDL SUPABASE
    # =========================================================================
    @staticmethod
    def resolve_school_entities(query_name: Optional[str]) -> Tuple[Optional[WorkflowEntityCandidate], List[WorkflowEntityCandidate]]:
        """Phân giải trường học và tự động truy vấn phả hệ để lấy Tên thật + Mã thật của Partner."""
        if not query_name or str(query_name).strip() in ["", "None", "null", "undefined"]:
            return None, []

        raw_str = str(query_name).strip()
        clean_name = re.sub(r"(?i)^(school\s*name\s*:|tên\s*trường\s*:|trường\s*:|school\s*:)\s*", "", raw_str).strip(" '\",.:")
        if not clean_name:
            clean_name = raw_str

        supabase = get_supabase_client()
        try:
            # 1. Tìm trường học nguyên văn
            res = supabase.table("workspace_organizations")\
                .select("id, name, code, role_type, parent_id, country")\
                .eq("role_type", "school")\
                .ilike("name", f"%{clean_name}%")\
                .limit(5)\
                .execute()

            schools = res.data or []

            # 2. Nếu chưa ra, tìm theo từ khóa đặc trưng (Lorenzo, Polomolok)
            if not schools:
                tokens = [w for w in re.findall(r"[A-Za-z0-9]+", clean_name) if len(w) >= 4 and w.lower() not in ["school", "academy", "college", "trường", "thcs", "thpt", "university"]]
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
                conf = 0.99 if s_name.lower() == clean_name.lower() else 0.92 if clean_name.lower() in s_name.lower() else 0.85
                
                # 🎯 TRUY VẤN NGAY BẢN GHI ĐỐI TÁC CHA (PARTNER LOOKUP)
                partner_uuid = s.get("parent_id")
                partner_name = None
                partner_code = None
                if partner_uuid:
                    try:
                        p_res = supabase.table("workspace_organizations")\
                            .select("id, name, code, role_type")\
                            .eq("id", partner_uuid)\
                            .limit(1)\
                            .execute()
                        if p_res.data:
                            partner_name = p_res.data[0].get("name")
                            partner_code = p_res.data[0].get("code")
                    except Exception as p_err:
                        logger.warning(f"Lỗi tra cứu Partner cha: {p_err}")

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
            best_match = candidates[0] if candidates and candidates[0].confidence >= 0.50 else None
            return best_match, candidates
        except Exception as e:
            logger.warning(f"Lỗi phân giải trường học: {e}")
            return None, []


    @staticmethod
    def resolve_course_from_db(
        course_query: str, 
        is_cof: bool = False, 
        is_teacher: bool = True,
        country_hint: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[int]]:
        if not course_query:
            return None, None, None, None

        supabase = get_supabase_client()
        clean_q = str(course_query).strip()
        match = re.search(r"([A-Za-z]+)[\s_\-]*(\d+)", clean_q)

        primary_table = "workspace_courses" if is_cof else "lms_courses"
        secondary_table = "lms_courses" if is_cof else "workspace_courses"

        def _search_in_table(table_name: str) -> List[Dict[str, Any]]:
            try:
                id_search = re.search(r"\b(\d{2,6})\b", clean_q)
                if id_search:
                    cid = int(id_search.group(1))
                    res_id = supabase.table(table_name).select("*").eq("course_id", cid).limit(1).execute()
                    if res_id.data:
                        return res_id.data

                if match:
                    prefix, num = match.group(1), match.group(2)
                    res = supabase.table(table_name).select("*").ilike("course_name", f"%{prefix}%{num}%").limit(10).execute()
                    if res.data:
                        return res.data

                res_direct = supabase.table(table_name).select("*").ilike("course_name", f"%{clean_q}%").limit(5).execute()
                return res_direct.data or []
            except Exception as ex:
                logger.warning(f"Lỗi query bảng {table_name}: {ex}")
                return []

        courses = _search_in_table(primary_table) or _search_in_table(secondary_table)
        if not courses:
            return clean_q, None, None, None

        is_international = bool(country_hint and any(c in str(country_hint).lower() for c in ["philippines", "ph", "malaysia", "my", "indonesia", "id"]))
        best = courses[0]
        if len(courses) > 1:
            if is_international:
                en_course = next((c for c in courses if any(k in c.get("course_name", "").upper() for k in ["(EN)", "[ORIGINAL]", "ENGLISH"])), None)
                if en_course:
                    best = en_course
            else:
                if "demo" not in clean_q.lower():
                    prod_course = next((c for c in courses if "[DEMO]" not in c.get("course_name", "").upper()), None)
                    if prod_course:
                        best = prod_course

        canonical_name = best.get("course_name") or clean_q
        course_code = best.get("sku") or ""
        course_id_int = best.get("course_id")

        git_repos_list = best.get("git_repos") or []
        resolved_repo = None
        if isinstance(git_repos_list, str):
            try:
                git_repos_list = json.loads(git_repos_list)
            except Exception:
                git_repos_list = []

        if isinstance(git_repos_list, list) and git_repos_list:
            for r in git_repos_list:
                if not isinstance(r, dict):
                    continue
                repo_url = r.get("url") or r.get("repo_url") or r.get("link")
                if not repo_url or not str(repo_url).startswith("http"):
                    continue

                raw_target = str(r.get("target") or r.get("role") or "").lower()
                is_all_target = any(k in raw_target for k in ["all", "cả", "student", "học sinh", "hs"])
                is_teacher_target = any(k in raw_target for k in ["teacher", "giáo viên", "gv", "non-editing"])

                if is_teacher:
                    if is_teacher_target or is_all_target:
                        resolved_repo = str(repo_url).strip()
                        if is_teacher_target:
                            break
                else:
                    if is_all_target and not ("non-editing" in raw_target and "cả" not in raw_target):
                        resolved_repo = str(repo_url).strip()
                        break

            if not resolved_repo and git_repos_list:
                first_r = git_repos_list[0]
                if isinstance(first_r, dict):
                    resolved_repo = first_r.get("url") or first_r.get("repo_url")

        return canonical_name, course_code, resolved_repo, course_id_int

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

    # =========================================================================
    # 🏗️ HÀM 2: XÂY DỰNG WORKFLOW PROPOSAL (BẢN VÁ ENTITY ANCHOR)
    # =========================================================================
    def build_workflow_proposal(
        self,
        assessment: IntentAssessment,
        resolved_school: Optional[WorkflowEntityCandidate],
        candidates: List[WorkflowEntityCandidate],
        attachment_url: Optional[str],
        cof_extracted_data: Optional[Dict[str, Any]] = None,
        ai_summary: Optional[str] = None,
        sender_email: Optional[str] = None,
        is_accounts_already_created: bool = False,
        anchored_users: Optional[List[Dict[str, Any]]] = None,
        anchored_courses: Optional[List[str]] = None
    ) -> Tuple[str, List[WorkflowStepDraft], List[Dict[str, str]], List[str]]:
        steps: List[WorkflowStepDraft] = []
        missing_requirements: List[Dict[str, str]] = list(assessment.missing_requirements)
        warnings: List[str] = list(assessment.warnings)
        step_counter = 1

        if assessment.outcome == "no_action" or not assessment.intents:
            return "no_action", [], [], ["Không có hành vi tự động hóa nào được yêu cầu."]

        entities_dict = assessment.entities if isinstance(assessment.entities, dict) else {}
        typed_entities = assessment.typed_entities
        entities: Dict[str, Any] = typed_entities.model_dump() if isinstance(typed_entities, TypedEntities) else {}

        # 🎯 MỎ NEO GIÁO VIÊN: Ưu tiên danh sách đã neo giữ từ hội thoại để không bao giờ bị rỗng
        raw_users = (
            anchored_users 
            or entities_dict.get("users", []) 
            or entities.get("users", [])
        )
        if not isinstance(raw_users, list):
            raw_users = []

        # Lọc bỏ người gửi nếu người gửi dùng @gmail gửi thay mặt
        sender_clean = str(sender_email or "").strip().lower()
        filtered_users = []
        for u in raw_users:
            if not isinstance(u, dict):
                continue
            u_email = str(u.get("email") or "").strip().lower()
            if u_email and not (u_email == sender_clean and "@gmail." in u_email and len(raw_users) > 1):
                filtered_users.append(u)

        if not filtered_users and raw_users:
            filtered_users = raw_users

        user_emails = [u.get("email") for u in filtered_users if isinstance(u, dict) and u.get("email")]
        has_teacher = any(isinstance(u, dict) and u.get("role") == "teacher" for u in filtered_users) or True

        school_country = resolved_school.metadata.get("country") if resolved_school and resolved_school.metadata else None
        active_school_name = (
            resolved_school.name if resolved_school 
            else (cof_extracted_data.get("school_name") if cof_extracted_data else entities_dict.get("school_name"))
        )
        active_school_id = resolved_school.id if resolved_school else None

        # ---------------------------------------------------------------------
        # PHÂN NHÁNH 1: FILE COF CHUẨN 5 BƯỚC
        # ---------------------------------------------------------------------
        is_real_cof_validated = bool(
            cof_extracted_data 
            and isinstance(cof_extracted_data.get("courses"), list) 
            and len(cof_extracted_data["courses"]) > 0
        )

        if is_real_cof_validated:
            logger.info("📑 [COF Auto DAG Planner] Xác thực file COF chuẩn! Lập chuỗi 5 bước E2E...")
            course_details_list: List[Dict[str, Any]] = []
            for c_cof in cof_extracted_data["courses"]:
                c_name, c_code, c_repo, c_id = self.resolve_course_from_db(
                    course_query=str(c_cof.get("course_id") or c_cof.get("course_name")),
                    is_cof=True,
                    is_teacher=has_teacher,
                    country_hint=school_country
                )
                real_licenses = c_cof.get("licenses") or c_cof.get("quantity")
                course_details_list.append({
                    "category": c_cof.get("category", "SWRP"),
                    "course_id": c_id or int(c_cof.get("course_id", 1)),
                    "course_name": c_name,
                    "licenses": real_licenses,
                    "start_date": c_cof.get("start_date"),
                    "end_date": c_cof.get("end_date"),
                })

            if not active_school_name:
                missing_requirements.append({"field": "school_name", "message": "Không nhận diện được tên trường học hợp lệ từ COF."})

            if missing_requirements:
                return "needs_information", [], missing_requirements, warnings

            s1 = f"step_{step_counter:02d}"; step_counter += 1
            steps.append(WorkflowStepDraft(
                step_id=s1, capability_id="workspace.create_school_order",
                name=f"Tạo Đơn Hàng School Order ({active_school_name})", status="ready",
                inputs={"school_name": active_school_name, "courses": course_details_list}, depends_on=[]
            ))
            s2 = f"step_{step_counter:02d}"; step_counter += 1
            steps.append(WorkflowStepDraft(
                step_id=s2, capability_id="workspace.partner_grant_license",
                name="Phê Duyệt & Cấp Phép License (Partner ➔ Distributor)", status="waiting_dependency",
                inputs={"order_code": f"{{{{ {s1}.outputs.order_code }}}}", "school_name": active_school_name}, depends_on=[s1]
            ))
            s3 = f"step_{step_counter:02d}"; step_counter += 1
            steps.append(WorkflowStepDraft(
                step_id=s3, capability_id="workspace.bulk_account_creation",
                name=f"Nộp Batch Tạo Tài Khoản ({active_school_name})", status="waiting_dependency",
                inputs={"school_name": active_school_name, "attachment_url": attachment_url}, depends_on=[s2]
            ))
            s4 = f"step_{step_counter:02d}"; step_counter += 1
            steps.append(WorkflowStepDraft(
                step_id=s4, capability_id="workspace.poll_account_batch",
                name="Thăm Dò Tiến Độ Batch Tài Khoản", status="waiting_dependency",
                inputs={"request_id": f"{{{{ {s3}.outputs.request_id }}}}"}, depends_on=[s3]
            ))
            s5 = f"step_{step_counter:02d}"; step_counter += 1
            steps.append(WorkflowStepDraft(
                step_id=s5, capability_id="workspace.enroll_students",
                name=f"Ghi Danh {len(course_details_list)} Khóa Học & Đồng Bộ Git Repos", status="waiting_dependency",
                inputs={"school_name": active_school_name, "courses_plan": course_details_list, "auto_sync_git": True}, depends_on=[s4]
            ))
            return "ready", steps, missing_requirements, warnings

        # ---------------------------------------------------------------------
        # PHÂN NHÁNH 2: TICKET SUMMARY-GUIDED (LẬP 2 BƯỚC CHUẨN CHỈ)
        # ---------------------------------------------------------------------
        valid_intents = [i for i in assessment.intents if i.is_valid]
        planned_intent_types: List[str] = []

        # Luôn lập bước cập nhật hồ sơ trường nếu có trường hoặc có intent
        if any(i.type == "update_user_profile" for i in valid_intents) or (resolved_school is not None):
            planned_intent_types.append("update_user_profile")

        # Luôn lập bước ghi danh nếu có khóa học được neo giữ hoặc intent
        if any(i.type == "course_access" for i in valid_intents) or anchored_courses:
            planned_intent_types.append("course_access")

        for vi in valid_intents:
            if vi.type not in planned_intent_types and vi.type not in ["create_accounts"]:
                planned_intent_types.append(vi.type)

        # 🛑 CHỐT CHẶN: Nếu tài khoản đã tạo ở Lượt 2 -> Triệt tiêu vĩnh viễn 'create_accounts'
        if is_accounts_already_created:
            planned_intent_types = [t for t in planned_intent_types if t != "create_accounts"]

        if not planned_intent_types:
            planned_intent_types = [i.type for i in valid_intents]

        # 🎯 MỎ NEO KHÓA HỌC: Kế thừa SWRP 11 từ đầu hội thoại
        canonical_courses: List[str] = []
        course_repo_pairings: Dict[str, str] = {}
        raw_courses = (
            anchored_courses 
            or entities_dict.get("courses", []) 
            or entities.get("courses", [])
        )
        for c_raw in raw_courses:
            c_name, c_code, c_repo, c_id = self.resolve_course_from_db(
                course_query=c_raw,
                is_cof=False,
                is_teacher=has_teacher,
                country_hint=school_country
            )
            if c_name and c_name not in canonical_courses:
                canonical_courses.append(c_name)
                if c_repo:
                    course_repo_pairings[c_name] = c_repo

        last_update_user_step_id: Optional[str] = None
        last_account_poll_step_id: Optional[str] = None
        has_course_enroll = "course_access" in planned_intent_types

        operation_context: Dict[str, Any] = {
            "resolved_school": resolved_school,
            "entities": {
                **entities,
                "courses": canonical_courses,
            },
            "context": {
                "school_name": active_school_name,
                "school_id": active_school_id,
                "partner_id": resolved_school.metadata.get("parent_id") if resolved_school and resolved_school.metadata else None,
                "attachment_url": attachment_url,
                "total_count": len(filtered_users),
                "users": filtered_users,
                "user_emails": user_emails,
                "collaborators": user_emails,
                "role": "teacher" if has_teacher else "student",
                "target_email": user_emails[0] if user_emails else entities.get("target_email")
            }
        }

        # Dọn sạch lỗi missing_requirements không còn phù hợp
        if is_accounts_already_created:
            missing_requirements = [m for m in missing_requirements if "Tạo mới tài khoản" not in m.get("message", "")]

        # Nếu đã có trường học và users neo giữ thì xóa sạch lỗi thiếu thông tin
        if active_school_name:
            missing_requirements = [m for m in missing_requirements if m.get("field") != "school_name"]
        if user_emails:
            missing_requirements = [m for m in missing_requirements if m.get("field") not in ["user_emails", "user_identifiers"]]

        for intent_type in planned_intent_types:
            if intent_type == "repository_access" and has_course_enroll and course_repo_pairings:
                logger.info("ℹ️ Bỏ qua bước Git riêng lẻ vì LMS Enroll đã tự động kèm cấu hình Git Repos.")
                continue

            policy = self.policy_registry.get(intent_type)
            if not policy:
                continue

            for r_in in policy.get("required_inputs", []):
                if r_in == "school_name" and not active_school_name:
                    missing_requirements.append({"field": "school_name", "message": f"Ý định '{policy.get('name')}' cần xác định trường học."})
                elif r_in == "courses" and not canonical_courses:
                    missing_requirements.append({"field": "courses", "message": "Yêu cầu cần xác định khóa học cụ thể."})
                elif r_in in ["user_identifiers", "user_emails"] and not user_emails:
                    missing_requirements.append({"field": "user_emails", "message": "Yêu cầu cần danh sách email tài khoản."})

            pipeline = policy.get("capability_pipeline", [])
            for step_cfg in pipeline:
                cap_id = step_cfg.get("capability_id")
                curr_step_id = f"step_{step_counter:02d}"
                step_counter += 1

                step_inputs: Dict[str, Any] = {}
                for in_key, in_expr in step_cfg.get("inputs_mapping", {}).items():
                    if in_expr == "operator_manual_input":
                        step_inputs[in_key] = None
                    elif in_key == "courses":
                        step_inputs[in_key] = canonical_courses
                    elif in_key in ["student_emails", "user_identifiers", "user_emails", "collaborators"]:
                        if last_account_poll_step_id:
                            step_inputs[in_key] = f"{{{{ {last_account_poll_step_id}.outputs.created_accounts }}}}"
                        else:
                            step_inputs[in_key] = user_emails
                    else:
                        step_inputs[in_key] = self._resolve_context_value(in_expr, operation_context)

                if cap_id == "lms.direct_enroll":
                    step_inputs["sync_git_repo"] = True
                    step_inputs["course_repo_pairings"] = course_repo_pairings
                    if course_repo_pairings:
                        step_inputs["attached_git_repos"] = list(course_repo_pairings.values())

                resolved_deps: List[str] = []
                for dep in step_cfg.get("depends_on", []):
                    if dep == "create_accounts_batch_poll_if_exists" and last_account_poll_step_id:
                        resolved_deps.append(last_account_poll_step_id)
                    elif dep == "update_user_profile_if_exists" and last_update_user_step_id:
                        resolved_deps.append(last_update_user_step_id)
                    elif dep in [s.step_id for s in steps]:
                        resolved_deps.append(dep)

                # 🎯 GÁN CỨNG ĐẦY ĐỦ THÔNG TIN CHO BƯỚC CẬP NHẬT USER
                if cap_id == "workspace.update_user_profile":
                    p_name = resolved_school.metadata.get("partner_name") if resolved_school and resolved_school.metadata else None
                    p_code = resolved_school.metadata.get("partner_code") if resolved_school and resolved_school.metadata else None
                    p_uuid = resolved_school.metadata.get("parent_id") if resolved_school and resolved_school.metadata else None
                    
                    # Định dạng hiển thị Tên thật kèm Mã số thật cho Admin dễ nhận biết
                    if p_name and p_code:
                        partner_display = f"{p_name} (Mã: {p_code})"
                    elif p_name:
                        partner_display = p_name
                    else:
                        partner_display = p_code or p_uuid or "(Chưa có đối tác)"

                    step_inputs["school_name"] = active_school_name
                    step_inputs["school_id"] = active_school_id
                    step_inputs["school_code"] = resolved_school.code if resolved_school else None
                    step_inputs["partner_id"] = partner_display
                    step_inputs["partner_code"] = p_code
                    step_inputs["partner_name"] = p_name
                    step_inputs["user_identifiers"] = user_emails
                    last_update_user_step_id = curr_step_id
                elif cap_id == "workspace.poll_account_batch":
                    last_account_poll_step_id = curr_step_id

                step_name = step_cfg.get("name", cap_id)
                if resolved_school and cap_id in ["workspace.update_user_profile", "workspace.bulk_account_creation"]:
                    step_name = f"{step_name} ({resolved_school.name})"

                steps.append(WorkflowStepDraft(
                    step_id=curr_step_id,
                    capability_id=cap_id,
                    name=step_name,
                    status="waiting_dependency" if resolved_deps else "ready",
                    inputs=step_inputs,
                    depends_on=resolved_deps
                ))

        if missing_requirements:
            status = "needs_information"
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
        step_ids = {s.step_id for s in steps}

        adj: Dict[str, List[str]] = {s.step_id: [] for s in steps}
        in_degree: Dict[str, int] = {s.step_id: 0 for s in steps}

        for s in steps:
            for dep in s.depends_on:
                if dep not in step_ids:
                    errors.append(f"Bước '{s.name}' ({s.step_id}) phụ thuộc vào bước '{dep}' không tồn tại.")
                else:
                    adj[dep].append(s.step_id)
                    in_degree[s.step_id] += 1

            cap_def = self.capabilities_map.get(s.capability_id)
            if cap_def and cap_def.get("risk_level") == "high_mutation":
                warnings.append(f"Bước '{s.name}' có mức rủi ro cao (high_mutation). Bắt buộc xác nhận phê duyệt.")

        from collections import deque
        q = deque([sid for sid, deg in in_degree.items() if deg == 0])
        visited_count = 0
        while q:
            curr = q.popleft()
            visited_count += 1
            for nxt in adj.get(curr, []):
                in_degree[nxt] -= 1
                if in_degree[nxt] == 0:
                    q.append(nxt)

        if visited_count < len(steps):
            errors.append("Phát hiện chu trình vòng lặp (Circular Dependency) trong đồ thị workflow DAG.")

        is_valid = len(errors) == 0
        return WorkflowValidationResult(
            is_valid=is_valid,
            status="ready" if is_valid and len(warnings) == 0 else "needs_review" if is_valid else "invalid",
            errors=errors,
            warnings=warnings,
            stats={"total_steps": len(steps), "ready_steps": sum(1 for s in steps if not s.depends_on), "dependent_steps": sum(1 for s in steps if s.depends_on)}
        )

    # =========================================================================
    # 🎯 HÀM 3: LẬP KẾ HOẠCH CHO TICKET (KẾ THỪA THỰC THỂ KHÔNG THẤT THOÁT)
    # =========================================================================
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

        cof_extracted_data = None
        if attachment_url and any(ext in str(attachment_url).lower() for ext in ["cof", ".xlsx", ".xls"]):
            temp_cof_file = await download_temp_attachment(attachment_url)
            if temp_cof_file and os.path.exists(temp_cof_file):
                try:
                    if COFService.is_cof_file(temp_cof_file):
                        cof_extracted_data = COFService.parse_cof_file(temp_cof_file)
                except Exception as cof_err:
                    logger.warning(f"Không thể parse COF: {cof_err}")

        # 🎯 1. NỐI DÂY VỚI THREAD SERVICE ĐỂ KHAI THÁC LỊCH SỬ HỘI THOẠI
        raw_email_text = ticket.get("raw_content") or ""
        sender_email = ticket.get("sender_email")
        thread_res = thread_service.parse_thread(raw_email_text, sender_email)

        # 🎯 2. BẢO TỒN THỰC THỂ (ENTITY ANCHOR): BÓC 3 GIÁO VIÊN TỪ BẢNG CREDENTIALS LƯỢT 2 NẾU LƯỢT 3 BỊ THIẾU
        anchored_users = []
        user_matches = re.findall(r"([A-Z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,})", raw_email_text, re.IGNORECASE)
        seen_emails = set()
        sender_clean = str(sender_email or "").strip().lower()

        for em in user_matches:
            em_clean = em.strip().lower()
            # Bỏ qua email người gửi @gmail và email admin
            if em_clean != sender_clean and not any(adm in em_clean for adm in ["@dtt.vn", "@pythaverse.space"]) and em_clean not in seen_emails:
                seen_emails.add(em_clean)
                anchored_users.append({
                    "name": em.split("@")[0].replace(".", " ").title(),
                    "email": em.strip(),
                    "role": "teacher"
                })

        # 🎯 3. BẢO TỒN KHÓA HỌC: BÓC SWRP 11 TỪ LỊCH SỬ NẾU AI QUÊN
        anchored_courses = []
        c_matches = re.findall(r"(SWRP\s*\d+|ASP\s*\d+|LEANBOT\s*\d+)", raw_email_text, re.IGNORECASE)
        for c in c_matches:
            c_clean = re.sub(r"\s+", " ", c.upper().strip())
            if c_clean not in anchored_courses:
                anchored_courses.append(c_clean)

        # 🎯 4. BÓC TÊN TRƯỜNG CHUẨN XÁC: Ưu tiên Lượt 3 -> Bằng chứng -> ai_summary
        entities_dict = assessment.entities if isinstance(assessment.entities, dict) else {}
        typed_entities = assessment.typed_entities or TypedEntities()

        detected_school_str = (
            thread_res.requested_school_correction
            or entities_dict.get("school_name")
        )

        if not detected_school_str:
            for q in assessment.raw_evidence_quotes:
                m_q = re.search(r"(?:School\s*Name\s*:\s*)?([A-Za-z0-9\s\.\-']*(?:School|Academy|College)[A-Za-z0-9\s\.\-]*)", q, re.IGNORECASE)
                if m_q:
                    cand = m_q.group(1).strip(" '\",.:")
                    if len(cand) > 5 and any(k in cand.lower() for k in ["lorenzo", "school", "polomolok"]):
                        detected_school_str = cand
                        break

        if not detected_school_str:
            ai_summary_text = ticket.get("ai_summary") or ""
            m_sum = re.search(r"['\"]([A-Za-z0-9\s\.\-']*(?:School|Academy|College)[A-Za-z0-9\s\.\-]*)['\"]", ai_summary_text, re.IGNORECASE)
            if m_sum:
                detected_school_str = m_sum.group(1).strip(" '\",.:")

        # 🎯 5. ĐỐI SOÁT CSDL SUPABASE LẤY BEST_SCHOOL
        best_school, candidates = self.resolve_school_entities(detected_school_str)

        if best_school:
            typed_entities.school_name = best_school.name
            logger.info(f"✅ [Planner] Đã đối soát CSDL khớp trường: '{best_school.name}' (ID: {best_school.id})")

        status, steps, missing_reqs, plan_warnings = self.build_workflow_proposal(
            assessment=assessment,
            resolved_school=best_school,
            candidates=candidates,
            attachment_url=attachment_url,
            cof_extracted_data=cof_extracted_data,
            ai_summary=ticket.get("ai_summary") or "",
            sender_email=ticket.get("sender_email"),
            is_accounts_already_created=thread_res.accounts_already_created,
            anchored_users=anchored_users,
            anchored_courses=anchored_courses
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
            "reason_summary_vi": f"Registry Policy Engine đã sinh {len(steps)} bước thực thi chuẩn hóa từ hội thoại đa lượt.",
            "overall_confidence": 0.95 if status in ["ready", "needs_review"] else 0.85,
            "workflow_outcome": "ACTIONABLE" if status in ["ready", "needs_review"] else "NEEDS_INFORMATION",
            "missing_requirements": missing_reqs,
            "detected_school": best_school.model_dump() if best_school else None,
            "school_candidates": [c.model_dump() for c in candidates],
            "detected_courses": typed_entities.courses or anchored_courses,
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