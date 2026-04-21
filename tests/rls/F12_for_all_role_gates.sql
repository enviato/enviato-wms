-- tests/rls/F12_for_all_role_gates.sql
-- Locks in fix for F-12 (HIGH) — migration 018_for_all_gate_split.sql.
--
-- Bug (pre-018): five tables (org_settings, tags, label_templates,
-- warehouse_locations, package_tags) had a `FOR ALL` policy gating only on
-- org_id. Any in-org user — including a CUSTOMER and any legacy role_v2=NULL
-- user — could INSERT / UPDATE / DELETE rows. Live exploit confirmed in
-- audit Tests 12 and 13 (Maria Santos inserted a 'pwned_by_customer' row
-- into org_settings).
--
-- Fix: 018 split the FOR ALL policy into:
--   - *_select  → org-scoped, all in-org users (read).
--   - *_write   → org-scoped + role gate.
-- Role gates by table:
--   org_settings, warehouse_locations              → ORG_ADMIN only.
--   tags, label_templates, package_tags            → ORG_ADMIN + WAREHOUSE_STAFF.
--
-- This test: impersonate a CUSTOMER and confirm INSERT into each table fails
-- with SQLSTATE 42501. Five separate sub-tests, one per table.

BEGIN;

-- Stage real package_id + tag_id as service_role so the impersonated block has
-- concrete data to INSERT. Without this, an INSERT ... SELECT that returns 0
-- rows silently inserts 0 rows and looks like a pass.
DO $$
DECLARE v_pkg uuid; v_tag uuid;
BEGIN
  SELECT id INTO v_pkg FROM public.packages
   WHERE org_id = '00000000-0000-0000-0000-000000000001' LIMIT 1;
  SELECT id INTO v_tag FROM public.tags
   WHERE org_id = '00000000-0000-0000-0000-000000000001' LIMIT 1;

  IF v_pkg IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-12): no package in org for package_tags test';
  END IF;
  IF v_tag IS NULL THEN
    -- Create one so the test can run. ROLLBACK cleans it up.
    INSERT INTO public.tags (org_id, name, color)
    VALUES ('00000000-0000-0000-0000-000000000001', 'f12-test-tag', '#000000')
    RETURNING id INTO v_tag;
  END IF;

  CREATE TEMP TABLE _f12_target ON COMMIT DROP AS
  SELECT v_pkg AS package_id, v_tag AS tag_id;
END $$;

GRANT SELECT ON _f12_target TO authenticated;

-- Impersonate Maria Santos (CUSTOMER, post-021).
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated","email":"maria.santos@example.com"}',
  true
);

DO $$
DECLARE
  v_org uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- org_settings
  BEGIN
    INSERT INTO public.org_settings (org_id, key, value)
    VALUES (v_org, 'pwned_by_customer_test', '{"ok":true}'::jsonb);
    RAISE EXCEPTION 'TEST FAIL (F-12 org_settings): CUSTOMER INSERT succeeded. 018 *_write role gate is missing or wrong.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-12 org_settings): CUSTOMER INSERT blocked (42501)';
  END;

  -- tags (NOT NULL: org_id, name, color)
  BEGIN
    INSERT INTO public.tags (org_id, name, color)
    VALUES (v_org, 'pwned-tag-customer-test', '#ff0000');
    RAISE EXCEPTION 'TEST FAIL (F-12 tags): CUSTOMER INSERT succeeded. 018 *_write role gate is missing or wrong.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-12 tags): CUSTOMER INSERT blocked (42501)';
  END;

  -- label_templates (NOT NULL: org_id, name, fields)
  BEGIN
    INSERT INTO public.label_templates (org_id, name, fields)
    VALUES (v_org, 'pwned-label-customer-test', '{}'::jsonb);
    RAISE EXCEPTION 'TEST FAIL (F-12 label_templates): CUSTOMER INSERT succeeded. 018 *_write role gate is missing or wrong.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-12 label_templates): CUSTOMER INSERT blocked (42501)';
  END;

  -- warehouse_locations (NOT NULL: org_id, name, code)
  BEGIN
    INSERT INTO public.warehouse_locations (org_id, name, code)
    VALUES (v_org, 'pwned-loc-customer-test', 'PWND-CUST');
    RAISE EXCEPTION 'TEST FAIL (F-12 warehouse_locations): CUSTOMER INSERT succeeded. 018 *_write role gate is missing or wrong.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-12 warehouse_locations): CUSTOMER INSERT blocked (42501)';
  END;

  -- package_tags (junction table). IMPORTANT: we INSERT from the service-role
  -- staged _f12_target temp table — NOT from a SELECT against public.packages /
  -- public.tags. As CUSTOMER those base tables would return 0 rows under RLS,
  -- and INSERT...SELECT of 0 rows silently inserts 0 and LOOKS like a policy
  -- block when it isn't. Using concrete staged IDs forces the write path to
  -- actually attempt a real row, so the role gate has to fire.
  BEGIN
    INSERT INTO public.package_tags (package_id, tag_id)
    SELECT package_id, tag_id FROM _f12_target;
    RAISE EXCEPTION 'TEST FAIL (F-12 package_tags): CUSTOMER INSERT succeeded. 018 *_write role gate is missing or wrong on package_tags.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-12 package_tags): CUSTOMER INSERT blocked (42501)';
    WHEN undefined_table THEN
      -- If the junction table isn't present in this env, skip rather than fail.
      RAISE NOTICE 'TEST SKIP (F-12 package_tags): table missing in this env';
  END;

  RAISE NOTICE 'TEST PASS (F-12): all CUSTOMER writes to FOR ALL-derived tables denied';
END $$;

ROLLBACK;
