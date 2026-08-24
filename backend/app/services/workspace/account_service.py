# backend/app/services/workspace/account_service.py
import os
import logging
from typing import Dict, Any
from playwright.async_api import async_playwright

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL

logger = logging.getLogger(__name__)


class WorkspaceAccountService(WorkspaceBaseService):
    """Xử lý nộp file batch tạo tài khoản học sinh/giáo viên và Hybrid Fast-Check."""

    async def submit_account_creation_batch(
        self,
        credentials: Dict[str, str],
        upload_file_path: str,
        record_count: int,
        download_dir: str = "/tmp/ptv_results"
    ) -> Dict[str, Any]:
        os.makedirs(download_dir, exist_ok=True)

        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("input[type='file']", timeout=15000)

                file_input = page.locator("input[type='file']")
                await file_input.set_input_files(upload_file_path)
                await page.wait_for_timeout(2500)

                upload_btn = page.locator("//button[normalize-space()='Upload']")
                await upload_btn.wait_for(state="visible", timeout=10000)
                await upload_btn.click()

                try:
                    await page.wait_for_function("() => !window.location.href.includes('/create')", timeout=30000)
                except Exception:
                    pass

                if "account-creation" not in page.url:
                    await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation", wait_until="domcontentloaded", timeout=30000)

                await page.wait_for_selector(".MuiDataGrid-row, [role='row']", timeout=25000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                request_id = await first_row.get_attribute("data-id")
                
                if not request_id:
                    id_cell = first_row.locator("[data-field='id'] .MuiDataGrid-cellContent").first
                    request_id = (await id_cell.inner_text()).strip()

                logger.info(f"🎉 BẮT ĐƯỢC REQUEST ID: [ #{request_id} ] (Dự kiến: {record_count * 10}s)")

                # =============================================================
                # 🚀 FAST-PATH: Kiểm tra nhanh tại chỗ nếu batch vừa phải (<= 30 tài khoản)
                # =============================================================
                if record_count <= 30:
                    logger.info(f"⚡ [Fast-Path] Đang chờ 12s để thử lấy kết quả ngay cho Request #{request_id}...")
                    await page.wait_for_timeout(12000)
                    
                    # Refresh trang nhẹ nhàng để cập nhật trạng thái mới nhất
                    await page.reload(wait_until="networkidle")
                    await page.wait_for_selector(".MuiDataGrid-row", timeout=20000)

                    target_row = page.locator(f".MuiDataGrid-row[data-id='{request_id}'], .MuiDataGrid-row:has([data-field='id']:has-text('{request_id}'))").first
                    if await target_row.count() > 0:
                        status_cell = target_row.locator("[data-field='status'] .MuiDataGrid-cellContent").first
                        status_text = (await status_cell.inner_text()).strip().lower()

                        if any(w in status_text for w in ["done", "completed", "success"]):
                            logger.info(f"✨ [Fast-Path SUCCESS] Request #{request_id} đã hoàn tất tức thì! Đang tải file kết quả...")
                            action_btn = target_row.locator("[data-field='actions'] button").first
                            await action_btn.click()
                            await page.wait_for_timeout(1000)

                            async with page.expect_download() as download_info:
                                export_item = page.locator("text=Export, li:has-text('Export')").first
                                await export_item.click()

                            download = await download_info.value
                            download_file_path = os.path.join(download_dir, f"RESULT_{request_id}_{download.suggested_filename}")
                            await download.save_as(download_file_path)

                            return {
                                "status": "completed",
                                "request_id": request_id,
                                "result_file_path": download_file_path,
                                "fast_path": True
                            }

                # Nếu chưa xong, nhả về để Cronjob tiếp quản
                return {
                    "status": "submitted",
                    "request_id": request_id,
                    "record_count": record_count,
                    "estimated_wait_seconds": record_count * 10
                }

            except Exception as e:
                logger.error(f"❌ Lỗi submit batch: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    async def check_and_export_batch_result(
        self,
        credentials: Dict[str, str],
        request_id: str,
        download_dir: str
    ) -> Dict[str, Any]:
        os.makedirs(download_dir, exist_ok=True)
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/account-creation", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)

                target_row = page.locator(f".MuiDataGrid-row[data-id='{request_id}'], .MuiDataGrid-row:has([data-field='id']:has-text('{request_id}'))").first
                if await target_row.count() == 0:
                    return {"status": "not_found", "error": f"Không tìm thấy Request #{request_id}"}

                status_cell = target_row.locator("[data-field='status'] .MuiDataGrid-cellContent").first
                status_text = (await status_cell.inner_text()).strip()

                if "done" in status_text.lower() or "completed" in status_text.lower() or "success" in status_text.lower():
                    action_btn = target_row.locator("[data-field='actions'] button").first
                    await action_btn.click()
                    await page.wait_for_timeout(1000)

                    async with page.expect_download() as download_info:
                        export_item = page.locator("text=Export, li:has-text('Export')").first
                        await export_item.click()

                    download = await download_info.value
                    download_file_path = os.path.join(download_dir, f"RESULT_{request_id}_{download.suggested_filename}")
                    await download.save_as(download_file_path)

                    return {
                        "status": "completed",
                        "request_id": request_id,
                        "result_file_path": download_file_path
                    }
                else:
                    return {
                        "status": "still_processing",
                        "current_status": status_text,
                        "request_id": request_id
                    }

            except Exception as e:
                logger.error(f"❌ Lỗi kiểm tra Request #{request_id}: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()