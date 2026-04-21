-- supabase/_ci_baseline.sql
--
-- Schema snapshot of the ENVIATO prod database, reconstructed via Supabase
-- MCP introspection on 2026-04-21. Applied by
-- .github/workflows/rls-tests.yml in place of `supabase db reset` because
-- the migrations under supabase/migrations/ no longer fresh-replay (they
-- were augmented with out-of-band Supabase Studio edits that are not
-- captured anywhere else).
--
-- Reflects state at migration 024 (see _ci_baseline.cutoff). Any migration
-- with a version number > the cutoff is layered on top by the CI workflow
-- after this baseline applies.
--
-- See tests/rls/README.md "Snapshot regeneration" section for the recipe
-- to regenerate this file. This file is meant to be applied to a freshly
-- booted Supabase Postgres (which already provides the auth schema +
-- auth.uid()/auth.jwt() helpers + role grants).
--
-- Section order:
--   1. Extensions
--   2. Enum types
--   3. Sequences
--   4. Tables (columns + PK + UNIQUE + CHECK; FKs added separately)
--   5. Foreign key constraints
--   6. Indexes
--   7. Functions
--   8. Triggers
--   9. Row Level Security toggles
--  10. Policies

SET client_min_messages = warning;

-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- 2. ENUM TYPES
-- =============================================================================

CREATE TYPE public.activity_action AS ENUM ('checked_in', 'shipped', 'awb_assigned', 'received_at_dest', 'invoiced', 'reassigned', 'edited', 'deleted', 'photo_added', 'status_changed', 'customer_matched', 'photo_removed');
CREATE TYPE public.awb_status AS ENUM ('packing', 'shipped', 'in_transit', 'arrived', 'cleared', 'delivered');
CREATE TYPE public.dim_unit AS ENUM ('in', 'cm');
CREATE TYPE public.freight_type AS ENUM ('air', 'ocean');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.notification_channel AS ENUM ('push', 'email', 'sms');
CREATE TYPE public.notification_type AS ENUM ('awb_shipped', 'awb_arrived', 'package_received', 'invoice_ready');
CREATE TYPE public.package_type AS ENUM ('bag', 'box', 'envelope', 'pallet', 'other');
CREATE TYPE public.photo_type AS ENUM ('label', 'condition', 'content');
CREATE TYPE public.plan_tier AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE public.pricing_model AS ENUM ('gross_weight', 'volume_weight');
CREATE TYPE public.pricing_tier_type AS ENUM ('retail', 'commercial', 'agent');
CREATE TYPE public.user_role AS ENUM ('org_admin', 'warehouse_staff', 'courier_admin', 'courier_staff', 'customer');
CREATE TYPE public.user_role_v2 AS ENUM ('ORG_ADMIN', 'WAREHOUSE_STAFF', 'AGENT_ADMIN', 'AGENT_STAFF', 'CUSTOMER');
CREATE TYPE public.weight_unit AS ENUM ('lb', 'oz', 'kg');

-- =============================================================================
-- 3. SEQUENCES
-- =============================================================================

CREATE SEQUENCE public.invoice_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

-- =============================================================================
-- 4. TABLES
-- =============================================================================

CREATE TABLE public.organizations (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    address jsonb DEFAULT '{}'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    plan_tier plan_tier NOT NULL DEFAULT 'free'::plan_tier,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    logo_icon_url text,
    CONSTRAINT organizations_pkey PRIMARY KEY (id),
    CONSTRAINT organizations_slug_key UNIQUE (slug)
);

CREATE TABLE public.agents (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    company_name text,
    first_name text,
    last_name text,
    email text,
    website text,
    phone text,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    country text DEFAULT 'US'::text,
    zip_code text,
    agent_code text,
    deleted_at timestamp with time zone,
    CONSTRAINT agents_pkey PRIMARY KEY (id),
    CONSTRAINT agents_org_id_name_key UNIQUE (org_id, name)
);

CREATE TABLE public.agent_closure (
    org_id uuid NOT NULL,
    ancestor_id uuid NOT NULL,
    descendant_id uuid NOT NULL,
    depth integer NOT NULL DEFAULT 0,
    CONSTRAINT agent_closure_pkey PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE TABLE public.agent_edges (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    parent_agent_id uuid NOT NULL,
    child_agent_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT agent_edges_pkey PRIMARY KEY (id),
    CONSTRAINT agent_edges_check CHECK ((parent_agent_id <> child_agent_id)),
    CONSTRAINT agent_edges_org_id_parent_agent_id_child_agent_id_key UNIQUE (org_id, parent_agent_id, child_agent_id)
);

CREATE TABLE public.courier_groups (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    country text,
    contact_email text,
    contact_phone text,
    logo_url text,
    pricing_model pricing_model NOT NULL DEFAULT 'gross_weight'::pricing_model,
    rate_per_lb numeric(10,2) NOT NULL DEFAULT 0,
    volume_divisor integer NOT NULL DEFAULT 166,
    currency text NOT NULL DEFAULT 'USD'::text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by uuid,
    type text NOT NULL DEFAULT 'shipping'::text,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    zip_code text,
    CONSTRAINT courier_groups_pkey PRIMARY KEY (id),
    CONSTRAINT courier_groups_org_id_code_key UNIQUE (org_id, code)
);

CREATE TABLE public.pricing_tiers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    tier_type pricing_tier_type NOT NULL DEFAULT 'retail'::pricing_tier_type,
    base_rate_per_lb numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD'::text,
    delivery_fee numeric DEFAULT 0,
    hazmat_fee numeric DEFAULT 0,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pricing_tiers_pkey PRIMARY KEY (id),
    CONSTRAINT pricing_tiers_org_id_name_key UNIQUE (org_id, name),
    CONSTRAINT pricing_tiers_base_rate_nonneg CHECK ((base_rate_per_lb >= (0)::numeric)),
    CONSTRAINT pricing_tiers_delivery_fee_nonneg CHECK ((delivery_fee >= (0)::numeric)),
    CONSTRAINT pricing_tiers_hazmat_fee_nonneg CHECK ((hazmat_fee >= (0)::numeric)),
    CONSTRAINT pricing_tiers_tier_type_check CHECK ((tier_type = ANY (ARRAY['retail'::pricing_tier_type, 'commercial'::pricing_tier_type, 'agent'::pricing_tier_type])))
);

CREATE TABLE public.pricing_tier_commodity_rates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    pricing_tier_id uuid NOT NULL,
    commodity_name text NOT NULL,
    rate_per_lb numeric NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pricing_tier_commodity_rates_pkey PRIMARY KEY (id),
    CONSTRAINT pricing_tier_commodity_rates_pricing_tier_id_commodity_name_key UNIQUE (pricing_tier_id, commodity_name),
    CONSTRAINT pricing_tier_commodity_rates_rate_nonneg CHECK ((rate_per_lb >= (0)::numeric))
);

CREATE TABLE public.roles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    base_role user_role_v2 NOT NULL,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT roles_pkey PRIMARY KEY (id),
    CONSTRAINT roles_org_id_name_key UNIQUE (org_id, name)
);

CREATE TABLE public.users (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    email text NOT NULL,
    first_name text NOT NULL DEFAULT ''::text,
    last_name text NOT NULL DEFAULT ''::text,
    phone text,
    role user_role NOT NULL DEFAULT 'customer'::user_role,
    courier_group_id uuid,
    aliases text[] DEFAULT '{}'::text[],
    avatar_url text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    agent_id uuid,
    role_v2 user_role_v2 NOT NULL,
    role_id uuid,
    customer_number text,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    pricing_tier_id uuid,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
);

CREATE TABLE public.permission_keys (
    id text NOT NULL,
    category text NOT NULL,
    description text,
    is_hard_constraint boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT permission_keys_pkey PRIMARY KEY (id)
);

CREATE TABLE public.role_permissions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    role_id uuid NOT NULL,
    permission_key text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT role_permissions_pkey PRIMARY KEY (id),
    CONSTRAINT role_permissions_role_id_permission_key_key UNIQUE (role_id, permission_key)
);

CREATE TABLE public.role_permission_defaults (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    role user_role_v2 NOT NULL,
    permission_key text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT role_permission_defaults_pkey PRIMARY KEY (id),
    CONSTRAINT role_permission_defaults_role_permission_key_key UNIQUE (role, permission_key)
);

CREATE TABLE public.user_permissions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    permission_key text NOT NULL,
    granted boolean NOT NULL,
    expires_at timestamp with time zone,
    reason text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_permissions_pkey PRIMARY KEY (id),
    CONSTRAINT user_permissions_user_id_permission_key_key UNIQUE (user_id, permission_key)
);

CREATE TABLE public.customers_v2 (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    owner_agent_id uuid NOT NULL,
    linked_agent_id uuid,
    first_name text NOT NULL DEFAULT ''::text,
    last_name text NOT NULL DEFAULT ''::text,
    email text,
    phone text,
    customer_type text NOT NULL DEFAULT 'END_CUSTOMER'::text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    pricing_tier_id uuid,
    CONSTRAINT customers_v2_pkey PRIMARY KEY (id),
    CONSTRAINT customers_v2_customer_type_check CHECK ((customer_type = ANY (ARRAY['END_CUSTOMER'::text, 'SUB_AGENT'::text])))
);

