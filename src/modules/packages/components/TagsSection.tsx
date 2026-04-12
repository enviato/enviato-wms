"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Tag, Settings, Plus, Search, Palette, Loader2, X } from "lucide-react";
import { TagDefinition } from "../types";

interface TagsSectionProps {
  packageId: string;
  orgId: string;
  assignedTags: TagDefinition[];
  availableTags: TagDefinition[];
  onAddTag: (tagId: string) => Promise<void>;
  onRemoveTag: (tagId: string) => Promise<void>;
  onCreateAndAdd: (name: string, color: string) => Promise<void>;
  saving: boolean;
}

export default function TagsSection({
  packageId,
  orgId,
  assignedTags,
  availableTags,
  onAddTag,
  onRemoveTag,
  onCreateAndAdd,
  saving,
}: TagsSectionProps) {
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6b6b6b");
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredTags = availableTags.filter(
    (tag) =>
      !assignedTags.some((a) => a.id === tag.id) &&
      tag.name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  const handleCreateAndAdd = async () => {
    if (newTagName.trim()) {
      await onCreateAndAdd(newTagName.trim(), newTagColor);
      setNewTagName("");
      setNewTagColor("#6b6b6b");
      setShowCreateTag(false);
      setTagSearch("");
    }
  };

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-ui font-semibold text-txt-primary tracking-tight flex items-center gap-1.5">
          <Tag size={14} className="text-txt-tertiary" />
          Tags
        </p>
        <Link
          href="/admin/settings/tags"
          className="text-meta text-txt-tertiary hover:text-primary transition-colors flex items-center gap-1"
          title="Manage tags in Settings"
        >
          <Settings size={11} />
          Manage
        </Link>
      </div>

      {/* Assigned tags display */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {assignedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-meta"
            style={{
              backgroundColor: `${tag.color}15`,
              color: tag.color,
              border: `1px solid ${tag.color}30`,
            }}
          >
            <span
              className="w-[6px] h-[6px] rounded-full shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
            <button
              onClick={() => onRemoveTag(tag.id)}
              className="hover:opacity-70 cursor-pointer ml-0.5"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {assignedTags.length === 0 && (
          <span className="text-muted text-txt-placeholder">No tags</span>
        )}
      </div>

      {/* Tag dropdown trigger */}
      <div className="relative" ref={tagDropdownRef}>
        <button
          onClick={() => {
            setShowTagDropdown(!showTagDropdown);
            setShowCreateTag(false);
            setTagSearch("");
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-meta text-txt-secondary hover:text-txt-primary bg-surface-secondary hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
        >
          <Plus size={12} />
          Add Tag
        </button>

        {/* Dropdown */}
        {showTagDropdown && (
          <div className="absolute top-full left-0 mt-1 w-[280px] bg-white border border-border rounded-lg shadow-lg z-[1000] overflow-hidden">
            {/* Search input */}
            <div className="p-2.5 border-b border-border-light">
              <div className="flex items-center gap-2.5 px-2.5 py-2 bg-surface-secondary rounded-md">
                <Search size={14} className="text-txt-tertiary shrink-0" />
                <input
                  type="text"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="Search tags..."
                  className="flex-1 bg-transparent text-ui outline-none"
                  autoFocus
                />
              </div>
            </div>

            {!showCreateTag ? (
              <>
                {/* Available tags list */}
                <div className="max-h-[280px] overflow-y-auto py-1">
                  {filteredTags.length === 0 && tagSearch.trim() && (
                    <p className="py-3 px-3 text-muted text-txt-tertiary text-center">
                      No matching tags
                    </p>
                  )}
                  {filteredTags.length === 0 && !tagSearch.trim() && (
                    <p className="py-3 px-3 text-muted text-txt-tertiary text-center">
                      All tags assigned
                    </p>
                  )}
                  {filteredTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => onAddTag(tag.id)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border"
                        style={{ backgroundColor: tag.color, borderColor: `${tag.color}50` }}
                      />
                      <span className="text-ui text-txt-primary">{tag.name}</span>
                    </button>
                  ))}
                </div>

                {/* Create new tag option */}
                <div className="border-t border-border-light">
                  <button
                    onClick={() => {
                      setShowCreateTag(true);
                      setNewTagName(tagSearch);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    <Plus size={14} className="text-primary shrink-0" />
                    <span className="text-ui text-primary">
                      Create new tag{tagSearch.trim() ? `: "${tagSearch.trim()}"` : ""}
                    </span>
                  </button>
                </div>
              </>
            ) : (
              /* ── Create New Tag Form ── */
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-meta text-txt-secondary block mb-1">
                    Tag Name
                  </label>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagName.trim()) {
                        e.preventDefault();
                        handleCreateAndAdd();
                      }
                      if (e.key === "Escape") {
                        setShowCreateTag(false);
                      }
                    }}
                    placeholder="e.g., Fragile"
                    className="w-full px-2.5 py-1.5 text-ui-sm border border-border rounded-md outline-none focus:border-primary transition-colors"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-meta text-txt-secondary block mb-1.5 flex items-center gap-1">
                    <Palette size={11} />
                    Color
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "#dc2626", "#ef4444", "#f59e0b", "#eab308",
                      "#22c55e", "#059669", "var(--primary)", "#2563eb",
                      "#7c3aed", "#8b5cf6", "#ec4899", "#6b7280",
                    ].map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewTagColor(c)}
                        className={`w-6 h-6 rounded-full cursor-pointer transition-all duration-100 ${
                          newTagColor === c
                            ? "ring-2 ring-offset-1 ring-txt-primary scale-110"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                  {/* Preview */}
                  {newTagName.trim() && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-meta text-txt-tertiary">Preview:</span>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-meta"
                        style={{
                          backgroundColor: `${newTagColor}15`,
                          color: newTagColor,
                          border: `1px solid ${newTagColor}30`,
                        }}
                      >
                        <span
                          className="w-[6px] h-[6px] rounded-full"
                          style={{ backgroundColor: newTagColor }}
                        />
                        {newTagName.trim()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setShowCreateTag(false)}
                    className="flex-1 px-2.5 py-1.5 text-meta text-txt-secondary bg-surface-secondary hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreateAndAdd}
                    disabled={!newTagName.trim() || saving}
                    className="flex-1 px-2.5 py-1.5 text-meta text-white bg-slate-800 hover:bg-slate-800/90 rounded-md transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1"
                  >
                    {saving && <Loader2 size={11} className="animate-spin" />}
                    Create & Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
