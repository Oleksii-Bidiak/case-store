import { z } from "zod";
import { dict } from "@/shared/config";
import { isValidUAPhone } from "./phone";

/**
 * zod schema for a phone field — the one way a storefront form schema says
 * "this is a phone" (TASK-1984, forms convention Rule 5b). Never a hand-written
 * `.refine` or regex in a form schema.
 *
 * Lives apart from `phone.ts` on purpose: `phone.ts` stays import-free pure TS so
 * store-api's `phone-parity.spec.ts` can load it as code. zod lives here.
 */
export interface PhoneFieldOptions {
  /**
   * The rule named by the DTO's decorator (Rule 5a). The storefront only takes
   * Ukrainian numbers (`@IsUaPhone`); the option keeps the admin's signature.
   */
  rule: "ua";
  /** Accept `""` (and whitespace) — the form then sends `null` / omits the key. */
  optional?: boolean;
  /** Overrides the default `dict.forms.phoneInvalid`. */
  message?: string;
}

/**
 * Judges the NORMALISED number (Rule 4b) and returns the value as typed — the
 * DTO's `normalizePhone` transform stores it as `380XXXXXXXXX`.
 */
export function phoneField({
  optional = false,
  message = dict.forms.phoneInvalid,
}: PhoneFieldOptions) {
  return z
    .string()
    .refine(
      (value) => (optional && value.trim() === "") || isValidUAPhone(value),
      { message },
    );
}
