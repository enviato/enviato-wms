# ENVIATO WMS V2 — Reskin Handoff Document

**Last Updated:** April 4, 2026
**Supabase Project ID:** `ilguqphtephoqlshgpza`
**Stack:** Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS + Supabase PostgreSQL
**Figma Reference:** `/mnt/uploads/code.html` (user-uploaded HTML export of the Figma design)

---

## PROJECT OVERVIEW

The ENVIATO WMS (Warehouse Management System) is being reskinned from its original design to a new Figma-based design. The reskin is **design-only** — all business logic, data fetching, RBAC, and functionality remain unchanged. The approach is page-by-page: update global tokens first, then each page's markup and styles.

---

## COMPLETED WORK

### 1. Global Design Tokens (tailwind.config.ts)
- **Primary color:** `#3c83f6` (replacing old `#00bbf9` capri)
- **Color system:** Slate-based palette for surfaces, borders, text (see `colors` in config)
- **Font:** Inter with custom `fontSize` scale (2xs=10px through 3xl=30px)
- **Shadows:** Custom shadow scale including pill, sidebar, bulk-modal
- **Border radius:** Custom scale (sm=4px, DEFAULT=6px, md=8px, lg=12px, xl=16px)
- **Animations:** fade-in, slide-up, slide-down keyframes

### 2. CSS Variables (globals.css :root)
- `--color-primary: #3c83f6`
- `--color-text-main: #0f172a`, `--color-text-muted: #64748b`
- `--color-border: #e2e8f0`, `--color-surface: #ffffff`
- `--color-background: #f5f7f8`
- Status colors: green, orange, blue, gray
- Custom shadows: `--shadow-sidebar`, `--shadow-pill`, `--shadow-popup`

### 3. Layout (layout.tsx)
- Sidebar (w-64) + main content (`flex-1 bg-background-light lg:ml-64`)
- **Known issue:** `lg:ml-64` is hardcoded — when sidebar collapses from w-64 to w-16, the margin doesn't adjust dynamically

### 4. Sidebar (Sidebar.tsx — ~300+ lines) ✅ FULLY UPDATED
- Nav items: `text-[14px]` with `font-semibold` (active) / `font-medium` (inactive)
- Active state: `bg-primary/10 text-primary`
- RBAC-aware nav filtering by permission keys
- **Dynamic org logo:** Fetches `logo_url` and `logo_icon_url` from `organizations` table, with fallback query if `logo_icon_url` column doesn't exist
- **Expanded state:** Shows full org logo (`h-8 max-w-[140px]`) + collapse chevron button
- **Collapsed state:** Shows logo icon (`h-7 max-w-[28px]`) — icon is clickable to expand sidebar (chevron hidden to save space in 32px content area)
- **Skeleton loading:** Shows placeholder while org data loads (no more hardcoded fallback flash)
- **Logo upload paths:** Full logo at `logos/{org_id}.{ext}`, icon at `logos/{org_id}-icon.{ext}` in Supabase Storage `assets` bucket

