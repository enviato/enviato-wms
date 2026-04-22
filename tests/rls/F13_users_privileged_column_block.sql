-- tests/rls/F13_users_privileged_column_block.sql
-- Locks in fix for §6 Q6 follow-through — migration 030_users_block_privileged_column_changes.sql.
--
-- Bug (pre-030): migration 016's WITH CHECK on users_update_v2 pins role_v2 /
-- agent_id / role_id ONLY on the non-admin self-update branch. The ORG_ADMIN-
-- updates-other branch is unrestricted by design (ORG_ADMINs legitimately
-- need to change those columns). Before Q6, admin UIs mutated those columns
-- with supabase-js direct writes; a future regression could silently accept
-- an accidental browser-side write of role_v2/agent_id/role_id.
--
-- Fix: migration 030 adds a BEFORE UPDATE OF role_v2, agent_id, role_id
-- trigger on public.users that:
--   - lets BYPASSRLS roles (service_role / postgres / supabase_admin) through
--   - raises SQLSTATE 42501 for any other role (authenticated, anon, ...)
-- when NEW.<col> IS DISTINCT FROM OLD.<col>.
--
-- This test impersonates an ORG_ADMIN (Alex Lessa) and confirms all three
-- privileged columns are rejected with 42501 when mutated from a request-
-- bound (`authenticated`) connection, while (a) routine columns still
-- succeed from the same session and (b) service_role continues to mutate
-- freely (the /api/admin/reassign-agent path must stay unblocked).
--
-- Regression signal: if this test STOPS raising 42501 on any of the three
-- columns, migration 030's trigger was removed, weakened, or leaked the
-- privileged columns to a non-BYPASSRLS role. Investigate before merging.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- Setup: find a target user in Alex's org who is NOT Alex himself.
-- Run as BYPASSRLS so the setup block can see the victim row regardless
-- of whose session we're about to impersonate.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_target uuid;
  v_agent  uuid;
BEGIN
  SELECT u.id
    INTO v_target
    FROM public.users u
   WHERE u.org_id = '00000000-0000-0000-0000-000000000001'
     AND u.id <> '4109f9a3-9c51-4096-91de-09223cbd9203'
     AND u.deleted_at IS NULL
   ORDER BY u.created_at
   LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-13): no second user in org 0001 for the target of an ORG_ADMIN update. Seed data regressed.';
  END IF;

  SELECT a.id
    INTO v_agent
    FROM public.agents a
   WHERE a.org_id = '00000000-0000-0000-0000-000000000001'
   LIMIT 1;

  IF v_agent IS NULL THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-13): no agent in org 0001 to reassign to. Seed data regressed.';
  END IF;

  -- Stash target + agent in a temp table so the impersonated block below
  -- can read them. Temp tables are session-local (no RLS attached) but they
  -- ARE owned by the creating role (postgres), so we still have to GRANT
  -- SELECT below before SET LOCAL ROLE authenticated runs — otherwise the
  -- impersonated session hits "permission denied for table f13_ctx".
  CREATE TEMP TABLE f13_ctx ON COMMIT DROP AS
  SELECT v_target AS target_id, v_agent AS target_agent_id;
END $$;

GRANT SELECT ON f13_ctx TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- Case A: ORG_ADMIN tries to change another user's role_v2 directly.
-- Expected: trigger rejects with SQLSTATE 42501 + column-named message.
-- ────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"4109f9a3-9c51-4096-91de-09223cbd9203","role":"authenticated","email":"lessaenterprises@gmail.com","app_metadata":{"role_v2":"ORG_ADMIN","org_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);

DO $$
DECLARE
  v_target uuid;
  v_rows   integer;
BEGIN
  SELECT target_id INTO v_target FROM f13_ctx;

  BEGIN
    UPDATE public.users
       SET role_v2 = 'WAREHOUSE_STAFF'
     WHERE id = v_target;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RAISE EXCEPTION
      'TEST FAIL (F-13 Case A REGRESSION): ORG_ADMIN direct UPDATE of users.role_v2 succeeded (% rows). Expected SQLSTATE 42501. Check migration 030 trigger.',
      v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-13 Case A): ORG_ADMIN direct role_v2 write blocked by migration 030 trigger (42501)';
  END;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- Case B: ORG_ADMIN tries to change another user's agent_id directly.
