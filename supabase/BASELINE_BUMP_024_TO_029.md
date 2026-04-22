# Baseline cutoff bump: 024 → 029

**Date:** 2026-04-21
**Reason:** Migrations 025-029 (Tier 6 RLS audit follow-through — `package_photos` parent binding, invoices RBAC alignment, and the JWT-first claim-resolution rewrite of `custom_access_token_hook` / `get_accessible_agent_ids` / `user_has_permission`) had been replaying on top of the 024 baseline on every CI run. This folds them into the snapshot so CI's post-cutoff replay loop is empty again.

## Approach

Surgical in-place update rather than full re-dump. Verified that 025-029 are pure function/policy rewrites — no new tables, columns, indexes, foreign keys, or enums — so the structural body of `_ci_baseline.sql` (tables, FKs, indexes, triggers, RLS-enable statements, reference data, etc.) did not need to change. Only the three mutated functions and four mutated policies were replaced, using canonical post-029 text from MCP introspection against prod project `ilguqphtephoqlshgpza`.

This gives the smallest reviewable diff while keeping prod as the source of truth for the new function/policy text.

## Files touched

| File | Change |
| --- | --- |
| `supabase/_ci_baseline.cutoff` | `024` → `029` |
| `supabase/_ci_baseline.sql` | Header "state at migration 024" → "029". Replaced bodies of `custom_access_token_hook`, `get_accessible_agent_ids`, `user_has_permission`. Rewrote `invoices_select_v2`, `photos_select_v2`, `photos_insert_v2`, `photos_delete_v2` to match prod's current policy text. |
| `tests/rls/README.md` | Swept four "024" references that meant "the cutoff" (L86, L105, L127, L148) to "029". Left semantic references to what migration 024 *did* (tombstone filter semantics) unchanged. |
| `.github/workflows/rls-tests.yml` | Swept three "024" cutoff references (L7 header block, L208 "migrations 001-029", L225 "cutoff=029, latest migration=029"). Left the L240 bash octal-parsing example alone — still valid. |

## What didn't change

- Structural counts in `_ci_baseline.sql` (76 policies, 24 functions, 15 enums, 32 `permission_keys` rows, etc.) — migrations 025-029 are net-zero on all of these (`CREATE OR REPLACE` on functions; drop-and-recreate on policies).
- Historical/semantic mentions of "024" in test files (F4, F8, F9) and the `tests/rls/README.md` data-row table — these describe what migration 024's tombstone filter *does*, not what the cutoff is. Correct to keep.
- `tests/rls/F10_global_reference_tables.sql` — its error messages say "regenerate `supabase/_ci_baseline.sql`" without a version number. No edit needed.

## Verification

- MCP introspection against prod was the source of the new function/policy text, so the new baseline captures exactly what prod has today.
- With cutoff now 029 and no migration file with `version > 029` present, the `Apply post-cutoff migrations` step in CI matches nothing and exits silently — the intended steady state.
- Next batch of migrations (030+) will replay on top of this baseline until someone runs another cutoff bump.

## Git — run from Terminal (sandbox can't run git)

```bash
cd "/Users/billionairesclub/Desktop/Shipment Photos/ENVIATO_WMS/enviato-dashboard"

git add \
  supabase/_ci_baseline.cutoff \
  supabase/_ci_baseline.sql \
  supabase/BASELINE_BUMP_024_TO_029.md \
  tests/rls/README.md \
  .github/workflows/rls-tests.yml

git commit -m "ci(rls): bump baseline cutoff 024 → 029

Fold migrations 025-029 (Tier 6 RLS follow-through: package_photos
parent binding, invoices RBAC alignment, JWT-first claim resolution
in custom_access_token_hook / get_accessible_agent_ids /
user_has_permission) into the CI baseline so the post-cutoff replay
loop is empty again.

Surgical in-place update — 025-029 are function/policy rewrites only
(no new tables, columns, FKs, indexes, or enums), so structural body
of _ci_baseline.sql is unchanged. New function/policy text was
introspected from prod project ilguqphtephoqlshgpza via the Supabase
MCP."
```

Delete `supabase/BASELINE_BUMP_024_TO_029.md` after review if you don't want a breadcrumb file in the repo — it's not referenced by anything.
