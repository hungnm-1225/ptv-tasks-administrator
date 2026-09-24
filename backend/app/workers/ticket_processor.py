# backend/app/workers/ticket_processor.py
"""
Ticket Processor Worker (Canonical Intake Orchestrator with Multimodal Vision)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Multimodal Vision: Tự động tải ảnh đính kèm (.png, .jpg, .jpeg) vào RAM cho Gemini Vision đọc ảnh lỗi.
- Khai thác tệp đính kèm Excel đa năng trong RAM qua GenericExcelService.
- Nạp chuẩn xác Dynamic LMS Catalog (dùng đúng tên cột course_name & sku).
- Bơm Tóm Tắt AI (ai_summary) vào Fact Extraction làm kim chỉ nam.
"""

import os
import json
import hashlib
import logging
import tempfile
import httpx
import urllib.request
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.core.gemini import gemini_engine
from app.services.workflow_planner import workflow_planner_service
from app.services.cof_excel_service import COFExcelService
from app.services.excel.generic_excel_service import GenericExcelService

logger = logging.getLogger(__name__)


def compute_canonical_content_hash(
    raw_content: str, 
    attachments: Optional[List[Dict[str, Any]]] = None
) -> str:
    """Tạo mã băm nội dung chuẩn hóa (Canonical Content Hash)."""
    normalized_content = (raw_content or "").replace("\r\n", "\n").strip()
    
    canonical_attachments = []
    if attachments and isinstance(attachments, list):
        for att in attachments:
            if isinstance(att, dict):
                canonical_attachments.append({
                    "filename": str(att.get("filename") or "").strip().lower(),
                    "url": str(att.get("url") or "").strip(),
                    "size": int(att.get("size") or 0)
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
    """Cấp phát hoặc tái sử dụng Revision nguyên tử qua Stored Procedure PostgreSQL."""
    supabase = get_supabase_client()
    content_hash = compute_canonical_content_hash(raw_content, attachments)
    now_iso = datetime.now(timezone.utc).isoformat()
    updated_at_val = source_updated_at or now_iso

    try:
        rpc_res = supabase.rpc("create_or_get_inbox_ticket_revision", {
            "p_ticket_id": ticket_id,
            "p_content_hash": content_hash,
            "p_raw_content": raw_content or "",
            "p_attachments": attachments or [],
            "p_source_updated_at": updated_at_val
        }).execute()

        if rpc_res.data and len(rpc_res.data) > 0:
            rec = rpc_res.data[0]
            is_new = bool(rec.get("is_new", False))
            log_prefix = "✨ [NEW REVISION CREATED]" if is_new else "🔁 [REVISION REUSED]"
            logger.info(f"{log_prefix} Ticket #{ticket_id[:8]} -> Revision #{rec['id'][:8]} (rev_no={rec['revision_no']})")
            return rec["id"], rec["revision_no"], is_new
    except Exception as rpc_err:
        logger.error("Revision allocation RPC failed for ticket #%s", ticket_id[:8])
        raise RuntimeError("Atomic ticket revision allocation failed") from rpc_err

    raise RuntimeError("Atomic ticket revision allocation returned no revision")


def get_catalog_context(supabase) -> List[Dict[str, Any]]:
    """Lấy danh mục các khóa học LMS kèm Git Repos liên kết (dùng đúng tên cột course_name & sku)."""
    try:
        res = supabase.table("lms_courses")\
            .select("id, course_id, course_name, sku, git_repos, git_repo_url")\
            .limit(80)\
            .execute()
        if res.data:
            catalog = []
            for c in res.data:
                catalog.append({
                    "id": c.get("course_id") or c.get("id"),
                    "code": c.get("sku") or "",
                    "name": c.get("course_name") or "",
                    "git_repos": c.get("git_repos") or []
                })
            logger.info(f"📚 [LMS Catalog] Đã nạp thành công {len(catalog)} khóa học kèm Git Repos vào AI context!")
            return catalog
    except Exception as err:
        logger.warning(f"⚠️ Không thể nạp LMS catalog vào AI context: {err}")
    return []


async def process_ticket_revision(revision_id: str) -> Dict[str, Any]:
    """CANONICAL INTAKE ORCHESTRATOR với Hỗ trợ Multimodal Vision."""
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
        sender_email = ticket.get("sender_email") or ""
        attachments = revision.get("attachments") or ticket.get("attachments") or []

        excel_summary: Optional[Dict[str, Any]] = None
        image_parts: List[Dict[str, Any]] = []

        # =========================================================================
        # 1. BÓC TÁCH TỆP ĐÍNH KÈM: EXCEL VÀ ẢNH CHỤP MÀN HÌNH (MULTIMODAL)
        # =========================================================================
        for att in attachments:
            fname = att.get("filename", "").lower()
            furl = att.get("url", "")
            if not furl:
                continue

            # A. BÓC TÁCH FILE EXCEL (.xlsx, .xls)
            if (fname.endswith(".xlsx") or fname.endswith(".xls")) and not excel_summary:
                temp_path = None
                try:
                    file_bytes = None
                    try:
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            resp = await client.get(furl)
                            if resp.status_code == 200:
                                file_bytes = resp.content
                    except Exception:
                        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp_file:
                            urllib.request.urlretrieve(furl, tmp_file.name)
                            temp_path = tmp_file.name
                            with open(temp_path, "rb") as f:
                                file_bytes = f.read()

                    if file_bytes:
                        if not temp_path:
                            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp_file:
                                tmp_file.write(file_bytes)
                                temp_path = tmp_file.name

                        if COFExcelService.is_cof_file(temp_path):
                            parsed_cof = COFExcelService.parse_cof_file(temp_path)
                            excel_summary = {
                                "is_cof": True,
                                "filename": fname,
                                "school_name": parsed_cof.get("school_name"),
                                "courses": parsed_cof.get("courses", []),
                                "total_students": len(parsed_cof.get("students_all", [])),
                                "total_teachers": len(parsed_cof.get("teachers_all", []))
                            }
                        else:
                            parsed_universal = GenericExcelService.extract_universal_data(file_bytes)
                            excel_summary = {
                                "is_cof": False,
                                "filename": fname,
                                "identifiers": parsed_universal.get("identifiers", []),
                                "courses_detected": parsed_universal.get("courses_detected", []),
                                "repo_urls": parsed_universal.get("repo_urls", []),
                                "school_detected": parsed_universal.get("school_detected"),
                                "account_profiles": parsed_universal.get("account_profiles", [])[:50]
                            }
                except Exception as ex_err:
                    logger.warning(f"⚠️ Lỗi bóc tách Excel [{fname}]: {ex_err}")
                finally:
                    if temp_path and os.path.exists(temp_path):
                        try:
                            os.remove(temp_path)
                        except Exception:
                            pass

            # B. 🎯 TẢI ẢNH CHỤP MÀN HÌNH BÁO LỖI (.png, .jpg, .jpeg, .webp) CHO GEMINI VISION
            elif any(fname.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]) and len(image_parts) < 2:
                try:
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        resp = await client.get(furl)
                        if resp.status_code == 200 and len(resp.content) < 5 * 1024 * 1024:
                            mime = "image/png" if fname.endswith(".png") else "image/webp" if fname.endswith(".webp") else "image/jpeg"
                            image_parts.append({
                                "mime_type": mime,
                                "data": resp.content
                            })
                            logger.info(f"📸 [Multimodal Vision] Đã nạp ảnh lỗi [{fname}] ({len(resp.content)} bytes) vào Gemini Vision!")
                except Exception as img_err:
                    logger.warning(f"⚠️ Lỗi tải ảnh đính kèm [{fname}]: {img_err}")

        # 2. Fallback bóc tách văn bản trần nếu không có file Excel
        if not excel_summary and raw_content:
            text_parsed = GenericExcelService.parse_universal_text(raw_content)
            if text_parsed.get("identifiers") or text_parsed.get("repo_urls"):
                excel_summary = {
                    "is_cof": False,
                    "filename": "email_raw_text",
                    "identifiers": text_parsed.get("identifiers", []),
                    "repo_urls": text_parsed.get("repo_urls", []),
                    "courses_detected": text_parsed.get("courses_detected", [])
                }

        # 3. Nạp LMS Catalog
        catalog_context = get_catalog_context(supabase)
        if excel_summary is not None:
            excel_summary["catalog_reference"] = catalog_context
        else:
            excel_summary = {"catalog_reference": catalog_context}

        # 4. Tóm tắt mềm
        summary_res = gemini_engine.summarize_ticket(
            subject=subject, 
            raw_content=raw_content, 
            source=source,
            sender_email=sender_email
        )

        if summary_res.model_name != "fast_path_system_filter":
            import asyncio
            await asyncio.sleep(1.2)

        # 5. Bóc tách Sự Thật Vận Hành (Truyền CẢ Tóm Tắt AI và Ảnh Đính Kèm)
        facts_res = gemini_engine.extract_operational_facts(
            subject=subject,
            raw_content=raw_content,
            source=source,
            excel_summary=excel_summary,
            source_revision_id=revision_id,
            sender_email=sender_email,
            ai_summary=summary_res.summary_vi,
            image_parts=image_parts  # << BƠM ẢNH ĐÍNH KÈM CHO GEMINI VISION!
        )

        # 6. Lưu assessments vào Supabase
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            supabase.table("ticket_ai_assessments").insert([
                {
                    "ticket_revision_id": revision_id,
                    "assessment_kind": "summary",
                    "model_name": summary_res.model_name or "unknown",
                    "prompt_version": summary_res.prompt_version,
                    "registry_version": "v1.4.0",
                    "structured_result": summary_res.model_dump(),
                    "status": "failed" if summary_res.model_name == "ai_analysis_failed" else "completed",
                    "created_at": now_iso
                },
                {
                    "ticket_revision_id": revision_id,
                    "assessment_kind": "fact_extraction",
                    "model_name": facts_res.model_name or "unknown",
                    "prompt_version": facts_res.prompt_version,
                    "registry_version": "v1.4.0",
                    "structured_result": facts_res.model_dump(),
                    "status": "failed" if facts_res.model_name == "ai_analysis_failed" else "completed",
                    "created_at": now_iso
                }
            ]).execute()
        except Exception as assess_err:
            logger.warning(f"⚠️ Lỗi ghi ticket_ai_assessments: {assess_err}")

        # 7. Đồng bộ metadata vào inbox_tickets
        combined_meta = ticket.get("metadata") or {}
        combined_meta["ai_analysis"] = {
            "workflow_outcome": "NO_ACTION" if facts_res.outcome == "no_action" else "NEEDS_INFORMATION" if facts_res.outcome == "needs_information" else "ACTIONABLE",
            "category": summary_res.category,
            "priority": summary_res.priority,
            "goal": summary_res.goal,
            "summary_vi": summary_res.summary_vi,
            "detected_school": facts_res.entities.get("school_name"),
            "entities": facts_res.entities,
            "requested_operations": [{"intent": i.type, "confidence": i.confidence} for i in facts_res.intents if i.is_valid],
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

        # 8. Lập kế hoạch Workflow
        wf_draft = await workflow_planner_service.plan_workflow_for_ticket(
            ticket_id=ticket_id, 
            revision_id=revision_id
        )
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
    """Cầu nối tiếp nhận vé mới từ Ingestion."""
    ticket_id = ticket_data.get("id")
    if not ticket_id:
        return {}

    raw_content = ticket_data.get("raw_content") or ""
    attachments = ticket_data.get("attachments") or []
    source_updated_at = ticket_data.get("updated_at")

    revision_id, rev_no, is_new = create_or_get_ticket_revision(
        ticket_id=ticket_id,
        raw_content=raw_content,
        attachments=attachments,
        source_updated_at=source_updated_at
    )

    if not revision_id:
        return {}

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
        logger.info(f"⏩ Revision #{revision_id[:8]} đã được phân tích trước đó, bỏ qua.")
        return {"status": "reused", "revision_id": revision_id}