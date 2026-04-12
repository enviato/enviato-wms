# ENVIATO WMS V2 — Modularization Roadmap

**Created:** April 4, 2026
**Status:** COMPLETE — Phases 7A through 7D done. Only manual regression testing (7D-3) remains.
**Goal:** Rewrite the monolithic codebase into a modular architecture for scalability, performance under heavy data loads, and easier debugging/feature shipping

---

## WHY MODULARIZE

### Current State (Monolithic)

The codebase is **~19,700 lines** across 38 files, heavily concentrated in a few massive page components:

| File | Lines | Problems |
|------|-------|----------|
| `settings/page.tsx` | 5,003 | 11 unrelated features in 1 file, 60+ state variables |
| `packages/[id]/page.tsx` | 2,388 | Data fetching, forms, labels, photos, status all inline |
| `packages/page.tsx` | 2,055 | 54+ useState calls, table/filter/bulk logic intertwined |
| `customers/page.tsx` | 1,395 | Inline forms, CSV import, table, all in one |
| `invoices/page.tsx` | 1,168 | Data fetching + UI + batch logic combined |
| `awbs/page.tsx` | 1,102 | Same pattern as invoices |

**Shared infrastructure is minimal:** 8 components, 1 custom hook, no contexts, no state management, no data caching. Every page independently queries the same entities (users, agents, statuses, tags, couriers) with zero deduplication.

### What Modularization Solves

1. **Scalability** — Cached data layer eliminates redundant queries as data grows. React Query/SWR handles stale-while-revalidate, pagination, and background refreshing automatically.
2. **Performance** — Smaller components mean React only re-renders what changes. A 5,000-line component re-renders on every state change across 60+ variables. Isolated modules with focused state update only their own UI.
3. **Debugging** — When a bug appears in courier management, you look in `modules/settings/couriers/`, not in line 3,400 of a 5,000-line file.
4. **Feature shipping** — New features are isolated modules. Adding a "Returns" feature means creating `modules/returns/` without touching existing code.
5. **Team scaling** — Multiple developers can work on different modules without merge conflicts in the same massive file.

---

## MODULE ARCHITECTURE (Target State)

### New Directory Structure