### 5. Packages Page (packages/page.tsx — 2034 lines) ✅ FULLY RESKINNED (Gold Standard)
- **Header:** `<header className="h-14">` with "Package Inventory" title, full search bar (`h-9`, `max-w-md`, `bg-slate-50`), Bell icon, "Add Package" button
- **Filter bar:** Dedicated bar below header with icon-only column selector (`SlidersHorizontal`), Status/Courier/Date/Warehouse filter pills (`.filter-pill` class), "Clear All" link
- **Table headers (.sheet-th):** 12px/600 uppercase, letter-spacing 0.05em, bg #f8fafc, 0.5px column borders
- **Table cells (.sheet-cell):** 14px/500, bg white, height 2.75rem (44px), 0.5px borders
- **Recipient:** `font-semibold text-slate-700` (inherits 14px)
- **Package ID:** `text-[13px] font-mono text-slate-400`
- **Tracking number:** `text-[13px] font-mono text-primary font-medium hover:underline`
- **Checked-in date:** `text-[13px] text-slate-500 font-normal`
- **Weight:** `text-slate-500 font-medium` (inherits 14px)
- **Status badge:** `text-[12px] font-medium` with colored dot
- **Checkbox:** 20×20px, 1.5px border, 5px radius, primary fill when checked
- **Photo thumbnail:** 32×32px square with border
- **Table container (.sheet-table-wrap):** border 1px solid #e2e8f0, border-radius 8px, bg white, overflow hidden
- **Row hover:** `rgba(60, 131, 246, 0.03)` on all cells
- **Cell hover:** `rgba(60, 131, 246, 0.04)` on individual cell
- **Row open button:** 13px, primary color, #eff6ff bg, 1px #bfdbfe border, appears on cell hover
- **Status footer:** text-[13px] with colored dots + "Showing X-Y of Z"
- **Batch action bar:** Frosted glass pill with `batch-bar-count-badge` + `batch-bar-label "Selected"` in bordered container, action buttons (Ship/Edit/Status/Tags/Delete) with `batch-bar-btn` class and conditional `active` class, `batch-bar-cancel` text button
- **Batch popovers:** Edit popover inline within batch bar; Status, Tags, Ship popovers rendered as top-level elements. All at `width: 340` (Ship at `380`). Each uses `batch-popover-header`/`batch-popover-actions` structure.
- **Popover backdrop:** `.popover-backdrop` overlay rendered when any popover is open
- **Mutual exclusion:** `closeAllPopovers()` helper prevents multiple popovers from stacking
- **CellDropdown portals:** Used for courier, agent, status inline table cell editing

### 6. Customers Page (customers/page.tsx — 1076 lines) ✅ FULLY RESKINNED
- **Header:** `<header className="h-14">` with "Recipients" title, search bar, Bell icon, "Add Recipient" button
- **Filter bar:** Icon-only column selector (`SlidersHorizontal`), no filter pills
- **Table:** Same `.sheet-*` classes, `ColumnHeaderMenu`, `useTableColumnSizing`
- **Batch bar:** Agent, Portal Access, Delete buttons with `batch-bar-btn` + `active` class
- **Batch popovers:** Agent and Portal popovers rendered outside batch bar as top-level elements at `width: 340`
- **Popover backdrop + mutual exclusion:** Same pattern as packages

### 7. Invoices Page (invoices/page.tsx — 1157 lines) ✅ FULLY RESKINNED
- **Header:** `<header className="h-14">` with "Invoices" title, search bar, Bell icon, "Create Invoice" button
- **Filter bar:** Icon-only column selector, Status filter pill, "Clear All" link
- **Summary cards:** Outstanding, Collected, Overdue cards below filter bar in main content
- **Table:** Same `.sheet-*` classes, `ColumnHeaderMenu`, `useTableColumnSizing`
- **Batch bar:** Status, Agent, Delete buttons with `batch-bar-btn` + `active` class
- **Batch popovers:** Status and Agent popovers rendered outside batch bar as top-level elements at `width: 340`
- **Popover backdrop + mutual exclusion:** Same pattern as packages

### 8. AWBs/Shipments Page (awbs/page.tsx — 1125 lines) ✅ FULLY RESKINNED
- **Header:** `<header className="h-14">` with "Shipments" title, search bar, Bell icon, "Create Shipment" button
- **Filter bar:** Icon-only column selector, Status filter pill, "Clear All" link
- **Table:** Same `.sheet-*` classes, `ColumnHeaderMenu`, `useTableColumnSizing`
- **Batch bar:** Agent, Delete buttons with `batch-bar-btn` + `active` class
- **Batch popovers:** Agent popover rendered outside batch bar as top-level element at `width: 340`
- **Popover backdrop + mutual exclusion:** Same pattern as packages

