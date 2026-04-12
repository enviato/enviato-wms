"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  variant?: "danger" | "warning";
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  variant = "danger",
}: ConfirmDialogProps) {
  if (!open) return null;

  const iconBg = variant === "danger" ? "bg-red-50" : "bg-amber-50";
  const iconColor = variant === "danger" ? "text-red-500" : "text-amber-500";
  const btnBg =
    variant === "danger"
      ? "bg-red-500 hover:bg-red-600"
      : "bg-amber-500 hover:bg-amber-600";

  return (
    <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="modal-panel max-w-sm w-full space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}
          >
            <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-ui font-semibold text-txt-primary">
              {title}
            </h3>
            <p className="text-muted text-txt-tertiary mt-0.5">
              {description}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-secondary cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`${btnBg} text-white px-4 py-2 rounded-lg text-ui transition-colors cursor-pointer flex items-center gap-1.5`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {!loading && variant === "danger" && (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
