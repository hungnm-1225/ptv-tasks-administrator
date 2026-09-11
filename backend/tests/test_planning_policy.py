# backend/tests/test_planning_policy.py
import pytest
from app.models.intent import IntentAssessment, ExtractedIntent, EvidenceSpan
from app.services.workflow_planner import workflow_planner_service


def test_zero_mockup_invariant():
    """
    KIỂM ĐỊNH BẤT DI BẤT DỊCH:
    Tuyệt đối không xuất hiện các giá trị mockup (SWRP 4-12, total_count=4, Ptv@2026, DEVELOPER)
    khi người dùng không cung cấp dữ liệu.
    """
    # Tạo assessment thiếu toàn bộ thông tin
    assessment = IntentAssessment(
        outcome="needs_information",
        intents=[
            ExtractedIntent(
                type="course_access",
                confidence=0.9,
                evidence=[EvidenceSpan(quote="cần học môn")],
                required_entities=["courses"]
            ),
            ExtractedIntent(
                type="repository_access",
                confidence=0.9,
                evidence=[EvidenceSpan(quote="cần vào git")],
                required_entities=["repositories"]
            )
        ],
        entities={},  # Rỗng, không có course hay repo
        missing_requirements=[]
    )

    status, steps, missing_reqs, warnings = workflow_planner_service.build_workflow_proposal(
        assessment=assessment,
        resolved_school=None,
        candidates=[],
        attachment_url=None
    )

    # 1. Trạng thái bắt buộc là needs_information
    assert status == "needs_information"

    # 2. Không được sinh bước chạy với dữ liệu ảo
    assert len(steps) == 0

    # 3. Phải liệt kê đầy đủ trường bị thiếu trong checklist
    missing_fields = {m["field"] for m in missing_reqs}
    assert "courses" in missing_fields
    assert "repositories" in missing_fields


def test_missing_evidence_fails_closed():
    """Nếu intent không có trích dẫn bằng chứng, hệ thống phải từ chối tạo bước."""
    assessment = IntentAssessment(
        outcome="candidate_action",
        intents=[
            ExtractedIntent(
                type="create_accounts",
                confidence=0.9,
                evidence=[],  # RỖNG - KHÔNG CÓ BẰNG CHỨNG
                required_entities=["school_name"]
            )
        ],
        entities={"school_name": "Test School", "users": [{"name": "User 1"}]}
    )

    status, steps, missing_reqs, warnings = workflow_planner_service.build_workflow_proposal(
        assessment=assessment,
        resolved_school=None,
        candidates=[],
        attachment_url="https://storage.supabase.co/file.xlsx"
    )

    assert status == "needs_information"
    assert any(m.get("field") == "evidence" for m in missing_reqs)
    assert len(steps) == 0


def test_no_action_produces_zero_steps():
    """Trường hợp email thông báo/quảng cáo (no_action) thì không được sinh bất kỳ bước nào."""
    assessment = IntentAssessment(
        outcome="no_action",
        intents=[],
        entities={}
    )

    status, steps, missing_reqs, warnings = workflow_planner_service.build_workflow_proposal(
        assessment=assessment,
        resolved_school=None,
        candidates=[],
        attachment_url=None
    )

    assert status == "no_action"
    assert len(steps) == 0
    assert len(missing_reqs) == 0


def test_circular_dependency_detection():
    """Kiểm tra thuật toán phát hiện chu trình vòng kín trong đồ thị DAG."""
    from app.models.workflow import WorkflowStepDraft

    circular_steps = [
        WorkflowStepDraft(
            step_id="step_01",
            capability_id="workspace.bulk_account_creation",
            name="Bước 1",
            status="ready",
            inputs={},
            depends_on=["step_02"]  # 1 phụ thuộc 2
        ),
        WorkflowStepDraft(
            step_id="step_02",
            capability_id="workspace.poll_account_batch",
            name="Bước 2",
            status="waiting_dependency",
            inputs={},
            depends_on=["step_01"]  # 2 phụ thuộc 1 -> VÒNG KÍN
        )
    ]

    val_res = workflow_planner_service.validate_workflow_graph(circular_steps)
    assert val_res.is_valid is False
    assert val_res.status == "invalid"
    assert any("Circular Dependency" in err for err in val_res.errors)