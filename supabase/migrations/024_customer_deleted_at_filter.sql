-- 024_customer_deleted_at_filter.sql
-- Tier 6 follow-up to F-11 (INFO in audit, escalated in practice).
--
-- Context:
--   Audit Test 3 (2026-04-19) observed AGENT_STAFF seeing 2 soft-deleted rows —
--   classified as INFO because ORG/AGENT admin UIs legitimately need tombstone
--   visibility (see src/modules/settings/trash/TrashSettings.tsx — it queries
--   8 tables with `.not("deleted_at", "is", null)` on the authenticated client,
--   so RLS MUST continue to pass soft-deleted rows through for those roles).
--
--   At audit time the CUSTOMER branch didn't exist yet — customers saw 0 rows
--   of packages/invoices/awbs because 019_customer_read_surface.sql hadn't
--   shipped. Once 019 opened that read surface, the tombstone behavior became
--   a real leak for the CUSTOMER path specifically:
--     - 1 soft-deleted package has customer_id set
--     - 2 soft-deleted invoices have customer_id set
--   Verified via live DB query pre-apply (2026-04-20).
--
--   There's no customer-facing UI today (only src/app/(dashboard)/admin and
--   .../courier route groups exist), but CUSTOMER role_v2 users CAN authenticate
--   and hit the Supabase JS client directly. RLS is the only gate. Filtering
--   deleted_at at the policy level is the right closure — it's defense in
--   depth that matches the untrusted-consumer posture for CUSTOMER.
--
-- Design notes:
--   1. SCOPE LIMITED TO CUSTOMER BRANCH. Do NOT touch ORG_ADMIN / WAREHOUSE_STAFF
--      / AGENT_* branches. TrashSettings.tsx uses the authenticated client
--      (not service-role) and depends on RLS returning soft-deleted rows for
--      those roles. Any filter added to those branches would silently break
--      the Trash admin UI.
--   2. packages/invoices get a straight AND deleted_at IS NULL on the row itself.
--   3. awbs gets TWO filters:
--        - awbs.deleted_at IS NULL on the awb row itself
--        - p.deleted_at IS NULL inside the EXISTS subquery against packages
--      The second is important: without it, a tombstoned package could keep its
--      parent AWB visible to the CUSTOMER.
--   4. invoice_lines and package_photos have NO deleted_at column (verified via
--      information_schema), and already cascade through their parent's SELECT
--      policy. Filtering parent (invoices/packages) is sufficient.
--
-- Post-apply verification:
--   Impersonate a CUSTOMER with a soft-deleted package/invoice and confirm
--   they're no longer visible. Re-run Phase D F-4 test (which currently allows
--   soft-deleted in its ground truth) after flipping it back to
--   deleted_at IS NULL form.

BEGIN;

-- ============================================================================
-- packages_select_v2
-- Identical to 019's policy, with AND deleted_at IS NULL added to the CUSTOMER
-- branch only. ORG/AGENT branch preserved byte-for-byte.
-- ============================================================================
DROP POLICY IF EXISTS packages_select_v2 ON public.packages;

CREATE POLICY packages_select_v2 ON public.packages
  FOR SELECT
  TO authenticated
  USING (
    -- ORG/AGENT branch — preserved EXACTLY from 019 (which preserved from 017).
    -- DO NOT filter deleted_at here: TrashSettings depends on it.
    (
      org_id = (SELECT public.auth_org_id())
      AND (
        (SELECT public.auth_role_v2()) = ANY (ARRAY['ORG_ADMIN'::public.user_role_v2, 'WAREHOUSE_STAFF'::public.user_role_v2])
        OR agent_id IN (SELECT public.get_accessible_agent_ids((SELECT auth.uid())))
      )
    )
    -- CUSTOMER branch — recipient sees their own NON-DELETED packages only.
    OR (
      (SELECT public.auth_role_v2()) = 'CUSTOMER'::public.user_role_v2
      AND customer_id = (SELECT auth.uid())
      AND deleted_at IS NULL
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
    -- ORG/AGENT 2-party branches — preserved EXACTLY from 019.
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
    -- CUSTOMER branch — recipient sees invoices issued to them (non-deleted only).
    OR (
      (SELECT public.auth_role_v2()) = 'CUSTOMER'::public.user_role_v2
      AND customer_id = (SELECT auth.uid())
      AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- awbs_select_v2
-- Two filters for CUSTOMER:
--   * awbs.deleted_at IS NULL on the awb row
--   * p.deleted_at IS NULL inside the EXISTS subquery (so tombstoned packages
--     don't keep an AWB visible)
-- ============================================================================
DROP POLICY IF EXISTS awbs_select_v2 ON public.awbs;

CREATE POLICY awbs_select_v2 ON public.awbs
  FOR SELECT
  TO authenticated
  USING (
    -- ORG/AGENT/AGENT_STAFF branches — preserved EXACTLY from 019.
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
    -- CUSTOMER branch — recipient sees non-deleted AWBs that carry at least one
    -- of their non-deleted packages.
    OR (
      (SELECT public.auth_role_v2()) = 'CUSTOMER'::public.user_role_v2
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.packages p
        WHERE p.awb_id = awbs.id
          AND p.customer_id = (SELECT auth.uid())
          AND p.deleted_at IS NULL
      )
    )
  );

COMMIT;