```
src/
├── app/                                    # Next.js App Router (thin route shells only)
│   ├── (dashboard)/admin/
│   │   ├── packages/page.tsx               # → imports from modules/packages
│   │   ├── packages/[id]/page.tsx          # → imports from modules/packages
│   │   ├── customers/page.tsx              # → imports from modules/customers
│   │   ├── customers/[id]/page.tsx         # → imports from modules/customers
│   │   ├── invoices/page.tsx               # → imports from modules/invoices
│   │   ├── invoices/[id]/page.tsx          # → imports from modules/invoices
│   │   ├── awbs/page.tsx                   # → imports from modules/awbs
│   │   ├── awbs/[id]/page.tsx              # → imports from modules/awbs
│   │   ├── settings/                       # → imports from modules/settings/*
│   │   │   ├── page.tsx                    # Settings layout + tab router
│   │   │   ├── general/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── agents/page.tsx
│   │   │   ├── couriers/page.tsx
│   │   │   ├── warehouses/page.tsx
│   │   │   ├── tags/page.tsx
│   │   │   ├── statuses/page.tsx
│   │   │   ├── labels/page.tsx
│   │   │   ├── notifications/page.tsx
│   │   │   ├── trash/page.tsx
│   │   │   └── layout.tsx                  # Shared settings layout with tab nav
│   │   ├── analytics/page.tsx              # → imports from modules/analytics
│   │   ├── dashboard/page.tsx              # → imports from modules/dashboard
│   │   └── profile/page.tsx                # → imports from modules/profile
│   └── ...
│
├── modules/                                # Feature modules (the core of the rewrite)
│   ├── packages/
│   │   ├── components/                     # Package-specific UI components
│   │   │   ├── PackageList.tsx
│   │   │   ├── PackageDetail.tsx
│   │   │   ├── PackageFilters.tsx
│   │   │   ├── PackageBatchBar.tsx
│   │   │   ├── AddPackageModal.tsx
│   │   │   ├── PhotoGallery.tsx
│   │   │   └── LabelPreview.tsx
│   │   ├── hooks/
│   │   │   ├── usePackages.ts              # React Query hook for package list
│   │   │   ├── usePackage.ts               # React Query hook for single package
│   │   │   └── usePackageFilters.ts        # Filter state management
│   │   ├── types.ts                        # Package-specific TypeScript types
│   │   └── index.ts                        # Module public API
│   │
│   ├── customers/
│   │   ├── components/
│   │   │   ├── CustomerList.tsx
│   │   │   ├── CustomerDetail.tsx
│   │   │   ├── CustomerFilters.tsx
│   │   │   ├── CustomerBatchBar.tsx
│   │   │   ├── AddCustomerModal.tsx
│   │   │   └── CsvImportDialog.tsx
│   │   ├── hooks/
│   │   │   ├── useCustomers.ts
│   │   │   ├── useCustomer.ts
│   │   │   └── useCsvImport.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── invoices/
│   │   ├── components/
│   │   │   ├── InvoiceList.tsx
│   │   │   ├── InvoiceDetail.tsx
│   │   │   ├── InvoiceFilters.tsx
│   │   │   ├── InvoiceBatchBar.tsx
│   │   │   └── CreateInvoiceModal.tsx
│   │   ├── hooks/
│   │   │   ├── useInvoices.ts
│   │   │   └── useInvoice.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── awbs/
│   │   ├── components/
│   │   │   ├── AwbList.tsx
│   │   │   ├── AwbDetail.tsx
│   │   │   ├── AwbFilters.tsx
│   │   │   ├── AwbBatchBar.tsx
│   │   │   └── CreateAwbModal.tsx
│   │   ├── hooks/
│   │   │   ├── useAwbs.ts
│   │   │   └── useAwb.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── settings/
│   │   ├── general/
│   │   │   ├── GeneralSettings.tsx
│   │   │   └── LogoUpload.tsx
│   │   ├── users/
│   │   │   ├── UsersTable.tsx
│   │   │   ├── InviteUserModal.tsx
│   │   │   └── useUsers.ts
│   │   ├── agents/
│   │   │   ├── AgentsTable.tsx
│   │   │   └── useAgents.ts
│   │   ├── couriers/
│   │   │   ├── CouriersTable.tsx
│   │   │   ├── CourierEditModal.tsx
│   │   │   └── useCouriers.ts
│   │   ├── warehouses/
│   │   │   ├── WarehousesTable.tsx
│   │   │   ├── WarehouseEditModal.tsx
│   │   │   └── useWarehouses.ts
│   │   ├── tags/
│   │   │   ├── TagsManager.tsx
│   │   │   └── useTags.ts
│   │   ├── statuses/
│   │   │   ├── StatusesManager.tsx
│   │   │   └── useStatuses.ts
│   │   ├── labels/
│   │   │   ├── LabelEditor.tsx
│   │   │   ├── LabelPreview.tsx
│   │   │   └── useLabelSettings.ts
│   │   ├── notifications/
│   │   │   ├── NotificationSettings.tsx
│   │   │   └── useNotificationSettings.ts
│   │   └── trash/
│   │       ├── TrashManager.tsx
│   │       └── useTrash.ts
│   │
│   ├── notifications/
│   │   ├── components/
│   │   │   └── NotificationBell.tsx        # Moved from src/components/
│   │   ├── hooks/
│   │   │   └── useNotifications.ts         # Real-time sub + polling
│   │   ├── lib/
│   │   │   └── triggers.ts                 # notifyPackageReceived, etc.
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── analytics/
│   │   ├── components/
│   │   │   ├── AnalyticsDashboard.tsx
│   │   │   └── StatCards.tsx
│   │   ├── hooks/
│   │   │   └── useAnalytics.ts
│   │   └── index.ts
│   │
│   └── dashboard/
│       ├── components/
│       │   ├── DashboardHome.tsx
│       │   ├── RecentActivity.tsx
│       │   └── StatCards.tsx
│       ├── hooks/
│       │   └── useDashboardStats.ts
│       └── index.ts
│
├── shared/                                 # Cross-module shared infrastructure
│   ├── components/
│   │   ├── DataTable/
│   │   │   ├── DataTable.tsx               # Reusable table with sort/filter/paginate
│   │   │   ├── ColumnHeaderMenu.tsx        # Moved from src/components/
│   │   │   ├── CellDropdown.tsx            # Moved from src/components/
│   │   │   ├── BatchBar.tsx                # Extracted from page-level implementations
│   │   │   ├── FilterBar.tsx               # Extracted filter pill pattern
│   │   │   └── index.ts
│   │   ├── forms/
│   │   │   ├── FormInput.tsx
│   │   │   ├── FormSelect.tsx
│   │   │   ├── Toggle.tsx                  # Unified toggle component
│   │   │   ├── FileUpload.tsx
│   │   │   ├── ColorPicker.tsx
│   │   │   └── SearchableSelect.tsx        # Moved from src/components/
│   │   ├── layout/
│   │   │   ├── PageHeader.tsx              # Standardized h-14 header
│   │   │   ├── PageLayout.tsx              # Header + filter bar + content wrapper
│   │   │   └── Sidebar.tsx                 # Moved from src/components/
│   │   ├── feedback/
│   │   │   ├── ConfirmDialog.tsx           # Moved from src/components/ui/
│   │   │   ├── Toast.tsx
│   │   │   └── EmptyState.tsx
│   │   └── index.ts                        # Barrel export
│   │
│   ├── hooks/
│   │   ├── useAuth.ts                      # Auth context consumer hook
│   │   ├── usePermissions.ts               # RBAC permission checking
│   │   ├── useOrg.ts                       # Current org context
│   │   ├── useTableState.ts               # Sort, filter, pagination, selection state
│   │   ├── useTableColumnSizing.ts         # Moved from src/hooks/
│   │   └── useClickOutside.ts              # Reusable click-outside handler
│   │
│   ├── contexts/
│   │   ├── AuthProvider.tsx                # Auth state + user info + permissions
│   │   ├── OrgProvider.tsx                 # Org data + org_id for all queries
│   │   └── QueryProvider.tsx               # React Query client configuration
│   │
│   ├── lib/
│   │   ├── supabase.ts                     # Client-side Supabase client
│   │   ├── supabase-server.ts              # Server-side Supabase client
│   │   ├── supabase-admin.ts               # Admin Supabase client
│   │   ├── api.ts                          # Supabase query helpers (with soft-delete filter)
│   │   ├── print-pdf.ts                    # PDF-based label printing
│   │   ├── label-builder.ts                # Label HTML generation
│   │   └── utils.ts                        # General utilities
│   │
│   └── types/
│       ├── database.ts                     # All Supabase table types (auto-generated or manual)
│       ├── auth.ts                         # Auth/user/permission types
│       └── common.ts                       # Shared utility types (Pagination, SortConfig, etc.)
│
└── app/                                    # Next.js route shells (thin wrappers)
```

