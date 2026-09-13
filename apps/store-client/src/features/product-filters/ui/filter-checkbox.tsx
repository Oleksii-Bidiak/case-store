"use client";

import { Check } from "lucide-react";

interface FilterCheckboxProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label text. */
  label: string;
  /** Optional trailing hint (a count, a unit) rendered muted. */
  hint?: string;
}

/**
 * A checkbox row for the catalogue filter panel (TASK-414).
 *
 * The storefront's `shared/ui` has no checkbox primitive, and this is a filter
 * control rather than a design-system addition, so it stays a native
 * `<input type="checkbox">` inside a `<label>`: real semantics, real keyboard
 * behaviour (Space toggles, Tab reaches it), and screen readers announce the
 * checked state without any ARIA of our own. The input is `sr-only` rather than
 * hidden so it keeps all of that; the `peer-*` classes paint the visible box and
 * mirror its focus ring, which is why the focus indicator follows the real
 * focus and not a simulated one.
 */
export function FilterCheckbox({
  id,
  checked,
  onCheckedChange,
  label,
  hint,
}: FilterCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 py-1.5 text-sm text-foreground"
    >
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-transparent"
        }`}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${checked ? "font-semibold" : ""}`}
      >
        {label}
      </span>
      {hint && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
