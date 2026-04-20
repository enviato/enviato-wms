-- ============================================================================
-- Migration 018: Split `FOR ALL` policies into SELECT + role-gated write.
-- ============================================================================
--
-- Audit reference: docs/audits/2026-04-19-tier6-rls-audit.md
--   F-12 (HIGH → CRITICAL for org_settings): Five tables use `FOR ALL` with a
--       USING clause that only scopes by org/tenant. That silently grants
--       INSERT / UPDATE / DELETE to every authenticated user in the org —
--       including CUSTOMER and AGENT_STAFF — because:
--         (a) FOR ALL covers all of SELECT / INSERT / UPDATE / DELETE, and
--         (b) WITH CHECK defaults to USING, so the tenant-scope check is
--             the only gate on writes.
--       CUSTOMERs and AGENT_STAFF can therefore edit org-wide configuration,
--       taxonomy, print templates, and warehouse geometry.
--
-- Affected policies:
--   public.org_settings          : "Users can manage their org settings"
--   public.tags                  : tags_org_access
--   public.label_templates       : label_templates_org_access
--   public.warehouse_locations   : warehouse_locations_org_access
--   public.package_tags          : package_tags_org_access
--
-- Fix pattern (per table):
--   1. DROP the FOR ALL policy.
--   2. CREATE a FOR SELECT policy — org (or parent-tag) scoped, all tenant
--      members still read.
--   3. CREATE a FOR ALL policy (writes) — same scope plus a role gate. Only
--      staff roles can mutate. WITH CHECK mirrors USING so newly inserted /
--      updated rows must satisfy the same scope AND role.
--      (`FOR ALL` on the write policy still covers SELECT, which is fine —
--       the read policy already grants SELECT; additional grants from write
--       policy's USING are a superset and do not narrow anything.)
--
-- Write role gating decisions (conservative; any loosening is a product
-- decision tracked in audit §6):
--   org_settings         — ORG_ADMIN only.
--   tags                 — ORG_ADMIN + WAREHOUSE_STAFF.
--   label_templates      — ORG_ADMIN + WAREHOUSE_STAFF.
--   warehouse_locations  — ORG_ADMIN only (owner decision 2026-04-19: only
--                          the global admin should be able to rearrange the
--                          physical warehouse layout).
--   package_tags         — ORG_ADMIN + WAREHOUSE_STAFF.
--
-- Re-test: see SQL at the bottom / Tier 6 audit §3 Tests 12 + 13 + 14 + 15.
-- ============================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- 1. org_settings
--    Current: FOR ALL, USING (org_id IN (SELECT users.org_id FROM users WHERE users.id = auth.uid()))
--    Gate:    ORG_ADMIN only for write.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their org settings" ON public.org_settings;

CREATE POLICY org_settings_select
  ON public.org_settings
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.auth_org_id()));

CREATE POLICY org_settings_write
  ON public.org_settings
  FOR ALL
  TO authenticated
  USING (
    org_id = (SELECT public.auth_org_id())
    AND (SELECT public.auth_role_v2()) = 'ORG_ADMIN'::public.user_role_v2
  )
  WITH CHECK (
    org_id = (SELECT public.auth_org_id())
    AND (SELECT public.auth_role_v2()) = 'ORG_ADMIN'::public.user_role_v2
  );


-- -----------------------------------------------------------------------
-- 2. tags
--    Current: FOR ALL, USING (org_id = (SELECT auth_org_id()))
--    Gate:    ORG_ADMIN + WAREHOUSE_STAFF for write.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS tags_org_access ON public.tags;

CREATE POLICY tags_select
  ON public.tags
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.auth_org_id()));

CREATE POLICY tags_write
  ON public.tags
  FOR ALL
  TO authenticated
  USING (
    org_id = (SELECT public.auth_org_id())
    AND (SELECT public.auth_role_v2()) IN (
      'ORG_ADMIN'::public.user_role_v2,
      'WAREHOUSE_STAFF'::public.user_role_v2
    )
  )
  WITH CHECK (
    org_id = (SELECT public.auth_org_id())
    AND (SELECT public.auth_role_v2()) IN (
      'ORG_ADMIN'::public.user_role_v2,
      'WAREHOUSE_STAFF'::public.user_role_v2
    )
  );


-- -----------------------------------------------------------------------
-- 3. label_templates
--    Current: FOR ALL, USING (org_id = (SELECT auth_org_id()))
--    Gate:    ORG_ADMIN + WAREHOUSE_STAFF for write.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS label_templates_org_access ON public.label_templates;

CREATE POLICY label_templates_select
  ON public.label_templates
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.auth_org_id()));

