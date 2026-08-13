# backend/app/services/osticket_service.py
import os
import asyncio
import logging
from playwright.async_api import async_playwright
from app.core.supabase import get_supabase_client
from app.core.gemini import process_ticket_with_ai

logger = logging.getLogger(__name__)

OSTICKET_URL = os.getenv("OSTICKET_URL", "https://support.pythaverse.space/scp/login.php")
ADMIN_USER = os.getenv("OSTICKET_ADMIN_USER")
ADMIN_PASS = os.getenv("OSTICKET_ADMIN_PASS")

async def poll_open_ostickets():
    """Hàm cào OS Ticket dựa trên đúng cấu trúc HTML thật"""
    logger.info("🔎 Đang quét OS Ticket (support.pythaverse.space)...")
    
    if not ADMIN_USER or not ADMIN_PASS:
        logger.warning("⚠️ Thiếu OSTICKET_ADMIN_USER hoặc OSTICKET_ADMIN_PASS!")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # 1. Đăng nhập OS Ticket
            await page.goto(OSTICKET_URL, timeout=30000)
            if await page.is_visible('input[name="userid"]'):
                await page.fill('input[name="userid"]', ADMIN_USER)
                await page.fill('input[name="passwd"]', ADMIN_PASS)
                
                # Bấm button submit chuẩn HTML
                submit_btn = await page.query_selector('button[type="submit"], button.submit, input[type="submit"]')
                if submit_btn:
                    await submit_btn.click()
                else:
                    await page.press('input[name="passwd"]', 'Enter')

                # 🛑 Chờ cho trang đăng nhập xong hoàn toàn
                await page.wait_for_load_state("domcontentloaded")
                await page.wait_for_load_state("networkidle")

            # 2. Đã ở trang Admin Panel -> Mở danh sách Open Queue
            if "tickets.php" not in page.url:
                await page.goto("https://support.pythaverse.space/scp/tickets.php", wait_until="domcontentloaded", timeout=30000)
                
            await page.wait_for_selector("table.queue.tickets", timeout=15000)

            # 3. Duyệt qua từng dòng <tr> trong Bảng theo HTML thật
            rows = await page.query_selector_all("table.queue.tickets tbody tr")
            supabase = get_supabase_client()

            for row in rows:
                cols = await row.query_selector_all("td")
                if len(cols) < 7:
                    continue

                # Bóc tách chính xác từng cột theo file HTML
                ticket_a = await cols[1].query_selector("a.preview")
                if not ticket_a:
                    continue

                ticket_id = (await ticket_a.inner_text()).strip()        # VD: 871582
                last_updated = (await cols[2].inner_text()).strip()      # VD: 03/07/2026 12:39 PM
                subject = (await cols[3].inner_text()).strip()           # VD: Technical Issue - PLearn
                from_person = (await cols[4].inner_text()).strip()       # VD: Nguyen Hung
                priority = (await cols[5].inner_text()).strip()          # VD: Emergency
                assigned_to = (await cols[6].inner_text()).strip()       # VD: Mohd Afiq

                # 4. Kiểm tra xem Ticket ID đã lưu trong Supabase chưa
                existing = supabase.table("inbox_tickets") \
                    .select("id").eq("source", "osticket").eq("source_id", ticket_id).execute()

                if existing.data:
                    continue

                # 5. Mở trang chi tiết lấy Nội dung Thread
                detail_href = await ticket_a.get_attribute("href")
                detail_page = await context.new_page()
                await detail_page.goto(f"https://support.pythaverse.space{detail_href}")
                
                thread_body = await detail_page.query_selector(".thread-body")
                raw_content = await thread_body.inner_text() if thread_body else subject
                await detail_page.close()

                # 6. LƯU ĐẦY ĐỦ THÔNG TIN VÀO SUPABASE
                new_ticket = {
                    "source": "osticket",
                    "source_id": ticket_id,
                    "sender_email": f"{from_person.lower().replace(' ', '')}@pythaverse.space",
                    "submitter_name": from_person,
                    "subject": subject,
                    "raw_content": raw_content,
                    "priority": priority,
                    "assigned_to": assigned_to,
                    "ticket_timestamp": last_updated,
                    "status": "pending"
                }
                res = supabase.table("inbox_tickets").insert(new_ticket).execute()
                
                if res.data:
                    logger.info(f"✅ Đã cào thành công Ticket OS Ticket mới: #{ticket_id} ({subject})")
                    await process_ticket_with_ai(res.data[0]["id"])

        except Exception as e:
            logger.error(f"❌ Lỗi khi quét OS Ticket: {e}")
        finally:
            await browser.close()