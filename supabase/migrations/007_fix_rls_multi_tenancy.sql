-- =========================================================
-- 007: Fix RLS multi-tenancy gaps
-- =========================================================
-- Tightens RLS policies on package_statuses, courier_groups,
-- and package_photos to properly enforce org_id isolation.
-- Previously these had overly permissive policies (e.g. TRUE)
-- that would leak data across organizations.
-- =========================================================

-- 1. package_statuses: all policies were "true" — no org isolation
DROP POLICY IF EXISTS "Users can view package_statuses in their org" ON public.package_statuses;
DROP POLICY IF EXISTS "Users can insert package_statuses" ON public.package_statuses;
DROP POLICY IF EXISTS "Users can update package_statuses" ON public.package_statuses;
DROP POLICY IF EXISTS "Users can delete package_statuses" ON public.package_statuses;

CREATE POLICY "package_statuses_select_v2" ON public.package_statuses
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "package_statuses_insert_v2" ON public.package_statuses
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND auth_role_v2() = 'ORG_ADMIN');

CREATE POLICY "package_statuses_update_v2" ON public.package_statuses
  FOR UPDATE USING (org_id = auth_org_id() AND auth_role_v2() = 'ORG_ADMIN');

CREATE POLICY "package_statuses_delete_v2" ON public.package_statuses
  FOR DELETE USING (org_id = auth_org_id() AND auth_role_v2() = 'ORG_ADMIN');

-- 2. courier_groups: DELETE policy was "true" — any user could delete any org's couriers
DROP POLICY IF EXISTS "Allow authenticated users to delete courier_groups" ON public.courier_groups;
DROP POLICY IF EXISTS "Allow delete courier_groups" ON public.courier_groups;

CREATE POLICY "courier_groups_delete_v2" ON public.courier_groups
  FOR DELETE USING (org_id = auth_org_id() AND auth_role_v2() = 'ORG_ADMIN');

-- 3. package_photos: SELECT didn't check org_id through packages join
DROP POLICY IF EXISTS "photos_select_v2" ON public.package_photos;

CREATE POLICY "photos_select_v2" ON public.package_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = package_photos.package_id
        AND p.org_id = auth_org_id()
    )
  );
