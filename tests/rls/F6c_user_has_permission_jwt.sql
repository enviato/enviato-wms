-- tests/rls/F6c_user_has_permission_jwt.sql
-- Locks in migration 029 (F-6 follow-through tail — JWT-first role_v2
-- resolution in public.user_has_permission).
--
-- Contract being tested (from 029):
--   Happy path (self-lookup, JWT with role_v2 claim):
--     - role_v2 read from auth.jwt() app_metadata, public.users SKIPPED.
--     - Override / hard-constraint / role-default logic unchanged.
--   Fallback (any of these triggers public.users lookup):
--     - p_user_id != auth.uid() (cross-user introspection)
--     - auth.jwt() IS NULL (service_role / cron)
--     - role_v2 claim missing or empty (pre-022 legacy token)
--
-- Regression signals:
--   Case A (happy path): wrong answer → JWT parsing or role-default
--     branch broken.
--   Case B (forged role_v2 claim): returns DB answer instead of
--     claim-based answer → fast path silently not active (perf
--     regression; function still secure because GoTrue signs JWTs
--     in prod, but 029's optimization is gone).
--   Case C (pre-022 JWT missing role_v2): returns false or wrong
--     truth → fallback path didn't activate, legacy tokens would
--     break during the 1h rollout window.
--   Case D (cross-user lookup): honors caller's JWT instead of
--     target's DB role → privilege-escalation vector.
--   Case E (user_permissions override): override ignored → the 029
--     rewrite clobbered the per-user override path.
--   Case F (hard-constraint block): non-ORG_ADMIN gets a granted
--     hard-constrained permission → hard guard was bypassed when
--     role came from JWT instead of DB.
--
-- These exercise both the fast path and the DB fallback against
-- the SAME fixtures — behavior must be byte-identical between the
-- two branches. 029 is strictly a performance rewrite.

BEGIN;

-- ---------------------------------------------------------------------------
-- Stage test fixtures before any impersonation:
--   - seed user_permissions rows for Cases E + F (rolled back at COMMIT)
--   - resolve known permission_keys for the assertions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Sanity: permission_keys we use must exist (tests depend on them
  -- being in the prod seed).
  IF NOT EXISTS (SELECT 1 FROM public.permission_keys WHERE id = 'invoices:view') THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-6c): permission_keys.invoices:view missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.permission_keys WHERE id = 'packages:delete' AND is_hard_constraint = true) THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-6c): permission_keys.packages:delete missing or not hard-constrained';
  END IF;

  -- Fixture check: the three users we impersonate must carry the
  -- expected role_v2 in DB (the JWT claim we forge must diverge
  -- from these to make Case B meaningful).
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '4109f9a3-9c51-4096-91de-09223cbd9203' AND role_v2 = 'ORG_ADMIN'
  ) THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-6c): Alex fixture must be ORG_ADMIN in DB';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = 'a0000000-0000-0000-0000-000000000007' AND role_v2 = 'CUSTOMER'
  ) THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-6c): Ana fixture must be CUSTOMER in DB';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9' AND role_v2 = 'AGENT_STAFF'
  ) THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-6c): platinumcorp1 fixture must be AGENT_STAFF in DB';
  END IF;

  -- Seed a per-user override: Ana (CUSTOMER) granted invoices:view.
  -- Used in Case E.
  INSERT INTO public.user_permissions (id, user_id, permission_key, granted, reason)
  VALUES (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000007',
    'invoices:view',
    true,
    'F-6c Case E regression fixture'
  );

  -- Seed a hard-constrained grant: AGENT_STAFF granted packages:delete.
  -- Used in Case F to prove the hard guard still fires when v_role
  -- came from the JWT.
  INSERT INTO public.user_permissions (id, user_id, permission_key, granted, reason)
  VALUES (
    gen_random_uuid(),
    '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9',
    'packages:delete',
    true,
    'F-6c Case F regression fixture'
  );
END $$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- CASE A: ORG_ADMIN self-lookup with full JWT, asking for a permission
-- that ORG_ADMIN has as a role default ('invoices:view'). Must return
-- true via the JWT fast path + role_permission_defaults match.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result boolean;
  v_claims text;
BEGIN
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

  v_result := public.user_has_permission(
    '4109f9a3-9c51-4096-91de-09223cbd9203'::uuid,
    'invoices:view'
  );

  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6c Case A): ORG_ADMIN self-lookup for invoices:view returned %, expected true. JWT fast path or role-default branch broken.',
      v_result;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6c Case A): ORG_ADMIN + invoices:view → true via JWT';
END $$;

