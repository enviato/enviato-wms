-- ============================================================
-- 014: Performance — drop duplicate indexes
-- ============================================================
-- Each index dropped below is strictly shadowed by a UNIQUE btree
-- on the exact same column list. A unique btree serves every
-- lookup a non-unique btree can serve (equality, range, sort),
-- so maintaining both just wastes disk and slows writes.
--
-- Verified before drop (2026-04-19):
--   - No constraint depends on any of these indexes
--     (pg_constraint.conindid check returned empty)
--   - The replacement unique index has identical column list
--     and no predicate
--
-- NOT dropping `idx_users_name_trgm` despite its apparent
-- redundancy with the per-column trigram indexes added in 013:
-- the `match_customer_by_name` plpgsql function in migration
-- 003 uses `similarity(p_name, first_name || ' ' || last_name)
-- > 0.3` — a predicate the concatenated-expression GIN index
-- CAN serve (when rewritten/matched by the planner) but the
-- per-column indexes cannot. Leaving it in place until the
-- scanning feature is rewritten or confirmed unused.
-- ============================================================

-- users.email — shadowed by users_email_key (UNIQUE btree on email)
DROP INDEX IF EXISTS public.idx_users_email;

-- organizations.slug — shadowed by organizations_slug_key (UNIQUE btree on slug)
DROP INDEX IF EXISTS public.idx_org_slug;

-- agent_edges.child_agent_id — shadowed by idx_agent_edges_child_unique
-- (UNIQUE btree on child_agent_id)
DROP INDEX IF EXISTS public.idx_agent_edges_child;
