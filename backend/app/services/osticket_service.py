# backend/app/services/osticket_service.py
import re
import os
import mimetypes
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
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
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process"
            ]
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
            logger.info(f"🔑 Đang đăng nhập OS Ticket: {OSTICKET_USER}...")
            await page.goto(login_url, wait_until="domcontentloaded", timeout=30000)

            if "/scp/index.php" in page.url or "/scp/tickets.php" in page.url or "/scp/" in page.url:
                if "login.php" not in page.url:
                    return True

            # Điền thông tin đăng nhập
            if await page.locator("input[name='userid'], #name").count() > 0:
                await page.fill("input[name='userid'], #name", OSTICKET_USER)
                await page.fill("input[name='passwd'], #pass", OSTICKET_PASS)
                await page.click("input[type='submit'], button[type='submit']")
                await page.wait_for_timeout(3000)

            if "login.php" in page.url:
                logger.error("❌ Đăng nhập OS Ticket thất bại! Vui lòng kiểm tra lại tài khoản/mật khẩu.")
                return False

            logger.info("✅ Đăng nhập OS Ticket thành công!")
            return True
        except Exception as e:
            logger.error(f"❌ Lỗi đăng nhập OS Ticket: {e}")
            return False

    async def upload_attachment_to_supabase(self, context, file_url: str, filename: str, ticket_display_id: str) -> Optional[str]:
        """Tải file từ OS Ticket bằng context đã đăng nhập và upload lên Supabase Storage an toàn."""
        try:
            supabase = get_supabase_client()
            clean_filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
            storage_path = f"osticket/{ticket_display_id}_{clean_filename}"

            response = await context.request.get(file_url, timeout=20000)
            if response.status != 200:
                logger.warning(f"⚠️ Không tải được file {filename} từ OS Ticket (Status: {response.status})")
                return None

            file_bytes = await response.body()
            content_type, _ = mimetypes.guess_type(filename)
            content_type = content_type or "application/octet-stream"

            bucket = supabase.storage.from_("ticket-attachments")
            bucket.upload(storage_path, file_bytes, file_options={"content-type": content_type, "upsert": "true"})
            
            public_url = bucket.get_public_url(storage_path)
            logger.info(f"💾 Đã lưu Attachment '{filename}' lên Supabase Storage: {public_url}")
            return public_url
        except Exception as e:
            logger.error(f"❌ Bỏ qua lỗi upload attachment '{filename}': {e}")
            return None

    async def scrape_ticket_detail(self, context, internal_id: str, ticket_number: str) -> Optional[Dict[str, Any]]:
        """Mở chi tiết vé trong page riêng biệt và bóc tách toàn bộ thông tin."""
        detail_page = await context.new_page()
        try:
            detail_url = f"{OSTICKET_BASE_URL}/scp/tickets.php?id={internal_id}"
            logger.info(f"🔍 Đang cào vé #{ticket_number} (Internal ID: {internal_id}): {detail_url}")
            
            await detail_page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
            await detail_page.wait_for_selector(".tixTitle, #ticket_info, .ticket_info", timeout=10000)

            # 1. Tiêu đề
            subject = f"Ticket #{ticket_number}"
            title_el = detail_page.locator(".tixTitle h3, h2 a, #ticket_info h2").first
            if await title_el.count() > 0:
                subject = (await title_el.inner_text()).strip()

            # 2. Người gửi (Tên & Email)
            submitter_name = "User"
            sender_email = "support@pythaverse.space"
            user_name_el = detail_page.locator("span[id^='user-'][id$='-name'], a[href*='users.php?id=']").first
            user_email_el = detail_page.locator("span[id^='user-'][id$='-email'], a[href^='mailto:']").first

            if await user_name_el.count() > 0:
                submitter_name = (await user_name_el.inner_text()).strip()
            if await user_email_el.count() > 0:
                sender_email = (await user_email_el.inner_text()).strip()

            # 3. Help Topic
            help_topic = ""
            topic_row = detail_page.locator("//tr[contains(., 'Help Topic:')]//td").first
            if await topic_row.count() > 0:
                help_topic = (await topic_row.inner_text()).strip()

            # 4. Custom Form Fields
            school_name = ""
            country = ""
            school_cell = detail_page.locator("//tr[contains(., 'School Name')]//td[2]").first
            if await school_cell.count() > 0:
                school_name = (await school_cell.inner_text()).strip()

            country_cell = detail_page.locator("//tr[contains(., 'Country:')]//td[2]").first
            if await country_cell.count() > 0:
                country = (await country_cell.inner_text()).strip()

            # 5. Nội dung tin nhắn đầu tiên
            message_body = ""
            first_msg = detail_page.locator(".thread-entry.message .thread-body, .thread-body").first
            if await first_msg.count() > 0:
                message_body = (await first_msg.inner_text()).strip()

            # 6. Thời gian tạo vé (Create Date)
            created_at_str = ""
            created_at_iso = None
            
            time_el = detail_page.locator(".thread-entry.message time, time[datetime]").first
            if await time_el.count() > 0:
                created_at_iso = await time_el.get_attribute("datetime")
                created_at_str = await time_el.inner_text()

            if not created_at_iso:
                create_date_cell = detail_page.locator("//tr[contains(., 'Create Date:')]//td").first
                if await create_date_cell.count() > 0:
                    created_at_str = (await create_date_cell.inner_text()).strip()
                    try:
                        dt = datetime.strptime(created_at_str, "%d/%m/%Y %I:%M %p")
                        created_at_iso = dt.isoformat() + "+07:00"
                    except Exception:
                        pass

            # 7. Bóc tách Attachments an toàn
            attachments_list = []
            
            # A. File trong Custom Form
            form_file_link = detail_page.locator("//tr[contains(., 'Upload your COF File:')]//a").first
            if await form_file_link.count() > 0:
                raw_href = await form_file_link.get_attribute("href")
                fname = (await form_file_link.inner_text()).strip()
                if raw_href:
                    full_file_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                    storage_url = await self.upload_attachment_to_supabase(context, full_file_url, fname, ticket_number)
                    if storage_url:
                        attachments_list.append({"filename": fname, "url": storage_url})

            # B. File trong Thread Messages
            thread_attachments = detail_page.locator(".attachments .attachment-info a, .attachments a.filename, a[href*='attachment.php']")
            attach_count = await thread_attachments.count()
            for idx in range(attach_count):
                try:
                    link = thread_attachments.nth(idx)
                    raw_href = await link.get_attribute("href")
                    fname = (await link.inner_text()).strip()
                    if raw_href and fname and "attachment.php" in raw_href:
                        full_file_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                        storage_url = await self.upload_attachment_to_supabase(context, full_file_url, fname, ticket_number)
                        if storage_url:
                            attachments_list.append({"filename": fname, "url": storage_url})
                except Exception as file_err:
                    logger.warning(f"⚠️ Lỗi bóc tách link file idx {idx}: {file_err}")

            # Ghép nội dung
            raw_content = (
                f"📌 Ticket Number: #{ticket_number}\n"
                f"📌 Subject: {subject}\n"
                f"👤 Submitter: {submitter_name} ({sender_email})\n"
                f"📋 Help Topic: {help_topic}\n"
            )
            if school_name:
                raw_content += f"🏫 School Name: {school_name} | Country: {country}\n"
            raw_content += f"\n--- THREAD MESSAGE ---\n{message_body}"

            return {
                "source": "osticket",
                "source_id": ticket_number,  # 🎯 Lưu chuẩn mã vé hiển thị (VD: 852312)
                "sender_email": sender_email,
                "submitter_name": submitter_name,
                "subject": subject,
                "raw_content": raw_content,
                "created_at": created_at_iso,
                "ticket_timestamp": created_at_str or created_at_iso,
                "country": country,
                "school_name": school_name,
                "attachments": attachments_list,
                "metadata": {
                    "internal_id": internal_id,
                    "ticket_number": ticket_number,
                    "help_topic": help_topic,
                    "school_name": school_name,
                    "created_date_raw": created_at_str
                }
            }
        except Exception as e:
            logger.error(f"❌ Lỗi cào chi tiết vé #{ticket_number} (ID: {internal_id}): {e}")
            return None
        finally:
            await detail_page.close()

    async def poll_open_ostickets(self):
        """Quét danh sách Open Queue và cào các vé mới nhất."""
        supabase = get_supabase_client()
        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                if not await self.login(page):
                    return

                # Sử dụng đường dẫn trực tiếp kèm sort mới nhất (như trên ảnh trình duyệt)
                queue_url = f"{OSTICKET_BASE_URL}/scp/tickets.php?dir=1&sort=10"
                logger.info(f"📂 Đang mở danh sách vé Open: {queue_url}")
                await page.goto(queue_url, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_selector("table.list", timeout=15000)

                ticket_rows = page.locator("table.list tbody tr")
                total_rows = await ticket_rows.count()
                logger.info(f"📋 Tìm thấy {total_rows} dòng vé trong Open Queue của OS Ticket.")

                for r_idx in range(total_rows):
                    try:
                        row = ticket_rows.nth(r_idx)
                        
                        # 1. Trích xuất Ticket Number hiển thị (Cột Ticket: VD 852312)
                        ticket_num_el = row.locator("a.preview, a[href*='tickets.php?id='], td:nth-child(2) a").first
                        if await ticket_num_el.count() == 0:
                            continue

                        ticket_num_text = (await ticket_num_el.inner_text()).strip()
                        num_match = re.search(r'(\d+)', ticket_num_text)
                        if not num_match:
                            continue
                        ticket_number = num_match.group(1)

                        # 2. Trích xuất Internal ID (VD: id=3336)
                        href = await ticket_num_el.get_attribute("href")
                        id_match = re.search(r'id=(\d+)', href or '')
                        internal_id = id_match.group(1) if id_match else ticket_number

                        # 3. Kiểm tra xem ticket đã có trong Database chưa (Check cả ticket_number và internal_id)
                        check_db = supabase.table("inbox_tickets")\
                            .select("id")\
                            .eq("source", "osticket")\
                            .or_(f"source_id.eq.{ticket_number},source_id.eq.{internal_id}")\
                            .execute()

                        if check_db.data:
                            continue

                        logger.info(f"✨ Phát hiện vé mới #{ticket_number} (Internal ID: {internal_id}), đang bóc tách...")
                        ticket_data = await self.scrape_ticket_detail(context, internal_id, ticket_number)
                        
                        if ticket_data:
                            insert_payload = {
                                "source": ticket_data["source"],
                                "source_id": ticket_data["source_id"],
                                "sender_email": ticket_data["sender_email"],
                                "submitter_name": ticket_data["submitter_name"],
                                "subject": ticket_data["subject"],
                                "raw_content": ticket_data["raw_content"],
                                "country": ticket_data.get("country"),
                                "ticket_timestamp": ticket_data.get("ticket_timestamp"),
                                "attachments": ticket_data.get("attachments", []),
                                "metadata": ticket_data.get("metadata", {}),
                                "status": "pending"
                            }
                            if ticket_data.get("created_at"):
                                insert_payload["created_at"] = ticket_data["created_at"]

                            insert_res = supabase.table("inbox_tickets").insert(insert_payload).execute()

                            if insert_res.data:
                                new_id = insert_res.data[0]["id"]
                                logger.info(f"💾 Đã lưu Ticket #{ticket_number} vào Supabase! Đang kích hoạt Gemini AI Triage...")
                                await process_ticket_with_ai(new_id)

                    except Exception as row_err:
                        logger.error(f"❌ Lỗi khi quét dòng {r_idx}: {row_err}")
                        continue

            except Exception as e:
                logger.error(f"❌ Lỗi polling OS Ticket tổng thể: {e}")
            finally:
                await browser.close()

osticket_service = OSTicketService()

async def poll_open_ostickets():
    await osticket_service.poll_open_ostickets()