---

## DATA MODEL CLARIFICATIONS (April 7, 2026)

### Terminology

- **Carrier** = "Courier" (FedEx, UPS, DHL, Amazon, etc.) — unified terminology is "Carrier"
- **Agent** = Business entity/forwarding agent/sub-brand that owns customers
- **Customer** = End user/recipient assigned to an Agent

### Relationships

```
Agent ─┬─→ Customer 1 ─┬─→ Package A
       │               │─→ Package B
       │               └─→ Package C
       │
       ├─→ Customer 2 ─┬─→ Package D
       │               └─→ Package E
       │
       └─→ Sub-Agent (child) ─→ Customer 3 ─→ Package F
```

- Each **Customer** is assigned to exactly one **Agent** via `users.agent_id → agents.id`
- Each **Package** references its **Customer** via `packages.customer_id → users.id`
- Therefore, a **Package**'s agent is derivable: `package → customer → agent`
- **Carriers** are referenced in packages via `packages.carrier` (string field) or `packages.courier_group_id` (now deprecated for new packages)

### Deprecated/Removed Fields

- `packages.courier_group_id` — No longer used in Add Package modal or new packages. Existing data should be left alone for backward compatibility.
- UI never presents Courier Group as a selectable field on package forms.

---

## MODULE DEFINITIONS

### Module 1 — Core/Shared Infrastructure (`shared/`)

**What:** Auth context, org context, React Query provider, Supabase query abstraction with automatic soft-delete filtering, shared TypeScript types, permission hooks.

**Why first:** Every other module depends on this. Currently every page independently fetches auth state, permissions, and org data. This module provides it once via React Context, eliminating hundreds of redundant queries.

**Key deliverables:**
- `AuthProvider` context with `useAuth()` hook — replaces inline `supabase.auth.getUser()` calls on every page
- `OrgProvider` context with `useOrg()` hook — replaces inline org fetching on every page
- `usePermissions()` hook — replaces scattered permission checks in TopNav and page components
- React Query `QueryProvider` — client config with stale times, retry logic, devtools
- `api.ts` query helpers that automatically add `.is("deleted_at", null)` to all queries on soft-delete tables

**Current pain:** TopNav, Sidebar, and every page all independently call `supabase.auth.getUser()`, fetch the `organizations` row, and check permissions. With 100+ concurrent users, this multiplies into thousands of unnecessary API calls.

### Module 2 — Table System (`shared/components/DataTable/`)

**What:** A reusable `<DataTable>` component with declarative column config, built-in sorting, filtering, pagination, row selection, batch actions bar, and cell dropdowns.

