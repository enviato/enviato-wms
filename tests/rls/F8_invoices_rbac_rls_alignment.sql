-- tests/rls/F8_invoices_rbac_rls_alignment.sql
-- Locks in migration 026 (F-8 LOW — invoices_select_v2 gated by
-- user_has_permission('invoices:view')).
--
-- Pre-026, AGENT_STAFF could SELECT any invoice whose billed_by_agent_id
-- or billed_to_agent_id was inside their accessible-agent tree, despite
-- having no `invoices:view` permission. 026 wraps the two agent-tree OR
-- branches in `user_has_permission((SELECT auth.uid()), 'invoices:view')`
-- so visibility requires the permission (either by role default for
-- AGENT_ADMIN/ORG_ADMIN, or by explicit `user_permissions` override).
--
-- Cases:
--   (A) AGENT_STAFF, no grant: must see 0 accessible-tree invoices.
--       This is the bug fix — previously they saw their agent's invoices
--       for free.
--   (B) AGENT_STAFF, with `user_permissions` grant (the product-sanctioned
--       path): must see every invoice in their accessible tree, matching
--       the pre-026 count.
--   (C) ORG_ADMIN unchanged: every invoice in the org (bypass branch).
--   (D) CUSTOMER Ana unchanged: her own live invoices only (024 branch).
--
-- Regression signal:
--   - If Case A returns > 0, the gate was removed or the agent-tree
--     branches are no longer behind user_has_permission.
--   - If Case B returns 0, the override path broke (user_permissions is
--     not being honored by user_has_permission, or the gate is too
--     restrictive, e.g. accidentally gated on role instead of permission).
--   - If Case C or D diverge, a bystander branch got caught in the
--     rewrite.

BEGIN;

-- ---------------------------------------------------------------------------
-- Stage ground-truth counts as service_role before any impersonation.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org_total       integer;
  v_staff_tree      integer;
  v_ana_live        integer;
BEGIN
  SELECT count(*) INTO v_org_total
    FROM public.invoices
   WHERE org_id = '00000000-0000-0000-0000-000000000001';

  SELECT count(*) INTO v_staff_tree
    FROM public.invoices i
   WHERE i.org_id = '00000000-0000-0000-0000-000000000001'
     AND (
       i.billed_by_agent_id IN (
         SELECT public.get_accessible_agent_ids(
           '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'::uuid
         )
       )
       OR i.billed_to_agent_id IN (
         SELECT public.get_accessible_agent_ids(
           '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'::uuid
         )
       )
     );

  SELECT count(*) INTO v_ana_live
    FROM public.invoices
   WHERE customer_id = 'a0000000-0000-0000-0000-000000000007'
     AND deleted_at IS NULL;

  IF v_org_total < 1 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-8): no invoices in prod org. Seed regressed.';
  END IF;
  IF v_staff_tree < 1 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-8): AGENT_STAFF fixture has no accessible-tree invoices. Either the fixture user was rotated or seed regressed.';
  END IF;
  IF v_ana_live < 1 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-8): Ana has no live invoices. Seed regressed.';
  END IF;

  CREATE TEMP TABLE _f8_expected ON COMMIT DROP AS
    SELECT v_org_total  AS org_total,
           v_staff_tree AS staff_tree,
           v_ana_live   AS ana_live;
END $$;

GRANT SELECT ON _f8_expected TO authenticated;

-- ---------------------------------------------------------------------------
-- Defensive: fixture must NOT already have a user_permissions grant for
-- invoices:view. If they do, CASE A (default behavior) is not genuine.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_existing integer;
BEGIN
  SELECT count(*) INTO v_existing
    FROM public.user_permissions
   WHERE user_id = '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9'
     AND permission_key = 'invoices:view';

  IF v_existing > 0 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-8): AGENT_STAFF fixture already has a user_permissions row for invoices:view. Default-behavior case is not genuine. Pick a different fixture or clean up the row before running.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- CASE A: AGENT_STAFF platinumcorp1, NO grant — must see 0 invoices.
