from fastapi import APIRouter
from typing import Dict, Any
from app.services.github_service import github_service

router = APIRouter()


@router.post("/create-issue")
async def create_github_issue(payload: Dict[str, Any]):
    """One-click GitHub issue creation endpoint calling GitHub REST API."""
    res = await github_service.create_issue(payload)
    return res
