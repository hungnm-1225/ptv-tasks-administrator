import asyncio
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints import workflows


class _Query:
    def __init__(self, result):
        self.result = result

    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        return SimpleNamespace(data=self.result)


class _Supabase:
    def __init__(self, data):
        self.data = data

    def table(self, _name):
        return _Query(self.data)


def test_ticket_workflow_replans_when_latest_draft_has_no_proposal(monkeypatch):
    monkeypatch.setattr(
        workflows,
        "get_supabase_client",
        lambda: _Supabase([{"id": "legacy", "proposal_id": None, "status": "requires_reapproval"}]),
    )

    async def replan(ticket_id):
        assert ticket_id == "ticket-1"
        return {"id": "new", "proposal_id": "proposal-1", "status": "ready"}

    monkeypatch.setattr(workflows.workflow_planner_service, "plan_workflow_for_ticket", replan)

    result = asyncio.run(workflows.get_workflow_for_ticket("ticket-1", "hung@dtt.vn"))
    assert result["proposal_id"] == "proposal-1"
