import logging
import httpx
from typing import Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)


class TelegramService:
    """Service handling Telegram Bot push notifications & Inline Approval Buttons."""

    def __init__(self):
        self.bot_token = settings.TELEGRAM_BOT_TOKEN
        self.chat_id = settings.TELEGRAM_ADMIN_CHAT_ID

    async def send_approval_notification(
        self, task_id: str, ticket_summary: str, bot_type: str, payload: Dict[str, Any]
    ) -> bool:
        """Send push notification to Admin Telegram chat with quick approval actions."""
        if not self.bot_token or not self.chat_id:
            logger.info("Telegram Bot Token / Chat ID missing. Skipping push notification.")
            return False

        message = (
            f"🔔 *YÊU CẦU PHÊ DUYỆT TỰ ĐỘNG HÓA MỚI*\n\n"
            f"📌 *Tác vụ:* `{bot_type}`\n"
            f"📝 *Mô tả:* {ticket_summary}\n\n"
            f"Nhấn nút bên dưới hoặc truy cập Web Portal để phê duyệt:"
        )

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        keyboard = {
            "inline_keyboard": [
                [
                    {
                        "text": "✅ Phê duyệt ngay",
                        "callback_data": f"approve_{task_id}",
                    },
                    {
                        "text": "❌ Từ chối",
                        "callback_data": f"reject_{task_id}",
                    },
                ]
            ]
        }

        async with httpx.AsyncClient() as client:
            res = await client.post(
                url,
                json={
                    "chat_id": self.chat_id,
                    "text": message,
                    "parse_mode": "Markdown",
                    "reply_markup": keyboard,
                },
            )
            return res.status_code == 200


telegram_service = TelegramService()