-- ---------------------------------------------------------------------------
-- CASE B: Forged role_v2 claim. Ana is CUSTOMER in DB and would
-- normally be denied invoices:view (no override yet applies — the
-- override seeded above is for Case E, which uses Ana's real role).
-- Actually we use a DIFFERENT fixture for Case B to keep the override
-- isolated to Case E. Use Alex's UID with a forged role_v2='CUSTOMER'
-- claim. The DB says Alex is ORG_ADMIN; if the fast path is active,
-- the function trusts the JWT claim of 'CUSTOMER' and looks up
-- role_permission_defaults for CUSTOMER + invoices:view → no row →
-- returns false. If the fast path silently fell back to DB, it would
-- see ORG_ADMIN and return true.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result boolean;
  v_claims text;
BEGIN
  v_claims := jsonb_build_object(
    'sub',   '4109f9a3-9c51-4096-91de-09223cbd9203',
    'role',  'authenticated',
    'email', 'lessaenterprises@gmail.com',
    'app_metadata', jsonb_build_object(
      'role_v2', 'CUSTOMER',           -- forged: Alex is ORG_ADMIN in DB
      'org_id',  '00000000-0000-0000-0000-000000000001'
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  v_result := public.user_has_permission(
    '4109f9a3-9c51-4096-91de-09223cbd9203'::uuid,
    'invoices:view'
  );

  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6c Case B): forged role_v2=CUSTOMER returned % for invoices:view, expected false (the claim value). JWT fast path not being consulted — either branch order regressed or function is always hitting DB.',
      v_result;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6c Case B): JWT fast path honored (claim role_v2 overrides DB role_v2)';
END $$;

-- ---------------------------------------------------------------------------
-- CASE C: Pre-022 JWT missing role_v2 claim. Must fall back to DB
-- and return Alex's real answer (ORG_ADMIN → invoices:view → true).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result boolean;
  v_claims text;
BEGIN
  v_claims := jsonb_build_object(
    'sub',   '4109f9a3-9c51-4096-91de-09223cbd9203',
    'role',  'authenticated',
    'email', 'lessaenterprises@gmail.com',
    'app_metadata', jsonb_build_object(
      'org_id', '00000000-0000-0000-0000-000000000001'
      -- role_v2 deliberately absent — simulates pre-022 token still
      -- alive in its 1h TTL window
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  v_result := public.user_has_permission(
    '4109f9a3-9c51-4096-91de-09223cbd9203'::uuid,
    'invoices:view'
  );

  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6c Case C): pre-022 JWT (no role_v2 claim) returned % for ORG_ADMIN + invoices:view, expected true (DB fallback). Legacy tokens would break during the 1h rollout window.',
      v_result;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6c Case C): missing-claim JWT triggers DB fallback cleanly';
END $$;

-- ---------------------------------------------------------------------------
-- CASE D: Cross-user lookup. Alex (ORG_ADMIN) is the caller; ask for
-- Ana's permission. Function must ignore Alex's JWT and read Ana's
-- role_v2 from DB. Ana is CUSTOMER; CUSTOMER lacks invoices:view as
-- a role default; BUT we seeded a user_permissions grant in setup,
-- so Ana should actually return true here via the override path.
--
-- Wait — that's Case E's scenario. For Case D we want to isolate
-- the "cross-user → DB fallback" behavior, so use a permission that
-- CUSTOMER definitely lacks and Ana has NO override for. Use
-- 'packages:delete' (hard-constrained, not role-default for CUSTOMER,
-- no override seeded for Ana) → must return false.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result boolean;
  v_claims text;
BEGIN
  -- Alex's JWT (ORG_ADMIN) — would wrongly report ORG_ADMIN if the
  -- caller's claim leaked into the target-user evaluation.
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

  -- Check Ana's packages:delete — CUSTOMER, no override, hard-
  -- constrained: the only correct answer is false.
  v_result := public.user_has_permission(
    'a0000000-0000-0000-0000-000000000007'::uuid,
    'packages:delete'
  );

  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6c Case D): cross-user lookup returned % for Ana + packages:delete, expected false (CUSTOMER has no such role default and no override). 029 is reading caller''s JWT for p_user_id != auth.uid() — privilege-escalation vector.',
      v_result;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6c Case D): cross-user lookup bypasses JWT and reads target from DB';
END $$;

-- ---------------------------------------------------------------------------
-- CASE E: user_permissions override still wins. Ana (CUSTOMER) was
-- seeded with an explicit grant for invoices:view. With a full JWT
-- carrying role_v2=CUSTOMER, the override branch must return true
-- even though CUSTOMER has no invoices:view role default.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result boolean;
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

  v_result := public.user_has_permission(
    'a0000000-0000-0000-0000-000000000007'::uuid,
    'invoices:view'
  );

  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6c Case E): CUSTOMER with explicit grant for invoices:view returned %, expected true. 029 broke the user_permissions override path.',
      v_result;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6c Case E): user_permissions override wins over role default';
END $$;

-- ---------------------------------------------------------------------------
-- CASE F: Hard-constraint guard still fires when v_role came from
-- the JWT. AGENT_STAFF was seeded with an explicit grant for
-- packages:delete (hard-constrained). Even though user_permissions
-- says granted=true, the function must return false because
-- v_role != 'ORG_ADMIN' and the permission is hard-constrained.
-- This specifically proves 029 didn't skip the hard guard on the
-- JWT path.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result boolean;
  v_claims text;
BEGIN
  v_claims := jsonb_build_object(
    'sub',   '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9',
    'role',  'authenticated',
    'email', 'platinumcorp1@gmail.com',
    'app_metadata', jsonb_build_object(
      'role_v2',  'AGENT_STAFF',
      'org_id',   '00000000-0000-0000-0000-000000000001',
      'agent_id', '00000000-0000-0000-0000-000000000000'
    )
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  v_result := public.user_has_permission(
    '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'::uuid,
    'packages:delete'
  );

  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'TEST FAIL (F-6c Case F): AGENT_STAFF with granted hard-constrained packages:delete returned %, expected false. Hard-constraint guard was bypassed on the JWT fast path — privilege escalation possible by admins granting hard perms to non-admins.',
      v_result;
  END IF;
  RAISE NOTICE 'TEST PASS (F-6c Case F): hard-constraint guard blocks non-ORG_ADMIN grant on JWT path';
END $$;

ROLLBACK;
