# backend/app/services/workspace/account_service.py
import os
import re
import json
import asyncio
import logging
from typing import Optional, Dict, Any
from playwright.async_api import async_playwright

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners

logger = logging.getLogger(__name__)


def is_status_done(status_val: Any) -> bool:
    """Kiểm tra trạng thái hoàn thành: Nhận diện cả số 1, '1' lẫn chữ 'Done'."""
    s = str(status_val or "").strip().lower()
    return s in ["1", "done", "completed", "success", "approved"]


class WorkspaceAccountService(WorkspaceBaseService):
    """Xử lý nộp file batch tạo tài khoản học sinh/giáo viên qua Direct API Sniffer & Playwright."""

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

        # -------------------------------------------------------------
        # RESUME CHECKPOINT: Nếu đã có request_id trước đó, chuyển sang kiểm tra kết quả
        # -------------------------------------------------------------
        existing_req_id = checkpoint.get("account_batch_request_id")
        if existing_req_id:
            logger.info(f"⏩ [CHECKPOINT] Đã có sẵn Request ID #{existing_req_id}. Chuyển sang kiểm tra kết quả...")
            check_res = await self.check_and_export_batch_result(credentials, existing_req_id, download_dir)
            check_res["checkpoint"] = checkpoint
            return check_res

        async with acquire_playwright_slot("Submit Account Creation Batch"):
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
                    await wait_for_dom_and_spinners(page, "input[type='file']", min_pacing_ms=500)

                    # 1. Nộp file vào input[type='file']
                    file_input = page.locator("input[type='file']").first
                    await file_input.wait_for(state="visible", timeout=15000)
                    await file_input.set_input_files(upload_file_path)
                    logger.info(f"📄 Đã nạp file '{os.path.basename(upload_file_path)}', chờ nút Upload...")

                    await asyncio.sleep(1.5)

                    upload_btn = page.locator("button:has-text('Upload')").first
                    await upload_btn.wait_for(state="visible", timeout=15000)

                    # ---------------------------------------------------------
                    # 🎯 TẦNG 1: LẮNG NGHE STREAMING RESPONSE (Chống Protocol Error)
                    # ---------------------------------------------------------
                    captured_request_id = None

                    async def capture_upload_response(response):
                        nonlocal captured_request_id
                        if "uploadFileAccount.php" in response.url:
                            try:
                                body_data = await response.json()
                                if isinstance(body_data, dict):
                                    rid = body_data.get("request_id") or body_data.get("id")
                                    if rid:
                                        captured_request_id = str(rid).strip()
                                        logger.info(f"🎉 [TẦNG 1 - STREAMING] Bắt được Request ID ngay khi upload: #{captured_request_id}")
                            except Exception:
                                pass

                    page.on("response", capture_upload_response)

                    logger.info("🚀 Bấm nút Upload xác nhận nộp file...")
                    await upload_btn.click()

                    # Chờ 3s để phản hồi mạng hoàn tất
                    await asyncio.sleep(3.0)

                    # ---------------------------------------------------------
                    # 🎯 TẦNG 2: DÒ TÌM QUA API getListRequest.php
                    # ---------------------------------------------------------
                    school_id = await page.evaluate("() => window.user?.school_id || 10266")
                    initial_status = "0"

                    if not captured_request_id:
                        logger.info(f"🔍 [TẦNG 2] Đang dò Request ID qua getListRequest.php (School #{school_id})...")
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
                                    logger.info(f"🎉 [TẦNG 2 - API] Bắt được Request ID: #{captured_request_id}")
                                    break
                            except Exception:
                                pass
                            await asyncio.sleep(2.0)

                    # ---------------------------------------------------------
                    # 🎯 TẦNG 3: BẢO HIỂM TỐI CAO - ĐỌC THẲNG TỪ BẢNG GIAO DIỆN
                    # ---------------------------------------------------------
                    if not captured_request_id:
                        logger.info("🔍 [TẦNG 3 - BẢO HIỂM] Mở trang danh sách đọc trực tiếp dòng đầu của bảng...")
                        await page.goto(
                            f"{BASE_WORKSPACE_URL}/school-workspace/account-creation",
                            wait_until="domcontentloaded",
                            timeout=30000
                        )
                        await asyncio.sleep(2.0)
                        captured_request_id = await page.evaluate("""() => {
                            const firstRow = document.querySelector('.MuiDataGrid-row, tbody tr');
                            if (!firstRow) return null;
                            return firstRow.getAttribute('data-id') || firstRow.querySelector('[data-field="id"]')?.textContent?.trim() || firstRow.querySelector('td')?.textContent?.trim();
                        }""")
                        if captured_request_id:
                            logger.info(f"🎉 [TẦNG 3 - DOM] Bắt được Request ID từ bảng: #{captured_request_id}")

                    if not captured_request_id:
                        err_msg = "Không thể trích xuất Request ID từ hệ thống sau khi nộp file."
                        logger.error(f"❌ {err_msg}")
                        return {"status": "failed", "error": err_msg, "checkpoint": checkpoint}

                    request_id = captured_request_id
                    checkpoint["account_batch_request_id"] = request_id
                    logger.info(f"✅ KHẲNG ĐỊNH REQUEST ID CUỐI CÙNG: [ #{request_id} ]")

                    # =============================================================
                    # 🚀 FAST-PATH: Nếu đã Done ngay từ đầu (Mã 1 hoặc Done)
                    # =============================================================
                    if is_status_done(initial_status):
                        logger.info(f"✨ [Fast-Path Tức Thì] Request #{request_id} đã Done! Đang xuất file...")
                        return await self.check_and_export_batch_result(credentials, request_id, download_dir)

                    if record_count <= 30 and request_id:
                        logger.info(f"⚡ [Fast-Path] Thăm dò nhanh trạng thái cho Request #{request_id} (tối đa 15s)...")
                        for fast_attempt in range(1, 4):
                            await asyncio.sleep(4.0)
                            try:
                                api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                                api_res = await page.request.get(api_url)
                                raw_text = await api_res.text()
                                if str(request_id) in raw_text:
                                    match = re.search(rf'"{request_id}".*?"status"\s*:\s*"?([^",\s}}]+)"?', raw_text, re.DOTALL)
                                    stat = match.group(1) if match else ""
                                    if is_status_done(stat):
                                        logger.info(f"✨ [Fast-Path SUCCESS] Request #{request_id} đã Done! Đang xuất file...")
                                        return await self.check_and_export_batch_result(credentials, request_id, download_dir)
                            except Exception:
                                pass

                    # Nếu chưa xong, chuyển sang waiting_poll để Cronjob tiếp quản
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
        """Kiểm tra trạng thái bằng API (nhận diện status=1) và dùng ô Search tải file Export."""
        os.makedirs(download_dir, exist_ok=True)
        async with acquire_playwright_slot(f"Check Batch Result #{request_id}"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(
                        page, credentials.get("username", ""), credentials.get("password", ""), "School"
                    )
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    school_id = credentials.get("school_id") or "10266"

                    # 1. Kiểm tra trạng thái qua API getListRequest.php
                    try:
                        api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                        api_res = await page.request.get(api_url)
                        raw_text = await api_res.text()
                        
                        match = re.search(rf'"{request_id}".*?"status"\s*:\s*"?([^",\s}}]+)"?', raw_text, re.DOTALL)
                        status_found = match.group(1) if match else ""
                        logger.info(f"📊 Trạng thái kiểm tra từ getListRequest cho Request #{request_id}: '{status_found}'")
                        
                        # 🎯 CHỈ KHI NÀO CHƯA PHẢI MÃ 1 HOẶC DONE THÌ MỚI BÁO STILL_PROCESSING!
                        if not is_status_done(status_found):
                            return {
                                "status": "still_processing",
                                "current_status": status_found,
                                "request_id": request_id
                            }
                    except Exception as e:
                        logger.debug(f"API check notice: {e}")

                    # 2. Mở trang danh sách để tải file Export
                    logger.info(f"📥 Trạng thái đã Done! Mở trang Account Creation để tải file cho Request #{request_id}...")
                    await page.goto(
                        f"{BASE_WORKSPACE_URL}/school-workspace/account-creation",
                        wait_until="domcontentloaded",
                        timeout=35000
                    )
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row, .MuiInputBase-input", min_pacing_ms=800)

                    # 3. Gõ Request ID vào ô Search để lọc cô lập dòng
                    search_input = page.locator(".MuiTextField-root:has-text('Search') input, input.MuiInputBase-input, input[id*='r24']").first
                    if await search_input.count() > 0:
                        logger.info(f"🔍 Điền Request ID '#{request_id}' vào ô Search...")
                        await search_input.fill(str(request_id))
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(1.2)

                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=800)

                    # 4. Bấm nút Actions (Icon menu 3 gạch) của dòng đó
                    action_btn = page.locator(
                        f".MuiDataGrid-row[data-id='{request_id}'] [data-field='actions'] button, "
                        f".MuiDataGrid-row:has-text('{request_id}') [data-field='actions'] button, "
                        f"[data-field='actions'] button, button:has(.lucide-menu)"
                    ).first

                    if await action_btn.count() == 0:
                        return {"status": "failed", "error": f"Không tìm thấy nút Actions cho Request #{request_id}"}

                    await action_btn.click()
                    logger.info("📂 Đã mở menu Actions, đang chờ popup Export xuất hiện...")
                    await asyncio.sleep(0.6)

                    # 5. Bấm Export và hứng file tải về
                    async with page.expect_download(timeout=30000) as download_info:
                        export_item = page.locator(
                            "li[role='menuitem']:has-text('Export'), "
                            "li:has-text('Export'), "
                            "div:has-text('Export')"
                        ).first
                        await export_item.click()

                    download = await download_info.value
                    download_file_path = os.path.join(download_dir, f"RESULT_{request_id}_{download.suggested_filename}")
                    await download.save_as(download_file_path)

                    logger.info(f"✨ TẢI FILE KẾT QUẢ THÀNH CÔNG: {download_file_path}")

                    return {
                        "status": "completed",
                        "request_id": request_id,
                        "result_file_path": download_file_path
                    }

                except Exception as e:
                    logger.error(f"❌ Lỗi xuất file Request #{request_id}: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()