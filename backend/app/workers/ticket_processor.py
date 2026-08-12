import logging
from typing import Dict, Any
from app.core.gemini import gemini_engine
from app.services.telegram_service import telegram_service

logger = logging.getLogger(__name__)


async def process_incoming_ticket(ticket_data: Dict[str, Any]) -> Dict[str, Any]:
    """Ingest raw ticket, trigger Gemini AI triage, save record, and push Telegram alert."""
    raw_content = ticket_data.get("raw_content", "")
    subject = ticket_data.get("subject", "")

    # 1. AI Triage with Gemini engine
    ai_result = await gemini_engine.triage_ticket(raw_content, subject)

    # 2. Extract suggested task if applicable
    bot_type = ai_result.get("suggested_bot_type")
    payload = ai_result.get("suggested_payload", {})

    logger.info(f"Ticket triaged by Gemini: Category={ai_result.get('category')}, Bot={bot_type}")

    # 3. Notify admin on Telegram if bot task recommended
    if bot_type:
        await telegram_service.send_approval_notification(
            task_id="temp_id",
            ticket_summary=ai_result.get("summary", ""),
            bot_type=bot_type,
            payload=payload,
        )

    return {
        "triage_result": ai_result,
        "bot_type": bot_type,
        "payload": payload,
    }
