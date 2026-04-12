"use client";

import { forwardRef } from "react";
import type { TextareaHTMLAttributes, ComponentType } from "react";

export interface FormTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional Lucide icon rendered left of the label */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: ComponentType<any>;
  /** Field label */
  label?: string;
  /** Error message shown below the textarea */
  error?: string;
  /** Callback fired on Ctrl+Enter / Cmd+Enter (common "save" shortcut) */
  onCtrlEnter?: () => void;
  /** Additional wrapper className */
  wrapperClassName?: string;
}

/**
 * Shared multi-line textarea with optional icon, label, error, and Ctrl+Enter shortcut.
 *
 * Matches the app's `form-input` CSS class styling.
 */
const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  (
    {
      icon: Icon,
      label,
      error,
      onCtrlEnter,
      wrapperClassName = "",
      className = "",
      id,
      onKeyDown,
      ...textareaProps
    },
    ref
  ) => {
    const inputId =
      id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (onCtrlEnter && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onCtrlEnter();
      }
      onKeyDown?.(e);
    };

    return (
      <div className={wrapperClassName}>
        {label && (
          <label
            htmlFor={inputId}
            className="flex items-center gap-1.5 text-muted text-txt-tertiary tracking-tight mb-1"
          >
            {Icon && <Icon size={14} className="text-txt-tertiary" />}
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`form-input w-full resize-none ${
            error ? "border-red-400 focus:ring-red-200" : ""
          } ${className}`}
          onKeyDown={handleKeyDown}
          {...textareaProps}
        />
        {error && <p className="text-meta text-red-500 mt-0.5">{error}</p>}
      </div>
    );
  }
);

FormTextarea.displayName = "FormTextarea";
export default FormTextarea;
