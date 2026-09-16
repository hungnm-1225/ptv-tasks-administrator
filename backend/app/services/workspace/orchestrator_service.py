# backend/app/services/workspace/orchestrator_service.py
"""
Workspace Master Orchestrator Service (Master Enterprise Edition)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách: 
- "Nhạc trưởng" điều phối toàn trình Chuỗi 5-in-1 E2E: 
  Phả hệ -> Drive COF -> School Order -> License Boomerang Cascade -> Bulk Accounts -> Multi-Course Enroll & Git Sync.
- Kiến trúc Checkpoint 2.0 & State Machine: Idempotency chống tạo trùng lặp, Resume tiếp tục từ bước lỗi gần nhất.
- Hỗ trợ toàn bộ các phân luồng độc lập từ Automation Studio.
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

logger = logging.getLogger(__name__)


def normalize_checkpoint_v2(raw_checkpoint: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Chuẩn hóa Checkpoint 2.0 (Transaction Checkpoint):
    Chuyển đổi dữ liệu phẳng cũ sang cấu trúc Transaction chuẩn mực.
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
        logger.info(f"🎭 [Workspace Orchestrator Router] Nhận lệnh hành động: '{action}'")

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
            from app.services.workspace_lineage_service import workspace_lineage_service
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
            from app.services.workspace_lineage_service import workspace_lineage_service
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
            from app.services.workspace_lineage_service import workspace_lineage_service
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
            from app.services.workspace_lineage_service import workspace_lineage_service
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

        # Mặc định fallback về E2E
        return await self.execute_full_license_hierarchy_chain(
            school_identifier=payload.get("school_name", ""),
            order_details=payload.get("order_details", payload)
        )

    # =========================================================================
    # 🏆 QUY TRÌNH MASTER TRỌN GÓI 5-IN-1 E2E CHAIN
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
        """
        Quy trình Trọn Gói Master E2E Chain có Step Engine & Checkpoint 2.0:
        Bước 0: Lineage -> Bước 1: Drive -> Bước 2: School Order -> Bước 3: License Cascade
        -> Bước 4: Bulk Accounts (nếu có file) -> Bước 5: Multi-Course Enroll + Auto Git Sync.
        """
        from app.services.workspace_lineage_service import workspace_lineage_service
        from app.services.google_drive_service import google_drive_service

        cp = normalize_checkpoint_v2(checkpoint)
        resources = cp["resources"]
        completed = cp["completed_steps"]
        logs = []

        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [TRỌN GÓI MASTER E2E] Bắt đầu quy trình 5-in-1 (Checkpoint 2.0) cho: '{school_identifier}'")

        # ------------------------------------------------------------------
        # BƯỚC 0: PHÂN GIẢI PHẢ HỆ (LINEAGE RESOLUTION)
        # ------------------------------------------------------------------
        cp["current_step"] = "resolve_lineage"
        lineage = workspace_lineage_service.resolve_by_school(school_identifier)
        if not lineage:
            err = f"Không tìm thấy phả hệ của trường '{school_identifier}' trong Két Sắt cơ sở dữ liệu!"
            log_step(f"❌ {err}")
            return {"status": "failed", "current_step": "resolve_lineage", "error": err, "checkpoint": cp, "logs": "\n".join(logs)}

        school_creds = lineage["school"]
        partner_creds = lineage["partner"]
        distributor_creds = lineage["distributor"]
        country_info = lineage.get("country", {})

        fallback_sales_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"")
        fallback_sales_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")
        final_sales_admin_creds = sales_admin_creds or {"username": fallback_sales_user, "password": fallback_sales_pass}

        if "resolve_lineage" not in completed:
            completed.append("resolve_lineage")

        # ------------------------------------------------------------------
        # BƯỚC 1: LƯU TRỮ COF LÊN GOOGLE DRIVE (TÙY CHỌN)
        # ------------------------------------------------------------------
        cp["current_step"] = "drive_upload"
        drive_link = resources.get("drive_link", "")

        if "drive_upload" in completed and drive_link:
            log_step(f"⏩ [BƯỚC 1 - DRIVE] File đã lưu Drive ở phiên trước: {drive_link}. Bỏ qua!")
        elif cof_file_path and os.path.exists(cof_file_path):
            log_step("📁 [BƯỚC 1 - DRIVE] Đang tải file COF lên Google Drive...")
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
                log_step(f"✅ [BƯỚC 1 - DRIVE] File COF đã được lưu: {drive_link}")
            except Exception as e:
                log_step(f"⚠️ [BƯỚC 1 - DRIVE] Lỗi tải Drive (không chặn luồng): {e}")

        # ------------------------------------------------------------------
        # BƯỚC 2: SCHOOL TẠO ORDER QUA DIRECT API
        # ------------------------------------------------------------------
        cp["current_step"] = "school_create_order"
        order_code = resources.get("order_code") or order_details.get("existing_order_code")

        if "school_create_order" in completed and order_code:
            log_step(f"⏩ [BƯỚC 2 - SCHOOL ORDER] Order Code đã có sẵn: [{order_code}]. Bỏ qua tạo mới!")
        else:
            log_step(f"🏫 [BƯỚC 2 - SCHOOL ORDER] Tạo Order qua Direct API cho '{school_creds.get('name')}'...")
            school_res = await self.school_create_order(school_creds, order_details)
            if school_res.get("status") != "success":
                err_detail = school_res.get("error", "Lỗi tạo Order tại School")
                log_step(f"❌ [LỖI TẠO ORDER]: {err_detail}")
                return {"status": "failed", "current_step": "school_create_order", "error": err_detail, "checkpoint": cp, "logs": "\n".join(logs)}

            order_code = school_res.get("order_code")
            resources["order_code"] = order_code
            resources["order_id"] = school_res.get("order_id")
            completed.append("school_create_order")
            log_step(f"✅ [BƯỚC 2 - SCHOOL ORDER] Đã tạo Order thành công: [{order_code}]")

        # ------------------------------------------------------------------
        # BƯỚC 3: PHÊ DUYỆT LICENSE BOOMERANG CASCADE QUA DIRECT API
        # ------------------------------------------------------------------
        cp["current_step"] = "license_cascade"
        if "license_cascade" in completed:
            log_step(f"⏩ [BƯỚC 3 - LICENSE] Order [{order_code}] đã được cấp phép hoàn tất. Bỏ qua!")
        else:
            log_step(f"🤝 [BƯỚC 3 - LICENSE] Kích hoạt chuỗi phê duyệt Boomerang cho [{order_code}]...")
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
                log_step(f"❌ [LỖI CẤP PHÉP LICENSE]: {err_detail}")
                return {"status": "failed", "current_step": "license_cascade", "error": err_detail, "checkpoint": cp, "logs": "\n".join(logs)}

            completed.append("license_cascade")
            log_step(f"✅ [BƯỚC 3 - LICENSE] Đã cấp phép License thành công cho [{order_code}]!")

        # ------------------------------------------------------------------
        # BƯỚC 4: TẠO TÀI KHOẢN HÀNG LOẠT (BULK ACCOUNTS - NẾU CÓ FILE)
        # ------------------------------------------------------------------
        cp["current_step"] = "bulk_account_creation"
        account_file = cof_file_path or order_details.get("account_file_path") or order_details.get("uploaded_file_path")

        if "bulk_account_creation" in completed:
            log_step("⏩ [BƯỚC 4 - ACCOUNTS] Tài khoản đã được tạo ở phiên trước. Bỏ qua!")
        elif account_file and os.path.exists(account_file):
            log_step(f"👥 [BƯỚC 4 - ACCOUNTS] Đang nộp batch tạo tài khoản từ file '{os.path.basename(account_file)}'...")
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
                log_step(f"✅ [BƯỚC 4 - ACCOUNTS] Tạo tài khoản thành công! File kết quả: {acc_res.get('result_file_path')}")
            elif acc_res.get("status") == "waiting_poll":
                resources["account_batch_request_id"] = acc_res.get("request_id")
                log_step(f"⏳ [BƯỚC 4 - ACCOUNTS] Batch #{acc_res.get('request_id')} đã nộp thành công, chuyển Cronjob 10 phút thăm dò tiếp.")
                return {
                    "status": "waiting_poll",
                    "current_step": "bulk_account_creation",
                    "order_code": order_code,
                    "request_id": acc_res.get("request_id"),
                    "checkpoint": cp,
                    "logs": "\n".join(logs)
                }
            else:
                log_step(f"⚠️ [BƯỚC 4 - ACCOUNTS] Nộp batch tài khoản gặp sự cố: {acc_res.get('error')}")

        # ------------------------------------------------------------------
        # BƯỚC 5: GHI DANH ĐA MÔN HỌC & ĐỒNG BỘ PYTHAVERSE GIT REPOSITORIES
        # ------------------------------------------------------------------
        cp["current_step"] = "workspace_enroll_and_git"
        courses_plan = order_details.get("courses") or order_details.get("courses_plan") or []

        if "workspace_enroll_and_git" in completed:
            log_step("⏩ [BƯỚC 5 - ENROLL & GIT] Đã hoàn tất ghi danh & phân quyền Git ở phiên trước. Bỏ qua!")
        elif courses_plan:
            log_step(f"🎓 [BƯỚC 5 - ENROLL & GIT] Đang gán License cho {len(courses_plan)} Khóa học & Đồng bộ Pythaverse Git...")

            enroll_payload = {
                "school_name": school_creds.get("name") or school_identifier,
                "courses_plan": courses_plan,
                "class_assignments": class_assignments or order_details.get("class_assignments", {}),
                "teachers_allocation": teachers_allocation or order_details.get("teachers_allocation", []),
                "auto_sync_git": auto_sync_git
            }

            enroll_res = await self.enroll_students_pipeline(enroll_payload)

            if enroll_res.get("status") == "success":
                completed.append("workspace_enroll_and_git")
                resources["enroll_summary"] = enroll_res.get("message")
                log_step(f"✅ [BƯỚC 5 - ENROLL & GIT] {enroll_res.get('message')}")
            else:
                err_detail = enroll_res.get("error", "Lỗi ghi danh tại School Workspace")
                log_step(f"⚠️ [BƯỚC 5 - ENROLL & GIT] Sự cố ghi danh: {err_detail}")
                return {
                    "status": "partial_success",
                    "current_step": "workspace_enroll_and_git",
                    "order_code": order_code,
                    "checkpoint": cp,
                    "error": err_detail,
                    "logs": "\n".join(logs)
                }

        # ------------------------------------------------------------------
        # 🏁 HOÀN TẤT 100% QUY TRÌNH MASTER E2E
        # ------------------------------------------------------------------
        cp["current_step"] = "completed"
        log_step(f"🏆 HOÀN THÀNH 100% QUY TRÌNH MASTER E2E CHO ORDER [{order_code}]!")
        return {
            "status": "success",
            "order_code": order_code,
            "drive_link": drive_link,
            "account_result_file": resources.get("cof_result_path"),
            "checkpoint": cp,
            "logs": "\n".join(logs)
        }

    # =========================================================================
    # 🤝 DUYỆT SCHOOL ORDER STANDALONE (BOOMERANG CASCADE)
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
        """Duyệt School Order theo chuẩn Boomerang Xuyên Suốt qua Direct API."""
        cp = normalize_checkpoint_v2(checkpoint)
        resources = cp["resources"]
        completed = cp["completed_steps"]
        logs = []

        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [BOOMERANG CASCADE] Duyệt School Order qua Direct API: [{order_identifier}]")

        # 1. Đọc chi tiết môn học nếu chưa có
        if not courses_needed:
            detail_res = await self.fetch_school_order_detailed_courses(partner_creds, order_identifier)
            courses_needed = detail_res.get("courses", [])

        # 2. Thử duyệt tại Partner lần 1
        partner_res = await self.partner_approve_school_order(
            credentials=partner_creds,
            order_identifier=order_identifier,
            auto_create_prt_if_short=True,
            courses_needed=courses_needed
        )

        if partner_res.get("status") == "success":
            resources["order_approved"] = True
            completed.append("partner_approve_school_order")
            log_step(f"✅ Partner đã duyệt thành công School Order [{order_identifier}]!")
            return {"status": "success", "order_code": order_identifier, "checkpoint": cp, "current_step": "completed", "logs": "\n".join(logs)}

        # 3. Nếu thiếu License -> Leo cấp Boomerang lên Distributor
        if partner_res.get("status") == "insufficient_pool_created_prt":
            prt_code = partner_res.get("prt_contract_code")
            resources["prt_contract_code"] = prt_code
            log_step(f"⚡ [BOOMERANG LEO CẤP] Partner đã tạo PRT Contract [{prt_code}]. Chuyển Distributor duyệt...")

            # 4. Distributor duyệt PRT Contract (kèm leo lên Sales Admin nếu cần)
            prt_resolve_res = await self.execute_approve_partner_contract_standalone(
                contract_identifier=prt_code,
                distributor_creds=distributor_creds,
                sales_admin_creds=sales_admin_creds,
                courses_needed=courses_needed,
                checkpoint=cp
            )
            if prt_resolve_res.get("status") != "success":
                err_prt = prt_resolve_res.get("error", "Lỗi duyệt PRT Contract ở tầng trên")
                return {"status": "failed", "error": err_prt, "checkpoint": cp, "current_step": "approve_prt_contract", "logs": "\n".join(logs)}

            resources["prt_approved"] = True
            log_step(f"🎉 [BOOMERANG HẠ CÁNH] Cấp bù xong! Partner duyệt lại School Order [{order_identifier}]...")

            # 5. Partner duyệt lại lần cuối dứt điểm
            final_res = await self.partner_approve_school_order(
                credentials=partner_creds,
                order_identifier=order_identifier,
                auto_create_prt_if_short=False,
                courses_needed=courses_needed
            )
            if final_res.get("status") != "success":
                err_final = final_res.get("error", "Lỗi Partner duyệt lại Order lần cuối")
                return {"status": "failed", "error": err_final, "checkpoint": cp, "current_step": "partner_final_approve", "logs": "\n".join(logs)}

            resources["order_approved"] = True
            completed.append("partner_approve_school_order")
            log_step(f"🏁 [BOOMERANG HOÀN TẤT] ĐÃ DUYỆT THÀNH CÔNG SCHOOL ORDER: [{order_identifier}]!")
            return {"status": "success", "order_code": order_identifier, "checkpoint": cp, "current_step": "completed", "logs": "\n".join(logs)}

        err = partner_res.get("error", "Lỗi duyệt School Order tại Partner")
        return {"status": "failed", "error": err, "checkpoint": cp, "current_step": "partner_approve_school_order", "logs": "\n".join(logs)}

    # =========================================================================
    # 🏢 DUYỆT PARTNER CONTRACT STANDALONE (1-SESSION CASCADE)
    # =========================================================================
    async def execute_approve_partner_contract_standalone(
        self,
        contract_identifier: str,
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None,
        checkpoint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Duyệt Partner Contract qua Direct API kèm leo cấp Sales Admin nếu thiếu."""
        cp = normalize_checkpoint_v2(checkpoint)
        resources = cp["resources"]
        completed = cp["completed_steps"]
        logs = []

        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [SUB-FLOW DIRECT] Duyệt Partner Contract: [{contract_identifier}]")

        dist_res = await self.distributor_approve_partner_contract(
            credentials=distributor_creds,
            contract_identifier=contract_identifier,
            auto_create_dst_if_short=True,
            courses_needed=courses_needed
        )

        if dist_res.get("status") == "success":
            resources["prt_approved"] = True
            completed.append("distributor_approve_partner_contract")
            log_step(f"✅ Distributor đã duyệt thành công Contract [{contract_identifier}]!")
            return {"status": "success", "contract_code": contract_identifier, "checkpoint": cp, "current_step": "completed", "logs": "\n".join(logs)}

        if dist_res.get("status") == "insufficient_pool_created_dst":
            dst_code = dist_res.get("dst_contract_code")
            resources["dst_contract_code"] = dst_code
            log_step(f"⚡ [DIRECT CASCADE] Đã tạo DST Contract [{dst_code}]. Chuyển Sales Admin duyệt qua REST API...")

            # 1. Sales Admin duyệt qua REST API update-status
            admin_res = await self.admin_approve_distributor_contract(sales_admin_creds, dst_code)
            if admin_res.get("status") != "success":
                return {"status": "failed", "error": admin_res.get("error"), "checkpoint": cp, "current_step": "admin_approve_dst", "logs": "\n".join(logs)}

            resources["dst_approved"] = True
            completed.append("admin_approve_dst_contract")

            # 2. Distributor duyệt lại PRT Contract qua Direct API
            log_step(f"🎉 Sales Admin đã cấp phép [{dst_code}]. Distributor duyệt lại PRT [{contract_identifier}]...")
            final_res = await self.distributor_approve_partner_contract(
                credentials=distributor_creds,
                contract_identifier=contract_identifier,
                auto_create_dst_if_short=False
            )
            if final_res.get("status") != "success":
                return {"status": "failed", "error": final_res.get("error"), "checkpoint": cp, "current_step": "distributor_approve_prt", "logs": "\n".join(logs)}

            resources["prt_approved"] = True
            completed.append("distributor_approve_partner_contract")
            log_step(f"🏁 ĐÃ DUYỆT THÀNH CÔNG PARTNER CONTRACT: [{contract_identifier}]!")
            return {"status": "success", "contract_code": contract_identifier, "checkpoint": cp, "current_step": "completed", "logs": "\n".join(logs)}

        err = dist_res.get("error", "Lỗi duyệt Partner Contract")
        return {"status": "failed", "error": err, "checkpoint": cp, "current_step": "distributor_approve_prt_contract", "logs": "\n".join(logs)}

    async def execute_partner_create_and_approve_chain(
        self,
        partner_creds: Dict[str, str],
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Tạo mới PRT Contract và tự động kích hoạt chuỗi duyệt cấp trên qua Direct API."""
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
        """Distributor tạo mới DST Contract và tự động kích hoạt Sales Admin duyệt qua Direct API."""
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