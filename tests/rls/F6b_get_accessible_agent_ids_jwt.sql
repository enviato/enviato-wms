-- tests/rls/F6b_get_accessible_agent_ids_jwt.sql
-- Locks in migration 028 (F-6 follow-through — JWT-first rewrite of
-- public.get_accessible_agent_ids, enabled by 027's agent_id claim).
--
-- Contract being tested (from 028):
--   Happy path (self-lookup, post-027 JWT with claims):
--     - ORG_ADMIN / WAREHOUSE_STAFF: needs org_id claim → all agents in org
--     - AGENT_ADMIN                : needs agent_id claim → closure descendants
--     - AGENT_STAFF                : needs agent_id claim → self only
--     - CUSTOMER                   : role alone → empty set
--   Fallback (any of these triggers public.users lookup):
--     - p_user_id != auth.uid() (different-user introspection)
--     - auth.jwt() IS NULL (service_role, cron)
--     - role_v2 claim missing (pre-015 legacy token)
--     - AGENT_ADMIN/AGENT_STAFF + agent_id claim missing (pre-027 token)
--
-- Regression signals:
--   Case A (AGENT_STAFF, full JWT): wrong count → JWT fast path broken,
--     or role-branching changed.
--   Case B (AGENT_STAFF, forged agent_id in JWT): returns DB agent_id →
--     fast path didn't activate (the claim is being ignored and DB is
--     winning, which would be a perf regression — function still works
--     for security because JWT is signed in prod).
--   Case C (AGENT_STAFF, JWT missing agent_id): returns 0 rows → fallback
--     didn't kick in (function treated missing claim as an empty tree).
--   Case D (cross-user lookup): matches Case A but returns wrong user's
--     set → 028 is reading caller's JWT for a different target.
--   Case E (ORG_ADMIN): count != full org-agent count → bypass branch
--     changed.
--   Case F (CUSTOMER): non-empty → CUSTOMER branch leaked.
--
-- Note: these cases exercise both the JWT fast path and the DB fallback
-- against the SAME fixtures, so behavior must be byte-identical between
-- the two branches of 028's body. That's the whole point — 028 is
-- strictly a performance rewrite.

BEGIN;

-- ---------------------------------------------------------------------------
-- Stage expected counts from the DB before any impersonation, so the
-- ground truth doesn't depend on JWT behavior.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_staff_agent_id uuid;
  v_staff_count    integer;
  v_admin_count    integer;
BEGIN
  -- AGENT_STAFF fixture platinumcorp1: self agent_id
  SELECT u.agent_id INTO v_staff_agent_id
    FROM public.users u
   WHERE u.id = '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9';
  IF v_staff_agent_id IS NULL THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-6b): AGENT_STAFF fixture has no agent_id.';
  END IF;

  -- ORG_ADMIN fixture Alex: every agent in the org
  SELECT count(*) INTO v_admin_count
    FROM public.agents
   WHERE org_id = '00000000-0000-0000-0000-000000000001';
  IF v_admin_count < 1 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-6b): prod org has 0 agents. Seed regressed.';
  END IF;

  -- AGENT_STAFF accessible tree size (should be 1 — self only)
  SELECT count(*) INTO v_staff_count
    FROM public.get_accessible_agent_ids('2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'::uuid);
  IF v_staff_count <> 1 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-6b): AGENT_STAFF accessible-tree size = %, expected 1.',
      v_staff_count;
  END IF;

  CREATE TEMP TABLE _f6b_expected ON COMMIT DROP AS
    SELECT v_staff_agent_id AS staff_agent_id,
           v_staff_count    AS staff_count,
           v_admin_count    AS admin_count;
END $$;

GRANT SELECT ON _f6b_expected TO authenticated;

-- ---------------------------------------------------------------------------
-- CASE A: AGENT_STAFF with full post-027 JWT — fast path active,
-- agent_id claim matches DB. Must return self agent_id.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_staff_agent_id uuid;
  v_returned       uuid;
  v_count          integer;
  v_claims         text;
