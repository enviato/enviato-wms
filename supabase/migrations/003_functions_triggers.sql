-- ============================================================
-- ENVIATO Platform v2.0 — Functions & Triggers
-- Migration 003: Computed columns, AWB counters, invoice calc,
--                new user hook, volume weight
-- ============================================================

-- ============================================================
-- VOLUME WEIGHT & BILLABLE WEIGHT (auto-compute on package)
-- ============================================================

CREATE OR REPLACE FUNCTION compute_package_weights()
RETURNS TRIGGER AS $$
DECLARE
    divisor integer;
    vol_weight decimal(10,2);
    dims_in_inches boolean;
BEGIN
    -- Only compute if we have dimensions
    IF NEW.length IS NOT NULL AND NEW.width IS NOT NULL AND NEW.height IS NOT NULL
       AND NEW.length > 0 AND NEW.width > 0 AND NEW.height > 0 THEN

        -- Get the courier group's volume divisor (default 166 for air)
        SELECT COALESCE(cg.volume_divisor, 166) INTO divisor
        FROM courier_groups cg
        WHERE cg.id = NEW.courier_group_id;

        IF divisor IS NULL THEN
            divisor := 166;
        END IF;

        -- Convert cm to inches if needed
        IF NEW.dim_unit = 'cm' THEN
            vol_weight := (NEW.length / 2.54) * (NEW.width / 2.54) * (NEW.height / 2.54) / divisor;
        ELSE
            vol_weight := NEW.length * NEW.width * NEW.height / divisor;
        END IF;

        NEW.volume_weight := ROUND(vol_weight, 2);

        -- Billable = greater of actual vs volume
        IF NEW.weight IS NOT NULL AND NEW.weight > 0 THEN
            -- Convert weight to lbs for comparison if needed
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
        -- No dimensions, billable = actual weight
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compute_weights
    BEFORE INSERT OR UPDATE OF weight, weight_unit, length, width, height, dim_unit, courier_group_id
    ON packages
    FOR EACH ROW EXECUTE FUNCTION compute_package_weights();

-- ============================================================
-- AWB COUNTERS (auto-update piece counts and weight)
-- ============================================================

CREATE OR REPLACE FUNCTION update_awb_counters()
RETURNS TRIGGER AS $$
DECLARE
    target_awb_id uuid;
BEGIN
    -- Determine which AWB to update
    IF TG_OP = 'DELETE' THEN
        target_awb_id := OLD.awb_id;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If AWB changed, update both old and new
        IF OLD.awb_id IS DISTINCT FROM NEW.awb_id THEN
            -- Update old AWB
            IF OLD.awb_id IS NOT NULL THEN
                UPDATE awbs SET
                    total_pieces = (SELECT COUNT(*) FROM packages WHERE awb_id = OLD.awb_id),
                    total_weight = (SELECT COALESCE(SUM(
                        CASE weight_unit
                            WHEN 'kg' THEN weight * 2.20462
                            WHEN 'oz' THEN weight / 16.0
                            ELSE COALESCE(weight, 0)
                        END
                    ), 0) FROM packages WHERE awb_id = OLD.awb_id),
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

    -- Update the target AWB
    IF target_awb_id IS NOT NULL THEN
        UPDATE awbs SET
            total_pieces = (SELECT COUNT(*) FROM packages WHERE awb_id = target_awb_id),
            total_weight = (SELECT COALESCE(SUM(
                CASE weight_unit
                    WHEN 'kg' THEN weight * 2.20462
                    WHEN 'oz' THEN weight / 16.0
                    ELSE COALESCE(weight, 0)
                END
            ), 0) FROM packages WHERE awb_id = target_awb_id),
            received_pieces = (SELECT COUNT(*) FROM packages WHERE awb_id = target_awb_id AND received_at_dest IS NOT NULL)
        WHERE id = target_awb_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_awb_counters
    AFTER INSERT OR UPDATE OF awb_id, weight, weight_unit, received_at_dest OR DELETE
    ON packages
    FOR EACH ROW EXECUTE FUNCTION update_awb_counters();

-- ============================================================
-- INVOICE TOTALS (auto-compute from lines)
-- ============================================================

CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    target_invoice_id uuid;
    new_subtotal decimal(10,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_invoice_id := OLD.invoice_id;
    ELSE
        target_invoice_id := NEW.invoice_id;
    END IF;

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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_totals
    AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
    FOR EACH ROW EXECUTE FUNCTION update_invoice_totals();

-- ============================================================
-- INVOICE LINE AUTO-CALC (billable_weight × rate = line_total)
-- ============================================================

CREATE OR REPLACE FUNCTION compute_invoice_line()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-calc line_total from billable weight and rate
    IF NEW.billable_weight IS NOT NULL AND NEW.rate_per_lb IS NOT NULL THEN
        NEW.line_total := ROUND(NEW.billable_weight * NEW.rate_per_lb, 2);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_line_calc
    BEFORE INSERT OR UPDATE OF billable_weight, rate_per_lb
    ON invoice_lines
    FOR EACH ROW EXECUTE FUNCTION compute_invoice_line();

-- ============================================================
-- NEW USER HOOK: Create profile row when Supabase Auth creates user
-- Called via Supabase Auth webhook/trigger
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    meta jsonb;
    v_org_id uuid;
    v_role user_role;
    v_courier_group_id uuid;
BEGIN
    meta := NEW.raw_user_meta_data;

    -- These values are set when inviting users via the admin dashboard
    v_org_id := (meta->>'org_id')::uuid;
    v_role := COALESCE((meta->>'role')::user_role, 'customer');
    v_courier_group_id := (meta->>'courier_group_id')::uuid;

    -- Only create profile if org_id was provided (invited user)
    IF v_org_id IS NOT NULL THEN
        INSERT INTO users (id, org_id, email, first_name, last_name, role, courier_group_id)
        VALUES (
            NEW.id,
            v_org_id,
            NEW.email,
            COALESCE(meta->>'first_name', ''),
            COALESCE(meta->>'last_name', ''),
            v_role,
            v_courier_group_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on Supabase auth.users table
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SEQUENTIAL INVOICE NUMBER GENERATOR
-- Format: {COURIER_CODE}-{YEAR}-{SEQ} e.g. NWGY-2026-0042
-- ============================================================

CREATE SEQUENCE invoice_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number(p_courier_group_id uuid)
RETURNS text AS $$
DECLARE
    courier_code text;
    seq_val integer;
BEGIN
    SELECT code INTO courier_code
    FROM courier_groups WHERE id = p_courier_group_id;

    seq_val := nextval('invoice_seq');

    RETURN courier_code || '-' || EXTRACT(YEAR FROM now())::text || '-' || LPAD(seq_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUZZY NAME MATCHING FUNCTION
-- Used during scanning to match extracted names to customers
-- ============================================================

CREATE OR REPLACE FUNCTION match_customer_by_name(
    p_org_id uuid,
    p_name text,
    p_courier_group_id uuid DEFAULT NULL
)
RETURNS TABLE (
    user_id uuid,
    full_name text,
    similarity_score real,
    courier_group_id uuid
) AS $$
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
          -- Also check aliases
          OR EXISTS (
              SELECT 1 FROM unnest(u.aliases) alias
              WHERE similarity(p_name, alias) > 0.3
                 OR p_name ILIKE '%' || alias || '%'
          )
      )
    ORDER BY similarity(p_name, u.first_name || ' ' || u.last_name) DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
