"""
Pythaverse Central Admin - OS Ticket Hybrid RPA-API Ingestion Service (V4.0 Master Enterprise)
Kiến trúc: Ephemeral Session Caching (Playwright Auth Gateway 3s) + Non-blocking Async HTTP Engine (HTTPX 300ms)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Cam kết an toàn: ZERO-MOCKUP INVARIANT, Tự động mở lại vé đã Hoàn thành khi khách reply, Đồng bộ thời gian thực.
"""
import re
import os
import gc
import time
import mimetypes
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from urllib.parse import urljoin
import httpx
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

from app.core.config import settings
from app.core.supabase import get_supabase_client
from app.workers.ticket_processor import process_incoming_ticket
from app.core.playwright_manager import acquire_playwright_slot, LOW_RAM_CHROMIUM_ARGS, setup_low_ram_routes

logger = logging.getLogger(__name__)

raw_osticket_url = getattr(settings, "OSTICKET_URL", os.getenv("OSTICKET_URL", "https://support.pythaverse.space"))
OSTICKET_BASE_URL = str(raw_osticket_url).replace("/scp/login.php", "").replace("/login.php", "").rstrip("/")

OSTICKET_USER = getattr(settings, "OSTICKET_ADMIN_USER", os.getenv("OSTICKET_ADMIN_USER", ""))
OSTICKET_PASS = getattr(settings, "OSTICKET_ADMIN_PASS", os.getenv("OSTICKET_ADMIN_PASS", ""))

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
}


