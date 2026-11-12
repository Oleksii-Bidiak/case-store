import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Shared zod field rules (TASK-1984, forms convention Rule 5) — each the client
 * half of one DTO rule, so a form never accepts what the server refuses.
 *
 * Twin of `apps/store-admin/src/shared/lib/form-fields.ts`.
 */

/** Mirrors `@MaxLength(254)` on every email field of the API DTOs. */
export const EMAIL_MAX_LENGTH = 254;

export interface EmailFieldOptions {
  /** Accept `""` (and whitespace, trimmed to `""`). */
  optional?: boolean;
  /** Overrides the default `dict.forms.emailInvalid`. */
  message?: string;
}

/**
 * `trim()` → `max(254)` → `email()` (Rule 5c). Server counterpart:
 * `@IsEmail() @MaxLength(254)` + `@Transform(normalizeEmail)`. No local regex.
 * The parsed value is the TRIMMED address.
 */
export function emailField({
  optional = false,
  message = dict.forms.emailInvalid,
}: EmailFieldOptions = {}) {
  const trimmed = z.string().trim().max(EMAIL_MAX_LENGTH, dict.forms.tooLong);
  if (!optional) return trimmed.email(message);

  const isEmail = z.string().email();
  return trimmed.refine(
    (value) => value === "" || isEmail.safeParse(value).success,
    { message },
  );
}
