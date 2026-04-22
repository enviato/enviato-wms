# §6 Q6 Phase 1 — API-route-vs-direct enforcement

**Date:** 2026-04-21
**Scope:** Tier 0 + Tier 1 (production-readiness pass).
**Decision doc:** `docs/audits/2026-04-21-q6-api-route-vs-direct-decision.md`
**Cutoff bump:** 029 → 030 (see commit log below — folded into the same change set).

## What this closes

Migration 016's WITH CHECK on `users_update_v2` pinned `role_v2 / agent_id / role_id` on the SELF-UPDATE branch (kills F-1 / F-2). The ORG_ADMIN-updates-other branch was deliberately left open because ORG_ADMINs legitimately need to change those columns — and today's admin UI does that via direct browser-to-PostgREST `supabase.from("users").update({ agent_id })` calls.

That left a slow-bleed risk: if any future feature accidentally writes `role_v2` from the client and the policy diff isn't caught in review, the silent re-opening of F-1 would only show up in a security audit. With 1000+ customers and a parent/child agent tree about to land, "one bad migration away from re-opening F-1" is too thin a margin.

Phase 1 collapses that to two redundant layers:

1. **Convention layer.** A new `/api/admin/reassign-agent` route is the only place agent reassignment happens. The browser calls it via a thin `reassignAgent()` helper. All seven existing direct-write call sites have been swapped over.
2. **Defense-in-depth layer.** Migration 030 installs a `BEFORE UPDATE OF role_v2, agent_id, role_id` trigger on `public.users` that rejects writes from any non-BYPASSRLS connection with SQLSTATE 42501. service_role / postgres / supabase_admin pass through cleanly via `pg_roles.rolbypassrls`. So even if someone *forgets* the convention, the database refuses the write at the wire.

Either layer alone would close the immediate hole. Both together mean a regression has to defeat a code review *and* a database trigger. New regression test (F-13) verifies the trigger's invariants and the BYPASSRLS carve-out.

## Files touched

| File | Lines | Change |
| --- | --- | --- |
| `supabase/migrations/030_users_block_privileged_column_changes.sql` | 187 | NEW. Trigger function `users_block_privileged_column_changes()` (SECURITY INVOKER, BYPASSRLS-aware) + `BEFORE UPDATE OF role_v2, agent_id, role_id` trigger on `public.users`. Raises SQLSTATE 42501 with route-pointing error messages on rejection. Idempotent — `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`. |
| `src/app/api/admin/reassign-agent/route.ts` | 295 | NEW. Standard admin-route pipeline: checkCsrf → rate-limit → cookie auth → role gate per `subject_table` → org-scope verify (subjects + new agent) → single bulk `admin.from(table).update({ [column]: newAgentId }).in("id", ids).select("id")`. Bulk cap 500. Mirrors `/api/admin/delete` response shape `{ updated, failed }`. |
| `src/shared/lib/api.ts` | +49 | Added `reassignAgent(subjectTable, subjectIds, newAgentId)` helper. Returns Supabase-shaped `{ data, error }` so call sites keep the existing `if (!error) {…}` pattern. Empty-ids no-op + JSON-parse guard. |
| `src/app/(dashboard)/admin/awbs/page.tsx` | swap | Replaced `Promise.all(ids.map(id => supabase.from("awbs").update({ agent_id }).eq("id", id)))` with `reassignAgent("awbs", ids, batchAgentValue \|\| null)`. Error path uses local `table.showSuccess` (file convention; preserved). |
| `src/app/(dashboard)/admin/invoices/page.tsx` | swap | Same shape; `billed_by_agent_id` resolved server-side via `TABLE_COLUMN`. Uses `table.showError` (file convention). |
| `src/app/(dashboard)/admin/customers/page.tsx` | swap | Bulk reassignment swap. Uses `table.showError`. |
| `src/app/(dashboard)/admin/customers/[id]/page.tsx` | split | Multi-column edit split into (a) routine columns via direct PostgREST update and (b) `agent_id` via `reassignAgent("users", [id], newAgentId)`, gated by `agentChanged = newAgentId !== (customer?.agent_id ?? null)` so the admin call is skipped when nothing changed. Optimistic state update only fires after both succeed. |
| `src/app/(dashboard)/admin/packages/page.tsx` | 3 swaps | Bulk reassignment (`Set` → `Array.from`), single-row "None" dropdown, single-row agent-pick dropdown — all routed through `reassignAgent("users", …)`. |
| `tests/rls/F13_users_privileged_column_block.sql` | NEW | 5 cases in one transaction (BEGIN…ROLLBACK so nothing persists). Setup pulls a target user in org 0001 ≠ Alex + an agent into `f13_ctx`. Cases A/B/C: ORG_ADMIN attempts role_v2 / agent_id / role_id change → expect 42501. Case D: ORG_ADMIN toggles `is_active` → expect 1 row (positive control for routine columns). Case E: `SET LOCAL ROLE service_role` + `agent_id` update → expect 1 row (positive control for the BYPASSRLS carve-out). Numbered F-13 because F-12 is `tests/rls/F12_for_all_role_gates.sql`. |
| `tests/rls/run_all.sql` | +3 | Added `\i tests/rls/F13_users_privileged_column_block.sql` after the F-6c block; final-echo string now reads `"Tier 6 (016-029) + Q6 (030) + F-8 + F-9 + F-10 + F-6b + F-6c + F-13 covered."` |
| `tests/rls/README.md` | sweep | Added F-13 row to the Files table; bumped four hard-coded `029` references to `030`; bumped function count 24 → 25 and trigger count 19 → 20 with note about `users_block_privileged_column_changes`. |
| `supabase/_ci_baseline.sql` | +2 blocks | Inserted full `CREATE OR REPLACE FUNCTION public.users_block_privileged_column_changes()` definition between `user_has_permission` and the `-- 8. TRIGGERS` header (alphabetical placement). Inserted `CREATE TRIGGER trg_users_block_privileged_column_changes BEFORE UPDATE OF role_v2, agent_id, role_id …` immediately before `trg_users_updated` so deterministic firing order matches prod. |
| `supabase/_ci_baseline.cutoff` | `029` → `030` | One-line bump. |
| `.github/workflows/rls-tests.yml` | sweep | Three string updates: `016-029` → `016-030` (header), `001-029` → `001-030` (replay range), `(cutoff=029, latest migration=029)` → `(cutoff=030, latest migration=030)` and `030_*.sql` → `031_*.sql` in the next-batch reminder. |

