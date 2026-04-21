-- tests/rls/F1_self_escalation.sql
-- Locks in fix for F-1 (CRITICAL) — migration 016_users_update_with_check.sql.
--
-- Exploit (pre-016): any authenticated user could run
--   UPDATE users SET role_v2 = 'ORG_ADMIN' WHERE id = auth.uid();
-- and escalate to full tenant admin via one supabase-js call from the browser.
--
-- Fix: users_update_v2 got an explicit WITH CHECK clause that pins role_v2,
-- agent_id, and role_id on non-admin self-updates. Attempting to change any
-- of those columns now fails with SQLSTATE 42501.
--
-- Regression signal: if this test STOPS raising 42501, the WITH CHECK has
-- been removed or weakened. Investigate before merging.

BEGIN;

-- Impersonate platinumcorp1 (AGENT_STAFF, org 00000000-...0001).
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9","role":"authenticated","email":"platinumcorp1@gmail.com"}',
  true
);

DO $$
DECLARE
  v_rows integer;
BEGIN
  -- Expected: RLS rejects the write with 42501.
  BEGIN
    UPDATE public.users
       SET role_v2 = 'ORG_ADMIN'
     WHERE id = auth.uid();
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- If we got here without an exception, the WITH CHECK is missing/weak.
    RAISE EXCEPTION
      'TEST FAIL (F-1 REGRESSION): AGENT_STAFF self-escalation to ORG_ADMIN succeeded (% rows updated). Expected SQLSTATE 42501. Check migration 016.',
      v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-1): AGENT_STAFF self-escalate blocked by RLS (SQLSTATE 42501)';
  END;

  -- Second check: ensure the non-sensitive fields still work for self-update
  -- (positive case — prevents over-correcting the policy).
  UPDATE public.users
     SET first_name = first_name
   WHERE id = auth.uid();
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'TEST FAIL (F-1 over-tightened): AGENT_STAFF no-op self-update of first_name returned % rows, expected 1. 016 WITH CHECK is too strict.',
      v_rows;
  END IF;

  RAISE NOTICE 'TEST PASS (F-1 positive): AGENT_STAFF can still self-update non-sensitive fields';
END $$;

ROLLBACK;
