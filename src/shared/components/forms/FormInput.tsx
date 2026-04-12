"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, ComponentType } from "react";

export interface FormInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Optional Lucide icon rendered left of the label */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: ComponentType<any>;
  /** Field label */
  label?: string;
  /** Suffix text (e.g. "lbs", "cm", "%") rendered inside the input */
  suffix?: string;
  /** Error message shown below the input */
  error?: string;
  /** Additional wrapper className */
  wrapperClassName?: string;
}

/**
 * Shared text/number/email/tel/date input with optional icon, label, suffix, and error.
 *
 * Uses the app's existing `form-input` CSS class for styling consistency.
 */
const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      icon: Icon,
      label,
      suffix,
      error,
      wrapperClassName = "",
      className = "",
      id,
      ...inputProps
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

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
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={`form-input w-full ${suffix ? "pr-10" : ""} ${
              error ? "border-red-400 focus:ring-red-200" : ""
            } ${className}`}
            {...inputProps}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-meta text-txt-tertiary pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <p className="text-meta text-red-500 mt-0.5">{error}</p>
        )}
      </div>
    );
  }
);

FormInput.displayName = "FormInput";
export default FormInput;
