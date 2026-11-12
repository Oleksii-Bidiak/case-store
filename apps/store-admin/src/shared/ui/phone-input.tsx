"use client";

import * as React from "react";

import { formatUAPhone, sanitizePhoneInput } from "@/shared/lib/phone";
import { Input } from "./input";

export type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value?: string;
  onChange?: (value: string) => void;
  /**
   * The rule named by the DTO's decorator (forms convention, Rule 5a) — open
   * the DTO before choosing: `@IsUaPhone` → `"ua"`, `@IsInternationalPhone` →
   * `"international"`. Pair it with `phoneField({ rule })` of the same name.
   */
  rule: "ua" | "international";
};

/**
 * PhoneInput — a controlled phone field wrapping the shared `<Input>` primitive.
 * The DTO behind the field picks the `rule` (TASK-1984, forms convention Rule 5b):
 *
 *   - `rule="ua"` (`@IsUaPhone`) displays the live `+380 NN NNN NNNN` mask;
 *   - `rule="international"` (`@IsInternationalPhone` — the order endpoints,
 *     TASK-338, and the shop's own numbers) draws NO mask: `formatUAPhone`
 *     coerces every value into a `+380` shape and truncates at nine local digits,
 *     so a `+48` number would become a different, Ukrainian-looking one.
 *
 * Either way `onChange` emits the RAW value with only the characters outside the
 * `PHONE_SHAPE` alphabet dropped (`sanitizePhoneInput`) — never the truncating
 * mask (Rule 4b). Whoever consumes it judges the normalised number through
 * `phoneField({ rule })` of the same name.
 *
 * The admin panel's mirror of `apps/store-client/src/shared/ui/phone-input.tsx`
 * (TASK-407), ported with `shared/lib/phone.ts` for TASK-426 — see that module's
 * docblock for why the pair is duplicated rather than imported.
 *
 * Sets `type="tel"` (and `inputMode="numeric"` for the UA mask, `"tel"` so `+`
 * and separators are on the keyboard otherwise), and passes the remaining input
 * props (`id`, `autoComplete`, `aria-invalid`, `aria-describedby`, …) through.
 *
 * ONE DELIBERATE DIVERGENCE from the storefront original: no `React.forwardRef`.
 * store-admin has none anywhere, and it does not need one — under React 19 `ref`
 * is an ordinary prop on a function component, so it travels through this spread
 * into `shared/ui/input.tsx` (also not a forwardRef) and onto the DOM node, which
 * is what RHF's `Controller` needs in order to focus an invalid field.
 */
export function PhoneInput({
  value = "",
  onChange,
  rule,
  ...props
}: PhoneInputProps) {
  return (
    <Input
      type="tel"
      inputMode={rule === "ua" ? "numeric" : "tel"}
      value={rule === "ua" ? formatUAPhone(value) : value}
      onChange={(event) => onChange?.(sanitizePhoneInput(event.target.value))}
      {...props}
    />
  );
}
