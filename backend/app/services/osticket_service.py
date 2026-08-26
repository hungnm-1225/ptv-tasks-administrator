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
    """Service Playwright chuyên cào vé OS Ticket, bóc tách đầy đủ lịch sử hội thoại Thread và tải Attachment lên Supabase."""

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
            logger.info(f"💾 Đã lưu Attachment '{filename}' lên Supabase: {public_url}")
            return public_url
        except Exception as e:
            logger.error(f"❌ Bỏ qua lỗi upload attachment '{filename}': {e}")
            return None

    async def scrape_ticket_detail(self, context, internal_id: str, ticket_number: str) -> Optional[Dict[str, Any]]:
        """Mở chi tiết vé và bóc tách toàn bộ thông tin form cùng đầy đủ lịch sử hội thoại đa chiều."""
        detail_page = await context.new_page()
        try:
            detail_url = f"{OSTICKET_BASE_URL}/scp/tickets.php?id={internal_id}"
            logger.info(f"🔍 Đang cào chi tiết vé #{ticket_number} (Internal ID: {internal_id})...")
            
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

            # 3. Help Topic & Thông tin bổ sung
            help_topic = ""
            topic_row = detail_page.locator("//tr[contains(., 'Help Topic:')]//td").first
            if await topic_row.count() > 0:
                help_topic = (await topic_row.inner_text()).strip()

            assigned_to = ""
            assigned_el = detail_page.locator("#field_assign, //tr[contains(., 'Assigned To:')]//td").first
            if await assigned_el.count() > 0:
                assigned_to = (await assigned_el.inner_text()).strip()

            # 4. Custom Form Fields
            school_name = ""
            country = ""
            partner_name = ""
            distributor_name = ""
            
            school_cell = detail_page.locator("//tr[contains(., 'School Name')]//td[2], td[id*='inline-answer-93']").first
            if await school_cell.count() > 0:
                school_name = (await school_cell.inner_text()).strip()

            country_cell = detail_page.locator("//tr[contains(., 'Country:')]//td[2], td[id*='inline-answer-118']").first
            if await country_cell.count() > 0:
                country = (await country_cell.inner_text()).strip()

            partner_cell = detail_page.locator("//tr[contains(., 'Partner Name')]//td[2], td[id*='inline-answer-100']").first
            if await partner_cell.count() > 0:
                partner_name = (await partner_cell.inner_text()).strip()

            distributor_cell = detail_page.locator("//tr[contains(., 'Belongs to Distributor')]//td[2], td[id*='inline-answer-106']").first
            if await distributor_cell.count() > 0:
                distributor_name = (await distributor_cell.inner_text()).strip()

            # 5. Bóc tách Toàn bộ Danh sách Tin nhắn trong Thread (Lịch sử hội thoại đầy đủ)
            thread_entries = detail_page.locator("#thread-items .thread-entry")
            total_entries = await thread_entries.count()
            
            messages_history: List[Dict[str, Any]] = []
            attachments_list: List[Dict[str, str]] = []

            for i in range(total_entries):
                entry = thread_entries.nth(i)
                entry_class = await entry.get_attribute("class") or ""
                
                # Xác định loại tin nhắn (Khách gửi / Staff phản hồi)
                is_response = "response" in entry_class
                role_label = "STAFF (Hỗ trợ)" if is_response else "USER (Khách hàng)"

                # Tác giả & Thời gian
                poster_el = entry.locator(".header b, .header a.name").first
                poster_name = (await poster_el.inner_text()).strip() if await poster_el.count() > 0 else "Unknown"

                time_el = entry.locator(".header time").first
                post_time = (await time_el.inner_text()).strip() if await time_el.count() > 0 else ""

                # Nội dung tin nhắn
                body_el = entry.locator(".thread-body").first
                body_text = (await body_el.inner_text()).strip() if await body_el.count() > 0 else ""

                # File đính kèm trong tin nhắn này
                entry_attachments = []
                attach_links = entry.locator(".attachments a.filename, .attachments a[href*='file.php']")
                attach_count = await attach_links.count()
                for a_idx in range(attach_count):
                    try:
                        link = attach_links.nth(a_idx)
                        raw_href = await link.get_attribute("href")
                        fname = (await link.inner_text()).strip()
                        if raw_href and fname:
                            full_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                            storage_url = await self.upload_attachment_to_supabase(context, full_url, fname, ticket_number)
                            if storage_url:
                                entry_attachments.append({"filename": fname, "url": storage_url})
                                attachments_list.append({"filename": fname, "url": storage_url})
                    except Exception as err:
                        logger.warning(f"⚠️ Lỗi bóc tách file đính kèm trong thread entry {i}: {err}")

                messages_history.append({
                    "index": i + 1,
                    "role": role_label,
                    "poster": poster_name,
                    "time": post_time,
                    "content": body_text,
                    "attachments": entry_attachments
                })

            # File đính kèm từ Custom Form (nếu có)
            form_file_link = detail_page.locator("//tr[contains(., 'Upload your COF File:')]//a").first
            if await form_file_link.count() > 0:
                raw_href = await form_file_link.get_attribute("href")
                fname = (await form_file_link.inner_text()).strip()
                if raw_href and fname:
                    full_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                    storage_url = await self.upload_attachment_to_supabase(context, full_url, fname, ticket_number)
                    if storage_url:
                        attachments_list.insert(0, {"filename": fname, "url": storage_url})

            # Thời gian tạo vé ban đầu
            created_at_str = ""
            created_at_iso = None
            create_date_cell = detail_page.locator("//tr[contains(., 'Create Date:')]//td").first
            if await create_date_cell.count() > 0:
                created_at_str = (await create_date_cell.inner_text()).strip()
                try:
                    dt = datetime.strptime(created_at_str, "%d/%m/%Y %I:%M %p")
                    created_at_iso = dt.isoformat() + "+07:00"
                except Exception:
                    pass

            # Ghép nội dung hoàn chỉnh theo cấu trúc rõ ràng cho AI đọc
            formatted_dialogue = ""
            for msg in messages_history:
                formatted_dialogue += (
                    f"\n--- [LƯỢT {msg['index']}] {msg['role']}: {msg['poster']} ({msg['time']}) ---\n"
                    f"{msg['content']}\n"
                )
                if msg['attachments']:
                    att_names = ", ".join([a['filename'] for a in msg['attachments']])
                    formatted_dialogue += f"📎 File đính kèm trong tin nhắn này: {att_names}\n"

            raw_content = (
                f"📌 MÃ VÉ: #{ticket_number}\n"
                f"📌 TIÊU ĐỀ: {subject}\n"
                f"👤 NGƯỜI GỬI: {submitter_name} ({sender_email})\n"
                f"📋 PHÂN LOẠI / TOPIC: {help_topic}\n"
                f"👨‍💼 ĐANG PHÂN CÔNG: {assigned_to}\n"
            )
            if school_name:
                raw_content += f"🏫 TRƯỜNG HỌC: {school_name} | QUỐC GIA: {country}\n"
            if partner_name:
                raw_content += f"🏢 ĐỐI TÁC: {partner_name} | NHÀ PHÂN PHỐI: {distributor_name}\n"
            
            raw_content += f"\n=== TOÀN BỘ LỊCH SỬ HỘI THOẠI & TIẾN TRÌNH XỬ LÝ (TỪ ĐẦU ĐẾN MỚI NHẤT) ===\n{formatted_dialogue}"

            return {
                "source": "osticket",
                "source_id": ticket_number,
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
                    "partner_name": partner_name,
                    "distributor_name": distributor_name,
                    "assigned_to": assigned_to,
                    "total_messages": len(messages_history),
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
                        
                        # 1. Lấy mã vé hiển thị
                        ticket_num_el = row.locator("a.preview, a[href*='tickets.php?id='], td:nth-child(2) a").first
                        if await ticket_num_el.count() == 0:
                            continue

                        ticket_num_text = (await ticket_num_el.inner_text()).strip()
                        num_match = re.search(r'(\d+)', ticket_num_text)
                        if not num_match:
                            continue
                        ticket_number = num_match.group(1)

                        # 2. Lấy thời gian Last Updated trên bảng danh sách (Cột 3)
                        last_updated_el = row.locator("td:nth-child(3)").first
                        last_updated_str = (await last_updated_el.inner_text()).strip() if await last_updated_el.count() > 0 else ""

                        # 3. Lấy Internal ID
                        href = await ticket_num_el.get_attribute("href")
                        id_match = re.search(r'id=(\d+)', href or '')
                        internal_id = id_match.group(1) if id_match else ticket_number

                        # 4. Kiểm tra vé trong Database Supabase
                        check_db = supabase.table("inbox_tickets")\
                            .select("id, status, metadata, attachments")\
                            .eq("source", "osticket")\
                            .or_(f"source_id.eq.{ticket_number},source_id.eq.{internal_id}")\
                            .execute()

                        existing_ticket = check_db.data[0] if check_db.data else None

                        # Nếu vé đã có và thời gian Last Updated không hề thay đổi -> Bỏ qua
                        if existing_ticket:
                            db_last_updated = existing_ticket.get("metadata", {}).get("last_updated_raw", "")
                            if db_last_updated == last_updated_str and last_updated_str != "":
                                continue  # Không có gì mới, lướt qua để tiết kiệm RAM

                        # 5. Nếu là vé mới HOẶC vé cũ có phản hồi/tài nguyên mới -> Cào chi tiết
                        logger.info(f"✨ Phát hiện biến động tại vé #{ticket_number} (Cập nhật lúc: {last_updated_str}), đang đồng bộ...")
                        ticket_data = await self.scrape_ticket_detail(context, internal_id, ticket_number)
                        
                        if ticket_data:
                            # Cập nhật thêm last_updated_raw vào metadata để làm mốc so sánh cho lần sau
                            meta = ticket_data.get("metadata", {})
                            meta["last_updated_raw"] = last_updated_str

                            if not existing_ticket:
                                # 🟢 TRƯỜNG HỢP 1: TẠO VÉ MỚI
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
                                    "metadata": meta,
                                    "status": "pending"
                                }
                                if ticket_data.get("created_at"):
                                    insert_payload["created_at"] = ticket_data["created_at"]

                                insert_res = supabase.table("inbox_tickets").insert(insert_payload).execute()
                                if insert_res.data:
                                    new_id = insert_res.data[0]["id"]
                                    logger.info(f"💾 Đã tạo vé mới #{ticket_number}! Kích hoạt Gemini Triage...")
                                    await process_ticket_with_ai(new_id)

                            else:
                                # 🟡 TRƯỜNG HỢP 2: CẬP NHẬT VÉ CŨ (Có tin nhắn mới / File mới)
                                ticket_db_id = existing_ticket["id"]
                                
                                # Gộp danh sách file cũ và mới (tránh trùng URL)
                                old_attachments = existing_ticket.get("attachments") or []
                                new_attachments = ticket_data.get("attachments") or []
                                seen_urls = {att.get("url") for att in old_attachments if isinstance(att, dict)}
                                merged_attachments = list(old_attachments)
                                for att in new_attachments:
                                    if att.get("url") not in seen_urls:
                                        merged_attachments.append(att)
                                        seen_urls.add(att.get("url"))

                                update_payload = {
                                    "subject": ticket_data["subject"],
                                    "raw_content": ticket_data["raw_content"],
                                    "attachments": merged_attachments,
                                    "metadata": meta,
                                    # Tự động Re-open nếu có tin nhắn mới mà ticket đang ở trạng thái completed
                                    "status": "pending" if existing_ticket.get("status") in ["completed", "dismissed"] else existing_ticket.get("status")
                                }

                                supabase.table("inbox_tickets").update(update_payload).eq("id", ticket_db_id).execute()
                                logger.info(f"🔄 Đã cập nhật diễn biến mới cho vé #{ticket_number}! Kích hoạt Gemini Triage phân tích lại...")
                                await process_ticket_with_ai(ticket_db_id)

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