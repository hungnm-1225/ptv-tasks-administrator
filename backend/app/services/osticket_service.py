import os
import asyncio
from playwright.async_api import async_playwright
from app.core.supabase import supabase_client
from app.core.gemini import process_ticket_with_ai

OSTICKET_URL = os.getenv("OSTICKET_URL", "https://support.pythaverse.space/scp/login.php")
ADMIN_USER = os.getenv("OSTICKET_ADMIN_USER")
ADMIN_PASS = os.getenv("OSTICKET_ADMIN_PASS")

async def poll_open_ostickets():
    """Hàm quét Ticket chưa xử lý trên OS Ticket bằng Playwright"""
    print("🔎 Đang quét OS Ticket (support.pythaverse.space)...")
    
    async with async_playwright() as p:
        # Bật trình duyệt Chromium ẩn
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # 1. Đi tới trang Đăng nhập
            await page.goto(OSTICKET_URL, timeout=30000)
            
            # Nếu thấy ô đăng nhập thì thực hiện Login
            if await page.is_visible('input[name="userid"]'):
                await page.fill('input[name="userid"]', ADMIN_USER)
                await page.fill('input[name="passwd"]', ADMIN_PASS)
                await page.click('input[type="submit"]')
                await page.wait_for_load_state("networkidle")

            # 2. Chuyển sang trang Open Tickets
            await page.goto("https://support.pythaverse.space/scp/tickets.php?status=open")
            await page.wait_for_selector("table.list")

            # 3. Lấy danh sách các dòng trong bảng
            rows = await page.query_selector_all("table.list tbody tr")
            
            for row in rows:
                # Bóc tách thông tin sơ bộ
                ticket_link_el = await row.query_selector("a.preview")
                if not ticket_link_el:
                    continue

                ticket_id = (await ticket_link_el.inner_text()).strip() # Mã ID ticket
                subject = (await ticket_link_el.get_attribute("title") or "").strip()
                
                # 4. Kiểm tra xem Ticket ID này đã có trong Supabase chưa
                existing = supabase_client.table("inbox_tickets") \
                    .select("id").eq("source", "osticket").eq("source_id", ticket_id).execute()

                if existing.data:
                    # Đã lưu rồi -> Bỏ qua không cào lại nữa
                    continue

                # 5. Nếu là Ticket mới -> Mở trang chi tiết để lấy full nội dung
                detail_url = await ticket_link_el.get_attribute("href")
                detail_page = await context.new_page()
                await detail_page.goto(f"https://support.pythaverse.space/scp/{detail_url}")
                
                # Lấy nội dung tin nhắn đầu tiên của ticket
                thread_body_el = await detail_page.query_selector(".thread-body")
                raw_content = await thread_body_el.inner_text() if thread_body_el else subject
                await detail_page.close()

                # 6. Lưu vào Supabase Database
                new_ticket = {
                    "source": "osticket",
                    "source_id": ticket_id,
                    "sender_email": "osticket_user@pythaverse.space", # Hoặc parse email người gửi
                    "subject": subject,
                    "raw_content": raw_content,
                    "status": "pending"
                }
                res = supabase_client.table("inbox_tickets").insert(new_ticket).execute()
                
                # 7. Đẩy qua Gemini AI phân tích & Bắn Telegram
                if res.data:
                    await process_ticket_with_ai(res.data[0]["id"])
                    print(f"✅ Đã cào thành công Ticket OS Ticket mới: {ticket_id}")

        except Exception as e:
            print(f"❌ Lỗi khi quét OS Ticket: {str(e)}")
        finally:
            await browser.close()