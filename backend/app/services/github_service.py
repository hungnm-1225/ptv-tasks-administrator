# backend/app/services/github_service.py
import logging
import httpx
from typing import Dict, Any, List
from app.core.config import settings

logger = logging.getLogger(__name__)


class GitHubDispatcherService:
    """Dịch vụ gửi GitHub Issue trực tiếp vào Private Repository qua GitHub REST API."""

    def __init__(self):
        self.pat = settings.GITHUB_PAT
        self.default_owner = getattr(settings, "GITHUB_DEFAULT_OWNER", "PTV-TechHub")
        self.default_repo = getattr(settings, "GITHUB_DEFAULT_REPO", "Pythaverse2026")

    async def create_issue(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Tạo Issue trên GitHub với Title, Body Markdown, Assignees và Labels."""
        repo_full = payload.get("repo", f"{self.default_owner}/{self.default_repo}")
        
        if "/" in repo_full:
            owner, repo = repo_full.split("/", 1)
        else:
            owner = self.default_owner
            repo = repo_full

        title = payload.get("title", "").strip()
        body = payload.get("body", "").strip()
        labels = payload.get("labels", ["bug"])
        assignees = payload.get("assignees", [])

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
                        "issue_number": data.get("number")
                    }
                else:
                    logger.error(f"GitHub API Error: {res.status_code} - {res.text}")
                    return {"status": "error", "error": res.text, "status_code": res.status_code}
            except Exception as e:
                logger.exception(f"Lỗi khi kết nối GitHub API: {str(e)}")
                return {"status": "error", "error": str(e)}


github_service = GitHubDispatcherService()