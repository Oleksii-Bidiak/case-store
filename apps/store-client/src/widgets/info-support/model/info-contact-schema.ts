import { z } from "zod";
import { dict } from "@/shared/config";
// Direct import (not the barrel), as in `widgets/contact/model/contact-schema.ts`.
import { isValidUAPhone } from "@/shared/lib/phone";

/**
 * Validation schema for the compact info-page contact form. Mirrors the backend
 * `CreateContactMessageDto` for the fields this form collects (name / phone /
 * email / message). Topic and orderRef are not collected here — the backend
 * stores them as null.
 */
export const infoContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, dict.contact.errors.nameRequired)
    .max(120, dict.contact.errors.nameRequired),
  // TASK-744: the same rule as `/contact` (TASK-407) and `@IsUaPhone()` on the
  // DTO. It was `min(5)/max(32)`, so `12345` passed here, earned a 400 and the
  // generic «Не вдалося надіслати» — a validation error dressed as an outage.
  phone: z
    .string()
    .trim()
    .max(32, dict.contact.errors.phoneRequired)
    .refine(isValidUAPhone, dict.contact.errors.phoneRequired),
  email: z
    .string()
    .trim()
    .email(dict.contact.errors.emailInvalid)
    .max(255, dict.contact.errors.emailInvalid),
  message: z
    .string()
    .trim()
    .min(10, dict.contact.errors.messageRequired)
    .max(5000, dict.contact.errors.messageRequired),
  // Honeypot (TASK-452) — see `ContactHoneypot` in entities/contact. No rule,
  // for the reason spelled out in `widgets/contact/model/contact-schema.ts`:
  // a blocking rule here would silently kill the submit. The form clamps.
  website: z.string().optional(),
});

export type InfoContactFormValues = z.infer<typeof infoContactSchema>;
