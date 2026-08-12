from fastapi import APIRouter, HTTPException, Status
from typing import List, Dict, Any
from app.models.ticket import TicketCreate, TicketResponse, TicketStatus
from app.workers.ticket_processor import process_incoming_ticket

router = APIRouter()


@router.post("/", response_model=Dict[str, Any])
async def create_ticket(ticket: TicketCreate):
    """Receive incoming ticket from Gmail / Google Form / OS Ticket webhook."""
    res = await process_incoming_ticket(ticket.dict())
    return {"status": "success", "data": res}


@router.get("/", response_model=List[Dict[str, Any]])
async def list_tickets(status: str = None, category: str = None):
    """List inbox tickets with optional status & category filtering."""
    # Placeholder returning sample ticket list
    return [
        {
            "id": "123e4567-e89b-12d3-a456-426614174000",
            "source": "gmail",
            "sender_email": "user@dtt.vn",
            "subject": "Lỗi không tạo được tài khoản Keycloak",
            "raw_content": "Xin hãy tạo tài khoản Keycloak cho nhân viên mới.",
            "ai_summary": "Yêu cầu cấp tài khoản Keycloak mới.",
            "category": "account_keycloak",
            "priority": "normal",
            "status": "pending",
            "created_at": "2026-08-12T12:00:00Z",
        }
    ]
