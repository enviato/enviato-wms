-- ============================================================
-- ENVIATO Platform v2.0 — Row Level Security Policies
-- Migration 002: RLS on all tables, tenant isolation
-- ============================================================
-- Helper: extract org_id and role from JWT claims
-- Supabase Auth stores custom claims in raw_app_meta_data

-- ============================================================
-- HELPER FUNCTIONS for RLS
-- ============================================================

-- Get the authenticated user's org_id from the users table
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS uuid AS $$
    SELECT org_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the authenticated user's role
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role AS $$
    SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the authenticated user's courier_group_id (null for non-courier roles)
CREATE OR REPLACE FUNCTION auth_courier_group_id()
RETURNS uuid AS $$
    SELECT courier_group_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own organization
CREATE POLICY org_select ON organizations FOR SELECT
    USING (id = auth_org_id());

-- Only org_admin can update their org
CREATE POLICY org_update ON organizations FOR UPDATE
    USING (id = auth_org_id() AND auth_role() = 'org_admin');

-- ============================================================
-- USERS
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- org_admin: sees all users in their org
-- courier_admin: sees users in their courier group + customers
-- courier_staff: sees users in their courier group
-- warehouse_staff: sees all users in their org (for name matching)
-- customer: sees only themselves
CREATE POLICY users_select ON users FOR SELECT
    USING (
        org_id = auth_org_id()
        AND (
            auth_role() IN ('org_admin', 'warehouse_staff')
            OR (auth_role() = 'courier_admin' AND (
                courier_group_id = auth_courier_group_id()
                OR role = 'customer'
            ))
            OR (auth_role() = 'courier_staff' AND courier_group_id = auth_courier_group_id())
            OR id = auth.uid()  -- everyone can see themselves
        )
    );

-- org_admin can insert/update any user in their org
CREATE POLICY users_insert ON users FOR INSERT
    WITH CHECK (
        org_id = auth_org_id()
        AND auth_role() IN ('org_admin')
    );

CREATE POLICY users_update ON users FOR UPDATE
    USING (
        org_id = auth_org_id()
        AND (
            auth_role() = 'org_admin'
            OR (auth_role() = 'courier_admin' AND courier_group_id = auth_courier_group_id())
            OR id = auth.uid()  -- users can update their own profile
        )
    );

-- ============================================================
-- COURIER GROUPS
-- ============================================================
ALTER TABLE courier_groups ENABLE ROW LEVEL SECURITY;

-- Everyone in the org can see courier groups (needed for scanning dropdown)
CREATE POLICY courier_groups_select ON courier_groups FOR SELECT
    USING (org_id = auth_org_id());

-- Only org_admin can create/update courier groups
CREATE POLICY courier_groups_insert ON courier_groups FOR INSERT
    WITH CHECK (org_id = auth_org_id() AND auth_role() = 'org_admin');

CREATE POLICY courier_groups_update ON courier_groups FOR UPDATE
    USING (org_id = auth_org_id() AND auth_role() = 'org_admin');

-- ============================================================
-- PACKAGES
-- ============================================================
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- org_admin + warehouse_staff: all packages in org
-- courier_admin + courier_staff: packages in their courier group
-- customer: only their own packages
CREATE POLICY packages_select ON packages FOR SELECT
    USING (
        org_id = auth_org_id()
        AND (
            auth_role() IN ('org_admin', 'warehouse_staff')
            OR (auth_role() IN ('courier_admin', 'courier_staff')
                AND courier_group_id = auth_courier_group_id())
            OR (auth_role() = 'customer' AND customer_id = auth.uid())
        )
    );

-- Warehouse roles can insert packages (scanning)
CREATE POLICY packages_insert ON packages FOR INSERT
    WITH CHECK (
        org_id = auth_org_id()
        AND auth_role() IN ('org_admin', 'warehouse_staff')
    );

-- org_admin can update any package; warehouse_staff limited updates
-- courier_staff can update received_at_dest (verification scanning)
CREATE POLICY packages_update ON packages FOR UPDATE
    USING (
        org_id = auth_org_id()
        AND (
            auth_role() = 'org_admin'
            OR auth_role() = 'warehouse_staff'
            OR (auth_role() IN ('courier_admin', 'courier_staff')
                AND courier_group_id = auth_courier_group_id())
        )
    );

