-- ============================================================
-- 012: Performance — composite partial indexes on list-page hot paths
-- ============================================================
-- The app's slowest queries are list-page sorts that combine
-- (org_id filter via RLS) + (a sort column DESC) + (deleted_at IS NULL).
-- A single-column index on org_id plus a separate index on the sort
-- column requires Postgres to either seq-scan + sort or do a bitmap
-- merge. At hundreds of thousands of rows this becomes the dominant
-- cost of a list page load.
--
-- This migration adds composite partial indexes whose key order
-- exactly matches the query shape, so Postgres can satisfy the
-- full WHERE + ORDER BY + LIMIT from the index alone.
--
-- Pattern used throughout:
--   (equality_col, ordering_col DESC) WHERE deleted_at IS NULL
-- The partial predicate keeps each index small — live rows only.
--
-- Table scale rationale (2026-04-19 row counts are tiny, but these
-- are the tables expected to grow to 100k+ rows per tenant):
--   packages   — largest at maturity (every in-stock item + history)
--   awbs       — shipment records, moderate growth
--   invoices   — bills + recurring charges, moderate growth
--   users      — customer accounts, per-tenant 10k+ at scale
--   activity_log — append-only audit log, grows fastest
-- ============================================================

-- ─────────────────────────────────────────────────────
-- packages — the hottest table in the app
-- ─────────────────────────────────────────────────────

-- List page: .is("deleted_at", null).order("checked_in_at", desc)
-- RLS injects org_id = auth_org_id(), so the effective shape is
-- WHERE org_id = $1 AND deleted_at IS NULL ORDER BY checked_in_at DESC.
CREATE INDEX IF NOT EXISTS idx_packages_org_checked_in_active
  ON public.packages (org_id, checked_in_at DESC)
  WHERE deleted_at IS NULL;

-- Status-filtered list (e.g. "packing" popup, "checked_in" tab)
-- Shape: WHERE org_id = $1 AND status = $2 AND deleted_at IS NULL
--        ORDER BY checked_in_at DESC
CREATE INDEX IF NOT EXISTS idx_packages_org_status_checked_in_active
  ON public.packages (org_id, status, checked_in_at DESC)
  WHERE deleted_at IS NULL;

-- Customer detail page: in-stock + shipped package lists
-- Shape: WHERE customer_id = $1 AND deleted_at IS NULL
--        [AND status = $2 | AND status IN (...)]
--        ORDER BY checked_in_at DESC
-- Without status in the key order this handles both the equality
-- and IN-list variants by scanning customer's rows in sort order.
CREATE INDEX IF NOT EXISTS idx_packages_customer_checked_in_active
  ON public.packages (customer_id, checked_in_at DESC)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────
-- awbs — shipment list + popups
-- ─────────────────────────────────────────────────────

-- List page: .is("deleted_at", null).order("created_at", desc)
CREATE INDEX IF NOT EXISTS idx_awbs_org_created_active
  ON public.awbs (org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Status-filtered AWB list (e.g. "packing" status used when
-- assigning packages to a shipment from the packages list page)
CREATE INDEX IF NOT EXISTS idx_awbs_org_status_created_active
  ON public.awbs (org_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────
-- invoices — billing list + customer detail
-- ─────────────────────────────────────────────────────

-- List page: .is("deleted_at", null).order("created_at", desc)
CREATE INDEX IF NOT EXISTS idx_invoices_org_created_active
  ON public.invoices (org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Customer detail + invoice lookups by customer
-- Shape: WHERE customer_id = $1 AND deleted_at IS NULL
--        ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_invoices_customer_created_active
  ON public.invoices (customer_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────
-- users — customer / agent / staff filters
-- ─────────────────────────────────────────────────────

-- Customer dropdown: .eq("role", "customer").is("deleted_at", null)
-- Legacy `role` column is still used on most list pages.
CREATE INDEX IF NOT EXISTS idx_users_org_role_active
  ON public.users (org_id, role)
  WHERE deleted_at IS NULL;

-- New role_v2 enum is used by RLS helpers and auth_role_v2()
CREATE INDEX IF NOT EXISTS idx_users_org_role_v2_active
  ON public.users (org_id, role_v2)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────
-- activity_log — append-only, grows fastest
-- ─────────────────────────────────────────────────────

-- Package detail page activity feed:
-- WHERE package_id = $1 ORDER BY created_at DESC
-- Replaces the need for Postgres to bitmap-merge two partial
-- indexes (idx_activity_package + idx_activity_created).
CREATE INDEX IF NOT EXISTS idx_activity_package_created
  ON public.activity_log (package_id, created_at DESC)
  WHERE package_id IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- Refresh planner stats so the new indexes get considered
-- immediately (not after the next autovacuum run).
-- ─────────────────────────────────────────────────────

ANALYZE public.packages;
ANALYZE public.awbs;
ANALYZE public.invoices;
ANALYZE public.users;
ANALYZE public.activity_log;
