# backend/app/workers/bot_executor.py
import os
import logging
import httpx
import tempfile
import asyncio
from typing import Dict, Any, Optional

from app.core.config import settings
from app.services.workspace_playwright_service import workspace_playwright_service
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.keycloak_service import keycloak_service
from app.services.github_service import github_service
from app.services.playwright_service import playwright_lms_service

logger = logging.getLogger(__name__)


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


async def execute_approved_bot_task(bot_type: str, payload_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Điều phối thực thi chính xác Service dựa trên loại Bot và Action (Safe-by-Default)."""
    if payload_data is None or not isinstance(payload_data, dict):
        payload_data = {}

    action = payload_data.get("action", "")
    logger.info(f"🚀 Bắt đầu thực thi Task Bot: [{bot_type}] | Action: {action}")
    
    try:
        # =====================================================================
        # 1. NHÓM TASK WORKSPACE RPA (HỆ THỐNG PHẢ HỆ & PHÂN PHỐI LICENSE)
        # =====================================================================
        if bot_type == "workspace_rpa":
            # Bẫy trường hợp task sinh từ Tab 4 nhưng bot_type vẫn là workspace_rpa
            if action == "direct_moodle_lms_enroll":
                logger.info("🎓 Điều hướng sang Playwright LMS Direct Enroller...")
                return await playwright_lms_service.enroll_users_pipeline(payload_data)

            # Bóc tách thông tin phả hệ
            hierarchy = payload_data.get("hierarchy") or {}
            school_name = (
                payload_data.get("school_name") 
                or hierarchy.get("school_name") 
                or payload_data.get("school_id")
                or hierarchy.get("school_code")
            )
            
            school_creds = payload_data.get("school_credentials")
            partner_creds = payload_data.get("partner_credentials")
            distributor_creds = payload_data.get("distributor_credentials")
            admin_creds = payload_data.get("admin_credentials") or {
                "username": getattr(settings, "TEST_ADMIN_USER", "salesadmin@dtt.vn"),
                "password": getattr(settings, "TEST_ADMIN_PASS", "Pythaverse@2026")
            }

            # Tự động suy vết phả hệ thông minh theo bất kỳ cấp nào (School -> Partner -> Distributor)
            partner_name = payload_data.get("partner_name") or payload_data.get("partner_code")
            distributor_name = payload_data.get("distributor_name") or payload_data.get("distributor_code")

            # 1. Nếu có Distributor
            if distributor_name and not distributor_creds:
                d_lin = workspace_lineage_service.resolve_by_distributor(str(distributor_name))
                if d_lin:
                    distributor_creds = d_lin.get("distributor")

            # 2. Nếu có Partner
            if partner_name and (not partner_creds or not distributor_creds):
                p_lin = workspace_lineage_service.resolve_by_partner(str(partner_name))
                if p_lin:
                    partner_creds = partner_creds or p_lin.get("partner")
                    distributor_creds = distributor_creds or p_lin.get("distributor")

            # 3. Nếu có School
            if school_name and (not school_creds or not partner_creds or not distributor_creds):
                s_lin = workspace_lineage_service.resolve_by_school(str(school_name))
                if s_lin:
                    school_creds = school_creds or s_lin.get("school")
                    partner_creds = partner_creds or s_lin.get("partner")
                    distributor_creds = distributor_creds or s_lin.get("distributor")

            # Chuẩn hóa dữ liệu order / courses
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
                    cof_file_path=cof_path
                )

            # --- B. SUB-FLOW: DUYỆT ĐƠN LẺ SCHOOL ORDER CÓ SẴN ---
            elif action in ["approve_school_order_standalone", "approve_existing_school_order", "subflow_approve_school_order"]:
                order_code = payload_data.get("order_code") or payload_data.get("order_id")
                if not order_code:
                    return {"status": "failed", "error": "Thiếu mã Order (order_code) cần phê duyệt."}
                if not partner_creds:
                    return {"status": "failed", "error": "Không tìm thấy thông tin đăng nhập của Partner."}

                return await workspace_playwright_service.execute_approve_school_order_standalone(
                    order_identifier=str(order_code),
                    partner_creds=partner_creds,
                    distributor_creds=distributor_creds or {},
                    sales_admin_creds=admin_creds,
                    courses_needed=courses_list
                )

            # --- C. SUB-FLOW: DUYỆT ĐƠN LẺ PARTNER CONTRACT CÓ SẴN (PRT-...) ---
            elif action in ["approve_partner_contract_standalone", "subflow_approve_partner_contract", "approve_existing_partner_contract"]:
                contract_code = payload_data.get("contract_code") or payload_data.get("contract_id")
                if not contract_code:
                    return {"status": "failed", "error": "Thiếu mã Contract (contract_code) cần duyệt."}
                if not distributor_creds:
                    return {"status": "failed", "error": "Không tìm thấy thông tin đăng nhập của Distributor."}

                return await workspace_playwright_service.execute_approve_partner_contract_standalone(
                    contract_identifier=str(contract_code),
                    distributor_creds=distributor_creds,
                    sales_admin_creds=admin_creds,
                    courses_needed=courses_list
                )

            # --- D. School Tạo Order ---
            elif action == "school_create_order":
                if not school_creds:
                    return {"status": "failed", "error": f"Không tìm thấy tài khoản trường '{school_name}' trong Két Sắt"}
                return await workspace_playwright_service.school_create_order(
                    credentials=school_creds,
                    order_data=order_details
                )

            # --- E. Partner Duyệt Order ---
            elif action == "partner_approve_order":
                if not partner_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Partner"}
                return await workspace_playwright_service.partner_approve_school_order(
                    credentials=partner_creds,
                    order_identifier=payload_data.get("order_code") or payload_data.get("order_id")
                )

            # --- F. Partner Tạo Contract gửi Distributor ---
            elif action == "partner_create_contract":
                if not partner_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Partner"}
                return await workspace_playwright_service.partner_create_contract(
                    credentials=partner_creds,
                    contract_data=payload_data
                )

            # --- G. Distributor Duyệt Contract của Partner ---
            elif action == "distributor_approve_contract":
                if not distributor_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Distributor"}
                return await workspace_playwright_service.distributor_approve_partner_contract(
                    credentials=distributor_creds,
                    contract_identifier=payload_data.get("contract_code") or payload_data.get("contract_id")
                )

            # --- H. Distributor Tạo Contract gửi Sales Admin ---
            elif action == "distributor_create_contract":
                if not distributor_creds:
                    return {"status": "failed", "error": "Thiếu thông tin đăng nhập Distributor"}
                return await workspace_playwright_service.distributor_create_contract(
                    credentials=distributor_creds,
                    contract_data=payload_data
                )

            # --- I. Sales Admin Duyệt Contract Tối Cao ---
            elif action in ["admin_approve_contract", "sales_admin_approve_contract"]:
                return await workspace_playwright_service.admin_approve_distributor_contract(
                    credentials=admin_creds,
                    contract_identifier=payload_data.get("contract_code") or payload_data.get("contract_id"),
                    justification=payload_data.get("justification")
                )

            # --- J. Tạo tài khoản hàng loạt (Hỗ trợ COF & Accounts 7 cột + Fast-Path) ---
            elif action == "bulk_account_creation":
                from app.services.cof_excel_service import COFExcelService
                from app.core.supabase import get_supabase_client

                file_path = payload_data.get("upload_file_path")
                if not file_path and payload_data.get("attachment_url"):
                    logger.info("📥 Đang tải file tài khoản về từ Supabase Storage...")
                    file_path = await download_file_to_temp(payload_data["attachment_url"])

                if not file_path:
                    return {"status": "failed", "error": "Thiếu file Excel (.xlsx) hoặc attachment_url hợp lệ."}

                if not school_creds:
                    return {"status": "failed", "error": f"Không tìm thấy tài khoản trường '{school_name}' trong Két Sắt."}

                # 1. Tự động nhận diện & bóc tách file
                temp_dir = "/tmp/ptv_accounts"
                os.makedirs(temp_dir, exist_ok=True)
                ready_file, student_c, teacher_c, total_c, is_cof, parsed_data = COFExcelService.detect_and_process_excel(file_path, temp_dir)

                logger.info(f"📊 Thống kê: {student_c} học sinh, {teacher_c} giáo viên (Tổng: {total_c}) | Là COF: {is_cof}")

                # 2. Nộp batch lên School Workspace (Kèm Fast-Path check)
                submit_res = await workspace_playwright_service.submit_account_creation_batch(
                    credentials=school_creds,
                    upload_file_path=ready_file,
                    record_count=total_c
                )

                if submit_res.get("status") == "failed":
                    return submit_res

                req_id = submit_res.get("request_id")
                payload_data["request_id"] = req_id
                payload_data["student_count"] = student_c
                payload_data["teacher_count"] = teacher_c
                payload_data["total_count"] = total_c
                payload_data["is_cof_file"] = is_cof
                payload_data["cof_file_path"] = file_path if is_cof else None

                # 3. Nếu Fast-Path xong ngay lập tức
                if submit_res.get("fast_path") and submit_res.get("result_file_path"):
                    result_local_path = submit_res["result_file_path"]
                    
                    # Nếu là file COF -> ghi kết quả ngược vào COF
                    if is_cof:
                        out_cof = os.path.join(temp_dir, f"COMPLETED_{os.path.basename(file_path)}")
                        COFExcelService.write_results_back_to_cof(
                            original_cof_path=file_path,
                            result_excel_path=result_local_path,
                            students_all=parsed_data.get("students_all", []),
                            students_to_create=parsed_data.get("students_to_create", []),
                            teachers_all=parsed_data.get("teachers_all", []),
                            teachers_to_create=parsed_data.get("teachers_to_create", []),
                            output_cof_path=out_cof
                        )
                        final_upload_file = out_cof
                    else:
                        final_upload_file = result_local_path

                    # Tải file kết quả lên Supabase Storage
                    supabase = get_supabase_client()
                    dest_name = f"results/RESULT_{req_id}_{os.path.basename(final_upload_file)}"
                    with open(final_upload_file, "rb") as f_res:
                        supabase.storage.from_("ticket-attachments").upload(
                            dest_name, f_res, file_options={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "upsert": "true"}
                        )
                    public_res_url = supabase.storage.from_("ticket-attachments").get_public_url(dest_name)

                    summary_msg = (
                        f"🎉 [FAST-PATH HOÀN TẤT] Tạo thành công {total_c} tài khoản (Học sinh: {student_c}, Giáo viên: {teacher_c})!\n"
                        f"📥 Tải file kết quả: {public_res_url}"
                    )
                    return {
                        "status": "success",
                        "message": summary_msg,
                        "request_id": req_id,
                        "result_file_url": public_res_url,
                        "student_count": student_c,
                        "teacher_count": teacher_c,
                        "total_count": total_c
                    }

                # Nếu chưa xong ngay -> Báo chuyển sang chế độ Polling
                return {
                    "status": "submitted",
                    "message": f"Đã nộp thành công file batch ({total_c} tài khoản) với Mã Request #{req_id}. Đang xếp hàng xử lý ngầm.",
                    "request_id": req_id
                }

            # --- K. Kiểm tra tiến độ & tải kết quả (Pha 2) ---
            elif action == "check_account_batch":
                return await workspace_playwright_service.check_and_export_batch_result(
                    credentials=school_creds or {},
                    request_id=payload_data.get("request_id", ""),
                    download_dir=payload_data.get("download_dir", "/tmp/results")
                )

            # --- L. School Ghi danh học viên & Group (Chính ngạch Workspace) ---
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
            logger.info("🎓 Kích hoạt Playwright LMS Direct Enroller...")
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

        else:
            return {"status": "failed", "error": f"Loại bot '{bot_type}' chưa được hỗ trợ."}

    except Exception as e:
        logger.error(f"❌ Lỗi thực thi Task Bot ({bot_type}): {e}", exc_info=True)
        return {"status": "failed", "error": str(e)}