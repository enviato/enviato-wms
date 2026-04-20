-- 022_jwt_claims_in_rls_helpers.sql
-- Tier 6 Phase B — F-6 fix
--
-- Rewrite the three hottest RLS helpers (auth_org_id, auth_role_v2, auth_role_id)
-- to read from JWT app_metadata claims first, falling back to the users table
-- only when the claim is absent. Migration 015 already wires the
-- custom_access_token_hook to inject these three fields; the app middleware
-- (src/middleware.ts:82-106) already uses them. This migration finishes the job
-- by teaching RLS to use them too.
--
-- Measured baseline (2026-04-20, pre-fix, CUSTOMER SELECT on packages LIMIT 50):
--   - auth_org_id() InitPlan: 370 shared-buffer hits, 30.5 ms
--   - auth_role_v2() InitPlan: 6 + 3 buffer hits, ~1.5 ms combined
--   - Total query exec time: 50.7 ms
--
-- Expected post-fix: the 30.5 ms spent on auth_org_id() collapses to a cheap
-- JSON extract from auth.jwt(). Per-query savings compound across the app —
-- every protected query hits at least auth_org_id + auth_role_v2 in its RLS
-- predicate. See post-fix EXPLAIN ANALYZE in the Tier 6 audit memory.
--
-- Correctness tradeoff (product decision, user-chosen 2026-04-20):
-- Supabase default access token TTL is 1 hour. If a user's role_v2, org_id, or
-- role_id changes in public.users, their existing JWT keeps the OLD claim until
-- their token refreshes (up to 1h). This is acceptable for ENVIATO because:
--   1. Role changes are rare in practice.
--   2. Admins can invalidate a session via the Supabase dashboard for urgent revokes.
--   3. The fallback branch still hits the DB if the claim is missing, so users
--      who signed in before the hook was enabled keep working (same as today's
--      middleware pattern).
-- TTL can be tightened later via Supabase Dashboard → Authentication → JWT
-- Expiry without any SQL changes.
--
-- Defense-in-depth notes:
--   1. COALESCE short-circuits in Postgres — the DB fallback subquery only runs
--      when the claim is NULL or empty. No double-lookup cost in the happy path.
--   2. NULLIF(..., '') catches the case where the hook minted a claim with an
--      empty string (e.g., user has org_id = NULL in DB). Empty string treated
--      as "claim not usable", which triggers fallback to DB — which also returns
--      NULL. Net: no regression versus today.
--   3. Functions keep SECURITY DEFINER + SET search_path = 'public' exactly as
--      before. SECURITY DEFINER is required because the fallback SELECT touches
--      public.users, and the caller may not have a direct SELECT permission path.
--   4. auth.jwt() returns NULL in non-request contexts (service_role from SQL
--      editor, cron jobs, etc.). The fallback path handles this gracefully —
--      same semantics as the pre-fix versions.
--
-- Scope intentionally tight:
--   - Only auth_org_id, auth_role_v2, auth_role_id are migrated. These are the
--     three hot-path helpers hit by nearly every RLS policy.
--   - get_accessible_agent_ids is NOT migrated here. It needs agent_id in the
--     JWT (not currently in the hook), so optimizing it requires updating 015
--     first. Deferred to a later pass — the gain is smaller and the change is
--     bigger.
--   - user_has_permission is NOT migrated. It takes p_user_id as a parameter
--     (not always auth.uid()), so the optimization is conditional and trickier.
--     Also deferred.
--
-- Verification plan (executed 2026-04-20):
--   1. Apply migration.
--   2. With a valid JWT carrying claims → helpers return claim value, no DB hit.
--   3. With a JWT missing claims (simulated by omitting app_metadata) → helpers
--      fall back to DB, return same result as pre-fix.
--   4. Re-run the full F-1/F-3/F-5/HP5 test matrix. All prior tests must still pass.
--   5. EXPLAIN ANALYZE the CUSTOMER packages query — measure speedup.

-- ============================================================================
-- auth_org_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auth_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    (SELECT org_id FROM public.users WHERE id = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.auth_org_id() IS
  'Returns the caller''s org_id. Reads JWT app_metadata.org_id claim first (populated by custom_access_token_hook / migration 015); falls back to public.users lookup if claim is missing. Tier 6 F-6 fix (022).';

-- ============================================================================
-- auth_role_v2
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auth_role_v2()
RETURNS public.user_role_v2
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'role_v2', '')::public.user_role_v2,
    (SELECT role_v2 FROM public.users WHERE id = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.auth_role_v2() IS
  'Returns the caller''s role_v2. Reads JWT app_metadata.role_v2 claim first (populated by custom_access_token_hook / migration 015); falls back to public.users lookup if claim is missing. Tier 6 F-6 fix (022).';

-- ============================================================================
-- auth_role_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auth_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'role_id', '')::uuid,
    (SELECT role_id FROM public.users WHERE id = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.auth_role_id() IS
  'Returns the caller''s role_id (custom role). Reads JWT app_metadata.role_id claim first (populated by custom_access_token_hook / migration 015); falls back to public.users lookup if claim is missing. Tier 6 F-6 fix (022).';
