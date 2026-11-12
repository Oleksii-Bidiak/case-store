import { z } from "zod";
import { dict } from "@/shared/config";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders this form model has no use for, exactly as the contact form's
// model does.
import { phoneField } from "@/shared/lib/phone-field";

/**
 * How many characters the order number on the confirmation email has
 * (TASK-483). The same 8 as `id.slice(0, 8)` on the backend.
 */
export const ORDER_NUMBER_LENGTH = 8;

/**
 * Strip what a human types around the number before measuring it.
 *
 * Mirrors `normalizeOrderNumber` in
 * `apps/store-api/src/order/dto/order-lookup.dto.ts` — the buyer copies
 * `#94F5F971` out of an email or a Viber message, so the "#", the spaces and
 * the case are decoration, not part of the number. Validating the decoration is
 * how a form refuses a perfectly correct number.
 */
export function normalizeOrderNumber(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
}

/**
 * Validation for the public "check my order" form.
 *
 * Deliberately only checks SHAPE — eight hex characters and a Ukrainian phone —
 * and never tries to be clever about whether such an order could exist. The
 * server answers one identical 404 for every kind of miss, and a client that
 * distinguished them would leak exactly what the server refuses to.
 */
/** `OrderLookupDto.number` — `@MaxLength(64)`; the input caps at it too. */
export const ORDER_LOOKUP_NUMBER_MAX = 64;

/** `OrderLookupDto.phone` — `@MaxLength(32)`; the input caps at it too. */
export const ORDER_LOOKUP_PHONE_MAX = 32;

/**
 * Both rules are STRICTER than `OrderLookupDto` on purpose (forms Rule 5f): the
 * DTO only bounds the strings and answers one generic 404 for anything that
 * matches no order (anti-enumeration), so a malformed number or a non-UA phone
 * would cost a request and a rate-limit slot just to be told «не знайдено». The
 * client says what is wrong with the SHAPE before asking — it never says
 * anything about whether an order exists.
 */
export const orderLookupSchema = z.object({
  number: z
    .string()
    .trim()
    .max(ORDER_LOOKUP_NUMBER_MAX, dict.orderLookup.errors.numberRequired)
    .refine(
      (value) => /^[0-9a-f]{8}$/.test(normalizeOrderNumber(value)),
      dict.orderLookup.errors.numberRequired,
    ),
  // TASK-1984 (Rule 5b): the shared UA `phoneField` — shape before digits, so
  // `050 111 2233 ccc` is refused instead of having its letters stripped. Orders
  // are taken for UA numbers at checkout, which is why the UA rule is the one.
  phone: phoneField({
    rule: "ua",
    message: dict.orderLookup.errors.phoneRequired,
  }).refine((value) => value.length <= ORDER_LOOKUP_PHONE_MAX, {
    message: dict.orderLookup.errors.phoneRequired,
  }),
});

export type OrderLookupFormValues = z.infer<typeof orderLookupSchema>;
