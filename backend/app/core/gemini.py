# backend/app/core/gemini.py
"""
Dual-Key Gemini Cognition Engine (Master Enterprise v3.1 - Zero-Mockup & Evidence Grounded)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Key 1: Tóm tắt mềm Inbox (summarize_ticket).
- Key 2: Bóc tách sự thật vận hành có định vị offset (extract_operational_facts).
- Tích hợp chặt chẽ với email_thread_service để phân tích tiến trình xử lý.
- Loại bỏ hoàn toàn fake fallback data, tuân thủ nguyên tắc Zero-Mockup & Fail-Closed.
"""
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
from app.services.email_thread_service import thread_service

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
    "billing@", "updates@",
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
                        request_options={"timeout": 20.0}
                    )
                    if response and response.text:
                        raw_text = response.text.strip()
                        clean_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.IGNORECASE)
                        clean_text = re.sub(r"\s*```$", "", clean_text).strip()
                        parsed = json.loads(clean_text)
                        
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
            return TicketSummary(
                category="other",
                priority="low",
                goal=f"Thông báo tự động: {subject[:60]}",
                summary_vi=f"📨 Bản tin / Thông báo tự động từ [{sender_clean}]: {subject}. Không yêu cầu thao tác kỹ thuật.",
                assigned_name="Hệ Thống",
                assigned_email=None,
                model_name="fast_path_system_filter",
                prompt_version="fast_path_v1.0"
            )

        parsed_thread = thread_service.parse_thread(raw_content, sender_email)

        if parsed_thread.lifecycle_state == "WAITING_CUSTOMER_INFO":
            logger.info(f"⏳ [THREAD WAITING] Tin nhắn mới nhất từ kỹ sư nội bộ ({sender_clean}). Đang chờ khách bổ sung thông tin.")
            return TicketSummary(
                category="other",
                priority="normal",
                goal=f"Chờ khách phản hồi: {subject}",
                summary_vi=f"ℹ️ Kỹ sư nội bộ ({sender_clean}) đã phản hồi yêu cầu thêm thông tin. Hiện đang chờ phản hồi từ phía khách hàng.",
                assigned_name="Kỹ Sư Phụ Trách",
                assigned_email=sender_clean,
                model_name="thread_state_machine",
                prompt_version="v2.0"
            )

        prompt_content = parsed_thread.compact_prompt_context if parsed_thread.is_thread else (raw_content[:20000] if raw_content else "(Trống)")

        if self.summary_prompt_tpl:
            prompt = self.summary_prompt_tpl.format(source=source, subject=subject, full_content=prompt_content)
        else:
            prompt = f"Tóm tắt: {subject}\n{prompt_content}"

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_summary)

        if not parsed_data:
            return TicketSummary(
                category="other",
                priority="normal",
                goal=subject or "Không thể phân tích",
                summary_vi="⚠️ Lỗi: Không thể phân tích nội dung do sự cố kết nối AI hoặc hết hạn ngạch API (Quota 429).",
                assigned_name="Chưa phân công",
                assigned_email=None,
                model_name="ai_analysis_failed",
                prompt_version="error_fallback"
            )

        raw_cat = str(parsed_data.get("category", "other")).lower().strip()
        final_cat = raw_cat if raw_cat in VALID_CATEGORIES else "other"
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
            prompt_version="v2.0"
        )

    def extract_operational_facts(
        self,
        subject: str,
        raw_content: str,
        source: str,
        excel_summary: Optional[Dict[str, Any]] = None,
        source_revision_id: Optional[str] = None,
        sender_email: Optional[str] = None,
        ai_summary: Optional[str] = None
    ) -> VerifiedIntentAssessment:
        sender_clean = (sender_email or "").lower().strip()

        # 1. Lọc email hệ thống tự động
        if any(sender_clean.startswith(prefix) for prefix in AUTOMATED_SENDER_PREFIXES):
            return IntentAssessment(
                outcome="no_action",
                model_name="fast_path_system_filter",
                prompt_version="v4.0_structured",
                intents=[], entities={}, extracted_entities=[], missing_requirements=[],
                warnings=["Email thông báo tự động từ hệ thống."],
                raw_evidence_quotes=[]
            )

        # 2. Phân tích thread
        parsed_thread = thread_service.parse_thread(raw_content, sender_email)
        if parsed_thread.lifecycle_state == "WAITING_CUSTOMER_INFO":
            return IntentAssessment(
                outcome="no_action",
                model_name="thread_state_machine",
                prompt_version="v4.0_structured",
                intents=[], entities={}, extracted_entities=[], missing_requirements=[],
                warnings=["Email mới nhất do kỹ sư nội bộ phản hồi. Tạm dừng chờ khách hàng."],
                raw_evidence_quotes=[]
            )

        full_content = parsed_thread.compact_prompt_context if parsed_thread.is_thread else (raw_content[:20000] if raw_content else "(Trống)")

        # 🎯 PROMPT MỚI: BẮT GEMINI LÀM ĐÚNG VAI TRÒ SUY LUẬN NGỮ NGHĨA (KHÔNG DÙNG REGEX ĐOÁN MÒ NỮA)
        prompt = f"""Bạn là Senior Automation Architect cho Pythaverse. Hãy đọc toàn bộ ngữ cảnh và lịch sử hội thoại dưới đây để trích xuất sự thật vận hành chính xác:

TIÊU ĐỀ: {subject}
NGƯỜI GỬI EMAIL: {sender_email}
TIẾN TRÌNH & NỘI DUNG HỘI THOẠI:
{full_content}

HÃY SUY LUẬN VÀ TRẢ VỀ JSON CÓ CẤU TRÚC CHÍNH XÁC THEO SCHEMA SAU:
{{
  "outcome": "candidate_action", // "candidate_action" nếu có việc cần làm, "needs_information" nếu thiếu dữ liệu, "no_action" nếu chỉ là trao đổi
  "target_school_name": "Tên trường học chính xác mà khách hàng yêu cầu áp dụng (nếu có đính chính, lấy tên trường mới nhất, gọt sạch chữ thừa như School Name:, chỉ để lại tên trường chuẩn)",
  "beneficiary_users": [
    // Danh sách những người THẬT SỰ được thụ hưởng (được tạo tk, sửa trường, hoặc vào lớp).
    // NẾU NGƯỜI GỬI ({sender_email}) CHỈ LÀ NGƯỜI ĐẠI DIỆN GỬI THAY CHO DANH SÁCH GIÁO VIÊN/HỌC SINH THÌ TUYỆT ĐỐI KHÔNG ĐƯA NGƯỜI GỬI VÀO MẢNG NÀY!
    {{ "name": "Họ và tên", "email": "email", "role": "teacher hoặc student" }}
  ],
  "already_completed_actions": [
    // Những việc đã được nhân viên hoàn thành ở các lượt trước (ví dụ nếu nhân viên đã gửi login/credentials thì điền "create_accounts")
  ],
  "actionable_intents": [
    // Những việc CÒN TỒN ĐỌNG CẦN LÀM BÂY GIỜ (chọn trong: "update_user_profile", "course_access", "create_accounts", "reset_password")
    {{
      "type": "tên intent",
      "confidence": 0.95,
      "evidence_quote": "Trích dẫn nguyên văn câu tiếng Anh/Việt trong hội thoại yêu cầu việc này"
    }}
  ],
  "courses": ["Tên các khóa học được yêu cầu (ví dụ SWRP 11)"]
}}
"""

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_facts)

        if not parsed_data or not isinstance(parsed_data, dict):
            logger.warning("⚠️ Không thể phân tích cấu trúc từ AI.")
            return IntentAssessment(
                outcome="needs_information",
                model_name=used_model or "ai_extraction_failed",
                prompt_version="v4.0_structured",
                intents=[], entities={}, extracted_entities=[],
                missing_requirements=[{"field": "ai_analysis", "message": "Không thể phân tích yêu cầu từ AI."}],
                warnings=["Hệ thống kích hoạt van an toàn."],
                raw_evidence_quotes=[]
            )

        # 3. Chuẩn hóa Outcome
        raw_outcome = str(parsed_data.get("outcome", "candidate_action")).lower().strip()
        final_outcome = "no_action" if "no_action" in raw_outcome else ("needs_information" if "needs_info" in raw_outcome else "candidate_action")

        # 4. Trích xuất Actionable Intents (Đã được Gemini lọc bỏ việc cũ)
        structured_intents: List[ExtractedIntent] = []
        raw_evidence_quotes: List[str] = []

        for item in parsed_data.get("actionable_intents", []):
            if not isinstance(item, dict):
                continue
            quote_str = str(item.get("evidence_quote") or "").strip()
            ev_list = []
            if quote_str:
                ev_list.append(EvidenceSpan(
                    source_revision_id=source_revision_id,
                    quote=quote_str,
                    start_offset=-1,
                    end_offset=-1,
                    source_kind="ticket_body"
                ))
                raw_evidence_quotes.append(quote_str)

            structured_intents.append(ExtractedIntent(
                type=item.get("type", "unknown"),
                confidence=float(item.get("confidence", 0.9)),
                evidence=ev_list
            ))

        # 🎯 ENTITIES ĐƯỢC GEMINI TỰ ĐỘNG LÀM SẠCH VÀ PHÂN LOẠI CHUẨN XÁC
        clean_school = str(parsed_data.get("target_school_name") or "").strip(" '\",.:")
        clean_users = parsed_data.get("beneficiary_users", [])
        clean_courses = parsed_data.get("courses", [])

        entities_payload = {
            "school_name": clean_school if clean_school and clean_school.lower() != "none" else None,
            "users": clean_users if isinstance(clean_users, list) else [],
            "courses": clean_courses if isinstance(clean_courses, list) else [],
            "already_completed_actions": parsed_data.get("already_completed_actions", [])
        }

        raw_assessment = IntentAssessment(
            outcome=final_outcome,
            model_name=used_model,
            prompt_version="v4.0_ai_first",
            intents=structured_intents,
            entities=entities_payload,
            extracted_entities=[],
            missing_requirements=[],
            warnings=[],
            raw_evidence_quotes=raw_evidence_quotes
        )

        return evidence_verifier.verify_intent_assessment(
            assessment=raw_assessment,
            raw_content=raw_content,
            source_revision_id=source_revision_id
        )

gemini_engine = AIEngine()