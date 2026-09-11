# backend/app/models/intent.py
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


class EvidenceSpan(BaseModel):
    """Bằng chứng trích dẫn nguyên văn từ nội dung yêu cầu."""
    quote: str = Field(description="Đoạn trích dẫn nguyên văn từ nội dung email/ticket")
    context_note: Optional[str] = Field(default=None, description="Ghi chú vị trí hoặc ngữ cảnh của đoạn trích")


class ExtractedIntent(BaseModel):
    """Ý định vận hành được trích xuất có bằng chứng."""
    type: str = Field(description="Loại ý định: create_accounts, course_access, repository_access, reset_password, verify_email")
    confidence: float = Field(ge=0.0, le=1.0, description="Độ tin cậy từ 0.0 đến 1.0")
    evidence: List[EvidenceSpan] = Field(default_factory=list, description="Bằng chứng chứng minh yêu cầu này thực sự tồn tại")
    required_entities: List[str] = Field(default_factory=list, description="Các thực thể bắt buộc cần có cho intent này")


class ExtractedEntity(BaseModel):
    """Thực thể được trích xuất từ yêu cầu."""
    type: str = Field(description="Loại thực thể: school_name, course, repository, user, email, role")
    raw_value: Any = Field(description="Giá trị thực tế trích xuất được")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    evidence: List[EvidenceSpan] = Field(default_factory=list)


class IntentAssessment(BaseModel):
    """Bản đánh giá sự thật vận hành (Fact Extraction) của Gemini AI."""
    outcome: Literal["no_action", "needs_information", "candidate_action"] = Field(
        description="Đánh giá: no_action (rác/quảng cáo), needs_information (thiếu bằng chứng), candidate_action (đủ bằng chứng)"
    )
    model_name: Optional[str] = None
    prompt_version: str = "v1"
    intents: List[ExtractedIntent] = Field(default_factory=list)
    entities: Dict[str, Any] = Field(default_factory=dict)
    missing_requirements: List[Dict[str, str]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    raw_evidence_quotes: List[str] = Field(default_factory=list)


class TicketSummary(BaseModel):
    """Bản tóm tắt mềm phục vụ hiển thị trên giao diện Unified Inbox."""
    category: Literal["license", "lms_enroll", "account_keycloak", "bug", "other"] = "other"
    priority: Literal["critical", "normal"] = "normal"
    goal: str
    summary_vi: str
    assigned_name: str = "Hung Nguyen"
    assigned_email: str = "hung.nguyenmanh@dtt.vn"
    model_name: Optional[str] = None
    prompt_version: str = "v1"