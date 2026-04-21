-- tests/rls/F2_agent_id_hijack.sql
-- Locks in fix for F-2 (CRITICAL) — same migration as F-1 (016).
--
-- Exploit (pre-016): an AGENT_STAFF could run
--   UPDATE users SET agent_id = '<other-agent-in-org>' WHERE id = auth.uid();
-- and attach themselves to another agent in the same tenant, gaining read
-- access to that agent's packages / AWBs / customers. Root cause: same as
-- F-1 — no WITH CHECK binding the new agent_id.
--
-- Fix: 016's WITH CHECK pins agent_id on non-admin self-updates.

BEGIN;

-- Impersonate platinumcorp1 (AGENT_STAFF).
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9","role":"authenticated","email":"platinumcorp1@gmail.com"}',
  true
);

DO $$
DECLARE
  v_rows       integer;
  v_other_agent uuid;
BEGIN
  -- Find another agent in the same org (different from platinumcorp1's agent).
  -- Using service_role would bypass RLS; running this as impersonated means we
  -- can only see what AGENT_STAFF sees via the agents table. Supabase's default
  -- is that agents are visible to same-org users (read), which is enough.
  SELECT a.id
    INTO v_other_agent
    FROM public.agents a
   WHERE a.org_id = public.auth_org_id()
     AND a.id <> COALESCE(
           (SELECT agent_id FROM public.users WHERE id = auth.uid()),
           '00000000-0000-0000-0000-000000000000'::uuid
         )
   LIMIT 1;

  IF v_other_agent IS NULL THEN
    RAISE EXCEPTION
      'TEST SETUP ERROR (F-2): no second agent in the org for platinumcorp1 to attempt hijacking. Seed data regressed.';
  END IF;

  BEGIN
    UPDATE public.users
       SET agent_id = v_other_agent
     WHERE id = auth.uid();
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RAISE EXCEPTION
      'TEST FAIL (F-2 REGRESSION): AGENT_STAFF reassigned own agent_id (% rows). Expected SQLSTATE 42501. Check migration 016 WITH CHECK on agent_id.',
      v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'TEST PASS (F-2): AGENT_STAFF agent_id hijack blocked by RLS (SQLSTATE 42501)';
  END;
END $$;

ROLLBACK;
