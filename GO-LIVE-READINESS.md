# ENVIATO WMS V2 — Go-Live Readiness Assessment

**Updated:** April 12, 2026
**Status:** NEAR GO-LIVE — All P0 blockers resolved. All P1 critical items resolved (except AU-6 incremental logger migration). Phase 7–9 complete. 60 of 76 items done, 16 remaining (all P2/P3).

---

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
| AU-6 | Global | **121 console.error/warn statements in production code** | 🟡 Foundation laid — `src/shared/lib/logger.ts` created with `logger.error/warn/info` + `supabaseErrorMessage()` helper. Ready for Sentry integration. Incremental migration of existing console statements to logger recommended (low regression risk). |
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
| D-4 | Dashboard | Verify stat accuracy | Queries exist but need business rule validation |
| A-3 | Analytics | Replace chart library | @mui/x-charts is heavy; Recharts is lighter |
| ~~R-4~~ | ~~Recipients~~ | ~~Bulk CSV/Excel upload~~ | ✅ Done — PapaParse CSV import with validation, agent_code matching, progress tracking, drag-and-drop file zone |
| ~~R-5~~ | ~~Recipients~~ | ~~Downloadable upload template~~ | ✅ Done — Download CSV template button with correct headers and sample row |
| I-3 | Invoices | Improve create invoice popup | Modal UX needs work |
| SC-9 | Global | List pages hardcoded to `.limit(500)` | Client-side only pagination; will hit scaling issues with large datasets |
| AU-8 | API | **No rate limiting on API routes** | All admin API routes (bulk delete, photo upload, create-recipient) are unthrottled. Vulnerable to abuse. **Fix:** Add rate limiting middleware. |
| AU-9 | Settings | **Soft-delete filter inconsistent on agents** | `AgentSettings.tsx` line 174 filters `status = "active"` but does NOT check `deleted_at IS NULL`. Soft-deleted agents can appear in dropdowns. **Fix:** Add `.is("deleted_at", null)` to agents query. |
| AU-10 | Auth | **Auth token not periodically refreshed** | `AuthProvider.tsx` loads permissions on mount only. Long sessions could operate with stale permissions if a user's role changes mid-session. **Fix:** Add periodic refresh or re-fetch on visibility change. |
| AU-11 | API | **No CSRF protection on POST endpoints** | All POST API routes lack CSRF token validation. **Fix:** Add CSRF middleware. |
| ~~AU-12~~ | ~~Packages~~ | ~~`window as any` hack for tag search~~ | ✅ Fixed — Removed dead code. The `filteredTags` variable using `window.__tagSearch` was unused; `TagsSection` component manages its own internal `tagSearch` state and filtering. |
| AU-13 | Global | **No env variable validation at startup** | `process.env.NEXT_PUBLIC_SUPABASE_URL!` non-null assertions used without validation. Could be undefined despite `!`. **Fix:** Validate env vars at app startup with proper error messages. |
| AU-14 | API | **Upload route lacks strict MIME validation** | `upload-photo/route.ts` accepts `image/*` without strict type checking. **Fix:** Validate specific MIME types (jpeg, png, webp). |
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
| G-4 | Global | Old capri color refs in unused components | TopNav.tsx, login page SVGs |
| AU-15 | Global | **No security headers in next.config.js** | Missing Content-Security-Policy, X-Frame-Options, etc. |
| AU-16 | Global | **No skeleton loading states on data pages** | Pages show spinners instead of skeleton loaders — poor UX on slow networks |
| AU-17 | Config | **Hardcoded Supabase URL in next.config.js** | `ilguqphtephoqlshgpza.supabase.co` in image remotePatterns should derive from env var |

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
| recharts (optional) | Lighter charts | Not yet installed — for A-3 if needed |

---

## SUMMARY COUNTS

| Priority | Total | Completed | Remaining |
|----------|-------|-----------|-----------|
| P0 Blockers | 11 | **11** | **0** ✅ |
| P1 Critical | 39 | **36** | **3** |
| P2 Important | 22 | **10** | **12** |
| P3 Nice-to-have | 4 | 0 | **4** |
| **TOTAL** | **76** | **57** | **19** |

**Remaining P0 (0):** All P0 blockers resolved. ✅
**Remaining P1 (5):** MT-3 (server-side permissions), AU-4 (error boundaries), AU-5 (silent query errors), AU-6 (console statements → error service), AU-7 (any types).
**Remaining P2 (12):** D-4, A-3, I-3, SC-9, AU-8 through AU-14.
**Remaining P3 (4):** G-4, AU-15, AU-16, AU-17.

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

**Phase 8 — Security & Multi-Tenancy Hardening** 🟡 MOSTLY COMPLETE
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

**Phase 9 — Production Audit Remediation** 🟡 IN PROGRESS
> Full codebase audit performed April 12, 2026. P0 security items all resolved.

**9A — P0 Security:** ✅ COMPLETE
1. ~~Add org_id ownership verification to all admin API routes before service-role mutations (AU-1)~~ ✅ Done
2. ~~Audit every Supabase RLS policy for org_id enforcement (AU-2)~~ ✅ Done — migration 008 applied, 6 legacy `true` policies removed, 3 policies upgraded to org_id scoping
3. ~~Standardize all role checks to `role_v2` — fix `create-recipient/route.ts` (AU-3)~~ ✅ Done

**9B — P1 Reliability (do before scaling):** ✅ COMPLETE
4. ~~Add `error.tsx` files to `(dashboard)/`, `(auth)/`, and `packages/` route segments (AU-4)~~ ✅ Done
5. ~~Surface Supabase query errors to users instead of silently swallowing them (AU-5)~~ ✅ Done
6. Replace 121 console.error/warn statements with error logging service (Sentry recommended) (AU-6) — 🟡 Foundation laid
7. ~~Replace `any` types with proper TypeScript interfaces for all Supabase query results (AU-7)~~ ✅ Done
8. ~~Add server-side permission enforcement in middleware (MT-3)~~ ✅ Done — middleware role check for `/admin` routes

**9C — P2 Hardening (do before heavy usage):**
9. Add rate limiting middleware to API routes (AU-8)
10. Fix soft-delete filter gap on agents query in AgentSettings (AU-9)
11. Add periodic auth token refresh or visibility-change re-fetch (AU-10)
12. Add CSRF protection to POST endpoints (AU-11)
13. ~~Replace `window as any` tag search hack with React state (AU-12)~~ ✅ Done — dead code removed
14. Add env variable validation at app startup (AU-13)
15. Add strict MIME type validation on upload route (AU-14)
