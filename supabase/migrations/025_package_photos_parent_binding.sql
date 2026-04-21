-- 025_package_photos_parent_binding.sql
-- F-9 (LOW) remediation from the Tier 6 RLS audit (2026-04-19).
--
-- Pre-025 policies on package_photos all had the shape:
--   EXISTS (
--     SELECT 1 FROM packages p
--      WHERE p.id = package_photos.package_id
--        AND p.org_id = auth_org_id()
--        AND ...role/permission gates...
--   )
--
-- The `p.org_id = auth_org_id()` clause is redundant. `FROM packages p`
-- applies packages_select_v2 in the subquery's RLS context, so for every
-- role the parent row only shows up if the viewer is already allowed to
-- see it:
--   - ORG_ADMIN / WAREHOUSE_STAFF: branch already requires `org_id = auth_org_id()`.
--   - AGENT_STAFF / AGENT_ADMIN:    branch narrows to accessible-agent tree
--                                   (which is inside the viewer's org).
--   - CUSTOMER:                     branch narrows to `customer_id = auth.uid()`
--                                   AND `deleted_at IS NULL` (post-024).
--
-- The audit (F-9) flagged the extra org check as a readability trap: a
-- future maintainer could read the photo policies and conclude that org
-- match alone gates visibility — and then add a code path that queries
-- package_photos without going through packages RLS (e.g. a SECURITY
-- DEFINER helper, an edge function running as service_role, or a join
-- with a hint that defeats RLS evaluation). 025 removes the vestigial
-- check so the remaining gate — `EXISTS (SELECT 1 FROM packages p WHERE
-- p.id = package_photos.package_id)` — states the invariant directly:
-- "photo visibility tracks whatever packages RLS says about the parent."
--
-- Migration 024's header already documented this cascade relationship
-- for invoice_lines and package_photos (it notes they "already cascade
-- through their parent's SELECT policy"). 025 turns that observation
-- into explicit policy text so the invariant is self-evident in
-- pg_policies.
--
-- Behavior is unchanged for every role. No data migration. Pure policy
-- rewrite. Regression test: tests/rls/F9_package_photos_parent_binding.sql.

BEGIN;

-- Drop the old redundant-org-check shapes.
DROP POLICY IF EXISTS photos_select_v2 ON public.package_photos;
DROP POLICY IF EXISTS photos_insert_v2 ON public.package_photos;
DROP POLICY IF EXISTS photos_delete_v2 ON public.package_photos;

-- SELECT: parent-binding-only.
CREATE POLICY photos_select_v2 ON public.package_photos
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1
        FROM public.packages p
       WHERE p.id = package_photos.package_id
    )
  );

-- INSERT: parent-binding + packages:edit permission.
-- The permission check stays — RLS visibility alone doesn't authorize
-- writes; only users with `packages:edit` (ORG_ADMIN, AGENT_ADMIN,
-- WAREHOUSE_STAFF per role_permission_defaults) can attach photos.
CREATE POLICY photos_insert_v2 ON public.package_photos
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.packages p
       WHERE p.id = package_photos.package_id
    )
    AND user_has_permission((SELECT auth.uid()), 'packages:edit')
  );

-- DELETE: parent-binding + hard role gate.
-- Role check moved outside the EXISTS for readability — `auth_role_v2()`
-- is constant for the whole query, so the optimizer already hoists it.
CREATE POLICY photos_delete_v2 ON public.package_photos
  FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1
        FROM public.packages p
       WHERE p.id = package_photos.package_id
    )
    AND (SELECT auth_role_v2()) = ANY (ARRAY[
      'ORG_ADMIN'::user_role_v2,
      'WAREHOUSE_STAFF'::user_role_v2
    ])
  );

-- No UPDATE policy: default-deny stays (there was no photos_update_v2
-- pre-025 either — intentional, photo rows are immutable; edits happen
-- by DELETE + INSERT).

COMMIT;