### 9. Settings Page (admin/settings/page.tsx — 4800+ lines) ✅ FULLY RESKINNED
- **Layout:** Card-based styling with `max-w-[1140px]` container, `px-6 py-5` spacing
- **Sidebar swap:** Main sidebar swaps to settings-specific tab navigation when on settings page
- **General tab:** Org name, slug, address fields + side-by-side logo uploads (full logo + logo icon) to Supabase Storage `assets` bucket
- **Users tab:** Full-width `sheet-table` pattern, search bar, **bulk select with batch actions** (activate/deactivate/delete with confirmation)
- **Courier Companies tab (renamed from "Agents"):** 3-column table (Company with logo thumbnail, Code, Actions), add courier with `org_id`, edit modal with logo upload/change/remove, delete with confirmation dialog + package reference nullification + deletion verification
- **Package ID tab:** Width fixed via container
- **Warehouse Locations tab:** Width fixed via container, **bulk select with batch actions** (set active/inactive/delete with confirmation)
- **Tags tab:** **Redesigned** — color accent left border, hex code label, usage count placeholder, elevated hover states
- **Statuses tab:** **Redesigned** — larger color circles with ring effect, "Default" badge on first status, workflow arrow dividers, color picker button, improved drag handles
- **Label Editor tab:** Full label template editor with field toggles, paper size selector, live barcode preview, **auto-print on check-in toggle**
- **Notifications tab:** 4 notification type toggles (awb_shipped, awb_arrived, package_received, invoice_ready) with **unified toggle style** (bg-gray-300 off / bg-primary on)
- **Popover close-on-outside-click:** All settings popovers close when clicking outside
- **Overlay animations, hover states:** Smooth transitions on all interactive elements
- **Toggle consistency:** All toggles across all tabs use identical styling with inline transform positioning

### 10. CSS Classes Created/Updated in globals.css (1535 lines)
Key custom classes:
- `.sheet-th`, `.sheet-cell`, `.sheet-row`, `.sheet-table-wrap` — Table system
- `.sheet-checkbox`, `.sheet-checkbox-cell` — Checkbox styling
- `.sheet-pagination` — Footer pagination bar
- `.batch-bar`, `.batch-bar-count-badge`, `.batch-bar-label`, `.batch-bar-btn`, `.batch-bar-btn.active`, `.batch-bar-btn.danger`, `.batch-bar-cancel` — Batch action bar
- `.batch-popover`, `.batch-popover-header`, `.batch-popover-title`, `.batch-popover-close`, `.batch-popover-label`, `.batch-popover-actions`, `.batch-popover-apply`, `.batch-popover-cancel` — Batch popovers
- `.popover-backdrop` — Semi-transparent overlay behind popovers
- `.filter-pill`, `.filter-pill.active`, `.filter-pill.open` — Filter pill buttons
- `.filter-dropdown`, `.filter-dropdown-item` — Filter dropdown menus
- `.row-open-btn` — Hover-reveal open button
- `.form-input` — Global form input (focus uses `--color-primary`)
- `.ss-trigger`, `.ss-dropdown`, `.ss-option`, etc. — SearchableSelect component
- `.btn-primary`, `.btn-secondary` — Button base classes
- `.modal-overlay`, `.modal-panel` — Modal system
- `.col-menu-*` — Column header menu classes

### 10. Color Migration
- All `brand-capri` Tailwind class references replaced with `primary`
- All `var(--color-brand-capri)` CSS variable references replaced with `var(--color-primary)`
- `--color-brand-capri` still defined in :root as alias (= `#3c83f6`)

### 11. Soft-Delete / Archive System (G-1) ✅
- **`deleted_at` column** added to 7 tables: `packages`, `invoices`, `awbs`, `courier_groups`, `warehouse_locations`, `tags`, `package_statuses`
- **Partial indexes** on `deleted_at IS NULL` for query performance
- **All delete handlers** updated to soft-delete (set `deleted_at = now()`) instead of hard-delete
- **API route** (`/api/admin/delete/route.ts`): Soft-deletes for `packages`, `invoices`, `awbs`, `courier_groups`; hard-deletes remain for `users` and `invoice_lines`
- **All SELECT queries** across all pages filter `.is("deleted_at", null)` to exclude archived records
- **Detail page fetches** (single record by ID) intentionally do NOT filter — allows viewing archived records if navigated to directly

