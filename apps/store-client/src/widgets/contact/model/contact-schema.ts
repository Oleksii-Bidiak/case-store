import { z } from "zod";
import { dict } from "@/shared/config";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders this form model has no use for.
import { isValidUAPhone } from "@/shared/lib/phone";

/**
 * Validation schema for the storefront contact form. Mirrors the backend
 * `CreateContactMessageDto` (name/phone/email/message required with the same
 * length bounds; topic + orderRef optional). Consent is a client-only gate — it
 * is not sent to the API, so it lives here but not in the request payload.
 *
 * `phone` was `min(5)/max(32)` — a bound on the string, not a rule about a
 * number, so `12345` was a valid way to ask us to call back (TASK-407). It now
 * shares `isValidUAPhone` with checkout and with `@IsUaPhone()` on the DTO, and
 * the input carries the same `+380 NN NNN NNNN` mask the checkout field does.
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
    .max(32, dict.contact.errors.phoneRequired)
    .refine(isValidUAPhone, dict.contact.errors.phoneRequired),
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
  // Honeypot (TASK-452). No rule beyond the API's own bound: a person never
  // sees it, and refusing a bot here would tell it the field matters — the API
  // accepts a filled one and quietly throws the message away instead.
  website: z.string().max(255).optional(),
});

export type ContactFormValues = z.infer<typeof contactSchema>;
