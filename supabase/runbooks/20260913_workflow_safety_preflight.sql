-- Run this read-only preflight in Supabase SQL Editor before migration
-- 20260913000000_atomic_revisions_and_workflow_safety.sql.

-- Must return zero rows.  If rows exist, stop: choose a canonical revision
-- per duplicate with a backup/migration specifically reviewed for that data.
SELECT ticket_id, content_hash, COUNT(*) AS duplicate_count,
       ARRAY_AGG(id ORDER BY created_at) AS revision_ids
FROM inbox_ticket_revisions
GROUP BY ticket_id, content_hash
HAVING COUNT(*) > 1;

-- Inspect legacy workflows that will be marked requires_reapproval.  This is
-- informational only; no row is modified by this preflight script.
SELECT id, ticket_id, status, created_at
FROM automation_workflows
WHERE proposal_id IS NULL
  AND status IN ('approved', 'running', 'waiting_poll', 'ready', 'draft')
ORDER BY created_at DESC;

-- Confirm the provenance columns reported by the application are present.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'automation_workflows' AND column_name = 'proposal_id') OR
    (table_name = 'workflow_proposals' AND column_name = 'entity_resolution')
  )
ORDER BY table_name, column_name;
