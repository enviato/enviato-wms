"use client";

import React, { useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Columns,
} from "lucide-react";
import type { ColumnDef } from "@/shared/types/common";

/* ── Props ── */
export interface DataTableProps<T extends { id: string }> {
  /** Rows to render on the CURRENT page (already filtered, sorted, paginated) */
  rows: T[];
  /** Full table state from useTableState */
  table: {
    visibleColumns: ColumnDef[];
    columns: ColumnDef[];
    sort: { field: string; direction: "asc" | "desc" };
    handleSort: (field: string) => void;
    currentPage: number;
    setCurrentPage: (page: number) => void;
    totalPages: number;
    startItem: number;
    endItem: number;
    totalItems: number;
    selectedIds: Set<string>;
    toggleSelect: (id: string) => void;
    toggleSelectAll: (visibleIds: string[]) => void;
    isAllSelected: (visibleIds: string[]) => boolean;
    showColumnsDropdown: boolean;
    setShowColumnsDropdown: (v: boolean) => void;
    toggleColumnVisibility: (key: string) => void;
    dragColIdx: number | null;
    setDragColIdx: (idx: number | null) => void;
    dragOverIdx: number | null;
    setDragOverIdx: (idx: number | null) => void;
    moveColumn: (from: number, to: number) => void;
  };
  /** Whether data is loading */
  loading?: boolean;
  /** Number of skeleton rows to show while loading (default 10) */
  skeletonRows?: number;
  /** Render a single cell. Return null to use default empty cell. */
  renderCell: (row: T, col: ColumnDef) => React.ReactNode;
  /** Render the empty state (no rows after filtering) */
  renderEmptyState?: () => React.ReactNode;
  /** Extra CSS class for the outermost wrapper */
  className?: string;
  /** CSS custom property for table size (default "100%") */
  tableSize?: string;
  /** Column sizing refs from useTableColumnSizing */
  columnSizing?: {
    getColumnStyle: (colKey: string) => React.CSSProperties;
    getResizeHandleProps: (colKey: string) => Record<string, unknown>;
  };
}

