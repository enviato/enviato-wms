# ENVIATO WMS V2 — Architecture Document

**Last Updated:** April 19, 2026 (late — Phase 10A applied)
**Stack:** Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS + Supabase PostgreSQL

> **Security posture note (2026-04-19, late):** ENVIATO is a **customer-facing, multi-sided, multi-tenant platform** — CUSTOMER, AGENT_STAFF, and AGENT_ADMIN roles are untrusted consumers, not internal staff. Tenants are fully walled off from each other; within a tenant, agents form an N-deep tree with strict subtree visibility rules. Every RLS policy must be authored with a hostile-user threat model. The Tier 6.0 RLS audit surfaced 2 CRITICAL in-tenant privilege-escalation paths; Phase 10A migrations (016 + 016a hotfix, 017, 018) landed live on 2026-04-19 and all attack paths are now blocked. See the **RLS Policy Architecture**, **Multi-Tenant Architecture**, and lessons 24–28 sections below.

---

## MODULARIZATION (Phase 7 — Complete)

> **Full roadmap:** See `MODULARIZATION.md` for the complete strategy, directory structure, module definitions, and progress tracker.

The codebase has been rewritten from a monolithic page-level architecture into a modular structure. The original state had ~19,700 lines concentrated in a few massive files (settings: 5,003 LOC, package detail: 2,388 LOC, packages list: 2,055 LOC), with minimal shared infrastructure (8 components, 1 hook, no contexts, no caching).

### Target Architecture

```
src/
├── app/           # Thin Next.js route shells (import from modules)
├── modules/       # Feature modules (packages, customers, invoices, awbs, settings/*, notifications, analytics, dashboard)
└── shared/        # Cross-module infrastructure (contexts, hooks, DataTable, forms, types, lib)
```

### Key Changes

1. **React Query** — Replaces raw `useEffect` + `useState` data fetching with cached, deduplicated queries
2. **Auth/Org Contexts** — Single source of truth for auth state, permissions, and org data (eliminates per-page duplicate fetching)
3. **DataTable component** — Reusable table with column config, sorting, filtering, pagination, batch actions (replaces 4x duplicated table logic)
4. **Settings split** — 5,003-line monolith → 11 independent sub-modules with Next.js nested routes
5. **Form components** — Shared `FormInput`, `Toggle`, `FileUpload`, `SearchableSelect` (replaces inline 50+ line form JSX)

### Implementation Order

- **Phase 7A:** Foundation (React Query, contexts, hooks, types, API helpers) + Settings split
- **Phase 7B:** DataTable system + list page extraction (packages → customers → invoices → AWBs)
- **Phase 7C:** Detail page extraction + forms + notifications module
- **Phase 7D:** Cleanup (delete orphans, verify TypeScript, regression test)

### Migration Rule

All existing dropdown, portal, z-index, and overflow patterns documented below remain unchanged. The modularization moves code into modules but does NOT alter rendering behavior, CSS architecture, or portal strategies.

---

## DROPDOWN & POPOVER ARCHITECTURE

### The Problem

The dashboard uses data tables wrapped in `.sheet-table-wrap`, which has `overflow: hidden` (required for `border-radius: 8px` to clip child content). Inside these tables, editable cells (courier, agent, status) render dropdown menus when clicked. Because the dropdowns are children of the overflow-clipped container, they get cut off and appear "behind" the table frame.

### Two Dropdown Categories

The codebase distinguishes between two types of dropdowns based on their position in the DOM relative to overflow containers:

**1. Inline Dropdowns (no portal needed)**

These dropdowns live outside overflow-clipped containers, so simple `position: absolute` relative to a `position: relative` parent works fine.

- **Filter pill dropdowns** — Rendered above the table in the filter bar. Parent has no overflow clipping. Uses CSS class `.filter-dropdown` with `position: absolute; top: calc(100% + 4px)`.
- **Column header menus** — Rendered via `ColumnHeaderMenu.tsx`. Uses `.col-menu-wrapper` (relative) + `.col-menu-dropdown` (absolute). Lives in the `<thead>` which has `position: sticky; z-index: 14` but is not overflow-clipped.
- **SearchableSelect** — Used inside `.batch-popover` and other contexts outside overflow containers. Uses `.ss-wrapper` (relative) + `.ss-dropdown` (absolute). Includes **auto-flip logic**: on open, measures viewport space above/below the trigger via `getBoundingClientRect()` and flips the dropdown upward (via inline `style`) if insufficient space below. Also dynamically constrains `maxHeight` on `.ss-options` so the list never overflows the viewport edge.

**2. Portal Dropdowns (CellDropdown, NotificationBell)**

These dropdowns live inside overflow-clipped containers and must escape via `createPortal` to `document.body`.

- **Courier cell dropdown** — Select a courier from a searchable list
- **Agent cell dropdown** — Select an agent from a searchable list
- **Status cell dropdown** — Select a status from a list
- **Notification panel** — Dropdown panel from the bell icon in the page header

The first three use the `<CellDropdown>` component. The notification panel uses `<NotificationBell>` with its own portal implementation.

### CellDropdown Component (`src/components/CellDropdown.tsx`)

A minimal portal-based dropdown designed specifically for table cells inside overflow-clipped containers.

**Key design decisions:**

