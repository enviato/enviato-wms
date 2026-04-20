-- 019_customer_read_surface.sql
-- Tier 6 Phase 10B — F-4 fix
--
-- Adds the missing CUSTOMER read branch to packages, invoices, and awbs SELECT policies.
-- Without this, recipients (role_v2='CUSTOMER') see zero rows on any of these tables —
-- the HP5 anomaly. This was the highest-impact remaining gap in Tier 6 RLS coverage.
--
-- Design notes:
--
-- 1. CUSTOMER is scoped DIRECTLY via `customer_id = auth.uid()`, not via the agent
--    helper `get_accessible_agent_ids()`. The agent helper has no CUSTOMER branch by
--    design — customers are 2-party participants, not nodes in the agent tree.
--
-- 2. invoice_lines and package_photos already cascade through their parent table's
--    SELECT policy via EXISTS subqueries. So extending packages and invoices is
--    enough — no separate policy changes needed for lines or photos.
--
-- 3. The new branch is gated on `auth_role_v2() = 'CUSTOMER'` so it can't be hit
--    accidentally by other roles. (Defense in depth — agent_id and customer_id are
--    different UUID spaces in practice, but the role gate is cheap insurance.)
--
-- 4. customers_v2 is intentionally OUT of scope here (§6 Q5 still open: should
--    customers_v2.id == users.id?). Will be addressed in a later migration once that
--    product question is resolved.
--
-- 5. INSERT/UPDATE/DELETE for CUSTOMER not added — customers are read-only on these
--    tables. Mutations happen via app routes that use the service role.
--
-- Prereq: 021_role_v2_backfill must have run first so the 10 legacy NULL users
-- have role_v2='CUSTOMER' set.
--
-- Verification (after apply):
--   * Impersonate a CUSTOMER user (e.g. Ana Martinez, ENV-00003).
--   * SELECT * FROM packages → should return only rows where customer_id = Ana's id.
--   * SELECT * FROM invoices → should return only rows where customer_id = Ana's id.
--   * SELECT * FROM awbs → should return only AWBs that have at least one package
--     belonging to Ana.
--   * SELECT * FROM invoice_lines → should cascade and only show lines on Ana's invoices.
--   * SELECT * FROM package_photos → should cascade and only show photos on Ana's packages.

-- ============================================================================
-- packages_select_v2
-- ============================================================================
DROP POLICY IF EXISTS packages_select_v2 ON public.packages;

CREATE POLICY packages_select_v2 ON public.packages
  FOR SELECT
  TO authenticated
  USING (
    -- ORG/AGENT branch — preserved EXACTLY from prior policy (017_packages_unassigned_role_gate).
    (
      org_id = (SELECT public.auth_org_id())
      AND (
        (SELECT public.auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::public.user_role_v2, 'WAREHOUSE_STAFF'::public.user_role_v2])
        OR agent_id IN (SELECT public.get_accessible_agent_ids((SELECT auth.uid())))
      )
    )
    -- NEW: CUSTOMER branch — recipient sees their own packages only.
    OR (
      (SELECT public.auth_role_v2()) = 'CUSTOMER'::public.user_role_v2
      AND customer_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- invoices_select_v2
-- ============================================================================
DROP POLICY IF EXISTS invoices_select_v2 ON public.invoices;

CREATE POLICY invoices_select_v2 ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    -- ORG/AGENT 2-party branches — preserved EXACTLY from prior policy.
    (
      org_id = (SELECT public.auth_org_id())
      AND (
        (SELECT public.auth_role_v2()) = 'ORG_ADMIN'::public.user_role_v2
        OR billed_by_agent_id IN (SELECT public.get_accessible_agent_ids((SELECT auth.uid())))
        OR billed_to_agent_id IN (SELECT public.get_accessible_agent_ids((SELECT auth.uid())))
        OR (
          billed_by_agent_id IS NULL
          AND (SELECT public.auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::public.user_role_v2, 'WAREHOUSE_STAFF'::public.user_role_v2])
        )
      )
    )
    -- NEW: CUSTOMER branch — recipient sees invoices issued to them directly.
    OR (
      (SELECT public.auth_role_v2()) = 'CUSTOMER'::public.user_role_v2
      AND customer_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- awbs_select_v2
-- ============================================================================
DROP POLICY IF EXISTS awbs_select_v2 ON public.awbs;

CREATE POLICY awbs_select_v2 ON public.awbs
  FOR SELECT
  TO authenticated
  USING (
    -- ORG/AGENT/AGENT_STAFF branches — preserved EXACTLY from prior policy.
    (
      org_id = (SELECT public.auth_org_id())
      AND (
        (SELECT public.auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::public.user_role_v2, 'WAREHOUSE_STAFF'::public.user_role_v2])
        OR agent_id IN (SELECT public.get_accessible_agent_ids((SELECT auth.uid())))
        OR (
          (SELECT public.auth_role_v2()) = 'AGENT_STAFF'::public.user_role_v2
          AND id IN (SELECT shipment_id FROM public.user_shipment_assignments WHERE user_id = (SELECT auth.uid()))
        )
      )
    )
    -- NEW: CUSTOMER branch — recipient sees AWBs that carry at least one of their packages.
    -- AWBs are shared infrastructure (multiple packages per AWB), but the awb row itself
    -- only contains awb_number/agent_id/org_id — no per-customer data leaks.
    OR (
      (SELECT public.auth_role_v2()) = 'CUSTOMER'::public.user_role_v2
      AND EXISTS (
        SELECT 1 FROM public.packages p
        WHERE p.awb_id = awbs.id
          AND p.customer_id = (SELECT auth.uid())
      )
    )
  );
