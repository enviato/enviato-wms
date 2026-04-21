-- 027_hook_inject_agent_id.sql
-- F-6 follow-through: extends migration 015's custom_access_token_hook to
-- inject `agent_id` into `app_metadata` alongside the existing
-- role_v2/role_id/org_id/legacy_role claims.
--
-- Why now: migration 028 rewrites `get_accessible_agent_ids` to read
-- agent_id from the JWT before hitting public.users — same JWT-first
-- pattern 022 applied to auth_role_v2/auth_org_id/auth_role_id. That
-- optimization is useless if the JWT doesn't carry agent_id, so this
-- migration is a hard prerequisite for 028.
--
-- Who needs agent_id:
--   AGENT_ADMIN     — required; drives agent_closure descendant lookup
--   AGENT_STAFF     — required; returns self as only accessible agent
--   ORG_ADMIN       — not used (bypass reads all agents in org)
--   WAREHOUSE_STAFF — not used (bypass reads all agents in org)
--   CUSTOMER        — not used (customer branch early-returns empty)
--
-- Rollout model (mirrors 015 + 022):
--   - Applying this migration does NOT force token re-mint. Existing
--     sessions keep their pre-027 tokens for up to 1h until natural
--     refresh. Migration 028's fallback path handles that window:
--     if role IS AGENT_* AND the agent_id claim is absent/null,
--     get_accessible_agent_ids falls back to the DB lookup. Once the
--     token refreshes, the JWT path activates automatically.
--   - NULL agent_id for non-agent roles is expected and fine; the
--     028 function only reads the claim for AGENT_ADMIN/AGENT_STAFF.
--
-- No behavior change for existing claims — just an additive field on
-- app_metadata. Nothing in the app reads `agent_id` off the JWT yet;
-- 028 is the first consumer.

BEGIN;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  existing_app_meta jsonb;
  user_record record;
BEGIN
  -- Fetch the user row. deleted_at filter: a soft-deleted user
  -- should NOT get role claims — middleware will reject the
  -- request at the authz step.
  SELECT u.role_v2,
         u.role_id,
         u.org_id,
         u.agent_id,
         u.role
    INTO user_record
    FROM public.users u
   WHERE u.id = (event ->> 'user_id')::uuid
     AND u.deleted_at IS NULL;

  claims := event -> 'claims';
  existing_app_meta := COALESCE(claims -> 'app_metadata', '{}'::jsonb);

  IF user_record IS NOT NULL THEN
    -- Merge our custom fields into existing app_metadata.
    -- Using the || operator preserves any fields Supabase set
    -- (e.g. provider, providers). jsonb_build_object emits JSON
    -- null for NULL inputs, which is what we want for non-agent
    -- roles — 028 treats null agent_id for AGENT_* roles as a
    -- fallback trigger, so there's no ambiguity.
    existing_app_meta := existing_app_meta || jsonb_build_object(
      'role_v2',     user_record.role_v2,
      'role_id',     user_record.role_id,
      'org_id',      user_record.org_id,
      'agent_id',    user_record.agent_id,
      'legacy_role', user_record.role
    );
    claims := jsonb_set(claims, '{app_metadata}', existing_app_meta);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Supabase auth hook — injects role_v2, role_id, org_id, agent_id, legacy role into JWT app_metadata at mint time. Consumed by auth_role_v2/auth_org_id/auth_role_id (022) and get_accessible_agent_ids (028). Enable via Dashboard → Authentication → Hooks.';

-- Permissions unchanged from 015 — CREATE OR REPLACE preserves the
-- existing GRANT EXECUTE to supabase_auth_admin and the REVOKE on
-- public/authenticated/anon. Re-stating them is defensive only.

GRANT EXECUTE
  ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

REVOKE EXECUTE
  ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM authenticated, anon, public;

COMMIT;
