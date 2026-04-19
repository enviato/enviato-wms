-- ============================================================
-- 011: RLS performance — wrap auth calls in (SELECT ...)
-- ============================================================
-- Supabase's performance advisor flags `auth_rls_initplan`:
-- bare auth.uid(), auth_org_id(), auth_role_v2() calls in RLS
-- policies are re-evaluated PER ROW rather than once per query.
--
-- Postgres can hoist a subquery into an InitPlan (evaluated once
-- and reused), but only when the expression is wrapped in a
-- SELECT. At scale (100k+ rows per table) this is the difference
-- between a single auth lookup and one per row.
--
-- Helper functions `auth_org_id()` and `auth_role_v2()` internally
-- call `auth.uid()`, so every policy that references either helper
-- needs the wrap too.
--
-- Transformation applied per policy:
--   auth.uid()        → (SELECT auth.uid())
--   auth_org_id()     → (SELECT auth_org_id())
--   auth_role_v2()    → (SELECT auth_role_v2())
--
-- Calls that pass auth.uid() as an argument (e.g.
-- user_has_permission(auth.uid(), ...) or
-- get_accessible_agent_ids(auth.uid())) also get the wrap on the
-- inner auth.uid().
--
-- We use ALTER POLICY so the policy names, target roles, and
-- commands are preserved — only the USING/WITH CHECK expressions
-- change. Behaviour is identical; only the plan is faster.
-- ============================================================

-- ----- activity_log -----
ALTER POLICY "activity_insert_v2" ON public.activity_log
  WITH CHECK (org_id = (SELECT auth_org_id()));

ALTER POLICY "activity_select_v2" ON public.activity_log
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      OR ((package_id IS NOT NULL) AND EXISTS (
        SELECT 1 FROM packages p WHERE p.id = activity_log.package_id
      ))
    )
  );

-- ----- agent_closure -----
ALTER POLICY "agent_closure_select" ON public.agent_closure
  USING (org_id = (SELECT auth_org_id()));

-- ----- agent_edges -----
ALTER POLICY "agent_edges_delete" ON public.agent_edges
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "agent_edges_insert" ON public.agent_edges
  WITH CHECK ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "agent_edges_select" ON public.agent_edges
  USING (org_id = (SELECT auth_org_id()));

-- ----- agents -----
ALTER POLICY "agents_delete" ON public.agents
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "agents_insert" ON public.agents
  WITH CHECK ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "agents_select" ON public.agents
  USING (org_id = (SELECT auth_org_id()));

ALTER POLICY "agents_update" ON public.agents
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

-- ----- awbs -----
ALTER POLICY "awbs_insert_v2" ON public.awbs
  WITH CHECK (
    (org_id = (SELECT auth_org_id()))
    AND user_has_permission((SELECT auth.uid()), 'shipments:create'::text)
  );

ALTER POLICY "awbs_select_v2" ON public.awbs
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      OR (agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())) AS get_accessible_agent_ids))
      OR (
        ((SELECT auth_role_v2()) = 'AGENT_STAFF'::user_role_v2)
        AND (id IN (
          SELECT user_shipment_assignments.shipment_id
          FROM user_shipment_assignments
          WHERE user_shipment_assignments.user_id = (SELECT auth.uid())
        ))
      )
    )
  );

ALTER POLICY "awbs_update_v2" ON public.awbs
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      OR (
        (agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())) AS get_accessible_agent_ids))
        AND user_has_permission((SELECT auth.uid()), 'shipments:edit'::text)
      )
    )
  );

-- ----- courier_groups -----
ALTER POLICY "courier_groups_delete_v2" ON public.courier_groups
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "courier_groups_insert_v2" ON public.courier_groups
  WITH CHECK ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "courier_groups_select_v2" ON public.courier_groups
  USING (org_id = (SELECT auth_org_id()));

ALTER POLICY "courier_groups_update_v2" ON public.courier_groups
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

-- ----- customers_v2 -----
ALTER POLICY "customers_v2_delete" ON public.customers_v2
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "customers_v2_insert" ON public.customers_v2
  WITH CHECK (
    (org_id = (SELECT auth_org_id()))
    AND user_has_permission((SELECT auth.uid()), 'recipients:create'::text)
  );

ALTER POLICY "customers_v2_select" ON public.customers_v2
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      OR (owner_agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())) AS get_accessible_agent_ids))
    )
  );

ALTER POLICY "customers_v2_update" ON public.customers_v2
  USING (
    (org_id = (SELECT auth_org_id()))
    AND user_has_permission((SELECT auth.uid()), 'recipients:edit'::text)
  );

-- ----- invoice_lines -----
ALTER POLICY "invoice_lines_insert_v2" ON public.invoice_lines
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id AND i.org_id = (SELECT auth_org_id())
    )
    AND user_has_permission((SELECT auth.uid()), 'invoices:create'::text)
  );

