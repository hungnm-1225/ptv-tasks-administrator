# backend/app/models/intent.py
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


class EvidenceSpan(BaseModel):
    """Bằng chứng trích dẫn nguyên văn từ nội dung yêu cầu với định vị ký tự chính xác."""
    source_revision_id: Optional[str] = Field(default=None, description="ID của revision gốc (inbox_ticket_revisions)")
    source_kind: Literal["ticket_body", "attachment_extract"] = Field(
        default="ticket_body", 
        description="Nguồn gốc của bằng chứng: thân email/ticket hoặc nội dung bóc tách từ file đính kèm"
    )
    quote: str = Field(description="Đoạn trích dẫn nguyên văn từ nội dung email/ticket")
    start_offset: int = Field(default=-1, description="Vị trí ký tự bắt đầu trong văn bản gốc (0-indexed)")
    end_offset: int = Field(default=-1, description="Vị trí ký tự kết thúc trong văn bản gốc")
    context_note: Optional[str] = Field(default=None, description="Ghi chú vị trí hoặc ngữ cảnh của đoạn trích")
    is_verified: bool = Field(default=False, description="Cờ xác nhận đã được đối soát chính xác 100% trong văn bản gốc")


class ExtractedIntent(BaseModel):
    """Ý định vận hành được trích xuất có bằng chứng xác thực."""
    type: str = Field(description="Loại ý định: create_accounts, course_access, repository_access, reset_password, verify_email")
    confidence: float = Field(ge=0.0, le=1.0, description="Độ tin cậy từ 0.0 đến 1.0")
    evidence: List[EvidenceSpan] = Field(default_factory=list, description="Danh sách bằng chứng chứng minh yêu cầu thực sự tồn tại")
    required_entities: List[str] = Field(default_factory=list, description="Các thực thể bắt buộc cần có cho intent này")
    is_valid: bool = Field(default=True, description="Được đánh dấu hợp lệ sau khi đã kiểm chứng bằng chứng")


class ExtractedEntity(BaseModel):
    """Thực thể nghiệp vụ được trích xuất kèm bằng chứng."""
    type: Literal["school_name", "courses", "repositories", "users", "target_email", "git_role", "other"] = Field(
        description="Loại thực thể nghiệp vụ"
    )
    raw_value: Any = Field(description="Giá trị thực tế trích xuất được")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    evidence: List[EvidenceSpan] = Field(default_factory=list, description="Bằng chứng trích xuất cho thực thể này")
    is_verified: bool = Field(default=False, description="Đã được kiểm chứng thực tế")


class TypedEntities(BaseModel):
    """Cấu trúc thực thể chuẩn mực (Typed Entities)."""
    school_name: Optional[str] = None
    courses: List[str] = Field(default_factory=list)
    repositories: List[str] = Field(default_factory=list)
    users: List[Dict[str, Any]] = Field(default_factory=list)
    target_email: Optional[str] = None
    git_role: Optional[str] = None
    additional: Dict[str, Any] = Field(default_factory=dict)


class IntentAssessment(BaseModel):
    """Bản đánh giá sự thật vận hành (Fact Extraction) của Gemini AI."""
    outcome: Literal["no_action", "needs_information", "candidate_action"] = Field(
        description="Đánh giá: no_action (rác/quảng cáo), needs_information (thiếu thông tin/bằng chứng), candidate_action (đầy đủ)"
    )
    model_name: Optional[str] = None
    prompt_version: str = "v1"
    intents: List[ExtractedIntent] = Field(default_factory=list)
    entities: Dict[str, Any] = Field(default_factory=dict)
    typed_entities: Optional[TypedEntities] = None
    extracted_entities: List[ExtractedEntity] = Field(default_factory=list)
    missing_requirements: List[Dict[str, str]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    raw_evidence_quotes: List[str] = Field(default_factory=list)


class VerifiedIntentAssessment(IntentAssessment):
    """Bản đánh giá sự thật vận hành ĐÃ ĐƯỢC KIỂM CHỨNG BẰNG CHỨNG (Evidence Verified)."""
    is_fully_verified: bool = Field(default=True, description="Đã vượt qua bộ lọc EvidenceVerifier")
    source_revision_id: Optional[str] = None
    verified_at: Optional[str] = None


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