CREATE POLICY label_templates_write
  ON public.label_templates
  FOR ALL
  TO authenticated
  USING (
    org_id = (SELECT public.auth_org_id())
    AND (SELECT public.auth_role_v2()) IN (
      'ORG_ADMIN'::public.user_role_v2,
      'WAREHOUSE_STAFF'::public.user_role_v2
    )
  )
  WITH CHECK (
    org_id = (SELECT public.auth_org_id())
    AND (SELECT public.auth_role_v2()) IN (
      'ORG_ADMIN'::public.user_role_v2,
      'WAREHOUSE_STAFF'::public.user_role_v2
    )
  );


-- -----------------------------------------------------------------------
-- 4. warehouse_locations
--    Current: FOR ALL, USING (org_id = (SELECT auth_org_id()))
--    Gate:    ORG_ADMIN only for write (owner decision 2026-04-19).
--    WAREHOUSE_STAFF can still READ every location (needed to scan packages
--    into bins) but cannot create / rename / delete locations.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS warehouse_locations_org_access ON public.warehouse_locations;

CREATE POLICY warehouse_locations_select
  ON public.warehouse_locations
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.auth_org_id()));

CREATE POLICY warehouse_locations_write
  ON public.warehouse_locations
  FOR ALL
  TO authenticated
  USING (
    org_id = (SELECT public.auth_org_id())
    AND (SELECT public.auth_role_v2()) = 'ORG_ADMIN'::public.user_role_v2
  )
  WITH CHECK (
    org_id = (SELECT public.auth_org_id())
    AND (SELECT public.auth_role_v2()) = 'ORG_ADMIN'::public.user_role_v2
  );


-- -----------------------------------------------------------------------
-- 5. package_tags
--    Current: FOR ALL, USING (tag_id IN (SELECT tags.id FROM tags WHERE tags.org_id = auth_org_id()))
--    Gate:    ORG_ADMIN + WAREHOUSE_STAFF for write.
--    Scope pattern unchanged (parent-tag → org_id), just split by op.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS package_tags_org_access ON public.package_tags;

CREATE POLICY package_tags_select
  ON public.package_tags
  FOR SELECT
  TO authenticated
  USING (
    tag_id IN (
      SELECT t.id FROM public.tags t
       WHERE t.org_id = (SELECT public.auth_org_id())
    )
  );

CREATE POLICY package_tags_write
  ON public.package_tags
  FOR ALL
  TO authenticated
  USING (
    tag_id IN (
      SELECT t.id FROM public.tags t
       WHERE t.org_id = (SELECT public.auth_org_id())
    )
    AND (SELECT public.auth_role_v2()) IN (
      'ORG_ADMIN'::public.user_role_v2,
      'WAREHOUSE_STAFF'::public.user_role_v2
    )
  )
  WITH CHECK (
    tag_id IN (
      SELECT t.id FROM public.tags t
       WHERE t.org_id = (SELECT public.auth_org_id())
    )
    AND (SELECT public.auth_role_v2()) IN (
      'ORG_ADMIN'::public.user_role_v2,
      'WAREHOUSE_STAFF'::public.user_role_v2
    )
  );

COMMIT;

-- ============================================================================
-- RE-TEST (run as a separate transaction from application code, not here):
--
--   Kills F-12 (org_settings): CUSTOMER UPDATE on org_settings
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<customer-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     UPDATE public.org_settings SET settings = settings WHERE org_id = '<org>';
--     -- Expected: 0 rows affected.
--   ROLLBACK;
--
--   Kills F-12 (org_settings): AGENT_STAFF INSERT
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<agent_staff-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     INSERT INTO public.org_settings (org_id, settings) VALUES ('<org>', '{}');
--     -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
--   Kills F-12 (tags): CUSTOMER INSERT tag
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<customer-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     INSERT INTO public.tags (org_id, name) VALUES ('<org>', 'attack');
--     -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
--   Happy-path: CUSTOMER can still SELECT tags (read)
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<customer-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     SELECT count(*) FROM public.tags WHERE org_id = '<org>';
--     -- Expected: same count as before.
--   ROLLBACK;
--
--   Happy-path: WAREHOUSE_STAFF can still INSERT tag
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<warehouse-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     INSERT INTO public.tags (org_id, name) VALUES ('<org>', 'new-tag-from-warehouse');
--     -- Expected: 1 row inserted.
--   ROLLBACK;
--
--   Happy-path: ORG_ADMIN can still UPDATE warehouse_locations
--   ---------------------------------------------------------------
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"<org_admin-uuid>","role":"authenticated","org_id":"<org>"}', true);
--     UPDATE public.warehouse_locations SET name = name WHERE org_id = '<org>';
--     -- Expected: >= 1 row.
--   ROLLBACK;
-- ============================================================================
