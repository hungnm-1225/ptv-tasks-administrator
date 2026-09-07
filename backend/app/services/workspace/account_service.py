# backend/app/services/workspace/account_service.py
import os
import re
import json
import asyncio
import logging
from typing import Optional, Dict, Any
from playwright.async_api import async_playwright, Page

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners

logger = logging.getLogger(__name__)


def is_status_done(status_val: Any) -> bool:
    """Nhận diện mã 1, '1' hoặc chữ Done/Completed/Success là hoàn thành."""
    s = str(status_val or "").strip().lower()
    return s in ["1", "done", "completed", "success", "approved"]


class WorkspaceAccountService(WorkspaceBaseService):
    """Xử lý nộp file batch tạo tài khoản học sinh/giáo viên qua Direct API Sniffer & Playwright."""

    async def _download_export_file(
        self,
        page: Page,
        request_id: str,
        download_dir: str
    ) -> str:
        """Hàm nội bộ: Dùng tab trình duyệt đang mở để Search và tải file Export (Không xin Semaphore)."""
        os.makedirs(download_dir, exist_ok=True)
        
        logger.info(f"📥 [EXPORT] Mở trang danh sách để tải file cho Request #{request_id}...")
        await page.goto(
            f"{BASE_WORKSPACE_URL}/school-workspace/account-creation",
            wait_until="domcontentloaded",
            timeout=35000
        )
        await wait_for_dom_and_spinners(page, ".MuiDataGrid-row, .MuiInputBase-input", min_pacing_ms=800)

        # 1. Gõ Request ID vào ô Search để cô lập đúng 1 dòng duy nhất
        search_input = page.locator(".MuiTextField-root:has-text('Search') input, input.MuiInputBase-input, input[id*='r24']").first
        if await search_input.count() > 0:
            logger.info(f"🔍 [EXPORT] Điền #{request_id} vào ô Search...")
            await search_input.fill(str(request_id))
            await page.keyboard.press("Enter")
            await asyncio.sleep(1.2)

        await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=800)

        # 2. Bấm nút Actions (Icon menu 3 gạch)
        action_btn = page.locator(
            f".MuiDataGrid-row[data-id='{request_id}'] [data-field='actions'] button, "
            f".MuiDataGrid-row:has-text('{request_id}') [data-field='actions'] button, "
            f"[data-field='actions'] button, button:has(.lucide-menu)"
        ).first

        if await action_btn.count() == 0:
            raise RuntimeError(f"Không tìm thấy nút Actions cho Request #{request_id}")

        await action_btn.click()
        logger.info("📂 [EXPORT] Đã mở menu Actions, chờ nút Export...")
        await asyncio.sleep(0.6)

        # 3. Bấm Export và tải file
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
        logger.info(f"✨ [EXPORT THÀNH CÔNG] File kết quả: {download_file_path}")
        return download_file_path

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

        # Nếu đã có request_id trước đó, chuyển sang kiểm tra kết quả
        existing_req_id = checkpoint.get("account_batch_request_id")
        if existing_req_id:
            logger.info(f"⏩ [CHECKPOINT] Đã có Request ID #{existing_req_id}. Đi tải file...")
            return await self.check_and_export_batch_result(credentials, existing_req_id, download_dir)

        async with acquire_playwright_slot("Submit Account Creation Batch"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(
                        page, credentials.get("username", ""), credentials.get("password", ""), "School"
                    )
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "checkpoint": checkpoint}

                    logger.info("📂 Đang mở trang Tạo tài khoản hàng loạt...")
                    await page.goto(
                        f"{BASE_WORKSPACE_URL}/school-workspace/account-creation/create",
                        wait_until="domcontentloaded",
                        timeout=35000
                    )
                    await wait_for_dom_and_spinners(page, "input[type='file']", min_pacing_ms=500)

                    # 1. Nộp file
                    file_input = page.locator("input[type='file']").first
                    await file_input.wait_for(state="visible", timeout=15000)
                    await file_input.set_input_files(upload_file_path)
                    logger.info(f"📄 Đã nạp file '{os.path.basename(upload_file_path)}', chờ nút Upload...")
                    await asyncio.sleep(1.5)

                    upload_btn = page.locator("button:has-text('Upload')").first
                    await upload_btn.wait_for(state="visible", timeout=15000)

                    # 2. Bấm Upload
                    logger.info("🚀 Bấm nút Upload xác nhận nộp file...")
                    await upload_btn.click()
                    await asyncio.sleep(2.0)

                    # 3. Dò Request ID qua API getListRequest.php
                    school_id = await page.evaluate("() => window.user?.school_id || 10266")
                    logger.info(f"🏫 School ID: {school_id}. Đang lấy Request ID...")

                    request_id = None
                    initial_status = "0"

                    for attempt in range(1, 4):
                        try:
                            api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                            api_res = await page.request.get(api_url)
                            raw_text = await api_res.text()

                            try:
                                api_data = json.loads(raw_text)
                                items = api_data if isinstance(api_data, list) else api_data.get("data") or api_data.get("rows") or [api_data]
                                if items and isinstance(items, list) and len(items) > 0:
                                    newest = items[0]
                                    if isinstance(newest, dict):
                                        request_id = str(newest.get("id") or newest.get("request_id") or "").strip()
                                        initial_status = str(newest.get("status") or "")
                            except Exception:
                                match = re.search(r'"(?:id|request_id)"\s*:\s*"?(\d+)"?', raw_text)
                                if match:
                                    request_id = match.group(1)

                            if request_id:
                                logger.info(f"🎉 BẮT ĐƯỢC REQUEST ID: [ #{request_id} ] | Status: '{initial_status}'")
                                break
                        except Exception:
                            pass
                        await asyncio.sleep(2.0)

                    if not request_id:
                        return {"status": "failed", "error": "Không lấy được Request ID sau khi upload", "checkpoint": checkpoint}

                    checkpoint["account_batch_request_id"] = request_id

                    # =============================================================
                    # 🚀 FAST-PATH: Nếu đã Done -> DÙNG LUÔN PAGE NÀY TẢI FILE (KHÔNG DEADLOCK!)
                    # =============================================================
                    if is_status_done(initial_status):
                        logger.info(f"✨ [Fast-Path] Request #{request_id} đã Done! Tải file ngay tại chỗ...")
                        downloaded_path = await self._download_export_file(page, request_id, download_dir)
                        return {
                            "status": "completed",
                            "request_id": request_id,
                            "result_file_path": downloaded_path,
                            "fast_path": True,
                            "checkpoint": checkpoint
                        }

                    # Nếu là batch nhỏ (<= 30 tài khoản), đợi thăm dò thêm vài giây
                    if record_count <= 30 and request_id:
                        logger.info(f"⚡ [Fast-Path] Đợi thăm dò Request #{request_id} hoàn tất...")
                        for fast_attempt in range(1, 4):
                            await asyncio.sleep(3.5)
                            try:
                                api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                                api_res = await page.request.get(api_url)
                                raw_text = await api_res.text()
                                if str(request_id) in raw_text:
                                    match = re.search(rf'"{request_id}".*?"status"\s*:\s*"?([^",\s}}]+)"?', raw_text, re.DOTALL)
                                    stat = match.group(1) if match else ""
                                    if is_status_done(stat):
                                        logger.info(f"✨ [Fast-Path] Request #{request_id} đã Done! Tải file ngay...")
                                        downloaded_path = await self._download_export_file(page, request_id, download_dir)
                                        return {
                                            "status": "completed",
                                            "request_id": request_id,
                                            "result_file_path": downloaded_path,
                                            "fast_path": True,
                                            "checkpoint": checkpoint
                                        }
                            except Exception:
                                pass

                    # Nếu batch lớn hoặc chưa xong ngay, giao cho Cronjob
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
        """Dành riêng cho Cronjob chạy ngầm: Mở trình duyệt mới để check và tải file."""
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

                    # 1. Kiểm tra API trước
                    try:
                        api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                        api_res = await page.request.get(api_url)
                        raw_text = await api_res.text()
                        
                        match = re.search(rf'"{request_id}".*?"status"\s*:\s*"?([^",\s}}]+)"?', raw_text, re.DOTALL)
                        status_found = match.group(1) if match else ""
                        logger.info(f"📊 Cron check status Request #{request_id}: '{status_found}'")
                        
                        if not is_status_done(status_found):
                            return {
                                "status": "still_processing",
                                "current_status": status_found,
                                "request_id": request_id
                            }
                    except Exception as e:
                        logger.debug(f"API check notice: {e}")

                    # 2. Nếu đã Done: Gọi hàm tải file
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