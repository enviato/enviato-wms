-- 023_users_role_v2_not_null.sql
-- Tier 6 follow-up to F-7 (MEDIUM). Structurally prevents the HP5 / NULL-role
-- regression from ever recurring.
--
-- Context:
--   - 021_role_v2_backfill.sql (shipped 2026-04-20 in 5b497e5) backfilled
--     the 10 legacy CUSTOMER users that had role_v2 = NULL.
--   - The create-recipient API route (src/app/api/admin/create-recipient/
--     route.ts) was patched in the same commit to stamp role_v2='CUSTOMER'
--     on every new recipient, so no new NULLs can be introduced through
--     the admin UI path.
--   - 021 itself did NOT add a NOT NULL constraint, so the column is still
--     nullable at the schema level.
--
-- What this migration does:
--   1. Update handle_new_user() (the auth.users AFTER INSERT trigger) to
--      populate role_v2 from auth user_metadata, with a safe fallback that
--      maps from the legacy `role` column. Pre-023 the trigger only set
--      `role`, so any auth user created with org_id in metadata would have
--      role_v2 = NULL after the trigger ran. With org_id currently not in
--      the metadata for any production path, the trigger is a no-op today,
--      but this closes the latent hole before we add the NOT NULL below.
--   2. ALTER TABLE users ALTER COLUMN role_v2 SET NOT NULL.
--
-- Preconditions verified 2026-04-20 pre-apply via Supabase MCP:
--   - 0 rows with role_v2 IS NULL (live, deleted, or all).
--   - Live 14 rows: 1 ORG_ADMIN, 2 WAREHOUSE_STAFF, 1 AGENT_STAFF,
--     10 CUSTOMER. Legacy `role` maps 1:1 to role_v2.
--
-- Regression testing:
--   tests/rls/F7_role_v2_backfill.sql — extended to assert
--   pg_attribute.attnotnull = true on users.role_v2 so the constraint
--   itself is covered, not just the data.

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1: Safety net. If any NULL role_v2 row snuck in since the precondition
-- check (e.g. from a trigger-driven insert that racrd this migration),
-- abort. Better to fail loudly here than silently at the ALTER TABLE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_nulls bigint;
BEGIN
  SELECT COUNT(*) INTO v_nulls FROM public.users WHERE role_v2 IS NULL;
  IF v_nulls > 0 THEN
    RAISE EXCEPTION
      'MIGRATION 023 ABORTED: % user(s) still have role_v2 IS NULL. Run 021_role_v2_backfill.sql first or manually resolve before retrying.',
      v_nulls;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 2: Rewrite handle_new_user() so the trigger stamps role_v2 too.
-- Behavior:
--   - Prefer meta->>'role_v2' (future-facing: callers can opt into the v2 enum directly).
--   - Else map from v_role (the legacy user_role enum already computed from
--     meta->>'role' with default 'customer').
--   - Refuse to insert if mapping can't produce a value (paranoid; enum is
--     exhaustive today, but guards against future enum drift).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    meta jsonb;
    v_org_id uuid;
    v_role user_role;
    v_role_v2 user_role_v2;
    v_courier_group_id uuid;
BEGIN
    meta := NEW.raw_user_meta_data;

    v_org_id := (meta->>'org_id')::uuid;
    v_role := COALESCE((meta->>'role')::user_role, 'customer');
    v_courier_group_id := (meta->>'courier_group_id')::uuid;

    -- Prefer the v2 value if supplied; else map 1:1 from legacy role.
    -- Mapping locked in by live-data verification 2026-04-20 (14 users, 0 drift).
    v_role_v2 := COALESCE(
      (meta->>'role_v2')::user_role_v2,
      CASE v_role
        WHEN 'org_admin'       THEN 'ORG_ADMIN'::user_role_v2
        WHEN 'warehouse_staff' THEN 'WAREHOUSE_STAFF'::user_role_v2
        WHEN 'courier_admin'   THEN 'AGENT_ADMIN'::user_role_v2
        WHEN 'courier_staff'   THEN 'AGENT_STAFF'::user_role_v2
        WHEN 'customer'        THEN 'CUSTOMER'::user_role_v2
        ELSE NULL
      END
    );

    -- Only create profile if org_id was provided (invited user path).
    IF v_org_id IS NOT NULL THEN
        IF v_role_v2 IS NULL THEN
          RAISE EXCEPTION
            'handle_new_user(): could not derive role_v2 for new auth user % (legacy role=%). Supply user_metadata.role_v2 explicitly.',
            NEW.id, v_role;
        END IF;

        INSERT INTO users (id, org_id, email, first_name, last_name, role, role_v2, courier_group_id)
        VALUES (
            NEW.id,
            v_org_id,
            NEW.email,
            COALESCE(meta->>'first_name', ''),
            COALESCE(meta->>'last_name', ''),
            v_role,
            v_role_v2,
            v_courier_group_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- Step 3: The constraint itself.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ALTER COLUMN role_v2 SET NOT NULL;

COMMIT;
