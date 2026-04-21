-- tests/rls/F9_package_photos_parent_binding.sql
-- Locks in migration 025 (F-9 LOW — package_photos parent-binding).
--
-- The v2 photo policies previously checked `p.org_id = auth_org_id()` in
-- addition to the EXISTS subquery against packages. That org check was
-- redundant but visually misleading — it looked like the org match alone
-- was the gate, rather than packages RLS on the parent. 025 removes the
-- redundant check and leaves the parent-binding as the sole visibility
-- rule.
--
-- This test proves the cascade holds by staging a photo on Ana's
-- tombstoned package (hidden from her per 024) and asserting:
--   (A) Ana (CUSTOMER) still sees only her live-package photos. The
--       staged tombstone photo is correctly filtered out because
--       packages_select_v2 hides the tombstone row.
--   (B) Maria (CUSTOMER, no packages) sees 0 photos.
--   (C) Alex (ORG_ADMIN) sees every photo in the org, including the
--       staged tombstone photo — packages_select_v2's non-CUSTOMER
--       branch still allows tombstones through (024 was CUSTOMER-only).
--
-- Regression signal:
--   - If Ana ever sees the staged tombstone photo, the photo policy is
--     no longer binding to packages RLS — the explicit EXISTS was
--     weakened or replaced with a plain org match.
--   - If Alex's count is off, 024's CUSTOMER-only scoping leaked into
--     admin branches (a separate regression but cheap to catch here).

BEGIN;

-- ---------------------------------------------------------------------------
-- Stage ground-truth counts as service_role before any impersonation.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org_total integer;
  v_ana_live  integer;
BEGIN
  SELECT count(*) INTO v_org_total
    FROM public.package_photos pp
    JOIN public.packages      p ON p.id = pp.package_id
   WHERE p.org_id = '00000000-0000-0000-0000-000000000001';

  IF v_org_total < 1 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-9): no package_photos in prod org. Seed regressed.';
  END IF;

  SELECT count(*) INTO v_ana_live
    FROM public.package_photos pp
    JOIN public.packages      p ON p.id = pp.package_id
   WHERE p.customer_id = 'a0000000-0000-0000-0000-000000000007'
     AND p.deleted_at IS NULL;

  IF v_ana_live < 1 THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-9): Ana has no live-package photos. Seed regressed.';
  END IF;

  CREATE TEMP TABLE _f9_expected ON COMMIT DROP AS
    SELECT v_org_total AS org_total_pre_stage,
           v_ana_live  AS ana_live;
END $$;

GRANT SELECT ON _f9_expected TO authenticated;

-- ---------------------------------------------------------------------------
-- STAGE: attach a photo to Ana's tombstoned package (`5acb8135-...`).
-- Running as service_role here — RLS does not gate this write. Post-025,
-- Ana must NOT see this photo because her packages RLS hides the tombstone.
-- ---------------------------------------------------------------------------
INSERT INTO public.package_photos (
  id, package_id, storage_url, storage_path, photo_type, sort_order
) VALUES (
  '00000000-0000-0000-0000-00000000f9ff',
  '5acb8135-702f-4367-be38-b1c2c81ade35',
  'https://example.test/storage/v1/object/public/package-photos/f9-staged.jpeg',
  'f9-staged.jpeg',
  'content',
  99
);

-- ---------------------------------------------------------------------------
-- CASE A: Ana (CUSTOMER) — tombstone-staged photo must NOT be visible.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated","email":"ana.martinez@example.com"}',
  true
);

DO $$
DECLARE
  v_visible  integer;
  v_expected integer;
BEGIN
  SELECT ana_live INTO v_expected FROM _f9_expected;
  SELECT count(*) INTO v_visible  FROM public.package_photos;

  IF v_visible <> v_expected THEN
    RAISE EXCEPTION
      'TEST FAIL (F-9 Ana SELECT): CUSTOMER saw % photos, expected % (live-package photos only). The staged tombstone photo leaked — photos_select_v2 no longer binds to packages RLS.',
      v_visible, v_expected;
  END IF;
  RAISE NOTICE 'TEST PASS (F-9 Ana SELECT): CUSTOMER sees % photo(s); staged tombstone photo correctly hidden', v_visible;
END $$;

-- ---------------------------------------------------------------------------
-- CASE B: Maria Santos (CUSTOMER, same org, no packages) — 0 photos.
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated","email":"maria.santos@example.com"}',
  true
);

DO $$
DECLARE
  v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible FROM public.package_photos;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-9 Maria SELECT): CUSTOMER with no packages saw % photos, expected 0. Cross-customer photo leak.',
      v_visible;
  END IF;
  RAISE NOTICE 'TEST PASS (F-9 Maria SELECT): CUSTOMER with no packages sees 0 photos';
END $$;

-- ---------------------------------------------------------------------------
-- CASE C: Alex (ORG_ADMIN) — sees every org photo INCLUDING the staged one
-- (admin branch allows tombstoned parents through per 024's scope decision).
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"4109f9a3-9c51-4096-91de-09223cbd9203","role":"authenticated","email":"lessaenterprises@gmail.com"}',
  true
);

DO $$
DECLARE
  v_visible  integer;
  v_expected integer;
BEGIN
  -- +1 for the staged tombstone photo.
  SELECT org_total_pre_stage + 1 INTO v_expected FROM _f9_expected;
  SELECT count(*) INTO v_visible FROM public.package_photos;

  IF v_visible <> v_expected THEN
    RAISE EXCEPTION
      'TEST FAIL (F-9 Alex SELECT): ORG_ADMIN saw % photos, expected % (every org photo including the staged tombstone). Either photos_select_v2 regressed for admins, or 024''s deleted_at filter leaked into the non-CUSTOMER branch.',
      v_visible, v_expected;
  END IF;
  RAISE NOTICE 'TEST PASS (F-9 Alex SELECT): ORG_ADMIN sees all % photo(s) including the staged tombstone', v_visible;
END $$;

ROLLBACK;
