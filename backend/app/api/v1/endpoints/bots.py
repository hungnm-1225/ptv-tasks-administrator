# backend/app/api/v1/endpoints/bots.py
import gc
import re
import time
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from app.core.supabase import get_supabase_client
from app.core.config import to_vn_time_str
from app.core.cron_telemetry import get_all_cron_telemetry, mark_cron_finished, get_vn_now_str

# Import Single Coordinator từ tasks endpoint
from app.api.v1.endpoints.tasks import run_approved_task_worker

# Import các hàm Ingestion để ép quét trực tiếp
from app.services.gmail_service import poll_unread_gmails
from app.services.osticket_service import poll_open_ostickets
from app.services.google_sheet_service import poll_form_feedbacks
from app.services.site_monitor_service import poll_site_uptime_cron
from app.services.workspace.workspace_scanner_service import workspace_scanner_service

router = APIRouter()
VN_TZ = timezone(timedelta(hours=7))

# =============================================================================
# ⚡ IN-MEMORY CACHE CHO BOT STATUS & LOGS (TIER B STATUS - BUDGET <= 40MB)
# =============================================================================
from app.core.cache_policy import BoundedMemoryCache, CacheTier

bots_cache = BoundedMemoryCache(tier=CacheTier.TIER_B_STATUS, max_entries=10, default_ttl=15)


def format_vn_time(val: Any) -> str:
    """Chuyển đổi mọi định dạng thời gian sang chuỗi giờ Việt Nam chuẩn (GMT+7)."""
    return to_vn_time_str(val)

def is_valid_uuid(val: str) -> bool:
    """Kiểm tra xem chuỗi có phải là UUID hợp lệ không."""
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False

def clean_log_message(raw_msg: str, bot_type: str, short_task_id: str) -> str:
    """
    Thuật toán khử sạch tiền tố trùng lặp trên message.
    """
    msg = raw_msg.strip()

    tags_to_strip = [
        rf"\[{re.escape(bot_type)}\]",
        rf"\[#{re.escape(short_task_id)}\]",
        rf"\[Task\s*#{re.escape(short_task_id)}\]",
        rf"\[{re.escape(bot_type)}\]:?",
        rf"{re.escape(bot_type)}:?"
    ]
    for _ in range(3):
        for pattern in tags_to_strip:
            msg = re.sub(rf"^{pattern}\s*:?\s*", "", msg, flags=re.IGNORECASE).strip()

    msg = re.sub(r"Request\s*#None\s*", "Request — ", msg, flags=re.IGNORECASE)
    msg = re.sub(r"#None\s*", "", msg, flags=re.IGNORECASE)
    msg = re.sub(r"\(\s*\)\.", ".", msg)

    return msg.strip()

def parse_log_line_with_timestamp(line: str, fallback_time_str: str, bot_type: str = "", short_task_id: str = "") -> Tuple[str, str, str, str]:
    """
    Bóc tách: (Timestamp GMT+7, Log Level, Event Taxonomy, Nội dung thông điệp sạch).
    Chống cộng đúp múi giờ nếu chuỗi timestamp đã là giờ Việt Nam.
    """
    raw = line.strip()
    actual_time = fallback_time_str
    level = "INFO"
    event_type = "GENERAL"

    # Trích xuất Timestamp gốc [YYYY-MM-DD HH:MM:SS]
    ts_match = re.match(r"^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]\s*", raw)
    if ts_match:
        ts_raw = ts_match.group(1)
        # Chỉ chuyển đổi nếu có đánh dấu múi giờ Z hoặc offset; nếu là naive time thì giữ nguyên fallback
        if "Z" in ts_raw or "+" in ts_raw or "-" in ts_raw[10:]:
            actual_time = to_vn_time_str(ts_raw)
        else:
            # Chuỗi đã ở dạng YYYY-MM-DD HH:MM:SS cục bộ
            actual_time = ts_raw[:19].replace("T", " ")
        raw = raw[ts_match.end():].strip()

    # Trích xuất Level hoặc Event Taxonomy
    tag_match = re.match(r"^\[(LIFECYCLE|STATE|API|PLAYWRIGHT|CHECKPOINT|RETRY|CRON|MEMORY|RESULT|APPROVAL|INFO|SUCCESS|ERROR|WARNING|DEBUG|CRITICAL)\]\s*", raw, flags=re.IGNORECASE)
    if tag_match:
        matched_tag = tag_match.group(1).upper()
        if matched_tag in ["LIFECYCLE", "STATE", "API", "PLAYWRIGHT", "CHECKPOINT", "RETRY", "CRON", "MEMORY", "RESULT"]:
            event_type = matched_tag
        elif matched_tag == "APPROVAL":
            event_type = "LIFECYCLE"
            level = "SUCCESS"
        else:
            level = "SUCCESS" if matched_tag in ["SUCCESS"] else ("ERROR" if matched_tag in ["ERROR", "CRITICAL"] else matched_tag)
        raw = raw[tag_match.end():].strip()

        tag2_match = re.match(r"^\[(LIFECYCLE|STATE|API|PLAYWRIGHT|CHECKPOINT|RETRY|CRON|MEMORY|RESULT|APPROVAL|INFO|SUCCESS|ERROR|WARNING)\]\s*", raw, flags=re.IGNORECASE)
        if tag2_match:
            t2 = tag2_match.group(1).upper()
            if t2 in ["LIFECYCLE", "STATE", "API", "PLAYWRIGHT", "CHECKPOINT", "RETRY", "CRON", "MEMORY", "RESULT"]:
                event_type = t2
            else:
                level = t2
            raw = raw[tag2_match.end():].strip()
    else:
        if "checkpoint" in raw.lower():
            event_type = "CHECKPOINT"
        elif "playwright" in raw.lower() or "chromium" in raw.lower():
            event_type = "PLAYWRIGHT"
        elif "api" in raw.lower():
            event_type = "API"
        elif "cron" in raw.lower():
            event_type = "CRON"

        if "success" in raw.lower() or "thành công" in raw.lower():
            level = "SUCCESS"
        elif "error" in raw.lower() or "fail" in raw.lower() or "lỗi" in raw.lower():
            level = "ERROR"
        elif "warning" in raw.lower() or "cảnh báo" in raw.lower():
            level = "WARNING"

    clean_msg = clean_log_message(raw, bot_type, short_task_id)
    return actual_time, level, event_type, clean_msg


