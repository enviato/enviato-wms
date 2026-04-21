# RLS regression test harness

Locks in the Tier 6.0 RLS audit fixes (Phase A + Phase B shipped 2026-04-20) against regression. Every SQL file in this directory is an independent, self-contained test that exercises one finding from the audit.

## How to run

Each file is runnable three ways, in increasing order of ceremony:

**1. Paste into Supabase MCP `execute_sql`** (easiest — what Phase A/B used).
   The whole file is `BEGIN; ... ROLLBACK;` so nothing persists. Copy the contents into `execute_sql` and look at the result for `PASS` / `FAIL` notices.

**2. `psql` against a Supabase preview branch or local `supabase db reset` copy.**
   ```bash
   psql "$DATABASE_URL" -f tests/rls/F1_self_escalation.sql
   ```
   On pass: NOTICEs print `TEST PASS: ...`. On fail: the script aborts with an `ERROR: TEST FAIL: ...` explaining what regressed.

**3. Run the whole suite at once:**
   ```bash
   psql "$DATABASE_URL" -f tests/rls/run_all.sql
   ```

## How each test works

Every test follows this shape:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"<user-uuid>","role":"authenticated"}',
  true);

DO $$ BEGIN
  -- exercise the policy
  -- assert expected result with RAISE EXCEPTION on failure
  RAISE NOTICE 'TEST PASS: <what was proved>';
END $$;

ROLLBACK;
```

`SET LOCAL ROLE authenticated` downgrades the connection so Supabase RLS applies. `set_config('request.jwt.claims', ...)` tells the RLS helpers (`auth.uid()`, `auth_org_id()`, `auth_role_v2()`) who the caller is. `ROLLBACK` undoes any staging inserts the test did — no writes ever reach the real DB.

Two assertion shapes show up:

- **Count check** — `IF v_count <> <expected> THEN RAISE EXCEPTION 'TEST FAIL: ...'`. Used when the policy should filter rows to a specific number.
- **Exception check** — wrap the action in `BEGIN ... EXCEPTION WHEN insufficient_privilege THEN ... END;`. Used when the policy should reject the statement outright (SQLSTATE 42501).

## Seed users used by these tests

All from prod org `00000000-0000-0000-0000-000000000001`, seeded by migration 004.

| Role | UUID | Purpose |
|---|---|---|
| ORG_ADMIN | `4109f9a3-9c51-4096-91de-09223cbd9203` | Alex — full-org permissions, positive-case checks |
| WAREHOUSE_STAFF | `a0000000-0000-0000-0000-000000000020` | John — org-wide reads, limited writes |
| AGENT_STAFF | `2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9` | platinumcorp1 — self-escalation attempt victim |
| CUSTOMER (HP5 target) | `a0000000-0000-0000-0000-000000000007` | Ana Martinez (ENV-00003) — 1 live pkg + 1 tombstone, 1 live inv + 1 tombstone, 1 AWB, 4 lines, 1 photo. Post-024 RLS hides the tombstones. |
| CUSTOMER (no data) | `a0000000-0000-0000-0000-000000000001` | Maria Santos (ENV-00001) — used for "legacy customer can't X" denials |

If you add a test for a new finding, prefer computing ground truth at test time via a service-role query rather than hardcoding a count — the Ana fixture may grow.

## Files

| File | Finding | Fix migration |
|---|---|---|
| `F1_self_escalation.sql` | AGENT_STAFF can't UPDATE own `role_v2` to ORG_ADMIN | 016 |
| `F2_agent_id_hijack.sql` | AGENT_STAFF can't reassign own `agent_id` | 016 |
| `F3_unassigned_packages.sql` | No non-admin sees packages with `agent_id IS NULL` | 017 |
| `F4_customer_read_surface.sql` | CUSTOMER sees exactly their own live (non-deleted) packages / invoices / AWBs / lines / photos (HP5 + F-11) | 019 + 024 |
| `F5_invoice_lines_mutations.sql` | ORG_ADMIN UPDATE/DELETE `invoice_lines` works; CUSTOMER/staff-without-permission denied | 020 |
| `F7_role_v2_backfill.sql` | Invariant: no active customer_number user has NULL `role_v2`; column is NOT NULL; INSERT without `role_v2` raises `not_null_violation` | 021 + create-recipient route + 023 |
| `F12_for_all_role_gates.sql` | CUSTOMER can't write to `org_settings` / `tags` / `label_templates` / `warehouse_locations` / `package_tags` | 018 |
| `cross_tenant_isolation.sql` | Org-scoping baseline: no cross-tenant leak on packages; AGENT_STAFF can't UPDATE another user | always-on |
| `run_all.sql` | `\i`-concatenation of all the above in dependency order | — |

## When to run

- Before cutting a release tag.
- After any migration that touches `supabase/migrations/*.sql` under or adjacent to the RLS policy files (016-024 + any new policy migration).
- Before merging any PR that changes helper functions (`auth_role_v2`, `auth_org_id`, `user_has_permission`, `get_accessible_agent_ids`, `custom_access_token_hook`).

## Adding a new test

1. Copy `F1_self_escalation.sql` as a template.
2. Rename to match the finding or invariant.
3. Replace the impersonation block's UUID and the assertion logic.
4. Add a row to the table above.
5. Add a `\i tests/rls/your_new_file.sql` line to `run_all.sql` in the right spot (grouped by severity).
6. Dry-run it via MCP `execute_sql` and confirm the PASS notice fires.
