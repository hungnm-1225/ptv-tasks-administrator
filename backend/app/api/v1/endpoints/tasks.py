from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from app.models.task import AutomationTaskApprovalUpdate
from app.workers.bot_executor import execute_approved_bot_task

router = APIRouter()


@router.get("/")
async def list_bot_tasks(approval_status: str = "pending"):
    """List bot automation tasks in approval queue."""
    return [
        {
            "id": "task-uuid-1",
            "ticket_id": "123e4567-e89b-12d3-a456-426614174000",
            "bot_type": "keycloak_api",
            "payload_data": {"action": "create_user", "username": "newuser"},
            "approval_status": approval_status,
            "execution_status": "queued",
            "created_at": "2026-08-12T12:00:00Z",
        }
    ]


@router.put("/{task_id}/approve")
async def approve_and_run_task(task_id: str, update_data: AutomationTaskApprovalUpdate):
    """Human-in-the-Loop Approval endpoint. If status is approved, trigger worker execution."""
    if update_data.approval_status == "approved":
        payload = update_data.edited_payload or {
            "action": "create_user",
            "username": "newuser",
        }
        res = await execute_approved_bot_task("keycloak_api", payload)
        return {"status": "executed", "result": res}
    else:
        return {"status": "rejected", "task_id": task_id}
