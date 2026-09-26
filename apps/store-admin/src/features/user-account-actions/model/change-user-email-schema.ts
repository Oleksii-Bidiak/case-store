import { z } from "zod";
import { dict } from "@/shared/config";

const d = dict.users;

/**
 * The operator's address-change form (TASK-396). Mirrors
 * `OperatorEmailChangeDto`: a valid address (trimmed + lowercased by the API
 * too) and a reason of 5–500 characters — the reason is the only written trace
 * of a change made on somebody's word, so it is required, not optional.
 */
export function buildChangeUserEmailSchema(currentEmail: string) {
  return z.object({
    newEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email(d.changeEmailInvalid)
      .max(254, d.changeEmailInvalid)
      .refine((value) => value !== currentEmail.trim().toLowerCase(), {
        message: d.changeEmailSame,
      }),
    reason: z.string().trim().min(5, d.changeEmailReasonRequired).max(500),
  });
}

export type ChangeUserEmailValues = z.infer<
  ReturnType<typeof buildChangeUserEmailSchema>
>;