BEGIN
  SELECT staff_agent_id INTO v_staff_agent_id FROM _f6b_expected;

  v_claims := jsonb_build_object(
    'sub',   '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9',
    'role',  'authenticated',
    'email', 'platinumcorp1@gmail.com',
    'app_metadata', jsonb_build_object(
      'role_v2',  'AGENT_STAFF',
      'org_id',   '00000000-0000-0000-0000-000000000001',
      'agent_id', v_staff_agent_id::text
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  SELECT agent_id INTO v_returned
    FROM public.get_accessible_agent_ids(
      '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'::uuid
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 1 OR v_returned <> v_staff_agent_id THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6b Case A): full JWT returned % row(s) = %, expected 1 row = %. Fast path or AGENT_STAFF branch broken.',
      v_count, v_returned, v_staff_agent_id;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6b Case A): AGENT_STAFF full JWT returns self';
END $$;

-- ---------------------------------------------------------------------------
-- CASE B: AGENT_STAFF with JWT carrying a DIFFERENT agent_id than DB.
-- Proves the JWT fast path is actually consulted. In prod, the JWT is
-- signed by GoTrue and trusted, so whatever the hook minted is what the
-- RLS function honors. If this test returns the DB value instead, the
-- fast path is silently falling back (perf regression) or bypassed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_forged         uuid := '11111111-1111-1111-1111-111111111111';
  v_returned       uuid;
  v_count          integer;
  v_claims         text;
BEGIN
  v_claims := jsonb_build_object(
    'sub',   '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9',
    'role',  'authenticated',
    'email', 'platinumcorp1@gmail.com',
    'app_metadata', jsonb_build_object(
      'role_v2',  'AGENT_STAFF',
      'org_id',   '00000000-0000-0000-0000-000000000001',
      'agent_id', v_forged::text
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  SELECT agent_id INTO v_returned
    FROM public.get_accessible_agent_ids(
      '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'::uuid
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 1 OR v_returned <> v_forged THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6b Case B): forged-JWT agent_id returned % row(s) = %, expected 1 row = % (the forged value). JWT fast path is not being used — either the branch order regressed or the function is always hitting the DB.',
      v_count, v_returned, v_forged;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6b Case B): JWT fast path honored (returns claim value over DB value)';
END $$;

-- ---------------------------------------------------------------------------
-- CASE C: AGENT_STAFF with JWT missing agent_id claim (simulates a
-- pre-027 token still live in its 1h TTL window). Role_v2 present;
-- function must fall back to DB and return the real agent_id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_staff_agent_id uuid;
  v_returned       uuid;
  v_count          integer;
  v_claims         text;
BEGIN
  SELECT staff_agent_id INTO v_staff_agent_id FROM _f6b_expected;

  v_claims := jsonb_build_object(
    'sub',   '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9',
    'role',  'authenticated',
    'email', 'platinumcorp1@gmail.com',
    'app_metadata', jsonb_build_object(
      'role_v2', 'AGENT_STAFF',
      'org_id',  '00000000-0000-0000-0000-000000000001'
      -- agent_id deliberately absent — pre-027 token
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  SELECT agent_id INTO v_returned
    FROM public.get_accessible_agent_ids(
      '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'::uuid
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 1 OR v_returned <> v_staff_agent_id THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6b Case C): pre-027 JWT (no agent_id claim) returned % row(s) = %, expected 1 row = % (DB fallback). The fallback path did not activate — pre-027 tokens would return wrong results during the rollout window.',
      v_count, v_returned, v_staff_agent_id;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6b Case C): pre-027 token triggers DB fallback cleanly';
END $$;

-- ---------------------------------------------------------------------------
-- CASE D: p_user_id != auth.uid() — ORG_ADMIN introspecting AGENT_STAFF.
-- Fast path must NOT activate (caller's JWT describes the caller, not
-- the target). Result should be AGENT_STAFF's real tree (1 row).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_staff_agent_id uuid;
  v_returned       uuid;
  v_count          integer;
  v_claims         text;
BEGIN
  SELECT staff_agent_id INTO v_staff_agent_id FROM _f6b_expected;

  -- Impersonate ORG_ADMIN Alex with a full JWT. If the function
  -- naively trusted the caller's JWT, it would return all org agents.
  v_claims := jsonb_build_object(
    'sub',   '4109f9a3-9c51-4096-91de-09223cbd9203',
    'role',  'authenticated',
    'email', 'lessaenterprises@gmail.com',
    'app_metadata', jsonb_build_object(
      'role_v2', 'ORG_ADMIN',
      'org_id',  '00000000-0000-0000-0000-000000000001'
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  -- Look up the AGENT_STAFF user's accessible agents (not Alex's).
  SELECT agent_id INTO v_returned
    FROM public.get_accessible_agent_ids(
      '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'::uuid
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 1 OR v_returned <> v_staff_agent_id THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6b Case D): cross-user lookup returned % row(s) = %, expected 1 row = % (target user''s real agent). 028 is reading caller''s JWT for a different p_user_id — privilege-escalation vector.',
      v_count, v_returned, v_staff_agent_id;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6b Case D): cross-user lookup bypasses JWT and reads target from DB';
END $$;

-- ---------------------------------------------------------------------------
-- CASE E: ORG_ADMIN self-lookup with full JWT — must return every
-- agent in the org. Exercises the ORG_ADMIN/WAREHOUSE_STAFF bypass
-- branch on the fast path.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_expected integer;
  v_count    integer;
  v_claims   text;
BEGIN
  SELECT admin_count INTO v_expected FROM _f6b_expected;

  v_claims := jsonb_build_object(
    'sub',   '4109f9a3-9c51-4096-91de-09223cbd9203',
    'role',  'authenticated',
    'email', 'lessaenterprises@gmail.com',
    'app_metadata', jsonb_build_object(
      'role_v2', 'ORG_ADMIN',
      'org_id',  '00000000-0000-0000-0000-000000000001'
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  SELECT count(*) INTO v_count
    FROM public.get_accessible_agent_ids(
      '4109f9a3-9c51-4096-91de-09223cbd9203'::uuid
    );

  IF v_count <> v_expected THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6b Case E): ORG_ADMIN returned % agents, expected % (full org). The ORG_ADMIN bypass branch regressed.',
      v_count, v_expected;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6b Case E): ORG_ADMIN sees all % agent(s)', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- CASE F: CUSTOMER self-lookup — always empty set.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count  integer;
  v_claims text;
BEGIN
  v_claims := jsonb_build_object(
    'sub',   'a0000000-0000-0000-0000-000000000007',
    'role',  'authenticated',
    'email', 'ana.martinez@example.com',
    'app_metadata', jsonb_build_object(
      'role_v2', 'CUSTOMER',
      'org_id',  '00000000-0000-0000-0000-000000000001'
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  SELECT count(*) INTO v_count
    FROM public.get_accessible_agent_ids(
      'a0000000-0000-0000-0000-000000000007'::uuid
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6b Case F): CUSTOMER returned % rows, expected 0. Customer branch leaked.',
      v_count;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6b Case F): CUSTOMER sees no accessible agents';
END $$;

ROLLBACK;
