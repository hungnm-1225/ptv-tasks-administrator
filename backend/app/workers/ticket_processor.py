# backend/app/workers/ticket_processor.py
import os
import json
import hashlib
import logging
import tempfile
import urllib.request
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.core.gemini import gemini_engine
from app.services.workflow_planner import workflow_planner_service
from app.services.cof_excel_service import COFExcelService

logger = logging.getLogger(__name__)


def compute_canonical_content_hash(
    raw_content: str, 
    attachments: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Tạo mã băm nội dung chuẩn hóa (Canonical Content Hash):
    - Chuẩn hóa text: loại bỏ CRLF (\r\n -> \n), strip khoảng trắng.
    - Snapshot attachments: chuẩn hóa và sắp xếp ổn định danh sách file (filename, url, size).
    - Đảm bảo khi file đính kèm thay đổi thì hash bắt buộc phải thay đổi!
    """
    normalized_content = (raw_content or "").replace("\r\n", "\n").strip()
    
    canonical_attachments = []
    if attachments and isinstance(attachments, list):
        for att in attachments:
            if isinstance(att, dict):
                canonical_attachments.append({
                    "filename": str(att.get("filename") or "").strip().lower(),
                    "url": str(att.get("url") or "").strip(),
                    "size": att.get("size") or 0
                })
        canonical_attachments.sort(key=lambda x: (x["filename"], x["url"]))

    payload = {
        "content": normalized_content,
        "attachments": canonical_attachments
    }
    raw_bytes = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode("utf-8")
    return hashlib.sha256(raw_bytes).hexdigest()


def create_or_get_ticket_revision(
    ticket_id: str,
    raw_content: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
    source_updated_at: Optional[str] = None
) -> Tuple[Optional[str], int, bool]:
    """
    HÀM DUY NHẤT TẠO HOẶC LẤY REVISION (Single Source of Truth):
    - Tính hash chuẩn hóa (text + file đính kèm).
    - Nếu hash trùng khớp: Tái sử dụng revision cũ (is_new = False).
    - Nếu hash mới: Tự động tính toán atomic revision_no = max(revision_no) + 1 (is_new = True).
    - Chống hoàn toàn lỗi xung đột ràng buộc Unique Constraint uq_ticket_revision!
    Trả về: (revision_id, revision_no, is_new)
    """
    supabase = get_supabase_client()
    content_hash = compute_canonical_content_hash(raw_content, attachments)
    now_iso = datetime.now(timezone.utc).isoformat()
    updated_at_val = source_updated_at or now_iso

    # 1. Kiểm tra xem revision với content_hash này đã tồn tại chưa
    existing_rev = supabase.table("inbox_ticket_revisions")\
        .select("id, revision_no")\
        .eq("ticket_id", ticket_id)\
        .eq("content_hash", content_hash)\
        .limit(1)\
        .execute()

    if existing_rev.data:
        rec = existing_rev.data[0]
        logger.info(f"🔁 [REVISION REUSED] Ticket #{ticket_id[:8]} tái sử dụng Revision #{rec['id'][:8]} (rev_no={rec['revision_no']})")
        return rec["id"], rec["revision_no"], False

    # 2. Nếu là nội dung mới, truy vấn max revision_no hiện tại để tăng dần an toàn
    max_rev_res = supabase.table("inbox_ticket_revisions")\
        .select("revision_no")\
        .eq("ticket_id", ticket_id)\
        .order("revision_no", desc=True)\
        .limit(1)\
        .execute()

    next_rev_no = (max_rev_res.data[0]["revision_no"] + 1) if max_rev_res.data else 1

    # 3. Tạo revision mới bất biến (Immutable Snapshot)
    try:
        new_rev = supabase.table("inbox_ticket_revisions").insert({
            "ticket_id": ticket_id,
            "revision_no": next_rev_no,
            "content_hash": content_hash,
            "raw_content": raw_content or "",
            "attachments": attachments or [],
            "source_updated_at": updated_at_val,
            "created_at": now_iso
        }).execute()

        if new_rev.data:
            rec = new_rev.data[0]
            logger.info(f"✨ [NEW REVISION CREATED] Ticket #{ticket_id[:8]} đã tạo Revision #{rec['id'][:8]} (rev_no={next_rev_no}) thành công!")
            return rec["id"], next_rev_no, True

    except Exception as insert_err:
        logger.warning(f"⚠️ Thử bắt xung đột race-condition khi tạo revision: {insert_err}")
        # Fallback kiểm tra lại nếu có luồng khác vừa tạo cùng lúc
        double_check = supabase.table("inbox_ticket_revisions")\
            .select("id, revision_no")\
            .eq("ticket_id", ticket_id)\
            .eq("content_hash", content_hash)\
            .limit(1)\
            .execute()
        if double_check.data:
            rec = double_check.data[0]
            return rec["id"], rec["revision_no"], False

    logger.error(f"❌ Không thể tạo hoặc lấy revision cho ticket #{ticket_id}!")
    return None, 0, False


async def process_ticket_revision(revision_id: str) -> Dict[str, Any]:
    """
    CANONICAL INTAKE ORCHESTRATOR (Một cửa tiếp nhận chuẩn hóa):
    1. Đọc nội dung snapshot bất biến từ inbox_ticket_revisions.
    2. Bóc tách file COF/Excel (nếu có).
    3. Chạy Dual-Path AI (Summary mềm cho UI + Fact Extraction có trích dẫn bằng chứng).
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

        # Phân tách 2 đánh giá AI độc lập (Dual-Path Cognition)
        summary_res = gemini_engine.summarize_ticket(subject=subject, raw_content=raw_content, source=source)
        facts_res = gemini_engine.extract_operational_facts(
            subject=subject,
            raw_content=raw_content,
            source=source,
            excel_summary=excel_summary
        )

        # Lưu độc lập 2 bản đánh giá AI vào ticket_ai_assessments
        try:
            supabase.table("ticket_ai_assessments").insert([
                {
                    "ticket_revision_id": revision_id,
                    "assessment_kind": "summary",
                    "model_name": summary_res.model_name or "fallback",
                    "prompt_version": summary_res.prompt_version,
                    "registry_version": "v1.1.0",
                    "structured_result": summary_res.model_dump(),
                    "status": "completed"
                },
                {
                    "ticket_revision_id": revision_id,
                    "assessment_kind": "fact_extraction",
                    "model_name": facts_res.model_name or "fallback",
                    "prompt_version": facts_res.prompt_version,
                    "registry_version": "v1.1.0",
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

        # Bật await chuẩn xác cho Planner tự động sinh Proposal
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
    """Cầu nối tiếp nhận vé mới từ các Ingestion Adapters (Gmail, Sheets, osTicket)."""
    ticket_id = ticket_data.get("id")
    if not ticket_id:
        logger.warning("⚠️ Không có ticket_id trong ticket_data!")
        return {}

    raw_content = ticket_data.get("raw_content") or ""
    attachments = ticket_data.get("attachments") or []
    source_updated_at = ticket_data.get("updated_at")

    # Sử dụng hàm chuẩn hóa tập trung
    revision_id, rev_no, is_new = create_or_get_ticket_revision(
        ticket_id=ticket_id,
        raw_content=raw_content,
        attachments=attachments,
        source_updated_at=source_updated_at
    )

    if not revision_id:
        logger.error(f"❌ Không thể phân giải revision cho ticket #{ticket_id}!")
        return {}

    # Nếu là revision mới tạo, hoặc revision cũ nhưng chưa từng được đánh giá AI
    supabase = get_supabase_client()
    existing_assess = supabase.table("ticket_ai_assessments")\
        .select("id")\
        .eq("ticket_revision_id", revision_id)\
        .limit(1)\
        .execute()

    if is_new or not existing_assess.data:
        logger.info(f"🚀 Kích hoạt phân tích AI cho Revision #{revision_id[:8]} (is_new={is_new})...")
        return await process_ticket_revision(revision_id)
    else:
        logger.info(f"⏩ Revision #{revision_id[:8]} đã được phân tích trước đó, bỏ qua để tiết kiệm Quota AI.")
        return {"status": "reused", "revision_id": revision_id}