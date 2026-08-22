import logging
from typing import Dict, Any
from app.core.gemini import gemini_engine

logger = logging.getLogger(__name__)


async def process_incoming_ticket(ticket_data: Dict[str, Any]) -> Dict[str, Any]:
    """Ingest raw ticket, trigger Gemini AI triage, and extract suggested bot task."""
    raw_content = ticket_data.get("raw_content", "")
    subject = ticket_data.get("subject", "")

    # 1. AI Triage with Gemini engine
    ai_result = await gemini_engine.triage_ticket(raw_content, subject)

    # 2. Extract suggested task if applicable
    bot_type = ai_result.get("suggested_bot_type")
    payload = ai_result.get("suggested_payload", {})

    logger.info(f"Ticket triaged by Gemini: Category={ai_result.get('category')}, Bot={bot_type}")

    return {
        "triage_result": ai_result,
        "bot_type": bot_type,
        "payload": payload,
    }

