"use client";

import { forwardRef } from "react";
import type { SelectHTMLAttributes, ComponentType } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FormSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Options to render inside the <select> */
  options: SelectOption[];
  /** Optional Lucide icon rendered left of the label */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: ComponentType<any>;
  /** Field label */
  label?: string;
  /** Placeholder shown as the first disabled option */
  placeholder?: string;
  /** Error message shown below the select */
  error?: string;
  /** Additional wrapper className */
  wrapperClassName?: string;
}

/**
 * Shared native <select> with optional icon, label, placeholder, and error.
 *
 * Matches the app's `form-input` CSS class styling.
 */
const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  (
    {
      options,
      icon: Icon,
      label,
      placeholder,
      error,
      wrapperClassName = "",
      className = "",
      id,
      ...selectProps
    },
    ref
  ) => {
    const inputId =
      id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

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
        <select
          ref={ref}
          id={inputId}
          className={`form-input w-full ${
            error ? "border-red-400 focus:ring-red-200" : ""
          } ${className}`}
          {...selectProps}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-meta text-red-500 mt-0.5">{error}</p>}
      </div>
    );
  }
);

FormSelect.displayName = "FormSelect";
export default FormSelect;
