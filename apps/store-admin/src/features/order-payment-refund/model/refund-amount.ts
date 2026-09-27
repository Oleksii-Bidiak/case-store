import { z } from "zod";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import type { PaymentEntity } from "@/entities/payment";

const t = dict.orders;

/**
 * The shape `POST /admin/payments/:id/refund` accepts for `amount` — the
 * `RefundRequestDto` regex in `admin-payment.controller.ts` without its
 * all-zero lookahead: zero gets its own message here. Money crosses the wire as
 * a decimal string so no float ever rounds a customer's refund.
 */
export const REFUND_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Whole kopiykas, so 499.10 never compares as 499.0999… */
export function toKopiykas(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/**
 * What is left to refund on one attempt: charged less every refund already
 * requested on it (TASK-1302). The same subtraction the server makes before it
 * reserves a refund; never below zero.
 */
export function refundableRemainder(
  payment: Pick<PaymentEntity, "amount" | "refundedAmount">,
): string {
  const kop = Math.max(
    0,
    toKopiykas(payment.amount) - toKopiykas(payment.refundedAmount),
  );
  return (kop / 100).toFixed(2);
}

/**
 * The partial-refund amount as the operator may type it (TASK-371).
 *
 * - A comma is accepted and sent as a dot: «499,50» is how a Ukrainian
 *   operator writes money, and refusing it would be a form stricter than its
 *   purpose.
 * - More than zero: a zero refund is a request LiqPay would only refuse.
 * - No more than `maxAmount` — the attempt's {@link refundableRemainder}, the
 *   ceiling the server enforces too (400 `PAYMENT_REFUND_EXCEEDS_BALANCE`,
 *   TASK-1302). The server stays the boundary: a refund made in another tab
 *   since this card loaded is only known there.
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
