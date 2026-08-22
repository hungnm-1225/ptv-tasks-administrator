# backend/app/services/workspace/__init__.py
from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL, normalize_date_iso
from app.services.workspace.order_service import WorkspaceOrderService
from app.services.workspace.contract_service import WorkspaceContractService
from app.services.workspace.account_service import WorkspaceAccountService
from app.services.workspace.enroll_service import WorkspaceEnrollService
from app.services.workspace.orchestrator_service import WorkspaceOrchestratorService


class WorkspacePlaywrightService(
    WorkspaceOrchestratorService,
    WorkspaceAccountService,
    WorkspaceEnrollService
):
    """Lớp Singleton tổng hợp toàn bộ 100% nghiệp vụ Workspace RPA."""
    pass


workspace_playwright_service = WorkspacePlaywrightService()

__all__ = [
    "WorkspacePlaywrightService",
    "workspace_playwright_service",
    "BASE_WORKSPACE_URL",
    "normalize_date_iso"
]