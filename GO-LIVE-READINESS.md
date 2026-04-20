# ENVIATO WMS V2 — Go-Live Readiness Assessment

**Updated:** April 19, 2026 (late — Phase 10A applied live)
**Status:** 🟡 **GO-LIVE STILL BLOCKED**, but the three CRITICAL / HIGH in-tenant exploits from the Tier 6.0 RLS audit (F-1, F-2, F-3, F-12) were **remediated live on 2026-04-19**. Migrations 016, 017, 018 were applied via Supabase MCP and all four attack paths are now confirmed blocked by live impersonation tests. The remaining blockers are product-gated (Phase 10B — CUSTOMER read surface, Phase 10F — recipient role backfill + registration fix) and performance/hardening (Phase 10C–10E).

The prior 76-item tracker (P0–P3) remains 76/76 complete. Tier 6.0 audit: **5 of 12 findings fixed** (F-1, F-2, F-3, F-12, partial F-7 scope). 7 remain.

Internal-only single-tenant use remains safe — cross-tenant isolation holds. Remaining in-tenant work is needed before the CUSTOMER / AGENT_ADMIN / AGENT_STAFF surfaces are fully trustworthy.

**Full audit report:** `docs/audits/2026-04-19-tier6-rls-audit.md` (uncommitted — should be committed alongside 016/017/018).

---

## TIER 6.0 RLS AUDIT — HEADLINE FINDINGS (2026-04-19)

All 12 findings detailed in the audit report. The 2 CRITICAL issues were confirmed live via SQL impersonation tests, and the Phase 10A fixes landed on 2026-04-19 (migrations 016, 017, 018 + hotfix 016a). Attack tests re-run post-fix all blocked; all writes ran inside `BEGIN … ROLLBACK`, so production state was only mutated by the three DDL migrations themselves.

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| F-1 | 🔴 CRITICAL | users | `users_update_v2` policy had no `WITH CHECK` — any authenticated user could run `UPDATE users SET role_v2='ORG_ADMIN' WHERE id = auth.uid()` and take over their tenant. | ✅ **Fixed** — migration 016 (+ 016a helper hotfix). Re-test: `ERROR 42501 new row violates RLS policy`. |
| F-2 | 🔴 CRITICAL | users | Same mechanism let any user reassign their own `agent_id` to any other agent in-org, stealing the agent's packages/invoices/AWBs. | ✅ **Fixed** — migration 016 (`WITH CHECK` pins `agent_id` / `role_id` via `IS NOT DISTINCT FROM` helper values). Re-test: `ERROR 42501`. |
| F-3 | 🟠 HIGH | packages | `packages_select_v2` carve-out `OR (agent_id IS NULL)` had no role gate — any CUSTOMER or legacy (`role_v2 IS NULL`) user in-org saw every unassigned package. | ✅ **Fixed** — migration 017 removed the unassigned-package carve-out entirely per owner rule ("packages must always be routed through an agent; unassigned means orphaned data"). |
| F-4 | 🟠 HIGH | packages / invoices / awbs | `CUSTOMER` role exists in the `user_role_v2` enum but **no RLS policy uses `customer_id = auth.uid()`**. Customers literally cannot see their own packages, invoices, or AWBs. | ⬜ Not fixed — Phase 10B (`019_customer_read_surface.sql`). See §HP5 below for the shape decision (scope by `packages.customer_id = auth.uid()` directly, NOT through `agent_id`). |
| F-12 | 🟠 HIGH | org_settings / tags / label_templates / warehouse_locations / package_tags | `FOR ALL` + org-only policies let any in-org user `INSERT` / `UPDATE` / `DELETE`. Legacy customer write on `org_settings` and `tags` confirmed live. | ✅ **Fixed** — migration 018 split `FOR ALL` into `FOR SELECT` (org read) + `FOR INSERT/UPDATE/DELETE` (role-gated). Gates: `org_settings` + `warehouse_locations` = ORG_ADMIN only; `tags` + `label_templates` + `package_tags` = ORG_ADMIN + WAREHOUSE_STAFF. Re-test: legacy-customer INSERT on `tags` → `ERROR 42501`. WAREHOUSE_STAFF UPDATE on `warehouse_locations` → 0 rows (confirms ORG_ADMIN-only rule). |
| F-5 | 🟡 MEDIUM | invoice_lines | No `UPDATE` / `DELETE` policy. Invoice-line delete button at `invoices/[id]/page.tsx:419` silently no-ops for **all** roles including ORG_ADMIN. | ⬜ Not fixed — Phase 10B (`020_invoice_lines_policies.sql`). |
| F-6 | 🟡 MEDIUM | JWT claims | Tier 5.1 `custom_access_token_hook` ships claims (`org_id`, `role_v2`) but RLS helpers (`auth_org_id`, `auth_role_v2`) still do per-query DB lookups — performance win is unrealized. Worsened slightly by 016a adding a fourth DB-backed SECURITY DEFINER helper (`auth_role_id`). | ⬜ Not fixed — Phase 10C (`022_auth_helpers_read_jwt.sql`). |
| F-7 | 🟡 MEDIUM | users backfill | 10 of 14 prod users have `role_v2 = NULL` (legacy). They hit the nullable-role fallback branch in most policies and effectively get org-scoped read access. **Now known to be the root cause of HP5** — all 10 recipient rows (customers) have `role_v2 = NULL`, so they will not hit the CUSTOMER branch when added. | ⬜ Not fixed — Phase 10B (`021_role_v2_backfill.sql`) + **new** Phase 10F (registration-time role assignment — prevents future NULL-role recipients). |
| F-8–F-11 | 🔵 LOW / INFO | various | Documented in the audit report (§4). | ⬜ Not fixed |

**Cross-tenant isolation still holds.** All fixed findings were strictly in-tenant. Phase 10A did not change the cross-tenant posture — cross-tenant SELECT remains blocked, cross-tenant INSERT forgery remains blocked, and self-move across tenants remains blocked (`org_id` check in both `USING` and `WITH CHECK`).

### HP5 anomaly — recipient sees 0 packages (discovered during re-test)

During Phase 10A re-test, Happy Path 5 (a recipient reading their own packages) returned **0 rows** for user Maria Santos (ENV-00004). Root cause investigation surfaced **two stacked pre-existing bugs, neither caused by today's migrations**:

