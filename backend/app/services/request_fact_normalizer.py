# backend/app/services/request_fact_normalizer.py
"""Deterministic, evidence-backed facts for common Unified Inbox requests.

- Lọc sạch email người gửi (sender), chỉ lấy danh sách tài khoản được yêu cầu.
- Chuẩn hóa Unicode dấu gạch ngang (en-dash, em-dash).
- Bóc tách chính xác tên và email giáo viên từ danh sách liệt kê.
- Mặc định git_role = 'GUEST' nếu không có yêu cầu đặc biệt.
"""
import re
from typing import List, Optional

from app.models.intent import EvidenceSpan, ExtractedEntity, ExtractedIntent, IntentAssessment

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
COURSE_RE = re.compile(r"\b(?:SWRP|Python|Robotics)[\w .-]*\d+(?:\s*[–—\-]\s*\d+)?\b", re.IGNORECASE)


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


def augment_assessment_with_request_facts(
    assessment: IntentAssessment, 
    raw_content: str, 
    source_revision_id: Optional[str],
    sender_email: Optional[str] = None
) -> IntentAssessment:
    """Trích xuất sự thật vận hành có bằng chứng, bảo vệ chống thêm nhầm người gửi."""
    content = raw_content or ""
    sender_clean = sender_email.strip().toLowerCase() if sender_email else ""

    # 1. Nhận diện các ý định hành động
    account_evidence = _first_phrase_span(
        content,
        [r"(?:create|creation of|set up|setup)\s+(?:the\s+)?accounts?", r"tạo\s+(?:mới\s+)?tài\s+khoản"],
        source_revision_id,
    )
    course_evidence = _first_phrase_span(
        content,
        [r"access to .*?course content", r"(?:enrol|enroll|ghi danh).*?(?:course|khóa học)"],
        source_revision_id,
    )
    repo_evidence = _first_phrase_span(
        content,
        [r"access to .*?repositories?", r"(?:repository|repositories|repo)\s+access"],
        source_revision_id,
    )

    # 2. Định vị vùng danh sách tài khoản (Cắt bỏ phần header/lời chào để tránh vơ người gửi)
    list_anchor_match = re.search(
        r"(?:listed below|dưới đây|following teachers?|following users?|danh sách.*?:)", 
        content, 
        re.IGNORECASE
    )
    search_start_pos = list_anchor_match.end() if list_anchor_match else 0
    body_to_search = content[search_start_pos:]

    # 3. Bóc tách danh sách người dùng thực sự được yêu cầu
    emails_in_list = list(EMAIL_RE.finditer(body_to_search))
    users = []
    spans = []

    role_match = re.search(r"\bteachers?\b|\bgiáo\s+viên\b", content, re.IGNORECASE)
    detected_role = "teacher" if role_match else "student"

    for match in emails_in_list:
        email_str = match.group(0).strip()
        # LOẠI TRỪ NGAY LẬP TỨC: Nếu email trùng với người gửi ticket thì bỏ qua!
        if sender_clean and email_str.lower() == sender_clean:
            continue

        real_start = search_start_pos + match.start()
        real_end = search_start_pos + match.end()

        # Tìm họ tên nằm ở dòng ngay trước email
        before_text = content[:real_start].rstrip()
        lines = [line.strip(" -\t*#") for line in before_text.splitlines() if line.strip(" -\t*#")]
        candidate_name = lines[-1] if lines else ""
        
        full_name = candidate_name if re.fullmatch(r"[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ .'’-]{2,100}", candidate_name) else None

        user_item = {"email": email_str, "role": detected_role}
        if full_name:
            user_item["full_name"] = full_name

        users.append(user_item)
        spans.append(_span(content, real_start, real_end, source_revision_id))

    if users:
        _append_entity(assessment, ExtractedEntity(type="users", raw_value=users, confidence=1.0, evidence=spans))

    # 4. Bóc tách khóa học & Chuẩn hóa tên khóa học
    raw_courses = [m.group(0).strip() for m in COURSE_RE.finditer(content)]
    normalized_courses = list(dict.fromkeys(
        re.sub(r"\s*[–—\-]\s*", " ", c) for c in raw_courses
    ))
    
    if normalized_courses:
        course_spans = [_span(content, m.start(), m.end(), source_revision_id) for m in COURSE_RE.finditer(content)]
        _append_entity(assessment, ExtractedEntity(type="courses", raw_value=normalized_courses, confidence=1.0, evidence=course_spans))

    # 5. Khởi tạo thực thể Git Repositories và mặc định vai trò GUEST
    if repo_evidence:
        _append_entity(assessment, ExtractedEntity(
            type="repositories",
            raw_value=normalized_courses if normalized_courses else ["SWRP"],
            confidence=1.0,
            evidence=[repo_evidence]
        ))
        _append_entity(assessment, ExtractedEntity(
            type="git_role",
            raw_value="GUEST",
            confidence=1.0,
            evidence=[repo_evidence]
        ))

    # 6. Gắn intent có bằng chứng
    if account_evidence and users:
        _append_intent(assessment, "create_accounts", account_evidence)
    if course_evidence and users and normalized_courses:
        _append_intent(assessment, "course_access", course_evidence)
    if repo_evidence and users:
        _append_intent(assessment, "repository_access", repo_evidence)

    if any((account_evidence, course_evidence, repo_evidence)):
        assessment.outcome = "actionable"

    return assessment