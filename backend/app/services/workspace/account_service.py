# backend/app/services/workspace/account_service.py
import os
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

                    # Chờ 1.5s để React MUI phân tích và gỡ thuộc tính disabled
                    await asyncio.sleep(1.5)

                    upload_btn = page.locator("button:has-text('Upload')").first
                    await upload_btn.wait_for(state="visible", timeout=15000)

                    # 2. Bấm Upload và bắt phản hồi từ API createMultipleUser.php
                    logger.info("🚀 Bấm nút Upload và đón phản hồi từ API createMultipleUser.php...")
                    try:
                        async with page.expect_response(
                            lambda r: "createMultipleUser.php" in r.url and r.status == 200,
                            timeout=30000
                        ):
                            await upload_btn.click()
                        logger.info("✅ API createMultipleUser.php đã phản hồi thành công (200 OK)!")
                    except Exception as e:
                        logger.warning(f"Chưa bắt kịp response createMultipleUser (tiếp tục theo dõi): {e}")

                    # Chờ 2s để server ghi nhận batch vào CSDL
                    await asyncio.sleep(2.0)

                    # 3. Lấy school_id từ session để gọi getListRequest.php bắt Request ID
                    school_id = await page.evaluate("() => window.user?.school_id || 10266")
                    logger.info(f"🏫 School ID xác định: {school_id}. Đang truy vấn trực tiếp getListRequest.php...")

                    request_id = None
                    initial_status = "Creating Account"

                    # Thăm dò 3 nhịp qua API getListRequest.php
                    for attempt in range(1, 4):
                        try:
                            api_data = await page.evaluate(f"""
                                fetch('/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}')
                                    .then(r => r.json())
                            """)
                            if isinstance(api_data, list) and len(api_data) > 0:
                                newest_item = api_data[0]
                                req_candidate = str(newest_item.get("id") or newest_item.get("request_id") or "").strip()
                                if req_candidate:
                                    request_id = req_candidate
                                    initial_status = str(newest_item.get("status") or "")
                                    logger.info(f"🎉 BẮT ĐƯỢC REQUEST ID CHUẨN XÁC TỪ API: [ #{request_id} ] | Trạng thái: '{initial_status}'")
                                    break
                        except Exception as api_err:
                            logger.debug(f"Nhịp {attempt}/3 gọi API getListRequest notice: {api_err}")
                        await asyncio.sleep(2.0)

                    if not request_id:
                        err_msg = "Không thể trích xuất Request ID từ API getListRequest.php sau khi nộp file."
                        logger.error(f"❌ {err_msg}")
                        return {"status": "failed", "error": err_msg, "checkpoint": checkpoint}

                    checkpoint["account_batch_request_id"] = request_id

                    # =============================================================
                    # 🚀 FAST-PATH: Nếu batch nhỏ (<= 30 tài khoản) hoặc đã Done ngay
                    # =============================================================
                    if "done" in initial_status.lower() or "completed" in initial_status.lower() or "success" in initial_status.lower():
                        logger.info(f"✨ [Fast-Path Tức Thì] Request #{request_id} đã hoàn tất ngay từ đầu! Đang xuất file...")
                        return await self.check_and_export_batch_result(credentials, request_id, download_dir)

                    if record_count <= 30 and request_id:
                        logger.info(f"⚡ [Fast-Path] Thăm dò nhanh trạng thái cho Request #{request_id} (tối đa 15s)...")
                        for fast_attempt in range(1, 4):
                            await asyncio.sleep(4.0)
                            try:
                                check_data = await page.evaluate(f"""
                                    fetch('/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}')
                                        .then(r => r.json())
                                """)
                                if isinstance(check_data, list):
                                    found = next((x for x in check_data if str(x.get("id")) == str(request_id)), None)
                                    if found and any(w in str(found.get("status", "")).lower() for w in ["done", "completed", "success"]):
                                        logger.info(f"✨ [Fast-Path SUCCESS] Request #{request_id} đã Done! Đang tải file kết quả...")
                                        return await self.check_and_export_batch_result(credentials, request_id, download_dir)
                            except Exception as f_err:
                                logger.debug(f"Fast-path attempt {fast_attempt} notice: {f_err}")

                    # Nếu chưa xong, nhả về để Cronjob tiếp quản định kỳ
                    return {
                        "status": "submitted",
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

                    # 1. Kiểm tra nhanh trạng thái qua API getListRequest.php trước
                    try:
                        api_data = await page.evaluate(f"""
                            fetch('/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}')
                                .then(r => r.json())
                        """)
                        if isinstance(api_data, list):
                            target_item = next((x for x in api_data if str(x.get("id")) == str(request_id)), None)
                            if target_item:
                                cur_status = str(target_item.get("status", "")).strip()
                                logger.info(f"📊 Trạng thái kiểm tra từ API cho Request #{request_id}: '{cur_status}'")
                                if not any(w in cur_status.lower() for w in ["done", "completed", "success"]):
                                    return {
                                        "status": "still_processing",
                                        "current_status": cur_status,
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

                    # 3. Gõ Request ID vào ô Search để lọc cô lập duy nhất 1 dòng (Theo ý tưởng của anh Hùng!)
                    search_input = page.locator("input[placeholder*='Search'], input[id*='r24'], .MuiInputBase-input").first
                    if await search_input.count() > 0:
                        logger.info(f"🔍 Điền Request ID '#{request_id}' vào ô Search để cô lập dòng...")
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
                    logger.info("📂 Đã bấm menu Actions, đang chờ popup Export xuất hiện...")
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