CREATE TABLE public.awbs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL,
    courier_group_id uuid NOT NULL,
    awb_number text NOT NULL,
    freight_type freight_type NOT NULL DEFAULT 'air'::freight_type,
    airline_or_vessel text,
    origin text,
    destination text,
    status awb_status NOT NULL DEFAULT 'packing'::awb_status,
    total_pieces integer NOT NULL DEFAULT 0,
    total_weight numeric(10,2) DEFAULT 0,
    expected_pieces integer,
    received_pieces integer NOT NULL DEFAULT 0,
    departure_date date,
    arrival_date date,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    agent_id uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT awbs_pkey PRIMARY KEY (id),
    CONSTRAINT awbs_org_id_awb_number_key UNIQUE (org_id, awb_number)
);

CREATE TABLE public.invoices (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL,
    courier_group_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    invoice_number text NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft'::invoice_status,
    pricing_model pricing_model NOT NULL,
    rate_per_lb numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL DEFAULT 0,
    tax_rate numeric(5,2) DEFAULT 0,
    tax_amount numeric(10,2) DEFAULT 0,
    total numeric(10,2) NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD'::text,
    notes text,
    due_date date,
    paid_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    invoice_type text DEFAULT 'STANDARD'::text,
    billed_by_agent_id uuid,
    billed_to_agent_id uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    payment_terms text NOT NULL DEFAULT 'due_on_receipt'::text,
    CONSTRAINT invoices_pkey PRIMARY KEY (id),
    CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number)
);

CREATE TABLE public.packages (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL,
    courier_group_id uuid,
    customer_id uuid,
    tracking_number text NOT NULL,
    carrier text DEFAULT 'Unknown'::text,
    status text NOT NULL DEFAULT 'checked_in'::text,
    weight numeric(10,2),
    weight_unit weight_unit NOT NULL DEFAULT 'lb'::weight_unit,
    length numeric(10,2),
    width numeric(10,2),
    height numeric(10,2),
    dim_unit dim_unit NOT NULL DEFAULT 'in'::dim_unit,
    volume_weight numeric(10,2),
    billable_weight numeric(10,2),
    package_type package_type NOT NULL DEFAULT 'bag'::package_type,
    condition_tags text[] DEFAULT '{}'::text[],
    notes text,
    awb_id uuid,
    checked_in_by uuid,
    checked_in_at timestamp with time zone NOT NULL DEFAULT now(),
    received_at_dest timestamp with time zone,
    received_by uuid,
    invoice_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    agent_id uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    commodity text,
    CONSTRAINT packages_pkey PRIMARY KEY (id),
    CONSTRAINT packages_org_id_tracking_number_key UNIQUE (org_id, tracking_number)
);

CREATE TABLE public.invoice_lines (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    invoice_id uuid NOT NULL,
    package_id uuid,
    tracking_number text,
    actual_weight numeric(10,2),
    volume_weight numeric(10,2),
    billable_weight numeric(10,2),
    rate_per_lb numeric(10,2),
    line_total numeric(10,2) NOT NULL DEFAULT 0,
    description text,
    charge_type text NOT NULL DEFAULT 'package'::text,
    CONSTRAINT invoice_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.activity_log (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL,
    package_id uuid,
    awb_id uuid,
    user_id uuid,
    action activity_action NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT activity_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tags (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6b6b6b'::text,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT tags_pkey PRIMARY KEY (id),
    CONSTRAINT tags_org_id_name_key UNIQUE (org_id, name)
);

CREATE TABLE public.package_tags (
    package_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    CONSTRAINT package_tags_pkey PRIMARY KEY (package_id, tag_id)
);

CREATE TABLE public.package_photos (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    package_id uuid NOT NULL,
    storage_url text NOT NULL,
    storage_path text,
    photo_type photo_type NOT NULL DEFAULT 'label'::photo_type,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT package_photos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.package_statuses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    name text NOT NULL,
    slug text NOT NULL,
    color text NOT NULL DEFAULT '#6b7280'::text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT package_statuses_pkey PRIMARY KEY (id),
    CONSTRAINT package_statuses_org_id_slug_key UNIQUE (org_id, slug)
);

CREATE TABLE public.org_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid,
    CONSTRAINT org_settings_pkey PRIMARY KEY (id),
    CONSTRAINT org_settings_org_id_key_key UNIQUE (org_id, key)
);

CREATE TABLE public.label_templates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    name text NOT NULL DEFAULT 'Default'::text,
    fields jsonb NOT NULL DEFAULT '["courier_group_name", "customer_name", "package_id", "tracking_number", "dimensions", "volume_weight"]'::jsonb,
    paper_size text DEFAULT '4x6'::text,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    label_size jsonb DEFAULT '{"width": 100, "height": 60}'::jsonb,
    CONSTRAINT label_templates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.warehouse_locations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    customer_id uuid,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT warehouse_locations_pkey PRIMARY KEY (id),
    CONSTRAINT warehouse_locations_org_id_code_key UNIQUE (org_id, code)
);

CREATE TABLE public.notifications (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type notification_type NOT NULL,
    channel notification_channel NOT NULL DEFAULT 'push'::notification_channel,
    title text NOT NULL,
    body text,
    metadata jsonb DEFAULT '{}'::jsonb,
    read_at timestamp with time zone,
    sent_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_shipment_assignments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    shipment_id uuid NOT NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    assigned_by uuid,
    CONSTRAINT user_shipment_assignments_pkey PRIMARY KEY (id),
    CONSTRAINT user_shipment_assignments_user_id_shipment_id_key UNIQUE (user_id, shipment_id)
);

