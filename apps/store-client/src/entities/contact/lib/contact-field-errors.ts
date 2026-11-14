import { dict } from "@/shared/config";
import {
  readFieldErrors,
  type ServerFieldMap,
  type ServerFieldMessages,
} from "@/shared/lib/form-errors";

/**
 * Limits of `CreateContactMessageDto`
 * (`apps/store-api/src/contact/dto/create-contact-message.dto.ts`), shared by
 * both storefront contact forms (TASK-1984, forms Rule 5d). Each one is the
 * schema's `.max(n)` AND the input's `maxLength`.
 */
export const CONTACT_LIMITS = {
  name: { min: 2, max: 120 },
  /** `@MaxLength(32)` — the DTO measures it after `normalizePhone`. */
  phone: { max: 32 },
  message: { min: 10, max: 5000 },
  topic: { max: 60 },
  orderRef: { max: 120 },
  /** Honeypot (TASK-452) — clamped before sending, never validated. */
  website: { max: 255 },
} as const;

/**
 * `CreateContactMessageDto` path → form field (the names are the same). The
 * honeypot is left out on purpose: a refusal about it is not the shopper's to
 * fix, so it stays in the generic banner.
 */
export const CONTACT_FIELD_MAP: ServerFieldMap = {
  name: "name",
  phone: "phone",
  email: "email",
  message: "message",
  topic: "topic",
  orderRef: "orderRef",
};

/**
 * The form's own sentence for each field of a contact 400 (Rule 6b), chosen by
 * the constraint the API names: a too-long name says so instead of «вкажіть
 * імʼя». Fields the 400 does not mention fall back to the helper's defaults.
 */
export function contactServerFieldMessages(
  error: unknown,
): ServerFieldMessages {
  const e = dict.contact.errors;
  const byField: Record<string, { tooLong: string; other: string }> = {
    name: { tooLong: e.nameMax, other: e.nameRequired },
    phone: { tooLong: e.phoneRequired, other: e.phoneRequired },
    email: { tooLong: dict.forms.tooLong, other: e.emailInvalid },
    message: { tooLong: e.messageMax, other: e.messageRequired },
    topic: { tooLong: e.topicMax, other: dict.forms.invalid },
    orderRef: { tooLong: e.orderRefMax, other: dict.forms.invalid },
  };
  const messages: ServerFieldMessages = {};
  for (const { field, constraint } of readFieldErrors(error)) {
    const copy = byField[field];
    if (!copy || field in messages) continue;
    messages[field] = constraint === "maxLength" ? copy.tooLong : copy.other;
  }
  return messages;
}
