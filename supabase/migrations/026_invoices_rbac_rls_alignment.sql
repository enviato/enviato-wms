-- 026_invoices_rbac_rls_alignment.sql
-- F-8 (LOW) remediation from the Tier 6 RLS audit (2026-04-19).
--
-- Pre-026, invoices_select_v2 admitted any row whose billed_by_agent_id
-- or billed_to_agent_id was in the caller's accessible-agent tree,
-- regardless of whether the caller had `invoices:view`. AGENT_STAFF
-- (who by default has NO invoice permissions) could therefore SELECT
-- invoices whose `billed_by_agent_id` matched their agent — a drift
-- between RLS visibility and RBAC.
--
-- Role default matrix (confirmed 2026-04-20 via execute_sql):
--   ORG_ADMIN    — invoices:view ✓
--   AGENT_ADMIN  — invoices:view ✓
--   AGENT_STAFF  — invoices:view ✗   <-- the leak
--   WAREHOUSE_STAFF — invoices:view ✗ (intentional; has its own carve-out
--                                      for `billed_by_agent_id IS NULL`
--                                      during intake/billing setup)
--   CUSTOMER     — own branch, gated by customer_id = auth.uid()
--
-- Product decision (2026-04-20): AGENT_STAFF should only see an agent's
-- invoices when explicitly granted `invoices:view` through the
-- `user_permissions` override table (which `user_has_permission()`
-- reads first, ahead of role defaults). This matches the pattern where
-- an agent admin grants their staff temporary billing assistance.
--
-- Fix: wrap the two agent-tree OR branches with
--   user_has_permission((SELECT auth.uid()), 'invoices:view')
-- ORG_ADMIN branch, WAREHOUSE_STAFF unassigned carve-out, and CUSTOMER
-- branch are all untouched.
--
-- Behavior change:
--   - AGENT_ADMIN: unchanged (has `invoices:view` default).
--   - AGENT_STAFF default: loses visibility — this is the intended fix.
--   - AGENT_STAFF with explicit user_permissions grant: sees accessible
--     agent-tree invoices, same as AGENT_ADMIN.
--   - Every other role: unchanged.
--
-- Regression test: tests/rls/F8_invoices_rbac_rls_alignment.sql.

BEGIN;

DROP POLICY IF EXISTS invoices_select_v2 ON public.invoices;

CREATE POLICY invoices_select_v2 ON public.invoices
  FOR SELECT TO authenticated
  USING (
    (
      org_id = (SELECT auth_org_id())
      AND (
        (SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2
        OR (
          -- Agent-tree visibility now requires `invoices:view`.
          -- AGENT_ADMIN has this by default. AGENT_STAFF picks it up
          -- only when explicitly granted via `user_permissions`.
          user_has_permission((SELECT auth.uid()), 'invoices:view')
          AND (
            billed_by_agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())))
            OR billed_to_agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())))
          )
        )
        OR (
          -- WAREHOUSE_STAFF / ORG_ADMIN intake carve-out for invoices
          -- not yet assigned a billed_by_agent_id. Unchanged from
          -- pre-026.
          billed_by_agent_id IS NULL
          AND (SELECT auth_role_v2()) = ANY (ARRAY[
            'ORG_ADMIN'::user_role_v2,
            'WAREHOUSE_STAFF'::user_role_v2
          ])
        )
      )
    )
    OR (
      -- CUSTOMER branch unchanged (024 added `deleted_at IS NULL`).
      (SELECT auth_role_v2()) = 'CUSTOMER'::user_role_v2
      AND customer_id = (SELECT auth.uid())
      AND deleted_at IS NULL
    )
  );

COMMIT;
