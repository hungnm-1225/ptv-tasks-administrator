# backend/app/workers/bot_executor.py
import os
import logging
import httpx
import tempfile
from typing import Dict, Any

from app.core.config import settings
from app.services.workspace_playwright_service import workspace_playwright_service
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.keycloak_service import keycloak_service
from app.services.github_service import github_service

logger = logging.getLogger(__name__)

async def download_file_to_temp(url: str) -> str:
    """Tải file từ attachment_url trên Supabase Storage về file tạm cục bộ."""
    suffix = ".xlsx" if "xls" in url else ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                tmp.write(res.content)
                return tmp.name
            else:
                raise ValueError(f"Không thể tải attachment từ {url} (Status: {res.status_code})")

async def execute_approved_bot_task(bot_type: str, payload_data: dict) -> dict:
    """Điều phối thực thi chính xác Service dựa trên loại Bot và Action."""
    logger.info(f"🚀 Bắt đầu thực thi Task Bot: {bot_type} | Payload: {payload_data}")
    
    try:
        # =====================================================================
        # 1. NHÓM TASK WORKSPACE RPA (HỆ THỐNG PHẢ HỆ 4 CẤP)
        # =====================================================================
        if bot_type == "workspace_rpa":
            action = payload_data.get("action", "full_lineage_pipeline")
            school_name = payload_data.get("school_name") or payload_data.get("school_id")
            
            # Tự động truy vết & giải mã thông tin phả hệ nếu chưa có
            school_creds = payload_data.get("school_credentials")
            partner_creds = payload_data.get("partner_credentials")
            distributor_creds = payload_data.get("distributor_credentials")
            admin_creds = payload_data.get("admin_credentials") or {
                "username": settings.TEST_ADMIN_USER,
                "password": settings.TEST_ADMIN_PASS
            }

            if school_name and not school_creds:
                lineage = workspace_lineage_service.resolve_by_school(school_name)
                if lineage:
                    school_creds = lineage["school"]
                    partner_creds = lineage["partner"]
                    distributor_creds = lineage["distributor"]

            # Chuẩn hóa dữ liệu order_details
            order_details = payload_data.get("order_details") or {
                "contact_info": payload_data.get("contact_info", "Admin Automation Hub (operation@pythaverse.space)"),
                "courses": payload_data.get("courses", []),
                "additional_notes": payload_data.get("additional_notes", "")
            }

            # A. TOÀN TRÌNH PHẢ HỆ 4 CẤP (Master Pipeline)
            if action in ["full_lineage_pipeline", "full_license_chain", "distribute_license"]:
                cof_path = payload_data.get("upload_file_path")
                if not cof_path and payload_data.get("attachment_url"):
                    cof_path = await download_file_to_temp(payload_data["attachment_url"])

                return await workspace_playwright_service.execute_full_license_hierarchy_chain(
                    school_identifier=school_name or "School Test",
                    order_details=order_details,
                    sales_admin_creds=admin_creds,
                    cof_file_path=cof_path
                )

            # B. School Tạo Order
            elif action == "school_create_order":
                if not school_creds:
                    return {"status": "failed", "error": f"Không tìm thấy tài khoản trường '{school_name}'"}
                return await workspace_playwright_service.school_create_order(
                    credentials=school_creds,
                    order_data=order_details
                )

            # C. Partner Duyệt Order
            elif action == "partner_approve_order":
                if not partner_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Partner"}
                return await workspace_playwright_service.partner_approve_school_order(
                    credentials=partner_creds,
                    order_identifier=payload_data.get("order_code") or payload_data.get("order_id")
                )

            # D. Partner Tạo Contract gửi Distributor
            elif action == "partner_create_contract":
                if not partner_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Partner"}
                return await workspace_playwright_service.partner_create_contract(
                    credentials=partner_creds,
                    contract_data=payload_data
                )

            # E. Distributor Duyệt Contract của Partner
            elif action == "distributor_approve_contract":
                if not distributor_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Distributor"}
                return await workspace_playwright_service.distributor_approve_partner_contract(
                    credentials=distributor_creds,
                    contract_identifier=payload_data.get("contract_code") or payload_data.get("contract_id")
                )

            # F. Distributor Tạo Contract gửi Sales Admin
            elif action == "distributor_create_contract":
                if not distributor_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Distributor"}
                return await workspace_playwright_service.distributor_create_contract(
                    credentials=distributor_creds,
                    contract_data=payload_data
                )

            # G. Sales Admin Duyệt Contract Tối Cao
            elif action == "admin_approve_contract":
                return await workspace_playwright_service.admin_approve_distributor_contract(
                    credentials=admin_creds,
                    contract_identifier=payload_data.get("contract_code") or payload_data.get("contract_id"),
                    justification=payload_data.get("justification")
                )

            # H. Tạo tài khoản hàng loạt (Pha 1)
            elif action == "bulk_account_creation":
                file_path = payload_data.get("upload_file_path")
                if not file_path and payload_data.get("attachment_url"):
                    logger.info("📥 Đang tải attachment file về làm file nộp batch...")
                    file_path = await download_file_to_temp(payload_data["attachment_url"])

                if not file_path:
                    return {"status": "failed", "error": "Thiếu file accounts.xlsx hoặc attachment_url"}

                if not school_creds:
                    return {"status": "failed", "error": f"Không tìm thấy tài khoản trường '{school_name}'"}

                return await workspace_playwright_service.submit_account_creation_batch(
                    credentials=school_creds,
                    upload_file_path=file_path,
                    record_count=payload_data.get("record_count", 1)
                )

            # I. Kiểm tra tiến độ & tải file kết quả (Pha 2)
            elif action == "check_account_batch":
                return await workspace_playwright_service.check_and_export_batch_result(
                    credentials=school_creds,
                    request_id=payload_data["request_id"],
                    download_dir=payload_data.get("download_dir", "/tmp/results")
                )

            # J. School Ghi danh học viên & Group lớp
            elif action == "school_enroll_users":
                return await workspace_playwright_service.school_enroll_users_and_groups(
                    credentials=school_creds,
                    course_name=payload_data["course_name"],
                    start_date=payload_data["start_date"],
                    end_date=payload_data["end_date"],
                    school_name=school_name,
                    group_name_raw=payload_data.get("group_name_raw", "Class"),
                    student_emails=payload_data.get("student_emails", []),
                    teacher_emails=payload_data.get("teacher_emails", [])
                )

            else:
                return {"status": "failed", "error": f"Action '{action}' chưa được định nghĩa trong Workspace RPA."}

        # =====================================================================
        # 2. NHÓM TASK KEYCLOAK IDENTITY BOT
        # =====================================================================
        elif bot_type == "keycloak_api":
            return await keycloak_service.execute_account_action(payload_data)

        # =====================================================================
        # 3. NHÓM TASK GITHUB DISPATCHER
        # =====================================================================
        elif bot_type == "github_issue_creator":
            if not payload_data.get("title"):
                payload_data["title"] = payload_data.get("subject") or f"[AUTO-BUG] Sự cố Ticket #{str(payload_data.get('ticket_id', ''))[:8]}"
            return await github_service.create_issue(payload_data)

        else:
            return {"status": "failed", "error": f"Loại bot '{bot_type}' chưa được hỗ trợ."}

    except Exception as e:
        logger.error(f"❌ Lỗi thực thi Task Bot ({bot_type}): {e}", exc_info=True)
        return {"status": "failed", "error": str(e)}