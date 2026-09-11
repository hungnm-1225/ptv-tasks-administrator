-- ============================================================================
-- MIGRATION: THÊM HẠ TẦNG PROVENANCE, AI ASSESSMENTS & WORKFLOW PROPOSALS
-- Khớp hoàn toàn với schema ptv-tasks-administrator v2.5.0
-- ============================================================================

-- 1. TẠO PARTIAL UNIQUE INDEX TRÊN INBOX_TICKETS (CHỐNG CÀO TRÙNG SOURCE_ID)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_tickets_source_source_id_unique 
ON inbox_tickets(source, source_id) 
WHERE source_id IS NOT NULL AND source_id != '';

-- 2. BẢNG INBOX_TICKET_REVISIONS (LƯU SNAPSHOT NỘI DUNG TICKET THEO THỜI GIAN)
CREATE TABLE IF NOT EXISTS inbox_ticket_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES inbox_tickets(id) ON DELETE CASCADE,
    revision_no INT NOT NULL DEFAULT 1,
    content_hash VARCHAR(64) NOT NULL,
    raw_content TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    source_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_ticket_revision UNIQUE (ticket_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_ticket_revisions_ticket_id ON inbox_ticket_revisions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_revisions_created   ON inbox_ticket_revisions(created_at DESC);

-- 3. BẢNG TICKET_AI_ASSESSMENTS (LƯU RIÊNG SUMMARY INBOX VÀ FACT EXTRACTION)
CREATE TABLE IF NOT EXISTS ticket_ai_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_revision_id UUID NOT NULL REFERENCES inbox_ticket_revisions(id) ON DELETE CASCADE,
    assessment_kind VARCHAR(50) NOT NULL, -- 'summary' | 'fact_extraction'
    model_name VARCHAR(100) NOT NULL,
    prompt_version VARCHAR(50) NOT NULL,
    registry_version VARCHAR(50) NOT NULL,
    structured_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'completed', -- 'completed' | 'failed'
    errors JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_assessments_revision_id ON ticket_ai_assessments(ticket_revision_id);
CREATE INDEX IF NOT EXISTS idx_ai_assessments_kind        ON ticket_ai_assessments(assessment_kind);
CREATE INDEX IF NOT EXISTS idx_ai_assessments_created     ON ticket_ai_assessments(created_at DESC);

-- 4. BẢNG WORKFLOW_PROPOSALS (BẢN ĐỀ XUẤT WORKFLOW CÓ BẰNG CHỨNG)
CREATE TABLE IF NOT EXISTS workflow_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES inbox_tickets(id) ON DELETE CASCADE,
    ticket_revision_id UUID NOT NULL REFERENCES inbox_ticket_revisions(id) ON DELETE CASCADE,
    intent_assessment_id UUID REFERENCES ticket_ai_assessments(id) ON DELETE SET NULL,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'ready_for_review', -- 'no_action' | 'needs_information' | 'ready_for_review' | 'approved' | 'superseded' | 'cancelled'
    evidence JSONB DEFAULT '[]'::jsonb,
    missing_requirements JSONB DEFAULT '[]'::jsonb,
    plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    policy_version VARCHAR(50) NOT NULL DEFAULT 'v1',
    frozen_plan JSONB,
    superseded_by UUID REFERENCES workflow_proposals(id) ON DELETE SET NULL,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_ticket_proposal_version UNIQUE (ticket_id, version)
);

CREATE INDEX IF NOT EXISTS idx_proposals_ticket_id ON workflow_proposals(ticket_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status    ON workflow_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created   ON workflow_proposals(created_at DESC);

DROP TRIGGER IF EXISTS trg_workflow_proposals_updated_at ON workflow_proposals;
CREATE TRIGGER trg_workflow_proposals_updated_at
    BEFORE UPDATE ON workflow_proposals
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- 5. BẢNG WORKFLOW_EXECUTION_EVENTS (APPEND-ONLY AUDIT TRAIL BẤT BIẾN)
CREATE TABLE IF NOT EXISTS workflow_execution_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposal_id UUID REFERENCES workflow_proposals(id) ON DELETE SET NULL,
    workflow_id UUID REFERENCES automation_workflows(id) ON DELETE SET NULL,
    step_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'started' | 'waiting' | 'succeeded' | 'failed' | 'retried' | 'cancelled'
    inputs JSONB DEFAULT '{}'::jsonb,
    outputs JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    duration_ms INT,
    actor VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_events_proposal_id ON workflow_execution_events(proposal_id);
CREATE INDEX IF NOT EXISTS idx_execution_events_workflow_id ON workflow_execution_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_execution_events_step_id     ON workflow_execution_events(step_id);
CREATE INDEX IF NOT EXISTS idx_execution_events_created     ON workflow_execution_events(created_at DESC);

-- 6. PHÂN QUYỀN ROW LEVEL SECURITY (RLS) ĐỒNG BỘ THEO POLICY ADMIN @DTT.VN
ALTER TABLE inbox_ticket_revisions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_ai_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_proposals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_execution_events ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE
    t text;
    new_tables text[] := ARRAY[
        'inbox_ticket_revisions', 
        'ticket_ai_assessments', 
        'workflow_proposals', 
        'workflow_execution_events'
    ];
BEGIN
    FOREACH t IN ARRAY new_tables LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS "admin_dtt_vn_only" ON %I;
            CREATE POLICY "admin_dtt_vn_only" ON %I
                FOR ALL
                USING ((auth.jwt() ->> ''email'') LIKE ''%%@dtt.vn'');
        ', t, t);
    END LOOP;
END $$;