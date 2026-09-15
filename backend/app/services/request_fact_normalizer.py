"""Deterministic, evidence-backed facts for common Unified Inbox requests."""
import re
from typing import List, Optional, Tuple, Dict, Any

from app.models.intent import EvidenceSpan, ExtractedEntity, ExtractedIntent, IntentAssessment

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
# Nhận diện cả mã khóa học dạng SWRP 7 lẫn Course ID số (ví dụ: Course ID 1445 hoặc id=1445)
COURSE_RE = re.compile(r"\b(?:SWRP|Python|Robotics)[\w .-]*\d+(?:\s*[–—\-]\s*\d+)?\b|Course\s+ID\s*:?\s*(\d+)|course/view\.php\?id=(\d+)", re.IGNORECASE)

# Pattern nhận diện Username Pythaverse hoặc mã học sinh trong bảng (ví dụ vnv1225st0348)
USERNAME_RE = re.compile(r"\b([a-zA-Z]{2,4}\d{2,6}[a-zA-Z]{0,4}\d{2,6})\b")

# Email riêng của Quản trị viên hệ thống cần loại trừ khỏi danh sách học sinh
ADMIN_EXCLUDED_EMAILS = {"hung.nguyenmanh@dtt.vn"}


def _span(content: str, start: int, end: int, revision_id: Optional[str]) -> EvidenceSpan:
    return EvidenceSpan(
        source_revision_id=revision_id,
        quote=content[start:end],
        start_offset=start,
        end_offset=end,
        source_kind="ticket_body",
    )


def _first_phrase_span(content: str, patterns: List[str], revision_id: Optional[str]) -> Optional[EvidenceSpan]:
    for pattern in patterns:
        found = re.search(pattern, content, re.IGNORECASE)
        if found:
            return _span(content, found.start(), found.end(), revision_id)
    return None


def _append_intent(assessment: IntentAssessment, intent_type: str, evidence: EvidenceSpan) -> None:
    for intent in assessment.intents:
        if intent.type == intent_type:
            if not any(s.quote == evidence.quote for s in intent.evidence):
                intent.evidence.append(evidence)
            return
    assessment.intents.append(ExtractedIntent(type=intent_type, confidence=1.0, evidence=[evidence]))


def _append_entity(assessment: IntentAssessment, entity: ExtractedEntity) -> None:
    assessment.extracted_entities = [e for e in assessment.extracted_entities if e.type != entity.type]
    assessment.extracted_entities.append(entity)


def split_email_thread(content: str) -> Tuple[str, str]:
    """
    Tách tin nhắn mới nhất khỏi chuỗi hội thoại dài (Quoted Replies).
    Cắt tại các dấu hiệu: 'Vào ngày... đã viết:', 'On ... wrote:', '-----Original Message-----'
    """
    if not content:
        return "", ""

    patterns = [
        r"\n\s*(?:Vào\s+[\w\s,]+vào\s+lúc\s+[\d:]+|Vào\s+[\w\s,]+đã\s+viết\s*:)",
        r"\n\s*On\s+[\w\s,]+wrote\s*:",
        r"\n\s*-{3,}\s*(?:Original Message|Tin nhắn gốc)\s*-{3,}",
        r"\n\s*_{10,}",
    ]

    split_pos = len(content)
    for p in patterns:
        m = re.search(p, content, re.IGNORECASE)
        if m and m.start() < split_pos:
            split_pos = m.start()

    current_msg = content[:split_pos].strip()
    history = content[split_pos:].strip()
    return current_msg, history