1. **Synchronous positioning via `getBoundingClientRect()`** — The anchor element's bounding rect is read during render (not in a `useEffect`), so the dropdown appears at the correct position on the very first paint. This eliminates the "flash at (0,0)" problem that occurs with async positioning libraries.

2. **No `@floating-ui/react`** — Earlier attempts used Floating UI, but its async positioning model (`useFloating` returns `{x:0, y:0}` before first calculation) caused a visible flash where the dropdown appeared at the top-left corner before jumping to the correct position. Even using `useLayoutEffect` for ref syncing and `isPositioned` for visibility gating did not fully eliminate the flash.

3. **`position: fixed`** — Since the dropdown is portaled to `document.body`, it uses viewport-relative fixed positioning calculated from the anchor's bounding rect.

4. **Auto-flip** — If there's less than 120px below the anchor and more space above, the dropdown renders above the anchor instead.

5. **`anchorEl` prop (not ref)** — Accepts a direct DOM element reference (`HTMLElement | null`) rather than a React ref. This avoids the problem of ref identity instability (creating `{ current: element }` objects on every render breaks position tracking).

**Usage pattern in page components:**

```tsx
const [cellAnchorEl, setCellAnchorEl] = useState<HTMLElement | null>(null);

// In the table cell click handler:
<td onClick={(e) => {
  setCellAnchorEl(e.currentTarget);
  setDropdownCell({ rowId, field: "courier" });
}}>
  {/* cell content */}
</td>

// Render the dropdown:
<CellDropdown
  open={dropdownCell?.field === "courier"}
  onClose={() => { setDropdownCell(null); setCellAnchorEl(null); }}
  anchorEl={cellAnchorEl}
  width={200}
>
  {/* dropdown options */}
</CellDropdown>
```

### FilterDropdown Component (`src/components/FilterDropdown.tsx`)

**Status: ORPHANED** — This component exists but is not currently imported by any page. It was created during the @floating-ui/react portal approach and kept as a reference. It can be safely deleted or repurposed if needed in the future.

It uses `@floating-ui/react` with `useFloating`, `offset`, `flip`, `shift`, and `size` middleware plus `createPortal`. If revived, note the positioning flash issue documented above.

### Batch Action Bar & Edit Popover

The batch action bar (`.batch-bar`) floats at the bottom of the viewport when rows are selected. Its edit popover (`.batch-popover`) contains `SearchableSelect` dropdowns.

**Critical CSS:** `.batch-popover` uses `overflow: visible` (not `overflow-y: auto`) so that `SearchableSelect` dropdowns inside it are not clipped. This was changed from the original `overflow-y: auto` to fix dropdown clipping.

**Viewport-edge clipping:** Even with `overflow: visible`, the batch popover sits near the bottom of the viewport (`position: fixed; bottom: 90px`). When the SearchableSelect dropdown opens downward, it can extend past the viewport edge. `SearchableSelect` handles this with built-in auto-flip: it reads the trigger's `getBoundingClientRect()` synchronously during render, checks available space below vs. above, and flips the dropdown upward (inline `style: { top: "auto", bottom: "calc(100% + 4px)" }`) when space below is insufficient. It also dynamically constrains `maxHeight` on `.ss-options` to fit the available space in whichever direction the dropdown opens.

**Backdrop overlay:** All pages with batch popovers render a `.popover-backdrop` element (semi-transparent black overlay at `z-index: var(--z-popover)`) when any popover is open. Clicking the backdrop closes all popovers. The batch bar and its popovers sit at `z-index: calc(var(--z-popover) + 1)` so they appear above the backdrop.

**Mutual exclusion:** Each page defines a `closeAllPopovers()` helper that resets all popover states. Every batch bar button calls `closeAllPopovers()` before opening its own popover, preventing multiple popovers from stacking. This pattern is applied globally across all pages: packages, customers, invoices, and AWBs.

### NotificationBell Component (`src/components/NotificationBell.tsx`)

A portal-based notification dropdown that renders a panel from the bell icon in the page header.

**Why portal?** The page header lives inside `<div className="flex flex-col h-full overflow-hidden">` in the dashboard layout. This `overflow: hidden` creates a clipping context that traps absolutely-positioned children — even with `z-index: 9999`, the dropdown gets cut off. Increasing z-index alone does NOT solve overflow clipping.

**Key design decisions:**

1. **`createPortal` to `document.body`** — The dropdown panel escapes the overflow-clipped layout container entirely.

2. **`position: fixed` with `getBoundingClientRect()`** — On open, reads the bell button's bounding rect and positions the panel at `{ top: rect.bottom + 6, right: window.innerWidth - rect.right }`.

3. **Dynamic repositioning on scroll/resize** — Attaches `scroll` (with `capture: true` for nested scroll containers) and `resize` event listeners while the panel is open. Removes them on close.

4. **Click-outside handling** — Uses a `mousedown` listener on `document` that checks whether the click target is inside the panel or the bell button. Closes the panel if outside.

5. **Real-time updates** — Subscribes to Supabase `postgres_changes` on the `notifications` table filtered by `org_id`, plus 30-second polling as a fallback.

**Usage pattern:**

```tsx
import NotificationBell from "@/components/NotificationBell";

// In the page header (right side):
<NotificationBell />
```

The component is self-contained — it manages its own open/close state, data fetching, and portal rendering. No props required. Used on all 7 admin pages.

---

## OVERFLOW CONTEXT MAP

Understanding which containers clip their children is essential for choosing inline vs. portal dropdowns:

