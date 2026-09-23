# backend/app/workers/ticket_processor.py
"""
Ticket Processor Worker (Canonical Intake Orchestrator)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Quản trị Revision nguyên tử qua PostgreSQL RPC 'create_or_get_inbox_ticket_revision' (FOR UPDATE).
- Khai thác tệp đính kèm Excel đa năng trong RAM qua GenericExcelService (Universal Primitives).
- Fallback bóc tách văn bản trần tự nhiên khi không có file đính kèm.
- Bơm Dynamic Course Catalog (LMS ID, Code, Git Repos) vào tri thức AI.
- Điều phối Dual-Path AI (Summary hiển thị + Fact Extraction mang source_revision_id).
- Bảo vệ trần 512MB RAM Render: Async HTTPX, dọn dẹp file tạm triệt để trong finally.
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
    """
    HÀM DUY NHẤT TẠO HOẶC LẤY REVISION (Single Source of Truth):
    - Gọi PostgreSQL RPC 'create_or_get_inbox_ticket_revision' (FOR UPDATE Atomic Lock).
    - Triệt tiêu 100% race condition uq_ticket_revision khi nhiều worker chạy đồng thời.
    Trả về: (revision_id, revision_no, is_new)
    """
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
    """
    Lấy danh mục các khóa học LMS kèm Git Repos liên kết để nạp vào trí tuệ AI.
    Giúp Gemini giải mã 'SWRP 11' -> ID 48 + Link Git repo tương ứng.
    """
    try:
        res = supabase.table("lms_courses")\
            .select("id, name, course_code, git_repos")\
            .limit(60)\
            .execute()
        if res.data:
            catalog = []
            for c in res.data:
                catalog.append({
                    "id": c.get("id"),
                    "code": c.get("course_code") or "",
                    "name": c.get("name") or "",
                    "git_repos": c.get("git_repos") or []
                })
            return catalog
    except Exception as err:
        logger.warning(f"⚠️ Không thể nạp LMS catalog vào AI context: {err}")
    return []


async def process_ticket_revision(revision_id: str) -> Dict[str, Any]:
    """
    CANONICAL INTAKE ORCHESTRATOR (Một cửa tiếp nhận chuẩn hóa):
    1. Đọc nội dung snapshot bất biến từ inbox_ticket_revisions.
    2. Tải & bóc tách file COF/Excel bất kỳ qua GenericExcelService (Universal Primitives).
    3. Fallback bóc tách text trần khi không có file đính kèm.
    4. Bơm Dynamic LMS Course Catalog giúp Gemini thấu suốt hệ thống.
    5. Chạy Dual-Path AI (Summary mềm + Fact Extraction TRUYỀN ĐỦ source_revision_id).
    6. Lưu độc lập 2 assessments vào ticket_ai_assessments.
    7. Khởi chạy Non-Destructive Workflow Planner.
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
        sender_email = ticket.get("sender_email") or ""
        attachments = revision.get("attachments") or ticket.get("attachments") or []

        excel_summary: Optional[Dict[str, Any]] = None

        # =========================================================================
        # 1. BÓC TÁCH TỆP ĐÍNH KÈM EXCEL (PRE-PARSING ATTACHMENTS)
        # =========================================================================
        for att in attachments:
            fname = att.get("filename", "").lower()
            furl = att.get("url", "")
            if (fname.endswith(".xlsx") or fname.endswith(".xls")) and furl:
                temp_path = None
                try:
                    file_bytes: Optional[bytes] = None

                    # Tải file bất đồng bộ qua HTTPX (Non-blocking I/O)
                    try:
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            resp = await client.get(furl)
                            if resp.status_code == 200:
                                file_bytes = resp.content
                    except Exception as dl_err:
                        logger.warning(f"⚠️ Tải qua HTTPX lỗi ({dl_err}), fallback urllib...")
                        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp_file:
                            urllib.request.urlretrieve(furl, tmp_file.name)
                            temp_path = tmp_file.name
                            with open(temp_path, "rb") as f:
                                file_bytes = f.read()

                    if not file_bytes:
                        continue

                    # Tạo file tạm thời nếu cần thiết cho COF parser
                    if not temp_path:
                        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp_file:
                            tmp_file.write(file_bytes)
                            temp_path = tmp_file.name

                    # Nhánh A: Kiểm tra xem có phải file COF 3 Tabs truyền thống
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
                            "classes": list(set(s.get("class_name") for s in parsed_cof.get("students_all", []) if s.get("class_name")))
                        }
                    else:
                        # Nhánh B: FILE EXCEL BẤT KỲ - BÓC TÁCH ĐA NĂNG 2 TẦNG (UNIVERSAL EXTRACTOR)
                        parsed_universal = GenericExcelService.extract_universal_data(file_bytes)
                        excel_summary = {
                            "is_cof": False,
                            "filename": fname,
                            "identifiers": parsed_universal.get("identifiers", []),
                            "emails": parsed_universal.get("emails", []),
                            "usernames": parsed_universal.get("usernames", []),
                            "repo_urls": parsed_universal.get("repo_urls", []),
                            "courses_detected": parsed_universal.get("courses_detected", []),
                            "classes_detected": parsed_universal.get("classes_detected", []),
                            "suggested_roles": parsed_universal.get("suggested_roles", []),
                            "school_detected": parsed_universal.get("school_detected"),
                            "account_profiles": parsed_universal.get("account_profiles", [])[:50],  # Preview tối đa 50 user cho AI
                            "total_identifiers": len(parsed_universal.get("identifiers", [])),
                            "total_accounts": len(parsed_universal.get("account_profiles", [])),
                            "notice": f"File danh sách Excel [{fname}]: {len(parsed_universal.get('identifiers', []))} định danh, {len(parsed_universal.get('repo_urls', []))} repos, {len(parsed_universal.get('courses_detected', []))} môn học."
                        }
                    break
                except Exception as ex_err:
                    logger.warning(f"⚠️ Lỗi bóc tách file Excel [{fname}]: {ex_err}", exc_info=True)
                finally:
                    # Render 512MB RAM: Dọn sạch file tạm trên đĩa ngay lập tức!
                    if temp_path and os.path.exists(temp_path):
                        try:
                            os.remove(temp_path)
                        except Exception:
                            pass

        # =========================================================================
        # 2. BỔ TRỢ NGUYÊN LIỆU TỪ VĂN BẢN TRẦN NẾU KHÔNG CÓ FILE ĐÍNH KÈM
        # =========================================================================
        if not excel_summary and raw_content:
            text_parsed = GenericExcelService.parse_universal_text(raw_content)
            if text_parsed.get("identifiers") or text_parsed.get("repo_urls") or text_parsed.get("account_profiles"):
                excel_summary = {
                    "is_cof": False,
                    "filename": "email_raw_text",
                    "identifiers": text_parsed.get("identifiers", []),
                    "emails": text_parsed.get("emails", []),
                    "usernames": text_parsed.get("usernames", []),
                    "repo_urls": text_parsed.get("repo_urls", []),
                    "courses_detected": text_parsed.get("courses_detected", []),
                    "classes_detected": text_parsed.get("classes_detected", []),
                    "suggested_roles": text_parsed.get("suggested_roles", []),
                    "account_profiles": text_parsed.get("account_profiles", []),
                    "total_identifiers": len(text_parsed.get("identifiers", [])),
                    "total_accounts": len(text_parsed.get("account_profiles", [])),
                    "notice": f"Bóc tách từ nội dung văn bản email: {len(text_parsed.get('identifiers', []))} định danh, {len(text_parsed.get('repo_urls', []))} repos."
                }

        # =========================================================================
        # 3. BƠM TRI THỨC ĐỘNG (DYNAMIC CATALOG CONTEXT INJECTION)
        # =========================================================================
        catalog_context = get_catalog_context(supabase)
        if excel_summary is not None:
            excel_summary["catalog_reference"] = catalog_context
        else:
            excel_summary = {"catalog_reference": catalog_context}

        # =========================================================================
        # 4. THỰC THI DUAL-PATH AI ENGINE (SUMMARY & FACT EXTRACTION)
        # =========================================================================
        summary_res = gemini_engine.summarize_ticket(
            subject=subject, 
            raw_content=raw_content, 
            source=source,
            sender_email=sender_email
        )

        if summary_res.model_name != "fast_path_system_filter":
            import asyncio
            await asyncio.sleep(1.2)

        facts_res = gemini_engine.extract_operational_facts(
            subject=subject,
            raw_content=raw_content,
            source=source,
            excel_summary=excel_summary,
            source_revision_id=revision_id,
            sender_email=sender_email
        )

        # =========================================================================
        # 5. LƯU 2 BẢN ĐÁNH GIÁ ĐỘC LẬP VÀO TICKET_AI_ASSESSMENTS
        # =========================================================================
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            supabase.table("ticket_ai_assessments").insert([
                {
                    "ticket_revision_id": revision_id,
                    "assessment_kind": "summary",
                    "model_name": summary_res.model_name or "unknown",
                    "prompt_version": summary_res.prompt_version,
                    "registry_version": "v1.2.0",
                    "structured_result": summary_res.model_dump(),
                    "status": "failed" if summary_res.model_name == "ai_analysis_failed" else "completed",
                    "created_at": now_iso
                },
                {
                    "ticket_revision_id": revision_id,
                    "assessment_kind": "fact_extraction",
                    "model_name": facts_res.model_name or "unknown",
                    "prompt_version": facts_res.prompt_version,
                    "registry_version": "v1.2.0",
                    "structured_result": facts_res.model_dump(),
                    "status": "failed" if facts_res.model_name == "ai_analysis_failed" else "completed",
                    "created_at": now_iso
                }
            ]).execute()
        except Exception as assess_err:
            logger.warning(f"⚠️ Lỗi ghi ticket_ai_assessments: {assess_err}")

        # =========================================================================
        # 6. ĐỒNG BỘ METADATA VÀO INBOX_TICKETS
        # =========================================================================
        combined_meta = ticket.get("metadata") or {}
        combined_meta["ai_analysis"] = {
            "workflow_outcome": "NO_ACTION" if facts_res.outcome == "no_action" else "NEEDS_INFORMATION" if facts_res.outcome == "needs_information" else "ACTIONABLE",
            "category": summary_res.category,
            "priority": summary_res.priority,
            "goal": summary_res.goal,
            "summary_vi": summary_res.summary_vi,
            "detected_school": facts_res.entities.get("school_name") or (excel_summary.get("school_detected") if excel_summary else None),
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

        # =========================================================================
        # 7. KHỞI CHẠY LẬP KẾ HOẠCH WORKFLOW (NON-DESTRUCTIVE DAG)
        # =========================================================================
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