"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * CellDropdown — minimal portal-based dropdown for table cells.
 *
 * Uses getBoundingClientRect() on the anchor element to position the dropdown
 * SYNCHRONOUSLY during render — no flash, no delayed positioning.
 * Only needed for dropdowns inside overflow-clipped containers (e.g. tables).
 */
interface CellDropdownProps {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  children: React.ReactNode;
  width?: number;
  className?: string;
}

export default function CellDropdown({
  open,
  onClose,
  anchorEl,
  children,
  width = 200,
  className = "",
}: CellDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorEl?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorEl]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !mounted || !anchorEl) return null;

  // Calculate position synchronously from anchor — no flash
  const rect = anchorEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const maxH = 320;
  const dropAbove = spaceBelow < 120 && spaceAbove > spaceBelow;

  const style: React.CSSProperties = {
    position: "fixed",
    left: rect.left,
    width,
    zIndex: 1101,
    maxHeight: Math.min(maxH, dropAbove ? spaceAbove : spaceBelow),
    overflowY: "auto",
  };

  if (dropAbove) {
    style.bottom = window.innerHeight - rect.top + 4;
  } else {
    style.top = rect.bottom + 4;
  }

  return createPortal(
    <div
      ref={dropdownRef}
      style={style}
      className={`bg-white border border-[--color-border] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.04)] overflow-hidden animate-[filter-drop-in_0.12s_ease] ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
