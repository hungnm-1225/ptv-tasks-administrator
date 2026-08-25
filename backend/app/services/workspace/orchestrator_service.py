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
    """Bộ điều phối liên luồng: Trọn Gói 4-in-1 và Chuỗi Liên Hoàn Leo Cấp Tự Động (Cascade Resolution)."""

    async def execute_full_license_hierarchy_chain(
        self,
        school_identifier: str,
        order_details: Dict[str, Any],
        sales_admin_creds: Dict[str, str],
        cof_file_path: Optional[str] = None
    ) -> Dict[str, Any]:
        from app.services.workspace_lineage_service import workspace_lineage_service
        from app.services.google_drive_service import google_drive_service
        
        logs = []
        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [TRỌN GÓI 4-IN-1] Bắt đầu quy trình toàn trình cho trường: '{school_identifier}'")

        lineage = workspace_lineage_service.resolve_by_school(school_identifier)
        if not lineage:
            err = f"Không tìm thấy phả hệ của trường '{school_identifier}' trong cơ sở dữ liệu!"
            log_step(f"❌ {err}")
            return {"status": "failed", "error": err, "logs": "\n".join(logs)}

        school_creds = lineage["school"]
        partner_creds = lineage["partner"]
        distributor_creds = lineage["distributor"]
        country_info = lineage.get("country", {})

        drive_link = ""
        if cof_file_path and os.path.exists(cof_file_path):
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
                log_step(f"📁 Đã lưu trữ file COF lên Google Drive: {drive_link}")
            except Exception as e:
                log_step(f"⚠️ Lỗi phụ Google Drive: {e}")

        if drive_link:
            notes = order_details.get("additional_notes", "")
            order_details["additional_notes"] = f"{notes}\nCOF Drive: {drive_link}".strip()

        # BƯỚC 1: School tạo Order
        log_step(f"🏫 [BƯỚC 1 - SCHOOL] Đang tạo Order cho trường '{school_creds.get('name')}'...")
        school_res = await self.school_create_order(school_creds, order_details)
        if school_res.get("status") != "success":
            err_detail = school_res.get("error", "Lỗi tạo Order tại School")
            log_step(f"❌ [LỖI SCHOOL]: {err_detail}")
            return {"status": "failed", "step": "school_create_order", "error": err_detail, "logs": "\n".join(logs)}

        order_code = school_res.get("order_code")
        log_step(f"✅ [BƯỚC 1] School đã tạo Order thành công: [{order_code}]")

        # BƯỚC 2: Phân phối License (Tự động leo ngọn nếu thiếu)
        log_step(f"🤝 [BƯỚC 2 - LICENSE] Kích hoạt chuỗi phân phối License cho [{order_code}]...")
        license_res = await self.execute_approve_school_order_standalone(
            order_identifier=order_code,
            partner_creds=partner_creds,
            distributor_creds=distributor_creds,
            sales_admin_creds=sales_admin_creds,
            courses_needed=order_details.get("courses", [])
        )
        if license_res.get("status") != "success":
            return {"status": "failed", "step": "license_cascade", "error": license_res.get("error"), "logs": "\n".join(logs)}

        log_step(f"✅ [BƯỚC 2] Đã duyệt và cấp phép License thành công cho [{order_code}]!")

        # BƯỚC 3: Ghi danh LMS (nếu có danh sách email)
        student_emails = order_details.get("student_emails", [])
        if student_emails:
            first_course = order_details.get("courses", [{}])[0]
            log_step(f"🎓 [BƯỚC 3 - LMS ENROLL] Đang ghi danh {len(student_emails)} học viên vào '{first_course.get('course_name')}'...")
            enroll_res = await self.school_enroll_users_and_groups(
                credentials=school_creds,
                course_name=first_course.get("course_name", ""),
                start_date=first_course.get("start_date", "2026-09-01"),
                end_date=first_course.get("end_date", "2027-05-31"),
                school_name=school_creds.get("name", ""),
                group_name_raw=order_details.get("group_name", "Class"),
                student_emails=student_emails,
                teacher_emails=order_details.get("teacher_emails", [])
            )
            log_step(f"✅ [BƯỚC 3] Ghi danh hoàn tất: {enroll_res.get('group_name')}")

        log_step(f"🏁 HOÀN THÀNH 100% QUY TRÌNH TRỌN GÓI 4-IN-1 CHO ORDER [{order_code}]!")
        return {
            "status": "success",
            "order_code": order_code,
            "drive_link": drive_link,
            "logs": "\n".join(logs)
        }

    async def execute_approve_school_order_standalone(
        self,
        order_identifier: str,
        partner_creds: Dict[str, str],
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Duyệt School Order đơn lẻ:
        - Thử duyệt tại Partner.
        - Nếu thiếu License -> Partner tạo PRT -> Distributor duyệt -> Nếu thiếu Distributor tạo DST -> Sales Admin duyệt -> Đổ ngược xuống hoàn tất!
        """
        logs = []
        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [SUB-FLOW] Duyệt School Order đơn lẻ: [{order_identifier}]")

        partner_res = await self.partner_approve_school_order(partner_creds, order_identifier)
        if partner_res.get("status") == "success":
            log_step(f"✅ Partner đã duyệt thành công School Order [{order_identifier}]!")
            return {"status": "success", "order_code": order_identifier, "logs": "\n".join(logs)}

        if partner_res.get("status") != "insufficient_pool":
            err = partner_res.get("error", "Lỗi duyệt Order tại Partner")
            log_step(f"❌ {err}")
            return {"status": "failed", "error": err, "logs": "\n".join(logs)}

        # Kho thiếu -> Bóc tách môn học trong đơn
        if not courses_needed:
            log_step("🔍 Kho thiếu License! Đang mở Order Details đọc thông tin môn học & số lượng cần cấp bù...")
            detail_res = await self.fetch_school_order_detailed_courses(partner_creds, order_identifier)
            courses_needed = detail_res.get("courses", [])

        if not courses_needed:
            courses_needed = [{"category": "SWRP", "course_name": None, "licenses": 50}]

        # 1. Partner tạo PRT Contract
        log_step(f"📝 Tạo PRT Contract xin {len(courses_needed)} môn từ Distributor '{distributor_creds.get('name')}'...")
        prt_contract = await self.partner_create_contract(partner_creds, {
            "notes": f"Auto-topup to approve School Order {order_identifier}",
            "courses": courses_needed
        })
        if prt_contract.get("status") != "success":
            return {"status": "failed", "error": prt_contract.get("error"), "logs": "\n".join(logs)}

        prt_code = prt_contract.get("contract_code")
        log_step(f"✅ Đã tạo Contract PRT: [{prt_code}]")

        # 2. Distributor duyệt PRT Contract (Tự động leo lên Sales Admin nếu Distributor cũng thiếu)
        prt_resolve_res = await self.execute_approve_partner_contract_standalone(
            contract_identifier=prt_code,
            distributor_creds=distributor_creds,
            sales_admin_creds=sales_admin_creds,
            courses_needed=courses_needed
        )
        if prt_resolve_res.get("status") != "success":
            return {"status": "failed", "error": prt_resolve_res.get("error"), "logs": "\n".join(logs)}

        # 3. Partner duyệt lại School Order lần cuối
        log_step(f"🤝 Partner duyệt lại School Order [{order_identifier}] lần cuối...")
        final_res = await self.partner_approve_school_order(partner_creds, order_identifier)
        if final_res.get("status") != "success":
            return {"status": "failed", "error": final_res.get("error"), "logs": "\n".join(logs)}

        log_step(f"🏁 ĐÃ DUYỆT THÀNH CÔNG SCHOOL ORDER: [{order_identifier}]!")
        return {"status": "success", "order_code": order_identifier, "logs": "\n".join(logs)}

    async def execute_approve_partner_contract_standalone(
        self,
        contract_identifier: str,
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Duyệt Partner Contract:
        - TỐI ƯU 1-SESSION: Distributor kiểm tra kho, nếu thiếu thì tự động tạo DST Contract luôn trong 1 phiên!
        - Sau đó Sales Admin duyệt DST -> Distributor duyệt lại PRT hoàn tất!
        """
        logs = []
        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [SUB-FLOW] Duyệt Partner Contract: [{contract_identifier}]")

        # Gọi hàm duyệt (có bật auto_create_dst_if_short=True chạy 1 phiên)
        dist_res = await self.distributor_approve_partner_contract(
            credentials=distributor_creds,
            contract_identifier=contract_identifier,
            auto_create_dst_if_short=True,
            courses_needed=courses_needed
        )

        if dist_res.get("status") == "success":
            log_step(f"✅ Distributor đã duyệt thành công Contract [{contract_identifier}]!")
            return {"status": "success", "contract_code": contract_identifier, "logs": "\n".join(logs)}

        # Nếu đã tự động tạo xong DST Contract trong cùng 1 phiên
        if dist_res.get("status") == "insufficient_pool_created_dst":
            dst_code = dist_res.get("dst_contract_code")
            log_step(f"⚡ [1-SESSION] Đã tạo xong DST Contract [{dst_code}]. Đang chuyển Sales Admin duyệt...")

            # 1. Sales Admin duyệt DST Contract
            admin_res = await self.admin_approve_distributor_contract(sales_admin_creds, dst_code)
            if admin_res.get("status") != "success":
                return {"status": "failed", "error": admin_res.get("error"), "logs": "\n".join(logs)}

            # 2. Distributor duyệt lại Partner Contract (kho đã đủ License)
            log_step(f"🎉 Sales Admin đã cấp phép [{dst_code}]. Distributor duyệt lại Partner Contract [{contract_identifier}]...")
            final_res = await self.distributor_approve_partner_contract(
                credentials=distributor_creds,
                contract_identifier=contract_identifier,
                auto_create_dst_if_short=False
            )
            if final_res.get("status") != "success":
                return {"status": "failed", "error": final_res.get("error"), "logs": "\n".join(logs)}

            log_step(f"🏁 ĐÃ DUYỆT THÀNH CÔNG PARTNER CONTRACT: [{contract_identifier}]!")
            return {"status": "success", "contract_code": contract_identifier, "logs": "\n".join(logs)}

        # Nếu lỗi khác
        err = dist_res.get("error", "Lỗi duyệt Partner Contract")
        log_step(f"❌ {err}")
        return {"status": "failed", "error": err, "logs": "\n".join(logs)}

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