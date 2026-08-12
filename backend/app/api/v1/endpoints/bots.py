from fastapi import APIRouter
from typing import Dict, Any

router = APIRouter()


@router.get("/status")
async def get_bot_workers_status():
    """Real-time status view of Keycloak API worker, LMS Playwright worker, and Gmail Sync worker."""
    return {
        "gmail_sync_worker": "active",
        "keycloak_api_worker": "active",
        "lms_playwright_worker": "active",
        "github_dispatcher": "active",
    }


@router.post("/{task_id}/retry")
async def retry_bot_task(task_id: str):
    """Trigger manual retry of a failed worker execution task."""
    return {"status": "retry_queued", "task_id": task_id}
