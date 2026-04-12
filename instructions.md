# ENVIATO WMS V2 — Development Instructions

**Last Updated:** April 4, 2026

---

## MODULARIZATION IN PROGRESS

> **Full roadmap:** See `MODULARIZATION.md` for the complete strategy and progress tracker.

The codebase is being restructured from monolithic page files into feature modules. During this transition:

1. **Check which modules have been extracted** before making changes. If a module exists in `src/modules/`, make changes there — not in the old page file.
2. **New features go in module structure.** Don't add new code to monolithic page files that are queued for extraction.
3. **Shared infrastructure lives in `src/shared/`.** New hooks, components, contexts, and types go in `shared/`, not scattered per-page.
4. **Settings uses nested routes.** Once extracted, settings sub-features live at `/admin/settings/general`, `/admin/settings/users`, etc. — not tabs in a single page.
5. **React Query for data fetching.** New data hooks use `@tanstack/react-query` with the query helpers in `shared/lib/api.ts`, not raw `useEffect` + `useState`.
6. **Use contexts for auth/org data.** Import `useAuth()` and `useOrg()` from `shared/hooks/` instead of inline `supabase.auth.getUser()` calls.

These conventions apply incrementally — follow them for any module that has been extracted, and follow the existing patterns for modules not yet migrated.

---

## DEV ENVIRONMENT

**Project path (macOS):** `~/Desktop/Shipment Photos/ENVIATO_WMS/enviato-dashboard`

**Start the dev server:**
```bash
cd ~/Desktop/Shipment\ Photos/ENVIATO_WMS/enviato-dashboard && npm run dev
```

The app runs at **http://localhost:3000**.

**Supabase Project ID:** `ilguqphtephoqlshgpza`

---

## DROPDOWN IMPLEMENTATION GUIDELINES

### Decision Tree: Which Dropdown Strategy to Use

Before adding a new dropdown, determine where it sits in the DOM:

1. **Is the dropdown inside `.sheet-table-wrap` or any container with `overflow: hidden/auto/scroll`?**
   - YES -> Use `<CellDropdown>` (portal to `document.body`)
   - NO -> Use inline absolute positioning (simple CSS)

2. **Is the dropdown inside `.batch-popover`?**
   - `.batch-popover` has `overflow: visible`, so inline absolute works fine.
   - Use `<SearchableSelect>` or a custom inline dropdown.

3. **Is the dropdown inside the page layout wrapper (`flex flex-col h-full overflow-hidden`)?**
   - YES -> Use a portal to `document.body`. The page header's notification bell uses this pattern (see `NotificationBell.tsx`).
   - This overflow is set on the dashboard layout container, not just tables.

4. **Is the dropdown inside a modal (`.modal-panel`)?**
   - `.modal-panel` has `overflow-y: auto`. If the dropdown might be clipped, use `<CellDropdown>`.
   - If the modal is short and the dropdown is small, inline might work — test visually.

### Adding a CellDropdown to a New Table Cell

Step-by-step:

1. **Import the component:**
   ```tsx
   import CellDropdown from "@/components/CellDropdown";
   ```

2. **Add anchor state** (one per page, shared across all cell dropdowns):
   ```tsx
   const [cellAnchorEl, setCellAnchorEl] = useState<HTMLElement | null>(null);
   ```

3. **Capture the anchor on click:**
   ```tsx
   <td
     className="sheet-cell cursor-pointer"
     onClick={(e) => {
       setCellAnchorEl(e.currentTarget);
       setDropdownCell({ rowId: pkg.id, field: "myField" });
     }}
   >
     {/* display value */}
   </td>
   ```

4. **Render the dropdown** (outside the table, at the bottom of the component return):
   ```tsx
   <CellDropdown
     open={dropdownCell?.field === "myField"}
     onClose={() => { setDropdownCell(null); setCellAnchorEl(null); }}
     anchorEl={cellAnchorEl}
     width={200}
   >
     {/* dropdown content: search input, option list, etc. */}
   </CellDropdown>
   ```

5. **Important:** Always clear both `cellAnchorEl` and `dropdownCell` on close. Stale anchor references can cause positioning errors.

### Adding an Inline Filter Dropdown

For filter pills above the table (outside overflow containers):

