"use client";

import type { ComponentType, ReactNode } from "react";

export interface DetailRowProps {
  /** Lucide icon for the row */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;
  /** Field label */
  label: string;
  /** Content: plain text value or an input element when editing */
  children: ReactNode;
}

/**
 * Shared detail row layout: icon + label on the left, value/input on the right.
 *
 * Used across detail pages (customer, package, invoice) for consistent field display.
 * Renders a bordered row that collapses on the last item.
 */
export default function DetailRow({ icon: Icon, label, children }: DetailRowProps) {
  return (
    <div className="flex items-center py-2.5 border-b border-border-light last:border-0">
      <div className="flex items-center gap-2.5 w-36 shrink-0">
        <Icon size={15} className="text-txt-tertiary" />
        <span className="text-muted text-txt-tertiary tracking-tight">
          {label}
        </span>
      </div>
      <div className="text-ui text-txt-primary ml-auto text-right flex-1">
        {children}
      </div>
    </div>
  );
}
