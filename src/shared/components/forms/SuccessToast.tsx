"use client";

import { CheckCircle2 } from "lucide-react";

export interface SuccessToastProps {
  /** Message to display. When empty/null, the toast is hidden. */
  message: string;
  /** Position on screen */
  position?: "top-right" | "bottom-right";
}

/**
 * Shared fixed-position success toast notification.
 *
 * Renders only when `message` is a non-empty string.
 * All detail pages use the same pattern: green badge with check icon,
 * auto-dismissed via a 3-second setTimeout in the parent.
 */
export default function SuccessToast({
  message,
  position = "top-right",
}: SuccessToastProps) {
  if (!message) return null;

  const posClass =
    position === "bottom-right"
      ? "fixed bottom-6 right-6"
      : "fixed top-6 right-6";

  return (
    <div
      className={`${posClass} z-50 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-md flex items-center gap-2 text-ui animate-fade-in`}
    >
      <CheckCircle2 size={16} />
      {message}
    </div>
  );
}