### 12. Delete Confirmation Dialogs (G-2) ✅
- **Reusable `ConfirmDialog` component** at `src/components/ui/ConfirmDialog.tsx` — supports `danger` and `warning` variants, loading state, customizable title/description/labels
- **Tags and Statuses** in Settings now show confirmation dialog before deletion (these were the only pages missing them — all other pages already had confirmation modals)

### 13. Recently Deleted / Trash UI ✅
- **New "Recently Deleted" tab** in Settings sidebar (Apple Photos-style)
- **Loads all soft-deleted items** across all 7 entity types (packages, invoices, shipments, couriers, locations, tags, statuses)
- **Type filter dropdown** to filter by entity type
- **Restore button** — sets `deleted_at` back to `null`, item reappears in its original page
- **Permanent delete button** — hard-deletes the record with confirmation dialog
- **Time-ago display** — shows "Just now", "5m ago", "3d ago", etc.
- **Type badges** with color-coded icons for each entity type
- **Hover-reveal actions** — restore and delete buttons appear on row hover

### 14. Label Printing System ✅
- **PDF-based approach** bypasses Safari's CSS print engine entirely (9 failed CSS attempts before this breakthrough)
- **`src/lib/print-pdf.ts`** — `printLabelHtml()` captures label as PNG via `html-to-image` (toPng at 3x pixel ratio), embeds in jsPDF with exact page dimensions, opens PDF in new tab
- **`src/lib/label-builder.ts`** — Shared utility: `buildLabelHtml()` generates label HTML from package data + template fields, `isAutoPrintEnabled()` checks org_settings, `autoPrintLabel()` orchestrates the full auto-print flow
- **Auto-print on check-in:** When enabled in Settings → Label Editor → Automation, a label automatically prints when a package is added/checked in
- **Paper sizes:** 4×6, 4×4, 4×2, 2.25×1.25 inches
- **Barcode:** JsBarcode v3.11.6 CODE128 encoding of `PKG-{id}`
- **Template fields:** orgLogo, packageId, recipientName, customerNumber, agentName, billableWeight, dimensions (all configurable via Settings)

### 15. Notification System ✅
- **`src/lib/notifications.ts`** — Notification creation utilities: `createNotification()`, `notifyPackageReceived()`, `notifyAwbShipped()`, `notifyAwbArrived()`, `notifyInvoiceReady()`. Checks org notification settings before inserting.
- **`src/components/NotificationBell.tsx`** — Reusable bell icon with dropdown panel, uses **React portal** (`createPortal` to `document.body`) with `position: fixed` to escape parent overflow contexts. Features: unread count badge, real-time Supabase subscription for new notifications, 30s polling, mark as read/mark all read, click-outside-to-close, time-ago display, type-specific icons and colors.
- **Notification triggers wired:** Package check-in → `notifyPackageReceived`, Invoice creation → `notifyInvoiceReady`. AWB triggers ready but awaiting status change handlers.
- **NotificationBell integrated on all 7 admin pages:** packages, customers, invoices, AWBs, AWB detail, dashboard, analytics

### 16. Bulk CSV Upload for Recipients (R-4, R-5) ✅
- **PapaParse** installed for CSV parsing
- **"Import CSV" button** on Recipients page header with drag-and-drop file upload zone
- **Validation:** Required fields (first_name, last_name, email), email format, duplicate detection
- **Agent matching:** Maps `agent_code` from CSV to agent IDs
- **Progress tracking:** Progress bar during import with success/error counts
- **Downloadable CSV template** with correct headers and sample row

### 17. Profile Page (SB-2) ✅
- **New route:** `src/app/(dashboard)/admin/profile/page.tsx`
- **Features:** Editable first name, last name, phone; read-only email and role display; save button; sign-out button
- **Sidebar integration:** User profile section at bottom of sidebar is now clickable, navigates to `/admin/profile`

