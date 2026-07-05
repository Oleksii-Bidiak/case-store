import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Validation schema for the newsletter subscribe form. Mirrors the backend
 * `SubscribeDto` (a valid email; source is injected by the caller, not typed by
 * the user). The email is trimmed + lowercased so it matches the server's
 * normalized, unique stored form.
 */
export const newsletterSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email(dict.newsletterForm.invalidEmail),
});

export type NewsletterFormValues = z.infer<typeof newsletterSchema>;
