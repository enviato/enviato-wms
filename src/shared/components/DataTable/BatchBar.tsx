"use client";

import React from "react";
import { X } from "lucide-react";

export interface BatchBarProps {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}

/**
 * Floating batch action bar shown when rows are selected.
 * Pass action buttons as children.
 */
export default function BatchBar({ selectedCount, onClear, children }: BatchBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="batch-bar">
      <span className="batch-bar-count-badge">{selectedCount}</span>
      <span className="batch-bar-label">Selected</span>
      {children}
      <button onClick={onClear} className="batch-bar-cancel" title="Clear selection">
        <X size={16} />
      </button>
    </div>
  );
}
