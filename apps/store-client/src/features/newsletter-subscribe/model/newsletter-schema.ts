import { z } from "zod";
import { dict } from "@/shared/config";
// Direct import (not the shared/lib barrel), as every form model does.
import { emailField } from "@/shared/lib/form-fields";

/**
 * Validation schema for the newsletter subscribe form. Mirrors the backend
 * `SubscribeDto` (`@IsEmail() @MaxLength(254)`; source is injected by the
 * caller, not typed by the user). TASK-1984 (forms Rule 5c): the shared
 * `emailField` — trim → max(254) → email — then lowercased so it matches the
 * server's normalized, unique stored form.
 */
export const newsletterSchema = z.object({
  email: emailField({
    message: dict.newsletterForm.invalidEmail,
  }).transform((value) => value.toLowerCase()),
});

export type NewsletterFormValues = z.infer<typeof newsletterSchema>;
