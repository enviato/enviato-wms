# ENVIATO WMS V2 — CSS Architecture

**Last Updated:** March 14, 2026
**Main Stylesheet:** `src/app/globals.css`

---

## CSS CUSTOM PROPERTIES

All design tokens are defined as CSS custom properties in `:root` within `globals.css`.

### Colors

```
--color-primary: #3c83f6        /* Brand blue — buttons, links, active states */
--color-text-main: #0f172a      /* Primary text (slate-900) */
--color-text-muted: #64748b     /* Tertiary/muted text (slate-500) */
--color-border: #e2e8f0         /* Default border color (slate-200) */
--color-surface: #ffffff        /* Card/table background */
--color-background: #f5f7f8    /* Page background */
--color-brand-capri: #3c83f6   /* Legacy alias, same as primary */
```

### Z-Index Scale

The z-index system uses named layers to prevent stacking conflicts:

```
--z-base: 0          /* Default document flow */
--z-raised: 1        /* Slightly elevated (badges, icons) */
--z-sticky: 20       /* Sticky table headers, fixed bars */
--z-sidebar: 40      /* Sidebar navigation overlay */
--z-dropdown: 1000   /* Inline dropdown menus */
--z-popover: 1100    /* Portal dropdowns (CellDropdown), batch popover */
--z-modal: 1200      /* Modal overlay + panel */
--z-toast: 1300      /* Toast notifications (topmost) */
```

