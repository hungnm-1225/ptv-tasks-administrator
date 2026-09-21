#backend/app/services/email_thread_service.py
"""
Email & osTicket Thread Lifecycle & Segmentation Service (Master Enterprise v4.0)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Khử sạch 100% "Show trimmed content" (gmail_quote, blockquote, On...wrote).
- Bóc tách Gmail Top-Posting thành các lượt hội thoại (Turns) độc lập như osTicket.
- Nhận diện lượt gửi của nhân viên DTT (@dtt.vn) vs khách hàng để trích xuất đúng Actionable Request.
"""
import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field


@dataclass
class ThreadTurn:
    turn_index: int
    role: str  # 'USER' | 'STAFF'
    author_name: Optional[str]
    author_email: Optional[str]
    is_internal: bool
    timestamp_str: Optional[str]
    body: str


@dataclass
class ParsedThreadResult:
    is_thread: bool
    total_turns: int
    current_message: str              # Tin nhắn mới nhất cần xử lý (ưu tiên của khách hàng)
    original_message: str             # Tin nhắn khởi đầu luồng
    latest_user_message: str          # Yêu cầu gần nhất của khách hàng (bỏ qua tin nhắn kỹ sư báo xong)
    history_turns: List[ThreadTurn]
    participants: List[str]
    is_latest_from_internal: bool
    lifecycle_state: str              # 'WAITING_CUSTOMER_INFO' | 'ACTIONABLE' | 'RESOLVED_CONFIRMATION' | 'SINGLE_MESSAGE'
    compact_prompt_context: str
    accounts_already_created: bool = False
    requested_school_correction: Optional[str] = None


