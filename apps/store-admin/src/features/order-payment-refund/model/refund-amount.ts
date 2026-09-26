import { z } from "zod";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";

const t = dict.orders;

/**
 * The shape `POST /admin/payments/:id/refund` accepts for `amount` — the same
 * regex as `RefundRequestDto` in `admin-payment.controller.ts`. Money crosses
 * the wire as a decimal string so no float ever rounds a customer's refund.
 */
export const REFUND_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Whole kopiykas, so 499.10 never compares as 499.0999… */
export function toKopiykas(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/**
 * The partial-refund amount as the operator may type it (TASK-371).
 *
 * - A comma is accepted and sent as a dot: «499,50» is how a Ukrainian
 *   operator writes money, and refusing it would be a form stricter than its
 *   purpose.
 * - More than zero: a zero refund is a request LiqPay would only refuse.
 * - No more than THIS ATTEMPT's amount — the ceiling the server checks too
 *   (400). The server does NOT yet subtract earlier partial refunds of the same
 *   attempt (TASK-1302), so neither can this form: it does not know them. The
 *   confirmation step showing the exact sum is the guard until then.
 */
export function createRefundAmountSchema(maxAmount: string) {
  const maxKop = toKopiykas(maxAmount);

  return z
    .string()
    .trim()
    .transform((value) => value.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(REFUND_AMOUNT_PATTERN, t.refundAmountInvalid)
        .refine((value) => toKopiykas(value) > 0, t.refundAmountZero)
        .refine(
          (value) => toKopiykas(value) <= maxKop,
          t.refundAmountTooLarge(formatCurrency(maxAmount)),
        ),
    );
}

/**
 * Validate a typed amount: the normalised string on success, the first message
 * otherwise (the one shown under the field).
 */
export function parseRefundAmount(
  raw: string,
  maxAmount: string,
): { ok: true; amount: string } | { ok: false; message: string } {
  const result = createRefundAmountSchema(maxAmount).safeParse(raw);
  if (result.success) return { ok: true, amount: result.data };
  return {
    ok: false,
    message: result.error.issues[0]?.message ?? t.refundAmountInvalid,
  };
}
