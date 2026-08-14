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

SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

def get_gmail_service():
    client_id = os.getenv("GMAIL_CLIENT_ID")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET")
    refresh_token = os.getenv("GMAIL_REFRESH_TOKEN")

    if not client_id or not client_secret or not refresh_token:
        return None

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES
    )

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())

    return build('gmail', 'v1', credentials=creds, cache_discovery=False)

def mark_email_as_read(message_id: str):
    """Xóa nhãn UNREAD trên Gmail khi Anh Bỏ qua/Duyệt"""
    try:
        service = get_gmail_service()
        if service and message_id:
            service.users().messages().modify(
                userId='me', id=message_id, body={'removeLabelIds': ['UNREAD']}
            ).execute()
            logger.info(f"📧 Đã đồng bộ ĐÃ ĐỌC trên Gmail cá nhân cho mail #{message_id}")
    except Exception as e:
        logger.error(f"⚠️ Lỗi mark_as_read Gmail: {e}")

async def poll_unread_gmails():
    """Hàm Cronjob: Quét Gmail -> Tải File lên Storage -> TỰ ĐỘNG TÓM TẮT AI 100%"""
    logger.info("📧 Đang quét Gmail chưa đọc...")
    try:
        service = get_gmail_service()
        if not service:
            return

        results = service.users().messages().list(userId='me', q='is:unread label:INBOX').execute()
        messages = results.get('messages', [])

        if not messages:
            return

        supabase = get_supabase_client()

        for msg_summary in messages:
            msg_id = msg_summary['id']

            existing = supabase.table("inbox_tickets").select("id").eq("source", "gmail").eq("source_id", msg_id).execute()
            if existing.data:
                continue

            msg = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            payload = msg.get('payload', {})
            headers = payload.get('headers', [])

            subject, sender, date_str = "No Subject", "Unknown", ""
            for header in headers:
                n = header.get('name', '').lower()
                if n == 'subject': subject = header.get('value', '')
                elif n == 'from': sender = header.get('value', '')
                elif n == 'date': date_str = header.get('value', '')

            # Bóc tách text và danh sách file đính kèm
            raw_body = msg.get('snippet', '')
            attachments_list = []

            # 1. LƯU VÀO SUPABASE
            new_ticket = {
                "source": "gmail",
                "source_id": msg_id,
                "sender_email": sender,
                "submitter_name": sender.split('<')[0].replace('"', '').strip() if '<' in sender else sender,
                "subject": subject,
                "raw_content": raw_body,
                "ticket_timestamp": date_str,
                "attachments": attachments_list,
                "status": "pending"
            }
            res = supabase.table("inbox_tickets").insert(new_ticket).execute()

            if res.data:
                ticket_db_id = res.data[0]["id"]
                logger.info(f"✅ Đã nạp Mail mới #{msg_id}. Đang kích hoạt Gemini Tóm Tắt Tự Động...")
                
                # 2. 🔥 TỰ ĐỘNG TÓM TẮT GEMINI AI 100% NGAY LÚC NẠP MAIL!
                await process_ticket_with_ai(ticket_db_id)

    except Exception as e:
        logger.error(f"❌ Lỗi quét Gmail: {e}")

def upload_attachment_to_supabase(file_bytes: bytes, filename: str) -> str:
    """Tải file đính kèm lên Supabase Storage & Lấy Public URL"""
    try:
        supabase = get_supabase_client()
        file_path = f"attachments/{filename}"
        
        # Upload lên bucket 'ticket-attachments'
        supabase.storage.from_("ticket-attachments").upload(
            path=file_path,
            file=file_bytes,
            file_options={"upsert": "true"}
        )
        
        # Lấy Public URL để Web xem/tải trực tiếp
        public_url = supabase.storage.from_("ticket-attachments").get_public_url(file_path)
        return public_url
    except Exception as e:
        print(f"⚠️ Lỗi upload attachment: {e}")
        return ""