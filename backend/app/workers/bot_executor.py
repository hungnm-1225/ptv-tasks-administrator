# backend/app/workers/bot_executor.py
"""
Central Bot Executor Worker (Master Enterprise Edition)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách: 
- Trạm điều phối trung tâm thực thi 19 Capabilities của hệ sinh thái Pythaverse.
- Kết nối trực tiếp với các Động Cơ Hybrid Direct API siêu tốc: Workspace Orchestrator, Moodle LMS, GitBucket, Keycloak IDP, GitHub, Google Docs.
- Tự động tải file đính kèm từ Supabase Storage và lưu vết Checkpoint 2.0.
"""
import os
import logging
import httpx
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional

from app.core.config import settings
from app.services.workspace.orchestrator_service import workspace_orchestrator_service
from app.services.keycloak_service import keycloak_service
from app.services.github_service import github_service
from app.services.playwright_service import playwright_lms_service
from app.services.git_service import git_playwright_service

logger = logging.getLogger(__name__)


async def download_file_to_temp(url: str) -> Optional[str]:
    """Tải file từ attachment_url trên Supabase Storage về file tạm cục bộ an toàn."""
    if not url or not isinstance(url, str) or not url.startswith("http"):
        return None
    try:
        suffix = ".xlsx" if "xls" in url.lower() else ".pdf" if "pdf" in url.lower() else ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            async with httpx.AsyncClient(timeout=35.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    tmp.write(res.content)
                    return tmp.name
                else:
                    logger.warning(f"Không thể tải attachment từ {url} (Status: {res.status_code})")
                    return None
    except Exception as e:
        logger.warning(f"Lỗi tải attachment file tạm: {e}")
        return None


async def execute_approved_bot_task(
    bot_type: str, 
    payload_data: Optional[Dict[str, Any]] = None,
    task_id: Optional[str] = None
) -> Dict[str, Any]:
    """Điều phối thực thi Service dựa trên loại Bot & Action (Truy vết [Task #ID] chuẩn xác)."""
    if payload_data is None or not isinstance(payload_data, dict):
        payload_data = {}

    if task_id:
        payload_data["task_id"] = task_id

    short_id = str(task_id).replace("-", "")[:8] if task_id else "N/A"
    task_tag = f"[Task #{short_id}]"
    action = payload_data.get("action", "")
    checkpoint = payload_data.get("checkpoint", {})
    
    logger.info(f"🚀 {task_tag} [BOT {bot_type}] [ACTION {action}] Bắt đầu thực thi...")
    if checkpoint:
        logger.info(f"💾 {task_tag} Nhận Checkpoint từ phiên trước: {list(checkpoint.keys())}")
    
    try:
        # =====================================================================
        # 1. NHÓM TASK WORKSPACE RPA (HỆ THỐNG PHẢ HỆ, ĐƠN HÀNG, LICENSE, ENROLL)
        # =====================================================================
        if bot_type == "workspace_rpa":
            # Tự động tải file đính kèm từ Supabase Storage nếu có
            if payload_data.get("attachment_url") and not payload_data.get("upload_file_path") and not payload_data.get("cof_file_path"):
                logger.info(f"📥 {task_tag} Đang tải file từ Supabase Storage: {payload_data['attachment_url']}...")
                downloaded_file = await download_file_to_temp(payload_data["attachment_url"])
                if downloaded_file:
                    payload_data["upload_file_path"] = downloaded_file
                    payload_data["cof_file_path"] = downloaded_file

            # 🎯 ĐIỀU HƯỚNG TRỰC TIẾP VÀO NHẠC TRƯỞNG WORKSPACE ORCHESTRATOR DIRECT API
            return await workspace_orchestrator_service.orchestrate_workspace_rpa(payload_data)

        # =====================================================================
        # 2. NHÓM TASK LMS DIRECT ENROLLER (MOODLE HYBRID WEBSERVICE)
        # =====================================================================
        elif bot_type in ["lms_playwright", "lms_git_provisioning", "lms_enroll"]:
            if action in ["unenrol_users", "unenrol_users_pipeline", "unenrol"]:
                logger.info(f"🗑️ {task_tag} Kích hoạt Moodle Unenrol Pipeline...")
                return await playwright_lms_service.unenrol_users_pipeline(payload_data)

            if action in ["modify_user_role", "change_role"]:
                logger.info(f"✏️ {task_tag} Kích hoạt Moodle Modify User Role...")
                target_ident = str(payload_data.get("email") or payload_data.get("username") or payload_data.get("identifier", ""))
                return await playwright_lms_service.modify_user_role(
                    course_id=str(payload_data.get("course_id", "")),
                    email=target_ident,
                    new_role_label=str(payload_data.get("new_role", payload_data.get("role", "Student")))
                )

            # Mặc định ghi danh (Enroll)
            logger.info(f"🎓 {task_tag} Kích hoạt Moodle Direct WebService Enroller...")
            lms_res = await playwright_lms_service.enroll_users_pipeline(payload_data)

            # Tự động đồng bộ quyền Git nếu có cấu hình
            if payload_data.get("sync_git_repos") and payload_data.get("git_sync_plan"):
                logger.info(f"🐙 {task_tag} [LMS ➔ GIT] Tự động thêm tài khoản vào Git Repos tương ứng...")
                try:
                    git_payload = {
                        "action": "add_repo_collaborators",
                        "repos_plan": payload_data["git_sync_plan"]
                    }
                    git_res = await git_playwright_service.add_collaborators_pipeline(git_payload)
                    lms_res["git_sync_result"] = git_res
                    lms_res["message"] = f"{lms_res.get('message', '')} | 🐙 Git: {git_res.get('message', '')}"
                except Exception as git_err:
                    logger.warning(f"⚠️ {task_tag} Lỗi trong bước phụ Git Sync: {git_err}")
                    lms_res["git_sync_error"] = str(git_err)

            return lms_res

        # =====================================================================
        # 3. NHÓM TASK KEYCLOAK IDENTITY BOT (DIRECT REST API PARALLEL)
        # =====================================================================
        elif bot_type == "keycloak_api":
            return await keycloak_service.execute_account_action(payload_data)

        # =====================================================================
        # 4. NHÓM TASK PYTHAVERSE GIT COLLABORATOR BOT (GITBUCKET HYBRID)
        # =====================================================================
        elif bot_type in ["git_collaborator", "git_playwright", "git_repo_collaborator"]:
            logger.info(f"🐙 {task_tag} Kích hoạt Pythaverse Git Direct Engine...")
            return await git_playwright_service.add_collaborators_pipeline(payload_data)

        # =====================================================================
        # 5. NHÓM TASK GITHUB ISSUE DISPATCHER
        # =====================================================================
        elif bot_type == "github_issue_creator":
            return await github_service.create_issue(payload_data)

        # =====================================================================
        # 6. NHÓM TASK FEEDBACK SHEET & GOOGLE DOC TRIAGE
        # =====================================================================
        elif bot_type in ["google_doc_comment", "feedback_doc_triage"]:
            from app.services.google_doc_service import GoogleDocManager
            doc_url = payload_data.get("doc_url")
            comment_content = payload_data.get("comment_content") or payload_data.get("comment", "")
            assignee_email = payload_data.get("assignee_email") or payload_data.get("assigned_email", "")

            if not doc_url:
                return {"status": "failed", "error": "Thiếu đường dẫn Google Doc (doc_url) trong payload."}

            try:
                gdoc_mgr = GoogleDocManager()
                is_ok, msg = gdoc_mgr.add_comment_and_tag(doc_url, comment_content, assignee_email)
                return {
                    "status": "success" if is_ok else "failed",
                    "message": f"Đã tag {assignee_email} vào Google Doc thành công!" if is_ok else msg,
                    "doc_url": doc_url
                }
            except Exception as e:
                logger.error(f"Lỗi thực thi Google Doc triage: {e}")
                return {"status": "failed", "error": f"Lỗi Google Doc Service: {e}"}

        # =====================================================================
        # ⚡ 7. NHÓM TASK ĐIỀU PHỐI ĐA TẦNG LIÊN HOÀN (COMPOSITE WORKFLOW)
        # =====================================================================
        elif bot_type == "composite_workflow":
            steps = payload_data.get("steps", [])
            if not steps:
                return {"status": "failed", "error": "Composite Workflow không có bước nào được cấu hình."}

            step_results = {}
            from app.core.supabase import get_supabase_client
            supabase = get_supabase_client()

            for step_idx, step in enumerate(steps, 1):
                s_name = step.get("step_name", f"step_{step_idx}")
                s_bot = step.get("bot_type")
                s_payload = step.get("payload", {})
                
                if checkpoint.get(f"{s_name}_status") == "success":
                    logger.info(f"⏩ {task_tag} [BƯỚC {step_idx}/{len(steps)}] {s_name} đã thành công ở checkpoint cũ, bỏ qua.")
                    step_results[s_name] = checkpoint.get(f"{s_name}_result", {"status": "success", "skipped": True})
                    continue

                logger.info(f"▶️ {task_tag} [BƯỚC {step_idx}/{len(steps)}] Đang thực thi: {s_name} ({s_bot})...")
                
                if task_id:
                    try:
                        supabase.table("bot_automation_tasks").update({
                            "current_step": f"Đang chạy {s_name} ({step_idx}/{len(steps)})"
                        }).eq("id", task_id).execute()
                    except Exception:
                        pass

                res = await execute_approved_bot_task(
                    bot_type=s_bot,
                    payload_data=s_payload,
                    task_id=task_id
                )

                step_results[s_name] = res
                if res.get("status") in ["failed", "error"]:
                    checkpoint[f"{s_name}_status"] = "failed"
                    return {
                        "status": "failed",
                        "error": f"Lỗi ở bước '{s_name}': {res.get('error')}",
                        "current_step": f"{s_name}_failed",
                        "step_results": step_results,
                        "checkpoint": checkpoint
                    }

                checkpoint[f"{s_name}_status"] = "success"
                checkpoint[f"{s_name}_result"] = res

            return {
                "status": "success",
                "message": f"Đã hoàn thành toàn bộ {len(steps)} bước của quy trình liên hoàn!",
                "step_results": step_results,
                "checkpoint": checkpoint
            }
        else:
            return {"status": "failed", "error": f"Loại bot '{bot_type}' chưa được hỗ trợ."}

    except Exception as e:
        logger.error(f"❌ {task_tag} Lỗi thực thi Task Bot ({bot_type}): {e}", exc_info=True)
        return {"status": "failed", "error": str(e)}