-- This is the post-026 invariant: without `invoices:view`, the agent-tree
-- OR branches short-circuit; ORG_ADMIN bypass doesn't apply; WAREHOUSE
-- carve-out doesn't apply; CUSTOMER branch doesn't apply.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9","role":"authenticated","email":"platinumcorp1@gmail.com"}',
  true
);

DO $$
DECLARE
  v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible FROM public.invoices;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-8 Case A): AGENT_STAFF default saw % invoices, expected 0. The user_has_permission gate on invoices_select_v2 is missing or the agent-tree branches are no longer behind it.',
      v_visible;
  END IF;
  RAISE NOTICE 'TEST PASS (F-8 Case A): AGENT_STAFF default sees 0 invoices';
END $$;

-- ---------------------------------------------------------------------------
-- CASE B: Grant invoices:view via user_permissions, re-impersonate.
-- AGENT_STAFF should now see their entire accessible-tree invoice count.
-- Switch back to service_role to stage the grant; RLS does not gate
-- writes to user_permissions as service_role.
-- ---------------------------------------------------------------------------
RESET ROLE;

INSERT INTO public.user_permissions (
  user_id, permission_key, granted, reason, created_by
) VALUES (
  '2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9',
  'invoices:view',
  true,
  'F-8 regression test — granting billing assistance',
  '4109f9a3-9c51-4096-91de-09223cbd9203'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9","role":"authenticated","email":"platinumcorp1@gmail.com"}',
  true
);

DO $$
DECLARE
  v_visible  integer;
  v_expected integer;
BEGIN
  SELECT staff_tree INTO v_expected FROM _f8_expected;
  SELECT count(*) INTO v_visible FROM public.invoices;
  IF v_visible <> v_expected THEN
    RAISE EXCEPTION
      'TEST FAIL (F-8 Case B): AGENT_STAFF with invoices:view grant saw % invoices, expected % (their accessible-tree count). The override path is broken — either user_has_permission stopped honoring user_permissions, or the gate rejected the grant.',
      v_visible, v_expected;
  END IF;
  RAISE NOTICE 'TEST PASS (F-8 Case B): AGENT_STAFF with grant sees % invoice(s)', v_visible;
END $$;

-- ---------------------------------------------------------------------------
-- CASE C: ORG_ADMIN Alex unchanged — sees every invoice in the org
-- (bypass branch, not the permission-gated branch).
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"4109f9a3-9c51-4096-91de-09223cbd9203","role":"authenticated","email":"lessaenterprises@gmail.com"}',
  true
);

DO $$
DECLARE
  v_visible  integer;
  v_expected integer;
BEGIN
  SELECT org_total INTO v_expected FROM _f8_expected;
  SELECT count(*) INTO v_visible FROM public.invoices;
  IF v_visible <> v_expected THEN
    RAISE EXCEPTION
      'TEST FAIL (F-8 Case C): ORG_ADMIN saw % invoices, expected % (org total). The ORG_ADMIN bypass branch regressed in 026.',
      v_visible, v_expected;
  END IF;
  RAISE NOTICE 'TEST PASS (F-8 Case C): ORG_ADMIN sees all % invoice(s)', v_visible;
END $$;

-- ---------------------------------------------------------------------------
-- CASE D: CUSTOMER Ana unchanged — sees her own live invoices only
-- (CUSTOMER branch, untouched by 026).
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated","email":"ana.martinez@example.com"}',
  true
);

DO $$
DECLARE
  v_visible  integer;
  v_expected integer;
BEGIN
  SELECT ana_live INTO v_expected FROM _f8_expected;
  SELECT count(*) INTO v_visible FROM public.invoices;
  IF v_visible <> v_expected THEN
    RAISE EXCEPTION
      'TEST FAIL (F-8 Case D): CUSTOMER Ana saw % invoices, expected % (live invoices). The CUSTOMER branch was caught in the 026 rewrite.',
      v_visible, v_expected;
  END IF;
  RAISE NOTICE 'TEST PASS (F-8 Case D): CUSTOMER Ana sees % live invoice(s)', v_visible;
END $$;

ROLLBACK;