| Container | CSS | Clips Children? | Dropdown Strategy |
|-----------|-----|-----------------|-------------------|
| `.sheet-table-wrap` | `overflow: hidden` | Yes | Use `<CellDropdown>` portal |
| `.sheet-table-wrap > div` (scroll container) | `overflow: auto` | Yes | Use `<CellDropdown>` portal |
| `.batch-popover` | `overflow: visible` | No | Inline absolute OK |
| Filter bar | No overflow set | No | Inline absolute OK |
| `<thead>` (sticky) | `position: sticky` | No | Inline absolute OK |
| `.modal-panel` | `overflow-y: auto` | Yes | Use portal if needed |
| Page layout wrapper | `overflow: hidden` (on `flex flex-col h-full`) | Yes | Use portal (NotificationBell) |

---

## Z-INDEX LAYER SYSTEM

Defined as CSS custom properties in `globals.css :root`:

| Layer | Variable | Value | Usage |
|-------|----------|-------|-------|
| Base | `--z-base` | 0 | Default stacking |
| Raised | `--z-raised` | 1 | Slightly elevated elements |
| Sticky | `--z-sticky` | 20 | Sticky table headers, fixed bars |
| Sidebar | `--z-sidebar` | 40 | Sidebar navigation |
| Dropdown | `--z-dropdown` | 1000 | All dropdown menus |
| Popover | `--z-popover` | 1100 | CellDropdown portals, batch popover |
| Modal | `--z-modal` | 1200 | Modal overlays and panels |
| Toast | `--z-toast` | 1300 | Toast notifications |

**Rule:** Portal dropdowns (CellDropdown) use `z-index: 1100` (popover level) to ensure they appear above inline dropdowns and sticky headers.

---

## COMPONENT INVENTORY

### Dropdown/Popover Components

| Component | File | Strategy | Used By |
|-----------|------|----------|---------|
| `CellDropdown` | `src/components/CellDropdown.tsx` (92 lines) | Portal + sync positioning | packages/page.tsx (courier, agent, status cells) |
| `SearchableSelect` | `src/components/SearchableSelect.tsx` (172 lines) | Inline absolute + auto-flip | batch popovers on all 4 list pages, package detail page |
| `ColumnHeaderMenu` | `src/components/ColumnHeaderMenu.tsx` (165 lines) | Inline absolute | All 4 list pages: packages, customers, awbs, invoices |
| `NotificationBell` | `src/components/NotificationBell.tsx` (~255 lines) | Portal + sync positioning + real-time sub | All 7 admin pages (self-contained, no props) |
| `ConfirmDialog` | `src/components/ConfirmDialog.tsx` | Modal overlay | Settings page (tags, statuses, couriers, users, warehouses) |
| `FilterDropdown` | `src/components/FilterDropdown.tsx` (120 lines) | Portal + @floating-ui | **ORPHANED — not imported anywhere** |

### Key Page Files

| Page | File | Dropdown Usage |
|------|------|----------------|
| Packages | `admin/packages/page.tsx` | CellDropdown for table cells, inline filter pills, batch popovers (Edit inline, Status/Tags/Ship as top-level) |
| Package Detail | `admin/packages/[id]/page.tsx` | Inline absolute dropdowns (not inside overflow container) |
| Customers | `admin/customers/page.tsx` | Inline filter dropdowns, batch popovers (Agent, Portal as top-level) |
| Invoices | `admin/invoices/page.tsx` | Inline filter dropdowns, filter pills (Status), batch popovers (Status, Agent as top-level) |
| AWBs | `admin/awbs/page.tsx` | Inline filter dropdowns, filter pills (Status), batch popovers (Agent as top-level) |
| Settings | `admin/settings/page.tsx` (~4800+ lines) | Modal dialogs for courier edit/delete, inline modals for add courier, logo upload modals, ConfirmDialog for tags/statuses/users/warehouses. Tables use `--table-size: 100%` with stripped `sheet-table-wrap` borders inside cards. Bulk select/batch actions on Users and Warehouse Locations tables. |
| Dashboard | `admin/dashboard/page.tsx` | No dropdowns — stat cards, recent activity table |
| Analytics | `admin/analytics/page.tsx` | No dropdowns — chart components, date selectors |
| Profile | `admin/profile/page.tsx` | Inline form fields — no dropdowns or popovers |

---

## STANDARDIZED PAGE LAYOUT

All admin pages follow a consistent layout structure modeled after the packages/inventory page (the "gold standard").

### Page Structure (top to bottom)

1. **Header** (`<header className="h-14 bg-white border-b border-border ...">`)
   - Left: Page title (`text-lg font-bold`) + search bar (`h-9`, `max-w-md`, `bg-slate-50`, `Search` icon at `size={16}`)
   - Right: `<NotificationBell />` component (portal-based dropdown with real-time Supabase subscription, unread badge) + primary create button (`btn-primary` + `Plus size={16}`)

2. **Filter Bar** (`<div className="bg-white border-b border-border px-6 py-2.5 ...">`)
   - Icon-only column selector button (`h-8 w-8`, `SlidersHorizontal size={14}`, `rounded-lg`)
   - Filter pills (`.filter-pill` class) with `.active` and `.open` states
   - "Clear All" link when filters are active
   - Packages page has Status, Courier, Date, and Warehouse filter pills
   - Invoices and AWBs pages have Status filter pill
   - Customers page has no filter pills (column selector only)

