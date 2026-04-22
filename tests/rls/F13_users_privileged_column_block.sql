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
  v_target       uuid;
  v_agent        uuid;
  v_old_role_v2  text;     -- enum cast on read so the temp-table column is a
                           -- plain text — keeps the CASE expressions in the
                           -- impersonated blocks below from needing the enum
                           -- type to be in the function's search_path.
  v_old_agent_id uuid;
  v_old_role_id  uuid;
  v_role_for_c   uuid;     -- a role row in the org for Case C to *try* to set.
BEGIN
  SELECT u.id, u.role_v2::text, u.agent_id, u.role_id
    INTO v_target, v_old_role_v2, v_old_agent_id, v_old_role_id
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

  SELECT r.id
    INTO v_role_for_c
    FROM public.roles r
   WHERE r.org_id = '00000000-0000-0000-0000-000000000001'
   LIMIT 1;
  -- Fallback to a fresh UUID if there are no roles in the org — the trigger
  -- raises before the FK can complain, so the literal value doesn't matter.
  v_role_for_c := COALESCE(v_role_for_c, '11111111-1111-1111-1111-111111111111'::uuid);

  -- Stash everything the impersonated blocks will need. We capture OLD
  -- values for the three privileged columns because migration 030's trigger
  -- only raises when NEW IS DISTINCT FROM OLD (no-op writes are not a
  -- security-boundary crossing and shouldn't fire). Without these OLDs the
  -- impersonated UPDATEs would silently no-op when the seeded target already
  -- happens to hold the value the test wants to write — making the assert
  -- vacuously fail because the trigger correctly didn't raise.
  --
  -- Temp tables are session-local (no RLS attached) but they ARE owned by
  -- the creating role (postgres), so we still have to GRANT SELECT below
  -- before SET LOCAL ROLE authenticated runs — otherwise the impersonated
  -- session hits "permission denied for table f13_ctx".
  CREATE TEMP TABLE f13_ctx ON COMMIT DROP AS
  SELECT
    v_target        AS target_id,
    v_agent         AS target_agent_id,
    v_old_role_v2   AS old_role_v2,
    v_old_agent_id  AS old_agent_id,
    v_old_role_id   AS old_role_id,
    v_role_for_c    AS role_for_c;
END $$;

-- BOTH roles need the grant: Cases A-D run as `authenticated`, but Case E
-- switches to `service_role` to verify the trigger lets BYPASSRLS roles
-- through. BYPASSRLS bypasses RLS — NOT object-level table grants — so
-- service_role still needs an explicit SELECT on this temp table.
-- (Run #1 caught the missing authenticated grant; run #4 caught the missing
-- service_role grant. Both fixed here together to close the bug class.)
GRANT SELECT ON f13_ctx TO authenticated, service_role;

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
  v_target  uuid;
  v_old     text;
  v_new     text;
  v_rows    integer;
BEGIN
  SELECT target_id, old_role_v2 INTO v_target, v_old FROM f13_ctx;

  -- Pick a NEW value guaranteed different from OLD. The trigger's IS DISTINCT
  -- FROM check correctly skips no-op writes, so we have to actually change
  -- the value to confirm the write path is blocked. WAREHOUSE_STAFF is the
  -- canonical "escalate from CUSTOMER" target; if the seeded user is already
  -- WAREHOUSE_STAFF (which it is in the current seed), fall back to ORG_ADMIN
  -- — both are valid role_v2 enum values and either is a privilege change a
  -- malicious client might attempt.
  v_new := CASE WHEN v_old = 'WAREHOUSE_STAFF' THEN 'ORG_ADMIN' ELSE 'WAREHOUSE_STAFF' END;

  BEGIN
    -- The column is users.role_v2; the enum type backing it is
    -- public.user_role_v2 (see baseline line 58). Don't conflate the two —
    -- '%L::role_v2' would error with "type role_v2 does not exist".
    EXECUTE format(
      'UPDATE public.users SET role_v2 = %L::public.user_role_v2 WHERE id = %L',
      v_new, v_target
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RAISE EXCEPTION
      'TEST FAIL (F-13 Case A REGRESSION): ORG_ADMIN direct UPDATE of users.role_v2 (%→%) succeeded (% rows). Expected SQLSTATE 42501. Check migration 030 trigger.',
      v_old, v_new, v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-13 Case A): ORG_ADMIN direct role_v2 write (%→%) blocked by migration 030 trigger (42501)', v_old, v_new;
  END;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- Case B: ORG_ADMIN tries to change another user's agent_id directly.
-- Expected: trigger rejects with SQLSTATE 42501.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_target  uuid;
  v_agent   uuid;
  v_old     uuid;
  v_new     uuid;
  v_rows    integer;
BEGIN
  SELECT target_id, target_agent_id, old_agent_id
    INTO v_target, v_agent, v_old
    FROM f13_ctx;

  -- Pick a NEW value guaranteed different from OLD. If OLD already equals
  -- the staged target_agent_id (which is just the first agent in the org),
  -- flip to NULL — both are real-world reassignment patterns a client might
  -- try, and both must be rejected at the trigger.
  v_new := CASE WHEN v_old IS DISTINCT FROM v_agent THEN v_agent ELSE NULL END;

  BEGIN
    UPDATE public.users
       SET agent_id = v_new
     WHERE id = v_target;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RAISE EXCEPTION
      'TEST FAIL (F-13 Case B REGRESSION): ORG_ADMIN direct UPDATE of users.agent_id (%→%) succeeded (% rows). Expected SQLSTATE 42501. Check migration 030 trigger.',
      v_old, v_new, v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-13 Case B): ORG_ADMIN direct agent_id write (%→%) blocked by migration 030 trigger (42501)', v_old, v_new;
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
  v_old    uuid;
  v_new    uuid;
  v_rows   integer;
BEGIN
  SELECT target_id, old_role_id, role_for_c
    INTO v_target, v_old, v_role
    FROM f13_ctx;

  -- Pick a NEW value guaranteed different from OLD. role_for_c is just the
  -- first role row in the org (or a synthetic UUID if the org has zero
  -- roles); if it happens to match OLD, fall through to a different
  -- synthetic UUID. The trigger fires before the FK can complain about
  -- a value that doesn't actually reference public.roles.
  v_new := CASE
             WHEN v_old IS DISTINCT FROM v_role THEN v_role
             ELSE '22222222-2222-2222-2222-222222222222'::uuid
           END;

  BEGIN
    UPDATE public.users
       SET role_id = v_new
     WHERE id = v_target;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RAISE EXCEPTION
      'TEST FAIL (F-13 Case C REGRESSION): ORG_ADMIN direct UPDATE of users.role_id (%→%) succeeded (% rows). Expected SQLSTATE 42501. Check migration 030 trigger.',
      v_old, v_new, v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-13 Case C): ORG_ADMIN direct role_id write (%→%) blocked by migration 030 trigger (42501)', v_old, v_new;
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
