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

                    # 1. Nộp file vào input[type='file'] (Xử lý client local)
                    file_input = page.locator("input[type='file']").first
                    await file_input.wait_for(state="visible", timeout=15000)
                    await file_input.set_input_files(upload_file_path)
                    logger.info(f"📄 Đã nạp file '{os.path.basename(upload_file_path)}', chờ React kích hoạt nút Upload...")

                    await asyncio.sleep(1.5)

                    upload_btn = page.locator("button:has-text('Upload')").first
                    await upload_btn.wait_for(state="visible", timeout=15000)

                    # 2. Bấm Upload và ĐÓN TRỰC TIẾP RESPONSE CỦA uploadFileAccount.php (Chứa request_id)
                    logger.info("🚀 Bấm nút Upload và đón phản hồi trực tiếp từ API uploadFileAccount.php...")
                    request_id = None
                    try:
                        async with page.expect_response(
                            lambda r: "uploadFileAccount.php" in r.url and r.status == 200,
                            timeout=35000
                        ) as resp_info:
                            await upload_btn.click()
                        
                        upload_resp = await resp_info.value
                        resp_data = await upload_resp.json()
                        logger.info(f"📥 Phản hồi JSON từ uploadFileAccount.php: {resp_data}")

                        # 🎯 Tóm sống Request ID ngay tại đây!
                        if isinstance(resp_data, dict):
                            raw_id = resp_data.get("request_id") or resp_data.get("id")
                            if raw_id:
                                request_id = str(raw_id).strip()
                    except Exception as e:
                        logger.warning(f"Lỗi khi bắt response uploadFileAccount.php: {e}")

                    # Fallback dự phòng: Nếu vì lý do mạng chưa bắt được, dò nhanh qua getListRequest.php
                    if not request_id:
                        school_id = await page.evaluate("() => window.user?.school_id || 10266")
                        try:
                            api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                            api_res = await page.request.get(api_url)
                            raw_text = await api_res.text()
                            match = re.search(r'"(?:id|request_id)"\s*:\s*"?(\d+)"?', raw_text)
                            if match:
                                request_id = match.group(1)
                        except Exception:
                            pass

                    if not request_id:
                        err_msg = "Không thể trích xuất Request ID từ API uploadFileAccount.php."
                        logger.error(f"❌ {err_msg}")
                        return {"status": "failed", "error": err_msg, "checkpoint": checkpoint}

                    logger.info(f"🎉 BẮT ĐƯỢC REQUEST ID CHUẨN XÁC 100%: [ #{request_id} ]!")
                    checkpoint["account_batch_request_id"] = request_id

                    # =============================================================
                    # 🚀 FAST-PATH: Nếu batch nhỏ (<= 30 tài khoản)
                    # =============================================================
                    if record_count <= 30 and request_id:
                        logger.info(f"⚡ [Fast-Path] Thăm dò nhanh trạng thái cho Request #{request_id} (tối đa 15s)...")
                        school_id = await page.evaluate("() => window.user?.school_id || 10266")
                        for fast_attempt in range(1, 4):
                            await asyncio.sleep(4.0)
                            try:
                                api_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                                api_res = await page.request.get(api_url)
                                raw_text = await api_res.text()
                                # Kiểm tra xem request_id này đã Done chưa
                                if f'"{request_id}"' in raw_text or str(request_id) in raw_text:
                                    match = re.search(rf'"{request_id}".*?"status"\s*:\s*"([^"]+)"', raw_text, re.DOTALL)
                                    stat = match.group(1).lower() if match else ""
                                    if any(w in stat for w in ["done", "completed", "success"]):
                                        logger.info(f"✨ [Fast-Path SUCCESS] Request #{request_id} đã Done! Đang xuất file kết quả...")
                                        return await self.check_and_export_batch_result(credentials, request_id, download_dir)
                            except Exception as f_err:
                                logger.debug(f"Fast-path attempt {fast_attempt} notice: {f_err}")

                    # Nếu chưa xong hoặc batch lớn, chuyển sang waiting_poll cho Cronjob
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
                        
                        match = re.search(rf'"{request_id}".*?"status"\s*:\s*"([^"]+)"', raw_text, re.DOTALL)
                        status_found = match.group(1) if match else ""
                        logger.info(f"📊 Trạng thái kiểm tra từ getListRequest cho Request #{request_id}: '{status_found}'")
                        
                        if status_found and not any(w in status_found.lower() for w in ["done", "completed", "success"]):
                            return {
                                "status": "still_processing",
                                "current_status": status_found,
                                "request_id": request_id
                            }
                    except Exception as e:
                        logger.debug(f"API check notice: {e}")

                    # 2. Mở trang danh sách để tải file Export
                    logger.info(f"📥 Mở trang Account Creation để tải file cho Request #{request_id}...")
                    await page.goto(
                        f"{BASE_WORKSPACE_URL}/school-workspace/account-creation",
                        wait_until="domcontentloaded",
                        timeout=35000
                    )
                    await wait_for_dom_and_spinners(page, "input[placeholder*='Search'], input[type='text']", min_pacing_ms=800)

                    # 3. Gõ Request ID vào ô Search để cô lập duy nhất 1 dòng (Theo ý tưởng của anh Hùng!)
                    search_input = page.locator("input[placeholder*='Search'], input[id*='r24'], .MuiInputBase-input").first
                    if await search_input.count() > 0:
                        logger.info(f"🔍 Điền Request ID '#{request_id}' vào ô Search...")
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