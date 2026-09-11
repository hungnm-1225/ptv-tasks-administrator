# backend/app/services/evidence_verifier.py
import re
import logging
from typing import Optional, List, Tuple
from datetime import datetime, timezone

from app.models.intent import (
    EvidenceSpan,
    ExtractedIntent,
    ExtractedEntity,
    IntentAssessment,
    VerifiedIntentAssessment
)

logger = logging.getLogger(__name__)

# Danh sách từ khóa cảnh báo Prompt Injection tiềm ẩn
INJECTION_SUSPICIOUS_PATTERNS = [
    r"ignore previous instructions",
    r"disregard all prior",
    r"you are now an unrestricted",
    r"system override",
    r"grant all permissions without check",
    r"bỏ qua các bước kiểm tra",
    r"cấp toàn quyền không cần duyệt"
]


class EvidenceVerifierService:
    """
    Bộ thẩm định bằng chứng tất định (Deterministic Evidence Verifier):
    - Kiểm tra tính xác thực 100% của bằng chứng (Evidence Grounding).
    - So khớp từng ký tự với raw_content từ immutable revision.
    - Loại bỏ hoàn toàn ảo giác (Hallucinations) và trích dẫn giả mạo.
    - Chuyển outcome sang needs_information nếu intent không đủ bằng chứng kiểm chứng.
    """

    @staticmethod
    def _normalize_text(text: Optional[str]) -> str:
        """Chuẩn hóa xuống dòng và khoảng trắng để so khớp chính xác."""
        if not text:
            return ""
        return text.replace("\r\n", "\n").replace("\r", "\n")

    @classmethod
    def verify_evidence_span(
        cls, 
        span: EvidenceSpan, 
        normalized_content: str, 
        source_revision_id: Optional[str] = None
    ) -> Tuple[bool, EvidenceSpan]:
        """
        Kiểm định một đoạn trích dẫn nguyên văn đối chiếu với nội dung gốc:
        1. Kiểm tra rỗng.
        2. Kiểm tra Prompt Injection.
        3. Kiểm tra vị trí offset. Nếu lệch, dò tìm substring để hiệu chuẩn offset.
        """
        raw_quote = span.quote or ""
        clean_quote = raw_quote.strip()

        if not clean_quote or len(clean_quote) < 2:
            span.is_verified = False
            return False, span

        # Chặn Prompt Injection thô
        quote_lower = clean_quote.lower()
        for pattern in INJECTION_SUSPICIOUS_PATTERNS:
            if re.search(pattern, quote_lower, re.IGNORECASE):
                logger.warning(f"🛡️ [SECURITY] Phát hiện dấu hiệu Prompt Injection trong quote: '{clean_quote}'")
                span.is_verified = False
                return False, span

        content_len = len(normalized_content)
        start = span.start_offset
        end = span.end_offset

        # Trường hợp 1: Offset chuẩn xác tuyệt đối
        if 0 <= start < content_len and 0 < end <= content_len and start < end:
            sliced = normalized_content[start:end]
            if sliced == clean_quote:
                span.is_verified = True
                span.source_revision_id = source_revision_id
                return True, span

        # Trường hợp 2: Offset lệch (do Gemini đếm sai), tự động dò tìm vị trí substring thực tế
        found_pos = normalized_content.find(clean_quote)
        if found_pos != -1:
            span.start_offset = found_pos
            span.end_offset = found_pos + len(clean_quote)
            span.is_verified = True
            span.source_revision_id = source_revision_id
            return True, span

        # Trường hợp 3: Thử tìm kiếm không phân biệt hoa thường (Case-insensitive fallback)
        content_lower = normalized_content.lower()
        found_lower = content_lower.find(clean_quote.lower())
        if found_lower != -1:
            actual_slice = normalized_content[found_lower:found_lower + len(clean_quote)]
            span.quote = actual_slice  # Hiệu chỉnh lại theo đúng chữ hoa/thường của văn bản gốc
            span.start_offset = found_lower
            span.end_offset = found_lower + len(clean_quote)
            span.is_verified = True
            span.source_revision_id = source_revision_id
            return True, span

        # Không tìm thấy trích dẫn trong văn bản gốc -> ẢO GIÁC (HALLUCINATION)!
        logger.warning(f"⚠️ [UNVERIFIED QUOTE] Không tìm thấy đoạn trích trong nội dung gốc: '{clean_quote[:50]}...'")
        span.is_verified = False
        return False, span

    @classmethod
    def verify_intent_assessment(
        cls,
        assessment: IntentAssessment,
        raw_content: str,
        source_revision_id: Optional[str] = None
    ) -> VerifiedIntentAssessment:
        """
        THẨM ĐỊNH TOÀN DIỆN BẢN ĐÁNH GIÁ Ý ĐỊNH:
        - Kiểm tra và lọc toàn bộ evidence spans trong từng intent.
        - Đánh dấu intent invalid nếu không còn bằng chứng nào được chứng thực.
        - Điều chỉnh outcome: Không bao giờ cho phép candidate_action nếu còn intent thiếu bằng chứng.
        """
        normalized_content = cls._normalize_text(raw_content)
        verified_intents: List[ExtractedIntent] = []
        missing_reqs = list(assessment.missing_requirements)
        warnings = list(assessment.warnings)
        verified_quotes: List[str] = []

        for intent in assessment.intents:
            valid_spans: List[EvidenceSpan] = []
            for span in intent.evidence:
                is_ok, calibrated_span = cls.verify_evidence_span(
                    span=span,
                    normalized_content=normalized_content,
                    source_revision_id=source_revision_id
                )
                if is_ok:
                    valid_spans.append(calibrated_span)
                    if calibrated_span.quote not in verified_quotes:
                        verified_quotes.append(calibrated_span.quote)

            if valid_spans:
                intent.evidence = valid_spans
                intent.is_valid = True
                verified_intents.append(intent)
            else:
                intent.is_valid = False
                msg = f"Ý định '{intent.type}' bị từ chối: Bằng chứng trích dẫn không tồn tại trong nội dung yêu cầu gốc."
                warnings.append(msg)
                missing_reqs.append({
                    "field": "evidence",
                    "intent": intent.type,
                    "message": msg
                })

        # Thẩm định bằng chứng cho các thực thể (Extracted Entities) nếu có
        verified_entities: List[ExtractedEntity] = []
        for entity in assessment.extracted_entities:
            entity_valid_spans: List[EvidenceSpan] = []
            for span in entity.evidence:
                is_ok, cal_span = cls.verify_evidence_span(span, normalized_content, source_revision_id)
                if is_ok:
                    entity_valid_spans.append(cal_span)

            entity.is_verified = len(entity_valid_spans) > 0
            entity.evidence = entity_valid_spans
            verified_entities.append(entity)

        # Quyết định Outcome sau khi đã kiểm chứng
        current_outcome = assessment.outcome
        if current_outcome != "no_action":
            if not verified_intents:
                current_outcome = "no_action" if not assessment.intents else "needs_information"
            elif any(not i.is_valid for i in assessment.intents) or missing_reqs:
                current_outcome = "needs_information"
            else:
                current_outcome = "candidate_action"

        now_iso = datetime.now(timezone.utc).isoformat()

        return VerifiedIntentAssessment(
            outcome=current_outcome,
            model_name=assessment.model_name,
            prompt_version=assessment.prompt_version,
            intents=verified_intents,
            entities=assessment.entities,
            typed_entities=assessment.typed_entities,
            extracted_entities=verified_entities,
            missing_requirements=missing_reqs,
            warnings=warnings,
            raw_evidence_quotes=verified_quotes,
            is_fully_verified=True,
            source_revision_id=source_revision_id,
            verified_at=now_iso
        )


evidence_verifier = EvidenceVerifierService()