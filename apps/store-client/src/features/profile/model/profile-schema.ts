import { z } from "zod";
import { dict } from "@/shared/config";
import { isValidUAPhone } from "@/shared/lib/phone";

/**
 * Profile edit schema (storefront account page). Email is shown read-only, so
 * only the name and phone are editable here. All fields are optional — the
 * backend `UpdateProfileDto` treats them as partial updates. Phone, when given,
 * must be a Ukrainian number; an EMPTY phone is a deliberate "remove my number"
 * and is sent as `null` (TASK-799).
 *
 * Every blocking rule carries a Ukrainian message and the form renders each one
 * (TASK-794): a bare `.max(100)` used to stop the submit with nothing on screen
 * to say why.
 */

/** Mirrors `UpdateProfileDto`'s `@MaxLength(100)`; the inputs cap at it too. */
export const PROFILE_NAME_MAX = 100;

export const profileSchema = z.object({
  firstName: z
    .string()
    .max(PROFILE_NAME_MAX, dict.account.firstNameMax)
    .optional(),
  lastName: z
    .string()
    .max(PROFILE_NAME_MAX, dict.account.lastNameMax)
    .optional(),
  // TASK-799: the same rule as checkout and contact (`isValidUAPhone`), counted
  // on DIGITS. The old mask regex — the one TASK-407 removed everywhere else —
  // counted brackets and dashes, so `----------` passed here and the API then
  // stored it as an empty number. The API itself accepts any 9–15-digit number
  // (`@IsInternationalPhone`); the storefront holds a shopper to a Ukrainian
  // one, because this number pre-fills checkout, which refuses anything else.
  phone: z
    .string()
    .refine((value) => value.trim() === "" || isValidUAPhone(value), {
      message: dict.account.phoneInvalid,
    })
    .optional(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