-- Expected: trigger rejects with SQLSTATE 42501.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_target uuid;
  v_agent  uuid;
  v_rows   integer;
BEGIN
  SELECT target_id, target_agent_id INTO v_target, v_agent FROM f13_ctx;

  BEGIN
    UPDATE public.users
       SET agent_id = v_agent
     WHERE id = v_target;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RAISE EXCEPTION
      'TEST FAIL (F-13 Case B REGRESSION): ORG_ADMIN direct UPDATE of users.agent_id succeeded (% rows). Expected SQLSTATE 42501. Check migration 030 trigger.',
      v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-13 Case B): ORG_ADMIN direct agent_id write blocked by migration 030 trigger (42501)';
  END;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- Case C: ORG_ADMIN tries to change another user's role_id directly.
-- Expected: trigger rejects with SQLSTATE 42501.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_target uuid;
  v_role   uuid;
  v_rows   integer;
BEGIN
  SELECT target_id INTO v_target FROM f13_ctx;

  -- Any role row in the org works; we don't care which one because the
  -- trigger fires before the RBAC policy cares about the target value.
  SELECT r.id INTO v_role
    FROM public.roles r
   WHERE r.org_id = '00000000-0000-0000-0000-000000000001'
   LIMIT 1;

  -- If there are zero roles in the org (legacy orgs), fall back to a
  -- fresh uuid — the trigger raises before the FK can complain.
  v_role := COALESCE(v_role, '11111111-1111-1111-1111-111111111111'::uuid);

  BEGIN
    UPDATE public.users
       SET role_id = v_role
     WHERE id = v_target;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RAISE EXCEPTION
      'TEST FAIL (F-13 Case C REGRESSION): ORG_ADMIN direct UPDATE of users.role_id succeeded (% rows). Expected SQLSTATE 42501. Check migration 030 trigger.',
      v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-13 Case C): ORG_ADMIN direct role_id write blocked by migration 030 trigger (42501)';
  END;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- Case D (positive): ORG_ADMIN can still update routine columns on another
-- user via direct PostgREST. is_active is the canonical "admin toggle"
-- case — if we over-tighten and break this, the admin UI snaps.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_target uuid;
  v_rows   integer;
  v_initial boolean;
BEGIN
  SELECT target_id INTO v_target FROM f13_ctx;
  SELECT is_active INTO v_initial FROM public.users WHERE id = v_target;

  UPDATE public.users
     SET is_active = NOT v_initial
   WHERE id = v_target;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-13 Case D over-tightened): ORG_ADMIN UPDATE of users.is_active on in-org user returned % rows, expected 1. Migration 030 trigger over-reached or users_update_v2 regressed.',
      v_rows;
  END IF;

  RAISE NOTICE 'TEST PASS (F-13 Case D): ORG_ADMIN can still update routine columns on in-org users';
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- Case E (positive): service_role (BYPASSRLS) must be able to mutate
-- agent_id directly — /api/admin/reassign-agent depends on this.
-- ────────────────────────────────────────────────────────────────────────
-- Drop the impersonated JWT claims and switch to service_role.
SELECT set_config('request.jwt.claims', NULL, true);
RESET ROLE;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_target    uuid;
  v_agent     uuid;
  v_original  uuid;
  v_rows      integer;
BEGIN
  SELECT target_id, target_agent_id INTO v_target, v_agent FROM f13_ctx;
  SELECT agent_id INTO v_original FROM public.users WHERE id = v_target;

  UPDATE public.users
     SET agent_id = v_agent
   WHERE id = v_target;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-13 Case E BYPASSRLS regression): service_role UPDATE of users.agent_id returned % rows, expected 1. Migration 030 trigger is blocking BYPASSRLS — the /api/admin/reassign-agent route will 500.',
      v_rows;
  END IF;

  -- Sanity: restore the original agent_id so assertions based on seed state
  -- downstream in run_all.sql aren't perturbed. (ROLLBACK at the bottom
  -- also covers this, but defensive.)
  UPDATE public.users SET agent_id = v_original WHERE id = v_target;

  RAISE NOTICE 'TEST PASS (F-13 Case E): service_role can still mutate users.agent_id (BYPASSRLS carve-out intact)';
END $$;

ROLLBACK;