**Why:** Four pages (packages, customers, invoices, AWBs) all duplicate the same table rendering logic — `sheet-table-wrap`, column headers, cell rendering, checkbox selection, batch bar, pagination. Currently each page has 400-800 lines dedicated to table rendering alone.

**Key deliverables:**
- `<DataTable columns={[...]} data={data} onBatchAction={...} />` component
- Column config object: `{ key, label, render, sortable, filterable, width }`
- Built-in `<BatchBar>` with configurable actions per page
- Built-in `<FilterBar>` with configurable filter pills
- `<CellDropdown>` and `<ColumnHeaderMenu>` integration
- `useTableState()` hook managing sort, filter, pagination, selection

**Current pain:** Adding a new column or changing batch bar behavior requires editing 4 files independently, hoping you don't miss one.

### Module 3 — Packages (`modules/packages/`)

**What:** Package list, package detail, label printing, photo management, status changes, auto-print.

**Target size:** ~8-10 focused components at 150-300 lines each (down from 2 files at 2,000+ lines each).

### Module 4 — Recipients/Customers (`modules/customers/`)

**What:** Customer list, customer detail, CSV import dialog, agent assignment.

**Target size:** ~6-8 components at 150-250 lines each (down from 2 files at ~1,900 combined).

### Module 5 — Invoices (`modules/invoices/`)

**What:** Invoice list, invoice detail, create invoice modal, payment tracking, notification triggers.

**Target size:** ~5-7 components at 150-300 lines each (down from 2 files at ~1,700 combined).

### Module 6 — AWBs/Shipments (`modules/awbs/`)

**What:** AWB list, AWB detail, courier assignment, tracking, notification triggers.

**Target size:** ~5-7 components at 150-300 lines each (down from 2 files at ~1,750 combined).

### Module 7 — Settings (`modules/settings/`)

**What:** 11 independent sub-modules behind a shared `SettingsLayout`, each with its own components and hooks.

**This is the single biggest win.** The 5,003-line settings page becomes:
- `general/` — ~300 lines (org name, slug, address, logos)
- `users/` — ~400 lines (user table, invite, bulk ops)
- `agents/` — ~250 lines (agent hierarchy)
- `couriers/` — ~350 lines (courier table, edit modal, logo upload)
- `warehouses/` — ~300 lines (location table, bulk ops)
- `tags/` — ~200 lines (tag manager with color picker)
- `statuses/` — ~250 lines (status manager with drag reorder)
- `labels/` — ~350 lines (label editor, preview, paper sizes)
- `notifications/` — ~150 lines (notification toggles)
- `trash/` — ~250 lines (recently deleted items, restore/permanent delete)
- `layout.tsx` — ~100 lines (shared tab navigation)

**Total: ~2,900 lines across 11 focused files** vs 5,003 lines in one file. Each sub-module can be debugged, tested, and shipped independently.

### Module 8 — Notifications (`modules/notifications/`)

**What:** NotificationBell component, real-time subscription hook, notification trigger utilities, notification types.

**Target size:** ~3-4 files at 100-200 lines each.

### Module 9 — Analytics & Dashboard (`modules/analytics/`, `modules/dashboard/`)

**What:** Dashboard stat cards, recent activity, analytics charts with dedicated data hooks.

**Target size:** ~3-4 components each at 100-200 lines.

### Module 10 — Forms & UI Kit (`shared/components/forms/`, `shared/components/feedback/`)

**What:** Shared form inputs, toggles, file uploaders, select components, confirm dialogs, toasts, empty states.

**Why:** Every form in the app is currently built inline with 50+ lines of JSX. A `<FormInput>`, `<Toggle>`, and `<FileUpload>` component library eliminates this duplication.

---

## IMPLEMENTATION PLAN

### Phase 7A — Foundation (shared infrastructure + settings split)

**Order of operations:**

1. **Install React Query** (`@tanstack/react-query`) — adds caching/dedup layer
2. **Create `shared/contexts/`** — AuthProvider, OrgProvider, QueryProvider
3. **Create `shared/hooks/`** — useAuth, useOrg, usePermissions, useTableState
4. **Create `shared/types/`** — database types, auth types, common types
5. **Create `shared/lib/api.ts`** — query helpers with automatic soft-delete filter
6. **Split settings page** into 11 sub-modules under `modules/settings/`
7. **Create settings layout** with Next.js nested routes (`settings/layout.tsx`)

**Why settings first:** It's the most painful file (5,003 lines), has zero dependencies on the table system, and proves the modular pattern works before tackling the more complex list pages.

### Phase 7B — Table System + List Page Extraction

1. **Build `shared/components/DataTable/`** — extract common table patterns from packages page (gold standard)
2. **Refactor packages page** to use DataTable + module hooks
3. **Refactor customers page** — same pattern
4. **Refactor invoices page** — same pattern
5. **Refactor AWBs page** — same pattern