3. **Main Content Area** — Table with `.sheet-table-wrap`, pagination

4. **Batch Action Bar** (`.batch-bar`, appears when rows selected)
   - Count badge (`batch-bar-count-badge`) + "Selected" label (`batch-bar-label`) in bordered container
   - Action buttons (`batch-bar-btn`) with icons at `size={16}` and conditional `active` class
   - Delete button (`batch-bar-btn danger`)
   - Cancel button (`batch-bar-cancel`)

5. **Batch Popovers** (`.batch-popover`, rendered as top-level fixed elements)
   - On packages page: Edit popover is inline within the batch bar; Status, Tags, and Ship popovers are top-level
   - On customers, invoices, AWBs: All popovers are top-level (outside batch bar DOM tree)
   - All use `width: 340` (except Ship popover at `380`)
   - Structure: `batch-popover-header` > `batch-popover-title` + `batch-popover-close`, form content with `batch-popover-label`, `batch-popover-actions` > `batch-popover-apply` + `batch-popover-cancel`

6. **Popover Backdrop** (`.popover-backdrop`, rendered when any popover is open)

### Batch Bar Actions by Page

| Page | Actions |
|------|---------|
| Packages | Ship, Edit, Status, Tags, Delete |
| Customers | Agent, Portal Access, Delete |
| Invoices | Status, Agent, Delete |
| AWBs | Agent, Delete |

### Imports All Pages Share

All admin pages import: `Search`, `Bell`, `SlidersHorizontal`, `Plus`, `X`, `Check`, `Calendar`, `Upload` from `lucide-react`. All use `SearchableSelect`, `useTableColumnSizing`, and `ColumnHeaderMenu` components.

---

## LESSONS LEARNED

1. **Don't use `@floating-ui/react` for portaled dropdowns in this codebase.** Its async positioning model causes a visible flash at (0,0) before the correct position is calculated. Synchronous `getBoundingClientRect()` during render is simpler and flash-free.

2. **Only portal what you must.** Portals add complexity (event bubbling changes, anchor tracking, scroll/resize handling). Use them only when the dropdown is inside an overflow-clipped container.

3. **Pass DOM elements, not refs.** When capturing click targets for dropdown anchoring, store `e.currentTarget` in state as an `HTMLElement`. Don't create wrapper ref objects like `{ current: el }` — these lose identity on re-render and break position tracking.

4. **Check `overflow` on every ancestor.** Any ancestor with `overflow: hidden`, `overflow: auto`, or `overflow: scroll` will clip absolutely-positioned children, regardless of z-index.

5. **`overflow: hidden` on `.sheet-table-wrap` is required.** It enforces the `border-radius: 8px` clipping. Removing it would show square corners on the table. This is why cell dropdowns must use portals.

6. **Always handle viewport-edge clipping for inline dropdowns.** Even when a dropdown isn't clipped by an overflow container, it can extend past the viewport edge if the trigger is near the top or bottom of the screen. Use synchronous `getBoundingClientRect()` during render to measure available space and flip direction + constrain `maxHeight` accordingly. CSS-class-based flipping (toggling a class via state) is less reliable than inline `style` overrides computed during render.

7. **Inline styles beat CSS classes for dynamic positioning.** When dropdown position depends on runtime viewport measurements, apply the computed values as inline `style` props rather than toggling CSS classes. Inline styles have the highest specificity and take effect on the same render — no timing issues with class application or specificity conflicts.

8. **Enforce mutual exclusion for batch popovers.** The batch bar has multiple action buttons (Ship, Edit, Status, Tags) that each open a popover. Because their visibility states are independent booleans, clicking one button while another popover is open causes both to render simultaneously at the same fixed position, stacking on top of each other. Fix: use a shared `closeAllPopovers()` helper that resets all popover states, and call it before opening any new popover. Each button handler calls `closeAllPopovers()` then sets its own state to `true`.

9. **Supabase query fails entirely if a SELECT includes a non-existent column.** PostgREST returns null for the whole query — not just the missing field. When adding new columns (e.g., `logo_icon_url` on `organizations`), always use a fallback query without the new column in case it hasn't been added to the DB yet.

10. **`form-input` CSS class overrides Tailwind padding.** The `.form-input` class in `globals.css` sets `padding-left: 10px` which has higher specificity than Tailwind's `pl-8` (32px). For search inputs that need icon space, use inline `style={{ paddingLeft: 32 }}` instead of Tailwind class.

11. **Always include `org_id` on Supabase inserts to org-scoped tables.** Tables with RLS policies typically require `org_id` to match the authenticated user's organization. Forgetting this causes silent insert failures.

12. **Settings tables inside cards need stripped borders.** When embedding `sheet-table-wrap` inside a card that already has borders, add `style={{ border: 'none', borderRadius: 0 }}` to the wrap div and use `--table-size: 100%` instead of fixed pixel widths.

13. **Collapsed sidebar content area is only 32px wide.** With `w-16` (64px) and `p-4` (16px each side), only 32px remains for content. Don't try to fit two elements side-by-side — use a single clickable element instead.

14. **`z-index` cannot escape `overflow: hidden`.** When a parent has `overflow: hidden`, child elements are clipped regardless of z-index value. The only way to escape is via `createPortal` to `document.body`. This applies beyond table cells — the page layout wrapper itself (`flex flex-col h-full overflow-hidden`) clips header elements like the NotificationBell dropdown. Diagnosis tip: if increasing z-index doesn't fix a clipping issue, inspect ancestors for overflow clipping.

