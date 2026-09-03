# backend/app/workers/bot_executor.py
import os
import logging
import httpx
import tempfile
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional

from app.core.config import settings
from app.services.workspace_playwright_service import workspace_playwright_service
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.keycloak_service import keycloak_service
from app.services.github_service import github_service
from app.services.playwright_service import playwright_lms_service
from app.services.git_service import git_playwright_service

logger = logging.getLogger(__name__)


def clean_entity_str(val: Optional[str]) -> Optional[str]:
    """Lọc bỏ các chuỗi rác hoặc chuỗi gợi ý 'Tự động truy vết' về None chuẩn mực."""
    if not val or not isinstance(val, str):
        return None
    val_clean = val.strip()
    if val_clean in ["Tự động truy vết", "Tự động truy vết theo Order", "None", "null", "undefined", ""]:
        return None
    return val_clean


async def download_file_to_temp(url: str) -> Optional[str]:
    """Tải file từ attachment_url trên Supabase Storage về file tạm cục bộ an toàn."""
    if not url or not isinstance(url, str) or not url.startswith("http"):
        return None
    try:
        suffix = ".xlsx" if "xls" in url.lower() else ".pdf" if "pdf" in url.lower() else ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            async with httpx.AsyncClient(timeout=30.0) as client:
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

    # Gắn task_id vào payload_data để các service con tái sử dụng
    if task_id:
        payload_data["task_id"] = task_id

    task_tag = f"[Task #{str(task_id).replace('-', '')[:8]}]" if task_id else "[Task #N/A]"
    action = payload_data.get("action", "")
    checkpoint = payload_data.get("checkpoint", {})
    
    logger.info(f"🚀 {task_tag} Bắt đầu thực thi Bot: [{bot_type}] | Action: {action}")
    if checkpoint:
        logger.info(f"💾 {task_tag} Nhận Checkpoint từ phiên trước: {list(checkpoint.keys())}")
    
    try:
        # =====================================================================
        # 1. NHÓM TASK WORKSPACE RPA (HỆ THỐNG PHẢ HỆ & PHÂN PHỐI LICENSE)
        # =====================================================================
        if bot_type == "workspace_rpa":
            if action == "direct_moodle_lms_enroll":
                logger.info(f"🎓 {task_tag} Điều hướng sang Playwright LMS Direct Enroller...")
                return await playwright_lms_service.enroll_users_pipeline(payload_data)

            if action in ["git_add_collaborators", "add_repo_collaborators"]:
                logger.info(f"🐙 {task_tag} Điều hướng sang Git Playwright Collaborator Service...")
                return await git_playwright_service.add_collaborators_pipeline(payload_data)

            # Bóc tách và làm sạch thông tin phả hệ
            hierarchy = payload_data.get("hierarchy") or {}
            school_name = clean_entity_str(
                payload_data.get("school_name") 
                or hierarchy.get("school_name") 
                or payload_data.get("school_id")
                or hierarchy.get("school_code")
            )
            
            partner_name = clean_entity_str(payload_data.get("partner_name") or payload_data.get("partner_code"))
            distributor_name = clean_entity_str(payload_data.get("distributor_name") or payload_data.get("distributor_code"))
            contract_code = clean_entity_str(payload_data.get("contract_code") or payload_data.get("contract_id"))
            order_code = clean_entity_str(payload_data.get("order_code") or payload_data.get("order_id"))

            school_creds = payload_data.get("school_credentials")
            partner_creds = payload_data.get("partner_credentials")
            distributor_creds = payload_data.get("distributor_credentials")
            
            admin_pass = getattr(settings, "TEST_ADMIN_PASS", None)
            if not admin_pass:
                logger.warning(f"⚠️ {task_tag} TEST_ADMIN_PASS chưa được cấu hình trong Render Environment Variables!")
                
            admin_creds = payload_data.get("admin_credentials") or {
                "username": getattr(settings, "TEST_ADMIN_USER", "salesadmin@dtt.vn"),
                "password": admin_pass or ""
            }

            # 🟢 AUTO-RESOLVER PHẢ HỆ:
            if (distributor_name or payload_data.get("distributor_code")) and not distributor_creds:
                target_dist_id = payload_data.get("distributor_code") or distributor_name
                d_lin = workspace_lineage_service.resolve_by_distributor(str(target_dist_id))
                if d_lin:
                    distributor_creds = d_lin.get("distributor")

            if (partner_name or payload_data.get("partner_code")) and (not partner_creds or not distributor_creds):
                target_part_id = payload_data.get("partner_code") or partner_name
                p_lin = workspace_lineage_service.resolve_by_partner(str(target_part_id))
                if p_lin:
                    partner_creds = partner_creds or p_lin.get("partner")
                    distributor_creds = distributor_creds or p_lin.get("distributor")

            if school_name and (not school_creds or not partner_creds or not distributor_creds):
                s_lin = workspace_lineage_service.resolve_by_school(school_name)
                if s_lin:
                    school_creds = school_creds or s_lin.get("school")
                    partner_creds = partner_creds or s_lin.get("partner")
                    distributor_creds = distributor_creds or s_lin.get("distributor")

            if contract_code and (not distributor_creds or not partner_creds):
                c_lin = workspace_lineage_service.resolve_by_contract(contract_code)
                if c_lin:
                    distributor_creds = distributor_creds or c_lin.get("distributor")
                    partner_creds = partner_creds or c_lin.get("partner")

            if not distributor_creds and ("distributor" in action or "partner_contract" in action or "admin_approve" in action):
                c_lin = workspace_lineage_service.resolve_by_contract(contract_code or "PRT")
                if c_lin and c_lin.get("distributor"):
                    distributor_creds = c_lin.get("distributor")

            courses_list = payload_data.get("courses") or []
            order_details = payload_data.get("order_details") or {
                "contact_info": payload_data.get("contact_info", "Admin Automation Hub (operation@pythaverse.space)"),
                "courses": courses_list,
                "additional_notes": payload_data.get("additional_notes", "")
            }

            # --- A. TOÀN TRÌNH PHẢ HỆ 4 CẤP (Master E2E Pipeline) ---
            if action in [
                "pipeline_end_to_end",
                "create_order_and_contracts",
                "full_lineage_pipeline", 
                "full_license_chain", 
                "distribute_license",
                "end_to_end_pipeline"
            ] or "pipeline" in str(action) or "end_to_end" in str(action):
                cof_path = payload_data.get("upload_file_path")
                if not cof_path and payload_data.get("attachment_url"):
                    cof_path = await download_file_to_temp(payload_data["attachment_url"])

                return await workspace_playwright_service.execute_full_license_hierarchy_chain(
                    school_identifier=str(school_name or "000 SCHOOL FOR TESTING PURPOSE"),
                    order_details=order_details,
                    sales_admin_creds=admin_creds,
                    cof_file_path=cof_path,
                    checkpoint=checkpoint
                )

            # --- B. SUB-FLOW: DUYỆT ĐƠN LẺ SCHOOL ORDER CÓ SẴN ---
            elif action in ["approve_school_order_standalone", "approve_existing_school_order", "subflow_approve_school_order"]:
                target_order = order_code or checkpoint.get("order_code") or "SCH-ORDER"
                if not target_order:
                    return {"status": "failed", "error": "Thiếu mã Order (order_code) cần phê duyệt.", "checkpoint": checkpoint}
                if not partner_creds:
                    return {"status": "failed", "error": "Không tìm thấy thông tin đăng nhập của Partner.", "checkpoint": checkpoint}

                return await workspace_playwright_service.execute_approve_school_order_standalone(
                    order_identifier=str(target_order),
                    partner_creds=partner_creds,
                    distributor_creds=distributor_creds or {},
                    sales_admin_creds=admin_creds,
                    courses_needed=courses_list,
                    checkpoint=checkpoint
                )

            # --- C. SUB-FLOW: DUYỆT ĐƠN LẺ PARTNER CONTRACT CÓ SẴN (PRT-...) ---
            elif action in ["approve_partner_contract_standalone", "subflow_approve_partner_contract", "approve_existing_partner_contract"]:
                target_contract = contract_code or checkpoint.get("prt_contract_code")
                if not target_contract:
                    return {"status": "failed", "error": "Thiếu mã Contract (contract_code) cần duyệt.", "checkpoint": checkpoint}
                if not distributor_creds:
                    return {"status": "failed", "error": "Không tìm thấy thông tin đăng nhập của Distributor.", "checkpoint": checkpoint}

                return await workspace_playwright_service.execute_approve_partner_contract_standalone(
                    contract_identifier=str(target_contract),
                    distributor_creds=distributor_creds,
                    sales_admin_creds=admin_creds,
                    courses_needed=courses_list,
                    checkpoint=checkpoint
                )

            # --- D. Tạo & Duyệt Chuỗi Đối Tác (Partner -> Distributor) ---
            elif action == "partner_create_and_approve_chain":
                if not partner_creds or not distributor_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập của Partner hoặc Distributor."}
                return await workspace_playwright_service.execute_partner_create_and_approve_chain(
                    partner_creds=partner_creds,
                    distributor_creds=distributor_creds,
                    sales_admin_creds=admin_creds,
                    contract_data=payload_data.get("contract_data", payload_data)
                )

            # --- E. Tạo & Duyệt Chuỗi Nhà Phân Phối (Distributor -> Sales Admin) ---
            elif action == "distributor_create_and_approve_chain":
                if not distributor_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập của Distributor."}
                return await workspace_playwright_service.execute_distributor_create_and_approve_chain(
                    distributor_creds=distributor_creds,
                    sales_admin_creds=admin_creds,
                    contract_data=payload_data.get("contract_data", payload_data)
                )

            # --- F. School Tạo Order ---
            elif action == "school_create_order":
                if not school_creds:
                    return {"status": "failed", "error": f"Không tìm thấy tài khoản trường '{school_name}' trong Két Sắt"}
                return await workspace_playwright_service.school_create_order(
                    credentials=school_creds,
                    order_data=order_details
                )

            # --- G. Partner Duyệt Order ---
            elif action == "partner_approve_order":
                if not partner_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Partner"}
                return await workspace_playwright_service.partner_approve_school_order(
                    credentials=partner_creds,
                    order_identifier=order_code
                )

            # --- H. Partner Tạo Contract gửi Distributor ---
            elif action == "partner_create_contract":
                if not partner_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Partner"}
                return await workspace_playwright_service.partner_create_contract(
                    credentials=partner_creds,
                    contract_data=payload_data
                )

            # --- I. Distributor Duyệt Contract của Partner ---
            elif action == "distributor_approve_contract":
                if not distributor_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Distributor"}
                return await workspace_playwright_service.distributor_approve_partner_contract(
                    credentials=distributor_creds,
                    contract_identifier=contract_code
                )

            # --- J. Distributor Tạo Contract gửi Sales Admin ---
            elif action == "distributor_create_contract":
                if not distributor_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Distributor"}
                return await workspace_playwright_service.distributor_create_contract(
                    credentials=distributor_creds,
                    contract_data=payload_data
                )

            # --- K. Sales Admin Duyệt Contract Tối Cao ---
            elif action in ["admin_approve_contract", "sales_admin_approve_contract"]:
                return await workspace_playwright_service.admin_approve_distributor_contract(
                    credentials=admin_creds,
                    contract_identifier=contract_code,
                    justification=payload_data.get("justification")
                )

            # --- L. Tạo tài khoản hàng loạt (Công thức 15s/Tài khoản) ---
            elif action == "bulk_account_creation":
                from app.services.cof_excel_service import COFExcelService

                file_path = payload_data.get("upload_file_path")
                if not file_path and payload_data.get("attachment_url"):
                    logger.info(f"📥 {task_tag} Đang tải file tài khoản về từ Supabase Storage...")
                    file_path = await download_file_to_temp(payload_data["attachment_url"])

                if not file_path:
                    return {"status": "failed", "error": "Thiếu file Excel (.xlsx) hoặc attachment_url hợp lệ."}

                if not school_creds:
                    return {"status": "failed", "error": f"Không tìm thấy tài khoản trường '{school_name}' trong Két Sắt."}

                temp_dir = "/tmp/ptv_accounts"
                os.makedirs(temp_dir, exist_ok=True)
                ready_file, student_c, teacher_c, total_c, is_cof, parsed_data = COFExcelService.detect_and_process_excel(file_path, temp_dir)

                logger.info(f"📊 {task_tag} Thống kê: {student_c} học sinh, {teacher_c} giáo viên (Tổng: {total_c}) | Là COF: {is_cof}")

                submit_res = await workspace_playwright_service.submit_account_creation_batch(
                    credentials=school_creds,
                    upload_file_path=ready_file,
                    record_count=total_c,
                    checkpoint=checkpoint
                )

                if submit_res.get("status") == "failed":
                    return submit_res

                if submit_res.get("status") in ["completed", "success"]:
                    return submit_res

                req_id = submit_res.get("request_id")
                checkpoint["account_batch_request_id"] = req_id
                wait_seconds = max(total_c * 15, 30)
                next_check_time = datetime.now(timezone.utc) + timedelta(seconds=wait_seconds)
                next_check_iso = next_check_time.isoformat()

                return {
                    "status": "waiting_poll",
                    "request_id": req_id,
                    "student_count": student_c,
                    "teacher_count": teacher_c,
                    "total_count": total_c,
                    "is_cof_file": is_cof,
                    "cof_file_path": file_path if is_cof else None,
                    "wait_seconds": wait_seconds,
                    "next_check_at": next_check_iso,
                    "checkpoint": checkpoint,
                    "message": f"Đã nộp thành công file batch ({total_c} tài khoản) với Mã Request #{req_id}. Hệ thống nghỉ {wait_seconds}s (15s/TK) và sẽ tự động quay lại kiểm tra kết quả."
                }

            # --- M. Kiểm tra tiến độ & tải kết quả (Pha 2) ---
            elif action == "check_account_batch":
                return await workspace_playwright_service.check_and_export_batch_result(
                    credentials=school_creds or {},
                    request_id=payload_data.get("request_id", ""),
                    download_dir=payload_data.get("download_dir", "/tmp/results")
                )

            # --- N. School Ghi danh học viên & Group (Chính ngạch Workspace) ---
            elif action == "school_enroll_users":
                return await workspace_playwright_service.school_enroll_users_and_groups(
                    credentials=school_creds or {},
                    course_name=payload_data.get("course_name", ""),
                    start_date=payload_data.get("start_date", ""),
                    end_date=payload_data.get("end_date", ""),
                    school_name=str(school_name or ""),
                    group_name_raw=payload_data.get("group_name_raw", "Class"),
                    student_emails=payload_data.get("student_emails", []),
                    teacher_emails=payload_data.get("teacher_emails", [])
                )

            else:
                return {"status": "failed", "error": f"Action '{action}' chưa được định nghĩa trong Workspace RPA."}

        # =====================================================================
        # 2. NHÓM TASK LMS PLAYWRIGHT DIRECT (TIỂU NGẠCH / MOODLE DIRECT ENROLLER)
        # =====================================================================
        elif bot_type in ["lms_playwright", "lms_git_provisioning", "lms_enroll"]:
            logger.info(f"🎓 {task_tag} Kích hoạt Playwright LMS Direct Enroller...")
            return await playwright_lms_service.enroll_users_pipeline(payload_data)

        # =====================================================================
        # 3. NHÓM TASK KEYCLOAK IDENTITY BOT
        # =====================================================================
        elif bot_type == "keycloak_api":
            return await keycloak_service.execute_account_action(payload_data)

        # =====================================================================
        # 4. NHÓM TASK GITHUB DISPATCHER
        # =====================================================================
        elif bot_type == "github_issue_creator":
            return await github_service.create_issue(payload_data)

        # =====================================================================
        # 5. NHÓM TASK FEEDBACK SHEET & GOOGLE DOC TRIAGE
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
                if is_ok:
                    return {
                        "status": "success",
                        "message": f"Đã tag {assignee_email} vào Google Doc thành công!",
                        "doc_url": doc_url
                    }
                else:
                    return {"status": "failed", "error": msg, "doc_url": doc_url}
            except Exception as e:
                logger.error(f"Lỗi thực thi Google Doc triage: {e}")
                return {"status": "failed", "error": f"Lỗi Google Doc Service: {e}"}

        # =====================================================================
        # 6. NHÓM TASK PYTHAVERSE GIT COLLABORATOR BOT (GITBUCKET ENGINE)
        # =====================================================================
        elif bot_type in ["git_collaborator", "git_playwright", "git_repo_collaborator"]:
            logger.info(f"🐙 {task_tag} Kích hoạt Git Playwright Collaborator Pipeline...")
            return await git_playwright_service.add_collaborators_pipeline(payload_data)

        else:
            return {"status": "failed", "error": f"Loại bot '{bot_type}' chưa được hỗ trợ."}

    except Exception as e:
        logger.error(f"❌ {task_tag} Lỗi thực thi Task Bot ({bot_type}): {e}", exc_info=True)
        return {"status": "failed", "error": str(e)}