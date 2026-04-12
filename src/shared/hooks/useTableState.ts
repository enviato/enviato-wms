"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { ColumnDef, SortConfig } from "@/shared/types/common";

/* ── Types ── */
export interface UseTableStateOptions {
  /** Default columns with initial visibility / widths */
  defaultColumns: ColumnDef[];
  /** Default page size (default 200) */
  pageSize?: number;
  /** Default sort config */
  defaultSort?: SortConfig;
  /** Storage key for persisting column order (localStorage). Omit to skip persistence. */
  storageKey?: string;
}

export interface TableState {
  /* ── Search ── */
  search: string;
  setSearch: (q: string) => void;

  /* ── Sorting ── */
  sort: SortConfig;
  handleSort: (field: string) => void;

  /* ── Pagination ── */
  currentPage: number;
  pageSize: number;
  setCurrentPage: (page: number) => void;
  /** Total items AFTER filtering (set by consumer) */
  totalItems: number;
  setTotalItems: (n: number) => void;
  totalPages: number;
  startItem: number;
  endItem: number;

  /* ── Selection ── */
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: (visibleIds: string[]) => void;
  clearSelection: () => void;
  isAllSelected: (visibleIds: string[]) => boolean;

  /* ── Columns ── */
  columns: ColumnDef[];
  visibleColumns: ColumnDef[];
  toggleColumnVisibility: (key: string) => void;
  moveColumn: (fromIndex: number, toIndex: number) => void;
  showColumnsDropdown: boolean;
  setShowColumnsDropdown: (v: boolean) => void;

  /* ── Column drag ── */
  dragColIdx: number | null;
  setDragColIdx: (idx: number | null) => void;
  dragOverIdx: number | null;
  setDragOverIdx: (idx: number | null) => void;

  /* ── Inline editing ── */
  editingCell: { rowId: string; colKey: string } | null;
  editValue: string;
  setEditValue: (v: string) => void;
  startEdit: (rowId: string, colKey: string, currentValue: string) => void;
  cancelEdit: () => void;
  /** Consumer must handle the save; this just provides the state. */
  confirmEdit: () => { rowId: string; colKey: string; value: string } | null;

  /* ── Toast ── */
  successMessage: string;
  showSuccess: (msg: string) => void;
  errorMessage: string;
  showError: (msg: string) => void;
}

/* ── Hook ── */
export function useTableState(opts: UseTableStateOptions): TableState {
  const { defaultColumns, pageSize: defaultPageSize = 200, defaultSort } = opts;

  // Search
  const [search, setSearch] = useState("");

  // Sort
  const [sort, setSort] = useState<SortConfig>(
    defaultSort || { field: "", direction: "asc" }
  );

  const handleSort = useCallback(
    (field: string) => {
      setSort((prev) =>
        prev.field === field
          ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
          : { field, direction: "asc" }
      );
    },
    []
  );

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(defaultPageSize);
  const [totalItems, setTotalItems] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Reset page on search change
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((visibleIds: string[]) => {
    setSelectedIds((prev) => {
      if (prev.size === visibleIds.length && visibleIds.length > 0) {
        return new Set();
      }
      return new Set(visibleIds);
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const isAllSelected = useCallback(
    (visibleIds: string[]) =>
      visibleIds.length > 0 && selectedIds.size === visibleIds.length,
    [selectedIds]
  );

  // Columns
  const [columns, setColumns] = useState<ColumnDef[]>(defaultColumns);
  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible),
    [columns]
  );

  const toggleColumnVisibility = useCallback((key: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  }, []);

  const moveColumn = useCallback((fromIndex: number, toIndex: number) => {
    setColumns((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // Column drag
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Inline editing
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = useCallback(
    (rowId: string, colKey: string, currentValue: string) => {
      setEditingCell({ rowId, colKey });
      setEditValue(currentValue);
    },
    []
  );

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const confirmEdit = useCallback(() => {
    if (!editingCell) return null;
    const result = { ...editingCell, value: editValue };
    setEditingCell(null);
    setEditValue("");
    return result;
  }, [editingCell, editValue]);

  // Toast
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  }, []);

  return {
    search,
    setSearch,
    sort,
    handleSort,
    currentPage,
    pageSize,
    setCurrentPage,
    totalItems,
    setTotalItems,
    totalPages,
    startItem,
    endItem,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    isAllSelected,
    columns,
    visibleColumns,
    toggleColumnVisibility,
    moveColumn,
    showColumnsDropdown,
    setShowColumnsDropdown,
    dragColIdx,
    setDragColIdx,
    dragOverIdx,
    setDragOverIdx,
    editingCell,
    editValue,
    setEditValue,
    startEdit,
    cancelEdit,
    confirmEdit,
    successMessage,
    showSuccess,
    errorMessage,
    showError,
  };
}
