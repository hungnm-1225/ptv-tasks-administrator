-- =============================================================================
-- Migration: 20260910000000_add_automation_workflows.sql
-- Description: Thêm bảng quản lý Workflow Draft & Execution Console cho Unified Inbox
-- Author: Nguyễn Mạnh Hùng (Lead AI Engineer & Automation Architect)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigger function cập nhật thời gian
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS automation_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES inbox_tickets(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    goal TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft | needs_review | ready | approved | running | waiting_poll | success | partial_success | failed | cancelled
    version INT DEFAULT 1,
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_workflow_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES automation_workflows(id) ON DELETE CASCADE,
    field_changed VARCHAR(100) NOT NULL,
    old_val JSONB,
    new_val JSONB,
    changed_by VARCHAR(255) DEFAULT 'hung.nguyenmanh@dtt.vn',
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes tối ưu tốc độ truy vấn
CREATE INDEX IF NOT EXISTS idx_workflows_ticket_id ON automation_workflows(ticket_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status    ON automation_workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created   ON automation_workflows(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_history_wf_id    ON automation_workflow_history(workflow_id);

-- Row Level Security (RLS) - Whitelist Admin @dtt.vn Only
ALTER TABLE automation_workflows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflow_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_dtt_vn_only" ON automation_workflows;
CREATE POLICY "admin_dtt_vn_only" ON automation_workflows
    FOR ALL
    USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

DROP POLICY IF EXISTS "admin_dtt_vn_only" ON automation_workflow_history;
CREATE POLICY "admin_dtt_vn_only" ON automation_workflow_history
    FOR ALL
    USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

-- Trigger tự động cập nhật updated_at
DROP TRIGGER IF EXISTS trg_automation_workflows_updated_at ON automation_workflows;
CREATE TRIGGER trg_automation_workflows_updated_at
    BEFORE UPDATE ON automation_workflows
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