-- Note: invoice_lines_select_v2 has no auth calls on its own — it inherits via invoice FK.
-- Its current qual does reference auth_org_id via a join; include it if present.

-- ----- invoices -----
ALTER POLICY "invoices_insert_v2" ON public.invoices
  WITH CHECK (
    (org_id = (SELECT auth_org_id()))
    AND user_has_permission((SELECT auth.uid()), 'invoices:create'::text)
  );

ALTER POLICY "invoices_select_v2" ON public.invoices
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
      OR (billed_by_agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())) AS get_accessible_agent_ids))
      OR (billed_to_agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())) AS get_accessible_agent_ids))
      OR (
        (billed_by_agent_id IS NULL)
        AND ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      )
    )
  );

ALTER POLICY "invoices_update_v2" ON public.invoices
  USING (
    (org_id = (SELECT auth_org_id()))
    AND user_has_permission((SELECT auth.uid()), 'invoices:edit'::text)
  );

-- ----- label_templates -----
ALTER POLICY "label_templates_org_access" ON public.label_templates
  USING (org_id = (SELECT auth_org_id()));

-- ----- notifications -----
ALTER POLICY "notifications_select_v2" ON public.notifications
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "notifications_update_v2" ON public.notifications
  USING (user_id = (SELECT auth.uid()));

-- ----- org_settings -----
ALTER POLICY "Users can manage their org settings" ON public.org_settings
  USING (
    org_id IN (
      SELECT users.org_id FROM users WHERE users.id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT users.org_id FROM users WHERE users.id = (SELECT auth.uid())
    )
  );

-- ----- organizations -----
ALTER POLICY "org_select_v2" ON public.organizations
  USING (id = (SELECT auth_org_id()));

ALTER POLICY "org_update_v2" ON public.organizations
  USING ((id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

-- ----- package_photos -----
ALTER POLICY "photos_delete_v2" ON public.package_photos
  USING (
    EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = package_photos.package_id
        AND p.org_id = (SELECT auth_org_id())
        AND ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
    )
  );

ALTER POLICY "photos_insert_v2" ON public.package_photos
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = package_photos.package_id AND p.org_id = (SELECT auth_org_id())
    )
    AND user_has_permission((SELECT auth.uid()), 'packages:edit'::text)
  );

ALTER POLICY "photos_select_v2" ON public.package_photos
  USING (
    EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = package_photos.package_id AND p.org_id = (SELECT auth_org_id())
    )
  );

-- ----- package_statuses -----
ALTER POLICY "package_statuses_delete_v2" ON public.package_statuses
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "package_statuses_insert_v2" ON public.package_statuses
  WITH CHECK ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "package_statuses_select_v2" ON public.package_statuses
  USING (org_id = (SELECT auth_org_id()));

ALTER POLICY "package_statuses_update_v2" ON public.package_statuses
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

-- ----- package_tags -----
ALTER POLICY "package_tags_org_access" ON public.package_tags
  USING (tag_id IN (SELECT tags.id FROM tags WHERE tags.org_id = (SELECT auth_org_id())));

-- ----- packages -----
ALTER POLICY "packages_delete_v2" ON public.packages
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "packages_insert_v2" ON public.packages
  WITH CHECK (
    (org_id = (SELECT auth_org_id()))
    AND user_has_permission((SELECT auth.uid()), 'packages:create'::text)
  );

ALTER POLICY "packages_select_v2" ON public.packages
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      OR (agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())) AS get_accessible_agent_ids))
      OR (agent_id IS NULL)
    )
  );

ALTER POLICY "packages_update_v2" ON public.packages
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      OR (
        (agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())) AS get_accessible_agent_ids))
        AND user_has_permission((SELECT auth.uid()), 'packages:edit'::text)
      )
    )
  );

-- ----- pricing_tier_commodity_rates -----
ALTER POLICY "commodity_rates_delete" ON public.pricing_tier_commodity_rates
  USING (
    EXISTS (
      SELECT 1 FROM pricing_tiers pt
      WHERE pt.id = pricing_tier_commodity_rates.pricing_tier_id
        AND pt.org_id = (SELECT auth_org_id())
        AND ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2]))
    )
  );

ALTER POLICY "commodity_rates_insert" ON public.pricing_tier_commodity_rates
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pricing_tiers pt
      WHERE pt.id = pricing_tier_commodity_rates.pricing_tier_id
        AND pt.org_id = (SELECT auth_org_id())
        AND ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2]))
    )
  );

ALTER POLICY "commodity_rates_select" ON public.pricing_tier_commodity_rates
  USING (
    EXISTS (
      SELECT 1 FROM pricing_tiers pt
      WHERE pt.id = pricing_tier_commodity_rates.pricing_tier_id
        AND pt.org_id = (SELECT auth_org_id())
    )
  );

