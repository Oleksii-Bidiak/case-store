import { z } from "zod";
import { dict } from "@/shared/config";
import { emailField } from "@/shared/lib/form-fields";

const d = dict.users;

/** `OperatorEmailChangeDto.reason` — `@MinLength(5) @MaxLength(500)` after a trim. */
export const CHANGE_EMAIL_REASON_MIN = 5;
export const CHANGE_EMAIL_REASON_MAX = 500;

/** `OperatorEmailChangeDto` path → this form's field (Rule 6b). */
export const CHANGE_EMAIL_FIELD_MAP = {
  newEmail: "newEmail",
  reason: "reason",
} as const;

/**
 * The operator's address-change form (TASK-396). Mirrors
 * `OperatorEmailChangeDto`: a valid address (trimmed + lowercased by the API
 * too) and a reason of 5–500 characters — the reason is the only written trace
 * of a change made on somebody's word, so it is required, not optional.
 */
export function buildChangeUserEmailSchema(currentEmail: string) {
  return z.object({
    // TASK-1984 (Rule 5c): `emailField` — the DTO's trim → @MaxLength(254) →
    // @IsEmail; lowercased like the API's `normalizeEmail`.
    newEmail: emailField({ message: d.changeEmailInvalid })
      .transform((value) => value.toLowerCase())
      .refine((value) => value !== currentEmail.trim().toLowerCase(), {
        message: d.changeEmailSame,
      }),
    reason: z
      .string()
      .trim()
      .min(CHANGE_EMAIL_REASON_MIN, d.changeEmailReasonRequired)
      .max(CHANGE_EMAIL_REASON_MAX, dict.forms.tooLong),
  });
}

export type ChangeUserEmailValues = z.infer<
  ReturnType<typeof buildChangeUserEmailSchema>
>;
