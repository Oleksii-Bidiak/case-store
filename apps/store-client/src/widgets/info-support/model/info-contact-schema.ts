import { z } from "zod";
import { CONTACT_LIMITS } from "@/entities/contact";
import { dict } from "@/shared/config";
// Direct imports (not the barrel), as in `widgets/contact/model/contact-schema.ts`.
import { emailField } from "@/shared/lib/form-fields";
import { phoneField } from "@/shared/lib/phone-field";

const L = CONTACT_LIMITS;

/**
 * Validation schema for the compact info-page contact form. Mirrors the backend
 * `CreateContactMessageDto` for the fields this form collects (name / phone /
 * email / message). Topic and orderRef are not collected here — the backend
 * stores them as null.
 *
 * TASK-1984: the same field rules as `/contact` (forms Rule 5) — `phoneField`
 * for `@IsUaPhone` (TASK-744 had copied the old strip-everything rule here),
 * `emailField` for `@IsEmail @MaxLength(254)`, and a max message of its own on
 * every bound instead of the «required» text.
 */
export const infoContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(L.name.min, dict.contact.errors.nameRequired)
    .max(L.name.max, dict.contact.errors.nameMax),
  // See `contact-schema.ts` on why the 32 is checked on the raw value.
  phone: phoneField({
    rule: "ua",
    message: dict.contact.errors.phoneRequired,
  }).refine((value) => value.length <= L.phone.max, {
    message: dict.forms.tooLong,
  }),
  email: emailField({ message: dict.contact.errors.emailInvalid }),
  message: z
    .string()
    .trim()
    .min(L.message.min, dict.contact.errors.messageRequired)
    .max(L.message.max, dict.contact.errors.messageMax),
  // Honeypot (TASK-452) — see `ContactHoneypot` in entities/contact. No rule,
  // for the reason spelled out in `widgets/contact/model/contact-schema.ts`:
  // a blocking rule here would silently kill the submit. The form clamps.
  website: z.string().optional(),
});

export type InfoContactFormValues = z.infer<typeof infoContactSchema>;
