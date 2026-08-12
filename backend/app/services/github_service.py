import logging
import httpx
from typing import Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)


class GitHubDispatcherService:
    """Service to create GitHub Issues in private repositories via GitHub REST API."""

    def __init__(self):
        self.pat = settings.GITHUB_PAT
        self.default_owner = settings.GITHUB_DEFAULT_OWNER
        self.default_repo = settings.GITHUB_DEFAULT_REPO

    async def create_issue(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Call POST /repos/{owner}/{repo}/issues using Fine-Grained PAT."""
        owner = payload.get("owner", self.default_owner)
        repo = payload.get("repo", self.default_repo)
        title = payload.get("title", "Bug Report from Pythaverse Central Admin")
        body = payload.get("body", "")
        labels = payload.get("labels", ["bug"])

        if not self.pat:
            logger.warning("GITHUB_PAT not set, skipping real REST API call")
            return {
                "status": "simulated",
                "issue_url": f"https://github.com/{owner}/{repo}/issues/mock-1",
            }

        url = f"https://api.github.com/repos/{owner}/{repo}/issues"
        headers = {
            "Authorization": f"Bearer {self.pat}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        async with httpx.AsyncClient() as client:
            res = await client.post(
                url, headers=headers, json={"title": title, "body": body, "labels": labels}
            )
            if res.status_code == 201:
                data = res.json()
                return {"status": "success", "issue_url": data.get("html_url")}
            else:
                logger.error(f"GitHub API Error: {res.status_code} - {res.text}")
                return {"status": "error", "error": res.text}


github_service = GitHubDispatcherService()
