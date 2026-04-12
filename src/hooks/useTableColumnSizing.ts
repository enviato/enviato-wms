"use client";

import { useEffect, useState, useCallback, useRef, RefObject } from "react";

/* ─────────────────────────────────────────────────────────
 * useTableColumnSizing
 *
 * 1. Measures the scroll-container width (ResizeObserver).
 * 2. Distributes extra space proportionally so the table
 *    fills the container.
 * 3. Tracks per-column resize overrides from drag handles.
 *
 * Returns:
 *   tableStyle  — CSS vars to spread on <table>
 *   onResizeStart(colKey, e) — call from the handle's mousedown
 * ──────────────────────────────────────────────────────── */

type ColumnForSizing = {
  key: string;
  width: number;
  visible: boolean;
  sticky?: boolean;
};

const UTILITY_KEYS = new Set(["checkbox", "photo"]);
const MIN_COL_WIDTH = 60; // px — hard floor for any column

export function useTableColumnSizing(
  containerRef: RefObject<HTMLDivElement | null>,
  columns: ColumnForSizing[],
) {
  const [containerWidth, setContainerWidth] = useState(0);
  // Overrides from manual resize: colKey → absolute px width
  const [resizeOverrides, setResizeOverrides] = useState<Record<string, number>>({});

  // Track active drag state in a ref so mousemove/mouseup closures always
  // see the latest value without needing re-renders on every pixel.
  const dragRef = useRef<{
    colKey: string;
    startX: number;
    startWidth: number;
    startTableWidth: number;
  } | null>(null);

  // Expose whether a column resize is in progress so callers can
  // suppress other interactions (e.g. column reorder drag).
  const [isResizing, setIsResizing] = useState(false);

  // ── ResizeObserver ──────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? el.clientWidth;
        setContainerWidth(w);
      }
    });

    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [containerRef]);

  // ── Compute final column widths ─────────────────────────
  const computeWidths = useCallback(() => {
    const visible = columns.filter((c) => c.visible);

    // Base width = either a manual override or the default
    const baseWidths: Record<string, number> = {};
    for (const col of visible) {
      baseWidths[col.key] = resizeOverrides[col.key] ?? col.width;
    }

    const baseTotal = Object.values(baseWidths).reduce((s, w) => s + w, 0);

    // If no overrides exist yet, distribute extra space proportionally
    const hasOverrides = Object.keys(resizeOverrides).length > 0;
    const effectiveWidth =
      containerWidth > 0 ? Math.max(containerWidth, baseTotal) : baseTotal;
    const extra = effectiveWidth - baseTotal;

    const resizable = visible.filter((c) => !UTILITY_KEYS.has(c.key));
    const resizableTotal = resizable.reduce((s, c) => s + baseWidths[c.key], 0);

    const finalWidths: Record<string, number> = {};

    for (const col of visible) {
      if (hasOverrides || UTILITY_KEYS.has(col.key) || resizableTotal === 0) {
        // When user has manually resized, lock all widths to their current
        // values — only the dragged column changes, table grows/shrinks.
        finalWidths[col.key] = baseWidths[col.key];
      } else {
        const share = baseWidths[col.key] / resizableTotal;
        finalWidths[col.key] = Math.round(baseWidths[col.key] + extra * share);
      }
    }

    // Table size = either container (pre-resize) or sum of finals (post-resize)
    const totalFinal = Object.values(finalWidths).reduce((s, w) => s + w, 0);
    const tableSize = hasOverrides
      ? Math.max(totalFinal, containerWidth)
      : effectiveWidth;

    return { visible, finalWidths, tableSize };
  }, [columns, containerWidth, resizeOverrides]);

  const { visible, finalWidths, tableSize } = computeWidths();

  // ── Build the style object ──────────────────────────────
  const tableStyle: React.CSSProperties = {} as React.CSSProperties;
  const vars = tableStyle as Record<string, string>;
  for (const col of visible) {
    vars[`--col-${col.key}-size`] = `${finalWidths[col.key]}px`;
  }
  vars["--table-size"] = `${tableSize}px`;

  // ── Resize drag handlers ────────────────────────────────
  const onResizeStart = useCallback(
    (colKey: string, e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const clientX =
        "touches" in e ? e.touches[0].clientX : e.clientX;

      // The handle element that was grabbed
      const handleEl = e.currentTarget as HTMLElement;

      // Snapshot current widths at drag start
      const snap = computeWidths();

      // Seed overrides with ALL current final widths so they're locked
      const allOverrides: Record<string, number> = {};
      for (const col of snap.visible) {
        allOverrides[col.key] = snap.finalWidths[col.key];
      }
      setResizeOverrides(allOverrides);

      dragRef.current = {
        colKey,
        startX: clientX,
        startWidth: snap.finalWidths[colKey],
        startTableWidth: snap.tableSize,
      };

      // Flag that we're resizing (suppresses column reorder etc.)
      setIsResizing(true);

      // Mark only THIS handle as active + body class for cursor override
      handleEl.classList.add("sheet-resize-handle--active");
      document.body.classList.add("sheet-resizing");

      const onMove = (ev: MouseEvent | TouchEvent) => {
        const d = dragRef.current;
        if (!d) return;

        const cx =
          "touches" in ev
            ? (ev as TouchEvent).touches[0].clientX
            : (ev as MouseEvent).clientX;
        const delta = cx - d.startX;
        const newWidth = Math.max(MIN_COL_WIDTH, d.startWidth + delta);
        const widthDelta = newWidth - d.startWidth;

        setResizeOverrides((prev) => ({
          ...prev,
          [d.colKey]: newWidth,
        }));

        // Also update --table-size in real time via the DOM for
        // smoother visuals (React state catches up on next render).
        const table = containerRef.current?.querySelector("table");
        if (table) {
          table.style.setProperty(
            "--table-size",
            `${Math.max(d.startTableWidth + widthDelta, containerWidth)}px`,
          );
          table.style.setProperty(
            `--col-${d.colKey}-size`,
            `${newWidth}px`,
          );
        }
      };

      const onEnd = () => {
        dragRef.current = null;
        setIsResizing(false);
        handleEl.classList.remove("sheet-resize-handle--active");
        document.body.classList.remove("sheet-resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onEnd);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
    },
    [computeWidths, containerRef, containerWidth],
  );

  return { tableStyle, onResizeStart, isResizing };
}
