# backend/app/core/gemini.py
import os
import re
import json
import hashlib
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

# Danh sách 10-model Gemini fallback tự động khi gặp quota/rate-limit
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
    Bộ não AI Phân tầng Kép (Dual-Path Cognition Engine) hỗ trợ Dual-API Key:
    - KEY 1 (GEMINI_API_KEY): Chuyên trách summarize_ticket() (System 1 - Inbox Summary).
    - KEY 2 (GEMINI_API_KEY2): Chuyên trách extract_operational_facts() (System 2 - Operational Facts).
    - Tự động hoán đổi chìa (Cross-Key Failover) khi một trong hai chìa chạm giới hạn 429/Quota.
    - EVIDENCE VERIFICATION: Kiểm định bằng chứng nguyên văn chống Ảo giác (Zero-Hallucination).
    """

    def __init__(self):
        # Nạp Chìa 1 (Mặc định cho Summary)
        self.api_key_summary = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or (getattr(settings, "GEMINI_API_KEY", None) if settings else None)
        )

        # Nạp Chìa 2 (Chuyên trách cho Facts Extraction chống cạn quota)
        self.api_key_facts = (
            os.getenv("GEMINI_API_KEY2")
            or (getattr(settings, "GEMINI_API_KEY2", None) if settings else None)
            or self.api_key_summary  # Nếu chưa cấu hình Key 2, dùng chung Key 1 an toàn
        )

        if self.api_key_summary:
            logger.info("🔑 [GEMINI KEY 1] Đã nạp thành công chìa khóa chính (Summary Lane)!")
        else:
            logger.error("❌ Không tìm thấy GEMINI_API_KEY trong môi trường!")

        if os.getenv("GEMINI_API_KEY2"):
            logger.info("⚡ [GEMINI KEY 2] Đã kích hoạt chìa khóa phụ độc lập (Fact Extraction Lane)!")
        else:
            logger.info("ℹ️ Chưa cấu hình GEMINI_API_KEY2 riêng biệt, hệ thống dùng chung GEMINI_API_KEY cho cả hai luồng.")

        self._load_prompts()

    def _load_prompts(self):
        """Nạp các prompt template có versioning từ thư mục brain/prompts/."""
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

            logger.info("📄 Đã nạp thành công các prompt templates (v1.1.0) cho Gemini Engine!")
        except Exception as e:
            logger.warning(f"⚠️ Lỗi nạp prompt templates: {e}")

    def _call_gemini_with_fallback(
        self,
        prompt: str,
        primary_key: Optional[str] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        Gọi Gemini AI với cơ chế Dual-Key + 10-Model Fallback:
        1. Ưu tiên primary_key chỉ định cho luồng đó.
        2. Nếu chạm trần 429/quota, thử ngay chìa khóa còn lại.
        3. Nếu cả 2 chìa đều lỗi trên model hiện tại, chuyển sang model kế tiếp trong danh sách 10 model.
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
            logger.error("❌ Không có Gemini API Key hợp lệ nào để thực hiện truy vấn!")
            return None, None

        for model_name in GEMINI_MODELS:
            for key_idx, active_key in enumerate(keys_to_try):
                try:
                    genai.configure(api_key=active_key)
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(
                        prompt,
                        generation_config={"response_mime_type": "application/json"}
                    )
                    if response and response.text:
                        parsed = json.loads(response.text)
                        return parsed, model_name
                except Exception as e:
                    err_str = str(e).lower()
                    is_rate_limit = any(term in err_str for term in ["429", "quota", "resource_exhausted", "limit"])
                    if is_rate_limit and len(keys_to_try) > 1 and key_idx == 0:
                        logger.warning(f"⚠️ Model [{model_name}] chạm giới hạn với Key 1, lập tức hoán đổi sang Key 2...")
                        continue
                    else:
                        logger.warning(f"⚠️ Model [{model_name}] gặp sự cố: {e}. Đang chuyển model fallback tiếp theo...")
                        break

        logger.error("❌ Toàn bộ 10 model Gemini trên cả hai API Key đều thất bại!")
        return None, None

    def summarize_ticket(
        self,
        subject: str,
        raw_content: str,
        source: str
    ) -> TicketSummary:
        """
        PATH 1: Tạo bản tóm tắt mềm hiển thị trên Unified Inbox (Sử dụng Key 1: api_key_summary).
        """
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
        if not parsed_data:
            return TicketSummary(
                category="other",
                priority="normal",
                goal=subject,
                summary_vi=f"🎯 Mục đích: {subject}\n🔄 Tiếp nhận yêu cầu tự động.",
                model_name=None,
                prompt_version="fallback"
            )

        return TicketSummary(
            category=parsed_data.get("category", "other"),
            priority=parsed_data.get("priority", "normal"),
            goal=parsed_data.get("goal", subject),
            summary_vi=parsed_data.get("summary_vi", f"Tóm tắt: {subject}"),
            assigned_name=parsed_data.get("assigned_name", "Hung Nguyen"),
            assigned_email=parsed_data.get("assigned_email", "hung.nguyenmanh@dtt.vn"),
            model_name=used_model,
            prompt_version="v1.1.0"
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
        PATH 2: Trích xuất sự thật vận hành có bằng chứng (Sử dụng Key 2: api_key_facts).
        TÍCH HỢP EVIDENCE VERIFIER: Đóng dấu source_revision_id vào 100% bằng chứng.
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
        if not parsed_data:
            return VerifiedIntentAssessment(
                outcome="needs_information",
                model_name=None,
                prompt_version="fallback",
                missing_requirements=[{"field": "ai_engine", "message": "Không thể kết nối với Gemini AI Engine."}],
                warnings=["Hệ thống AI không phản hồi."],
                is_fully_verified=False,
                source_revision_id=source_revision_id
            )

        raw_intents = parsed_data.get("intents", [])
        structured_intents: List[ExtractedIntent] = []
        raw_evidence_quotes: List[str] = []

        # 1. Bóc tách chi tiết từng bằng chứng kèm offset và gán source_revision_id
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
                            source_revision_id=source_revision_id, # << GẮN CHẶT REVISION
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

        # 2. Bóc tách Extracted Entities nếu có
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

        outcome = parsed_data.get("outcome", "needs_information")
        if outcome not in ["no_action", "needs_information", "candidate_action"]:
            outcome = "needs_information"

        raw_assessment = IntentAssessment(
            outcome=outcome,
            model_name=used_model,
            prompt_version="v1.1.0",
            intents=structured_intents,
            entities=parsed_data.get("entities", {}),
            extracted_entities=structured_entities,
            missing_requirements=parsed_data.get("missing_requirements", []),
            warnings=parsed_data.get("warnings", []),
            raw_evidence_quotes=raw_evidence_quotes
        )

        # 3. CHỐT CHẶN AN TOÀN: ĐỐI SOÁT BẰNG CHỨNG THỰC TẾ QUA EVIDENCE VERIFIER
        verified_assessment = evidence_verifier.verify_intent_assessment(
            assessment=raw_assessment,
            raw_content=raw_content,
            source_revision_id=source_revision_id
        )

        return verified_assessment
    
    def analyze_ticket(
        self,
        subject: str,
        raw_content: str,
        source: str,
        excel_summary: Optional[Dict[str, Any]] = None,
        attachments: Optional[list] = None,
        source_revision_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Hàm cầu nối hợp nhất (Bridge Compatibility):
        Chạy song song 2 luồng độc lập với 2 Keys riêng biệt và trả về kết quả đã kiểm chứng cho Planner.
        """
        summary_res = self.summarize_ticket(subject=subject, raw_content=raw_content, source=source)
        facts_res = self.extract_operational_facts(
            subject=subject,
            raw_content=raw_content,
            source=source,
            excel_summary=excel_summary,
            source_revision_id=source_revision_id
        )

        requested_ops = [{"intent": i.type, "confidence": i.confidence} for i in facts_res.intents if i.is_valid]

        outcome_mapped = "NO_ACTION" if facts_res.outcome == "no_action" else "NEEDS_INFORMATION" if facts_res.outcome == "needs_information" else "ACTIONABLE"

        return {
            "workflow_outcome": outcome_mapped,
            "category": summary_res.category,
            "priority": summary_res.priority,
            "goal": summary_res.goal,
            "summary_vi": summary_res.summary_vi,
            "assigned_name": summary_res.assigned_name,
            "assigned_email": summary_res.assigned_email,
            "detected_school": facts_res.entities.get("school_name"),
            "entities": facts_res.entities,
            "requested_operations": requested_ops,
            "missing_requirements": facts_res.missing_requirements,
            "warnings": facts_res.warnings,
            "evidence_quotes": facts_res.raw_evidence_quotes,
            "model_used": facts_res.model_name or summary_res.model_name,
            "is_fully_verified": facts_res.is_fully_verified,
            "reason_summary_vi": f"AI trích xuất {len(facts_res.intents)} ý định đã được kiểm chứng bằng chứng từ văn bản gốc."
        }


