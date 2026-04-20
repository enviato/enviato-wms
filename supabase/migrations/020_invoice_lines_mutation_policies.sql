-- 020_invoice_lines_mutation_policies.sql
-- Tier 6 Phase B — F-5 fix
--
-- invoice_lines has SELECT (cascades via invoices RLS) and INSERT (gated on
-- `invoices:create` permission + org match), but NO policy for UPDATE or DELETE.
-- Postgres' default-deny means the UI delete button at
-- src/app/(dashboard)/admin/invoices/[id]/page.tsx:419 silently no-ops: the
-- request returns `{ error: null }` with 0 rows affected, the UI optimistically
-- removes the line locally, and on the next page load the "deleted" line is
-- back. Classic ghost-delete UX bug.
--
-- Design notes:
--
-- 1. Mirror the INSERT policy's shape exactly: org gate via EXISTS through the
--    parent invoice, plus a permission gate. INSERT uses `invoices:create`;
--    UPDATE and DELETE use `invoices:edit` per the audit recommendation.
--
-- 2. No separate CUSTOMER branch here. CUSTOMERs are read-only on invoices and
--    invoice_lines — the 019_customer_read_surface policies only added a SELECT
--    path. Customers hitting DELETE/UPDATE should be denied, and they will be:
--    `user_has_permission(uid, 'invoices:edit')` returns false for CUSTOMER.
--
-- 3. UPDATE's USING clause checks the row BEFORE the update; WITH CHECK validates
--    the row AFTER. Both conditions are the same here because invoice_lines rows
--    don't move across invoices in practice — but enforcing both defends against
--    someone re-parenting a line to an invoice in another org via UPDATE.
--
-- 4. No UI call site currently uses UPDATE on invoice_lines (grep confirmed
--    2026-04-20). Adding the policy pre-emptively so future editing UX doesn't
--    hit the same silent-no-op trap.
--
-- Verification (after apply):
--   * Impersonate an ORG_ADMIN in the invoice's org → DELETE / UPDATE succeeds (1 row).
--   * Impersonate Ana Martinez (CUSTOMER) → DELETE returns 0 rows (policy denies).
--   * Impersonate an ORG_ADMIN in a DIFFERENT org → DELETE returns 0 rows (org gate).

-- ============================================================================
-- invoice_lines_update_v2
-- ============================================================================
DROP POLICY IF EXISTS invoice_lines_update_v2 ON public.invoice_lines;

CREATE POLICY invoice_lines_update_v2 ON public.invoice_lines
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND i.org_id = (SELECT public.auth_org_id())
    )
    AND public.user_has_permission((SELECT auth.uid()), 'invoices:edit')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND i.org_id = (SELECT public.auth_org_id())
    )
    AND public.user_has_permission((SELECT auth.uid()), 'invoices:edit')
  );

-- ============================================================================
-- invoice_lines_delete_v2
-- ============================================================================
DROP POLICY IF EXISTS invoice_lines_delete_v2 ON public.invoice_lines;

CREATE POLICY invoice_lines_delete_v2 ON public.invoice_lines
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND i.org_id = (SELECT public.auth_org_id())
    )
    AND public.user_has_permission((SELECT auth.uid()), 'invoices:edit')
  );
