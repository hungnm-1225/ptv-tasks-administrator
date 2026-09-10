# backend/app/services/workflow_planner.py
import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.core.gemini import gemini_engine
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
    Bộ lập kế hoạch & tiền xử lý Workflow thông minh (AI Workflow Planner v2 - 2-Pass):
    - PASS 1: Đọc Business Intent, Entities & Requested Operations từ Gemini AI.
    - PASS 2: Ghép DAG động dựa trên Capability Registry, chống ảo giác hành vi unrequested.
    - Xử lý trạng thái NO_ACTION chuẩn mực cho email rác/quảng cáo.
    - Dynamic Entity Validation: Chỉ cảnh báo School cho những bước thật sự cần School.
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

    def compose_dynamic_steps(
        self,
        requested_operations: List[Dict[str, Any]],
        entities: Dict[str, Any],
        target_school_name: str,
        target_school_id: Optional[str],
        attachment_url: Optional[str]
    ) -> List[WorkflowStepDraft]:
        """
        PASS 2: Ghép DAG động từ danh sách requested_operations.
        Hỗ trợ request đa mục tiêu (Tạo User + LMS + Git) độc lập.
        """
        steps: List[WorkflowStepDraft] = []
        step_counter = 1
        account_step_id = None

        intents = [op.get("intent") for op in requested_operations]

        # 1. Nhánh Account Creation (Provisioning)
        if "create_accounts" in intents:
            # Bước 1.1: Resolve School
            s1_id = f"step_{step_counter:02d}"
            steps.append(WorkflowStepDraft(
                step_id=s1_id,
                capability_id="workspace.resolve_school",
                name="Xác định trường học & Phả hệ",
                status="ready",
                inputs={
                    "school_name": target_school_name,
                    "school_id": target_school_id
                },
                depends_on=[]
            ))
            step_counter += 1

            # Bước 1.2: Chuẩn bị file tài khoản nộp batch
            s2_id = f"step_{step_counter:02d}"
            steps.append(WorkflowStepDraft(
                step_id=s2_id,
                capability_id="cof.generate_accounts_file",
                name="Chuẩn bị danh sách tài khoản nộp batch",
                status="waiting_dependency",
                inputs={
                    "users_list": entities.get("users", []),
                    "school_name": target_school_name
                },
                depends_on=[s1_id]
            ))
            step_counter += 1

            # Bước 1.3: Nộp batch tạo tài khoản School Workspace
            s3_id = f"step_{step_counter:02d}"
            steps.append(WorkflowStepDraft(
                step_id=s3_id,
                capability_id="workspace.bulk_account_creation",
                name="Nộp batch tạo tài khoản School Workspace",
                status="waiting_dependency",
                inputs={
                    "school_identifier": target_school_name,
                    "school_id": target_school_id,
                    "upload_file_path": f"{{{{ {s2_id}.account_file_path }}}}",
                    "total_count": len(entities.get("users", [])) or 4
                },
                depends_on=[s2_id]
            ))
            step_counter += 1

            # Bước 1.4: Poll kiểm tra kết quả
            s4_id = f"step_{step_counter:02d}"
            steps.append(WorkflowStepDraft(
                step_id=s4_id,
                capability_id="workspace.poll_account_batch",
                name="Kiểm tra tiến độ & Lấy kết quả tài khoản",
                status="waiting_dependency",
                inputs={
                    "school_identifier": target_school_name,
                    "request_id": f"{{{{ {s3_id}.account_batch_request_id }}}}"
                },
                depends_on=[s3_id]
            ))
            account_step_id = s4_id
            step_counter += 1

        # 2. Nhánh Course Access (LMS Moodle PLearn)
        if "course_access" in intents:
            s_lms_id = f"step_{step_counter:02d}"
            courses = entities.get("courses", ["SWRP 4-12"])
            emails = [u.get("email") for u in entities.get("users", []) if isinstance(u, dict) and u.get("email")]
            
            lms_deps = [account_step_id] if account_step_id else []
            lms_inputs = {
                "courses": courses,
                "student_emails": f"{{{{ {account_step_id}.created_accounts }}}}" if account_step_id else emails,
                "role": "teacher" if any(u.get("role") == "teacher" for u in entities.get("users", [])) else "student"
            }
            steps.append(WorkflowStepDraft(
                step_id=s_lms_id,
                capability_id="lms.direct_enroll",
                name=f"Ghi danh khóa học Moodle PLearn ({', '.join(str(c) for c in courses)})",
                status="waiting_dependency" if lms_deps else "ready",
                inputs=lms_inputs,
                depends_on=lms_deps
            ))
            step_counter += 1

        # 3. Nhánh Repository Access (Pythaverse Git)
        if "repository_access" in intents:
            s_git_id = f"step_{step_counter:02d}"
            repos = entities.get("repositories", ["SWRP 4-12"])
            emails = [u.get("email") for u in entities.get("users", []) if isinstance(u, dict) and u.get("email")]

            git_deps = [account_step_id] if account_step_id else []
            repo_target = repos[0] if repos else "SWRP 4-12"
            git_inputs = {
                "repo_url": f"https://git.pythaverse.space/ptvswrp/{repo_target}",
                "collaborators": f"{{{{ {account_step_id}.created_accounts }}}}" if account_step_id else emails,
                "target_role": "DEVELOPER"
            }
            steps.append(WorkflowStepDraft(
                step_id=s_git_id,
                capability_id="git.add_collaborators",
                name=f"Cấp quyền cộng tác Git ({repo_target})",
                status="waiting_dependency" if git_deps else "ready",
                inputs=git_inputs,
                depends_on=git_deps
            ))
            step_counter += 1

        # 4. Nhánh Identity Admin (Chỉ chạy khi có intent explicitly reset/verify)
        if "reset_password" in intents:
            s_reset_id = f"step_{step_counter:02d}"
            emails = [u.get("email") for u in entities.get("users", []) if isinstance(u, dict) and u.get("email")]
            steps.append(WorkflowStepDraft(
                step_id=s_reset_id,
                capability_id="keycloak.reset_password",
                name="Cấp lại mật khẩu tạm Keycloak",
                status="ready",
                inputs={"target_email": emails[0] if emails else None, "temporary_password": "Ptv@2026"},
                depends_on=[]
            ))
            step_counter += 1

        if "verify_email" in intents:
            s_ver_id = f"step_{step_counter:02d}"
            emails = [u.get("email") for u in entities.get("users", []) if isinstance(u, dict) and u.get("email")]
            steps.append(WorkflowStepDraft(
                step_id=s_ver_id,
                capability_id="keycloak.verify_email",
                name="Xác thực email người dùng",
                status="ready",
                inputs={"target_email": emails[0] if emails else None},
                depends_on=[]
            ))
            step_counter += 1

        return steps

    def plan_workflow_for_ticket(self, ticket_id: str) -> Optional[Dict[str, Any]]:
        """Lập kế hoạch Workflow 2-Pass chuẩn xác."""
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            logger.warning(f"Không tìm thấy ticket #{ticket_id} để lập plan!")
            return None

        ticket = res.data[0]
        meta = ticket.get("metadata") or {}
        ai_data = meta.get("ai_analysis") or {}

        # Nếu ticket chưa có ai_analysis, gọi Gemini phân tích ngay
        if not ai_data or "workflow_outcome" not in ai_data:
            excel_summary = meta.get("excel_summary")
            attachments = ticket.get("attachments") or []
            ai_data = gemini_engine.analyze_ticket(
                subject=ticket.get("subject", ""),
                raw_content=ticket.get("raw_content", ""),
                source=ticket.get("source", "gmail"),
                excel_summary=excel_summary,
                attachments=attachments
            )
            meta["ai_analysis"] = ai_data
            meta["workflow_outcome"] = ai_data.get("workflow_outcome", "ACTIONABLE")

        workflow_outcome = ai_data.get("workflow_outcome", "ACTIONABLE")
        requested_ops = ai_data.get("requested_operations", [])
        entities = ai_data.get("entities", {})

        # =========================================================================
        # 1. TRƯỜNG HỢP EMAIL QUẢNG CÁO / THÔNG BÁO / KHÔNG CÓ HÀNH ĐỘNG (NO_ACTION)
        # =========================================================================
        if workflow_outcome == "NO_ACTION" or (not requested_ops and not meta.get("excel_summary", {}).get("is_cof")):
            logger.info(f"🛑 Ticket #{ticket_id[:8]} được xác định là NO_ACTION. Không tạo workflow!")
            ai_analysis_dict = {
                "summary": ticket.get("ai_summary") or "Email thông báo/quảng cáo, không yêu cầu can thiệp tự động.",
                "reason_summary_vi": "Hệ thống xác định đây là email bản tin, thông báo tự động hoặc tiếp thị. Không phát hiện hành động vận hành nào cần khởi chạy cỗ máy tự động hóa.",
                "overall_confidence": 0.98,
                "workflow_outcome": "NO_ACTION",
                "detected_school": None,
                "school_candidates": [],
                "detected_courses": [],
                "detected_actions": [],
                "warnings": ["Không có hành vi tự động hóa nào được kích hoạt cho email này."]
            }
            return self._save_workflow_draft(
                ticket_id=ticket_id,
                title="Không yêu cầu tự động hóa (No Automation Required)",
                goal=ticket.get("subject", "Email thông báo"),
                status="no_action",
                ai_analysis=ai_analysis_dict,
                steps=[]
            )

        # =========================================================================
        # 2. TRƯỜNG HỢP CÓ YÊU CẦU HÀNH ĐỘNG THẬT (ACTIONABLE / NEEDS_INFORMATION)
        # =========================================================================
        excel_summary = meta.get("excel_summary") or {}
        is_cof = excel_summary.get("is_cof", False)
        attachments = ticket.get("attachments") or []
        attachment_url = attachments[0].get("url") if attachments else None

        detected_school_str = entities.get("school_name") or meta.get("school_name") or excel_summary.get("school_name")
        best_school, candidates = self.resolve_school_entities(detected_school_str)

        target_school_name = best_school.name if best_school else (detected_school_str or "")
        target_school_id = best_school.id if best_school else None

        # Ghép bước động từ requested_operations
        steps = self.compose_dynamic_steps(
            requested_operations=requested_ops,
            entities=entities,
            target_school_name=target_school_name,
            target_school_id=target_school_id,
            attachment_url=attachment_url
        )

        # Nếu là file COF Onboarding truyền thống
        if is_cof and not steps:
            for r in self.workflow_rules:
                if r.get("rule_id") == "COF_FULL_ONBOARDING":
                    # Tạo step từ COF archetype
                    for tpl in r.get("step_templates", []):
                        cap_id = tpl.get("capability_id")
                        steps.append(WorkflowStepDraft(
                            step_id=tpl.get("step_id"),
                            capability_id=cap_id,
                            name=tpl.get("name"),
                            status="ready" if not tpl.get("depends_on") else "waiting_dependency",
                            inputs={"school_identifier": target_school_name, "file_url": attachment_url},
                            depends_on=tpl.get("depends_on", [])
                        ))
                    break

        # Validate DAG
        val_result = self.validate_workflow_graph(steps)

        # Kiểm tra xem có bước nào THẬT SỰ CẦN School không
        requires_school = any("school" in s.capability_id or "bulk_account" in s.capability_id for s in steps)
        school_missing = requires_school and not best_school

        if school_missing:
            val_result.warnings.append("Trường học chưa được xác định. Cần chọn trường học trước khi thực hiện các bước School Workspace.")

        workflow_status = "ready" if val_result.is_valid and not school_missing and len(steps) > 0 else "needs_review"

        ai_analysis_dict = {
            "summary": ticket.get("ai_summary"),
            "reason_summary_vi": ai_data.get("reason_summary_vi") or f"Khớp {len(steps)} bước thực thi chuẩn hóa theo các yêu cầu: {', '.join(op.get('intent', '') for op in requested_ops)}.",
            "overall_confidence": 0.94,
            "workflow_outcome": "ACTIONABLE",
            "detected_school": best_school.model_dump() if best_school else None,
            "school_candidates": [c.model_dump() for c in candidates],
            "detected_courses": entities.get("courses", []),
            "detected_actions": [s.capability_id for s in steps],
            "warnings": val_result.warnings
        }

        return self._save_workflow_draft(
            ticket_id=ticket_id,
            title=ai_data.get("goal") or f"Workflow #{ticket_id[:8]}",
            goal=ticket.get("subject"),
            status=workflow_status,
            ai_analysis=ai_analysis_dict,
            steps=[s.model_dump() for s in steps]
        )

    def validate_workflow_graph(self, steps: List[WorkflowStepDraft]) -> WorkflowValidationResult:
        """Kiểm định tính toàn vẹn của Đồ thị phụ thuộc (DAG)."""
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

        # Phát hiện chu trình (Cycle Detection qua DFS)
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

        # Kiểm tra Required Inputs
        for s in steps:
            cap_def = self.capabilities_map.get(s.capability_id)
            if not cap_def:
                continue

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
        """Lưu phiên bản mới của Workflow Draft vào Supabase."""
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
            if old_wf.get("status") in ["draft", "needs_review", "ready", "no_action"]:
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

        logger.info(f"💾 Đã lưu Workflow Draft #{wf_record.get('id', 'N/A')[:8]} (v{new_version}) cho ticket #{ticket_id[:8]}!")
        return wf_record


workflow_planner_service = WorkflowPlannerService()