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
    """Đánh dấu ĐÃ ĐỌC trực tiếp trên Gmail cá nhân của Anh"""
    try:
        service = get_gmail_service()
        if service and message_id:
            service.users().messages().modify(
                userId='me', id=message_id, body={'removeLabelIds': ['UNREAD']}
            ).execute()
            logger.info(f"📧 Đã đồng bộ ĐÃ ĐỌC trên Gmail cá nhân cho mail #{message_id}")
    except Exception as e:
        logger.error(f"⚠️ Lỗi mark_as_read Gmail: {e}")

def process_gmail_attachments(service, msg_id, payload):
    """Tải tất cả tệp đính kèm (Ảnh, PDF, Excel) đẩy lên Supabase Storage Bucket 'ticket-attachments'"""
    attachments = []
    if 'parts' not in payload:
        return attachments

    supabase = get_supabase_client()

    for part in payload['parts']:
        filename = part.get('filename')
        body_part = part.get('body', {})
        attachment_id = body_part.get('attachmentId')

        if filename and attachment_id:
            try:
                # 1. Tải file nhị phân từ Gmail API
                att = service.users().messages().attachments().get(
                    userId='me', messageId=msg_id, id=attachment_id
                ).execute()
                file_bytes = base64.urlsafe_b64decode(att['data'])

                # 2. Upload lên Supabase Storage Bucket 'ticket-attachments'
                storage_path = f"gmail/{msg_id}_{filename}"
                supabase.storage.from_("ticket-attachments").upload(
                    path=storage_path,
                    file=file_bytes,
                    file_options={"upsert": "true"}
                )

                # 3. Lấy Public URL
                public_url = supabase.storage.from_("ticket-attachments").get_public_url(storage_path)
                attachments.append({"filename": filename, "url": public_url})
                logger.info(f"📎 Đã tải & lưu file đính kèm [{filename}] lên Supabase Storage!")

            except Exception as e:
                logger.error(f"⚠️ Lỗi upload attachment [{filename}]: {e}")

    return attachments

async def poll_unread_gmails():
    logger.info("📧 Đang kết nối Gmail API quét Hòm Thư Đến...")
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

            existing = supabase.table("inbox_tickets") \
                .select("id").eq("source", "gmail").eq("source_id", msg_id).execute()

            if existing.data:
                continue

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

            snippet = msg.get('snippet', '')
            
            # 🔥 BÓC TÁCH VÀ UPLOAD TỆP ĐÍNH KÈM LÊN SUPABASE STORAGE
            attachments = process_gmail_attachments(service, msg_id, payload)

            new_ticket = {
                "source": "gmail",
                "source_id": msg_id,
                "sender_email": sender,
                "submitter_name": sender.split('<')[0].replace('"', '').strip() if '<' in sender else sender,
                "subject": subject,
                "raw_content": snippet,
                "ticket_timestamp": date_str,
                "status": "pending",
                "attachments": attachments
            }
            res = supabase.table("inbox_tickets").insert(new_ticket).execute()

            if res.data:
                ticket_db_id = res.data[0]["id"]
                logger.info(f"✅ Đã nạp Email mới kèm {len(attachments)} file đính kèm vào Supabase: [{subject}]")
                await process_ticket_with_ai(ticket_db_id)

    except Exception as e:
        logger.error(f"❌ Lỗi khi quét Gmail API: {e}")