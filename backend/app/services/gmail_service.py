# backend/app/services/gmail_service.py
import os
import gc
import base64
import logging
import mimetypes
from datetime import datetime, timezone
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from app.core.supabase import get_supabase_client
from app.workers.ticket_processor import process_incoming_ticket

logger = logging.getLogger(__name__)

_GMAIL_SERVICE = None
_GMAIL_CREDS = None


def get_gmail_service():
    """Khởi tạo & Tái sử dụng Gmail API Client bằng Refresh Token (Singleton)."""
    global _GMAIL_SERVICE, _GMAIL_CREDS

    client_id = os.getenv("GMAIL_CLIENT_ID") or os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET") or os.getenv("GOOGLE_CLIENT_SECRET")
    refresh_token = os.getenv("GMAIL_REFRESH_TOKEN") or os.getenv("REFRESH_TOKEN")

    if not client_id or not client_secret or not refresh_token:
        logger.warning("⚠️ Thiếu biến môi trường Gmail trên Render!")
        return None

    try:
        if _GMAIL_CREDS and _GMAIL_CREDS.valid and _GMAIL_SERVICE:
            return _GMAIL_SERVICE

        if not _GMAIL_CREDS:
            _GMAIL_CREDS = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret
            )

        if _GMAIL_CREDS.expired or not _GMAIL_CREDS.valid:
            _GMAIL_CREDS.refresh(Request())

        _GMAIL_SERVICE = build('gmail', 'v1', credentials=_GMAIL_CREDS, cache_discovery=False)
        return _GMAIL_SERVICE
    except Exception as e:
        logger.error(f"❌ Lỗi khởi tạo Gmail Service: {e}")
        return None


def extract_gmail_body(payload: dict) -> str:
    """Giải mã toàn bộ nội dung thư (Plain text hoặc HTML) từ Gmail API payload."""
    body_text = ""

    def extract_parts_recursive(parts):
        nonlocal body_text
        plain_texts = []
        html_texts = []

        for part in parts:
            mime = part.get("mimeType", "").lower()
            body = part.get("body", {})
            data = body.get("data")

            if "parts" in part:
                extract_parts_recursive(part["parts"])

            if data:
                try:
                    decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
                    if mime == "text/plain":
                        plain_texts.append(decoded)
                    elif mime == "text/html":
                        html_texts.append(decoded)
                except Exception as ex:
                    logger.warning(f"Lỗi decode MIME part: {ex}")

        if plain_texts:
            body_text = "\n".join(plain_texts)
        elif html_texts and not body_text:
            body_text = "\n".join(html_texts)

    if "data" in payload.get("body", {}):
        try:
            data = payload["body"]["data"]
            body_text = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
        except Exception as ex:
            logger.warning(f"Lỗi decode direct body: {ex}")

    if not body_text and "parts" in payload:
        extract_parts_recursive(payload["parts"])

    return body_text.strip()


