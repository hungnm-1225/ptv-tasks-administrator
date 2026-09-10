# backend/app/workers/ticket_processor.py
import logging
from typing import Dict, Any
from app.core.gemini import gemini_engine, process_ticket_with_ai
from app.services.workflow_planner import workflow_planner_service

logger = logging.getLogger(__name__)

async def process_incoming_ticket(ticket_data: Dict[str, Any]) -> Dict[str, Any]:
    """Cầu nối chuẩn tiếp nhận vé mới: AI Triage ➔ Capability Matching ➔ Workflow Draft."""
    ticket_id = ticket_data.get("id")
    if not ticket_id:
        logger.warning("⚠️ Không có ticket_id trong ticket_data!")
        return {}

    try:
        # 1. Kích hoạt bộ máy tiền xử lý AI hoàn chỉnh (bóc tách file, entity & suggested_payload)
        ai_result = await process_ticket_with_ai(ticket_id)
        logger.info(f"✨ Ticket #{ticket_id} đã được AI phân loại thành công!")

        # 2. Tự động lập kế hoạch Workflow Draft (DAG steps & dependencies) cho vé
        wf_draft = workflow_planner_service.plan_workflow_for_ticket(ticket_id)
        if wf_draft:
            logger.info(f"📋 Workflow Draft (v{wf_draft.get('version', 1)}) đã được chuẩn bị sẵn sàng cho ticket #{ticket_id[:8]}!")

        return {
            "ai_result": ai_result or {},
            "workflow_draft": wf_draft or {}
        }
    except Exception as e:
        logger.error(f"❌ Lỗi khi process_incoming_ticket #{ticket_id}: {e}", exc_info=True)
        return {}