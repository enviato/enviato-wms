-- tests/rls/F4_customer_read_surface.sql
-- Locks in fix for F-4 (HIGH) + HP5 hotfix — migration 019_customer_read_surface.sql.
--
-- Gap (pre-019): packages_select_v2 / invoices_select_v2 / awbs_select_v2 had no
-- CUSTOMER branch. A legitimate customer who signed in saw 0 packages despite
-- having packages marked with their customer_id — the product surface was
-- unreachable via RLS as designed.
--
-- Fix: 019 added
--   OR (auth_role_v2() = 'CUSTOMER' AND customer_id = auth.uid())
-- to each SELECT policy. AWBs cascade via EXISTS through packages (no
-- customer_id column on awbs). invoice_lines + package_photos cascade via
-- their existing EXISTS subqueries.
--
-- Cross-check (HP5 verification, memory 2026-04-20): Ana Martinez (ENV-00003,
-- a0000000-...-000000000007) must see exactly 2 packages / 2 invoices / 1 AWB
-- / 4 invoice_lines / 1 photo, and zero cross-tenant rows.
--
-- This test compares the RLS-filtered count (as Ana) against ground truth
-- computed via service-role, so it stays correct if seed data grows.

BEGIN;

-- Compute ground truth for Ana before impersonation (service-role scope).
-- IMPORTANT: this ground-truth query MUST mirror what 019's RLS clauses do —
-- and 019 does NOT filter `deleted_at IS NULL`. That's F-11 (LOW), still
-- open. If F-11 ever gets fixed (a deleted_at filter added to the SELECT
-- policies), update this query to add the same filter so the test stays
-- aligned with the policy.
DO $$
DECLARE
  v_ana uuid := 'a0000000-0000-0000-0000-000000000007';
BEGIN
  CREATE TEMP TABLE _f4_truth ON COMMIT DROP AS
  SELECT
    (SELECT COUNT(*) FROM public.packages WHERE customer_id = v_ana) AS pkgs,
    (SELECT COUNT(*) FROM public.invoices WHERE customer_id = v_ana) AS invs,
    (SELECT COUNT(*) FROM public.awbs a
       WHERE EXISTS (SELECT 1 FROM public.packages p
                      WHERE p.awb_id = a.id AND p.customer_id = v_ana)) AS awbs,
    (SELECT COUNT(*) FROM public.invoice_lines il
       WHERE EXISTS (SELECT 1 FROM public.invoices i
                      WHERE i.id = il.invoice_id AND i.customer_id = v_ana)) AS lines,
    (SELECT COUNT(*) FROM public.package_photos ph
       WHERE EXISTS (SELECT 1 FROM public.packages p
                      WHERE p.id = ph.package_id AND p.customer_id = v_ana)) AS photos;

  -- Sanity: ground truth must be non-zero for the test to be meaningful.
  PERFORM 1 FROM _f4_truth WHERE pkgs > 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-4): Ana Martinez has 0 packages in ground truth. Seed data regressed — re-run 004_seed_data.sql or pick a different CUSTOMER with packages.';
  END IF;
END $$;

-- Let the impersonated session read ground truth.
GRANT SELECT ON _f4_truth TO authenticated;

-- Impersonate Ana.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated","email":"ana.martinez@example.com"}',
  true
);

DO $$
DECLARE
  t_pkgs   bigint; t_invs   bigint; t_awbs  bigint; t_lines bigint; t_photos bigint;
  rls_pkgs bigint; rls_invs bigint; rls_awbs bigint; rls_lines bigint; rls_photos bigint;
  v_peek   bigint;
  v_leak   bigint;
BEGIN
  SELECT pkgs, invs, awbs, lines, photos
    INTO t_pkgs, t_invs, t_awbs, t_lines, t_photos
    FROM _f4_truth;

  SELECT COUNT(*) INTO rls_pkgs   FROM public.packages;
  SELECT COUNT(*) INTO rls_invs   FROM public.invoices;
  SELECT COUNT(*) INTO rls_awbs   FROM public.awbs;
  SELECT COUNT(*) INTO rls_lines  FROM public.invoice_lines;
  SELECT COUNT(*) INTO rls_photos FROM public.package_photos;

  -- Equality-check each surface against ground truth.
  IF rls_pkgs <> t_pkgs THEN
    RAISE EXCEPTION 'TEST FAIL (F-4 packages): RLS showed %, ground truth %. Check 019 packages branch.', rls_pkgs, t_pkgs;
  END IF;
  IF rls_invs <> t_invs THEN
    RAISE EXCEPTION 'TEST FAIL (F-4 invoices): RLS showed %, ground truth %. Check 019 invoices branch.', rls_invs, t_invs;
  END IF;
  IF rls_awbs <> t_awbs THEN
    RAISE EXCEPTION 'TEST FAIL (F-4 awbs): RLS showed %, ground truth %. Check 019 awbs EXISTS cascade.', rls_awbs, t_awbs;
  END IF;
  IF rls_lines <> t_lines THEN
    RAISE EXCEPTION 'TEST FAIL (F-4 invoice_lines): RLS showed %, ground truth %. Check invoice_lines SELECT cascade.', rls_lines, t_lines;
  END IF;
  IF rls_photos <> t_photos THEN
    RAISE EXCEPTION 'TEST FAIL (F-4 package_photos): RLS showed %, ground truth %. Check package_photos SELECT cascade.', rls_photos, t_photos;
  END IF;

  RAISE NOTICE 'TEST PASS (F-4 / HP5 surface match): pkgs=%, invs=%, awbs=%, lines=%, photos=%', rls_pkgs, rls_invs, rls_awbs, rls_lines, rls_photos;

  -- Cross-tenant peek: try to read a package belonging to a DIFFERENT customer
  -- via its exact ID. Expected 0 rows (RLS should filter regardless of ID).
  SELECT COUNT(*)
    INTO v_peek
    FROM public.packages
   WHERE customer_id <> auth.uid()
     AND customer_id IS NOT NULL;

  IF v_peek <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL (F-4 leak): Ana saw % packages belonging to another customer. Cross-customer isolation broken.', v_peek;
  END IF;

  -- And an invoice-level peek.
  SELECT COUNT(*)
    INTO v_leak
    FROM public.invoices
   WHERE customer_id <> auth.uid();

  IF v_leak <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL (F-4 leak): Ana saw % invoices belonging to another customer.', v_leak;
  END IF;

  RAISE NOTICE 'TEST PASS (F-4 cross-customer): zero leak on packages / invoices for Ana';
END $$;

ROLLBACK;
