-- tests/rls/F10_global_reference_tables.sql
-- Locks in the intended shape of F-10 (LOW) — audit called this "probably
-- intentional" and left it without a migration. This test records the
-- intent so future RLS changes can't quietly flip it.
--
-- Design (per audit 2026-04-19):
--   - `permission_keys` is the global permission catalog (32 rows).
--   - `role_permission_defaults` is the global role->permission default map
--     (65 rows) that user_has_permission() reads.
--   Both live in `public` with NO `org_id` column — they are shared schema,
--   not tenant data. The app UI and auth layer need every signed-in user to
--   see them, so the policies are `FOR SELECT TO public USING (true)`.
--   Neither table has INSERT / UPDATE / DELETE policies — RLS default-deny
--   blocks writes from every non-service_role caller. Only service_role
--   (migrations, the auth hook) can mutate them.
--
-- Positive checks (intentional global readability):
--   1. CUSTOMER Ana can SELECT from permission_keys and see all 32 rows.
--   2. CUSTOMER Ana can SELECT from role_permission_defaults and see all 65.
--
-- Negative checks (writes must stay blocked for every authenticated role):
--   3. CUSTOMER INSERT into permission_keys      -> 42501
--   4. CUSTOMER INSERT into role_permission_defaults -> 42501
--   5. CUSTOMER UPDATE on permission_keys        -> 0 rows (silently filtered)
--   6. CUSTOMER DELETE on permission_keys        -> 0 rows
--   7. ORG_ADMIN INSERT into permission_keys     -> 42501
--      (critical: tenant admins are NOT platform admins. The permission
--       catalog is shared across every tenant and must be service_role-only.)
--   8. ORG_ADMIN UPDATE permission_keys          -> 0 rows
--   9. ORG_ADMIN DELETE permission_keys          -> 0 rows
--
-- Regression signal: if any write succeeds, or if SELECT returns 0, the
-- policy has been weakened or tightened past the documented intent.
-- Investigate before merging.

BEGIN;

-- ---------------------------------------------------------------------------
-- Stage: capture the ground-truth row counts so the SELECT asserts
-- survive future seed/catalog changes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_keys_count integer;
  v_defaults_count integer;
BEGIN
  SELECT count(*) INTO v_keys_count     FROM public.permission_keys;
  SELECT count(*) INTO v_defaults_count FROM public.role_permission_defaults;

  IF v_keys_count = 0 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-10): permission_keys is empty as service_role. Baseline reference data missing — regenerate supabase/_ci_baseline.sql.';
  END IF;
  IF v_defaults_count = 0 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-10): role_permission_defaults is empty as service_role. Baseline reference data missing — regenerate supabase/_ci_baseline.sql.';
  END IF;

  CREATE TEMP TABLE _f10_expected ON COMMIT DROP AS
    SELECT v_keys_count AS keys_count, v_defaults_count AS defaults_count;
END $$;

GRANT SELECT ON _f10_expected TO authenticated;

-- ---------------------------------------------------------------------------
-- CASE A: CUSTOMER SELECT — global readability.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated","email":"ana.martinez@example.com"}',
  true
);

DO $$
DECLARE
  v_keys_visible     integer;
  v_defaults_visible integer;
  v_keys_expected    integer;
  v_defaults_expected integer;
BEGIN
  SELECT keys_count, defaults_count
    INTO v_keys_expected, v_defaults_expected
    FROM _f10_expected;

  SELECT count(*) INTO v_keys_visible     FROM public.permission_keys;
  SELECT count(*) INTO v_defaults_visible FROM public.role_permission_defaults;

  IF v_keys_visible <> v_keys_expected THEN
    RAISE EXCEPTION
      'TEST FAIL (F-10 SELECT permission_keys): CUSTOMER saw % rows, expected % (the global count). perm_keys_select policy has been tightened — the auth UI needs universal read on this catalog.',
      v_keys_visible, v_keys_expected;
  END IF;
  RAISE NOTICE 'TEST PASS (F-10 SELECT permission_keys): CUSTOMER sees all % rows', v_keys_visible;

  IF v_defaults_visible <> v_defaults_expected THEN
    RAISE EXCEPTION
      'TEST FAIL (F-10 SELECT role_permission_defaults): CUSTOMER saw % rows, expected % (the global count). rpd_select policy has been tightened — user_has_permission() evaluations will misbehave.',
      v_defaults_visible, v_defaults_expected;
  END IF;
  RAISE NOTICE 'TEST PASS (F-10 SELECT role_permission_defaults): CUSTOMER sees all % rows', v_defaults_visible;
