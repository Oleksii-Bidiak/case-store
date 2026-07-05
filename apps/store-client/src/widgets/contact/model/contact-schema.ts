import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Validation schema for the storefront contact form. Mirrors the backend
 * `CreateContactMessageDto` (name/phone/email/message required with the same
 * length bounds; topic + orderRef optional). Consent is a client-only gate — it
 * is not sent to the API, so it lives here but not in the request payload.
 */
export const contactSchema = z.object({
  topic: z.string().max(60).optional(),
  name: z
    .string()
    .trim()
    .min(2, dict.contact.errors.nameRequired)
    .max(120, dict.contact.errors.nameRequired),
  phone: z
    .string()
    .trim()
    .min(5, dict.contact.errors.phoneRequired)
    .max(32, dict.contact.errors.phoneRequired),
  email: z
    .string()
    .trim()
    .email(dict.contact.errors.emailInvalid)
    .max(255, dict.contact.errors.emailInvalid),
  orderRef: z.string().trim().max(120).optional(),
  message: z
    .string()
    .trim()
    .min(10, dict.contact.errors.messageRequired)
    .max(5000, dict.contact.errors.messageRequired),
  consent: z.boolean().refine((v) => v === true, {
    message: dict.contact.errors.consentRequired,
  }),
});

export type ContactFormValues = z.infer<typeof contactSchema>;
