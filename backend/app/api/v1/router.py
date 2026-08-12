from fastapi import APIRouter
from app.api.v1.endpoints import tickets, tasks, bots, github, reports

api_router = APIRouter()

api_router.include_router(tickets.router, prefix="/tickets", tags=["tickets"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["automation-tasks"])
api_router.include_router(bots.router, prefix="/bots", tags=["bot-workers"])
api_router.include_router(github.router, prefix="/github", tags=["github-dispatcher"])
api_router.include_router(reports.router, prefix="/reports", tags=["analytics-reports"])
