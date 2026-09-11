# backend/app/workers/ticket_processor.py
import os
import hashlib
import logging
import tempfile
import urllib.request
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.core.gemini import gemini_engine
from app.services.workflow_planner import workflow_planner_service
from app.services.cof_excel_service import COFExcelService

logger = logging.getLogger(__name__)


async def process_ticket_revision(revision_id: str) -> Dict[str, Any]:
    """
    CANONICAL INTAKE ORCHESTRATOR (Một cửa tiếp nhận chuẩn hóa):
    1. Đọc nội dung từ inbox_ticket_revisions.
    2. Bóc tách file COF/Excel (nếu có).
    3. Chạy Dual-Path AI (Summary mềm + Fact Extraction có bằng chứng).
    4. Lưu độc lập 2 assessments vào ticket_ai_assessments.
    5. Khởi chạy Deterministic Planner sinh Workflow Proposal chuẩn mực.
    """
    supabase = get_supabase_client()
    try:
        rev_res = supabase.table("inbox_ticket_revisions").select("*, inbox_tickets(*)").eq("id", revision_id).execute()
        if not rev_res.data:
            logger.error(f"❌ Không tìm thấy revision #{revision_id}!")
            return {}

        revision = rev_res.data[0]
        ticket = revision.get("inbox_tickets") or {}
        ticket_id = revision.get("ticket_id")
        raw_content = revision.get("raw_content") or ""
        subject = ticket.get("subject") or ""
        source = ticket.get("source") or "gmail"
        attachments = revision.get("attachments") or ticket.get("attachments") or []

        excel_summary = None
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

        # Phân tách 2 đánh giá AI độc lập
        summary_res = gemini_engine.summarize_ticket(subject=subject, raw_content=raw_content, source=source)
        facts_res = gemini_engine.extract_operational_facts(
            subject=subject,
            raw_content=raw_content,
            source=source,
            excel_summary=excel_summary
        )

        try:
            supabase.table("ticket_ai_assessments").insert([
                {
                    "ticket_revision_id": revision_id,
                    "assessment_kind": "summary",
                    "model_name": summary_res.model_name or "fallback",
                    "prompt_version": summary_res.prompt_version,
                    "registry_version": "v1",
                    "structured_result": summary_res.model_dump(),
                    "status": "completed"
                },
                {
                    "ticket_revision_id": revision_id,
                    "assessment_kind": "fact_extraction",
                    "model_name": facts_res.model_name or "fallback",
                    "prompt_version": facts_res.prompt_version,
                    "registry_version": "v1",
                    "structured_result": facts_res.model_dump(),
                    "status": "completed"
                }
            ]).execute()
        except Exception as assess_err:
            logger.warning(f"⚠️ Lỗi ghi ticket_ai_assessments: {assess_err}")

        combined_meta = ticket.get("metadata") or {}
        combined_meta["ai_analysis"] = {
            "workflow_outcome": "NO_ACTION" if facts_res.outcome == "no_action" else "NEEDS_INFORMATION" if facts_res.outcome == "needs_information" else "ACTIONABLE",
            "category": summary_res.category,
            "priority": summary_res.priority,
            "goal": summary_res.goal,
            "summary_vi": summary_res.summary_vi,
            "detected_school": facts_res.entities.get("school_name"),
            "entities": facts_res.entities,
            "requested_operations": [{"intent": i.type, "confidence": i.confidence} for i in facts_res.intents],
            "missing_requirements": facts_res.missing_requirements,
            "warnings": facts_res.warnings,
            "evidence_quotes": facts_res.raw_evidence_quotes,
            "model_used": facts_res.model_name or summary_res.model_name
        }
        if excel_summary:
            combined_meta["excel_summary"] = excel_summary

        supabase.table("inbox_tickets").update({
            "ai_summary": summary_res.summary_vi,
            "category": summary_res.category,
            "priority": summary_res.priority,
            "assigned_name": summary_res.assigned_name,
            "assigned_email": summary_res.assigned_email,
            "metadata": combined_meta
        }).eq("id", ticket_id).execute()

        # 🎯 BẬT AWAIT CHUẨN XÁC CHO PLANNER:
        wf_draft = await workflow_planner_service.plan_workflow_for_ticket(ticket_id)
        logger.info(f"✨ Đã hoàn tất xử lý Revision #{revision_id[:8]} cho ticket #{ticket_id[:8]} (Status: {wf_draft.get('status') if wf_draft else 'N/A'})")

        return {
            "summary": summary_res.model_dump(),
            "facts": facts_res.model_dump(),
            "workflow_draft": wf_draft or {}
        }
    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_revision #{revision_id}: {e}", exc_info=True)
        return {}


async def process_incoming_ticket(ticket_data: Dict[str, Any]) -> Dict[str, Any]:
    """Cầu nối tiếp nhận vé mới từ các Ingestion Adapters."""
    ticket_id = ticket_data.get("id")
    if not ticket_id:
        logger.warning("⚠️ Không có ticket_id trong ticket_data!")
        return {}

    supabase = get_supabase_client()
    raw_content = ticket_data.get("raw_content") or ""
    content_hash = hashlib.sha256(raw_content.encode("utf-8")).hexdigest()
    now_iso = datetime.now(timezone.utc).isoformat()

    rev_res = supabase.table("inbox_ticket_revisions")\
        .select("id")\
        .eq("ticket_id", ticket_id)\
        .eq("content_hash", content_hash)\
        .limit(1)\
        .execute()

    if rev_res.data:
        revision_id = rev_res.data[0]["id"]
    else:
        new_rev = supabase.table("inbox_ticket_revisions").insert({
            "ticket_id": ticket_id,
            "revision_no": 1,
            "content_hash": content_hash,
            "raw_content": raw_content,
            "attachments": ticket_data.get("attachments") or [],
            "source_updated_at": ticket_data.get("updated_at") or now_iso
        }).execute()
        revision_id = new_rev.data[0]["id"] if new_rev.data else None

    if not revision_id:
        logger.error(f"❌ Không thể tạo revision cho ticket #{ticket_id}!")
        return {}

    return await process_ticket_revision(revision_id)