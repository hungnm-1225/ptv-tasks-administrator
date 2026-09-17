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
        # 1. BỘ LỌC ROBOT / NEWSLETTER RÁC
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

        # 2. PHÂN TÍCH EMAIL THREAD (BÓNG Ở CHÂN AI?)
        parsed_thread = thread_service.parse_thread(raw_content, sender_email)

        # TRƯỜNG HỢP 1: Kỹ sư vừa gửi mail hỏi thêm ➔ Trạng thái Chờ Khách Phản Hồi!
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

        # TRƯỜNG HỢP 2: Khách hàng gửi yêu cầu / bổ sung ➔ Gửi Compact Context cho AI
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

        # 1. BỘ LỌC EMAIL TỰ ĐỘNG / ROBOT
        if any(sender_clean.startswith(prefix) for prefix in AUTOMATED_SENDER_PREFIXES):
            return IntentAssessment(
                outcome="no_action",
                model_name="fast_path_system_filter",
                prompt_version="fast_path_v1.0",
                intents=[], entities={}, extracted_entities=[], missing_requirements=[],
                warnings=["Email thông báo tự động từ hệ thống. Chuyển sang NO_ACTION."],
                raw_evidence_quotes=[]
            )

        # 2. PHÂN TÍCH VÒNG ĐỜI HỘI THOẠI (EMAIL THREAD)
        parsed_thread = thread_service.parse_thread(raw_content, sender_email)

        # Nếu tin nhắn mới nhất do Kỹ sư nội bộ gửi hỏi thông tin -> Chờ khách hàng
        if parsed_thread.lifecycle_state == "WAITING_CUSTOMER_INFO":
            return IntentAssessment(
                outcome="no_action",
                model_name="thread_state_machine",
                prompt_version="v2.0",
                intents=[], entities={}, extracted_entities=[], missing_requirements=[],
                warnings=["Email mới nhất do kỹ sư nội bộ phản hồi. Hệ thống tạm dừng chờ khách hàng cung cấp thêm thông tin."],
                raw_evidence_quotes=[]
            )

        # Chuẩn bị nội dung gửi cho mô hình AI
        full_content = parsed_thread.compact_prompt_context if parsed_thread.is_thread else (raw_content[:20000] if raw_content else "(Trống)")
        excel_info_str = json.dumps(excel_summary, ensure_ascii=False, indent=2) if excel_summary else "Không có file Excel đính kèm."
        summary_guide = f"\n[BẢN TÓM TẮT TIẾN TRÌNH & ĐỀ XUẤT TỪ HỆ THỐNG]:\n{ai_summary}\n" if ai_summary else ""

        prompt = (
            f"Bạn là chuyên gia phân tích và trích xuất sự thật vận hành cho hệ sinh thái Pythaverse.\n"
            f"Tiêu đề: {subject}\n"
            f"Nguồn: {source}\n"
            f"{summary_guide}"
            f"Nội dung email chi tiết/lượt hội thoại mới nhất:\n{full_content}\n\n"
            "NGUYÊN TẮC BÓC TÁCH NGHIÊM NGẶT (EVIDENCE-BASED & ZERO-MOCKUP):\n"
            "1. Bám sát [BẢN TÓM TẮT TIẾN TRÌNH] và lượt phản hồi mới nhất để xác định việc CÒN TỒN ĐỌNG CẦN LÀM HIỆN TẠI.\n"
            "2. Nếu tài khoản đã được tạo hoặc đã gửi thông tin đăng nhập trong quá khứ, TUYỆT ĐỐI KHÔNG trích xuất intent 'create_accounts'.\n"
            "3. Nếu có yêu cầu sửa/đính chính thông tin trường học hoặc người dùng, trích xuất intent 'update_user_profile'.\n"
            "4. Mọi bằng chứng (quote) BẮT BUỘC PHẢI LÀ ĐOẠN TRÍCH NGUYÊN VĂN từng ký tự có mặt trong [Nội dung email chi tiết/lượt hội thoại mới nhất] ở trên. Tuyệt đối không tự bịa câu trích dẫn!\n"
            "5. ĐỊNH DẠNG JSON ĐẦU RA BẮT BUỘC:\n"
            "   - 'outcome': CHỈ ĐƯỢC CHỌN 1 TRONG 3 GIÁ TRỊ: 'candidate_action', 'needs_information', hoặc 'no_action'.\n"
            "   - 'intents': Danh sách các ý định [{type, confidence, evidence: [{quote}]}]\n"
            "   - 'entities': {school_name, courses, users}\n"
            "   - 'missing_requirements': Danh sách các thông tin còn thiếu nếu chưa đủ căn cứ.\n"
        )

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_facts)

        # 3. NGUYÊN TẮC FAIL-CLOSED: NẾU AI LỖI HOẶC KHÔNG PHÂN TÍCH ĐƯỢC -> BÁO RÕ LỖI, CẤM BỊA DATA!
        if not parsed_data or not isinstance(parsed_data, dict):
            logger.warning("⚠️ [Gemini Facts] Không thể phân tích cấu trúc dữ liệu từ AI. Kích hoạt Fail-Closed an toàn.")
            return IntentAssessment(
                outcome="needs_information",
                model_name=used_model or "ai_extraction_failed",
                prompt_version="error_fallback",
                intents=[],
                entities={},
                extracted_entities=[],
                missing_requirements=[{
                    "field": "ai_analysis",
                    "message": "Không thể bóc tách sự thật vận hành từ nội dung yêu cầu do sự cố kết nối AI hoặc hạn ngạch API. Quản trị viên cần kiểm tra thủ công."
                }],
                warnings=["Hệ thống kích hoạt van an toàn: Không thể tự động phân tích yêu cầu này."],
                raw_evidence_quotes=[]
            )

        # 4. CHUẨN HÓA VÀ BẢO VỆ SCHEMA PYDANTIC CHO OUTCOME
        raw_outcome_str = str(parsed_data.get("outcome", "candidate_action")).lower().strip()
        if any(k in raw_outcome_str for k in ["no_action", "không cần", "thông báo"]):
            final_outcome = "no_action"
        elif any(k in raw_outcome_str for k in ["needs_information", "needs_info", "thiếu", "bổ sung"]):
            final_outcome = "needs_information"
        else:
            final_outcome = "candidate_action"

        raw_intents = parsed_data.get("intents", [])
        if not isinstance(raw_intents, list):
            raw_intents = []

        structured_intents: List[ExtractedIntent] = []
        raw_evidence_quotes: List[str] = []

        for item in raw_intents:
            if not isinstance(item, dict):
                continue
            ev_list = []
            for ev in item.get("evidence", []):
                quote_str = ev.get("quote", "").strip() if isinstance(ev, dict) else str(ev).strip()
                start_off = ev.get("start_offset", -1) if isinstance(ev, dict) else -1
                end_off = ev.get("end_offset", -1) if isinstance(ev, dict) else -1
                src_kind = ev.get("source_kind", "ticket_body") if isinstance(ev, dict) else "ticket_body"

                if quote_str:
                    ev_list.append(EvidenceSpan(
                        source_revision_id=source_revision_id,
                        quote=quote_str,
                        start_offset=start_off,
                        end_offset=end_off,
                        source_kind=src_kind
                    ))
                    raw_evidence_quotes.append(quote_str)

            structured_intents.append(ExtractedIntent(
                type=item.get("type", "unknown"),
                confidence=float(item.get("confidence", 0.7)),
                evidence=ev_list,
                required_entities=item.get("required_entities", [])
            ))

        # Kiểm tra xem tóm tắt có báo việc tạo tài khoản đã xong chưa
        accounts_done = bool(ai_summary and any(k in ai_summary.lower() for k in [
            "đã gửi thông tin tài khoản", "đã cung cấp thông tin tài khoản", "đã tạo tài khoản", "credentials sent"
        ]))

        if accounts_done:
            structured_intents = [i for i in structured_intents if i.type != "create_accounts"]
            raw_evidence_quotes = [q for q in raw_evidence_quotes if "creation of accounts" not in q.lower()]

        raw_assessment = IntentAssessment(
            outcome=final_outcome,
            model_name=used_model,
            prompt_version="v2.2_zero_mockup",
            intents=structured_intents,
            entities=parsed_data.get("entities", {}) if isinstance(parsed_data.get("entities"), dict) else {},
            extracted_entities=[],
            missing_requirements=parsed_data.get("missing_requirements", []) if isinstance(parsed_data.get("missing_requirements"), list) else [],
            warnings=parsed_data.get("warnings", []) if isinstance(parsed_data.get("warnings"), list) else [],
            raw_evidence_quotes=raw_evidence_quotes
        )

        # Bổ trợ fact tất định từ nội dung gốc
        raw_assessment = augment_assessment_with_request_facts(
            raw_assessment, raw_content, source_revision_id, sender_email=sender_email
        )

        if accounts_done:
            raw_assessment.intents = [i for i in raw_assessment.intents if i.type != "create_accounts"]
            raw_assessment.raw_evidence_quotes = [q for q in raw_assessment.raw_evidence_quotes if "creation of accounts" not in q.lower()]

        # Xác thực từng ký tự bằng chứng qua EvidenceVerifier
        return evidence_verifier.verify_intent_assessment(
            assessment=raw_assessment,
            raw_content=raw_content,
            source_revision_id=source_revision_id
        )

gemini_engine = AIEngine()