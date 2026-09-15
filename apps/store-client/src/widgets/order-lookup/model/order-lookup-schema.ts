import { z } from "zod";
import { dict } from "@/shared/config";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders this form model has no use for, exactly as the contact form's
// model does.
import { isValidUAPhone } from "@/shared/lib/phone";

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
export const orderLookupSchema = z.object({
  number: z
    .string()
    .trim()
    .max(64, dict.orderLookup.errors.numberRequired)
    .refine(
      (value) => /^[0-9a-f]{8}$/.test(normalizeOrderNumber(value)),
      dict.orderLookup.errors.numberRequired,
    ),
  phone: z
    .string()
    .trim()
    .max(32, dict.orderLookup.errors.phoneRequired)
    .refine(isValidUAPhone, dict.orderLookup.errors.phoneRequired),
});

export type OrderLookupFormValues = z.infer<typeof orderLookupSchema>;
