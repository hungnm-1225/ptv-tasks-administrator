# backend/tests/test_capability_contracts.py
import os
import json
import inspect
import pytest

BRAIN_DIR = os.path.join(os.path.dirname(__file__), "../app/brain")


def test_capabilities_registry_schema():
    """Kiểm tra tính toàn vẹn của Master Capability Registry."""
    cap_path = os.path.join(BRAIN_DIR, "capabilities.json")
    assert os.path.exists(cap_path), "capabilities.json không tồn tại!"

    with open(cap_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "capabilities" in data
    assert len(data["capabilities"]) == 19, "Hệ thống phải có đúng 19 capabilities chuẩn mực!"

    for cap in data["capabilities"]:
        assert "id" in cap
        assert "action" in cap
        assert "bot_type" in cap
        assert "available" in cap
        assert "supported_by_handler" in cap
        assert "risk_level" in cap

        # INVARIANT: Nếu supported_by_handler là False thì available BẮT BUỘC là False
        if not cap["supported_by_handler"]:
            assert cap["available"] is False, (
                f"Tử huyệt: Capability '{cap['id']}' không có bot handler nhưng lại để available=True!"
            )


def test_intent_policy_only_uses_available_capabilities():
    """Đảm bảo intent_policy.json không bao giờ trỏ vào capability bị tạm khóa hoặc thiếu handler."""
    cap_path = os.path.join(BRAIN_DIR, "capabilities.json")
    policy_path = os.path.join(BRAIN_DIR, "intent_policy.json")

    with open(cap_path, "r", encoding="utf-8") as f:
        caps = {c["id"]: c for c in json.load(f).get("capabilities", [])}

    with open(policy_path, "r", encoding="utf-8") as f:
        intents = json.load(f).get("intents", {})

    for intent_name, intent_def in intents.items():
        pipeline = intent_def.get("capability_pipeline", [])
        for step in pipeline:
            cid = step["capability_id"]
            assert cid in caps, f"Intent '{intent_name}' trỏ vào capability không tồn tại: '{cid}'"
            assert caps[cid]["available"] is True, (
                f"Tử huyệt: Intent '{intent_name}' sử dụng capability '{cid}' đang bị khóa (available=False)!"
            )


def test_workflow_executor_mapping_matches_available_capabilities():
    """Kiểm tra bảng ánh xạ _map_capability_to_bot trong WorkflowExecutorService."""
    from app.services.workflow_executor import workflow_executor_service

    cap_path = os.path.join(BRAIN_DIR, "capabilities.json")
    with open(cap_path, "r", encoding="utf-8") as f:
        caps = {c["id"]: c for c in json.load(f).get("capabilities", [])}

    # Các capabilities khả dụng bắt buộc phải có mapping chuẩn xác
    available_caps = [cid for cid, c in caps.items() if c["available"]]
    for cid in available_caps:
        bot_type, action = workflow_executor_service._map_capability_to_bot(cid)
        assert bot_type == caps[cid]["bot_type"], f"Sai bot_type cho capability {cid}"
        assert action == caps[cid]["action"], f"Sai action cho capability {cid}"