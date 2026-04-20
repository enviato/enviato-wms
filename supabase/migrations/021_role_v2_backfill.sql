-- 021_role_v2_backfill.sql
-- Tier 6 Phase 10B — F-7 fix
--
-- Backfill role_v2 = 'CUSTOMER' for legacy users who predate the role_v2 column.
-- This is a PREREQUISITE for 019_customer_read_surface: the CUSTOMER read policies
-- in 019 use auth_role_v2() = 'CUSTOMER', so every recipient must have role_v2 set
-- before those policies can match rows.
--
-- Context (verified 2026-04-20 via spot-check SELECT):
--   * 10 seed users with role_v2 IS NULL (ENV-00001 through ENV-00010).
--   * All 10 have role='customer' (legacy column) → clear signal they're recipients.
--   * All 10 are is_active=true, deleted_at IS NULL.
--   * No stranded admins, no polluted test accounts in the NULL set.
--
-- The `customer_number IS NOT NULL` guard is defensive: if any future user ends up
-- with role_v2=NULL but no customer_number (shouldn't happen, but protection in depth),
-- this migration leaves them alone so an operator can handle manually.
--
-- Expected row count: 10. If fewer rows are updated in prod, it means some NULLs
-- have since been cleaned up by other means — that's fine, migration is idempotent.

UPDATE public.users
SET role_v2 = 'CUSTOMER'::public.user_role_v2,
    updated_at = now()
WHERE role_v2 IS NULL
  AND customer_number IS NOT NULL;