-- =============================================================================
-- 5. FOREIGN KEY CONSTRAINTS
-- =============================================================================
-- (added separately so table order during CREATE doesn't have to be topological)

ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_awb_id_fkey FOREIGN KEY (awb_id) REFERENCES awbs(id) ON DELETE SET NULL;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_package_id_fkey FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public.agent_closure ADD CONSTRAINT agent_closure_ancestor_id_fkey FOREIGN KEY (ancestor_id) REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE public.agent_closure ADD CONSTRAINT agent_closure_descendant_id_fkey FOREIGN KEY (descendant_id) REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE public.agent_closure ADD CONSTRAINT agent_closure_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.agent_edges ADD CONSTRAINT agent_edges_child_agent_id_fkey FOREIGN KEY (child_agent_id) REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE public.agent_edges ADD CONSTRAINT agent_edges_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.agent_edges ADD CONSTRAINT agent_edges_parent_agent_id_fkey FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE CASCADE;

ALTER TABLE public.agents ADD CONSTRAINT agents_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.awbs ADD CONSTRAINT awbs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE public.awbs ADD CONSTRAINT awbs_courier_group_id_fkey FOREIGN KEY (courier_group_id) REFERENCES courier_groups(id) ON DELETE CASCADE;
ALTER TABLE public.awbs ADD CONSTRAINT awbs_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.awbs ADD CONSTRAINT awbs_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.courier_groups ADD CONSTRAINT courier_groups_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.courier_groups ADD CONSTRAINT courier_groups_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.customers_v2 ADD CONSTRAINT customers_v2_linked_agent_id_fkey FOREIGN KEY (linked_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE public.customers_v2 ADD CONSTRAINT customers_v2_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.customers_v2 ADD CONSTRAINT customers_v2_owner_agent_id_fkey FOREIGN KEY (owner_agent_id) REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE public.customers_v2 ADD CONSTRAINT customers_v2_pricing_tier_id_fkey FOREIGN KEY (pricing_tier_id) REFERENCES pricing_tiers(id);

ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_package_id_fkey FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_billed_by_agent_id_fkey FOREIGN KEY (billed_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_billed_to_agent_id_fkey FOREIGN KEY (billed_to_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_courier_group_id_fkey FOREIGN KEY (courier_group_id) REFERENCES courier_groups(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.label_templates ADD CONSTRAINT label_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE public.notifications ADD CONSTRAINT notifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE public.org_settings ADD CONSTRAINT org_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.org_settings ADD CONSTRAINT org_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE public.package_photos ADD CONSTRAINT package_photos_package_id_fkey FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE;

ALTER TABLE public.package_statuses ADD CONSTRAINT package_statuses_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.package_statuses ADD CONSTRAINT package_statuses_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE public.package_tags ADD CONSTRAINT package_tags_package_id_fkey FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE;
ALTER TABLE public.package_tags ADD CONSTRAINT package_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

ALTER TABLE public.packages ADD CONSTRAINT fk_packages_awb FOREIGN KEY (awb_id) REFERENCES awbs(id) ON DELETE SET NULL;
ALTER TABLE public.packages ADD CONSTRAINT fk_packages_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE public.packages ADD CONSTRAINT packages_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE public.packages ADD CONSTRAINT packages_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.packages ADD CONSTRAINT packages_courier_group_id_fkey FOREIGN KEY (courier_group_id) REFERENCES courier_groups(id) ON DELETE SET NULL;
ALTER TABLE public.packages ADD CONSTRAINT packages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.packages ADD CONSTRAINT packages_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.packages ADD CONSTRAINT packages_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.packages ADD CONSTRAINT packages_received_by_fkey FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public.pricing_tier_commodity_rates ADD CONSTRAINT pricing_tier_commodity_rates_pricing_tier_id_fkey FOREIGN KEY (pricing_tier_id) REFERENCES pricing_tiers(id) ON DELETE CASCADE;

ALTER TABLE public.pricing_tiers ADD CONSTRAINT pricing_tiers_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE public.role_permission_defaults ADD CONSTRAINT role_permission_defaults_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES permission_keys(id) ON DELETE CASCADE;

ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES permission_keys(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

ALTER TABLE public.roles ADD CONSTRAINT roles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.tags ADD CONSTRAINT tags_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.tags ADD CONSTRAINT tags_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES permission_keys(id) ON DELETE CASCADE;
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE public.user_shipment_assignments ADD CONSTRAINT user_shipment_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.user_shipment_assignments ADD CONSTRAINT user_shipment_assignments_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES awbs(id) ON DELETE CASCADE;
ALTER TABLE public.user_shipment_assignments ADD CONSTRAINT user_shipment_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE public.users ADD CONSTRAINT fk_users_courier_group FOREIGN KEY (courier_group_id) REFERENCES courier_groups(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD CONSTRAINT users_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD CONSTRAINT users_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.users ADD CONSTRAINT users_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_pricing_tier_id_fkey FOREIGN KEY (pricing_tier_id) REFERENCES pricing_tiers(id);
ALTER TABLE public.users ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;

ALTER TABLE public.warehouse_locations ADD CONSTRAINT warehouse_locations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id);
ALTER TABLE public.warehouse_locations ADD CONSTRAINT warehouse_locations_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.warehouse_locations ADD CONSTRAINT warehouse_locations_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- =============================================================================
-- 6. INDEXES
-- =============================================================================
-- (PK and UNIQUE indexes are created automatically by their constraints; only
-- non-constraint indexes are recreated here)

CREATE INDEX idx_activity_awb ON public.activity_log USING btree (awb_id) WHERE (awb_id IS NOT NULL);
CREATE INDEX idx_activity_created ON public.activity_log USING btree (created_at DESC);
CREATE INDEX idx_activity_log_user_id ON public.activity_log USING btree (user_id);
CREATE INDEX idx_activity_org ON public.activity_log USING btree (org_id);
CREATE INDEX idx_activity_package ON public.activity_log USING btree (package_id) WHERE (package_id IS NOT NULL);
CREATE INDEX idx_activity_package_created ON public.activity_log USING btree (package_id, created_at DESC) WHERE (package_id IS NOT NULL);

CREATE INDEX idx_agent_closure_ancestor ON public.agent_closure USING btree (ancestor_id);
CREATE INDEX idx_agent_closure_descendant ON public.agent_closure USING btree (descendant_id);
CREATE INDEX idx_agent_closure_org ON public.agent_closure USING btree (org_id);

CREATE UNIQUE INDEX idx_agent_edges_child_unique ON public.agent_edges USING btree (child_agent_id);
CREATE INDEX idx_agent_edges_parent ON public.agent_edges USING btree (parent_agent_id);

CREATE UNIQUE INDEX idx_agents_agent_code ON public.agents USING btree (agent_code) WHERE (agent_code IS NOT NULL);
CREATE INDEX idx_agents_org ON public.agents USING btree (org_id);
CREATE INDEX idx_agents_status ON public.agents USING btree (org_id, status);

CREATE INDEX idx_awbs_agent ON public.awbs USING btree (agent_id) WHERE (agent_id IS NOT NULL);
CREATE INDEX idx_awbs_awb_number_trgm ON public.awbs USING gin (awb_number gin_trgm_ops);
CREATE INDEX idx_awbs_courier ON public.awbs USING btree (courier_group_id);
CREATE INDEX idx_awbs_deleted_at ON public.awbs USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_awbs_deleted_by ON public.awbs USING btree (deleted_by) WHERE (deleted_by IS NOT NULL);
CREATE INDEX idx_awbs_org ON public.awbs USING btree (org_id);
CREATE INDEX idx_awbs_org_created_active ON public.awbs USING btree (org_id, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_awbs_org_status_created_active ON public.awbs USING btree (org_id, status, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_awbs_status ON public.awbs USING btree (status);

CREATE INDEX idx_courier_groups_deleted_at ON public.courier_groups USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_courier_groups_deleted_by ON public.courier_groups USING btree (deleted_by) WHERE (deleted_by IS NOT NULL);
CREATE INDEX idx_courier_groups_org ON public.courier_groups USING btree (org_id);

CREATE INDEX idx_customers_v2_linked_agent ON public.customers_v2 USING btree (linked_agent_id) WHERE (linked_agent_id IS NOT NULL);
CREATE INDEX idx_customers_v2_org ON public.customers_v2 USING btree (org_id);
CREATE INDEX idx_customers_v2_owner_agent ON public.customers_v2 USING btree (owner_agent_id);
CREATE INDEX idx_customers_v2_tier ON public.customers_v2 USING btree (pricing_tier_id);
CREATE INDEX idx_customers_v2_type ON public.customers_v2 USING btree (customer_type);

CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines USING btree (invoice_id);
CREATE INDEX idx_invoice_lines_package_id ON public.invoice_lines USING btree (package_id);

CREATE INDEX idx_invoices_billed_by ON public.invoices USING btree (billed_by_agent_id) WHERE (billed_by_agent_id IS NOT NULL);
CREATE INDEX idx_invoices_billed_by_agent_id ON public.invoices USING btree (billed_by_agent_id);
CREATE INDEX idx_invoices_billed_to ON public.invoices USING btree (billed_to_agent_id) WHERE (billed_to_agent_id IS NOT NULL);
CREATE INDEX idx_invoices_courier ON public.invoices USING btree (courier_group_id);
CREATE INDEX idx_invoices_customer ON public.invoices USING btree (customer_id);
CREATE INDEX idx_invoices_customer_created_active ON public.invoices USING btree (customer_id, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_invoices_deleted_at ON public.invoices USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_invoices_deleted_by ON public.invoices USING btree (deleted_by) WHERE (deleted_by IS NOT NULL);
CREATE INDEX idx_invoices_invoice_number_trgm ON public.invoices USING gin (invoice_number gin_trgm_ops);
CREATE INDEX idx_invoices_org ON public.invoices USING btree (org_id);
CREATE INDEX idx_invoices_org_created_active ON public.invoices USING btree (org_id, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);
CREATE INDEX idx_invoices_type ON public.invoices USING btree (invoice_type);

CREATE INDEX idx_label_templates_org_id ON public.label_templates USING btree (org_id);

CREATE INDEX idx_notifications_org_id ON public.notifications USING btree (org_id);
CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);

CREATE INDEX idx_org_settings_updated_by ON public.org_settings USING btree (updated_by);

CREATE INDEX idx_photos_package ON public.package_photos USING btree (package_id);

CREATE INDEX idx_package_statuses_deleted_at ON public.package_statuses USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_package_statuses_deleted_by ON public.package_statuses USING btree (deleted_by) WHERE (deleted_by IS NOT NULL);

CREATE INDEX idx_package_tags_tag_id ON public.package_tags USING btree (tag_id);

CREATE INDEX idx_packages_agent ON public.packages USING btree (agent_id) WHERE (agent_id IS NOT NULL);
CREATE INDEX idx_packages_awb ON public.packages USING btree (awb_id) WHERE (awb_id IS NOT NULL);
CREATE INDEX idx_packages_checked_in ON public.packages USING btree (checked_in_at DESC);
CREATE INDEX idx_packages_checked_in_by ON public.packages USING btree (checked_in_by) WHERE (checked_in_by IS NOT NULL);
CREATE INDEX idx_packages_courier ON public.packages USING btree (courier_group_id);
CREATE INDEX idx_packages_customer ON public.packages USING btree (customer_id);
CREATE INDEX idx_packages_customer_checked_in_active ON public.packages USING btree (customer_id, checked_in_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_packages_deleted_at ON public.packages USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_packages_deleted_by ON public.packages USING btree (deleted_by) WHERE (deleted_by IS NOT NULL);
CREATE INDEX idx_packages_invoice_id ON public.packages USING btree (invoice_id);
CREATE INDEX idx_packages_org ON public.packages USING btree (org_id);
CREATE INDEX idx_packages_org_checked_in_active ON public.packages USING btree (org_id, checked_in_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_packages_org_status_checked_in_active ON public.packages USING btree (org_id, status, checked_in_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_packages_received_by ON public.packages USING btree (received_by) WHERE (received_by IS NOT NULL);
CREATE INDEX idx_packages_status ON public.packages USING btree (status);
CREATE INDEX idx_packages_tracking ON public.packages USING btree (tracking_number);
CREATE INDEX idx_packages_tracking_number_trgm ON public.packages USING gin (tracking_number gin_trgm_ops);

CREATE INDEX idx_commodity_rates_tier ON public.pricing_tier_commodity_rates USING btree (pricing_tier_id);

CREATE UNIQUE INDEX idx_pricing_tiers_one_default_per_org ON public.pricing_tiers USING btree (org_id) WHERE (is_default = true);
CREATE INDEX idx_pricing_tiers_org ON public.pricing_tiers USING btree (org_id);
CREATE INDEX idx_pricing_tiers_type ON public.pricing_tiers USING btree (org_id, tier_type);

CREATE INDEX idx_role_permission_defaults_permission_key ON public.role_permission_defaults USING btree (permission_key);

CREATE INDEX idx_role_permissions_key ON public.role_permissions USING btree (permission_key);
CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role_id);

CREATE INDEX idx_roles_base_role ON public.roles USING btree (base_role);
CREATE INDEX idx_roles_org ON public.roles USING btree (org_id);

CREATE INDEX idx_tags_deleted_at ON public.tags USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_tags_deleted_by ON public.tags USING btree (deleted_by) WHERE (deleted_by IS NOT NULL);

CREATE INDEX idx_user_permissions_created_by ON public.user_permissions USING btree (created_by);
CREATE INDEX idx_user_permissions_key ON public.user_permissions USING btree (permission_key);
CREATE INDEX idx_user_permissions_user ON public.user_permissions USING btree (user_id);

CREATE INDEX idx_usa_shipment ON public.user_shipment_assignments USING btree (shipment_id);
CREATE INDEX idx_usa_user ON public.user_shipment_assignments USING btree (user_id);
CREATE INDEX idx_user_shipment_assignments_assigned_by ON public.user_shipment_assignments USING btree (assigned_by);

CREATE INDEX idx_users_agent ON public.users USING btree (agent_id) WHERE (agent_id IS NOT NULL);
CREATE INDEX idx_users_courier_group ON public.users USING btree (courier_group_id) WHERE (courier_group_id IS NOT NULL);
CREATE UNIQUE INDEX idx_users_customer_number_org ON public.users USING btree (org_id, customer_number) WHERE (customer_number IS NOT NULL);
CREATE INDEX idx_users_customer_number_trgm ON public.users USING gin (customer_number gin_trgm_ops) WHERE (customer_number IS NOT NULL);
CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_users_deleted_by ON public.users USING btree (deleted_by) WHERE (deleted_by IS NOT NULL);
CREATE INDEX idx_users_email_trgm ON public.users USING gin (email gin_trgm_ops);
CREATE INDEX idx_users_first_name_trgm ON public.users USING gin (first_name gin_trgm_ops);
CREATE INDEX idx_users_last_name_trgm ON public.users USING gin (last_name gin_trgm_ops);
CREATE INDEX idx_users_name_trgm ON public.users USING gin ((((first_name || ' '::text) || last_name)) gin_trgm_ops);
CREATE INDEX idx_users_org ON public.users USING btree (org_id);
CREATE INDEX idx_users_org_role_active ON public.users USING btree (org_id, role) WHERE (deleted_at IS NULL);
CREATE INDEX idx_users_org_role_v2_active ON public.users USING btree (org_id, role_v2) WHERE (deleted_at IS NULL);
CREATE INDEX idx_users_role ON public.users USING btree (role);
CREATE INDEX idx_users_role_id ON public.users USING btree (role_id);
CREATE INDEX idx_users_role_v2 ON public.users USING btree (role_v2);
CREATE INDEX idx_users_tier ON public.users USING btree (pricing_tier_id);

CREATE INDEX idx_warehouse_locations_customer_id ON public.warehouse_locations USING btree (customer_id);
CREATE INDEX idx_warehouse_locations_deleted_at ON public.warehouse_locations USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_warehouse_locations_deleted_by ON public.warehouse_locations USING btree (deleted_by) WHERE (deleted_by IS NOT NULL);

-- =============================================================================
-- 7. FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auth_agent_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT agent_id FROM public.users WHERE id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.auth_courier_group_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT courier_group_id FROM users WHERE id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.auth_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    (SELECT org_id FROM public.users WHERE id = auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT role FROM users WHERE id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.auth_role_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'role_id', '')::uuid,
    (SELECT role_id FROM public.users WHERE id = auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_role_v2()
 RETURNS user_role_v2
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'role_v2', '')::public.user_role_v2,
    (SELECT role_v2 FROM public.users WHERE id = auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.compute_invoice_line()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only auto-compute line_total for package lines (weight × rate)
    -- For flat, per_lb (manual), and percent charges, preserve the line_total as-is
    IF NEW.charge_type = 'package' AND NEW.billable_weight IS NOT NULL AND NEW.rate_per_lb IS NOT NULL THEN
        NEW.line_total := ROUND(NEW.billable_weight * NEW.rate_per_lb, 2);
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_package_weights()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    divisor integer;
    vol_weight decimal(10,2);
BEGIN
    IF NEW.length IS NOT NULL AND NEW.width IS NOT NULL AND NEW.height IS NOT NULL
       AND NEW.length > 0 AND NEW.width > 0 AND NEW.height > 0 THEN
        SELECT COALESCE(cg.volume_divisor, 166) INTO divisor
        FROM courier_groups cg WHERE cg.id = NEW.courier_group_id;
        IF divisor IS NULL THEN divisor := 166; END IF;
        IF NEW.dim_unit = 'cm' THEN
            vol_weight := (NEW.length / 2.54) * (NEW.width / 2.54) * (NEW.height / 2.54) / divisor;
        ELSE
            vol_weight := NEW.length * NEW.width * NEW.height / divisor;
        END IF;
        NEW.volume_weight := ROUND(vol_weight, 2);
        IF NEW.weight IS NOT NULL AND NEW.weight > 0 THEN
            IF NEW.weight_unit = 'kg' THEN
                NEW.billable_weight := GREATEST(NEW.weight * 2.20462, NEW.volume_weight);
            ELSIF NEW.weight_unit = 'oz' THEN
                NEW.billable_weight := GREATEST(NEW.weight / 16.0, NEW.volume_weight);
            ELSE
                NEW.billable_weight := GREATEST(NEW.weight, NEW.volume_weight);
            END IF;
            NEW.billable_weight := ROUND(NEW.billable_weight, 2);
        ELSE
            NEW.billable_weight := NEW.volume_weight;
        END IF;
    ELSIF NEW.weight IS NOT NULL AND NEW.weight > 0 THEN
        IF NEW.weight_unit = 'kg' THEN
            NEW.billable_weight := ROUND(NEW.weight * 2.20462, 2);
        ELSIF NEW.weight_unit = 'oz' THEN
            NEW.billable_weight := ROUND(NEW.weight / 16.0, 2);
        ELSE
            NEW.billable_weight := NEW.weight;
        END IF;
        NEW.volume_weight := NULL;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  claims jsonb;
  existing_app_meta jsonb;
  user_record record;
BEGIN
  SELECT u.role_v2,
         u.role_id,
         u.org_id,
         u.role
    INTO user_record
    FROM public.users u
   WHERE u.id = (event ->> 'user_id')::uuid
     AND u.deleted_at IS NULL;

  claims := event -> 'claims';
  existing_app_meta := COALESCE(claims -> 'app_metadata', '{}'::jsonb);

  IF user_record IS NOT NULL THEN
    existing_app_meta := existing_app_meta || jsonb_build_object(
      'role_v2',     user_record.role_v2,
      'role_id',     user_record.role_id,
      'org_id',      user_record.org_id,
      'legacy_role', user_record.role
    );
    claims := jsonb_set(claims, '{app_metadata}', existing_app_meta);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_customer_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  next_num integer;
  prefix text;
BEGIN
  -- Only generate for customer role users
  IF NEW.role = 'customer' AND NEW.customer_number IS NULL THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN customer_number ~ '^\w+-\d+$'
        THEN CAST(SUBSTRING(customer_number FROM '\d+$') AS integer)
        ELSE 0
      END
    ), 0) + 1
    INTO next_num
    FROM public.users
    WHERE org_id = NEW.org_id AND customer_number IS NOT NULL;

    -- Get org prefix (first 3 chars of org name, fallback to ENV)
    SELECT COALESCE(UPPER(LEFT(name, 3)), 'ENV') INTO prefix
    FROM public.organizations WHERE id = NEW.org_id;

    NEW.customer_number := prefix || '-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_courier_group_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    courier_code text;
    seq_val integer;
BEGIN
    SELECT code INTO courier_code FROM courier_groups WHERE id = p_courier_group_id;
    seq_val := nextval('invoice_seq');
    RETURN courier_code || '-' || EXTRACT(YEAR FROM now())::text || '-' || LPAD(seq_val::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_accessible_agent_ids(p_user_id uuid)
 RETURNS TABLE(agent_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role_v2;
    v_agent_id uuid;
    v_org_id uuid;
BEGIN
    SELECT role_v2, users.agent_id, org_id
    INTO v_role, v_agent_id, v_org_id
    FROM public.users WHERE id = p_user_id;

    -- ORG_ADMIN and WAREHOUSE_STAFF see all agents in org
    IF v_role IN ('ORG_ADMIN', 'WAREHOUSE_STAFF') THEN
        RETURN QUERY
        SELECT a.id FROM public.agents a
        WHERE a.org_id = v_org_id;
        RETURN;
    END IF;

    -- AGENT_ADMIN sees own agent + all descendants
    IF v_role = 'AGENT_ADMIN' AND v_agent_id IS NOT NULL THEN
        RETURN QUERY
        SELECT ac.descendant_id
        FROM public.agent_closure ac
        WHERE ac.ancestor_id = v_agent_id;
        RETURN;
    END IF;

    -- AGENT_STAFF sees only own agent
    IF v_role = 'AGENT_STAFF' AND v_agent_id IS NOT NULL THEN
        RETURN QUERY
        SELECT v_agent_id;
        RETURN;
    END IF;

    -- Fallback: return nothing
    RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_permissions(p_user_id uuid)
 RETURNS TABLE(permission_key text, granted boolean, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role_v2;
BEGIN
    SELECT role_v2 INTO v_role FROM public.users WHERE id = p_user_id;

    RETURN QUERY
    SELECT
        pk.id AS permission_key,
        CASE
            -- Explicit user override
            WHEN up.granted IS NOT NULL THEN
                CASE
                    WHEN pk.is_hard_constraint AND v_role != 'ORG_ADMIN' AND up.granted = true
                    THEN false  -- hard constraint blocks grant
                    ELSE up.granted
                END
            -- Role default
            WHEN rpd.role IS NOT NULL THEN true
            -- No permission
            ELSE false
        END AS granted,
        CASE
            WHEN up.granted IS NOT NULL THEN 'override'
            WHEN rpd.role IS NOT NULL THEN 'role_default'
            ELSE 'denied'
        END AS source
    FROM public.permission_keys pk
    LEFT JOIN public.user_permissions up
        ON up.permission_key = pk.id
        AND up.user_id = p_user_id
        AND (up.expires_at IS NULL OR up.expires_at > now())
    LEFT JOIN public.role_permission_defaults rpd
        ON rpd.permission_key = pk.id
        AND rpd.role = v_role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    meta jsonb;
    v_org_id uuid;
    v_role user_role;
    v_role_v2 user_role_v2;
    v_courier_group_id uuid;
BEGIN
    meta := NEW.raw_user_meta_data;

    v_org_id := (meta->>'org_id')::uuid;
    v_role := COALESCE((meta->>'role')::user_role, 'customer');
    v_courier_group_id := (meta->>'courier_group_id')::uuid;

    v_role_v2 := COALESCE(
      (meta->>'role_v2')::user_role_v2,
      CASE v_role
        WHEN 'org_admin'       THEN 'ORG_ADMIN'::user_role_v2
        WHEN 'warehouse_staff' THEN 'WAREHOUSE_STAFF'::user_role_v2
        WHEN 'courier_admin'   THEN 'AGENT_ADMIN'::user_role_v2
        WHEN 'courier_staff'   THEN 'AGENT_STAFF'::user_role_v2
        WHEN 'customer'        THEN 'CUSTOMER'::user_role_v2
        ELSE NULL
      END
    );

    IF v_org_id IS NOT NULL THEN
        IF v_role_v2 IS NULL THEN
          RAISE EXCEPTION
            'handle_new_user(): could not derive role_v2 for new auth user % (legacy role=%). Supply user_metadata.role_v2 explicitly.',
            NEW.id, v_role;
        END IF;

        INSERT INTO users (id, org_id, email, first_name, last_name, role, role_v2, courier_group_id)
        VALUES (
            NEW.id,
            v_org_id,
            NEW.email,
            COALESCE(meta->>'first_name', ''),
            COALESCE(meta->>'last_name', ''),
            v_role,
            v_role_v2,
            v_courier_group_id
        );
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maintain_agent_closure_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM agent_closure;

  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT org_id, parent_agent_id, child_agent_id, 1
  FROM agent_edges;

  LOOP
    INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
    SELECT DISTINCT ae.org_id, ac.ancestor_id, ae.child_agent_id, ac.depth + 1
    FROM agent_closure ac
    JOIN agent_edges ae ON ae.parent_agent_id = ac.descendant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_closure ex
      WHERE ex.ancestor_id = ac.ancestor_id
        AND ex.descendant_id = ae.child_agent_id
    );

    IF NOT FOUND THEN EXIT; END IF;
  END LOOP;

  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maintain_agent_closure_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := NEW.org_id;

  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  VALUES (v_org_id, NEW.parent_agent_id, NEW.child_agent_id, 1)
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT v_org_id, ac.ancestor_id, NEW.child_agent_id, ac.depth + 1
  FROM agent_closure ac
  WHERE ac.descendant_id = NEW.parent_agent_id
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT v_org_id, NEW.parent_agent_id, ac.descendant_id, ac.depth + 1
  FROM agent_closure ac
  WHERE ac.ancestor_id = NEW.child_agent_id
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT v_org_id, p.ancestor_id, c.descendant_id, p.depth + c.depth + 1
  FROM agent_closure p, agent_closure c
  WHERE p.descendant_id = NEW.parent_agent_id
    AND c.ancestor_id = NEW.child_agent_id
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.match_customer_by_name(p_org_id uuid, p_name text, p_courier_group_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, full_name text, similarity_score real, courier_group_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        (u.first_name || ' ' || u.last_name)::text,
        similarity(p_name, u.first_name || ' ' || u.last_name),
        u.courier_group_id
    FROM users u
    WHERE u.org_id = p_org_id
      AND u.role = 'customer'
      AND u.is_active = true
      AND (p_courier_group_id IS NULL OR u.courier_group_id = p_courier_group_id)
      AND (
          similarity(p_name, u.first_name || ' ' || u.last_name) > 0.3
          OR p_name ILIKE '%' || u.first_name || '%'
          OR p_name ILIKE '%' || u.last_name || '%'
          OR EXISTS (
              SELECT 1 FROM unnest(u.aliases) alias
              WHERE similarity(p_name, alias) > 0.3
                 OR p_name ILIKE '%' || alias || '%'
          )
      )
    ORDER BY similarity(p_name, u.first_name || ' ' || u.last_name) DESC
    LIMIT 5;
END;
$function$;

CREATE OR REPLACE FUNCTION public.on_agent_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Every agent is its own ancestor at depth 0
    INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
    VALUES (NEW.org_id, NEW.id, NEW.id, 0)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rebuild_agent_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_org_id := NEW.org_id;

        -- Insert all new ancestor-descendant paths:
        -- For every ancestor of the parent, create path to every descendant of child
        INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
        SELECT
            v_org_id,
            a.ancestor_id,
            d.descendant_id,
            a.depth + d.depth + 1
        FROM agent_closure a
        CROSS JOIN agent_closure d
        WHERE a.descendant_id = NEW.parent_agent_id
          AND d.ancestor_id = NEW.child_agent_id
        ON CONFLICT (ancestor_id, descendant_id)
        DO UPDATE SET depth = EXCLUDED.depth;

        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        v_org_id := OLD.org_id;

        -- Remove all paths that go through this edge:
        -- Delete where ancestor is an ancestor of parent AND descendant is a descendant of child
        -- But keep reflexive (depth=0) entries
        DELETE FROM agent_closure
        WHERE ancestor_id IN (
            SELECT ancestor_id FROM agent_closure WHERE descendant_id = OLD.parent_agent_id
        )
        AND descendant_id IN (
            SELECT descendant_id FROM agent_closure WHERE ancestor_id = OLD.child_agent_id
        )
        AND depth > 0
        -- Only delete paths that actually go through this edge
        AND NOT (ancestor_id = descendant_id);

        -- Rebuild: re-insert valid paths from remaining edges
        -- This handles the case where there are alternative paths
        INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
        WITH RECURSIVE paths AS (
            -- Base: reflexive entries
            SELECT org_id, id AS ancestor_id, id AS descendant_id, 0 AS depth
            FROM agents WHERE org_id = v_org_id
            UNION ALL
            -- Recursive: follow edges
            SELECT e.org_id, p.ancestor_id, e.child_agent_id, p.depth + 1
            FROM paths p
            JOIN agent_edges e ON e.parent_agent_id = p.descendant_id
            WHERE e.org_id = v_org_id
        )
        SELECT DISTINCT org_id, ancestor_id, descendant_id, depth
        FROM paths
        ON CONFLICT (ancestor_id, descendant_id)
        DO UPDATE SET depth = LEAST(agent_closure.depth, EXCLUDED.depth);

        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_pricing_tiers_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlink_agent(p_parent_id uuid, p_child_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Temporarily disable triggers to avoid conflicting closure rebuilds
  ALTER TABLE agent_edges DISABLE TRIGGER trg_rebuild_closure;
  ALTER TABLE agent_edges DISABLE TRIGGER trg_agent_closure_insert;

  -- Delete the edge
  DELETE FROM agent_edges
  WHERE parent_agent_id = p_parent_id
    AND child_agent_id = p_child_id;

  -- Re-enable triggers
  ALTER TABLE agent_edges ENABLE TRIGGER trg_rebuild_closure;
  ALTER TABLE agent_edges ENABLE TRIGGER trg_agent_closure_insert;

  -- Manually rebuild closure table from scratch
  DELETE FROM agent_closure WHERE depth > 0;

  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT org_id, parent_agent_id, child_agent_id, 1
  FROM agent_edges
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  -- Iteratively add transitive closure
  LOOP
    INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
    SELECT DISTINCT ae.org_id, ac.ancestor_id, ae.child_agent_id, ac.depth + 1
    FROM agent_closure ac
    JOIN agent_edges ae ON ae.parent_agent_id = ac.descendant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_closure ex
      WHERE ex.ancestor_id = ac.ancestor_id
        AND ex.descendant_id = ae.child_agent_id
    );
    IF NOT FOUND THEN EXIT; END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_awb_counters()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    target_awb_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_awb_id := OLD.awb_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.awb_id IS DISTINCT FROM NEW.awb_id THEN
            IF OLD.awb_id IS NOT NULL THEN
                UPDATE awbs SET
                    total_pieces = (SELECT COUNT(*) FROM packages WHERE awb_id = OLD.awb_id),
                    total_weight = (SELECT COALESCE(SUM(CASE weight_unit WHEN 'kg' THEN weight * 2.20462 WHEN 'oz' THEN weight / 16.0 ELSE COALESCE(weight, 0) END), 0) FROM packages WHERE awb_id = OLD.awb_id),
                    received_pieces = (SELECT COUNT(*) FROM packages WHERE awb_id = OLD.awb_id AND received_at_dest IS NOT NULL)
                WHERE id = OLD.awb_id;
            END IF;
            target_awb_id := NEW.awb_id;
        ELSE
            target_awb_id := NEW.awb_id;
        END IF;
    ELSE
        target_awb_id := NEW.awb_id;
    END IF;
    IF target_awb_id IS NOT NULL THEN
        UPDATE awbs SET
            total_pieces = (SELECT COUNT(*) FROM packages WHERE awb_id = target_awb_id),
            total_weight = (SELECT COALESCE(SUM(CASE weight_unit WHEN 'kg' THEN weight * 2.20462 WHEN 'oz' THEN weight / 16.0 ELSE COALESCE(weight, 0) END), 0) FROM packages WHERE awb_id = target_awb_id),
            received_pieces = (SELECT COUNT(*) FROM packages WHERE awb_id = target_awb_id AND received_at_dest IS NOT NULL)
        WHERE id = target_awb_id;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_invoice_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    target_invoice_id uuid;
    new_subtotal decimal(10,2);
BEGIN
    IF TG_OP = 'DELETE' THEN target_invoice_id := OLD.invoice_id;
    ELSE target_invoice_id := NEW.invoice_id; END IF;
    SELECT COALESCE(SUM(line_total), 0) INTO new_subtotal
    FROM invoice_lines WHERE invoice_id = target_invoice_id;
    UPDATE invoices SET
        subtotal = new_subtotal,
        tax_amount = ROUND(new_subtotal * COALESCE(tax_rate, 0) / 100, 2),
        total = new_subtotal + ROUND(new_subtotal * COALESCE(tax_rate, 0) / 100, 2)
    WHERE id = target_invoice_id;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role_v2;
    v_user_override boolean;
    v_is_hard boolean;
    v_role_has_default boolean;
BEGIN
    -- Get user's role
    SELECT role_v2 INTO v_role
    FROM public.users WHERE id = p_user_id;

    -- If no role_v2 set, deny
    IF v_role IS NULL THEN
        RETURN false;
    END IF;

    -- 1. Check explicit user override (highest priority)
    SELECT granted INTO v_user_override
    FROM public.user_permissions
    WHERE user_id = p_user_id
      AND permission_key = p_permission_key
      AND (expires_at IS NULL OR expires_at > now());

    IF FOUND THEN
        -- Hard constraint check: non-ORG_ADMIN cannot be granted hard-constrained permissions
        SELECT is_hard_constraint INTO v_is_hard
        FROM public.permission_keys WHERE id = p_permission_key;

        IF v_is_hard AND v_role != 'ORG_ADMIN' AND v_user_override = true THEN
            RETURN false;  -- Hard deny: cannot override hard constraints for non-admins
        END IF;

        RETURN v_user_override;
    END IF;

    -- 2. Check role default
    SELECT true INTO v_role_has_default
    FROM public.role_permission_defaults
    WHERE role = v_role AND permission_key = p_permission_key;

    IF FOUND THEN
        RETURN true;
    END IF;

    -- 3. Default: deny
    RETURN false;
END;
$function$;

-- =============================================================================
-- 8. TRIGGERS
-- =============================================================================

CREATE TRIGGER trg_agent_closure_insert AFTER INSERT ON public.agent_edges FOR EACH ROW EXECUTE FUNCTION maintain_agent_closure_insert();
CREATE TRIGGER trg_rebuild_closure AFTER INSERT OR DELETE ON public.agent_edges FOR EACH ROW EXECUTE FUNCTION rebuild_agent_closure();

CREATE TRIGGER trg_agent_created AFTER INSERT ON public.agents FOR EACH ROW EXECUTE FUNCTION on_agent_created();
CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_awbs_updated BEFORE UPDATE ON public.awbs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_courier_groups_updated BEFORE UPDATE ON public.courier_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customers_v2_updated BEFORE UPDATE ON public.customers_v2 FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_invoice_line_calc BEFORE INSERT OR UPDATE OF billable_weight, rate_per_lb ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION compute_invoice_line();
CREATE TRIGGER trg_invoice_totals AFTER INSERT OR DELETE OR UPDATE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION update_invoice_totals();

CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_label_templates_updated_at BEFORE UPDATE ON public.label_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_awb_counters AFTER INSERT OR DELETE OR UPDATE OF awb_id, weight, weight_unit, received_at_dest ON public.packages FOR EACH ROW EXECUTE FUNCTION update_awb_counters();
CREATE TRIGGER trg_compute_weights BEFORE INSERT OR UPDATE OF weight, weight_unit, length, width, height, dim_unit, courier_group_id ON public.packages FOR EACH ROW EXECUTE FUNCTION compute_package_weights();
CREATE TRIGGER trg_packages_updated BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pricing_tiers_updated_at BEFORE UPDATE ON public.pricing_tiers FOR EACH ROW EXECUTE FUNCTION set_pricing_tiers_updated_at();

CREATE TRIGGER trg_generate_customer_number BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION generate_customer_number();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_warehouse_locations_updated_at BEFORE UPDATE ON public.warehouse_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_tier_commodity_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permission_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_shipment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 10. POLICIES
-- =============================================================================
-- All policies use the `( SELECT auth_org_id() )` initplan-wrap pattern from
-- migration 011. CUSTOMER-facing SELECT policies include `deleted_at IS NULL`
-- (migration 024) so customers can't see tombstoned records.

-- activity_log
CREATE POLICY activity_insert_v2 ON public.activity_log
  FOR INSERT TO public
  WITH CHECK (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY activity_select_v2 ON public.activity_log
  FOR SELECT TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) OR ((package_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM packages p WHERE (p.id = activity_log.package_id))))));

-- agent_closure
CREATE POLICY agent_closure_select ON public.agent_closure
  FOR SELECT TO public
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));

-- agent_edges
CREATE POLICY agent_edges_delete ON public.agent_edges
  FOR DELETE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY agent_edges_insert ON public.agent_edges
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY agent_edges_select ON public.agent_edges
  FOR SELECT TO public
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));

-- agents
CREATE POLICY agents_delete ON public.agents
  FOR DELETE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY agents_insert ON public.agents
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY agents_select ON public.agents
  FOR SELECT TO public
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY agents_update ON public.agents
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));

-- awbs
CREATE POLICY awbs_insert_v2 ON public.awbs
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND user_has_permission(( SELECT auth.uid() AS uid), 'shipments:create'::text));
CREATE POLICY awbs_select_v2 ON public.awbs
  FOR SELECT TO authenticated
  USING (((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) OR (agent_id IN ( SELECT get_accessible_agent_ids(( SELECT auth.uid() AS uid)) AS get_accessible_agent_ids)) OR ((( SELECT auth_role_v2() AS auth_role_v2) = 'AGENT_STAFF'::user_role_v2) AND (id IN ( SELECT user_shipment_assignments.shipment_id FROM user_shipment_assignments WHERE (user_shipment_assignments.user_id = ( SELECT auth.uid() AS uid))))))) OR ((( SELECT auth_role_v2() AS auth_role_v2) = 'CUSTOMER'::user_role_v2) AND (deleted_at IS NULL) AND (EXISTS ( SELECT 1 FROM packages p WHERE ((p.awb_id = awbs.id) AND (p.customer_id = ( SELECT auth.uid() AS uid)) AND (p.deleted_at IS NULL))))));
CREATE POLICY awbs_update_v2 ON public.awbs
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) OR ((agent_id IN ( SELECT get_accessible_agent_ids(( SELECT auth.uid() AS uid)) AS get_accessible_agent_ids)) AND user_has_permission(( SELECT auth.uid() AS uid), 'shipments:edit'::text))));