```tsx
const [filterOpen, setFilterOpen] = useState(false);
const filterRef = useRef<HTMLDivElement>(null);

// Outside click handler
useEffect(() => {
  if (!filterOpen) return;
  const handler = (e: MouseEvent) => {
    if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
      setFilterOpen(false);
    }
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [filterOpen]);

// Render
<div ref={filterRef} className="relative">
  <button onClick={() => setFilterOpen(!filterOpen)}>
    Filter Label
  </button>
  {filterOpen && (
    <div className="filter-dropdown">
      {/* filter options */}
    </div>
  )}
</div>
```

The `.filter-dropdown` class in `globals.css` handles positioning: `position: absolute; top: calc(100% + 4px); left: 0; z-index: var(--z-dropdown)`.

### Viewport-Edge Auto-Flip Pattern

Any dropdown that could appear near the top or bottom of the viewport should include auto-flip logic. `SearchableSelect` has this built in. For custom inline dropdowns, follow this pattern:

```tsx
// Calculate during render (synchronous — no useEffect)
let flipUp = false;
let maxHeight = 220;
if (open && triggerRef.current) {
  const rect = triggerRef.current.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const minUsable = 170; // minimum usable height before flipping

  if (spaceBelow < minUsable && spaceAbove > spaceBelow) {
    flipUp = true;
    maxHeight = Math.min(220, spaceAbove - 16);
  } else {
    maxHeight = Math.min(220, spaceBelow - 16);
  }
  maxHeight = Math.max(maxHeight, 80);
}

// Apply via inline style (not CSS class — more reliable)
<div
  className="my-dropdown"
  style={flipUp ? { top: "auto", bottom: "calc(100% + 4px)" } : undefined}
>
  <div className="my-options" style={{ maxHeight }}>
    {/* options */}
  </div>
</div>
```

**Key principles:**
1. Measure with `getBoundingClientRect()` during render, not in effects
2. Apply positioning via inline `style`, not CSS class toggling
3. Constrain `maxHeight` to available space so content never overflows the viewport
4. Always leave a margin (8px) from the viewport edge

---

## DO NOT USE

### `@floating-ui/react` for Portaled Dropdowns

Floating UI's async positioning model causes a visible flash at coordinates (0,0) before the real position is calculated. This was tested extensively and could not be fully eliminated, even with:
- `useLayoutEffect` for reference element syncing
- The `isPositioned` flag for visibility gating
- Direct DOM element references instead of React refs

Use the synchronous `getBoundingClientRect()` approach in `CellDropdown` instead.

### `FilterDropdown.tsx`

This component is orphaned (not imported anywhere). It exists as a reference but should not be used in production. It uses `@floating-ui/react` and has the positioning flash issue.

---

## NOTIFICATION BELL PATTERN

The `<NotificationBell />` component (`src/components/NotificationBell.tsx`) is used in the header of every admin page. It is fully self-contained — no props needed.

**Key implementation details:**
- Uses `createPortal` to `document.body` because the page layout wrapper has `overflow: hidden`
- Positions the dropdown panel with `position: fixed` using coordinates from `getBoundingClientRect()` of the bell button
- Repositions on scroll (capture phase) and resize while open
- Subscribes to Supabase real-time changes on `notifications` table + 30s polling fallback
- Shows unread count badge, supports mark-as-read and mark-all-read

**Adding to a new page:**
```tsx
import NotificationBell from "@/components/NotificationBell";

// In the header, right side:
<div className="flex items-center gap-3">
  <NotificationBell />
  <button className="btn-primary cursor-pointer">...</button>
</div>
```

---

## SOFT-DELETE PATTERN

All delete operations use soft-delete (`deleted_at` timestamp) instead of hard-delete. Seven tables have `deleted_at`: packages, invoices, awbs, courier_groups, warehouse_locations, tags, package_statuses.

**Querying (always filter out deleted records):**
```tsx
const { data } = await supabase
  .from("packages")
  .select("*")
  .is("deleted_at", null)  // REQUIRED on every query
  .order("created_at", { ascending: false });
```

**Deleting (set timestamp instead of removing row):**
```tsx
const { error } = await supabase
  .from("packages")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", packageId);
```

**Always use `ConfirmDialog` for user-facing deletes:**
```tsx
import ConfirmDialog from "@/components/ConfirmDialog";

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Tag"
  message="Are you sure you want to delete this tag? This action cannot be undone."
  confirmLabel="Delete"
  onConfirm={handleDelete}
  onCancel={() => setShowDeleteConfirm(false)}
/>
```

