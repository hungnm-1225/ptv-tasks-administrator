"""Deterministic, evidence-backed facts for common Unified Inbox requests.

This is deliberately a *supplement* to the LLM extractor.  It only recognises
phrases and values that occur verbatim in the ticket, and it never invents a
school, repository URL, Git role, date of birth, or account credentials.
"""
import re
from typing import List, Optional

from app.models.intent import EvidenceSpan, ExtractedEntity, ExtractedIntent, IntentAssessment


EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
COURSE_RE = re.compile(r"\b(?:SWRP|Python|Robotics)[\w .-]*\d+(?:\s*[–-]\s*\d+)?\b", re.IGNORECASE)


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
    """Keep a model-produced intent when present, otherwise add the verified candidate."""
    for intent in assessment.intents:
        if intent.type == intent_type:
            if not any(s.quote == evidence.quote for s in intent.evidence):
                intent.evidence.append(evidence)
            return
    assessment.intents.append(ExtractedIntent(type=intent_type, confidence=1.0, evidence=[evidence]))


def _append_entity(assessment: IntentAssessment, entity: ExtractedEntity) -> None:
    # The normalizer owns only its known entity types.  Replace the LLM value
    # for those types so an unsupported value cannot overwrite exact evidence.
    assessment.extracted_entities = [e for e in assessment.extracted_entities if e.type != entity.type]
    assessment.extracted_entities.append(entity)


def augment_assessment_with_request_facts(
    assessment: IntentAssessment, raw_content: str, source_revision_id: Optional[str]
) -> IntentAssessment:
    """Add facts that can be proven directly from a plain-text ticket.

    This handles the common 'create listed teacher accounts + enrol them in
    course X + repository access' email shape.  Repository access remains
    blocked unless a canonical URL and Git role are independently supplied.
    """
    content = raw_content or ""
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

    emails = list(EMAIL_RE.finditer(content))
    if emails:
        role_match = re.search(r"\bteachers?\b|\bgiáo\s+viên\b", content, re.IGNORECASE)
        role = "teacher" if role_match else None
        users = []
        spans = []
        for match in emails:
            # A name may appear on the preceding non-empty line.  Preserve it
            # only when it looks like a human name; do not derive one from email.
            before = content[:match.start()].rstrip()
            lines = [
                cleaned for line in before.splitlines()
                if (cleaned := line.strip(" -\t"))
            ]
            candidate = lines[-1] if lines else ""
            name = candidate if re.fullmatch(r"[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ .'’-]{1,100}", candidate or "") else None
            user = {"email": match.group(0)}
            if name:
                user["full_name"] = name
            if role:
                user["role"] = role
            users.append(user)
            spans.append(_span(content, match.start(), match.end(), source_revision_id))
        _append_entity(assessment, ExtractedEntity(type="users", raw_value=users, confidence=1.0, evidence=spans))

    courses = list(dict.fromkeys(m.group(0).strip() for m in COURSE_RE.finditer(content)))
    if courses:
        course_spans = [_span(content, m.start(), m.end(), source_revision_id) for m in COURSE_RE.finditer(content)]
        _append_entity(assessment, ExtractedEntity(type="courses", raw_value=courses, confidence=1.0, evidence=course_spans))

    if account_evidence and emails:
        _append_intent(assessment, "create_accounts", account_evidence)
    if course_evidence and emails and courses:
        _append_intent(assessment, "course_access", course_evidence)
    if repo_evidence and emails:
        _append_intent(assessment, "repository_access", repo_evidence)

    if any((account_evidence, course_evidence, repo_evidence)) and assessment.outcome == "no_action":
        assessment.outcome = "needs_information"
    return assessment
