# backend/app/services/workspace/account_service.py
import os
import re
import json
import asyncio
import logging
from typing import Optional, Dict, Any, List
from playwright.async_api import async_playwright, Page

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners

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
    """Xử lý nộp file batch tạo tài khoản học sinh/giáo viên qua Direct API Sniffer & Playwright."""

    async def _download_export_file(
        self,
        page: Page,
        request_id: str,
        download_dir: str,
        standard_input_file: Optional[str] = None
    ) -> str:
        """Gọi trực tiếp API exportData.php và ghi kết quả ngược vào file chuẩn."""
        from app.services.cof_excel_service import COFExcelService

        os.makedirs(download_dir, exist_ok=True)
        result_excel_path = os.path.join(download_dir, f"RESULT_{request_id}_accounts.xlsx")

        logger.info(f"📥 [DIRECT API] Đang truy vấn exportData.php cho Request #{request_id}...")
        try:
            raw_records = await page.evaluate(f"""
                async () => {{
                    const formData = new FormData();
                    formData.append('request_id', '{request_id}');
                    formData.append('type', 'preview');
                    const res = await fetch('/wp-content/plugins/school_workspace_v3/api/request_approval/exportData.php', {{
                        method: 'POST',
                        body: formData
                    }});
                    return await res.json();
                }}
            """)

            if isinstance(raw_records, list) and len(raw_records) > 0:
                logger.info(f"✨ Bắt được {len(raw_records)} tài khoản từ exportData.php! Đang ghi ngược vào file chuẩn...")
                if standard_input_file and os.path.exists(standard_input_file):
                    COFExcelService.write_results_back_to_standard_accounts(
                        standard_file_path=standard_input_file,
                        api_user_records=raw_records,
                        output_file_path=result_excel_path
                    )
                else:
                    generate_excel_from_api_data(raw_records, result_excel_path)

                return result_excel_path
        except Exception as api_err:
            logger.warning(f"Lỗi khi đọc API exportData.php: {api_err}")

        return result_excel_path

    async def submit_account_creation_batch(
        self,
        credentials: Dict[str, str],
        upload_file_path: str,
        record_count: int,
        download_dir: str = "/tmp/ptv_results",
        checkpoint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        os.makedirs(download_dir, exist_ok=True)
        checkpoint = checkpoint or {}

        existing_req_id = checkpoint.get("account_batch_request_id")
        if existing_req_id and str(existing_req_id).strip() not in ["None", "null", ""]:
            logger.info(f"⏩ [CHECKPOINT] Đã có Request ID #{existing_req_id}. Đi lấy file kết quả...")
            return await self.check_and_export_batch_result(credentials, existing_req_id, download_dir)

        async with acquire_playwright_slot("Submit Account Creation Batch", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(
                        page, credentials.get("username", ""), credentials.get("password", ""), "School"
                    )
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "checkpoint": checkpoint}

                    logger.info("📂 Đang mở trang Tạo tài khoản hàng loạt (/account-creation/create)...")
                    await page.goto(
                        f"{BASE_WORKSPACE_URL}/school-workspace/account-creation/create",
                        wait_until="domcontentloaded",
                        timeout=35000
                    )
                    await wait_for_dom_and_spinners(page, "input[type='file']", min_pacing_ms=400)

                    file_input = page.locator("input[type='file']").first
                    await file_input.wait_for(state="visible", timeout=15000)
                    await file_input.set_input_files(upload_file_path)
                    logger.info(f"📄 Đã nạp file '{os.path.basename(upload_file_path)}', sẵn sàng upload...")

                    upload_btn = page.locator("button:has-text('Upload')").first
                    await upload_btn.wait_for(state="visible", timeout=15000)

                    captured_request_id = None

                    # 🎯 LEVEL 2 NETWORK-AWARE: BẮT TRỰC TIẾP RESPONSE UPLOAD
                    try:
                        async with page.expect_response(
                            lambda r: "uploadFileAccount.php" in r.url and r.request.method == "POST",
                            timeout=30000
                        ) as upload_resp:
                            await upload_btn.click(force=True)

                        res = await upload_resp.value
                        if res.status == 200:
                            body_data = await res.json()
                            if isinstance(body_data, dict):
                                rid = body_data.get("request_id") or body_data.get("id")
                                if rid:
                                    captured_request_id = str(rid).strip()
                                    logger.info(f"🎉 Bắt được Request ID trực tiếp từ uploadFileAccount: #{captured_request_id}")
                    except Exception as e:
                        logger.warning(f"⚠️ Không bắt kịp response upload trực tiếp: {e}")

                    school_id = await page.evaluate("() => window.user?.school_id || 10266")
                    initial_status = "0"

                    # Fallback getListRequest nếu chưa có ID
                    if not captured_request_id:
                        for attempt in range(1, 4):
                            try:
                                raw_json = await page.evaluate(f"""
                                    fetch('/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}')
                                        .then(r => r.text())
                                """)
                                match = re.search(r'"(?:id|request_id)"\s*:\s*"?(\d+)"?', raw_json)
                                if match:
                                    captured_request_id = match.group(1)
                                    stat_match = re.search(r'"status"\s*:\s*"?([^",\s}}]+)"?', raw_json)
                                    if stat_match:
                                        initial_status = stat_match.group(1)
                                    break
                            except Exception:
                                pass
                            await asyncio.sleep(1.5)

                    # 🛑 BẢO VỆ TUYỆT ĐỐI: CHẶN ĐỨNG REQUEST_ID RỖNG
                    if not captured_request_id or str(captured_request_id).strip() in ["None", "null", ""]:
                        return {
                            "status": "failed", 
                            "error": "Không trích xuất được Request ID từ hệ thống sau khi nộp file.", 
                            "checkpoint": checkpoint
                        }

                    request_id = captured_request_id
                    checkpoint["account_batch_request_id"] = request_id
                    logger.info(f"✅ XÁC NHẬN REQUEST ID HỢP LỆ: [ #{request_id} ]")

                    # Fast-Path tức thì nếu hệ thống đã đánh dấu Done
                    if is_status_done(initial_status):
                        logger.info(f"✨ [Fast-Path Tức Thì] Request #{request_id} đã Done! Xuất file ngay...")
                        downloaded_path = await self._download_export_file(page, request_id, download_dir, standard_input_file=upload_file_path)
                        return {
                            "status": "completed",
                            "request_id": request_id,
                            "result_file_path": downloaded_path,
                            "fast_path": True,
                            "checkpoint": checkpoint
                        }

                    # Fast-Path chờ tối đa 12s cho batch <= 30 users
                    if record_count <= 30 and request_id:
                        logger.info(f"⚡ [Fast-Path] Thăm dò nhanh Request #{request_id}...")
                        for fast_attempt in range(1, 4):
                            await asyncio.sleep(3.0)
                            try:
                                api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                                api_res = await page.request.get(api_url)
                                raw_text = await api_res.text()
                                if str(request_id) in raw_text:
                                    match = re.search(rf'"{request_id}".*?"status"\s*:\s*"?([^",\s}}]+)"?', raw_text, re.DOTALL)
                                    stat = match.group(1) if match else ""
                                    if is_status_done(stat):
                                        logger.info(f"✨ [Fast-Path SUCCESS] Request #{request_id} đã Done! Xuất file...")
                                        downloaded_path = await self._download_export_file(page, request_id, download_dir, standard_input_file=upload_file_path)
                                        return {
                                            "status": "completed",
                                            "request_id": request_id,
                                            "result_file_path": downloaded_path,
                                            "fast_path": True,
                                            "checkpoint": checkpoint
                                        }
                            except Exception:
                                pass

                    return {
                        "status": "waiting_poll",
                        "request_id": request_id,
                        "record_count": record_count,
                        "estimated_wait_seconds": record_count * 15,
                        "checkpoint": checkpoint
                    }

                except Exception as e:
                    logger.error(f"❌ Lỗi submit batch: {e}")
                    return {"status": "failed", "error": str(e), "checkpoint": checkpoint}
                finally:
                    await browser.close()

    async def check_and_export_batch_result(
        self,
        credentials: Dict[str, str],
        request_id: str,
        download_dir: str
    ) -> Dict[str, Any]:
        """Cronjob định kỳ kiểm tra và xuất file trực tiếp từ API."""
        os.makedirs(download_dir, exist_ok=True)
        
        # Chặn ngay nếu request_id rỗng
        if not request_id or str(request_id).strip() in ["None", "null", ""]:
            return {"status": "failed", "error": "Request ID không hợp lệ"}

        async with acquire_playwright_slot(f"Check Batch Result #{request_id}", lane="cron"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(
                        page, credentials.get("username", ""), credentials.get("password", ""), "School"
                    )
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    school_id = credentials.get("school_id") or "10266"

                    # 1. Kiểm tra trạng thái qua API
                    try:
                        api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                        api_res = await page.request.get(api_url)
                        raw_text = await api_res.text()
                        
                        match = re.search(rf'"{request_id}".*?"status"\s*:\s*"?([^",\s}}]+)"?', raw_text, re.DOTALL)
                        status_found = match.group(1) if match else ""
                        logger.info(f"📊 Trạng thái kiểm tra Request #{request_id}: '{status_found}'")
                        
                        if not is_status_done(status_found):
                            return {
                                "status": "still_processing",
                                "current_status": status_found,
                                "request_id": request_id
                            }
                    except Exception as e:
                        logger.debug(f"API check notice: {e}")

                    # 2. Khi đã Done: Xuất file trực tiếp từ API exportData.php
                    downloaded_path = await self._download_export_file(page, request_id, download_dir)
                    return {
                        "status": "completed",
                        "request_id": request_id,
                        "result_file_path": downloaded_path
                    }

                except Exception as e:
                    logger.error(f"❌ Lỗi export file Request #{request_id}: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()