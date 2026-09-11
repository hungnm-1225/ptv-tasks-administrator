# backend/app/api/v1/endpoints/tickets.py
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client
from app.core.gemini import gemini_engine
from app.workers.ticket_processor import (
    process_ticket_revision,
    create_or_get_ticket_revision
)
from app.services.osticket_service import poll_open_ostickets
from app.services.gmail_service import poll_unread_gmails
from app.core.cache_policy import BoundedMemoryCache, CacheTier

router = APIRouter()

# In-Memory Cache cho Inbox Tickets (Tier C Summary - Budget <= 40MB)
tickets_cache = BoundedMemoryCache(tier=CacheTier.TIER_C_SUMMARY, max_entries=15, default_ttl=60)


@router.get("")
@router.get("/")
async def list_tickets(
    status: Optional[str] = Query("all"),
    category: Optional[str] = Query("all"),
    source: Optional[str] = Query("all"),
    sort: str = Query("desc", regex="^(desc|asc)$")
):
    """Lấy danh sách tickets từ Supabase hỗ trợ lọc đa tầng (RAM Cache 1ms)."""
    cache_key = f"tickets_{status}_{category}_{source}_{sort}"
    cached = tickets_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    try:
        query = supabase.table("inbox_tickets").select("*")

        if status and status != "all":
            query = query.eq("status", status)
        elif status == "all":
            query = query.neq("status", "dismissed")

        if category and category != "all":
            query = query.eq("category", category)

        if source and source != "all":
            query = query.eq("source", source)

        query = query.order("created_at", desc=(sort == "desc"))

        res = query.limit(300).execute()
        data = res.data or []
        tickets_cache.set(cache_key, data, ttl=60)
        return data
    except Exception as e:
        print(f"❌ Lỗi tải tickets: {e}")
        return []


# =============================================================================
# 🚀 ENDPOINTS KÍCH HOẠT ĐỒNG BỘ THỦ CÔNG (SYNC ON-DEMAND)
# =============================================================================
@router.post("/sync/osticket")
async def trigger_sync_osticket(background_tasks: BackgroundTasks):
    """Kích hoạt quét cào OS Ticket ngay lập tức chạy ngầm."""
    async def run_sync_and_clear_cache():
        try:
            await poll_open_ostickets()
        finally:
            tickets_cache.invalidate()

    background_tasks.add_task(run_sync_and_clear_cache)
    return {"status": "success", "message": "🚀 Đã kích hoạt quét OS Ticket chạy ngầm!"}


@router.post("/sync/gmail")
async def trigger_sync_gmail(background_tasks: BackgroundTasks):
    """Kích hoạt quét Gmail ngay lập tức chạy ngầm."""
    async def run_sync_and_clear_cache():
        try:
            await poll_unread_gmails()
        finally:
            tickets_cache.invalidate()

    background_tasks.add_task(run_sync_and_clear_cache)
    return {"status": "success", "message": "🚀 Đã kích hoạt quét Gmail chạy ngầm!"}


@router.put("/{ticket_id}/complete")
async def complete_ticket(ticket_id: str):
    """Đánh dấu hoàn thành thủ công một ticket."""
    supabase = get_supabase_client()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        res = supabase.table("inbox_tickets").update({
            "status": "completed",
            "updated_at": now_iso
        }).eq("id", ticket_id).execute()
        
        tickets_cache.invalidate()
        return {"status": "success", "message": f"Đã đánh dấu hoàn thành ticket #{ticket_id[:8]}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{ticket_id}/dismiss")