1. All 10 recipients in prod have `role_v2 = NULL` (F-7 cohort). They never hit the CUSTOMER branch of any policy.
2. The `get_accessible_agent_ids()` helper has branches for ORG_ADMIN, WAREHOUSE_STAFF, AGENT_ADMIN, and AGENT_STAFF — **no CUSTOMER branch**. Even after the role backfill lands, customers would still see 0 rows because `packages_select_v2` joins through agent accessibility.

**Correct fix shape (for migration 019):** CUSTOMER package visibility must be scoped by `packages.customer_id = auth.uid()` directly, NOT through `agent_id`. Reason: two recipients belonging to the same agent would otherwise see each other's packages. Mirror the same pattern for `invoices.customer_id`, `awbs.customer_id`, and the `package_photos → packages → customer_id` join.

HP5 is split out as its own workstream (Phase 10B plus new Phase 10F), not a Tier 6.0 regression.

### Live exploit test methodology

Supabase MCP `execute_sql` run inside `BEGIN … ROLLBACK` with `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)`. Seed users exercised against org `00000000-0000-0000-0000-000000000001`:

- ORG_ADMIN — `4109f9a3-…` (lessaenterprises@gmail.com)
- WAREHOUSE_STAFF — `a0000000-…-0020` (john.warehouse)
- AGENT_STAFF — `2e5f8d15-…` (platinumcorp1)
- `role_v2 IS NULL` — `a0000000-…-0001` (maria.santos — legacy "customer")

No AGENT_ADMIN or true CUSTOMER users exist in prod. AGENT_ADMIN branch of `get_accessible_agent_ids()` is **untested against real data**.

---

## PHASE 10 — TIER 6.0 RLS REMEDIATION PLAN

Five-phase rollout per §8 of the audit report. **Phase A landed on 2026-04-19 via Supabase MCP.** Remaining phases B–F are product-gated, performance, or hardening.

### Phase A — Stop the bleeding ✅ COMPLETE (applied live 2026-04-19)

| Migration | Purpose | Finding(s) | Status |
|-----------|---------|-----------|--------|
| `016_users_update_with_check.sql` | Add explicit `WITH CHECK` to `users_update_v2` that forbids changing `role_v2` / `agent_id` / `role_id` for non-ORG_ADMIN callers via `IS NOT DISTINCT FROM (SELECT helper())`. Requires `org_id` unchanged, and requires `id = auth.uid()` for the non-admin branch. Uses SECURITY DEFINER helpers (`auth_role_v2`, `auth_agent_id`, `auth_role_id`) to avoid RLS recursion on `public.users`. | F-1, F-2 | ✅ Applied |
| `016a_auth_role_id_helper_and_fix` (hotfix, consolidated into 016) | First draft of 016 used inline correlated subqueries `(SELECT u.role_v2 FROM users u WHERE u.id=auth.uid())` inside `WITH CHECK`. That triggered `42P17 infinite recursion detected in policy for relation users` at runtime, because the inner `SELECT` was itself RLS-filtered by `users_select_v2`. Fix: route the subqueries through SECURITY DEFINER helpers that bypass RLS. Added new helper `auth_role_id()` to complete the set. The on-disk `016_users_update_with_check.sql` was updated to the consolidated form so the repo matches prod. | F-1, F-2 | ✅ Applied |
| `017_packages_unassigned_role_gate.sql` | Removed the `OR (agent_id IS NULL)` read carve-out on `packages_select_v2` entirely, per the owner's rule that packages must always be routed through an agent (no "legitimately unassigned" packages in the product model). Orphan/retained rows remain visible to ORG_ADMIN only. | F-3 | ✅ Applied |
| `018_for_all_gate_split.sql` | Split `FOR ALL` policies on `org_settings`, `tags`, `label_templates`, `warehouse_locations`, `package_tags` into `FOR SELECT` (org-only read) + `FOR INSERT/UPDATE/DELETE` (role-gated). Gates:  `org_settings` + `warehouse_locations` = ORG_ADMIN only (per owner rule); `tags` + `label_templates` + `package_tags` = ORG_ADMIN + WAREHOUSE_STAFF. | F-12 | ✅ Applied |

**Phase A re-test results (2026-04-19):**

