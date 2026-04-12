"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Plus, X, Check, Pencil, Trash2, Loader2 } from "lucide-react";

type TagItem = {
  id: string;
  name: string;
  color: string;
};

const PRESET_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#6b7280",
];

export default function TagSettings() {
  const supabase = createClient();

  // State
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Form state
  const [tagFormOpen, setTagFormOpen] = useState(false);
  const [tagForm, setTagForm] = useState({
    name: "",
    color: PRESET_COLORS[0],
  });

  // Edit state
  const [editTagOpen, setEditTagOpen] = useState(false);
  const [editTag, setEditTag] = useState<TagItem | null>(null);
  const [editTagForm, setEditTagForm] = useState({ name: "", color: "" });

  // Delete state
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

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

        // Load tags
        const { data: tagsData } = await supabase
          .from("tags")
          .select("*")
          .is("deleted_at", null);
        if (tagsData) setTags(tagsData);
      } catch (error) {
        console.error("Error loading tags:", error);
        showError("Failed to load tags");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supabase]);

  // Add tag
  const handleAddTag = async () => {
    try {
      const { error } = await supabase.from("tags").insert({
        name: tagForm.name,
        color: tagForm.color,
      });

      if (!error) {
        setTagForm({ name: "", color: PRESET_COLORS[0] });
        setTagFormOpen(false);
        const { data } = await supabase.from("tags").select("*").is("deleted_at", null);
        if (data) setTags(data);
        showSuccess("Tag added");
      }
    } catch (error) {
      console.error("Error adding tag:", error);
      showError("Failed to add tag");
    }
  };

  // Edit tag
  const handleEditTagSave = async () => {
    if (!editTag || !editTagForm.name) return;
    try {
      const { error } = await supabase
        .from("tags")
        .update({ name: editTagForm.name, color: editTagForm.color })
        .eq("id", editTag.id);
      if (!error) {
        const { data } = await supabase.from("tags").select("*").is("deleted_at", null);
        if (data) setTags(data);
        setEditTagOpen(false);
        setEditTag(null);
        showSuccess("Tag updated");
      } else {
        showError("Failed to update tag: " + error.message);
      }
    } catch (error) {
      console.error("Error updating tag:", error);
      showError("Failed to update tag");
    }
  };

  // Delete tag
  const handleDeleteTag = async (tagId: string) => {
    try {
      const { error } = await supabase
        .from("tags")
        .update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId })
        .eq("id", tagId);
      if (!error) {
        setTags(tags.filter((t) => t.id !== tagId));
        showSuccess("Tag deleted");
      } else {
        showError("Failed to delete tag: " + error.message);
      }
    } catch (error) {
      console.error("Error deleting tag:", error);
      showError("Failed to delete tag");
    }
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
            <h2 className="text-ui font-semibold text-txt-primary">Tags</h2>
            <p className="text-muted text-txt-tertiary mt-0.5">Create labels for packages</p>
          </div>
          <button onClick={() => setTagFormOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add tag
          </button>
        </div>

        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tags.length === 0 ? (
            <p className="text-ui-sm text-txt-tertiary col-span-full text-center py-8">
              No tags yet. Add a tag to get started.
            </p>
          ) : (
            tags.map((tag) => (
              <div
                key={tag.id}
                className="relative bg-white border border-border rounded-md overflow-hidden flex flex-col hover:shadow-md transition-all duration-200 cursor-pointer group"
              >
                {/* Left border accent */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: tag.color }}
                />

                {/* Background tint */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                  style={{ backgroundColor: `${tag.color}08` }}
                />

                {/* Content */}
                <div className="relative p-4 flex flex-col flex-1 min-h-24">
                  <p className="text-txt-primary text-ui font-semibold mb-2">{tag.name}</p>
                  <p className="text-txt-tertiary text-meta mt-auto">Used on 0 packages</p>
                  <p className="text-txt-secondary text-meta font-mono mt-1">{tag.color}</p>
                </div>

                {/* Actions */}
                <div className="relative flex items-center gap-1 px-4 py-2 border-t border-border bg-surface-hover opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={() => {
                      setEditTag(tag);
                      setEditTagForm({ name: tag.name, color: tag.color });
                      setEditTagOpen(true);
                    }}
                    className="p-1.5 text-txt-tertiary hover:text-primary hover:bg-primary/5 rounded transition-colors duration-150 cursor-pointer flex-1"
                    title="Edit tag"
                  >
                    <Pencil className="w-3.5 h-3.5 mx-auto" />
                  </button>
                  <button
                    onClick={() => setDeletingTagId(tag.id)}
                    className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors duration-150 cursor-pointer flex-1"
                    title="Delete tag"
                  >
                    <Trash2 className="w-3.5 h-3.5 mx-auto" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Add Tag Modal ── */}
      {tagFormOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Add tag</h3>
              <button
                onClick={() => setTagFormOpen(false)}
                className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Tag name
                </label>
                <input
                  type="text"
                  placeholder="Tag name"
                  value={tagForm.name}
                  onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Color
                </label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setTagForm({ ...tagForm, color })}
                      style={{ backgroundColor: color }}
                      className={`w-8 h-8 rounded-md transition-transform duration-150 cursor-pointer ${
                        tagForm.color === color ? "ring-2 ring-offset-2 ring-offset-white" : ""
                      }`}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setTagFormOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleAddTag} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Add tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Tag Modal ── */}
      {editTagOpen && editTag && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Edit tag</h3>
              <button
                onClick={() => {
                  setEditTagOpen(false);
                  setEditTag(null);
                }}
                className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Tag name
                </label>
                <input
                  type="text"
                  placeholder="Tag name"
                  value={editTagForm.name}
                  onChange={(e) => setEditTagForm({ ...editTagForm, name: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Color
                </label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditTagForm({ ...editTagForm, color })}
                      style={{ backgroundColor: color }}
                      className={`w-8 h-8 rounded-md transition-transform duration-150 cursor-pointer ${
                        editTagForm.color === color ? "ring-2 ring-offset-2 ring-offset-white" : ""
                      }`}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setEditTagOpen(false);
                  setEditTag(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button onClick={handleEditTagSave} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Tag Confirmation ── */}
      <ConfirmDialog
        open={!!deletingTagId}
        onClose={() => setDeletingTagId(null)}
        onConfirm={() => {
          if (deletingTagId) {
            handleDeleteTag(deletingTagId);
            setDeletingTagId(null);
          }
        }}
        title="Delete tag"
        description="This action cannot be undone. Any packages using this tag will have it removed."
      />
    </>
  );
}
