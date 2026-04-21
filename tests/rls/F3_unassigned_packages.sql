-- tests/rls/F3_unassigned_packages.sql
-- Locks in fix for F-3 (HIGH) — migration 017_packages_unassigned_role_gate.sql.
--
-- Exploit (pre-017): packages_select_v2 had a carve-out
--   OR (agent_id IS NULL AND org_id = auth_org_id())
-- so any in-org user — including a CUSTOMER who happens to share the org —
-- could see every unassigned package in the tenant. Combined with F-7
-- (legacy users with role_v2=NULL) the leak was even broader pre-021.
--
-- Fix: 017 removed the carve-out entirely. The product decision (memory
-- §6 Q2) is "no package should ever have NULL agent_id" — but defense in
-- depth: even if one slips in, no non-admin should see it.
--
-- This test: stage one package as unassigned (in-tx), impersonate Maria
-- (now CUSTOMER post-021), confirm 0 rows. Pre-017 this returned 1.

BEGIN;

-- Stage: pick a real package in the prod org and null its agent_id.
-- Service-role tx scope, so we don't need elevated permissions yet.
DO $$
DECLARE
  v_pkg_id uuid;
BEGIN
  SELECT id
    INTO v_pkg_id
    FROM public.packages
   WHERE org_id = '00000000-0000-0000-0000-000000000001'
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_pkg_id IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-3): no live package in prod org to mark unassigned';
  END IF;

  UPDATE public.packages
     SET agent_id = NULL
   WHERE id = v_pkg_id;

  -- Stash in a temp table so the impersonated block below can read it back
  -- (DO blocks share no state with the outer tx beyond what's persisted).
  CREATE TEMP TABLE _f3_target ON COMMIT DROP AS SELECT v_pkg_id AS id;
END $$;

-- Temp tables are created owned by the current role (service_role here);
-- the impersonated session needs explicit SELECT to read them.
GRANT SELECT ON _f3_target TO authenticated;

-- Now impersonate Maria Santos (post-021 = CUSTOMER, ENV-00001).
-- She belongs to the same org but has no business with this specific package.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated","email":"maria.santos@example.com"}',
  true
);

DO $$
DECLARE
  v_visible integer;
  v_target  uuid;
BEGIN
  SELECT id INTO v_target FROM _f3_target;

  SELECT COUNT(*)
    INTO v_visible
    FROM public.packages
   WHERE id = v_target;

  IF v_visible <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-3 REGRESSION): CUSTOMER saw an unassigned package (got % rows, expected 0). The unassigned-package carve-out is back. Check migration 017.',
      v_visible;
  END IF;

  RAISE NOTICE 'TEST PASS (F-3): CUSTOMER blocked from seeing unassigned packages';
END $$;

ROLLBACK;