ALTER POLICY "commodity_rates_update" ON public.pricing_tier_commodity_rates
  USING (
    EXISTS (
      SELECT 1 FROM pricing_tiers pt
      WHERE pt.id = pricing_tier_commodity_rates.pricing_tier_id
        AND pt.org_id = (SELECT auth_org_id())
        AND ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2]))
    )
  );

-- ----- pricing_tiers -----
ALTER POLICY "pricing_tiers_delete" ON public.pricing_tiers
  USING ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "pricing_tiers_insert" ON public.pricing_tiers
  WITH CHECK (
    (org_id = (SELECT auth_org_id()))
    AND ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2]))
  );

ALTER POLICY "pricing_tiers_select" ON public.pricing_tiers
  USING (org_id = (SELECT auth_org_id()));

ALTER POLICY "pricing_tiers_update" ON public.pricing_tiers
  USING (
    (org_id = (SELECT auth_org_id()))
    AND ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2]))
  );

-- ----- role_permissions -----
ALTER POLICY "role_permissions_delete" ON public.role_permissions
  USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_permissions.role_id
        AND r.org_id = (SELECT auth_org_id())
        AND r.is_system = false
        AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
    )
  );

ALTER POLICY "role_permissions_insert" ON public.role_permissions
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_permissions.role_id
        AND r.org_id = (SELECT auth_org_id())
        AND r.is_system = false
        AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
    )
  );

ALTER POLICY "role_permissions_select" ON public.role_permissions
  USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_permissions.role_id AND r.org_id = (SELECT auth_org_id())
    )
  );

-- ----- roles -----
ALTER POLICY "roles_delete" ON public.roles
  USING (
    (org_id = (SELECT auth_org_id()))
    AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
    AND (is_system = false)
  );

ALTER POLICY "roles_insert" ON public.roles
  WITH CHECK (
    (org_id = (SELECT auth_org_id()))
    AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
    AND (is_system = false)
  );

ALTER POLICY "roles_select" ON public.roles
  USING (org_id = (SELECT auth_org_id()));

ALTER POLICY "roles_update" ON public.roles
  USING (
    (org_id = (SELECT auth_org_id()))
    AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
    AND (is_system = false)
  );

-- ----- tags -----
ALTER POLICY "tags_org_access" ON public.tags
  USING (org_id = (SELECT auth_org_id()));

-- ----- user_permissions -----
ALTER POLICY "user_perms_delete_v2" ON public.user_permissions
  USING (
    ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_permissions.user_id AND u.org_id = (SELECT auth_org_id())
    )
  );

ALTER POLICY "user_perms_insert_v2" ON public.user_permissions
  WITH CHECK (
    ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_permissions.user_id AND u.org_id = (SELECT auth_org_id())
    )
  );

ALTER POLICY "user_perms_select_v2" ON public.user_permissions
  USING (
    (user_id = (SELECT auth.uid()))
    OR (
      ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = user_permissions.user_id AND u.org_id = (SELECT auth_org_id())
      )
    )
  );

ALTER POLICY "user_perms_update_v2" ON public.user_permissions
  USING (
    ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_permissions.user_id AND u.org_id = (SELECT auth_org_id())
    )
  );

-- ----- user_shipment_assignments -----
ALTER POLICY "usa_delete_v2" ON public.user_shipment_assignments
  USING (
    ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_shipment_assignments.user_id AND u.org_id = (SELECT auth_org_id())
    )
  );

ALTER POLICY "usa_insert_v2" ON public.user_shipment_assignments
  WITH CHECK (
    ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_shipment_assignments.user_id AND u.org_id = (SELECT auth_org_id())
    )
  );

ALTER POLICY "usa_select_v2" ON public.user_shipment_assignments
  USING (
    (user_id = (SELECT auth.uid()))
    OR (
      ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = user_shipment_assignments.user_id AND u.org_id = (SELECT auth_org_id())
      )
    )
  );

-- ----- users -----
ALTER POLICY "users_insert_v2" ON public.users
  WITH CHECK ((org_id = (SELECT auth_org_id())) AND ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2));

ALTER POLICY "users_select_v2" ON public.users
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))
      OR (agent_id IN (SELECT get_accessible_agent_ids((SELECT auth.uid())) AS get_accessible_agent_ids))
      OR (id = (SELECT auth.uid()))
    )
  );

ALTER POLICY "users_update_v2" ON public.users
  USING (
    (org_id = (SELECT auth_org_id())) AND (
      ((SELECT auth_role_v2()) = 'ORG_ADMIN'::user_role_v2)
      OR (id = (SELECT auth.uid()))
    )
  );

-- ----- warehouse_locations -----
ALTER POLICY "warehouse_locations_org_access" ON public.warehouse_locations
  USING (org_id = (SELECT auth_org_id()));