gemini_engine = AIEngine()


async def process_ticket_with_ai(ticket_id: str) -> Optional[Dict[str, Any]]:
    """
    Tiền xử lý toàn diện Ticket:
    1. Bóc tách file COF/Excel nếu có.
    2. Sử dụng create_or_get_ticket_revision tạo/lấy revision snapshot bất biến.
    3. Phân tách 2 đánh giá độc lập ghi vào ticket_ai_assessments (Summary & Facts).
    4. Cập nhật metadata cho inbox_tickets.
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

        # 1. Bóc tách file COF/Excel
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
                    else:
                        excel_summary = {
                            "is_cof": False,
                            "filename": fname,
                            "notice": "File danh sách tài khoản chuẩn"
                        }

                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    break
                except Exception as ex_err:
                    logger.warning(f"⚠️ Lỗi bóc tách file Excel [{fname}]: {ex_err}")

        # 2. Sử dụng create_or_get_ticket_revision tập trung (Diệt tận gốc bẫy revision_no = 1)
        from app.workers.ticket_processor import create_or_get_ticket_revision
        revision_id, rev_no, _ = create_or_get_ticket_revision(
            ticket_id=ticket_id,
            raw_content=raw_content,
            attachments=attachments,
            source_updated_at=ticket.get("updated_at")
        )

        # 3. Phân tách 2 đánh giá độc lập (Key 1 cho Summary, Key 2 cho Facts kèm Evidence Verification)
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
                        "model_name": summary_res.model_name or "fallback",
                        "prompt_version": summary_res.prompt_version,
                        "registry_version": "v1.1.0",
                        "structured_result": summary_res.model_dump(),
                        "status": "completed",
                        "created_at": now_iso
                    },
                    {
                        "ticket_revision_id": revision_id,
                        "assessment_kind": "fact_extraction",
                        "model_name": facts_res.model_name or "fallback",
                        "prompt_version": facts_res.prompt_version,
                        "registry_version": "v1.1.0",
                        "structured_result": facts_res.model_dump(),
                        "status": "completed",
                        "created_at": now_iso
                    }
                ]).execute()
            except Exception as assess_err:
                logger.warning(f"⚠️ Không thể lưu ticket_ai_assessments: {assess_err}")

        # 5. Cập nhật metadata cho inbox_tickets
        combined_analysis = gemini_engine.analyze_ticket(
            subject=subject,
            raw_content=raw_content,
            source=source,
            excel_summary=excel_summary,
            attachments=attachments,
            source_revision_id=revision_id
        )

        existing_meta = ticket.get("metadata") or {}
        if not isinstance(existing_meta, dict):
            existing_meta = {}

        existing_meta["ai_analysis"] = combined_analysis
        existing_meta["workflow_outcome"] = combined_analysis.get("workflow_outcome", "ACTIONABLE")
        existing_meta["requested_operations"] = combined_analysis.get("requested_operations", [])
        existing_meta["entities"] = combined_analysis.get("entities", {})
        existing_meta["evidence_quotes"] = combined_analysis.get("evidence_quotes", [])

        if combined_analysis.get("detected_school"):
            existing_meta["school_name"] = combined_analysis.get("detected_school")

        if excel_summary:
            existing_meta["excel_summary"] = excel_summary
            if excel_summary.get("school_name"):
                existing_meta["school_name"] = excel_summary["school_name"]
            if excel_summary.get("courses"):
                existing_meta["cof_courses"] = excel_summary["courses"]

        update_data = {
            "ai_summary": summary_res.summary_vi,
            "category": summary_res.category,
            "priority": summary_res.priority,
            "assigned_name": summary_res.assigned_name,
            "assigned_email": summary_res.assigned_email,
            "metadata": existing_meta
        }

        supabase.table("inbox_tickets").update(update_data).eq("id", ticket_id).execute()
        logger.info(f"✅ Đã tiền xử lý AI Dual-Key hoàn tất cho ticket #{ticket_id} (Outcome: {combined_analysis.get('workflow_outcome')})")
        return combined_analysis

    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_with_ai: {e}", exc_info=True)
        return None