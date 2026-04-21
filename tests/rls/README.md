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
| `F8_invoices_rbac_rls_alignment.sql` | AGENT_STAFF sees 0 invoices by default (no `invoices:view` permission); sees their accessible-tree invoices once `user_permissions` grants `invoices:view`. ORG_ADMIN / CUSTOMER branches unchanged | 026 |
| `F9_package_photos_parent_binding.sql` | `package_photos` visibility tracks packages RLS on the parent — no vestigial org-match check. Stages a photo on Ana's tombstone to prove CUSTOMER can't see it while ORG_ADMIN can | 025 |
| `F10_global_reference_tables.sql` | Invariant: `permission_keys` + `role_permission_defaults` are globally readable (every authenticated user sees every row), and writes are default-deny for every role including ORG_ADMIN — only service_role can mutate | none (intentional, locked in by test) |
| `F12_for_all_role_gates.sql` | CUSTOMER can't write to `org_settings` / `tags` / `label_templates` / `warehouse_locations` / `package_tags` | 018 |
| `cross_tenant_isolation.sql` | Org-scoping baseline: no cross-tenant leak on packages; AGENT_STAFF can't UPDATE another user | always-on |
| `run_all.sql` | `\i`-concatenation of all the above in dependency order | — |

## When to run

- Before cutting a release tag.
- After any migration that touches `supabase/migrations/*.sql` under or adjacent to the RLS policy files (016-024 + any new policy migration).
- Before merging any PR that changes helper functions (`auth_role_v2`, `auth_org_id`, `user_has_permission`, `get_accessible_agent_ids`, `custom_access_token_hook`).

## CI

The suite runs automatically in GitHub Actions via [`.github/workflows/rls-tests.yml`](../../.github/workflows/rls-tests.yml). It triggers on PRs and pushes to `main` that touch:

- `supabase/migrations/**` — schema or policy changes
- `supabase/seed.sql` — fixture changes
- `supabase/_ci_baseline.sql` — schema snapshot regenerated
- `supabase/_ci_baseline.cutoff` — snapshot cutoff bumped
- `supabase/config.toml` — local stack config
- `tests/rls/**` — test changes
- The workflow file itself

The CI job:

