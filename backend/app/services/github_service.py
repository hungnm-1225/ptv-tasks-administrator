# backend/app/services/github_service.py
import logging
import httpx
from typing import Dict, Any, List, Optional
from app.core.config import settings
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)


class GitHubDispatcherService:
    """Dịch vụ gửi GitHub Issue trực tiếp vào Private Repository qua GitHub REST API."""

    def __init__(self):
        self.pat = getattr(settings, "GITHUB_PAT", None)
        self.default_owner = getattr(settings, "GITHUB_DEFAULT_OWNER", "PTV-TechHub")
        self.default_repo = getattr(settings, "GITHUB_DEFAULT_REPO", "Pythaverse2026")

    async def _resolve_ticket_info(self, ticket_id: Optional[str]) -> Dict[str, str]:
        """Tự động tra cứu thông tin Ticket từ Supabase với ĐÚNG TÊN CỘT DATABASE."""
        if not ticket_id:
            return {}
        try:
            supabase = get_supabase_client()
            # 🟢 Sửa đúng tên cột: subject, raw_content, ai_summary, sender_email, source
            res = supabase.table("inbox_tickets")\
                .select("subject, raw_content, ai_summary, sender_email, source")\
                .eq("id", ticket_id)\
                .execute()
                
            if res.data and len(res.data) > 0:
                ticket = res.data[0]
                sender = ticket.get("sender_email") or "User"
                subject = ticket.get("subject") or f"Yêu cầu hỗ trợ từ {sender}"
                content = ticket.get("ai_summary") or ticket.get("raw_content") or "Không có nội dung chi tiết."
                
                return {
                    "title": f"[BUG] {subject}",
                    "body": f"### 📌 Thông tin Ticket gốc ({str(ticket.get('source', 'System')).upper()})\n\n"
                            f"- **Người gửi:** `{sender}`\n"
                            f"- **Tiêu đề gốc:** {subject}\n"
                            f"- **Nội dung / Tóm tắt AI:**\n> {content}\n\n"
                            f"- **Ticket ID:** `{ticket_id}`\n\n"
                            f"*(Tác vụ được tạo tự động bởi Pythaverse Central Admin Hub)*"
                }
        except Exception as ex:
            logger.warning(f"Không thể tra cứu ticket_id {ticket_id} từ Supabase: {ex}")
        return {}

    async def create_issue(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Tạo Issue trên GitHub với Title, Body Markdown, Assignees và Labels."""
        repo_full = payload.get("repo", f"{self.default_owner}/{self.default_repo}")
        
        if "/" in repo_full:
            owner, repo = repo_full.split("/", 1)
        else:
            owner = self.default_owner
            repo = repo_full

        ticket_id = payload.get("ticket_id")
        title = (payload.get("title") or "").strip()
        body = (payload.get("body") or "").strip()
        labels = payload.get("labels") or ["bug"]
        assignees = payload.get("assignees") or []

        # 🛡️ CƠ CHẾ BẢO VỆ 1: Nếu Title rỗng, tự động lấy Title từ Ticket DB
        if not title and ticket_id:
            ticket_info = await self._resolve_ticket_info(ticket_id)
            title = ticket_info.get("title", f"[Bug Report] Ticket #{ticket_id[:8]}")
            if not body:
                body = ticket_info.get("body", "")

        # 🛡️ CƠ CHẾ BẢO VỆ 2: Nếu vẫn rỗng (tác vụ tự do), gán Title mặc định an toàn
        if not title:
            sender = payload.get("sender_email") or payload.get("sender") or "Admin"
            title = f"[Auto-Created] Yêu cầu xử lý từ {sender}"

        if not body:
            body = f"Tác vụ được điều phối từ Pythaverse Automation Center.\nPayload: `{payload}`"

        if not self.pat:
            logger.warning("GITHUB_PAT chưa được cấu hình, trả về mock URL.")
            return {
                "status": "simulated",
                "issue_url": f"https://github.com/{owner}/{repo}/issues/mock-1",
                "message": "GITHUB_PAT chưa được cấu hình trong Environment"
            }

        url = f"https://api.github.com/repos/{owner}/{repo}/issues"
        headers = {
            "Authorization": f"Bearer {self.pat}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        request_data = {
            "title": title,
            "body": body,
            "labels": labels,
            "assignees": assignees
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                res = await client.post(url, headers=headers, json=request_data)
                if res.status_code == 201:
                    data = res.json()
                    return {
                        "status": "success",
                        "issue_url": data.get("html_url"),
                        "issue_number": data.get("number"),
                        "message": f"Đã tạo GitHub Issue #{data.get('number')} thành công: {data.get('html_url')}"
                    }
                else:
                    err_text = res.text
                    logger.error(f"GitHub API Error: {res.status_code} - {err_text}")
                    return {"status": "error", "error": f"HTTP {res.status_code}: {err_text}", "status_code": res.status_code}
            except Exception as e:
                logger.exception(f"Lỗi khi kết nối GitHub API: {str(e)}")
                return {"status": "error", "error": str(e)}


github_service = GitHubDispatcherService()