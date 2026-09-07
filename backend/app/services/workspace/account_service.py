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
        # RESUME CHECKPOINT: Nếu đã có request_id trước đó, bỏ qua upload
        # -------------------------------------------------------------
        existing_req_id = checkpoint.get("account_batch_request_id")
        if existing_req_id:
            logger.info(f"⏩ [CHECKPOINT] Đã có sẵn Request ID #{existing_req_id} từ phiên trước. Chuyển sang kiểm tra kết quả...")
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
                    logger.info(f"📄 Đã nạp file '{os.path.basename(upload_file_path)}', chờ React kích hoạt nút Upload...")

                    await asyncio.sleep(1.5)

                    upload_btn = page.locator("button:has-text('Upload')").first
                    await upload_btn.wait_for(state="visible", timeout=15000)

                    # 2. Bấm Upload và đọc trực tiếp Response từ API createMultipleUser.php
                    logger.info("🚀 Bấm nút Upload và đón phản hồi từ API createMultipleUser.php...")
                    request_id = None
                    try:
                        async with page.expect_response(
                            lambda r: "createMultipleUser.php" in r.url and r.status == 200,
                            timeout=35000
                        ) as resp_info:
                            await upload_btn.click()
                        
                        create_resp = await resp_info.value
                        resp_text = await create_resp.text()
                        logger.info(f"📥 Phản hồi từ createMultipleUser.php: {resp_text[:300]}")
                        
                        # Thử bóc tách request_id trực tiếp từ response của createMultipleUser
                        try:
                            c_json = json.loads(resp_text)
                            if isinstance(c_json, dict):
                                request_id = str(c_json.get("id") or c_json.get("request_id") or c_json.get("data", {}).get("id") or "").strip()
                        except Exception:
                            # Fallback regex tìm số ID
                            match = re.search(r'"(?:id|request_id)"\s*:\s*"?(\d+)"?', resp_text)
                            if match:
                                request_id = match.group(1)
                    except Exception as e:
                        logger.warning(f"Chưa bắt kịp response createMultipleUser (tiếp tục dò qua getListRequest): {e}")

                    # Chờ 2s để CSDL trường cập nhật dòng mới
                    await asyncio.sleep(2.0)

                    # 3. Lấy school_id và truy vấn danh sách qua getListRequest.php
                    school_id = await page.evaluate("() => window.user?.school_id || 10266")
                    logger.info(f"🏫 School ID xác định: {school_id}. Đang truy vấn getListRequest.php...")

                    initial_status = "Creating Account"

                    # Nếu chưa có request_id từ bước 2, dò qua getListRequest.php
                    for attempt in range(1, 4):
                        if request_id:
                            break
                        try:
                            # Gọi API trực tiếp cấp HTTP qua Playwright request context
                            api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                            api_res = await page.request.get(api_url)
                            raw_text = await api_res.text()
                            logger.info(f"📋 Dữ liệu getListRequest (Nhịp {attempt}/3): {raw_text[:200]}...")

                            try:
                                api_data = json.loads(raw_text)
                                items = []
                                if isinstance(api_data, list):
                                    items = api_data
                                elif isinstance(api_data, dict):
                                    # Hỗ trợ mọi kiểu bọc dữ liệu: data, rows, requests, list...
                                    items = api_data.get("data") or api_data.get("rows") or api_data.get("requests") or api_data.get("list") or [api_data]

                                if items and isinstance(items, list) and len(items) > 0:
                                    newest = items[0]
                                    if isinstance(newest, dict):
                                        request_id = str(newest.get("id") or newest.get("request_id") or "").strip()
                                        initial_status = str(newest.get("status") or "")
                            except Exception:
                                # Fallback regex quét trực tiếp số ID đầu tiên
                                match = re.search(r'"(?:id|request_id)"\s*:\s*"?(\d+)"?', raw_text)
                                if match:
                                    request_id = match.group(1)

                            if request_id:
                                logger.info(f"🎉 BẮT ĐƯỢC REQUEST ID CHUẨN XÁC: [ #{request_id} ] | Trạng thái: '{initial_status}'")
                                break
                        except Exception as api_err:
                            logger.debug(f"Nhịp {attempt} gọi getListRequest notice: {api_err}")
                        
                        await asyncio.sleep(2.5)

                    if not request_id:
                        err_msg = "Không thể trích xuất Request ID từ API. Vui lòng kiểm tra lại log phản hồi của trường."
                        logger.error(f"❌ {err_msg}")
                        return {"status": "failed", "error": err_msg, "checkpoint": checkpoint}

                    checkpoint["account_batch_request_id"] = request_id

                    # =============================================================
                    # 🚀 FAST-PATH: Nếu batch nhỏ (<= 30 tài khoản) hoặc đã Done ngay
                    # =============================================================
                    if any(w in initial_status.lower() for w in ["done", "completed", "success"]):
                        logger.info(f"✨ [Fast-Path Tức Thì] Request #{request_id} đã Done sẵn! Đang xuất file...")
                        return await self.check_and_export_batch_result(credentials, request_id, download_dir)

                    if record_count <= 30 and request_id:
                        logger.info(f"⚡ [Fast-Path] Thăm dò nhanh trạng thái cho Request #{request_id} (tối đa 15s)...")
                        for fast_attempt in range(1, 4):
                            await asyncio.sleep(4.0)
                            try:
                                api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                                api_res = await page.request.get(api_url)
                                raw_text = await api_res.text()
                                if f'"{request_id}"' in raw_text or str(request_id) in raw_text:
                                    if any(w in raw_text.lower() for w in ["done", "completed", "success"]):
                                        logger.info(f"✨ [Fast-Path SUCCESS] Request #{request_id} đã Done! Đang tải file kết quả...")
                                        return await self.check_and_export_batch_result(credentials, request_id, download_dir)
                            except Exception as f_err:
                                logger.debug(f"Fast-path attempt {fast_attempt} notice: {f_err}")

                    # Nếu chưa xong, nhả về để Cronjob tiếp quản định kỳ
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
        """Kiểm tra trạng thái bằng API và dùng ô Search để cô lập dòng cần Export."""
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

                    # 1. Kiểm tra trạng thái nhanh qua API getListRequest.php
                    try:
                        api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                        api_res = await page.request.get(api_url)
                        raw_text = await api_res.text()
                        
                        # Nếu trong chuỗi JSON có request_id nhưng CHƯA có chữ Done/Completed
                        if str(request_id) in raw_text:
                            # Tìm trạng thái của request_id này
                            match = re.search(rf'"{request_id}".*?"status"\s*:\s*"([^"]+)"', raw_text, re.DOTALL)
                            status_found = match.group(1) if match else ""
                            logger.info(f"📊 Trạng thái kiểm tra từ API cho Request #{request_id}: '{status_found}'")
                            
                            if status_found and not any(w in status_found.lower() for w in ["done", "completed", "success"]):
                                return {
                                    "status": "still_processing",
                                    "current_status": status_found,
                                    "request_id": request_id
                                }
                    except Exception as e:
                        logger.debug(f"API check notice: {e}")

                    # 2. Khi trạng thái đã Done: Mở trang danh sách để tải file Export
                    logger.info(f"📥 Mở trang Account Creation để tải file cho Request #{request_id}...")
                    await page.goto(
                        f"{BASE_WORKSPACE_URL}/school-workspace/account-creation",
                        wait_until="domcontentloaded",
                        timeout=35000
                    )
                    await wait_for_dom_and_spinners(page, "input[placeholder*='Search'], input[type='text']", min_pacing_ms=800)

                    # 3. Gõ Request ID vào ô Search để cô lập dòng (Ý tưởng của anh Hùng!)
                    search_input = page.locator("input[placeholder*='Search'], input[id*='r24'], .MuiInputBase-input").first
                    if await search_input.count() > 0:
                        logger.info(f"🔍 Điền Request ID '#{request_id}' vào ô Search để lọc cô lập dòng...")
                        await search_input.fill(str(request_id))
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(1.0)

                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row, [role='row']", min_pacing_ms=1000)

                    # 4. Bấm nút Actions (Icon 3 gạch ngang) của dòng đó
                    action_btn = page.locator(
                        f".MuiDataGrid-row[data-id='{request_id}'] [data-field='actions'] button, "
                        f".MuiDataGrid-row:has-text('{request_id}') [data-field='actions'] button, "
                        f"[data-field='actions'] button"
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

                    logger.info(f"✨ TẢI FILE THÀNH CÔNG: {download_file_path}")

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