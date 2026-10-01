# backend/app/core/gemini.py
"""
Dual-Key Gemini Cognition Engine (Master Enterprise v4.0 - Multimodal Vision & Attachment Ledger)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Multimodal Vision: Hỗ trợ truyền mảng ảnh đính kèm (image_parts) để Gemini đọc trực tiếp ảnh chụp lỗi màn hình.
- Phân tách rạch ròi Sổ cái tệp đính kèm: Tệp mới (ACTIVE) vs Tệp cũ đã xử lý (ARCHIVED).
- Nạp Bản Tóm Tắt AI (ai_summary) vào vị trí chuyên biệt làm kim chỉ nam.
- Khử sạch lỗi KeyError khi format prompt bằng .replace() an toàn.
- Bọc an toàn Pydantic ValidationError cho missing_requirements.
- ZERO-MOCKUP INVARIANT: Thiếu dữ liệu thì báo needs_information, không tự bịa data.
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
        contents: Any,
        primary_key: Optional[str] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Hỗ trợ contents là chuỗi prompt HOẶC danh sách đa phương thức [prompt, image_part_1, ...]"""
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
                continue

            for key_idx, active_key in enumerate(keys_to_try):
                try:
                    genai.configure(api_key=active_key)
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(
                        contents,
                        generation_config={"response_mime_type": "application/json"},
                        request_options={"timeout": 90.0}
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
                        logger.warning(f"⚠️ Model [{model_name}] với Key #{key_idx + 1} dính Quota 429. Chuyển sang dự phòng...")
                        _MODEL_COOLDOWN[model_name] = time.time() + 300
                        if len(keys_to_try) > 1 and key_idx == 0:
                            continue
                        else:
                            break
                    elif is_timeout:
                        logger.warning(f"⏳ Model [{model_name}] bị Timeout (>60s). Chuyển sang model tiếp theo...")
                        break
                    else:
                        logger.warning(f"⚠️ Model [{model_name}] gặp lỗi khác: {str(e)[:80]}")
                        break

        return None, None

    # =========================================================================
    # 🌟 NÂNG CẤP KEY 1: HỒ SƠ GIÁM ĐỊNH CHI TIẾT (OPERATIONAL DOSSIER)
    # =========================================================================
    def summarize_ticket(
        self,
        subject: str,
        raw_content: str,
        source: str,
        sender_email: Optional[str] = None,
        excel_summary: Optional[Dict[str, Any]] = None
    ) -> TicketSummary:
        """
        Nâng cấp Tóm Tắt thành Hồ Sơ Giám Định Chi Tiết (Detailed Operational Dossier).
        Tích hợp thông tin bóc tách từ file đính kèm (COF, TOF, Bulk Accounts, Generic)
        để tóm tắt chính xác từng môn học, số lượng bản quyền, giáo viên và học sinh.
        Làm ngọn hải đăng chỉ dẫn cho AI Planner xây dựng luồng workflow tự động.
        """
        sender_clean = (sender_email or "").lower().strip()
        is_automated = any(sender_clean.startswith(prefix) or prefix in sender_clean for prefix in AUTOMATED_SENDER_PREFIXES)
        if is_automated:
            return TicketSummary(
                category="other",
                priority="low",
                goal=f"Thông báo tự động: {subject[:60]}",
                summary_vi=f"📨 Thông báo tự động từ hệ thống [{sender_clean}]: {subject}.",
                assigned_name="Hệ Thống",
                assigned_email=None,
                model_name="fast_path_system_filter",
                prompt_version="fast_path_v1.0"
            )

        parsed_thread = thread_service.parse_thread(raw_content, sender_email)
        prompt_content = parsed_thread.compact_prompt_context if parsed_thread.is_thread else (raw_content[:20000] if raw_content else "(Trống)")

        # Trích xuất bản tóm tắt file đính kèm (nếu có)
        excel_digest_section = ""
        if excel_summary and isinstance(excel_summary, dict):
            digest_str = excel_summary.get("executive_digest")
            if not digest_str:
                from app.services.excel.excel_digest_service import build_executive_excel_digest
                digest_str = build_executive_excel_digest(excel_summary)
            if digest_str and "(Không có" not in digest_str:
                excel_digest_section = f"\n[THÔNG TIN TỆP ĐÍNH KÈM / BẢNG TÍNH ĐÃ BÓC TÁCH]:\n{digest_str}\n"

        # XÂY DỰNG PROMPT GIÁM ĐỊNH CHI TIẾT
        detailed_dossier_instruction = (
            f"Bạn là Chuyên gia Giám định Vận hành Hệ thống Pythaverse Central Admin Hub (DTT Corporation).\n"
            f"Nhiệm vụ: Đọc kỹ yêu cầu và thông tin tệp đính kèm để lập HỒ SƠ GIÁM ĐỊNH CHI TIẾT mạch lạc, chuẩn xác, "
            f"làm CHỈ DẪN NGHIỆP VỤ ĐỊNH HƯỚNG cho AI Planner xây dựng luồng tự động hóa (Workflow DAG).\n\n"
            f"[THÔNG TIN YÊU CẦU]:\n"
            f"- Tiêu đề: {subject}\n"
            f"- Người gửi (Requester): {sender_clean}\n"
            f"- Kênh tiếp nhận: {source}\n"
            f"- Nội dung thư:\n{prompt_content}\n"
            f"{excel_digest_section}\n"
            f"YÊU CẦU PHÂN TÍCH:\n"
            f"1. Phân định rõ ràng: Người gửi ({sender_clean}) là ai? Họ đang tự yêu cầu cho họ hay gửi danh sách yêu cầu cho giáo viên/học sinh khác?\n"
            f"2. Nếu có tệp đính kèm (COF, TOF, Bulk Accounts): Nêu rõ số lượng bản quyền (licenses) của từng môn học (VD: 300 licenses SWRP 1, 100 licenses ASP Leanbot...), số lượng học sinh/giáo viên cần tạo tài khoản.\n"
            f"3. Xác định rõ các phân hệ cần can thiệp: Moodle LMS (ghi danh/hủy môn), Keycloak IDP (mở khóa/reset pass/kích hoạt), Pythaverse Git (cấp quyền/gỡ quyền repo), hoặc School Workspace (tạo tài khoản lô/duyệt đơn/hợp đồng).\n"
            f"4. Trả về DUY NHẤT một JSON hợp lệ gồm: category ('license'|'lms_enroll'|'account_keycloak'|'bug'|'other'), "
            f"priority ('urgent'|'high'|'normal'|'low'), goal (mục đích ngắn gọn 1 câu), và summary_vi.\n"
            f"Trong đó summary_vi PHẢI LÀ BẢN GIÁM ĐỊNH MẠCH LẠC, TRỰC QUAN với hệ thống ICON/EMOJI sinh động theo cấu trúc sau (xuống dòng rõ ràng giữa các mục):\n"
            f"'🎯 Mục đích: [Tuyên bố mục đích ngắn gọn 1-2 câu]\n"
            f"👤 Người gửi: {sender_clean}\n"
            f"👥 Đối tượng thụ hưởng: [Số lượng học sinh 🎓, giáo viên 👨‍🏫 hoặc email đích (đã loại trừ người gửi nếu gửi dùm)]\n"
            f"📁 Tệp đính kèm: [Tên tệp, loại phôi 📊 COF / 👥 Bulk Accounts / 📋 TOF / 📸 Ảnh sự cố (nêu nếu có)]\n"
            f"🏫 Đơn vị / Trường học: [Tên trường học và quốc gia nếu có]\n"
            f"📚 Khóa học & Bản quyền: [Tên môn học chuẩn mực, 🔑 số lượng licenses yêu cầu, thời hạn]\n"
            f"⚙️ Phân hệ tác động: [🎓 Moodle LMS / 🐙 Pythaverse Git / 🔐 Keycloak IDP / 🏢 School Workspace]\n"
            f"⚡ Đề xuất luồng tự động hóa: [Chắp nối các bước liên hoàn: Bước 1 ➔ Bước 2 ➔ Bước 3...]'"
        )

        parsed_data, used_model = self._call_gemini_with_fallback(detailed_dossier_instruction, primary_key=self.api_key_summary)

        if not parsed_data:
            return TicketSummary(
                category="other",
                priority="normal",
                goal=subject or "Không thể phân tích",
                summary_vi=f"⚠️ [Yêu cầu từ: {sender_clean}] Không thể phân tích nội dung do sự cố kết nối AI hoặc hết hạn ngạch API.",
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
            summary_vi=parsed_data.get("summary_vi", f"[Yêu cầu từ: {sender_clean}] {subject}"),
            assigned_name=parsed_data.get("assigned_name", "Hung Nguyen"),
            assigned_email=parsed_data.get("assigned_email", "hung.nguyenmanh@dtt.vn"),
            model_name=used_model,
            prompt_version="v5.0_detailed_dossier"
        )

    def extract_operational_facts(
        self,
        subject: str,
        raw_content: str,
        source: str,
        excel_summary: Optional[Dict[str, Any]] = None,
        source_revision_id: Optional[str] = None,
        sender_email: Optional[str] = None,
        ai_summary: Optional[str] = None,
        image_parts: Optional[List[Dict[str, Any]]] = None
    ) -> VerifiedIntentAssessment:
        sender_clean = (sender_email or "").lower().strip()

        if any(sender_clean.startswith(prefix) for prefix in AUTOMATED_SENDER_PREFIXES):
            return IntentAssessment(
                outcome="no_action",
                model_name="fast_path_system_filter",
                prompt_version="v4.7_provenance_ledger",
                intents=[], entities={}, extracted_entities=[], missing_requirements=[],
                warnings=["Email thông báo tự động từ hệ thống."],
                raw_evidence_quotes=[]
            )

        parsed_thread = thread_service.parse_thread(raw_content, sender_email)
        full_content = parsed_thread.compact_prompt_context if parsed_thread.is_thread else (raw_content[:20000] if raw_content else "(Trống)")

        # 1. Định dạng danh mục khóa học LMS & Bản lược kê tệp
        excel_data = excel_summary or {}
        provenance = excel_data.get("provenance_ledger") or {}
        active_files = provenance.get("active_new_files") or []

        # Lấy Bản Lược Kê Quản Trị từ Python đã nén sẵn
        excel_info_str = excel_data.get("executive_digest") or (
            f"Tệp đính kèm: {', '.join(active_files)}" if active_files else "(Không có tệp mới)"
        )

        # Lấy Top 6 Khóa Học Mồi từ Candidate Injection
        catalog_context_str = excel_data.get("catalog_context_str") or "(Không có môn mồi)"

        ai_summary_clean = str(ai_summary or "Chưa có bản tóm tắt").strip()

        if self.intent_prompt_tpl:
            prompt = self.intent_prompt_tpl
            replacements = {
                "{subject}": str(subject or ""),
                "{sender_email}": str(sender_email or "Không rõ"),
                "{catalog_context_str}": catalog_context_str,
                "{excel_info_str}": str(excel_info_str),
                "{ai_summary}": ai_summary_clean,
                "{full_content}": str(full_content or "")
            }
            for ph, val in replacements.items():
                prompt = prompt.replace(ph, val)
        else:
            prompt = (
                f"Bóc tách sự thật vận hành:\n"
                f"Tiêu đề: {subject}\n"
                f"Tóm tắt: {ai_summary_clean}\n"
                f"Nội dung: {full_content}"
            )

        # 4. GOM NỘI DUNG MULTIMODAL: TEXT PROMPT + CÁC ẢNH LỖI MỚI
        contents_payload: Any = prompt
        if image_parts and len(image_parts) > 0:
            contents_payload = [prompt]
            for img in image_parts:
                contents_payload.append({
                    "mime_type": img["mime_type"],
                    "data": img["data"]
                })
            logger.info(f"👁️ [Gemini Multimodal Vision] Đã truyền {len(image_parts)} ảnh chụp lỗi vào Gemini Vision!")

        parsed_data, used_model = self._call_gemini_with_fallback(contents_payload, primary_key=self.api_key_facts)

        if not parsed_data or not isinstance(parsed_data, dict):
            return IntentAssessment(
                outcome="needs_information",
                model_name=used_model or "ai_extraction_failed",
                prompt_version="v4.7_provenance_ledger",
                intents=[], entities={}, extracted_entities=[],
                missing_requirements=[{"field": "ai_analysis", "message": "Không thể phân tích yêu cầu từ AI."}],
                warnings=["Kích hoạt van an toàn."],
                raw_evidence_quotes=[]
            )

        raw_outcome = str(parsed_data.get("outcome", "candidate_action")).lower().strip()
        final_outcome = "no_action" if "no_action" in raw_outcome else ("needs_information" if "needs_info" in raw_outcome else "candidate_action")

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

        entities_raw = parsed_data.get("entities") or {}
        clean_school = entities_raw.get("school_name") or excel_data.get("school_detected")
        clean_users = entities_raw.get("users") or excel_data.get("account_profiles") or []
        clean_courses = entities_raw.get("courses") or excel_data.get("courses_detected") or []
        clean_repos = entities_raw.get("repositories") or excel_data.get("repo_urls") or []
        clean_identifiers = entities_raw.get("identifiers") or excel_data.get("identifiers") or []
        git_role = entities_raw.get("git_role")
        target_email = entities_raw.get("target_email")

        if target_email and target_email not in clean_identifiers:
            clean_identifiers.append(target_email)

        entities_payload = {
            "school_name": clean_school if clean_school and str(clean_school).lower() != "none" else None,
            "users": clean_users if isinstance(clean_users, list) else [],
            "courses": clean_courses if isinstance(clean_courses, list) else [],
            "repositories": clean_repos if isinstance(clean_repos, list) else [],
            "git_role": git_role,
            "target_email": target_email,
            "identifiers": clean_identifiers if isinstance(clean_identifiers, list) else [],
            "user_status_action": entities_raw.get("user_status_action", "enable"),
            "order_code": entities_raw.get("order_code"),
            "contract_code": entities_raw.get("contract_code"),
            "already_completed_actions": parsed_data.get("already_completed_actions", [])
        }

        # Bọc an toàn missing_requirements (ZERO-MOCKUP INVARIANT)
        raw_missing = parsed_data.get("missing_requirements") or []
        clean_missing: List[Dict[str, str]] = []
        if isinstance(raw_missing, list):
            for item in raw_missing:
                if isinstance(item, dict):
                    clean_missing.append({
                        "field": str(item.get("field") or "general"),
                        "message": str(item.get("message") or item.get("detail") or str(item))
                    })
                elif isinstance(item, str) and item.strip():
                    clean_missing.append({"field": "general", "message": item.strip()})
        elif isinstance(raw_missing, str) and raw_missing.strip():
            clean_missing.append({"field": "general", "message": raw_missing.strip()})

        # 🎯 TỰ ĐỘNG KHỞI TẠO TYPED_ENTITIES ĐỂ KHÔNG BAO GIỜ BỊ THIẾU
        from app.models.intent import TypedEntities
        typed_entities_obj = None
        try:
            typed_entities_obj = TypedEntities(
                school_name=entities_payload.get("school_name"),
                courses=entities_payload.get("courses") or [],
                repositories=entities_payload.get("repositories") or [],
                users=entities_payload.get("users") or [],
                identifiers=entities_payload.get("identifiers") or [],
                git_role=entities_payload.get("git_role") or "GUEST",
                order_code=entities_payload.get("order_code"),
                contract_code=entities_payload.get("contract_code")
            )
        except Exception as te_err:
            logger.warning(f"⚠️ Lỗi khởi tạo TypedEntities trong Gemini: {te_err}")

        raw_assessment = IntentAssessment(
            outcome=final_outcome,
            model_name=used_model,
            prompt_version="v5.0_provenance_ledger",
            intents=structured_intents,
            entities=entities_payload,
            typed_entities=typed_entities_obj, 
            extracted_entities=[],
            missing_requirements=clean_missing,
            warnings=parsed_data.get("warnings") or [],
            raw_evidence_quotes=raw_evidence_quotes
        )

        return evidence_verifier.verify_intent_assessment(
            assessment=raw_assessment,
            raw_content=raw_content,
            source_revision_id=source_revision_id
        )

gemini_engine = AIEngine()