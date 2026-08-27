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

    async def _get_text_by_candidates(self, page, candidates: List[str]) -> str:
        """Helper tìm kiếm phần tử an toàn qua nhiều selector độc lập."""
        for sel in candidates:
            try:
                el = page.locator(sel).first
                if await el.count() > 0:
                    text = (await el.inner_text()).strip()
                    if text:
                        return text
            except Exception:
                continue
        return ""

    async def scrape_ticket_detail(self, context, internal_id: str, ticket_number: str) -> Optional[Dict[str, Any]]:
        """Mở chi tiết vé và bóc tách toàn bộ thông tin form cùng đầy đủ lịch sử hội thoại đa chiều."""
        detail_page = await context.new_page()
        try:
            detail_url = f"{OSTICKET_BASE_URL}/scp/tickets.php?id={internal_id}"
            logger.info(f"🔍 Đang cào chi tiết vé #{ticket_number} (Internal ID: {internal_id})...")
            
            await detail_page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
            await detail_page.wait_for_selector(".tixTitle, #ticket_info, .ticket_info", timeout=10000)

            # 1. Tiêu đề
            subject = await self._get_text_by_candidates(detail_page, [
                ".tixTitle h3",
                "h2 a",
                "#ticket_info h2"
            ]) or f"Ticket #{ticket_number}"

            # 2. Người gửi (Tên & Email)
            submitter_name = await self._get_text_by_candidates(detail_page, [
                "span[id^='user-'][id$='-name']",
                "a[href*='users.php?id=']"
            ]) or "User"

            sender_email = await self._get_text_by_candidates(detail_page, [
                "span[id^='user-'][id$='-email']",
                "a[href^='mailto:']"
            ]) or "support@pythaverse.space"

            # 3. Help Topic & Assigned To
            help_topic = await self._get_text_by_candidates(detail_page, [
                "xpath=//tr[contains(., 'Help Topic:')]//td"
            ])

            assigned_to = await self._get_text_by_candidates(detail_page, [
                "#field_assign",
                "xpath=//tr[contains(., 'Assigned To:')]//td"
            ])

            # 4. Custom Form Fields
            school_name = await self._get_text_by_candidates(detail_page, [
                "#inline-answer-93",
                "td[id*='inline-answer-93']",
                "xpath=//tr[contains(., 'School Name for the COF:')]//td[2]",
                "xpath=//tr[contains(., 'School Name for the TOF:')]//td[2]",
                "xpath=//tr[contains(., 'School Name')]//td[2]"
            ])

            country = await self._get_text_by_candidates(detail_page, [
                "#inline-answer-118",
                "td[id*='inline-answer-118']",
                "xpath=//tr[contains(., 'Country:')]//td[2]"
            ])

            partner_name = await self._get_text_by_candidates(detail_page, [
                "#inline-answer-100",
                "td[id*='inline-answer-100']",
                "xpath=//tr[contains(., 'Partner Name')]//td[2]"
            ])

            distributor_name = await self._get_text_by_candidates(detail_page, [
                "#inline-answer-106",
                "td[id*='inline-answer-106']",
                "xpath=//tr[contains(., 'Belongs to Distributor')]//td[2]"
            ])

            # 5. Bóc tách Toàn bộ Danh sách Tin nhắn trong Thread
            thread_entries = detail_page.locator("#thread-items .thread-entry")
            total_entries = await thread_entries.count()
            
            messages_history: List[Dict[str, Any]] = []
            attachments_list: List[Dict[str, str]] = []

            for i in range(total_entries):
                entry = thread_entries.nth(i)
                entry_class = await entry.get_attribute("class") or ""
                
                is_response = "response" in entry_class
                role_label = "STAFF (Hỗ trợ)" if is_response else "USER (Khách hàng)"

                poster_name = await self._get_text_by_candidates(entry, [".header b", ".header a.name"]) or "Unknown"
                post_time = await self._get_text_by_candidates(entry, [".header time"]) or ""
                body_text = await self._get_text_by_candidates(entry, [".thread-body"]) or ""

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

            # 6. File đính kèm từ Custom Form (COF / TOF File)
            for form_sel in ["td[id*='inline-answer-97'] a", "#inline-answer-97 a", "xpath=//tr[contains(., 'Upload your COF File:')]//a", "xpath=//tr[contains(., 'Upload your TOF File:')]//a"]:
                try:
                    form_file_link = detail_page.locator(form_sel).first
                    if await form_file_link.count() > 0:
                        raw_href = await form_file_link.get_attribute("href")
                        fname = (await form_file_link.inner_text()).strip()
                        if raw_href and fname:
                            full_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                            storage_url = await self.upload_attachment_to_supabase(context, full_url, fname, ticket_number)
                            if storage_url:
                                attachments_list.insert(0, {"filename": fname, "url": storage_url})
                        break
                except Exception:
                    continue

            # 7. BÓC TÁCH NGÀY TẠO VÉ THẬT (CREATE DATE)
            created_at_str = ""
            created_at_iso = None

            # Cách A: Lấy thẻ time ISO từ tin nhắn mở đầu
            first_time_el = detail_page.locator("#thread-items .thread-entry.message time[datetime]").first
            if await first_time_el.count() > 0:
                created_at_iso = await first_time_el.get_attribute("datetime")
                created_at_str = (await first_time_el.inner_text()).strip()

            # Cách B: Lấy từ bảng thông tin Create Date
            if not created_at_iso:
                created_at_str = await self._get_text_by_candidates(detail_page, [
                    "xpath=//th[contains(., 'Create Date:')]/following-sibling::td",
                    "xpath=//tr[contains(., 'Create Date:')]//td"
                ])
                if created_at_str:
                    try:
                        # Parse định dạng: 27/08/2026 8:59 AM
                        dt = datetime.strptime(created_at_str, "%d/%m/%Y %I:%M %p")
                        created_at_iso = dt.strftime("%Y-%m-%dT%H:%M:%S+07:00")
                    except Exception as dt_err:
                        logger.warning(f"⚠️ Không parse được Create Date '{created_at_str}': {dt_err}")

            # Ghép nội dung hội thoại
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
                "source_id": ticket_number,                     # 🎯 Mã 6 chữ số hiển thị (#248707)
                "doc_url": detail_url,                           # 🎯 Link mở chính xác với ID 4 số (tickets.php?id=3370)
                "sender_email": sender_email,
                "submitter_name": submitter_name,
                "subject": subject,
                "raw_content": raw_content,
                "created_at": created_at_iso,                   # 🎯 Thời gian tạo vé thực tế
                "ticket_timestamp": created_at_str or created_at_iso,
                "country": country,
                "school_name": school_name,
                "attachments": attachments_list,
                "metadata": {
                    "internal_id": internal_id,                 # 🎯 Lưu ID 4 chữ số nội bộ
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
                        
                        ticket_num_el = row.locator("a.preview, a[href*='tickets.php?id='], td:nth-child(2) a").first
                        if await ticket_num_el.count() == 0:
                            continue

                        ticket_num_text = (await ticket_num_el.inner_text()).strip()
                        num_match = re.search(r'(\d+)', ticket_num_text)
                        if not num_match:
                            continue
                        ticket_number = num_match.group(1)

                        last_updated_el = row.locator("td:nth-child(3)").first
                        last_updated_str = (await last_updated_el.inner_text()).strip() if await last_updated_el.count() > 0 else ""

                        href = await ticket_num_el.get_attribute("href")
                        id_match = re.search(r'id=(\d+)', href or '')
                        internal_id = id_match.group(1) if id_match else ticket_number

                        # Kiểm tra vé trong Database Supabase
                        check_db = supabase.table("inbox_tickets")\
                            .select("id, status, metadata, attachments")\
                            .eq("source", "osticket")\
                            .or_(f"source_id.eq.{ticket_number},source_id.eq.{internal_id}")\
                            .execute()

                        existing_ticket = check_db.data[0] if check_db.data else None

                        if existing_ticket:
                            db_last_updated = existing_ticket.get("metadata", {}).get("last_updated_raw", "")
                            if db_last_updated == last_updated_str and last_updated_str != "":
                                continue

                        logger.info(f"✨ Phát hiện biến động tại vé #{ticket_number} (Cập nhật lúc: {last_updated_str}), đang đồng bộ...")
                        ticket_data = await self.scrape_ticket_detail(context, internal_id, ticket_number)
                        
                        if ticket_data:
                            meta = ticket_data.get("metadata", {})
                            meta["last_updated_raw"] = last_updated_str

                            if not existing_ticket:
                                insert_payload = {
                                    "source": ticket_data["source"],
                                    "source_id": ticket_data["source_id"],
                                    "doc_url": ticket_data.get("doc_url"),
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
                                    logger.info(f"💾 Đã lưu vé mới #{ticket_number}! Kích hoạt Gemini Triage...")
                                    await process_ticket_with_ai(new_id)
                            else:
                                ticket_db_id = existing_ticket["id"]
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
                                    "doc_url": ticket_data.get("doc_url"),
                                    "attachments": merged_attachments,
                                    "metadata": meta,
                                    "status": "pending" if existing_ticket.get("status") in ["completed", "dismissed"] else existing_ticket.get("status")
                                }
                                if ticket_data.get("created_at"):
                                    update_payload["created_at"] = ticket_data["created_at"]

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