def mark_email_as_read(msg_id: str):
    """Gỡ nhãn UNREAD của 1 email trên Gmail."""
    try:
        service = get_gmail_service()
        if service:
            service.users().messages().modify(
                userId='me',
                id=msg_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            logger.info(f"🏷️ Đã gỡ nhãn UNREAD cho email [{msg_id}].")
    except Exception as e:
        logger.warning(f"⚠️ Không thể gỡ nhãn UNREAD cho [{msg_id}]: {e}")


def mark_emails_as_read_batch(msg_ids: list):
    """Gỡ nhãn UNREAD hàng loạt trong 1 request duy nhất."""
    if not msg_ids:
        return
    try:
        service = get_gmail_service()
        if service:
            service.users().messages().batchModify(
                userId='me',
                body={'ids': msg_ids, 'removeLabelIds': ['UNREAD']}
            ).execute()
            logger.info(f"🏷️ Đã gỡ nhãn UNREAD hàng loạt cho {len(msg_ids)} email.")
    except Exception as e:
        logger.warning(f"⚠️ Lỗi batch gỡ nhãn UNREAD: {e}")


def process_gmail_attachments(service, msg_id, payload):
    """Tải tệp đính kèm và upload lên Supabase Storage."""
    attachments = []
    
    def extract_parts_recursive(parts):
        for part in parts:
            filename = part.get('filename')
            body = part.get('body', {})
            att_id = body.get('attachmentId')
            file_size = body.get('size', 0)

            if file_size > 15 * 1024 * 1024:
                continue

            if filename and att_id:
                try:
                    att = service.users().messages().attachments().get(
                        userId='me', messageId=msg_id, id=att_id
                    ).execute()
                    
                    file_bytes = base64.urlsafe_b64decode(att['data'])
                    supabase = get_supabase_client()
                    storage_path = f"attachments/{msg_id}_{filename}"
                    
                    content_type, _ = mimetypes.guess_type(filename)
                    content_type = content_type or "application/octet-stream"

                    supabase.storage.from_("ticket-attachments").upload(
                        path=storage_path,
                        file=file_bytes,
                        file_options={"upsert": "true", "content-type": content_type}
                    )

                    public_url = supabase.storage.from_("ticket-attachments").get_public_url(storage_path)
                    attachments.append({"filename": filename, "url": public_url})
                    logger.info(f"📎 Upload tệp đính kèm [{filename}] thành công!")

                    del file_bytes
                    del att
                except Exception as e:
                    logger.error(f"⚠️ Lỗi upload attachment [{filename}]: {e}")

            if 'parts' in part:
                extract_parts_recursive(part['parts'])

    if 'parts' in payload:
        extract_parts_recursive(payload['parts'])

    return attachments


async def poll_unread_gmails():
    """Cronjob quét hòm thư: Ingestion dữ liệu thuần ➔ Đẩy sang Canonical Intake Pipeline."""
    logger.info("📧 Đang kết nối Gmail API quét Hòm Thư Đến...")
    try:
        service = get_gmail_service()
        if not service:
            return

        results = service.users().messages().list(userId='me', q='is:unread label:INBOX', maxResults=20).execute()
        messages = results.get('messages', [])

        if not messages:
            logger.info("📧 Hòm thư sạch sẽ, không có email mới nào!")
            return

        msg_ids = [m['id'] for m in messages]
        supabase = get_supabase_client()

        existing_res = supabase.table("inbox_tickets").select("source_id").eq("source", "gmail").in_("source_id", msg_ids).execute()
        existing_ids = {row["source_id"] for row in (existing_res.data or [])}

        stale_ids = [mid for mid in msg_ids if mid in existing_ids]
        if stale_ids:
            mark_emails_as_read_batch(stale_ids)

        new_msg_summaries = [m for m in messages if m['id'] not in existing_ids]
        if not new_msg_summaries:
            return

        logger.info(f"✨ Bắt đầu nạp {len(new_msg_summaries)} email MỚI TINH...")

        for msg_summary in new_msg_summaries:
            msg_id = msg_summary['id']
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

            internal_date_ms = msg.get("internalDate")
            created_at_iso = None
            if internal_date_ms:
                dt = datetime.fromtimestamp(int(internal_date_ms) / 1000.0, tz=timezone.utc)
                created_at_iso = dt.isoformat()

            full_body_content = extract_gmail_body(payload)
            final_content = full_body_content if full_body_content else msg.get('snippet', '')

            attachments = process_gmail_attachments(service, msg_id, payload)

            new_ticket = {
                "source": "gmail",
                "source_id": msg_id,
                "sender_email": sender,
                "submitter_name": sender.split('<')[0].replace('"', '').strip() if '<' in sender else sender,
                "subject": subject,
                "raw_content": final_content,
                "ticket_timestamp": date_str,
                "status": "pending",
                "attachments": attachments
            }
            if created_at_iso:
                new_ticket["created_at"] = created_at_iso

            res = supabase.table("inbox_tickets").insert(new_ticket).execute()

            if res.data:
                created_ticket = res.data[0]
                logger.info(f"✅ Đã nạp Email mới vào Supabase: [{subject}] (Độ dài: {len(final_content)} ký tự)")
                mark_email_as_read(msg_id)
                try:
                    # Chuyển giao trực tiếp cho Canonical Intake Pipeline
                    await process_incoming_ticket(created_ticket)
                except Exception as intake_err:
                    logger.error(f"⚠️ Lỗi Intake Pipeline cho email {created_ticket['id']}: {intake_err}")

            del msg
            del payload

    except Exception as e:
        logger.error(f"❌ Lỗi khi quét Gmail API: {e}")
    finally:
        gc.collect()