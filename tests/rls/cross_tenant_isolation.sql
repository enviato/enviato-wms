-- tests/rls/cross_tenant_isolation.sql
-- Always-on baseline: cross-tenant isolation must hold on packages and on
-- user-row writes. Locks in audit Tests 6, 7, 8.
--
-- Two checks:
--   1. Org A's admin cannot see a package created in Org B (Test 6).
--   2. AGENT_STAFF cannot UPDATE another user's row in the same org (Test 8).
--      This proves the org-gate isn't doing all the work — the per-row
--      filter `id = auth.uid()` on user writes still has to fire.
--
-- We DELIBERATELY don't test the Test 7 INSERT-forgery shape (legacy
-- customer trying to INSERT into another org's packages) because that's
-- now redundant with F-12 — packages INSERT requires `packages:create`
-- permission which CUSTOMERs don't have.

BEGIN;

-- Stage: spin up a second org + a package in it. Service-role tx scope, so
-- this is fine. ROLLBACK at the end nukes both.
DO $$
DECLARE
  v_other_org uuid := gen_random_uuid();
  v_other_pkg uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizations (id, name, slug, address, settings, plan_tier)
  VALUES (
    v_other_org,
    'TEST OTHER ORG (cross-tenant isolation test)',
    'test-other-org-' || substr(v_other_org::text, 1, 8),
    '{"street": "", "city": "Nowhere", "state": "XX", "zip": "", "country": "US"}',
    '{}'::jsonb,
    'free'
  );

  INSERT INTO public.packages (id, org_id, tracking_number, status)
  VALUES (
    v_other_pkg,
    v_other_org,
    'CROSS-TENANT-TEST-' || substr(v_other_pkg::text, 1, 8),
    'received'
  );

  CREATE TEMP TABLE _cti_target ON COMMIT DROP AS
  SELECT v_other_org AS org_id, v_other_pkg AS pkg_id;
END $$;

GRANT SELECT ON _cti_target TO authenticated;

-- ---------------------------------------------------------------------------
-- CHECK 1: Org A admin cannot see Org B's package.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"4109f9a3-9c51-4096-91de-09223cbd9203","role":"authenticated","email":"lessaenterprises@gmail.com"}',
  true
);

DO $$
DECLARE
  v_visible integer;
  v_pkg_id  uuid;
BEGIN
  SELECT pkg_id INTO v_pkg_id FROM _cti_target;

  SELECT COUNT(*)
    INTO v_visible
    FROM public.packages
   WHERE id = v_pkg_id;

  IF v_visible <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (cross-tenant): ORG_ADMIN saw a package from a different org (% rows). Org-gate broken on packages_select_v2.',
      v_visible;
  END IF;

  RAISE NOTICE 'TEST PASS (cross-tenant packages): org A admin saw 0 rows for org B''s package';
END $$;

-- ---------------------------------------------------------------------------
-- CHECK 2: AGENT_STAFF cannot UPDATE another user's row.
-- This is the per-row filter on users_update_v2 (id = auth.uid()).
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9","role":"authenticated","email":"platinumcorp1@gmail.com"}',
  true
);

DO $$
DECLARE
  v_target uuid;
  v_rows   integer;
BEGIN
  -- Pick any user in the same org that ISN'T platinumcorp1.
  SELECT id INTO v_target
    FROM public.users
   WHERE org_id = '00000000-0000-0000-0000-000000000001'
     AND id <> auth.uid()
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (cross-tenant CHECK 2): no other user in org to attempt UPDATE on.';
  END IF;

  UPDATE public.users
     SET first_name = 'CrossTenantHack'
   WHERE id = v_target;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (cross-tenant users): AGENT_STAFF updated another user''s row (% rows). users_update_v2 per-row filter is broken.',
      v_rows;
  END IF;

  RAISE NOTICE 'TEST PASS (cross-tenant users): AGENT_STAFF UPDATE on other user → 0 rows';
END $$;

ROLLBACK;
