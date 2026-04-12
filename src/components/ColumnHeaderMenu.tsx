"use client";

import { useState, useRef, useEffect } from "react";
import {
  MoreVertical,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  EyeOff,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────
 * ColumnHeaderMenu
 *
 * Renders a 3-dot icon that fades in on header hover,
 * and a dropdown with Sort / Move / Hide actions.
 * ──────────────────────────────────────────────────────── */

type Props = {
  colKey: string;
  sortable?: boolean;
  sortField?: string;
  currentSortField?: string;
  currentSortDir?: "asc" | "desc";
  onSort?: (field: string) => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onHide: () => void;
};

export default function ColumnHeaderMenu({
  sortable,
  sortField,
  currentSortField,
  currentSortDir,
  onSort,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onHide,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const isSortedAsc = sortField && currentSortField === sortField && currentSortDir === "asc";
  const isSortedDesc = sortField && currentSortField === sortField && currentSortDir === "desc";

  return (
    <div ref={wrapperRef} className="col-menu-wrapper">
      {/* 3-dot trigger — visible on th hover via CSS */}
      <button
        className={`col-menu-trigger${open ? " col-menu-trigger--open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Column options"
        style={open ? { opacity: 1, transform: "translateX(0)", background: "#e2e8f0", color: "#334155" } : undefined}
      >
        <MoreVertical size={14} />
      </button>

      {/* Dropdown — inline absolute, styled via .col-menu-dropdown in globals.css */}
      {open && (
        <div className="col-menu-dropdown">
          {/* Sort options */}
          {sortable && sortField && onSort && (
            <>
              <button
                className={`col-menu-item ${isSortedAsc ? "col-menu-item--active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSort(sortField);
                  setOpen(false);
                }}
              >
                <ArrowUp size={13} />
                Sort ascending
              </button>
              <button
                className={`col-menu-item ${isSortedDesc ? "col-menu-item--active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSort(sortField);
                  setOpen(false);
                }}
              >
                <ArrowDown size={13} />
                Sort descending
              </button>
              <div className="col-menu-sep" />
            </>
          )}

          {/* Move options */}
          <button
            className="col-menu-item"
            disabled={!canMoveLeft}
            onClick={(e) => {
              e.stopPropagation();
              onMoveLeft();
              setOpen(false);
            }}
          >
            <ArrowLeft size={13} />
            Move left
          </button>
          <button
            className="col-menu-item"
            disabled={!canMoveRight}
            onClick={(e) => {
              e.stopPropagation();
              onMoveRight();
              setOpen(false);
            }}
          >
            <ArrowRight size={13} />
            Move right
          </button>

          <div className="col-menu-sep" />

          {/* Hide */}
          <button
            className="col-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              onHide();
              setOpen(false);
            }}
          >
            <EyeOff size={13} />
            Hide column
          </button>
        </div>
      )}
    </div>
  );
}
