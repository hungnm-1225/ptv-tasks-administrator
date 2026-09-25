"""
Ticket Processor Worker (Master Canonical Intake with Attachment Provenance & Multimodal Vision)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Quản trị Sổ Cái Tệp Đính Kèm (Attachment Provenance State Machine):
  + Tự động nhận diện file đã xử lý ở các Workflow thành công trước đó -> Đánh dấu BỎ QUA.
  + Nhận diện tệp mới/ảnh mới ở lượt hội thoại cuối cùng -> Đánh dấu ACTIVE cần phân tích.
- Bóc tách ĐA TỆP ĐÍNH KÈM (quét sạch mọi file Excel, không bị nghẽn ở file đầu tiên).
- Gemini Multimodal Vision: Đọc ảnh chụp màn hình báo lỗi verify/login ở lượt mới nhất.
- Bơm ngữ cảnh lũy tiến (Incremental Turn Context) để AI không lặp lại thao tác cũ.
- TUYỆT ĐỐI TUÂN THỦ: ZERO-MOCKUP INVARIANT (Thiếu thì báo thiếu, cấm tự bịa data).
"""

import os
import json
import hashlib
import logging
import tempfile
import httpx
import urllib.request
from typing import Dict, Any, Optional, List, Tuple, Set
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
    """Lấy danh mục các khóa học LMS kèm Git Repos liên kết chuẩn xác."""
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


def get_already_processed_attachments(supabase, ticket_id: str, current_rev_no: int) -> Set[str]:
    """
    Xác định danh sách các tệp đính kèm ĐÃ XỬ LÝ THÀNH CÔNG trong lịch sử:
    - Nếu các workflow trước đó đã ở trạng thái 'success' / 'succeeded'
    - Tất cả các file thuộc các revision trước đều được đưa vào danh sách 'đã hoàn thành'.
    """
    processed_files: Set[str] = set()
    if current_rev_no <= 1:
        return processed_files

    try:
        # Kiểm tra xem vé này đã từng có workflow nào thành công chưa
        wf_res = supabase.table("automation_workflows")\
            .select("id, status, steps")\
            .eq("ticket_id", ticket_id)\
            .in_("status", ["success", "succeeded"])\
            .execute()

        if wf_res.data and len(wf_res.data) > 0:
            # Lấy toàn bộ file đính kèm của các revision cũ hơn
            old_revs = supabase.table("inbox_ticket_revisions")\
                .select("attachments")\
                .eq("ticket_id", ticket_id)\
                .lt("revision_no", current_rev_no)\
                .execute()

            for r in old_revs.data or []:
                for att in r.get("attachments") or []:
                    if isinstance(att, dict) and att.get("filename"):
                        processed_files.add(att["filename"].strip().lower())
                        
            logger.info(f"📂 [Attachment Provenance] Phát hiện {len(processed_files)} tệp đã được xử lý thành công ở các lần trước: {list(processed_files)}")
    except Exception as e:
        logger.warning(f"⚠️ Lỗi truy vấn attachment provenance: {e}")

    return processed_files


