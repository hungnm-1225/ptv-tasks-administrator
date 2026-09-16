# backend/app/services/workspace/account_service.py
import os
import re
import json
import asyncio
import logging
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import httpx
from playwright.async_api import async_playwright

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot

logger = logging.getLogger(__name__)


def is_status_done(status_val: Any) -> bool:
    """Nhận diện mã 1, '1' hoặc chữ Done/Completed/Success là hoàn thành."""
    s = str(status_val or "").strip().lower()
    return s in ["1", "done", "completed", "success", "approved"]


def generate_excel_from_api_data(user_records: List[Dict[str, Any]], output_file_path: str):
    """Sinh file Excel kết quả chuẩn mực từ mảng JSON của exportData.php."""
    wb = Workbook()
    try:
        ws = wb.active
        ws.title = "Accounts Result"

        headers = [
            "No.", "First Name (*)", "Last Name (*)", "Username (*)", 
            "Password (*)", "Email (*)", "Mobile number", "Date of Birth (*)", 
            "Role (*)", "Status"
        ]
        ws.append(headers)

        header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
        header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        thin_border = Border(
            left=Side(style='thin', color='D9D9D9'),
            right=Side(style='thin', color='D9D9D9'),
            top=Side(style='thin', color='D9D9D9'),
            bottom=Side(style='thin', color='D9D9D9')
        )

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for idx, item in enumerate(user_records, 1):
            is_created = item.get("is_create", False)
            status_label = "Created" if is_created else "Already Exists"
            
            row_data = [
                idx,
                item.get("firstname", ""),
                item.get("lastname", ""),
                item.get("username", ""),
                item.get("password", ""),
                item.get("email", ""),
                item.get("phone", ""),
                item.get("dob", ""),
                item.get("role", ""),
                status_label
            ]
            ws.append(row_data)

            for col_idx in range(1, len(row_data) + 1):
                c = ws.cell(row=idx + 1, column=col_idx)
                c.border = thin_border
                c.font = Font(name="Arial", size=9)
                if col_idx in [1, 8, 9, 10]:
                    c.alignment = Alignment(horizontal="center")

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = col[0].column_letter
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
        wb.save(output_file_path)
        logger.info(f"📁 [DIRECT EXCEL] Đã tạo thành công file Excel ({len(user_records)} tài khoản): {output_file_path}")
    finally:
        wb.close()
        del wb


