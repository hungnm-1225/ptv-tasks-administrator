-- Migration: 20260912000000_harden_workflow_provenance.sql
-- Description: Khắc phục triệt để lỗi thiếu entity_resolution và bổ sung proposal_id vào execution workflows
-- Author: Lead AI Engineer Nguyen Manh Hung & Co-pilot

-- 1. Bổ sung cột entity_resolution bị thiếu vào workflow_proposals
ALTER TABLE workflow_proposals
ADD COLUMN IF NOT EXISTS entity_resolution JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Bổ sung khóa ngoại proposal_id vào automation_workflows
ALTER TABLE automation_workflows
ADD COLUMN IF NOT EXISTS proposal_id UUID
REFERENCES workflow_proposals(id) ON DELETE SET NULL;

-- 3. Tạo index tối ưu truy vấn provenance ngược từ workflow về proposal
CREATE INDEX IF NOT EXISTS idx_automation_workflows_proposal_id
ON automation_workflows(proposal_id);

COMMENT ON COLUMN workflow_proposals.entity_resolution IS 'Dữ liệu phân giải thực thể typed & verified được planner sử dụng';
COMMENT ON COLUMN automation_workflows.proposal_id IS 'Khóa ngoại trỏ về proposal gốc được phê duyệt (Immutable Provenance Link)';