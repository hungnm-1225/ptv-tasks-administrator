# backend/app/services/osticket_service.py
import re
import os
import mimetypes
import logging
from typing import Dict, Any, List, Optional
from urllib.parse import urljoin
from playwright.async_api import async_playwright
from app.core.config import settings
from app.core.supabase import get_supabase_client
from app.core.gemini import process_ticket_with_ai

logger = logging.getLogger(__name__)

raw_osticket_url = getattr(settings, "OSTICKET_URL", os.getenv("OSTICKET_URL", "https://support.pythaverse.space"))
OSTICKET_BASE_URL = str(raw_osticket_url).replace("/scp/login.php", "").replace("/login.php", "").rstrip("/")

OSTICKET_USER = getattr(settings, "OSTICKET_ADMIN_USER", os.getenv("OSTICKET_ADMIN_USER", ""))
OSTICKET_PASS = getattr(settings, "OSTICKET_ADMIN_PASS", os.getenv("OSTICKET_ADMIN_PASS", ""))

class OSTicketService:
    """Service Playwright chuyên cào vé OS Ticket, bóc tách Form tùy chỉnh và tải Attachment lên Supabase."""

    def __init__(self):
        self.headless = True

    async def _create_context(self, p) -> tuple:
        browser = await p.chromium.launch(
            headless=self.headless,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        return browser, context, page

    async def login(self, page) -> bool:
        """Đăng nhập vào bảng điều khiển quản trị OS Ticket (/scp/login.php)."""
        try:
            login_url = f"{OSTICKET_BASE_URL}/scp/login.php"
            logger.info(f"🔑 Đang đăng nhập OS Ticket: {settings.OSTICKET_ADMIN_USER}...")
            await page.goto(login_url, wait_until="networkidle", timeout=30000)

            # Nếu đã đăng nhập sẵn
            if "/scp/index.php" in page.url or "/scp/tickets.php" in page.url:
                return True

            await page.fill("input[name='userid'], #name", settings.OSTICKET_ADMIN_USER)
            await page.fill("input[name='passwd'], #pass", settings.OSTICKET_ADMIN_PASS)
            await page.click("input[type='submit'], button[type='submit']")
            await page.wait_for_timeout(3000)

            if "login.php" in page.url:
                logger.error("❌ Đăng nhập OS Ticket thất bại! Vui lòng kiểm tra lại mật khẩu.")
                return False

            logger.info("✅ Đăng nhập OS Ticket thành công!")
            return True
        except Exception as e:
            logger.error(f"❌ Lỗi đăng nhập OS Ticket: {e}")
            return False

    async def upload_attachment_to_supabase(self, context, file_url: str, filename: str, ticket_internal_id: str) -> Optional[str]:
        """Tải file từ OS Ticket bằng context đã đăng nhập và upload lên Supabase Storage."""
        try:
            supabase = get_supabase_client()
            clean_filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
            storage_path = f"osticket/{ticket_internal_id}_{clean_filename}"

            # Tải dữ liệu nhị phân của file
            response = await context.request.get(file_url)
            if response.status != 200:
                logger.warning(f"⚠️ Không tải được file {filename} từ OS Ticket (Status: {response.status})")
                return None

            file_bytes = await response.body()
            content_type, _ = mimetypes.guess_type(filename)
            content_type = content_type or "application/octet-stream"

            # Upload vào bucket 'ticket-attachments'
            bucket = supabase.storage.from_("ticket-attachments")
            bucket.upload(storage_path, file_bytes, file_options={"content-type": content_type, "upsert": "true"})
            
            public_url = bucket.get_public_url(storage_path)
            logger.info(f"💾 Đã lưu Attachment '{filename}' lên Supabase Storage: {public_url}")
            return public_url
        except Exception as e:
            logger.error(f"❌ Lỗi upload attachment OS Ticket: {e}")
            return None

    async def scrape_ticket_detail(self, page, context, internal_id: str) -> Optional[Dict[str, Any]]:
        """Mở chi tiết vé và bóc tách toàn bộ thông tin, form Partner và các tệp đính kèm."""
        detail_url = f"{OSTICKET_BASE_URL}/scp/tickets.php?id={internal_id}"
        logger.info(f"🔍 Đang mở chi tiết vé #{internal_id}: {detail_url}")
        
        await page.goto(detail_url, wait_until="networkidle", timeout=30000)
        await page.wait_for_selector(".tixTitle, #ticket_info", timeout=15000)

        # 1. Bóc tách Tiêu đề
        subject = ""
        title_el = page.locator(".tixTitle h3, h2 a").first
        if await title_el.count() > 0:
            subject = (await title_el.inner_text()).strip()

        # 2. Bóc tách Người gửi (Tên & Email)
        submitter_name = "User"
        sender_email = "support@pythaverse.space"
        user_name_el = page.locator("span[id^='user-'][id$='-name']").first
        user_email_el = page.locator("span[id^='user-'][id$='-email']").first

        if await user_name_el.count() > 0:
            submitter_name = (await user_name_el.inner_text()).strip()
        if await user_email_el.count() > 0:
            sender_email = (await user_email_el.inner_text()).strip()

        # 3. Bóc tách Help Topic
        help_topic = ""
        topic_row = page.locator("//tr[contains(., 'Help Topic:')]//td").first
        if await topic_row.count() > 0:
            help_topic = (await topic_row.inner_text()).strip()

        # 4. Bóc tách Custom Form: Partner Account Request Form (nếu có)
        school_name = ""
        country = ""
        school_cell = page.locator("//tr[contains(., 'School Name for the COF:')]//td[2]").first
        if await school_cell.count() > 0:
            school_name = (await school_cell.inner_text()).strip()

        country_cell = page.locator("//tr[contains(., 'Country:')]//td[2]").first
        if await country_cell.count() > 0:
            country = (await country_cell.inner_text()).strip()

        # 5. Bóc tách Nội dung tin nhắn đầu tiên trong Thread
        message_body = ""
        first_msg = page.locator(".thread-entry.message .thread-body").first
        if await first_msg.count() > 0:
            message_body = (await first_msg.inner_text()).strip()

        # 6. Bóc tách & Tải toàn bộ Attachments (từ Form và từ Thread)
        attachments_list = []
        
        # A. File trong Custom Form
        form_file_link = page.locator("//tr[contains(., 'Upload your COF File:')]//a").first
        if await form_file_link.count() > 0:
            raw_href = await form_file_link.get_attribute("href")
            fname = (await form_file_link.inner_text()).strip()
            if raw_href:
                full_file_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                storage_url = await self.upload_attachment_to_supabase(context, full_file_url, fname, internal_id)
                if storage_url:
                    attachments_list.append({"filename": fname, "url": storage_url})

        # B. File trong Thread Messages
        thread_attachments = page.locator(".attachments .attachment-info a, .attachments a.filename")
        attach_count = await thread_attachments.count()
        for idx in range(attach_count):
            link = thread_attachments.nth(idx)
            raw_href = await link.get_attribute("href")
            fname = (await link.inner_text()).strip()
            if raw_href and fname:
                full_file_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                storage_url = await self.upload_attachment_to_supabase(context, full_file_url, fname, internal_id)
                if storage_url:
                    attachments_list.append({"filename": fname, "url": storage_url})

        # Ghép nội dung hoàn chỉnh
        raw_content = (
            f"📌 Subject: {subject}\n"
            f"👤 Submitter: {submitter_name} ({sender_email})\n"
            f"📋 Help Topic: {help_topic}\n"
        )
        if school_name:
            raw_content += f"🏫 School Name: {school_name} | Country: {country}\n"
        raw_content += f"\n--- THREAD MESSAGE ---\n{message_body}"

        return {
            "source": "osticket",
            "source_id": internal_id,
            "sender_email": sender_email,
            "submitter_name": submitter_name,
            "subject": subject,
            "raw_content": raw_content,
            "country": country,
            "school_name": school_name,
            "attachments": attachments_list,
            "metadata": {
                "help_topic": help_topic,
                "school_name": school_name
            }
        }

    async def poll_open_ostickets(self):
        """Quét danh sách Open Queue và cào các vé mới."""
        supabase = get_supabase_client()
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login(page):
                    return

                # Mở danh sách Open Tickets
                queue_url = f"{OSTICKET_BASE_URL}/scp/tickets.php?queue=1"
                await page.goto(queue_url, wait_until="networkidle", timeout=30000)
                await page.wait_for_selector("table.list", timeout=15000)

                # Lấy tất cả các dòng vé trong bảng
                ticket_rows = page.locator("table.list tbody tr")
                total_rows = await ticket_rows.count()
                logger.info(f"📋 Tìm thấy {total_rows} vé trong Open Queue của OS Ticket.")

                for r_idx in range(total_rows):
                    row = ticket_rows.nth(r_idx)
                    link_el = row.locator("a.preview").first
                    
                    if await link_el.count() == 0:
                        continue

                    href = await link_el.get_attribute("href")
                    # Trích xuất internal ID (VD: tickets.php?id=3358 -> 3358)
                    id_match = re.search(r'id=(\d+)', href or '')
                    if not id_match:
                        continue
                    
                    internal_id = id_match.group(1)

                    # Kiểm tra xem vé này đã cào vào Supabase chưa
                    check_db = supabase.table("inbox_tickets")\
                        .select("id")\
                        .eq("source", "osticket")\
                        .eq("source_id", internal_id)\
                        .execute()

                    if check_db.data:
                        # Đã có trong DB -> Bỏ qua
                        continue

                    logger.info(f"✨ Phát hiện vé mới #{internal_id}, đang cào chi tiết...")
                    ticket_data = await self.scrape_ticket_detail(page, context, internal_id)
                    
                    if ticket_data:
                        # Lưu vào Supabase inbox_tickets
                        insert_res = supabase.table("inbox_tickets").insert({
                            "source": ticket_data["source"],
                            "source_id": ticket_data["source_id"],
                            "sender_email": ticket_data["sender_email"],
                            "submitter_name": ticket_data["submitter_name"],
                            "subject": ticket_data["subject"],
                            "raw_content": ticket_data["raw_content"],
                            "country": ticket_data.get("country"),
                            "attachments": ticket_data.get("attachments", []),
                            "metadata": ticket_data.get("metadata", {}),
                            "status": "pending"
                        }).execute()

                        if insert_res.data:
                            new_id = insert_res.data[0]["id"]
                            logger.info(f"💾 Đã lưu Ticket #{internal_id} vào Supabase (UUID: {new_id}). Đang kích hoạt Gemini AI Triage...")
                            # Tự động gọi Gemini AI phân tích tóm tắt tiếng Việt 2 câu
                            await process_ticket_with_ai(new_id)

                    # Quay lại danh sách Open Queue để duyệt tiếp
                    await page.goto(queue_url, wait_until="networkidle")
                    await page.wait_for_selector("table.list", timeout=15000)

            except Exception as e:
                logger.error(f"❌ Lỗi polling OS Ticket: {e}")
            finally:
                await browser.close()

osticket_service = OSTicketService()

# Hàm wrapper cho APScheduler trong main.py
async def poll_open_ostickets():
    await osticket_service.poll_open_ostickets()