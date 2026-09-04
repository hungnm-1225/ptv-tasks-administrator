# backend/app/services/workspace/contract_service.py
import re
import os
import logging
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page
from app.core.config import settings

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners, smart_wait_for_options_loaded

logger = logging.getLogger(__name__)


class WorkspaceContractService(WorkspaceBaseService):
    """Xử lý các nghiệp vụ tạo và phê duyệt Contract giữa Partner - Distributor - Sales Admin."""

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
        """Hàm nội bộ: Điền form tạo Contract của Distributor trên phiên trình duyệt đang mở."""
        logger.info("📝 Distributor mở: /distributor-workspace/contract-po/create...")
        await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create", "contract-po/create")
        await wait_for_dom_and_spinners(page, "h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", min_pacing_ms=500)

        # 1. Chọn Contract Type = 'License'
        logger.info("📋 Bước 1: Chọn Contract Type = 'License'...")
        type_item = page.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Contract Type")).first
        type_select = type_item.locator("[role='combobox'], .MuiSelect-select").first
        await type_select.wait_for(state="visible", timeout=10000)
        await type_select.click()
        await page.wait_for_timeout(300)
        
        license_opt = page.locator("li[role='option']:has-text('License')").first
        await license_opt.wait_for(state="visible", timeout=8000)
        await license_opt.click()
        await page.wait_for_timeout(600)

        # 2. Điền Contract Notes
        notes = contract_data.get("notes") or contract_data.get("additional_notes") or "Auto-requested by PTV Automation Hub"
        notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[id*=':r']").first
        if await notes_input.count() > 0:
            await notes_input.fill(str(notes))
            await page.wait_for_timeout(200)

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
                await add_btn.click()
                await page.wait_for_timeout(800)

            # Định vị Card dòng môn học thứ idx
            course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

            # A. Chọn License Category (Cột 1)
            cat_val = c.get("category") or "SWRP"
            logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{cat_val}'...")
            cat_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License Category")).first
            cat_select = cat_item.locator("[role='combobox'], .MuiSelect-select").first
            await cat_select.click()
            await page.wait_for_timeout(300)
            
            cat_opt = page.locator(f"li[role='option']:has-text('{cat_val}')").first
            if await cat_opt.count() > 0:
                await cat_opt.click()
            else:
                await page.locator("li[role='option']").first.click()

            # B. Chọn Course (Cột 2)
            course_name_val = c.get("course_name")
            logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
            course_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text=re.compile(r"^Course"))).first
            course_select = course_item.locator("[role='combobox'], .MuiSelect-select").first
            await course_select.wait_for(state="visible", timeout=10000)
            await course_select.click()

            # Chờ API nạp danh sách khóa học theo State (thay thế wait_for_timeout 1800ms)
            await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)

            target_opt = None
            if course_name_val:
                target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first

            if target_opt and await target_opt.count() > 0:
                await target_opt.click()
            else:
                valid_opts = page.locator("li[role='option']:not(:has-text('Select Course'))")
                if await valid_opts.count() > 0:
                    await valid_opts.first.click()
                else:
                    await page.locator("li[role='option']").first.click()

            await page.wait_for_timeout(300)

            # C. Điền số lượng Licenses (Cột 3)
            lic_qty = str(c.get("licenses", 100))
            logger.info(f"🔢 Môn #{idx + 1}: Điền License(s) = {lic_qty}...")
            lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
            lic_input = lic_item.locator("input[type='number']").first
            await lic_input.click()
            await page.keyboard.press("Control+A")
            await page.keyboard.type(lic_qty)
            await page.wait_for_timeout(200)

            # D. Điền Unit Price (Cột 4)
            unit_price_val = str(c.get("unit_price", 0))
            price_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Unit Price")).first
            if await price_item.count() > 0:
                price_input = price_item.locator("input[type='number']").first
                if await price_input.count() > 0:
                    await price_input.click()
                    await page.keyboard.press("Control+A")
                    await page.keyboard.type(unit_price_val)
                    await page.wait_for_timeout(200)

        # 4. Đính kèm tài liệu (nếu có)
        doc_path = contract_data.get("document_path") or contract_data.get("upload_file_path")
        if doc_path and os.path.exists(doc_path):
            logger.info(f"📎 Đang đính kèm tài liệu: {doc_path}...")
            file_input = page.locator("input#upload-documents, input[type='file']").first
            if await file_input.count() > 0:
                await file_input.set_input_files(doc_path)
                await page.wait_for_timeout(800)

        # 5. Bấm Create Contract/PO
        logger.info("🚀 Đang bấm nút 'Create Contract/PO'...")
        submit_btn = page.locator("button:has-text('Create Contract/PO')").last
        await submit_btn.click()

        try:
            await page.wait_for_url("**/distributor-workspace/contract-po", timeout=20000)
        except Exception:
            await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po", "contract-po")

        await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=1000)

        # Lấy mã DST Contract vừa tạo
        first_row = page.locator(".MuiDataGrid-row").first
        contract_num_id = await first_row.get_attribute("data-id") if await first_row.count() > 0 else ""
        code_elem = first_row.locator("[data-field='order_code'] a, [data-field='contract_code'] a, [data-field='order_code'], a").first
        contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

        if not contract_full_code and contract_num_id:
            contract_full_code = f"DST-{contract_num_id}"

        logger.info(f"🎉 TẠO DST CONTRACT THÀNH CÔNG: [{contract_full_code}]")
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
        """Duyệt Partner Contract. TÍCH HỢP LIỀN MẠCH 1-SESSION."""
        async with acquire_playwright_slot("Distributor Approve Partner Contract"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("🏢 Distributor mở: /distributor-workspace/partner-contract-po...")
                    await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", "partner-contract-po")
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row, [role='row']", min_pacing_ms=1000)

                    target_row = None
                    if contract_identifier:
                        logger.info(f"🔍 Đang tìm Hợp đồng Partner: [{contract_identifier}]...")
                        target_row = page.locator(f".MuiDataGrid-row:has-text('{contract_identifier}')").first

                        if await target_row.count() == 0:
                            search_input = page.locator("input[placeholder*='Search'], .MuiTextField-root input, input[type='text']").first
                            if await search_input.count() > 0:
                                await search_input.fill(contract_identifier)
                                await page.keyboard.press("Enter")
                                await page.wait_for_timeout(1500)
                                target_row = page.locator(f".MuiDataGrid-row:has-text('{contract_identifier}')").first

                    if not target_row or await target_row.count() == 0:
                        target_row = page.locator(".MuiDataGrid-row:has-text('Pending')").first

                    if not target_row or await target_row.count() == 0:
                        return {"status": "failed", "error": f"Không tìm thấy Partner Contract ({contract_identifier}) trên bảng"}

                    # Kiểm tra nếu đã approved
                    row_text = (await target_row.inner_text()).lower()
                    if "approved" in row_text or "completed" in row_text:
                        logger.info(f"✨ Partner Contract [{contract_identifier}] đã được duyệt từ trước!")
                        return {
                            "status": "success",
                            "contract_identifier": contract_identifier,
                            "already_approved": True,
                            "message": f"Partner Contract [{contract_identifier}] đã được duyệt từ trước."
                        }

                    logger.info(f"🔍 Đang bấm nút 'View Details' cho Contract [{contract_identifier or 'Pending'}]...")
                    info_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, button:has(.lucide-info)").first
                    await info_btn.click(timeout=15000)

                    await page.wait_for_selector("div[role='dialog']", state="visible", timeout=15000)
                    await page.wait_for_timeout(800)

                    approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order')").first
                    can_approve = (await approve_btn.count() > 0) and (await approve_btn.is_visible())

                    if can_approve:
                        logger.info(f"🎉 Kho Distributor ĐỦ License! Đang bấm 'Approve Order' cho Contract [{contract_identifier}]...")
                        await approve_btn.click()
                        await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                        await page.wait_for_timeout(1500)
                        
                        return {
                            "status": "success",
                            "contract_identifier": contract_identifier,
                            "message": f"Distributor đã phê duyệt thành công Partner Contract [{contract_identifier}]!"
                        }
                    else:
                        logger.warning(f"⚠️ Kho Distributor KHÔNG ĐỦ License (Insufficient pool resources)!")
                        
                        if auto_create_dst_if_short:
                            logger.info(f"⚡ [1-SESSION SPEEDUP] Trực tiếp chuyển sang trang tạo Contract không cần login lại...")
                            close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                            if await close_btn.count() > 0:
                                await close_btn.click()
                                await page.wait_for_timeout(500)

                            dst_contract_res = await self._fill_distributor_create_contract_form(
                                page=page,
                                contract_data={
                                    "notes": f"Auto-topup to approve PRT Contract {contract_identifier}",
                                    "courses": courses_needed or [{"category": "SWRP", "course_name": None, "licenses": 100}]
                                }
                            )

                            if dst_contract_res.get("status") == "success":
                                dst_code = dst_contract_res.get("contract_code")
                                logger.info(f"✅ [1-SESSION] Đã tạo thành công DST Contract [{dst_code}] gửi Sales Admin!")
                                return {
                                    "status": "insufficient_pool_created_dst",
                                    "contract_identifier": contract_identifier,
                                    "dst_contract_code": dst_code,
                                    "message": f"Kho thiếu License, đã trực tiếp tạo DST Contract [{dst_code}] gửi Sales Admin."
                                }
                            else:
                                return dst_contract_res

                        close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                        if await close_btn.count() > 0:
                            await close_btn.click()

                        return {
                            "status": "insufficient_pool",
                            "contract_identifier": contract_identifier,
                            "message": f"Kho Distributor không đủ License cho Contract [{contract_identifier}]."
                        }

                except Exception as e:
                    logger.error(f"❌ Lỗi Distributor Duyệt Partner Contract: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()

    async def distributor_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        async with acquire_playwright_slot("Distributor Create Contract"):
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

    async def partner_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        async with acquire_playwright_slot("Partner Create Contract"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("📝 Partner mở: /partner-workspace/contract-po/create...")
                    await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", "contract-po/create")
                    await wait_for_dom_and_spinners(page, "h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", min_pacing_ms=500)

                    type_select = page.locator(".MuiGrid-item:has(label:has-text('Contract Type')) [role='combobox'], div:has(label:has-text('Contract Type')) .MuiSelect-select").first
                    await type_select.wait_for(state="visible", timeout=10000)
                    await type_select.click()
                    await page.wait_for_timeout(300)
                    
                    license_type_opt = page.locator("li[role='option']:has-text('License')").first
                    await license_type_opt.wait_for(state="visible", timeout=5000)
                    await license_type_opt.click()
                    await page.wait_for_timeout(600)

                    notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub")
                    notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[name='notes']").first
                    if await notes_input.count() > 0:
                        await notes_input.fill(notes)
                        await page.wait_for_timeout(200)

                    courses = contract_data.get("courses", [])
                    if not courses:
                        courses = [{"category": "SWRP", "course_name": None, "licenses": 50}]

                    for idx, c in enumerate(courses):
                        if idx > 0:
                            add_btn = page.locator("button:has-text('Add Course')").first
                            await add_btn.click()
                            await page.wait_for_timeout(800)

                        course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

                        # 👉 LẤY ĐÚNG CATEGORY TỪ ORDER/CONTRACT DATA TRUYỀN VÀO
                        cat_val = c.get("category", "SWRP")
                        logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{cat_val}'...")
                        
                        cat_select = course_card.locator("div:has(label:has-text('License Category')) [role='combobox'], div:has(label:has-text('License Category')) .MuiSelect-select").first
                        await cat_select.click()
                        await page.wait_for_timeout(300)
                        
                        cat_opt = page.locator(f"li[role='option']:has-text('{cat_val}')").first
                        if await cat_opt.count() > 0:
                            await cat_opt.click()
                        else:
                            await page.locator("li[role='option']").first.click()

                        # 🟢 CHỜ API TẢI DANH MỤC KHÓA HỌC THỰC TẾ CỦA CATEGORY ĐÓ
                        await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)

                        # 👉 LẤY ĐÚNG TÊN COURSE TỪ ORDER/CONTRACT DATA
                        course_name_val = c.get("course_name")
                        logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
                        
                        course_select = course_card.locator("div:has(label:has-text('Course')) [role='combobox'], div:has(label:has-text('Course')) .MuiSelect-select").first
                        await course_select.click()
                        await page.wait_for_timeout(500)

                        if course_name_val:
                            target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                            if await target_opt.count() > 0:
                                await target_opt.click()
                            else:
                                valid_opts = page.locator("li[role='option']:not(:has-text('Select Course'))")
                                if await valid_opts.count() > 0:
                                    await valid_opts.first.click()
                                else:
                                    await page.locator("li[role='option']").first.click()
                        else:
                            await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click()

                        await page.wait_for_timeout(300)

                        lic_qty = str(c.get("licenses", c.get("course_count", 50)))
                        lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                        await lic_input.click()
                        await page.keyboard.press("Control+A")
                        await page.keyboard.type(lic_qty)
                        await page.wait_for_timeout(200)

                    submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                    await submit_btn.click()

                    try:
                        await page.wait_for_url("**/contract-po**", timeout=20000)
                    except Exception:
                        pass

                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=1000)

                    first_row = page.locator(".MuiDataGrid-row").first
                    contract_num_id = await first_row.get_attribute("data-id") if await first_row.count() > 0 else ""
                    code_elem = first_row.locator("[data-field='order_code'], [data-field='contract_code'], .MuiDataGrid-cell").first
                    contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

                    logger.info(f"🎉 TẠO CONTRACT PRT THÀNH CÔNG: [{contract_full_code}]")
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

    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None
    ) -> Dict[str, Any]:
        async with acquire_playwright_slot("Sales Admin Approve DST Contract"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    fallback_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"") or os.getenv("TEST_ADMIN_USER", "adminworkspace").strip().strip("'\"")
                    fallback_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"") or os.getenv("TEST_ADMIN_PASS", "").strip().strip("'\"")

                    # Kiểm tra xem credentials truyền vào có password hợp lệ không, nếu không thì dùng fallback
                    admin_user = credentials.get("username") if (credentials and credentials.get("username")) else fallback_user
                    admin_pass = credentials.get("password") if (credentials and credentials.get("password")) else fallback_pass

                    logger.info(f"👑 [Sales Admin Guard] Sử dụng tài khoản: '{admin_user}' (Độ dài mật khẩu: {len(admin_pass)} ký tự)")

                    is_ok, login_err = await self.login_role(page, admin_user, admin_pass, "Sales Admin")
                    if not is_ok:
                        return {"status": "failed", "error": f"Sales Admin Login Failed: {login_err}"}

                    # 👉 CHỜ SESSION ỔN ĐỊNH SAU KHI ĐĂNG NHẬP ADMIN WORKSPACE
                    logger.info("⏳ Đợi session Admin Workspace khởi tạo hoàn tất...")
                    await page.wait_for_timeout(1500)

                    # 👉 CHUYỂN HƯỚNG THỦ CÔNG SANG SALES ADMIN WORKSPACE ĐÚNG LUỒNG THỰC TẾ
                    logger.info("👑 Đang chuyển hướng thủ công sang: /sales-admin-workspace/dashboard...")
                    await self._safe_navigate(
                        page=page,
                        target_url=f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard",
                        keyword_in_url="sales-admin-workspace",
                        timeout=45000
                    )
                    
                    # Thêm 1 nhịp chờ phụ để chắc chắn React chuyển trang thành công
                    await page.wait_for_timeout(2000)
                    if "sales-admin-workspace" not in page.url:
                        logger.warning(f"⚠️ URL hiện tại chưa đúng trang Sales Admin ({page.url}), đang ép điều hướng lại lần nữa...")
                        await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="domcontentloaded", timeout=30000)
                        await page.wait_for_timeout(2000)
                    
                    # 🚀 BƯỚC 1: Chờ bảng nạp dữ liệu thật
                    logger.info("⏳ Chờ nạp danh sách Order trên Sales Admin Dashboard...")
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-virtualScrollerContent, .MuiDataGrid-row", min_pacing_ms=1000)

                    target_row = None
                    search_kw = str(contract_identifier).strip() if contract_identifier else ""
                    
                    # 🚀 BƯỚC 2: Tìm kiếm theo đúng chuỗi ID
                    if search_kw:
                        logger.info(f"🔍 Tìm Hợp đồng DST: [{search_kw}]...")
                        
                        search_input = page.locator(
                            "div:has(label:has-text('Search by ID')) input, input[name='id'], input[id*='search']"
                        ).first

                        if await search_input.count() > 0:
                            logger.info(f"✍️ Gõ mã [{search_kw}] vào ô 'Search by ID'...")
                            await search_input.click()
                            await page.keyboard.press("Control+A")
                            await page.keyboard.type(search_kw)
                            await page.keyboard.press("Enter")
                            await page.wait_for_timeout(2000)

                        target_row = page.locator(f".MuiDataGrid-row:has-text('{search_kw}')").first

                    # Nếu không chỉ định mã hoặc không tìm thấy bằng search, quét dòng Pending
                    if not target_row or await target_row.count() == 0:
                        if not search_kw:
                            logger.info("ℹ️ Quét dòng 'Pending' đầu tiên trên màn hình...")
                            target_row = page.locator(".MuiDataGrid-row:has-text('Pending')").first

                    # 🛡️ FALLBACK 1: Không tìm thấy Hợp đồng
                    if not target_row or await target_row.count() == 0:
                        err_msg = f"❌ Không tìm thấy Hợp đồng ({search_kw or 'Pending'}) trên Sales Admin Dashboard!"
                        logger.error(err_msg)
                        return {"status": "failed", "error": err_msg}

                    # 🛡️ FALLBACK 2 (TẦNG 1): Kiểm tra nếu dòng đã mang trạng thái Đã Duyệt
                    row_raw_text = (await target_row.inner_text()).lower()
                    if "approved" in row_raw_text or "completed" in row_raw_text:
                        logger.info(f"✨ Hợp đồng [{search_kw}] đã ở trạng thái ĐÃ DUYỆT từ trước đó!")
                        return {
                            "status": "success",
                            "contract_identifier": search_kw,
                            "already_approved": True,
                            "message": f"Hợp đồng [{search_kw}] đã được Sales Admin phê duyệt từ trước đó."
                        }

                    # 🚀 BƯỚC 3: Bấm icon con mắt 👁️ xem chi tiết
                    logger.info("🔍 Bấm nút xem chi tiết Contract (Icon Con Mắt 👁️)...")
                    eye_btn = target_row.locator(
                        "button[aria-label='View Details'], [data-field='Actions'] button, [data-field='actions'] button, button:has(svg), svg[data-testid='VisibilityIcon']"
                    ).first
                    await eye_btn.click(timeout=15000)

                    await page.wait_for_timeout(1000)

                    # 🛡️ FALLBACK 2 (TẦNG 2): Kiểm tra nút Approve trong modal
                    approve_btn = page.locator("button:has-text('Approve')").first
                    if await approve_btn.count() == 0 or not (await approve_btn.is_visible()):
                        logger.info(f"✨ Không thấy nút 'Approve' -> Hợp đồng [{search_kw}] đã được duyệt từ trước!")
                        close_btn = page.locator("button:has-text('Close'), div[role='dialog'] button:has-text('Close')").first
                        if await close_btn.count() > 0 and await close_btn.is_visible():
                            await close_btn.click()
                        return {
                            "status": "success",
                            "contract_identifier": search_kw,
                            "already_approved": True,
                            "message": f"Hợp đồng [{search_kw}] đã được Sales Admin phê duyệt từ trước đó."
                        }

                    # 🚀 BƯỚC 4: Bấm nút 'Approve'
                    logger.info("👑 Bấm nút 'Approve'...")
                    await approve_btn.click()

                    # 🚀 BƯỚC 5: Điền justification và xác nhận
                    await page.wait_for_selector("div[role='dialog']", state="visible", timeout=10000)
                    await page.wait_for_timeout(500)

                    default_note = "Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub"
                    valid_justification = justification if (justification and len(justification.strip()) >= 15) else default_note
                    
                    logger.info(f"✍️ Điền lý do phê duyệt: {valid_justification[:40]}...")
                    textarea = page.locator("div[role='dialog'] textarea").first
                    await textarea.fill(valid_justification)
                    await page.wait_for_timeout(500)

                    logger.info("🚀 Bấm 'Confirm Approval'...")
                    confirm_btn = page.locator("div[role='dialog'] button:has-text('Confirm Approval'), div[role='dialog'] button:has-text('Confirm')").first
                    await confirm_btn.click()
                    await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                    await page.wait_for_timeout(1500)

                    logger.info(f"🎉 Sales Admin đã duyệt DST Contract {search_kw} thành công!")
                    return {
                        "status": "success",
                        "contract_identifier": search_kw,
                        "justification": valid_justification,
                        "message": "Sales Admin đã phê duyệt DST Contract thành công"
                    }

                except Exception as e:
                    logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()

    # =========================================================================
    # CÁC HÀM LIVE FETCH BỔ TRỢ ĐỒNG BỘ
    # =========================================================================
    async def fetch_partner_pending_school_orders(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Truy vấn danh sách School Orders của Partner."""
        async with acquire_playwright_slot("Fetch Partner School Orders"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "orders": []}

                    await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=1000)

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

    async def fetch_distributor_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Truy vấn danh sách PRT Contracts của Distributor."""
        async with acquire_playwright_slot("Fetch Distributor Contracts"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "contracts": []}

                    await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=1000)

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

    async def fetch_sales_admin_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Truy vấn danh sách DST Contracts của Sales Admin."""
        async with acquire_playwright_slot("Fetch Sales Admin Contracts"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "contracts": []}

                    await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=1000)

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