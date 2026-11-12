import { z } from "zod";
import { dict } from "@/shared/config";
import { isValidInternationalPhone, isValidUAPhone } from "./phone";

/**
 * zod schema for a phone field — the one way an admin form schema says "this
 * is a phone" (TASK-1984, forms convention Rule 5b). Never a hand-written
 * `.refine` or regex in a form schema.
 *
 * Lives apart from `phone.ts` on purpose: `phone.ts` stays import-free pure TS so
 * store-api's `phone-parity.spec.ts` can load it as code. zod lives here.
 * Twin of `apps/store-client/src/shared/lib/phone-field.ts` (UA rule only there).
 */
export type PhoneRule = "ua" | "international";

export interface PhoneFieldOptions {
  /**
   * The rule named by the DTO's decorator (Rule 5a): `@IsUaPhone` → `"ua"`,
   * `@IsInternationalPhone` → `"international"`. Open the DTO before choosing.
   */
  rule: PhoneRule;
  /** Accept `""` (and whitespace) — the form then sends `null` / omits the key. */
  optional?: boolean;
  /** Overrides the default `dict.forms.phoneInvalid`. */
  message?: string;
}

const RULES: Record<PhoneRule, (raw: string) => boolean> = {
  ua: isValidUAPhone,
  international: isValidInternationalPhone,
};

/**
 * Judges the NORMALISED number (Rule 4b) and returns the value as typed — the
 * DTO decides whether it is normalised before storage.
 */
export function phoneField({
  rule,
  optional = false,
  message = dict.forms.phoneInvalid,
}: PhoneFieldOptions) {
  const isValid = RULES[rule];
  return z
    .string()
    .refine((value) => (optional && value.trim() === "") || isValid(value), {
      message,
    });
}