async def dismiss_ticket(ticket_id: str):
    """Đưa ticket vào mục Đã Bỏ Qua (dismissed)."""
    supabase = get_supabase_client()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        supabase.table("inbox_tickets").update({
            "status": "dismissed",
            "updated_at": now_iso
        }).eq("id", ticket_id).execute()

        ticket_res = supabase.table("inbox_tickets").select("source, source_id").eq("id", ticket_id).execute()
        if ticket_res.data and ticket_res.data[0].get("source") == "gmail":
            msg_id = ticket_res.data[0].get("source_id")
            try:
                from app.services.gmail_service import mark_email_as_read
                mark_email_as_read(msg_id)
            except Exception:
                pass

        tickets_cache.invalidate()
        return {"status": "success", "message": "Đã chuyển ticket vào mục Đã Bỏ Qua."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{ticket_id}/restore")
async def restore_ticket(ticket_id: str):
    """Khôi phục ticket về trạng thái PENDING."""
    supabase = get_supabase_client()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        supabase.table("inbox_tickets").update({
            "status": "pending",
            "updated_at": now_iso
        }).eq("id", ticket_id).execute()
        
        tickets_cache.invalidate()
        return {"status": "success", "message": "Đã khôi phục ticket về Hòm Thư."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{ticket_id}/category")
async def update_ticket_category(ticket_id: str, payload: Dict[str, Any]):
    """Cập nhật nhanh phân loại category của ticket."""
    supabase = get_supabase_client()
    new_cat = payload.get("category", "other")
    try:
        supabase.table("inbox_tickets").update({"category": new_cat}).eq("id", ticket_id).execute()
        tickets_cache.invalidate()
        return {"status": "success", "category": new_cat}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# 🧠 DUAL RE-ANALYSIS APIS (PROVENANCE & AUDIT TRACKING)
# =============================================================================

@router.post("/{ticket_id}/re-summarize")
async def re_summarize_ticket(ticket_id: str):
    """
    Chỉ làm tươi lại bản tóm tắt Inbox (Soft Summary):
    - Không làm thay đổi kế hoạch Workflow hay Intent vận hành.
    - Ghi nhận đầy đủ bản đánh giá mới vào ticket_ai_assessments để đảm bảo Provenance!
    """
    supabase = get_supabase_client()
    res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket.")

    ticket = res.data[0]
    raw_content = ticket.get("raw_content") or ""
    attachments = ticket.get("attachments") or []

    # 1. Lấy hoặc tạo revision snapshot chuẩn hóa
    revision_id, rev_no, _ = create_or_get_ticket_revision(
        ticket_id=ticket_id,
        raw_content=raw_content,
        attachments=attachments,
        source_updated_at=ticket.get("updated_at")
    )

    if not revision_id:
        raise HTTPException(status_code=500, detail="Không thể xác định revision để cập nhật tóm tắt.")

    # 2. Gọi AI Tóm tắt mềm
    summary_res = gemini_engine.summarize_ticket(
        subject=ticket.get("subject", ""),
        raw_content=raw_content,
        source=ticket.get("source", "gmail")
    )

    # 3. Ghi vết đánh giá vào ticket_ai_assessments (Bắt buộc theo chuẩn Provenance)
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("ticket_ai_assessments").insert({
            "ticket_revision_id": revision_id,
            "assessment_kind": "summary",
            "model_name": summary_res.model_name or "fallback",
            "prompt_version": summary_res.prompt_version,
            "registry_version": "v1.1.0",
            "structured_result": summary_res.model_dump(),
            "status": "completed",
            "created_at": now_iso
        }).execute()
    except Exception as assess_err:
        print(f"⚠️ Lỗi lưu ticket_ai_assessments trong /re-summarize: {assess_err}")

    # 4. Cập nhật bản tóm tắt hiển thị trên UI
    supabase.table("inbox_tickets").update({
        "ai_summary": summary_res.summary_vi,
        "category": summary_res.category,
        "priority": summary_res.priority,
        "updated_at": now_iso
    }).eq("id", ticket_id).execute()

    tickets_cache.invalidate()
    return {
        "status": "success",
        "message": "Đã cập nhật lại bản tóm tắt AI và lưu lịch sử provenance cho ticket.",
        "summary": summary_res.model_dump(),
        "revision_id": revision_id
    }


@router.post("/{ticket_id}/re-assess-intent")
async def re_assess_ticket_intent(ticket_id: str):
    """
    Đánh giá lại sự thật vận hành & Tái lập Proposal mới:
    - Bắt buộc gọi Gemini trích xuất lại Intent có bằng chứng.
    - Sử dụng Một Cửa Tiếp Nhận chuẩn hóa: create_or_get_ticket_revision.
    - Tạo assessment mới và lưu proposal version mới.
    """
    supabase = get_supabase_client()
    res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket.")

    ticket = res.data[0]
    raw_content = ticket.get("raw_content") or ""
    attachments = ticket.get("attachments") or []

    # 1. Lấy hoặc tạo revision chuẩn hóa tập trung (Không hard-code revision_no = 1)
    revision_id, rev_no, _ = create_or_get_ticket_revision(
        ticket_id=ticket_id,
        raw_content=raw_content,
        attachments=attachments,
        source_updated_at=ticket.get("updated_at")
    )

    if not revision_id:
        raise HTTPException(status_code=500, detail="Không thể xác định revision để đánh giá lại ý định.")

    # 2. Kích hoạt Canonical Intake Orchestrator
    result = await process_ticket_revision(revision_id)
    tickets_cache.invalidate()

    return {
        "status": "success",
        "message": "✨ Đã đánh giá lại toàn diện ý định và lập Proposal mới thành công!",
        "result": result
    }


@router.post("/{ticket_id}/triage")
async def force_ai_triage(ticket_id: str):
    """Bí danh tương thích ngược: Tự động trỏ vào /re-assess-intent."""
    return await re_assess_ticket_intent(ticket_id)