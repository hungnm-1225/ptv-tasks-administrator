# backend/app/models/intent.py
"""
Pydantic Schemas for Intent Assessment, Evidence Grounding & Entity Verification
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Cải tiến:
- Mở rộng ExtractedEntity.type thành chuỗi linh hoạt (str) chống crash ValidationError.
- Bổ sung order_code, contract_code, identifiers, enabled vào TypedEntities.
- Bảo toàn 100% tương thích ngược với EvidenceVerifier và TicketSummary.
"""

from typing import List, Dict, Any, Optional, Literal, Union
from pydantic import BaseModel, Field, field_validator


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
    is_verified: bool = Field(default=False, description="Cờ xác nhận đã được đối soát chính xác trong văn bản gốc")


class ExtractedIntent(BaseModel):
    """Ý định vận hành được trích xuất có bằng chứng xác thực."""
    type: str = Field(description="Loại ý định: repository_access, course_access, create_accounts, reset_password, unenrol_course, update_user_profile, etc.")
    confidence: float = Field(ge=0.0, le=1.0, description="Độ tin cậy từ 0.0 đến 1.0")
    evidence: List[EvidenceSpan] = Field(default_factory=list, description="Danh sách bằng chứng chứng minh yêu cầu thực sự tồn tại")
    required_entities: List[str] = Field(default_factory=list, description="Các thực thể bắt buộc cần có cho intent này")
    is_valid: bool = Field(default=True, description="Được đánh dấu hợp lệ sau khi đã kiểm chứng bằng chứng")


class ExtractedEntity(BaseModel):
    """Thực thể nghiệp vụ được trích xuất (Mở rộng kiểu str để chống crash Pydantic)."""
    type: str = Field(
        description="Loại thực thể: school_name, courses, repositories, users, target_email, git_role, order_code, contract_code, etc."
    )
    raw_value: Any = Field(description="Giá trị thực tế trích xuất được")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    evidence: List[EvidenceSpan] = Field(default_factory=list, description="Bằng chứng trích xuất cho thực thể này")
    is_verified: bool = Field(default=False, description="Đã được kiểm chứng thực tế trong văn bản gốc")


class TypedEntities(BaseModel):
    """Cấu trúc thực thể chuẩn mực bao quát toàn bộ 22 Capabilities của hệ thống."""
    school_name: Optional[str] = None
    courses: List[str] = Field(default_factory=list)
    repositories: List[str] = Field(default_factory=list)
    repository_url: Optional[str] = None
    users: List[Dict[str, Any]] = Field(default_factory=list)
    identifiers: List[str] = Field(default_factory=list)
    target_email: Optional[str] = None
    git_role: Optional[str] = "GUEST"
    order_code: Optional[str] = None
    contract_code: Optional[str] = None
    enabled: Optional[bool] = None
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

    # 🎯 BỘ LỌC TỰ ĐỘNG CHUYỂN CHUỖI SANG DICT NẾU AI TRẢ VỀ CHUỖI
    @field_validator("missing_requirements", mode="before")
    @classmethod
    def normalize_missing_requirements(cls, v):
        if not v:
            return []
        if isinstance(v, str):
            return [{"field": "general", "message": v.strip()}]
        if isinstance(v, list):
            normalized = []
            for item in v:
                if isinstance(item, dict):
                    normalized.append({
                        "field": str(item.get("field") or "general"),
                        "message": str(item.get("message") or item.get("detail") or str(item))
                    })
                elif isinstance(item, str) and item.strip():
                    normalized.append({"field": "general", "message": item.strip()})
            return normalized
        return []


class VerifiedIntentAssessment(IntentAssessment):
    """Bản đánh giá sự thật vận hành ĐÃ ĐƯỢC KIỂM CHỨNG BẰNG CHỨNG (Evidence Verified)."""
    is_fully_verified: bool = Field(default=True, description="Đã vượt qua bộ lọc EvidenceVerifier")
    source_revision_id: Optional[str] = None
    verified_at: Optional[str] = None


class TicketSummary(BaseModel):
    """Bản tóm tắt mềm phục vụ hiển thị trên giao diện Unified Inbox."""
    category: Literal["license", "lms_enroll", "account_keycloak", "bug", "other"] = "other"
    priority: Literal["critical", "normal", "urgent", "low", "high"] = "normal"
    goal: str
    summary_vi: str
    assigned_name: Optional[str] = None
    assigned_email: Optional[str] = None
    model_name: Optional[str] = None
    prompt_version: str = "v1"