-- courier_groups
CREATE POLICY courier_groups_delete_v2 ON public.courier_groups
  FOR DELETE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY courier_groups_insert_v2 ON public.courier_groups
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY courier_groups_select_v2 ON public.courier_groups
  FOR SELECT TO public
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY courier_groups_update_v2 ON public.courier_groups
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));

-- customers_v2
CREATE POLICY customers_v2_delete ON public.customers_v2
  FOR DELETE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY customers_v2_insert ON public.customers_v2
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND user_has_permission(( SELECT auth.uid() AS uid), 'recipients:create'::text));
CREATE POLICY customers_v2_select ON public.customers_v2
  FOR SELECT TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) OR (owner_agent_id IN ( SELECT get_accessible_agent_ids(( SELECT auth.uid() AS uid)) AS get_accessible_agent_ids))));
CREATE POLICY customers_v2_update ON public.customers_v2
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND user_has_permission(( SELECT auth.uid() AS uid), 'recipients:edit'::text));

-- invoice_lines
CREATE POLICY invoice_lines_delete_v2 ON public.invoice_lines
  FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM invoices i WHERE ((i.id = invoice_lines.invoice_id) AND (i.org_id = ( SELECT auth_org_id() AS auth_org_id))))) AND user_has_permission(( SELECT auth.uid() AS uid), 'invoices:edit'::text));