### Phase 7C — Detail Pages + Forms

1. **Build `shared/components/forms/`** — extract form input patterns
2. **Refactor package detail** into focused components
3. **Refactor customer/invoice/AWB detail pages** — same pattern
4. **Extract notification module** from scattered files

### Phase 7D — Cleanup

1. **Delete orphaned components** (FilterDropdown.tsx, TopNav.tsx, Header.tsx)
2. **Remove old `src/components/`** directory (all moved to `shared/` or `modules/`)
3. **Remove old `src/hooks/`** directory (moved to `shared/hooks/`)
4. **Update all import paths**
5. **Verify TypeScript compilation** — `npx tsc --noEmit`
6. **Full regression test** — every page, every CRUD operation, every batch action

---

## MIGRATION RULES

These rules ensure the modularization doesn't break the live app:

1. **One module at a time.** Never refactor two modules simultaneously. Complete and verify one before starting the next.
2. **Feature parity required.** Every refactored module must produce identical behavior to the monolithic version. No regressions.
3. **Page routes don't change.** All URLs remain the same. Next.js `page.tsx` files become thin shells that import from modules.
4. **No new features during migration.** Modularization is pure refactoring. New features go in after a module is extracted.
5. **Settings gets its own routes.** The settings page transitions from a single route with tab state to nested routes (`/admin/settings/general`, `/admin/settings/users`, etc.). The old `/admin/settings` URL redirects to `/admin/settings/general`.
6. **Shared state before module extraction.** AuthProvider, OrgProvider, and QueryProvider must be in place before any module is extracted, because modules will depend on these contexts.

---

## PROGRESS TRACKER

| Phase | Module | Status | Notes |
|-------|--------|--------|-------|
| 7A-1 | Install React Query | ✅ Done | @tanstack/react-query + devtools |
| 7A-2 | shared/contexts (Auth, Org, Query) | ✅ Done | QueryProvider + AuthProvider |
| 7A-3 | shared/hooks (useAuth, useOrg, usePermissions) | ✅ Done | 3 hooks in shared/hooks/ |
| 7A-4 | shared/types | ✅ Done | database.ts, auth.ts, common.ts |
| 7A-5 | shared/lib/api.ts | ✅ Done | softDeleteQuery, getOrgSetting, etc. |
| 7A-6 | Settings split (11 sub-modules) | ✅ Done | 5,003→1,162 lines. 11 modules extracted |
| 7A-7 | Settings nested routes + layout | ✅ Done | /admin/settings/:tab routes, legacy ?tab= redirect |
| 7B-1 | shared/components/DataTable + useTableState | ✅ Done | DataTable, BatchBar, useTableState hook |
| 7B-2 | Packages refactored to shared hooks | ✅ Done | useTableState + BatchBar integrated |
| 7B-3 | Customers refactored to shared hooks | ✅ Done | useTableState + BatchBar integrated |
| 7B-4 | Invoices refactored to shared hooks | ✅ Done | useTableState + BatchBar integrated |
| 7B-5 | AWBs refactored to shared hooks | ✅ Done | useTableState + BatchBar integrated |
| 7C-1 | shared/components/forms | ✅ Done | FormInput, FormTextarea, FormSelect, Toggle, FileUpload, DetailRow, SuccessToast |
| 7C-2 | Package detail extraction | ✅ Done | 2,388→1,197 lines. PackageHeader, PhotoGallery, TagsSection, ActivityTimeline extracted |
| 7C-3 | Other detail pages | ✅ Done | Customer, Invoice, AWB use shared SuccessToast/DetailRow/Toggle |
| 7C-4 | Notifications module | ✅ Done | NotificationBell + triggers consolidated in modules/notifications/ |
| 7D-1 | Delete orphaned components | ✅ Done | Deleted FilterDropdown, TopNav, Header. Deleted NotificationBell + notifications shims after updating imports. |
| 7D-2 | Final cleanup + TypeScript verify | ✅ Done | All import paths updated to module locations. `npx tsc --noEmit` passes clean. |
| 7D-3 | Full regression test | ⬜ Manual | Every page, every CRUD operation, every batch action — requires browser testing |

---

## DEPENDENCIES TO INSTALL

| Package | Purpose | When |
|---------|---------|------|
| `@tanstack/react-query` | Data fetching, caching, deduplication | Phase 7A-1 |
| `@tanstack/react-query-devtools` | Dev-only debugging panel | Phase 7A-1 |

No other new dependencies required. The modularization is a structural refactor using existing libraries.
