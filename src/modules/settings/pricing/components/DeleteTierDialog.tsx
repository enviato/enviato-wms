"use client";

import { AlertTriangle, Trash2 } from "lucide-react";

interface DeleteTierDialogProps {
  open: boolean;
  tierName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteTierDialog({
  open,
  tierName,
  onConfirm,
  onCancel,
}: DeleteTierDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="modal-panel max-w-sm w-full space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-title font-semibold text-txt-primary">
              Delete pricing tier
            </h3>
            <p className="text-ui-sm text-txt-tertiary mt-0.5">
              This action cannot be undone. Customers assigned to this tier
              will be unassigned.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-ui transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