async def process_ticket_revision(revision_id: str) -> Dict[str, Any]:
    """CANONICAL INTAKE ORCHESTRATOR với Quản Lý Sổ Cái Tệp Đính Kèm Đa Kỳ & Vision."""
    supabase = get_supabase_client()
    try:
        rev_res = supabase.table("inbox_ticket_revisions").select("*, inbox_tickets(*)").eq("id", revision_id).execute()
        if not rev_res.data:
            logger.error(f"❌ Không tìm thấy revision #{revision_id}!")
            return {}

        revision = rev_res.data[0]
        ticket = revision.get("inbox_tickets") or {}
        ticket_id = revision.get("ticket_id")
        rev_no = revision.get("revision_no", 1)
        raw_content = revision.get("raw_content") or ""
        subject = ticket.get("subject") or ""
        source = ticket.get("source") or "gmail"
        sender_email = ticket.get("sender_email") or ""
        attachments = revision.get("attachments") or ticket.get("attachments") or []

        # 🌟 1. TRA CỨU SỔ CÁI TỆP ĐÍNH KÈM: PHÂN BIỆT FILE CŨ ĐÃ XỬ LÝ VS FILE MỚI
        processed_file_names = get_already_processed_attachments(supabase, ticket_id, rev_no)

        parsed_excel_files: List[Dict[str, Any]] = []
        image_parts: List[Dict[str, Any]] = []
        new_active_filenames: List[str] = []
        archived_filenames: List[str] = []

        # =========================================================================
        # 2. BÓC TÁCH TỆP ĐÍNH KÈM CÓ GẮN NHÃN PROVENANCE
        # =========================================================================
        for att in attachments:
            fname = str(att.get("filename") or "").strip()
            fname_lower = fname.lower()
            furl = att.get("url", "")
            turn_idx = att.get("turn_index", 1)
            is_initial = att.get("is_initial_form", False)
            if not furl or not fname:
                continue

            # Phân loại trạng thái vòng đời của tệp
            is_already_done = fname_lower in processed_file_names
            lifecycle_status = "processed" if is_already_done else "new_pending"

            if is_already_done:
                archived_filenames.append(f"{fname} (ĐÃ HOÀN TẤT Ở LƯỢT TRƯỚC)")
            else:
                new_active_filenames.append(fname)

            # A. BÓC TÁCH FILE EXCEL VỚI BỘ PHÂN LOẠI TEMPLATE TỰ ĐỘNG (COF, TOF, BULK_ACCOUNTS, GENERIC)
            if fname_lower.endswith(".xlsx") or fname_lower.endswith(".xls"):
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

                        # 🌟 1. GỌI BỘ NHẬN DIỆN PHÔI THÔNG MINH (QUÉT 1-5 HÀNG, CỘT A-Z)
                        from app.services.excel.excel_classifier import detect_excel_file_type
                        from app.services.excel.bulk_template_service import bulk_template_service
                        from app.services.excel.tof_service import tof_service

                        excel_type, type_meta = detect_excel_file_type(temp_path)

                        # 🌟 2. ĐIỀU PHỐI ĐÚNG THEO TỪNG LOẠI PHÔI
                        if excel_type == "COF":
                            parsed_cof = COFExcelService.parse_cof_file(temp_path)
                            parsed_excel_files.append({
                                "is_cof": True,
                                "excel_type": "COF",
                                "filename": fname,
                                "lifecycle_status": lifecycle_status,
                                "turn_index": turn_idx,
                                "is_initial": is_initial,
                                "school_name": parsed_cof.get("school_name"),
                                "courses": parsed_cof.get("courses", []),
                                "total_students": len(parsed_cof.get("students_all", [])),
                                "total_teachers": len(parsed_cof.get("teachers_all", []))
                            })
                        elif excel_type == "TOF":
                            parsed_tof = tof_service.parse_tof_summary(temp_path)
                            parsed_excel_files.append({
                                "is_tof": True,
                                "excel_type": "TOF",
                                "filename": fname,
                                "lifecycle_status": lifecycle_status,
                                "turn_index": turn_idx,
                                "is_initial": is_initial,
                                "school_name": parsed_tof.get("school_name"),
                                "courses_detected": parsed_tof.get("courses_detected", [])
                            })
                        elif excel_type == "BULK_ACCOUNTS":
                            # Bóc tách và uốn nắn 100% email và role
                            normalized_users = bulk_template_service.normalize_input_accounts_excel(temp_path)
                            parsed_excel_files.append({
                                "is_bulk_accounts": True,
                                "excel_type": "BULK_ACCOUNTS",
                                "filename": fname,
                                "lifecycle_status": lifecycle_status,
                                "turn_index": turn_idx,
                                "is_initial": is_initial,
                                "account_profiles": normalized_users[:50],
                                "identifiers": [u["email"] for u in normalized_users if u.get("email")],
                                "total_users": len(normalized_users)
                            })
                        else:
                            # Phôi tự do (GENERIC)
                            parsed_universal = GenericExcelService.extract_universal_data(file_bytes)
                            parsed_excel_files.append({
                                "is_cof": False,
                                "excel_type": "GENERIC",
                                "filename": fname,
                                "lifecycle_status": lifecycle_status,
                                "turn_index": turn_idx,
                                "is_initial": is_initial,
                                "identifiers": parsed_universal.get("identifiers", []),
                                "courses_detected": parsed_universal.get("courses_detected", []),
                                "repo_urls": parsed_universal.get("repo_urls", []),
                                "school_detected": parsed_universal.get("school_detected"),
                                "account_profiles": parsed_universal.get("account_profiles", [])[:50]
                            })
                except Exception as ex_err:
                    logger.warning(f"⚠️ Lỗi bóc tách Excel [{fname}]: {ex_err}")
                finally:
                    if temp_path and os.path.exists(temp_path):
                        try:
                            os.remove(temp_path)
                        except Exception:
                            pass

            # B. 🎯 TẢI ẢNH CHỤP BÁO LỖI (.png, .jpg, .jpeg, .webp) CHO GEMINI VISION (ƯU TIÊN ẢNH MỚI)
            elif any(fname_lower.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]) and not is_already_done and len(image_parts) < 3:
                try:
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        resp = await client.get(furl)
                        if resp.status_code == 200 and len(resp.content) < 5 * 1024 * 1024:
                            mime = "image/png" if fname_lower.endswith(".png") else "image/webp" if fname_lower.endswith(".webp") else "image/jpeg"
                            image_parts.append({
                                "mime_type": mime,
                                "data": resp.content,
                                "filename": fname
                            })
                            logger.info(f"📸 [Multimodal Vision] Đã nạp ảnh lỗi MỚI [{fname}] vào Gemini Vision!")
                except Exception as img_err:
                    logger.warning(f"⚠️ Lỗi tải ảnh đính kèm [{fname}]: {img_err}")

        # 3. XÂY DỰNG CẤU TRÚC TÓM TẮT TỆP ĐÍNH KÈM CÓ SỔ CÁI PROVENANCE
        excel_summary: Optional[Dict[str, Any]] = None
        if parsed_excel_files:
            # Ưu tiên lấy file mới nhất thuộc nhóm 'new_pending' làm file active
            new_pending_files = [f for f in parsed_excel_files if f.get("lifecycle_status") == "new_pending"]
            new_pending_files.sort(key=lambda x: x.get("turn_index", 0), reverse=True)

            active_file = new_pending_files[0] if new_pending_files else parsed_excel_files[0]
            
            excel_summary = {
                **active_file,
                "provenance_ledger": {
                    "active_new_files": new_active_filenames,
                    "archived_completed_files": archived_filenames
                },
                "all_parsed_files": parsed_excel_files,
                "total_excel_files": len(parsed_excel_files)
            }
        elif raw_content:
            text_parsed = GenericExcelService.parse_universal_text(raw_content)
            if text_parsed.get("identifiers") or text_parsed.get("repo_urls"):
                excel_summary = {
                    "is_cof": False,
                    "filename": "email_raw_text",
                    "lifecycle_status": "new_pending",
                    "provenance_ledger": {
                        "active_new_files": ["email_raw_text"],
                        "archived_completed_files": archived_filenames
                    },
                    "identifiers": text_parsed.get("identifiers", []),
                    "repo_urls": text_parsed.get("repo_urls", []),
                    "courses_detected": text_parsed.get("courses_detected", [])
                }

        # 4. Nạp LMS Catalog
        catalog_context = get_catalog_context(supabase)
        if excel_summary is not None:
            excel_summary["catalog_reference"] = catalog_context
        else:
            excel_summary = {"catalog_reference": catalog_context}

        # 🌟 5. KÉO LỊCH SỬ WORKFLOW ĐÃ THỰC THI ĐỂ NHẮC NHỞ AI BẰNG VĂN BẢN
        historical_context_note = ""
        if rev_no > 1:
            try:
                prev_wf_res = supabase.table("automation_workflows")\
                    .select("title, status, steps, updated_at")\
                    .eq("ticket_id", ticket_id)\
                    .order("version", desc=True)\
                    .limit(1)\
                    .execute()
                if prev_wf_res.data:
                    prev_wf = prev_wf_res.data[0]
                    prev_status = prev_wf.get("status")
                    prev_steps = prev_wf.get("steps") or []
                    done_steps = [s.get("name") for s in prev_steps if s.get("status") in ["success", "succeeded"]]
                    
                    if done_steps:
                        historical_context_note = (
                            f"\n[SỔ CÁI CÔNG VIỆC ĐÃ HOÀN TẤT Ở LƯỢT TRƯỚC]:\n"
                            f"- Trạng thái luồng trước: {prev_status}\n"
                            f"- Các bước ĐÃ THỰC THI THÀNH CÔNG: {', '.join(done_steps)}\n"
                            f"- Các tệp ĐÃ HOÀN TẤT XỬ LÝ (BỎ QUA): {', '.join(archived_filenames) if archived_filenames else 'Không có'}\n"
                            f"- Các tệp MỚI CẦN XỬ LÝ: {', '.join(new_active_filenames) if new_active_filenames else 'Chỉ có văn bản'}\n"
                            f"⚠️ CHỈ TẬP TRUNG BÓC TÁCH Ý ĐỊNH MỚI PHÁT SINH Ở LƯỢT GẦN NHẤT, TUYỆT ĐỐI KHÔNG TẠO LẠI CÁC BƯỚC ĐÃ XONG!"
                        )
            except Exception as h_err:
                logger.warning(f"Lỗi nạp lịch sử workflow: {h_err}")

        # 6. Tóm tắt mềm (Key 1)
        summary_res = gemini_engine.summarize_ticket(
            subject=subject, 
            raw_content=raw_content + historical_context_note, 
            source=source,
            sender_email=sender_email
        )

        if summary_res.model_name != "fast_path_system_filter":
            import asyncio
            await asyncio.sleep(1.2)

        # 7. Bóc tách Sự Thật Vận Hành (Key 2) - ZERO-MOCKUP INVARIANT
        facts_res = gemini_engine.extract_operational_facts(
            subject=subject,
            raw_content=raw_content + historical_context_note,
            source=source,
            excel_summary=excel_summary,
            source_revision_id=revision_id,
            sender_email=sender_email,
            ai_summary=summary_res.summary_vi,
            image_parts=image_parts
        )

        # 8. Lưu assessments vào Supabase
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

        # 9. Đồng bộ metadata vào inbox_tickets
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

        # 10. Lập kế hoạch Workflow (Non-Destructive DAG v7.2)
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
    source_updated_at = ticket_data.get("source_updated_at") or ticket_data.get("updated_at")

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