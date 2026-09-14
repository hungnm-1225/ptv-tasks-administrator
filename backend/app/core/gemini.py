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

# Danh sách model Gemini sắp xếp theo độ sẵn sàng cao nhất
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
    """
    Bộ não AI Phân tầng Kép (Dual-Path Cognition Engine) siêu tốc:
    - KEY 1 (GEMINI_API_KEY): Summary Lane
    - KEY 2 (GEMINI_API_KEY2): Fact Extraction Lane
    - Fast-Fail 5s: Không để SDK Google treo delay 35s
    - Instant Fast-Path Fallback: Tự động dùng request_fact_normalizer khi Gemini cạn quota
    """

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
        """Nạp prompt template từ thư mục brain/prompts/."""
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
        """
        Gọi Gemini với cơ chế Fast-Fail và Circuit Breaker:
        - Timeout cứng 5s mỗi lần gọi (chặn đứng việc SDK retry ngầm 35s)
        - Nếu cả 2 key đều dính 429 ở 2 model đầu, dừng lặp ngay lập tức để chuyển Fast-Path
        """
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
            logger.error("❌ Không có Gemini API Key hợp lệ!")
            return None, None

        consecutive_quota_errors = 0

        for model_name in GEMINI_MODELS:
            # Nếu đã gặp 2 lần 429 liên tiếp trên các keys/models, chứng tỏ toàn bộ project cạn quota -> thoát ngay
            if consecutive_quota_errors >= 2:
                logger.warning("⚡ [CIRCUIT BREAKER] Quota Google Project đã cạn hoàn toàn! Thoát ngay sang Fast-Path.")
                break

            for key_idx, active_key in enumerate(keys_to_try):
                try:
                    genai.configure(api_key=active_key)
                    model = genai.GenerativeModel(model_name)
                    
                    # Cài đặt timeout cứng 5.0 giây, không chờ đợi SDK retry
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
                            logger.warning(f"⚠️ Model [{model_name}] chạm limit với Key 1. Đổi ngay sang Key 2...")
                            continue
                        else:
                            logger.warning(f"⚠️ Model [{model_name}] dính 429 Quota Exceeded. Bỏ qua model này.")
                            break
                    else:
                        logger.warning(f"⚠️ Model [{model_name}] lỗi: {e}. Thử model tiếp theo...")
                        break

        logger.error("❌ Toàn bộ model Gemini đều bị từ chối hoặc hết quota.")
        return None, None

    def summarize_ticket(
        self,
        subject: str,
        raw_content: str,
        source: str
    ) -> TicketSummary:
        """Tạo bản tóm tắt hiển thị trên Unified Inbox."""
        full_content = raw_content[:20000] if raw_content else "(Trống)"

        if self.summary_prompt_tpl:
            prompt = self.summary_prompt_tpl.format(
                source=source,
                subject=subject,
                full_content=full_content
            )
        else:
            prompt = f"Tóm tắt yêu cầu: Tiêu đề: {subject}, Nội dung: {full_content}. Trả về JSON: category, priority, goal, summary_vi."

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_summary)
        
        # Fast-Path Summary nếu Gemini cạn quota
        if not parsed_data:
            logger.info("ℹ️ Sử dụng Fast-Path Summary tất định từ tiêu đề yêu cầu.")
            return TicketSummary(
                category="account_creation",
                priority="urgent" if any(w in (subject + full_content).lower() for w in ["urgent", "gấp", "training"]) else "normal",
                goal=subject,
                summary_vi=f"🎯 Mục đích: {subject}\n📋 Tiếp nhận yêu cầu tạo tài khoản và phân quyền cho giáo viên/học sinh.",
                assigned_name="Hung Nguyen",
                assigned_email="hung.nguyenmanh@dtt.vn",
                model_name="deterministic_fast_path",
                prompt_version="fast_path_v1.2.0"
            )

        return TicketSummary(
            category=parsed_data.get("category", "other"),
            priority=parsed_data.get("priority", "normal"),
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
        source_revision_id: Optional[str] = None
    ) -> VerifiedIntentAssessment:
        """
        Trích xuất sự thật vận hành.
        CÓ SẴN CHẾ ĐỘ CỨU HỘ: Nếu Gemini hết quota, dùng ngay request_fact_normalizer!
        """
        full_content = raw_content[:20000] if raw_content else "(Trống)"
        excel_info_str = json.dumps(excel_summary, ensure_ascii=False, indent=2) if excel_summary else "Không có file Excel đính kèm hoặc chưa bóc tách."

        if self.intent_prompt_tpl:
            prompt = self.intent_prompt_tpl.format(
                excel_info_str=excel_info_str,
                full_content=f"Tiêu đề: {subject}\nNguồn: {source}\nNội dung chi tiết:\n{full_content}"
            )
        else:
            prompt = f"Trích xuất intent và bằng chứng cho yêu cầu: {subject}\n{full_content}"

        parsed_data, used_model = self._call_gemini_with_fallback(prompt, primary_key=self.api_key_facts)

        # PHAO CỨU SINH FAST-PATH: Khi Gemini chết, bóc tách tất định trực tiếp
        if not parsed_data:
            logger.warning("🚀 [FAST-PATH CỨU NGUY] Kích hoạt bóc tách sự thật tất định không cần qua Gemini!")
            fast_assessment = IntentAssessment(
                outcome="actionable",
                model_name="deterministic_fast_path",
                prompt_version="fast_path_v1.2.0",
                intents=[],
                entities={},
                extracted_entities=[],
                missing_requirements=[],
                warnings=["Gemini Quota Exceeded - Hệ thống tự động dùng bộ trích xuất tất định."],
                raw_evidence_quotes=[]
            )
            fast_assessment = augment_assessment_with_request_facts(
                fast_assessment, raw_content, source_revision_id
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
                if isinstance(ev, dict):
                    quote_str = ev.get("quote", "").strip()
                    start_off = ev.get("start_offset", -1)
                    end_off = ev.get("end_offset", -1)
                    src_kind = ev.get("source_kind", "ticket_body")
                    note = ev.get("context_note")
                else:
                    quote_str = str(ev).strip()
                    start_off = -1
                    end_off = -1
                    src_kind = "ticket_body"
                    note = None

                if quote_str:
                    ev_list.append(
                        EvidenceSpan(
                            source_revision_id=source_revision_id,
                            quote=quote_str,
                            start_offset=start_off,
                            end_offset=end_off,
                            source_kind=src_kind,
                            context_note=note
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

        outcome = parsed_data.get("outcome", "actionable")

        raw_assessment = IntentAssessment(
            outcome=outcome,
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
            raw_assessment, raw_content, source_revision_id
        )

        verified_assessment = evidence_verifier.verify_intent_assessment(
            assessment=raw_assessment,
            raw_content=raw_content,
            source_revision_id=source_revision_id
        )

        return verified_assessment


gemini_engine = AIEngine()


async def process_ticket_with_ai(ticket_id: str) -> Optional[Dict[str, Any]]:
    """
    Tiền xử lý toàn diện Ticket: Chạy DUY NHẤT 1 lượt Summary và 1 lượt Facts.
    Hoàn toàn không gọi lặp lại hay làm tắc nghẽn hệ thống.
    """
    try:
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            return None

        ticket = res.data[0]
        raw_content = ticket.get("raw_content") or ""
        subject = ticket.get("subject") or ""
        source = ticket.get("source") or "gmail"
        attachments = ticket.get("attachments") or []
        excel_summary = None

        # 1. Bóc tách nhanh file COF/Excel nếu có
        for att in attachments:
            fname = att.get("filename", "").lower()
            furl = att.get("url", "")
            if (fname.endswith(".xlsx") or fname.endswith(".xls")) and furl:
                try:
                    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp_file:
                        urllib.request.urlretrieve(furl, tmp_file.name)
                        temp_path = tmp_file.name

                    if COFExcelService.is_cof_file(temp_path):
                        parsed_cof = COFExcelService.parse_cof_file(temp_path)
                        excel_summary = {
                            "is_cof": True,
                            "filename": fname,
                            "school_name": parsed_cof.get("school_name"),
                            "courses": parsed_cof.get("courses", []),
                            "total_students": len(parsed_cof.get("students_all", [])),
                            "students_to_create": len(parsed_cof.get("students_to_create", [])),
                            "total_teachers": len(parsed_cof.get("teachers_all", [])),
                            "teachers_to_create": len(parsed_cof.get("teachers_to_create", [])),
                        }
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    break
                except Exception as ex_err:
                    logger.warning(f"⚠️ Lỗi bóc tách file Excel: {ex_err}")

        # 2. Cấp phát revision snapshot
        from app.workers.ticket_processor import create_or_get_ticket_revision
        revision_id, rev_no, _ = create_or_get_ticket_revision(
            ticket_id=ticket_id,
            raw_content=raw_content,
            attachments=attachments,
            source_updated_at=ticket.get("updated_at")
        )

        # 3. Chạy duy nhất 1 lần Summary và 1 lần Facts
        summary_res = gemini_engine.summarize_ticket(subject=subject, raw_content=raw_content, source=source)
        facts_res = gemini_engine.extract_operational_facts(
            subject=subject,
            raw_content=raw_content,
            source=source,
            excel_summary=excel_summary,
            source_revision_id=revision_id
        )

        # 4. Ghi nhận vào ticket_ai_assessments
        if revision_id:
            now_iso = datetime.now(timezone.utc).isoformat()
            try:
                supabase.table("ticket_ai_assessments").insert([
                    {
                        "ticket_revision_id": revision_id,
                        "assessment_kind": "summary",
                        "model_name": summary_res.model_name or "fast_path",
                        "prompt_version": summary_res.prompt_version,
                        "registry_version": "v1.2.0",
                        "structured_result": summary_res.model_dump(),
                        "status": "completed",
                        "created_at": now_iso
                    },
                    {
                        "ticket_revision_id": revision_id,
                        "assessment_kind": "fact_extraction",
                        "model_name": facts_res.model_name or "fast_path",
                        "prompt_version": facts_res.prompt_version,
                        "registry_version": "v1.2.0",
                        "structured_result": facts_res.model_dump(),
                        "status": "completed",
                        "created_at": now_iso
                    }
                ]).execute()
            except Exception as assess_err:
                logger.warning(f"⚠️ Không thể lưu ticket_ai_assessments: {assess_err}")

        # 5. Tự động tái lập kế hoạch workflow ngay lập tức
        from app.services.workflow_planner import workflow_planner_service
        await workflow_planner_service.plan_workflow_for_ticket(ticket_id=ticket_id, revision_id=revision_id)

        # 6. Cập nhật metadata cho inbox_tickets
        requested_ops = [{"intent": i.type, "confidence": i.confidence} for i in facts_res.intents if i.is_valid]
        existing_meta = ticket.get("metadata") or {}
        if not isinstance(existing_meta, dict):
            existing_meta = {}

        existing_meta["workflow_outcome"] = "ACTIONABLE" if facts_res.outcome in ["actionable", "ready"] else "NEEDS_INFORMATION"
        existing_meta["requested_operations"] = requested_ops
        existing_meta["evidence_quotes"] = facts_res.raw_evidence_quotes

        update_data = {
            "ai_summary": summary_res.summary_vi,
            "category": summary_res.category,
            "priority": summary_res.priority,
            "assigned_name": summary_res.assigned_name,
            "assigned_email": summary_res.assigned_email,
            "metadata": existing_meta
        }

        supabase.table("inbox_tickets").update(update_data).eq("id", ticket_id).execute()
        logger.info(f"✅ Hoàn tất xử lý ticket #{ticket_id} qua Fast-Path & Planner!")
        return {"status": "success", "ticket_id": ticket_id}

    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_with_ai: {e}", exc_info=True)
        return None