**Rules:**
- Always use `var(--z-*)` instead of hardcoded numbers for any element that participates in cross-component stacking.
- Small, component-scoped z-index values (1-20) are acceptable for internal layering (e.g., sticky `<thead>` at `z-index: 14` within the table's stacking context).
- Portal-rendered elements (CellDropdown, NotificationBell) use `--z-popover` (1100) or higher because they render on `document.body` and must stack above everything except modals and toasts. NotificationBell uses `z-index: 9999` for its portal panel.

### Shadows

```
--shadow-sidebar: 0px 0.17px 0.5px rgba(0,0,0,0.04),
                  0px 0.5px 1.5px rgba(0,0,0,0.02),
                  0px 2px 5px rgba(0,0,0,0.015),
                  0px 6px 18px rgba(0,0,0,0.01)
--shadow-pill: 0px 1px 2px rgba(133,135,139,0.05),
               0px 2px 6px rgba(133,135,139,0.02)
--shadow-popup: 0 12px 36px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.04)
--shadow-toast: 0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04)
```

---

## OVERFLOW CONTEXTS & DROPDOWN IMPLICATIONS

This is the most critical section for understanding dropdown behavior. CSS `overflow` values create clipping boundaries that affect how child elements render.

### `.sheet-table-wrap`

```css
.sheet-table-wrap {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;        /* REQUIRED for border-radius clipping */
}
```

**Why `overflow: hidden` is required:** Without it, the table content would extend past the rounded corners, showing square edges. This is a fundamental CSS behavior — `border-radius` only visually clips content when `overflow` is set to `hidden`, `auto`, or `scroll`.

**Consequence:** Any absolutely-positioned dropdown rendered as a child of `.sheet-table-wrap` will be clipped. This is why table cell dropdowns (courier, agent, status) use the `<CellDropdown>` portal component to render on `document.body` instead.

The inner scrollable div also has `overflow: auto` for horizontal/vertical scrolling, creating a second clipping boundary.

### `.batch-popover`

```css
.batch-popover {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  overflow: visible;       /* MUST be visible for SearchableSelect dropdowns */
  z-index: var(--z-popover);
}
```

**Why `overflow: visible`:** The batch edit popover contains `SearchableSelect` dropdowns. If overflow were set to `auto` or `hidden`, those dropdowns would be clipped inside the 320px popover. `overflow: visible` allows them to extend beyond the popover boundaries.

**History:** This was originally `overflow-y: auto` which caused SearchableSelect dropdowns inside the popover to be clipped. Changed to `overflow: visible` as part of the dropdown fix.

**Viewport-edge issue:** Even with `overflow: visible`, the popover sits near the viewport bottom (`position: fixed; bottom: 90px`). SearchableSelect dropdowns inside it can extend past the viewport edge. This is handled by the component's built-in auto-flip logic (see SearchableSelect section in architecture.md), not by CSS.

### `.modal-panel`

```css
.modal-panel {
  overflow-y: auto;
}
```

**Implication:** Dropdowns inside modals may be clipped. If adding a dropdown inside a modal, test it visually. If clipped, use `<CellDropdown>` with a portal.

### Page Layout Wrapper (`overflow: hidden`)

The dashboard layout uses a flex container with `overflow: hidden`:

```html
<div className="flex flex-col h-full overflow-hidden">
  <header>...</header>
  <div>...table content...</div>
</div>
```

**Why `overflow: hidden`:** Prevents the page content from extending beyond the viewport height in the flex layout. Combined with `h-full`, this creates a full-viewport container where internal scrolling is handled by child elements (like `.sheet-table-wrap`).

**Consequence:** Any element in the page header (or anywhere in this container) that needs to render a dropdown extending beyond the container boundaries must use a portal. This is why `NotificationBell` uses `createPortal` to `document.body` with `position: fixed` — the bell icon is inside the header, which is a child of this overflow-hidden container. Setting `z-index: 9999` alone does NOT escape overflow clipping.

### Filter Bar (no overflow set)

The filter pill area above the table has no explicit overflow setting, so it defaults to `visible`. Inline absolute-positioned dropdowns work fine here.

### Table `<thead>` (sticky)

```css
.sheet-table-wrap thead {
  position: sticky;
  top: 0;
  z-index: 14;
}
```

The sticky header creates a new stacking context but does not clip children. Column header menus (`ColumnHeaderMenu.tsx`) use inline absolute positioning successfully within it.

---

## KEY CSS CLASS FAMILIES

### Table System (`.sheet-*`)

| Class | Purpose | Key Properties |
|-------|---------|----------------|
| `.sheet-table-wrap` | Outer container | `border-radius: 8px`, `overflow: hidden` |
| `.sheet-th` | Header cell | `font-size: 12px`, `font-weight: 600`, `text-transform: uppercase` |
| `.sheet-cell` | Body cell | `font-size: 14px`, `font-weight: 500`, `height: 2.75rem` |
| `.sheet-row` | Body row | Hover: `rgba(60, 131, 246, 0.03)` background |
| `.sheet-checkbox` | Checkbox input | `20x20px`, `border-radius: 5px`, primary fill |
| `.sheet-checkbox-cell` | Checkbox wrapper cell | Fixed width, centered |
| `.sheet-pagination` | Footer pagination | Sticky bottom, border-top |

### SearchableSelect (`.ss-*`)

| Class | Purpose | Key Properties |
|-------|---------|----------------|
| `.ss-wrapper` | Outer container | `position: relative` |
| `.ss-trigger` | Button trigger | Border, rounded, chevron icon |
| `.ss-dropdown` | Dropdown panel | `position: absolute`, `top: calc(100% + 4px)`, `z-index: var(--z-dropdown)`. **Note:** direction and `maxHeight` may be overridden by inline styles from the auto-flip logic in `SearchableSelect.tsx` |
| `.ss-options` | Scrollable option list | `max-height: 220px` (default, dynamically constrained by component) |
| `.ss-option` | Option row | Hover highlight, check icon for selected |
| `.ss-search-input` | Search field | Inside dropdown, auto-focused on open |

### Column Header Menu (`.col-menu-*`)

| Class | Purpose | Key Properties |
|-------|---------|----------------|
| `.col-menu-wrapper` | Outer container | `position: relative` |
| `.col-menu-trigger` | 3-dot button | Fades in on `th:hover` |
| `.col-menu-dropdown` | Dropdown panel | `position: absolute`, `right: 0`, `z-index: var(--z-dropdown)` |
| `.col-menu-item` | Menu item | Icon + label, hover/active states |
| `.col-menu-sep` | Separator line | 1px border |

### Batch Action Bar (`.batch-*`)

| Class | Purpose | Key Properties |
|-------|---------|----------------|
| `.batch-bar` | Fixed bottom bar | `position: fixed`, frosted glass, `z-index: calc(var(--z-popover) + 1)` |
| `.batch-bar-count-badge` | Selection count | `24px` blue circle, white text, `font-size: 12px` |
| `.batch-bar-label` | "Selected" text | `font-size: 12px`, `font-weight: 600`, `color: #334155` |
| `.batch-bar-btn` | Action button | Icon + text, hover darken |
| `.batch-bar-btn.active` | Active state | `background: rgba(60, 131, 246, 0.1)` — used when popover is open |
| `.batch-bar-btn.danger` | Delete button | Red hover/active states |
| `.batch-bar-cancel` | Cancel text button | `font-size: 10px`, `font-weight: 700`, `color: #94a3b8` |
| `.batch-popover` | Edit form popover | `position: absolute`, `overflow: visible`, `z-index: calc(var(--z-popover) + 1)` |
| `.batch-popover-header` | Header row | `display: flex`, `justify-content: space-between` |
| `.batch-popover-title` | Heading text | `font-size: 14px`, `font-weight: 600` |
| `.batch-popover-close` | Close X button | Hover background |
| `.batch-popover-label` | Form field label | `font-size: 13px`, `font-weight: 500` |
| `.batch-popover-actions` | Footer buttons | `display: flex`, `flex-direction: column`, `gap: 8px` |
| `.batch-popover-apply` | Submit button | Primary blue, full-width |
| `.batch-popover-cancel` | Cancel button | Secondary style |
| `.popover-backdrop` | Overlay behind popovers | `position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.2)`, `z-index: var(--z-popover)` |

### Filter Pill (`.filter-pill`)

| Class | Purpose | Key Properties |
|-------|---------|----------------|
| `.filter-pill` | Filter button | `display: inline-flex`, `border`, `rounded`, `font-size: 13px` |
| `.filter-pill:hover` | Hover state | `background: #e2e8f0` |
| `.filter-pill.active` | Filter active | `border-color: var(--color-primary)`, blue tinted background |
| `.filter-pill.open` | Dropdown open | Chevron icon rotates 180° via `.chevron-icon` |

### Filter Dropdown (`.filter-dropdown`)

```css
.filter-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: var(--z-dropdown);
  /* ... styling ... */
}
```

Used by inline filter pill dropdowns above the table. Items use `.filter-dropdown-item` class.

---

## STANDARDIZED PAGE LAYOUT STYLES

All admin pages share a consistent visual structure. Below are the CSS/Tailwind patterns used:

### Page Header
```
<header> — h-14, bg-white, border-b border-border, px-6, flex items-center justify-between
  Title — text-lg, font-bold, text-txt-primary
  Search — h-9, max-w-md, bg-slate-50, border border-border, rounded, pl-10 (for icon)
  NotificationBell — <NotificationBell /> component (portal-based, self-contained)
  Create button — .btn-primary, Plus size={16}
```

### Filter Bar
```
<div> — bg-white, border-b border-border, px-6, py-2.5, flex items-center gap-3
  Column selector — h-8 w-8, border border-[#e2e8f0], rounded-lg, SlidersHorizontal size={14}
  Filter pills — .filter-pill class (see above)
  Column dropdown items — text-[13px], gap-2, cursor-pointer, hover:bg-[#f1f5f9]
```

### Key Style Tokens
- Header height: `h-14` (56px)
- Search bar height: `h-9` (36px)
- Filter bar padding: `px-6 py-2.5`
- Column selector: `h-8 w-8` (32x32px)
- Batch popover width: `340px` (inline style)
- Batch bar icon size: `16px`
- Column selector icon size: `14px`
- Bell icon size: `18px`

---

## ANIMATIONS

Defined as `@keyframes` in `globals.css`:

- `filter-drop-in` — Dropdown entrance: fade + slight translateY
- `ss-slide-in` — SearchableSelect dropdown entrance: fade + slight translateY(-4px)
- `fade-in` — Simple opacity 0 to 1
- `slide-up` — Modal entrance from below
- `slide-down` — Element entering from above

CellDropdown uses `animate-[filter-drop-in_0.12s_ease]` for its entrance animation.
SearchableSelect uses `ss-slide-in` for its dropdown entrance.

---

## RESPONSIVE CONSIDERATIONS

- Sidebar: `w-64` (256px) desktop, collapses to `w-16` (64px)
- Main content: Dynamic margin — `lg:ml-64` (expanded) / `lg:ml-16` (collapsed) based on `sidebarCollapsed` state
- Table: Horizontally scrollable inside `.sheet-table-wrap`
- Batch bar: Centered with `left: 50%; transform: translateX(-50%)`

---

## TAILWIND CONFIGURATION

Design tokens are also defined in `tailwind.config.ts` for use with Tailwind utility classes:

- **Colors:** `primary`, `background-light`, `txt-primary`, `txt-secondary`, `txt-tertiary`, `txt-placeholder`, `border`
- **Font sizes:** Custom scale from `2xs` (10px) through `3xl` (30px)
- **Shadows:** Custom named shadows (`pill`, `sidebar`, `bulk-modal`)
- **Border radius:** Custom scale (`sm`=4px, default=6px, `md`=8px, `lg`=12px, `xl`=16px)
- **Font family:** Inter as primary sans-serif

---

## KNOWN CSS SPECIFICITY ISSUES

### `.form-input` padding override
The `.form-input` class in `globals.css` sets `padding-left: 10px`. This overrides Tailwind utility classes like `pl-8` (32px) because CSS class rules load after Tailwind utilities with equal specificity. **Fix:** Use inline `style={{ paddingLeft: 32 }}` for search inputs that need icon padding space.

### Settings tables in cards
When embedding `.sheet-table-wrap` inside card containers, the wrap's own `border: 1px solid #e2e8f0` and `border-radius: 8px` create a double-border effect. **Fix:** Add `style={{ border: 'none', borderRadius: 0 }}` to the wrap div. Also use `--table-size: '100%'` instead of fixed pixel widths so the table fills the card container.

### Toggle knob positioning with Tailwind classes
Mixing Tailwind positioning classes (`translate-x-5`, `right-0.5`, `left-0.5`) for toggle knobs produces inconsistent results across different toggles. **Fix:** Use inline `style={{ transform: isEnabled ? "translateX(20px)" : "translateX(0)" }}` on the knob `<span>` for reliable positioning. Off state uses `bg-gray-300`, on state uses `bg-primary`.

### `ringColor` is not a valid CSS property in TypeScript
TypeScript's `React.CSSProperties` type does not include `ringColor`. **Fix:** Use `boxShadow` to simulate ring effects: `boxShadow: '0 0 0 2px white, 0 0 0 4px ${color}40'`.

---

## COURIER BADGE WITH LOGO

Courier badges that include a logo image must render the `<img>` inside the badge span:

```tsx
<span className="courier-badge inline-flex items-center gap-1.5">
  {courier.logo_url && (
    <img src={courier.logo_url} alt="" className="w-4 h-4 rounded object-contain" />
  )}
  {courier.name}
</span>
```

**Key:** The badge span needs `inline-flex items-center gap-1.5` to properly align the logo and text. The logo is `w-4 h-4` (16px) inside badges, vs `w-5 h-5` (20px) in other contexts like settings tables.
