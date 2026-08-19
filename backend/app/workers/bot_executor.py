# backend/app/workers/bot_executor.py
import logging
from app.services.workspace_playwright_service import workspace_playwright_service
from app.services.keycloak_service import keycloak_service
from app.services.github_service import github_service

logger = logging.getLogger(__name__)

async def execute_approved_bot_task(bot_type: str, payload_data: dict) -> dict:
    """Điều phối thực thi chính xác Service dựa trên loại Bot và Action."""
    logger.info(f"🚀 Bắt đầu thực thi Task Bot: {bot_type} | Payload: {payload_data}")
    
    try:
        # 1. NHÓM TASK WORKSPACE RPA
        if bot_type == "workspace_rpa":
            action = payload_data.get("action")
            
            # A. Nộp file tạo tài khoản (Pha 1)
            if action == "bulk_account_creation":
                return await workspace_playwright_service.submit_account_creation_batch(
                    credentials=payload_data["school_credentials"],
                    upload_file_path=payload_data["upload_file_path"],
                    record_count=payload_data.get("record_count", 1)
                )

            # B. Kiểm tra tiến độ và tải kết quả (Pha 2)
            elif action == "check_account_batch":
                return await workspace_playwright_service.check_and_export_batch_result(
                    credentials=payload_data["school_credentials"],
                    request_id=payload_data["request_id"],
                    download_dir=payload_data.get("download_dir", "/tmp/results")
                )

            # C. School tạo Order
            elif action == "school_create_order":
                return await workspace_playwright_service.school_create_order(
                    credentials=payload_data["school_credentials"],
                    order_data=payload_data["order_details"]
                )

            # D. Partner duyệt Order
            elif action == "partner_approve_order":
                return await workspace_playwright_service.partner_approve_school_order(
                    credentials=payload_data["partner_credentials"],
                    order_id=payload_data.get("order_id")
                )

            # E. Sales Admin duyệt Contract
            elif action == "admin_approve_contract":
                return await workspace_playwright_service.admin_approve_distributor_contract(
                    credentials=payload_data["admin_credentials"],
                    contract_code=payload_data.get("contract_code"),
                    justification=payload_data.get("justification", "Approved by Central Automation Hub")
                )

            # F. School Ghi danh học viên & Group lớp
            elif action == "school_enroll_users":
                return await workspace_playwright_service.school_enroll_users_and_groups(
                    credentials=payload_data["school_credentials"],
                    course_name=payload_data["course_name"],
                    start_date=payload_data["start_date"],
                    end_date=payload_data["end_date"],
                    school_name=payload_data["school_name"],
                    group_name_raw=payload_data["group_name_raw"],
                    student_emails=payload_data.get("student_emails", []),
                    teacher_emails=payload_data.get("teacher_emails", [])
                )

        # 2. NHÓM TASK KEYCLOAK IDENTITY
        elif bot_type == "keycloak_api":
            return await keycloak_service.execute_account_action(payload_data)

        # 3. NHÓM TASK GITHUB DISPATCHER
        elif bot_type == "github_issue_creator":
            return await github_service.create_issue(payload_data)

        else:
            return {"status": "failed", "error": f"Loại bot '{bot_type}' chưa được hỗ trợ."}

    except Exception as e:
        logger.error(f"❌ Lỗi thực thi Task Bot ({bot_type}): {e}")
        return {"status": "failed", "error": str(e)}