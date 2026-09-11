# backend/tests/test_execution_safety.py
import pytest
from app.services.workflow_executor import workflow_executor_service


def test_true_topological_sorting():
    """Kiểm tra thuật toán sắp xếp Tô-pô Kahn: Bước cha luôn luôn đứng trước bước con."""
    unordered_steps = [
        {"step_id": "step_03", "name": "Bước Ba (LMS)", "depends_on": ["step_02"]},
        {"step_id": "step_01", "name": "Bước Một (Nộp file)", "depends_on": []},
        {"step_id": "step_02", "name": "Bước Hai (Poll kết quả)", "depends_on": ["step_01"]},
    ]

    sorted_steps = workflow_executor_service._topological_sort(unordered_steps)
    sorted_ids = [s["step_id"] for s in sorted_steps]

    # Thứ tự bắt buộc phải là: step_01 -> step_02 -> step_03
    assert sorted_ids == ["step_01", "step_02", "step_03"]


def test_credential_sanitization_masks_sensitive_data():
    """Kiểm tra cơ chế che mờ thông tin mật trước khi ghi nhật ký audit bất biến."""
    sensitive_payload = {
        "school_identifier": "Saint Joseph",
        "temporary_password": "PlainSecretPassword123!",
        "admin_secret_token": "bearer-xyz-token",
        "user": {
            "email": "teacher@dtt.vn",
            "auth_key": "private_key_abc"
        }
    }

    sanitized = workflow_executor_service._sanitize_payload(sensitive_payload)

    # Các thông tin nhạy cảm phải bị che mờ thành [PROTECTED]
    assert sanitized["temporary_password"] == "[PROTECTED]"
    assert sanitized["admin_secret_token"] == "[PROTECTED]"
    assert sanitized["user"]["auth_key"] == "[PROTECTED]"

    # Dữ liệu nghiệp vụ thông thường được bảo toàn
    assert sanitized["school_identifier"] == "Saint Joseph"
    assert sanitized["user"]["email"] == "teacher@dtt.vn"


def test_template_data_binding_resolution():
    """Kiểm tra phân giải dữ liệu truyền động dạng {{ step_xx.property }}."""
    step_outputs = {
        "step_01": {
            "account_batch_request_id": "REQ-998822",
            "created_accounts": ["user1@dtt.vn", "user2@dtt.vn"]
        }
    }

    inputs = {
        "request_id": "{{ step_01.account_batch_request_id }}",
        "collaborators": "{{ step_01.created_accounts }}",
        "static_text": "Hello World"
    }

    resolved = workflow_executor_service._resolve_input_bindings(inputs, step_outputs)

    assert resolved["request_id"] == "REQ-998822"
    assert resolved["collaborators"] == ["user1@dtt.vn", "user2@dtt.vn"]
    assert resolved["static_text"] == "Hello World"