CREATE POLICY invoice_lines_insert_v2 ON public.invoice_lines
  FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1 FROM invoices i WHERE ((i.id = invoice_lines.invoice_id) AND (i.org_id = ( SELECT auth_org_id() AS auth_org_id))))) AND user_has_permission(( SELECT auth.uid() AS uid), 'invoices:create'::text));
CREATE POLICY invoice_lines_select_v2 ON public.invoice_lines
  FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM invoices i WHERE (i.id = invoice_lines.invoice_id)));
CREATE POLICY invoice_lines_update_v2 ON public.invoice_lines
  FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM invoices i WHERE ((i.id = invoice_lines.invoice_id) AND (i.org_id = ( SELECT auth_org_id() AS auth_org_id))))) AND user_has_permission(( SELECT auth.uid() AS uid), 'invoices:edit'::text))
  WITH CHECK ((EXISTS ( SELECT 1 FROM invoices i WHERE ((i.id = invoice_lines.invoice_id) AND (i.org_id = ( SELECT auth_org_id() AS auth_org_id))))) AND user_has_permission(( SELECT auth.uid() AS uid), 'invoices:edit'::text));

-- invoices
CREATE POLICY invoices_insert_v2 ON public.invoices
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND user_has_permission(( SELECT auth.uid() AS uid), 'invoices:create'::text));
CREATE POLICY invoices_select_v2 ON public.invoices
  FOR SELECT TO authenticated
  USING (((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) OR (billed_by_agent_id IN ( SELECT get_accessible_agent_ids(( SELECT auth.uid() AS uid)) AS get_accessible_agent_ids)) OR (billed_to_agent_id IN ( SELECT get_accessible_agent_ids(( SELECT auth.uid() AS uid)) AS get_accessible_agent_ids)) OR ((billed_by_agent_id IS NULL) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2]))))) OR ((( SELECT auth_role_v2() AS auth_role_v2) = 'CUSTOMER'::user_role_v2) AND (customer_id = ( SELECT auth.uid() AS uid)) AND (deleted_at IS NULL)));
