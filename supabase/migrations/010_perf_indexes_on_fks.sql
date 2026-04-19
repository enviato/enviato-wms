-- ============================================================
-- 010: Performance — indexes on 21 unindexed foreign keys
-- ============================================================
-- Flagged by Supabase's performance advisor on 2026-04-19.
-- Unindexed FKs force sequential scans on joins and cascade deletes.
-- This migration has no application-layer effects; it purely
-- accelerates joins and RLS subqueries across the app.
-- Already applied to prod via apply_migration on 2026-04-19.
-- ============================================================

-- Hot path: invoice detail pages join packages via invoice_id
CREATE INDEX IF NOT EXISTS idx_packages_invoice_id
  ON public.packages (invoice_id);

-- Hot path: invoice_lines joins back to packages
CREATE INDEX IF NOT EXISTS idx_invoice_lines_package_id
  ON public.invoice_lines (package_id);

-- Hot path: activity log queries by user
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id
  ON public.activity_log (user_id);

-- Hot path: package tags lookup
CREATE INDEX IF NOT EXISTS idx_package_tags_tag_id
  ON public.package_tags (tag_id);

-- Hot path: warehouse_locations by customer
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_customer_id
  ON public.warehouse_locations (customer_id);

-- Tenant scoping
CREATE INDEX IF NOT EXISTS idx_label_templates_org_id
  ON public.label_templates (org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org_id
  ON public.notifications (org_id);

-- Audit / soft-delete columns (checked when filtering out deleted
-- rows or when cascades need to find referencing rows). Partial
-- indexes keep them tiny since deleted_by is NULL for live rows.
CREATE INDEX IF NOT EXISTS idx_awbs_deleted_by
  ON public.awbs (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_courier_groups_deleted_by
  ON public.courier_groups (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_by
  ON public.invoices (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_package_statuses_deleted_by
  ON public.package_statuses (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packages_deleted_by
  ON public.packages (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tags_deleted_by
  ON public.tags (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_by
  ON public.users (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_deleted_by
  ON public.warehouse_locations (deleted_by) WHERE deleted_by IS NOT NULL;

-- Actor / assignee FKs
CREATE INDEX IF NOT EXISTS idx_packages_checked_in_by
  ON public.packages (checked_in_by) WHERE checked_in_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packages_received_by
  ON public.packages (received_by) WHERE received_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_settings_updated_by
  ON public.org_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_user_permissions_created_by
  ON public.user_permissions (created_by);
CREATE INDEX IF NOT EXISTS idx_user_shipment_assignments_assigned_by
  ON public.user_shipment_assignments (assigned_by);

-- Lookup key
CREATE INDEX IF NOT EXISTS idx_role_permission_defaults_permission_key
  ON public.role_permission_defaults (permission_key);

-- Refresh planner statistics so the new indexes get used immediately
ANALYZE public.packages;
ANALYZE public.invoice_lines;
ANALYZE public.activity_log;
ANALYZE public.package_tags;
ANALYZE public.warehouse_locations;
