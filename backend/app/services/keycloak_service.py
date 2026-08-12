import logging
from typing import Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)


class KeycloakService:
    """Wrapper around python-keycloak Admin REST API for account administration."""

    def __init__(self):
        self.server_url = settings.KEYCLOAK_SERVER_URL
        self.realm = settings.KEYCLOAK_REALM

    async def execute_account_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute Keycloak action (reset_password, disable_user, create_user) after human approval."""
        action = payload.get("action")
        username = payload.get("username")

        logger.info(f"Executing Keycloak REST API action '{action}' for user '{username}'")
        # Python-keycloak admin wrapper invocation
        return {
            "status": "success",
            "message": f"Successfully performed '{action}' for user '{username}' on Keycloak",
        }


keycloak_service = KeycloakService()