15. **Reposition portaled elements on scroll and resize.** Portal dropdowns use `position: fixed` with coordinates from `getBoundingClientRect()`. These coordinates become stale when the user scrolls or resizes the window. Attach `scroll` (with `capture: true` for nested containers) and `resize` listeners while the portal is open, and recalculate position in the handler. Clean up listeners on close.

16. **Use `boxShadow` instead of non-standard CSS properties.** TypeScript's `CSSProperties` type rejects non-standard properties like `ringColor`. To create ring effects similar to Tailwind's `ring` utility in inline styles, use `boxShadow: '0 0 0 2px white, 0 0 0 4px ${color}40'` (multiple box-shadows simulate inner and outer rings).

17. **Unified toggle styling pattern.** Use `bg-gray-300` (off) / `bg-primary` (on) with inline `transform: translateX()` for the knob. Tailwind classes like `translate-x-5` combined with positional classes (`right-0.5`, `left-0.5`) cause inconsistent behavior across toggles. Inline `style={{ transform: isEnabled ? "translateX(20px)" : "translateX(0)" }}` is reliable everywhere.

18. **Soft-delete queries must filter `deleted_at IS NULL`.** Every Supabase `.select()` on a soft-delete-enabled table must include `.is("deleted_at", null)`. Missing this filter causes deleted records to reappear in lists. The convention applies to 7 tables: packages, invoices, awbs, courier_groups, warehouse_locations, tags, package_statuses.

19. **Use `dynamic = "force-dynamic"` for auth-protected route groups.** All admin routes require authentication and use client-side hooks. Next.js will attempt to statically prerender pages during build, which fails for auth-protected pages. Adding `export const dynamic = "force-dynamic"` to the route group's `layout.tsx` (e.g., `src/app/(dashboard)/admin/layout.tsx`) prevents this globally for all child routes. Do NOT use `missingSuspenseWithCSRBailout: false` in `next.config.js` — that silences the error without fixing the underlying issue.

20. **Wrap `useSearchParams()` in a `<Suspense>` boundary.** Next.js requires components that call `useSearchParams()` to be wrapped in `<Suspense>` for proper SSR. Without it, the entire page tree bails out of static rendering. The pattern: extract the search-params-dependent logic into a small inner component, wrap it with `<Suspense fallback={...}>` at the call site. See `Sidebar.tsx` → `SettingsTabList` for the reference implementation.

21. **Always check and surface Supabase query errors.** Never destructure only `data` from a Supabase query — always capture `error` too. Pattern: `const { data, error } = await supabase.from("table").select("*"); if (error) { showError("Failed to load"); return; }`. Silently discarding errors causes empty/partial UI states that users can't distinguish from "no data exists."

22. **Admin API routes using service role must verify record ownership.** When an API route uses `supabaseAdmin` (service role) to bypass RLS, it MUST verify the target record's `org_id` matches the authenticated user's org before mutating. Pattern: fetch the record first with the anon client (which respects RLS), confirm it exists and belongs to the user's org, then proceed with the admin client mutation.

23. **Standardize role checks on `role_v2`, never `role`.** The legacy `role` column may be stale or unpopulated for new users. All server-side role checks must use `role_v2` with values `ORG_ADMIN` or `WAREHOUSE_STAFF` (uppercase). Audit any `profile.role` references.

24. **Every `UPDATE` policy on a table with self-mutable sensitive columns needs an explicit `WITH CHECK`.** In Postgres, `WITH CHECK` defaults to the `USING` expression when omitted. For most tables that's fine because `USING` is restrictive enough. But on `users` (and any other table where a row owns its own privilege level), `USING (id = auth.uid())` is a permissive check: the row owner can rewrite any column, including `role_v2`, `agent_id`, `customer_id`, `org_id`. Tier 6.0 F-1 and F-2 were both a missing `WITH CHECK`. The rule: on any table where the row-author can privilege-escalate via a column edit, the `UPDATE` policy must have a `WITH CHECK` that forbids `NEW.<sensitive_col> IS DISTINCT FROM OLD.<sensitive_col>` unless the caller is ORG_ADMIN (or equivalent trust tier). Write the `WITH CHECK` explicitly even when it duplicates the `USING` — it documents intent and prevents future regressions.

25. **`FOR ALL` policies quietly grant INSERT/UPDATE/DELETE to every matching caller.** A policy like `CREATE POLICY x ON t FOR ALL USING (org_id = auth_org_id())` reads like a read scope but actually permits every in-org user to write, regardless of role. On ENVIATO that meant legacy customers could INSERT/UPDATE/DELETE on `org_settings`, `tags`, `label_templates`, `warehouse_locations`, `package_tags` (Tier 6.0 F-12). The rule: default to a split — `FOR SELECT` org-scoped read + a separate `FOR INSERT/UPDATE/DELETE` role-gated write. Only use `FOR ALL` when every role with in-org read is also authorized to write — which is almost never true on a customer-facing platform.

