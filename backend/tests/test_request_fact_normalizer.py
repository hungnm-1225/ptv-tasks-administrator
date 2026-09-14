from app.models.intent import IntentAssessment
from app.services.evidence_verifier import evidence_verifier
from app.services.request_fact_normalizer import augment_assessment_with_request_facts


REQUEST = """We would like to request the creation of accounts for the teachers listed below.
Kimberly E. Mabagos
- kimmabagos26@gmail.com
Marietess G. Pascua
- marietessgpascua@gmail.com
Access to SWRP 4–12 course content
Access to the SWRP 4–12 repositories"""


def test_explicit_teacher_list_becomes_verified_typed_entities():
    assessment = augment_assessment_with_request_facts(
        IntentAssessment(outcome="no_action"), REQUEST, "revision-1"
    )
    verified = evidence_verifier.verify_intent_assessment(assessment, REQUEST, "revision-1")

    assert {intent.type for intent in verified.intents} == {
        "create_accounts", "course_access", "repository_access"
    }
    assert [user["email"] for user in verified.typed_entities.users] == [
        "kimmabagos26@gmail.com", "marietessgpascua@gmail.com"
    ]
    assert all(user["role"] == "teacher" for user in verified.typed_entities.users)
    assert verified.typed_entities.courses == ["SWRP 4–12"]
    assert verified.typed_entities.repository_url is None