-- Only org_admin can delete packages
CREATE POLICY packages_delete ON packages FOR DELETE
    USING (org_id = auth_org_id() AND auth_role() = 'org_admin');

-- ============================================================
-- PACKAGE PHOTOS
-- ============================================================
ALTER TABLE package_photos ENABLE ROW LEVEL SECURITY;

-- Photos visible to anyone who can see the parent package
CREATE POLICY photos_select ON package_photos FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM packages p
            WHERE p.id = package_photos.package_id
            -- RLS on packages already filters by org/role
        )
    );

-- Warehouse roles can add photos
CREATE POLICY photos_insert ON package_photos FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM packages p
            WHERE p.id = package_photos.package_id
            AND p.org_id = auth_org_id()
            AND auth_role() IN ('org_admin', 'warehouse_staff')
        )
    );

-- ============================================================
-- AWBs
-- ============================================================
ALTER TABLE awbs ENABLE ROW LEVEL SECURITY;

-- org_admin + warehouse: all AWBs
-- courier roles: only their group's AWBs
-- customer: AWBs containing their packages
CREATE POLICY awbs_select ON awbs FOR SELECT
    USING (
        org_id = auth_org_id()
        AND (
            auth_role() IN ('org_admin', 'warehouse_staff')
            OR (auth_role() IN ('courier_admin', 'courier_staff')
                AND courier_group_id = auth_courier_group_id())
            OR (auth_role() = 'customer' AND EXISTS (
                SELECT 1 FROM packages p
                WHERE p.awb_id = awbs.id AND p.customer_id = auth.uid()
            ))
        )
    );

-- Only warehouse roles create AWBs
CREATE POLICY awbs_insert ON awbs FOR INSERT
    WITH CHECK (
        org_id = auth_org_id()
        AND auth_role() IN ('org_admin', 'warehouse_staff')
    );

-- Warehouse can update AWBs; courier_admin can update status (for verification)
CREATE POLICY awbs_update ON awbs FOR UPDATE
    USING (
        org_id = auth_org_id()
        AND (
            auth_role() IN ('org_admin', 'warehouse_staff')
            OR (auth_role() = 'courier_admin'
                AND courier_group_id = auth_courier_group_id())
        )
    );

-- ============================================================
-- INVOICES
-- ============================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- org_admin: all invoices; courier_admin: own group; customer: own invoices
CREATE POLICY invoices_select ON invoices FOR SELECT
    USING (
        org_id = auth_org_id()
        AND (
            auth_role() = 'org_admin'
            OR (auth_role() = 'courier_admin'
                AND courier_group_id = auth_courier_group_id())
            OR (auth_role() = 'customer' AND customer_id = auth.uid())
        )
    );

-- Courier admin generates invoices
CREATE POLICY invoices_insert ON invoices FOR INSERT
    WITH CHECK (
        org_id = auth_org_id()
        AND auth_role() IN ('org_admin', 'courier_admin')
    );

CREATE POLICY invoices_update ON invoices FOR UPDATE
    USING (
        org_id = auth_org_id()
        AND auth_role() IN ('org_admin', 'courier_admin')
    );

-- ============================================================
-- INVOICE LINES
-- ============================================================
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

-- Same visibility as parent invoice
CREATE POLICY invoice_lines_select ON invoice_lines FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.id = invoice_lines.invoice_id
        )
    );

CREATE POLICY invoice_lines_insert ON invoice_lines FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.id = invoice_lines.invoice_id
            AND i.org_id = auth_org_id()
            AND auth_role() IN ('org_admin', 'courier_admin')
        )
    );

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- org_admin sees all; others see activity for packages they can access
CREATE POLICY activity_select ON activity_log FOR SELECT
    USING (
        org_id = auth_org_id()
        AND (
            auth_role() IN ('org_admin', 'warehouse_staff')
            OR (package_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM packages p WHERE p.id = activity_log.package_id
            ))
        )
    );

-- Insert: any authenticated user in the org (system logs actions)
CREATE POLICY activity_insert ON activity_log FOR INSERT
    WITH CHECK (org_id = auth_org_id());

-- Activity log is IMMUTABLE — no update or delete policies

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users see only their own notifications
CREATE POLICY notifications_select ON notifications FOR SELECT
    USING (user_id = auth.uid());

-- System inserts (via service role), users can update read_at
CREATE POLICY notifications_update ON notifications FOR UPDATE
    USING (user_id = auth.uid());