@router.get("/status")
async def get_bot_workers_status() -> Dict[str, Any]:
    """Kiểm tra trạng thái Real-time chi tiết kèm số lượng task lỗi của từng Worker."""
    cache_key = "bot_workers_status"
    cached = bots_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()

    cron_mapping = {
        "gmail_sync_worker": "gmail_cron",
        "osticket_sync_worker": "osticket_cron",
        "feedback_sheet_worker": "sheet_cron",
        "distributor_cache_worker": "distributor_cache_scanner_cron",
    }

    worker_stats = {}
    for w_key, c_id in cron_mapping.items():
        t = cron_telemetry.get(c_id, {})
        worker_stats[w_key] = {
            "status": "degraded" if t.get("status") == "error" else "active",
            "failed_count": t.get("failed_count", 0),
            "last_status": t.get("status", "idle"),
            "last_run_at": t.get("last_run_at"),
            "next_run_at": t.get("next_run_at"),
            "duration_seconds": t.get("duration_seconds"),
            "last_message": t.get("last_message")
        }
    execution_keys = [
        "workspace_license_worker", 
        "keycloak_api_worker", 
        "lms_git_worker", 
        "github_dispatcher"
    ]
    for e_key in execution_keys:
        worker_stats[e_key] = {
            "status": "active", 
            "failed_count": 0, 
            "last_status": "idle",
            "last_run_at": None,
            "next_run_at": None,
            "duration_seconds": None,
            "last_message": None
        }

    try:
        failed_res = supabase.table("bot_automation_tasks")\
            .select("bot_type")\
            .eq("execution_status", "failed")\
            .execute()

        for row in (failed_res.data or []):
            b_type = row.get("bot_type")
            if b_type == "workspace_rpa":
                worker_stats["workspace_license_worker"]["failed_count"] += 1
            elif b_type == "keycloak_api":
                worker_stats["keycloak_api_worker"]["failed_count"] += 1
            elif b_type in ["lms_playwright", "lms_git_provisioning", "git_collaborator", "git_playwright"]:
                worker_stats["lms_git_worker"]["failed_count"] += 1
            elif b_type == "github_issue_creator":
                worker_stats["github_dispatcher"]["failed_count"] += 1
            elif b_type in ["google_doc_comment", "feedback_doc_triage"]:
                worker_stats["feedback_sheet_worker"]["failed_count"] += 1

        for k, v in worker_stats.items():
            if v["failed_count"] > 0:
                v["status"] = "degraded"

        bots_cache.set(cache_key, worker_stats, ttl=15)
    except Exception as e:
        logger.error(f"Error checking detailed worker status: {e}")

    return worker_stats


