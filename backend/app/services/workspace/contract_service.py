# backend/app/services/workspace/contract_service.py
import re
import os
import gc
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from playwright.async_api import async_playwright, Page, Response
from app.core.config import settings

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners, smart_wait_for_options_loaded

logger = logging.getLogger(__name__)


class WorkspaceContractService(WorkspaceBaseService):
    """
    Xử lý các nghiệp vụ tạo và phê duyệt Contract giữa Partner - Distributor - Sales Admin.
    Tích hợp Bộ rình thông báo Toast linh hoạt 100% (Universal MutationObserver Sniffer)
    bắt trọn mọi thông báo lỗi/thành công từ Workspace.
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

    async def _sync_contract_status_db(self, contract_identifier: str, contract_type: str = "PRT", new_status: str = "Approved"):
        """Cập nhật trạng thái PRT/DST Contract thành Approved trong CSDL Supabase."""
        if not contract_identifier:
            return
        try:
            from app.core.supabase import get_supabase_client
            clean_code = str(contract_identifier).strip()
            core_match = re.search(r"(\d{6,8}-\d+)", clean_code)
            pattern = f"%{core_match.group(1)}%" if core_match else f"%{clean_code}%"
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            
            supabase = get_supabase_client()
            update_res = supabase.table("workspace_contracts_cache").update({
                "status": new_status,
                "synced_at": now_utc
            }).ilike("contract_code", pattern).execute()

            if not update_res.data:
                supabase.table("workspace_contracts_cache").insert({
                    "contract_code": clean_code,
                    "contract_type": contract_type.upper(),
                    "status": new_status,
                    "total_licenses": 50,
                    "synced_at": now_utc,
                    "raw_data": {"auto_synced": True}
                }).execute()

            logger.info(f"💾 [DB SYNC] Đã cập nhật {contract_type} Contract [{clean_code}] -> Status: '{new_status}' trong CSDL Supabase.")
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

    # =========================================================================
    # ⚙️ CÁC LUỒNG THAO TÁC PLAYWRIGHT CONTRACT
    # =========================================================================
    async def _safe_navigate(self, page: Page, target_url: str, keyword_in_url: str = "", timeout: int = 35000):
        """Hàm điều hướng an toàn: chống lỗi net::ERR_ABORTED khi dính redirect SSO ngầm."""
        if keyword_in_url and keyword_in_url in page.url:
            return

        try:
            await page.goto(target_url, wait_until="domcontentloaded", timeout=timeout)
        except Exception as e:
            err_msg = str(e)
            if "ERR_ABORTED" in err_msg or "frame was detached" in err_msg:
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
        """Distributor điền form tạo Contract gửi Sales Admin (Bắt mọi thông báo lỗi/thành công)."""
        logger.info("📝 Distributor mở: /distributor-workspace/contract-po/create...")
        await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create", "contract-po/create")
        await self._setup_snackbar_observer(page)
        await wait_for_dom_and_spinners(page, "h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", min_pacing_ms=300)

        # 1. Chọn Contract Type
        logger.info("📋 Bước 1: Chọn Contract Type...")
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

            lic_qty = str(c.get("licenses", 100))
            logger.info(f"🔢 Môn #{idx + 1}: Điền License(s) = {lic_qty}...")
            lic_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="License(s)")).first
            lic_input = lic_item.locator("input[type='number']").first
            await lic_input.click(force=True)
            await page.keyboard.press("Control+A")
            await page.keyboard.type(lic_qty)

            unit_price_val = str(c.get("unit_price", 0))
            price_item = course_card.locator(".MuiGrid-item").filter(has=page.locator("label", has_text="Unit Price")).first
            if await price_item.count() > 0:
                price_input = price_item.locator("input[type='number']").first
                if await price_input.count() > 0:
                    await price_input.click(force=True)
                    await page.keyboard.press("Control+A")
                    await page.keyboard.type(unit_price_val)

        doc_path = contract_data.get("document_path") or contract_data.get("upload_file_path")
        if doc_path and os.path.exists(doc_path):
            logger.info(f"📎 Đang đính kèm tài liệu: {doc_path}...")
            file_input = page.locator("input#upload-documents, input[type='file']").first
            if await file_input.count() > 0:
                await file_input.set_input_files(doc_path)

        # 4. Bấm Create Contract/PO & BẮT THÔNG BÁO LINH HOẠT
        logger.info("🚀 Đang bấm nút 'Create Contract/PO'...")
        submit_btn = page.locator("button:has-text('Create Contract/PO')").last
        await submit_btn.click(force=True)

        toast = await self._check_latest_snackbar(page, wait_ms=3000)
        if toast and toast.get("type") == "error":
            return {
                "status": "failed",
                "error": f"Workspace từ chối tạo DST Contract: \"{toast['text']}\""
            }

        try:
            await page.wait_for_url("**/distributor-workspace/contract-po", timeout=15000)
        except Exception:
            await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po", "contract-po")

        await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

        first_row = page.locator(".MuiDataGrid-row").first
        contract_num_id = ""
        contract_full_code = ""
        if await first_row.count() > 0:
            contract_num_id = await first_row.get_attribute("data-id") or ""
            code_elem = first_row.locator("[data-field='order_code'] a, [data-field='contract_code'] a, [data-field='order_code'], a").first
            contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

        if not contract_full_code and contract_num_id:
            contract_full_code = f"DST-{contract_num_id}"

        if contract_full_code:
            await self._record_created_contract_db(
                contract_code=contract_full_code,
                contract_type="DST",
                status="Awaiting Sales Admin",
                courses=contract_data.get("courses"),
                notes=contract_data.get("notes")
            )

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
        """Duyệt Partner Contract bằng cơ chế Khép góc Search & Bắt thông báo Workspace."""
        async with acquire_playwright_slot("Distributor Approve Partner Contract", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("🏢 Mở giao diện Partner Contracts: /distributor-workspace/partner-contract-po...")
                    await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", "partner-contract-po")
                    await self._setup_snackbar_observer(page)
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
                        await self._sync_contract_status_db(search_code, "PRT", "Approved")
                        return {
                            "status": "success",
                            "contract_identifier": search_code,
                            "already_approved": True,
                            "message": f"Partner Contract [{search_code}] đã được duyệt từ trước."
                        }

                    logger.info(f"🔍 Bấm xem chi tiết Hợp đồng [{search_code}]...")
                    await target_row.scroll_into_view_if_needed()
                    info_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, button:has(.lucide-info)").first
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
                        logger.info("🎉 Kho Distributor ĐỦ License! Đang bấm 'Approve Order'...")
                        await approve_btn.click(force=True)

                        toast = await self._check_latest_snackbar(page, wait_ms=3000)
                        if toast and toast.get("type") == "error":
                            return {"status": "failed", "error": f"Lỗi phê duyệt Contract: \"{toast['text']}\""}

                        await self._sync_contract_status_db(contract_identifier=search_code, contract_type="PRT", new_status="Approved")
                        
                        return {
                            "status": "success",
                            "contract_identifier": search_code,
                            "message": f"Distributor đã phê duyệt thành công Partner Contract [{search_code}]!"
                        }

                    logger.warning(f"⚠️ Kho Distributor KHÔNG ĐỦ License để duyệt Contract [{search_code}]!")
                    
                    if auto_create_dst_if_short:
                        logger.info(f"⚡ [1-SESSION SPEEDUP] Kho thiếu License! Đóng modal và tạo DST Contract...")
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
        """Partner tạo PRT Contract độc lập (Bắt thông báo linh hoạt)."""
        async with acquire_playwright_slot("Partner Create Contract", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("📝 Partner mở: /partner-workspace/contract-po/create...")
                    await self._safe_navigate(page, f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", "contract-po/create")
                    await self._setup_snackbar_observer(page)
                    await wait_for_dom_and_spinners(page, "h4:has-text('Create Contract/PO'), :text('Create Contract/PO')", min_pacing_ms=300)

                    type_item = page.locator(".MuiFormControl-root:has(label:has-text('Contract Type')), .MuiGrid-item:has(label:has-text('Contract Type'))").first
                    type_select = type_item.locator("[role='combobox'], .MuiSelect-select").first
                    await type_select.wait_for(state="visible", timeout=10000)
                    await type_select.click(force=True)
                    await page.wait_for_timeout(300)
                    
                    license_type_opt = page.locator("li[role='option']:has-text('License')").first
                    if await license_type_opt.count() > 0:
                        await license_type_opt.click(force=True)
                    else:
                        await page.locator("li[role='option']").first.click(force=True)
                    await page.wait_for_timeout(300)

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
                        cat_select = course_card.locator("div:has(label:has-text('License Category')) [role='combobox'], div:has(label:has-text('License Category')) .MuiSelect-select").first
                        await cat_select.click(force=True)
                        await page.wait_for_timeout(250)
                        
                        cat_opt = page.locator(f"li[role='option']:has-text('{cat_val}')").first
                        if await cat_opt.count() > 0:
                            await cat_opt.click(force=True)
                        else:
                            await page.locator("li[role='option']").first.click(force=True)

                        await smart_wait_for_options_loaded(page, min_options=1, timeout=8000)

                        course_name_val = c.get("course_name")
                        course_select = course_card.locator("div:has(label:has-text('Course')) [role='combobox'], div:has(label:has-text('Course')) .MuiSelect-select").first
                        await course_select.click(force=True)

                        if course_name_val:
                            target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}')").first
                            if await target_opt.count() > 0:
                                await target_opt.click(force=True)
                            else:
                                await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)
                        else:
                            await page.locator("li[role='option']:not(:has-text('Select Course'))").first.click(force=True)

                        lic_qty = str(c.get("licenses", c.get("course_count", 50)))
                        lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                        await lic_input.click(force=True)
                        await page.keyboard.press("Control+A")
                        await page.keyboard.type(lic_qty)

                    submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                    await submit_btn.click(force=True)

                    toast = await self._check_latest_snackbar(page, wait_ms=3000)
                    if toast and toast.get("type") == "error":
                        return {
                            "status": "failed",
                            "error": f"Workspace từ chối tạo PRT Contract: \"{toast['text']}\""
                        }

                    try:
                        await page.wait_for_url("**/contract-po**", timeout=15000)
                    except Exception:
                        pass

                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-row", min_pacing_ms=400)

                    first_row = page.locator(".MuiDataGrid-row").first
                    contract_num_id = ""
                    contract_full_code = ""
                    if await first_row.count() > 0:
                        contract_num_id = await first_row.get_attribute("data-id") or ""
                        code_elem = first_row.locator("[data-field='order_code'], [data-field='contract_code'], .MuiDataGrid-cell").first
                        contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

                    if not contract_full_code and contract_num_id:
                        contract_full_code = f"PRT-{contract_num_id}"

                    if contract_full_code:
                        await self._record_created_contract_db(
                            contract_code=contract_full_code,
                            contract_type="PRT",
                            status="Awaiting Distributor",
                            partner_name=credentials.get("username"),
                            courses=contract_data.get("courses"),
                            notes=contract_data.get("notes")
                        )

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
        """Sales Admin duyệt DST Contract (Bắt thông báo linh hoạt)."""
        async with acquire_playwright_slot("Sales Admin Approve DST Contract", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    fallback_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"") or os.getenv("TEST_ADMIN_USER", "adminworkspace").strip().strip("'\"")
                    fallback_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"") or os.getenv("TEST_ADMIN_PASS", "").strip().strip("'\"")

                    admin_user = credentials.get("username") if (credentials and credentials.get("username")) else fallback_user
                    admin_pass = credentials.get("password") if (credentials and credentials.get("password")) else fallback_pass

                    logger.info(f"👑 [Sales Admin Guard] Sử dụng tài khoản: '{admin_user}'")

                    is_ok, login_err = await self.login_role(page, admin_user, admin_pass, "Sales Admin")
                    if not is_ok:
                        return {"status": "failed", "error": f"Sales Admin Login Failed: {login_err}"}

                    logger.info("👑 Đang chuyển hướng sang Sales Admin Dashboard...")
                    await self._safe_navigate(
                        page=page,
                        target_url=f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard",
                        keyword_in_url="sales-admin-workspace",
                        timeout=45000
                    )
                    await self._setup_snackbar_observer(page)
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
                            target_row = page.locator(".MuiDataGrid-row:has-text('Pending')").first

                    if not target_row or await target_row.count() == 0:
                        err_msg = f"❌ Không tìm thấy Hợp đồng ({search_kw or 'Pending'}) trên Sales Admin Dashboard!"
                        logger.error(err_msg)
                        return {"status": "failed", "error": err_msg}

                    row_raw_text = (await target_row.inner_text()).lower()
                    if "approved" in row_raw_text or "completed" in row_raw_text:
                        logger.info(f"✨ Hợp đồng [{search_kw}] đã ở trạng thái ĐÃ DUYỆT từ trước đó!")
                        await self._sync_contract_status_db(search_kw, "DST", "Approved")
                        return {
                            "status": "success",
                            "contract_identifier": search_kw,
                            "already_approved": True,
                            "message": f"Hợp đồng [{search_kw}] đã được Sales Admin phê duyệt từ trước đó."
                        }

                    logger.info("🔍 Mở chi tiết Contract...")
                    await target_row.scroll_into_view_if_needed()
                    code_link = target_row.locator("a, [data-field='order_code'] a, [data-field='contract_code'] a").first
                    
                    if await code_link.count() > 0 and await code_link.is_visible():
                        await code_link.click(force=True)
                    else:
                        eye_btn = target_row.locator("button[aria-label='View Details'], [data-field='Actions'] button, svg[data-testid='VisibilityIcon']").first
                        await eye_btn.click(timeout=15000, force=True)

                    approve_btn = page.locator("button:has-text('Approve')").first
                    try:
                        await approve_btn.wait_for(state="visible", timeout=10000)
                    except Exception:
                        pass

                    if await approve_btn.count() == 0 or not (await approve_btn.is_visible()):
                        logger.info(f"✨ Không tìm thấy nút 'Approve' -> Hợp đồng [{search_kw}] có thể đã được duyệt từ trước!")
                        await self._sync_contract_status_db(search_kw, "DST", "Approved")
                        return {
                            "status": "success",
                            "contract_identifier": search_kw,
                            "already_approved": True,
                            "message": f"Hợp đồng [{search_kw}] đã được Sales Admin phê duyệt từ trước đó."
                        }

                    logger.info("👑 Bấm nút 'Approve' trên trang chi tiết...")
                    await approve_btn.click(force=True)

                    confirm_dialog = page.locator("div[role='dialog'], .MuiDialog-root").first
                    if await confirm_dialog.count() > 0 and await confirm_dialog.is_visible():
                        logger.info("✍️ Điền lý do phê duyệt...")
                        textarea = confirm_dialog.locator("textarea").first
                        if await textarea.count() > 0:
                            default_note = "Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub"
                            valid_justification = justification if (justification and len(justification.strip()) >= 15) else default_note
                            await textarea.fill(valid_justification)

                        confirm_btn = confirm_dialog.locator("button:has-text('Confirm Approval'), button:has-text('Confirm'), button:has-text('Approve')").last
                        await confirm_btn.click(force=True)

                    toast = await self._check_latest_snackbar(page, wait_ms=3000)
                    if toast and toast.get("type") == "error":
                        return {"status": "failed", "error": f"Lỗi Sales Admin Approve: \"{toast['text']}\""}

                    await self._sync_contract_status_db(contract_identifier=search_kw, contract_type="DST", new_status="Approved")

                    logger.info(f"🎉 Sales Admin đã duyệt DST Contract {search_kw} thành công!")
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