/* ── Component ── */
export default function DataTable<T extends { id: string }>({
  rows,
  table,
  loading = false,
  skeletonRows = 10,
  renderCell,
  renderEmptyState,
  className = "",
  tableSize = "100%",
  columnSizing,
}: DataTableProps<T>) {
  const {
    visibleColumns,
    columns,
    sort,
    handleSort,
    currentPage,
    setCurrentPage,
    totalPages,
    startItem,
    endItem,
    totalItems,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    isAllSelected,
    showColumnsDropdown,
    setShowColumnsDropdown,
    toggleColumnVisibility,
    dragColIdx,
    setDragColIdx,
    dragOverIdx,
    setDragOverIdx,
    moveColumn,
  } = table;

  const columnsDropdownRef = useRef<HTMLDivElement>(null);
  const rowIds = rows.map((r) => r.id);

  /* ── Column drag handlers ── */
  const handleDragStart = useCallback(
    (idx: number) => setDragColIdx(idx),
    [setDragColIdx]
  );
  const handleDragOver = useCallback(
    (idx: number, e: React.DragEvent) => {
      e.preventDefault();
      if (idx !== dragOverIdx) setDragOverIdx(idx);
    },
    [dragOverIdx, setDragOverIdx]
  );
  const handleDrop = useCallback(
    (idx: number) => {
      if (dragColIdx !== null && dragColIdx !== idx) {
        moveColumn(dragColIdx, idx);
      }
      setDragColIdx(null);
      setDragOverIdx(null);
    },
    [dragColIdx, moveColumn, setDragColIdx, setDragOverIdx]
  );

  return (
    <div className={`sheet-table-wrap ${className}`}>
      <div className="overflow-auto">
        <table
          className="sheet-table"
          style={{ "--table-size": tableSize } as React.CSSProperties}
        >
          {/* ── Header ── */}
          <thead className="sheet-thead">
            <tr>
              {visibleColumns.map((col, idx) => {
                const isSorted = sort.field === col.sortField;
                const colStyle = columnSizing?.getColumnStyle(col.key) ?? {
                  width: col.width,
                  minWidth: col.minWidth,
                };

                return (
                  <th
                    key={col.key}
                    className={`sheet-th${col.sticky ? " sticky left-0 z-10 bg-white" : ""}${
                      isSorted ? " text-primary" : ""
                    }${dragOverIdx === idx ? " bg-blue-50" : ""}`}
                    style={colStyle}
                    draggable={!col.sticky}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(idx, e)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={() => {
                      setDragColIdx(null);
                      setDragOverIdx(null);
                    }}
                  >
                    {col.key === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={isAllSelected(rowIds)}
                        onChange={() => toggleSelectAll(rowIds)}
                        className="w-4 h-4 cursor-pointer"
                        title="Select all"
                      />
                    ) : (
                      <span
                        className={`flex items-center gap-1.5 ${
                          col.sortable ? "cursor-pointer select-none" : ""
                        }`}
                        onClick={
                          col.sortable && col.sortField
                            ? () => handleSort(col.sortField!)
                            : undefined
                        }
                      >
                        {col.icon && (
                          <col.icon
                            size={14}
                            strokeWidth={1.75}
                            className="text-txt-placeholder shrink-0"
                          />
                        )}
                        <span>{col.label}</span>
                        {isSorted && (
                          <ChevronDown
                            size={12}
                            className={`ml-0.5 transition-transform ${
                              sort.direction === "desc" ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </span>
                    )}
                    {col.key !== "checkbox" && (
                      <span className="sheet-th-sep" />
                    )}
                    {columnSizing && !col.sticky && (
                      <span
                        className="sheet-resize-handle"
                        {...columnSizing.getResizeHandleProps(col.key)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {loading ? (
              /* Skeleton rows */
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`skel-${i}`} className="sheet-row">
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="sheet-cell">
                      {col.key === "checkbox" ? (
                        <div className="w-4 h-4 skeleton-pulse rounded" />
                      ) : (
                        <div className="skeleton-pulse h-4 rounded" />
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              /* Empty state */
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="sheet-cell text-center py-16"
                >
                  {renderEmptyState ? (
                    renderEmptyState()
                  ) : (
                    <div className="empty-state">
                      <p className="empty-state-title">No items found</p>
                      <p className="empty-state-desc">
                        Try adjusting your search or filters
                      </p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              /* Data rows */
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={`sheet-row hover:bg-surface-hover transition-colors ${
                    selectedIds.has(row.id) ? "bg-blue-50/60" : ""
                  }`}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`sheet-cell${
                        col.sticky
                          ? " sticky left-0 z-[1] bg-white"
                          : ""
                      }`}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination footer ── */}
      {!loading && totalItems > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-white text-meta">
          <span className="text-txt-tertiary">
            Showing {startItem}–{endItem} of {totalItems}
          </span>

          <div className="flex items-center gap-1.5">
            {/* Column visibility toggle */}
            <div className="relative" ref={columnsDropdownRef}>
              <button
                onClick={() => setShowColumnsDropdown(!showColumnsDropdown)}
                className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors cursor-pointer"
                title="Toggle columns"
              >
                <Columns size={15} />
              </button>
              {showColumnsDropdown && (
                <div className="absolute bottom-full right-0 mb-1 w-52 bg-white border border-border rounded-lg shadow-lg z-30 py-1 max-h-72 overflow-y-auto">
                  {columns
                    .filter(
                      (c) =>
                        c.key !== "checkbox" &&
                        c.key !== "photo"
                    )
                    .map((col) => (
                      <button
                        key={col.key}
                        onClick={() => toggleColumnVisibility(col.key)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-ui text-left hover:bg-surface-hover transition-colors"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            col.visible
                              ? "bg-primary border-primary text-white"
                              : "border-border"
                          }`}
                        >
                          {col.visible && <Check size={12} />}
                        </span>
                        <span className="text-txt-secondary">
                          {col.label || col.key}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Prev / Next */}
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-txt-secondary tabular-nums px-1">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage >= totalPages}
              className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
