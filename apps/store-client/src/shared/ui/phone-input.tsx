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
 * primitive. Displays the live `+380 NN NNN NNNN` mask and emits the raw input
 * value via `onChange` (re-formatting happens on the next render).
 *
 * The mask itself lives in `shared/lib/phone.ts`, beside the rule that judges
 * the same number (TASK-407) — a mask defined here and a regex defined in the
 * form schema is how the storefront ended up validating punctuation. What this
 * emits is the RAW string, never the mask: whoever consumes it must normalise
 * before deciding anything (`isValidUAPhone`).
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