26. **CUSTOMER / consumer-tier roles need first-class `column = auth.uid()` policies.** If a role exists in the enum, every user-facing table they read must have a policy that scopes rows to *that role's* key, not just the org. On ENVIATO, `CUSTOMER` had zero policies referencing `customer_id = auth.uid()`, so the entire customer-facing surface (packages / invoices / awbs / photos) was unreachable by the very users it was built for (Tier 6.0 F-4). Audit the enum against the actual policy coverage before adding any role to the product surface.

27. **Test RLS with live SQL impersonation before declaring a policy good.** Static review missed F-1, F-2, F-3, F-5, F-12 — they all read reasonable. The confirmation came from `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true); <attempt exploit>; ROLLBACK;` run via Supabase MCP. Every new or modified RLS policy should ship with a corresponding impersonation test in the CI harness (Phase 10D). Policy diffs without tests are one missed `WITH CHECK` from re-exploit.

28. **A policy that reads from its own table must route through a SECURITY DEFINER helper.** If an `UPDATE` / `INSERT` policy on `public.users` references `users` via an inline correlated subquery (e.g., `(SELECT u.role_v2 FROM users u WHERE u.id = auth.uid())`), Postgres enters the RLS evaluation loop again on the inner SELECT, and the `users_select_v2` policy re-invokes the chain. Result: `ERROR 42P17: infinite recursion detected in policy for relation users` at runtime — static review misses it. Fix: wrap the lookup in a SECURITY DEFINER function with `SET search_path = public` that bypasses RLS. `auth_org_id()`, `auth_role_v2()`, `auth_agent_id()`, and `auth_role_id()` (added via migration 016a hotfix) all follow this pattern. Rule of thumb: **never reference a table inside its own policy body without a SECURITY DEFINER wrapper.** Apply the same pattern to any future self-referential policy (e.g., a tree-traversal `agent_closure` read policy that needs to check the caller's own agent subtree).

---

## RLS POLICY ARCHITECTURE

### Threat model

ENVIATO is a customer-facing multi-sided platform. The roles in `user_role_v2` break into three trust tiers:

| Tier | Roles | Trust posture |
|------|-------|---------------|
| Internal staff | `ORG_ADMIN`, `WAREHOUSE_STAFF` | Trusted — can read/write across the org within their role's scope |
| Agent users | `AGENT_ADMIN`, `AGENT_STAFF` | Untrusted consumers — scoped to their own agent's customers/packages/invoices/AWBs |
| End users | `CUSTOMER` | Untrusted consumers — scoped to their own `customer_id` records only |

**Hostile-user assumption:** Every authenticated user outside the "internal staff" tier must be assumed to attempt privilege escalation. That means:

- Any column that determines tenancy (`org_id`), role (`role_v2`), or data ownership (`agent_id`, `customer_id`) is a **privilege-carrying column** and must not be self-mutable below the ORG_ADMIN tier.
- Any `OR` branch that broadens visibility (e.g., `OR (agent_id IS NULL)`) must be gated on the role list that's allowed to see it.
- Cross-tenant isolation (`org_id` enforcement) is necessary but not sufficient — in-tenant trust is not uniform.

### Policy shape (target state post Phase 10A)

For each tenant-scoped table, the policy family should look like:

```
-- READ: org-scoped, optionally further narrowed by role or owner column
CREATE POLICY <table>_select ON <table>
  FOR SELECT TO authenticated
  USING (
    org_id = auth_org_id() AND (
      auth_role_v2() IN ('ORG_ADMIN', 'WAREHOUSE_STAFF')      -- internal staff: full org read
      OR (auth_role_v2() IN ('AGENT_ADMIN', 'AGENT_STAFF')
          AND agent_id = ANY(get_accessible_agent_ids()))      -- agent users: their agent's rows
      OR (auth_role_v2() = 'CUSTOMER'
          AND customer_id = auth.uid())                        -- customers: their own rows
    )
  );

-- WRITE: role-gated, with explicit WITH CHECK forbidding privilege-carrying column mutation
CREATE POLICY <table>_insert ON <table>
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = auth_org_id()
    AND auth_role_v2() IN ('ORG_ADMIN', 'WAREHOUSE_STAFF')
  );

CREATE POLICY <table>_update ON <table>
  FOR UPDATE TO authenticated
  USING (
    org_id = auth_org_id()
    AND auth_role_v2() IN ('ORG_ADMIN', 'WAREHOUSE_STAFF')
  )
  WITH CHECK (
    org_id = auth_org_id()
    AND NEW.org_id = OLD.org_id        -- forbid cross-tenant move
    -- additional "NEW.col IS NOT DISTINCT FROM OLD.col" lines per privilege-carrying column
  );

CREATE POLICY <table>_delete ON <table>
  FOR DELETE TO authenticated
  USING (
    org_id = auth_org_id()
    AND auth_role_v2() IN ('ORG_ADMIN', 'WAREHOUSE_STAFF')
  );
```

**Do not use `FOR ALL`** unless the single policy genuinely fits every verb, which for a multi-sided platform it almost never does.

### Helper functions

| Function | Purpose | Current impl | Target impl (Phase 10C) |
|---------|---------|--------------|-------------------------|
| `auth_org_id()` | Returns caller's `org_id` | SECURITY DEFINER DB lookup on `users` per call | Read from `auth.jwt() -> 'app_metadata' ->> 'org_id'` |
| `auth_role_v2()` | Returns caller's `role_v2` | SECURITY DEFINER DB lookup on `users` per call | Read from `auth.jwt() -> 'app_metadata' ->> 'role_v2'` |
| `auth_agent_id()` | Returns caller's `agent_id` | SECURITY DEFINER DB lookup on `users` per call | Read from `auth.jwt() -> 'app_metadata' ->> 'agent_id'` |
| `auth_role_id()` | Returns caller's `role_id` (custom role assignment). **Added via migration 016a hotfix (2026-04-19)** to break a 42P17 infinite-recursion error that hit when `WITH CHECK` on `users_update_v2` used inline correlated subqueries against `users`. | SECURITY DEFINER DB lookup on `users` per call | Read from `auth.jwt() -> 'app_metadata' ->> 'role_id'` |
| `get_accessible_agent_ids()` | Returns the set of agent IDs the caller can see | Branches on AGENT_ADMIN (returns descendants via `agent_closure`), AGENT_STAFF (returns own agent_id), ORG_ADMIN / WAREHOUSE_STAFF (returns all in-org agents). **No CUSTOMER branch — by design**, because customer visibility is scoped by `customer_id = auth.uid()` not via agent accessibility (see HP5 finding 2026-04-19). | Same, but input comes from JWT claims rather than DB lookup |
| `user_has_permission(key)` | Checks a permission key against `role_permission_defaults` + `user_permissions` | DB lookup | Eventually cache permission bitset in JWT |

**Constraint on helper changes:** All five `auth_*` helpers are referenced by many policies. Changing their return contract (e.g., adding arguments) forces a cascade of policy rewrites. Prefer adding new helpers for new shapes rather than mutating existing ones.

**Why all four `auth_*` helpers use SECURITY DEFINER:** Any policy on `public.users` that needs to compare `NEW.<col>` to the caller's current value must look up the current value from `public.users`. If that lookup goes through normal RLS, `users_select_v2` fires recursively and Postgres bails out with `42P17 infinite recursion detected in policy for relation users`. SECURITY DEFINER bypasses RLS for the lookup. See lesson 28.

### Impersonation test runbook

Every new or modified RLS policy must be tested against each role before merge. Template:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"<user_uuid>","role":"authenticated","app_metadata":{"org_id":"<org_uuid>","role_v2":"<ROLE>"}}',
  true
);

