-- Run after 20260913000000_atomic_revisions_and_workflow_safety.sql.

-- Both functions must appear with the declared identity argument types.
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_or_get_inbox_ticket_revision',
    'approve_workflow_proposal'
  )
ORDER BY p.proname;

-- Only service_role may execute these command RPCs.  No `anon`,
-- `authenticated`, or PUBLIC row may be returned.
SELECT p.proname AS function_name,
       COALESCE(r.rolname, 'PUBLIC') AS grantee,
       a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON TRUE
LEFT JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_or_get_inbox_ticket_revision',
    'approve_workflow_proposal'
  )
  AND a.privilege_type = 'EXECUTE'
ORDER BY p.proname, grantee;
