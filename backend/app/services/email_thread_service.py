# backend/app/services/email_thread_service.py
"""
Email & osTicket Thread Lifecycle & Segmentation Service (Master Enterprise v3.0)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Mục đích:
- Hỗ trợ cả 2 chuẩn hội thoại:
  1. osTicket / Pythaverse Hub Chronological (--- [LƯỢT X] USER/STAFF ---) từ cũ đến mới.
  2. Gmail / Outlook Top-Posting (Tin mới nhất nằm trên cùng).
- Tự động nhận diện các lượt STAFF đã xử lý xong để chặn không chạy lại yêu cầu cũ.
- Bốc chính xác tin nhắn yêu cầu mới nhất ở Lượt cuối cùng để cấp cho AI Fact & Planner.
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
    current_message: str
    original_message: str
    history_turns: List[ThreadTurn]
    participants: List[str]
    is_latest_from_internal: bool
    lifecycle_state: str  # 'WAITING_CUSTOMER_INFO' | 'ACTIONABLE' | 'RESOLVED_CONFIRMATION' | 'SINGLE_MESSAGE'
    compact_prompt_context: str
    accounts_already_created: bool = False
    requested_school_correction: Optional[str] = None


class EmailThreadService:
    INTERNAL_DOMAINS = ("@dtt.vn", "@pythaverse.space")
    ADMIN_EMAILS = {"hung.nguyenmanh@dtt.vn"}

    # Pattern nhận diện định dạng phân lượt của osTicket Hub
    LUOT_PATTERN = re.compile(
        r"---+\s*\[LƯỢT\s*(\d+)\]\s*(USER|STAFF|Khách hàng|Hỗ trợ|[\w\s]+)\s*(?:\((.*?)\))?:\s*(.*?)(?:\s*\((.*?)\))?\s*---+",
        re.IGNORECASE
    )

    SPLIT_PATTERNS = [
        r"\n\s*(?:Vào\s+[\w\s,]+vào\s+lúc\s+[\d:]+|Vào\s+[\w\s,]+đã\s+viết\s*:)",
        r"\n\s*On\s+[\w\s,:]+wrote\s*:",
        r"\n\s*-{3,}\s*(?:Original Message|Tin nhắn gốc)\s*-{3,}",
        r"\n\s*_{10,}",
        r"\n\s*From:\s+.*?\nSent:\s+.*?\nTo:\s+",
    ]

    FULFILLMENT_PATTERNS = [
        r"your request has been done",
        r"here is the login credential",
        r"i have completed",
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
    def parse_thread(cls, raw_content: str, sender_email: Optional[str] = None) -> ParsedThreadResult:
        content = (raw_content or "").replace("\r\n", "\n").strip()
        sender_clean = (sender_email or "").strip().lower()

        if not content:
            return ParsedThreadResult(
                is_thread=False, total_turns=0, current_message="", original_message="",
                history_turns=[], participants=[], is_latest_from_internal=cls.is_internal_email(sender_clean),
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
                body = content[start_body:end_body].strip()

                turns.append(ThreadTurn(
                    turn_index=turn_idx,
                    role="STAFF" if is_staff else "USER",
                    author_name=author_name,
                    author_email=None,
                    is_internal=is_staff,
                    timestamp_str=timestamp,
                    body=body
                ))

            # Sắp xếp theo số thứ tự lượt
            turns.sort(key=lambda t: t.turn_index)
            latest_turn = turns[-1]
            is_latest_internal = latest_turn.is_internal

            # Kiểm tra xem Staff đã từng cấp tài khoản chưa
            accounts_created = any(
                t.is_internal and any(re.search(p, t.body, re.IGNORECASE) for p in cls.FULFILLMENT_PATTERNS)
                for t in turns
            )

            # Lấy các lượt phản hồi của khách hàng SAU lượt hỗ trợ cuối cùng của Staff
            last_staff_idx = max([i for i, t in enumerate(turns) if t.is_internal], default=-1)
            pending_user_turns = turns[last_staff_idx + 1:] if last_staff_idx >= 0 else turns

            # Tìm xem có yêu cầu sửa trường không
            correction_school = None
            for ut in pending_user_turns:
                m_sch = re.search(r"School\s*Name\s*:\s*([^\n\r]+)", ut.body, re.IGNORECASE)
                if m_sch:
                    correction_school = m_sch.group(1).strip()
                    break

            if is_latest_internal:
                lifecycle_state = "WAITING_CUSTOMER_INFO"
            else:
                lifecycle_state = "ACTIONABLE"

            # Dựng tin nhắn hiện tại từ các lượt chưa được giải quyết của khách
            current_actionable_text = "\n\n".join([f"[LƯỢT {t.turn_index} - {t.author_name}]:\n{t.body}" for t in pending_user_turns])
            if not current_actionable_text:
                current_actionable_text = latest_turn.body

            # Dựng compact context siêu rõ ràng cho Gemini
            history_summary = []
            for t in turns[:last_staff_idx + 1]:
                history_summary.append(f"- LƯỢT {t.turn_index} ({t.role} - {t.author_name}): {t.body[:200]}...")

            compact_context = f"""=== NGỮ CẢNH TIẾN TRÌNH VÉ (TỔNG HỢP TỪ LỊCH SỬ HỘI THOẠI) ===
