-- 028_get_accessible_agent_ids_jwt_first.sql
-- F-6 follow-through — last of the hot RLS helpers to move to the
-- JWT-claim-first pattern. 022 migrated auth_org_id / auth_role_v2 /
-- auth_role_id; it explicitly deferred `get_accessible_agent_ids`
-- because agent_id was not in the JWT yet. Migration 027 puts
-- agent_id into `app_metadata`, so this migration can finally skip
-- the public.users lookup on the happy path.
--
-- Why this helper matters:
--   Called from 7 policy sites across 5 tables:
--     awbs_select_v2, awbs_update_v2
--     customers_v2_select
--     invoices_select_v2 (in both agent-tree branches)
--     packages_select_v2, packages_update_v2
--     users_select_v2
--   Every AGENT_ADMIN or AGENT_STAFF page load hits at least one of
--   these; packages-list and invoices-list are the hottest.
--
-- Measured baseline (2026-04-21, AGENT_STAFF fixture platinumcorp1,
-- SELECT * FROM get_accessible_agent_ids(<uid>)):
--   - Execution Time: 37.828 ms
--   - Buffers: shared hit=745
--   - Planning Time: 0.095 ms
--   - Rows: 1
-- Same magnitude as the 022 baseline (auth_org_id was 30.5 ms /
-- 370 buffers). Expected post-fix: single-digit ms, zero DB buffer
-- hits for the AGENT_STAFF case (JWT claim returns directly); same
-- closure-descendant scan for AGENT_ADMIN (but with a NULL hook to
-- public.users eliminated on top of that scan).
--
-- JWT-first correctness rules (why the fallback exists):
--   1. `p_user_id != auth.uid()`: the caller is looking up a
--      DIFFERENT user's accessible agents (e.g. admin introspection
--      tools). The JWT describes the caller, not the target — must
--      hit the DB.
--   2. `auth.jwt()` is NULL: service_role from the SQL editor, cron
--      jobs, Edge Functions with service_role key. No JWT to read.
--   3. Required claim is missing for the role: pre-027 tokens don't
--      carry `agent_id`. If role is AGENT_ADMIN/AGENT_STAFF and the
--      claim is absent/null, fall back to DB. Natural refresh (~1h)
--      picks up the claim and the fast path activates.
--   4. role_v2 claim itself is missing (pre-015 legacy tokens): the
--      COALESCE on v_role triggers the DB lookup.
--
-- Staleness tradeoff: same as 022. JWT TTL is 1h; if a user's
-- agent_id, role_v2, or org_id changes in public.users, the old
-- claim persists until refresh. Agent reassignments are rare —
-- typically a staffing change, not a runtime event. Admins can
-- invalidate a session via Supabase Dashboard for urgent revokes.
--
-- NOT a security change: role-branching logic, RLS semantics, and
-- return values are all byte-for-byte identical to the pre-028
-- function. This is strictly an evaluator-skipping optimization.
--
-- Regression test: tests/rls/F6b_get_accessible_agent_ids_jwt.sql
-- (exercises JWT-present happy path, missing-claim fallback, and
-- different-user fallback).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_accessible_agent_ids(p_user_id uuid)
RETURNS TABLE(agent_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role     public.user_role_v2;
  v_agent_id uuid;
  v_org_id   uuid;
  v_jwt_meta jsonb;
  v_used_jwt boolean := false;
BEGIN
  -- ─── JWT fast path ──────────────────────────────────────────────
  -- Only valid when the caller is asking about their own access
  -- (`p_user_id = auth.uid()`). For other targets we MUST read the
  -- target's row from public.users.
  IF p_user_id = auth.uid() THEN
    v_jwt_meta := auth.jwt() -> 'app_metadata';

    IF v_jwt_meta IS NOT NULL THEN
      v_role     := NULLIF(v_jwt_meta ->> 'role_v2', '')::public.user_role_v2;
      v_agent_id := NULLIF(v_jwt_meta ->> 'agent_id', '')::uuid;
      v_org_id   := NULLIF(v_jwt_meta ->> 'org_id', '')::uuid;

      -- The JWT path is usable only when we have every field the
      -- branch for this role will need:
      --   ORG_ADMIN / WAREHOUSE_STAFF → needs org_id
      --   AGENT_ADMIN / AGENT_STAFF   → needs agent_id
      --   CUSTOMER / NULL             → no branch-specific field,
      --                                 just role itself
      IF v_role IS NOT NULL THEN
        IF v_role IN ('ORG_ADMIN', 'WAREHOUSE_STAFF') AND v_org_id IS NOT NULL THEN
          v_used_jwt := true;
        ELSIF v_role IN ('AGENT_ADMIN', 'AGENT_STAFF') AND v_agent_id IS NOT NULL THEN
          v_used_jwt := true;
        ELSIF v_role = 'CUSTOMER' THEN
          v_used_jwt := true;
        END IF;
      END IF;
    END IF;
  END IF;

  -- ─── DB fallback ────────────────────────────────────────────────
  -- Triggers when: different user, no JWT (service_role/cron),
  -- pre-015 token missing role_v2, pre-027 AGENT_* token missing
  -- agent_id, or any corrupt-claim edge case.
  IF NOT v_used_jwt THEN
    SELECT u.role_v2, u.agent_id, u.org_id
      INTO v_role, v_agent_id, v_org_id
      FROM public.users u
     WHERE u.id = p_user_id;
  END IF;

  -- ─── Role-branching (unchanged from pre-028) ────────────────────
  IF v_role IN ('ORG_ADMIN', 'WAREHOUSE_STAFF') THEN
    RETURN QUERY
      SELECT a.id FROM public.agents a WHERE a.org_id = v_org_id;
    RETURN;
  END IF;

  IF v_role = 'AGENT_ADMIN' AND v_agent_id IS NOT NULL THEN
    RETURN QUERY
      SELECT ac.descendant_id
        FROM public.agent_closure ac
       WHERE ac.ancestor_id = v_agent_id;
    RETURN;
  END IF;

  IF v_role = 'AGENT_STAFF' AND v_agent_id IS NOT NULL THEN
    RETURN QUERY SELECT v_agent_id;
    RETURN;
  END IF;

  -- CUSTOMER, or any role without an agent_id — empty set.
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_accessible_agent_ids(uuid) IS
  'Returns agent_ids the caller (or target user, if p_user_id != auth.uid()) can access via org / agent_closure. Reads role_v2/agent_id/org_id from JWT app_metadata on the self-lookup path (populated by 015+027); falls back to public.users otherwise. Tier 6 F-6 follow-through (028).';

-- CREATE OR REPLACE preserves existing grants. No new grants needed —
-- this function was already callable from RLS policies / authenticated.

COMMIT;
