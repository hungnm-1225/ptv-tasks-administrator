# backend/app/services/workspace/orchestrator_service.py
import os
import logging
from typing import Dict, Any, List, Optional

from app.core.config import settings
from app.services.workspace.order_service import WorkspaceOrderService
from app.services.workspace.contract_service import WorkspaceContractService
from app.services.workspace.enroll_service import WorkspaceEnrollService

logger = logging.getLogger(__name__)


class WorkspaceOrchestratorService(WorkspaceOrderService, WorkspaceContractService, WorkspaceEnrollService):
    """
    Bộ điều phối liên luồng: Trọn Gói 4-in-1 và Chuỗi Liên Hoàn Leo Cấp Tự Động (Cascade Resolution).
    Được nâng cấp lên Kiến trúc Step Engine có Checkpoint & State Machine:
    - Chống tạo trùng lặp Order / Contract khi Retry (Idempotency).
    - Hỗ trợ Resume tiếp tục từ bước bị lỗi gần nhất.
    - Ghi nhận chi tiết trạng thái từng bước vào checkpoint.
    """

    async def execute_full_license_hierarchy_chain(
        self,
        school_identifier: str,
        order_details: Dict[str, Any],
        sales_admin_creds: Dict[str, str],
        cof_file_path: Optional[str] = None,
        checkpoint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Quy trình Trọn Gói Master E2E Chain có Step Engine & Checkpoint.
        Nếu truyền vào checkpoint từ lần chạy trước, hệ thống sẽ bỏ qua các bước đã hoàn tất.
        """
        from app.services.workspace_lineage_service import workspace_lineage_service
        from app.services.google_drive_service import google_drive_service

        checkpoint = checkpoint or {}
        logs = []

        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [TRỌN GÓI 4-IN-1] Bắt đầu quy trình (State Machine) cho trường: '{school_identifier}'")

        # ------------------------------------------------------------------
        # BƯỚC 0: PHÂN GIẢI PHẢ HỆ (LINEAGE RESOLUTION)
        # ------------------------------------------------------------------
        lineage = workspace_lineage_service.resolve_by_school(school_identifier)
        if not lineage:
            err = f"Không tìm thấy phả hệ của trường '{school_identifier}' trong cơ sở dữ liệu!"
            log_step(f"❌ {err}")
            return {
                "status": "failed",
                "current_step": "resolve_lineage",
                "error": err,
                "checkpoint": checkpoint,
                "logs": "\n".join(logs)
            }

        school_creds = lineage["school"]
        partner_creds = lineage["partner"]
        distributor_creds = lineage["distributor"]
        country_info = lineage.get("country", {})

        # ------------------------------------------------------------------
        # BƯỚC 1: LƯU TRỮ COF LÊN GOOGLE DRIVE (NẾU CÓ & CHƯA LƯU)
        # ------------------------------------------------------------------
        drive_link = checkpoint.get("drive_link", "")
        if not drive_link and cof_file_path and os.path.exists(cof_file_path):
            log_step("📁 [BƯỚC 1 - DRIVE] Đang tải file COF lên thư mục trường trên Google Drive...")
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
                checkpoint["drive_link"] = drive_link
                log_step(f"✅ [BƯỚC 1 - DRIVE] File COF đã được lưu: {drive_link}")
            except Exception as e:
                log_step(f"⚠️ [BƯỚC 1 - DRIVE] Lỗi tải Drive (không chặn tiến trình chính): {e}")

        if drive_link:
            notes = order_details.get("additional_notes", "")
            if "COF Drive:" not in notes:
                order_details["additional_notes"] = f"{notes}\nCOF Drive: {drive_link}".strip()

        # ------------------------------------------------------------------
        # BƯỚC 2: SCHOOL TẠO ORDER (CÓ KIỂM TRA TRÙNG LẶP / RESUME)
        # ------------------------------------------------------------------
        order_code = checkpoint.get("order_code") or order_details.get("existing_order_code")

        if order_code:
            log_step(f"⏩ [BƯỚC 2 - SCHOOL] Tìm thấy Order Code đã có sẵn từ Checkpoint: [{order_code}]. Bỏ qua tạo mới!")
        else:
            log_step(f"🏫 [BƯỚC 2 - SCHOOL] Đang tạo Order mới cho trường '{school_creds.get('name')}'...")
            school_res = await self.school_create_order(school_creds, order_details)
            if school_res.get("status") != "success":
                err_detail = school_res.get("error", "Lỗi tạo Order tại School")
                log_step(f"❌ [LỖI TẠO ORDER]: {err_detail}")
                return {
                    "status": "failed",
                    "current_step": "school_create_order",
                    "error": err_detail,
                    "checkpoint": checkpoint,
                    "logs": "\n".join(logs)
                }

            order_code = school_res.get("order_code")
            checkpoint["order_code"] = order_code
            log_step(f"✅ [BƯỚC 2 - SCHOOL] Đã tạo Order thành công: [{order_code}]")

        # ------------------------------------------------------------------
        # BƯỚC 3: PHÂN PHỐI VÀ DUYỆT LICENSE (LEO CẤP TỰ ĐỘNG)
        # ------------------------------------------------------------------
        license_approved = checkpoint.get("license_approved", False)
        if license_approved:
            log_step(f"⏩ [BƯỚC 3 - LICENSE] Order [{order_code}] đã được duyệt License ở phiên trước. Bỏ qua!")
        else:
            log_step(f"🤝 [BƯỚC 3 - LICENSE] Kích hoạt chuỗi phê duyệt License cho [{order_code}]...")
            license_res = await self.execute_approve_school_order_standalone(
                order_identifier=order_code,
                partner_creds=partner_creds,
                distributor_creds=distributor_creds,
                sales_admin_creds=sales_admin_creds,
                courses_needed=order_details.get("courses", []),
                checkpoint=checkpoint
            )
            if license_res.get("status") != "success":
                err_detail = license_res.get("error", "Lỗi cấp phép License")
                log_step(f"❌ [LỖI CẤP PHÉP LICENSE]: {err_detail}")
                return {
                    "status": "failed",
                    "current_step": "license_cascade",
                    "error": err_detail,
                    "checkpoint": checkpoint,
                    "logs": "\n".join(logs)
                }

            checkpoint["license_approved"] = True
            log_step(f"✅ [BƯỚC 3 - LICENSE] Đã cấp phép License thành công cho [{order_code}]!")

        # ------------------------------------------------------------------
        # BƯỚC 4: GHI DANH HỌC VIÊN TRÊN SCHOOL WORKSPACE (NẾU CÓ)
        # ------------------------------------------------------------------
        student_emails = order_details.get("student_emails", [])
        enrollment_done = checkpoint.get("enrollment_done", False)

        if student_emails and not enrollment_done:
            first_course = order_details.get("courses", [{}])[0]
            course_name = first_course.get("course_name", "")
            log_step(f"🎓 [BƯỚC 4 - ENROLL] Ghi danh {len(student_emails)} học viên vào '{course_name}'...")

            enroll_res = await self.school_enroll_users_and_groups(
                credentials=school_creds,
                course_name=course_name,
                start_date=first_course.get("start_date", "2026-09-01"),
                end_date=first_course.get("end_date", "2027-05-31"),
                school_name=school_creds.get("name", ""),
                group_name_raw=order_details.get("group_name", "Class"),
                student_emails=student_emails,
                teacher_emails=order_details.get("teacher_emails", [])
            )

            if enroll_res.get("status") not in ["success", "completed"]:
                err_detail = enroll_res.get("error", "Lỗi ghi danh tại School Workspace")
                log_step(f"⚠️ [BƯỚC 4 - ENROLL] Ghi danh gặp sự cố: {err_detail}")
                return {
                    "status": "partial_success",
                    "current_step": "school_enroll_users",
                    "order_code": order_code,
                    "checkpoint": checkpoint,
                    "error": err_detail,
                    "logs": "\n".join(logs)
                }

            checkpoint["enrollment_done"] = True
            checkpoint["group_name"] = enroll_res.get("group_name")
            log_step(f"✅ [BƯỚC 4 - ENROLL] Hoàn tất phân nhóm & ghi danh: {enroll_res.get('group_name')}")
        elif enrollment_done:
            log_step("⏩ [BƯỚC 4 - ENROLL] Học viên đã được ghi danh ở phiên trước. Bỏ qua!")

        # ------------------------------------------------------------------
        # HOÀN TẤT TOÀN BỘ CHUỖI 4-IN-1
        # ------------------------------------------------------------------
        log_step(f"🏁 HOÀN THÀNH 100% QUY TRÌNH MASTER E2E CHO ORDER [{order_code}]!")
        return {
            "status": "success",
            "order_code": order_code,
            "drive_link": drive_link,
            "checkpoint": checkpoint,
            "logs": "\n".join(logs)
        }

    async def execute_approve_school_order_standalone(
        self,
        order_identifier: str,
        partner_creds: Dict[str, str],
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None,
        checkpoint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Duyệt School Order theo chuẩn Boomerang Xuyên Suốt (Cascade Resolution)."""
        checkpoint = checkpoint or {}
        logs = []

        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [SUB-FLOW BOOMERANG] Bắt đầu duyệt School Order: [{order_identifier}]")

        # 1. Đọc chi tiết môn học thực tế từ School Order nếu chưa có (để giữ đúng ASP, SWRP...)
        if not courses_needed:
            log_step("🔍 Đang mở Order Details đọc chính xác danh sách môn học & số lượng của School...")
            detail_res = await self.fetch_school_order_detailed_courses(partner_creds, order_identifier)
            courses_needed = detail_res.get("courses", [])
            if courses_needed:
                log_step(f"📚 Đã bóc tách được {len(courses_needed)} môn học từ Order (Ví dụ: Category={courses_needed[0].get('category')}, Course={courses_needed[0].get('course_name')})")

        # 2. Thử duyệt tại Partner lần 1
        partner_res = await self.partner_approve_school_order(
            credentials=partner_creds,
            order_identifier=order_identifier,
            auto_create_prt_if_short=True,
            courses_needed=courses_needed
        )

        if partner_res.get("status") == "success":
            checkpoint["order_approved"] = True
            log_step(f"✅ Partner đã duyệt thành công School Order [{order_identifier}] ngay từ vòng đầu!")
            return {"status": "success", "order_code": order_identifier, "checkpoint": checkpoint, "current_step": "completed", "logs": "\n".join(logs)}

        # 3. Nếu kho Partner thiếu License, hệ thống đã tự động tạo PRT Contract (trả về status 'insufficient_pool_created_prt')
        if partner_res.get("status") == "insufficient_pool_created_prt":
            prt_code = partner_res.get("prt_contract_code")
            checkpoint["prt_contract_code"] = prt_code
            log_step(f"⚡ [BOOMERANG CHIỀU LÊN] Partner đã tạo xong PRT Contract [{prt_code}]. Đang chuyển lên Distributor duyệt cấp bù...")

            # 4. Kích hoạt Distributor (và Sales Admin nếu cần) duyệt PRT Contract vừa tạo
            prt_resolve_res = await self.execute_approve_partner_contract_standalone(
                contract_identifier=prt_code,
                distributor_creds=distributor_creds,
                sales_admin_creds=sales_admin_creds,
                courses_needed=courses_needed,
                checkpoint=checkpoint
            )
            if prt_resolve_res.get("status") != "success":
                err_prt = prt_resolve_res.get("error", "Lỗi duyệt PRT Contract ở tầng trên")
                log_step(f"❌ [LỖI CẤP BÙ TẦNG TRÊN]: {err_prt}")
                return {"status": "failed", "error": err_prt, "checkpoint": checkpoint, "current_step": "approve_prt_contract", "logs": "\n".join(logs)}

            checkpoint["prt_approved"] = True
            log_step(f"🎉 [BOOMERANG CHIỀU VỀ] Cấp bù thành công! Đang quay trở lại để Partner duyệt dứt điểm School Order [{order_identifier}]...")

            # 5. Chiếc boomerang quay trở lại đích: Partner duyệt lại School Order lần cuối
            final_res = await self.partner_approve_school_order(
                credentials=partner_creds,
                order_identifier=order_identifier,
                auto_create_prt_if_short=False, # Không tạo nữa vì đã có kho bù
                courses_needed=courses_needed
            )
            if final_res.get("status") != "success":
                err_final = final_res.get("error", "Lỗi Partner duyệt lại Order lần cuối")
                log_step(f"❌ {err_final}")
                return {"status": "failed", "error": err_final, "checkpoint": checkpoint, "current_step": "partner_final_approve", "logs": "\n".join(logs)}

            checkpoint["order_approved"] = True
            log_step(f"🏁 [BOOMERANG HOÀN TẤT] ĐÃ DUYỆT THÀNH CÔNG SCHOOL ORDER: [{order_identifier}]!")
            return {"status": "success", "order_code": order_identifier, "checkpoint": checkpoint, "current_step": "completed", "logs": "\n".join(logs)}

        err = partner_res.get("error", "Lỗi duyệt School Order tại Partner")
        log_step(f"❌ {err}")
        return {"status": "failed", "error": err, "checkpoint": checkpoint, "current_step": "partner_approve_school_order", "logs": "\n".join(logs)}
    

    async def execute_approve_partner_contract_standalone(
        self,
        contract_identifier: str,
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None,
        checkpoint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Duyệt Partner Contract 1-Session kèm lưu vết Checkpoint."""
        checkpoint = checkpoint or {}
        logs = []

        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [SUB-FLOW] Duyệt Partner Contract: [{contract_identifier}]")

        dist_res = await self.distributor_approve_partner_contract(
            credentials=distributor_creds,
            contract_identifier=contract_identifier,
            auto_create_dst_if_short=True,
            courses_needed=courses_needed
        )

        if dist_res.get("status") == "success":
            checkpoint["prt_approved"] = True
            log_step(f"✅ Distributor đã duyệt thành công Contract [{contract_identifier}]!")
            return {"status": "success", "contract_code": contract_identifier, "checkpoint": checkpoint, "current_step": "completed", "logs": "\n".join(logs)}

        if dist_res.get("status") == "insufficient_pool_created_dst":
            dst_code = dist_res.get("dst_contract_code")
            checkpoint["dst_contract_code"] = dst_code
            log_step(f"⚡ [1-SESSION] Đã tạo DST Contract [{dst_code}]. Đang chuyển Sales Admin duyệt...")

            # 1. Sales Admin duyệt DST Contract
            admin_res = await self.admin_approve_distributor_contract(sales_admin_creds, dst_code)
            if admin_res.get("status") != "success":
                return {"status": "failed", "error": admin_res.get("error"), "checkpoint": checkpoint, "current_step": "admin_approve_dst", "logs": "\n".join(logs)}

            checkpoint["dst_approved"] = True

            # 2. Distributor duyệt lại PRT Contract
            log_step(f"🎉 Sales Admin đã cấp phép [{dst_code}]. Distributor duyệt lại PRT [{contract_identifier}]...")
            final_res = await self.distributor_approve_partner_contract(
                credentials=distributor_creds,
                contract_identifier=contract_identifier,
                auto_create_dst_if_short=False
            )
            if final_res.get("status") != "success":
                return {"status": "failed", "error": final_res.get("error"), "checkpoint": checkpoint, "current_step": "distributor_approve_prt", "logs": "\n".join(logs)}

            checkpoint["prt_approved"] = True
            log_step(f"🏁 ĐÃ DUYỆT THÀNH CÔNG PARTNER CONTRACT: [{contract_identifier}]!")
            return {"status": "success", "contract_code": contract_identifier, "checkpoint": checkpoint, "current_step": "completed", "logs": "\n".join(logs)}

        err = dist_res.get("error", "Lỗi duyệt Partner Contract")
        log_step(f"❌ {err}")
        return {"status": "failed", "error": err, "checkpoint": checkpoint, "current_step": "distributor_approve_prt_contract", "logs": "\n".join(logs)}

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