-- 1. Positive: the thing this policy should allow
SELECT ... ;  -- expect rows / success

-- 2. Negative: the thing this policy should deny
UPDATE ... SET <privilege_col> = <attacker_value> WHERE id = auth.uid();
  -- expect 0 rows affected or error

-- 3. Cross-tenant negative: same action against a row in a different org
UPDATE ... WHERE id = '<other_org_row>';
  -- expect 0 rows affected

ROLLBACK;
```

See §3 of `docs/audits/2026-04-19-tier6-rls-audit.md` for 13 worked examples covering each role × each CRITICAL/HIGH finding.

### Seed users (test & prod)

The audit used these seeded users for impersonation (org `00000000-0000-0000-0000-000000000001`):

| UUID | role_v2 | Login | Purpose |
|------|---------|-------|---------|
| `4109f9a3-…` | ORG_ADMIN | lessaenterprises@gmail.com | Happy-path internal-staff tests |
| `a0000000-…-0020` | WAREHOUSE_STAFF | john.warehouse | Internal-staff tests for warehouse-only routes |
| `2e5f8d15-…` | AGENT_STAFF | platinumcorp1 | Most common attacker model (logged-in agent user attempts self-escalation) |
| `a0000000-…-0001` | `NULL` | maria.santos | Legacy cohort — tests the role_v2-is-NULL fallback branches |

**No AGENT_ADMIN or true CUSTOMER seed users exist in prod yet.** The AGENT_ADMIN branch of `get_accessible_agent_ids()` and every `CUSTOMER` policy is currently **untested against real data**. Phase 10D migration `023_rls_test_fixtures.sql` adds test users for both.

### Migration numbering convention

- `001`–`015` — Schema, permission system, performance (Tier 5) migrations. All applied.
- `016` — Phase 10A users `WITH CHECK` (F-1, F-2). **Applied 2026-04-19.** Consolidates hotfix `016a` (SECURITY DEFINER `auth_role_id()` helper + switched inline subqueries to helper calls to avoid 42P17 recursion) into a single file on disk.
- `017` — Phase 10A packages unassigned carve-out removal (F-3). **Applied 2026-04-19.**
- `018` — Phase 10A `FOR ALL` split on 5 settings tables (F-12). **Applied 2026-04-19.**
- `019`–`021` — Phase 10B product-gated fixes (CUSTOMER read surface, invoice_lines policies, role_v2 backfill). Not yet written.
- `022` — Phase 10C JWT claim consumption. Folds the new `auth_role_id()` into the JWT path.
- `023` — Phase 10D test fixtures.
- `024` — Phase 10E `FORCE ROW LEVEL SECURITY`.

**Rule:** Every migration that changes an RLS policy must ship with a corresponding impersonation test in the harness (once Phase 10D lands). Until then, attach the test SQL as a comment at the top of the migration file. Migration 016 as now on disk is the reference for this: its bottom-of-file comment block has four BEGIN/ROLLBACK test blocks (two attack cases + two happy-path cases).

---

## MULTI-TENANT ARCHITECTURE

ENVIATO is a **multi-tenant SaaS**. Each tenant is an `organizations` row with a unique `org_id`. Every user row belongs to exactly one tenant, and cross-tenant visibility is **always zero** — a global admin at Tenant A does NOT see data in Tenant B. (The product does not currently have a super-admin role that spans tenants; if one is added, it will be a separate, audited capability, not a blanket read grant.)

Within a tenant, two hierarchies intersect:

1. **Agent tree.** Agents form an N-deep tree per tenant, stored as adjacency edges in `agent_edges` and flattened (for efficient subtree queries) in `agent_closure`. An AGENT_ADMIN can see packages, invoices, and AWBs for every agent in their subtree (themselves + descendants). An AGENT_STAFF sees only their own agent's rows. Packages cascade **down** the subtree: when package P is assigned to agent A, every ancestor of A's AGENT_ADMIN can see it.
2. **Customer ownership.** Each `packages` / `invoices` / `awbs` row has a `customer_id` that points to the `users.id` of the recipient (the end customer). A CUSTOMER sees only rows where `customer_id = auth.uid()` — NOT rows for other recipients of the same agent. This is the design rule that forces migration 019 to use direct `customer_id` scoping rather than extending `get_accessible_agent_ids()` with a CUSTOMER branch.

### Package visibility (by role)

| Role | Sees |
|------|------|
| ORG_ADMIN | All in-org packages |
| WAREHOUSE_STAFF | All in-org packages |
| AGENT_ADMIN | Packages where `agent_id ∈ subtree(own agent)` |
| AGENT_STAFF | Packages where `agent_id = own agent_id` |
| CUSTOMER | Packages where `customer_id = auth.uid()` only |

### Invoice privacy (strict two-party)

Invoices are **strictly two-party**: a given invoice is visible to exactly one agent hierarchy (issuer side) and exactly one customer (recipient side). Even the global ORG_ADMIN does not automatically see every invoice — the default policy should scope invoice read to `org_id = auth_org_id() AND (issuer-side OR recipient-side)`. No blanket "ORG_ADMIN sees all invoices" carve-out. If finance needs a blanket view, that's a separate explicit capability (e.g., a `FINANCE_ADMIN` role or a dedicated audit surface), not a side-effect of being ORG_ADMIN.

**Implication for migration 020 (invoice_lines):** the UPDATE / DELETE policies must mirror invoice visibility. A WAREHOUSE_STAFF user should NOT be able to edit invoice lines they cannot see.

### Impersonation is a separate capability

When product says "a global admin can see what X sees," that is an **impersonation** capability — a distinct, audited action with its own RLS and logging — not a visibility rule. Impersonation should:

- Flip the caller's effective `role_v2` / `agent_id` / `customer_id` for the duration of the impersonation session.
- Write an audit row to an `impersonation_events` table (not yet built).
- Be gated on ORG_ADMIN (or a narrower capability) + require an explicit "start impersonation" action.

This is deliberately NOT what `get_accessible_agent_ids()` does. That helper returns "what this user can see in their own identity," not "what this user can see after impersonating someone else."

### Tenant walls

Tenants are fully walled off. Specifically:

- `org_id` is a required column on every tenant-scoped table.
- Every RLS policy's USING and WITH CHECK starts with `org_id = auth_org_id()`.
- Cross-tenant `org_id` rewrites on any row are forbidden (`WITH CHECK` pins `org_id` to the caller's current org).
- Foreign keys across tables never cross tenants — a package in Tenant A cannot reference a customer in Tenant B. This is enforced by FK + RLS, not by FK alone.

The Tier 6.0 audit confirmed cross-tenant isolation holds today. All CRITICAL findings (F-1, F-2) were strictly in-tenant. Phase 10A did not change cross-tenant posture.

### Delivery driver (narrow role)

Out of scope for the current RLS work but worth flagging: the product will add a `DELIVERY_DRIVER` role in the future. Its visibility rule is deliberately narrow — a driver sees only the packages on their current manifest, with no agent-tree ancestry, no invoice visibility, and no customer detail beyond the delivery address. When this role lands, it gets its own first-class scoping policy (manifest-based, not agent-based).

---

## DEPLOYMENT ARCHITECTURE

### Vercel Configuration

- **Platform:** Vercel (auto-deploy from `main` branch on GitHub)
- **Build:** `next build` with TypeScript strict mode
- **Rendering strategy:** All admin routes use dynamic rendering (server-side) via `export const dynamic = "force-dynamic"` in `src/app/(dashboard)/admin/layout.tsx`. No static prerendering for auth-protected pages.
- **Environment variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-safe), `SUPABASE_SERVICE_ROLE_KEY` (server-only, NOT prefixed with `NEXT_PUBLIC_`)
- **Image optimization:** Remote patterns restricted to Supabase storage domain

### Build History (April 12, 2026)

| Commit | Issue | Fix |
|--------|-------|-----|
| `4e45519` | Initial commit | Multiple TS errors, failed |
| `ac3cd16` | Missing agent type on customer | Added agent to PackageDetail customer type |
| `cc88660` | Set iteration with es5 target | Changed tsconfig target to es2017 |
| `3a33902` | Static prerender of admin pages | ~~Added `missingSuspenseWithCSRBailout: false`~~ (hack, later reverted) |
| `5dce7fd` | Proper fix for above | Added `dynamic = "force-dynamic"` admin layout, reverted config hack |
| `64c3228` | Sidebar useSearchParams SSR bailout | Extracted SettingsTabList with `<Suspense>` boundary |
