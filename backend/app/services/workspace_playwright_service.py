# backend/app/services/workspace_playwright_service.py
import os
import re
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from playwright.async_api import async_playwright, Page, BrowserContext

from app.core.config import settings

logger = logging.getLogger(__name__)
BASE_WORKSPACE_URL = "https://pythaverse.space"


def normalize_date_iso(date_str: Optional[str]) -> Optional[str]:
    """Tự động chuẩn hóa mọi định dạng ngày về YYYY-MM-DD."""
    if not date_str:
        return None
    date_str = str(date_str).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return date_str
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d.%m.%Y"):
        try:
            dt = datetime.strptime(date_str.split("T")[0], fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    parts = re.split(r"[-/\.]", date_str)
    if len(parts) == 3:
        if len(parts[0]) == 4:
            return f"{parts[0]:0>4}-{int(parts[1]):02d}-{int(parts[2]):02d}"
        elif len(parts[2]) == 4:
            return f"{parts[2]:0>4}-{int(parts[1]):02d}-{int(parts[0]):02d}"
    return date_str


class WorkspacePlaywrightService:
    """Service RPA tự động hóa 100% các tác vụ Account Creation, Order & Contract trên Pythaverse."""

    def __init__(self):
        self.headless = True

    async def _create_context(self, p) -> tuple:
        browser = await p.chromium.launch(
            headless=self.headless,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-zygote",
                "--single-process"
            ]
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        return browser, context, page

    async def login_role(self, page: Page, username: str, password: str, role_title: str = "Tài khoản") -> tuple[bool, str]:
        if not username or not password:
            err = f"❌ [{role_title}] Thiếu thông tin username/mật khẩu trong Két Sắt Credentials Vault!"
            logger.error(err)
            return False, err

        try:
            logger.info(f"🔑 [{role_title}] Đang đăng nhập tài khoản '{username}'...")
            response = await page.goto(f"{BASE_WORKSPACE_URL}/login", wait_until="networkidle", timeout=35000)
            
            if response and response.status >= 500:
                err = f"🔥 [{role_title}] Máy chủ Pythaverse bị sập hoặc bảo trì! (Mã HTTP: {response.status})"
                logger.error(err)
                return False, err

            await page.fill("input[name='username'], input[name='email'], #username", username)
            await page.fill("input[name='password'], #password", password)
            await page.click("button[type='submit'], input[type='submit'], button:has-text('Log In'), button:has-text('Đăng nhập')")
            await page.wait_for_timeout(3500)

            kc_error_locator = page.locator(".alert-error, #input-error, span.kc-feedback-text, .alert.alert-warning, p.instruction")
            if await kc_error_locator.count() > 0 and await kc_error_locator.first.is_visible():
                raw_error_text = (await kc_error_locator.first.inner_text()).strip()
                err = f"❌ [{role_title} - '{username}'] Đăng nhập thất bại: '{raw_error_text}'"
                logger.error(err)
                return False, err

            if "login" in page.url or "authenticate" in page.url:
                err = f"⚠️ [{role_title} - '{username}'] Không thể chuyển trang sau đăng nhập (URL: {page.url})"
                logger.warning(err)
                return False, err

            logger.info(f"✅ [{role_title}] Đăng nhập thành công: {username} (URL: {page.url})")
            return True, "Đăng nhập thành công"

        except Exception as e:
            err_str = str(e)
            if "Timeout" in err_str:
                err = f"⏳ [{role_title} - '{username}'] Quá thời gian chờ phản hồi (Timeout)!"
            elif "ERR_CONNECTION" in err_str or "ECONNREFUSED" in err_str:
                err = f"🔌 [{role_title}] Mất kết nối tới máy chủ Pythaverse!"
            else:
                err = f"💥 [{role_title} - '{username}'] Lỗi đăng nhập: {err_str[:150]}"
            logger.error(err)
            return False, err

    # =========================================================================
    # 🔍 LIVE SCRAPERS: QUÉT DANH SÁCH & BÓC TÁCH CHI TIẾT MÔN HỌC
    # =========================================================================
    async def fetch_partner_pending_school_orders(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Partner cào danh sách các Order của Trường đang ở trạng thái 'Awaiting Partner'."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "orders": []}

                logger.info("🔍 Partner đang quét danh sách Order tại /partner-workspace/order-management...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root", timeout=25000)
                await page.wait_for_timeout(1000)

                rows = page.locator(".MuiDataGrid-row:has([data-field='status_name']:has-text('Awaiting Partner'))")
                count = await rows.count()
                pending_orders = []

                for i in range(count):
                    row = rows.nth(i)
                    order_id_elem = row.locator("[data-field='school_order_id'] span, [data-field='school_order_id']").first
                    school_elem = row.locator("[data-field='school_name'] .MuiDataGrid-cellContent, [data-field='school_name']").first
                    date_elem = row.locator("[data-field='created_at'] .MuiDataGrid-cellContent, [data-field='created_at']").first
                    type_elem = row.locator("[data-field='type'] .MuiChip-label, [data-field='type']").first
                    status_elem = row.locator("[data-field='status_name'] .MuiDataGrid-cellContent, [data-field='status_name']").first
                    data_id = await row.get_attribute("data-id")

                    order_code = (await order_id_elem.inner_text()).strip() if await order_id_elem.count() > 0 else (data_id or "")
                    school_name = (await school_elem.inner_text()).strip() if await school_elem.count() > 0 else ""
                    created_at = (await date_elem.inner_text()).strip() if await date_elem.count() > 0 else ""
                    order_type = (await type_elem.inner_text()).strip() if await type_elem.count() > 0 else "Course"
                    status_name = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else "Awaiting Partner"

                    if order_code:
                        pending_orders.append({
                            "data_id": data_id,
                            "order_code": order_code,
                            "school_name": school_name,
                            "created_at": created_at,
                            "type": order_type,
                            "status": status_name
                        })

                return {"status": "success", "orders": pending_orders, "total": len(pending_orders)}

            except Exception as e:
                logger.error(f"❌ Lỗi quét School Orders Pending: {e}")
                return {"status": "failed", "error": str(e), "orders": []}
            finally:
                await browser.close()

    async def fetch_school_order_detailed_courses(
        self,
        credentials: Dict[str, str],
        order_identifier: str
    ) -> Dict[str, Any]:
        """
        Partner mở chi tiết một Order cụ thể để bóc tách 100% thông tin môn học, số license và ngày tháng.
        """
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "courses": []}

                logger.info(f"🔍 Đang mở chi tiết Order [{order_identifier}] để đọc khóa học...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/order-management", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)

                target_row = page.locator(
                    f".MuiDataGrid-row[data-id='{order_identifier}'], "
                    f".MuiDataGrid-row:has([data-field='school_order_id']:has-text('{order_identifier}'))"
                ).first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Order {order_identifier}", "courses": []}

                # Mở popover View
                action_btn = target_row.locator("[data-field=' '] button, button:has(.lucide-menu)").first
                await action_btn.click()
                view_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')").first
                await view_item.wait_for(state="visible", timeout=7000)
                await view_item.click()

                await page.wait_for_selector("div[role='dialog']:has-text('Order Details')", timeout=15000)

                # Bóc tách các thẻ môn học trong Dialog
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

                    # Tìm số lượng học sinh / licenses
                    student_text_elem = c_card.locator(".MuiGrid-item:has-text('No. of Student') p, .MuiGrid-item:has-text('No. of Student')").last
                    raw_student_text = (await student_text_elem.inner_text()).strip() if await student_text_elem.count() > 0 else "1"
                    digits = re.findall(r"\d+", raw_student_text)
                    licenses = int(digits[-1]) if digits else 1

                    # Tìm Start Date & End Date
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

                # Đọc Contact Info & Note
                contact_input = page.locator("div[role='dialog'] input[id*='r4r'], div[role='dialog'] input[readonly]").nth(2)
                contact_val = (await contact_input.input_value()) if await contact_input.count() > 0 else ""

                notes_input = page.locator("div[role='dialog'] textarea").first
                notes_val = (await notes_input.input_value()) if await notes_input.count() > 0 else ""

                # Đóng dialog
                close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                if await close_btn.count() > 0:
                    await close_btn.click()

                logger.info(f"✅ Bóc tách thành công {len(courses_extracted)} khóa học trong Order {order_identifier}!")
                return {
                    "status": "success",
                    "order_identifier": order_identifier,
                    "contact_info": contact_val,
                    "additional_notes": notes_val,
                    "courses": courses_extracted
                }

            except Exception as e:
                logger.error(f"❌ Lỗi bóc tách chi tiết Order: {e}")
                return {"status": "failed", "error": str(e), "courses": []}
            finally:
                await browser.close()

    async def fetch_partner_contracts(self, credentials: Dict[str, str], filter_pending: bool = False) -> Dict[str, Any]:
        """Partner xem danh sách Contract/PO gửi lên Distributor."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "contracts": []}

                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root", timeout=25000)
                await page.wait_for_timeout(1000)

                row_selector = ".MuiDataGrid-row:has([data-field='status']:has-text('Pending Distributor Review'))" if filter_pending else ".MuiDataGrid-row"
                rows = page.locator(row_selector)
                count = await rows.count()
                contracts = []

                for i in range(count):
                    row = rows.nth(i)
                    code_elem = row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                    type_elem = row.locator("[data-field='order_type'] .MuiChip-label, [data-field='order_type']").first
                    date_elem = row.locator("[data-field='order_date']").first
                    status_elem = row.locator("[data-field='status'] .MuiChip-label, [data-field='status']").first
                    amount_elem = row.locator("[data-field='total_amount'] .MuiBox-root, [data-field='total_amount']").first
                    data_id = await row.get_attribute("data-id")

                    contract_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (data_id or "")
                    contract_type = (await type_elem.inner_text()).strip() if await type_elem.count() > 0 else "License"
                    order_date = (await date_elem.inner_text()).strip() if await date_elem.count() > 0 else ""
                    status_text = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else ""
                    total_amount = (await amount_elem.inner_text()).strip() if await amount_elem.count() > 0 else "$0.00"

                    if contract_code:
                        contracts.append({
                            "data_id": data_id,
                            "contract_code": contract_code,
                            "contract_type": contract_type,
                            "order_date": order_date,
                            "status": status_text,
                            "total_amount": total_amount
                        })

                return {"status": "success", "contracts": contracts, "total": len(contracts)}

            except Exception as e:
                logger.error(f"❌ Lỗi quét Partner Contracts: {e}")
                return {"status": "failed", "error": str(e), "contracts": []}
            finally:
                await browser.close()

    async def fetch_distributor_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Distributor quét danh sách Partner Contracts (PRT-...) đang chờ duyệt."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "contracts": []}

                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root", timeout=25000)
                await page.wait_for_timeout(1000)

                rows = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))")
                count = await rows.count()
                pending_list = []

                for i in range(count):
                    row = rows.nth(i)
                    code_elem = row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                    status_elem = row.locator("[data-field='status']").first
                    date_elem = row.locator("[data-field='order_date'], [data-field='created_at']").first
                    data_id = await row.get_attribute("data-id")
                    
                    code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (data_id or "")
                    status = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else "Pending"
                    date = (await date_elem.inner_text()).strip() if await date_elem.count() > 0 else ""

                    if code:
                        pending_list.append({
                            "data_id": data_id,
                            "contract_code": code,
                            "status": status,
                            "date": date
                        })

                return {"status": "success", "contracts": pending_list, "total": len(pending_list)}

            except Exception as e:
                logger.error(f"❌ Lỗi quét Distributor Pending Contracts: {e}")
                return {"status": "failed", "error": str(e), "contracts": []}
            finally:
                await browser.close()

    async def fetch_sales_admin_pending_contracts(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Sales Admin quét danh sách DST Contracts (DST-...) đang chờ duyệt trên Dashboard."""
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
                if not is_ok:
                    return {"status": "failed", "error": login_err, "contracts": []}

                await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-root", timeout=25000)
                await page.wait_for_timeout(1000)

                rows = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))")
                count = await rows.count()
                pending_list = []

                for i in range(count):
                    row = rows.nth(i)
                    code_elem = row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                    status_elem = row.locator("[data-field='status']").first
                    data_id = await row.get_attribute("data-id")
                    
                    code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (data_id or "")
                    status = (await status_elem.inner_text()).strip() if await status_elem.count() > 0 else "Pending"

                    if code:
                        pending_list.append({
                            "data_id": data_id,
                            "contract_code": code,
                            "status": status
                        })

                return {"status": "success", "contracts": pending_list, "total": len(pending_list)}

            except Exception as e:
                logger.error(f"❌ Lỗi quét Sales Admin Pending Contracts: {e}")
                return {"status": "failed", "error": str(e), "contracts": []}
            finally:
                await browser.close()

    # =========================================================================
    # 1. SCHOOL TẠO ORDER
    # =========================================================================
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
                await page.wait_for_selector(".MuiDataGrid-row", timeout=20000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                order_num_id = await first_row.get_attribute("data-id")
                
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

    # =========================================================================
    # 2. PARTNER DUYỆT SCHOOL ORDER
    # =========================================================================
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
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
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

    # =========================================================================
    # 2B. PARTNER TẠO CONTRACT GỬI DISTRIBUTOR
    # =========================================================================
    async def partner_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Partner")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📝 Partner mở: /partner-workspace/contract-po/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/partner-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("h4:has-text('Create Contract/PO')", timeout=15000)

                # Chọn Contract Type = License
                type_select = page.locator(".MuiGrid-item:has(label:has-text('Contract Type')) .MuiSelect-select, .MuiGrid-item:has(label:has-text('Contract Type')) div[role='combobox']").first
                await type_select.wait_for(state="visible", timeout=10000)
                await type_select.click()
                await page.wait_for_timeout(500)

                license_type_opt = page.locator("ul[role='listbox'] li[data-value='License'], ul[role='listbox'] li:has-text('License')").first
                await license_type_opt.wait_for(state="visible", timeout=5000)
                await license_type_opt.click()
                await page.wait_for_timeout(1000)

                # Điền Notes
                notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub to fulfill School Order")
                notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea").first
                if await notes_input.count() > 0:
                    await notes_input.fill(notes)

                # Điền Courses
                courses = contract_data.get("courses", [])
                if not courses:
                    courses = [{"category": "SWRP", "course_name": None, "licenses": 50}]

                for idx, c in enumerate(courses):
                    if idx > 0:
                        add_btn = page.locator("button:has-text('Add Course')").first
                        await add_btn.click()
                        await page.wait_for_timeout(1000)

                    course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

                    cat_val = c.get("category", "SWRP")
                    cat_select = course_card.locator("div:has(label:has-text('License Category')) .MuiSelect-select, div:has(label:has-text('License Category')) div[role='combobox']").first
                    await cat_select.click()
                    await page.wait_for_timeout(500)

                    cat_opt = page.locator(f"ul[role='listbox'] li[data-value='{cat_val}'], ul[role='listbox'] li:has-text('{cat_val}')").first
                    if await cat_opt.count() > 0:
                        await cat_opt.click()
                    else:
                        await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()

                    await page.wait_for_timeout(1000)

                    course_name_val = c.get("course_name")
                    course_select = course_card.locator("div:has(label:has-text('Course')) .MuiSelect-select, div:has(label:has-text('Course')) div[role='combobox']").first
                    await course_select.click()
                    await page.wait_for_timeout(500)

                    if course_name_val:
                        target_opt = page.locator(f"ul[role='listbox'] li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("ul[role='listbox'] li").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li").first.click()

                    await page.wait_for_timeout(500)

                    lic_qty = str(c.get("licenses", 50))
                    lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                    await lic_input.fill(lic_qty)

                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()

                await page.wait_for_selector(".MuiDataGrid-row", timeout=30000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id")
                
                code_elem = first_row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

                logger.info(f"🎉 TẠO CONTRACT PRT THÀNH CÔNG: [{contract_full_code}]")

                return {
                    "status": "success",
                    "contract_id": contract_num_id,
                    "contract_code": contract_full_code,
                    "message": f"Partner đã tạo Contract {contract_full_code} gửi Distributor thành công"
                }

            except Exception as e:
                logger.error(f"❌ Lỗi Partner Create Contract: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 3A. DISTRIBUTOR DUYỆT PARTNER CONTRACT (PRT-...)
    # =========================================================================
    async def distributor_approve_partner_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("🏢 Distributor mở: /distributor-workspace/partner-contract-po...")
                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/partner-contract-po", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(1000)

                target_row = None
                if contract_identifier:
                    target_row = page.locator(
                        f".MuiDataGrid-row[data-id='{contract_identifier}'], "
                        f".MuiDataGrid-row:has([data-field='order_code']:has-text('{contract_identifier}'))"
                    ).first
                
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Contract ({contract_identifier}) ở trạng thái chờ duyệt"}

                info_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, [data-field=' '] button, button:has(.lucide-menu)").first
                await info_btn.click()
                await page.wait_for_timeout(500)

                view_item = page.locator("li[role='menuitem']:has-text('View'), .MuiMenuItem-root:has-text('View')")
                if await view_item.count() > 0 and await view_item.is_visible():
                    await view_item.click()

                await page.wait_for_selector("div[role='dialog']", timeout=15000)

                approve_btn = page.locator("div[role='dialog'] button:has-text('Approve Order'), div[role='dialog'] button:has-text('Approve')")

                if await approve_btn.count() > 0 and await approve_btn.is_visible():
                    logger.info("✨ Kho đủ License! Bấm nút 'Approve Order'...")
                    await approve_btn.click()
                    await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                    await page.wait_for_timeout(2000)
                    
                    return {
                        "status": "success",
                        "contract_identifier": contract_identifier,
                        "message": "Distributor đã duyệt Partner Contract thành công"
                    }
                else:
                    close_btn = page.locator("div[role='dialog'] button:has-text('Close')").first
                    if await close_btn.count() > 0:
                        await close_btn.click()

                    return {
                        "status": "insufficient_pool",
                        "contract_identifier": contract_identifier,
                        "message": "Kho Distributor không đủ License, cần tạo Contract xin Sales Admin cấp thêm."
                    }

            except Exception as e:
                logger.error(f"❌ Lỗi Distributor Approve Partner Contract: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 3B. DISTRIBUTOR TẠO CONTRACT GỬI SALES ADMIN (DST-...)
    # =========================================================================
    async def distributor_create_contract(
        self,
        credentials: Dict[str, str],
        contract_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Distributor")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📝 Distributor mở: /distributor-workspace/contract-po/create...")
                await page.goto(f"{BASE_WORKSPACE_URL}/distributor-workspace/contract-po/create", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("h4:has-text('Create Contract/PO'), text=Create Contract/PO", timeout=15000)

                type_select = page.locator(".MuiGrid-item:has(label:has-text('Contract Type')) .MuiSelect-select, .MuiGrid-item:has(label:has-text('Contract Type')) div[role='combobox']").first
                await type_select.click()
                await page.wait_for_timeout(500)

                license_opt = page.locator("ul[role='listbox'] li[data-value='License'], ul[role='listbox'] li:has-text('License')").first
                await license_opt.click()
                await page.wait_for_timeout(1000)

                notes = contract_data.get("notes", "Auto-requested by PTV Automation Hub to fulfill Partner Contract")
                notes_input = page.locator("div:has(label:has-text('Contract Notes')) textarea").first
                if await notes_input.count() > 0:
                    await notes_input.fill(notes)

                courses = contract_data.get("courses", [])
                if not courses:
                    courses = [{"category": "SWRP", "course_name": None, "licenses": 100}]

                for idx, c in enumerate(courses):
                    if idx > 0:
                        await page.click("button:has-text('Add Course')")
                        await page.wait_for_timeout(1000)

                    course_card = page.locator(".MuiCard-root:has(label:has-text('License Category'))").nth(idx)

                    cat_val = c.get("category", "SWRP")
                    cat_dropdown = course_card.locator("div:has(label:has-text('License Category')) .MuiSelect-select, div:has(label:has-text('License Category')) div[role='combobox']").first
                    await cat_dropdown.click()
                    await page.wait_for_timeout(500)

                    cat_opt = page.locator(f"ul[role='listbox'] li[data-value='{cat_val}'], ul[role='listbox'] li:has-text('{cat_val}')").first
                    if await cat_opt.count() > 0:
                        await cat_opt.click()
                    else:
                        await page.locator("ul[role='listbox'] li:not([data-value=''])").first.click()

                    await page.wait_for_timeout(1000)

                    course_name_val = c.get("course_name")
                    course_dropdown = course_card.locator("div:has(label:has-text('Course')) .MuiSelect-select, div:has(label:has-text('Course')) div[role='combobox']").first
                    await course_dropdown.click()
                    await page.wait_for_timeout(500)

                    if course_name_val:
                        target_opt = page.locator(f"ul[role='listbox'] li:has-text('{course_name_val}')").first
                        if await target_opt.count() > 0:
                            await target_opt.click()
                        else:
                            await page.locator("ul[role='listbox'] li").first.click()
                    else:
                        await page.locator("ul[role='listbox'] li").first.click()

                    await page.wait_for_timeout(500)

                    lic_input = course_card.locator("div:has(label:has-text('License(s)')) input[type='number'], input[type='number']").first
                    await lic_input.fill(str(c.get("licenses", 100)))

                submit_btn = page.locator("button:has-text('Create Contract/PO')").last
                await submit_btn.click()

                await page.wait_for_selector(".MuiDataGrid-row", timeout=30000)
                await page.wait_for_timeout(2000)

                first_row = page.locator(".MuiDataGrid-row").first
                contract_num_id = await first_row.get_attribute("data-id")
                
                code_elem = first_row.locator("[data-field='order_code'] .MuiBox-root, [data-field='order_code']").first
                contract_full_code = (await code_elem.inner_text()).strip() if await code_elem.count() > 0 else (contract_num_id or "")

                logger.info(f"🎉 TẠO DST CONTRACT THÀNH CÔNG: [{contract_full_code}]")

                return {
                    "status": "success",
                    "contract_id": contract_num_id,
                    "contract_code": contract_full_code,
                    "message": f"Distributor đã tạo Contract {contract_full_code} gửi Sales Admin thành công"
                }

            except Exception as e:
                logger.error(f"❌ Lỗi Distributor Create Contract: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 4. SALES ADMIN DUYỆT DST CONTRACT (DST-...)
    # =========================================================================
    async def admin_approve_distributor_contract(
        self,
        credentials: Dict[str, str],
        contract_identifier: Optional[str] = None,
        justification: Optional[str] = None
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "Sales Admin")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("👑 Mở: /sales-admin-workspace/dashboard...")
                await page.goto(f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector(".MuiDataGrid-row", timeout=25000)
                await page.wait_for_timeout(1000)

                target_row = None
                if contract_identifier:
                    target_row = page.locator(
                        f".MuiDataGrid-row[data-id='{contract_identifier}'], "
                        f".MuiDataGrid-row:has([data-field='order_code']:has-text('{contract_identifier}'))"
                    ).first
                
                if not target_row or await target_row.count() == 0:
                    target_row = page.locator(".MuiDataGrid-row:has([data-field='status']:has-text('Pending'))").first

                if await target_row.count() == 0:
                    return {"status": "failed", "error": f"Không tìm thấy Contract ({contract_identifier}) Pending trên Dashboard"}

                eye_btn = target_row.locator("button[aria-label='View Details'], [data-field='actions'] button, [data-field=' '] button").first
                await eye_btn.click()

                await page.wait_for_selector("button:has-text('Approve')", timeout=15000)

                approve_btn = page.locator("button:has-text('Approve')").first
                await approve_btn.click()

                await page.wait_for_selector("div[role='dialog']:has-text('Confirm Order Approval'), div[role='dialog']", timeout=10000)

                default_note = "Afiq requests and approves the requests, Hung QA processes the contract via Automation Hub"
                valid_justification = justification if (justification and len(justification.strip()) >= 15) else default_note
                
                textarea = page.locator("div[role='dialog'] textarea").first
                await textarea.fill(valid_justification)
                await page.wait_for_timeout(800)

                confirm_btn = page.locator("div[role='dialog'] button:has-text('Confirm Approval'), div[role='dialog'] button:has-text('Confirm')").first
                await confirm_btn.click()
                await page.wait_for_selector("div[role='dialog']", state="hidden", timeout=15000)
                await page.wait_for_timeout(2000)

                logger.info(f"🎉 Sales Admin đã duyệt DST Contract {contract_identifier or ''} thành công!")
                return {
                    "status": "success",
                    "contract_identifier": contract_identifier,
                    "justification": valid_justification,
                    "message": "Sales Admin đã phê duyệt DST Contract thành công"
                }

            except Exception as e:
                logger.error(f"❌ Lỗi Sales Admin Approve: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    # =========================================================================
    # 5. MASTER ORCHESTRATOR: TRỌN GÓI 4-IN-1 (E2E)
    # =========================================================================
    async def execute_full_license_hierarchy_chain(
        self,
        school_identifier: str,
        order_details: Dict[str, Any],
        sales_admin_creds: Dict[str, str],
        cof_file_path: Optional[str] = None
    ) -> Dict[str, Any]:
        from app.services.workspace_lineage_service import workspace_lineage_service
        from app.services.google_drive_service import google_drive_service
        
        logs = []
        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [TRỌN GÓI 4-IN-1] Bắt đầu quy trình toàn trình cho trường: '{school_identifier}'")

        lineage = workspace_lineage_service.resolve_by_school(school_identifier)
        if not lineage:
            err = f"Không tìm thấy phả hệ của trường '{school_identifier}' trong cơ sở dữ liệu!"
            log_step(f"❌ {err}")
            return {"status": "failed", "error": err, "logs": "\n".join(logs)}

        school_creds = lineage["school"]
        partner_creds = lineage["partner"]
        distributor_creds = lineage["distributor"]
        country_info = lineage.get("country", {})

        drive_link = ""
        if cof_file_path and os.path.exists(cof_file_path):
            try:
                root_id = getattr(settings, "COF_ROOT_FOLDER_ID", "1SEh4I9yJRM8JNi_SC9CltpkyDYeG-I--")
                folder_id = google_drive_service.ensure_school_cof_folder(
                    root_folder_id=root_id,
                    country=country_info.get("folder", "4. Vietnam"),
                    distributor_name=distributor_creds["name"],
                    partner_name=partner_creds["name"],
                    school_name=school_creds["name"]
                )
                upload_res = google_drive_service.upload_file_to_school_folder(cof_file_path, folder_id)
                drive_link = upload_res.get("web_view_link", "")
                log_step(f"📁 Đã lưu trữ file COF lên Google Drive: {drive_link}")
            except Exception as e:
                log_step(f"⚠️ Lỗi phụ Google Drive (bỏ qua để tiếp tục RPA): {e}")

        if drive_link:
            notes = order_details.get("additional_notes", "")
            order_details["additional_notes"] = f"{notes}\nCOF Drive: {drive_link}".strip()

        # BƯỚC 1: School tạo Order
        log_step(f"🏫 [BƯỚC 1 - SCHOOL] Đang tạo Order cho trường '{school_creds.get('name')}'...")
        school_res = await self.school_create_order(school_creds, order_details)
        if school_res.get("status") != "success":
            err_detail = school_res.get("error", "Lỗi tạo Order tại School")
            log_step(f"❌ [LỖI SCHOOL]: {err_detail}")
            return {"status": "failed", "step": "school_create_order", "error": err_detail, "logs": "\n".join(logs)}

        order_code = school_res.get("order_code")
        log_step(f"✅ [BƯỚC 1] School đã tạo Order thành công: [{order_code}]")

        # BƯỚC 2: Phân phối License (Partner duyệt + Tự động xin bù)
        log_step(f"🤝 [BƯỚC 2 - LICENSE] Đang duyệt và cấp phép License cho [{order_code}]...")
        partner_res = await self.partner_approve_school_order(partner_creds, order_code)

        if partner_res.get("status") == "insufficient_pool":
            log_step("⚠️ Kho Partner thiếu License! Đang tạo PRT Contract lên Distributor...")
            prt_contract = await self.partner_create_contract(partner_creds, {
                "notes": f"Fulfill School Order {order_code}",
                "courses": order_details.get("courses", [])
            })
            if prt_contract.get("status") != "success":
                return {"status": "failed", "step": "partner_create_contract", "error": prt_contract.get("error"), "logs": "\n".join(logs)}
            
            prt_code = prt_contract.get("contract_code")
            log_step(f"✅ Đã tạo Contract Partner: [{prt_code}]")

            # Distributor duyệt
            dist_res = await self.distributor_approve_partner_contract(distributor_creds, prt_code)
            if dist_res.get("status") == "insufficient_pool":
                log_step("⚠️ Kho Distributor thiếu! Đang tạo DST Contract lên Sales Admin...")
                dst_contract = await self.distributor_create_contract(distributor_creds, {
                    "notes": f"Fulfill Partner Contract {prt_code} for School {order_code}",
                    "courses": order_details.get("courses", [])
                })
                if dst_contract.get("status") != "success":
                    return {"status": "failed", "step": "distributor_create_contract", "error": dst_contract.get("error"), "logs": "\n".join(logs)}

                dst_code = dst_contract.get("contract_code")
                log_step(f"✅ Đã tạo Contract DST: [{dst_code}]. Đang chuyển Sales Admin duyệt...")

                admin_res = await self.admin_approve_distributor_contract(sales_admin_creds, dst_code)
                if admin_res.get("status") != "success":
                    return {"status": "failed", "step": "admin_approve_distributor_contract", "error": admin_res.get("error"), "logs": "\n".join(logs)}
                log_step(f"🎉 Sales Admin đã duyệt thành công Contract [{dst_code}]!")

                await self.distributor_approve_partner_contract(distributor_creds, prt_code)

            # Partner duyệt lại School Order
            log_step(f"🤝 Partner duyệt lại School Order [{order_code}]...")
            final_partner_res = await self.partner_approve_school_order(partner_creds, order_code)
            if final_partner_res.get("status") != "success":
                return {"status": "failed", "step": "final_partner_approve", "error": final_partner_res.get("error"), "logs": "\n".join(logs)}

        log_step(f"✅ [BƯỚC 2] Đã duyệt và phân phối License thành công cho [{order_code}]!")

        # BƯỚC 3: Ghi danh LMS (Nếu có danh sách email học sinh)
        student_emails = order_details.get("student_emails", [])
        if student_emails:
            first_course = order_details.get("courses", [{}])[0]
            log_step(f"🎓 [BƯỚC 3 - LMS ENROLL] Đang ghi danh {len(student_emails)} học viên vào '{first_course.get('course_name')}'...")
            enroll_res = await self.school_enroll_users_and_groups(
                credentials=school_creds,
                course_name=first_course.get("course_name", ""),
                start_date=first_course.get("start_date", "2026-09-01"),
                end_date=first_course.get("end_date", "2027-05-31"),
                school_name=school_creds.get("name", ""),
                group_name_raw=order_details.get("group_name", "Class"),
                student_emails=student_emails,
                teacher_emails=order_details.get("teacher_emails", [])
            )
            log_step(f"✅ [BƯỚC 3] Ghi danh hoàn tất: {enroll_res.get('group_name')}")

        log_step(f"🏁 HOÀN THÀNH 100% QUY TRÌNH TRỌN GÓI 4-IN-1 CHO ORDER [{order_code}]!")
        return {
            "status": "success",
            "order_code": order_code,
            "drive_link": drive_link,
            "logs": "\n".join(logs)
        }

    # =========================================================================
    # 6. SUB-FLOW: DUYỆT ĐƠN LẺ SCHOOL ORDER (TỰ ĐỘNG BÓC TÁCH KHÓA HỌC)
    # =========================================================================
    async def execute_approve_school_order_standalone(
        self,
        order_identifier: str,
        partner_creds: Dict[str, str],
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Duyệt Order có sẵn của Trường. 
        Nếu kho thiếu -> Tự động mở Order đọc danh sách khóa học -> Tạo PRT Contract lên Distributor -> Duyệt tiếp -> Quay lại duyệt Order ban đầu.
        """
        logs = []
        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [SUB-FLOW] Duyệt School Order đơn lẻ: [{order_identifier}]")

        # 1. Thử duyệt tại Partner
        partner_res = await self.partner_approve_school_order(partner_creds, order_identifier)
        if partner_res.get("status") == "success":
            log_step(f"✅ Partner đã duyệt thành công School Order [{order_identifier}]!")
            return {"status": "success", "order_code": order_identifier, "logs": "\n".join(logs)}

        if partner_res.get("status") != "insufficient_pool":
            err = partner_res.get("error", "Lỗi duyệt Order tại Partner")
            log_step(f"❌ {err}")
            return {"status": "failed", "error": err, "logs": "\n".join(logs)}

        # 2. Kho thiếu -> Nếu chưa có courses_needed, tự động mở chi tiết Order để đọc!
        if not courses_needed:
            log_step("🔍 Kho thiếu License! Đang mở Order Details đọc thông tin môn học & số lượng cần cấp bù...")
            detail_res = await self.fetch_school_order_detailed_courses(partner_creds, order_identifier)
            courses_needed = detail_res.get("courses", [])

        if not courses_needed:
            courses_needed = [{"category": "SWRP", "course_name": None, "licenses": 50}]

        log_step(f"📝 Tạo PRT Contract xin {len(courses_needed)} môn từ Distributor '{distributor_creds.get('name')}'...")
        prt_contract = await self.partner_create_contract(partner_creds, {
            "notes": f"Auto-topup to approve School Order {order_identifier}",
            "courses": courses_needed
        })
        if prt_contract.get("status") != "success":
            return {"status": "failed", "error": prt_contract.get("error"), "logs": "\n".join(logs)}

        prt_code = prt_contract.get("contract_code")
        log_step(f"✅ Đã tạo Contract PRT: [{prt_code}]")

        # 3. Distributor duyệt PRT Contract
        dist_res = await self.distributor_approve_partner_contract(distributor_creds, prt_code)
        if dist_res.get("status") == "insufficient_pool":
            log_step("⚠️ Kho Distributor cũng thiếu! Đang tạo DST Contract gửi Sales Admin...")
            dst_contract = await self.distributor_create_contract(distributor_creds, {
                "notes": f"Topup for PRT Contract {prt_code}",
                "courses": courses_needed
            })
            if dst_contract.get("status") != "success":
                return {"status": "failed", "error": dst_contract.get("error"), "logs": "\n".join(logs)}

            dst_code = dst_contract.get("contract_code")
            log_step(f"✅ Đã tạo DST Contract: [{dst_code}]. Đang chuyển Sales Admin duyệt...")

            admin_res = await self.admin_approve_distributor_contract(sales_admin_creds, dst_code)
            if admin_res.get("status") != "success":
                return {"status": "failed", "error": admin_res.get("error"), "logs": "\n".join(logs)}

            log_step(f"🎉 Sales Admin đã duyệt [{dst_code}]. Distributor duyệt lại [{prt_code}]...")
            await self.distributor_approve_partner_contract(distributor_creds, prt_code)

        # 4. Partner quay lại duyệt School Order ban đầu
        log_step(f"🤝 Partner duyệt lại School Order [{order_identifier}] lần cuối...")
        final_res = await self.partner_approve_school_order(partner_creds, order_identifier)
        if final_res.get("status") != "success":
            return {"status": "failed", "error": final_res.get("error"), "logs": "\n".join(logs)}

        log_step(f"🏁 ĐÃ DUYỆT THÀNH CÔNG SCHOOL ORDER: [{order_identifier}]!")
        return {"status": "success", "order_code": order_identifier, "logs": "\n".join(logs)}

    # =========================================================================
    # 7. SUB-FLOW: DUYỆT ĐƠN LẺ PARTNER CONTRACT (PRT-...)
    # =========================================================================
    async def execute_approve_partner_contract_standalone(
        self,
        contract_identifier: str,
        distributor_creds: Dict[str, str],
        sales_admin_creds: Dict[str, str],
        courses_needed: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        logs = []
        def log_step(msg: str):
            logger.info(msg)
            logs.append(msg)

        log_step(f"🚀 [SUB-FLOW] Duyệt Partner Contract đơn lẻ: [{contract_identifier}]")

        dist_res = await self.distributor_approve_partner_contract(distributor_creds, contract_identifier)
        if dist_res.get("status") == "success":
            log_step(f"✅ Distributor đã duyệt thành công Contract [{contract_identifier}]!")
            return {"status": "success", "contract_code": contract_identifier, "logs": "\n".join(logs)}

        if dist_res.get("status") != "insufficient_pool":
            err = dist_res.get("error", "Lỗi duyệt Partner Contract")
            log_step(f"❌ {err}")
            return {"status": "failed", "error": err, "logs": "\n".join(logs)}

        log_step("⚠️ Distributor thiếu License! Đang tạo DST Contract lên Sales Admin...")
        dst_contract = await self.distributor_create_contract(distributor_creds, {
            "notes": f"Auto-topup to approve PRT Contract {contract_identifier}",
            "courses": courses_needed or [{"category": "SWRP", "course_name": None, "licenses": 100}]
        })
        if dst_contract.get("status") != "success":
            return {"status": "failed", "error": dst_contract.get("error"), "logs": "\n".join(logs)}

        dst_code = dst_contract.get("contract_code")
        log_step(f"✅ Đã tạo DST Contract: [{dst_code}]. Đang chuyển Sales Admin duyệt...")

        admin_res = await self.admin_approve_distributor_contract(sales_admin_creds, dst_code)
        if admin_res.get("status") != "success":
            return {"status": "failed", "error": admin_res.get("error"), "logs": "\n".join(logs)}

        log_step(f"🎉 Sales Admin đã duyệt [{dst_code}]. Distributor duyệt lại Partner Contract [{contract_identifier}]...")
        final_res = await self.distributor_approve_partner_contract(distributor_creds, contract_identifier)
        if final_res.get("status") != "success":
            return {"status": "failed", "error": final_res.get("error"), "logs": "\n".join(logs)}

        log_step(f"🏁 ĐÃ DUYỆT THÀNH CÔNG PARTNER CONTRACT: [{contract_identifier}]!")
        return {"status": "success", "contract_code": contract_identifier, "logs": "\n".join(logs)}

    # =========================================================================
    # 8. SCHOOL ENROLLMENT & BULK ACCOUNT CREATION
    # =========================================================================
    async def school_enroll_users_and_groups(
        self,
        credentials: Dict[str, str],
        course_name: str,
        start_date: str,
        end_date: str,
        school_name: str,
        group_name_raw: str,
        student_emails: List[str],
        teacher_emails: List[str] = []
    ) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                if not is_ok:
                    return {"status": "failed", "error": login_err}

                logger.info("📚 Điều hướng tới /school-workspace/courses...")
                await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/courses", wait_until="networkidle")

                course_row = page.locator(f"//tr[contains(., '{course_name}') and contains(., '{start_date}')]").first
                if await course_row.count() == 0:
                    course_row = page.locator(f"//tr[contains(., '{course_name}')]").first

                await course_row.locator("a, button, text=" + course_name).first.click()
                await page.wait_for_selector("text=Enrolled Users", timeout=15000)

                await page.click("button:has-text('Enroll Users')")
                await page.wait_for_selector("text=User Enrollment", timeout=10000)

                await page.click("text=GROUP MANAGEMENT")
                await page.wait_for_timeout(1000)

                formatted_group_name = f"{school_name} {group_name_raw} {start_date[:5]}".strip()
                await page.fill("input[placeholder*='Group Name'], input[name='group_name']", formatted_group_name)
                await page.click("button:has-text('Create Group')")
                await page.wait_for_timeout(2000)

                await page.click("text=BULK IMPORT")
                await page.wait_for_timeout(1000)

                group_dropdown = page.locator("//div[contains(., 'Groups') and contains(@class, 'select')] | //select").first
                await group_dropdown.click()
                await page.locator(f"text={formatted_group_name}").first.click()
                await page.wait_for_timeout(500)

                if student_emails:
                    role_dropdown = page.locator("//div[contains(., 'Assign Role') and contains(@class, 'select')] | //select").last
                    await role_dropdown.click()
                    await page.locator("text=Student").last.click()

                    students_text = "\n".join(student_emails)
                    await page.fill("textarea[placeholder*='Paste user data'], textarea", students_text)
                    await page.click("button:has-text('Import and Enroll Users')")
                    await page.wait_for_timeout(4000)

                if teacher_emails:
                    role_dropdown = page.locator("//div[contains(., 'Assign Role') and contains(@class, 'select')] | //select").last
                    await role_dropdown.click()
                    await page.locator("text=Teacher").last.click()

                    teachers_text = "\n".join(teacher_emails)
                    await page.fill("textarea[placeholder*='Paste user data'], textarea", teachers_text)
                    await page.click("button:has-text('Import and Enroll Users')")
                    await page.wait_for_timeout(3000)

                await page.click("button:has-text('Close')")
                await page.wait_for_timeout(1000)

                return {
                    "status": "success",
                    "group_name": formatted_group_name,
                    "enrolled_students": len(student_emails),
                    "enrolled_teachers": len(teacher_emails)
                }

            except Exception as e:
                logger.error(f"❌ Lỗi School Enroll Users: {e}")
                return {"status": "failed", "error": str(e)}
            finally:
                await browser.close()

    async def submit_account_creation_batch(
        self,
        credentials: Dict[str, str],
        upload_file_path: str,
        record_count: int
    ) -> Dict[str, Any]:
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
                await page.wait_for_timeout(3000)

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

                wait_seconds = record_count * 40
                logger.info(f"🎉 BẮT ĐƯỢC REQUEST ID: [ #{request_id} ]")

                return {
                    "status": "submitted",
                    "request_id": request_id,
                    "record_count": record_count,
                    "estimated_wait_seconds": wait_seconds
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


workspace_playwright_service = WorkspacePlaywrightService()