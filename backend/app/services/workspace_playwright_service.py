# backend/app/services/workspace_playwright_service.py
"""
Cầu nối tương thích ngược (Backward-Compatibility Bridge).
Toàn bộ logic RPA đã được module hóa tại: app.services.workspace.*
"""
from app.services.workspace import (
    WorkspacePlaywrightService,
    workspace_playwright_service,
    BASE_WORKSPACE_URL,
    normalize_date_iso
)

__all__ = [
    "WorkspacePlaywrightService",
    "workspace_playwright_service",
    "BASE_WORKSPACE_URL",
    "normalize_date_iso"
]