class EmailThreadService:
    INTERNAL_DOMAINS = ("@dtt.vn", "@pythaverse.space")
    ADMIN_EMAILS = {"hung.nguyenmanh@dtt.vn"}

    # Pattern nhận diện phân lượt của osTicket Hub
    LUOT_PATTERN = re.compile(
        r"---+\s*\[LƯỢT\s*(\d+)\]\s*(USER|STAFF|Khách hàng|Hỗ trợ|[\w\s]+)\s*(?:\((.*?)\))?:\s*(.*?)(?:\s*\((.*?)\))?\s*---+",
        re.IGNORECASE
    )

    # Các điểm ngắt dòng khi người dùng Reply/Reply All (Show trimmed content)
    GMAIL_SPLIT_REGEX = re.compile(
        r"(?:\n\s*On\s+[A-Za-z]{3},\s+[A-Za-z]{3}\s+\d+.*?(?:wrote|đã viết)\s*:|"
        r"\n\s*Vào\s+[\w\s,]+(?:vào lúc|đã viết)\s*[\d:]*.*?:|"
        r"\n\s*-{3,}\s*(?:Original Message|Tin nhắn gốc)\s*-{3,}|"
        r"\n\s*_{10,}|"
        r"\n\s*From:\s+.*?\nSent:\s+.*?\nTo:\s+)",
        re.IGNORECASE | re.DOTALL
    )

    FULFILLMENT_PATTERNS = [
        r"i have completed",
        r"your request has been done",
        r"here is the login credential",
        r"đã hoàn thành",
        r"đã xử lý xong",
        r"đã cấp tài khoản",
        r"đã ghi danh",
    ]

    @classmethod
    def is_internal_email(cls, email: Optional[str]) -> bool:
        if not email:
            return False
        e_clean = email.strip().lower()
        return any(e_clean.endswith(dom) for dom in cls.INTERNAL_DOMAINS)

    @classmethod
    def clean_trimmed_quotes(cls, text: str) -> str:
        """Cắt bỏ toàn bộ các khối quoted reply lặp lại của Gmail."""
        if not text:
            return ""
        # 1. Cắt từ điểm xuất hiện header On ... wrote:
        parts = cls.GMAIL_SPLIT_REGEX.split(text)
        clean_first_part = parts[0] if parts else text

        # 2. Xóa các dòng bắt đầu bằng dấu trích dẫn '>'
        lines = []
        for line in clean_first_part.split("\n"):
            stripped = line.strip()
            if not stripped.startswith(">"):
                lines.append(line)

        return "\n".join(lines).strip()

    @classmethod
    def parse_thread(cls, raw_content: str, sender_email: Optional[str] = None) -> ParsedThreadResult:
        content = (raw_content or "").replace("\r\n", "\n").strip()
        sender_clean = (sender_email or "").strip().lower()

        if not content:
            return ParsedThreadResult(
                is_thread=False, total_turns=0, current_message="", original_message="",
                latest_user_message="", history_turns=[], participants=[],
                is_latest_from_internal=cls.is_internal_email(sender_clean),
                lifecycle_state="SINGLE_MESSAGE", compact_prompt_context=""
            )

        # =====================================================================
        # TRƯỜNG HỢP A: ĐỊNH DẠNG PHÂN LƯỢT CỦA OSTICKET (--- [LƯỢT X] ---)
        # =====================================================================
        luot_matches = list(cls.LUOT_PATTERN.finditer(content))
        if len(luot_matches) >= 2:
            turns: List[ThreadTurn] = []
            for idx, m in enumerate(luot_matches):
                turn_idx = int(m.group(1))
                raw_role = m.group(2).strip().upper()
                author_name = m.group(4).strip() if m.group(4) else ""
                timestamp = m.group(5).strip() if m.group(5) else ""

                is_staff = "STAFF" in raw_role or "HỖ TRỢ" in raw_role or any(a in author_name.lower() for a in ["hung", "dtt"])
                start_body = m.end()
                end_body = luot_matches[idx + 1].start() if idx + 1 < len(luot_matches) else len(content)
                body = cls.clean_trimmed_quotes(content[start_body:end_body])

                turns.append(ThreadTurn(
                    turn_index=turn_idx,
                    role="STAFF" if is_staff else "USER",
                    author_name=author_name,
                    author_email=None,
                    is_internal=is_staff,
                    timestamp_str=timestamp,
                    body=body
                ))

            turns.sort(key=lambda t: t.turn_index)
            latest_turn = turns[-1]
            is_latest_internal = latest_turn.is_internal

            # Tìm tin nhắn gần nhất của KHÁCH HÀNG (bỏ qua nhân viên)
            customer_turns = [t for t in turns if not t.is_internal]
            latest_customer_msg = customer_turns[-1].body if customer_turns else latest_turn.body

            accounts_created = any(
                t.is_internal and any(re.search(p, t.body, re.IGNORECASE) for p in cls.FULFILLMENT_PATTERNS)
                for t in turns
            )

            lifecycle_state = "RESOLVED_CONFIRMATION" if (is_latest_internal and accounts_created) else ("WAITING_CUSTOMER_INFO" if is_latest_internal else "ACTIONABLE")

            return ParsedThreadResult(
                is_thread=True,
                total_turns=len(turns),
                current_message=latest_turn.body,
                original_message=turns[0].body,
                latest_user_message=latest_customer_msg,
                history_turns=turns,
                participants=[t.author_name for t in turns if t.author_name],
                is_latest_from_internal=is_latest_internal,
                lifecycle_state=lifecycle_state,
                compact_prompt_context=latest_customer_msg,
                accounts_already_created=accounts_created,
                requested_school_correction=None
            )

        # =====================================================================
        # TRƯỜNG HỢP B: ĐỊNH DẠNG GMAIL TOP-POSTING (CÓ NÚT "SHOW TRIMMED CONTENT")
        # =====================================================================
        # Phân tách email thành các phần tử dựa trên điểm ngắt On ... wrote:
        raw_splits = cls.GMAIL_SPLIT_REGEX.split(content)
        parsed_turns: List[str] = [p.strip() for p in raw_splits if p and len(p.strip()) > 10]

        if not parsed_turns:
            parsed_turns = [content]

        is_thread = len(parsed_turns) > 1
        latest_msg = cls.clean_trimmed_quotes(parsed_turns[0])

        # Kiểm tra xem tin nhắn gần nhất có phải do kỹ sư DTT gửi hoàn tất không
        is_latest_internal = cls.is_internal_email(sender_clean) or any(
            adm in latest_msg.lower() for adm in ["hùng nguyễn mạnh", "hung.nguyenmanh@dtt.vn", "best regards,\nhùng"]
        )

        is_completed_by_staff = any(re.search(p, latest_msg, re.IGNORECASE) for p in cls.FULFILLMENT_PATTERNS)

        # 🎯 BỐC TÁCH YÊU CẦU THỰC SỰ CỦA KHÁCH HÀNG:
        # Nếu lượt trên cùng là của anh Hùng ("I have completed..."), thì yêu cầu thực sự của khách nằm ở tin nhắn thứ 2!
        if is_latest_internal and len(parsed_turns) > 1:
            latest_customer_request = cls.clean_trimmed_quotes(parsed_turns[1])
        else:
            latest_customer_request = latest_msg

        lifecycle_state = "RESOLVED_CONFIRMATION" if (is_latest_internal and is_completed_by_staff) else ("ACTIONABLE" if is_thread else "SINGLE_MESSAGE")

        compact_context = f"""[YÊU CẦU VẬN HÀNH CỦA KHÁCH HÀNG (CẦN XỬ LÝ)]:
{latest_customer_request}

[PHẢN HỒI GẦN NHẤT CỦA KỸ SƯ HỆ THỐNG]:
{latest_msg if is_latest_internal else '(Chưa có phản hồi từ kỹ sư)'}
"""

        return ParsedThreadResult(
            is_thread=is_thread,
            total_turns=len(parsed_turns),
            current_message=latest_msg,
            original_message=parsed_turns[-1] if parsed_turns else latest_msg,
            latest_user_message=latest_customer_request,
            history_turns=[],
            participants=[sender_clean] if sender_clean else [],
            is_latest_from_internal=is_latest_internal,
            lifecycle_state=lifecycle_state,
            compact_prompt_context=compact_context,
            accounts_already_created=is_completed_by_staff,
            requested_school_correction=None
        )


thread_service = EmailThreadService()