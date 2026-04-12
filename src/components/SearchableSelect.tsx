"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

export type SSOption = {
  value: string;
  label: string;
  sub?: string; // secondary text (e.g. email, code)
};

type SearchableSelectProps = {
  options: SSOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
};

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchable = true,
  searchPlaceholder = "Search…",
  emptyText = "No results found",
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Auto-focus search when opening
  useEffect(() => {
    if (open && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
      setSearch("");
    },
    [onChange]
  );

  const selectedOption = options.find((o) => o.value === value);

  const filtered = search
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.sub && o.sub.toLowerCase().includes(search.toLowerCase()))
      )
    : options;

  // Calculate dropdown positioning synchronously during render
  // to determine if we should flip above the trigger
  let flipUp = false;
  let optionsMaxHeight = 220; // default max-height for ss-options
  if (open && triggerRef.current) {
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8; // 8px margin from viewport edge
    const spaceAbove = rect.top - 8;
    const searchBoxHeight = searchable ? 50 : 0; // approximate height of search input area
    const minUsable = 120 + searchBoxHeight; // minimum usable dropdown height

    if (spaceBelow < minUsable && spaceAbove > spaceBelow) {
      flipUp = true;
      optionsMaxHeight = Math.min(220, spaceAbove - searchBoxHeight - 16);
    } else {
      optionsMaxHeight = Math.min(220, spaceBelow - searchBoxHeight - 16);
    }
    optionsMaxHeight = Math.max(optionsMaxHeight, 80); // never smaller than 80px
  }

  return (
    <div ref={wrapperRef} className={`ss-wrapper ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`ss-trigger ${open ? "ss-open" : ""}`}
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}
        disabled={disabled}
      >
        {selectedOption ? (
          <span className="truncate">{selectedOption.label}</span>
        ) : (
          <span className="ss-placeholder">{placeholder}</span>
        )}
        <ChevronDown size={14} className="ss-chevron" />
      </button>

      {open && (
        <div
          className="ss-dropdown"
          style={flipUp ? { top: "auto", bottom: "calc(100% + 4px)" } : undefined}
        >
          {searchable && (
            <div className="ss-search-wrap relative">
              <Search size={14} className="ss-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="ss-search-input"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="ss-options" style={{ maxHeight: optionsMaxHeight }}>
            {filtered.length === 0 ? (
              <div className="ss-empty">{emptyText}</div>
            ) : (
              filtered.map((opt) => (
                <div
                  key={opt.value}
                  className={`ss-option ${value === opt.value ? "ss-selected" : ""}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {value === opt.value && <Check size={14} className="ss-check" />}
                  <span className="truncate">{opt.label}</span>
                  {opt.sub && <span className="ss-option-sub">{opt.sub}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
