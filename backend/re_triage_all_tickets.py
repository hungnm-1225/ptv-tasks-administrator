# backend/re_triage_all_tickets.py
import asyncio
import logging
import sys
import os
from dotenv import load_dotenv

load_dotenv()
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.supabase import get_supabase_client
from app.core.gemini import process_ticket_with_ai
from app.services.gmail_service import get_gmail_service, extract_gmail_body

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

async def re_triage_and_fix_truncated_emails():
    """Quét và vá lại nội dung các email bị cắt cụt rồi phân tích lại bằng Gemini AI."""
    supabase = get_supabase_client()
    gmail_service = get_gmail_service()
    
    logger.info("🔍 Đang đọc danh sách ticket từ Supabase...")
    res = supabase.table("inbox_tickets")\
        .select("id, subject, source, source_id, raw_content, created_at")\
        .neq("status", "completed")\
        .order("created_at", desc=True)\
        .execute()
        
    tickets = res.data or []
    logger.info(f"📋 Tìm thấy {len(tickets)} tickets cần rà soát và nâng cấp...")

    count = 0
    for t in tickets:
        t_id = t["id"]
        subj = t.get("subject", "No Subject")
        source = t.get("source")
        source_id = t.get("source_id")
        raw_content = t.get("raw_content") or ""

        # Nếu là vé từ Gmail và nội dung ngắn (< 250 ký tự - dấu hiệu của snippet bị cắt)
        if source == "gmail" and source_id and len(raw_content) < 250 and gmail_service:
            try:
                logger.info(f"📥 Đang tải lại nội dung đầy đủ từ Gmail cho vé #{t_id[:8]}...")
                msg = gmail_service.users().messages().get(userId='me', id=source_id, format='full').execute()
                payload = msg.get('payload', {})
                full_body = extract_gmail_body(payload)
                if full_body and len(full_body) > len(raw_content):
                    supabase.table("inbox_tickets").update({"raw_content": full_body}).eq("id", t_id).execute()
                    logger.info(f"🩹 Đã vá nội dung đầy đủ cho vé #{t_id[:8]} ({len(full_body)} ký tự)!")
            except Exception as g_err:
                logger.warning(f"Không thể tải lại body Gmail #{source_id}: {g_err}")

        logger.info(f"⚡ [{count + 1}/{len(tickets)}] Đang phân tích lại Ticket #{t_id[:8]} - {subj[:40]}...")
        try:
            await process_ticket_with_ai(t_id)
            count += 1
            await asyncio.sleep(1.2)
        except Exception as e:
            logger.error(f"❌ Lỗi khi re-triage ticket #{t_id}: {e}")

    logger.info(f"🎉 HOÀN TẤT! Đã vá và phân tích lại thành công {count}/{len(tickets)} tickets!")

if __name__ == "__main__":
    asyncio.run(re_triage_and_fix_truncated_emails())