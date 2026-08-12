from pydantic import BaseModel
from typing import Optional, Dict, Any
from enum import Enum
from datetime import datetime


class BotType(str, Enum):
    KEYCLOAK_API = "keycloak_api"
    LMS_PLAYWRIGHT = "lms_playwright"
    GITHUB_ISSUE_CREATOR = "github_issue_creator"
    GOOGLE_DOC_COMMENT = "google_doc_comment"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AutomationTaskCreate(BaseModel):
    ticket_id: str
    bot_type: BotType
    payload_data: Dict[str, Any]


class AutomationTaskApprovalUpdate(BaseModel):
    approval_status: ApprovalStatus
    edited_payload: Optional[Dict[str, Any]] = None


class AutomationTaskResponse(BaseModel):
    id: str
    ticket_id: Optional[str] = None
    bot_type: BotType
    payload_data: Dict[str, Any]
    approval_status: ApprovalStatus
    execution_status: str
    execution_logs: Optional[str] = None
    created_at: datetime
    executed_at: Optional[datetime] = None