class OSTicketService:
    """
    Cỗ máy Hybrid OS Ticket V4.0:
    - Playwright Auth Gateway: Bốc Session Cookie (3-5s) rồi đóng Chromium ngay.
    - HTTPX Async Engine: Cào Open Queue, bóc tách chi tiết form & thread messages siêu tốc (300ms).
    - Lifecycle SOT: Tự động kích hoạt Reopen và đảo ngày cập nhật khi khách hàng phản hồi mới.
    """

    def __init__(self):
        self.headless = True
        self._cached_cookies: Optional[Dict[str, str]] = None
        self._cookies_expire_at: float = 0.0
        self._session_ttl_seconds: float = 7200.0  # 2 tiếng an toàn

    # =========================================================================
    # 🔑 PHA 1: AUTH GATEWAY (PLAYWRIGHT 3-5 GIÂY - CHỈ CHẠY MỖI 2 TIẾNG)
    # =========================================================================
    async def _steal_session_cookies(self) -> Dict[str, str]:
        """Khởi chạy Chromium siêu nhẹ, đăng nhập và trích xuất cookie phiên OSTSESSID."""
        logger.info("🔑 [Auth Gateway] Đang mở Playwright để bốc Session Cookie mới từ OS Ticket...")
        async with acquire_playwright_slot("OSTicket Session Gateway", timeout=45.0, lane="cron"):
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=self.headless,
                    args=LOW_RAM_CHROMIUM_ARGS
                )
                context = await browser.new_context(
                    viewport={"width": 1440, "height": 900},
                    user_agent=BROWSER_HEADERS["User-Agent"]
                )
                await setup_low_ram_routes(context)
                page = await context.new_page()
                page.set_default_timeout(30000)

                try:
                    login_url = f"{OSTICKET_BASE_URL}/scp/login.php"
                    await page.goto(login_url, wait_until="domcontentloaded", timeout=25000)

                    if "login.php" not in page.url and "/scp/" in page.url:
                        pass
                    else:
                        if await page.locator("input[name='userid'], #name").count() > 0:
                            await page.fill("input[name='userid'], #name", OSTICKET_USER)
                            await page.fill("input[name='passwd'], #pass", OSTICKET_PASS)
                            await page.click("input[type='submit'], button[type='submit']")
                            try:
                                await page.wait_for_url(lambda u: "login.php" not in u, timeout=12000)
                            except Exception:
                                pass

                    if "login.php" in page.url:
                        raise RuntimeError("Đăng nhập OS Ticket thất bại! Vui lòng kiểm tra OSTICKET_ADMIN_USER / PASS.")

                    raw_cookies = await context.cookies()
                    cookies_dict = {c["name"]: c["value"] for c in raw_cookies}
                    
                    if not cookies_dict:
                        raise RuntimeError("Không trích xuất được cookie phiên từ OS Ticket.")

                    self._cached_cookies = cookies_dict
                    self._cookies_expire_at = time.time() + self._session_ttl_seconds
                    logger.info(f"✨ [Auth Gateway] Bốc session thành công! Đã lưu {len(cookies_dict)} cookies vào RAM Cache (TTL: 2h).")
                    return cookies_dict
                finally:
                    await browser.close()
                    gc.collect()

    async def get_valid_cookies(self, force_refresh: bool = False) -> Dict[str, str]:
        """Lấy cookies phiên từ cache hoặc kích hoạt Auth Gateway làm tươi mới."""
        now = time.time()
        if not force_refresh and self._cached_cookies and now < self._cookies_expire_at:
            return self._cached_cookies

        return await self._steal_session_cookies()

    def invalidate_session(self):
        """Xóa session cache khi phát hiện phiên hết hạn."""
        self._cached_cookies = None
        self._cookies_expire_at = 0.0

    # =========================================================================
    # ⚡ PHA 2: HTTPX ASYNC ENGINE (THỰC THI SIÊU TỐC, KHÔNG DÙNG CHROMIUM)
    # =========================================================================
    def _create_http_client(self, cookies: Dict[str, str]) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=OSTICKET_BASE_URL,
            headers=BROWSER_HEADERS,
            cookies=cookies,
            timeout=25.0,
            follow_redirects=True
        )

    async def upload_attachment_to_supabase(self, client: httpx.AsyncClient, file_url: str, filename: str, ticket_display_id: str) -> Optional[str]:
        """Tải file từ OS Ticket qua HTTPX thuần và upload lên Supabase Storage an toàn."""
        try:
            supabase = get_supabase_client()
            clean_filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
            storage_path = f"osticket/{ticket_display_id}_{clean_filename}"

            res = await client.get(file_url, timeout=30.0)
            if res.status_code != 200:
                logger.warning(f"⚠️ Không tải được file {filename} từ OS Ticket (Status: {res.status_code})")
                return None

            file_bytes = res.content
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

    def _extract_text_by_candidates(self, soup: BeautifulSoup, candidates: List[str]) -> str:
        """Helper tìm kiếm phần tử an toàn qua nhiều CSS selectors trên BeautifulSoup."""
        for sel in candidates:
            try:
                if sel.startswith("tr:contains("):
                    text_search = sel.split("('")[1].split("')")[0]
                    for tr in soup.find_all("tr"):
                        if text_search.lower() in tr.get_text().lower():
                            tds = tr.find_all("td")
                            if len(tds) >= 2:
                                return tds[1].get_text(strip=True)
                            elif tds:
                                return tds[0].get_text(strip=True)
                    continue

                el = soup.select_one(sel)
                if el:
                    text = el.get_text(strip=True)
                    if text:
                        return text
            except Exception:
                continue
        return ""

    async def scrape_ticket_detail_httpx(
        self, 
        client: httpx.AsyncClient, 
        internal_id: str, 
        ticket_number: str
    ) -> Optional[Dict[str, Any]]:
        """Mở chi tiết vé và bóc tách toàn bộ thông tin form cùng lịch sử thread bằng HTTPX Async + BeautifulSoup (~300ms)."""
        detail_url = f"{OSTICKET_BASE_URL}/scp/tickets.php?id={internal_id}"
        logger.info(f"🔍 [HTTPX Engine] Đang cào chi tiết vé #{ticket_number} (Internal ID: {internal_id})...")

        res = await client.get(detail_url)
        if "login.php" in str(res.url):
            raise PermissionError("Session hết hạn, cần làm tươi cookie.")

        if res.status_code != 200:
            logger.error(f"❌ Lỗi tải chi tiết vé #{ticket_number}: HTTP {res.status_code}")
            return None

        soup = BeautifulSoup(res.text, "html.parser")

        # 1. Tiêu đề
        subject = self._extract_text_by_candidates(soup, [
            ".tixTitle h3",
            "h2 a",
            "#ticket_info h2"
        ]) or f"Ticket #{ticket_number}"

        # 2. Người gửi (Tên & Email)
        submitter_name = self._extract_text_by_candidates(soup, [
            "span[id^='user-'][id$='-name']",
            "a[href*='users.php?id=']"
        ]) or "User"

        sender_email = self._extract_text_by_candidates(soup, [
            "span[id^='user-'][id$='-email']",
            "a[href^='mailto:']"
        ]) or "support@pythaverse.space"

        # 3. Help Topic & Assigned To
        help_topic = self._extract_text_by_candidates(soup, [
            "tr:contains('Help Topic:')"
        ])

        assigned_to = self._extract_text_by_candidates(soup, [
            "#field_assign",
            "tr:contains('Assigned To:')"
        ])

        # 4. CUSTOM FORM FIELDS
        school_name = self._extract_text_by_candidates(soup, [
            "#inline-answer-93",
            "td[id*='inline-answer-93']",
            "tr:contains('School Name for the COF:')",
            "tr:contains('School Name for the TOF:')",
            "tr:contains('School Name')"
        ])

        country = self._extract_text_by_candidates(soup, [
            "#inline-answer-118",
            "td[id*='inline-answer-118']",
            "tr:contains('Country:')"
        ])

        partner_name = self._extract_text_by_candidates(soup, [
            "#inline-answer-100",
            "td[id*='inline-answer-100']",
            "tr:contains('Partner Name')"
        ])

        distributor_name = self._extract_text_by_candidates(soup, [
            "#inline-answer-106",
            "td[id*='inline-answer-106']",
            "tr:contains('Belongs to Distributor')"
        ])

        # 5. Bóc tách Toàn bộ Danh sách Tin nhắn trong Thread & Phân loại tệp đính kèm theo lượt
        thread_entries = soup.select("#thread-items .thread-entry")
        messages_history: List[Dict[str, Any]] = []
        attachments_list: List[Dict[str, str]] = []
        latest_message_iso: Optional[str] = None
        latest_turn_attachments: List[Dict[str, str]] = []

        for i, entry in enumerate(thread_entries):
            entry_class = " ".join(entry.get("class", []))
            is_response = "response" in entry_class
            role_label = "STAFF (Hỗ trợ)" if is_response else "USER (Khách hàng)"

            poster_el = entry.select_one(".header b, .header a.name")
            poster_name = poster_el.get_text(strip=True) if poster_el else "Unknown"

            time_el = entry.select_one(".header time")
            post_time = time_el.get_text(strip=True) if time_el else ""
            if time_el and time_el.get("datetime"):
                latest_message_iso = time_el["datetime"]

            body_el = entry.select_one(".thread-body")
            body_text = body_el.get_text("\n", strip=True) if body_el else ""

            entry_attachments = []
            attach_links = entry.select(".attachments a.filename, .attachments a[href*='file.php']")
            for link in attach_links:
                try:
                    raw_href = link.get("href")
                    fname = link.get_text(strip=True)
                    if raw_href and fname:
                        full_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                        storage_url = await self.upload_attachment_to_supabase(client, full_url, fname, ticket_number)
                        if storage_url:
                            item = {"filename": fname, "url": storage_url, "turn_index": i + 1}
                            entry_attachments.append(item)
                            attachments_list.append(item)
                except Exception as att_err:
                    logger.warning(f"⚠️ Lỗi bóc tách file đính kèm trong thread entry {i}: {att_err}")

            # Lưu vết tệp đính kèm ở lượt cuối cùng của khách hàng
            if not is_response and entry_attachments:
                latest_turn_attachments = entry_attachments

            messages_history.append({
                "index": i + 1,
                "role": role_label,
                "poster": poster_name,
                "time": post_time,
                "content": body_text,
                "attachments": entry_attachments
            })

        # 6. File đính kèm từ Custom Form (COF / TOF File ban đầu)
        for form_sel in ["td[id*='inline-answer-97'] a", "#inline-answer-97 a"]:
            try:
                form_link = soup.select_one(form_sel)
                if form_link:
                    raw_href = form_link.get("href")
                    fname = form_link.get_text(strip=True)
                    if raw_href and fname:
                        full_url = urljoin(OSTICKET_BASE_URL + "/scp/", raw_href)
                        storage_url = await self.upload_attachment_to_supabase(client, full_url, fname, ticket_number)
                        if storage_url:
                            attachments_list.insert(0, {"filename": fname, "url": storage_url, "turn_index": 0, "is_initial_form": True})
                    break
            except Exception:
                continue

        # 7. BÓC TÁCH NGÀY TẠO VÉ THẬT (CREATE DATE)
        created_at_str = ""
        created_at_iso = None

        first_time_el = soup.select_one("#thread-items .thread-entry.message time[datetime]")
        if first_time_el and first_time_el.get("datetime"):
            created_at_iso = first_time_el["datetime"]
            created_at_str = first_time_el.get_text(strip=True)

        if not created_at_iso:
            create_date_th = soup.find(lambda tag: tag.name in ["th", "td"] and "Create Date:" in tag.get_text())
            if create_date_th:
                next_td = create_date_th.find_next_sibling("td")
                if next_td:
                    created_at_str = next_td.get_text(strip=True)
                    try:
                        dt = datetime.strptime(created_at_str, "%d/%m/%Y %I:%M %p")
                        created_at_iso = dt.strftime("%Y-%m-%dT%H:%M:%S+07:00")
                    except Exception as dt_err:
                        logger.warning(f"⚠️ Không parse được Create Date '{created_at_str}': {dt_err}")

        # Ghép nội dung hội thoại chi tiết theo lượt
        formatted_dialogue = ""
        for msg in messages_history:
            formatted_dialogue += (
                f"\n--- [LƯỢT {msg['index']}] {msg['role']}: {msg['poster']} ({msg['time']}) ---\n"
                f"{msg['content']}\n"
            )
            if msg['attachments']:
                att_names = ", ".join([a['filename'] for a in msg['attachments']])
                formatted_dialogue += f"📎 File đính kèm trong lượt này: {att_names}\n"

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
            "doc_url": detail_url,
            "sender_email": sender_email,
            "submitter_name": submitter_name,
            "subject": subject,
            "raw_content": raw_content,
            "created_at": created_at_iso,
            "ticket_timestamp": created_at_str or created_at_iso,
            "latest_message_iso": latest_message_iso,
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
                "created_date_raw": created_at_str,
                "latest_turn_attachments": latest_turn_attachments
            }
        }

    # =========================================================================
    # 🚀 POLL OPEN TICKETS PIPELINE (HYBRID KHÔNG CHẠM PLAYWRIGHT)
    # =========================================================================
    async def poll_open_ostickets(self):
        """
        Quét danh sách Open Queue bằng Direct HTTPX (~300ms) và đồng bộ vào Supabase:
        - Tự động lấy Session từ Cache RAM.
        - Khắc phục triệt để lỗi bỏ sót vé Reopened (Vé Completed xuất hiện lại ở Open Queue).
        - Cập nhật source_updated_at và updated_at để vé mới cập nhật lập tức nhảy lên đầu trang!
        """
        supabase = get_supabase_client()
        retry_auth = True

        while retry_auth:
            retry_auth = False
            cookies = await self.get_valid_cookies()

            async with self._create_http_client(cookies) as client:
                queue_url = "/scp/tickets.php?dir=1&sort=10"
                logger.info(f"📂 [HTTPX Engine] Đang quét danh sách vé Open: {OSTICKET_BASE_URL}{queue_url}")

                try:
                    res = await client.get(queue_url)

                    if "login.php" in str(res.url) or "id=\"login-form\"" in res.text:
                        logger.warning("⚠️ Session osTicket trong cache đã hết hạn. Đang kích hoạt làm tươi mới...")
                        self.invalidate_session()
                        cookies = await self.get_valid_cookies(force_refresh=True)
                        retry_auth = False
                        res = await client.get(queue_url)

                    if res.status_code != 200:
                        logger.error(f"❌ Lỗi tải Open Queue osTicket: HTTP {res.status_code}")
                        return

                    soup = BeautifulSoup(res.text, "html.parser")
                    ticket_rows = soup.select("table.list tbody tr")
                    total_rows = len(ticket_rows)
                    logger.info(f"📋 Tìm thấy {total_rows} dòng vé trong Open Queue của OS Ticket (HTTPX).")

                    for r_idx, row in enumerate(ticket_rows):
                        try:
                            ticket_num_el = row.select_one("a.preview, a[href*='tickets.php?id='], td:nth-child(2) a")
                            if not ticket_num_el:
                                continue

                            ticket_num_text = ticket_num_el.get_text(strip=True)
                            num_match = re.search(r'(\d+)', ticket_num_text)
                            if not num_match:
                                continue
                            ticket_number = num_match.group(1)

                            tds = row.find_all("td")
                            last_updated_str = tds[2].get_text(strip=True) if len(tds) > 2 else ""

                            href = ticket_num_el.get("href", "")
                            id_match = re.search(r'id=(\d+)', href)
                            internal_id = id_match.group(1) if id_match else ticket_number

                            # 1. Kiểm tra vé trong Supabase Database
                            check_db = supabase.table("inbox_tickets")\
                                .select("id, status, metadata, attachments")\
                                .eq("source", "osticket")\
                                .or_(f"source_id.eq.{ticket_number},source_id.eq.{internal_id}")\
                                .execute()

                            existing_ticket = check_db.data[0] if check_db.data else None

                            # 🌟 QUY TẮC BẢO VỆ VÒNG ĐỜI VÉ (CHỐNG BỎ SÓT VÉ REOPENED):
                            # Nếu vé đã đánh dấu completed/dismissed trong hệ thống mình nhưng vẫn xuất hiện ở Open Queue osTicket
                            # -> CHẮC CHẮN VÉ ĐÃ ĐƯỢC KHÁCH HÀNG REOPEN HOẶC CÓ REPLY MỚI -> TUYỆT ĐỐI KHÔNG ĐƯỢC SKIP!
                            if existing_ticket:
                                is_closed_in_db = existing_ticket.get("status") in ["completed", "dismissed"]
                                db_last_updated = existing_ticket.get("metadata", {}).get("last_updated_raw", "")
                                
                                if not is_closed_in_db and db_last_updated == last_updated_str and last_updated_str != "":
                                    continue

                            logger.info(f"✨ [HTTPX Engine] Phát hiện vé #{ticket_number} (Cập nhật lúc: {last_updated_str}), đang cào chi tiết...")
                            ticket_data = await self.scrape_ticket_detail_httpx(client, internal_id, ticket_number)

                            if ticket_data:
                                meta = ticket_data.get("metadata", {})
                                meta["last_updated_raw"] = last_updated_str
                                now_iso = datetime.now(timezone.utc).isoformat()
                                calculated_update_time = ticket_data.get("latest_message_iso") or now_iso

                                if not existing_ticket:
                                    # Vé hoàn toàn mới
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
                                        "status": "pending",
                                        "updated_at": calculated_update_time,
                                        "source_updated_at": calculated_update_time
                                    }
                                    if ticket_data.get("created_at"):
                                        insert_payload["created_at"] = ticket_data["created_at"]

                                    insert_res = supabase.table("inbox_tickets").insert(insert_payload).execute()
                                    if insert_res.data:
                                        created_ticket = insert_res.data[0]
                                        logger.info(f"💾 Đã lưu vé mới #{ticket_number}! Kích hoạt Canonical Intake Pipeline...")
                                        await process_incoming_ticket(created_ticket)
                                else:
                                    # Vé cũ có cập nhật hội thoại hoặc được khách hàng reopen
                                    ticket_db_id = existing_ticket["id"]
                                    old_attachments = existing_ticket.get("attachments") or []
                                    new_attachments = ticket_data.get("attachments") or []
                                    seen_urls = {att.get("url") for att in old_attachments if isinstance(att, dict)}
                                    merged_attachments = list(old_attachments)
                                    for att in new_attachments:
                                        if att.get("url") not in seen_urls:
                                            merged_attachments.append(att)
                                            seen_urls.add(att.get("url"))

                                    # Nếu vé từng completed mà có tin nhắn mới -> Bẻ về pending ngay!
                                    next_status = "pending" if existing_ticket.get("status") in ["completed", "dismissed"] else existing_ticket.get("status")

                                    update_payload = {
                                        "subject": ticket_data["subject"],
                                        "raw_content": ticket_data["raw_content"],
                                        "doc_url": ticket_data.get("doc_url"),
                                        "attachments": merged_attachments,
                                        "metadata": meta,
                                        "status": next_status,
                                        "updated_at": calculated_update_time,
                                        "source_updated_at": calculated_update_time
                                    }

                                    up_res = supabase.table("inbox_tickets").update(update_payload).eq("id", ticket_db_id).execute()
                                    if up_res.data:
                                        updated_ticket = up_res.data[0]
                                        if existing_ticket.get("status") in ["completed", "dismissed"]:
                                            logger.info(f"🔄 [REOPEN DETECTED] Vé #{ticket_number} đã được mở lại thành 'pending' do phát hiện phản hồi mới từ khách hàng!")
                                        else:
                                            logger.info(f"🔄 Đã cập nhật hội thoại mới cho vé #{ticket_number}! Kích hoạt Canonical Intake...")
                                        await process_incoming_ticket(updated_ticket)

                        except Exception as row_err:
                            logger.error(f"❌ Lỗi khi quét dòng {r_idx} vé #{ticket_number if 'ticket_number' in locals() else 'unknown'}: {row_err}")
                            continue

                except PermissionError:
                    logger.warning("🔄 Phát hiện phiên hết hạn giữa chừng, sẽ tự động bốc cookie mới ở chu kỳ kế tiếp.")
                    self.invalidate_session()
                except Exception as e:
                    logger.error(f"❌ Lỗi polling OS Ticket tổng thể: {e}", exc_info=True)


osticket_service = OSTicketService()

async def poll_open_ostickets():
    await osticket_service.poll_open_ostickets()