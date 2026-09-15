# backend/app/core/gemini.py
import os
import re
import json
import logging
import tempfile
import urllib.request
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

import google.generativeai as genai
from app.core.supabase import get_supabase_client
from app.services.cof_excel_service import COFExcelService
from app.services.request_fact_normalizer import augment_assessment_with_request_facts
from app.models.intent import (
    IntentAssessment, 
    VerifiedIntentAssessment,
    TicketSummary, 
    ExtractedIntent, 
    ExtractedEntity,
    EvidenceSpan
)
from app.services.evidence_verifier import evidence_verifier

try:
    from app.core.config import settings
except Exception:
    settings = None

logger = logging.getLogger(__name__)

# Danh mục danh bạ Category chuẩn của Pydantic TicketSummary
VALID_CATEGORIES = {"license", "lms_enroll", "account_keycloak", "bug", "other"}
VALID_PRIORITIES = {"urgent", "normal", "low", "high"}

GEMINI_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
]
AUTOMATED_SENDER_PREFIXES = (
    "noreply@", "no-reply@", "notification@", "notifications@",
    "alert@", "alerts@", "info@", "newsletter@", "marketing@",
    "billing@", "updates@", "support@",
)
_MODEL_COOLDOWN: Dict[str, float] = {}

BRAIN_DIR = os.path.join(os.path.dirname(__file__), "../brain")
PROMPTS_DIR = os.path.join(BRAIN_DIR, "prompts")