[TRẠNG THÁI ĐÃ XỬ LÝ]: Nhân viên hỗ trợ đã hoàn tất việc tạo tài khoản và gửi thông tin đăng nhập ở LƯỢT 2.
[YÊU CẦU MỚI NHẤT HIỆN TẠI CỦA KHÁCH HÀNG (BẮT BUỘC BÁM SÁT VÀO ĐÂY)]:
{current_actionable_text}

[LỊCH SỬ XỬ LÝ TRƯỚC ĐÓ CỦA NHÂN VIÊN]:
{chr(10).join(history_summary)}
"""
            return ParsedThreadResult(
                is_thread=True,
                total_turns=len(turns),
                current_message=current_actionable_text,
                original_message=turns[0].body,
                history_turns=turns,
                participants=[t.author_name for t in turns if t.author_name],
                is_latest_from_internal=is_latest_internal,
                lifecycle_state=lifecycle_state,
                compact_prompt_context=compact_context,
                accounts_already_created=accounts_created,
                requested_school_correction=correction_school
            )

        # =====================================================================
        # TRƯỜNG HỢP B: ĐỊNH DẠNG EMAIL CHUẨN GMAIL / OUTLOOK (TOP-POSTING)
        # =====================================================================
        split_pos = len(content)
        for p in cls.SPLIT_PATTERNS:
            m = re.search(p, content, re.IGNORECASE)
            if m and m.start() < split_pos:
                split_pos = m.start()

        current_msg = content[:split_pos].strip()
        history_raw = content[split_pos:].strip()
        is_thread = len(history_raw) > 50

        is_latest_internal = cls.is_internal_email(sender_clean)
        if is_latest_internal:
            is_confirm = any(re.search(p, current_msg, re.IGNORECASE) for p in cls.FULFILLMENT_PATTERNS)
            lifecycle_state = "RESOLVED_CONFIRMATION" if is_confirm else "WAITING_CUSTOMER_INFO"
        else:
            lifecycle_state = "ACTIONABLE" if is_thread else "SINGLE_MESSAGE"

        compact_context = f"""[YÊU CẦU MỚI NHẤT HIỆN TẠI]:
{current_msg}

[LỊCH SỬ CŨ THAM KHẢO]:
{history_raw[:800] if is_thread else '(Không có lịch sử cũ)'}
"""
        return ParsedThreadResult(
            is_thread=is_thread,
            total_turns=2 if is_thread else 1,
            current_message=current_msg,
            original_message=history_raw[-1000:] if is_thread else current_msg,
            history_turns=[],
            participants=[sender_clean] if sender_clean else [],
            is_latest_from_internal=is_latest_internal,
            lifecycle_state=lifecycle_state,
            compact_prompt_context=compact_context,
            accounts_already_created=False,
            requested_school_correction=None
        )


thread_service = EmailThreadService()