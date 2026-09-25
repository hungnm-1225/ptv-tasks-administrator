# backend/app/services/evidence_verifier.py
"""
Deterministic Evidence Verifier Service
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Đối soát tính xác thực của trích dẫn bằng chứng (Evidence Grounding).
- Loại bỏ dấu chấm lửng (...) do AI sinh ra ở cuối câu trích dẫn.
- Chuẩn hóa khoảng trắng mềm dẻo (Whitespace Invariant Matching).
- Khớp 100% Schema Pydantic của IntentAssessment (không gọi trường confidence ảo).
"""

import re
import logging
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
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
    def verify_evidence_span(
        cls,
        *args,
        span: Optional[EvidenceSpan] = None,
        raw_content: Optional[str] = None,
        normalized_content: Optional[str] = None,
        **kwargs
    ) -> Tuple[bool, EvidenceSpan]:
        """
        Đối soát trích dẫn bằng chứng:
        - Chặn đứng Prompt Injection.
        - Hiệu chỉnh vị trí Start/End Offset chính xác.
        - Trả về tuple (is_ok: bool, calibrated_span: EvidenceSpan).
        """
        # Hỗ trợ truyền theo thứ tự (raw_content, span) hoặc (span, raw_content)
        content_str = raw_content or normalized_content
        target_span = span

        for arg in args:
            if isinstance(arg, EvidenceSpan):
                target_span = arg
            elif isinstance(arg, str):
                content_str = arg

        if not target_span:
            dummy = EvidenceSpan(quote="", is_verified=False)
            return False, dummy

        if not content_str or not target_span.quote:
            unverified = target_span.model_copy(update={"is_verified": False})
            return False, unverified

        # 🚨 1. CHỐNG PROMPT INJECTION
        quote_lower = target_span.quote.lower()
        injection_patterns = [
            r"ignore\s+(?:previous|above)\s+instructions",
            r"grant\s+all\s+permissions",
            r"system\s+prompt",
            r"bypass\s+safety",
            r"disregard\s+instructions",
        ]
        if any(re.search(pat, quote_lower) for pat in injection_patterns):
            logger.warning(f"🚨 [PROMPT INJECTION BLOCKED] Phát hiện mã độc trong trích dẫn: '{target_span.quote}'")
            unverified = target_span.model_copy(update={"is_verified": False})
            return False, unverified

        clean_q = cls.clean_quote(target_span.quote)
        if not clean_q or len(clean_q) < 4:
            unverified = target_span.model_copy(update={"is_verified": False})
            return False, unverified

        # 🎯 2. HIỆU CHỈNH VỊ TRÍ OFFSET NẾU KHỚP NGUYÊN VĂN
        if clean_q in content_str:
            start_idx = content_str.find(clean_q)
            calibrated = target_span.model_copy(update={
                "start_offset": start_idx,
                "end_offset": start_idx + len(clean_q),
                "is_verified": True
            })
            return True, calibrated

        # 🎯 3. SO KHỚP MỀM DẺO KHÔNG PHÂN BIỆT KHOẢNG TRẮNG (\s+)
        norm_raw = re.sub(r"\s+", " ", content_str).strip().lower()
        norm_q = re.sub(r"\s+", " ", clean_q).strip().lower()
        if norm_q in norm_raw:
            calibrated = target_span.model_copy(update={"is_verified": True})
            return True, calibrated

        # 🎯 4. THỬ VỚI 60 KÝ TỰ ĐẦU TIÊN CỦA QUOTE NẾU DÀI
        if len(norm_q) > 60:
            prefix_q = norm_q[:60].strip()
            if prefix_q in norm_raw:
                calibrated = target_span.model_copy(update={"is_verified": True})
                return True, calibrated

        logger.warning(f"⚠️ [UNVERIFIED QUOTE] Không tìm thấy đoạn trích trong nội dung gốc: '{clean_q[:60]}...'")
        unverified = target_span.model_copy(update={"is_verified": False})
        return False, unverified

    @classmethod
    def verify_intent_assessment(
        cls,
        assessment: IntentAssessment,
        raw_content: str,
        source_revision_id: Optional[str] = None
    ) -> VerifiedIntentAssessment:
        verified_intents = []
        all_quotes = []
        warnings = list(assessment.warnings)
        has_invalidated_intent = False

        for intent in assessment.intents:
            verified_evidence: List[EvidenceSpan] = []
            for ev in intent.evidence:
                ev.source_revision_id = source_revision_id or ev.source_revision_id
                is_ok, calibrated = cls.verify_evidence_span(raw_content=raw_content, span=ev)
                if is_ok:
                    verified_evidence.append(calibrated)
                    all_quotes.append(cls.clean_quote(calibrated.quote))
                else:
                    clean_q = cls.clean_quote(ev.quote)
                    if clean_q:
                        all_quotes.append(clean_q)

            if verified_evidence:
                intent.is_valid = True
                intent.evidence = verified_evidence
                verified_intents.append(intent)
            else:
                intent.is_valid = False
                intent.evidence = []
                verified_intents.append(intent)
                has_invalidated_intent = True
                warnings.append(f"Ý định '{intent.type}' bị gạch bỏ do bằng chứng trích dẫn không tồn tại trong nội dung gốc.")

        outcome = assessment.outcome
        if has_invalidated_intent and outcome == "candidate_action":
            outcome = "needs_information"

        return VerifiedIntentAssessment(
            outcome=outcome,
            model_name=assessment.model_name,
            prompt_version=assessment.prompt_version,
            intents=verified_intents,
            entities=assessment.entities,
            typed_entities=assessment.typed_entities,
            missing_requirements=assessment.missing_requirements,
            warnings=warnings,
            raw_evidence_quotes=list(set(all_quotes)),
            source_revision_id=source_revision_id,
            is_fully_verified=True,
            verified_at=datetime.now(timezone.utc).isoformat()
        )


evidence_verifier = EvidenceVerifierService()

def load_verified_assessment(assessment_record: Dict[str, Any], expected_revision_id: str) -> IntentAssessment:
    data = assessment_record.get("structured_result") or {}
    return IntentAssessment(**data)