CREATE POLICY invoices_update_v2 ON public.invoices
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND user_has_permission(( SELECT auth.uid() AS uid), 'invoices:edit'::text));

-- label_templates
CREATE POLICY label_templates_select ON public.label_templates
  FOR SELECT TO authenticated
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY label_templates_write ON public.label_templates
  FOR ALL TO authenticated
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])))
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])));

-- notifications
CREATE POLICY notifications_select_v2 ON public.notifications
  FOR SELECT TO public
  USING (user_id = ( SELECT auth.uid() AS uid));
CREATE POLICY notifications_update_v2 ON public.notifications
  FOR UPDATE TO public
  USING (user_id = ( SELECT auth.uid() AS uid));

-- org_settings
CREATE POLICY org_settings_select ON public.org_settings
  FOR SELECT TO authenticated
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY org_settings_write ON public.org_settings
  FOR ALL TO authenticated
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2))
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));

-- organizations
CREATE POLICY org_select_v2 ON public.organizations
  FOR SELECT TO public
  USING (id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY org_update_v2 ON public.organizations
  FOR UPDATE TO public
  USING ((id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));

-- package_photos
CREATE POLICY photos_delete_v2 ON public.package_photos
  FOR DELETE TO public
  USING (EXISTS ( SELECT 1 FROM packages p WHERE ((p.id = package_photos.package_id) AND (p.org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])))));
