from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from enum import Enum
from datetime import datetime


class TicketSource(str, Enum):
    GMAIL = "gmail"
    GOOGLE_FORM = "google_form"
    OSTICKET = "osticket"


class TicketCategory(str, Enum):
    BUG = "bug"
    ACCOUNT_KEYCLOAK = "account_keycloak"
    LMS_ENROLL = "lms_enroll"
    LICENSE = "license"
    OTHER = "other"


class TicketPriority(str, Enum):
    CRITICAL = "critical"
    NORMAL = "normal"


class TicketStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    PROCESSING = "processing"
    COMPLETED = "completed"
    DISMISSED = "dismissed"


class TicketCreate(BaseModel):
    source: TicketSource
    source_id: Optional[str] = None
    sender_email: EmailStr
    submitter_name: Optional[str] = None
    subject: Optional[str] = None
    raw_content: str
    metadata: Optional[Dict[str, Any]] = {}


class TicketResponse(BaseModel):
    id: str
    source: TicketSource
    source_id: Optional[str] = None
    sender_email: str
    submitter_name: Optional[str] = None
    subject: Optional[str] = None
    raw_content: str
    ai_summary: Optional[str] = None
    category: TicketCategory
    priority: TicketPriority
    status: TicketStatus
    metadata: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime
