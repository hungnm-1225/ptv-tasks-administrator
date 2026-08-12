import logging
from typing import Dict, Any
from app.services.keycloak_service import keycloak_service
from app.services.playwright_service import playwright_lms_service
from app.services.github_service import github_service

logger = logging.getLogger(__name__)


async def execute_approved_bot_task(bot_type: str, payload_data: Dict[str, Any]) -> Dict[str, Any]:
    """Router executing bot automation task after human approval."""
    logger.info(f"Executing approved bot task of type: {bot_type}")

    if bot_type == "keycloak_api":
        return await keycloak_service.execute_account_action(payload_data)
    elif bot_type == "lms_playwright":
        return await playwright_lms_service.enroll_student(payload_data)
    elif bot_type == "github_issue_creator":
        return await github_service.create_issue(payload_data)
    else:
        return {"status": "skipped", "message": f"Unsupported bot type {bot_type}"}
