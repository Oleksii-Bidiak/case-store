import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Profile edit schema (storefront account page). Email is shown read-only, so
 * only the name and phone are editable here. All fields are optional — the
 * backend `UpdateProfileDto` treats them as partial updates. Phone, when given,
 * must look like a UA number.
 *
 * Every blocking rule carries a Ukrainian message and the form renders each one
 * (TASK-794): a bare `.max(100)` used to stop the submit with nothing on screen
 * to say why.
 */
const phoneRegex = /^\+?[\d\s()-]{10,20}$/;

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
  phone: z
    .string()
    .regex(phoneRegex, dict.account.phoneInvalid)
    .optional()
    .or(z.literal("")),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