### 18. Courier Logo Display (SC-4) ✅
- **`logo_url`** fetched in courier_group joins on Packages and AWBs pages
- **Logo rendered inside `courier-badge`** container as 16×16 rounded image inline with courier name
- **Courier groups query** updated: `select("id, code, name, logo_url")`

---

## PHASE 7 — MODULARIZATION (Current Work)

> **Full roadmap:** See `MODULARIZATION.md` for the complete strategy, target directory structure, module definitions, implementation phases, and progress tracker.

### Why

The codebase is monolithic. The settings page is 5,003 lines with 11 unrelated features and 60+ state variables. Each list page (packages, customers, invoices, AWBs) independently duplicates table rendering, data fetching, filtering, and batch action logic. There are only 8 shared components, 1 custom hook, no React contexts, no state management, and no data caching. This architecture will not scale with heavy user data and makes debugging painful.

### What's Changing

The app is being rewritten into feature modules (`src/modules/`) with shared infrastructure (`src/shared/`). Next.js `page.tsx` files become thin route shells that import from modules. Key additions:

- **React Query** for cached, deduplicated data fetching
- **AuthProvider + OrgProvider** contexts (eliminate per-page duplicate auth/org queries)
- **Reusable `DataTable`** component (replaces 4x duplicated table logic)
- **Settings split** — 1 file with 5,003 lines → 11 sub-modules with nested Next.js routes
- **Shared form components** — `FormInput`, `Toggle`, `FileUpload`, `SearchableSelect`

### Implementation Phases

- **7A:** Foundation (React Query, contexts, hooks, types) + Settings split into 11 sub-modules
- **7B:** DataTable component + list page extraction (packages → customers → invoices → AWBs)
- **7C:** Detail page extraction + shared forms + notifications module
- **7D:** Cleanup (delete orphans, verify TypeScript, full regression test)

### Migration Rules

1. One module at a time — complete and verify before starting next
2. Feature parity required — no behavioral regressions
3. Page routes don't change (except settings which gets nested routes)
4. No new features during migration — pure refactoring
5. Shared contexts must be in place before any module extraction

---

## PHASE 8 — BUG FIXES & DATA MODEL CLARIFICATIONS (April 7, 2026)

### Data Model Clarifications

- **Carrier vs Courier:** These terms refer to the same concept (FedEx, UPS, DHL, etc.). Unified terminology throughout to use "Carrier" consistently.
- **Agent:** A business entity (forwarding agent/sub-brand) that owns customers. Customers are assigned to agents, creating a chain: Agent → Customer → Packages.
- **Courier Group field removed:** The redundant "Courier Group (optional)" field has been removed from the Add Package modal. Packages only need a carrier + customer.

### Bugs Fixed

#### 1. Recipient Dropdown Search (`src/app/(dashboard)/admin/packages/[id]/page.tsx`)
- **Issue:** Customer search only matched first_name, missing last_name matches
- **Fix:** Changed `.ilike("first_name", ...)` to `.or(\`first_name.ilike.%${query}%,last_name.ilike.%${query}%\`)`
- **Files:** `src/app/(dashboard)/admin/packages/[id]/page.tsx`

#### 2. Commodity & Package Type Selection (`src/app/(dashboard)/admin/packages/[id]/page.tsx`)
- **Issue:** Fields were text inputs, not selectable dropdowns
- **Fix:** 
  - Added `PACKAGE_TYPES` and `COMMODITIES` constants to `src/modules/packages/types.tsx`
  - Updated FieldRow calls to include `type="select"` and `selectOptions`
- **Files:** 
  - `src/modules/packages/types.tsx` (added constants)
  - `src/app/(dashboard)/admin/packages/[id]/page.tsx` (imported constants, updated FieldRow)

