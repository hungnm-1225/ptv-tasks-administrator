# Trong bot_executor.py:
from app.services.workspace_playwright_service import workspace_playwright_service

async def execute_approved_bot_task(bot_type: str, payload_data: dict):
    if bot_type == "workspace_rpa":
        action = payload_data.get("action")
        
        # 1. Luồng School tạo Order
        if action == "school_create_order":
            return await workspace_playwright_service.school_create_order(
                credentials=payload_data["school_credentials"],
                order_data=payload_data["order_details"]
            )
        # 2. Luồng Sales Admin duyệt Contract
        elif action == "admin_approve_contract":
            return await workspace_playwright_service.admin_approve_distributor_contract(
                credentials=payload_data["admin_credentials"],
                contract_code=payload_data["contract_code"],
                justification=payload_data.get("justification", "Approved by Central Hub")
            )