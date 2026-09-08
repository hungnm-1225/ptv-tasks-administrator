# backend/app/workers/ticket_processor.py
import logging
from typing import Dict, Any
from app.core.gemini import gemini_engine, process_ticket_with_ai

logger = logging.getLogger(__name__)

async def process_incoming_ticket(ticket_data: Dict[str, Any]) -> Dict[str, Any]:
    """Cầu nối chuẩn tiếp nhận vé mới, kích hoạt AI Triage & bóc tách cấu trúc bot task."""
    ticket_id = ticket_data.get("id")
    if not ticket_id:
        logger.warning("⚠️ Không có ticket_id trong ticket_data!")
        return {}

    try:
        # Kích hoạt bộ máy tiền xử lý hoàn chỉnh (bao gồm cả bóc tách file & sinh suggested_payload)
        ai_result = await process_ticket_with_ai(ticket_id)
        logger.info(f"✨ Ticket #{ticket_id} đã được tiền xử lý tự động thành công!")
        return ai_result or {}
    except Exception as e:
        logger.error(f"❌ Lỗi khi process_incoming_ticket #{ticket_id}: {e}")
        return {}