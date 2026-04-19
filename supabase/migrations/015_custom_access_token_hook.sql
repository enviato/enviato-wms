-- ============================================================
-- 015: Auth perf — custom access token hook
-- ============================================================
-- Injects role_v2, role_id, org_id, and legacy role into every
-- access token's `app_metadata` claim at JWT mint time.
--
-- Why: the Next.js middleware runs on every protected request
-- and currently does:
--   1. supabase.auth.getUser()      — unavoidable, verifies JWT
--   2. SELECT role_v2, role_id FROM public.users WHERE id = ...
--      — 80-150ms DB round trip on every single request
--
-- With this hook, step 2 becomes reading `user.app_metadata.role_v2`
-- straight off the already-verified JWT. Zero DB hit in middleware
-- for authz decisions.
--
-- How it works:
--   1. Supabase's GoTrue calls this function whenever it mints or
--      refreshes an access token. The `event` argument contains
--      the pending claims; we return the modified claims.
--   2. We read the user's role fields from public.users with
--      SECURITY DEFINER so the hook doesn't need RLS policies
--      granting access to supabase_auth_admin.
--   3. We merge into the existing `app_metadata` claim (rather
--      than overwriting it) so anything Supabase itself set
--      — e.g. providers, provider-specific IDs — survives.
--
-- DEPLOYMENT NOTE: creating this function does NOT automatically
-- enable it. After applying, you must:
--   1. Go to Supabase Dashboard → Authentication → Hooks
--   2. Enable "Custom Access Token" hook
--   3. Select function: `public.custom_access_token_hook`
--   4. Save
-- Then existing users' tokens will pick up the new claims on
-- next refresh (typically ~1 hour) or on next sign-in.
--
-- Alternatively, enable via the SQL in the companion file
-- `015_enable_hook.sql` if your project exposes the
-- auth.config table (self-hosted Supabase only).
-- ============================================================

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
    -- (e.g. provider, providers).
    existing_app_meta := existing_app_meta || jsonb_build_object(
      'role_v2',     user_record.role_v2,
      'role_id',     user_record.role_id,
      'org_id',      user_record.org_id,
      'legacy_role', user_record.role
    );
    claims := jsonb_set(claims, '{app_metadata}', existing_app_meta);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Supabase auth hook — injects role_v2, role_id, org_id, legacy role into JWT app_metadata at mint time. Enable via Dashboard → Authentication → Hooks.';

-- ─────────────────────────────────────────────────────
-- Permissions: locked down per Supabase hook guidelines
-- ─────────────────────────────────────────────────────
-- Only supabase_auth_admin (the role GoTrue runs as) may invoke.
-- No one else — not authenticated, anon, or public — should be
-- able to call this function directly.

GRANT EXECUTE
  ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

REVOKE EXECUTE
  ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM authenticated, anon, public;

-- supabase_auth_admin needs USAGE on public to resolve the
-- function's body references (even though SECURITY DEFINER
-- means it runs as the owner, search_path is '' so we must
-- be able to schema-qualify — which we do).
GRANT USAGE
  ON SCHEMA public
  TO supabase_auth_admin;