class AIEngine:
    def __init__(self):
        self.api_key_summary = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or (getattr(settings, "GEMINI_API_KEY", None) if settings else None)
        )

        self.api_key_facts = (
            os.getenv("GEMINI_API_KEY2")
            or (getattr(settings, "GEMINI_API_KEY2", None) if settings else None)
            or self.api_key_summary
        )

        if self.api_key_summary:
            logger.info("🔑 [GEMINI KEY 1] Đã nạp thành công chìa khóa chính!")
        if os.getenv("GEMINI_API_KEY2"):
            logger.info("⚡ [GEMINI KEY 2] Đã kích hoạt chìa khóa phụ độc lập!")

        self._load_prompts()

    def _load_prompts(self):
        self.summary_prompt_tpl = ""
        self.intent_prompt_tpl = ""
        try:
            summary_p = os.path.join(PROMPTS_DIR, "ticket_summary_v1.txt")
            if os.path.exists(summary_p):
                with open(summary_p, "r", encoding="utf-8") as f:
                    self.summary_prompt_tpl = f.read()

            intent_p = os.path.join(PROMPTS_DIR, "intent_extraction_v1.txt")
            if os.path.exists(intent_p):
                with open(intent_p, "r", encoding="utf-8") as f:
                    self.intent_prompt_tpl = f.read()
        except Exception as e:
            logger.warning(f"⚠️ Lỗi nạp prompt templates: {e}")

    def _call_gemini_with_fallback(
        self,
        prompt: str,
        primary_key: Optional[str] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        import time

        key_1 = primary_key or self.api_key_summary
        key_2 = self.api_key_facts if key_1 == self.api_key_summary else self.api_key_summary

        available_keys = [k for k in [key_1, key_2] if k]
        seen_keys = []
        keys_to_try = []
        for k in available_keys:
            if k not in seen_keys:
                keys_to_try.append(k)
                seen_keys.append(k)

        if not keys_to_try:
            return None, None

        now_ts = time.time()

        for model_name in GEMINI_MODELS:
            if now_ts < _MODEL_COOLDOWN.get(model_name, 0):
                logger.debug(f"⏳ Bỏ qua [{model_name}] vì đang trong thời gian Cooldown.")
                continue

            for key_idx, active_key in enumerate(keys_to_try):
                try:
                    genai.configure(api_key=active_key)
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(
                        prompt,
                        generation_config={"response_mime_type": "application/json"},
                        request_options={"timeout": 8.0}
                    )
                    if response and response.text:
                        parsed = json.loads(response.text)
                        _MODEL_COOLDOWN.pop(model_name, None)
                        return parsed, model_name

                except Exception as e:
                    err_str = str(e).lower()
                    is_rate_limit = any(term in err_str for term in ["429", "quota", "resource_exhausted", "limit"])
                    
                    if is_rate_limit:
                        logger.warning(f"⚠️ Model [{model_name}] với Key #{key_idx + 1} dính Quota 429. Đang chuyển sang dự phòng...")
                        _MODEL_COOLDOWN[model_name] = time.time() + 300
                        if len(keys_to_try) > 1 and key_idx == 0:
                            continue
                        else:
                            break
                    else:
                        logger.warning(f"⚠️ Model [{model_name}] gặp lỗi khác: {str(e)[:80]}")
                        break

        return None, None

    def summarize_ticket(
        self,
        subject: str,
        raw_content: str,
        source: str,
        sender_email: Optional[str] = None
    ) -> TicketSummary:
        sender_clean = (sender_email or "").lower().strip()
        is_automated = any(sender_clean.startswith(prefix) or prefix in sender_clean for prefix in AUTOMATED_SENDER_PREFIXES)

        if is_automated:
            logger.info(f"⚡ [FAST-PATH EMAIL] Bỏ qua gọi AI cho thư tự động từ: {sender_clean}")
            return TicketSummary(
                category="other",
                priority="low",
                goal=f"Thông báo tự động: {subject[:60]}",
                summary_vi=f"📨 Bản tin / Thông báo hệ thống tự động từ [{sender_clean}]: {subject}. Không yêu cầu thao tác kỹ thuật.",
                assigned_name="Hệ Thống",
                assigned_email=None,
                model_name="fast_path_system_filter",
                prompt_version="fast_path_v1.0"
            )

        full_content = raw_content[:20000] if raw_content else "(Trống)"

        if self.summary_prompt_tpl:
            prompt = self.summary_prompt_tpl.format(source=source, subject=subject, full_content=full_content)
        else:
            prompt = f"Tóm tắt: {subject}\n{full_content}"

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_summary)

        # ⚠️ BÁO LỖI MINH BẠCH KHI GEMINI AI GẶP SỰ CỐ HOẶC HẾT HẠN MỨC (ZERO-MOCKUP)
        if not parsed_data:
            logger.error("❌ Không thể phân tích tóm tắt vé: Toàn bộ model Gemini gặp sự cố hoặc hết quota API.")
            return TicketSummary(
                category="other",
                priority="normal",
                goal=subject or "Không thể phân tích",
                summary_vi="⚠️ Lỗi: Không thể phân tích nội dung do sự cố kết nối AI hoặc hết hạn ngạch API (Quota 429). Quản trị viên vui lòng kiểm tra trực tiếp nội dung vé.",
                assigned_name="Chưa phân công",
                assigned_email=None,
                model_name="ai_analysis_failed",
                prompt_version="error_fallback"
            )

        # SANITIZE CHẶT CHẼ: ÉP VỀ ĐÚNG 5 NHÃN NẾU GEMINI TRẢ VỀ TỪ LẠ
        raw_cat = str(parsed_data.get("category", "other")).lower().strip()
        if raw_cat in VALID_CATEGORIES:
            final_cat = raw_cat
        elif "account" in raw_cat or "user" in raw_cat or "pass" in raw_cat:
            final_cat = "account_keycloak"
        elif "course" in raw_cat or "enroll" in raw_cat or "lms" in raw_cat:
            final_cat = "lms_enroll"
        elif "license" in raw_cat or "contract" in raw_cat or "order" in raw_cat:
            final_cat = "license"
        elif "bug" in raw_cat or "error" in raw_cat or "issue" in raw_cat:
            final_cat = "bug"
        else:
            final_cat = "other"

        raw_pri = str(parsed_data.get("priority", "normal")).lower().strip()
        final_pri = raw_pri if raw_pri in VALID_PRIORITIES else "normal"

        return TicketSummary(
            category=final_cat,
            priority=final_pri,
            goal=parsed_data.get("goal", subject),
            summary_vi=parsed_data.get("summary_vi", f"Tóm tắt: {subject}"),
            assigned_name=parsed_data.get("assigned_name", "Hung Nguyen"),
            assigned_email=parsed_data.get("assigned_email", "hung.nguyenmanh@dtt.vn"),
            model_name=used_model,
            prompt_version="v1.2.0"
        )

    def extract_operational_facts(
        self,
        subject: str,
        raw_content: str,
        source: str,
        excel_summary: Optional[Dict[str, Any]] = None,
        source_revision_id: Optional[str] = None,
        sender_email: Optional[str] = None
    ) -> VerifiedIntentAssessment:
        sender_clean = (sender_email or "").lower().strip()
        is_automated = any(sender_clean.startswith(prefix) or prefix in sender_clean for prefix in AUTOMATED_SENDER_PREFIXES)

        if is_automated:
            logger.info(f"⚡ [FAST-PATH FACTS] Xác nhận NO_ACTION cho thư tự động: {sender_clean}")
            raw_assessment = IntentAssessment(
                outcome="no_action",
                model_name="fast_path_system_filter",
                prompt_version="fast_path_v1.0",
                intents=[],
                entities={},
                extracted_entities=[],
                missing_requirements=[],
                warnings=["Đã nhận diện email thông báo tự động / newsletter. Tự động chuyển sang NO_ACTION mà không tốn Quota AI."],
                raw_evidence_quotes=[]
            )
            return raw_assessment

        full_content = raw_content[:20000] if raw_content else "(Trống)"
        excel_info_str = json.dumps(excel_summary, ensure_ascii=False, indent=2) if excel_summary else "Không có file Excel đính kèm."

        if self.intent_prompt_tpl:
            prompt = self.intent_prompt_tpl.format(
                excel_info_str=excel_info_str,
                full_content=f"Tiêu đề: {subject}\nNguồn: {source}\nNội dung chi tiết:\n{full_content}"
            )
        else:
            prompt = f"Trích xuất facts: {subject}\n{full_content}"

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_facts)

        if not parsed_data:
            logger.error("❌ Không thể bóc tách sự thật vận hành: Toàn bộ model Gemini gặp sự cố hoặc hết quota API.")
            return IntentAssessment(
                outcome="needs_information",
                model_name="ai_extraction_failed",
                prompt_version="error_fallback",
                intents=[],
                entities={},
                extracted_entities=[],
                missing_requirements=[{"item": "ai_extraction_failed", "reason": "Sự cố kết nối AI hoặc hết hạn ngạch API (Quota 429)"}],
                warnings=["⚠️ Lỗi: Không thể phân tích và bóc tách sự thật vận hành do sự cố kết nối AI hoặc hết hạn ngạch API (Quota 429). Hệ thống dừng an toàn, không tự động sinh hành động."],
                raw_evidence_quotes=[]
            )

        raw_intents = parsed_data.get("intents", [])
        structured_intents: List[ExtractedIntent] = []
        raw_evidence_quotes: List[str] = []

        for item in raw_intents:
            ev_list = []
            for ev in item.get("evidence", []):
                quote_str = ev.get("quote", "").strip() if isinstance(ev, dict) else str(ev).strip()
                start_off = ev.get("start_offset", -1) if isinstance(ev, dict) else -1
                end_off = ev.get("end_offset", -1) if isinstance(ev, dict) else -1
                src_kind = ev.get("source_kind", "ticket_body") if isinstance(ev, dict) else "ticket_body"

                if quote_str:
                    ev_list.append(
                        EvidenceSpan(
                            source_revision_id=source_revision_id,
                            quote=quote_str,
                            start_offset=start_off,
                            end_offset=end_off,
                            source_kind=src_kind
                        )
                    )
                    raw_evidence_quotes.append(quote_str)

            structured_intents.append(
                ExtractedIntent(
                    type=item.get("type", "unknown"),
                    confidence=float(item.get("confidence", 0.7)),
                    evidence=ev_list,
                    required_entities=item.get("required_entities", [])
                )
            )

        raw_entities = parsed_data.get("extracted_entities", [])
        structured_entities: List[ExtractedEntity] = []
        if isinstance(raw_entities, list):
            for ent in raw_entities:
                if isinstance(ent, dict):
                    ent_spans = []
                    for e in ent.get("evidence", []):
                        if isinstance(e, dict) and e.get("quote"):
                            ent_spans.append(EvidenceSpan(
                                source_revision_id=source_revision_id,
                                quote=str(e.get("quote", "")).strip(),
                                start_offset=e.get("start_offset", -1),
                                end_offset=e.get("end_offset", -1),
                                source_kind=e.get("source_kind", "ticket_body")
                            ))
                    structured_entities.append(ExtractedEntity(
                        type=ent.get("type", "other"),
                        raw_value=ent.get("raw_value"),
                        confidence=float(ent.get("confidence", 1.0)),
                        evidence=ent_spans
                    ))

        parsed_outcome = parsed_data.get("outcome", "candidate_action")
        if parsed_outcome not in ["no_action", "needs_information", "candidate_action"]:
            parsed_outcome = "candidate_action"

        raw_assessment = IntentAssessment(
            outcome=parsed_outcome,
            model_name=used_model,
            prompt_version="v1.2.0",
            intents=structured_intents,
            entities=parsed_data.get("entities", {}),
            extracted_entities=structured_entities,
            missing_requirements=parsed_data.get("missing_requirements", []),
            warnings=parsed_data.get("warnings", []),
            raw_evidence_quotes=raw_evidence_quotes
        )

        raw_assessment = augment_assessment_with_request_facts(
            raw_assessment, raw_content, source_revision_id, sender_email=sender_email
        )

        return evidence_verifier.verify_intent_assessment(
            assessment=raw_assessment,
            raw_content=raw_content,
            source_revision_id=source_revision_id
        )


gemini_engine = AIEngine()