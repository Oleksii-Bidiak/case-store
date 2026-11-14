import { z } from "zod";
import { CONTACT_LIMITS } from "@/entities/contact";
import { dict } from "@/shared/config";
// Direct imports (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders this form model has no use for.
import { emailField } from "@/shared/lib/form-fields";
import { phoneField } from "@/shared/lib/phone-field";

const L = CONTACT_LIMITS;

/**
 * Validation schema for the storefront contact form. Mirrors the backend
 * `CreateContactMessageDto` (name/phone/email/message required with the same
 * length bounds; topic + orderRef optional). Consent is a client-only gate — it
 * is not sent to the API, so it lives here but not in the request payload.
 *
 * TASK-1984 (forms Rule 5): the phone is `phoneField({ rule: "ua" })` — the
 * DTO's `@IsUaPhone` — so the shape is judged before the digits and
 * `050 111 2233 ccc` is refused instead of having its letters stripped. Every
 * `@MaxLength` has a `.max()` with its own sentence and a rendered error; the
 * limits live in `CONTACT_LIMITS` (entities/contact), shared with /info.
 */
export const contactSchema = z.object({
  topic: z.string().max(L.topic.max, dict.contact.errors.topicMax).optional(),
  name: z
    .string()
    .trim()
    .min(L.name.min, dict.contact.errors.nameRequired)
    .max(L.name.max, dict.contact.errors.nameMax),
  // `@MaxLength(32)` runs on the normalised number server-side; checking it on
  // the raw value is stricter only for a valid number padded past 32 chars.
  phone: phoneField({
    rule: "ua",
    message: dict.contact.errors.phoneRequired,
  }).refine((value) => value.length <= L.phone.max, {
    message: dict.forms.tooLong,
  }),
  email: emailField({ message: dict.contact.errors.emailInvalid }),
  orderRef: z
    .string()
    .trim()
    .max(L.orderRef.max, dict.contact.errors.orderRefMax)
    .optional(),
  message: z
    .string()
    .trim()
    .min(L.message.min, dict.contact.errors.messageRequired)
    .max(L.message.max, dict.contact.errors.messageMax),
  consent: z.boolean().refine((v) => v === true, {
    message: dict.contact.errors.consentRequired,
  }),
  // Honeypot (TASK-452). NO rule at all, deliberately — not even the API's
  // `maxLength: 255`. A blocking rule on a field nothing renders an error for
  // makes the submit button do nothing and throws focus into an invisible
  // input (RHF `shouldFocusError`), which is what an autofilled long URL would
  // hit. The form clamps the value to 255 before sending instead, and refusing
  // a bot here would tell it the field matters — the API accepts a filled one
  // and quietly throws the message away.
  website: z.string().optional(),
});

export type ContactFormValues = z.infer<typeof contactSchema>;
