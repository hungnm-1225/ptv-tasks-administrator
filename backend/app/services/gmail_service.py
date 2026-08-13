# backend/app/services/gmail_service.py
import os
import base64
import logging
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from app.core.supabase import get_supabase_client
from app.core.gemini import process_ticket_with_ai

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def get_gmail_service():
    """Khởi tạo Gmail API client bằng Refresh Token từ Env"""
    client_id = os.getenv("GMAIL_CLIENT_ID")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET")
    refresh_token = os.getenv("GMAIL_REFRESH_TOKEN")

    if not client_id or not client_secret or not refresh_token:
        logger.warning("⚠️ Thiếu GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET hoặc GMAIL_REFRESH_TOKEN trên Render!")
        return None

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES
    )

    # Tự động refresh access token mới nếu cần
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())

    return build('gmail', 'v1', credentials=creds, cache_discovery=False)

def parse_body(payload):
    """Giải mã nội dung Email (Base64)"""
    body = ""
    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                body += base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
            elif 'parts' in part:
                body += parse_body(part)
    elif 'body' in payload and 'data' in payload['body']:
        body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='ignore')
    return body

async def poll_unread_gmails():
    """Hàm Cronjob: Quét hòm thư Gmail lấy Mail chưa đọc & Lưu vào Supabase"""
    logger.info("📧 Đang kết nối Gmail API quét Hòm Thư Đến...")
    try:
        service = get_gmail_service()
        if not service:
            return

        # 1. Tìm tất cả email CHƯA ĐỌC trong Inbox
        results = service.users().messages().list(userId='me', q='is:unread label:INBOX').execute()
        messages = results.get('messages', [])

        if not messages:
            logger.info("📧 Không có email chưa đọc nào mới trong Gmail.")
            return

        logger.info(f"📧 Phát hiện {len(messages)} email chưa đọc trong Gmail!")
        supabase = get_supabase_client()

        for msg_summary in messages:
            msg_id = msg_summary['id']

            # 2. Kiểm tra xem Email ID này đã lưu trong Supabase chưa
            existing = supabase.table("inbox_tickets") \
                .select("id").eq("source", "gmail").eq("source_id", msg_id).execute()

            if existing.data:
                continue

            # 3. Lấy nội dung chi tiết Email
            msg = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            payload = msg.get('payload', {})
            headers = payload.get('headers', [])

            subject = "No Subject"
            sender = "Unknown Sender"
            date_str = ""

            for header in headers:
                name = header.get('name', '').lower()
                if name == 'subject':
                    subject = header.get('value', '')
                elif name == 'from':
                    sender = header.get('value', '')
                elif name == 'date':
                    date_str = header.get('value', '')

            raw_body = parse_body(payload)
            snippet = msg.get('snippet', '')
            final_content = raw_body if raw_body.strip() else snippet

            # 4. LƯU VÀO SUPABASE DATABASE
            new_ticket = {
                "source": "gmail",
                "source_id": msg_id,
                "sender_email": sender,
                "submitter_name": sender.split('<')[0].replace('"', '').strip() if '<' in sender else sender,
                "subject": subject,
                "raw_content": final_content,
                "ticket_timestamp": date_str,
                "status": "pending"
            }
            res = supabase.table("inbox_tickets").insert(new_ticket).execute()

            if res.data:
                ticket_db_id = res.data[0]["id"]
                logger.info(f"✅ Đã nạp Email mới vào Supabase: [{subject}] từ {sender}")
                
                # 5. Kích hoạt Gemini AI phân tích Triage
                await process_ticket_with_ai(ticket_db_id)

    except Exception as e:
        logger.error(f"❌ Lỗi khi quét Gmail API: {e}")