-- ============================================================================
-- Migration 016: users_update_v2 — add WITH CHECK clause to block in-tenant
--                privilege escalation via self-UPDATE.
-- ============================================================================
--
-- Audit reference: docs/audits/2026-04-19-tier6-rls-audit.md
--   F-1 (CRITICAL): self-UPDATE can promote role_v2 → ORG_ADMIN
--   F-2 (CRITICAL): self-UPDATE can rewrite agent_id / role_id (tenant-internal
--                   privilege escalation and customer impersonation)
--
-- Root cause:
--   The existing policy `users_update_v2` has USING only — no WITH CHECK.
--   When WITH CHECK is omitted, Postgres defaults WITH CHECK := USING. The
--   USING clause allows self-rows (`id = auth.uid()`) OR any row in the same
--   org if the caller is ORG_ADMIN. Because the default WITH CHECK is the
--   same, a non-admin caller can UPDATE their own row with ANY new values
--   for role_v2, agent_id, role_id (any value their own tenant scope can see).
--
-- Fix:
--   Explicit WITH CHECK that:
--     1. Still requires the new row to belong to the caller's org (no
--        cross-tenant moves).
--     2. If caller is NOT ORG_ADMIN, requires the new row to still be the
--        caller's own row AND forbids changes to privilege-carrying columns:
--          role_v2, agent_id, role_id
--        (via `IS NOT DISTINCT FROM` the current value, handling NULLs).
--     3. ORG_ADMIN remains unrestricted within their org (existing behavior).
--
-- HOTFIX (applied live as migration 016a_auth_role_id_helper_and_fix on
-- 2026-04-19, now consolidated into this file):
--   The first draft of this migration used inline correlated subqueries like
--   `(SELECT u.role_v2 FROM public.users u WHERE u.id = auth.uid())` inside
--   WITH CHECK. That triggered runtime error 42P17 "infinite recursion
--   detected in policy for relation users" because the inner SELECT against
--   public.users was itself RLS-filtered by users_select_v2, which invokes
--   this policy chain again. The fix is to read the caller's current values
--   through SECURITY DEFINER helpers that bypass RLS (same pattern already
--   used by auth_org_id / auth_role_v2 / auth_agent_id). We add auth_role_id()
--   to complete the set.
--
-- Re-test: see SQL at the bottom of this file / Tier 6 audit §3 Tests 9 + 9c.
-- ============================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- Helper: auth_role_id()
--   Returns the caller's current role_id, bypassing RLS. Mirrors the
--   existing auth_org_id() / auth_role_v2() / auth_agent_id() helpers.
--   SECURITY DEFINER so the lookup against public.users is NOT filtered
--   by users_select_v2 (which would cause infinite recursion if invoked
--   from within a policy on public.users itself).
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role_id FROM public.users WHERE id = auth.uid();
$$;

REVOKE ALL     ON FUNCTION public.auth_role_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.auth_role_id() TO authenticated, service_role;


-- -----------------------------------------------------------------------
-- Policy: users_update_v2
--   Drop the permissive policy. We re-create under the same name to
--   preserve the audit/migration trail and make diffs against pg_policies
--   clean.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS users_update_v2 ON public.users;

CREATE POLICY users_update_v2
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    org_id = (SELECT public.auth_org_id())
    AND (
      (SELECT public.auth_role_v2()) = 'ORG_ADMIN'::public.user_role_v2
      OR id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    -- Row must stay in caller's org (no cross-tenant moves).
    org_id = (SELECT public.auth_org_id())
    AND (
      -- ORG_ADMIN: unrestricted within org (existing behavior preserved).
      (SELECT public.auth_role_v2()) = 'ORG_ADMIN'::public.user_role_v2
      OR (
        -- Non-admin self-update: stays on own row AND cannot change
        -- privilege-carrying columns. Values are read through SECURITY
        -- DEFINER helpers to avoid recursive RLS evaluation on public.users.
        id = (SELECT auth.uid())
        AND role_v2  IS NOT DISTINCT FROM (SELECT public.auth_role_v2())
        AND agent_id IS NOT DISTINCT FROM (SELECT public.auth_agent_id())
        AND role_id  IS NOT DISTINCT FROM (SELECT public.auth_role_id())
      )
    )
  );

COMMIT;

-- ============================================================================
-- RE-TEST (run as a separate transaction from application code, not here):
--
--   Kills F-1: escalate self to ORG_ADMIN
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<customer-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     UPDATE public.users
--        SET role_v2 = 'ORG_ADMIN'
--      WHERE id = '<customer-uuid>';
--     -- Expected: 0 rows affected (WITH CHECK blocks).
--   ROLLBACK;
--
--   Kills F-2: rewrite agent_id (customer impersonation vector)
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<agent_staff-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     UPDATE public.users
--        SET agent_id = '<different-agent-uuid>'
--      WHERE id = '<agent_staff-uuid>';
--     -- Expected: 0 rows affected.
--   ROLLBACK;
--
--   Happy-path: customer updates own phone/first_name
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<customer-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     UPDATE public.users SET phone = '+15555550123'
--      WHERE id = '<customer-uuid>';
--     -- Expected: 1 row affected.
--   ROLLBACK;
--
--   Happy-path: ORG_ADMIN changes another user's role_v2
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<org_admin-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     UPDATE public.users SET role_v2 = 'WAREHOUSE_STAFF'
--      WHERE id = '<other-user-in-same-org>';
--     -- Expected: 1 row affected.
--   ROLLBACK;
-- ============================================================================
