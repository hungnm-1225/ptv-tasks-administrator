# backend/app/services/google_sheet_service.py
import os
import json
import logging
from datetime import datetime
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from app.core.supabase import get_supabase_client
from app.core.gemini import process_ticket_with_ai

logger = logging.getLogger(__name__)

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

def get_google_credentials():
    creds_json_str = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if not creds_json_str:
        raise ValueError("❌ THIẾU GOOGLE_CREDENTIALS_JSON trên Render!")
    info = json.loads(creds_json_str)
    return Credentials.from_service_account_info(info, scopes=SCOPES)

def get_sheets_service():
    creds = get_google_credentials()
    return build('sheets', 'v4', credentials=creds, cache_discovery=False)

def get_valid_sheet_name(service, spreadsheet_id: str, requested_name: str = "Form_Responses") -> str:
    """Tự động kiểm tra xem Tab tên là Form_Responses hay Feedbacks"""
    try:
        spreadsheet_info = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheet_names = [s['properties']['title'] for s in spreadsheet_info.get('sheets', [])]
        if requested_name in sheet_names:
            return requested_name
        if "Feedbacks" in sheet_names:
            return "Feedbacks"
        return sheet_names[0] if sheet_names else requested_name
    except Exception as e:
        logger.error(f"Lỗi đọc tên Sheet: {e}")
        return requested_name

def parse_sheet_timestamp(timestamp_raw: str) -> Optional[str]:
    """Parse ngày giờ cột A (ví dụ '6/17/2026 9:22:47' hoặc '24/06/2026 08:33:39') sang ISO string."""
    if not timestamp_raw:
        return None
    for fmt in ("%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %I:%M:%S %p", "%d/%m/%Y %I:%M:%S %p", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(timestamp_raw.strip(), fmt).isoformat() + "+07:00"
        except ValueError:
            pass
    return None

# =========================================================================
# 1. HÀM QUÉT INGESTION: ĐỌC GOOGLE SHEET ➔ LƯU ĐẦY ĐỦ VÀO SUPABASE
# =========================================================================
async def poll_form_feedbacks():
    """Hàm Cronjob: Quét Google Sheet Form Feedback & Lưu đầy đủ vào Supabase kèm Thời Gian Thật"""
    logger.info("🔎 Đang quét Google Sheet Form Feedback...")
    try:
        spreadsheet_id = os.getenv("SPREADSHEET_ID")
        service = get_sheets_service()
        target_sheet = get_valid_sheet_name(service, spreadsheet_id, "Form_Responses")

        # Đọc dữ liệu từ dòng 2
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{target_sheet}'!A2:P100"
        ).execute()
        rows = result.get('values', [])

        supabase = get_supabase_client()

        for index, row in enumerate(rows, start=2):
            def get_col(idx):
                return row[idx].strip() if idx < len(row) else ""

            timestamp_raw = get_col(0) # Cột A (Timestamp)
            country = get_col(2)       # Cột C (COUNTRY)
            submitter = get_col(3)     # Cột D (SUBMITTER NAME)
            subject = get_col(5)       # Cột F (SUBJECT)
            doc_url = get_col(6)       # Cột G (REPORT GoogleDoc)
            remarks = get_col(7)       # Cột H (REMARKS)
            fb_id = get_col(8)         # Cột I (FB ID)
            assigned_cb = get_col(12)  # Cột M (Assigned Checkbox)

            # Nếu chưa gán (Assigned != TRUE) và có dữ liệu
            if assigned_cb.upper() != "TRUE" and (submitter or subject or fb_id):
                real_fb_id = fb_id if fb_id else f"FB-ROW-{index}"
                
                # Kiểm tra trùng lặp trong Supabase
                existing = supabase.table("inbox_tickets") \
                    .select("id").eq("source", "google_form").eq("source_id", real_fb_id).execute()

                if not existing.data:
                    created_at_iso = parse_sheet_timestamp(timestamp_raw)

                    new_ticket = {
                        "source": "google_form",
                        "source_id": real_fb_id,
                        "sender_email": submitter if "@" in submitter else "form_user@dtt.vn",
                        "submitter_name": submitter,
                        "subject": subject,
                        "raw_content": f"Form Feedback: {subject}\nRemarks: {remarks}\nGoogle Doc: {doc_url}",
                        "country": country,
                        "doc_url": doc_url,
                        "ticket_timestamp": timestamp_raw,
                        "status": "pending",
                        "metadata": {"row_index": index, "doc_url": doc_url, "sheet_name": target_sheet, "remarks": remarks}
                    }
                    if created_at_iso:
                        new_ticket["created_at"] = created_at_iso

                    res = supabase.table("inbox_tickets").insert(new_ticket).execute()
                    if res.data:
                        logger.info(f"✅ Đã lưu Form Feedback mới vào Supabase: {real_fb_id} (Gửi lúc: {timestamp_raw})")
                        await process_ticket_with_ai(res.data[0]["id"])

    except Exception as e:
        logger.error(f"❌ Lỗi khi quét và lưu Google Sheet: {e}")

# =========================================================================
# 2. HÀM ĐỒNG BỘ NGƯỢC: CẬP NHẬT SHEET KHI ANH BẤM DUYỆT TRÊN WEB / TELEGRAM
# =========================================================================
async def update_feedback_row(sheet_name: str, row_index: int, category: str, status: str = "To Implement"):
    """Cập nhật Cột L (Category), Cột M (Assigned Checkbox = TRUE), Cột P (Status) trên Google Sheet"""
    try:
        spreadsheet_id = os.getenv("SPREADSHEET_ID")
        service = get_sheets_service()
        target_sheet = get_valid_sheet_name(service, spreadsheet_id, sheet_name)

        # 1. Cập nhật Category (Cột L) và Assigned Checkbox = TRUE (Cột M)
        range_lm = f"'{target_sheet}'!L{row_index}:M{row_index}"
        body_lm = {"values": [[category, True]]}
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=range_lm,
            valueInputOption="USER_ENTERED",
            body=body_lm
        ).execute()

        # 2. Cập nhật Status (Cột P)
        range_p = f"'{target_sheet}'!P{row_index}"
        body_p = {"values": [[status]]}
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=range_p,
            valueInputOption="USER_ENTERED",
            body=body_p
        ).execute()

        logger.info(f"✅ Đã đồng bộ ngược Google Sheet dòng {row_index}: Category={category}, Assigned=TRUE, Status={status}")
    except Exception as e:
        logger.error(f"⚠️ Lỗi khi đồng bộ ngược về Google Sheet: {e}")