@router.get("/logs")
async def get_bot_terminal_logs() -> List[Dict[str, Any]]:
    """Lấy danh sách log thực thi: Làm sạch triệt để các khối log bị trùng lặp."""
    cache_key = "bot_terminal_logs"
    cached = bots_cache.get(cache_key)
    if cached is not None:
        return cached

    supabase = get_supabase_client()
    logs_output = []

    try:
        tasks_res = supabase.table("bot_automation_tasks")\
            .select("id, bot_type, approval_status, execution_status, execution_logs, created_at, executed_at")\
            .order("created_at", desc=True)\
            .limit(30)\
            .execute()

        tasks = tasks_res.data or []

        for t in reversed(tasks):
            t_id_short = str(t.get("id", "")).replace("-", "")[:8]
            b_type = t.get("bot_type") or "Worker"
            e_status = t.get("execution_status") or "queued"

            created_time_str = format_vn_time(t.get("created_at"))
            executed_time_str = format_vn_time(t.get("executed_at") or t.get("created_at"))

            # Dòng thông báo queued
            logs_output.append({
                "timestamp": created_time_str,
                "level": "INFO",
                "worker": b_type,
                "task_id": t_id_short,
                "message": f"Task #{t_id_short} queued with status '{t.get('approval_status')}'.",
                "raw_line": f"[{created_time_str}] [INFO] [{b_type}] [#{t_id_short}]: Task queued with status '{t.get('approval_status')}'."
            })

            # Phân tích từng dòng log thực thi (Có cơ chế chống lặp dòng liên tiếp)
            if t.get("execution_logs"):
                seen_lines = set()
                for line in t["execution_logs"].split("\n"):
                    trimmed_line = line.strip()
                    if not trimmed_line:
                        continue

                    # Bỏ qua dòng bị trùng lặp hoàn toàn trong cùng một task
                    line_key = re.sub(r"^\[\d{4}-\d{2}-\d{2}[^\]]+\]\s*", "", trimmed_line).strip()
                    if line_key in seen_lines and len(line_key) > 10:
                        continue
                    seen_lines.add(line_key)

                    line_time, line_level, line_event, clean_msg = parse_log_line_with_timestamp(
                        trimmed_line,
                        fallback_time_str=executed_time_str,
                        bot_type=b_type,
                        short_task_id=t_id_short
                    )

                    if clean_msg:
                        logs_output.append({
                            "timestamp": line_time,
                            "level": line_level,
                            "event": line_event,
                            "worker": b_type,
                            "task_id": t_id_short,
                            "message": clean_msg,
                            "raw_line": f"[{line_time}] [{line_event}] [{line_level}] [{b_type}] [#{t_id_short}]: {clean_msg}"
                        })

            elif e_status == "success":
                logs_output.append({
                    "timestamp": executed_time_str,
                    "level": "SUCCESS",
                    "worker": b_type,
                    "task_id": t_id_short,
                    "message": f"Task #{t_id_short} executed successfully.",
                    "raw_line": f"[{executed_time_str}] [SUCCESS] [{b_type}] [#{t_id_short}]: Executed successfully."
                })
            elif e_status == "failed":
                logs_output.append({
                    "timestamp": executed_time_str,
                    "level": "ERROR",
                    "worker": b_type,
                    "task_id": t_id_short,
                    "message": f"Task #{t_id_short} execution failed.",
                    "raw_line": f"[{executed_time_str}] [ERROR] [{b_type}] [#{t_id_short}]: Execution failed."
                })

        bots_cache.set(cache_key, logs_output, ttl=10)
    except Exception as e:
        now_str = format_vn_time(None)
        logs_output.append({
            "timestamp": now_str,
            "level": "ERROR",
            "worker": "System",
            "task_id": "N/A",
            "message": f"Failed to fetch execution logs: {str(e)}",
            "raw_line": f"[{now_str}] [ERROR] [System]: {str(e)}"
        })

    return logs_output


@router.post("/force-sync/{sync_type}")
async def force_sync_pipeline(sync_type: str, background_tasks: BackgroundTasks):
    """⚡ ÉP QUÉT NGAY LẬP TỨC CHO CÁC LUỒNG INGESTION."""
    now_str = format_vn_time(None)
    bots_cache.invalidate()

    sync_map = {
        "gmail": (poll_unread_gmails, "gmail_cron", "Gmail @dtt.vn"),
        "osticket": (poll_open_ostickets, "osticket_cron", "OS Ticket Support"),
        "sheet": (poll_form_feedbacks, "sheet_cron", "Google Sheet Feedback"),
        "distributor_cache": (workspace_scanner_service.scan_and_cache_all_distributors, "distributor_cache_scanner_cron", "5 Nhà Phân Phối"),
        "site_uptime": (poll_site_uptime_cron, "site_uptime_cron", "10 Trang Web")
    }

    if sync_type not in sync_map:
        raise HTTPException(status_code=400, detail=f"Không hỗ trợ luồng đồng bộ: {sync_type}")

    func, cron_id, label = sync_map[sync_type]

    async def manual_run_wrapper():
        start_ts = time.perf_counter()
        try:
            await func()
            dur = time.perf_counter() - start_ts
            mark_cron_finished(cron_id, status="success", duration=dur, message="Ép quét thủ công hoàn tất")
        except Exception as err:
            dur = time.perf_counter() - start_ts
            mark_cron_finished(cron_id, status="error", duration=dur, message=f"Lỗi ép quét: {str(err)[:80]}")
        finally:
            gc.collect()

    background_tasks.add_task(manual_run_wrapper)
    msg = f"Đã kích hoạt quét {label} tức thì thành công!"

    return {
        "status": "success",
        "sync_type": sync_type,
        "message": f"[{now_str}] {msg}",
        "timestamp": now_str
    }