#### 3. Tags Settings Link (`src/modules/packages/components/TagsSection.tsx`)
- **Issue:** "Manage" link went to `/admin/settings` instead of specific tags page
- **Fix:** Changed to `/admin/settings/tags`
- **Files:** `src/modules/packages/components/TagsSection.tsx`

#### 4. Courier Group Field Removal (`src/app/(dashboard)/admin/packages/page.tsx`)
- **Issue:** Redundant "Courier Group (optional)" field in Add Package modal
- **Fix:** 
  - Removed form field JSX
  - Removed from FormData type
  - Removed from form reset logic
  - Removed from insert payload
- **Files:** `src/app/(dashboard)/admin/packages/page.tsx`

#### 5. Carrier/Courier Terminology Unification
- **Issue:** Mixed "Courier" and "Carrier" terminology across package list
- **Fix:** 
  - Column label: "Courier" → "Carrier"
  - Filter pill: "Courier:" → "Carrier:"
  - Batch edit placeholder: "Select courier" → "Select carrier"
  - Batch edit column option label: "Courier" → "Carrier"
- **Files:** `src/app/(dashboard)/admin/packages/page.tsx`

#### 6. Agent Linkage Visibility (`src/app/(dashboard)/admin/packages/[id]/page.tsx`)
- **Issue:** Agent relationship not visible on package detail page
- **Fix:** 
  - Updated customer query to include `agent_id` and nested `agent:agents(id, name, agent_code, company_name)`
  - Added new Agent block below Recipient section (read-only, only shows if agent exists)
  - Displays agent name, code, and company_name
- **Files:** `src/app/(dashboard)/admin/packages/[id]/page.tsx`

### Syntax Verification

All modified files pass TypeScript syntax check (TS2307 module resolution errors are expected with raw tsc).

---

## REMAINING WORK (NOT YET RESKINNED)

### Pages to Reskin:
~~1. **Package detail page** (`admin/packages/[id]/page.tsx` — 2104 lines)~~ ✅ DONE

### Known Issues to Address:
1. **Sidebar collapse margin:** ~~`lg:ml-64` on main content is hardcoded~~ **RESOLVED** — Layout now dynamically switches between `lg:ml-64` (expanded) and `lg:ml-16` (collapsed) based on `sidebarCollapsed` state.
2. **TopNav component** (`TopNav.tsx` — 497 lines): NOT used in the layout. The layout uses `Sidebar.tsx`. Each reskinned page renders its own `<header>` element. TopNav could be deleted or kept as reference.
3. **Header component** (`Header.tsx` — 229 lines): NOT used anywhere. Can be deleted or kept as reference.
4. **`form-input` CSS specificity:** The `.form-input` class in `globals.css` sets `padding-left: 10px` which overrides Tailwind `pl-8`. For search inputs that need icon padding, use inline `style={{ paddingLeft: 32 }}` instead of Tailwind class.

### Reskin Pattern (apply to each remaining page):
1. **Header:** Use `<header className="h-14 bg-white border-b border-border ...">` with page title, search bar (`h-9`, `max-w-md`, `bg-slate-50`), Bell icon, create button. Import `Bell` and `SlidersHorizontal` from lucide-react.
2. **Filter bar:** Dedicated bar below header with icon-only column selector (`h-8 w-8`, `SlidersHorizontal size={14}`). Add `.filter-pill` buttons as needed.
3. Column headers: Use `.sheet-th` class (12px/600 uppercase)
4. Table cells: Use `.sheet-cell` class (14px/500, white bg, 44px height)
5. Wrap table in `.sheet-table-wrap` with `p-4` padding on parent
6. Monospace text (IDs, tracking): `text-[13px] font-mono`
7. Status badges: `text-[12px] font-medium` with colored dot
8. Secondary/muted text: `text-[13px] text-slate-500`
9. Form inputs: Use `.form-input` class
10. Dropdowns inside tables: Use `CellDropdown` portal component (see architecture.md)
11. Dropdowns outside tables: Use `SearchableSelect` with `.ss-*` classes or inline absolute
12. Modals: Use `.modal-overlay` + `.modal-panel` classes
13. Buttons: `.btn-primary` / `.btn-secondary`
14. **Batch bar:** Use `batch-bar-count-badge` + `batch-bar-label "Selected"` in bordered container, `batch-bar-btn` with conditional `active` class, `batch-bar-cancel`. Render popovers as top-level elements with `batch-popover-header`/`batch-popover-actions` at `width: 340`.
15. **Mutual exclusion:** Define `closeAllPopovers()` helper, call before opening any popover. Render `.popover-backdrop` when any popover is open.
16. Replace any remaining `brand-capri` with `primary`

