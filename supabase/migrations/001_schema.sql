-- ============================================================
-- ENVIATO Platform v2.0 — Database Schema
-- Migration 001: Core tables, enums, indexes
-- Target: Supabase (PostgreSQL 15+)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- fuzzy text search for name matching

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
    'org_admin',
    'warehouse_staff',
    'courier_admin',
    'courier_staff',
    'customer'
);

CREATE TYPE package_status AS ENUM (
    'checked_in',
    'assigned_to_awb',
    'in_transit',
    'received_at_dest',
    'delivered',
    'returned',
    'lost'
);

CREATE TYPE package_type AS ENUM (
    'bag', 'box', 'envelope', 'pallet', 'other'
);

CREATE TYPE weight_unit AS ENUM ('lb', 'oz', 'kg');
CREATE TYPE dim_unit AS ENUM ('in', 'cm');

CREATE TYPE photo_type AS ENUM ('label', 'condition', 'content');

CREATE TYPE freight_type AS ENUM ('air', 'ocean');

CREATE TYPE awb_status AS ENUM (
    'packing',
    'shipped',
    'in_transit',
    'arrived',
    'cleared',
    'delivered'
);

CREATE TYPE invoice_status AS ENUM (
    'draft', 'sent', 'paid', 'overdue', 'cancelled'
);

CREATE TYPE pricing_model AS ENUM (
    'gross_weight', 'volume_weight'
);

CREATE TYPE plan_tier AS ENUM (
    'free', 'starter', 'pro', 'enterprise'
);

CREATE TYPE activity_action AS ENUM (
    'checked_in', 'shipped', 'awb_assigned', 'received_at_dest',
    'invoiced', 'reassigned', 'edited', 'deleted', 'photo_added',
    'status_changed', 'customer_matched'
);

CREATE TYPE notification_type AS ENUM (
    'awb_shipped', 'awb_arrived', 'package_received', 'invoice_ready'
);

CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms');

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================

