"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Plus, X, Check, Trash2, Loader2, CircleDot, GripVertical } from "lucide-react";

type StatusItem = {
  id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
};

const PRESET_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#6b7280",
];

export default function StatusSettings() {
  const supabase = createClient();

  // State
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Form state
  const [statusFormOpen, setStatusFormOpen] = useState(false);
  const [statusForm, setStatusForm] = useState({
    name: "",
    slug: "",
    color: PRESET_COLORS[0],
  });

  // Inline-edit status name
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingStatusName, setEditingStatusName] = useState("");
  const [deletingStatusId, setDeletingStatusId] = useState<string | null>(null);

  // Drag-to-reorder statuses
  const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);

  // Current user for deleted_by tracking
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      try {
        // Get current user for deleted_by tracking
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          setCurrentUserId(authUser.id);
        }

        // Load statuses
        const { data: statusesData } = await supabase
          .from("package_statuses")
          .select("*")
          .is("deleted_at", null)
          .order("sort_order");
        if (statusesData) setStatuses(statusesData);
      } catch (error) {
        console.error("Error loading statuses:", error);
        showError("Failed to load statuses");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supabase]);

  // Add status
  const handleAddStatus = async () => {
    if (!statusForm.name) return;
    const slug = statusForm.slug || statusForm.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    try {
      const { error } = await supabase.from("package_statuses").insert({
        name: statusForm.name,
        slug,
        color: statusForm.color,
        sort_order: statuses.length,
      });

      if (!error) {
        setStatusForm({ name: "", slug: "", color: PRESET_COLORS[0] });
        setStatusFormOpen(false);
        const { data } = await supabase.from("package_statuses").select("*").is("deleted_at", null).order("sort_order");
        if (data) setStatuses(data);
        showSuccess("Status added");
      }
    } catch (error) {
      console.error("Error adding status:", error);
      showError("Failed to add status");
    }
  };

  // Delete status
  const handleDeleteStatus = async (statusId: string) => {
    try {
      const { error } = await supabase.from("package_statuses").update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId }).eq("id", statusId);
      if (!error) {
        setStatuses(statuses.filter((s) => s.id !== statusId));
        showSuccess("Status deleted");
      } else {
        showError("Failed to delete status: " + error.message);
      }
    } catch (error) {
      console.error("Error deleting status:", error);
      showError("Failed to delete status");
    }
  };

  const handleStartEditStatus = (status: StatusItem) => {
    setEditingStatusId(status.id);
    setEditingStatusName(status.name);
  };

  const handleSaveStatusName = async () => {
    if (!editingStatusId || !editingStatusName.trim()) {
      setEditingStatusId(null);
      return;
    }
    const original = statuses.find((s) => s.id === editingStatusId);
    if (original && original.name === editingStatusName.trim()) {
      setEditingStatusId(null);
      return;
    }
    try {
      const { error } = await supabase
        .from("package_statuses")
        .update({ name: editingStatusName.trim() })
        .eq("id", editingStatusId);
      if (!error) {
        setStatuses(statuses.map((s) => s.id === editingStatusId ? { ...s, name: editingStatusName.trim() } : s));
        showSuccess("Status renamed");
      }
    } catch (error) {
      console.error("Error renaming status:", error);
      showError("Failed to rename status");
    } finally {
      setEditingStatusId(null);
    }
  };

  const handleStatusDragStart = (statusId: string) => {
    setDraggedStatusId(statusId);
  };

  const handleStatusDragOver = (e: React.DragEvent, statusId: string) => {
    e.preventDefault();
    if (statusId !== draggedStatusId) {
      setDragOverStatusId(statusId);
    }
  };

  const handleStatusDragLeave = () => {
    setDragOverStatusId(null);
  };

  const handleStatusDrop = async (targetId: string) => {
    if (!draggedStatusId || draggedStatusId === targetId) {
      setDraggedStatusId(null);
      setDragOverStatusId(null);
      return;
    }
    const oldList = [...statuses];
    const dragIndex = oldList.findIndex((s) => s.id === draggedStatusId);
    const dropIndex = oldList.findIndex((s) => s.id === targetId);
    if (dragIndex === -1 || dropIndex === -1) return;

    const [moved] = oldList.splice(dragIndex, 1);
    oldList.splice(dropIndex, 0, moved);
    const reordered = oldList.map((s, i) => ({ ...s, sort_order: i }));
    setStatuses(reordered);
    setDraggedStatusId(null);
    setDragOverStatusId(null);

    // Persist sort_order to DB
    try {
      await Promise.all(
        reordered.map((s) =>
          supabase.from("package_statuses").update({ sort_order: s.sort_order }).eq("id", s.id)
        )
      );
      showSuccess("Status order updated");
    } catch (error) {
      console.error("Error saving status order:", error);
      showError("Failed to save status order");
    }
  };

  const handleStatusDragEnd = () => {
    setDraggedStatusId(null);
    setDragOverStatusId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-txt-tertiary" />
      </div>
    );
  }

  return (
    <>
      {/* Toast messages */}
      {successMessage && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-ui">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-ui">
          {errorMessage}
        </div>
      )}

      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-ui font-semibold text-txt-primary">Package statuses</h2>
            <p className="text-muted text-txt-tertiary mt-0.5">Define package status workflow</p>
          </div>
          <button onClick={() => setStatusFormOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add status
          </button>
        </div>

        <div className="px-5 py-5 space-y-2">
          {statuses.length === 0 ? (
            <p className="text-ui-sm text-txt-tertiary text-center py-8">No statuses yet. Add a status to get started.</p>
          ) : (
            statuses.map((status, index) => (
              <div key={status.id}>
                <div
                  draggable
                  onDragStart={() => handleStatusDragStart(status.id)}
                  onDragOver={(e) => handleStatusDragOver(e, status.id)}
                  onDragLeave={handleStatusDragLeave}
                  onDrop={() => handleStatusDrop(status.id)}
                  onDragEnd={handleStatusDragEnd}
                  className={`bg-white border rounded-lg p-4 flex items-center justify-between transition-all duration-150 ${
                    draggedStatusId === status.id
                      ? "opacity-40 border-border"
                      : dragOverStatusId === status.id
                      ? "border-primary bg-[#f0f9ff]"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Drag handle with hover background */}
                    <div className="p-1 rounded transition-colors hover:bg-surface-hover cursor-grab active:cursor-grabbing flex-shrink-0">
                      <GripVertical size={18} className="text-txt-tertiary" />
                    </div>

                    {/* Color preview with ring */}
                    <div className="flex-shrink-0 flex items-center justify-center">
                      <div
                        className="w-6 h-6 rounded-full ring-2 ring-offset-1 flex-shrink-0"
                        style={{ backgroundColor: status.color, boxShadow: `0 0 0 2px white, 0 0 0 4px ${status.color}40` }}
                      />
                    </div>

                    {/* Name, slug, and default badge */}
                    <div className="flex-1 min-w-0">
                      {editingStatusId === status.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingStatusName}
                          onChange={(e) => setEditingStatusName(e.target.value)}
                          onBlur={handleSaveStatusName}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveStatusName();
                            if (e.key === "Escape") setEditingStatusId(null);
                          }}
                          className="text-ui font-semibold text-txt-primary border border-primary rounded px-2 py-1 outline-none w-full max-w-[260px] bg-white"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p
                            onClick={() => handleStartEditStatus(status)}
                            className="text-txt-primary text-ui font-semibold cursor-text hover:bg-[#eef6fc] hover:shadow-[inset_0_0_0_1px_#bde0f7] rounded px-2 py-1 -mx-2 transition-all duration-150"
                          >
                            {status.name}
                          </p>
                          {index === 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-meta font-semibold flex-shrink-0">
                              Default
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-txt-tertiary text-meta font-mono mt-0.5">{status.slug}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Color picker button - opens color picker for status */}
                    <button
                      className="p-2 text-txt-tertiary hover:bg-surface-hover rounded transition-colors duration-150 cursor-pointer"
                      title="Edit status color"
                      onClick={() => {
                        setEditingStatusId(status.id);
                        setEditingStatusName(status.name);
                      }}
                    >
                      <CircleDot className="w-4 h-4" style={{ color: status.color }} />
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => setDeletingStatusId(status.id)}
                      className="p-2 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors duration-150 cursor-pointer flex-shrink-0"
                      title="Delete status"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Divider hint between statuses */}
                {index < statuses.length - 1 && (
                  <div className="flex items-center justify-center py-1 text-txt-tertiary text-meta">
                    <span>→</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Add Status Modal ── */}
      {statusFormOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Add status</h3>
              <button onClick={() => setStatusFormOpen(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Status name</label>
                <input type="text" placeholder="e.g. Ready for Pickup" value={statusForm.name} onChange={(e) => setStatusForm({ ...statusForm, name: e.target.value })} className="form-input" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Slug <span className="text-txt-placeholder">(auto-generated if empty)</span></label>
                <input type="text" placeholder={statusForm.name ? statusForm.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") : "auto_slug"} value={statusForm.slug} onChange={(e) => setStatusForm({ ...statusForm, slug: e.target.value })} className="form-input font-mono" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Color</label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setStatusForm({ ...statusForm, color })}
                      style={{ backgroundColor: color }}
                      className={`w-8 h-8 rounded-md transition-transform duration-150 cursor-pointer ${statusForm.color === color ? "ring-2 ring-offset-2 ring-offset-white" : ""}`}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setStatusFormOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleAddStatus} disabled={!statusForm.name} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Add status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Status Confirmation ── */}
      <ConfirmDialog
        open={!!deletingStatusId}
        onClose={() => setDeletingStatusId(null)}
        onConfirm={() => {
          if (deletingStatusId) {
            handleDeleteStatus(deletingStatusId);
            setDeletingStatusId(null);
          }
        }}
        title="Delete status"
        description="This action cannot be undone. Packages with this status may be affected."
      />
    </>
  );
}
