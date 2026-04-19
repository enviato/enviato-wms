-- ============================================================
-- 009: Pricing tiers + commodity rate overrides
-- ============================================================
-- Adds customer-facing pricing configuration used by the
-- AWB → invoice generation flow. A pricing_tier groups a base
-- rate, fees, and currency; commodity_rates override the base
-- rate for specific commodities. Customers are assigned to
-- a tier via users.pricing_tier_id.
-- ============================================================

-- ── 1. pricing_tiers table ──

CREATE TABLE IF NOT EXISTS pricing_tiers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  tier_type        TEXT NOT NULL
                   CHECK (tier_type IN ('retail', 'commercial', 'agent')),
  base_rate_per_lb NUMERIC(10, 4) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'USD',
  delivery_fee     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  hazmat_fee       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_default       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Tier names are unique within an org
  UNIQUE (org_id, name),
  -- Rates and fees cannot be negative
  CHECK (base_rate_per_lb >= 0),
  CHECK (delivery_fee >= 0),
  CHECK (hazmat_fee >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_org
  ON pricing_tiers (org_id);

-- At most one default tier per org. Swapping defaults requires
-- unsetting the previous one first (app code handles this).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_tiers_one_default_per_org
  ON pricing_tiers (org_id)
  WHERE is_default = TRUE;

-- ── 2. pricing_tier_commodity_rates table ──

CREATE TABLE IF NOT EXISTS pricing_tier_commodity_rates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_tier_id  UUID NOT NULL
                   REFERENCES pricing_tiers(id) ON DELETE CASCADE,
  commodity_name   TEXT NOT NULL,
  rate_per_lb      NUMERIC(10, 4) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Each commodity can appear at most once per tier
  UNIQUE (pricing_tier_id, commodity_name),
  CHECK (rate_per_lb >= 0)
);

CREATE INDEX IF NOT EXISTS idx_commodity_rates_tier
  ON pricing_tier_commodity_rates (pricing_tier_id);

-- ── 3. users.pricing_tier_id column + FK + index ──

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pricing_tier_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_pricing_tier_id_fkey'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_pricing_tier_id_fkey
      FOREIGN KEY (pricing_tier_id)
      REFERENCES pricing_tiers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_pricing_tier
  ON users (pricing_tier_id);

-- ── 4. updated_at trigger for pricing_tiers ──

CREATE OR REPLACE FUNCTION set_pricing_tiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pricing_tiers_updated_at ON pricing_tiers;
CREATE TRIGGER trg_pricing_tiers_updated_at
  BEFORE UPDATE ON pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION set_pricing_tiers_updated_at();

-- ── 5. RLS policies ──

ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_tier_commodity_rates ENABLE ROW LEVEL SECURITY;

-- pricing_tiers: any member of the org can read, only ORG_ADMIN can mutate.
-- Matches the pattern established in migration 007 for courier_groups,
-- package_statuses, etc.
CREATE POLICY "pricing_tiers_select_v2" ON pricing_tiers
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "pricing_tiers_insert_v2" ON pricing_tiers
  FOR INSERT WITH CHECK (
    org_id = auth_org_id()
    AND auth_role_v2() = 'ORG_ADMIN'
  );

CREATE POLICY "pricing_tiers_update_v2" ON pricing_tiers
  FOR UPDATE USING (
    org_id = auth_org_id()
    AND auth_role_v2() = 'ORG_ADMIN'
  );

CREATE POLICY "pricing_tiers_delete_v2" ON pricing_tiers
  FOR DELETE USING (
    org_id = auth_org_id()
    AND auth_role_v2() = 'ORG_ADMIN'
  );

-- pricing_tier_commodity_rates: org isolation via the parent tier.
-- Read allowed to all org members (invoice generation reads commodity
-- rates via the frontend supabase client). Mutations restricted to
-- ORG_ADMIN, matching pricing_tiers.
CREATE POLICY "commodity_rates_select_v2" ON pricing_tier_commodity_rates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pricing_tiers t
      WHERE t.id = pricing_tier_commodity_rates.pricing_tier_id
        AND t.org_id = auth_org_id()
    )
  );

CREATE POLICY "commodity_rates_insert_v2" ON pricing_tier_commodity_rates
  FOR INSERT WITH CHECK (
    auth_role_v2() = 'ORG_ADMIN'
    AND EXISTS (
      SELECT 1 FROM pricing_tiers t
      WHERE t.id = pricing_tier_commodity_rates.pricing_tier_id
        AND t.org_id = auth_org_id()
    )
  );

CREATE POLICY "commodity_rates_update_v2" ON pricing_tier_commodity_rates
  FOR UPDATE USING (
    auth_role_v2() = 'ORG_ADMIN'
    AND EXISTS (
      SELECT 1 FROM pricing_tiers t
      WHERE t.id = pricing_tier_commodity_rates.pricing_tier_id
        AND t.org_id = auth_org_id()
    )
  );

CREATE POLICY "commodity_rates_delete_v2" ON pricing_tier_commodity_rates
  FOR DELETE USING (
    auth_role_v2() = 'ORG_ADMIN'
    AND EXISTS (
      SELECT 1 FROM pricing_tiers t
      WHERE t.id = pricing_tier_commodity_rates.pricing_tier_id
        AND t.org_id = auth_org_id()
    )
  );
