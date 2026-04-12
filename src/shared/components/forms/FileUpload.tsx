"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, Loader2, X } from "lucide-react";

export interface FileUploadProps {
  /** Called with selected File objects */
  onUpload: (files: File[]) => void | Promise<void>;
  /** Accepted MIME types (e.g. "image/*") */
  accept?: string;
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Show uploading spinner */
  uploading?: boolean;
  /** Disable the drop zone */
  disabled?: boolean;
  /** Compact mode (smaller drop zone) */
  compact?: boolean;
  /** Label text inside the drop zone */
  label?: string;
  /** Sub-label text (e.g. "PNG, JPG up to 10MB") */
  hint?: string;
  /** Additional wrapper className */
  className?: string;
}

/**
 * Shared drag-and-drop file upload zone.
 *
 * Matches the existing photo upload pattern in the package detail page:
 * dashed border, centered icon, drag-over highlight.
 */
export default function FileUpload({
  onUpload,
  accept = "image/*",
  multiple = true,
  uploading = false,
  disabled = false,
  compact = false,
  label = "Drop files here or click to upload",
  hint,
  className = "",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onUpload(Array.from(files));
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled || uploading) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, uploading, handleFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled && !uploading) setDragOver(true);
    },
    [disabled, uploading]
  );

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`
        flex flex-col items-center justify-center
        border-2 border-dashed rounded-lg cursor-pointer
        transition-colors duration-150
        ${compact ? "py-4 px-3" : "py-8 px-4"}
        ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-surface-hover"}
        ${disabled || uploading ? "opacity-50 cursor-not-allowed" : ""}
        ${className}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          // Reset so the same file can be re-selected
          e.target.value = "";
        }}
        disabled={disabled || uploading}
      />

      {uploading ? (
        <Loader2
          size={compact ? 18 : 24}
          className="animate-spin text-primary"
        />
      ) : (
        <Upload
          size={compact ? 18 : 24}
          className="text-txt-tertiary mb-1.5"
        />
      )}

      <p
        className={`text-txt-tertiary ${
          compact ? "text-meta" : "text-ui"
        }`}
      >
        {uploading ? "Uploading…" : label}
      </p>

      {hint && !uploading && (
        <p className="text-meta text-txt-placeholder mt-0.5">{hint}</p>
      )}
    </div>
  );
}
