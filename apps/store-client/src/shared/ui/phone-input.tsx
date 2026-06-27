import * as React from "react";

import { Input } from "./input";

/**
 * Format a raw phone string into the Ukrainian mask `+380 NN NNN NNNN`.
 *
 * The `+380` country prefix is always present. The local part is normalised so
 * the user can type any of the common forms without producing a doubled prefix:
 *
 *   - `""`              → `"+380"`
 *   - `"0501234567"`    → `"+380 50 123 4567"` (domestic leading 0 stripped)
 *   - `"380501234567"`  → `"+380 50 123 4567"` (country code stripped)
 *   - `"+380501234567"` → `"+380 50 123 4567"` (+ stripped, rebuilt)
 *   - `"+380 50 123 4"` → `"+380 50 123 4"`    (partial preserved)
 *   - `"12345678901"`   → `"+380 12 345 6789"` (capped at 9 local digits)
 *
 * Grouping is applied progressively as the user types: 2 digits (operator
 * code), 3 digits, then 4 digits, separated by regular ASCII spaces.
 */
export function formatUAPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  let local: string;
  if (digits.startsWith("380")) {
    local = digits.slice(3);
  } else if (digits.startsWith("80")) {
    local = digits.slice(2);
  } else if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else {
    local = digits;
  }

  local = local.slice(0, 9);

  let out = "+380";
  if (local.length > 0) out += " " + local.slice(0, 2);
  if (local.length > 2) out += " " + local.slice(2, 5);
  if (local.length > 5) out += " " + local.slice(5, 9);
  return out;
}

export type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value?: string;
  onChange?: (value: string) => void;
};

/**
 * PhoneInput — a controlled UA phone field wrapping the shared `<Input>`
 * primitive. Displays the live `+380 NN NNN NNNN` mask and emits the raw input
 * value via `onChange` (re-formatting happens on the next render).
 *
 * Sets `type="tel"` and `inputMode="numeric"` for the correct mobile keyboard,
 * and forwards its ref so RHF `Controller` can register the field. Remaining
 * input props (`id`, `autoComplete`, `aria-invalid`, …) pass straight through.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value = "", onChange, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="numeric"
        value={formatUAPhone(value)}
        onChange={(e) => onChange?.(e.target.value)}
        {...props}
      />
    );
  },
);
