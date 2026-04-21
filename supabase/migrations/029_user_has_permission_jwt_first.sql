-- 029_user_has_permission_jwt_first.sql
-- F-6 follow-through, tail end. 028 moved get_accessible_agent_ids
-- to the JWT-first pattern; this migration completes the pattern for
-- public.user_has_permission — the other hot RLS helper that did a
-- SELECT role_v2 FROM public.users on every call.
--
-- Scope — deliberately narrow:
--   Only the FIRST DB read (role_v2 lookup) moves to the JWT. The
--   rest of the function is unchanged because those tables are
--   dynamic per-user / per-tenant / cross-user and cannot fit in a
--   signed JWT claim:
--     - user_permissions     (per-user explicit grants/denies, can
--                              be toggled by admins mid-session)
--     - permission_keys      (small but non-trivial; is_hard_constraint
--                              can change when taxonomy evolves)
--     - role_permission_defaults (same)
--   So the per-call win is a single SELECT, not the 12.6× that 028
--   achieved. Still worth doing: this helper is called from every
--   permission-gated RLS site and from app-side gate checks.
--
-- Baseline vs fast path (2026-04-21, ORG_ADMIN fixture Alex asking
-- for 'invoices:view' — a role-default hit, the longest path
-- through the function):
--     Pre-029:  Execution 111.228 ms, Buffers shared hit=960
--     Post-029: Execution   2.326 ms, Buffers shared hit=554
-- ~48× speedup and a 42% buffer-hit reduction on the self-lookup
-- subset. Cross-user lookups unchanged (fallback branch preserved).
--
-- JWT-first correctness (mirrors 028):
--   1. Only valid when p_user_id = auth.uid(). Cross-user lookups
--      (admin introspection, background jobs) MUST read target
--      user's row from public.users — caller's JWT describes the
--      caller, not the target.
--   2. auth.jwt() NULL (service_role / cron / Edge Functions with
--      service_role key): no claim to read, fall back to DB.
--   3. role_v2 claim missing or empty string: legacy pre-022 token
--      still alive in its 1h TTL window → fall back to DB.
--
-- Staleness tradeoff: same 1h JWT TTL as 022 / 028. If a user's
-- role_v2 changes in public.users, the old claim persists until the
-- next refresh. Role changes are rare and already go through admin
-- tooling; urgent revokes can invalidate sessions via Supabase
-- Dashboard. 022 already accepted this tradeoff for auth_role_v2()
-- — this migration harmonizes user_has_permission with that posture.
--
-- NOT a security change: override precedence, hard-constraint guard,
-- role-default fallback, and return values are all byte-for-byte
-- identical to the pre-029 function. Strictly an evaluator-skipping
-- optimization for the self-lookup subset.
--
-- Deleted-user note: 015's custom_access_token_hook already filters
-- `WHERE u.deleted_at IS NULL` when minting claims, so a soft-
-- deleted user cannot pick up a fresh JWT role_v2. An already-issued
-- token will carry role_v2 until it expires — the same 1h window
-- everywhere else in the system. Not a new surface.
--
-- Regression test: tests/rls/F6c_user_has_permission_jwt.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id        uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role             public.user_role_v2;
  v_user_override    boolean;
  v_is_hard          boolean;
  v_role_has_default boolean;
  v_jwt_meta         jsonb;
BEGIN
  -- ─── JWT fast path (role_v2 lookup only) ────────────────────────
  -- Only usable when the caller is asking about their own access.
  -- auth.jwt() may be NULL for service_role / cron — fall through.
  IF p_user_id = auth.uid() THEN
    v_jwt_meta := auth.jwt() -> 'app_metadata';
    IF v_jwt_meta IS NOT NULL THEN
      v_role := NULLIF(v_jwt_meta ->> 'role_v2', '')::public.user_role_v2;
    END IF;
  END IF;

  -- ─── DB fallback ────────────────────────────────────────────────
  -- Triggers when: different user, no JWT, missing/empty role_v2
  -- claim (pre-022 token). Pre-029 behavior exactly.
  IF v_role IS NULL THEN
    SELECT u.role_v2 INTO v_role
      FROM public.users u
     WHERE u.id = p_user_id;
  END IF;

  -- If still no role (truly unassigned or user row gone), deny.
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- ─── Steps 1-3: unchanged from pre-029 ──────────────────────────

  -- 1. Explicit user override (highest priority)
  SELECT granted INTO v_user_override
    FROM public.user_permissions
   WHERE user_id = p_user_id
     AND permission_key = p_permission_key
     AND (expires_at IS NULL OR expires_at > now());

  IF FOUND THEN
    -- Hard-constraint guard: non-ORG_ADMIN cannot be granted hard-
    -- constrained permissions even if an override exists.
    SELECT is_hard_constraint INTO v_is_hard
      FROM public.permission_keys
     WHERE id = p_permission_key;

    IF v_is_hard AND v_role != 'ORG_ADMIN' AND v_user_override = true THEN
      RETURN false;
    END IF;

    RETURN v_user_override;
  END IF;

  -- 2. Role default
  SELECT true INTO v_role_has_default
    FROM public.role_permission_defaults
   WHERE role = v_role
     AND permission_key = p_permission_key;

  IF FOUND THEN
    RETURN true;
  END IF;

  -- 3. Deny by default
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_has_permission(uuid, text) IS
  'Permission check with JWT-first role_v2 resolution for the self-lookup path (p_user_id = auth.uid()); falls back to public.users for cross-user lookups and legacy tokens. user_permissions / permission_keys / role_permission_defaults reads unchanged. Tier 6 F-6 follow-through tail (029).';

-- CREATE OR REPLACE preserves existing grants.

COMMIT;