---

## TOGGLE STYLING PATTERN

All toggles (notification settings, auto-print label, label field toggles) use a unified pattern:

```tsx
<button
  className={`w-11 h-6 rounded-full relative transition-colors duration-200 cursor-pointer flex-shrink-0 ${
    isEnabled ? "bg-primary" : "bg-gray-300"
  }`}
  onClick={() => setIsEnabled(!isEnabled)}
>
  <span
    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
    style={{ transform: isEnabled ? "translateX(20px)" : "translateX(0)" }}
  />
</button>
```

**Key rules:**
- Off state: `bg-gray-300` (NOT `bg-surface-active` — too low contrast)
- On state: `bg-primary`
- Knob position: Use inline `style={{ transform }}` (NOT Tailwind `translate-x-5` + `right-0.5`/`left-0.5` — inconsistent)

---

## BULK CSV IMPORT PATTERN

The recipients page (`admin/customers/page.tsx`) supports CSV upload via PapaParse:

```tsx
import Papa from "papaparse";

// Parse uploaded file:
Papa.parse(file, {
  header: true,
  skipEmptyLines: true,
  complete: (results) => {
    // Validate rows, match agent_code to agents, show progress
  },
});
```

**Template download:** Generates a CSV with correct headers and a sample row, triggers browser download via Blob URL.

**Drag-and-drop:** Uses `onDragOver`/`onDrop` handlers on a styled drop zone.

---

## LABEL PRINTING PATTERN

Barcode label generation uses a multi-step pipeline for cross-browser compatibility:

1. **JsBarcode** renders CODE128 barcode to a `<canvas>` element
2. **html-to-image** (`toPng` at 3x resolution) rasterizes the label DOM to a PNG
3. **jsPDF** creates a PDF at the exact paper size, embeds the PNG
4. Opens the PDF blob URL for printing

This bypasses Safari's CSS print engine, which doesn't reliably render canvas elements or custom layouts.

```tsx
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

// Render label → rasterize → embed in PDF → open for print
const dataUrl = await toPng(labelElement, { pixelRatio: 3 });
const pdf = new jsPDF({ unit: "mm", format: [width, height] });
pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
window.open(URL.createObjectURL(pdf.output("blob")));
```

---

## CSS CLASS USAGE GUIDE

### Table System
- `.sheet-table-wrap` — Outer table container (border, radius, `overflow: hidden`)
- `.sheet-th` — Table header cell (12px, 600 weight, uppercase)
- `.sheet-cell` — Table body cell (14px, 500 weight, 44px height)
- `.sheet-row` — Table body row (hover effect)
- `.sheet-checkbox` / `.sheet-checkbox-cell` — Checkbox styling

### Dropdowns
- `.filter-dropdown` — Inline absolute dropdown for filter pills
- `.filter-pill` — Filter pill button (inline-flex, border, rounded). States: `.active` (blue border/bg), `.open` (chevron rotation)
- `.filter-dropdown-item` — Item inside a filter dropdown
- `.ss-*` classes — SearchableSelect component family
- `.col-menu-*` classes — Column header menu family
- `CellDropdown` component — Portal dropdown for table cells (no CSS class, uses inline styles)

### Batch Actions
- `.batch-bar` — Fixed bottom bar for bulk actions
- `.batch-bar-count-badge` — Blue circle showing selection count (24px)
- `.batch-bar-label` — "Selected" text label (12px, 600 weight)
- `.batch-bar-btn` — Action button (icon + text). Use `.active` class when popover is open. Use `.danger` for delete.
- `.batch-bar-cancel` — Text-only cancel button (10px, 700 weight, slate color)
- `.batch-popover` — Edit form popover (`overflow: visible`, `width: 340`)
- `.batch-popover-header` — Header row (flex, between)
- `.batch-popover-title` — Popover heading text
- `.batch-popover-close` — Close X button
- `.batch-popover-label` — Form field label
- `.batch-popover-actions` — Footer with apply/cancel buttons
- `.batch-popover-apply` — Primary submit button (full-width, blue)
- `.batch-popover-cancel` — Secondary cancel button
- `.popover-backdrop` — Semi-transparent overlay behind popovers (`z-index: var(--z-popover)`)

