"use client";

import * as React from "react";

import { formatUAPhone } from "@/shared/lib/phone";
import { Input } from "./input";

export type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value?: string;
  onChange?: (value: string) => void;
};

/**
 * PhoneInput — a controlled UA phone field wrapping the shared `<Input>`
 * primitive. Displays the live `+380 NN NNN NNNN` mask and emits the RAW input
 * value via `onChange` (re-formatting happens on the next render).
 *
 * The admin panel's mirror of `apps/store-client/src/shared/ui/phone-input.tsx`
 * (TASK-407), ported with `shared/lib/phone.ts` for TASK-426 — see that module's
 * docblock for why the pair is duplicated rather than imported.
 *
 * ── NOT for the order forms ─────────────────────────────────────────────────
 * This mask COERCES: `formatUAPhone` rewrites every value into a `+380` shape and
 * truncates at nine local digits, so a `+48` number typed into it becomes a
 * different, Ukrainian-looking number. The order endpoints accept any country by
 * the owner's standing decision (TASK-338, restated 2026-09-10), so the
 * create-order phone fields are plain `<Input>`s judged by
 * `isValidInternationalPhone`. Use this component only on a field whose DTO
 * carries `@IsUaPhone`; today the admin has none.
 *
 * The mask itself lives in `shared/lib/phone.ts`, beside the rule that judges the
 * same number — a mask defined here and a regex defined in the form schema is how
 * the storefront ended up validating punctuation. What this emits is the RAW
 * string, never the mask: whoever consumes it must normalise before deciding
 * anything (`isValidUAPhone`).
 *
 * Sets `type="tel"` and `inputMode="numeric"` for the correct keyboard, and
 * passes the remaining input props (`id`, `autoComplete`, `aria-invalid`,
 * `aria-describedby`, …) straight through.
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
  ...props
}: PhoneInputProps) {
  return (
    <Input
      type="tel"
      inputMode="numeric"
      value={formatUAPhone(value)}
      onChange={(event) => onChange?.(event.target.value)}
      {...props}
    />
  );
}
