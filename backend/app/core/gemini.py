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
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]

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

        consecutive_quota_errors = 0

        for model_name in GEMINI_MODELS:
            if consecutive_quota_errors >= 2:
                logger.warning("⚡ [CIRCUIT BREAKER] Quota Project Google đã cạn! Kích hoạt Fast-Path ngay.")
                break

            for key_idx, active_key in enumerate(keys_to_try):
                try:
                    genai.configure(api_key=active_key)
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(
                        prompt,
                        generation_config={"response_mime_type": "application/json"},
                        request_options={"timeout": 5.0}
                    )
                    if response and response.text:
                        parsed = json.loads(response.text)
                        return parsed, model_name
                except Exception as e:
                    err_str = str(e).lower()
                    is_rate_limit = any(term in err_str for term in ["429", "quota", "resource_exhausted", "limit"])
                    if is_rate_limit:
                        consecutive_quota_errors += 1
                        if len(keys_to_try) > 1 and key_idx == 0:
                            continue
                        else:
                            break
                    else:
                        break

        return None, None

    def summarize_ticket(
        self,
        subject: str,
        raw_content: str,
        source: str
    ) -> TicketSummary:
        full_content = raw_content[:20000] if raw_content else "(Trống)"

        if self.summary_prompt_tpl:
            prompt = self.summary_prompt_tpl.format(source=source, subject=subject, full_content=full_content)
        else:
            prompt = f"Tóm tắt: {subject}\n{full_content}"

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_summary)

        # 🧠 BẢN TÓM TẮT TẤT ĐỊNH THÔNG MINH KHI GEMINI AI HẾT QUOTA (KHÔNG HARDCODE BỪA BÃI NỮA!)
        if not parsed_data:
            text_corpus = f"{subject} {full_content}".lower()

            # 1. Cảnh báo UptimeRobot & Giám sát hạ tầng máy chủ
            if any(w in text_corpus for w in ["uptimerobot", "monitor is up", "monitor is down", "incident", "downtime", "alert@uptimerobot"]):
                is_down = "monitor is down" in text_corpus or "incident" in text_corpus
                status_vi = "⚠️ Cảnh báo sự cố gián đoạn dịch vụ máy chủ (Server Down)" if is_down else "✅ Dịch vụ máy chủ đã phục hồi và hoạt động bình thường (Server Up)"
                return TicketSummary(
                    category="bug" if is_down else "other",
                    priority="urgent" if is_down else "normal",
                    goal=subject,
                    summary_vi=f"🎯 Mục đích: {subject}\n🔔 {status_vi} từ hệ thống giám sát UptimeRobot.",
                    assigned_name="Hung Nguyen",
                    assigned_email="hung.nguyenmanh@dtt.vn",
                    model_name="deterministic_fast_path",
                    prompt_version="fast_path_v1.2.0"
                )

            # 2. Yêu cầu Ghi danh Khóa học Moodle PLearn
            if any(w in text_corpus for w in ["enrol", "enroll", "ghi danh", "khóa học", "course content", "swrp"]):
                return TicketSummary(
                    category="lms_enroll",
                    priority="urgent" if any(w in text_corpus for w in ["urgent", "gấp", "training"]) else "normal",
                    goal=subject,
                    summary_vi=f"🎯 Mục đích: {subject}\n🎓 Yêu cầu ghi danh và phân quyền khóa học trên Moodle PLearn LMS.",
                    assigned_name="Hung Nguyen",
                    assigned_email="hung.nguyenmanh@dtt.vn",
                    model_name="deterministic_fast_path",
                    prompt_version="fast_path_v1.2.0"
                )

            # 3. Yêu cầu Cấp bù Hợp đồng & License
            if any(w in text_corpus for w in ["license", "hợp đồng", "contract", "order", "bù hợp đồng", "đơn vị trường"]):
                return TicketSummary(
                    category="license",
                    priority="normal",
                    goal=subject,
                    summary_vi=f"🎯 Mục đích: {subject}\n📄 Yêu cầu cấp phát License hoặc xử lý hợp đồng School Workspace.",
                    assigned_name="Hung Nguyen",
                    assigned_email="hung.nguyenmanh@dtt.vn",
                    model_name="deterministic_fast_path",
                    prompt_version="fast_path_v1.2.0"
                )

            # 4. Yêu cầu Tài khoản & Định danh người dùng
            if any(w in text_corpus for w in ["tạo tài khoản", "create account", "reset password", "đổi mật khẩu", "mở khóa", "unlock", "cấp tài khoản"]):
                return TicketSummary(
                    category="account_keycloak",
                    priority="urgent" if any(w in text_corpus for w in ["urgent", "gấp"]) else "normal",
                    goal=subject,
                    summary_vi=f"🎯 Mục đích: {subject}\n👤 Yêu cầu quản trị định danh hoặc cấp mới tài khoản người dùng.",
                    assigned_name="Hung Nguyen",
                    assigned_email="hung.nguyenmanh@dtt.vn",
                    model_name="deterministic_fast_path",
                    prompt_version="fast_path_v1.2.0"
                )

            # 5. Mặc định: Trích xuất trích đoạn sạch từ nội dung thư gốc
            clean_lines = [line.strip() for line in full_content.splitlines() if line.strip() and not line.startswith(">")]
            first_line = clean_lines[0] if clean_lines else subject
            preview = (first_line[:117] + "...") if len(first_line) > 120 else first_line

            return TicketSummary(
                category="other",
                priority="normal",
                goal=subject,
                summary_vi=f"🎯 Mục đích: {subject}\n📩 Nội dung: {preview}",
                assigned_name="Hung Nguyen",
                assigned_email="hung.nguyenmanh@dtt.vn",
                model_name="deterministic_fast_path",
                prompt_version="fast_path_v1.2.0"
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

        # FAST-PATH AN TOÀN TUYỆT ĐỐI VỚI 'candidate_action'
        if not parsed_data:
            logger.warning("🚀 [FAST-PATH] Kích hoạt trích xuất sự thật tất định không qua Gemini!")
            fast_assessment = IntentAssessment(
                outcome="candidate_action",
                model_name="deterministic_fast_path",
                prompt_version="fast_path_v1.2.0",
                intents=[],
                entities={},
                extracted_entities=[],
                missing_requirements=[],
                warnings=["Gemini Quota 429 - Hệ thống tự động dùng bộ trích xuất tất định."],
                raw_evidence_quotes=[]
            )
            fast_assessment = augment_assessment_with_request_facts(
                fast_assessment, raw_content, source_revision_id, sender_email=sender_email
            )
            return evidence_verifier.verify_intent_assessment(
                assessment=fast_assessment,
                raw_content=raw_content,
                source_revision_id=source_revision_id
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