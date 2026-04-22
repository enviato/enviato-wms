-- 030_users_block_privileged_column_changes.sql
--
-- Tier 6 §6 Q6 follow-through (decision doc: docs/audits/2026-04-21-q6-api-route-vs-direct-decision.md).
--
-- What this closes
--   Migration 016 added a WITH CHECK to users_update_v2 that pins
--   role_v2 / agent_id / role_id on the SELF-UPDATE branch (F-1/F-2).
--   The ORG_ADMIN-updates-other branch was left unrestricted because
--   ORG_ADMINs legitimately need to change those columns. Today the
--   admin UI does that via direct supabase-js calls. Tomorrow, when a
--   future feature accidentally writes role_v2 from the client and
--   nobody catches it in review, the policy will silently accept it.
--
--   Q6 decision: route privileged column changes through server-side
--   /api/admin/* handlers using service_role. This migration adds the
--   defense-in-depth layer that backs that decision: a BEFORE UPDATE
--   trigger on public.users that rejects any attempt to change
--   role_v2 / agent_id / role_id from a non-BYPASSRLS connection.
--
-- Why a trigger and not WITH CHECK
--   1. WITH CHECK on the ORG_ADMIN branch would need a self-referencing
--      subquery against public.users to read OLD values. That's the same
--      trap migration 016 documented as 42P17 "infinite recursion in
--      policy" — the inner SELECT is itself RLS-filtered.
--      Workaround would be another SECURITY DEFINER helper per column,
--      with all the corresponding GRANT bookkeeping.
--   2. A trigger has direct access to OLD and NEW. No recursion. One
--      function, three checks, done.
--   3. A trigger fires on EVERY update path — self, ORG_ADMIN, future
--      role variants, anything routed through PostgREST. WITH CHECK
--      branch logic has to enumerate roles. Trigger is role-agnostic.
--   4. service_role bypasses cleanly via the rolbypassrls check below,
--      so the new /api/admin/reassign-agent route works unmodified.
--
-- Why this preserves the existing self-update WITH CHECK pin
--   Belt and suspenders. The WITH CHECK pin in 016 already blocks
--   F-1/F-2 for the self-update path. This trigger covers ORG_ADMIN
--   AND self-update paths. If either layer regresses by accident, the
--   other still rejects. The redundancy cost is one CPU branch per
--   UPDATE; the safety cost of removing it is "one bad migration away
--   from re-opening F-1." Keep both.
--
-- BYPASSRLS roles allowed through (verified against Supabase setup):
--   - postgres        (migrations, supabase_admin internals)
--   - service_role    (admin API routes via createAdminClient)
--   - supabase_admin  (dashboard-issued queries)
--   The handle_new_user() trigger that stamps role_v2 on new users runs
--   as postgres (it's defined SECURITY DEFINER), so it's unaffected.
--
-- Behavioral parity check
--   - Direct browser update of users.{first_name, last_name, phone, ...} → unchanged.
--   - Direct browser update of users.is_active → unchanged.
--   - Direct browser update of users.agent_id → REJECTED (was: silently allowed for ORG_ADMIN).
--   - Direct browser update of users.role_v2 → REJECTED (was: silently allowed for ORG_ADMIN).
--   - Direct browser update of users.role_id → REJECTED (was: silently allowed for ORG_ADMIN).
--   - /api/admin/* routes via service_role → unchanged (BYPASSRLS).
--   - Migrations → unchanged (run as postgres, BYPASSRLS).
--
-- Failure mode (if a privileged column change is attempted from a
-- non-BYPASSRLS connection)
--   Postgres raises with SQLSTATE 42501 "insufficient_privilege". The
--   message names the column AND the route to use, so the developer
--   sees exactly where to redirect their write:
--     ERROR: column "agent_id" cannot be changed via direct client
--     update; use POST /api/admin/reassign-agent
--
-- Regression test: tests/rls/F13_users_privileged_column_block.sql
--   (F12 is already used by tests/rls/F12_for_all_role_gates.sql, so this
--    new invariant gets the next free finding-style slot.)

BEGIN;

CREATE OR REPLACE FUNCTION public.users_block_privileged_column_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_bypass boolean;
BEGIN
  -- Server-side trusted callers (service_role, postgres, supabase_admin)
  -- have BYPASSRLS. They're allowed to set these columns directly.
  -- Looking up the role attribute is one indexed catalog hit; cheap.
  SELECT rolbypassrls
    INTO v_bypass
    FROM pg_catalog.pg_roles
   WHERE rolname = current_user;

  IF v_bypass THEN
    RETURN NEW;
  END IF;

  -- Fall through: enforce column immutability for request-bound roles
  -- (authenticated, anon, or anything else without BYPASSRLS).

  IF NEW.role_v2 IS DISTINCT FROM OLD.role_v2 THEN
    RAISE EXCEPTION
      'column "role_v2" cannot be changed via direct client update; use POST /api/admin/set-user-role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
    RAISE EXCEPTION
      'column "agent_id" cannot be changed via direct client update; use POST /api/admin/reassign-agent'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    RAISE EXCEPTION
      'column "role_id" cannot be changed via direct client update; use POST /api/admin/set-user-role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL     ON FUNCTION public.users_block_privileged_column_changes() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.users_block_privileged_column_changes() TO authenticated, service_role;

-- One trigger per table; fires before all the existing application
-- triggers (trg_users_updated, etc.) so the rejection happens before
-- any side-effect work. Trigger name sorts alphabetically before
-- trg_users_updated so the firing order is deterministic.
DROP TRIGGER IF EXISTS trg_users_block_privileged_column_changes ON public.users;
CREATE TRIGGER trg_users_block_privileged_column_changes
  BEFORE UPDATE OF role_v2, agent_id, role_id
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_block_privileged_column_changes();

COMMIT;

-- ============================================================================
-- RE-TEST (run as separate transactions; not part of the migration)
--
--   Kills accidental ORG_ADMIN-updates-other on role_v2:
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<org_admin-uuid>","role":"authenticated",
--         "app_metadata":{"role_v2":"ORG_ADMIN","org_id":"<org>"}}',
--       true);
--     UPDATE public.users
--        SET role_v2 = 'WAREHOUSE_STAFF'
--      WHERE id = '<other-user-in-same-org>';
--     -- Expected: ERROR 42501 (was: 1 row affected).
--   ROLLBACK;
--
--   Kills accidental ORG_ADMIN agent_id reassignment from client:
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<org_admin-uuid>","role":"authenticated",
--         "app_metadata":{"role_v2":"ORG_ADMIN","org_id":"<org>"}}',
--       true);
--     UPDATE public.users SET agent_id = '<some-agent>'
--      WHERE id = '<customer-in-same-org>';
--     -- Expected: ERROR 42501.
--   ROLLBACK;
--
--   Happy-path: routine column update (is_active toggle) still works:
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<org_admin-uuid>","role":"authenticated",
--         "app_metadata":{"role_v2":"ORG_ADMIN","org_id":"<org>"}}',
--       true);
--     UPDATE public.users SET is_active = false
--      WHERE id = '<other-user-in-same-org>';
--     -- Expected: 1 row affected.
--   ROLLBACK;
--
--   Happy-path: service_role can still mutate (the new /api/admin route):
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE service_role;
--     UPDATE public.users SET agent_id = '<new-agent>'
--      WHERE id = '<customer>';
--     -- Expected: 1 row affected.
--   ROLLBACK;
-- ============================================================================
