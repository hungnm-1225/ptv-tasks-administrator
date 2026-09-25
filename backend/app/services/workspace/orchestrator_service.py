# backend/app/services/workspace/orchestrator_service.py
"""
Workspace Master Orchestrator Service (Master Enterprise Edition)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách: 
- "Nhạc trưởng" điều phối toàn trình Chuỗi 5-in-1 E2E: 
  Phả hệ -> Drive COF -> School Order -> License Boomerang Cascade -> Bulk Accounts -> Multi-Course Enroll & Git Sync.
- Kiến trúc Checkpoint 2.0 & State Machine: Idempotency chống tạo trùng lặp, Resume tiếp tục từ bước lỗi gần nhất.
- Tối ưu hiệu năng: Tận dụng RAM Session Cache đa tầng, thực thi 100% Direct HTTPX siêu tốc.
- Báo cáo thông tin thực tế, tinh gọn chuẩn Enterprise (Zero-Fluff Dense Logs).
"""
import os
import re
import gc
import json
import time
import logging
from typing import Dict, Any, List, Optional

from app.core.config import settings
from app.services.workspace.order_service import WorkspaceOrderService
from app.services.workspace.contract_service import WorkspaceContractService
from app.services.workspace.enroll_service import WorkspaceEnrollService
from app.services.workspace.account_service import workspace_account_service
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.google_drive_service import google_drive_service

logger = logging.getLogger(__name__)