class WorkspaceAccountService(WorkspaceBaseService):
    """
    Xử lý nộp file batch tạo tài khoản học sinh/giáo viên qua Direct API Sniffer & Playwright.
    ĐỘNG CƠ HYBRID V3.6: Parse Excel cục bộ -> HTTPX nộp batch -> HTTPX Poll định kỳ (Zero RAM).
    """

    # =========================================================================
    # 🛠️ HELPER NỘI BỘ: BỐC SESSION PLAYWRIGHT CỰC NHANH
    # =========================================================================
    async def _steal_school_session(self, username: str, password: str) -> Tuple[Dict[str, str], Dict[str, Any]]:
        """Đăng nhập Playwright 3s bốc Cookie School và thông tin phả hệ."""
        async with acquire_playwright_slot("School Auth Session", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, username, password, "School")
                    if not is_ok:
                        raise RuntimeError(f"Đăng nhập School thất bại: {login_err}")

                    wp_identity = await page.evaluate("""() => {
                        const u = window.user || {};
                        let localUser = {};
                        try { localUser = JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) {}
                        return {
                            school_id: u.school_id || localUser.school_id || '10266',
                            partner_id: u.partner_id || localUser.partner_id || '60',
                            username: u.username || localUser.username || ''
                        };
                    }""")

                    cookies = await context.cookies()
                    cookies_dict = {c["name"]: c["value"] for c in cookies}
                    return cookies_dict, wp_identity
                finally:
                    await browser.close()

    @staticmethod
    def _parse_excel_accounts(file_path: str) -> List[Dict[str, str]]:
        """Bóc tách nhanh danh sách tài khoản từ file Excel phôi chuẩn."""
        accounts = []
        wb = openpyxl.load_workbook(file_path, data_only=True)
        try:
            ws = wb.active
            # Tìm dòng tiêu đề (thường ở hàng 5) và quét dữ liệu từ hàng 6
            start_row = 6
            for r in range(start_row, ws.max_row + 1):
                first_name = str(ws.cell(row=r, column=2).value or "").strip()
                last_name = str(ws.cell(row=r, column=3).value or "").strip()
                email = str(ws.cell(row=r, column=5).value or "").strip().lower()
                
                if not email or "@" not in email:
                    continue

                mobile = str(ws.cell(row=r, column=4).value or "").strip()
                dob_raw = ws.cell(row=r, column=6).value
                dob = "01/01/2016"
                if dob_raw:
                    if isinstance(dob_raw, datetime):
                        dob = dob_raw.strftime("%d/%m/%Y")
                    else:
                        dob = str(dob_raw).strip()

                role_raw = str(ws.cell(row=r, column=7).value or "student").strip().lower()
                role = "teacher" if "teach" in role_raw or "gv" in role_raw else "student"
                note = str(ws.cell(row=r, column=8).value or "").strip()

                accounts.append({
                    "firstName": first_name,
                    "lastName": last_name,
                    "mobileNumber": mobile,
                    "email": email,
                    "dob": dob,
                    "role": role,
                    "note": note
                })
        finally:
            wb.close()
        return accounts

    @staticmethod
    def _to_multipart(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        return {k: (None, str(v) if v is not None else "") for k, v in data_dict.items()}

    # =========================================================================
    # 📥 XUẤT KẾT QUẢ & KHÔI PHỤC USERNAME CHUẨN TỪ KEYCLOAK
    # =========================================================================
    async def _download_export_file_httpx(
        self,
        client: httpx.AsyncClient,
        request_id: str,
        download_dir: str,
        standard_input_file: Optional[str] = None
    ) -> str:
        """Gọi API exportData.php qua HTTPX, khôi phục username Keycloak và ghi file."""
        from app.services.cof_excel_service import COFExcelService

        os.makedirs(download_dir, exist_ok=True)
        result_excel_path = os.path.join(download_dir, f"RESULT_{request_id}_accounts.xlsx")

        logger.info(f"📥 [DIRECT HTTPX] Truy vấn exportData.php cho Request #{request_id}...")
        try:
            payload = {"request_id": str(request_id), "type": "preview"}
            export_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/exportData.php"
            res = await client.post(export_url, files=self._to_multipart(payload))

            if res.status_code == 200:
                raw_records = res.json()
                if isinstance(raw_records, list) and len(raw_records) > 0:
                    logger.info(f"✨ Lấy được {len(raw_records)} tài khoản từ exportData.php!")

                    # 🎯 KHÔI PHỤC USERNAME ĐÚNG QUA KEYCLOAK CHO TÀI KHOẢN ĐÃ TỒN TẠI
                    from app.services.keycloak_service import keycloak_service
                    emails_to_sync = []
                    for item in raw_records:
                        if not item.get("is_create", False):
                            em = str(item.get("email") or "").strip().lower()
                            if em and "@" in em:
                                emails_to_sync.append(em)

                    emails_to_sync = list(dict.fromkeys(emails_to_sync))

                    if emails_to_sync:
                        logger.info(f"🔍 Phát hiện {len(emails_to_sync)} tài khoản đã tồn tại! Kích hoạt Keycloak Sync để khôi phục username thật...")
                        keycloak_map = await keycloak_service.sync_existing_users_passwords(emails_to_sync)

                        for item in raw_records:
                            em = str(item.get("email") or "").strip().lower()
                            if em in keycloak_map:
                                kc_info = keycloak_map[em]
                                item["username"] = kc_info.get("username") or em.split('@')[0]
                                item["password"] = em  # Mật khẩu chuẩn Pythaverse là Email
                                item["is_keycloak_synced"] = True

                    # Ghi ngược kết quả vào file Excel
                    logger.info(f"📝 Đang ghi {len(raw_records)} tài khoản chuẩn hóa ngược vào file kết quả...")
                    if standard_input_file and os.path.exists(standard_input_file):
                        COFExcelService.write_results_back_to_standard_accounts(
                            standard_file_path=standard_input_file,
                            api_user_records=raw_records,
                            output_file_path=result_excel_path
                        )
                    else:
                        generate_excel_from_api_data(raw_records, result_excel_path)

                    return result_excel_path
        except Exception as e:
            logger.error(f"❌ Lỗi exportData.php qua HTTPX: {e}")

        return result_excel_path

    # =========================================================================
    # 🚀 NỘP BATCH TẠO TÀI KHOẢN (DIRECT API SIÊU TỐC)
    # =========================================================================
    async def submit_account_creation_batch(
        self,
        credentials: Dict[str, str],
        upload_file_path: str,
        record_count: int,
        download_dir: str = "/tmp/ptv_results",
        checkpoint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Nộp danh sách tạo tài khoản trực tiếp qua uploadFileAccount.php và createMultipleUser.php."""
        os.makedirs(download_dir, exist_ok=True)
        checkpoint = checkpoint or {}

        existing_req_id = checkpoint.get("account_batch_request_id")
        if existing_req_id and str(existing_req_id).strip() not in ["None", "null", ""]:
            logger.info(f"⏩ [CHECKPOINT] Đã có Request ID #{existing_req_id}. Đi lấy file kết quả...")
            return await self.check_and_export_batch_result(credentials, existing_req_id, download_dir)

        try:
            # 1. Bốc session School siêu tốc
            cookies, identity = await self._steal_school_session(
                credentials.get("username", ""), 
                credentials.get("password", "")
            )
            school_id = identity.get("school_id") or "10266"
            partner_id = identity.get("partner_id") or "60"

            # 2. Parse file Excel trực tiếp bằng Python
            accounts = self._parse_excel_accounts(upload_file_path)
            if not accounts:
                return {"status": "failed", "error": "Không trích xuất được tài khoản nào từ file Excel tải lên."}

            logger.info(f"📄 Đã bóc tách {len(accounts)} tài khoản từ file. Chuẩn bị nộp batch qua Direct API...")

            # 3. Dựng payload nộp batch
            payload: Dict[str, str] = {
                "schoolId": str(school_id),
                "partnerId": str(partner_id),
                "fileName": os.path.basename(upload_file_path)
            }
            for idx, acc in enumerate(accounts):
                payload[f"accounts[{idx}][firstName]"] = acc["firstName"]
                payload[f"accounts[{idx}][lastName]"] = acc["lastName"]
                payload[f"accounts[{idx}][mobileNumber]"] = acc["mobileNumber"]
                payload[f"accounts[{idx}][email]"] = acc["email"]
                payload[f"accounts[{idx}][dob]"] = acc["dob"]
                payload[f"accounts[{idx}][role]"] = acc["role"]
                payload[f"accounts[{idx}][note]"] = acc["note"]

            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=40.0) as client:
                # Bước 1: Gửi danh sách lên uploadFileAccount.php
                upload_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/uploadFileAccount.php"
                t0 = asyncio.get_event_loop().time()
                up_res = await client.post(upload_url, files=self._to_multipart(payload))
                elapsed = round((asyncio.get_event_loop().time() - t0) * 1000, 1)

                if up_res.status_code != 200:
                    return {"status": "failed", "error": f"Lỗi uploadFileAccount: {up_res.text}"}

                up_json = up_res.json()
                request_id = str(up_json.get("request_id") or up_json.get("id", "")).strip()

                if not request_id:
                    return {"status": "failed", "error": "Không lấy được request_id từ phản hồi upload."}

                logger.info(f"🎉 NỘP DANH SÁCH THÀNH CÔNG TRONG {elapsed}ms! Request ID: [ #{request_id} ]")

                # Bước 2: Kích hoạt Background Processing qua createMultipleUser.php
                trigger_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/createMultipleUser.php"
                trig_payload = {"request_id": request_id, "status": "1"}
                await client.post(trigger_url, files=self._to_multipart(trig_payload))
                logger.info(f"🚀 Đã kích hoạt lệnh tạo tài khoản ngầm cho Request #{request_id}!")

                checkpoint["account_batch_request_id"] = request_id

                # Fast-Path kiểm tra nhanh nếu số lượng ít (<= 20 tài khoản)
                if len(accounts) <= 20:
                    logger.info(f"⚡ [Fast-Path] Thăm dò nhanh trạng thái Request #{request_id}...")
                    for _ in range(3):
                        await asyncio.sleep(2.5)
                        chk_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                        chk_res = await client.get(chk_url)
                        if chk_res.status_code == 200:
                            req_list = chk_res.json().get("data", {}).get("accountData", [])
                            matched_req = next((r for r in req_list if str(r.get("id")) == request_id), None)
                            if matched_req and is_status_done(matched_req.get("status")):
                                logger.info(f"✨ [Fast-Path SUCCESS] Request #{request_id} đã Done! Đang kéo file kết quả...")
                                result_path = await self._download_export_file_httpx(client, request_id, download_dir, upload_file_path)
                                return {
                                    "status": "completed",
                                    "request_id": request_id,
                                    "result_file_path": result_path,
                                    "fast_path": True,
                                    "checkpoint": checkpoint
                                }

                return {
                    "status": "waiting_poll",
                    "request_id": request_id,
                    "record_count": len(accounts),
                    "estimated_wait_seconds": len(accounts) * 10,
                    "checkpoint": checkpoint
                }

        except Exception as e:
            logger.error(f"❌ Lỗi submit_account_creation_batch: {e}")
            return {"status": "failed", "error": str(e), "checkpoint": checkpoint}

    # =========================================================================
    # ⏳ CRONJOB POLL KẾT QUẢ ĐỊNH KỲ (100% PURE HTTPX - KHÔNG CẦN PLAYWRIGHT)
    # =========================================================================
    async def check_and_export_batch_result(
        self,
        credentials: Dict[str, str],
        request_id: str,
        download_dir: str
    ) -> Dict[str, Any]:
        """Cronjob 10 phút kiểm tra tiến độ và tải kết quả thuần HTTPX (Zero RAM Render)."""
        os.makedirs(download_dir, exist_ok=True)
        if not request_id or str(request_id).strip() in ["None", "null", ""]:
            return {"status": "failed", "error": "Request ID không hợp lệ"}

        try:
            # 1. Bốc session School siêu nhẹ
            cookies, identity = await self._steal_school_session(
                credentials.get("username", ""), 
                credentials.get("password", "")
            )
            school_id = identity.get("school_id") or credentials.get("school_id") or "10266"

            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                # 2. Kiểm tra trạng thái Request
                chk_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                chk_res = await client.get(chk_url)
                
                if chk_res.status_code == 200:
                    req_list = chk_res.json().get("data", {}).get("accountData", [])
                    matched_req = next((r for r in req_list if str(r.get("id")) == str(request_id)), None)
                    
                    if matched_req:
                        current_status = str(matched_req.get("status", "")).strip()
                        logger.info(f"📊 Trạng thái Request #{request_id}: '{current_status}'")

                        if not is_status_done(current_status):
                            return {
                                "status": "still_processing",
                                "current_status": current_status,
                                "request_id": request_id
                            }

                # 3. Khi đã Done: Xuất file kết quả & khôi phục Keycloak
                result_path = await self._download_export_file_httpx(client, request_id, download_dir)
                return {
                    "status": "completed",
                    "request_id": request_id,
                    "result_file_path": result_path
                }

        except Exception as e:
            logger.error(f"❌ Lỗi check_and_export_batch_result: {e}")
            return {"status": "failed", "error": str(e)}

workspace_account_service = WorkspaceAccountService()