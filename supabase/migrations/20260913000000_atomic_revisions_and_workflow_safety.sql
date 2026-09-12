-- Strict provenance hardening.  This migration owns all database-side
-- allocation and conditional state transitions used by the workflow service.

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_revision_content_hash
ON inbox_ticket_revisions(ticket_id, content_hash);

CREATE OR REPLACE FUNCTION create_or_get_inbox_ticket_revision(
    p_ticket_id UUID,
    p_content_hash VARCHAR(64),
    p_raw_content TEXT,
    p_attachments JSONB,
    p_source_updated_at TIMESTAMPTZ
)
RETURNS TABLE(id UUID, revision_no INT, is_new BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing inbox_ticket_revisions%ROWTYPE;
    v_next_revision INT;
BEGIN
    -- Serialise allocations per ticket.  This protects both the revision
    -- sequence and the same-content idempotency lookup.
    PERFORM 1 FROM inbox_tickets WHERE inbox_tickets.id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown inbox ticket %', p_ticket_id;
    END IF;

    SELECT * INTO v_existing
    FROM inbox_ticket_revisions
    WHERE ticket_id = p_ticket_id AND content_hash = p_content_hash;

    IF FOUND THEN
        RETURN QUERY SELECT v_existing.id, v_existing.revision_no, FALSE;
        RETURN;
    END IF;

    SELECT COALESCE(MAX(r.revision_no), 0) + 1 INTO v_next_revision
    FROM inbox_ticket_revisions r
    WHERE r.ticket_id = p_ticket_id;

    INSERT INTO inbox_ticket_revisions (
        ticket_id, revision_no, content_hash, raw_content, attachments, source_updated_at
    ) VALUES (
        p_ticket_id, v_next_revision, p_content_hash, COALESCE(p_raw_content, ''),
        COALESCE(p_attachments, '[]'::jsonb), p_source_updated_at
    )
    RETURNING inbox_ticket_revisions.id, inbox_ticket_revisions.revision_no
    INTO id, revision_no;

    is_new := TRUE;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION approve_workflow_proposal(
    p_workflow_id UUID,
    p_proposal_id UUID,
    p_frozen_plan JSONB,
    p_approver VARCHAR(255),
    p_operator_reason TEXT DEFAULT NULL
)
RETURNS TABLE(workflow_id UUID, proposal_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
    v_workflow automation_workflows%ROWTYPE;
    v_proposal workflow_proposals%ROWTYPE;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_workflow FROM automation_workflows WHERE id = p_workflow_id FOR UPDATE;
    IF NOT FOUND OR v_workflow.proposal_id IS DISTINCT FROM p_proposal_id
       OR v_workflow.status IN ('approved', 'running', 'succeeded', 'success', 'cancelled') THEN
        RAISE EXCEPTION 'Workflow % is not linked to proposal %', p_workflow_id, p_proposal_id;
    END IF;

    SELECT * INTO v_proposal FROM workflow_proposals WHERE id = p_proposal_id FOR UPDATE;
    IF NOT FOUND OR v_proposal.status <> 'ready_for_review' OR v_proposal.superseded_by IS NOT NULL THEN
        RAISE EXCEPTION 'Proposal % is not approvable', p_proposal_id;
    END IF;

    UPDATE workflow_proposals
    SET status = 'approved', frozen_plan = p_frozen_plan, approved_by = p_approver,
        approved_at = v_now, updated_at = v_now
    WHERE id = p_proposal_id;

    UPDATE automation_workflows
    SET status = 'approved', steps = p_frozen_plan, approved_by = p_approver,
        approved_at = v_now, updated_at = v_now
    WHERE id = p_workflow_id;

    INSERT INTO workflow_execution_events (
        proposal_id, workflow_id, step_id, event_type, actor, inputs, outputs, created_at
    ) VALUES (
        p_proposal_id, p_workflow_id, 'workflow_approval', 'approved', p_approver,
        jsonb_build_object('steps_count', jsonb_array_length(p_frozen_plan)),
        jsonb_build_object('proposal_id', p_proposal_id, 'operator_reason', p_operator_reason),
        v_now
    );

    RETURN QUERY SELECT p_workflow_id, p_proposal_id;
END;
$$;

-- Existing rows are immutable history.  They may be inspected but a legacy
-- workflow without proposal provenance may not execute until re-approved.
UPDATE automation_workflows
SET status = 'requires_reapproval'
WHERE proposal_id IS NULL
  AND status IN ('approved', 'running', 'waiting_poll', 'ready', 'draft');