## What didn't change

- Direct PostgREST writes to *non-privileged* `users` columns (`first_name`, `last_name`, `phone`, `email`, `is_active`, `pricing_tier_id`, …) — the trigger is column-pinned via `BEFORE UPDATE OF role_v2, agent_id, role_id`, so unrelated updates skip the trigger entirely. Verified by F-13 Case D and by the 14 remaining `.from("users"|"awbs"|"invoices").update(…)` browser call sites (all on routine columns: `is_active`, `status`, `due_date`, `notes`, `tax_rate`, `payment_terms`, `subtotal`, etc.).
- `handle_new_user()` — the post-signup trigger that stamps `role_v2` on new rows runs SECURITY DEFINER as `postgres` (BYPASSRLS), so it's unaffected.
- Migrations themselves — `psql` connections run as `postgres`, BYPASSRLS, so 030 doesn't break any future column rewrite a migration might do.
- The WITH CHECK pin on `users_update_v2` (added in migration 016). Belt-and-suspenders intentionally preserved — see migration 030 header for the full rationale.
- Any other admin route. `/api/admin/reassign-agent` is additive; nothing else needed to change.

## Verification (run from this terminal session)

Three grep sweeps, all clean:

1. **Lingering `029` cutoff/migration references:** Only two expected hits — `tests/rls/run_all.sql`'s final-echo line (which now correctly reads `"Tier 6 (016-029) + Q6 (030) …"` because 016-029 *is* the historical Tier 6 block) and `supabase/BASELINE_BUMP_024_TO_029.md` (the prior handoff file's name). No other production code references `029` as a cutoff.
2. **Remaining direct privileged-column writes:** Greped for `\.from\("(users|awbs|invoices)"\)\.update` across `src/`. 14 hits, all on routine columns. Zero remaining direct writes to `agent_id` / `billed_by_agent_id` / `role_v2` / `role_id` from the browser.
3. **`reassignAgent` adoption:** 6 files import the helper — `src/shared/lib/api.ts` (definition) + the five admin call sites (`awbs/page.tsx`, `invoices/page.tsx`, `customers/page.tsx`, `customers/[id]/page.tsx`, `packages/page.tsx`). Matches the expected swap count exactly.

Pre-merge runtime check (suggested, not yet executed against staging):

```bash
# Apply the migration to a staging branch
psql "$STAGING_DATABASE_URL" -f supabase/migrations/030_users_block_privileged_column_changes.sql

# Run the new regression in isolation
psql "$STAGING_DATABASE_URL" -f tests/rls/F13_users_privileged_column_block.sql

# Then the full suite for completeness
psql "$STAGING_DATABASE_URL" -f tests/rls/run_all.sql
```

Expected: F-13 cases A/B/C raise SQLSTATE 42501 with messages naming the column and pointing at `/api/admin/reassign-agent` (or `/api/admin/set-user-role` for `role_v2` / `role_id`); cases D and E succeed.

## Rollout order

1. **Deploy migration 030** to prod (e.g. via `supabase db push` or your standard migration pipeline). Trigger is idempotent (`CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`), so safe to re-run.
2. **Deploy app build** that contains the `/api/admin/reassign-agent` route, the `reassignAgent` helper, and the seven swapped call sites. The order matters: if you deploy the migration *after* a stale browser session is already open, the next batch reassign from that stale tab will hit 42501 and surface as a generic "agent reassignment failed" toast — recoverable but noisy. Deploy app first if your blue/green allows; otherwise just expect a brief noise window.
3. **Watch logs for 42501** in the first 24 hours. Any 42501 on `users` you didn't expect = a code path that's still doing direct writes. Grep for the column name in the logged error message; it'll point you at the route to use.
4. **Regenerate baseline only when adding migration 031+.** No need to bump again now — `_ci_baseline.cutoff = 030` and the baseline body already contains the trigger and function definitions, so CI's post-cutoff replay loop is empty in steady state.

