# backend/app/services/workspace/order_service.py
import re
import gc
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from playwright.async_api import async_playwright, Page, Response

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL, normalize_date_iso
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners, smart_wait_for_options_loaded

logger = logging.getLogger(__name__)


class WorkspaceOrderService(WorkspaceBaseService):
    """
    Xử lý các nghiệp vụ School Order & Partner Approve.
    Tích hợp Bộ rình thông báo Toast linh hoạt 100% (Universal MutationObserver Sniffer)
    chống treo Timeout 15s khi form gặp sự cố.
    """

    # =========================================================================
    # 🕵️ BỘ RÌNH THÔNG BÁO LINH HOẠT 100% (MUTATION OBSERVER TOAST SNIFFER)
    # =========================================================================
    async def _setup_snackbar_observer(self, page: Page):
        """Cài đặt MutationObserver theo dõi ngầm 24/7 toàn bộ popup thông báo của Workspace."""
        try:
            await page.evaluate("""() => {
                if (window.__SNACKBAR_OBSERVER_ATTACHED) return;
                window.__SNACKBAR_OBSERVER_ATTACHED = true;
                window.__CAPTURED_SNACKBARS = [];
                
                const observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1) {
                                const snackbar = node.matches?.('#notistack-snackbar, .notistack-MuiContent, [role="alert"]') 
                                    ? node 
                                    : node.querySelector?.('#notistack-snackbar, .notistack-MuiContent, [role="alert"]');
                                
                                if (snackbar) {
                                    const container = snackbar.closest('.notistack-MuiContent') || snackbar;
                                    const cls = ((container.className || '') + ' ' + (snackbar.className || '')).toLowerCase();
                                    const isError = cls.includes('error');
                                    const isSuccess = cls.includes('success');
                                    const isWarning = cls.includes('warning');
                                    const text = (snackbar.innerText || snackbar.textContent || '').trim();
                                    
                                    if (text) {
                                        window.__CAPTURED_SNACKBARS.push({
                                            text: text,
                                            type: isError ? 'error' : (isSuccess ? 'success' : (isWarning ? 'warning' : 'info')),
                                            time: Date.now()
                                        });
                                    }
                                }
                            }
                        }
                    }
                });
                
                observer.observe(document.body, { childList: true, subtree: true });
            }""")
        except Exception as e:
            logger.debug(f"Không thể gắn MutationObserver: {e}")

    async def _drain_snackbars(self, page: Page) -> List[Dict[str, Any]]:
        """Thu hồi toàn bộ thông báo Workspace đã phát sinh mà không bỏ sót bất kỳ thông điệp nào."""
        try:
            snackbars = await page.evaluate("""() => {
                const list = window.__CAPTURED_SNACKBARS || [];
                window.__CAPTURED_SNACKBARS = [];
                return list;
            }""")
            for s in snackbars:
                tag = "🚨 [WORKSPACE LỖI]" if s['type'] == 'error' else ("✨ [WORKSPACE THÀNH CÔNG]" if s['type'] == 'success' else "ℹ️ [WORKSPACE THÔNG BÁO]")
                logger.info(f"{tag}: \"{s['text']}\"")
            return snackbars
        except Exception:
            return []

    async def _check_latest_snackbar(self, page: Page, wait_ms: int = 2500) -> Optional[Dict[str, str]]:
        """Chờ và trích xuất thông báo mới nhất phát sinh từ Workspace (Bất kể nội dung gì)."""
        end_time = asyncio.get_event_loop().time() + (wait_ms / 1000.0)
        while asyncio.get_event_loop().time() < end_time:
            snackbars = await self._drain_snackbars(page)
            if snackbars:
                return snackbars[-1]
            
            # Fallback DOM trực tiếp phòng trường hợp observer bị miss
            try:
                direct_el = page.locator("#notistack-snackbar, .notistack-MuiContent, div[role='alert']").first
                if await direct_el.count() > 0 and await direct_el.is_visible():
                    raw_text = (await direct_el.inner_text()).strip()
                    if raw_text:
                        cls = (await direct_el.get_attribute("class") or "").lower()
                        p_el = direct_el.locator("xpath=./ancestor-or-self::div[contains(@class, 'notistack-MuiContent')][1]")
                        p_cls = (await p_el.get_attribute("class") or "").lower() if await p_el.count() > 0 else ""
                        all_cls = f"{cls} {p_cls}"
                        s_type = "error" if "error" in all_cls else ("success" if "success" in all_cls else "info")
                        logger.info(f"🔎 [DOM DIRECT TOAST] ({s_type}): \"{raw_text}\"")
                        return {"text": raw_text, "type": s_type}
            except Exception:
                pass
            await asyncio.sleep(0.2)
        return None

    # =========================================================================
    # 💾 CÁC HÀM NỘI BỘ ĐỒNG BỘ CSDL SUPABASE & LÀM SẠCH RAM CACHE TỨC THỜI
    # =========================================================================
    def _invalidate_workspace_ram_cache(self, cache_type: str = "all"):
        """Xóa RAM cache để Automation Studio nạp lại dữ liệu mới nhất tức thì."""
        try:
            from app.api.v1.endpoints.workspace import ws_cache
            if cache_type in ("all", "orders"):
                ws_cache.invalidate("all_cached_pending_orders")
            if cache_type in ("all", "contracts"):
                ws_cache.invalidate("all_cached_pending_contracts_PRT")
                ws_cache.invalidate("all_cached_pending_contracts_DST")
                logger.info("⚡ [CACHE EVICTION] Đã làm sạch RAM Cache Contracts (PRT & DST).")
        except Exception as e:
            logger.warning(f"⚠️ Không thể invalidate ws_cache: {e}")

    async def _sync_order_status_db(self, order_identifier: str, new_status: str = "Approved", partner_name: Optional[str] = None):
        """Cập nhật trạng thái School Order thành Approved trong CSDL Supabase."""
        if not order_identifier:
            return
        try:
            from app.core.supabase import get_supabase_client
            clean_code = str(order_identifier).strip()
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            
            supabase = get_supabase_client()
            supabase.table("workspace_orders_cache").update({
                "status": new_status,
                "synced_at": now_utc
            }).ilike("order_id", f"%{clean_code}%").execute()

            logger.info(f"💾 [DB SYNC] Đã cập nhật School Order [{clean_code}] -> Status: '{new_status}' trong CSDL.")
            self._invalidate_workspace_ram_cache("orders")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi cập nhật Order vào CSDL: {e}")

    async def _sync_contract_status_db(self, contract_identifier: str, contract_type: str = "PRT", new_status: str = "Approved"):
        """Cập nhật trạng thái PRT/DST Contract thành Approved trong CSDL Supabase."""
        if not contract_identifier:
            return
        try:
            from app.core.supabase import get_supabase_client
            clean_code = str(contract_identifier).strip()
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            
            supabase = get_supabase_client()
            update_res = supabase.table("workspace_contracts_cache").update({
                "status": new_status,
                "synced_at": now_utc
            }).ilike("contract_code", f"%{clean_code}%").execute()

            if not update_res.data:
                supabase.table("workspace_contracts_cache").insert({
                    "contract_code": clean_code,
                    "contract_type": contract_type.upper(),
                    "sender_name": "Partner" if contract_type.upper() == "PRT" else "Distributor",
                    "receiver_name": "Distributor" if contract_type.upper() == "PRT" else "Sales Admin",
                    "status": new_status,
                    "contract_date": now_utc.split("T")[0],
                    "synced_at": now_utc,
                    "raw_data": {"auto_synced": True}
                }).execute()

            logger.info(f"💾 [DB SYNC] Đã cập nhật {contract_type} Contract [{clean_code}] -> Status: '{new_status}' trong CSDL.")
            self._invalidate_workspace_ram_cache("contracts")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi cập nhật Contract vào CSDL: {e}")

    async def _record_created_contract_db(
        self,
        contract_code: str,
        contract_type: str,
        status: str,
        partner_name: Optional[str] = None,
        distributor_name: Optional[str] = None,
        distributor_code: Optional[str] = None,
        courses: Optional[List[Dict[str, Any]]] = None,
        notes: Optional[str] = None
    ):
        """Ghi nhận Hợp đồng PRT/DST phát sinh mới vào CSDL Supabase."""
        if not contract_code:
            return
        try:
            from app.core.supabase import get_supabase_client
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            supabase = get_supabase_client()
            
            total_lic = 0
            if courses:
                for c in courses:
                    total_lic += int(c.get("licenses") or c.get("course_count") or 0)
                    
            record = {
                "contract_code": contract_code,
                "contract_type": contract_type.upper(),
                "status": status,
                "total_licenses": total_lic if total_lic > 0 else 50,
                "partner_name": partner_name or "Partner",
                "distributor_name": distributor_name or "Master Distributor",
                "distributor_code": distributor_code or "N/A",
                "synced_at": now_utc,
                "raw_data": {
                    "notes": notes,
                    "courses": courses,
                    "auto_generated": True,
                    "created_at_utc": now_utc
                }
            }
            supabase.table("workspace_contracts_cache").upsert(record, on_conflict="contract_code").execute()
            logger.info(f"💾 [DB SYNC] Đã ghi nhận Contract phát sinh [{contract_code}] ({contract_type}) -> Status: '{status}'.")
            self._invalidate_workspace_ram_cache("contracts")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi ghi nhận Contract phát sinh: {e}")

    async def _record_created_order_db(self, order_id: str, school_name: str, order_data: Dict[str, Any]):
        """Ghi nhận School Order mới tạo vào CSDL Supabase."""
        if not order_id:
            return
        try:
            from app.core.supabase import get_supabase_client
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            supabase = get_supabase_client()
            
            courses = order_data.get("courses", [])
            total_lic = sum(int(c.get("licenses", 0)) for c in courses) if courses else int(order_data.get("licenses", 50))
            
            record = {
                "order_id": order_id,
                "school_name": school_name,
                "partner_name": order_data.get("partner_name", "Partner"),
                "distributor_code": order_data.get("distributor_code", "N/A"),
                "order_date": now_utc,
                "total_licenses": total_lic,
                "status": "Awaiting Partner",
                "synced_at": now_utc,
                "raw_data": order_data
            }
            supabase.table("workspace_orders_cache").upsert(record, on_conflict="order_id").execute()
            logger.info(f"💾 [DB SYNC] Đã ghi nhận Order mới [{order_id}] -> Status: 'Awaiting Partner'.")
            self._invalidate_workspace_ram_cache("orders")
        except Exception as e:
            logger.warning(f"⚠️ [DB SYNC] Lỗi ghi nhận Order mới: {e}")

    # =========================================================================
    # ⚙️ CÁC LUỒNG THAO TÁC PLAYWRIGHT WORKSPACE
    # =========================================================================
    async def _fill_partner_create_contract_form(
        self,
        page: Page,
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Hàm nội bộ: Partner điền form tạo PRT Contract gửi Distributor trong cùng 1 phiên."""
        logger.info("📝 Partner mở: /partner-workspace/contract-po/create...")
        await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", wait_until="domcontentloaded", timeout=45000)
        await self._setup_snackbar_observer(page)
        await wait_for_dom_and_spinners(page, "h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", min_pacing_ms=300)

        # 1. Chọn Contract Type
        logger.info("📋 Bước 1: Partner chọn Contract Type...")
        type_item = page.locator(".MuiFormControl-root:has(label:has-text('Contract Type')), .MuiGrid-item:has(label:has-text('Contract Type'))").first
        type_select = type_item.locator("[role='combobox'], .MuiSelect-select").first
        await type_select.wait_for(state="visible", timeout=10000)
        await type_select.click(force=True)
        await page.wait_for_timeout(300)

        license_opt = page.locator("li[role='option']:has-text('License')").first
        if await license_opt.count() > 0:
            await license_opt.click(force=True)
        else:
            await page.locator("li[role='option']").first.click(force=True)
        await page.wait_for_timeout(300)

        # 2. Điền Contract Notes
        notes = contract_data.get("notes") or contract_data.get("additional_notes") or "Auto-requested by PTV Automation Hub to topup School Order"
        notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea, textarea[id*=':r']").first
        if await notes_input.count() > 0:
            await notes_input.fill(str(notes))

        # 3. Điền danh sách môn học
        courses = contract_data.get("courses", [])
        if not courses:
            courses = [{"category": "SWRP", "course_name": None, "licenses": 50}]

        for idx, c in enumerate(courses):
            if idx > 0:
                logger.info(f"➕ Bấm 'Add Course' thêm môn #{idx + 1}...")
                add_btn = page.locator("button:has-text('Add Course')").first
                await add_btn.click(force=True)
                await wait_for_dom_and_spinners(page, f".MuiCard-root:has(label:has-text('License Category')) >> nth={idx}", min_pacing_ms=200)

            course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

            cat_val = c.get("category") or "SWRP"
            logger.info(f"📚 Môn #{idx + 1}: Chọn License Category = '{cat_val}'...")
            cat_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License Category")).first
            cat_select = cat_item.locator("[role='combobox'], .MuiSelect-select").first
            await cat_select.click(force=True)
            await page.wait_for_timeout(250)

            cat_opt = page.locator(f"li[role='option']:has-text('{cat_val}')").first
            if await cat_opt.count() > 0:
                await cat_opt.click(force=True)
            else:
                await page.locator("li[role='option']").first.click(force=True)

            course_name_val = c.get("course_name")
            logger.info(f"🎯 Môn #{idx + 1}: Chọn Course = '{course_name_val or 'Mặc định'}'...")
            course_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text=re.compile(r"^Course"))).first
            course_select = course_item.locator("[role='combobox'], .MuiSelect-select").first
            await course_select.wait_for(state="visible", timeout=10000)
            await course_select.click(force=True)
            await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)

            if course_name_val:
                target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                if await target_opt.count() > 0:
                    await target_opt.click(force=True)
                else:
                    await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)
            else:
                await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)

            lic_qty = str(c.get("licenses", 50))
            lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
            lic_input = lic_item.locator("input[type='number']").first
            await lic_input.click(force=True)
            await page.keyboard.press("Control+A")
            await page.keyboard.type(lic_qty)

        # 4. Bấm Create Contract/PO & BẮT THÔNG BÁO LINH HOẠT
        logger.info("🚀 Partner bấm 'Create Contract/PO'...")
        submit_btn = page.locator("button:has-text('Create Contract/PO')").last
        await submit_btn.click(force=True)

        # Rà soát thông báo Workspace
        toast = await self._check_latest_snackbar(page, wait_ms=3000)
        if toast and toast.get("type") == "error":
            return {
                "status": "failed",
                "error": f"Workspace từ chối tạo PRT Contract: \"{toast['text']}\""
            }

        try:
            await page.wait_for_url("**/partner-workspace/contract-po", timeout=15000)
        except Exception:
            await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po", wait_until="domcontentloaded", timeout=15000)

        await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=500)
        first_row = page.locator(".MuiDataGrid-row").first
        contract_num_id = ""
        contract_full_code = ""
        if await first_row.count() > 0:
            contract_num_id = await first_row.get_attribute("data-id") or ""
            code_elem = first_row.locator("[data-field='order_code'] a, [data-field='contract_code'] a, [data-field='order_code'], a").first
            contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

        if not contract_full_code and contract_num_id:
            contract_full_code = f"PRT-{contract_num_id}"

        if contract_full_code:
            await self._record_created_contract_db(
                contract_code=contract_full_code,
                contract_type="PRT",
                status="Awaiting Distributor",
                courses=contract_data.get("courses"),
                notes=contract_data.get("notes")
            )

        logger.info(f"🎉 PARTNER TẠO PRT CONTRACT THÀNH CÔNG: [{contract_full_code}]")
        return {
            "status": "success",
            "contract_id": contract_num_id,
            "contract_code": contract_full_code,
            "message": f"Partner đã tạo PRT Contract {contract_full_code} gửi Distributor thành công"
        }

    async def school_create_order(
        self, 
        credentials: Dict[str, str], 
        order_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Trường học tạo mới School Order:
        - Điền Contact Info & các trường chính xác tuyệt đối.
        - Theo dõi thông báo lỗi/thành công linh hoạt bằng MutationObserver.
        - TRIỆT TIÊU HOÀN TOÀN lỗi 'Timeout 15000ms waiting for dialog to be hidden'.
        """
        async with acquire_playwright_slot("School Create Order", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("🏫 Mở trang danh sách Order: /school-workspace/orders...")
                    await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="domcontentloaded", timeout=45000)
                    await self._setup_snackbar_observer(page)
                    await wait_for_dom_and_spinners(page, "button:has-text('Create Order')", min_pacing_ms=300)

                    create_order_btn = page.locator("button:has-text('Create Order')").first
                    await create_order_btn.wait_for(state="visible", timeout=15000)
                    await create_order_btn.click(force=True)

                    await page.wait_for_selector("div[role='dialog']", state="visible", timeout=15000)

                    # 1. Điền Contact Information (Đa tầng selector & dispatch event)
                    contact_info = order_data.get("contact_info") or "Admin Automation Hub (operation@pythaverse.space)"
                    logger.info(f"✍️ Điền Contact Information: '{contact_info}'...")
                    
                    contact_container = page.locator(
                        "div[role='dialog'] .MuiFormControl-root:has(label:has-text('Contact Information')), "
                        "div[role='dialog'] div:has(label:has-text('Contact Information'))"
                    ).first
                    
                    contact_input = contact_container.locator("input").first if await contact_container.count() > 0 else page.locator("div[role='dialog'] input[placeholder*='contact' i]").first
                    
                    if await contact_input.count() > 0:
                        await contact_input.scroll_into_view_if_needed()
                        await contact_input.click(force=True)
                        await page.keyboard.press("Control+A")
                        await page.keyboard.press("Backspace")
                        await contact_input.fill(contact_info)
                        await page.wait_for_timeout(100)
                        
                        curr_val = await contact_input.input_value()
                        if not curr_val:
                            await contact_input.press_sequentially(contact_info, delay=20)
                    else:
                        alt_input = page.locator("div[role='dialog'] input[type='text']").nth(1)
                        if await alt_input.count() > 0:
                            await alt_input.fill(contact_info)

                    # 2. Đảm bảo Order Type được chọn
                    order_type_box = page.locator("div[role='dialog'] .MuiFormControl-root:has(label:has-text('Order Type'))").first
                    if await order_type_box.count() > 0:
                        type_txt = await order_type_box.inner_text()
                        if "Course" not in type_txt:
                            type_sel = order_type_box.locator("[role='combobox'], .MuiSelect-select").first
                            await type_sel.click(force=True)
                            c_opt = page.locator("li[role='option']:has-text('Course')").first
                            if await c_opt.count() > 0:
                                await c_opt.click(force=True)

                    # 3. Điền danh sách môn học
                    courses = order_data.get("courses", [])
                    if not courses:
                        courses = [{
                            "category": order_data.get("category", "SWRP"),
                            "course_name": order_data.get("course_name"),
                            "licenses": order_data.get("licenses", 50),
                            "start_date": order_data.get("start_date", "2026-09-01"),
                            "end_date": order_data.get("end_date", "2027-05-31")
                        }]

                    for idx, c in enumerate(courses):
                        if idx > 0:
                            logger.info(f"➕ Bấm 'Add Course' thêm môn #{idx + 1}...")
                            await page.click("div[role='dialog'] button:has-text('Add Course')", force=True)
                            await wait_for_dom_and_spinners(page, f"div[role='dialog'] .MuiGrid-container >> nth={idx}", min_pacing_ms=200)

                        course_card = page.locator("div[role='dialog'] .MuiGrid-container").nth(idx)

                        category_val = c.get("category", "SWRP")
                        cat_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License Category")).first
                        cat_select = cat_item.locator("[role='combobox'], .MuiSelect-select").first
                        await cat_select.click(force=True)
                        await page.wait_for_timeout(200)

                        cat_option = page.locator(f"li[role='option']:has-text('{category_val}')").first
                        if await cat_option.count() > 0:
                            await cat_option.click(force=True)
                        else:
                            await page.locator("li[role='option']").first.click(force=True)

                        course_name_val = c.get("course_name")
                        course_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text=re.compile(r"^Course"))).first
                        course_select = course_item.locator("[role='combobox'], .MuiSelect-select").first
                        await course_select.wait_for(state="visible", timeout=10000)
                        await course_select.click(force=True)
                        await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)
                        
                        if course_name_val:
                            target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                            if await target_opt.count() > 0:
                                await target_opt.click(force=True)
                            else:
                                await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)
                        else:
                            await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)

                        licenses_count = str(c.get("licenses", 50))
                        lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
                        lic_input = lic_item.locator("input[type='number']").first
                        await lic_input.click(force=True)
                        await page.keyboard.press("Control+A")
                        await page.keyboard.type(licenses_count)

                        start_date_val = normalize_date_iso(c.get("start_date")) or "2026-09-01"
                        end_date_val = normalize_date_iso(c.get("end_date")) or "2027-05-31"
                        
                        start_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Start Date")).first
                        if await start_item.count() > 0:
                            start_input = start_item.locator("input").first
                            await start_input.fill(start_date_val)

                        end_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="End Date")).first
                        if await end_item.count() > 0:
                            end_input = end_item.locator("input").first
                            await end_input.fill(end_date_val)

                    if order_data.get("additional_notes"):
                        notes_textarea = page.locator("div[role='dialog'] textarea").first
                        if await notes_textarea.count() > 0:
                            await notes_textarea.fill(order_data["additional_notes"])

                    # 5. Bấm Create Order & GIẢI CỨU LỖI TIMEOUT 15S
                    logger.info("🚀 Đang bấm 'Create Order' và kích hoạt bộ rình Toast thông minh...")
                    submit_dialog_btn = page.locator("div[role='dialog'] button:has-text('Create Order')").last
                    await submit_dialog_btn.click(force=True)

                    # 🎯 CHIẾN THUẬT AN TOÀN: Rà soát thông báo liên tục thay vì blind wait_for_selector 15s
                    dialog_closed = False
                    for check_turn in range(12):  # Tối đa 3.6 giây (12 x 300ms)
                        latest_msg = await self._check_latest_snackbar(page, wait_ms=300)
                        if latest_msg:
                            if latest_msg["type"] == "error":
                                logger.error(f"❌ [WORKSPACE TỪ CHỐI TẠO ORDER]: \"{latest_msg['text']}\"")
                                return {
                                    "status": "failed",
                                    "error": f"Workspace báo lỗi: \"{latest_msg['text']}\""
                                }
                            elif latest_msg["type"] == "success":
                                logger.info(f"✨ [WORKSPACE XÁC NHẬN]: \"{latest_msg['text']}\"")

                        # Kiểm tra xem Dialog đã biến mất chưa
                        if await page.locator("div[role='dialog']").count() == 0 or not await page.locator("div[role='dialog']").is_visible():
                            dialog_closed = True
                            break

                    # Nếu sau 3.6s Dialog vẫn trơ trơ không đóng -> bóc tách lỗi form
                    if not dialog_closed:
                        # Kiểm tra lại lần cuối xem có toast nào không
                        last_toast = await self._check_latest_snackbar(page, wait_ms=1000)
                        if last_toast and last_toast["type"] == "error":
                            return {"status": "failed", "error": f"Workspace báo lỗi: \"{last_toast['text']}\""}

                        # Quét tất cả chữ báo lỗi đỏ (.Mui-error) đang hiện trên dialog
                        field_errs = []
                        err_elements = page.locator("div[role='dialog'] .Mui-error, div[role='dialog'] .MuiFormHelperText-root")
                        for e_i in range(await err_elements.count()):
                            txt = (await err_elements.nth(e_i).inner_text()).strip()
                            if txt and txt not in field_errs:
                                field_errs.append(txt)

                        err_detail = " | ".join(field_errs) if field_errs else "Popup không đóng (Dữ liệu form bị thiếu hoặc không hợp lệ)"
                        logger.error(f"❌ [LỖI FORM DIALOG]: {err_detail}")
                        return {"status": "failed", "error": f"Workspace từ chối: {err_detail}"}

                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

                    first_row = page.locator(".MuiDataGrid-row").first
                    order_num_id = ""
                    order_full_code = ""
                    if await first_row.count() > 0:
                        order_num_id = await first_row.get_attribute("data-id") or ""
                        order_code_elem = first_row.locator("[data-field='school_order_id'] span, [data-field='school_order_id'], .MuiDataGrid-cell").first
                        order_full_code = (await order_code_elem.inner_text()).strip() if await order_code_elem.count() > 0 else (order_num_id or "")

                    if not order_full_code and order_num_id:
                        order_full_code = f"SCH-{order_num_id}"

                    if order_full_code:
                        await self._record_created_order_db(
                            order_id=order_full_code,
                            school_name=credentials.get("username", "Pythaverse School"),
                            order_data=order_data
                        )

                    logger.info(f"🎉 TẠO ORDER THÀNH CÔNG: [{order_full_code}] (ID: {order_num_id})")
                    return {
                        "status": "success",
                        "order_id": order_num_id,
                        "order_code": order_full_code,
                        "school_name": credentials.get("username"),
                        "message": f"School Order {order_full_code} đã được khởi tạo thành công"
                    }

                except Exception as e:
                    logger.error(f"❌ Lỗi School Create Order: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()
                    gc.collect()

    async def partner_approve_school_order(
        self, 
        credentials: Dict[str, str], 
        order_identifier: Optional[str] = None,
        auto_create_prt_if_short: bool = True,
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Partner duyệt School Order (Rà soát License & Bắt thông báo Workspace)."""
        async with acquire_playwright_slot("Partner Approve School Order", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("🤝 Partner mở /partner-workspace/order-management...")
                    await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="domcontentloaded", timeout=45000)
                    await self._setup_snackbar_observer(page)
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

                    search_code = str(order_identifier or "").strip()
                    if search_code:
                        logger.info(f"🎯 [KHÉP GÓC] Gõ mã đơn [{search_code}] vào ô Search...")
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
                        return {"status": "failed", "error": f"Không tìm thấy Order [{search_code}] trên danh sách Partner!"}

                    action_btn = target_row.locator("button:has(.lucide-menu), [data-field=' '] button, .MuiButton-containedPrimary").first
                    await action_btn.scroll_into_view_if_needed()
                    await action_btn.click(force=True)

                    view_menu_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')").last
                    await view_menu_item.wait_for(state="visible", timeout=8000)
                    await view_menu_item.click(force=True)

                    await page.wait_for_selector("div[role='dialog']:has-text('Order Details')", state="visible", timeout=15000)
                    await wait_for_dom_and_spinners(page, "div[role='dialog']:has-text('Order Details')", min_pacing_ms=400)

                    dialog = page.locator("div[role='dialog']:has-text('Order Details')").first
                    pool_card = dialog.locator("div:has(h6:has-text('Pool License Selection')), div.MuiBox-root:has(label:has-text('Pool License'))").first
                    if await pool_card.count() > 0:
                        await pool_card.scroll_into_view_if_needed()

                    pool_dropdowns = dialog.locator("div.MuiFormControl-root:has(label:has-text('Pool License')) [role='combobox'], div.MuiFormControl-root:has(label:has-text('Pool License')) .MuiSelect-select")
                    dropdown_count = await pool_dropdowns.count()
                    
                    logger.info(f"📊 Tìm thấy chính xác {dropdown_count} môn học cần chọn Pool License.")
                    all_courses_satisfied = True

                    if dropdown_count > 0:
                        for i in range(dropdown_count):
                            dropdown = pool_dropdowns.nth(i)
                            await dropdown.scroll_into_view_if_needed()

                            parent_box = dropdown.locator("xpath=./ancestor::div[contains(@class, 'MuiBox-root')][1]")
                            parent_text = await parent_box.inner_text() if await parent_box.count() > 0 else ""
                            
                            needed_qty = 1
                            match_needed = re.search(r"(\d+)\s+licenses?\s+needed", parent_text, re.IGNORECASE)
                            if match_needed:
                                needed_qty = int(match_needed.group(1))
                            
                            await dropdown.click(force=True)
                            await smart_wait_for_options_loaded(page, min_options=1, timeout=5000)

                            options = page.locator("li[role='option']")
                            opt_count = await options.count()
                            
                            best_opt = None
                            for o_idx in range(opt_count):
                                opt = options.nth(o_idx)
                                opt_text = await opt.inner_text()
                                
                                avail_match = re.search(r"Available:\s*(\d+)", opt_text, re.IGNORECASE)
                                if avail_match:
                                    avail_num = int(avail_match.group(1))
                                    if avail_num >= needed_qty:
                                        best_opt = opt
                                        break

                            if best_opt:
                                await best_opt.click(force=True)
                            else:
                                logger.warning(f"❌ Môn #{i+1}: Không có option nào có Available >= {needed_qty}!")
                                all_courses_satisfied = False
                                await page.keyboard.press("Escape")
                                break

                    approve_btn = dialog.locator("button:has-text('Approve Order')").first
                    try:
                        await approve_btn.wait_for(state="visible", timeout=3000)
                    except Exception:
                        pass

                    can_approve = (await approve_btn.count() > 0) and (await approve_btn.is_visible())

                    if can_approve and all_courses_satisfied:
                        logger.info("🎉 Kho Partner ĐỦ License! Đang bấm 'Approve Order'...")
                        await approve_btn.click(force=True)

                        toast = await self._check_latest_snackbar(page, wait_ms=3000)
                        if toast and toast.get("type") == "error":
                            return {"status": "failed", "error": f"Lỗi phê duyệt Order: \"{toast['text']}\""}

                        await self._sync_order_status_db(order_identifier=order_identifier, new_status="Approved", partner_name=credentials.get("username"))
                        
                        return {
                            "status": "success",
                            "order_identifier": order_identifier,
                            "message": f"Partner đã duyệt thành công School Order: {order_identifier}"
                        }
                    else:
                        logger.warning("⚠️ Kho Partner KHÔNG ĐỦ License để duyệt Order!")

                        if auto_create_prt_if_short:
                            logger.info(f"⚡ [1-SESSION PARTNER] Thiếu License! Chuyển sang tạo PRT Contract...")
                            close_btn = dialog.locator("button:has-text('Close')").first
                            if await close_btn.count() > 0:
                                await close_btn.click(force=True)
                                await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=5000)

                            prt_contract_res = await self._fill_partner_create_contract_form(
                                page=page,
                                contract_data={
                                    "notes": f"Auto-topup to approve School Order {order_identifier}",
                                    "courses": courses_needed or [{"category": "SWRP", "course_name": None, "licenses": 50}]
                                }
                            )

                            if prt_contract_res.get("status") == "success":
                                prt_code = prt_contract_res.get("contract_code")
                                return {
                                    "status": "insufficient_pool_created_prt",
                                    "order_identifier": order_identifier,
                                    "prt_contract_code": prt_code,
                                    "message": f"Kho Partner thiếu License, đã trực tiếp tạo PRT Contract [{prt_code}] gửi Distributor."
                                }
                            else:
                                return prt_contract_res

                        close_btn = dialog.locator("button:has-text('Close')").first
                        if await close_btn.count() > 0:
                            await close_btn.click(force=True)

                        return {
                            "status": "insufficient_pool",
                            "order_identifier": order_identifier,
                            "message": "Kho Partner không đủ License, cần tạo Contract xin Distributor cấp bù."
                        }

                except Exception as e:
                    logger.error(f"❌ Lỗi Partner Approve Order: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()
                    gc.collect()

    async def fetch_school_order_detailed_courses(
        self,
        credentials: Dict[str, str],
        order_identifier: str
    ) -> Dict[str, Any]:
        """Trích xuất chi tiết môn học của Order qua Direct API trong session."""
        async with acquire_playwright_slot("Fetch School Order Details", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err, "courses": []}

                    clean_order_num = re.sub(r"[^\d]", "", str(order_identifier))
                    detail_url = f"https://pythaverse.space/wp-content/plugins/distributor_workspace_v3/api/orders_management/getOrderDetail.php?order_id={clean_order_num}"
                    
                    detail_res = await page.evaluate(f"""async () => {{
                        try {{
                            const r = await fetch('{detail_url}');
                            return await r.json();
                        }} catch(e) {{
                            return null;
                        }}
                    }}""")

                    courses = []
                    if detail_res and "detail_package" in detail_res:
                        detail_courses = detail_res.get("detail_package", {}).get("courses", []) or []
                        for dc in detail_courses:
                            courses.append({
                                "course_id": dc.get("course_id"),
                                "course_name": dc.get("course_name"),
                                "category": dc.get("category", "SWRP"),
                                "licenses": int(dc.get("course_count", 1)),
                                "start_date": dc.get("course_enroll_start_date", "2026-09-01"),
                                "end_date": dc.get("course_enroll_end_date", "2027-05-31")
                            })

                    return {
                        "status": "success",
                        "order_identifier": order_identifier,
                        "courses": courses
                    }
                except Exception as e:
                    logger.error(f"❌ Lỗi fetch school order details: {e}")
                    return {"status": "failed", "error": str(e), "courses": []}
                finally:
                    await browser.close()
                    gc.collect()