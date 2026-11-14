import { z } from "zod";
import { dict } from "@/shared/config";
import { phoneField } from "@/shared/lib/phone-field";

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

/** Mirrors `UpdateProfileDto.phone`'s `@MaxLength(30)` (`apps/store-api/src/user/dto/update-profile.dto.ts`). */
export const PROFILE_PHONE_MAX = 30;

export const profileSchema = z.object({
  firstName: z
    .string()
    .max(PROFILE_NAME_MAX, dict.account.firstNameMax)
    .optional(),
  lastName: z
    .string()
    .max(PROFILE_NAME_MAX, dict.account.lastNameMax)
    .optional(),
  // TASK-1984 (forms Rule 5a): `UpdateProfileDto.phone` is `@IsUaPhone`, so the
  // client rule is the UA `phoneField` — the shape first (letters or a second
  // `+` refuse the number instead of being stripped: `050 111 2233 ccc` passed
  // here and came back as a generic toast, SF-ACC-36), then `380` + 9 digits.
  // Blank is a deliberate removal (TASK-799).
  phone: phoneField({
    rule: "ua",
    optional: true,
    message: dict.account.phoneInvalid,
  }).refine((value) => value.length <= PROFILE_PHONE_MAX, {
    message: dict.forms.tooLong,
  }),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
