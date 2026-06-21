import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Profile edit schema (storefront account page). Email is shown read-only, so
 * only the name and phone are editable here. All fields are optional — the
 * backend `UpdateProfileDto` treats them as partial updates. Phone, when given,
 * must look like a UA number.
 */
const phoneRegex = /^\+?[\d\s()-]{10,20}$/;

export const profileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z
    .string()
    .regex(phoneRegex, dict.account.phoneInvalid)
    .optional()
    .or(z.literal("")),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
