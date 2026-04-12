# ENVIATO WMS V2 — Architecture Document

**Last Updated:** April 4, 2026
**Stack:** Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS + Supabase PostgreSQL

---

## MODULARIZATION (Phase 7 — In Progress)

> **Full roadmap:** See `MODULARIZATION.md` for the complete strategy, directory structure, module definitions, and progress tracker.

The codebase is being rewritten from a monolithic page-level architecture into a modular structure. The current state has ~19,700 lines concentrated in a few massive files (settings: 5,003 LOC, package detail: 2,388 LOC, packages list: 2,055 LOC), with minimal shared infrastructure (8 components, 1 hook, no contexts, no caching).

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
