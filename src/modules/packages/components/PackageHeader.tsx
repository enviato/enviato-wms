"use client";

import React from "react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Printer, Trash2 } from "lucide-react";
import { statusConfig } from "../types";

interface PackageHeaderProps {
  trackingNumber: string;
  status: string;
  currentIndex: number;
  totalCount: number;
  prevId: string | null;
  nextId: string | null;
  onCheckout: () => void;
  onPrintLabel: () => void;
  onDelete: () => void;
  onBack: () => void;
  onNavigate: (id: string) => void;
}

export default function PackageHeader({
  trackingNumber,
  status,
  currentIndex,
  totalCount,
  prevId,
  nextId,
  onCheckout,
  onPrintLabel,
  onDelete,
  onBack,
  onNavigate,
}: PackageHeaderProps) {
  const sc = statusConfig[status] || statusConfig.checked_in;

  return (
    <header className="h-14 shrink-0 bg-white border-b border-border px-4 flex items-center justify-between gap-3">
      {/* Left: back + package info */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBack}
          className="p-1.5 -ml-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors cursor-pointer"
          title="Back to Packages"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-ui font-semibold text-txt-primary tracking-tight truncate">
            {trackingNumber}
          </span>
          <span className={`status-badge text-meta ${sc.bg} ${sc.text}`}>
            <span className={`status-dot ${sc.dot}`} />
            {sc.label}
          </span>
        </div>
      </div>

      {/* Right: counter + prev/next + actions */}
      <div className="flex items-center gap-2 shrink-0">
        {totalCount > 0 && (
          <span className="text-meta text-txt-tertiary tabular-nums">
            {currentIndex + 1} of {totalCount}
          </span>
        )}
        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <button
            onClick={() => prevId && onNavigate(prevId)}
            disabled={!prevId}
            className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            title="Previous package"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={() => nextId && onNavigate(nextId)}
            disabled={!nextId}
            className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            title="Next package"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {status === "checked_in" && (
          <button
            onClick={onCheckout}
            className="btn-primary text-ui-sm px-2.5 py-1.5 cursor-pointer"
          >
            <CheckCircle2 size={12} className="mr-1" />
            Check Out
          </button>
        )}
        <button
          onClick={onPrintLabel}
          className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors cursor-pointer"
          title="Print label"
        >
          <Printer size={16} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
          title="Delete package"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </header>
  );
}
