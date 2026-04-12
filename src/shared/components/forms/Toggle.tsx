"use client";

export interface ToggleProps {
  /** Current on/off state */
  checked: boolean;
  /** Callback when toggled */
  onChange: (checked: boolean) => void;
  /** Label shown to the left of the toggle */
  label?: string;
  /** Description shown below the label */
  description?: string;
  /** Disable interaction */
  disabled?: boolean;
  /** Accessible label (falls back to label prop) */
  ariaLabel?: string;
  /** Render the toggle inside a bordered card row (like notification settings) */
  card?: boolean;
  /** Additional wrapper className */
  className?: string;
}

/**
 * Shared toggle / switch component.
 *
 * Two modes:
 * - Default: inline label + toggle (like customer detail page)
 * - `card`: bordered card wrapper with label + description (like notification settings)
 *
 * Matches the existing toggle pattern: 44px wide × 24px tall, with a
 * 20px circular knob that slides 20px right when active.
 */
export default function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  ariaLabel,
  card = false,
  className = "",
}: ToggleProps) {
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${
        checked ? "bg-primary" : "bg-gray-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );

  /* Toggle-only (no label) */
  if (!label) return toggle;

  /* Card variant: bordered wrapper with label + description */
  if (card) {
    return (
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        className={`w-full flex items-center justify-between p-3 rounded-md border transition-colors duration-150 cursor-pointer ${
          checked
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-surface-hover"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      >
        <div className="text-left">
          <span className="text-txt-primary text-ui">{label}</span>
          {description && (
            <p className="text-txt-tertiary text-muted mt-0.5">
              {description}
            </p>
          )}
        </div>
        {/* Inner visual-only switch (click handled by outer button) */}
        <div
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0 ${
            checked ? "bg-primary" : "bg-gray-300"
          }`}
        >
          <span
            className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
            style={{
              transform: checked ? "translateX(20px)" : "translateX(0)",
            }}
          />
        </div>
      </button>
    );
  }

  /* Inline variant: row with label left, toggle right */
  return (
    <div
      className={`flex items-center justify-between ${className}`}
    >
      <div>
        <span className="text-txt-primary text-ui">
          {label}
        </span>
        {description && (
          <p className="text-txt-tertiary text-muted mt-0.5">{description}</p>
        )}
      </div>
      {toggle}
    </div>
  );
}
