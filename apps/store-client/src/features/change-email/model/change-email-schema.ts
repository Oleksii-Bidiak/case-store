import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * The address-change form (TASK-396). Mirrors `RequestEmailChangeDto`: a valid
 * address (trimmed + lowercased server-side) and the current password, checked
 * for presence only — never a strength rule, like `ChangePasswordDto`.
 *
 * Built per render with the account's current address so "that is already your
 * address" is caught here instead of costing a round trip.
 */
export function buildChangeEmailSchema(currentEmail: string) {
  const d = dict.auth.changeEmail;

  return z.object({
    newEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email(d.validationEmail)
      .max(254, d.validationEmail)
      .refine((value) => value !== currentEmail.trim().toLowerCase(), {
        message: d.validationSame,
      }),
    currentPassword: z.string().min(1, d.validationPassword),
  });
}

export type ChangeEmailValues = z.infer<
  ReturnType<typeof buildChangeEmailSchema>
>;
