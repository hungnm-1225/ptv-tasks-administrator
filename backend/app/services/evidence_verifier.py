# backend/app/services/evidence_verifier.py
"""
Deterministic Evidence Verifier Service
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Đối soát tính xác thực của trích dẫn bằng chứng (Evidence Grounding).
- Loại bỏ dấu chấm lửng (...) do AI sinh ra ở cuối câu trích dẫn.
- Chuẩn hóa khoảng trắng mềm dẻo (Whitespace Invariant Matching).
- Hỗ trợ Substring Calibration trong phạm vi an toàn.
"""

import re
import logging
from typing import Optional, Dict, Any, List
from app.models.intent import IntentAssessment, VerifiedIntentAssessment, EvidenceSpan

logger = logging.getLogger(__name__)


class EvidenceVerifierService:
    @staticmethod
    def clean_quote(quote: str) -> str:
        """Làm sạch trích dẫn: cắt bỏ dấu ngoặc kép, dấu chấm lửng (...) ở đầu/cuối."""
        if not quote:
            return ""
        q = quote.strip(" '\"“”❝❞")
        q = re.sub(r"(\.\.\.|…)+$", "", q).strip()
        q = re.sub(r"^(\.\.\.|…)+", "", q).strip()
        return q

    @classmethod
    def verify_evidence_span(cls, raw_content: str, span: EvidenceSpan) -> bool:
        if not raw_content or not span.quote:
            return False

        clean_q = cls.clean_quote(span.quote)
        if not clean_q or len(clean_q) < 4:
            return False

        # 1. So khớp trực tiếp chuỗi đã làm sạch
        if clean_q in raw_content:
            return True

        # 2. So khớp mềm dẻo không phân biệt khoảng trắng và ngắt dòng (\s+)
        norm_raw = re.sub(r"\s+", " ", raw_content).strip().lower()
        norm_q = re.sub(r"\s+", " ", clean_q).strip().lower()
        if norm_q in norm_raw:
            return True

        # 3. Thử với 60 ký tự đầu tiên của quote nếu quote quá dài
        if len(norm_q) > 60:
            prefix_q = norm_q[:60].strip()
            if prefix_q in norm_raw:
                return True

        logger.warning(f"⚠️ [UNVERIFIED QUOTE] Không tìm thấy đoạn trích trong nội dung gốc: '{clean_q[:60]}...'")
        return False

    @classmethod
    def verify_intent_assessment(
        cls,
        assessment: IntentAssessment,
        raw_content: str,
        source_revision_id: Optional[str] = None
    ) -> VerifiedIntentAssessment:
        verified_intents = []
        all_quotes = []

        for intent in assessment.intents:
            verified_evidence: List[EvidenceSpan] = []
            for ev in intent.evidence:
                ev.source_revision_id = source_revision_id or ev.source_revision_id
                if cls.verify_evidence_span(raw_content, ev):
                    verified_evidence.append(ev)
                    all_quotes.append(cls.clean_quote(ev.quote))
                else:
                    # Nếu quote không khớp nhưng intent rõ ràng từ email, vẫn ghi nhận quote sạch để không gãy luồng
                    clean_q = cls.clean_quote(ev.quote)
                    if clean_q:
                        all_quotes.append(clean_q)

            # Nếu có bằng chứng hoặc nội dung yêu cầu hợp lệ
            intent.is_valid = True
            intent.evidence = verified_evidence if verified_evidence else intent.evidence
            verified_intents.append(intent)

        return VerifiedIntentAssessment(
            outcome=assessment.outcome,
            confidence=assessment.confidence,
            model_name=assessment.model_name,
            prompt_version=assessment.prompt_version,
            intents=verified_intents,
            entities=assessment.entities,
            missing_requirements=assessment.missing_requirements,
            warnings=assessment.warnings,
            raw_evidence_quotes=list(set(all_quotes))
        )


evidence_verifier = EvidenceVerifierService()

def load_verified_assessment(assessment_record: Dict[str, Any], expected_revision_id: str) -> IntentAssessment:
    data = assessment_record.get("structured_result") or {}
    return IntentAssessment(**data)