END $$;

-- ---------------------------------------------------------------------------
-- CASE B: CUSTOMER writes — INSERT must be denied with 42501; UPDATE/DELETE
-- must filter to 0 rows.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    INSERT INTO public.permission_keys (id, category, description, is_hard_constraint)
    VALUES ('pwned:f10-customer-exploit', 'pwned', 'f10 test', false);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION
      'TEST FAIL (F-10 CUSTOMER INSERT permission_keys): insert succeeded (% rows). Default-deny on this table has been weakened — an INSERT policy was added.',
      v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-10 CUSTOMER INSERT permission_keys blocked by SQLSTATE 42501)';
  END;

  BEGIN
    INSERT INTO public.role_permission_defaults (id, role, permission_key)
    VALUES (gen_random_uuid(), 'CUSTOMER', 'agents:delete');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION
      'TEST FAIL (F-10 CUSTOMER INSERT role_permission_defaults): insert succeeded (% rows). A CUSTOMER just granted themselves a permission default — this is the exploit we are guarding against.',
      v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-10 CUSTOMER INSERT role_permission_defaults blocked by SQLSTATE 42501)';
  END;

  UPDATE public.permission_keys SET description = 'pwned' WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-10 CUSTOMER UPDATE permission_keys): % rows updated, expected 0. An UPDATE policy has been added.',
      v_rows;
  END IF;
  RAISE NOTICE 'TEST PASS (F-10 CUSTOMER UPDATE permission_keys): 0 rows (silently filtered)';

  DELETE FROM public.permission_keys WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-10 CUSTOMER DELETE permission_keys): % rows deleted, expected 0. A DELETE policy has been added.',
      v_rows;
  END IF;
  RAISE NOTICE 'TEST PASS (F-10 CUSTOMER DELETE permission_keys): 0 rows';
END $$;

-- ---------------------------------------------------------------------------
-- CASE C: ORG_ADMIN writes — tenant admin is NOT platform admin. The
-- permission catalog is global; mutating it from an in-tenant session would
-- affect every tenant. This must stay blocked.
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"4109f9a3-9c51-4096-91de-09223cbd9203","role":"authenticated","email":"lessaenterprises@gmail.com"}',
  true
);

DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    INSERT INTO public.permission_keys (id, category, description, is_hard_constraint)
    VALUES ('pwned:f10-orgadmin-exploit', 'pwned', 'f10 test', false);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION
      'TEST FAIL (F-10 ORG_ADMIN INSERT permission_keys): insert succeeded (% rows). A tenant admin just mutated the shared permission catalog — this is a cross-tenant impact.',
      v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-10 ORG_ADMIN INSERT permission_keys blocked by SQLSTATE 42501)';
  END;

  UPDATE public.permission_keys SET description = 'pwned-by-admin' WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-10 ORG_ADMIN UPDATE permission_keys): % rows updated, expected 0. Tenant admins must not mutate shared schema.',
      v_rows;
  END IF;
  RAISE NOTICE 'TEST PASS (F-10 ORG_ADMIN UPDATE permission_keys): 0 rows';

  DELETE FROM public.permission_keys WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-10 ORG_ADMIN DELETE permission_keys): % rows deleted, expected 0.',
      v_rows;
  END IF;
  RAISE NOTICE 'TEST PASS (F-10 ORG_ADMIN DELETE permission_keys): 0 rows';
END $$;

ROLLBACK;
