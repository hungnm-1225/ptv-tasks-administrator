# backend/re_triage_all_tickets.py
import asyncio
import logging
import sys
import os
from dotenv import load_dotenv

# 🚀 Nạp file .env ngay khi chạy script từ Terminal
load_dotenv()

# Thêm thư mục hiện tại vào sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.supabase import get_supabase_client
from app.core.gemini import process_ticket_with_ai

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

async def re_triage_pending_tickets():
    """Quét và phân tích lại các vé đang chờ xử lý bằng AI Triage thế hệ mới."""
    supabase = get_supabase_client()
    logger.info("🔍 Đang đọc danh sách ticket từ Supabase...")
    
    # Ưu tiên re-triage các vé chưa giải quyết (pending/processing)
    res = supabase.table("inbox_tickets")\
        .select("id, subject, source, created_at")\
        .neq("status", "completed")\
        .order("created_at", desc=True)\
        .execute()
        
    tickets = res.data or []
    logger.info(f"📋 Tìm thấy {len(tickets)} tickets cần nâng cấp dữ liệu tiền xử lý AI...")

    count = 0
    for t in tickets:
        t_id = t["id"]
        subj = t.get("subject", "No Subject")
        logger.info(f"⚡ [{count + 1}/{len(tickets)}] Đang phân tích lại Ticket #{t_id[:8]} - {subj[:40]}...")
        
        try:
            await process_ticket_with_ai(t_id)
            count += 1
            # Nghỉ 1.2s tránh chạm quota rate-limit
            await asyncio.sleep(4.0)
        except Exception as e:
            logger.error(f"❌ Lỗi khi re-triage ticket #{t_id}: {e}")

    logger.info(f"🎉 HOÀN TẤT! Đã nâng cấp thành công {count}/{len(tickets)} tickets sang chuẩn đề xuất 1-Click!")

if __name__ == "__main__":
    asyncio.run(re_triage_pending_tickets())