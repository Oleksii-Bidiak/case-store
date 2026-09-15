"use client";

import { Check } from "lucide-react";
import { dict } from "@/shared/config";

interface FilterCheckboxProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label text. */
  label: string;
  /** Optional trailing hint (a unit, a note) rendered muted. */
  hint?: string;
  /**
   * Products behind this value, rendered as «(12)» right after the label
   * (TASK-489). Rendered INSIDE the `<label>`, so it joins the checkbox's
   * accessible name rather than decorating the row visually — a shopper using a
   * screen reader hears «Силікон, 12 товарів» and can weigh the choice the same
   * way a sighted one does.
   */
  count?: number;
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
  count,
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
      {count !== undefined && (
        <>
          {/* The digits are for the eye; the sentence next to them is for the
              screen reader, so the number is announced as a quantity and not as
              a stray numeral appended to the value's name. */}
          <span
            aria-hidden="true"
            className="shrink-0 font-mono text-xs text-muted-foreground"
          >
            {dict.filters.facetCount(count)}
          </span>
          <span className="sr-only">{dict.filters.facetCountAria(count)}</span>
        </>
      )}
      {hint && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
