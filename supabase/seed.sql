-- ============================================================================
-- supabase/seed.sql — RLS test fixtures for tests/rls/*.sql
-- ============================================================================
--
-- This file is auto-loaded by `supabase db reset` and `supabase start` AFTER
-- migrations 001-024 run. It seeds the minimum dataset required by the RLS
-- regression suite under tests/rls/.
--
-- WHY THIS EXISTS
--   The RLS tests assume a specific cast of seed users (Alex / Ana / Maria /
--   John / platinumcorp1) and a specific cast of fixture rows (Ana's 2
--   packages — 1 live + 1 tombstone, 2 invoices — 1 live + 1 tombstone, etc).
--   None of those rows live in any migration — in prod they were created via
--   Supabase Auth signup + the admin UI. CI needs a deterministic copy.
--
--   The data here is dumped from prod org `00000000-0000-0000-0000-000000000001`
--   on 2026-04-20 via Supabase MCP. Sensitive fields (avatars, real names of
--   non-fixture users) are omitted by virtue of dumping only the fixture rows.
--
-- IDEMPOTENCY
--   Every INSERT uses ON CONFLICT DO NOTHING keyed on the natural / primary
--   key. Migration 004 already inserts the Enviato org + the NWGY courier
--   group; we ride on top of those. Re-running this file is safe.
--
-- AUTH NOTE
--   We do NOT insert anything into auth.users. RLS reads `auth.uid()` from
--   `request.jwt.claim.sub` (set via `set_config(...)` inside each test) — no
--   FK from public.users.id to auth.users.id is enforced, so the impersonation
--   shape used by the tests works against a fresh DB even with no auth rows.
--
-- WHEN TO REGENERATE
--   - A new RLS test references a fixture not seeded here.
--   - A migration changes the schema of one of the tables seeded below.
--   - The test fixture in prod changes meaningfully (e.g. Ana's package count
--     drifts in a way the tests rely on — currently F-4 computes ground truth
--     from the seed itself, so this is rare).
--
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Organization
--    Migration 004 already inserts org `0...001` with name 'Enviato Warehouse';
--    prod has it renamed to 'Enviato'. We don't UPDATE — the tests don't care
--    about the display name. This guard is defensive for runs where 004 ran.
-- ----------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, slug, address, settings, plan_tier)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Enviato',
  'enviato',
  '{"zip":"33172","city":"Miami","state":"FL","street":"10832 nw 27 street","country":"US"}'::jsonb,
  '{"timezone":"America/New_York","default_group":"NWGY","notifications_enabled":true}'::jsonb,
  'pro'
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Pricing tier (Ana is on this one — 'Regular Customers')
-- ----------------------------------------------------------------------------
INSERT INTO public.pricing_tiers (id, org_id, name, description, tier_type, base_rate_per_lb, currency, delivery_fee, hazmat_fee, is_default, is_active)
VALUES (
  '8a6c610f-e7b9-40d9-b71a-fa9e54509b0e',
  '00000000-0000-0000-0000-000000000001',
  'Regular Customers',
  'Pricing for all regular customers - non commercial',
  'retail',
  5,
  'USD',
  1,
  1.5,
  false,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Agents — three-deep tree:  ENV (root) → SnapShop → Matrix
--    Used by F-2 (agent_id hijack), F-3 (unassigned packages cascade),
--    cross_tenant_isolation (AGENT_STAFF impersonation).
-- ----------------------------------------------------------------------------
INSERT INTO public.agents (id, org_id, name, status, company_name, first_name, last_name, email, country, agent_code)
VALUES
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001',
   'Enviato Group', 'active', 'Enviato Group LLC', 'Alexander', 'Lessa', 'alex@enviato.com', 'US', 'ENV'),
  ('62a362a4-cd8b-4093-adcc-79494cb72d0e', '00000000-0000-0000-0000-000000000001',
   'SnapShop Shipping', 'active', 'SnapShop Shipping', 'Naseran', 'Wahab', 'snapshopgy@gmail.com', 'GY', 'NWGY'),
  ('d2e6e5e9-75cb-4a9f-8475-b4c9b20b5663', '00000000-0000-0000-0000-000000000001',
   'Matrix Shopping Group', 'active', 'Matrix Shopping Group', NULL, NULL, NULL, 'US', 'MTX')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. agent_edges + agent_closure — adjacency + transitive closure.
--    005_agents_hierarchy may install a trigger that auto-maintains closure on
--    edge insert; the closure inserts below are still wrapped in ON CONFLICT
--    so they're idempotent either way.
-- ----------------------------------------------------------------------------
INSERT INTO public.agent_edges (id, org_id, parent_agent_id, child_agent_id)
VALUES
  ('03c7999b-48a8-4b64-afc1-67d1fe39b8de', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000100', '62a362a4-cd8b-4093-adcc-79494cb72d0e'),
  ('c325b5cc-25e6-470d-a966-4d1c6334d6dd', '00000000-0000-0000-0000-000000000001',
   '62a362a4-cd8b-4093-adcc-79494cb72d0e', 'd2e6e5e9-75cb-4a9f-8475-b4c9b20b5663')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.agent_closure (org_id, ancestor_id, descendant_id, depth)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000100', 0),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000100', '62a362a4-cd8b-4093-adcc-79494cb72d0e', 1),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000100', 'd2e6e5e9-75cb-4a9f-8475-b4c9b20b5663', 2),
  ('00000000-0000-0000-0000-000000000001', '62a362a4-cd8b-4093-adcc-79494cb72d0e', '62a362a4-cd8b-4093-adcc-79494cb72d0e', 0),
  ('00000000-0000-0000-0000-000000000001', '62a362a4-cd8b-4093-adcc-79494cb72d0e', 'd2e6e5e9-75cb-4a9f-8475-b4c9b20b5663', 1),
  ('00000000-0000-0000-0000-000000000001', 'd2e6e5e9-75cb-4a9f-8475-b4c9b20b5663', 'd2e6e5e9-75cb-4a9f-8475-b4c9b20b5663', 0)
ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Courier groups (UPS for packages, LATAM for AWBs/invoices)
--    Migration 004 already inserts NWGY at id 0...010; we add the two used by
--    Ana's fixture rows.
-- ----------------------------------------------------------------------------
INSERT INTO public.courier_groups (id, org_id, name, code, country, pricing_model, rate_per_lb, volume_divisor, currency, type)
VALUES
  ('617a6df2-f7f6-4c88-9d41-1e5b7d4202fe', '00000000-0000-0000-0000-000000000001',
   'UPS', 'UPS', NULL, 'gross_weight', 0, 166, 'USD', 'shipping'),
  ('5bd5b323-d12e-416c-a409-276c493e4477', '00000000-0000-0000-0000-000000000001',
   'LATAM Airlines', 'LATAM', 'United States', 'gross_weight', 0, 166, 'USD', 'airline')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Roles — 5 system roles (one per base_role)
--    Used by F-5 (positive case requires ORG_ADMIN to have invoices:edit) and
--    F-7 (CUSTOMER role exists so role_v2 backfill maps cleanly).
-- ----------------------------------------------------------------------------
INSERT INTO public.roles (id, org_id, name, description, base_role, is_system)
VALUES
  ('1885e100-1cb9-4166-94f1-aa640481128b', '00000000-0000-0000-0000-000000000001',
   'Organization Admin', 'Full access to all settings, users, and data', 'ORG_ADMIN', true),
  ('2662cea5-0f8f-4658-b79b-88e94e17da87', '00000000-0000-0000-0000-000000000001',
   'Warehouse Staff', 'Manages packages, shipments, and warehouse operations', 'WAREHOUSE_STAFF', true),
  ('6b6a5e62-1006-4264-ad39-ac7dcbbcec45', '00000000-0000-0000-0000-000000000001',
   'Agent Admin', 'Manages agent operations, staff, and billing', 'AGENT_ADMIN', true),
  ('c50b816c-6a2e-4338-ae7f-844cfae1fb34', '00000000-0000-0000-0000-000000000001',
   'Customer', 'Customer portal access — view own invoices and packages only', 'CUSTOMER', true),
  ('f2c51fc5-2567-45b9-913b-13b813727fa0', '00000000-0000-0000-0000-000000000001',
   'Agent Staff', 'Basic access to assigned agent operations', 'AGENT_STAFF', true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. Role permissions — full prod set (67 rows).
--    F-5 specifically requires the ORG_ADMIN role to carry 'invoices:edit'.
--    Including the full set keeps user_has_permission() behaving identically
--    to prod across every other test.
-- ----------------------------------------------------------------------------
INSERT INTO public.role_permissions (id, role_id, permission_key) VALUES
  -- ORG_ADMIN (1885e100)
  ('2cf4cacd-cbd2-4d66-a4fb-efcebe85d13f', '1885e100-1cb9-4166-94f1-aa640481128b', 'agents:create'),
  ('d4ba1db2-af73-4987-9a68-f03ebc1e0feb', '1885e100-1cb9-4166-94f1-aa640481128b', 'agents:delete'),
  ('5a565574-38fc-4f5e-9aad-ffbda83382bc', '1885e100-1cb9-4166-94f1-aa640481128b', 'agents:edit'),
  ('59b3d099-d49f-49ee-bf48-5eb18719421b', '1885e100-1cb9-4166-94f1-aa640481128b', 'agents:view'),
  ('cb10a7a8-b242-4d85-b2e0-ed4764577510', '1885e100-1cb9-4166-94f1-aa640481128b', 'invoices:create'),
  ('0c2cfc86-6bd8-4a97-8d3b-4949c3596b88', '1885e100-1cb9-4166-94f1-aa640481128b', 'invoices:delete'),
  ('155f6a2a-c6c2-4342-82be-92b089be50cb', '1885e100-1cb9-4166-94f1-aa640481128b', 'invoices:edit'),
  ('bbe588fa-35d6-4c7b-8b08-926adb11a4e5', '1885e100-1cb9-4166-94f1-aa640481128b', 'invoices:export_pdf'),
  ('c5ff8289-400e-4940-b321-9d2973e2d10d', '1885e100-1cb9-4166-94f1-aa640481128b', 'invoices:send'),
  ('d8e3272c-083d-453e-ab89-9ad0c65582e4', '1885e100-1cb9-4166-94f1-aa640481128b', 'invoices:view'),
  ('09994b84-bdb7-4eb3-8f0d-29696bb9dac9', '1885e100-1cb9-4166-94f1-aa640481128b', 'packages:create'),
  ('0db4ca7e-6e17-4abb-98a7-a0cc0e55d229', '1885e100-1cb9-4166-94f1-aa640481128b', 'packages:delete'),
  ('d4298564-afe9-464a-9dd0-2dc579dcfb9c', '1885e100-1cb9-4166-94f1-aa640481128b', 'packages:edit'),
  ('3a2dfa6c-f13d-4b12-9fc3-05fc733fc479', '1885e100-1cb9-4166-94f1-aa640481128b', 'packages:scan_receive'),
  ('bc9a6970-f121-442a-bf96-9831092b6b53', '1885e100-1cb9-4166-94f1-aa640481128b', 'packages:view'),
  ('a53d3cf0-7d40-4fd6-bf37-2e7396c099ab', '1885e100-1cb9-4166-94f1-aa640481128b', 'recipients:create'),
  ('baefbf25-5119-45b7-99c3-0ba38296ceb1', '1885e100-1cb9-4166-94f1-aa640481128b', 'recipients:delete'),
  ('b500b829-3518-4f69-bd4a-c103ad2fd871', '1885e100-1cb9-4166-94f1-aa640481128b', 'recipients:edit'),
  ('0c2a2858-0006-4102-a7d5-e28cba8ffca4', '1885e100-1cb9-4166-94f1-aa640481128b', 'recipients:view'),
  ('1f5be92c-0a6b-46c3-be74-02a8431c42ea', '1885e100-1cb9-4166-94f1-aa640481128b', 'settings:edit'),
  ('927065e1-a8c1-4d40-80d5-97f059e51645', '1885e100-1cb9-4166-94f1-aa640481128b', 'settings:view'),
  ('60a70b2f-3bf5-4fab-972a-c8569fd34cdf', '1885e100-1cb9-4166-94f1-aa640481128b', 'settings:view_analytics'),
  ('63b7dd32-0123-4318-afe8-565c4bfaeb35', '1885e100-1cb9-4166-94f1-aa640481128b', 'shipments:assign_agent'),
  ('3b6c33b1-01b1-485f-8cdb-95192fe5fa26', '1885e100-1cb9-4166-94f1-aa640481128b', 'shipments:create'),
  ('789a95c9-6a29-46b5-bce4-302c291c0913', '1885e100-1cb9-4166-94f1-aa640481128b', 'shipments:delete'),
  ('c5764884-0227-43db-915a-839cd851e9e5', '1885e100-1cb9-4166-94f1-aa640481128b', 'shipments:edit'),
  ('e3aed245-008c-4347-ae70-e5fbd155e3a3', '1885e100-1cb9-4166-94f1-aa640481128b', 'shipments:view'),
  ('6342843c-f7ae-44a1-aa97-ec3834818502', '1885e100-1cb9-4166-94f1-aa640481128b', 'users:disable'),
  ('8d94078d-832a-47c0-a91f-0e5d55b4606e', '1885e100-1cb9-4166-94f1-aa640481128b', 'users:edit_role'),
  ('9216a67c-eb05-4795-a2c6-35e970373073', '1885e100-1cb9-4166-94f1-aa640481128b', 'users:invite'),
  ('7ee5d14a-1dd4-49e3-997c-1150a4baa82c', '1885e100-1cb9-4166-94f1-aa640481128b', 'users:set_permissions'),
  ('b3b70658-8960-4f1e-9bb5-f5b37f6de93f', '1885e100-1cb9-4166-94f1-aa640481128b', 'users:view'),
  -- WAREHOUSE_STAFF (2662cea5)
  ('0fefc996-6338-4761-bb47-cd40c78ca4d8', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'packages:create'),
  ('f61f09fd-6b70-422d-a819-061507a72099', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'packages:edit'),
  ('90c9225e-24c5-4c59-b38f-fce2ccbfc99d', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'packages:scan_receive'),
  ('548ed87f-94df-4fbc-80f9-41ea46f664da', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'packages:view'),
  ('cd7f9a40-3f83-4e97-b971-c5e5282bf90e', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'recipients:create'),
  ('ac570151-8d02-4552-b47c-281356653d71', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'recipients:edit'),
  ('4491b904-662a-4348-b23f-d951dc7d810f', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'recipients:view'),
  ('98291d90-8c26-4ec3-b5ab-2c85c23aad99', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'shipments:assign_agent'),
  ('c0db81e8-0719-4160-835d-6217b0b02245', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'shipments:create'),
  ('27539999-f453-4ae9-ae5b-11f80322ed3e', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'shipments:edit'),
  ('6df08c94-b6c8-491c-b9d5-106ff0a53e72', '2662cea5-0f8f-4658-b79b-88e94e17da87', 'shipments:view'),
  -- AGENT_ADMIN (6b6a5e62)
  ('66ea4bea-a5b0-43cb-831a-63d5cddc4b04', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'agents:view'),
  ('5ef5eef9-cdf3-4aa8-bd9d-4707839cf07c', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'invoices:create'),
  ('f4e05f09-960a-4242-b8a6-cee40a59b32b', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'invoices:edit'),
  ('c568a1e0-2d93-4396-a663-5b50a94fb34f', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'invoices:export_pdf'),
  ('4dead956-830b-4412-ad05-574fb45d73dd', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'invoices:send'),
  ('34b9f56a-b148-41e2-8053-fa5d07142cfc', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'invoices:view'),
  ('2426b3ce-669f-4843-869b-51b512bb3af6', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'packages:create'),
  ('0e197388-63cd-4ab3-9af2-78fb11fd87cf', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'packages:edit'),
  ('1d2710cc-140f-4aee-8063-75de6d498b18', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'packages:scan_receive'),
  ('7b80e31d-4331-46d7-b39c-9862a383f54e', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'packages:view'),
  ('dae2e5dd-344d-4eb3-9162-2b2d72937e8e', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'recipients:create'),
  ('1b18f43e-84c7-430a-9a9d-09a110ff7672', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'recipients:edit'),
  ('b3cb0286-c2a8-49f7-8d2f-e1325a1f8395', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'recipients:view'),
  ('66605f5f-c14d-4d0a-95a1-941b402eb4c4', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'shipments:create'),
  ('000a1d81-d705-4cc3-be79-b144cc5926c5', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'shipments:edit'),
  ('21ae06bf-9335-4193-9fe3-fa7b81413c07', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'shipments:view'),
  ('ff351e19-6755-4c54-9eb4-e70f41c48185', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'users:disable'),
  ('45c2afac-fe69-42e1-91fd-5e793424d452', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'users:invite'),
  ('76ca90a5-b09d-4440-bb46-7da78d26e5c2', '6b6a5e62-1006-4264-ad39-ac7dcbbcec45', 'users:view'),
  -- CUSTOMER (c50b816c) — view-only on own packages/invoices
  ('9b5c64fd-8370-43d8-be46-0890d6a93abe', 'c50b816c-6a2e-4338-ae7f-844cfae1fb34', 'invoices:view'),
  ('a131f345-0f58-45b3-b656-68c52d03a276', 'c50b816c-6a2e-4338-ae7f-844cfae1fb34', 'packages:view'),
  -- AGENT_STAFF (f2c51fc5) — minimal
  ('af4c435d-f9ab-4bd1-a5db-5c9eb5af5fc9', 'f2c51fc5-2567-45b9-913b-13b813727fa0', 'packages:scan_receive'),
  ('59a401f1-80b5-4273-9bce-6fd07dc45747', 'f2c51fc5-2567-45b9-913b-13b813727fa0', 'packages:view'),
  ('0279ce26-b626-4c82-adf7-655cfbd1c7c7', 'f2c51fc5-2567-45b9-913b-13b813727fa0', 'shipments:view')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. Users — 5 fixture users
--   Alex            ORG_ADMIN       — positive-case checks, F-12 admin writes
--   John            WAREHOUSE_STAFF — org-wide reads, limited writes
--   platinumcorp1   AGENT_STAFF     — F-1 self-escalation, F-2 hijack
--   Ana             CUSTOMER (data) — F-4 + HP5 surface; tombstone fixtures
--   Maria           CUSTOMER (none) — denial-side checks
--
-- The trg_generate_customer_number trigger fires on INSERT. We pass an
-- explicit customer_number for Ana (ENV-00003) and Maria (ENV-00004) so the
-- trigger no-ops; non-customers get NULL which the trigger leaves alone.
-- ----------------------------------------------------------------------------
INSERT INTO public.users (id, org_id, email, first_name, last_name, role, role_v2, role_id, agent_id, customer_number, pricing_tier_id, is_active)
VALUES
  -- Alex: ORG_ADMIN, root agent
  ('4109f9a3-9c51-4096-91de-09223cbd9203', '00000000-0000-0000-0000-000000000001',
   'lessaenterprises@gmail.com', 'Alex', 'Lessa', 'org_admin',
   'ORG_ADMIN', '1885e100-1cb9-4166-94f1-aa640481128b',
   '00000000-0000-0000-0000-000000000100', NULL, NULL, true),
  -- John: WAREHOUSE_STAFF, root agent
  ('a0000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
   'john.warehouse@example.com', 'John', 'Perez', 'warehouse_staff',
   'WAREHOUSE_STAFF', '2662cea5-0f8f-4658-b79b-88e94e17da87',
   '00000000-0000-0000-0000-000000000100', NULL, NULL, true),
  -- platinumcorp1: AGENT_STAFF under SnapShop
  ('2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9', '00000000-0000-0000-0000-000000000001',
   'platinumcorp1@gmail.com', 'Test', 'test', 'courier_staff',
   'AGENT_STAFF', 'f2c51fc5-2567-45b9-913b-13b813727fa0',
   '62a362a4-cd8b-4093-adcc-79494cb72d0e', NULL, NULL, true),
  -- Ana: CUSTOMER with packages/invoices, on Regular Customers tier
  ('a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   'ana.martinez@example.com', 'Ana', 'Martinez', 'customer',
   'CUSTOMER', NULL,
   '62a362a4-cd8b-4093-adcc-79494cb72d0e', 'ENV-00003',
   '8a6c610f-e7b9-40d9-b71a-fa9e54509b0e', true),
  -- Maria: CUSTOMER with NO data (denial side)
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'maria.santos@example.com', 'Maria', 'Santos', 'customer',
   'CUSTOMER', NULL,
   '62a362a4-cd8b-4093-adcc-79494cb72d0e', 'ENV-00004', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. Tags — at least 1 row in the org so F-12 can prove CUSTOMER cannot
--    write. (Actual writability denial is what's tested; the existing row
--    just gives the test something to potentially target.)
-- ----------------------------------------------------------------------------
INSERT INTO public.tags (id, org_id, name, color)
VALUES
  ('04cd6d56-af14-4b1c-bbdb-8e04ef0b8c2e', '00000000-0000-0000-0000-000000000001',
   'Fragile', '#f59e0b')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 10. AWB — 1 row, hosts Ana's live package
-- ----------------------------------------------------------------------------
INSERT INTO public.awbs (id, org_id, courier_group_id, awb_number, freight_type, airline_or_vessel, origin, destination, status, total_pieces, total_weight)
VALUES
  ('975f7a5f-33f9-4359-8a7d-4668725486cd', '00000000-0000-0000-0000-000000000001',
   '5bd5b323-d12e-416c-a409-276c493e4477', '001-2222222', 'air', 'LATAM Airlines', 'MIA', 'GEO',
   'packing', 3, 72)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 11. Invoices — Ana's 2 (1 live + 1 tombstone)
--    Inserted BEFORE packages because packages.invoice_id FKs into
--    invoices.id (fk_packages_invoice). Ordering matters on a fresh DB where
--    no rows exist yet; prior to this fix CI died at
--    "insert or update on table \"packages\" violates foreign key constraint
--     \"fk_packages_invoice\"" because the package insert ran first.
-- ----------------------------------------------------------------------------
INSERT INTO public.invoices (id, org_id, courier_group_id, customer_id, invoice_number, status,
                             pricing_model, rate_per_lb, subtotal, tax_rate, tax_amount, total, currency,
                             notes, due_date, invoice_type, billed_by_agent_id, billed_to_agent_id,
                             deleted_at, deleted_by, payment_terms)
VALUES
  -- Live — visible to Ana
  ('72234ee7-700b-4570-ba15-9361fdbbcab1', '00000000-0000-0000-0000-000000000001',
   '5bd5b323-d12e-416c-a409-276c493e4477', 'a0000000-0000-0000-0000-000000000007',
   'INV-2026-0003', 'draft', 'gross_weight', 5, 459.28, 0, 0, 459.28, 'USD',
   'test', '2026-04-13', 'STANDARD',
   '62a362a4-cd8b-4093-adcc-79494cb72d0e', NULL,
   NULL, NULL, 'due_on_receipt'),
  -- Tombstoned — must be HIDDEN from Ana per migration 024
  ('93f34f3c-415c-4078-9809-6ba1fe8dc0ae', '00000000-0000-0000-0000-000000000001',
   '5bd5b323-d12e-416c-a409-276c493e4477', 'a0000000-0000-0000-0000-000000000007',
   'INV-2026-0002', 'draft', 'gross_weight', 5, 243.45, 0, 0, 243.45, 'USD',
   NULL, NULL, 'STANDARD',
   NULL, NULL,
   '2026-04-13T16:45:17.196+00:00', '4109f9a3-9c51-4096-91de-09223cbd9203', 'due_on_receipt')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 12. Packages — Ana's 2 (1 live + 1 tombstone, mirrors invoices shape)
--    The trg_compute_weights trigger recomputes volume_weight/billable_weight,
--    so the values we pass for those will be overwritten — that's fine.
--    deleted_at on the first row drives the F-4 "tombstone hidden from
--    CUSTOMER post-024" assertion.
-- ----------------------------------------------------------------------------
INSERT INTO public.packages (id, org_id, courier_group_id, customer_id, tracking_number, carrier, status,
                             weight, weight_unit, length, width, height, dim_unit, package_type,
                             awb_id, agent_id, invoice_id, deleted_at, commodity, notes, checked_in_at)
VALUES
  -- Tombstoned (deleted_at set) — must be HIDDEN from Ana per migration 024
  ('5acb8135-702f-4367-be38-b1c2c81ade35', '00000000-0000-0000-0000-000000000001',
   '617a6df2-f7f6-4c88-9d41-1e5b7d4202fe', 'a0000000-0000-0000-0000-000000000007',
   '24232424242', 'UPS', 'checked_in',
   10, 'lb', 30, 30, 30, 'in', 'box',
   NULL, '62a362a4-cd8b-4093-adcc-79494cb72d0e', NULL,
   '2026-03-14T03:26:50.314+00:00', NULL, NULL, '2026-03-14T02:45:14.146+00:00'),
  -- Live — visible to Ana
  ('7276aced-ec30-47fa-aca4-6414895d6a39', '00000000-0000-0000-0000-000000000001',
   '617a6df2-f7f6-4c88-9d41-1e5b7d4202fe', 'a0000000-0000-0000-0000-000000000007',
   '424298428748294', 'UPS', 'assigned_to_awb',
   10, 'lb', 20, 20, 20, 'in', 'box',
   '975f7a5f-33f9-4359-8a7d-4668725486cd', '62a362a4-cd8b-4093-adcc-79494cb72d0e',
   '72234ee7-700b-4570-ba15-9361fdbbcab1',
   NULL, 'Electronics', 'This is damaged', '2026-03-14T03:28:20.63+00:00')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 13. Invoice lines — 4 rows on Ana's live invoice
--    Used by F-5 (ORG_ADMIN UPDATE/DELETE) and the F-4 cascade count.
-- ----------------------------------------------------------------------------
INSERT INTO public.invoice_lines (id, invoice_id, package_id, tracking_number, actual_weight, volume_weight, billable_weight, rate_per_lb, line_total, description, charge_type)
VALUES
  ('1ce20065-c207-4387-afdc-1180be857ca8', '72234ee7-700b-4570-ba15-9361fdbbcab1',
   NULL, NULL, NULL, NULL, 48.5, 5, 242.5,
   'Handling Rate (48.5 lbs × $5.00/lb)', 'per_lb'),
  ('1e5c73de-99b6-417e-aaf9-622e441726c6', '72234ee7-700b-4570-ba15-9361fdbbcab1',
   NULL, NULL, NULL, NULL, 4, 5, 20,
   'handling fee (4 lbs × $5.00/lb)', 'per_lb'),
  ('852c9f08-02f5-4f71-8848-ccce2230fdbd', '72234ee7-700b-4570-ba15-9361fdbbcab1',
   NULL, NULL, NULL, NULL, NULL, NULL, -24.17,
   'Discount (5%)', 'percent'),
  ('f11eb2b5-e911-4cf9-aa34-725680123aac', '72234ee7-700b-4570-ba15-9361fdbbcab1',
   '7276aced-ec30-47fa-aca4-6414895d6a39', '424298428748294', 10, 48.19, 48.19, 5, 240.95,
   'Package 424298428748294 (Electronics)', 'package')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 14. Package photos — 1 row on Ana's live package
--    Cascade target for F-4 (no own deleted_at; filters via parent package).
-- ----------------------------------------------------------------------------
INSERT INTO public.package_photos (id, package_id, storage_url, storage_path, photo_type, sort_order)
VALUES
  ('d04b9cc9-6508-4393-89bf-c088932ee820', '7276aced-ec30-47fa-aca4-6414895d6a39',
   'https://example.test/storage/v1/object/public/package-photos/7276aced-ec30-47fa-aca4-6414895d6a39/seed_0.jpeg',
   '7276aced-ec30-47fa-aca4-6414895d6a39/seed_0.jpeg',
   'content', 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;