CREATE POLICY photos_insert_v2 ON public.package_photos
  FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1 FROM packages p WHERE ((p.id = package_photos.package_id) AND (p.org_id = ( SELECT auth_org_id() AS auth_org_id))))) AND user_has_permission(( SELECT auth.uid() AS uid), 'packages:edit'::text));
CREATE POLICY photos_select_v2 ON public.package_photos
  FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM packages p WHERE ((p.id = package_photos.package_id) AND (p.org_id = ( SELECT auth_org_id() AS auth_org_id)))));

-- package_statuses
CREATE POLICY package_statuses_delete_v2 ON public.package_statuses
  FOR DELETE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY package_statuses_insert_v2 ON public.package_statuses
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY package_statuses_select_v2 ON public.package_statuses
  FOR SELECT TO public
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY package_statuses_update_v2 ON public.package_statuses
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));

-- package_tags
CREATE POLICY package_tags_select ON public.package_tags
  FOR SELECT TO authenticated
  USING (tag_id IN ( SELECT t.id FROM tags t WHERE (t.org_id = ( SELECT auth_org_id() AS auth_org_id))));
CREATE POLICY package_tags_write ON public.package_tags
  FOR ALL TO authenticated
  USING ((tag_id IN ( SELECT t.id FROM tags t WHERE (t.org_id = ( SELECT auth_org_id() AS auth_org_id)))) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])))
  WITH CHECK ((tag_id IN ( SELECT t.id FROM tags t WHERE (t.org_id = ( SELECT auth_org_id() AS auth_org_id)))) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])));

-- packages
CREATE POLICY packages_delete_v2 ON public.packages
  FOR DELETE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY packages_insert_v2 ON public.packages
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND user_has_permission(( SELECT auth.uid() AS uid), 'packages:create'::text));
CREATE POLICY packages_select_v2 ON public.packages
  FOR SELECT TO authenticated
  USING (((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) OR (agent_id IN ( SELECT get_accessible_agent_ids(( SELECT auth.uid() AS uid)) AS get_accessible_agent_ids)))) OR ((( SELECT auth_role_v2() AS auth_role_v2) = 'CUSTOMER'::user_role_v2) AND (customer_id = ( SELECT auth.uid() AS uid)) AND (deleted_at IS NULL)));
CREATE POLICY packages_update_v2 ON public.packages
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) OR ((agent_id IN ( SELECT get_accessible_agent_ids(( SELECT auth.uid() AS uid)) AS get_accessible_agent_ids)) AND user_has_permission(( SELECT auth.uid() AS uid), 'packages:edit'::text))));

-- permission_keys
CREATE POLICY perm_keys_select ON public.permission_keys
  FOR SELECT TO public
  USING (true);

-- pricing_tier_commodity_rates
CREATE POLICY commodity_rates_delete ON public.pricing_tier_commodity_rates
  FOR DELETE TO public
  USING (EXISTS ( SELECT 1 FROM pricing_tiers pt WHERE ((pt.id = pricing_tier_commodity_rates.pricing_tier_id) AND (pt.org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2])))));
CREATE POLICY commodity_rates_insert ON public.pricing_tier_commodity_rates
  FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1 FROM pricing_tiers pt WHERE ((pt.id = pricing_tier_commodity_rates.pricing_tier_id) AND (pt.org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2])))));