### Modals
- `.modal-overlay` — Full-screen backdrop
- `.modal-panel` — Centered panel with `overflow-y: auto`

### Buttons
- `.btn-primary` — Primary action button (blue)
- `.btn-secondary` — Secondary/cancel button

### Form Elements
- `.form-input` — Standard text input with focus ring. **Caution:** `.form-input` sets `padding-left: 10px` which overrides Tailwind `pl-8`. For search inputs with icons, use inline `style={{ paddingLeft: 32 }}` instead.

---

## OVERFLOW RULES

**Never change these without understanding the cascade:**

1. **`.sheet-table-wrap` must keep `overflow: hidden`** — It enforces `border-radius: 8px` clipping. Without it, table corners appear square. All cell dropdowns compensate by using the `CellDropdown` portal.

2. **`.batch-popover` must keep `overflow: visible`** — The `SearchableSelect` dropdowns inside it need to escape the popover boundaries. Changing to `overflow-y: auto` will clip them.

3. **`.modal-panel` has `overflow-y: auto`** — Be aware that dropdowns inside modals may be clipped. Test visually and use `CellDropdown` if needed.

---

## Z-INDEX CONVENTIONS

Always use CSS custom properties for z-index values. Never use arbitrary numbers.

| Purpose | Variable | Value |
|---------|----------|-------|
| Sticky headers | `--z-sticky` | 20 |
| Sidebar | `--z-sidebar` | 40 |
| Inline dropdowns | `--z-dropdown` | 1000 |
| Portal dropdowns | `--z-popover` | 1100 |
| Modals | `--z-modal` | 1200 |
| Toasts | `--z-toast` | 1300 |

For one-off z-index needs within a component (like table header internals), use small values (10-20) that are scoped to the stacking context.

---

## STANDARDIZED PAGE LAYOUT

All admin pages follow a consistent structure. When adding a new page, follow this template:

### 1. Header

```tsx
<header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
  <div className="flex items-center gap-4 flex-1">
    <h2 className="text-lg font-bold text-txt-primary">Page Title</h2>
    <div className="relative w-full max-w-md">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none" />
      <input placeholder="Search..." className="w-full h-9 pl-10 pr-4 bg-slate-50 border border-border rounded text-sm text-txt-primary placeholder:text-txt-placeholder focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors" />
    </div>
  </div>
  <div className="flex items-center gap-3">
    <NotificationBell />
    <button className="btn-primary cursor-pointer"><Plus size={16} strokeWidth={2.5} />Create Item</button>
  </div>
</header>
```

### 2. Filter Bar

```tsx
<div className="bg-white border-b border-border px-6 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
  {/* Icon-only column selector */}
  <div className="relative" ref={columnsDropdownRef}>
    <button className="h-8 w-8 flex items-center justify-center bg-white border border-[#e2e8f0] rounded-lg hover:bg-[#f1f5f9] transition-colors cursor-pointer" title="Columns">
      <SlidersHorizontal size={14} className="text-[#334155]" />
    </button>
    {/* column toggle dropdown */}
  </div>
  {/* Filter pills (optional per page) */}
  <button className={`filter-pill${isActive ? " active" : ""}${isOpen ? " open" : ""}`}>
    <span>Label</span>
    <ChevronDown size={14} className="chevron-icon" />
  </button>
</div>
```

### 3. Batch Bar Pattern

```tsx
{/* Backdrop */}
{anyPopoverOpen && <div className="popover-backdrop" onClick={() => closeAllPopovers()} />}

{/* Batch bar */}
<div className="batch-bar">
  <div className="flex items-center gap-2 border border-white/30 rounded-lg px-3 py-1">
    <span className="batch-bar-count-badge">{count}</span>
    <span className="batch-bar-label">Selected</span>
  </div>
  <div className="flex items-center gap-4">
    <button onClick={() => { closeAllPopovers(); setShowPopover(true); }}
      className={`batch-bar-btn ${showPopover ? "active" : ""}`}>
      <Icon size={16} /> Label
    </button>
    <button className="batch-bar-btn danger"><Trash2 size={16} /> Delete</button>
  </div>
  <button onClick={() => setSelectedIds(new Set())} className="batch-bar-cancel">
    <X size={12} /> Cancel
  </button>
</div>

{/* Popovers (top-level, outside batch bar) */}
{showPopover && (
  <div className="batch-popover" style={{ width: 340 }}>
    <div className="batch-popover-header">
      <h3 className="batch-popover-title">Title</h3>
      <button onClick={() => setShowPopover(false)} className="batch-popover-close"><X size={18} /></button>
    </div>
    {/* form content with batch-popover-label */}
    <div className="batch-popover-actions">
      <button className="batch-popover-apply cursor-pointer">Apply</button>
      <button className="batch-popover-cancel cursor-pointer">Cancel</button>
    </div>
  </div>
)}
```

