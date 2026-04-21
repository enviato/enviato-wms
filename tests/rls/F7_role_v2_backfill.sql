-- tests/rls/F7_role_v2_backfill.sql
-- Locks in fix for F-7 (MEDIUM) — migration 021_role_v2_backfill.sql +
-- create-recipient route fix (commit 5b497e5).
--
-- Bug (pre-021): 10 of 14 prod users had role_v2 = NULL because they signed
-- up before the v2 role column existed. auth_role_v2() returned NULL for them,
-- which made every RLS branch comparing role_v2 evaluate to NULL → filtered
-- out. Combined with F-3 (unassigned-package carve-out) the attack surface
-- was large.
--
-- Fix is two-part:
--   1. 021_role_v2_backfill.sql — UPDATE sets role_v2='CUSTOMER' WHERE role_v2
--      IS NULL AND customer_number IS NOT NULL. 10 rows updated, idempotent.
--   2. src/app/api/admin/create-recipient/route.ts line 166 — every new
--      recipient insert now explicitly stamps role_v2='CUSTOMER'. Closes
--      the "we'll just re-create the NULL hole" regression vector.
--
-- This test: assert the invariant.
--
-- Invariant: no active user has a customer_number without a matching role_v2.
-- This is the stronger form of what 021 backfilled; it's the condition that
-- lets us later add a NOT NULL constraint.

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

ROLLBACK;