1. Boots a local Supabase stack via `supabase start` (Postgres 17, matching prod).
2. Applies `supabase/_ci_baseline.sql` — a prod-equivalent schema snapshot reconstructed via Supabase MCP introspection (see "Schema baseline" below for what's in it and how to regenerate).
3. Replays any migrations whose numeric prefix is **strictly greater** than the version in `supabase/_ci_baseline.cutoff`. Today the cutoff is `024`, so this loop matches nothing; once someone adds `025_*.sql` it runs that migration here.
4. Loads `supabase/seed.sql`.
5. Verifies the seed produced the expected fixture shape (5 users, Ana with 2 packages + 2 invoices, ORG_ADMIN role carries `invoices:edit`). Fails fast with a clear error if not.
6. Runs `psql -v ON_ERROR_STOP=1 -f tests/rls/run_all.sql`. Any `RAISE EXCEPTION` from an assertion aborts the whole run.
7. On success, dumps `pg_policies` to the Actions log so reviewers can confirm policies match what the PR claims.

`ON_ERROR_STOP=1` is mandatory — without it, psql prints the error and continues, masking failures. The workflow sets it on every psql invocation.

### Why not `supabase db reset`?

Migrations 001-009 were written before prod had drifted. Several tables, helpers, and enums were later created out-of-band via Supabase Studio and never backfilled into a numbered migration. `supabase db reset` replays migrations in filename order and breaks when later migrations reference objects the early migrations don't create.

The baseline-plus-cutoff design sidesteps that: CI applies a faithful snapshot of prod's actual schema (including the out-of-band objects), then layers only post-cutoff migrations on top.

### Reproducing CI locally

The same commands the workflow uses work locally if you have the Supabase CLI installed:

```bash
supabase start
psql "postgresql://postgres:postgres@localhost:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/_ci_baseline.sql
# Replay anything > the cutoff version (currently 024 — none today):
cutoff=$(tr -d '[:space:]' < supabase/_ci_baseline.cutoff)
for f in $(ls supabase/migrations/*.sql | sort); do
  ver=$(basename "$f" | cut -d_ -f1 | sed 's/^0*//'); ver=${ver:-0}
  if (( ver > cutoff )); then
    psql "postgresql://postgres:postgres@localhost:54322/postgres" \
      -v ON_ERROR_STOP=1 -f "$f"
  fi
done
psql "postgresql://postgres:postgres@localhost:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "postgresql://postgres:postgres@localhost:54322/postgres" \
  -v ON_ERROR_STOP=1 -f tests/rls/run_all.sql
```

### Fixtures

`supabase/seed.sql` seeds the cast referenced in the table above (Alex, Ana, Maria, John, platinumcorp1) plus Ana's 2 packages, 2 invoices, 1 AWB, 4 invoice lines, 1 photo, the agent tree (ENV → SnapShop → MTX), 5 system roles + their 67 permissions, the UPS / LATAM courier groups, and 1 tag. The data was dumped from prod org `0...001` on 2026-04-20 — see the file header for the regeneration recipe.

## Schema baseline

`supabase/_ci_baseline.sql` is a hand-stitched, pg_dump-equivalent snapshot of the **public schema** of prod project `ilguqphtephoqlshgpza` as it existed at migration `024` (recorded in `supabase/_ci_baseline.cutoff`). It is the only thing CI uses to construct the schema; the workflow does **not** call `supabase db reset`.

The snapshot deliberately includes only what an empty Supabase Postgres lacks:

- 3 extensions (`uuid-ossp`, `pgcrypto`, `pg_trgm`) — `pg_graphql`, `pg_stat_statements`, and `supabase_vault` are pre-installed by the Supabase image and skipped.
- 15 enum types in `public` (`user_role`, `user_role_v2`, `package_type`, statuses, etc.).
- The `invoice_seq` sequence.
- 28 `CREATE TABLE` statements, with primary keys / unique / check constraints inline.
- All foreign keys as separate `ALTER TABLE ... ADD CONSTRAINT` statements (so table create order doesn't have to be topological).
- ~110 secondary indexes (btree, gin trigram, partial `WHERE`).
- 24 functions (the `auth_*` helpers, `user_has_permission`, `get_accessible_agent_ids`, `custom_access_token_hook`, `handle_new_user`, all trigger functions).
- 19 triggers.
- 28 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements.
- 76 `CREATE POLICY` statements — every CUSTOMER-facing SELECT policy already includes the `deleted_at IS NULL` filter from migration 024, and every policy uses the `( SELECT auth_org_id() )` initplan-wrap pattern from migration 011.
- 32 `permission_keys` rows under "11. REFERENCE / LOOKUP DATA" — the global permission catalog that pre-024 migrations `INSERT`ed and that `role_permissions` / `user_permissions` FK to. Schema-only dumps drop these.
- 65 `role_permission_defaults` rows in the same section — the global "this role gets these permissions by default" map (AGENT_ADMIN 19, AGENT_STAFF 3, ORG_ADMIN 32, WAREHOUSE_STAFF 11; CUSTOMER has 0, default-deny by design). `user_has_permission()` reads **this** table, not the per-org `role_permissions` table — so without these rows, every authorization check silently returns false and positive-path mutation tests (F-5, F-7, etc.) fail with 0-rows-affected.

What it does **not** include: the `auth.*` schema (Supabase provides it), `storage.*` (same), grants to the `service_role` / `authenticated` / `anon` roles (Supabase provides those roles and the default privileges), and the Tier 5 JWT claims hook configuration (set on the project via `auth.config`, not via SQL).

### Regenerating the baseline

Bump the cutoff and regenerate the snapshot whenever:

- A new migration is merged that you want CI to treat as "already applied" rather than replay each run.
- Out-of-band schema changes get made via Studio (try not to — but if it happens, the snapshot is the system of record).
- The functions, policies, or default privileges drift from what the snapshot reflects.

The snapshot was originally built by introspecting prod via the Supabase MCP. The 10 queries below reproduce the source data; assemble them into `_ci_baseline.sql` in the order shown.

```sql
-- 1. Extensions worth replaying (skip the Supabase-provided ones)
SELECT extname, extnamespace::regnamespace AS schema, extversion
  FROM pg_extension
 WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm');

-- 2. Enum types in public, with their values in sortorder
SELECT t.typname,
       array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname = 'public'
 GROUP BY t.typname
 ORDER BY t.typname;

-- 3. Sequences in public
SELECT sequencename, start_value, min_value, max_value, increment_by, cycle
  FROM pg_sequences
 WHERE schemaname = 'public';

-- 4. Tables + columns. Run in alphabetic batches if the result blows up
--    the MCP token cap (the `WHERE table_name <op> '...'` pattern in the
--    transcript split it into 4 chunks).
SELECT table_name,
       column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       NOT a.attnotnull AS is_nullable,
       pg_get_expr(d.adbin, d.adrelid) AS default_expr,
       a.attnum
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  JOIN information_schema.tables t
    ON t.table_schema = n.nspname AND t.table_name = c.relname
 WHERE n.nspname = 'public'
   AND a.attnum > 0
   AND NOT a.attisdropped
   AND t.table_type = 'BASE TABLE'
 ORDER BY table_name, a.attnum;

-- 5. Constraints (PK / UNIQUE / CHECK / FK) — keep PK/UNIQUE/CHECK inline
--    in the CREATE TABLE; emit FKs as separate ALTER TABLE statements.
SELECT conrelid::regclass AS table_name,
       conname,
       contype,        -- p = PK, u = UNIQUE, c = CHECK, f = FK
       pg_get_constraintdef(oid, true) AS definition
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace
 ORDER BY conrelid::regclass::text, contype, conname;

-- 6. Indexes (skip the ones backing constraints — those come for free
--    with the CREATE TABLE / ALTER TABLE in step 5)
SELECT schemaname, tablename, indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname NOT IN (
     SELECT conname FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND contype IN ('p', 'u')
   )
 ORDER BY tablename, indexname;

-- 7. Functions (includes the auth_* helpers and trigger functions)
SELECT n.nspname AS schema, p.proname,
       pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
 ORDER BY p.proname;

-- 8. Triggers (skip the constraint triggers Postgres adds for FKs)
SELECT n.nspname AS schema,
       c.relname AS table_name,
       t.tgname,
       pg_get_triggerdef(t.oid, true) AS definition
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND NOT t.tgisinternal
 ORDER BY c.relname, t.tgname;

-- 9. RLS policies (the whole reason this snapshot exists)
SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;

-- 10. Reference / lookup data. Dump every row from tables that have no
--     org_id (so they're global) and are populated by migrations, not by
--     tenant runtime. These rows have to be in the baseline because the
--     schema-only dump above drops the migrations' INSERT statements and
--     tenant FKs (role_permissions.permission_key, user_permissions.permission_key)
--     resolve to them.
--
-- First list the candidate tables, then dump each one.
SELECT t.table_name
  FROM information_schema.tables t
 WHERE t.table_schema = 'public'
   AND NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = t.table_schema
        AND c.table_name   = t.table_name
        AND c.column_name  = 'org_id'
   )
 ORDER BY t.table_name;
-- Today this returns: permission_keys, role_permission_defaults.
-- Both belong in the baseline under `11. REFERENCE / LOOKUP DATA` with
-- `ON CONFLICT (id) DO NOTHING` so the block is re-runnable.
--
-- permission_keys is the global permission catalog; role_permissions
-- and user_permissions have FKs that resolve here.
--
-- role_permission_defaults is the global role→permission default map.
-- It's NOT directly FK'd from any tenant row, but user_has_permission()
-- reads it to decide whether a role carries a permission when there's
-- no user_permissions override. Leaving it empty makes every positive
-- authorization check silently return false — the bug that F-5's
-- "ORG_ADMIN UPDATE invoice_line → 0 rows" failure first surfaced.
SELECT id, category, description, is_hard_constraint
  FROM public.permission_keys
 ORDER BY category, id;

SELECT id, role, permission_key, created_at
  FROM public.role_permission_defaults
 ORDER BY role, permission_key;
```

After regenerating:

1. Overwrite `supabase/_ci_baseline.sql` with the new dump. Keep the section ordering (extensions → enums → sequences → tables → FKs → indexes → functions → triggers → RLS enable → policies → reference data) so a fresh psql run never references something not yet created.
2. Update `supabase/_ci_baseline.cutoff` to the highest migration version the new dump reflects.
3. Open the PR. CI runs the new baseline against the suite — green PR means the snapshot still satisfies every policy assertion.

## Adding a new test

1. Copy `F1_self_escalation.sql` as a template.
2. Rename to match the finding or invariant.
3. Replace the impersonation block's UUID and the assertion logic.
4. Add a row to the table above.
5. Add a `\i tests/rls/your_new_file.sql` line to `run_all.sql` in the right spot (grouped by severity).
6. Dry-run it via MCP `execute_sql` and confirm the PASS notice fires.