CREATE TABLE organizations (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        text NOT NULL,
    slug        text NOT NULL UNIQUE,
    logo_url    text,
    address     jsonb DEFAULT '{}',
    settings    jsonb DEFAULT '{}',
    plan_tier   plan_tier NOT NULL DEFAULT 'free',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_slug ON organizations(slug);

-- ============================================================
-- 2. USERS (linked to Supabase Auth via auth.users)
-- ============================================================

CREATE TABLE users (
    id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email             text NOT NULL UNIQUE,
    first_name        text NOT NULL DEFAULT '',
    last_name         text NOT NULL DEFAULT '',
    phone             text,
    role              user_role NOT NULL DEFAULT 'customer',
    courier_group_id  uuid,  -- FK added after courier_groups table
    aliases           text[] DEFAULT '{}',
    avatar_url        text,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_courier_group ON users(courier_group_id) WHERE courier_group_id IS NOT NULL;
CREATE INDEX idx_users_email ON users(email);
-- Trigram index for fuzzy name matching during scanning
CREATE INDEX idx_users_name_trgm ON users USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- ============================================================
-- 3. COURIER GROUPS
-- ============================================================

CREATE TABLE courier_groups (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            text NOT NULL,
    code            text NOT NULL,
    country         text,
    contact_email   text,
    contact_phone   text,
    logo_url        text,
    pricing_model   pricing_model NOT NULL DEFAULT 'gross_weight',
    rate_per_lb     decimal(10,2) NOT NULL DEFAULT 0,
    volume_divisor  integer NOT NULL DEFAULT 166,  -- 166 air, 366 ocean
    currency        text NOT NULL DEFAULT 'USD',
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(org_id, code)
);

CREATE INDEX idx_courier_groups_org ON courier_groups(org_id);

-- Now add the FK from users.courier_group_id
ALTER TABLE users
    ADD CONSTRAINT fk_users_courier_group
    FOREIGN KEY (courier_group_id) REFERENCES courier_groups(id) ON DELETE SET NULL;

-- ============================================================
-- 4. PACKAGES
-- ============================================================

CREATE TABLE packages (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    courier_group_id  uuid REFERENCES courier_groups(id) ON DELETE SET NULL,
    customer_id       uuid REFERENCES users(id) ON DELETE SET NULL,
    tracking_number   text NOT NULL,
    carrier           text DEFAULT 'Unknown',
    status            package_status NOT NULL DEFAULT 'checked_in',

    -- Weight
    weight            decimal(10,2),
    weight_unit       weight_unit NOT NULL DEFAULT 'lb',

    -- Dimensions
    length            decimal(10,2),
    width             decimal(10,2),
    height            decimal(10,2),
    dim_unit          dim_unit NOT NULL DEFAULT 'in',

    -- Computed weights (updated by trigger)
    volume_weight     decimal(10,2),
    billable_weight   decimal(10,2),

    package_type      package_type NOT NULL DEFAULT 'bag',
    condition_tags    text[] DEFAULT '{}',
    notes             text,

    -- AWB assignment
    awb_id            uuid,  -- FK added after awbs table

    -- Check-in info
    checked_in_by     uuid REFERENCES users(id) ON DELETE SET NULL,
    checked_in_at     timestamptz NOT NULL DEFAULT now(),

    -- Courier receipt
    received_at_dest  timestamptz,
    received_by       uuid REFERENCES users(id) ON DELETE SET NULL,

    -- Invoice link
    invoice_id        uuid,  -- FK added after invoices table

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    UNIQUE(org_id, tracking_number)
);

CREATE INDEX idx_packages_org ON packages(org_id);
CREATE INDEX idx_packages_courier ON packages(courier_group_id);
CREATE INDEX idx_packages_customer ON packages(customer_id);
CREATE INDEX idx_packages_status ON packages(status);
CREATE INDEX idx_packages_awb ON packages(awb_id) WHERE awb_id IS NOT NULL;
CREATE INDEX idx_packages_tracking ON packages(tracking_number);
CREATE INDEX idx_packages_checked_in ON packages(checked_in_at DESC);

-- ============================================================
-- 5. PACKAGE PHOTOS
-- ============================================================

CREATE TABLE package_photos (
    id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id            uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    cloudinary_url        text NOT NULL,
    cloudinary_public_id  text,
    photo_type            photo_type NOT NULL DEFAULT 'label',
    sort_order            integer NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_photos_package ON package_photos(package_id);

-- ============================================================
-- 6. AWBs (Air Waybills)
-- ============================================================

CREATE TABLE awbs (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    courier_group_id  uuid NOT NULL REFERENCES courier_groups(id) ON DELETE CASCADE,
    awb_number        text NOT NULL,
    freight_type      freight_type NOT NULL DEFAULT 'air',
    airline_or_vessel text,
    origin            text,
    destination       text,
    status            awb_status NOT NULL DEFAULT 'packing',

    -- Piece counts
    total_pieces      integer NOT NULL DEFAULT 0,    -- computed by trigger
    total_weight      decimal(10,2) DEFAULT 0,       -- computed by trigger
    expected_pieces   integer,
    received_pieces   integer NOT NULL DEFAULT 0,    -- computed by trigger

    departure_date    date,
    arrival_date      date,
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    UNIQUE(org_id, awb_number)
);

CREATE INDEX idx_awbs_org ON awbs(org_id);
CREATE INDEX idx_awbs_courier ON awbs(courier_group_id);
CREATE INDEX idx_awbs_status ON awbs(status);

-- Now add FK from packages.awb_id
ALTER TABLE packages
    ADD CONSTRAINT fk_packages_awb
    FOREIGN KEY (awb_id) REFERENCES awbs(id) ON DELETE SET NULL;

-- ============================================================
-- 7. INVOICES
-- ============================================================

CREATE TABLE invoices (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    courier_group_id  uuid NOT NULL REFERENCES courier_groups(id) ON DELETE CASCADE,
    customer_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number    text NOT NULL UNIQUE,
    status            invoice_status NOT NULL DEFAULT 'draft',
    pricing_model     pricing_model NOT NULL,
    rate_per_lb       decimal(10,2) NOT NULL,
    subtotal          decimal(10,2) NOT NULL DEFAULT 0,
    tax_rate          decimal(5,2) DEFAULT 0,
    tax_amount        decimal(10,2) DEFAULT 0,
    total             decimal(10,2) NOT NULL DEFAULT 0,
    currency          text NOT NULL DEFAULT 'USD',
    notes             text,
    due_date          date,
    paid_at           timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_org ON invoices(org_id);
CREATE INDEX idx_invoices_courier ON invoices(courier_group_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- Now add FK from packages.invoice_id
ALTER TABLE packages
    ADD CONSTRAINT fk_packages_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- ============================================================
-- 8. INVOICE LINES
-- ============================================================

CREATE TABLE invoice_lines (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id       uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    package_id       uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    tracking_number  text NOT NULL,
    actual_weight    decimal(10,2),
    volume_weight    decimal(10,2),
    billable_weight  decimal(10,2),
    rate_per_lb      decimal(10,2) NOT NULL,
    line_total       decimal(10,2) NOT NULL DEFAULT 0,
    description      text
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- ============================================================
-- 9. ACTIVITY LOG (immutable audit trail)
-- ============================================================

CREATE TABLE activity_log (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id  uuid REFERENCES packages(id) ON DELETE SET NULL,
    awb_id      uuid REFERENCES awbs(id) ON DELETE SET NULL,
    user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
    action      activity_action NOT NULL,
    metadata    jsonb DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_org ON activity_log(org_id);
CREATE INDEX idx_activity_package ON activity_log(package_id) WHERE package_id IS NOT NULL;
CREATE INDEX idx_activity_awb ON activity_log(awb_id) WHERE awb_id IS NOT NULL;
CREATE INDEX idx_activity_created ON activity_log(created_at DESC);

-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        notification_type NOT NULL,
    channel     notification_channel NOT NULL DEFAULT 'push',
    title       text NOT NULL,
    body        text,
    metadata    jsonb DEFAULT '{}',
    read_at     timestamptz,
    sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update timestamps)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_courier_groups_updated BEFORE UPDATE ON courier_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_packages_updated BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_awbs_updated BEFORE UPDATE ON awbs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