def normalize_checkpoint_v2(raw_checkpoint: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Chuẩn hóa Checkpoint 2.0 (Transaction Checkpoint):
    Chuyển đổi dữ liệu phẳng sang cấu trúc Transaction chuẩn mực.
    """
    cp = raw_checkpoint.copy() if isinstance(raw_checkpoint, dict) else {}
    
    workflow = cp.get("workflow", "license_hierarchy_chain")
    version = cp.get("version", 2)
    completed_steps = cp.get("completed_steps") or []
    current_step = cp.get("current_step", "init")
    resources = cp.get("resources") or {}

    legacy_keys = [
        "order_code", "order_id", "prt_contract_code", "prt_contract_id",
        "dst_contract_code", "dst_contract_id", "drive_link", "group_name",
        "account_batch_request_id", "cof_result_path"
    ]
    for k in legacy_keys:
        if k in cp and k not in resources:
            resources[k] = cp[k]

    return {
        "workflow": workflow,
        "version": version,
        "completed_steps": completed_steps,
        "current_step": current_step,
        "resources": resources,
        "attempt": cp.get("attempt", 1)
    }


class WorkspaceOrchestratorService(WorkspaceOrderService, WorkspaceContractService, WorkspaceEnrollService):
    """
    Bộ điều phối liên luồng: Trọn Gói 5-in-1 và Chuỗi Liên Hoàn Leo Cấp Tự Động (Cascade Resolution).
    Tích hợp Động cơ Direct API siêu tốc cho toàn bộ 5 bước.
    """

    # =========================================================================
    # 🎯 ROUTER ĐIỀU PHỐI TỔNG (CHO BOT EXECUTOR & AUTOMATION STUDIO)
    # =========================================================================
    async def orchestrate_workspace_rpa(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Router trung tâm điều phối toàn bộ các hành động Workspace từ Studio hoặc Workflow DAG."""
        action = payload.get("action") or "pipeline_end_to_end"
        logger.info(f"🎭 [Workspace Router] Lệnh hành động: '{action}'")

        # 1. Trọn gói toàn trình E2E
        if action in ("pipeline_end_to_end", "end_to_end", "full_chain"):
            school_name = payload.get("school_name") or payload.get("hierarchy", {}).get("school_name", "")
            return await self.execute_full_license_hierarchy_chain(
                school_identifier=school_name,
                order_details=payload.get("order_details", payload),
                sales_admin_creds=payload.get("sales_admin_creds", {}),
                cof_file_path=payload.get("cof_file_path") or payload.get("attachment_url"),
                checkpoint=payload.get("checkpoint"),
                class_assignments=payload.get("class_assignments"),
                teachers_allocation=payload.get("teachers_allocation"),
                auto_sync_git=payload.get("auto_sync_git", True)
            )

        # 2. Phê duyệt School Order độc lập (kèm leo cấp Boomerang)
        elif action == "approve_school_order_standalone":
            school_ident = payload.get("school_name") or payload.get("order_code") or ""
            lineage = workspace_lineage_service.resolve_by_school(school_ident)
            partner_creds = lineage["partner"] if lineage else {"username": payload.get("partner_name", "")}
            distributor_creds = lineage["distributor"] if lineage else {"username": payload.get("distributor_name", "")}
            sales_admin_creds = {"username": getattr(settings, "TEST_ADMIN_USER", ""), "password": getattr(settings, "TEST_ADMIN_PASS", "")}

            return await self.execute_approve_school_order_standalone(
                order_identifier=payload.get("order_code", ""),
                partner_creds=partner_creds,
                distributor_creds=distributor_creds,
                sales_admin_creds=sales_admin_creds,
                courses_needed=payload.get("courses")
            )

        # 3. Phê duyệt Partner Contract độc lập
        elif action == "approve_partner_contract_standalone":
            lineage = workspace_lineage_service.resolve_by_school(payload.get("distributor_name", ""))
            dist_creds = lineage["distributor"] if lineage else {"username": payload.get("distributor_name", "")}
            sales_creds = {"username": getattr(settings, "TEST_ADMIN_USER", ""), "password": getattr(settings, "TEST_ADMIN_PASS", "")}

            return await self.execute_approve_partner_contract_standalone(
                contract_identifier=payload.get("contract_code", ""),
                distributor_creds=dist_creds,
                sales_admin_creds=sales_creds,
                courses_needed=payload.get("courses")
            )

        # 4. Sales Admin phê duyệt DST Contract
        elif action == "admin_approve_contract":
            sales_creds = {"username": getattr(settings, "TEST_ADMIN_USER", ""), "password": getattr(settings, "TEST_ADMIN_PASS", "")}
            return await self.admin_approve_distributor_contract(
                credentials=sales_creds,
                contract_identifier=payload.get("contract_code", ""),
                justification=payload.get("justification")
            )

        # 5. Chuỗi Partner tạo & duyệt
        elif action == "partner_create_and_approve_chain":
            lineage = workspace_lineage_service.resolve_by_school(payload.get("partner_name", ""))
            partner_creds = lineage["partner"] if lineage else {"username": payload.get("partner_name", "")}
            dist_creds = lineage["distributor"] if lineage else {"username": payload.get("distributor_name", "")}
            sales_creds = {"username": getattr(settings, "TEST_ADMIN_USER", ""), "password": getattr(settings, "TEST_ADMIN_PASS", "")}

            return await self.execute_partner_create_and_approve_chain(
                partner_creds=partner_creds,
                distributor_creds=dist_creds,
                sales_admin_creds=sales_creds,
                contract_data=payload.get("contract_data", {})
            )

        # 6. Chuỗi Distributor tạo & duyệt
        elif action == "distributor_create_and_approve_chain":
            lineage = workspace_lineage_service.resolve_by_school(payload.get("distributor_name", ""))
            dist_creds = lineage["distributor"] if lineage else {"username": payload.get("distributor_name", "")}
            sales_creds = {"username": getattr(settings, "TEST_ADMIN_USER", ""), "password": getattr(settings, "TEST_ADMIN_PASS", "")}

            return await self.execute_distributor_create_and_approve_chain(
                distributor_creds=dist_creds,
                sales_admin_creds=sales_creds,
                contract_data=payload.get("contract_data", {})
            )

        # 7. Ghi danh đa môn học & Đồng bộ Git
        elif action in ("enroll_students_pipeline", "direct_workspace_enroll"):
            return await self.enroll_students_pipeline(payload)


        elif action in ("bulk_account_creation", "bulk_accounts", "create_accounts"):
            school_ident = payload.get("school_name") or payload.get("school_user") or ""
            lineage = workspace_lineage_service.resolve_by_school(school_ident)
            school_creds = lineage["school"] if lineage else {
                "username": payload.get("school_user") or payload.get("username", ""),
                "password": payload.get("school_password") or payload.get("password", "")
            }
            account_file = payload.get("account_file_path") or payload.get("uploaded_file_path") or payload.get("cof_file_path")
            
            if not account_file or not os.path.exists(account_file):
                return {
                    "status": "failed",
                    "error": f"Không tìm thấy file tài khoản để nộp batch: {account_file}"
                }

            logger.info(f"🚀 [Bulk Accounts] Đang nộp batch tạo tài khoản cho trường: {school_creds.get('name', school_ident)}")
            return await workspace_account_service.submit_account_creation_batch(
                credentials=school_creds,
                upload_file_path=account_file,
                record_count=int(payload.get("record_count") or 50),
                download_dir=os.path.join(os.getcwd(), "backend", "data", "results_download"),
                checkpoint=payload.get("checkpoint")
            )

            
        # 8. Cập nhật hồ sơ người dùng Workspace
        elif action == "update_user_profile":
            user_id = str(payload.get("user_id", "")).strip()
            if not user_id:
                return {"status": "failed", "error": "Thiếu user_id để cập nhật hồ sơ"}

            from app.services.workspace.user_service import WorkspaceUserService

            admin_creds = payload.get("admin_credentials") or {}
            raw_user = admin_creds.get("username") or getattr(settings, "TEST_ADMIN_USER", "")
            raw_pass = admin_creds.get("password") or getattr(settings, "TEST_ADMIN_PASS", "")

            admin_user = str(raw_user).strip().strip('"').strip("'")
            admin_pass = str(raw_pass).strip().strip('"').strip("'")

            form_data = {
                "first_name": payload.get("first_name", ""),
                "last_name": payload.get("last_name", ""),
                "user_login": payload.get("user_login", ""),
                "email": payload.get("email", ""),
                "day": str(payload.get("day", "1")),
                "month": str(payload.get("month", "1")),
                "year": str(payload.get("year", "2012")),
                "country_id": str(payload.get("country_id", "3")),
                "city_id": str(payload.get("city_id", "2852")),
                "school_id": str(payload.get("school_id", "")),
                "partner_id": str(payload.get("partner_id", "")),
                "id_user_md": str(payload.get("id_user_md", "")),
                "user_role": str(payload.get("user_role", "student")),
            }

            result = await WorkspaceUserService.update_user_info(
                admin_user=admin_user,
                admin_pass=admin_pass,
                user_id=user_id,
                form_data=form_data
            )
            
            if not result.get("success"):
                err_msg = f"Cập nhật thất bại: {result.get('message')}"
                return {"status": "failed", "error": err_msg, "execution_logs": f"❌ {err_msg}"}

            clean_msg = f"Đã cập nhật hồ sơ User #{user_id} ({form_data['user_login']})"
            logger.info(f"✅ [User Profile] {clean_msg}")
            return {
                "status": "success",
                "message": clean_msg,
                "execution_logs": f"✓ Đã cập nhật hồ sơ User #{user_id} ({form_data['user_login']})",
                "data": result
            }

        return await self.execute_full_license_hierarchy_chain(
            school_identifier=payload.get("school_name", ""),
            order_details=payload.get("order_details", payload)
        )

    # =========================================================================
    # 🏆 QUY TRÌNH TRỌN GÓI 5-IN-1 E2E CHAIN (LOG THỰC TẾ & TỐI ƯU HIỆU NĂNG)
    # =========================================================================
    async def execute_full_license_hierarchy_chain(
        self,
        school_identifier: str,
        order_details: Dict[str, Any],
        sales_admin_creds: Optional[Dict[str, str]] = None,
        cof_file_path: Optional[str] = None,
        checkpoint: Optional[Dict[str, Any]] = None,
        class_assignments: Optional[Dict[str, Any]] = None,
        teachers_allocation: Optional[List[Dict[str, Any]]] = None,
        auto_sync_git: bool = True
    ) -> Dict[str, Any]:
        """Quy trình Trọn Gói 5-in-1 có Step Engine & Checkpoint 2.0 (Báo cáo thực tế)."""
        cp = normalize_checkpoint_v2(checkpoint)
        resources = cp["resources"]
        completed = cp["completed_steps"]
        report_lines: List[str] = [
            f"🎯 TIẾP NHẬN QUY TRÌNH TRỌN GÓI: '{school_identifier}'"
        ]

        def log_step(msg: str):
            logger.info(msg)
            report_lines.append(msg)

        # ------------------------------------------------------------------
        # BƯỚC 0: PHÂN GIẢI PHẢ HỆ (LINEAGE RESOLUTION)
        # ------------------------------------------------------------------
        cp["current_step"] = "resolve_lineage"
        lineage = workspace_lineage_service.resolve_by_school(school_identifier)
        if not lineage:
            err = f"Không tìm thấy phả hệ của trường '{school_identifier}' trong CSDL!"
            log_step(f"❌ {err}")
            return {
                "status": "failed",
                "current_step": "resolve_lineage",
                "error": err,
                "checkpoint": cp,
                "message": err,
                "execution_logs": "\n".join(report_lines),
                "logs": "\n".join(report_lines)
            }

        school_creds = lineage["school"]
        partner_creds = lineage["partner"]
        distributor_creds = lineage["distributor"]
        country_info = lineage.get("country", {})

        fallback_sales_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"")
        fallback_sales_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")
        final_sales_admin_creds = sales_admin_creds or {"username": fallback_sales_user, "password": fallback_sales_pass}

        if "resolve_lineage" not in completed:
            completed.append("resolve_lineage")
        log_step(f"[0/5] Phả hệ: {school_creds['name']} | Đối tác: {partner_creds['name']} | NPP: {distributor_creds['name']}")

        # ------------------------------------------------------------------
        # BƯỚC 1: LƯU TRỮ COF LÊN GOOGLE DRIVE (TÙY CHỌN)
        # ------------------------------------------------------------------
        cp["current_step"] = "drive_upload"
        drive_link = resources.get("drive_link", "")

        if "drive_upload" in completed and drive_link:
            log_step(f"[1/5] Drive COF: {drive_link} (Đã có sẵn)")
        elif cof_file_path and os.path.exists(cof_file_path):
            try:
                root_id = getattr(settings, "COF_ROOT_FOLDER_ID", "1SEh4I9yJRM8JNi_SC9CltpkyDYeG-I--")
                folder_id = google_drive_service.ensure_school_cof_folder(
                    root_folder_id=root_id,
                    country=country_info.get("folder", "4. Vietnam"),
                    distributor_name=distributor_creds["name"],
                    partner_name=partner_creds["name"],
                    school_name=school_creds["name"]
                )
                upload_res = google_drive_service.upload_file_to_school_folder(cof_file_path, folder_id)
                drive_link = upload_res.get("web_view_link", "")
                resources["drive_link"] = drive_link
                completed.append("drive_upload")
                log_step(f"[1/5] Drive COF: {drive_link}")
            except Exception as e:
                log_step(f"[1/5] Drive COF: Lỗi tải file ({e})")
        else:
            log_step("[1/5] Drive COF: Bỏ qua (Không có file)")

        # ------------------------------------------------------------------
        # BƯỚC 2: SCHOOL TẠO ORDER QUA DIRECT API
        # ------------------------------------------------------------------
        cp["current_step"] = "school_create_order"
        order_code = resources.get("order_code") or order_details.get("existing_order_code")

        if "school_create_order" in completed and order_code:
            log_step(f"[2/5] Order: {order_code} (Đã có sẵn)")
        else:
            school_res = await self.school_create_order(school_creds, order_details)
            if school_res.get("status") != "success":
                err_detail = school_res.get("error", "Lỗi tạo Order tại School")
                log_step(f"❌ [2/5] Tạo Order thất bại: {err_detail}")
                return {
                    "status": "failed",
                    "current_step": "school_create_order",
                    "error": err_detail,
                    "checkpoint": cp,
                    "message": err_detail,
                    "execution_logs": "\n".join(report_lines),
                    "logs": "\n".join(report_lines)
                }

            order_code = school_res.get("order_code")
            resources["order_code"] = order_code
            resources["order_id"] = school_res.get("order_id")
            completed.append("school_create_order")
            log_step(f"[2/5] {school_res.get('message')}")

        # ------------------------------------------------------------------
        # BƯỚC 3: PHÊ DUYỆT LICENSE (BOOMERANG NẾU THIẾU QUOTA)
        # ------------------------------------------------------------------
        cp["current_step"] = "license_cascade"
        if "license_cascade" in completed:
            log_step(f"[3/5] License: {order_code} (Đã cấp phép)")
        else:
            license_res = await self.execute_approve_school_order_standalone(
                order_identifier=order_code,
                partner_creds=partner_creds,
                distributor_creds=distributor_creds,
                sales_admin_creds=final_sales_admin_creds,
                courses_needed=order_details.get("courses", []),
                checkpoint=cp
            )
            if license_res.get("status") != "success":
                err_detail = license_res.get("error", "Lỗi cấp phép License")
                log_step(f"❌ [3/5] Cấp phép thất bại: {err_detail}")
                return {
                    "status": "failed",
                    "current_step": "license_cascade",
                    "error": err_detail,
                    "checkpoint": cp,
                    "message": err_detail,
                    "execution_logs": "\n".join(report_lines),
                    "logs": "\n".join(report_lines)
                }

            completed.append("license_cascade")
            log_step(f"[3/5] License: {license_res.get('message')}")

        # ------------------------------------------------------------------
        # BƯỚC 4: TẠO TÀI KHOẢN HÀNG LOẠT (BULK ACCOUNTS)
        # ------------------------------------------------------------------
        cp["current_step"] = "bulk_account_creation"
        account_file = cof_file_path or order_details.get("account_file_path") or order_details.get("uploaded_file_path")

        if "bulk_account_creation" in completed:
            log_step("[4/5] Tài khoản: Đã hoàn tất ở phiên trước")
        elif account_file and os.path.exists(account_file):
            acc_res = await workspace_account_service.submit_account_creation_batch(
                credentials=school_creds,
                upload_file_path=account_file,
                record_count=int(order_details.get("record_count") or 50),
                download_dir=os.path.join(os.getcwd(), "backend", "data", "results_download"),
                checkpoint=cp
            )

            if acc_res.get("status") in ("success", "completed"):
                completed.append("bulk_account_creation")
                resources["account_batch_request_id"] = acc_res.get("request_id")
                resources["cof_result_path"] = acc_res.get("result_file_path")
                log_step(f"[4/5] Tài khoản: Hoàn tất ({acc_res.get('result_file_path')})")
            elif acc_res.get("status") == "waiting_poll":
                resources["account_batch_request_id"] = acc_res.get("request_id")
                log_step(f"[4/5] Tài khoản: Batch #{acc_res.get('request_id')} đang xử lý (chờ cron 10p)")
                return {
                    "status": "waiting_poll",
                    "current_step": "bulk_account_creation",
                    "order_code": order_code,
                    "request_id": acc_res.get("request_id"),
                    "checkpoint": cp,
                    "message": f"Batch #{acc_res.get('request_id')} chuyển sang chờ kiểm tra ngầm",
                    "execution_logs": "\n".join(report_lines),
                    "logs": "\n".join(report_lines)
                }
            else:
                log_step(f"[4/5] Tài khoản: Lỗi nộp batch ({acc_res.get('error')})")
        else:
            log_step("[4/5] Tài khoản: Bỏ qua (Không có danh sách tài khoản)")

        # ------------------------------------------------------------------
        # BƯỚC 5: GHI DANH ĐA MÔN HỌC & ĐỒNG BỘ PYTHAVERSE GIT
        # ------------------------------------------------------------------
        cp["current_step"] = "workspace_enroll_and_git"
        courses_plan = order_details.get("courses") or order_details.get("courses_plan") or []
        has_class_assignments = bool(class_assignments or order_details.get("class_assignments"))
        has_teachers = bool(teachers_allocation or order_details.get("teachers_allocation"))

        if "workspace_enroll_and_git" in completed:
            log_step("[5/5] Ghi danh & Git: Đã hoàn tất ở phiên trước")
        elif not cof_file_path and not has_class_assignments and not has_teachers:
            # 🎯 CHỐT CHẶN CỐT TỬ: KHÔNG CÓ FILE COF / KHÔNG CÓ LỚP THÌ BỎ QUA GHI DANH
            completed.append("workspace_enroll_and_git")
            log_step("[5/5] Ghi danh & Git: Bỏ qua (Đơn hàng tạo slot hạn ngạch, trường học sẽ tự quản lý người dùng)")
        elif courses_plan:
            enroll_payload = {
                "school_name": school_creds.get("name") or school_identifier,
                "school_id": school_creds.get("id") or school_creds.get("school_id") or school_creds.get("code"),
                "school_code": school_creds.get("code"),
                "credentials": school_creds,
                "courses_plan": courses_plan,
                "class_assignments": class_assignments or order_details.get("class_assignments", {}),
                "teachers_allocation": teachers_allocation or order_details.get("teachers_allocation", []),
                "auto_sync_git": auto_sync_git
            }

            enroll_res = await self.enroll_students_pipeline(enroll_payload)

            if enroll_res.get("status") == "success":
                completed.append("workspace_enroll_and_git")
                resources["enroll_summary"] = enroll_res.get("message")
                log_step(f"[5/5] Ghi danh: {enroll_res.get('message')}")
            else:
                err_detail = enroll_res.get("error", "Lỗi ghi danh tại School Workspace")
                log_step(f"⚠️ [5/5] Ghi danh sự cố: {err_detail}")
                return {
                    "status": "partial_success",
                    "current_step": "workspace_enroll_and_git",
                    "order_code": order_code,
                    "checkpoint": cp,
                    "error": err_detail,
                    "message": err_detail,
                    "execution_logs": "\n".join(report_lines),
                    "logs": "\n".join(report_lines)
                }
        else:
            log_step("[5/5] Ghi danh & Git: Bỏ qua (Không có kế hoạch khóa học)")

        # ------------------------------------------------------------------
        # 🏁 HOÀN TẤT 100% QUY TRÌNH MASTER E2E
        # ------------------------------------------------------------------
        cp["current_step"] = "completed"
        clean_final_msg = f"Hoàn tất quy trình cho Order [{order_code}] ({school_creds['name']})"
        log_step(f"🏁 TỔNG KẾT: {clean_final_msg}")

        return {
            "status": "success",
            "order_code": order_code,
            "drive_link": drive_link,
            "account_result_file": resources.get("cof_result_path"),
            "checkpoint": cp,
            "message": clean_final_msg,
            "execution_logs": "\n".join(report_lines),
            "logs": "\n".join(report_lines)
        }

    # =========================================================================
    # 🤝 DUYỆT SCHOOL ORDER STANDALONE (BOOMERANG CASCADE GỌN GÀNG)
    # =========================================================================
    async def execute_approve_school_order_standalone(
        self,
        order_identifier: str,
        partner_creds: Dict[str, str],
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None,
        checkpoint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Duyệt School Order gọn gàng qua Direct API (Tự động leo cấp nếu thiếu)."""
        cp = normalize_checkpoint_v2(checkpoint)
        resources = cp["resources"]
        completed = cp["completed_steps"]
        logs = []

        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        if not courses_needed:
            detail_res = await self.fetch_school_order_detailed_courses(partner_creds, order_identifier)
            courses_needed = detail_res.get("courses", [])

        # 1. Partner thử duyệt lần 1
        partner_res = await self.partner_approve_school_order(
            credentials=partner_creds,
            order_identifier=order_identifier,
            auto_create_prt_if_short=True,
            courses_needed=courses_needed
        )

        if partner_res.get("status") == "success":
            resources["order_approved"] = True
            completed.append("partner_approve_school_order")
            log_step(partner_res.get("message"))
            return {
                "status": "success",
                "order_code": order_identifier,
                "checkpoint": cp,
                "current_step": "completed",
                "message": partner_res.get("message"),
                "execution_logs": "\n".join(logs),
                "logs": "\n".join(logs)
            }

        # 2. Nếu thiếu License -> Leo cấp bù từ Distributor
        if partner_res.get("status") == "insufficient_pool_created_prt":
            prt_code = partner_res.get("prt_contract_code")
            resources["prt_contract_code"] = prt_code
            log_step(f"Thiếu License Order [{order_identifier}] ➔ Cấp bù PRT: {prt_code}")

            # 🎯 TRUYỀN NGUỒN GỐC ORDER VÀO CHUỖI LEVERAGE TIẾP THEO
            prt_resolve_res = await self.execute_approve_partner_contract_standalone(
                contract_identifier=prt_code,
                distributor_creds=distributor_creds,
                sales_admin_creds=sales_admin_creds,
                courses_needed=courses_needed,
                checkpoint=cp,
                origin_order_code=order_identifier,
                school_name=partner_res.get("school_name")
            )
            if prt_resolve_res.get("status") != "success":
                err_prt = prt_resolve_res.get("error", "Lỗi duyệt PRT Contract cấp trên")
                return {
                    "status": "failed",
                    "error": err_prt,
                    "checkpoint": cp,
                    "current_step": "approve_prt_contract",
                    "message": err_prt,
                    "execution_logs": "\n".join(logs),
                    "logs": "\n".join(logs)
                }

            resources["prt_approved"] = True

            # 3. Partner duyệt lại lần cuối dứt điểm
            final_res = await self.partner_approve_school_order(
                credentials=partner_creds,
                order_identifier=order_identifier,
                auto_create_prt_if_short=False,
                courses_needed=courses_needed
            )
            if final_res.get("status") != "success":
                err_final = final_res.get("error", "Lỗi Partner duyệt lại Order")
                return {
                    "status": "failed",
                    "error": err_final,
                    "checkpoint": cp,
                    "current_step": "partner_final_approve",
                    "message": err_final,
                    "execution_logs": "\n".join(logs),
                    "logs": "\n".join(logs)
                }

            resources["order_approved"] = True
            completed.append("partner_approve_school_order")
            clean_msg = f"Duyệt thành công School Order: {order_identifier} (Đã cấp bù qua {prt_code})"
            log_step(clean_msg)
            return {
                "status": "success",
                "order_code": order_identifier,
                "checkpoint": cp,
                "current_step": "completed",
                "message": clean_msg,
                "execution_logs": "\n".join(logs),
                "logs": "\n".join(logs)
            }

        err = partner_res.get("error", "Lỗi duyệt School Order")
        return {
            "status": "failed",
            "error": err,
            "checkpoint": cp,
            "current_step": "partner_approve_school_order",
            "message": err,
            "execution_logs": "\n".join(logs),
            "logs": "\n".join(logs)
        }

    # =========================================================================
    # 🏢 DUYỆT PARTNER CONTRACT STANDALONE (TỰ ĐỘNG BÙ TỪ SALES ADMIN NẾU THIẾU)
    # =========================================================================
    async def execute_approve_partner_contract_standalone(
        self,
        contract_identifier: str,
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None,
        checkpoint: Optional[Dict[str, Any]] = None,
        origin_order_code: Optional[str] = None, 
        school_name: Optional[str] = None         
    ) -> Dict[str, Any]:
        """Duyệt Partner Contract gọn gàng qua Direct API kèm leo cấp Sales Admin nếu thiếu."""
        cp = normalize_checkpoint_v2(checkpoint)
        resources = cp["resources"]
        completed = cp["completed_steps"]
        logs = []

        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        dist_res = await self.distributor_approve_partner_contract(
            credentials=distributor_creds,
            contract_identifier=contract_identifier,
            auto_create_dst_if_short=True,
            courses_needed=courses_needed,
            origin_order_code=origin_order_code,
            school_name=school_name
        )

        if dist_res.get("status") == "success":
            resources["prt_approved"] = True
            completed.append("distributor_approve_partner_contract")
            log_step(dist_res.get("message"))
            return {
                "status": "success",
                "contract_code": contract_identifier,
                "checkpoint": cp,
                "current_step": "completed",
                "message": dist_res.get("message"),
                "execution_logs": "\n".join(logs),
                "logs": "\n".join(logs)
            }

        # Nếu thiếu License -> Distributor tạo DST gửi Sales Admin duyệt
        if dist_res.get("status") == "insufficient_pool_created_dst":
            dst_code = dist_res.get("dst_contract_code")
            resources["dst_contract_code"] = dst_code
            log_step(f"Thiếu License PRT [{contract_identifier}] ➔ Cấp bù DST: {dst_code}")

            admin_res = await self.admin_approve_distributor_contract(sales_admin_creds, dst_code)
            if admin_res.get("status") != "success":
                err_admin = admin_res.get("error", "Sales Admin duyệt DST thất bại")
                return {
                    "status": "failed",
                    "error": err_admin,
                    "checkpoint": cp,
                    "current_step": "admin_approve_dst",
                    "message": err_admin,
                    "execution_logs": "\n".join(logs),
                    "logs": "\n".join(logs)
                }

            resources["dst_approved"] = True
            completed.append("admin_approve_dst_contract")
            log_step(f"Sales Admin đã duyệt DST: {dst_code}")

            # Distributor duyệt lại dứt điểm
            final_res = await self.distributor_approve_partner_contract(
                credentials=distributor_creds,
                contract_identifier=contract_identifier,
                auto_create_dst_if_short=False
            )
            if final_res.get("status") != "success":
                err_final = final_res.get("error", "Distributor duyệt lại PRT thất bại")
                return {
                    "status": "failed",
                    "error": err_final,
                    "checkpoint": cp,
                    "current_step": "distributor_approve_prt",
                    "message": err_final,
                    "execution_logs": "\n".join(logs),
                    "logs": "\n".join(logs)
                }

            resources["prt_approved"] = True
            completed.append("distributor_approve_partner_contract")
            clean_msg = f"Duyệt thành công PRT Contract: {contract_identifier} (Đã cấp bù qua {dst_code})"
            log_step(clean_msg)
            return {
                "status": "success",
                "contract_code": contract_identifier,
                "checkpoint": cp,
                "current_step": "completed",
                "message": clean_msg,
                "execution_logs": "\n".join(logs),
                "logs": "\n".join(logs)
            }

        err = dist_res.get("error", "Lỗi duyệt Partner Contract")
        return {
            "status": "failed",
            "error": err,
            "checkpoint": cp,
            "current_step": "distributor_approve_prt_contract",
            "message": err,
            "execution_logs": "\n".join(logs),
            "logs": "\n".join(logs)
        }

    async def execute_partner_create_and_approve_chain(
        self,
        partner_creds: Dict[str, str],
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Tạo mới PRT Contract và tự động kích hoạt chuỗi duyệt cấp trên."""
        create_res = await self.partner_create_contract(partner_creds, contract_data)
        if create_res.get("status") != "success":
            return create_res

        prt_code = create_res.get("contract_code")
        return await self.execute_approve_partner_contract_standalone(
            contract_identifier=prt_code,
            distributor_creds=distributor_creds,
            sales_admin_creds=sales_admin_creds,
            courses_needed=contract_data.get("courses")
        )

    async def execute_distributor_create_and_approve_chain(
        self,
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Distributor tạo mới DST Contract và tự động kích hoạt Sales Admin duyệt."""
        create_res = await self.distributor_create_contract(distributor_creds, contract_data)
        if create_res.get("status") != "success":
            return create_res

        dst_code = create_res.get("contract_code")
        return await self.admin_approve_distributor_contract(
            credentials=sales_admin_creds,
            contract_identifier=dst_code,
            justification=contract_data.get("justification")
        )


workspace_orchestrator_service = WorkspaceOrchestratorService()