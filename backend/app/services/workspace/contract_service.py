# backend/app/services/workspace/contract_service.py
import re
import os
import gc
import json
import logging
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page, Response
from app.core.config import settings

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners, smart_wait_for_options_loaded

logger = logging.getLogger(__name__)


class WorkspaceContractService(WorkspaceBaseService):
    """Xử lý các nghiệp vụ tạo và phê duyệt Contract giữa Partner - Distributor - Sales Admin bằng cơ chế Event-Driven API."""

    async def _safe_navigate(self, page: Page, target_url: str, keyword_in_url: str = "", timeout: int = 35000):
        """Hàm điều hướng an toàn: chống lỗi net::ERR_ABORTED khi dính redirect SSO ngầm."""
        if keyword_in_url and keyword_in_url in page.url:
            logger.info(f"ℹ️ Trang đã ở sẵn tại URL đích: {page.url}")
            return

        try:
            await page.goto(target_url, wait_until="domcontentloaded", timeout=timeout)
        except Exception as e:
            err_msg = str(e)
            if "ERR_ABORTED" in err_msg or "frame was detached" in err_msg:
                logger.info(f"ℹ️ Bắt được cú redirect ngầm ({err_msg[:60]}...). Đang chờ trang ổn định...")
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=15000)
                except Exception:
                    pass
            else:
                raise e

    async def _fill_distributor_create_contract_form(
        self,
        page: Page,
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Hàm nội bộ: Điền form tạo Contract của Distributor trên phiên trình duyệt đang mở (Bắt API createOrder.php)."""
        logger.info("📝 Distributor mở: /distributor-workspace/contract-po/create...")
        
        try:
            async with page.expect_response(
                lambda r: "getListCourseConfig.php" in r.url and r.status == 200,
                timeout=20000
            ):
                await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create", "contract-po/create")
        except Exception:
            await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create", "contract-po/create")

        await wait_for_dom_and_spinners(page, "h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", min_pacing_ms=300)

        # 1. Chọn Contract Type = 'License'
        logger.info("📋 Bước 1: Chọn Contract Type = 'License'...")
        type_item = page.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Contract Type")).first
        type_select = type_item.locator("[role='combobox'], .MuiSelect-select").first
        await type_select.wait_for(state="visible", timeout=10000)
        await type_select.click(force=True)
        
        license_opt = page.locator("li[role='option']:has-text('License')").first
        await license_opt.wait_for(state="visible", timeout=8000)
        await license_opt.click(force=True)

        # 2. Điền Contract Notes
        notes = contract_data.get("notes") or contract_data.get("additional_notes") or "Auto-requested by PTV Automation Hub"
        notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[id*=':r']").first
        if await notes_input.count() > 0:
            await notes_input.fill(str(notes))

        # 3. Điền danh sách môn học
        courses = contract_data.get("courses", [])
        if not courses:
            courses = [{
                "category": contract_data.get("category", "SWRP"),
                "course_name": contract_data.get("course_name"),
                "licenses": contract_data.get("licenses", 100),
                "unit_price": contract_data.get("unit_price", 0)
            }]

        for idx, c in enumerate(courses):
            if idx > 0:
                logger.info(f"➕ Bấm 'Add Course' thêm môn #{idx + 1}...")
                add_btn = page.locator("button:has-text('Add Course')").first
                await add_btn.click(force=True)
                await wait_for_dom_and_spinners(page, f".MuiCard-root:has(label:has-text('License Category')) >> nth={idx}", min_pacing_ms=200)

            course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

            # A. Chọn License Category
            cat_val = c.get("category") or "SWRP"
            logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{cat_val}'...")
            cat_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License Category")).first
            cat_select = cat_item.locator("[role='combobox'], .MuiSelect-select").first
            await cat_select.click(force=True)
            
            cat_opt = page.locator(f"li[role='option']:has-text('{cat_val}')").first
            if await cat_opt.count() > 0:
                await cat_opt.click(force=True)
            else:
                await page.locator("li[role='option']").first.click(force=True)

            # B. Chọn Course
            course_name_val = c.get("course_name")
            logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
            course_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text=re.compile(r"^Course"))).first
            course_select = course_item.locator("[role='combobox'], .MuiSelect-select").first
            await course_select.wait_for(state="visible", timeout=10000)
            await course_select.click(force=True)

            await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)

            target_opt = None
            if course_name_val:
                target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first

            if target_opt and await target_opt.count() > 0:
                await target_opt.click(force=True)
            else:
                valid_opts = page.locator("li[role='option']:not(:has-text('Select Course'))")
                if await valid_opts.count() > 0:
                    await valid_opts.first.click(force=True)
                else:
                    await page.locator("li[role='option']").first.click(force=True)

            # C. Điền số lượng Licenses
            lic_qty = str(c.get("licenses", 100))
            logger.info(f"🔢 Môn #{idx + 1}: Điền License(s) = {lic_qty}...")
            lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
            lic_input = lic_item.locator("input[type='number']").first
            await lic_input.click(force=True)
            await page.keyboard.press("Control+A")
            await page.keyboard.type(lic_qty)

            # D. Điền Unit Price
            unit_price_val = str(c.get("unit_price", 0))
            price_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Unit Price")).first
            if await price_item.count() > 0:
                price_input = price_item.locator("input[type='number']").first
                if await price_input.count() > 0:
                    await price_input.click(force=True)
                    await page.keyboard.press("Control+A")
                    await page.keyboard.type(unit_price_val)

        # 4. Đính kèm tài liệu (nếu có)
        doc_path = contract_data.get("document_path") or contract_data.get("upload_file_path")
        if doc_path and os.path.exists(doc_path):
            logger.info(f"📎 Đang đính kèm tài liệu: {doc_path}...")
            file_input = page.locator("input#upload-documents, input[type='file']").first
            if await file_input.count() > 0:
                await file_input.set_input_files(doc_path)

        # 5. Bấm Create Contract/PO & BẮT TRỰC TIẾP API createOrder.php
        logger.info("🚀 Đang bấm nút 'Create Contract/PO' và quan sát API createOrder.php...")
        submit_btn = page.locator("button:has-text('Create Contract/PO')").last
        
        contract_num_id = ""
        contract_full_code = ""

        try:
            async with page.expect_response(
                lambda r: "createOrder.php" in r.url and r.request.method == "POST",
                timeout=25000
            ) as response_info:
                await submit_btn.click(force=True)

            res = await response_info.value
            if res.status in (200, 201):
                try:
                    res_json = await res.json()
                    logger.info(f"📥 API createOrder.php phản hồi: {res_json}")
                    
                    data_obj = res_json.get("data") if isinstance(res_json.get("data"), dict) else res_json
                    contract_num_id = str(data_obj.get("id") or data_obj.get("order_id") or "")
                    contract_full_code = str(
                        data_obj.get("order_code") or 
                        data_obj.get("contract_code") or 
                        data_obj.get("order_sale_id_format") or ""
                    )
                except Exception as e:
                    logger.warning(f"⚠️ Không parse được JSON từ createOrder: {e}")
        except Exception as e:
            logger.warning(f"⚠️ Không bắt kịp API createOrder.php ({e}), chuyển sang cào DataGrid DOM...")

        if not contract_full_code:
            try:
                await page.wait_for_url("**/distributor-workspace/contract-po", timeout=15000)
            except Exception:
                await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po", "contract-po")

            await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

            first_row = page.locator(".MuiDataGrid-row").first
            if await first_row.count() > 0:
                contract_num_id = await first_row.get_attribute("data-id") or ""
                code_elem = first_row.locator("[data-field='order_code'] a, [data-field='contract_code'] a, [data-field='order_code'], a").first
                contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

        if not contract_full_code and contract_num_id:
            contract_full_code = f"DST-{contract_num_id}"

        logger.info(f"🎉 TẠO DST CONTRACT THÀNH CÔNG: [{contract_full_code}] (ID: {contract_num_id})")
        return {
            "status": "success",
            "contract_id": contract_num_id,
            "contract_code": contract_full_code,
            "message": f"Distributor đã tạo Contract {contract_full_code} gửi Sales Admin thành công"
        }

    async def distributor_approve_partner_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        auto_create_dst_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Duyệt Partner Contract bằng cơ chế Khép góc Search & Direct Approve (hoặc Auto-DST nếu thiếu)."""
        async with acquire_playwright_slot("Distributor Approve Partner Contract", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("🏢 Mở giao diện Partner Contracts: /distributor-workspace/partner-contract-po...")
                    try:
                        async with page.expect_response(
                            lambda r: "getPartnerOrder.php" in r.url and r.status == 200,
                            timeout=25000
                        ):
                            await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", "partner-contract-po")
                    except Exception:
                        await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", "partner-contract-po")

                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row, [role='row']", min_pacing_ms=400)

                    search_code = str(contract_identifier or "").strip()
                    if search_code:
                        logger.info(f"🎯 [KHÉP GÓC DISTRIBUTOR] Gõ mã hợp đồng [{search_code}] vào ô Search...")
                        search_input = page.locator("input[placeholder*='Search'], .MuiTextField-root input, input[type='text']").first
                        if await search_input.count() > 0:
                            await search_input.click(force=True)
                            await page.keyboard.press("Control+A")
                            await page.keyboard.type(search_code)
                            await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=300)

                    target_row = page.locator(".MuiDataGrid-row").first
                    if search_code:
                        matched_row = page.locator(f".MuiDataGrid-row:has-text('{search_code}')").first
                        if await matched_row.count() > 0:
                            target_row = matched_row

                    if await target_row.count() == 0:
                        return {"status": "failed", "error": f"Không tìm thấy Partner Contract [{search_code}] trên danh sách Distributor!"}

                    row_text = (await target_row.inner_text()).lower()
                    if "approved" in row_text or "completed" in row_text:
                        logger.info(f"✨ Partner Contract [{search_code}] đã được duyệt từ trước!")
                        return {
                            "status": "success",
                            "contract_identifier": search_code,
                            "already_approved": True,
                            "message": f"Partner Contract [{search_code}] đã được duyệt từ trước."
                        }

                    logger.info(f"🔍 Bấm xem chi tiết Hợp đồng [{search_code}]...")
                    await target_row.scroll_into_view_if_needed()
                    info_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, button:has(.lucide-info)").first
                    
                    try:
                        async with page.expect_response(
                            lambda r: ("getOrderDetail.php" in r.url or "getDistributorPoolLicense.php" in r.url) and r.status == 200,
                            timeout=15000
                        ):
                            await info_btn.click(timeout=10000, force=True)
                    except Exception:
                        await info_btn.click(force=True)

                    await page.wait_for_selector("div[role='dialog']:has-text('Partner Order Details')", state="visible", timeout=15000)
                    await wait_for_dom_and_spinners(page, "div[role='dialog']:has-text('Partner Order Details')", min_pacing_ms=400)

                    dialog = page.locator("div[role='dialog']:has-text('Partner Order Details')").first
                    approve_btn = dialog.locator("button:has-text('Approve Order')").first
                    try:
                        await approve_btn.wait_for(state="visible", timeout=4000)
                    except Exception:
                        pass

                    can_approve = (await approve_btn.count() > 0) and (await approve_btn.is_visible())

                    if can_approve:
                        logger.info("🎉 Kho Distributor ĐỦ License! Đang bấm 'Approve Order' màu xanh lá...")
                        
                        try:
                            async with page.expect_response(
                                lambda r: ("updateStatus" in r.url or "approve" in r.url.lower()) and r.request.method == "POST",
                                timeout=20000
                            ) as app_res:
                                await approve_btn.click(force=True)
                            logger.info(f"📥 Phản hồi duyệt Contract Distributor: {(await app_res.value).status}")
                        except Exception:
                            await approve_btn.click(force=True)
                            await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                        
                        return {
                            "status": "success",
                            "contract_identifier": search_code,
                            "message": f"Distributor đã phê duyệt thành công Partner Contract [{search_code}]!"
                        }

                    logger.warning(f"⚠️ Kho Distributor KHÔNG ĐỦ License để duyệt Contract [{search_code}]!")
                    
                    if auto_create_dst_if_short:
                        logger.info(f"⚡ [1-SESSION SPEEDUP] Kho thiếu License! Đóng modal và chuyển sang tạo DST Contract gửi Sales Admin...")
                        close_btn = dialog.locator("button:has-text('Close')").first
                        if await close_btn.count() > 0:
                            await close_btn.click(force=True)
                            await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=5000)

                        dst_contract_res = await self._fill_distributor_create_contract_form(
                            page=page,
                            contract_data={
                                "notes": f"Auto-topup to approve PRT Contract {search_code}",
                                "courses": courses_needed or [{"category": "SWRP", "course_name": None, "licenses": 100}]
                            }
                        )

                        if dst_contract_res.get("status") == "success":
                            dst_code = dst_contract_res.get("contract_code")
                            logger.info(f"✅ [1-SESSION] Đã tạo thành công DST Contract [{dst_code}] gửi Sales Admin!")
                            return {
                                "status": "insufficient_pool_created_dst",
                                "contract_identifier": search_code,
                                "dst_contract_code": dst_code,
                                "message": f"Kho thiếu License, đã trực tiếp tạo DST Contract [{dst_code}] gửi Sales Admin."
                            }
                        else:
                            return dst_contract_res

                    close_btn = dialog.locator("button:has-text('Close')").first
                    if await close_btn.count() > 0:
                        await close_btn.click(force=True)

                    return {
                        "status": "insufficient_pool",
                        "contract_identifier": search_code,
                        "message": f"Kho Distributor không đủ License cho Contract [{search_code}]."
                    }

                except Exception as e:
                    logger.error(f"❌ Lỗi Distributor Duyệt Partner Contract: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()
                    gc.collect()

    async def distributor_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        async with acquire_playwright_slot("Distributor Create Contract", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    return await self._fill_distributor_create_contract_form(page, contract_data)
                except Exception as e:
                    logger.error(f"❌ Lỗi Distributor Create Contract: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()
                    gc.collect()

    async def partner_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Partner tạo PRT Contract (Quan sát API getListCourseConfig & createOrderSale)."""
        async with acquire_playwright_slot("Partner Create Contract", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("📝 Partner mở: /partner-workspace/contract-po/create...")
                    try:
                        async with page.expect_response(
                            lambda r: "getListCourseConfig.php" in r.url and r.status == 200,
                            timeout=20000
                        ):
                            await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", "contract-po/create")
                    except Exception:
                        await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", "contract-po/create")

                    await wait_for_dom_and_spinners(page, "h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", min_pacing_ms=300)

                    type_select = page.locator(".MuiGrid-item:has(label:has-text('Contract Type')) [role='combobox'], div:has(label:has-text('Contract Type')) .MuiSelect-select").first
                    await type_select.wait_for(state="visible", timeout=10000)
                    await type_select.click(force=True)
                    
                    license_type_opt = page.locator("li[role='option']:has-text('License')").first
                    await license_type_opt.wait_for(state="visible", timeout=5000)
                    await license_type_opt.click(force=True)

                    notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub")
                    notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[name='notes']").first
                    if await notes_input.count() > 0:
                        await notes_input.fill(notes)

                    courses = contract_data.get("courses", [])
                    if not courses:
                        courses = [{"category": "SWRP", "course_name": None, "licenses": 50}]

                    for idx, c in enumerate(courses):
                        if idx > 0:
                            add_btn = page.locator("button:has-text('Add Course')").first
                            await add_btn.click(force=True)
                            await wait_for_dom_and_spinners(page, f".MuiCard-root:has(label:has-text('License Category')) >> nth={idx}", min_pacing_ms=200)

                        course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

                        cat_val = c.get("category", "SWRP")
                        logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{cat_val}'...")
                        
                        cat_select = course_card.locator("div:has(label:has-text('License Category')) [role='combobox'], div:has(label:has-text('License Category')) .MuiSelect-select").first
                        await cat_select.click(force=True)
                        
                        cat_opt = page.locator(f"li[role='option']:has-text('{cat_val}')").first
                        if await cat_opt.count() > 0:
                            await cat_opt.click(force=True)
                        else:
                            await page.locator("li[role='option']").first.click(force=True)

                        await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)

                        course_name_val = c.get("course_name")
                        logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
                        
                        course_select = course_card.locator("div:has(label:has-text('Course')) [role='combobox'], div:has(label:has-text('Course')) .MuiSelect-select").first
                        await course_select.click(force=True)

                        if course_name_val:
                            target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                            if await target_opt.count() > 0:
                                await target_opt.click(force=True)
                            else:
                                valid_opts = page.locator("li[role='option']:not(:has-text('Select Course'))")
                                if await valid_opts.count() > 0:
                                    await valid_opts.first.click(force=True)
                                else:
                                    await page.locator("li[role='option']").first.click(force=True)
                        else:
                            await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)

                        lic_qty = str(c.get("licenses", c.get("course_count", 50)))
                        lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                        await lic_input.click(force=True)
                        await page.keyboard.press("Control+A")
                        await page.keyboard.type(lic_qty)

                    submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                    contract_num_id = ""
                    contract_full_code = ""

                    try:
                        async with page.expect_response(
                            lambda r: "createOrderSale.php" in r.url and r.request.method == "POST",
                            timeout=25000
                        ) as res_info:
                            await submit_btn.click(force=True)

                        res = await res_info.value
                        if res.status in (200, 201):
                            try:
                                res_json = await res.json()
                                logger.info(f"📥 API createOrderSale.php phản hồi: {res_json}")
                                data_obj = res_json.get("data") if isinstance(res_json.get("data"), dict) else res_json
                                contract_num_id = str(data_obj.get("id") or data_obj.get("order_id") or "")
                                contract_full_code = str(
                                    data_obj.get("order_code") or 
                                    data_obj.get("order_sale_id_format") or 
                                    data_obj.get("contract_code") or ""
                                )
                            except Exception as e:
                                logger.warning(f"⚠️ Không parse được JSON từ createOrderSale: {e}")
                    except Exception as e:
                        logger.warning(f"⚠️ Không bắt kịp createOrderSale.php ({e}), chuyển sang cào DataGrid DOM...")

                    if not contract_full_code:
                        try:
                            await page.wait_for_url("**/contract-po**", timeout=15000)
                        except Exception:
                            pass

                        await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

                        first_row = page.locator(".MuiDataGrid-row").first
                        if await first_row.count() > 0:
                            contract_num_id = await first_row.get_attribute("data-id") or ""
                            code_elem = first_row.locator("[data-field='order_code'], [data-field='contract_code'], .MuiDataGrid-cell").first
                            contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

                    if not contract_full_code and contract_num_id:
                        contract_full_code = f"PRT-{contract_num_id}"

                    logger.info(f"🎉 TẠO CONTRACT PRT THÀNH CÔNG: [{contract_full_code}] (ID: {contract_num_id})")
                    return {
                        "status": "success",
                        "contract_id": contract_num_id,
                        "contract_code": contract_full_code,
                        "message": f"Partner đã tạo Contract {contract_full_code} thành công"
                    }

                except Exception as e:
                    logger.error(f"❌ Lỗi Partner Create Contract: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()
                    gc.collect()

    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sales Admin duyệt DST Contract (Quan sát WP REST API /orders/detail & /orders/update-status)."""
        async with acquire_playwright_slot("Sales Admin Approve DST Contract", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    fallback_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"") or os.getenv("TEST_ADMIN_USER", "adminworkspace").strip().strip("'\"")
                    fallback_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"") or os.getenv("TEST_ADMIN_PASS", "").strip().strip("'\"")

                    admin_user = credentials.get("username") if (credentials and credentials.get("username")) else fallback_user
                    admin_pass = credentials.get("password") if (credentials and credentials.get("password")) else fallback_pass

                    logger.info(f"👑 [Sales Admin Guard] Sử dụng tài khoản: '{admin_user}' (Độ dài mật khẩu: {len(admin_pass)} ký tự)")

                    is_ok, login_err = await self.login_role(page, admin_user, admin_pass, "Sales Admin")
                    if not is_ok:
                        return {"status": "failed", "error": f"Sales Admin Login Failed: {login_err}"}

                    logger.info("👑 Đang chuyển hướng sang Sales Admin Dashboard và quan sát API /v1/orders...")
                    try:
                        async with page.expect_response(
                            lambda r: "/sales-admin-workspace/v1/orders" in r.url and r.status == 200,
                            timeout=25000
                        ):
                            await self._safe_navigate(
                                page=page,
                                target_url=f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard",
                                keyword_in_url="sales-admin-workspace",
                                timeout=45000
                            )
                    except Exception:
                        await self._safe_navigate(
                            page=page,
                            target_url=f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard",
                            keyword_in_url="sales-admin-workspace",
                            timeout=30000
                        )

                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-virtualScrollerContent, .MuiDataGrid-row", min_pacing_ms=400)

                    target_row = None
                    search_kw = str(contract_identifier).strip() if contract_identifier else ""
                    
                    if search_kw:
                        logger.info(f"🔍 Tìm Hợp đồng DST: [{search_kw}]...")
                        search_input = page.locator("div:has(label:has-text('Search by ID')) input, input[name='id'], input[id*='search']").first

                        if await search_input.count() > 0:
                            await search_input.click(force=True)
                            await page.keyboard.press("Control+A")
                            await page.keyboard.type(search_kw)
                            await page.keyboard.press("Enter")
                            await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

                        target_row = page.locator(f".MuiDataGrid-row:has-text('{search_kw}')").first

                    if not target_row or await target_row.count() == 0:
                        if not search_kw:
                            logger.info("ℹ️ Quét dòng 'Pending' đầu tiên trên màn hình...")
                            target_row = page.locator(".MuiDataGrid-row:has-text('Pending')").first

                    if not target_row or await target_row.count() == 0:
                        err_msg = f"❌ Không tìm thấy Hợp đồng ({search_kw or 'Pending'}) trên Sales Admin Dashboard!"
                        logger.error(err_msg)
                        return {"status": "failed", "error": err_msg}

                    row_raw_text = (await target_row.inner_text()).lower()
                    if "approved" in row_raw_text or "completed" in row_raw_text:
                        logger.info(f"✨ Hợp đồng [{search_kw}] đã ở trạng thái ĐÃ DUYỆT từ trước đó!")
                        return {
                            "status": "success",
                            "contract_identifier": search_kw,
                            "already_approved": True,
                            "message": f"Hợp đồng [{search_kw}] đã được Sales Admin phê duyệt từ trước đó."
                        }

                    # Mở trang chi tiết
                    logger.info("🔍 Mở chi tiết Contract và quan sát API /v1/orders/detail...")
                    await target_row.scroll_into_view_if_needed()
                    code_link = target_row.locator("a, [data-field='order_code'] a, [data-field='contract_code'] a").first
                    
                    try:
                        async with page.expect_response(
                            lambda r: "/sales-admin-workspace/v1/orders/detail" in r.url and r.status == 200,
                            timeout=20000
                        ):
                            if await code_link.count() > 0 and await code_link.is_visible():
                                await code_link.click(force=True)
                            else:
                                eye_btn = target_row.locator("button[aria-label='View Details'], [data-field='Actions'] button, [data-field='actions'] button, svg[data-testid='VisibilityIcon']").first
                                await eye_btn.click(timeout=15000, force=True)
                    except Exception:
                        if await code_link.count() > 0 and await code_link.is_visible():
                            await code_link.click(force=True)
                        else:
                            eye_btn = target_row.locator("button[aria-label='View Details'], [data-field='Actions'] button, [data-field='actions'] button, svg[data-testid='VisibilityIcon']").first
                            await eye_btn.click(timeout=15000, force=True)

                    approve_btn = page.locator("button:has-text('Approve')").first
                    try:
                        await approve_btn.wait_for(state="visible", timeout=10000)
                    except Exception:
                        pass

                    if await approve_btn.count() == 0 or not (await approve_btn.is_visible()):
                        logger.info(f"✨ Không tìm thấy nút 'Approve' -> Hợp đồng [{search_kw}] có thể đã được duyệt từ trước!")
                        return {
                            "status": "success",
                            "contract_identifier": search_kw,
                            "already_approved": True,
                            "message": f"Hợp đồng [{search_kw}] đã được Sales Admin phê duyệt từ trước đó."
                        }

                    logger.info("👑 Bấm nút 'Approve' trên trang chi tiết...")
                    await approve_btn.click(force=True)

                    # BẮT TRỰC TIẾP API /v1/orders/update-status KHI XÁC NHẬN
                    confirm_dialog = page.locator("div[role='dialog'], .MuiDialog-root").first
                    if await confirm_dialog.count() > 0 and await confirm_dialog.is_visible():
                        logger.info("✍️ Phát hiện Dialog xác nhận, điền lý do và quan sát API /orders/update-status...")
                        textarea = confirm_dialog.locator("textarea").first
                        if await textarea.count() > 0:
                            default_note = "Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub"
                            valid_justification = justification if (justification and len(justification.strip()) >= 15) else default_note
                            await textarea.fill(valid_justification)

                        confirm_btn = confirm_dialog.locator("button:has-text('Confirm Approval'), button:has-text('Confirm'), button:has-text('Approve')").last
                        
                        try:
                            async with page.expect_response(
                                lambda r: "/sales-admin-workspace/v1/orders/update-status" in r.url and r.request.method == "POST",
                                timeout=20000
                            ) as update_res:
                                await confirm_btn.click(force=True)

                            res = await update_res.value
                            logger.info(f"📥 API /orders/update-status phản hồi: {res.status}")
                        except Exception as e:
                            logger.warning(f"⚠️ Không bắt kịp update-status ({e}), bấm confirm trực tiếp...")
                            await confirm_btn.click(force=True)
                            await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                    else:
                        logger.info("🚀 Đã bấm Approve trực tiếp...")

                    logger.info(f"🎉 Sales Admin đã duyệt DST Contract {search_kw} thành công tuyệt đối!")
                    return {
                        "status": "success",
                        "contract_identifier": search_kw,
                        "justification": justification or "Auto-approved by Automation Hub",
                        "message": "Sales Admin đã phê duyệt DST Contract thành công"
                    }
                except Exception as e:
                    logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()
                    gc.collect()

    async def fetch_partner_pending_school_orders(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Truy vấn danh sách School Orders của Partner."""
        async with acquire_playwright_slot("Fetch Partner School Orders", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "orders": []}

                    await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

                    orders = []
                    rows = page.locator(".MuiDataGrid-row")
                    count = await rows.count()
                    for i in range(min(count, 50)):
                        row = rows.nth(i)
                        row_id = await row.get_attribute("data-id") or str(i)
                        txt = await row.inner_text()
                        orders.append({"id": row_id, "summary": txt.replace("\n", " | ")})

                    return {"status": "success", "total": len(orders), "orders": orders}
                except Exception as e:
                    return {"status": "failed", "error": str(e), "orders": []}
                finally:
                    await browser.close()
                    gc.collect()

    async def fetch_distributor_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Truy vấn danh sách PRT Contracts của Distributor."""
        async with acquire_playwright_slot("Fetch Distributor Contracts", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "contracts": []}

                    await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

                    contracts = []
                    rows = page.locator(".MuiDataGrid-row")
                    count = await rows.count()
                    for i in range(min(count, 50)):
                        row = rows.nth(i)
                        row_id = await row.get_attribute("data-id") or str(i)
                        txt = await row.inner_text()
                        contracts.append({"id": row_id, "summary": txt.replace("\n", " | ")})

                    return {"status": "success", "total": len(contracts), "contracts": contracts}
                except Exception as e:
                    return {"status": "failed", "error": str(e), "contracts": []}
                finally:
                    await browser.close()
                    gc.collect()

    async def fetch_sales_admin_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Truy vấn danh sách DST Contracts của Sales Admin."""
        async with acquire_playwright_slot("Fetch Sales Admin Contracts", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "contracts": []}

                    await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

                    contracts = []
                    rows = page.locator(".MuiDataGrid-row")
                    count = await rows.count()
                    for i in range(min(count, 50)):
                        row = rows.nth(i)
                        row_id = await row.get_attribute("data-id") or str(i)
                        txt = await row.inner_text()
                        contracts.append({"id": row_id, "summary": txt.replace("\n", " | ")})

                    return {"status": "success", "total": len(contracts), "contracts": contracts}
                except Exception as e:
                    return {"status": "failed", "error": str(e), "contracts": []}
                finally:
                    await browser.close()
                    gc.collect()