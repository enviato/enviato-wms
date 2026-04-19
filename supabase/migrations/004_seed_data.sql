-- ============================================================
-- ENVIATO Platform v2.0 — Seed Data
-- Migration 004: Initial org, courier group, admin user
-- Run AFTER creating Alex's Supabase Auth account via magic link
-- ============================================================
-- INSTRUCTIONS:
-- 1. Create Supabase project at https://supabase.com
-- 2. Run migrations 001-003 first
-- 3. Sign up Alex via magic link (lessaenterprises@gmail.com)
-- 4. Get the auth.users UUID from Supabase dashboard
-- 5. Replace 'REPLACE_WITH_AUTH_UUID' below with that UUID
-- 6. Run this migration
-- ============================================================

-- Create the Enviato organization
INSERT INTO organizations (id, name, slug, address, settings, plan_tier)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Enviato Warehouse',
    'enviato',
    '{"street": "", "city": "Miami", "state": "FL", "zip": "", "country": "US"}',
    '{
        "cloudinary_cloud": "dnkoiazhl",
        "cloudinary_preset": "enviato_wms",
        "default_group": "NWGY",
        "timezone": "America/New_York",
        "notifications_enabled": true
    }',
    'pro'
);

-- Create NWGY courier group
INSERT INTO courier_groups (id, org_id, name, code, country, pricing_model, rate_per_lb, volume_divisor, currency)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'NWGY',
    'NWGY',
    'Guyana',
    'gross_weight',
    8.50,
    166,
    'USD'
);

-- ============================================================
-- ADMIN USER (run after auth signup)
-- Replace the UUID below with Alex's actual auth.users.id
-- ============================================================
-- INSERT INTO users (id, org_id, email, first_name, last_name, role)
-- VALUES (
--     'REPLACE_WITH_AUTH_UUID',
--     '00000000-0000-0000-0000-000000000001',
--     'lessaenterprises@gmail.com',
--     'Alex',
--     'Lessa',
--     'org_admin'
-- );

-- ============================================================
-- SAMPLE CUSTOMERS (for testing, under NWGY)
-- These will be created via the admin dashboard in production,
-- but here for dev/testing. Auth UUIDs generated fresh.
-- ============================================================

-- Note: In production, customers are invited via magic link.
-- These inserts are for the users table ONLY (no auth.users row).
-- Use supabase.auth.admin.createUser() in Edge Functions
-- to create both auth + profile rows with magic link.

-- ============================================================
-- QUICK SETUP GUIDE
-- ============================================================
-- After running this seed:
--
-- 1. Go to Supabase Dashboard → Authentication → Settings
-- 2. Enable "Magic Link" under Email auth
-- 3. Set Site URL to your Netlify URL (https://enviato.netlify.app)
-- 4. Add redirect URLs:
--    - https://enviato.netlify.app/**
--    - http://localhost:3000/**  (for dev)
--
-- 5. Go to SQL Editor, run:
--    SELECT * FROM organizations;  -- should see Enviato
--    SELECT * FROM courier_groups; -- should see NWGY
--
-- 6. Sign in as Alex via magic link
-- 7. Manually insert the users row with the auth UUID (see above)
-- 8. You're ready to start scanning!
