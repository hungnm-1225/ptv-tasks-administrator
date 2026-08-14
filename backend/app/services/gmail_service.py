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

def get_gmail_service():
    """Khởi tạo Gmail API Client bằng Refresh Token"""
    client_id = os.getenv("GMAIL_CLIENT_ID") or os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET") or os.getenv("GOOGLE_CLIENT_SECRET")
    refresh_token = os.getenv("GMAIL_REFRESH_TOKEN") or os.getenv("REFRESH_TOKEN")

    if not client_id or not client_secret or not refresh_token:
        logger.warning("⚠️ Thiếu biến môi trường Gmail trên Render!")
        return None

    # 🎯 ĐÃ GỠ BẪY INVALID_SCOPE: Không truyền 'scopes=...' để Google tự dùng scope gốc của Refresh Token
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret
    )

    if creds.expired or not creds.valid:
        creds.refresh(Request())

    return build('gmail', 'v1', credentials=creds, cache_discovery=False)

def process_gmail_attachments(service, msg_id, payload):
    """Tải tệp đính kèm (Ảnh, PDF, Excel) từ Gmail & Upload lên Supabase Storage Bucket 'ticket-attachments'"""
    attachments = []
    
    def extract_parts_recursive(parts):
        for part in parts:
            filename = part.get('filename')
            body = part.get('body', {})
            att_id = body.get('attachmentId')

            if filename and att_id:
                try:
                    # 1. Tải dữ liệu nhị phân từ Gmail API
                    att = service.users().messages().attachments().get(
                        userId='me', messageId=msg_id, id=att_id
                    ).execute()
                    
                    file_bytes = base64.urlsafe_b64decode(att['data'])

                    # 2. Upload lên Supabase Storage
                    supabase = get_supabase_client()
                    storage_path = f"attachments/{msg_id}_{filename}"
                    
                    supabase.storage.from_("ticket-attachments").upload(
                        path=storage_path,
                        file=file_bytes,
                        file_options={"upsert": "true"}
                    )

                    # 3. Lấy Public URL công khai
                    public_url = supabase.storage.from_("ticket-attachments").get_public_url(storage_path)
                    attachments.append({"filename": filename, "url": public_url})
                    logger.info(f"📎 Đã upload tệp đính kèm [{filename}] lên Supabase Storage!")

                except Exception as e:
                    logger.error(f"⚠️ Lỗi upload attachment [{filename}]: {e}")

            if 'parts' in part:
                extract_parts_recursive(part['parts'])

    if 'parts' in payload:
        extract_parts_recursive(payload['parts'])

    return attachments

async def poll_unread_gmails():
    """Hàm Cronjob chính: Quét hòm thư Gmail, bóc tách tệp đính kèm & lưu Supabase"""
    logger.info("📧 Đang kết nối Gmail API quét Hòm Thư Đến...")
    try:
        service = get_gmail_service()
        if not service:
            return

        # Tìm tất cả mail chưa đọc trong Inbox
        results = service.users().messages().list(userId='me', q='is:unread label:INBOX').execute()
        messages = results.get('messages', [])

        if not messages:
            return

        logger.info(f"📧 Phát hiện {len(messages)} email chưa đọc trong Gmail!")
        supabase = get_supabase_client()

        for msg_summary in messages:
            msg_id = msg_summary['id']

            # Kiểm tra trùng lặp
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
            
            # 🎯 BÓC TÁCH & UPLOAD TỆP ĐÍNH KÈM
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
                logger.info(f"✅ Đã nạp Email mới kèm {len(attachments)} tệp đính kèm vào Supabase: [{subject}]")
                await process_ticket_with_ai(ticket_db_id)

    except Exception as e:
        logger.error(f"❌ Lỗi khi quét Gmail API: {e}")