CREATE POLICY commodity_rates_select ON public.pricing_tier_commodity_rates
  FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM pricing_tiers pt WHERE ((pt.id = pricing_tier_commodity_rates.pricing_tier_id) AND (pt.org_id = ( SELECT auth_org_id() AS auth_org_id)))));
CREATE POLICY commodity_rates_update ON public.pricing_tier_commodity_rates
  FOR UPDATE TO public
  USING (EXISTS ( SELECT 1 FROM pricing_tiers pt WHERE ((pt.id = pricing_tier_commodity_rates.pricing_tier_id) AND (pt.org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2])))));

-- pricing_tiers
CREATE POLICY pricing_tiers_delete ON public.pricing_tiers
  FOR DELETE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY pricing_tiers_insert ON public.pricing_tiers
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2])));
CREATE POLICY pricing_tiers_select ON public.pricing_tiers
  FOR SELECT TO public
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY pricing_tiers_update ON public.pricing_tiers
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'AGENT_ADMIN'::user_role_v2])));

-- role_permission_defaults
CREATE POLICY rpd_select ON public.role_permission_defaults
  FOR SELECT TO public
  USING (true);

-- role_permissions
CREATE POLICY role_permissions_delete ON public.role_permissions
  FOR DELETE TO public
  USING (EXISTS ( SELECT 1 FROM roles r WHERE ((r.id = role_permissions.role_id) AND (r.org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (r.is_system = false) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2))));
CREATE POLICY role_permissions_insert ON public.role_permissions
  FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1 FROM roles r WHERE ((r.id = role_permissions.role_id) AND (r.org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (r.is_system = false) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2))));
CREATE POLICY role_permissions_select ON public.role_permissions
  FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM roles r WHERE ((r.id = role_permissions.role_id) AND (r.org_id = ( SELECT auth_org_id() AS auth_org_id)))));

-- roles
CREATE POLICY roles_delete ON public.roles
  FOR DELETE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) AND (is_system = false));
CREATE POLICY roles_insert ON public.roles
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) AND (is_system = false));
CREATE POLICY roles_select ON public.roles
  FOR SELECT TO public
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY roles_update ON public.roles
  FOR UPDATE TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) AND (is_system = false));

-- tags
CREATE POLICY tags_select ON public.tags
  FOR SELECT TO authenticated
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY tags_write ON public.tags
  FOR ALL TO authenticated
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])))
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])));

-- user_permissions
CREATE POLICY user_perms_delete_v2 ON public.user_permissions
  FOR DELETE TO public
  USING ((( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_permissions.user_id) AND (u.org_id = ( SELECT auth_org_id() AS auth_org_id))))));
CREATE POLICY user_perms_insert_v2 ON public.user_permissions
  FOR INSERT TO public
  WITH CHECK ((( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_permissions.user_id) AND (u.org_id = ( SELECT auth_org_id() AS auth_org_id))))));
CREATE POLICY user_perms_select_v2 ON public.user_permissions
  FOR SELECT TO public
  USING ((user_id = ( SELECT auth.uid() AS uid)) OR ((( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_permissions.user_id) AND (u.org_id = ( SELECT auth_org_id() AS auth_org_id)))))));
CREATE POLICY user_perms_update_v2 ON public.user_permissions
  FOR UPDATE TO public
  USING ((( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_permissions.user_id) AND (u.org_id = ( SELECT auth_org_id() AS auth_org_id))))));

-- user_shipment_assignments
CREATE POLICY usa_delete_v2 ON public.user_shipment_assignments
  FOR DELETE TO public
  USING ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_shipment_assignments.user_id) AND (u.org_id = ( SELECT auth_org_id() AS auth_org_id))))));
CREATE POLICY usa_insert_v2 ON public.user_shipment_assignments
  FOR INSERT TO public
  WITH CHECK ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_shipment_assignments.user_id) AND (u.org_id = ( SELECT auth_org_id() AS auth_org_id))))));
CREATE POLICY usa_select_v2 ON public.user_shipment_assignments
  FOR SELECT TO public
  USING ((user_id = ( SELECT auth.uid() AS uid)) OR ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_shipment_assignments.user_id) AND (u.org_id = ( SELECT auth_org_id() AS auth_org_id)))))));

-- users
CREATE POLICY users_insert_v2 ON public.users
  FOR INSERT TO public
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));
CREATE POLICY users_select_v2 ON public.users
  FOR SELECT TO public
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = ANY (ARRAY['ORG_ADMIN'::user_role_v2, 'WAREHOUSE_STAFF'::user_role_v2])) OR (agent_id IN ( SELECT get_accessible_agent_ids(( SELECT auth.uid() AS uid)) AS get_accessible_agent_ids)) OR (id = ( SELECT auth.uid() AS uid))));
CREATE POLICY users_update_v2 ON public.users
  FOR UPDATE TO authenticated
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) OR (id = ( SELECT auth.uid() AS uid))))
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND ((( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2) OR ((id = ( SELECT auth.uid() AS uid)) AND (NOT (role_v2 IS DISTINCT FROM ( SELECT auth_role_v2() AS auth_role_v2))) AND (NOT (agent_id IS DISTINCT FROM ( SELECT auth_agent_id() AS auth_agent_id))) AND (NOT (role_id IS DISTINCT FROM ( SELECT auth_role_id() AS auth_role_id))))));

-- warehouse_locations
CREATE POLICY warehouse_locations_select ON public.warehouse_locations
  FOR SELECT TO authenticated
  USING (org_id = ( SELECT auth_org_id() AS auth_org_id));
CREATE POLICY warehouse_locations_write ON public.warehouse_locations
  FOR ALL TO authenticated
  USING ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2))
  WITH CHECK ((org_id = ( SELECT auth_org_id() AS auth_org_id)) AND (( SELECT auth_role_v2() AS auth_role_v2) = 'ORG_ADMIN'::user_role_v2));

-- =============================================================================
-- 11. REFERENCE / LOOKUP DATA
-- =============================================================================
-- These rows are global (no org_id) and were originally INSERT'd by pre-024
-- migrations. The schema-only snapshot drops the INSERTs, so we restore them
-- here. Keep this list in sync with prod via the regeneration queries in
-- tests/rls/README.md.
--
-- permission_keys — FK target for role_permissions + user_permissions.
--   Dumped from prod 2026-04-21 via Supabase MCP.
INSERT INTO public.permission_keys (id, category, description, is_hard_constraint, created_at) VALUES
  ('agents:create',          'agents',    'Create sub-agents',                 false, NOW()),
  ('agents:delete',          'agents',    'Delete agents',                     true,  NOW()),
  ('agents:edit',            'agents',    'Edit agent details',                true,  NOW()),
  ('agents:view',            'agents',    'View agent hierarchy',              false, NOW()),
  ('invoices:create',        'invoices',  'Create invoices',                   false, NOW()),
  ('invoices:delete',        'invoices',  'Delete invoices',                   true,  NOW()),
  ('invoices:edit',          'invoices',  'Edit draft invoices',               false, NOW()),
  ('invoices:export_pdf',    'invoices',  'Export invoices as PDF',            false, NOW()),
  ('invoices:send',          'invoices',  'Send invoices',                     false, NOW()),
  ('invoices:view',          'invoices',  'View invoices',                     false, NOW()),
  ('packages:create',        'packages',  'Create packages (check-in)',        false, NOW()),
  ('packages:delete',        'packages',  'Delete packages',                   true,  NOW()),
  ('packages:edit',          'packages',  'Edit package details',              false, NOW()),
  ('packages:scan_receive',  'packages',  'Mark packages as received',         false, NOW()),
  ('packages:view',          'packages',  'View packages',                     false, NOW()),
  ('recipients:create',      'recipients','Create recipients',                 false, NOW()),
  ('recipients:delete',      'recipients','Delete recipients',                 true,  NOW()),
  ('recipients:edit',        'recipients','Edit recipient details',            false, NOW()),
  ('recipients:view',        'recipients','View recipients',                   false, NOW()),
  ('settings:edit',          'settings',  'Edit organization settings',        true,  NOW()),
  ('settings:view',          'settings',  'View organization settings',        false, NOW()),
  ('settings:view_analytics','settings',  'View analytics dashboard',          false, NOW()),
  ('shipments:assign_agent', 'shipments', 'Assign shipment to agent',          false, NOW()),
  ('shipments:create',       'shipments', 'Create new shipments',              false, NOW()),
  ('shipments:delete',       'shipments', 'Delete shipments',                  true,  NOW()),
  ('shipments:edit',         'shipments', 'Edit shipment details',             false, NOW()),
  ('shipments:view',         'shipments', 'View shipments',                    false, NOW()),
  ('users:disable',          'users',     'Disable user accounts',             false, NOW()),
  ('users:edit_role',        'users',     'Change user roles',                 true,  NOW()),
  ('users:invite',           'users',     'Invite new users',                  false, NOW()),
  ('users:set_permissions',  'users',     'Set user permission overrides',     true,  NOW()),
  ('users:view',             'users',     'View users',                        false, NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- END OF BASELINE
-- =============================================================================