---

## FILE INVENTORY

### Core Config:
- `tailwind.config.ts` — Design tokens (colors, fonts, shadows, radii, animations)
- `src/app/globals.css` — 1535 lines, all custom CSS classes
- `src/app/(dashboard)/layout.tsx` — Dashboard layout (sidebar + main)

### Components:
- `src/components/Sidebar.tsx` — ~300+ lines, collapsible sidebar nav with RBAC, dynamic org logo/icon from Supabase, clickable profile footer → `/admin/profile`
- `src/components/NotificationBell.tsx` — ~255 lines, portal-based notification dropdown with real-time Supabase subscription, unread badge, mark read/all read
- `src/components/TopNav.tsx` — 497 lines, top navigation bar (**NOT USED** in layout)
- `src/components/Header.tsx` — 229 lines, page header (**NOT USED**)
- `src/components/SearchableSelect.tsx` — 134 lines, reusable searchable dropdown (inline absolute)
- `src/components/ColumnHeaderMenu.tsx` — 169 lines, column header context menu (inline absolute)
- `src/components/CellDropdown.tsx` — 92 lines, portal dropdown for table cells inside overflow-clipped containers
- `src/components/FilterDropdown.tsx` — 120 lines, **ORPHANED** (not imported anywhere, kept as reference)
- `src/components/ui/ConfirmDialog.tsx` — Reusable delete confirmation dialog (danger/warning variants, loading state)

### Pages (admin):
- `src/app/(dashboard)/admin/page.tsx` — Dashboard home ✅ RESKINNED
- `src/app/(dashboard)/admin/packages/page.tsx` — 2034 lines ✅ RESKINNED (Gold Standard) + auto-print + notification triggers
- `src/app/(dashboard)/admin/packages/[id]/page.tsx` — 2104 lines ✅ RESKINNED + label print button
- `src/app/(dashboard)/admin/customers/page.tsx` — 1200+ lines ✅ RESKINNED + CSV import
- `src/app/(dashboard)/admin/awbs/page.tsx` — 1150+ lines ✅ RESKINNED + courier logos
- `src/app/(dashboard)/admin/invoices/page.tsx` — 1180+ lines ✅ RESKINNED + notification triggers
- `src/app/(dashboard)/admin/analytics/page.tsx` — 672 lines ✅ RESKINNED
- `src/app/(dashboard)/admin/settings/page.tsx` — 4800+ lines ✅ RESKINNED — bulk ops, redesigned tags/statuses, notification toggles, auto-print toggle, label editor
- `src/app/(dashboard)/admin/profile/page.tsx` — **NEW** — User profile page (edit name/phone, sign out)

### Lib:
- `src/lib/supabase.ts` — Client-side Supabase client
- `src/lib/supabase-server.ts` — Server-side Supabase client
- `src/lib/utils.ts` — Utility functions
- `src/lib/print-pdf.ts` — **NEW** — PDF-based label printing (html-to-image → jsPDF → blob URL)
- `src/lib/label-builder.ts` — **NEW** — Shared label HTML generation, auto-print orchestration
- `src/lib/notifications.ts` — **NEW** — Notification creation utilities (4 event types, org settings checks)
- `src/lib/admin-delete.ts` — Soft-delete API helper

### Reference:
- `/mnt/uploads/code.html` — Figma design reference (HTML export with all page designs)

