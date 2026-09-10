# backend/app/services/workflow_planner.py
import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.services.workspace_lineage_service import WorkspaceLineageService
from app.models.workflow import (
    WorkflowStepDraft,
    WorkflowAIAnalysis,
    WorkflowValidationResult,
    WorkflowEntityCandidate
)

logger = logging.getLogger(__name__)

BRAIN_DIR = os.path.join(os.path.dirname(__file__), "../brain")


class WorkflowPlannerService:
    """
    Bộ lập kế hoạch & tiền xử lý Workflow thông minh (AI Workflow Planner):
    - Grounding chặt chẽ theo Capability Registry, Workflow Rules & Dependency Rules.
    - Phân giải thực thể Trường học (Entity Resolution) độc lập.
    - Soạn thảo đồ thị phụ thuộc (DAG Dependency Graph) an toàn.
    - Kiểm định tính toàn vẹn (Validation Engine) & phát hiện chu trình (Cycle Detection).
    """

    def __init__(self):
        self.capabilities_map: Dict[str, Any] = {}
        self.workflow_rules: List[Dict[str, Any]] = []
        self.dependency_rules: Dict[str, Any] = {}
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

            wf_file = os.path.join(BRAIN_DIR, "workflow_rules.json")
            if os.path.exists(wf_file):
                with open(wf_file, "r", encoding="utf-8") as f:
                    self.workflow_rules = json.load(f).get("workflow_archetypes", [])

            dep_file = os.path.join(BRAIN_DIR, "dependency_rules.json")
            if os.path.exists(dep_file):
                with open(dep_file, "r", encoding="utf-8") as f:
                    self.dependency_rules = json.load(f).get("dependencies", {})

            logger.info(f"🧠 Workflow Planner nạp thành công {len(self.capabilities_map)} capabilities, {len(self.workflow_rules)} archetypes!")
        except Exception as e:
            logger.error(f"❌ Lỗi nạp registries cho WorkflowPlanner: {e}")

    @staticmethod
    def resolve_school_entities(query_name: Optional[str]) -> Tuple[Optional[WorkflowEntityCandidate], List[WorkflowEntityCandidate]]:
        """
        Tìm kiếm và phân giải thực thể trường học trong workspace_organizations:
        - Tính toán điểm confidence tương đối.
        - Trả về (best_match, all_candidates).
        """
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
                # Tìm kiếm theo code hoặc từ khóa ngắn
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
                # Tính độ tự tin (Confidence score)
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

            # Sắp xếp theo confidence giảm dần
            candidates.sort(key=lambda x: x.confidence, reverse=True)
            best_match = candidates[0] if candidates and candidates[0].confidence >= 0.80 else None
            return best_match, candidates
        except Exception as e:
            logger.warning(f"Lỗi phân giải trường học '{query_name}': {e}")
            return None, []

    def match_workflow_rule(self, subject: str, content: str, category: str, is_cof: bool = False) -> Dict[str, Any]:
        """Khớp rule archetype dựa trên từ khóa và ngữ cảnh COF."""
        combined_text = f"{subject} {content}".lower()

        if is_cof or "cof" in combined_text or "curriculum order form" in combined_text:
            for r in self.workflow_rules:
                if r.get("rule_id") == "COF_FULL_ONBOARDING":
                    return r

        if any(k in combined_text for k in ["tạo tài khoản", "create account", "ghi danh", "enroll", "lms", "moodle"]) or category == "lms_enroll":
            for r in self.workflow_rules:
                if r.get("rule_id") == "CREATE_ACCOUNTS_AND_ENROLL_LMS":
                    return r

        if any(k in combined_text for k in ["reset pass", "quên mật khẩu", "mật khẩu", "keycloak", "verify email"]) or category == "account_keycloak":
            for r in self.workflow_rules:
                if r.get("rule_id") == "KEYCLOAK_IDENTITY_MANAGEMENT":
                    return r

        if any(k in combined_text for k in ["git", "pgit", "collaborator", "repository"]):
            for r in self.workflow_rules:
                if r.get("rule_id") == "GIT_COLLABORATOR_ACCESS":
                    return r

        if "google form" in combined_text or "doc" in combined_text or category == "bug":
            for r in self.workflow_rules:
                if r.get("rule_id") == "FEEDBACK_DOC_TRIAGE":
                    return r

        # Fallback về archetype đầu tiên hoặc mặc định
        return self.workflow_rules[0] if self.workflow_rules else {
            "rule_id": "CUSTOM_FLOW",
            "title": "Tác vụ hệ thống tùy chỉnh",
            "step_templates": []
        }

    def plan_workflow_for_ticket(self, ticket_id: str) -> Optional[Dict[str, Any]]:
        """
        Tiền xử lý & lập Workflow Draft hoàn chỉnh cho một ticket:
        1. Lấy thông tin ticket & attachments.
        2. Phân giải trường học (Entity Resolution).
        3. Ghép capability và thiết lập data binding & dependency.
        4. Validate DAG và lưu vào bảng automation_workflows.
        """
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            logger.warning(f"Không tìm thấy ticket #{ticket_id} để lập plan!")
            return None

        ticket = res.data[0]
        meta = ticket.get("metadata") or {}
        excel_summary = meta.get("excel_summary") or {}
        is_cof = excel_summary.get("is_cof", False)
        attachments = ticket.get("attachments") or []

        subject = ticket.get("subject", "")
        raw_content = ticket.get("raw_content", "")
        category = ticket.get("category", "other")
        detected_school_str = meta.get("school_name") or excel_summary.get("school_name")

        # 1. Entity Resolution
        best_school, candidates = self.resolve_school_entities(detected_school_str)

        # 2. Khớp Archetype Rule
        matched_rule = self.match_workflow_rule(subject, raw_content, category, is_cof=is_cof)

        # 3. Tạo Steps từ Archetype
        steps: List[WorkflowStepDraft] = []
        target_school_name = best_school.name if best_school else (detected_school_str or "")
        target_school_id = best_school.id if best_school else None

        attachment_url = attachments[0].get("url") if attachments else None
        target_email = meta.get("target_email") or ticket.get("sender_email")
        courses_list = excel_summary.get("courses") or meta.get("cof_courses") or []

        for tpl in matched_rule.get("step_templates", []):
            cap_id = tpl.get("capability_id")
            cap_def = self.capabilities_map.get(cap_id, {})
            step_id = tpl.get("step_id")
            step_name = tpl.get("name") or cap_def.get("name", cap_id)
            depends_on = tpl.get("depends_on", [])

            # Gán inputs thông minh dựa vào Capability ID
            inputs: Dict[str, Any] = {}
            if cap_id == "workspace.resolve_school":
                inputs = {
                    "school_name": target_school_name,
                    "school_id": target_school_id,
                    "country": best_school.metadata.get("country") if (best_school and best_school.metadata) else "Vietnam"
                }
            elif cap_id == "cof.parse_file":
                inputs = {
                    "file_url": attachment_url,
                    "filename": attachments[0].get("filename") if attachments else "COF.xlsx"
                }
            elif cap_id == "cof.generate_accounts_file":
                inputs = {
                    "users_list": "{{ step_01.students_to_create }}",
                    "school_name": target_school_name
                }
            elif cap_id == "workspace.bulk_account_creation":
                inputs = {
                    "school_identifier": target_school_name,
                    "school_id": target_school_id,
                    "upload_file_path": "{{ step_02.account_file_path }}" if "step_02" in depends_on else attachment_url,
                    "attachment_url": attachment_url,
                    "total_count": excel_summary.get("students_to_create", 10)
                }
            elif cap_id == "workspace.poll_account_batch":
                inputs = {
                    "school_identifier": target_school_name,
                    "request_id": "{{ step_03.account_batch_request_id }}" if "step_03" in depends_on else "{{ step_04.account_batch_request_id }}"
                }
            elif cap_id == "cof.write_results_back":
                inputs = {
                    "original_cof_path": attachment_url,
                    "result_file_path": "{{ step_05.result_file_url }}" if "step_05" in depends_on else "{{ step_04.result_file_url }}",
                    "school_name": target_school_name
                }
            elif cap_id == "workspace.school_create_order":
                inputs = {
                    "school_identifier": target_school_name,
                    "order_details": {
                        "contact_info": "Admin Automation Hub (operation@pythaverse.space)",
                        "courses": courses_list,
                        "additional_notes": f"Tự động tạo đơn hàng cho {target_school_name}"
                    }
                }
            elif cap_id == "workspace.partner_approve_order":
                inputs = {
                    "order_code": "{{ step_07.order_code }}" if "step_07" in depends_on else None
                }
            elif cap_id == "lms.direct_enroll":
                inputs = {
                    "courses": courses_list or [{"course_name": "Training Demo", "course_id": 999}],
                    "student_emails": "{{ step_04.created_accounts }}" if "step_04" in depends_on else ([target_email] if target_email else []),
                    "role": "student"
                }
            elif cap_id == "workspace.school_enroll_users":
                inputs = {
                    "school_identifier": target_school_name,
                    "course_name": courses_list[0].get("course_name") if courses_list else "Standard Course",
                    "student_emails": "{{ step_05.created_accounts }}" if "step_05" in depends_on else []
                }
            elif cap_id == "keycloak.reset_password":
                inputs = {
                    "target_email": target_email,
                    "temporary_password": "Ptv@2026",
                    "force_change_on_first_login": True
                }
            elif cap_id == "keycloak.verify_email":
                inputs = {
                    "target_email": target_email
                }
            elif cap_id == "git.add_collaborators":
                inputs = {
                    "repo_url": "https://git.pythaverse.space/ptvswrp/SWRP11_Teacher",
                    "collaborators": [target_email] if target_email else [],
                    "target_role": "GUEST"
                }
            elif cap_id == "feedback.comment_and_assign":
                inputs = {
                    "doc_url": ticket.get("doc_url") or "",
                    "assignee_email": ticket.get("assigned_email") or "hung.nguyenmanh@dtt.vn",
                    "comment_content": "Kính gửi anh/chị, em xin phép chuyển thông tin phản hồi này để team kỹ thuật rà soát và hỗ trợ giải quyết."
                }

            step_status = "ready" if not depends_on else "waiting_dependency"
            steps.append(
                WorkflowStepDraft(
                    step_id=step_id,
                    capability_id=cap_id,
                    name=step_name,
                    description=cap_def.get("description"),
                    status=step_status,
                    inputs=inputs,
                    depends_on=depends_on
                )
            )

        # 4. Validation Engine (Kiểm tra chu trình & tính khả thi)
        val_result = self.validate_workflow_graph(steps)

        # 5. Xây dựng AI Analysis Metadata
        conf_breakdown = {
            "intent": 0.95,
            "school": best_school.confidence if best_school else 0.0,
            "courses": 0.92 if courses_list else 0.70
        }
        overall_conf = sum(conf_breakdown.values()) / len(conf_breakdown)

        reason_summary = (
            f"Dựa trên yêu cầu tiếp nhận từ {ticket.get('source', 'Ticket').upper()}: "
            f"Hệ thống đã nhận diện mục đích '{matched_rule.get('title')}', "
            f"khớp {len(steps)} bước thực thi chuẩn hóa và tự động liên kết phụ thuộc tuần tự giữa các cỗ máy."
        )

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary") or matched_rule.get("description"),
            "reason_summary_vi": reason_summary,
            "overall_confidence": round(overall_conf, 2),
            "confidence_breakdown": conf_breakdown,
            "detected_school": best_school.model_dump() if best_school else None,
            "school_candidates": [c.model_dump() for c in candidates],
            "detected_courses": courses_list,
            "detected_actions": [s.capability_id for s in steps],
            "warnings": val_result.warnings
        }

        # 6. Lưu bản ghi vào bảng automation_workflows
        workflow_status = "ready" if val_result.is_valid and best_school else "needs_review"
        workflow_record = self._save_workflow_draft(
            ticket_id=ticket_id,
            title=matched_rule.get("title", f"Workflow #{ticket_id[:8]}"),
            goal=ticket.get("subject"),
            status=workflow_status,
            ai_analysis=ai_analysis_dict,
            steps=[s.model_dump() for s in steps]
        )

        return workflow_record

    def validate_workflow_graph(self, steps: List[WorkflowStepDraft]) -> WorkflowValidationResult:
        """
        Kiểm định tính toàn vẹn của Đồ thị phụ thuộc (DAG):
        - Phát hiện chu trình khép kín (Circular Dependencies) qua DFS.
        - Kiểm tra các bước phụ thuộc có tồn tại trong danh sách không.
        - Kiểm tra các trường inputs bắt buộc theo capabilities.json.
        """
        errors: List[str] = []
        warnings: List[str] = []
        step_ids = {s.step_id for s in steps}

        # 1. Kiểm tra tồn tại của step_id phụ thuộc
        adj: Dict[str, List[str]] = {s.step_id: [] for s in steps}
        for s in steps:
            for dep in s.depends_on:
                if dep not in step_ids:
                    errors.append(f"Bước '{s.name}' ({s.step_id}) phụ thuộc vào bước '{dep}' không tồn tại trong luồng.")
                else:
                    adj[dep].append(s.step_id)

        # 2. Phát hiện chu trình (Cycle Detection - DFS 3 Colors: 0=unvisited, 1=visiting, 2=visited)
        visited: Dict[str, int] = {s.step_id: 0 for s in steps}
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

        for s in steps:
            if visited[s.step_id] == 0:
                dfs(s.step_id, [])

        # 3. Kiểm tra Required Inputs từ capabilities.json
        for s in steps:
            cap_def = self.capabilities_map.get(s.capability_id)
            if not cap_def:
                warnings.append(f"Capability '{s.capability_id}' chưa được đăng ký trong Capability Registry.")
                continue

            req_inputs = cap_def.get("required_inputs", [])
            for req in req_inputs:
                val = s.inputs.get(req)
                if val is None or str(val).strip() in ["", "None", "null", "undefined"]:
                    # Nếu có upstream binding thì chấp nhận tạm thời
                    has_upstream = any(req in str(v) for v in s.inputs.values() if isinstance(v, str) and "{{" in v)
                    if not has_upstream:
                        warnings.append(f"Bước '{s.name}': Cần bổ sung thông tin '{req}' trước khi thực thi.")

            # Cảnh báo bước có độ rủi ro cao (Mutation)
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
                "total_steps": len(steps),
                "ready_steps": sum(1 for s in steps if not s.depends_on),
                "dependent_steps": sum(1 for s in steps if s.depends_on)
            }
        )

    def _save_workflow_draft(
        self,
        ticket_id: str,
        title: str,
        goal: str,
        status: str,
        ai_analysis: Dict[str, Any],
        steps: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Lưu hoặc lưu phiên bản mới của Workflow Draft vào Supabase."""
        supabase = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Kiểm tra nếu đã có draft cũ chưa execute của ticket này -> chuyển thành archived
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
            if old_wf.get("status") in ["draft", "needs_review", "ready"]:
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

        # Ghi Audit Log vào automation_workflow_history
        try:
            supabase.table("automation_workflow_history").insert({
                "workflow_id": wf_record.get("id"),
                "field_changed": "workflow_created",
                "old_val": None,
                "new_val": {"version": new_version, "steps_count": len(steps), "status": status},
                "changed_by": "ai_workflow_planner"
            }).execute()
        except Exception:
            pass

        logger.info(f"💾 Đã lưu Workflow Draft #{wf_record.get('id', 'N/A')[:8]} (v{new_version}) cho ticket #{ticket_id[:8]}!")
        return wf_record


workflow_planner_service = WorkflowPlannerService()
