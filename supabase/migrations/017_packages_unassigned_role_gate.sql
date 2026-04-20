-- ============================================================================
-- Migration 017: packages_select_v2 — gate the `agent_id IS NULL` carve-out
--                on caller role.
-- ============================================================================
--
-- Audit reference: docs/audits/2026-04-19-tier6-rls-audit.md
--   F-3 (CRITICAL): CUSTOMER / AGENT_STAFF can read every unassigned package
--                   in their org via an unconditional `agent_id IS NULL` OR.
--
-- Root cause:
--   Current policy:
--     USING (
--       org_id = auth_org_id()
--       AND (
--         auth_role_v2() IN ('ORG_ADMIN','WAREHOUSE_STAFF')
--         OR agent_id IN (SELECT get_accessible_agent_ids(auth.uid()))
--         OR agent_id IS NULL   -- <-- unconditional. any role in the org matches.
--       )
--     )
--   A CUSTOMER or AGENT_STAFF in the tenant reads every unassigned package,
--   including PII (recipient name/phone/address) captured at intake.
--
-- Fix (owner decision 2026-04-19):
--   "There should be no unassigned packages. Period. Every package needs an
--    agent and a recipient." — so the `agent_id IS NULL` carve-out is removed
--   ENTIRELY from the read policy. No role can rely on reading NULL-agent rows
--   via this branch. ORG_ADMIN and WAREHOUSE_STAFF still see every package in
--   the org via the first branch (so if a stray NULL-agent row somehow appears,
--   admins can still find and fix it). Everyone else is blocked.
--
--   A companion migration (019_packages_agent_customer_not_null.sql) will add
--   NOT NULL constraints on packages.agent_id and packages.customer_id to
--   enforce this rule at the schema level. That migration is deferred until
--   the single orphan customer_id row is resolved.
--
-- Re-test: see SQL at the bottom of this file / Tier 6 audit §3 Test 2.
-- ============================================================================

BEGIN;

ALTER POLICY packages_select_v2 ON public.packages
  USING (
    org_id = (SELECT public.auth_org_id())
    AND (
      -- Org-wide staff roles read all packages in their org.
      (SELECT public.auth_role_v2()) IN (
        'ORG_ADMIN'::public.user_role_v2,
        'WAREHOUSE_STAFF'::public.user_role_v2
      )
      -- Agent-scoped: row belongs to an agent this caller can access
      -- (self, managed agents for AGENT_ADMIN, customer's agent for CUSTOMER).
      OR agent_id IN (SELECT public.get_accessible_agent_ids((SELECT auth.uid())))
      -- NULL-agent carve-out removed — per business rule, no package should
      -- ever exist with a NULL agent_id. Admins still see all org rows via
      -- the first branch above.
    )
  );

COMMIT;

-- ============================================================================
-- RE-TEST (run as a separate transaction from application code, not here):
--
--   Kills F-3: CUSTOMER reads unassigned package
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<customer-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     SELECT id, agent_id
--       FROM public.packages
--      WHERE org_id = '<org>' AND agent_id IS NULL
--      LIMIT 5;
--     -- Expected: 0 rows.
--   ROLLBACK;
--
--   Kills F-3: AGENT_STAFF reads unassigned package
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<agent_staff-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     SELECT id FROM public.packages
--      WHERE org_id = '<org>' AND agent_id IS NULL LIMIT 5;
--     -- Expected: 0 rows.
--   ROLLBACK;
--
--   Happy-path: WAREHOUSE_STAFF still reads unassigned packages
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<warehouse-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     SELECT count(*) FROM public.packages
--      WHERE org_id = '<org>' AND agent_id IS NULL;
--     -- Expected: > 0 (same as before migration).
--   ROLLBACK;
--
--   Happy-path: CUSTOMER still reads packages linked to their agent
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<customer-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     SELECT count(*) FROM public.packages
--      WHERE agent_id IN (SELECT public.get_accessible_agent_ids('<customer-uuid>'));
--     -- Expected: > 0 (unchanged from before).
--   ROLLBACK;
-- ============================================================================
