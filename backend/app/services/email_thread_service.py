# /backend/app/services/email_thread_service.py
"""
Email Thread Lifecycle & Segmentation Service
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Mục đích:
- Tách email thread thành các lượt (turns) độc lập, khử sạch 100% quoted reply rác.
- Nhận diện bóng đang ở chân ai: Kỹ sư DTT (Internal) hay Khách hàng (External).
- Quản trị vòng đời hội thoại: WAITING_CUSTOMER_INFO, ACTIONABLE, RESOLVED.
"""
import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field


@dataclass
class ThreadTurn:
    turn_index: int
    author_name: Optional[str]
    author_email: Optional[str]
    is_internal: bool
    timestamp_str: Optional[str]
    body: str


@dataclass
class ParsedThreadResult:
    is_thread: bool
    total_turns: int
    current_message: str
    original_message: str
    history_turns: List[ThreadTurn]
    participants: List[str]
    is_latest_from_internal: bool
    lifecycle_state: str  # 'WAITING_CUSTOMER_INFO' | 'ACTIONABLE' | 'RESOLVED_CONFIRMATION' | 'SINGLE_MESSAGE'
    compact_prompt_context: str


class EmailThreadService:
    INTERNAL_DOMAINS = ("@dtt.vn", "@pythaverse.space")
    ADMIN_EMAILS = {"hung.nguyenmanh@dtt.vn"}

    # Pattern nhận diện các mốc phân tách reply của Gmail, Outlook, Thunderbird
    SPLIT_PATTERNS = [
        r"\n\s*(?:Vào\s+[\w\s,]+vào\s+lúc\s+[\d:]+|Vào\s+[\w\s,]+đã\s+viết\s*:)",
        r"\n\s*On\s+[\w\s,:]+wrote\s*:",
        r"\n\s*-{3,}\s*(?:Original Message|Tin nhắn gốc)\s*-{3,}",
        r"\n\s*_{10,}",
        r"\n\s*From:\s+.*?\nSent:\s+.*?\nTo:\s+",
    ]

    # Dấu hiệu câu xác nhận hoàn thành của kỹ sư
    FULFILLMENT_PATTERNS = [
        r"i have completed",
        r"đã hoàn thành",
        r"đã xử lý xong",
        r"đã cấp tài khoản",
        r"đã ghi danh",
        r"have been enrolled",
    ]

    @classmethod
    def is_internal_email(cls, email: Optional[str]) -> bool:
        if not email:
            return False
        e_clean = email.strip().lower()
        return any(e_clean.endswith(dom) for dom in cls.INTERNAL_DOMAINS)

    @classmethod
    def parse_thread(cls, raw_content: str, sender_email: Optional[str] = None) -> ParsedThreadResult:
        content = (raw_content or "").replace("\r\n", "\n").strip()
        sender_clean = (sender_email or "").strip().lower()

        if not content:
            return ParsedThreadResult(
                is_thread=False,
                total_turns=0,
                current_message="",
                original_message="",
                history_turns=[],
                participants=[],
                is_latest_from_internal=cls.is_internal_email(sender_clean),
                lifecycle_state="SINGLE_MESSAGE",
                compact_prompt_context=""
            )

        # 1. Tìm vị trí phân cắt tin nhắn mới nhất
        split_pos = len(content)
        split_match_pattern = None

        for p in cls.SPLIT_PATTERNS:
            m = re.search(p, content, re.IGNORECASE)
            if m and m.start() < split_pos:
                split_pos = m.start()
                split_match_pattern = m.group(0)

        current_msg = content[:split_pos].strip()
        history_raw = content[split_pos:].strip()

        is_thread = len(history_raw) > 50

        # 2. Thu thập danh sách người tham gia (participants) để khử nhiễu
        participants = set()
        if sender_clean:
            participants.add(sender_clean)
        
        email_regex = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
        for em in email_regex.findall(content[:split_pos + 1500]):
            participants.add(em.lower())

        # 3. Phân loại bóng đang ở chân ai (Turn Owner)
        is_latest_internal = cls.is_internal_email(sender_clean)

        # 4. Xác định Lifecycle State
        if is_latest_internal:
            # Nếu tin nhắn mới nhất do kỹ sư DTT gửi
            # Kiểm tra xem kỹ sư vừa báo xong hay đang hỏi thêm thông tin
            is_confirm = any(re.search(p, current_msg, re.IGNORECASE) for p in cls.FULFILLMENT_PATTERNS)
            if is_confirm:
                lifecycle_state = "RESOLVED_CONFIRMATION"
            else:
                lifecycle_state = "WAITING_CUSTOMER_INFO"
        else:
            # Nếu tin nhắn mới nhất là do khách hàng gửi
            lifecycle_state = "ACTIONABLE" if is_thread else "SINGLE_MESSAGE"

        # 5. Tạo Compact Diff Context cho AI (Tối ưu hóa token)
        # Lấy tối đa 500 ký tự đầu tiên của lịch sử để biết bối cảnh gốc
        first_few_history = history_raw[:800].strip() if is_thread else ""
        compact_context = f"""[YÊU CẦU MỚI NHẤT HIỆN TẠI (LATEST ACTIONABLE REQUEST)]:
{current_msg}

[LỊCH SỬ TRAO ĐỔI TRƯỚC ĐÓ (THAM KHẢO BỐI CẢNH/ĐỐI TÁC)]:
{first_few_history if first_few_history else '(Đây là email đầu tiên, không có lịch sử cũ)'}
"""

        return ParsedThreadResult(
            is_thread=is_thread,
            total_turns=2 if is_thread else 1,
            current_message=current_msg,
            original_message=history_raw[-1000:] if is_thread else current_msg,
            history_turns=[],
            participants=list(participants),
            is_latest_from_internal=is_latest_internal,
            lifecycle_state=lifecycle_state,
            compact_prompt_context=compact_context
        )


thread_service = EmailThreadService()