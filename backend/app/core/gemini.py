# backend/app/core/gemini.py
"""
Dual-Key Gemini Cognition Engine (Master Enterprise v3.2 - Catalog Grounded & Full Extraction)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Key 1: Tóm tắt mềm Inbox (summarize_ticket).
- Key 2: Bóc tách sự thật vận hành (extract_operational_facts) nạp đầy đủ:
  + Dữ liệu file đính kèm bóc tách (Universal Primitives).
  + Dynamic LMS Course Catalog (tự động map mã tắt SWRP 11 -> Course ID + Git Repos).
- Tích hợp email_thread_service nhận diện vòng đời trao đổi.
- Tuân thủ nguyên tắc Zero-Mockup & Evidence Grounded.
"""

import os
import re
import json
import logging
import time
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

import google.generativeai as genai
from app.models.intent import (
    IntentAssessment, 
    VerifiedIntentAssessment,
    TicketSummary, 
    ExtractedIntent, 
    EvidenceSpan
)
from app.services.evidence_verifier import evidence_verifier
from app.services.email_thread_service import thread_service

try:
    from app.core.config import settings
except Exception:
    settings = None

logger = logging.getLogger(__name__)

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
                    logger.info("📄 Đã nạp thành công intent_extraction_v1.txt")
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
                        request_options={"timeout": 60.0}  # << TĂNG LÊN 60.0s CHỐNG LỖI 504 DEADLINE
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
                    is_timeout = any(term in err_str for term in ["504", "deadline", "timeout", "timed out"])
                    
                    if is_rate_limit:
                        logger.warning(f"⚠️ Model [{model_name}] với Key #{key_idx + 1} dính Quota 429. Đang chuyển sang dự phòng...")
                        _MODEL_COOLDOWN[model_name] = time.time() + 300
                        if len(keys_to_try) > 1 and key_idx == 0:
                            continue
                        else:
                            break
                    elif is_timeout:
                        logger.warning(f"⏳ Model [{model_name}] bị Timeout 504 (>60s). Đang chuyển ngay sang model kế tiếp...")
                        break  # Chuyển sang model tiếp theo trong danh sách GEMINI_MODELS
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
                prompt_version="v4.5_catalog_grounded",
                intents=[], entities={}, extracted_entities=[], missing_requirements=[],
                warnings=["Email thông báo tự động từ hệ thống."],
                raw_evidence_quotes=[]
            )

        # 2. Phân tích tiến trình trao đổi (Thread)
        parsed_thread = thread_service.parse_thread(raw_content, sender_email)
        if parsed_thread.lifecycle_state == "WAITING_CUSTOMER_INFO":
            return IntentAssessment(
                outcome="no_action",
                model_name="thread_state_machine",
                prompt_version="v4.5_catalog_grounded",
                intents=[], entities={}, extracted_entities=[], missing_requirements=[],
                warnings=["Email mới nhất do kỹ sư nội bộ phản hồi. Tạm dừng chờ khách hàng bổ sung."],
                raw_evidence_quotes=[]
            )

        full_content = parsed_thread.compact_prompt_context if parsed_thread.is_thread else (raw_content[:20000] if raw_content else "(Trống)")

        # =========================================================================
        # 3. ĐỊNH DẠNG DỮ LIỆU ĐÍNH KÈM & CATALOG CONTEXT
        # =========================================================================
        excel_data = excel_summary or {}
        catalog_list = excel_data.get("catalog_reference", [])
        
        # Định dạng danh mục khóa học thành bảng tra cứu gọn gàng cho AI
        if catalog_list:
            catalog_lines = []
            for item in catalog_list[:50]:
                cid = item.get("id")
                code = item.get("code") or "N/A"
                name = item.get("name") or "N/A"
                repos = item.get("git_repos") or []
                repo_str = json.dumps(repos, ensure_ascii=False) if repos else "Chưa có repo"
                catalog_lines.append(f"- Course ID: {cid} | Mã tắt: {code} | Tên: {name} | Repos: {repo_str}")
            catalog_context_str = "\n".join(catalog_lines)
        else:
            catalog_context_str = "(Không có danh mục khóa học LMS trong bộ nhớ)"

        # Định dạng dữ liệu đã bóc tách từ file / text
        if excel_data and any(k != "catalog_reference" for k in excel_data.keys()):
            slim_excel = {
                "is_cof": excel_data.get("is_cof", False),
                "filename": excel_data.get("filename"),
                "school_detected": excel_data.get("school_detected"),
                "courses_detected": excel_data.get("courses_detected", []),
                "classes_detected": excel_data.get("classes_detected", []),
                "suggested_roles": excel_data.get("suggested_roles", []),
                "repo_urls": excel_data.get("repo_urls", []),
                "total_identifiers": excel_data.get("total_identifiers", 0),
                "identifiers_sample": excel_data.get("identifiers", [])[:15],  # Chỉ lấy 15 đại diện
                "total_accounts": excel_data.get("total_accounts", 0),
                "sample_accounts": excel_data.get("account_profiles", [])[:5], # Chỉ lấy 5 mẫu đại diện
                "notice": excel_data.get("notice")
            }
            excel_info_str = json.dumps(slim_excel, ensure_ascii=False, indent=2)
        else:
            excel_info_str = "(Không có tệp đính kèm hoặc dữ liệu bóc tách thô)"


        # =========================================================================
        # 4. KHỞI TẠO PROMPT TỪ INTENT_EXTRACTION_V1.TXT
        # =========================================================================
        if self.intent_prompt_tpl:
            prompt = self.intent_prompt_tpl.format(
                subject=subject,
                sender_email=sender_email or "Không rõ",
                catalog_context_str=catalog_context_str,
                excel_info_str=excel_info_str,
                full_content=full_content
            )
        else:
            # Fallback nếu file prompt bị lỗi đọc
            prompt = f"""Bạn là Senior Automation Architect. Bóc tách sự thật vận hành:
Tiêu đề: {subject}
Người gửi: {sender_email}
Catalog: {catalog_context_str}
File đính kèm: {excel_info_str}
Nội dung: {full_content}
Trả về JSON chuẩn xác có actionability_analysis, outcome, intents, entities, missing_requirements."""

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_facts)

        if not parsed_data or not isinstance(parsed_data, dict):
            logger.warning("⚠️ Không thể phân tích cấu trúc facts từ Gemini.")
            return IntentAssessment(
                outcome="needs_information",
                model_name=used_model or "ai_extraction_failed",
                prompt_version="v4.5_catalog_grounded",
                intents=[], entities={}, extracted_entities=[],
                missing_requirements=[{"field": "ai_analysis", "message": "Không thể phân tích yêu cầu từ AI (Quota 429 hoặc lỗi kết nối)."}],
                warnings=["Hệ thống kích hoạt van an toàn."],
                raw_evidence_quotes=[]
            )

        # 5. Chuẩn hóa Outcome
        raw_outcome = str(parsed_data.get("outcome", "candidate_action")).lower().strip()
        final_outcome = "no_action" if "no_action" in raw_outcome else ("needs_information" if "needs_info" in raw_outcome else "candidate_action")

        # 6. Trích xuất Structured Intents & Bằng chứng nguyên văn
        structured_intents: List[ExtractedIntent] = []
        raw_evidence_quotes: List[str] = []

        intents_input = parsed_data.get("intents") or []
        for item in intents_input:
            if not isinstance(item, dict):
                continue
            itype = str(item.get("type") or "").strip()
            if not itype:
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
                type=itype,
                confidence=float(item.get("confidence", 0.95)),
                evidence=ev_list
            ))

        # 7. Chuẩn hóa Entities
        entities_raw = parsed_data.get("entities") or {}
        clean_school = entities_raw.get("school_name") or excel_data.get("school_detected")
        clean_users = entities_raw.get("users") or excel_data.get("account_profiles") or []
        clean_courses = entities_raw.get("courses") or excel_data.get("courses_detected") or []
        clean_course_ids = entities_raw.get("matched_course_ids") or []
        clean_repos = entities_raw.get("repositories") or excel_data.get("repo_urls") or []
        clean_identifiers = entities_raw.get("identifiers") or excel_data.get("identifiers") or []
        git_role = entities_raw.get("git_role")
        target_email = entities_raw.get("target_email")

        entities_payload = {
            "school_name": clean_school if clean_school and str(clean_school).lower() != "none" else None,
            "users": clean_users if isinstance(clean_users, list) else [],
            "courses": clean_courses if isinstance(clean_courses, list) else [],
            "matched_course_ids": clean_course_ids if isinstance(clean_course_ids, list) else [],
            "repositories": clean_repos if isinstance(clean_repos, list) else [],
            "git_role": git_role,
            "target_email": target_email,
            "identifiers": clean_identifiers if isinstance(clean_identifiers, list) else [],
            "already_completed_actions": parsed_data.get("already_completed_actions", [])
        }

        raw_assessment = IntentAssessment(
            outcome=final_outcome,
            model_name=used_model,
            prompt_version="v4.5_catalog_grounded",
            intents=structured_intents,
            entities=entities_payload,
            extracted_entities=[],
            missing_requirements=parsed_data.get("missing_requirements") or [],
            warnings=parsed_data.get("warnings") or [],
            raw_evidence_quotes=raw_evidence_quotes
        )

        return evidence_verifier.verify_intent_assessment(
            assessment=raw_assessment,
            raw_content=raw_content,
            source_revision_id=source_revision_id
        )

gemini_engine = AIEngine()