Attack tests (all blocked):
- F-1 — AGENT_STAFF `UPDATE users SET role_v2='ORG_ADMIN' WHERE id=auth.uid()` → `ERROR 42501: new row violates RLS policy`.
- F-2 — AGENT_STAFF `UPDATE users SET agent_id='<other_agent>' WHERE id=auth.uid()` → `ERROR 42501`.
- F-12 — legacy recipient `UPDATE org_settings SET value='...'` → 0 rows (USING rejects).
- F-12 — legacy recipient `INSERT INTO tags (name, org_id) VALUES (...)` → `ERROR 42501: new row violates RLS policy`.
- F-12 — WAREHOUSE_STAFF `UPDATE warehouse_locations SET name='...'` → 0 rows (confirms owner's ORG_ADMIN-only rule for warehouse_locations).

Happy paths:
- HP1 — recipient updates own `phone` → ✅ 1 row affected.
- HP2 — ORG_ADMIN changes another user's `role_v2 → 'WAREHOUSE_STAFF'` → ✅ 1 row affected.
- HP3 — WAREHOUSE_STAFF inserts a `tag` in-org → ✅ 1 row inserted.
- HP4 — ORG_ADMIN updates `warehouse_locations.name` → ✅ 7 rows affected.
- HP5 — recipient `SELECT * FROM packages WHERE customer_id = auth.uid()` → ⚠️ 0 rows. **Pre-existing bug, not a regression**. See HP5 anomaly section above. Deferred to Phase 10B/10F.

**Two key patterns established during Phase A (codified as lessons 24–27 in `architecture.md`):**

1. **WITH CHECK rule.** Every `UPDATE` policy on a table with privilege-carrying columns (role, tenancy, ownership) must have an explicit `WITH CHECK` that pins those columns via `NEW.col IS NOT DISTINCT FROM OLD.col` for non-admin callers. Default `WITH CHECK := USING` is a live exploit vector.
2. **`FOR ALL` split rule.** Default to `FOR SELECT` + `FOR INSERT/UPDATE/DELETE` split. Use `FOR ALL` only when read and write authorization genuinely align, which almost never happens on a customer-facing platform.
3. **SECURITY DEFINER helper rule.** Any policy that needs to look up the caller's current values from the same table must route through a SECURITY DEFINER helper, not an inline correlated subquery — otherwise Postgres re-enters RLS evaluation and throws `42P17 infinite recursion`.
4. **Impersonation-test-before-declaring-good rule.** Every RLS policy ships with a `BEGIN … ROLLBACK` impersonation test in the migration file comment header. Static review passed on F-1/F-2/F-3/F-12; live impersonation caught all four.

### Phase B — Product-gated fixes (blocked on open-question answers)

Six open questions in §6 of the audit report gate these migrations — answers required from product before writing the SQL. HP5 investigation (2026-04-19) clarified the shape of 019: visibility must be scoped by `packages.customer_id = auth.uid()` directly, not through agent_id.

| Migration | Purpose | Finding(s) | Open Q |
|-----------|---------|-----------|--------|
| `019_customer_read_surface.sql` | Add `customer_id = auth.uid()` read policies on `packages`, `invoices`, `invoice_lines`, `awbs`, `package_photos` for `CUSTOMER` role. **HP5 finding:** must use direct `customer_id = auth.uid()` match on each table (or join to the parent table's `customer_id` for `invoice_lines` / `package_photos`). Do NOT extend `get_accessible_agent_ids()` with a CUSTOMER branch — that would cross-leak packages between recipients of the same agent. | F-4 | Q1: customer_id-direct (favored by HP5 analysis) confirmed? |
| `020_invoice_lines_policies.sql` | Add `UPDATE` / `DELETE` policies on `invoice_lines` + confirm the UI delete button at `invoices/[id]/page.tsx:419` is the intended surface. | F-5 | Q3: Should AGENT_STAFF edit invoice lines at all? |
| `021_role_v2_backfill.sql` | Backfill `role_v2` for the 10 legacy NULL users to `CUSTOMER` (HP5 confirmed they are all recipient rows). Without this, migration 019 policies will see 0 customers in prod because the CUSTOMER role branch never matches. | F-7 | Q5: Does `customers_v2.user_id` self-link exist? |

### Phase C — JWT claim consumption (performance)

| Migration | Purpose | Finding(s) | Open Q |
|-----------|---------|-----------|--------|
| `022_auth_helpers_read_jwt.sql` | Rewrite `auth_org_id()` and `auth_role_v2()` to read from `auth.jwt() -> 'app_metadata'` (populated by the Tier 5.1 custom access token hook) instead of per-query DB lookups. | F-6 | Q4: Is 1-hour JWT TTL acceptable given role/org changes require re-login? |

### Phase D — CI test harness

| Migration | Purpose | Finding(s) |
|-----------|---------|-----------|
| `023_rls_test_fixtures.sql` | Seed dedicated test users for each role (`ORG_ADMIN`, `WAREHOUSE_STAFF`, `AGENT_ADMIN`, `AGENT_STAFF`, `CUSTOMER`) in a `test_org` for automated policy testing. | coverage gap §7 |

Add a Vitest / pgTAP-style harness that runs the audit's 13 impersonation scenarios against every PR touching `supabase/migrations/**`. Gate merges on green.

### Phase E — Deferred hardening

| Migration | Purpose | Finding(s) |
|-----------|---------|-----------|
| `024_force_row_security.sql` | `ALTER TABLE … FORCE ROW LEVEL SECURITY` on the tenant-scoped tables so table owner / future migrations cannot bypass RLS accidentally. | F-9 |

### Phase F — Recipient registration & role backfill (new, surfaced by HP5)

HP5 found that even after Phase 10A, recipients still see 0 packages because their `role_v2 = NULL` (never migrated to `CUSTOMER`). This is not just a one-time backfill — it's also a **process bug** in recipient registration, which never assigns `role_v2` at all. Two workstreams:

| Migration / Code Change | Purpose | Finding(s) |
|-----------|---------|-----------|
| `021_role_v2_backfill.sql` (same as Phase B) | Set `role_v2 = 'CUSTOMER'` on the 10 existing NULL-role recipient rows, plus any other NULL rows identified as staff. | F-7 |
| `src/app/api/create-recipient/route.ts` change | Recipient registration must set `role_v2 = 'CUSTOMER'` on the new `users` row. Currently only sets `customer_id` / `agent_id` / org_id; leaves `role_v2` NULL. This is why HP5 was reproducible today and would remain reproducible for every future signup without the code fix. | F-7 + new |
| Optional: `CHECK (role_v2 IS NOT NULL)` on `users` | Once backfill completes, add a `NOT NULL` constraint so no future row can be inserted without a role. | F-7 |

**Dependency graph:** 021 backfill → registration code fix → NOT NULL constraint. Can start immediately once product confirms all 10 legacy NULL rows are recipients (HP5 investigation indicates they are, but spot-check first).

---

## PROGRESS SINCE LAST ASSESSMENT

## PROGRESS SINCE LAST ASSESSMENT

The following items have been **completed** across recent sessions:

| # | Item | Status |
|---|------|--------|
| SB-1 | Sidebar hardcoded user fallback flash | ✅ Fixed — skeleton loading + dynamic org logo/icon |
| SET-1 | Settings page reskin | ✅ Done — card styling, typography, spacing |
| SET-2 | Logo upload to Supabase Storage | ✅ Done — full logo + icon upload in General tab |
| SET-3 | Settings layout width | ✅ Done — max-w-[1140px] container |
| SET-4 | Settings sidebar replacing main nav | ✅ Done — sidebar swaps to settings tabs |
| SET-5 | Popover close-on-outside-click | ✅ Done |
| SET-6 | Overlay animations, hover states | ✅ Done |
| SC-1 | Courier table not full width | ✅ Fixed — sheet-table pattern applied |
| SC-2 | Edit courier functionality | ✅ Done — edit popup with name/code/logo |
| SC-3 | Courier logo upload | ✅ Done — upload in edit modal |
| SU-1 | Users table not full width | ✅ Fixed — sheet-table pattern applied |
| R-2 | Active/inactive toggle in detail page | ✅ Done |
| R-3 | Update email in detail page | ✅ Done |
| S-1 | Search in shipment detail page | ✅ Done |
| SP-1 | Package ID settings width | ✅ Fixed via container |
| SA-1 | Agents settings width | ✅ Fixed via container |
| SW-1 | Warehouse locations width | ✅ Fixed via container |
| ST-1 | Tags settings width | ✅ Fixed via container |
| SS-1 | Statuses settings width | ✅ Fixed via container |
| SC-5 | Courier tab renamed "Agents" → "Courier Companies" | ✅ Done — renamed throughout |
| SC-6 | Add courier org_id fix | ✅ Fixed — was missing `org_id: org.id` in insert |
| SC-7 | Delete courier with verification | ✅ Done — nullifies package refs, deletes, verifies |
| SC-8 | Search bar padding overlap fix | ✅ Fixed — inline `style={{ paddingLeft: 32 }}` overrides `form-input` class |
| SB-3 | Sidebar dynamic org logo | ✅ Done — fetches logo_url from organizations table |
| SB-4 | Sidebar logo icon for collapsed state | ✅ Done — fetches logo_icon_url, clickable to expand |
| SB-5 | Collapsed sidebar chevron overlap fix | ✅ Fixed — chevron hidden when collapsed, logo is clickable |
| SET-7 | Logo icon upload in General tab | ✅ Done — side-by-side full logo + icon upload |
| D-1 | Dashboard page reskin | ✅ Done — gold-standard header, cards, layout |
| D-2 | Dashboard responsive layout | ✅ Done |
| D-3 | Dashboard table width | ✅ Fixed — full width inside container |
| A-1 | Analytics page reskin | ✅ Done — updated design |
| G-3 | Invoice org_id | ✅ Already fixed — dynamically fetches org_id from organizations table |
| I-2 | Create invoice button | ✅ Already working — modal, validation, and submit handler all functional |
| I-4 | Invoice delete | ✅ Fixed — admin delete route now cascade-deletes invoice_lines before invoice |
| S-2 | Shipment delete | ✅ Fixed — admin delete route now nullifies package awb_id before AWB delete |
| R-6 | Portal access label inconsistency | ✅ Fixed — detail page label changed from "Account" to "Portal Access", badge from "Inactive" to "Off" |
| A-2 | Analytics performance | ✅ Already optimized — 4 bulk queries with Promise.all() instead of 90+ per-date queries |
| R-1 | Remove courier group from recipient form | ✅ Already done — courier_group_id hardcoded to null, no form field |
| I-1 | Remove courier group from invoice form | ✅ Already done — same pattern |
| SA-2 | Agents save button | ✅ Already working — handleSaveAgentInfo handler at line 2896 |
| SW-2 | Warehouse location edit | ✅ Done — edit modal with name/code/customer/description fields |
| SW-3 | Warehouse location delete | ✅ Done — delete with confirmation dialog |
| SW-5 | Warehouse location status toggle | ✅ Done — clickable badge toggles active/inactive |
| ST-2 | Tag edit | ✅ Done — edit modal with name input and color picker |
| G-1 | Soft-delete/archive system | ✅ Done — `deleted_at` column on 7 tables, all handlers soft-delete, all queries filter |
| G-2 | Delete confirmation dialogs | ✅ Done — Reusable `ConfirmDialog` component, added to tags + statuses |
| USR-1 | User soft-delete system | ✅ Done — archive/restore/permanent-delete lifecycle with auth banning |
| USR-2 | Archived user badge on packages | ✅ Done — "Archived" badge on packages with deleted customers |
| AGT-1 | Agent linking/unlinking | ✅ Done — `unlink_agent` RPC, link/unlink UI in settings |
| MOD-1 | Phase 7 modularization | ✅ Done — Full feature module rewrite complete |
| PD-1 | Recipient search broken | ✅ Fixed — Now searches both first_name and last_name |
| PD-2 | Commodity selection non-functional | ✅ Fixed — Added type="select" + COMMODITIES constant |
| PD-3 | Package type selection non-functional | ✅ Fixed — Added type="select" + PACKAGE_TYPES constant |
| PD-4 | Tags settings link broken | ✅ Fixed — Changed href from `/admin/settings` to `/admin/settings/tags` |
| PD-5 | Courier Group field in Add Package | ✅ Removed — Field + state + insert logic all cleaned up |
| PD-6 | Carrier/Courier terminology mixed | ✅ Fixed — Unified to "Carrier" throughout package list/modal |
| PD-7 | Agent linkage not visible | ✅ Added — New Agent block on package detail with read-only display |

| VD-1 | Vercel | TypeScript build — agent type on PackageDetail | ✅ Fixed — added agent to customer type |
| VD-2 | Vercel | TypeScript build — Set iteration target | ✅ Fixed — tsconfig target es5→es2017 |
| VD-3 | Vercel | Static prerender of admin routes | ✅ Fixed — `dynamic = "force-dynamic"` on admin layout, removed `missingSuspenseWithCSRBailout` hack |
| VD-4 | Sidebar | useSearchParams without Suspense boundary | ✅ Fixed — Extracted SettingsTabList component with `<Suspense>` wrapper |

---

## PRODUCTION AUDIT (April 12, 2026)

Full codebase audit performed. Findings organized by severity below. Deployment confirmed READY on Vercel (commit `64c3228`).

---

## REMAINING ISSUES

### P0 — BLOCKERS (must fix before go-live)

| # | Page | Issue | Details |
|---|------|-------|---------|
| ~~PH-1~~ | ~~API~~ | ~~Photo upload/delete broken~~ | ✅ Fixed — Role check used old `role` column instead of `role_v2`; updated to `ORG_ADMIN`/`WAREHOUSE_STAFF` |
| ~~MT-1~~ | ~~Global~~ | ~~Multi-tenancy org_id filtering gaps~~ | ✅ Fixed — RLS already enforces org_id on agents/tags/users/courier_groups/warehouse_locations/packages. Fixed 3 remaining gaps: package_statuses (had `true` policies), courier_groups DELETE (had `true`), package_photos SELECT (missing org_id check). See migration 007. |
| ~~AU-1~~ | ~~API~~ | ~~Admin routes bypass RLS without org_id ownership check~~ | ✅ Fixed — Added org_id ownership verification to `delete/route.ts` (verifies all target records belong to caller's org before admin-client mutation), `permanent-delete-user/route.ts` (verifies user org + soft-delete state), `restore-user/route.ts` (verifies user org + server-side deleted_at clearing), `unlink-agent/route.ts` (verifies both agents belong to caller's org). Also added path traversal protection to `delete-photo/route.ts`. |
| ~~AU-2~~ | ~~Database~~ | ~~Audit all RLS policies for org_id enforcement~~ | ✅ Fixed — Full RLS audit completed. Migration 008 applied: (1) Dropped 6 legacy `true` policies on `agent_closure` and `agent_edges` that allowed cross-org access, (2) Fixed `package_photos` DELETE to use `auth_role_v2()` instead of legacy `auth_role()`, (3) Added org_id scoping to `user_permissions` CRUD via user-org join, (4) Added org_id scoping to `user_shipment_assignments` via user-org join. Only remaining `true` policies are on read-only reference tables (`permission_keys`, `role_permission_defaults`). |
| ~~AU-3~~ | ~~API~~ | ~~Role field inconsistency — `role` vs `role_v2`~~ | ✅ Fixed — `create-recipient/route.ts` updated from `profile.role !== "org_admin"` to `!["ORG_ADMIN", "WAREHOUSE_STAFF"].includes(profile.role_v2)`. Profile select changed from `role, org_id` to `role_v2, org_id`. |

### P1 — CRITICAL (core functionality gaps)

| # | Page | Issue | Details |
|---|------|-------|---------|
| ~~MT-2~~ | ~~Database~~ | ~~Missing org_id on package_photos~~ | ✅ Fixed — RLS SELECT policy now joins through packages.org_id = auth_org_id(). No separate org_id column needed since photos are always accessed through their parent package. |
| ~~MT-3~~ | ~~Admin~~ | ~~No server-side permission enforcement~~ | ✅ Fixed — Middleware now fetches `role_v2` and `role_id` for authenticated users accessing `/admin` routes. Only `ORG_ADMIN`, `WAREHOUSE_STAFF`, and custom-role users are permitted; customer-role users are redirected to `/login?reason=unauthorized`. |
| ~~AU-4~~ | ~~Global~~ | ~~No error boundaries (error.tsx)~~ | ✅ Fixed — Added `error.tsx` to `(dashboard)/` and `(auth)/` route groups with branded error UI (try again + go to dashboard). Added `global-error.tsx` as root-level fallback. All use consistent styling with `btn-primary`/`btn-secondary` and error digest display. |
| ~~AU-5~~ | ~~Global~~ | ~~Silently ignored Supabase query errors~~ | ✅ Fixed — All 4 list pages (packages, AWBs, customers, analytics) now destructure `error` from Supabase queries and log failures. Primary entity queries show user-facing error via `table.showError()`. Created shared `logger.ts` utility at `src/shared/lib/logger.ts` for standardized error handling. |
| ~~AU-6~~ | ~~Global~~ | ~~121 console.error/warn statements in production code~~ | ✅ Fixed — All 143 console.error/warn calls migrated to `logger.error/warn` across 35 files. `src/shared/lib/logger.ts` is the single logging entry point. Ready for Sentry integration. |
| ~~AU-7~~ | ~~Global~~ | ~~Widespread `any` types bypass TypeScript strict mode~~ | ✅ Fixed — All 15 `any` instances replaced: Analytics page uses `AnalyticsPackageRow` and `AnalyticsInvoiceRow` types with cast at query assignment. Packages/[id] removed unnecessary `as any` on org_id access, replaced `Record<string, any>` with `Record<string, string \| number \| string[] \| null>`, eliminated `window.__tagSearch` hack (dead code — `TagsSection` manages its own state). Customers page uses `RecipientRow` type throughout (import/add enrichment). Customers/[id] uses `Customer` type for enrichment. TypeScript compiles clean. |
| ~~G-1~~ | ~~Global~~ | ~~No archive/soft-delete system~~ | ✅ Done — `deleted_at` column added to 7 tables, all delete handlers use soft-delete, all queries filter `deleted_at IS NULL` |
| ~~G-2~~ | ~~Global~~ | ~~Delete confirmation dialogs missing~~ | ✅ Done — Reusable `ConfirmDialog` component created, confirmation dialogs added to tags and statuses (the only pages missing them) |
| ~~SL-1~~ | ~~Settings~~ | ~~Label editor non-functional~~ | ✅ Done — full label template editor with field toggles, paper size selector, live barcode preview |
| ~~SL-2~~ | ~~Settings~~ | ~~Barcode label design~~ | ✅ Done — layout editor with 4 paper sizes, 5 configurable fields, real-time preview |
| ~~SL-3~~ | ~~Settings~~ | ~~Barcode label generation~~ | ✅ Done — JsBarcode CODE128 rendering, print-ready output with @page sizing |
| ~~SL-4~~ | ~~Settings~~ | ~~Dynamic package ID in barcode~~ | ✅ Done — auto-encodes PKG-{id} in barcode, print button on package detail page |
| ~~N-1~~ | ~~Notifications~~ | ~~No notification UI~~ | ✅ Done — NotificationBell component with real-time Supabase subscription, unread badge, mark read/all read, type-specific icons |
| ~~N-2~~ | ~~Notifications~~ | ~~No notification backend~~ | ✅ Done — notification utility lib with triggers for package_received, awb_shipped, awb_arrived, invoice_ready; wired into check-in and invoice creation |
| ~~N-3~~ | ~~Notifications~~ | ~~Toggle alignment broken~~ | ✅ Done — unified toggle style (bg-gray-300 off / bg-primary on) with consistent knob positioning across all settings toggles |

### P2 — IMPORTANT (meaningful but app is usable without)

| # | Page | Issue | Details |
|---|------|-------|---------|
| ~~D-4~~ | ~~Dashboard~~ | ~~Verify stat accuracy~~ | ✅ Fixed — "Checked Out" stat now only counts packages in forward-flow statuses (assigned_to_awb, in_transit, received_at_dest, delivered), excluding returned/lost. Error logging added to all 4 stat queries. |
| ~~A-3~~ | ~~Analytics~~ | ~~Replace chart library~~ | ✅ Fixed — Replaced @mui/x-charts with Recharts (BarChart + LineChart). Uninstalled @mui/material and @mui/x-charts. Charts use ResponsiveContainer for auto-sizing (removed manual ResizeObserver). Removed unused `useRef` import and MUI `chartSx` constant. |
| ~~R-4~~ | ~~Recipients~~ | ~~Bulk CSV/Excel upload~~ | ✅ Done — PapaParse CSV import with validation, agent_code matching, progress tracking, drag-and-drop file zone |
| ~~R-5~~ | ~~Recipients~~ | ~~Downloadable upload template~~ | ✅ Done — Download CSV template button with correct headers and sample row |
| ~~I-3~~ | ~~Invoices~~ | ~~Improve create invoice popup~~ | ✅ Fixed — Modal redesigned with 3 logical sections (Parties, Pricing, Details), required field indicators, grid layout for pricing fields, live total preview (subtotal + tax + total), and submit button showing final amount. Invoice number displayed in header instead of read-only input. |
| ~~SC-9~~ | ~~Global~~ | ~~List pages hardcoded to `.limit(500)`~~ | ✅ Fixed — All 4 list pages (packages, AWBs, customers, invoices) now use `.range(0, 999)` with `{ count: "exact" }` to fetch up to 1000 records with server-side total count. Truncation warning banner shown when more records exist than loaded, prompting users to filter. |
| ~~AU-8~~ | ~~API~~ | ~~No rate limiting on API routes~~ | ✅ Fixed — Created `src/shared/lib/rate-limit.ts` with sliding-window in-memory limiter. Applied to all 7 API routes: admin/delete (30/min), permanent-delete-user (10/min), restore-user (20/min), create-recipient (30/min), unlink-agent (20/min), upload-photo (20/min), delete-photo (20/min). Returns 429 with Retry-After header. |
| ~~AU-9~~ | ~~Settings~~ | ~~Soft-delete filter inconsistent on agents~~ | ✅ Fixed — Added `.is("deleted_at", null)` to all 8 agent queries across AgentSettings (2), UserSettings (1), packages page (1), customers page (1), customers/[id] (1), AWBs page (1), invoices page (1). |
| ~~AU-10~~ | ~~Auth~~ | ~~Auth token not periodically refreshed~~ | ✅ Fixed — Added `visibilitychange` listener in `AuthProvider.tsx` that re-fetches auth data (user profile, org, permissions) when the tab becomes visible. Catches role/permission changes during long idle sessions. |
| ~~AU-11~~ | ~~API~~ | ~~No CSRF protection on POST endpoints~~ | ✅ Fixed — Created `src/shared/lib/csrf.ts` with Origin/Referer-based CSRF check. Applied to all 7 POST API routes. Blocks cross-origin requests; allows same-origin and direct API calls. |
| ~~AU-12~~ | ~~Packages~~ | ~~`window as any` hack for tag search~~ | ✅ Fixed — Removed dead code. The `filteredTags` variable using `window.__tagSearch` was unused; `TagsSection` component manages its own internal `tagSearch` state and filtering. |
| ~~AU-13~~ | ~~Global~~ | ~~No env variable validation at startup~~ | ✅ Fixed — Created `src/lib/env.ts` with `requireEnv()` validation. All 3 Supabase client files (`supabase.ts`, `supabase-admin.ts`, `supabase-server.ts`) now import validated env vars instead of using `process.env!` assertions. Fails fast with descriptive error on missing config. |
| ~~AU-14~~ | ~~API~~ | ~~Upload route lacks strict MIME validation~~ | ✅ Fixed — Added strict MIME type allowlist (JPEG, PNG, WebP, HEIC/HEIF) and extension validation in `upload-photo/route.ts`. Bucket `allowedMimeTypes` also updated from `image/*` to the explicit list. Rejects unknown types with descriptive 400 error. |
| ~~DB-1~~ | ~~Database~~ | ~~Legacy `cloudinary_*` column names~~ | ✅ Fixed — Renamed to `storage_url`/`storage_path` in DB + all code references. Removed Cloudinary from next.config.js. |
| ~~SU-2~~ | ~~Settings~~ | ~~Bulk select/edit for users~~ | ✅ Done — Checkbox selection, select all, batch activate/deactivate/delete with confirmation |
| ~~SW-4~~ | ~~Settings~~ | ~~Bulk edit warehouse locations~~ | ✅ Done — Checkbox selection, batch set active/inactive/delete with confirmation |
| ~~ST-3~~ | ~~Settings~~ | ~~Tags UI redesign~~ | ✅ Done — Color accent border, hex label, usage count placeholder, elevated hover states |
| ~~SS-2~~ | ~~Settings~~ | ~~Statuses UI redesign~~ | ✅ Done — Larger color circles with ring, default badge, workflow arrows, color picker button, improved drag handles |
| ~~SB-2~~ | ~~Sidebar~~ | ~~Click user section → profile page~~ | ✅ Done — Clickable sidebar footer navigates to /admin/profile, full profile page with edit + sign out |
| ~~N-4~~ | ~~Notifications~~ | ~~Site-wide bell icon dropdown~~ | ✅ Done — NotificationBell component integrated on all 7 admin pages (packages, customers, invoices, AWBs, AWB detail, dashboard, analytics) |
| ~~SC-4~~ | ~~Settings~~ | ~~Courier logo display globally~~ | ✅ Done — logo_url fetched and displayed as 20x20 rounded image next to courier badge on packages and AWBs pages |

### P3 — NICE TO HAVE

| # | Page | Issue | Details |
|---|------|-------|---------|
| ~~G-4~~ | ~~Global~~ | ~~Old capri color refs in unused components~~ | ✅ Fixed — Removed unused `--color-brand-capri` CSS variable. Updated "Capri" comment in login SVG. TopNav.tsx already removed in prior phase. |
| ~~AU-15~~ | ~~Global~~ | ~~No security headers in next.config.js~~ | ✅ Fixed — Added X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy, HSTS (2-year max-age + preload), X-DNS-Prefetch-Control via `headers()` in next.config.js. |
| ~~AU-16~~ | ~~Global~~ | ~~No skeleton loading states on data pages~~ | ✅ Already done — All 6 data pages (packages, AWBs, invoices, customers, analytics, dashboard) have `skeleton-pulse` loading states in table rows, stat cards, and ranking lists. |
| ~~AU-17~~ | ~~Config~~ | ~~Hardcoded Supabase URL in next.config.js~~ | ✅ Fixed — `images.remotePatterns` now derives hostname from `NEXT_PUBLIC_SUPABASE_URL` env var via `new URL().hostname`. Falls back to empty array if env is missing. |

### POSITIVE AUDIT FINDINGS

The audit also confirmed several areas are properly implemented:

| Area | Status | Details |
|------|--------|---------|
| Route protection | ✅ Solid | Middleware redirects unauthenticated users + enforces role_v2 permission on `/admin` routes (MT-3); auth pages redirect authenticated users |
| Environment variables | ✅ Correct | Service role key is NOT prefixed with `NEXT_PUBLIC_`, stays server-side only |
| RBAC in sidebar | ✅ Working | Nav items filtered by permission keys |
| Soft-delete system | ✅ Implemented | 7 tables with `deleted_at`, partial indexes, trash UI with restore/permanent-delete |
| Cascade handling | ✅ Proper | Foreign key handling in delete operations (invoice_lines, package awb_id) |
| TypeScript strict mode | ✅ Enabled | `strict: true` in tsconfig.json |
| Modular architecture | ✅ Clean | Phase 7 complete — feature modules in `src/modules/`, shared infra in `src/shared/` |
| Vercel deployment | ✅ Live | Production build succeeds with proper SSR (dynamic rendering for admin, Suspense for search params) |

---

## DATABASE CHANGES NEEDED

Run these in Supabase SQL editor:

```sql
-- Already needed (may already be done):
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_icon_url text;
ALTER TABLE courier_groups ADD COLUMN IF NOT EXISTS logo_url text;

-- Storage bucket (if not created):
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies:
CREATE POLICY "Authenticated upload assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assets');
CREATE POLICY "Authenticated update assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'assets');
CREATE POLICY "Public read assets" ON storage.objects FOR SELECT TO public USING (bucket_id = 'assets');

-- DELETE policies (fix P0 delete bugs):
CREATE POLICY "Allow delete courier_groups" ON courier_groups FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow delete invoices" ON invoices FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow delete awbs" ON awbs FOR DELETE TO authenticated USING (true);

-- Soft delete (for G-1 archive system):
ALTER TABLE packages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE awbs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE courier_groups ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE warehouse_locations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE package_statuses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Notifications table (already exists from 001_schema.sql):
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES auth.users(id),
  type notification_type NOT NULL,  -- enum: awb_shipped, awb_arrived, package_received, invoice_ready
  channel notification_channel NOT NULL DEFAULT 'push',  -- enum: push, email, sms
  title text NOT NULL,
  body text,
  read_at timestamptz,
  sent_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

-- Org settings table (key-value store for org preferences):
CREATE TABLE IF NOT EXISTS org_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(org_id, key)
);
-- Current keys in use: 'retention_period', 'auto_print_label'
```

---

## LIBRARIES INSTALLED

| Library | Purpose | Status |
|---------|---------|--------|
| papaparse + @types/papaparse | CSV parsing | ✅ Installed — used in R-4 bulk recipient upload |
| jsbarcode | Barcode generation (CODE128) | ✅ Installed — used in label editor + auto-print |
| jspdf | PDF generation | ✅ Installed — used in label printing (Safari-compatible) |
| html-to-image | DOM-to-PNG rasterization | ✅ Installed — used in label printing pipeline |
| recharts | Lighter charts (replaced @mui/x-charts) | ✅ Installed — used in analytics page (BarChart + LineChart) |

---

## SUMMARY COUNTS

| Priority | Total | Completed | Remaining |
|----------|-------|-----------|-----------|
| P0 Blockers | 11 | **11** | **0** ✅ |
| P1 Critical | 39 | **39** | **0** ✅ |
| P2 Important | 22 | **22** | **0** ✅ |
| P3 Nice-to-have | 4 | **4** | **0** ✅ |
| **Original tracker** | **76** | **76** | **0** ✅ |
| Tier 6.0 RLS audit (Phase 10A — CRITICAL/HIGH) | 4 | **4** | **0** ✅ (F-1, F-2, F-3, F-12) |
| Tier 6.0 RLS audit (Phase 10B–F — product/perf/harden) | 8 | **0** | **8** 🟡 |
| **GRAND TOTAL** | **88** | **80** | **8** |

**Original P0–P3 tracker is complete.** Tier 6.0 RLS audit (2026-04-19) added 12 new findings, 2 CRITICAL. Phase 10A (CRITICAL + F-3 + F-12) **landed live on 2026-04-19**. Phase 10B–F remain before multi-sided-platform rollout.

*Note: 32+ additional fixes completed outside the original tracker scope (including 7 package detail bugs April 7, 4 Vercel deployment fixes April 12). Total completed work items: **88+**.*

---

## RECOMMENDED WORK ORDER

**Phase 1 — Fix P0 Blockers** ✅ COMPLETE
~~All 5 P0 blockers resolved — invoice org_id, delete cascade, portal access labels~~

**Phase 2 — Analytics Performance + Remaining Settings CRUD** ✅ COMPLETE
~~Analytics already optimized, warehouse locations CRUD done, tags edit done, agents save already working, courier group fields already removed~~

**Phase 3 — Delete System & Confirmations** ✅ COMPLETE
~~5. Add delete confirmation dialogs everywhere (G-2)~~
~~6. Implement soft-delete/archive system with `deleted_at` (G-1)~~

**Phase 4 — Label Editor** ✅ COMPLETE
~~7. Build barcode label editor (SL-1 through SL-4)~~

**Phase 5 — Notifications** ✅ COMPLETE
~~8. Build notification system (N-1 through N-4)~~

**Phase 6 — Polish & Extras** ✅ COMPLETE
~~9. Bulk CSV upload for recipients (R-4, R-5)~~
~~10. Bulk operations in settings (SU-2, SW-4)~~
~~11. UI redesigns for tags/statuses (ST-3, SS-2)~~
~~12. Profile page (SB-2)~~
~~13. Courier logo display globally (SC-4)~~

**Phase 7 — Modularization** ✅ COMPLETE
> Full roadmap: See `MODULARIZATION.md`

Full feature module rewrite completed — all 4 sub-phases (7A–7D) done.

**Phase 8 — Security & Multi-Tenancy Hardening** ✅ COMPLETE
> New critical items discovered via codebase audit (April 6, 2026)

- **8A:** Fix RLS policies on package_statuses, courier_groups DELETE, package_photos SELECT — ✅ Done (migration 007)
- **8B:** Fix photo upload/delete role check (role → role_v2) — ✅ Done
- **8C:** Server-side permission enforcement on admin routes — P1 ⬜ Not started

**Phase 8.5 — Vercel Deployment** ✅ COMPLETE
> Build failures resolved (April 12, 2026)

- **8.5A:** Fix agent type on PackageDetail customer property — ✅ Done
- **8.5B:** Fix tsconfig target es5→es2017 for Set iteration — ✅ Done
- **8.5C:** Force dynamic rendering for admin routes (remove `missingSuspenseWithCSRBailout` hack) — ✅ Done
- **8.5D:** Wrap useSearchParams in Suspense boundary in Sidebar — ✅ Done

**Phase 9 — Production Audit Remediation** ✅ COMPLETE
> Full codebase audit performed April 12, 2026. P0 security items all resolved.

**9A — P0 Security:** ✅ COMPLETE
1. ~~Add org_id ownership verification to all admin API routes before service-role mutations (AU-1)~~ ✅ Done
2. ~~Audit every Supabase RLS policy for org_id enforcement (AU-2)~~ ✅ Done — migration 008 applied, 6 legacy `true` policies removed, 3 policies upgraded to org_id scoping
3. ~~Standardize all role checks to `role_v2` — fix `create-recipient/route.ts` (AU-3)~~ ✅ Done

**9B — P1 Reliability (do before scaling):** ✅ COMPLETE
4. ~~Add `error.tsx` files to `(dashboard)/`, `(auth)/`, and `packages/` route segments (AU-4)~~ ✅ Done
5. ~~Surface Supabase query errors to users instead of silently swallowing them (AU-5)~~ ✅ Done
6. ~~Replace 121 console.error/warn statements with error logging service (AU-6)~~ ✅ Done — all 143 calls migrated to logger
7. ~~Replace `any` types with proper TypeScript interfaces for all Supabase query results (AU-7)~~ ✅ Done
8. ~~Add server-side permission enforcement in middleware (MT-3)~~ ✅ Done — middleware role check for `/admin` routes

**9C — P2 Hardening (do before heavy usage):** ✅ COMPLETE
9. ~~Add rate limiting middleware to API routes (AU-8)~~ ✅ Done — sliding-window limiter on all 7 routes
10. ~~Fix soft-delete filter gap on agents query (AU-9)~~ ✅ Done — all 8 agent queries now filter `deleted_at IS NULL`
11. ~~Add periodic auth token refresh or visibility-change re-fetch (AU-10)~~ ✅ Done
12. ~~Add CSRF protection to POST endpoints (AU-11)~~ ✅ Done — Origin/Referer check on all 7 routes
13. ~~Replace `window as any` tag search hack with React state (AU-12)~~ ✅ Done — dead code removed
14. ~~Add env variable validation at app startup (AU-13)~~ ✅ Done — `src/lib/env.ts`
15. ~~Add strict MIME type validation on upload route (AU-14)~~ ✅ Done — explicit allowlist

**Phase 10 — Tier 6.0 RLS Remediation** 🟡 PHASE A COMPLETE (remaining phases block multi-sided-platform rollout)
> Full audit: `docs/audits/2026-04-19-tier6-rls-audit.md` (uncommitted — commit alongside 016/017/018).

**10A — CRITICAL bleeding (pre-rollout gate):** ✅ COMPLETE (applied 2026-04-19)
1. ✅ Migration `016_users_update_with_check.sql` — explicit `WITH CHECK` blocks non-admin role/agent/role_id self-mutation. Consolidates live hotfix `016a_auth_role_id_helper_and_fix` (added SECURITY DEFINER helper `auth_role_id()` to break infinite-recursion 42P17 on inline subqueries against `users`). F-1, F-2.
2. ✅ Migration `017_packages_unassigned_role_gate.sql` — removed `OR (agent_id IS NULL)` carve-out entirely per owner rule. F-3.
3. ✅ Migration `018_for_all_gate_split.sql` — split `FOR ALL` on `org_settings`, `tags`, `label_templates`, `warehouse_locations`, `package_tags` into read + role-gated write. Gates: `org_settings` + `warehouse_locations` = ORG_ADMIN only; `tags` + `label_templates` + `package_tags` = ORG_ADMIN + WAREHOUSE_STAFF. F-12.
4. ✅ Live re-tests confirmed all attack paths blocked. See "Phase A re-test results" section above.
5. ⬜ **Still TODO:** commit audit report + migrations 016/017/018 to the repo (currently uncommitted).

**10B — Product-gated fixes:** ⬜ Blocked on open-question answers (§6 of audit report). HP5 investigation informed Q1 — prefer direct `customer_id = auth.uid()` scoping.
5. ⬜ Migration `019_customer_read_surface.sql` (F-4) — add `customer_id = auth.uid()` policies on `packages`, `invoices`, `invoice_lines` (via parent invoice), `awbs`, `package_photos` (via parent package). Do NOT extend `get_accessible_agent_ids()` with a CUSTOMER branch.
6. ⬜ Migration `020_invoice_lines_policies.sql` (F-5).
7. ⬜ Migration `021_role_v2_backfill.sql` (F-7) — set `role_v2 = 'CUSTOMER'` on the 10 legacy NULL recipient rows. Must land together with 019 or customers still see 0 rows.

**10C — JWT claim consumption (performance):** ⬜ Not started
8. ⬜ Migration `022_auth_helpers_read_jwt.sql` (F-6). Updates `auth_org_id()`, `auth_role_v2()`, `auth_agent_id()`, and the new `auth_role_id()` to read from `auth.jwt() -> 'app_metadata'` instead of DB lookup.

**10D — CI test harness:** ⬜ Not started
9. ⬜ Migration `023_rls_test_fixtures.sql` — seed per-role test users in a dedicated `test_org`.
10. ⬜ Add a pgTAP / Vitest harness that runs the impersonation scenarios on every PR touching `supabase/migrations/**`. Gate merges on green.

**10E — Deferred hardening:** ⬜ Not started
11. ⬜ Migration `024_force_row_security.sql` — `FORCE ROW LEVEL SECURITY` on tenant-scoped tables.

**10F — Recipient registration & role backfill (new, from HP5):** ⬜ Not started
12. ⬜ Audit `src/app/api/create-recipient/route.ts` — today it inserts recipient rows with `role_v2 = NULL`. Must set `role_v2 = 'CUSTOMER'` at creation.
13. ⬜ After 021 backfill, add `CHECK (role_v2 IS NOT NULL)` on `users` to prevent any future NULL-role row.

### Open questions blocking Phase 10B/10C

From §6 of the audit report — needed from product:

1. **CUSTOMER read surface (Q1)** — When a CUSTOMER logs in, what should they see? Their own packages / invoices / AWBs only? Or also their agent's aggregate view? This drives whether `019` uses `customer_id = auth.uid()` or joins through `customers_v2.user_id`.
2. **Unassigned packages intent (Q2)** — Is the `agent_id IS NULL` carve-out actually wanted for any non-ORG_ADMIN role (e.g., WAREHOUSE_STAFF triaging the inbound dock)? Drives the exact role list in `017`.
3. **AGENT_STAFF invoice line edits (Q3)** — Can AGENT_STAFF edit invoice lines for invoices where `invoice.agent_id = their_agent_id`, or is that ORG_ADMIN-only?
4. **JWT TTL tolerance (Q4)** — Is a 1-hour TTL on role/org claims acceptable? Role changes take up to 1h to propagate until a user re-logs.
5. **`customers_v2.user_id` self-link (Q5)** — Does the `customers_v2` table have a `user_id` column that links to `auth.users`, or do we rely on `users.customer_id`? Affects the JOIN shape for `019`.
6. **API-route vs. direct mutation (Q6)** — For privileged mutations (role changes, agent reassignment), should we force everything through API routes that use `supabaseAdmin` with explicit ownership checks, or keep direct Supabase calls with stricter RLS? Affects whether `016`'s `WITH CHECK` needs to permit a narrow ORG_ADMIN path.