---

## FONT HIERARCHY (for data-heavy dashboards)

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Page title | 18px | 700 | `text-lg font-bold` |
| Column headers | 12px | 600 | Uppercase, letter-spacing 0.05em |
| Table body | 14px | 500 | Primary readable text |
| Status badges | 12px | 600 | With colored dot indicator |
| Tracking/IDs | 13px | 500 | Monospace font |
| Filter bar | 14px | 500 | `text-sm` |
| Sidebar nav | 14px | 500-600 | Semibold when active |
| Secondary/muted | 13px | 400 | Slate-500 color |
| Row height | 44px | — | `2.75rem` |

---

## DESIGN SYSTEM QUICK REFERENCE

### Colors:
- Primary: `#3c83f6` (Tailwind: `primary`, CSS: `var(--color-primary)`)
- Page bg: `#f5f7f8` (Tailwind: `bg-background-light`)
- Surface: `#ffffff` (white cards/tables)
- Border: `#e2e8f0` (Tailwind: `border-border`)
- Text primary: `#0f172a` (Tailwind: `text-txt-primary`)
- Text secondary: `#334155` (Tailwind: `text-txt-secondary`)
- Text tertiary: `#64748b` (Tailwind: `text-txt-tertiary`)
- Text placeholder: `#94a3b8` (Tailwind: `text-txt-placeholder`)

### Status Colors:
- Green: `#10b981` — Active/Delivered/Paid
- Orange: `#f59e0b` — In Transit/Pending
- Blue: `#3b82f6` — At Destination/Processing
- Red: `#ef4444` — Error/Delete/Overdue
- Gray: `#64748b` — Draft/Inactive

### Key Patterns:
- Table container: `.sheet-table-wrap` wrapping scrollable div
- Hover: Primary blue at 3-4% opacity
- Focus rings: `0 0 0 4px rgba(60, 131, 246, 0.1)`
- Border thickness: 0.5px for table lines, 1px for containers
- Border radius: 8px for cards/containers, 6px for inputs, 5px for checkboxes
- Page header: `<header className="h-14">` with title + search bar + Bell + create button
- Filter bar: `bg-white border-b border-border px-6 py-2.5` with icon-only column selector (`h-8 w-8`) + filter pills
- Batch bar active state: CSS `.batch-bar-btn.active` class (NOT inline Tailwind)
- Popover backdrop: `.popover-backdrop` overlay when any popover is open
- Mutual exclusion: `closeAllPopovers()` helper on every page
- Batch bar icon size: `size={16}`, column selector: `size={14}`, Bell: `size={18}`

---

## ADDITIONAL DOCUMENTATION

- `MODULARIZATION.md` — **Phase 7 roadmap**: full modular architecture strategy, target directory structure, 10 module definitions, 4 implementation phases (7A–7D), migration rules, progress tracker. **Read this first for current work direction.**
- `GO-LIVE-READINESS.md` — **52 tracked issues** across all pages (**49 completed**, 3 remaining P2 items), prioritized P0–P3, Phases 1–6 all complete, Phase 7 (modularization) added, database changes documented
- `architecture.md` — Modularization overview, dropdown/popover architecture, overflow context map, z-index layer system, component inventory, **standardized page layout**, lessons learned
- `instructions.md` — Development guidelines for adding dropdowns, modularization conventions, **standardized page layout templates**, CSS class usage guide, overflow rules, z-index conventions, general conventions
- `css-architecture.md` — CSS custom properties reference, overflow contexts & dropdown implications, CSS class families, **standardized page layout styles**, animations, Tailwind configuration

**Start here when resuming work:** Read `MODULARIZATION.md` first for the current direction (Phase 7 modularization), then `HANDOFF.md` for project overview, then `GO-LIVE-READINESS.md` for the full issue tracker, then `architecture.md` for technical decisions. The packages page (`admin/packages/page.tsx`) is the gold standard — all other pages should match its patterns.