### Key Conventions

- **Icon sizes:** `size={16}` for batch bar buttons, `size={14}` for column selector and filter pill chevrons, `size={18}` for Bell icon and popover close X
- **Popover width:** `width: 340` for all batch popovers (except Ship popover at `380`)
- **Active state:** Use CSS `.batch-bar-btn.active` class (NOT inline Tailwind like `!bg-white/15`)
- **Popovers rendered outside batch bar** as top-level fixed elements (except Edit popover on packages page which is inline)

---

## SETTINGS PAGE PATTERNS

The settings page uses a different layout from the main list pages. Key differences:

### Table Embedding in Cards
Settings tables are embedded inside card containers. To avoid double borders:
```tsx
<div style={{ border: 'none', borderRadius: 0 }} className="sheet-table-wrap">
  <div style={{ '--table-size': '100%' } as React.CSSProperties}>
    <table className="sheet-table">...</table>
  </div>
</div>
```

### Search Bar in Settings
Settings search bars use `form-input` class which conflicts with Tailwind padding:
```tsx
<input
  className="form-input py-1.5 text-[13px]"
  style={{ paddingLeft: 32 }}
  placeholder="Search..."
/>
```

### Supabase Insert Pattern
All inserts to org-scoped tables must include `org_id`:
```tsx
const { error } = await supabase.from("table_name").insert({
  ...fields,
  org_id: org.id,  // REQUIRED — omitting causes silent failure
});
```

### Logo Upload Pattern
Upload to Supabase Storage `assets` bucket:
- Full logos: `logos/{org_id}.{ext}`
- Logo icons: `logos/{org_id}-icon.{ext}`
- Courier logos: `courier-logos/{courier_id}.{ext}`

### Fallback Queries for New Columns
When querying with columns that may not exist yet in the DB:
```tsx
const { data, error } = await supabase.from("table").select("col1, col2, new_col").single();
if (error) {
  // Fallback: retry without the new column
  const { data: fallback } = await supabase.from("table").select("col1, col2").single();
}
```

---

## GENERAL CONVENTIONS

- All components use `"use client"` directive (Next.js client components)
- Outside-click handlers use `mousedown` event (not `click`) for immediate response
- Escape key handlers are added via `keydown` event listener
- Both handlers are cleaned up in `useEffect` return functions
- Dropdown state is typically `useState<boolean>` for simple toggles, or a structured state object for cell dropdowns that need to track row + field
- Anchor elements are captured via `e.currentTarget` in click handlers, stored in `useState<HTMLElement | null>`
- **Mutual exclusion for batch popovers:** When multiple popovers share the same screen region (e.g. batch bar actions), use a shared `closeAllPopovers()` helper that resets all popover states. Call it before opening any new popover to prevent stacking.
- **Popover backdrop pattern:** Render `.popover-backdrop` when any popover is open. Clicking it calls `closeAllPopovers()`. The batch bar and popovers sit at `z-index: calc(var(--z-popover) + 1)` above the backdrop.
- **NotificationBell component:** All admin pages render `<NotificationBell />` in the header (replaces raw `Bell` icon). Imported from `@/components/NotificationBell`.
- **SlidersHorizontal:** All admin pages import this from `lucide-react` for the column selector icon.
- **Soft-delete convention:** All delete operations set `deleted_at` timestamp instead of removing rows. All queries must include `.is("deleted_at", null)`.
- **Courier logo inside badge:** Courier logos render inside the `courier-badge` span, not as a sibling: `<span className="courier-badge inline-flex items-center gap-1.5"><img .../>{name}</span>`.
- **`boxShadow` for ring effects:** TypeScript rejects `ringColor` in `CSSProperties`. Use `boxShadow: '0 0 0 2px white, 0 0 0 4px ${color}40'` instead.
