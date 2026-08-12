from fastapi import APIRouter
from typing import Dict, Any, List

router = APIRouter()


@router.get("/summary")
async def get_reports_summary():
    """Endpoint serving analytics summary data for frontend Dashboard & Recharts."""
    return {
        "total_tickets": 128,
        "pending_approval": 12,
        "resolved_this_month": 116,
        "system_health": "99.9%",
        "category_ratios": [
            {"name": "System Bugs", "value": 45},
            {"name": "Keycloak Account", "value": 30},
            {"name": "LMS Enroll", "value": 25},
            {"name": "License", "value": 15},
            {"name": "Others", "value": 13},
        ],
    }
