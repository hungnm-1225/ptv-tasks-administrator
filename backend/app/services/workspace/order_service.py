# backend/app/services/workspace/order_service.py
import re
import logging
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL, normalize_date_iso

logger = logging.getLogger(__name__)


class WorkspaceOrderService(WorkspaceBaseService):
    """Xử lý các nghiệp vụ liên quan đến School Order & Phê duyệt của Partner."""

    async def school_create_order(
        self, 
        credentials: Dict[str, str], 
        order_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🏫 Mở trang danh sách Order: /school-workspace/orders...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/orders", wait_until="networkidle", timeout=45000)

                create_order_btn = page.locator("button:has-text('Create Order')").first
                await create_order_btn.wait_for(state="visible", timeout=15000)
                await create_order_btn.click()

                await page.wait_for_selector("div[role='dialog']:has-text('Create New Order')", timeout=15000)

                contact_info = order_data.get("contact_info", "Admin Automation Hub (operation@pythaverse.space)")
                contact_input = page.locator("div[role='dialog'] input[placeholder*='contact information'], div[role='dialog'] input[type='text']").first
                await contact_input.fill(contact_info)

                courses = order_data.get("courses", [])
                if not courses:
                    courses = [{
                        "category": order_data.get("category", "SWRP"),
                        "course_name": order_data.get("course_name"),
                        "licenses": order_data.get("licenses", 1),
                        "start_date": order_data.get("start_date"),
                        "end_date": order_data.get("end_date")
                    }]

                for idx, c in enumerate(courses):
                    if idx > 0:
                        await page.click("div[role='dialog'] button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    course_card = page.locator("div[role='dialog'] .MuiBox-root:has(> .MuiGrid-container)").nth(idx)

                    # A. License Category
                    cat_select = course_card.locator(".MuiGrid-item:has(label:has-text('License Category')) div[role='combobox'], .MuiGrid-item:has(label:has-text('License Category')) .MuiSelect-select").first
                    await cat_select.wait_for(state="visible", timeout=10000)
                    await cat_select.click()
                    await page.wait_for_timeout(500)

                    category_val = c.get("category", "SWRP")
                    cat_option = page.locator(f"li[role='option']:has-text('{category_val}'), .MuiMenu-list li:has-text('{category_val}')").first
                    await cat_option.wait_for(state="visible", timeout=5000)
                    await cat_option.click()
                    await page.wait_for_timeout(1000)

                    # B. Course Name
                    course_select = course_card.locator(".MuiGrid-item:has(label:has-text('Course')) div[role='combobox'], .MuiGrid-item:has(label:has-text('Course')) .MuiSelect-select").first
                    await course_select.wait_for(state="visible", timeout=10000)
                    await course_select.click()
                    await page.wait_for_timeout(500)
                    
                    course_name_val = c.get("course_name")
                    if course_name_val:
                        target_opt = page.locator(f"li[role='option']:has-text('{course_name_val}'), .MuiMenu-list li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("li[role='option']").first.click()
                    else:
                        await page.locator("li[role='option']").first.click()
                    
                    await page.wait_for_timeout(500)

                    # C. Licenses
                    licenses_count = str(c.get("licenses", 1))
                    lic_input = course_card.locator(".MuiGrid-item:has(label:has-text('License')) input[type='number']").first
                    await lic_input.fill(licenses_count)

                    # D. Dates
                    start_date_val = normalize_date_iso(c.get("start_date"))
                    end_date_val = normalize_date_iso(c.get("end_date"))
                    
                    start_input = course_card.locator(".MuiGrid-item:has(label:has-text('Start Date')) input").first
                    end_input = course_card.locator(".MuiGrid-item:has(label:has-text('End Date')) input").first
                    
                    if start_date_val:
                        await start_input.fill(start_date_val)
                    if end_date_val:
                        await end_input.fill(end_date_val)

                if order_data.get("additional_notes"):
                    notes_textarea = page.locator("div[role='dialog'] textarea").first
                    await notes_textarea.fill(order_data["additional_notes"])

                submit_dialog_btn = page.locator("div[role='dialog'] button:has-text('Create Order')").last
                await submit_dialog_btn.click()

                await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=20000)
                await page.wait_for_selector(".MuiDataGrid-root, .MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                order_num_id = await first_row.get_attribute("data-id") if await first_row.count() > 0 else ""
                order_code_elem = first_row.locator("[data-field='school_order_id'] span, [data-field='school_order_id']").first
                order_full_code = (await order_code_elem.inner_text()).strip() if await order_code_elem.count() > 0 else (order_num_id or "")

                logger.info(f"🎉 TẠO ORDER THÀNH CÔNG: [{order_full_code}]")
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

    async def partner_approve_school_order(
        self, 
        credentials: Dict[str, str], 
        order_identifier: Optional[str] = None
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🤝 Partner mở /partner-workspace/order-management...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root, .MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(1000)

                target_row = None
                if order_identifier:
                    target_row = page.locator(
                        f".MuiDataGrid-row[data-id='{order_identifier}'], "
                        f".MuiDataGrid-row:has([data-field='school_order_id']:has-text('{order_identifier}'))"
                    ).first
                
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status_name']:has-text('Awaiting Partner'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Order ({order_identifier}) ở trạng thái 'Awaiting Partner'"}

                action_btn = target_row.locator("[data-field=' '] button, button:has(.lucide-menu)").first
                await action_btn.click()
                
                view_menu_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')").first
                await view_menu_item.wait_for(state="visible", timeout=7000)
                await view_menu_item.click()

                await page.wait_for_selector("div[role='dialog']:has-text('Order Details')", timeout=15000)

                # Chọn Pool License cho tất cả các môn
                pool_dropdowns = page.locator("div[role='dialog'] div:has-text('Pool License Selection') .MuiSelect-select, div[role='dialog'] div:has-text('Pool License Selection') div[role='combobox']")
                pool_count = await pool_dropdowns.count()
                if pool_count == 0:
                    pool_dropdowns = page.locator("div[role='dialog'] .MuiSelect-select")
                    pool_count = await pool_dropdowns.count()

                for i in range(pool_count):
                    current_dd = pool_dropdowns.nth(i)
                    await current_dd.click()
                    await page.wait_for_timeout(500)

                    options = page.locator("ul[role='listbox'] li[role='option'], .MuiMenu-list li")
                    best_opt = options.locator(":has-text('Category License'), :has-text('Available')").first
                    
                    if await best_opt.count() > 0:
                        await best_opt.click()
                    else:
                        first_valid = options.locator(":not([data-value=''])").first
                        if await first_valid.count() > 0:
                            await first_valid.click()
                        elif await options.count() > 0:
                            await options.first.click()

                    await page.wait_for_timeout(800)

                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order')")

                if await approve_btn.count() > 0 and await approve_btn.is_visible():
                    logger.info("🎉 Kho đủ License! Đang bấm Approve Order...")
                    await approve_btn.click()
                    await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                    await page.wait_for_timeout(2000)
                    
                    return {
                        "status": "success",
                        "order_identifier": order_identifier,
                        "message": f"Partner đã duyệt thành công School Order: {order_identifier}"
                    }
                else:
                    close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                    if await close_btn.count() > 0:
                        await close_btn.click()

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

    async def fetch_school_order_detailed_courses(
        self,
        credentials: Dict[str, str],
        order_identifier: str
    ) -> Dict[str, Any]:
        """Partner mở chi tiết Order để bóc tách 100% thông tin môn học, số license và ngày tháng."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "courses": []}

                logger.info(f"🔍 Đang mở chi tiết Order [{order_identifier}] để đọc khóa học...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root, .MuiDataGrid-row", timeout=25000)

                target_row = page.locator(
                    f".MuiDataGrid-row[data-id='{order_identifier}'], "
                    f".MuiDataGrid-row:has([data-field='school_order_id']:has-text('{order_identifier}'))"
                ).first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Order {order_identifier}", "courses": []}

                action_btn = target_row.locator("[data-field=' '] button, button:has(.lucide-menu)").first
                await action_btn.click()
                view_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')").first
                await view_item.wait_for(state="visible", timeout=7000)
                await view_item.click()

                await page.wait_for_selector("div[role='dialog']:has-text('Order Details')", timeout=15000)

                course_cards = page.locator("div[role='dialog'] .MuiCard-root:has-text('Courses') .MuiPaper-root, div[role='dialog'] .MuiPaper-root:has(h6)")
                card_count = await course_cards.count()
                courses_extracted = []

                for idx in range(card_count):
                    c_card = course_cards.nth(idx)
                    title_elem = c_card.locator("h6").first
                    if await title_elem.count() == 0:
                        continue
                    course_name = (await title_elem.inner_text()).strip()

                    cat_elem = c_card.locator(".MuiChip-label").first
                    category = (await cat_elem.inner_text()).strip() if await cat_elem.count() > 0 else "SWRP"

                    student_text_elem = c_card.locator(".MuiGrid-item:has-text('No. of Student') p, .MuiGrid-item:has-text('No. of Student')").last
                    raw_student_text = (await student_text_elem.inner_text()).strip() if await student_text_elem.count() > 0 else "1"
                    digits = re.findall(r"\d+", raw_student_text)
                    licenses = int(digits[-1]) if digits else 50

                    start_elem = c_card.locator(".MuiGrid-item:has-text('Start Date') p, .MuiGrid-item:has-text('Start Date')").last
                    end_elem = c_card.locator(".MuiGrid-item:has-text('End Date') p, .MuiGrid-item:has-text('End Date')").last
                    
                    start_date = (await start_elem.inner_text()).strip() if await start_elem.count() > 0 else "2026-09-01"
                    end_date = (await end_elem.inner_text()).strip() if await end_elem.count() > 0 else "2027-05-31"

                    courses_extracted.append({
                        "category": category,
                        "course_name": course_name,
                        "licenses": licenses,
                        "start_date": start_date,
                        "end_date": end_date
                    })

                close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                if await close_btn.count() > 0:
                    await close_btn.click()

                logger.info(f"✅ Bóc tách thành công {len(courses_extracted)} khóa học trong Order {order_identifier}!")
                return {
                    "status": "success",
                    "order_identifier": order_identifier,
                    "courses": courses_extracted
                }

            except Exception as e:
                logger.error(f"❌ Lỗi bóc tách chi tiết Order: {e}")
                return {"status": "failed", "error": str(e), "courses": []}
            finally:
                await browser.close()