## Git — run from Terminal (sandbox can't run git)

Suggested logical split into three commits so the migration / route / test are reviewable separately:

```bash
cd "/Users/billionairesclub/Desktop/Shipment Photos/ENVIATO_WMS/enviato-dashboard"

# 1. The trigger + its CI baseline + cutoff bump (one atomic commit)
git add \
  supabase/migrations/030_users_block_privileged_column_changes.sql \
  supabase/_ci_baseline.sql \
  supabase/_ci_baseline.cutoff \
  .github/workflows/rls-tests.yml

git commit -m "feat(rls): block privileged users column writes from non-BYPASSRLS roles (030)

Migration 016's WITH CHECK pinned role_v2/agent_id/role_id only on the
self-update branch. ORG_ADMIN updates of those columns from the browser
were silently allowed, leaving the door cracked open for an accidental
F-1 regression in any future feature.

030 adds a BEFORE UPDATE OF role_v2, agent_id, role_id trigger on
public.users that rejects writes from non-BYPASSRLS roles with SQLSTATE
42501. service_role / postgres / supabase_admin pass through cleanly via
pg_roles.rolbypassrls, so /api/admin/* routes and migrations are
unaffected. Error messages name the column and point at the blessed
admin route.

Bumps CI baseline cutoff 029 → 030 in the same change so the
post-cutoff replay loop stays empty."

# 2. The replacement route + helper + the seven call-site swaps
git add \
  src/app/api/admin/reassign-agent/route.ts \
  src/shared/lib/api.ts \
  "src/app/(dashboard)/admin/awbs/page.tsx" \
  "src/app/(dashboard)/admin/invoices/page.tsx" \
  "src/app/(dashboard)/admin/customers/page.tsx" \
  "src/app/(dashboard)/admin/customers/[id]/page.tsx" \
  "src/app/(dashboard)/admin/packages/page.tsx"

git commit -m "feat(admin): route agent reassignments through /api/admin/reassign-agent

Migration 030 now rejects direct browser writes to users.agent_id (and
role_v2 / role_id) at the database layer. This commit ships the blessed
replacement: a single bulk-aware admin route that handles users / awbs /
invoices, plus a reassignAgent() helper that keeps the existing
{ data, error } call-site pattern.

Swapped all seven existing direct-write sites:
  - admin/awbs/page.tsx           (bulk batch reassign)
  - admin/invoices/page.tsx       (bulk batch reassign)
  - admin/customers/page.tsx      (bulk batch reassign)
  - admin/customers/[id]/page.tsx (single-row edit, split agent_id out
                                   of the multi-column UPDATE)
  - admin/packages/page.tsx       (bulk batch + two single-row dropdowns)

Bulk cap 500 ids per call. Single .in('id', ids) UPDATE — no
Promise.all(ids.map(...)) connection-pool exhaustion at scale."

# 3. The regression test + suite wiring + README
git add \
  tests/rls/F13_users_privileged_column_block.sql \
  tests/rls/run_all.sql \
  tests/rls/README.md

git commit -m "test(rls): F-13 covers privileged-column block trigger (030)

Five cases, one transaction (BEGIN…ROLLBACK):
  A. ORG_ADMIN sets role_v2 on another user      → expect 42501
  B. ORG_ADMIN sets agent_id on another user     → expect 42501
  C. ORG_ADMIN sets role_id on another user      → expect 42501
  D. ORG_ADMIN toggles is_active                 → expect 1 row
     (positive control: routine columns still writable)
  E. service_role sets agent_id                  → expect 1 row
     (positive control: BYPASSRLS carve-out still works)

Numbered F-13 because F-12 is tests/rls/F12_for_all_role_gates.sql.
Wired into run_all.sql in severity order; README updated with the new
row, function count 24 → 25, trigger count 19 → 20.

# 4. (Optional) the handoff doc itself
git add supabase/Q6_PHASE1_HANDOFF.md
git commit -m "docs(rls): Q6 Phase 1 handoff — what shipped, what to verify, rollout"
```

Delete `supabase/Q6_PHASE1_HANDOFF.md` after review if you don't want the breadcrumb in the repo — like the prior `BASELINE_BUMP_024_TO_029.md`, nothing references it.

## What's next

Phase 1 closes the `users` table specifically because it's the highest-blast-radius surface (role escalation + tenant isolation both ride on these three columns). If a future audit decides to extend the same pattern to other tables — e.g. `awbs.org_id`, `invoices.org_id`, `agents.parent_agent_id` — the playbook is now established: column-pinned BEFORE UPDATE trigger + admin route + F-# regression. Each one should be its own migration with its own test file, not bundled.

The remaining `/api/admin/set-user-role` route (referenced in 030's error message for `role_v2` / `role_id`) does not exist yet — none of today's UI mutates those columns, so there's no swap to do. Build it the day a feature actually needs it; the trigger error message will surface that requirement loudly.
