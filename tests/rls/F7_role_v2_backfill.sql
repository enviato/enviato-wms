-- tests/rls/F7_role_v2_backfill.sql
-- Locks in fix for F-7 (MEDIUM) — migration 021_role_v2_backfill.sql +
-- create-recipient route fix (commit 5b497e5) + migration 023 NOT NULL.
--
-- Bug (pre-021): 10 of 14 prod users had role_v2 = NULL because they signed
-- up before the v2 role column existed. auth_role_v2() returned NULL for them,
-- which made every RLS branch comparing role_v2 evaluate to NULL → filtered
-- out. Combined with F-3 (unassigned-package carve-out) the attack surface
-- was large.
--
-- Fix is three-part:
--   1. 021_role_v2_backfill.sql — UPDATE sets role_v2='CUSTOMER' WHERE role_v2
--      IS NULL AND customer_number IS NOT NULL. 10 rows updated, idempotent.
--   2. src/app/api/admin/create-recipient/route.ts line 166 — every new
--      recipient insert now explicitly stamps role_v2='CUSTOMER'. Closes
--      the "we'll just re-create the NULL hole" regression vector via the
--      admin-UI path.
--   3. 023_users_role_v2_not_null.sql — ALTER TABLE ... SET NOT NULL on the
--      column itself, plus handle_new_user() trigger update to derive
--      role_v2 from metadata (or map from legacy role). Structurally
--      prevents regression; any new NULL insert now errors at the DB layer.
--
-- This test asserts FOUR invariants:
--   1. 0 active users with customer_number set but role_v2 NULL (data).
--   2. Every CUSTOMER user has a customer_number (secondary data check).
--   3. pg_attribute.attnotnull = true on users.role_v2 (catalog).
--   4. An attempted INSERT without role_v2 raises not_null_violation (live).

BEGIN;

DO $$
DECLARE
  v_offenders integer;
  v_detail    text;
BEGIN
  SELECT COUNT(*),
         string_agg(email, ', ' ORDER BY email)
    INTO v_offenders, v_detail
    FROM public.users
   WHERE role_v2 IS NULL
     AND customer_number IS NOT NULL
     AND deleted_at IS NULL;

  IF v_offenders <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-7 REGRESSION): % user(s) have customer_number set but role_v2 NULL. Offenders: %. Either the 021 backfill was reverted or the create-recipient route dropped the role_v2 stamp.',
      v_offenders, v_detail;
  END IF;

  RAISE NOTICE 'TEST PASS (F-7 invariant): 0 active users with customer_number + NULL role_v2';
END $$;

-- Stronger invariant: every CUSTOMER role_v2 user has a customer_number
-- (one-to-one mapping from customer-ness to the identifier). If this breaks,
-- the recipient-creation flow is out of sync with the trigger that stamps
-- customer_number.
DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT COUNT(*)
    INTO v_missing
    FROM public.users
   WHERE role_v2 = 'CUSTOMER'
     AND customer_number IS NULL
     AND deleted_at IS NULL;

  IF v_missing <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-7 secondary): % CUSTOMER user(s) have no customer_number. trg_generate_customer_number may be disabled or the recipient route bypassed it.',
      v_missing;
  END IF;

  RAISE NOTICE 'TEST PASS (F-7 secondary): every CUSTOMER has a customer_number';
END $$;

-- Third invariant (added with 023): the column itself is NOT NULL.
-- Without this check the test only verifies the *data*, not the constraint —
-- someone could drop the NOT NULL and the first two checks would still pass
-- until a NULL showed up in the wild. pg_attribute.attnotnull is the source
-- of truth; information_schema.columns wraps it.
DO $$
DECLARE
  v_is_not_null boolean;
BEGIN
  SELECT attnotnull
    INTO v_is_not_null
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'users'
     AND a.attname = 'role_v2'
     AND a.attnum > 0
     AND NOT a.attisdropped;

  IF v_is_not_null IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP ERROR (F-7 constraint): users.role_v2 column not found.';
  END IF;

  IF NOT v_is_not_null THEN
    RAISE EXCEPTION
      'TEST FAIL (F-7 constraint): users.role_v2 is NULLABLE. Migration 023 was reverted or never applied. Re-apply 023_users_role_v2_not_null.sql.';
  END IF;

  RAISE NOTICE 'TEST PASS (F-7 constraint): users.role_v2 is NOT NULL';
END $$;

-- Fourth invariant: an attempted INSERT with role_v2 IS NULL must fail with
-- not_null_violation. Belt-and-suspenders with the catalog check above — if
-- someone drops the constraint AND backfills the NULL, this still catches it.
-- Wrapped in its own sub-tx so the rollback below stays clean.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.users (id, org_id, email, role)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
            'f7-notnull-probe-' || gen_random_uuid()::text || '@example.com',
            'customer');
    RAISE EXCEPTION 'TEST FAIL (F-7 constraint live): INSERT without role_v2 succeeded. NOT NULL constraint is not enforced.';
  EXCEPTION
    WHEN not_null_violation THEN
      RAISE NOTICE 'TEST PASS (F-7 constraint live): INSERT without role_v2 raised not_null_violation';
  END;
END $$;

ROLLBACK;