def parse_users_from_table_or_text(text: str, source_revision_id: Optional[str]) -> Tuple[List[Dict[str, Any]], List[EvidenceSpan]]:
    """
    Bóc tách người dùng linh hoạt:
    - Bắt các dòng bảng dạng: Họ Tên | Chặng/Ghi chú | Username/Email | Mật khẩu
    - Bắt danh sách email/username liệt kê
    - Tự động loại trừ email của Quản trị viên (hung.nguyenmanh@dtt.vn)
    """
    users: List[Dict[str, Any]] = []
    spans: List[EvidenceSpan] = []
    seen_ids = set()

    lines = text.splitlines()
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue

        # 1. Bóc tách dạng dòng BẢNG (phân cách bằng | hoặc tab hoặc nhiều khoảng trắng)
        if "|" in line_clean:
            parts = [p.strip() for p in line_clean.split("|") if p.strip()]
        elif "\t" in line_clean:
            parts = [p.strip() for p in line_clean.split("\t") if p.strip()]
        else:
            parts = []

        if len(parts) >= 2:
            candidate_id = None
            candidate_name = None

            for part in parts:
                # Kiểm tra xem cột này có phải là email hoặc username không
                if EMAIL_RE.search(part):
                    em = EMAIL_RE.search(part).group(0)
                    if em.lower() not in ADMIN_EXCLUDED_EMAILS:
                        candidate_id = em
                elif USERNAME_RE.search(part):
                    candidate_id = USERNAME_RE.search(part).group(0)
                elif re.fullmatch(r"[A-Za-zÀ-ỹ\s]{3,50}", part) and not candidate_name:
                    candidate_name = part

            if candidate_id and candidate_id.lower() not in seen_ids:
                seen_ids.add(candidate_id.lower())
                u_item = {"email": candidate_id, "role": "student"}
                if candidate_name:
                    u_item["full_name"] = candidate_name
                users.append(u_item)

                # Tìm vị trí span
                idx = text.find(candidate_id)
                if idx >= 0:
                    spans.append(_span(text, idx, idx + len(candidate_id), source_revision_id))
                continue

        # 2. Bóc tách email thông thường (nếu không nằm trong bảng)
        for em_match in EMAIL_RE.finditer(line_clean):
            em_str = em_match.group(0).strip()
            if em_str.lower() in ADMIN_EXCLUDED_EMAILS:
                continue
            if em_str.lower() not in seen_ids:
                seen_ids.add(em_str.lower())
                users.append({"email": em_str, "role": "student"})
                start_pos = text.find(em_str)
                if start_pos >= 0:
                    spans.append(_span(text, start_pos, start_pos + len(em_str), source_revision_id))

    return users, spans


# [CẬP NHẬT THAY THẾ HÀM augment_assessment_with_request_facts TRONG request_fact_normalizer.py]
def augment_assessment_with_request_facts(
    assessment: IntentAssessment, 
    raw_content: str, 
    source_revision_id: Optional[str],
    sender_email: Optional[str] = None
) -> IntentAssessment:
    full_text = raw_content or ""
    
    # ✂️ CẮT ĐỨT CHUỖI: Chỉ phân tích tin nhắn mới nhất, vứt bỏ 35 email trích dẫn cũ!
    current_message, _ = split_email_thread(full_text)
    content = current_message if len(current_message) > 50 else full_text

    # 1. Bằng chứng ý định trong thư mới nhất
    account_evidence = _first_phrase_span(
        content,
        [r"(?:create|creation of|set up|setup)\s+(?:the\s+)?accounts?", r"tạo\s+(?:mới\s+)?tài\s+khoản", r"use\s+\d+\s+SWRP\s+account"],
        source_revision_id,
    )
    course_evidence = _first_phrase_span(
        content,
        [r"access to .*?course", r"(?:enrol|enroll|ghi danh).*?(?:course|khóa học)", r"Course\s+ID\s+\d+", r"view\.php\?id=\d+"],
        source_revision_id,
    )
    repo_evidence = _first_phrase_span(
        content,
        [r"access to .*?repositories?", r"(?:repository|repositories|repo)\s+access"],
        source_revision_id,
    )

    # 2. Bóc tách danh sách người dùng linh hoạt từ bảng hoặc text
    parsed_users, user_spans = parse_users_from_table_or_text(content, source_revision_id)
    if parsed_users:
        _append_entity(assessment, ExtractedEntity(type="users", raw_value=parsed_users, confidence=1.0, evidence=user_spans))

    # 3. Bóc tách Course ID số (ví dụ Course ID 1445)
    normalized_courses = []
    course_spans = []

    id_matches = re.finditer(r"(?:Course\s+ID\s*:?\s*|view\.php\?id=)(\d+)", content, re.IGNORECASE)
    for m in id_matches:
        c_id = m.group(1).strip()
        if c_id not in normalized_courses:
            normalized_courses.append(c_id)
            course_spans.append(_span(content, m.start(), m.end(), source_revision_id))

    for m in COURSE_RE.finditer(content):
        c_str = m.group(0).strip()
        if "student" in c_str.lower():
            continue
        if c_str not in normalized_courses:
            normalized_courses.append(c_str)
            course_spans.append(_span(content, m.start(), m.end(), source_revision_id))

    if normalized_courses:
        _append_entity(assessment, ExtractedEntity(type="courses", raw_value=normalized_courses, confidence=1.0, evidence=course_spans))

    # 4. Gán intent nếu có bằng chứng và có tài khoản/khóa học
    if course_evidence and (parsed_users or normalized_courses):
        _append_intent(assessment, "course_access", course_evidence)

    if account_evidence and parsed_users:
        _append_intent(assessment, "create_accounts", account_evidence)

    if repo_evidence and parsed_users:
        _append_intent(assessment, "repository_access", repo_evidence)

    if any((account_evidence, course_evidence, repo_evidence)):
        assessment.outcome = "candidate_action"

    return assessment
