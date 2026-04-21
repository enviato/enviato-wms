-- tests/rls/F5_invoice_lines_mutations.sql
-- Locks in fix for F-5 (MEDIUM) — migration 020_invoice_lines_mutation_policies.sql.
--
-- Bug (pre-020): invoice_lines had SELECT + INSERT but NO policy for UPDATE or
-- DELETE. Postgres default-deny meant the UI delete button at
-- src/app/(dashboard)/admin/invoices/[id]/page.tsx:419 silently returned 0
-- rows — the UI optimistically removed the line locally, then on refresh the
-- "deleted" line was back. Classic ghost-delete.
--
-- Fix: 020 added invoice_lines_update_v2 + invoice_lines_delete_v2. Both gate
-- on (a) org match via EXISTS through parent invoices, (b) user_has_permission
-- (uid, 'invoices:edit'). UPDATE has matching USING + WITH CHECK to block
-- re-parenting a line into another org's invoice.
--
-- Positive tests here: ORG_ADMIN DELETE / UPDATE → 1 row each.
-- Negative tests: CUSTOMER (no invoices:edit) → 0 rows.
--
-- We use rows staged via service-role within the tx so the real DB is never
-- touched (ROLLBACK at the end undoes everything).

BEGIN;

-- Stage: find an invoice_line we can act on, remember its id.
DO $$
DECLARE
  v_line_id uuid;
BEGIN
  SELECT il.id
    INTO v_line_id
    FROM public.invoice_lines il
    JOIN public.invoices i ON i.id = il.invoice_id
   WHERE i.org_id = '00000000-0000-0000-0000-000000000001'
   LIMIT 1;

  IF v_line_id IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-5): no invoice_lines in prod org. Seed data regressed.';
  END IF;

  CREATE TEMP TABLE _f5_target ON COMMIT DROP AS SELECT v_line_id AS id;
END $$;

GRANT SELECT ON _f5_target TO authenticated;

-- ---------------------------------------------------------------------------
-- CASE 1: ORG_ADMIN can UPDATE and DELETE (positive case).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"4109f9a3-9c51-4096-91de-09223cbd9203","role":"authenticated","email":"lessaenterprises@gmail.com"}',
  true
);

DO $$
DECLARE
  v_rows integer;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM _f5_target;

  UPDATE public.invoice_lines
     SET description = description
   WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-5 pos UPDATE): ORG_ADMIN UPDATE on invoice_line returned % rows, expected 1. invoice_lines_update_v2 policy may be missing or org gate too tight.',
      v_rows;
  END IF;

  RAISE NOTICE 'TEST PASS (F-5 pos UPDATE): ORG_ADMIN UPDATE → 1 row';
END $$;

-- Reset to service_role briefly so we can verify DELETE from the impersonated
-- context (we'll re-impersonate in the DELETE block). The line still exists
-- because the UPDATE above only set description=description — no-op content.

-- ---------------------------------------------------------------------------
-- CASE 2: CUSTOMER cannot UPDATE / DELETE (negative case).
-- ---------------------------------------------------------------------------
-- Swap to Ana (CUSTOMER, no invoices:edit permission).
-- Note: SET LOCAL ROLE + set_config persist for the rest of this tx; issuing
-- a fresh set_config with a new sub overwrites the previous impersonation.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated","email":"ana.martinez@example.com"}',
  true
);

DO $$
DECLARE
  v_rows integer;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM _f5_target;

  UPDATE public.invoice_lines
     SET description = 'pwned'
   WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-5 neg UPDATE): CUSTOMER UPDATE on invoice_line returned % rows, expected 0. invoices:edit permission check missing.',
      v_rows;
  END IF;

  RAISE NOTICE 'TEST PASS (F-5 neg UPDATE): CUSTOMER UPDATE → 0 rows (silently filtered, as intended)';

  DELETE FROM public.invoice_lines WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-5 neg DELETE): CUSTOMER DELETE on invoice_line returned % rows, expected 0.',
      v_rows;
  END IF;

  RAISE NOTICE 'TEST PASS (F-5 neg DELETE): CUSTOMER DELETE → 0 rows';
END $$;

-- ---------------------------------------------------------------------------
-- CASE 3: ORG_ADMIN DELETE succeeds (positive case, done last so we still had
-- a row to test CUSTOMER against).
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"4109f9a3-9c51-4096-91de-09223cbd9203","role":"authenticated","email":"lessaenterprises@gmail.com"}',
  true
);

DO $$
DECLARE
  v_rows integer;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM _f5_target;

  DELETE FROM public.invoice_lines WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-5 pos DELETE): ORG_ADMIN DELETE on invoice_line returned % rows, expected 1. invoice_lines_delete_v2 policy may be missing.',
      v_rows;
  END IF;

  RAISE NOTICE 'TEST PASS (F-5 pos DELETE): ORG_ADMIN DELETE → 1 row';
END $$;

ROLLBACK;
