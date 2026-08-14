# backend/app/api/v1/router.py
from fastapi import APIRouter
from app.api.v1.endpoints import tickets, tasks, bots, github, reports, monitor

api_router = APIRouter()

# Đăng ký danh sách các endpoint
api_router.include_router(tickets.router, prefix="/tickets", tags=["tickets"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(bots.router, prefix="/bots", tags=["bots"])
api_router.include_router(github.router, prefix="/github", tags=["github"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(monitor.router, prefix="/monitor", tags=["monitor"])