@router.post("/purge-memory")
async def purge_system_memory():
    """🧹 CHỦ ĐỘNG DỌN DẸP BỘ NHỚ RAM (GARBAGE COLLECTION)."""
    gc.collect()
    bots_cache.invalidate()
    now_str = format_vn_time(None)
    return {
        "status": "success",
        "message": f"[{now_str}] Đã kích hoạt giải phóng bộ nhớ đệm RAM thành công!",
        "timestamp": now_str
    }


@router.post("/{task_id}/retry")
async def retry_bot_task(task_id: str, background_tasks: BackgroundTasks):
    """Kích hoạt chạy lại cho một Task cụ thể."""
    supabase = get_supabase_client()
    now_str = format_vn_time(None)
    now_iso = datetime.now(timezone.utc).isoformat()
    bots_cache.invalidate()

    if not is_valid_uuid(task_id):
        worker_key = task_id
        bot_type_map = {
            "workspace_license_worker": "workspace_rpa",
            "keycloak_api_worker": "keycloak_api",
            "lms_git_worker": "lms_playwright",
            "github_dispatcher": "github_issue_creator",
            "feedback_sheet_worker": "feedback_doc_triage"
        }

        target_bot_type = bot_type_map.get(worker_key)
        if not target_bot_type:
            if worker_key == "gmail_sync_worker":
                background_tasks.add_task(poll_unread_gmails)
            elif worker_key == "osticket_sync_worker":
                background_tasks.add_task(poll_open_ostickets)
            return {
                "status": "worker_triggered",
                "message": f"Đã kích hoạt luồng [{worker_key}] thành công!",
                "timestamp": now_str
            }

        failed_tasks = supabase.table("bot_automation_tasks")\
            .select("*")\
            .eq("bot_type", target_bot_type)\
            .eq("execution_status", "failed")\
            .limit(3)\
            .execute()

        count = len(failed_tasks.data or [])
        if count == 0:
            return {
                "status": "no_failed_tasks",
                "message": f"Worker [{worker_key}] không có task nào bị lỗi cần chạy lại!",
                "timestamp": now_str
            }

        for t in (failed_tasks.data or []):
            t_id = t["id"]
            short_id = str(t_id).replace("-", "")[:8]
            t_payload = t.get("payload_data") or {}
            t_payload["task_id"] = t_id

            supabase.table("bot_automation_tasks").update({
                "execution_status": "queued",
                "approval_status": "approved",
                "execution_logs": f"[{now_iso}] [RETRY] [Task #{short_id}]: Batch retry triggered by Admin\n" + (t.get("execution_logs") or "")
            }).eq("id", t_id).execute()

            background_tasks.add_task(
                run_approved_task_worker,
                task_id=t_id,
                bot_type=t.get("bot_type"),
                payload=t_payload,
                ticket_id=t.get("ticket_id")
            )

        return {
            "status": "batch_retry_queued",
            "requeued_count": count,
            "message": f"Đã đưa {count} tác vụ lỗi của [{worker_key}] vào điều phối chạy lại chuẩn mực!",
            "timestamp": now_str
        }

    try:
        task_res = supabase.table("bot_automation_tasks").select("*").eq("id", task_id).execute()
        if not task_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy task tương ứng trong database.")

        task = task_res.data[0]
        short_id = str(task_id).replace("-", "")[:8]
        t_payload = task.get("payload_data") or {}
        t_payload["task_id"] = task_id

        supabase.table("bot_automation_tasks").update({
            "execution_status": "queued",
            "approval_status": "approved",
            "execution_logs": f"[{now_iso}] [RETRY] [Task #{short_id}]: Manual retry triggered by Admin\n" + (task.get("execution_logs") or "")
        }).eq("id", task_id).execute()

        background_tasks.add_task(
            run_approved_task_worker,
            task_id=task_id,
            bot_type=task.get("bot_type"),
            payload=t_payload,
            ticket_id=task.get("ticket_id")
        )

        return {
            "status": "retry_queued",
            "task_id": task_id,
            "message": f"Tác vụ #{short_id} đã được đưa vào điều phối thực thi lại chuẩn mực.",
            "timestamp": now_str
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi retry task: {str(e)}")