# backend/app/services/evidence_verifier.py
import re
import logging
from typing import Optional, List, Tuple, Dict, Any
from datetime import datetime, timezone

from app.models.intent import (
    EvidenceSpan,
    ExtractedIntent,
    ExtractedEntity,
    TypedEntities,
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
    - Fail-Closed: Tạm thời vô hiệu hóa attachment_extract (chuyển unverified).
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
        1. Kiểm tra rỗng & độ dài tối thiểu.
        2. FAIL-CLOSED: Nếu nguồn là 'attachment_extract', tạm thời chưa hỗ trợ đối soát raw text.
        3. Kiểm tra Prompt Injection.
        4. Kiểm tra vị trí offset. Nếu lệch, tự động dò tìm substring để hiệu chuẩn offset.
        """
        raw_quote = span.quote or ""
        clean_quote = raw_quote.strip()

        # Luôn đóng dấu source_revision_id vào span
        if source_revision_id:
            span.source_revision_id = source_revision_id

        if not clean_quote or len(clean_quote) < 2:
            span.is_verified = False
            return False, span

        # PHA C (FAIL-CLOSED): Tạm thời chỉ hỗ trợ đối soát trên ticket_body
        if span.source_kind == "attachment_extract":
            logger.info(
                f"📎 [ATTACHMENT EVIDENCE FAIL-CLOSED] Bằng chứng từ file đính kèm ('{clean_quote[:30]}...') "
                f"chưa hỗ trợ trích xuất văn bản bất biến ở pha này ➔ Đánh dấu unverified."
            )
            span.is_verified = False
            return False, span

        # Chặn Prompt Injection
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
                return True, span

        # Trường hợp 2: Offset lệch (do Gemini đếm sai), tự động dò tìm vị trí substring thực tế
        found_pos = normalized_content.find(clean_quote)
        if found_pos != -1:
            span.start_offset = found_pos
            span.end_offset = found_pos + len(clean_quote)
            span.is_verified = True
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

        typed_entities = TypedEntities()
        for entity in verified_entities:
            if not entity.is_verified:
                continue
            if entity.type == "school_name" and isinstance(entity.raw_value, str):
                typed_entities.school_name = entity.raw_value
            elif entity.type == "courses" and isinstance(entity.raw_value, list):
                typed_entities.courses = [str(value) for value in entity.raw_value]
            elif entity.type == "repositories" and isinstance(entity.raw_value, list):
                typed_entities.repositories = [str(value) for value in entity.raw_value]
            elif entity.type == "repository_url" and isinstance(entity.raw_value, str):
                typed_entities.repository_url = entity.raw_value
            elif entity.type == "users" and isinstance(entity.raw_value, list):
                typed_entities.users = entity.raw_value
            elif entity.type == "target_email" and isinstance(entity.raw_value, str):
                typed_entities.target_email = entity.raw_value
            elif entity.type == "git_role" and isinstance(entity.raw_value, str):
                typed_entities.git_role = entity.raw_value

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
            # Raw/legacy entities remain display-only.  Planning uses the
            # verified typed object created above.
            entities=assessment.entities,
            typed_entities=typed_entities,
            extracted_entities=verified_entities,
            missing_requirements=missing_reqs,
            warnings=warnings,
            raw_evidence_quotes=verified_quotes,
            is_fully_verified=(current_outcome == "candidate_action"),
            source_revision_id=source_revision_id,
            verified_at=now_iso
        )


def load_verified_assessment(
    assessment_record: Dict[str, Any],
    expected_revision_id: str
) -> VerifiedIntentAssessment:
    """
    PHA C FACTORY FUNCTION:
    Giải tuần tự (deserialize) an toàn từ bảng ticket_ai_assessments:
    - Bảo toàn 100% EvidenceSpan và cờ is_verified.
    - Kiểm tra nghiêm ngặt: span.source_revision_id == expected_revision_id.
    - Reject intent nếu bất kỳ evidence bắt buộc nào không verified.
    - Không tự ý chuyển đổi quote/evidence giữa các intent.
    - Xây dựng đối tượng TypedEntities chuẩn mực để Planner tiêu thụ trực tiếp.
    """
    structured_fact = assessment_record.get("structured_result") or {}
    record_rev_id = assessment_record.get("ticket_revision_id") or structured_fact.get("source_revision_id")

    missing_requirements: List[Dict[str, str]] = list(structured_fact.get("missing_requirements", []))
    warnings: List[str] = list(structured_fact.get("warnings", []))

    # 1. Kiểm tra khớp revision (Anti-Provenance Skew)
    if record_rev_id and str(record_rev_id) != str(expected_revision_id):
        msg = f"Dữ liệu đánh giá thuộc revision cũ ({str(record_rev_id)[:8]}), không khớp với revision #{expected_revision_id[:8]}."
        logger.warning(f"🛡️ [PROVENANCE REVISION MISMATCH] {msg}")
        warnings.append(msg)
        missing_requirements.append({
            "field": "revision_mismatch",
            "message": msg
        })

    # 2. Giải tuần tự các Intents kèm kiểm tra tính hợp lệ của bằng chứng
    raw_intents = structured_fact.get("intents", [])
    deserialized_intents: List[ExtractedIntent] = []

    for raw_op in raw_intents:
        if not isinstance(raw_op, dict):
            continue

        raw_evidence = raw_op.get("evidence", [])
        evidence_spans: List[EvidenceSpan] = []
        for e in raw_evidence:
            if isinstance(e, dict):
                span = EvidenceSpan(**e)
            elif isinstance(e, str):
                span = EvidenceSpan(quote=e)
            else:
                continue

            # Bằng chứng không khớp revision ➔ Bị từ chối
            if span.source_revision_id and str(span.source_revision_id) != str(expected_revision_id):
                span.is_verified = False

            # Bằng chứng attachment ➔ Tạm thời Fail-Closed
            if span.source_kind == "attachment_extract":
                span.is_verified = False

            evidence_spans.append(span)

        # Intent chỉ hợp lệ khi có ít nhất 1 bằng chứng đã được verified
        has_verified_evidence = any(s.is_verified for s in evidence_spans)
        intent_is_valid = raw_op.get("is_valid", True) and has_verified_evidence

        intent_type = raw_op.get("type", "unknown")
        if not intent_is_valid:
            missing_requirements.append({
                "field": "evidence",
                "intent": intent_type,
                "message": f"Ý định '{intent_type}' không có bằng chứng hợp lệ đã kiểm chứng cho revision #{expected_revision_id[:8]}."
            })

        deserialized_intents.append(
            ExtractedIntent(
                type=intent_type,
                confidence=float(raw_op.get("confidence", 0.8)),
                evidence=evidence_spans,
                required_entities=raw_op.get("required_entities", []),
                is_valid=intent_is_valid
            )
        )

    # 3. Giải tuần tự Extracted Entities & Dựng TypedEntities
    raw_entities = structured_fact.get("extracted_entities", [])
    deserialized_entities: List[ExtractedEntity] = []
    verified_typed = TypedEntities()

    for ent in raw_entities:
        if not isinstance(ent, dict):
            continue

        ent_evidence: List[EvidenceSpan] = []
        for e in ent.get("evidence", []):
            if isinstance(e, dict):
                span = EvidenceSpan(**e)
            elif isinstance(e, str):
                span = EvidenceSpan(quote=e)
            else:
                continue
            if span.source_revision_id and str(span.source_revision_id) != str(expected_revision_id):
                span.is_verified = False
            if span.source_kind == "attachment_extract":
                span.is_verified = False
            ent_evidence.append(span)

        is_ent_verified = ent.get("is_verified", False) and any(s.is_verified for s in ent_evidence)
        deserialized_entities.append(
            ExtractedEntity(
                type=ent.get("type", "other"),
                raw_value=ent.get("raw_value"),
                confidence=float(ent.get("confidence", 1.0)),
                evidence=ent_evidence,
                is_verified=is_ent_verified
            )
        )

        if is_ent_verified:
            e_type = ent.get("type")
            val = ent.get("raw_value")
            if e_type == "school_name" and isinstance(val, str):
                verified_typed.school_name = val
            elif e_type == "courses" and isinstance(val, list):
                verified_typed.courses = [str(c) for c in val]
            elif e_type == "repositories" and isinstance(val, list):
                verified_typed.repositories = [str(r) for r in val]
            elif e_type == "repository_url" and isinstance(val, str):
                verified_typed.repository_url = val
            elif e_type == "users" and isinstance(val, list):
                verified_typed.users = val
            elif e_type == "target_email" and isinstance(val, str):
                verified_typed.target_email = val
            elif e_type == "git_role" and isinstance(val, str):
                verified_typed.git_role = val

    # Legacy entities are display-only.  They must never become verified data:
    # this would recreate a hallucinated action target after deserialisation.
    legacy_entities = structured_fact.get("entities", {})

    # 4. Xác định Outcome cuối cùng
    orig_outcome = structured_fact.get("outcome", "needs_information")
    if orig_outcome == "no_action":
        final_outcome = "no_action"
    elif missing_requirements or any(not i.is_valid for i in deserialized_intents):
        final_outcome = "needs_information"
    elif not deserialized_intents:
        final_outcome = "no_action"
    else:
        final_outcome = "candidate_action"

    return VerifiedIntentAssessment(
        outcome=final_outcome,
        model_name=assessment_record.get("model_name"),
        prompt_version=assessment_record.get("prompt_version", "v1.1.0"),
        intents=deserialized_intents,
        entities={},
        typed_entities=verified_typed,
        extracted_entities=deserialized_entities,
        missing_requirements=missing_requirements,
        warnings=warnings,
        raw_evidence_quotes=structured_fact.get("raw_evidence_quotes", []),
        is_fully_verified=(final_outcome == "candidate_action"),
        source_revision_id=expected_revision_id,
        verified_at=datetime.now(timezone.utc).isoformat()
    )


evidence_verifier = EvidenceVerifierService()
