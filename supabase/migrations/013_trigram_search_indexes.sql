-- ============================================================
-- 013: Performance — trigram (pg_trgm) GIN indexes for ilike search
-- ============================================================
-- At scale the app will need server-side `%term%` search on text
-- columns. A standard btree cannot accelerate `col ILIKE '%term%'`
-- because the leading wildcard prevents prefix matching. A GIN
-- index using the `gin_trgm_ops` operator class indexes every
-- 3-character subsequence, letting Postgres answer ILIKE patterns
-- by looking up trigrams from the search term.
--
-- pg_trgm extension is already installed (version 1.6, verified
-- 2026-04-19 via list_extensions).
--
-- Note on existing trigram index: `idx_users_name_trgm` indexes
-- the concatenated expression `(first_name || ' ' || last_name)`.
-- That index is NOT used by per-column `first_name ILIKE ...` or
-- `last_name ILIKE ...` predicates — which is exactly what the
-- customer search code in packages/[id]/page.tsx uses. So we
-- still need separate trigram indexes on each column below.
-- Not dropping idx_users_name_trgm here; cleanup is deferred to
-- a future tier.
--
-- Query shapes this accelerates:
--   users.first_name  ILIKE '%term%'   — customer search dropdown
--   users.last_name   ILIKE '%term%'   — customer search dropdown
--   users.email       ILIKE '%term%'   — customer search dropdown
--   users.customer_number ILIKE '%term%' — customer search dropdown
--   packages.tracking_number ILIKE '%term%' — future packages search
--   awbs.awb_number   ILIKE '%term%'   — future AWB search
--   invoices.invoice_number ILIKE '%term%' — future invoice search
-- ============================================================

-- ─────────────────────────────────────────────────────
-- users — customer search dropdown (live feature on packages/[id])
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_first_name_trgm
  ON public.users USING gin (first_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_last_name_trgm
  ON public.users USING gin (last_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_email_trgm
  ON public.users USING gin (email gin_trgm_ops);

-- customer_number is nullable, so partial index to skip NULLs
CREATE INDEX IF NOT EXISTS idx_users_customer_number_trgm
  ON public.users USING gin (customer_number gin_trgm_ops)
  WHERE customer_number IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- packages — enables server-side tracking number search on list
-- (list page currently pulls 1000 rows client-side; that won't
-- scale past ~10k packages per tenant, and this index is the
-- prerequisite to pushing search into the query)
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_packages_tracking_number_trgm
  ON public.packages USING gin (tracking_number gin_trgm_ops);

-- ─────────────────────────────────────────────────────
-- awbs — enables server-side AWB number search on list
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_awbs_awb_number_trgm
  ON public.awbs USING gin (awb_number gin_trgm_ops);

-- ─────────────────────────────────────────────────────
-- invoices — enables server-side invoice number search on list
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number_trgm
  ON public.invoices USING gin (invoice_number gin_trgm_ops);

-- ─────────────────────────────────────────────────────
-- Refresh planner stats
-- ─────────────────────────────────────────────────────
ANALYZE public.users;
ANALYZE public.packages;
ANALYZE public.awbs;
ANALYZE public.invoices;
