import * as React from "react";

import {
  isWholePhonePaste,
  maskedPhoneDisplay,
  maskedPhoneValue,
} from "@/shared/lib/phone";
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
 * The raw string is SANITISED, not truncated (TASK-1984, Rule 5b): characters
 * outside the `PHONE_SHAPE` alphabet are dropped by `sanitizePhoneInput`, so a
 * pasted `050 111 2233 ccc` reaches the form without the letters. The drawn
 * `+380` never leaks into it (`maskedPhoneValue`): Backspace empties the field,
 * `0…` typed after the prefix is the trunk zero, and a whole pasted number
 * replaces the value. The display never hides a digit the value carries
 * (`maskedPhoneDisplay`).
 *
 * Sets `type="tel"` and `inputMode="numeric"` for the correct mobile keyboard,
 * and forwards its ref so RHF `Controller` can register the field. Remaining
 * input props (`id`, `autoComplete`, `aria-invalid`, …) pass straight through.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value = "", onChange, onPaste, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="numeric"
        value={maskedPhoneDisplay(value)}
        onChange={(e) => onChange?.(maskedPhoneValue(e.target.value))}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;
          // A whole number pasted at the caret would land after the drawn
          // `+380` — it replaces the value instead (TASK-1984).
          const text = e.clipboardData.getData("text");
          if (!isWholePhonePaste(text)) return;
          e.preventDefault();
          onChange?.(maskedPhoneValue(text));
        }}
        {...props}
      />
    );
  },
);
